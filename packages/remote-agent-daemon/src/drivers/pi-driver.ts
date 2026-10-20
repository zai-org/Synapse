import { execFileSync } from "node:child_process"
import process from "node:process"
import type {
  AgentSession as PiSdkAgentSession,
  AgentSessionEvent as PiSdkSessionEvent,
  ToolDefinition as PiToolDefinition,
} from "@earendil-works/pi-coding-agent"
import type { McpServerConfig as PiMcpServerConfig } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk"
import type {
  AgentDriver,
  AgentSession,
  AgentSessionEvent,
  DaemonRuntimeCapabilities,
  PermissionDecision,
  RuntimeCatalogEntry,
  SendPromptOptions,
  SessionSpec,
} from "./types.js"
import { RUNTIME_KIND } from "./types.js"
import { EventQueue as EventQueueBase, whichBinary } from "./async-channel.js"
import {
  buildAskQuestionToolResult,
  extractPiAssistantText,
  parseAskUserQuestionInput,
} from "./pi-driver-events.js"

/**
 * pi driver — bridges the pi coding agent (https://pi.dev) into a Synapse
 * conversation through the in-process TypeScript SDK
 * (`@earendil-works/pi-coding-agent`), the same pattern the Claude driver
 * uses for claude-agent-sdk. No subprocess is spawned for the agent itself;
 * the `pi` binary on PATH is the catalog signal (version probe + the
 * executablePath the supervisor requires).
 *
 * The SDK module is imported lazily inside createSession(): it is heavy
 * (~60MB, ~148 transitive deps incl. cloud-provider SDKs) and a static
 * import taxed every daemon start (~0.4s) for users of other runtimes.
 *
 * Event mapping:
 *   session_started      ← sdk session id after createAgentSession resolves
 *   assistant_message    ← message_end (assistant messages with text content)
 *   turn_completed       ← agent_settled — the SDK emits exactly ONE per
 *                          dispatched turn, after every retry continuation
 *                          (agent_end willRetry=true), auto-compaction
 *                          continuation (the post-run hook's agent.continue()
 *                          runs INSIDE the same _runAgentPrompt), and queued
 *                          followUp drain. agent_end / compaction_end are NOT
 *                          terminals (review #11 item 3: their relative order
 *                          differs per compaction flavor, and a threshold
 *                          compaction emits no second agent_end at all).
 *   user_input_requested ← the ask_question custom tool suspends until
 *                          respondPermission resolves it
 *   error                ← prompt() rejection / auto_retry_end(success=false)
 *
 * send() is NON-BLOCKING (review #11 items 2/6): session.prompt() resolves
 * only after the whole run settles, so awaiting it inside createSession left
 * drainEvents unstarted until the first turn finished — an ask_question in
 * the first turn deadlocked. send() dispatches and returns; the terminal
 * arrives via the event stream when the run settles.
 *
 * MCP: spec.mcpServers is wired via an inline DefaultResourceLoader extension
 * calling pi.registerMcpServer (exposure "direct" so the reverse-MCP tools are
 * declared to the model, not just codemode-reachable).
 *
 * Sessions persist as pi session files under ~/.pi/agent/sessions/<encoded-
 * cwd>/ (cwd is per-conversation, so sessions never collide). resumeSessionId
 * reopens the previous session file via SessionManager.findById/open.
 */

function trimFirstLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function detectPiBinary(): { path?: string; version?: string } {
  const explicit = process.env.SYNAPSE_PI_PATH?.trim()
  const path = explicit || whichBinary("pi")
  if (!path) return {}
  let version: string | undefined
  try {
    version = trimFirstLine(
      execFileSync(path, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      })
    )
  } catch {
    // version probe is best-effort
  }
  return { path, version }
}

class EventQueue extends EventQueueBase<AgentSessionEvent> {}

/** Map a claude-sdk-shaped McpServerConfig to pi's McpServerConfig. */
function toPiMcpServerConfig(config: McpServerConfig): PiMcpServerConfig {
  // exposure "direct" declares the server's tools to the model (pi's default
  // "codemode" exposure hides them from the LLM).
  if (config.type === "stdio") {
    return {
      type: "stdio",
      command: config.command,
      args: config.args as string[] | undefined,
      env: config.env as Record<string, string> | undefined,
      exposure: "direct",
    }
  }
  if (config.type === "http") {
    return {
      type: "http",
      url: config.url,
      headers: config.headers as Record<string, string> | undefined,
      exposure: "direct",
    }
  }
  // SSE / in-process SDK servers never appear in the daemon's spec (the
  // reverse-MCP bridge is always http); disable anything else rather than
  // guessing a transport.
  return { type: "http", url: "", enabled: false, exposure: "hidden" }
}

