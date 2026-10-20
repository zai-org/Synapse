import { execSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { createInterface } from "node:readline"
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk"
// codex app-server protocol v2 typed schema. Regenerate after bumping the local
// `codex` binary with:
//   codex app-server generate-ts --out packages/remote-agent-daemon/src/codex/generated
//   find packages/remote-agent-daemon/src/codex/generated -name "*.ts" -exec sed -i -E 's#^(import type \{[^}]+\} from )"(\./|\.\./)([^"]+)";#\1"\2\3.js";#' {} +
//   sed -i 's|export \* as v2 from "./v2";|export * as v2 from "./v2/index.js";|' packages/remote-agent-daemon/src/codex/generated/index.ts
import type { InitializeParams } from "../codex/generated/InitializeParams.js"
import type { ThreadStartParams } from "../codex/generated/v2/ThreadStartParams.js"
import type { ThreadResumeParams } from "../codex/generated/v2/ThreadResumeParams.js"
import type { TurnStartParams } from "../codex/generated/v2/TurnStartParams.js"
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
import { parseCodexJsonRpcLine } from "./codex-json-rpc-codec.js"
import {
  codexTurnStartParamsToRequestParams,
  parseCodexElicitationRequest,
  parseCodexPlanUpdated,
  parseCodexUserInputRequest,
  readCodexThreadResult,
  readCodexElicitationContent,
  readCodexThreadStartedId,
  readCodexTurnCompletedError,
  readCodexUserInputAnswers,
} from "./codex-driver-events.js"

type JsonRpcMethod =
  | "initialize"
  | "collaborationMode/list"
  | "thread/start"
  | "thread/resume"
  | "turn/start"

function trimFirstLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function which(binary: string) {
  return whichBinary(binary)
}

function resolveWindowsCodexEntry() {
  const explicit = process.env.SYNAPSE_CODEX_PATH?.trim()
  if (explicit) return explicit
  try {
    const globalRoot = execSync("npm root -g", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const candidate = path.join(
      globalRoot,
      "@openai",
      "codex",
      "bin",
      "codex.js"
    )
    if (existsSync(candidate)) return candidate
  } catch {}
  const codexPath = which("codex")
  if (!codexPath) return undefined
  const fromCmdDir = path.join(
    path.dirname(codexPath),
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js"
  )
  if (existsSync(fromCmdDir)) return fromCmdDir
  return codexPath
}

function detectCodexBinary(): { path?: string; version?: string } {
  const path =
    process.platform === "win32"
      ? resolveWindowsCodexEntry()
      : process.env.SYNAPSE_CODEX_PATH?.trim() || which("codex")
  if (!path) return {}
  let version: string | undefined
  try {
    const probeArgs = ["--version"]
    const probe =
      process.platform === "win32" && path.endsWith(".js")
        ? execSync(`"${process.execPath}" "${path}" --version`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          })
        : execSync(`${path} ${probeArgs.join(" ")}`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          })
    version = trimFirstLine(probe.toString())
  } catch {
    // best-effort
  }
  return { path, version }
}

class EventQueue extends EventQueueBase<AgentSessionEvent> {}

function writeJsonLine(processRef: ChildProcess | null, payload: unknown) {
  if (!processRef?.stdin?.writable) return false
  processRef.stdin.write(`${JSON.stringify(payload)}\n`)
  return true
}

function defaultThreadConfig() {
  return {
    "features.default_mode_request_user_input": true,
  }
}

