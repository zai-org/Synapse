// @synapse/device-protocol — enum constants shared between server, runtime, sdk.
// Mirrors §3, §5, §6, §11 of docs/device-runtime-v3.md.

export const HOST_KINDS = ["local", "cloud"] as const
export type HostKind = (typeof HOST_KINDS)[number]

// v3.0: device_runtime + remote_agent_daemon + bare_dataplane (the bare-sandbox
// data-plane service kind). DeskAct is supervised by
// device_runtime as a child process, NOT a service. See §5.2.
export const RUNTIME_SERVICE_KINDS = [
  "device_runtime",
  "remote_agent_daemon",
  "bare_dataplane",
] as const
export type RuntimeServiceKind = (typeof RUNTIME_SERVICE_KINDS)[number]

export const RUNTIME_SERVICE_STATUSES = [
  "starting",
  "online",
  "degraded",
  "offline",
] as const
export type RuntimeServiceStatus = (typeof RUNTIME_SERVICE_STATUSES)[number]

export const DEVICE_TRUST_STATUSES = ["pending", "trusted", "revoked"] as const
export type DeviceTrustStatus = (typeof DEVICE_TRUST_STATUSES)[number]

export const DEVICE_TYPES = [
  "desktop_computer",
  "laptop_computer",
  "mobile_phone",
  "tablet",
  "server",
  "virtual_machine",
  "custom",
] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

// runtime_exposures.transport — same as relay_exposures.transport plus stays
// stable across the rename.
export const RUNTIME_EXPOSURE_TRANSPORTS = [
  "builtin",
  "stdio",
  "http",
  "sse",
  "custom",
] as const
export type RuntimeExposureTransport =
  (typeof RUNTIME_EXPOSURE_TRANSPORTS)[number]

// Built-in MCP server kinds. v3.0 set: filesystem, commandline, browser, cua.
// VFS is NOT a capability_kind — it's an internal projection on top of
// filesystem/browser/cua (§6 Notes).
export const RUNTIME_BUILTIN_KINDS = [
  "filesystem",
  "commandline",
  "browser",
  "cua",
] as const
export type RuntimeBuiltinKind = (typeof RUNTIME_BUILTIN_KINDS)[number]

export const RUNTIME_EXPOSURE_RUNTIME_STATUSES = [
  "discovered",
  "healthy",
  "degraded",
  "failed",
  "quarantined",
  "offline",
] as const
export type RuntimeExposureRuntimeStatus =
  (typeof RUNTIME_EXPOSURE_RUNTIME_STATUSES)[number]

export const REMOTE_AGENT_RUNTIME_KINDS = [
  "claude_code",
  "codex",
  "pi",
  "opencode",
] as const
export type RemoteAgentRuntimeKind = (typeof REMOTE_AGENT_RUNTIME_KINDS)[number]

export const REMOTE_AGENT_RUNTIME_STATES = [
  "offline",
  "idle",
  "running",
  "waiting_user_input",
  "plan_drafting",
  "waiting_plan_approval",
  "error",
] as const
export type RemoteAgentRuntimeState =
  (typeof REMOTE_AGENT_RUNTIME_STATES)[number]

export const REMOTE_AGENT_RUNTIME_CATALOG_STATUSES = [
  "available",
  "missing_binary",
  "broken_path",
  "unsupported_platform",
  "runtime_error",
] as const
export type RemoteAgentRuntimeCatalogStatus =
  (typeof REMOTE_AGENT_RUNTIME_CATALOG_STATUSES)[number]

// Control Plane session enums.
export const RUNTIME_CONTROL_PLANE_SESSION_STATUSES = [
  "connecting",
  "active",
  "closing",
  "closed",
  "rejected",
] as const
export type RuntimeControlPlaneSessionStatus =
  (typeof RUNTIME_CONTROL_PLANE_SESSION_STATUSES)[number]

export const RUNTIME_CONTROL_PLANE_TRANSPORTS = ["websocket"] as const
export type RuntimeControlPlaneTransport =
  (typeof RUNTIME_CONTROL_PLANE_TRANSPORTS)[number]