type PendingInputWaiter = (decision: PermissionDecision) => void

/** The lazily-imported pi SDK module surface the driver consumes at runtime. */
type PiSdkModule = {
  DefaultResourceLoader: new (options: unknown) => unknown
  SessionManager: {
    findById(cwd: string, id: string): string | undefined
    open(
      path: string,
      sessionDir: string | undefined,
      cwdOverride: string
    ): unknown
    create(cwd: string): unknown
  }
  createAgentSession(options: unknown): Promise<{ session: PiSdkAgentSession }>
  getAgentDir(): string
}

export class PiAgentSession implements AgentSession {
  readonly runtimeKind = RUNTIME_KIND.PI

  private readonly eventQueue = new EventQueue()
  private readonly pendingInputs = new Map<string, PendingInputWaiter>()
  private sdk: PiSdkAgentSession | null = null
  private unsubscribe: (() => void) | null = null
  private piSessionId: string | undefined
  private closed = false
  /**
   * Turns dispatched (seed prompt + every send()) whose terminal has not
   * fired yet. The conversation runtime serializes turns (one dispatch at a
   * time), so this is 0/1 in practice, but the counter keeps stray events
   * from fabricating terminals (§5d exactly-once turn completion).
   */
  private dispatchedTurns = 0
  /**
   * The front dispatched turn expects its terminal from an `agent_settled`
   * event. Kept as a separate flag so the prompt-path promise fallback can
   * fire only when no settle is coming (see send()).
   */
  private settleWatchArmed = false

  constructor(
    readonly remoteAgentId: string,
    readonly conversationId: string,
    initialSessionId: string | undefined
  ) {
    this.piSessionId = initialSessionId
  }

  get sessionId() {
    return this.piSessionId
  }

  /** Non-fatal driver-level notice (e.g. resume degraded to a fresh session). */
  emitError(message: string) {
    this.eventQueue.push({ kind: "error", message })
  }

  attach(sdk: PiSdkAgentSession) {
    this.sdk = sdk
    this.unsubscribe = sdk.subscribe((event) => {
      try {
        this.handleSdkEvent(event)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.eventQueue.push({
          kind: "error",
          message: `pi event handler threw: ${message}`,
        })
      }
    })
    if (sdk.sessionId && sdk.sessionId !== this.piSessionId) {
      this.piSessionId = sdk.sessionId
      this.eventQueue.push({
        kind: "session_started",
        sessionId: sdk.sessionId,
      })
    }
  }

  private handleSdkEvent(event: PiSdkSessionEvent) {
    switch (event.type) {
      case "message_end": {
        // Only assistant text is conversation-visible; user echoes, tool
        // results, and thinking-only messages are not.
        const text = extractPiAssistantText(event.message)
        if (text) {
          this.eventQueue.push({ kind: "assistant_message", text })
        }
        return
      }
      case "agent_settled": {
        // Turn terminal: the SDK emits exactly one agent_settled per
        // dispatched run — AFTER retry continuations, auto-compaction
        // continuations, and queued followUp drain have all finished.
        if (this.settleWatchArmed && this.dispatchedTurns > 0) {
          this.settleWatchArmed = false
          this.dispatchedTurns -= 1
          this.eventQueue.push({ kind: "turn_completed" })
        }
        // A stray settle with no armed turn is ignored — fabricating a
        // terminal would advance the runtime's gate past a live turn.
        return
      }
      case "auto_retry_end": {
        // Emitted during the run, before agent_settled, so the error
        // attributes to the CURRENT turn (hadError=true) — not the next.
        if (!event.success) {
          const message = event.finalError ?? "unknown error"
          this.eventQueue.push({
            kind: "error",
            message: `pi auto-retry exhausted: ${message}`,
          })
        }
        break
      }
      default:
        // agent_end / compaction_end / agent_start / ... are observability
        // events from the SDK's inner loop — deliberately NOT turn terminals.
        break
    }
  }

