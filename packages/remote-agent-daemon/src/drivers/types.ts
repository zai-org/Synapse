import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk"
import type { RemoteAgentRuntimeKind } from "@synapse/device-protocol"

export type RuntimeKind = RemoteAgentRuntimeKind

export const RUNTIME_KIND = {
  CLAUDE_CODE: "claude_code",
  CODEX: "codex",
  PI: "pi",
  OPENCODE: "opencode",
} as const satisfies Record<string, RuntimeKind>

export const RUNTIME_KINDS = [
  RUNTIME_KIND.CLAUDE_CODE,
  RUNTIME_KIND.CODEX,
  RUNTIME_KIND.PI,
  RUNTIME_KIND.OPENCODE,
] as const satisfies readonly RuntimeKind[]

export type RuntimeCatalogStatus =
  | "available"
  | "missing_binary"
  | "broken_path"
  | "unsupported_platform"
  | "runtime_error"

export type RuntimeCatalogEntry = {
  runtimeKind: RuntimeKind
  executablePath?: string
  status: RuntimeCatalogStatus
  version?: string
  metadata?: Record<string, unknown>
  lastError?: string
}

export type PermissionDecision =
  | {
      behavior: "allow"
      updatedInput?: Record<string, unknown>
    }
  | {
      behavior: "deny"
      message: string
    }

export type AgentSessionEvent =
  | { kind: "session_started"; sessionId: string }
  | { kind: "assistant_message"; text: string }
  | {
      kind: "user_input_requested"
      requestId: string
      title: string
      questions: Array<Record<string, unknown>>
      toolName?: string
      originalInput?: Record<string, unknown>
    }
  | {
      kind: "plan_approval_requested"
      requestId: string
      title: string
      summary?: string
      planMarkdown: string
      checklist?: Array<Record<string, unknown>>
      toolName?: string
      originalInput?: Record<string, unknown>
    }
  | {
      kind: "plan_updated"
      explanation?: string
      plan: Array<{ step: string; status: string }>
    }
  | { kind: "turn_completed" }
  | { kind: "error"; message: string }

export type SessionSpec = {
  remoteAgentId: string
  conversationId: string
  workingDirectory: string
  /**
   * Additional filesystem roots the runtime can read / edit beyond the cwd.
   * Use this for operator-configured project roots: cwd stays per-conversation
   * (so CC's session transcript files don't collide across conversations) and
   * the operator's `localRootPath` shows up here.
   */
  additionalDirectories?: string[]
  resumeSessionId?: string
  runtimePath?: string
  mcpServers?: Record<string, McpServerConfig>
  initialPrompt: string
  /** Extra env merged on top of process.env for the agent child process. */
  childEnvOverlay?: Record<string, string | undefined>
  abortSignal?: AbortSignal
}

export type SendPromptOptions = {
  /** Treat this as a wake/resume rather than a fresh start. The driver decides protocol details. */
  wake?: boolean
}

export interface AgentSession {
  readonly runtimeKind: RuntimeKind
  readonly conversationId: string
  readonly remoteAgentId: string
  readonly sessionId: string | undefined
  /** Send a user-role text prompt into the live session. */
  send(prompt: string, options?: SendPromptOptions): Promise<void>
  /** Resolve a pending permission / user-input / plan-approval request. */
  respondPermission(
    requestId: string,
    decision: PermissionDecision
  ): Promise<void>
  /** Pull events emitted by the runtime. The async iterable ends when close() is called. */
  events(): AsyncIterable<AgentSessionEvent>
  close(reason: string): Promise<void>
}

export interface AgentDriver {
  readonly runtimeKind: RuntimeKind
  /** Human-readable brand label shown in logs and catalog-issue messages. */
  readonly label: string
  /** Feature flags advertised to the api for this runtime kind. */
  readonly capabilities: DaemonRuntimeCapabilities
  /** Probe the local machine for the runtime binary and report capabilities. */
  detect(): RuntimeCatalogEntry
  createSession(spec: SessionSpec): Promise<AgentSession>
}

/** Feature flags advertised per runtime kind (mirrors the api-side wire shape). */
export type DaemonRuntimeCapabilities = {
  supportsRequestUserInput?: boolean
  supportsPlanMode?: boolean
  supportsPersistentSession?: boolean
  supportsCodexAppServer?: boolean
  supportsStructuredIo?: boolean
}
