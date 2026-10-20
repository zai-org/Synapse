import { execFileSync } from "node:child_process"
import process from "node:process"
import {
  query as claudeAgentQuery,
  type CanUseTool,
  type Options as ClaudeQueryOptions,
  type PermissionResult,
  type Query as ClaudeQuery,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type {
  AgentDriver,
  AgentSession,
  AgentSessionEvent,
  PermissionDecision,
  RuntimeCatalogEntry,
  SendPromptOptions,
  SessionSpec,
} from "./types.js"
import { RUNTIME_KIND, type DaemonRuntimeCapabilities } from "./types.js"
import { EventQueue as EventQueueBase, whichBinary } from "./async-channel.js"
import {
  buildPermissionResultForDecision,
  extractAssistantText,
  parseAskUserQuestionInput,
  parsePlanApprovalInput,
  readClaudeResultErrorMessage,
} from "./claude-driver-events.js"

function trimFirstLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function which(binary: string) {
  return whichBinary(binary)
}

function detectClaudeBinary(): { path?: string; version?: string } {
  const explicit = process.env.SYNAPSE_CLAUDE_PATH?.trim()
  const path = explicit || which("claude")
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

type PendingPromptResolver = {
  resolve: (message: SDKUserMessage) => void
  reject: (error: Error) => void
}

class PromptInputQueue {
  private readonly queued: SDKUserMessage[] = []
  private readonly waiters: PendingPromptResolver[] = []
  private closed = false

  push(message: SDKUserMessage) {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve(message)
      return
    }
    this.queued.push(message)
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters) {
      waiter.reject(new Error("Prompt stream closed"))
    }
    this.waiters.length = 0
  }

  async *iterator(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const queued = this.queued.shift()
      if (queued) {
        yield queued
        continue
      }
      if (this.closed) return
      const next = await new Promise<SDKUserMessage>((resolve, reject) => {
        this.waiters.push({ resolve, reject })
      }).catch(() => null)
      if (!next) return
      yield next
    }
  }
}

class EventQueue extends EventQueueBase<AgentSessionEvent> {}

function userMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
    parent_tool_use_id: null,
    session_id: "",
  } as SDKUserMessage
}

class ClaudeAgentSession implements AgentSession {
  readonly runtimeKind = RUNTIME_KIND.CLAUDE_CODE

  private readonly eventQueue = new EventQueue()
  private readonly prompts = new PromptInputQueue()
  private readonly pendingPermissions = new Map<
    string,
    (decision: PermissionDecision) => void
  >()
  private query: ClaudeQuery | null = null
  private claudeSessionId: string | undefined
  private drainPromise: Promise<void> | null = null
  // True while a turn is in flight (a prompt was seeded/sent and its `result`
  // has not yet arrived). The session-death `finally` emits its terminal
  // `turn_completed` ONLY when this is set, so a stream that closes while the
  // session is IDLE never fabricates a terminal for a turn that already ended
  // (§5d — the driver-level half of exactly-once turn completion).
  private turnOutstanding = false

  constructor(
    readonly remoteAgentId: string,
    readonly conversationId: string,
    initialSessionId: string | undefined
  ) {
    this.claudeSessionId = initialSessionId
  }

  get sessionId() {
    return this.claudeSessionId
  }

  attach(query: ClaudeQuery) {
    this.query = query
    this.drainPromise = this.drainQuery(query)
  }