function bearerTokenEnvVarName(serverName: string) {
  return `SYNAPSE_MCP_BEARER_${serverName.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
}

export type CodexSpawnFlags = {
  args: string[]
  env: Record<string, string>
}

function mcpServerConfigToCodexFlags(
  servers: Record<string, McpServerConfig> | undefined
): CodexSpawnFlags {
  const flags: string[] = []
  const env: Record<string, string> = {}
  if (!servers) return { args: flags, env }
  for (const [name, server] of Object.entries(servers)) {
    if ("type" in server && server.type === "http") {
      flags.push("-c", `mcp_servers.${name}.url=${JSON.stringify(server.url)}`)
      // Authorization MUST come from an env var, not a CLI argument: process
      // args show up in `ps`, log lines, and the kernel's audit trail; the
      // codex protocol exposes `bearer_token_env_var` exactly so the secret
      // never leaves the parent process's env. Other (non-auth) headers can
      // still ride through http_headers since they're not sensitive.
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(server.headers ?? {})) {
        if (typeof value !== "string") continue
        if (/^authorization$/i.test(key)) {
          const envName = bearerTokenEnvVarName(name)
          const bearer = value.replace(/^Bearer\s+/i, "").trim()
          if (!bearer) continue
          env[envName] = bearer
          flags.push(
            "-c",
            `mcp_servers.${name}.bearer_token_env_var="${envName}"`
          )
          continue
        }
        headers[key] = value
      }
      if (Object.keys(headers).length > 0) {
        flags.push(
          "-c",
          `mcp_servers.${name}.http_headers=${JSON.stringify(headers)}`
        )
      }
    } else if ("command" in server) {
      flags.push(
        "-c",
        `mcp_servers.${name}.command=${JSON.stringify(server.command)}`
      )
      if (server.args) {
        flags.push(
          "-c",
          `mcp_servers.${name}.args=${JSON.stringify(server.args)}`
        )
      }
    }
    flags.push("-c", `mcp_servers.${name}.startup_timeout_sec=30`)
    flags.push("-c", `mcp_servers.${name}.tool_timeout_sec=300`)
    flags.push("-c", `mcp_servers.${name}.enabled=true`)
    flags.push(
      "-c",
      `mcp_servers.${name}.default_tools_approval_mode="approve"`
    )
  }
  return { args: flags, env }
}

/** Test-only: re-export the flag splitter so the test suite can poke at it. */
export const __mcpServerConfigToCodexFlagsForTest = mcpServerConfigToCodexFlags

class CodexAgentSession implements AgentSession {
  readonly runtimeKind = RUNTIME_KIND.CODEX
  private child: ChildProcess | null = null
  private threadId: string | undefined
  private currentModel: string | undefined
  private requestSeq = 0
  private readonly pendingRequests = new Map<string, JsonRpcMethod>()
  // The JSON-RPC request id of the turn-bearing request currently outstanding
  // (thread/start, thread/resume, or turn/start). A generic JSON-RPC error
  // emits a terminal `turn_completed` ONLY when it matches this id (§5d) — so a
  // late error for an already-completed turn, or an error for a fire-and-forget
  // request (collaborationMode/list), never fabricates a spurious terminal.
  private outstandingTurnRequestId: string | undefined
  // Armed at `attach()` before `initialize`, cleared by the FIRST terminal of
  // any kind. Covers the bootstrap window where §5a has already armed the
  // runtime gate but no turn-bearing request id exists yet: an `initialize` /
  // pre-`thread/start` error with the child still alive must still complete the
  // seeded bootstrap turn instead of freezing it (Δ2).
  private bootstrapOutstanding = false
  private readonly pendingPermissions = new Map<
    string,
    (decision: PermissionDecision) => void
  >()
  private readonly eventQueue = new EventQueue()
  private currentPrompt: string

  constructor(
    readonly remoteAgentId: string,
    readonly conversationId: string,
    readonly workingDirectory: string,
    initialPrompt: string,
    initialThreadId: string | undefined,
    private readonly writableRoots: string[]
  ) {
    this.threadId = initialThreadId
    this.currentPrompt = initialPrompt
  }

  get sessionId() {
    return this.threadId
  }

  attach(child: ChildProcess) {
    this.child = child
    if (child.stdout) {
      // readline buffers across chunk boundaries with an internal
      // StringDecoder, so a multi-byte UTF-8 sequence split across two data
      // events is decoded correctly (the old String(chunk) buffering corrupted
      // it). Same pattern the device-runtime sidecar already uses.
      const rl = createInterface({ input: child.stdout })
      rl.on("line", (line) => this.handleStdoutLine(line))
    }
    child.once("exit", (code, signal) => {
      this.eventQueue.push({
        kind: "error",
        message: `codex app-server exited (code=${code ?? "?"} signal=${signal ?? "?"})`,
      })
      // Session death is a terminal for whatever turn was outstanding.
      this.outstandingTurnRequestId = undefined
      this.bootstrapOutstanding = false
      this.eventQueue.push({ kind: "turn_completed" })
      this.eventQueue.close()
    })
    // Arm the bootstrap terminal guard BEFORE initialize: §5a has already armed
    // the runtime gate for the seeded turn, but no turn-bearing request id
    // exists until thread/start (Δ2).
    this.bootstrapOutstanding = true
    this.sendRequest("initialize", {
      clientInfo: {
        name: "synapse_remote_agent",
        title: "Synapse Remote Agent",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    } satisfies InitializeParams)
  }

  private handleStdoutLine(line: string) {
    const event = parseCodexJsonRpcLine(line)
    if (!event) return

    if (event.id !== undefined && "result" in event) {
      const requestId = String(event.id)
      const method = this.pendingRequests.get(requestId)
      this.pendingRequests.delete(requestId)
      this.handleResult(method, event.result)
      return
    }

    if (event.id !== undefined && "error" in event) {
      const requestId = String(event.id)
      this.pendingRequests.delete(requestId)
      this.eventQueue.push({
        kind: "error",
        message: String(
          event.error?.message ?? "codex app-server request failed"
        ),
      })
      // Emit the terminal ONLY when this error belongs to the turn-bearing
      // request (§5d), or — during bootstrap, before any turn id is tracked —
      // when it aborts the seeded bootstrap turn (Δ2). A late error for an
      // already-completed turn, or one for a fire-and-forget request while a
      // turn id IS tracked, emits no terminal (it would double-complete).
      if (requestId === this.outstandingTurnRequestId) {
        this.outstandingTurnRequestId = undefined
        this.bootstrapOutstanding = false
        this.eventQueue.push({ kind: "turn_completed" })
      } else if (
        this.bootstrapOutstanding &&
        this.outstandingTurnRequestId === undefined
      ) {
        this.bootstrapOutstanding = false
        this.eventQueue.push({ kind: "turn_completed" })
      }
      return
    }

    if (typeof event.method === "string" && event.id !== undefined) {
      this.handleServerRequest(event.id, event.method, event.params ?? {})
      return
    }

    if (typeof event.method === "string") {
      this.handleServerNotification(event.method, event.params ?? {})
    }
  }

  private handleResult(method: JsonRpcMethod | undefined, result: unknown) {
    switch (method) {
      case "initialize":
        this.sendNotification("initialized")
        this.sendRequest("collaborationMode/list", {})
        // thread/start|resume is the first turn-bearing request of the bootstrap
        // turn: track its id so an error on it (or the turn/start it chains to,
        // re-tracked in startTurn) fires the terminal via the §5d id match.
        // collaborationMode/list is fire-and-forget and stays untracked.
        if (this.threadId) {
          this.outstandingTurnRequestId = this.sendRequest("thread/resume", {
            threadId: this.threadId,
            cwd: this.workingDirectory,
            approvalPolicy: "never",
            config: defaultThreadConfig(),
          } satisfies ThreadResumeParams)
        } else {
          this.outstandingTurnRequestId = this.sendRequest("thread/start", {
            cwd: this.workingDirectory,
            approvalPolicy: "never",
            sandbox: "workspace-write",
            config: defaultThreadConfig(),
          } satisfies ThreadStartParams)
        }
        break
      case "collaborationMode/list":
        // no-op; we just need it acked
        break
      case "thread/start":
      case "thread/resume": {
        const parsed = readCodexThreadResult(result, this.threadId)
        const threadId = parsed.threadId
        if (threadId && threadId !== this.threadId) {
          this.threadId = threadId
          this.eventQueue.push({ kind: "session_started", sessionId: threadId })
        }
        if (parsed.model) {
          this.currentModel = parsed.model
        }
        this.startTurn(this.currentPrompt)
        break
      }
      case "turn/start":
        // ack only; turn lifecycle comes via notifications.
        break
      default:
        break
    }
  }

  private handleServerNotification(method: string, params: unknown) {
    switch (method) {
      case "thread/started": {
        const threadId = readCodexThreadStartedId(params)
        if (threadId && threadId !== this.threadId) {
          this.threadId = threadId
          this.eventQueue.push({ kind: "session_started", sessionId: threadId })
        }
        break
      }
      case "turn/plan/updated": {
        const parsed = parseCodexPlanUpdated(params)
        this.eventQueue.push({
          kind: "plan_updated",
          explanation: parsed.explanation,
          plan: parsed.plan,
        })
        break
      }
      case "turn/completed": {
        const errorMessage = readCodexTurnCompletedError(params)
        if (errorMessage) {
          this.eventQueue.push({
            kind: "error",
            message: errorMessage,
          })
        }
        // The turn's authoritative terminal — clear the outstanding-turn guard so
        // a later stray error on the same id cannot re-emit, and close the
        // bootstrap window (Δ2).
        this.outstandingTurnRequestId = undefined
        this.bootstrapOutstanding = false
        this.eventQueue.push({ kind: "turn_completed" })
        break
      }
      default:
        break
    }
  }

  private handleServerRequest(
    id: string | number,
    method: string,
    params: unknown
  ) {
    if (method === "item/tool/requestUserInput") {
      const parsed = parseCodexUserInputRequest(params)
      const requestId = `codex-req-${String(id)}`
      this.pendingPermissions.set(requestId, (decision) => {
        if (decision.behavior === "allow") {
          const answers = readCodexUserInputAnswers(decision)
          writeJsonLine(this.child, {
            jsonrpc: "2.0",
            id,
            result: { answers },
          })
        } else {
          writeJsonLine(this.child, {
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: decision.message },
          })
        }
      })
      this.eventQueue.push({
        kind: "user_input_requested",
        requestId,
        title: parsed.title,
        questions: parsed.questions,
      })
      return
    }
    // With approval_policy="never" + sandbox_mode="workspace-write" + per-MCP
    // default_tools_approval_mode="approve", these approval RPCs should rarely
    // arrive. When they do, that's a contract violation by the binary's policy
    // negotiation, not a user intent — fail safe by DENYING the action rather
    // than rubber-stamping it. A surprise file/network/permission grant from
    // a defensive fallback would be worse than the turn stalling out: we'd be
    // letting a sandbox-escape policy desync sneak through silently.
    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/permissions/requestApproval"
    ) {
      writeJsonLine(this.child, {
        jsonrpc: "2.0",
        id,
        result: { decision: "deny" },
      })
      this.eventQueue.push({
        kind: "error",
        message: `Codex requested ${method} after approval_policy=never; denied by daemon fallback`,
      })
      return
    }
    if (method === "mcpServer/elicitation/request") {
      // Codex elicitation = "MCP server wants the user to fill in a form
      // mid-tool-call". Route it through the same user_input mechanism we
      // already use for tool-driven questions so the human can answer in
      // Synapse. The respondPermission roundtrip translates the daemon's
      // PermissionDecision back into the elicitation accept/decline shape.
      const parsed = parseCodexElicitationRequest(params)
      const requestId = `codex-elicit-${String(id)}`
      this.pendingPermissions.set(requestId, (decision) => {
        if (decision.behavior === "allow") {
          writeJsonLine(this.child, {
            jsonrpc: "2.0",
            id,
            result: {
              action: "accept",
              content: readCodexElicitationContent(decision),
              _meta: null,
            },
          })
        } else {
          writeJsonLine(this.child, {
            jsonrpc: "2.0",
            id,
            result: {
              action: "decline",
              content: null,
              _meta: { reason: decision.message },
            },
          })
        }
      })
      this.eventQueue.push({
        kind: "user_input_requested",
        requestId,
        title: parsed.title,
        questions: parsed.questions,
      })
    }
  }

  private sendRequest(
    method: JsonRpcMethod,
    params: Record<string, unknown>
  ): string {
    const id = `req-${++this.requestSeq}`
    this.pendingRequests.set(id, method)
    writeJsonLine(this.child, { jsonrpc: "2.0", id, method, params })
    return id
  }

  private sendNotification(method: string, params?: Record<string, unknown>) {
    writeJsonLine(this.child, {
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
    })
  }

  private startTurn(prompt: string) {
    if (!this.threadId) return
    this.currentPrompt = prompt
    const params: TurnStartParams = {
      threadId: this.threadId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      cwd: this.workingDirectory,
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "workspaceWrite",
        // cwd is implicitly writable; writableRoots adds extra paths. The
        // operator's localRootPath (passed via SessionSpec.additionalDirectories)
        // is the project tree they actually want codex to edit — without it,
        // codex can only mutate the per-conversation scratch dir.
        writableRoots: this.writableRoots,
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
      ...(this.currentModel ? { model: this.currentModel } : {}),
    }
    // turn/start is the turn-bearing request once the thread exists: re-track its
    // id (superseding the thread/start id) so a turn/start error fires the
    // terminal via the §5d match, for both the bootstrap and every later turn.
    this.outstandingTurnRequestId = this.sendRequest(
      "turn/start",
      codexTurnStartParamsToRequestParams(params)
    )
  }

  async send(prompt: string, _options?: SendPromptOptions) {
    if (!prompt.trim() || !this.threadId) {
      this.currentPrompt = prompt
      return
    }
    this.startTurn(prompt)
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
    this.eventQueue.close()
    for (const [id, waiter] of this.pendingPermissions) {
      waiter({ behavior: "deny", message: "session closed" })
      this.pendingPermissions.delete(id)
    }
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      try {
        this.child.kill()
      } catch {
        // ignore
      }
    }
    this.child = null
  }
}

export class CodexDriver implements AgentDriver {
  readonly runtimeKind = RUNTIME_KIND.CODEX
  readonly label = "Codex CLI"
  readonly capabilities: DaemonRuntimeCapabilities = {
    supportsRequestUserInput: true,
    supportsPlanMode: true,
    supportsCodexAppServer: true,
  }

  detect(): RuntimeCatalogEntry {
    const probe = detectCodexBinary()
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
    const gitDirectory = path.join(spec.workingDirectory, ".git")
    if (!existsSync(gitDirectory)) {
      execSync("git init", {
        cwd: spec.workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
      })
      execSync('git add -A && git commit --allow-empty -m "init"', {
        cwd: spec.workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "synapse",
          GIT_AUTHOR_EMAIL: "synapse@local",
          GIT_COMMITTER_NAME: "synapse",
          GIT_COMMITTER_EMAIL: "synapse@local",
        },
      })
    }

    const runtimePath = spec.runtimePath || detectCodexBinary().path || "codex"
    const isWindowsJsEntry =
      process.platform === "win32" && runtimePath.endsWith(".js")

    const mcpFlags = mcpServerConfigToCodexFlags(spec.mcpServers)
    const args = ["app-server", "--listen", "stdio://", ...mcpFlags.args]

    const child = isWindowsJsEntry
      ? spawn(process.execPath, [runtimePath, ...args], {
          cwd: spec.workingDirectory,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            ...spec.childEnvOverlay,
            ...mcpFlags.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        })
      : spawn(runtimePath, args, {
          cwd: spec.workingDirectory,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            ...spec.childEnvOverlay,
            ...mcpFlags.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
          shell: process.platform === "win32",
        })

    const session = new CodexAgentSession(
      spec.remoteAgentId,
      spec.conversationId,
      spec.workingDirectory,
      spec.initialPrompt,
      spec.resumeSessionId,
      spec.additionalDirectories ?? []
    )
    session.attach(child)
    return session
  }
}