// Pairing modes — see §8 of the spec.
export const RUNTIME_PAIRING_MODES = ["local_qr", "cloud_bootstrap"] as const
export type RuntimePairingMode = (typeof RUNTIME_PAIRING_MODES)[number]

export const RUNTIME_PAIRING_STATUSES = [
  "pending",
  "confirmed",
  "consumed",
  "expired",
  "cancelled",
  "rejected",
] as const
export type RuntimePairingStatus = (typeof RUNTIME_PAIRING_STATUSES)[number]

// subject-scope-refactor: RUNTIME_AUTHORIZATION_GRANT_SCOPES enum dropped at
// cutover. The envelope `runtime_authorization.grant_scope` field is now a
// derived label string (z.string().min(1).max(64) in schemas.ts), produced by
// `subjectScopeLabel(target)` in packages/shared/src/access/subject.ts. Scope
// itself is expressed via subject_id + scope_subject_id on
// runtime_authorization_grants.

export const RUNTIME_AUTHORIZATION_GRANT_RETENTIONS = [
  "consume_once",
  "until_revoked",
] as const
export type RuntimeAuthorizationGrantRetention =
  (typeof RUNTIME_AUTHORIZATION_GRANT_RETENTIONS)[number]

export const RUNTIME_AUTHORIZATION_GRANT_STATUSES = [
  "active",
  "consumed",
  "revoked",
  "superseded",
] as const
export type RuntimeAuthorizationGrantStatus =
  (typeof RUNTIME_AUTHORIZATION_GRANT_STATUSES)[number]

// requestAuthorization mode — preserved from v2 relay-invoke-options.
export const RUNTIME_AUTHORIZATION_REQUEST_MODES = [
  "none",
  "background",
  "blocking",
] as const
export type RuntimeAuthorizationRequestMode =
  (typeof RUNTIME_AUTHORIZATION_REQUEST_MODES)[number]

// Capability kinds that fine-grained runtime authorization understands.
export const RUNTIME_AUTHORIZATION_CAPABILITIES = [
  "filesystem",
  "cua",
  "browser",
  "commandline",
] as const
export type RuntimeAuthorizationCapability =
  (typeof RUNTIME_AUTHORIZATION_CAPABILITIES)[number]

// Operation-level taxonomy for browser capability. fail-closed semantics: a
// grant whose policy lacks `operations` does NOT cover any operation-requesting
// call (matchers.ts enforces this). See docs/device-runtime-v3.md §Browser v3.1.
export const RUNTIME_AUTHORIZATION_BROWSER_OPERATIONS = [
  "page.read",
  "page.navigate",
  "page.input",
  "screenshot.capture",
  "console.read",
  "network.list",
  "network.body.read",
  "script.evaluate",
  "performance.trace",
  "file.upload",
  "extension.manage",
  "webmcp.execute",
] as const
export type BrowserOperation =
  (typeof RUNTIME_AUTHORIZATION_BROWSER_OPERATIONS)[number]

export type BrowserOperationRequiredAction = "read" | "write"

/**
 * Minimum action level required to grant each browser operation.
 *
 * This lives with the browser operation enum so app/shared policy validators can
 * check action coverage without importing the browser tool map/descriptors.
 */
export const BROWSER_OPERATION_REQUIRED_ACTION: Readonly<
  Record<BrowserOperation, BrowserOperationRequiredAction>
> = {
  "page.read": "read",
  "page.navigate": "write",
  "page.input": "write",
  "screenshot.capture": "read",
  "console.read": "read",
  "network.list": "read",
  "network.body.read": "read",
  "script.evaluate": "write",
  "performance.trace": "read",
  // Deferred operations: not in BROWSER_TOOL_MAP today, but listed in the enum
  // so a grant policy can name them. Each one is write-sensitive.
  "file.upload": "write",
  "extension.manage": "write",
  "webmcp.execute": "write",
}

export function browserActionCoversOperations(
  action: BrowserOperationRequiredAction,
  operations: readonly BrowserOperation[]
): { ok: true } | { ok: false; offending: BrowserOperation[] } {
  if (action === "write") return { ok: true }
  const offending = operations.filter((op) => {
    const required = BROWSER_OPERATION_REQUIRED_ACTION[op]
    if (required === undefined) return true
    return required === "write"
  })
  return offending.length === 0 ? { ok: true } : { ok: false, offending }
}