  private async drainQuery(query: ClaudeQuery) {
    let yieldedAny = false
    try {
      for await (const message of query as AsyncIterable<SDKMessage>) {
        yieldedAny = true
        this.handleMessage(message)
      }
      // The SDK closed the iterator without throwing. When it does that with
      // zero messages, the daemon is left in "running" forever and operators
      // see no signal beyond a generic EPIPE on the process-scope handler.
      // Push a structured error so the conversation surfaces the failure in
      // remote_agent_conversation_contexts.last_error and operators can find
      // the right needle in the logs (e.g. proxy unreachable / model 404 /
      // SDK config mismatch).
      if (!yieldedAny) {
        this.eventQueue.push({
          kind: "error",
          message:
            "Claude SDK closed the message iterator before emitting any event " +
            "(likely subprocess crashed during startup — check daemon/api logs, " +
            "ANTHROPIC_BASE_URL reachability via HTTPS_PROXY, and mcpServers config)",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.eventQueue.push({
        kind: "error",
        message: `Claude SDK iterator threw: ${message}`,
      })
    } finally {
      // Session death. Emit the terminal ONLY for a turn that was actually in
      // flight (§5d) so an idle-then-closed stream never fabricates one.
      if (this.turnOutstanding) {
        this.turnOutstanding = false
        this.eventQueue.push({ kind: "turn_completed" })
      }
      this.eventQueue.close()
    }
  }

  private handleMessage(message: SDKMessage) {
    if (
      message.type === "system" &&
      (message as SDKSystemMessage).subtype === "init"
    ) {
      const init = message as SDKSystemMessage & { session_id?: string }
      if (init.session_id && init.session_id !== this.claudeSessionId) {
        this.claudeSessionId = init.session_id
        this.eventQueue.push({
          kind: "session_started",
          sessionId: init.session_id,
        })
      }
      return
    }
    if (message.type === "assistant") {
      const text = extractAssistantText(message)
      if (text) this.eventQueue.push({ kind: "assistant_message", text })
      return
    }
    if (message.type === "result") {
      const errorMessage = readClaudeResultErrorMessage(message)
      if (errorMessage) {
        this.eventQueue.push({
          kind: "error",
          message: errorMessage,
        })
      }
      // The turn's normal terminal — clear the in-flight flag so the
      // session-death `finally` won't re-emit for an already-completed turn.
      this.turnOutstanding = false
      this.eventQueue.push({ kind: "turn_completed" })
    }
  }

  async send(prompt: string, _options?: SendPromptOptions) {
    if (!prompt.trim()) return
    this.turnOutstanding = true
    this.prompts.push(userMessage(prompt))
  }

  async respondPermission(
    requestId: string,
    decision: PermissionDecision
  ): Promise<void> {
    const waiter = this.pendingPermissions.get(requestId)
    if (!waiter) {
      throw new Error(`No pending permission request with id ${requestId}`)
    }
    this.pendingPermissions.delete(requestId)
    waiter(decision)
  }

  events(): AsyncIterable<AgentSessionEvent> {
    return this.eventQueue.iterator()
  }

  async close(_reason: string) {
    this.prompts.close()
    for (const [id, waiter] of this.pendingPermissions) {
      waiter({ behavior: "deny", message: "session closed" })
      this.pendingPermissions.delete(id)
    }
    try {
      await this.query?.close?.()
    } catch {
      // ignore
    }
    this.query = null
    this.eventQueue.close()
    if (this.drainPromise) {
      await Promise.race([
        this.drainPromise,
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ])
    }
  }

  promptIterable(): AsyncIterable<SDKUserMessage> {
    return this.prompts.iterator()
  }

  /** Test/internal helper: enqueue a seed prompt before query() starts iterating. */
  seedPrompt(message: SDKUserMessage) {
    this.turnOutstanding = true
    this.prompts.push(message)
  }

  buildCanUseTool(): CanUseTool {
    return async (toolName, input, options) => {
      if (toolName === "AskUserQuestion") {
        const parsed = parseAskUserQuestionInput(input)
        return new Promise<PermissionResult>((resolve) => {
          this.pendingPermissions.set(options.toolUseID, (decision) =>
            resolve(
              buildPermissionResultForDecision(decision, options.toolUseID)
            )
          )
          this.eventQueue.push({
            kind: "user_input_requested",
            requestId: options.toolUseID,
            title: parsed.title,
            questions: parsed.questions,
            toolName,
            originalInput: parsed.originalInput,
          })
        })
      }
      if (toolName === "ExitPlanMode") {
        const parsed = parsePlanApprovalInput(input)
        return new Promise<PermissionResult>((resolve) => {
          this.pendingPermissions.set(options.toolUseID, (decision) =>
            resolve(
              buildPermissionResultForDecision(decision, options.toolUseID)
            )
          )
          this.eventQueue.push({
            kind: "plan_approval_requested",
            requestId: options.toolUseID,
            title: "Plan from Claude",
            summary: "Claude wants approval before leaving plan mode.",
            planMarkdown: parsed.planMarkdown,
            toolName,
            originalInput: parsed.originalInput,
          })
        })
      }
      return {
        behavior: "allow",
        updatedInput: input as Record<string, unknown>,
        toolUseID: options.toolUseID,
      }
    }
  }
}

export class ClaudeDriver implements AgentDriver {
  readonly runtimeKind = RUNTIME_KIND.CLAUDE_CODE
  readonly label = "Claude Code"
  readonly capabilities: DaemonRuntimeCapabilities = {
    supportsRequestUserInput: true,
    supportsPlanMode: true,
    supportsPersistentSession: true,
    supportsStructuredIo: true,
  }

  detect(): RuntimeCatalogEntry {
    const probe = detectClaudeBinary()
    if (!probe.path) {
      return { runtimeKind: this.runtimeKind, status: "missing_binary" }
    }
    return {
      runtimeKind: this.runtimeKind,
      executablePath: probe.path,
      status: "available",
      version: probe.version,
    }
  }

  async createSession(spec: SessionSpec): Promise<AgentSession> {
    const session = new ClaudeAgentSession(
      spec.remoteAgentId,
      spec.conversationId,
      spec.resumeSessionId
    )

    const options: ClaudeQueryOptions = {
      cwd: spec.workingDirectory,
      additionalDirectories: spec.additionalDirectories,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      canUseTool: session.buildCanUseTool(),
      mcpServers: spec.mcpServers,
      // Wire the SDK's stderr callback so the claude subprocess's death
      // throes (config errors, OAuth failures, MCP wiring complaints) land
      // in daemon logs instead of being silently consumed. Without this the
      // only signal of a startup crash was the downstream EPIPE storm.
      stderr: (data: string) => {
        const text = data.trim()
        if (!text) return
        // Use stderr to keep the daemon's stdout clean for its own JSON log
        // stream; tag each line so log scrapers can group them under the
        // owning conversation.
        process.stderr.write(
          `[claude-stderr] ${spec.remoteAgentId} ${spec.conversationId} ${text}\n`
        )
      },
      env: {
        ...process.env,
        ...spec.childEnvOverlay,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      pathToClaudeCodeExecutable: spec.runtimePath,
      abortController: spec.abortSignal
        ? abortControllerFromSignal(spec.abortSignal)
        : undefined,
    }
    if (spec.resumeSessionId) {
      options.resume = spec.resumeSessionId
    }

    // Seed the initial prompt before launching the query so the SDK picks it up immediately.
    if (spec.initialPrompt.trim()) {
      session.seedPrompt(userMessage(spec.initialPrompt))
    }

    const query = claudeAgentQuery({
      prompt: session.promptIterable(),
      options,
    })
    session.attach(query)
    return session
  }
}

function abortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) {
    controller.abort()
  } else {
    signal.addEventListener("abort", () => controller.abort(), { once: true })
  }
  return controller
}