  async send(prompt: string, _options?: SendPromptOptions) {
    if (!prompt.trim()) return
    const sdk = this.sdk
    if (!sdk || this.closed) {
      throw new Error("pi session is not active")
    }
    this.dispatchedTurns += 1
    this.settleWatchArmed = true
    // Dispatch WITHOUT awaiting the run: session.prompt() resolves only after
    // the entire run settles, and awaiting it blocked createSession — the
    // event stream went undrained for the whole first turn, deadlocking any
    // ask_question in it (review #11 item 2) and serializing unrelated
    // conversations behind one long turn (item 6).
    const viaFollowUp = sdk.isStreaming
    const dispatch = viaFollowUp
      ? Promise.resolve(sdk.followUp(prompt))
      : Promise.resolve(sdk.prompt(prompt))
    void dispatch.then(
      () => {
        // Fallback terminal for prompt-path dispatches that ended WITHOUT an
        // agent run (extension command handled the prompt; preflight deferral
        // edge). In the normal flow agent_settled already fired mid-run and
        // consumed the watch before this runs. The isStreaming guard covers a
        // prompt() that returned early while a deferred run is still active.
        // followUp promises resolve as soon as the message is QUEUED, so they
        // never take this fallback — the ongoing run's agent_settled owns it.
        if (
          !viaFollowUp &&
          this.settleWatchArmed &&
          this.dispatchedTurns > 0 &&
          !sdk.isStreaming
        ) {
          this.settleWatchArmed = false
          this.dispatchedTurns -= 1
          this.eventQueue.push({ kind: "turn_completed" })
        }
      },
      (error: unknown) => {
        // Dispatch rejected (pre-run throw: extension command refused,
        // pre-compaction failure, ...). No run started, so no agent_settled
        // is coming — this turn must terminal HERE or it wedges the gate.
        const message = error instanceof Error ? error.message : String(error)
        this.eventQueue.push({
          kind: "error",
          message: `pi prompt failed: ${message}`,
        })
        if (this.settleWatchArmed && this.dispatchedTurns > 0) {
          this.settleWatchArmed = false
          this.dispatchedTurns -= 1
          this.eventQueue.push({ kind: "turn_completed" })
        }
      }
    )
  }

  async respondPermission(
    requestId: string,
    decision: PermissionDecision
  ): Promise<void> {
    const waiter = this.pendingInputs.get(requestId)
    if (!waiter) {
      throw new Error(`No pending user-input request with id ${requestId}`)
    }
    this.pendingInputs.delete(requestId)
    waiter(decision)
  }

  events(): AsyncIterable<AgentSessionEvent> {
    return this.eventQueue.iterator()
  }

  async close(_reason: string) {
    if (this.closed) return
    this.closed = true
    for (const [id, waiter] of this.pendingInputs) {
      waiter({ behavior: "deny", message: "session closed" })
      this.pendingInputs.delete(id)
    }
    this.unsubscribe?.()
    this.unsubscribe = null
    const sdk = this.sdk
    this.sdk = null
    try {
      await sdk?.abort()
    } catch {
      // ignore — abort is best-effort teardown of the in-flight run
    }
    sdk?.dispose()
    this.eventQueue.close()
  }

  /**
   * The ask_question tool: suspends the agent run until the Synapse-side task
   * card resolves, then returns the user's answers as the tool result.
   * Built as a plain definition object (defineTool is an identity function);
   * no SDK runtime import needed, so this is callable from unit tests.
   * (Exported for unit tests; production callers reach it via createSession.)
   */
  buildAskQuestionTool(): PiToolDefinition {
    return {
      name: "ask_question",
      label: "Ask the user",
      description:
        "Ask the human user one or more questions (max 4) and wait for their " +
        "answers. Use this whenever you need a decision, clarification, or " +
        "confirmation that only the user can provide — do not guess. Each " +
        "question has a short `question` text and may offer `options` " +
        "({label, description}) the user can pick from.",
      promptSnippet:
        "ask_question: ask the user questions and wait for answers",
      parameters: Type.Object({
        questions: Type.Array(
          Type.Object({
            question: Type.String({ description: "The question to ask" }),
            options: Type.Optional(
              Type.Array(
                Type.Object({
                  label: Type.String(),
                  description: Type.Optional(Type.String()),
                })
              )
            ),
            multiple: Type.Optional(
              Type.Boolean({
                description: "Allow selecting multiple options",
              })
            ),
          }),
          { minItems: 1, maxItems: 4 }
        ),
      }),
      execute: async (_toolCallId, params) => {
        const parsed = parseAskUserQuestionInput(params)
        const requestId = `pi-ask-${this.conversationId}-${Math.random()
          .toString(36)
          .slice(2, 10)}`
        const decision = await new Promise<PermissionDecision>((resolve) => {
          this.pendingInputs.set(requestId, resolve)
          this.eventQueue.push({
            kind: "user_input_requested",
            requestId,
            title: parsed.title,
            questions: parsed.questions,
            toolName: "ask_question",
            originalInput: parsed.originalInput,
          })
        })
        return buildAskQuestionToolResult(decision)
      },
    } as PiToolDefinition
  }
}

export class PiDriver implements AgentDriver {
  readonly runtimeKind = RUNTIME_KIND.PI
  readonly label = "pi"
  readonly capabilities: DaemonRuntimeCapabilities = {
    supportsRequestUserInput: true,
    supportsPersistentSession: true,
  }