// Operation lifecycle statuses. awaiting_authorization is new in v3 (§6).
export const RUNTIME_OPERATION_STATUSES = [
  "created",
  "dispatched",
  "awaiting_authorization",
  "received",
  "started",
  "output_streaming",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const
export type RuntimeOperationStatus = (typeof RUNTIME_OPERATION_STATUSES)[number]

export const RUNTIME_OPERATION_TASK_MODES = ["sync", "async"] as const
export type RuntimeOperationTaskMode =
  (typeof RUNTIME_OPERATION_TASK_MODES)[number]

export const RUNTIME_OPERATION_ATTEMPT_TRANSPORTS = [
  "mcp_http",
  "control_plane_task",
  "data_plane",
] as const
export type RuntimeOperationAttemptTransport =
  (typeof RUNTIME_OPERATION_ATTEMPT_TRANSPORTS)[number]

export const RUNTIME_OPERATION_ATTEMPT_STATUSES = [
  "issued",
  "sent",
  "response_received",
  "acknowledged",
  "failed",
  "abandoned",
] as const
export type RuntimeOperationAttemptStatus =
  (typeof RUNTIME_OPERATION_ATTEMPT_STATUSES)[number]

// Principal kinds passed to capability-projection.projectToolsForPrincipal.
// subject-scope-refactor: 'actor_in_conversation' removed at cutover. The
// scoped-actor semantics is expressed by (principal.kind='actor',
// activeConversationSubjectId set) in RuntimePrincipalContext. The DB enum
// runtime_operations_principal_kind matches.
export const RUNTIME_PRINCIPAL_KINDS = [
  "actor",
  "conversation",
  "remote_agent",
  "workspace_member",
] as const
export type RuntimePrincipalKind = (typeof RUNTIME_PRINCIPAL_KINDS)[number]

// §4.5 device-side error contract. runtime_authorization_requested is
// server-side-only and intentionally NOT in this list.
export const RUNTIME_MCP_ERROR_CODES = [
  "tool_definition_changed",
  "permission_denied",
  "runtime_constraint",
  "invalid_request",
  "expired_envelope",
  "replay_detected",
] as const
export type RuntimeMcpErrorCode = (typeof RUNTIME_MCP_ERROR_CODES)[number]

// §4.5 server-side facade adds runtime_authorization_requested on top.
export const SERVER_FACADE_ERROR_CODES = [
  ...RUNTIME_MCP_ERROR_CODES,
  "runtime_authorization_requested",
] as const
export type ServerFacadeErrorCode = (typeof SERVER_FACADE_ERROR_CODES)[number]

// CUA tool names that require runtime_authorization access='write' on the
// device side. Shared between `device-runtime/src/builtins/cua.ts` and
// `api/src/modules/capability-projection/service.ts` so the projection layer's
// "this tool needs write grants" check and the device's enforcement check stay
// in lockstep. Phase 1 set_focus is read-only (background-only mode); foreground
// will join this list when Phase 2 lands cua_window_op.
export const CUA_WRITE_TOOLS = ["cua_click", "cua_type_text"] as const
export type CuaWriteTool = (typeof CUA_WRITE_TOOLS)[number]

// Filesystem tool names that require runtime_authorization access='write'. Single
// source of truth shared between the projection matcher
// (`api/src/modules/capability-projection/service.ts` — "this tool needs a write
// grant") and the bare (Mode-B) sandbox data plane's fail-closed ConfinementCtx
// access derivation (`api/src/modules/sandbox/bare-dispatch.ts`). Keeping ONE list
// means a read/unknown tool can never silently be treated as a writer on either
// side. fs_delete/fs_history_restore are resident-only tools (never dispatched on
// the reduced bare surface) but belong here so the matcher classifies them too.
export const FILESYSTEM_WRITE_TOOLS = [
  "fs_write",
  "fs_edit",
  "fs_delete",
  "fs_history_restore",
  "fs_mkdir",
  "fs_move",
  "fs_remove",
] as const
export type FilesystemWriteTool = (typeof FILESYSTEM_WRITE_TOOLS)[number]
