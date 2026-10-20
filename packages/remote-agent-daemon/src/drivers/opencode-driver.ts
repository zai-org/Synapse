import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import process from "node:process"
import { createInterface } from "node:readline"
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk"
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
  mergeOpencodeConfigEnv,
  parseOpencodeRunLine,
  readOpencodeSessionId,
  toOpencodeMcpServer,
} from "./opencode-driver-events.js"

/**
 * opencode driver — bridges the opencode CLI (https://opencode.ai) into a
 * Synapse conversation via `opencode run --format json`.
 *
 * Transport: one subprocess per send (per-turn process, NOT a long-lived
 * app-server like codex). NDJSON events on stdout are parsed into
 * AgentSessionEvent; the child's 'close' event (all stdio drained — NOT
 * 'exit', which can fire before buffered stderr is readable) is the turn's
 * terminal. Session persistence rides on opencode's own session storage:
 * the first run's `sessionID` (present in every event envelope, including
 * errors) is captured and passed as `-s <id>` on later runs, which opencode
 * resumes with full multi-turn context (verified live on 1.18.33).
 *
 * Honest capability notes (verified against 1.18.33 source + live runs):
 *   - PERMISSIONS CANNOT BE INTERACTIVELY ANSWERED in `run` mode: opencode's
 *     run loop auto-REJECTS every `permission.asked` event itself and only
 *     prints a human-readable warning line on stdout. There is no channel to
 *     approve from outside, so this driver never emits user_input_requested
 *     and respondPermission() always throws. `--auto` (auto-approve) exists
 *     but is explicitly NOT used — silently approving sandbox/tool escapes
 *     would be worse than an auto-reject on the opencode side.
 *   - The prompt travels as a CLI argument, so extremely large prompts are
 *     rejected up-front (argv limits) instead of failing with a cryptic E2BIG.
 *   - `opencode run` may keep a shared background `opencode` server process
 *     alive between invocations (its own lifecycle management); close() kills
 *     only the per-turn child.
 */

function trimFirstLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function detectOpencodeBinary(): { path?: string; version?: string } {
  const path = process.env.SYNAPSE_OPENCODE_PATH?.trim() || whichBinary("opencode")
  if (!path) return {}
  let version: string | undefined
  try {
    // execFileSync (no shell): SYNAPSE_OPENCODE_PATH is machine-operator
    // input, and the old `execSync(`"${path}" --version`)` interpolation ran
    // it through a shell — a path with metacharacters was a command-injection
    // surface (review #11).
    const probe = execFileSync(path, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    version = trimFirstLine(probe.toString())
  } catch {
    // version probe is best-effort
  }
  return { path, version }
}

/** Test-only escape hatch, mirroring the codex driver's flag-test export. */
export const __mergeOpencodeConfigEnvForTest = mergeOpencodeConfigEnv

const MAX_PROMPT_ARG_CHARS = 100_000

class EventQueue extends EventQueueBase<AgentSessionEvent> {}

type TurnOutcome = {
  sawErrorEvent: boolean
}

class OpencodeAgentSession implements AgentSession {
  readonly runtimeKind = RUNTIME_KIND.OPENCODE
  private child: ChildProcess | null = null
  private cachedSessionId: string | undefined
  private readonly eventQueue = new EventQueue()
  private closed = false
  // Serializes turns: the conversation runtime gates one turn at a time, but
  // chain anyway so a gate regression degrades to queuing instead of two
  // concurrent `opencode run` children fighting over the same session.
  private sendChain: Promise<void> = Promise.resolve()
  private stderrTail: string[] = []
  private readonly mcpServers: Record<string, McpServerConfig> | undefined
  private readonly childEnvOverlay: Record<string, string | undefined>

  constructor(
    readonly remoteAgentId: string,
    readonly conversationId: string,
    private readonly runtimePath: string,
    private readonly workingDirectory: string,
    bootstrapPrompt: string,
    initialSessionId: string | undefined,
    mcpServers: Record<string, McpServerConfig> | undefined,
    childEnvOverlay: Record<string, string | undefined> | undefined
  ) {
    this.cachedSessionId = initialSessionId
    this.mcpServers = mcpServers
    this.childEnvOverlay = childEnvOverlay ?? {}
    // Bootstrap turn: the runtime armed a gate for the seeded epoch before
    // createSession resolved, so its terminal must come from this first run.
    this.sendChain = this.sendChain.then(() => this.runTurn(bootstrapPrompt))
  }

  get sessionId() {
    return this.cachedSessionId
  }

  private buildChildEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    for (const [key, value] of Object.entries(this.childEnvOverlay)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
    const servers: Record<string, Record<string, unknown>> = {}
    for (const [name, server] of Object.entries(this.mcpServers ?? {})) {
      const mapped = toOpencodeMcpServer(server)
      if (mapped) servers[name] = mapped
    }
    if (Object.keys(servers).length > 0) {
      // opencode 1.18.x config channels (verified against the binary's config
      // loader): OPENCODE_CONFIG is a PATH to a config file, while
      // OPENCODE_CONFIG_CONTENT carries inline JSON merged as a "local" config
      // layer. Passing JSON content via OPENCODE_CONFIG silently no-ops (the
      // path never exists) and the reverse-MCP tools never reach the model —
      // the live smoke run caught exactly that.
      env.OPENCODE_CONFIG_CONTENT = mergeOpencodeConfigEnv(
        env.OPENCODE_CONFIG_CONTENT,
        servers
      )
    }
    env.FORCE_COLOR = "0"
    env.NO_COLOR = "1"
    return env
  }

  private buildArgs(prompt: string): string[] {
    return [
      "run",
      "--format",
      "json",
      ...(this.cachedSessionId
        ? ["--session", this.cachedSessionId]
        : []),
      "--",
      prompt,
    ]
  }

  private handleStdoutLine(line: string) {
    const sessionID = readOpencodeSessionId(line)
    if (sessionID && sessionID !== this.cachedSessionId) {
      this.cachedSessionId = sessionID
      this.eventQueue.push({ kind: "session_started", sessionId: sessionID })
    }
    const result = parseOpencodeRunLine(line)
    switch (result.kind) {
      case "assistant_text":
        this.eventQueue.push({ kind: "assistant_message", text: result.text })
        break
      case "error":
        this.eventQueue.push({ kind: "error", message: result.message })
        break
      default:
        break
    }
  }

  private finalizeTurn(outcome: TurnOutcome, code: number | null, signal: string | null) {
    const stderr = this.stderrTail.join("").trim()
    const cleanExit = code === 0
    if (!cleanExit && !outcome.sawErrorEvent) {
      // Non-zero exit with no JSON error line: surface the exit status (plus a
      // bounded stderr tail — e.g. "Session not found" on a stale -s id
      // arrives ONLY on stderr, exit 1). A clean exit-0 turn emits no error —
      // spurious errors on every successful turn would poison the
      // conversation's last_error bookkeeping.
      const detail =
        signal && code === null
          ? `opencode run terminated by ${signal}`
          : `opencode run exited with code ${code ?? "?"}`
      const message = stderr ? `${detail}: ${stderr.slice(-500)}` : detail
      this.eventQueue.push({ kind: "error", message })
    }
    // Self-heal a stale resume id: opencode reports "Session not found" ONLY
    // on stderr with exit 1 (verified on 1.18.33). Without this, every later
    // turn re-sends the same dead --session id and the conversation wedges
    // permanently — the next turn starts a FRESH session instead (context is
    // lost, but the conversation lives).
    if (
      !cleanExit &&
      this.cachedSessionId &&
      /session\s+not\s+found/i.test(stderr)
    ) {
      this.cachedSessionId = undefined
    }
    this.eventQueue.push({ kind: "turn_completed" })
  }

  private async runTurn(prompt: string): Promise<void> {
    if (this.closed) return
    if (prompt.length > MAX_PROMPT_ARG_CHARS) {
      this.eventQueue.push({
        kind: "error",
        message: `opencode driver cannot send a ${prompt.length}-char prompt: it would exceed the child argv limit (max ${MAX_PROMPT_ARG_CHARS})`,
      })
      this.eventQueue.push({ kind: "turn_completed" })
      return
    }
    try {
      this.stderrTail = []
      await this.awaitTurnChild(prompt)
    } catch (error) {
      // Unexpected internal failure (spawn throw, readline teardown, ...).
      // Still emit exactly one terminal so the runtime's turn gate cannot wedge.
      this.eventQueue.push({
        kind: "error",
        message: `opencode driver turn failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      this.eventQueue.push({ kind: "turn_completed" })
    } finally {
      this.child = null
    }
  }

  private awaitTurnChild(prompt: string, outcome: TurnOutcome = { sawErrorEvent: false }): Promise<void> {
    return new Promise<void>((resolve) => {
      // Exactly-once terminal guard: a failed spawn emits 'error' AND THEN
      // 'close' (Node docs), so the close handler must not re-finalize.
      let settled = false
      const settle = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      const child = spawn(this.runtimePath, this.buildArgs(prompt), {
        cwd: this.workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
        env: this.buildChildEnv(),
        shell: process.platform === "win32",
      })
      this.child = child
      if (child.stdout) {
        const rl = createInterface({ input: child.stdout })
        rl.on("line", (line) => {
          if (parseOpencodeRunLine(line).kind === "error") {
            outcome.sawErrorEvent = true
          }
          this.handleStdoutLine(line)
        })
      }
      if (child.stderr) {
        child.stderr.on("data", (chunk: Buffer) => {
          // Keep a bounded tail for exit diagnostics (e.g. "Session not
          // found" on a stale -s id arrives ONLY on stderr, exit 1).
          this.stderrTail.push(chunk.toString())
          while (
            this.stderrTail.length > 0 &&
            this.stderrTail.join("").length > 4000
          ) {
            this.stderrTail.shift()
          }
        })
      }
      child.once("error", (error) => {
        // spawn failure (ENOENT etc.) — terminal for this turn. 'close' still
        // fires after 'error'; the settled guard absorbs it.
        this.eventQueue.push({
          kind: "error",
          message: `failed to start opencode: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
        this.eventQueue.push({ kind: "turn_completed" })
        this.child = null
        settle()
      })
      // Finalize on 'close', NOT 'exit' (review #11 [5]): 'close' fires only
      // after every stdio stream has drained, so the stderr tail above is
      // complete when finalizeTurn reads it. Under an 'exit' listener a child
      // that exits before its pipes flush (large stderr bursts on Linux)
      // finalizes with a truncated/empty tail — losing "Session not found"
      // and silently disabling the stale-session self-heal below.
      child.once("close", (code, signal) => {
        this.child = null
        if (settled) return
        settled = true
        this.finalizeTurn(outcome, code, signal)
        resolve()
      })
    })
  }

  async send(prompt: string, _options?: SendPromptOptions) {
    // Non-blocking dispatch (review #11 [6]): hand the prompt to the serialized
    // turn chain and return immediately. The turn's terminal arrives via
    // events() (turn_completed), which is what the conversation runtime's gate
    // listens to — awaiting the full child run here would (a) block the
    // daemon's sequential per-frame delivery loop, letting one long turn delay
    // every other conversation, and (b) let the post-send "running" status the
    // caller publishes overwrite the "idle" status onTurnCompleted already
    // published for this turn. runTurn never rejects (internal failures become
    // error + turn_completed events); the catch only guards against an
    // eventQueue failure turning into an unhandled rejection.
    this.sendChain = this.sendChain
      .then(() => this.runTurn(prompt))
      .catch(() => undefined)
  }

  async respondPermission(
    _requestId: string,
    _decision: PermissionDecision
  ): Promise<void> {
    // opencode `run` mode has no interactive permission channel: its own loop
    // auto-rejects every permission.asked before we could ever see it. There
    // is no pending request by construction, so this always throws — the
    // honest answer, not a stub that pretends support.
    throw new Error(
      "opencode run mode auto-rejects permissions internally; interactive approval is not available for this runtime"
    )
  }

  events(): AsyncIterable<AgentSessionEvent> {
    return this.eventQueue.iterator()
  }

  async close(_reason: string) {
    if (this.closed) return
    this.closed = true
    this.eventQueue.close()
    const child = this.child
    this.child = null
    if (child && child.exitCode === null && !child.killed) {
      try {
        child.kill("SIGTERM")
        // Escalate if the child ignores SIGTERM (graceful shutdown window).
        const killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {
            // already gone
          }
        }, 3000)
        child.once("exit", () => clearTimeout(killTimer))
      } catch {
        // already gone
      }
    }
  }
}

export class OpencodeDriver implements AgentDriver {
  readonly runtimeKind = RUNTIME_KIND.OPENCODE
  readonly label = "opencode"
  readonly capabilities: DaemonRuntimeCapabilities = {
    // supportsPersistentSession: resumes via -s with full context (verified).
    // Deliberately NO supportsRequestUserInput: run-mode permissions are
    // auto-rejected inside opencode; advertising input support would be a lie.
    supportsPersistentSession: true,
  }

  detect(): RuntimeCatalogEntry {
    const probe = detectOpencodeBinary()
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
    const runtimePath = spec.runtimePath || detectOpencodeBinary().path || "opencode"
    return new OpencodeAgentSession(
      spec.remoteAgentId,
      spec.conversationId,
      runtimePath,
      spec.workingDirectory,
      spec.initialPrompt,
      spec.resumeSessionId,
      spec.mcpServers,
      spec.childEnvOverlay
    )
  }
}