  detect(): RuntimeCatalogEntry {
    const probe = detectPiBinary()
    if (!probe.path) {
      // The agent runs in-process via the SDK (a hard daemon dependency, so
      // its presence is guaranteed), but the supervisor refuses to start a
      // runtime whose catalog entry lacks an executablePath (it gates on
      // status "available" + a resolved path). Reporting available without a
      // path would let a conversation arm a turn that fails at wake with a
      // confusing error — so the honest catalog signal without the CLI is
      // missing_binary, with guidance pointing at the fix (install pi).
      return {
        runtimeKind: this.runtimeKind,
        status: "missing_binary",
        lastError:
          "pi CLI not found on PATH (set SYNAPSE_PI_PATH or install pi; the daemon runs pi in-process via its SDK but requires the CLI for the runtime catalog to advertise it)",
      }
    }
    return {
      runtimeKind: this.runtimeKind,
      executablePath: probe.path,
      status: "available",
      version: probe.version,
    }
  }

  async createSession(spec: SessionSpec): Promise<AgentSession> {
    const session = new PiAgentSession(
      spec.remoteAgentId,
      spec.conversationId,
      spec.resumeSessionId
    )

    // Lazy-load the SDK: heavy module (~60MB / ~148 transitive deps), and
    // only pi-kind conversations need it. detect() never touches it.
    const sdkModule = (await import(
      "@earendil-works/pi-coding-agent"
    )) as unknown as PiSdkModule

    const sessionManager = this.resolveSessionManager(spec, sdkModule)
    if (this.lastResumeFallbackReason) {
      session.emitError(this.lastResumeFallbackReason)
      this.lastResumeFallbackReason = undefined
    }

    // Reverse-MCP (and any other injected servers) ride an inline extension:
    // pi.registerMcpServer with exposure "direct" declares the tools to the
    // model. No servers → no extension, keep the loader default.
    const mcpEntries = Object.entries(spec.mcpServers ?? {})
    const resourceLoader = new sdkModule.DefaultResourceLoader({
      cwd: spec.workingDirectory,
      agentDir: sdkModule.getAgentDir(),
      ...(mcpEntries.length > 0
        ? {
            extensionFactories: [
              (pi: {
                registerMcpServer: (name: string, config: unknown) => void
              }) => {
                for (const [name, config] of mcpEntries) {
                  pi.registerMcpServer(name, toPiMcpServerConfig(config))
                }
              },
            ],
          }
        : {}),
    })

    // pi runs in-process: the proxy overlay can only take effect via
    // process.env (pi-ai's HTTP stack reads it). The proxy is machine-level
    // config, so mutating the daemon-wide env matches its semantics.
    applyEnvOverlay(spec.childEnvOverlay)

    const { session: sdk } = await sdkModule.createAgentSession({
      cwd: spec.workingDirectory,
      sessionManager,
      customTools: [session.buildAskQuestionTool()],
      resourceLoader,
    })
    session.attach(sdk)

    // Fire the bootstrap turn WITHOUT awaiting its completion (review #11
    // item 2): send() returns after dispatching, so the runtime gets the
    // session back immediately and drainEvents starts consuming events —
    // including any user_input_requested from this very first turn.
    if (spec.initialPrompt.trim()) {
      await session.send(spec.initialPrompt)
    }
    return session
  }

  private resolveSessionManager(
    spec: SessionSpec,
    sdkModule: PiSdkModule
  ): unknown {
    const { SessionManager } = sdkModule
    if (spec.resumeSessionId) {
      const path = SessionManager.findById(
        spec.workingDirectory,
        spec.resumeSessionId
      )
      if (path) {
        try {
          // cwdOverride keeps the session bound to the (per-conversation)
          // working directory even if the file's header carries an older cwd.
          return SessionManager.open(path, undefined, spec.workingDirectory)
        } catch (error) {
          // Corrupt/unreadable session file. Without this fallback every
          // wake re-throws on the SAME file and the conversation wedges
          // permanently (the api keeps resending the same resumeSessionId).
          // Degrade to a fresh session instead — context is lost, the
          // conversation lives. The new session id is published back to the
          // api via session_started, so the stale id self-corrects.
          const message = error instanceof Error ? error.message : String(error)
          this.lastResumeFallbackReason = `pi session ${spec.resumeSessionId} failed to load (${message}); starting a fresh session`
        }
      }
      // Session file gone (cleaned up / different machine): fall through to a
      // fresh session rather than failing the wake — the new session id is
      // published back to the api via session_started.
    }
    return SessionManager.create(spec.workingDirectory)
  }
  private lastResumeFallbackReason: string | undefined
}

function applyEnvOverlay(
  overlay: Record<string, string | undefined> | undefined
) {
  if (!overlay) return
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined) {
      process.env[key] = value
    }
  }
}
