import crypto from "node:crypto"
import { z } from "zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type {
  RelayDashboardView,
  RelayDeviceDetailView,
  RelayDeviceSummaryView,
  RelayExposureView,
  RelayPairingSessionView,
  RelaySyncSourceView,
  RelayToolView,
} from "@synapse/shared"
import type { RelayAuthorizationGrantView } from "@synapse/shared/types"
import {
  CAPABILITY_ACCESS_TARGET_TYPES,
  RELAY_MANAGEABLE_TRUST_STATUSES,
  RELAY_PAIRING_TTL_MS,
  RELAY_PROTOCOL_VERSION,
  relayLifecycleEventDefinitions,
} from "@synapse/shared"
import { config } from "../../config/index.js"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { transaction } from "../../infrastructure/database/index.js"
import {
  executeSql,
  executeSqlOn,
} from "../../infrastructure/database/kysely.js"
import { emitEvent } from "../../infrastructure/events/index.js"
import { disconnectRelay } from "./relay-manager.js"
import { incrementMcpVersion } from "./runtime-version.js"
import { logEvent } from "./audit.js"
import { requireRequestAction } from "../access/guards.js"
import {
  grantRelayExposureAccess,
  listRelayExposureAccessState,
  revokeRelayDeviceAccessState,
  revokeRelayExposureAccess,
  updateRelayExposureAccessGrant,
  updateRelayExposurePolicy,
} from "./relay-access.js"
import { getWorkspaceCapabilityConversationTypeMask } from "../capabilities/conversation-type-policies.js"
import {
  assertRelayConversationTypeMaskWithinParent,
  resolveRelayCapabilityConversationTypeMask,
  resolveRelayDeviceConversationTypeMask,
} from "./relay-policy.js"
import {
  getRelayAuthorizationGrant,
  listActiveRelayAuthorizationGrantsForExposure,
  revokeRelayAuthorizationGrant,
  type RelayAuthorizationGrantRecord,
} from "../relay-authorizations/service.js"

const createPairingSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
})

const relayDesktopUpdateQuerySchema = z.object({
  channel: z.string().trim().min(1).max(40).default("stable"),
  platform: z.string().trim().min(1).max(40),
  arch: z.string().trim().min(1).max(40),
})

const conversationTypeMaskSchema = z.number().int().min(1).max(31)

const updateRelayDeviceSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    deviceType: z.string().trim().min(1).max(64).optional(),
    conversationTypeMaskOverride: conversationTypeMaskSchema
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one relay device field must be updated",
  })

const updateRelayTrustSchema = z.object({
  trustStatus: z.enum(RELAY_MANAGEABLE_TRUST_STATUSES),
})

const accessTargetTypeSchema = z.enum(CAPABILITY_ACCESS_TARGET_TYPES)
const accessTargetSchema = z.object({
  type: accessTargetTypeSchema,
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
})

const accessGrantSchema = z.object({
  accessTarget: accessTargetSchema.optional(),
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
  reason: z.string().trim().min(1).optional(),
})
const accessGrantUpdateSchema = z.object({
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
})
const updateRelayExposureSchema = z.object({
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
})

const claimPairingSchema = z.object({
  pairingCode: z.string().trim().min(4).max(32),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(4000).optional(),
  deviceType: z.string().trim().min(1).max(64).optional(),
  platform: z.string().trim().min(1).max(40).optional(),
  publicKey: z.string().trim().min(1),
  publicKeyFingerprint: z.string().trim().min(8).max(128),
})

const relayDesktopReleaseSchema = z.object({
  channel: z.string().trim().min(1).max(40),
  platform: z.string().trim().min(1).max(40),
  arch: z.string().trim().min(1).max(40),
  version: z.string().trim().min(1).max(64),
  downloadUrl: z.string().trim().min(1),
  sha256: z.string().trim().min(1).max(128).optional(),
  notes: z.string().trim().max(2000).optional(),
  publishedAt: z.string().trim().min(1).max(128).optional(),
})

const relayDesktopCommitPattern = /^[0-9a-f]{7,64}$/i

const relayDesktopArtifactFilenames: Record<string, string> = {
  "windows/amd64": "synapse-relay-gui-windows-amd64-setup.exe",
  "darwin/amd64": "synapse-relay-gui-darwin-amd64.pkg",
  "darwin/arm64": "synapse-relay-gui-darwin-arm64.pkg",
  "linux/amd64": "synapse-relay-gui-linux-amd64.deb",
}

type WorkspaceParams = { workspaceId: string }
type RelayParams = WorkspaceParams & { id: string }
type PairingParams = WorkspaceParams & { pairingId: string }
type RelayExposureParams = RelayParams & { exposureId: string }
type RelayExposureAccessParams = RelayExposureParams & { bindingId: string }

type RelayDeviceSummaryRow = {
  id: string
  workspace_id: string
  owner_workspace_member_id: string | null
  title: string
  description: string | null
  device_type: string
  platform: string | null
  conversation_type_mask_override: number | null
  public_key_fingerprint: string
  trust_status: RelayDeviceSummaryView["trustStatus"]
  is_connected: boolean
  exposure_count: string | number
  healthy_exposure_count: string | number
  degraded_exposure_count: string | number
  failed_exposure_count: string | number
  offline_exposure_count: string | number
  tool_count: string | number
  sync_source_count: string | number
  last_seen_at: string | null
  last_connected_at: string | null
  last_catalog_changed_at: string | null
  created_at: string
  updated_at: string
}

type RelayPairingRow = {
  id: string
  workspace_id: string
  requested_by_workspace_member_id: string | null
  device_id: string | null
  server_base_url: string
  requested_title: string | null
  requested_description: string | null
  requested_device_type: string | null
  pairing_code: string
  verification_uri: string
  verification_uri_complete: string | null
  expires_at: string
  confirmed_at: string | null
  consumed_at: string | null
  status: RelayPairingSessionView["status"]
  created_at: string
  updated_at: string
}

type RelaySyncSourceRow = {
  id: string
  source_kind: RelaySyncSourceView["sourceKind"]
  source_key: string
  config_path: string | null
  sync_mode: RelaySyncSourceView["syncMode"]
  status: RelaySyncSourceView["status"]
  last_synced_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

type RelayExposureToolRow = {
  capability_id: string
  exposure_id: string
  exposure_stable_key: string
  exposure_display_name: string
  exposure_description: string | null
  exposure_transport: RelayExposureView["transport"]
  exposure_runtime_status: RelayExposureView["runtimeStatus"]
  capability_conversation_type_mask_override: number | null
  exposure_last_seen_at: string | null
  exposure_last_healthy_at: string | null
  exposure_last_error: string | null
  exposure_metadata: Record<string, unknown> | string | null
  exposure_created_at: string
  exposure_updated_at: string
  sync_source_id: string | null
  sync_source_kind: RelaySyncSourceView["sourceKind"] | null
  sync_source_key: string | null
  sync_source_config_path: string | null
  sync_source_sync_mode: RelaySyncSourceView["syncMode"] | null
  sync_source_status: RelaySyncSourceView["status"] | null
  sync_source_last_synced_at: string | null
  sync_source_last_error: string | null
  sync_source_created_at: string | null
  sync_source_updated_at: string | null
  tool_id: string | null
  tool_stable_key: string | null
  tool_current_name: string | null
  tool_status: RelayToolView["status"] | null
  tool_last_seen_at: string | null
  tool_created_at: string | null
  tool_updated_at: string | null
  tool_revision_id: string | null
  catalog_revision_id: string | null
  catalog_revision_seq: string | number | null
  tool_description: string | null
  tool_input_schema: Record<string, unknown> | string | null
  tool_annotations: Record<string, unknown> | string | null
  tool_definition_hash: string | null
}

type RelayDesktopReleaseView = {
  channel: string
  platform: string
  arch: string
  version: string
  downloadUrl: string
  sha256?: string
  notes?: string
  publishedAt?: string
}

type ReleaseVersion = {
  major: number
  minor: number
  patch: number
  prerelease: string
}

function clientRunner(client: {
  query: (text: string, params?: any[]) => Promise<any>
}) {
  return <T = any>(text: string, params?: unknown[]) =>
    executeSqlOn<T>(client, text, params)
}

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply
      .status(400)
      .send({ error: "Validation error", details: error.errors })
  }

  if ((error as any)?.code === "RELAY_PAIRING_NOT_FOUND") {
    return reply.status(404).send({ error: "Relay pairing session not found" })
  }

  if ((error as any)?.code === "RELAY_DEVICE_NOT_FOUND") {
    return reply.status(404).send({ error: "Relay device not found" })
  }

  if ((error as any)?.code === "RELAY_EXPOSURE_NOT_FOUND") {
    return reply.status(404).send({ error: "Relay exposure not found" })
  }

  if ((error as any)?.code === "RELAY_PAIRING_EXPIRED") {
    return reply.status(410).send({ error: "Relay pairing session expired" })
  }

  if ((error as any)?.code === "RELAY_PAIRING_INVALID") {
    return reply.status(409).send({ error: (error as Error).message })
  }

  if ((error as any)?.code === "RELAY_DEVICE_FINGERPRINT_CONFLICT") {
    return reply.status(409).send({
      error: "A relay device with this public key fingerprint already exists",
    })
  }

  if ((error as any)?.code === "RELAY_EXPOSURE_ACCESS_NOT_FOUND") {
    return reply
      .status(404)
      .send({ error: "Relay exposure access binding not found" })
  }

  console.error("[Relay Controller]", error)
  return reply.status(500).send({ error: "Internal server error" })
}

function parseJsonObject(value: unknown) {
  if (!value) return {}
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return value as Record<string, unknown>
}

function parseCount(value: string | number | null | undefined) {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value) || 0
  return 0
}

async function requireWorkspacePermission(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  action: "workspace.view" | "workspace.manage_relays",
  errorMessage: string
) {
  const { workspaceId } = request.params
  return requireRequestAction(request, reply, action, workspaceId, errorMessage)
}

function mapRelayDeviceSummary(
  row: RelayDeviceSummaryRow,
  workspaceConversationTypeMask: number
): RelayDeviceSummaryView {
  const effectiveConversationTypeMask = resolveRelayDeviceConversationTypeMask(
    workspaceConversationTypeMask,
    row.conversation_type_mask_override
  )
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerWorkspaceMemberId: row.owner_workspace_member_id || undefined,
    title: row.title,
    description: row.description || undefined,
    deviceType: row.device_type as RelayDeviceSummaryView["deviceType"],
    platform: row.platform || undefined,
    publicKeyFingerprint: row.public_key_fingerprint,
    trustStatus: row.trust_status,
    isConnected: Boolean(row.is_connected),
    workspaceConversationTypeMask,
    conversationTypeMaskOverride: row.conversation_type_mask_override ?? null,
    effectiveConversationTypeMask,
    exposureCount: parseCount(row.exposure_count),
    healthyExposureCount: parseCount(row.healthy_exposure_count),
    degradedExposureCount: parseCount(row.degraded_exposure_count),
    failedExposureCount: parseCount(row.failed_exposure_count),
    offlineExposureCount: parseCount(row.offline_exposure_count),
    toolCount: parseCount(row.tool_count),
    syncSourceCount: parseCount(row.sync_source_count),
    lastSeenAt: row.last_seen_at || undefined,
    lastConnectedAt: row.last_connected_at || undefined,
    lastCatalogChangedAt: row.last_catalog_changed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRelayPairingSession(row: RelayPairingRow): RelayPairingSessionView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requestedByWorkspaceMemberId:
      row.requested_by_workspace_member_id || undefined,
    deviceId: row.device_id || undefined,
    serverBaseUrl: row.server_base_url,
    requestedDisplayName: row.requested_title || undefined,
    pairingCode: row.pairing_code,
    verificationUri: row.verification_uri,
    verificationUriComplete: row.verification_uri_complete || undefined,
    status: row.status,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at || undefined,
    consumedAt: row.consumed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRelaySyncSource(row: RelaySyncSourceRow): RelaySyncSourceView {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceKey: row.source_key,
    configPath: row.config_path || undefined,
    syncMode: normalizeRelaySyncMode(row.sync_mode),
    status: row.status,
    lastSyncedAt: row.last_synced_at || undefined,
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRelayTool(row: RelayExposureToolRow): RelayToolView | null {
  if (
    !row.tool_id ||
    !row.tool_stable_key ||
    !row.tool_current_name ||
    !row.tool_status ||
    !row.tool_created_at ||
    !row.tool_updated_at
  ) {
    return null
  }

  return {
    id: row.tool_id,
    stableKey: row.tool_stable_key,
    currentName: row.tool_current_name,
    status: row.tool_status,
    latestRevisionId: row.tool_revision_id || undefined,
    catalogRevisionId: row.catalog_revision_id || undefined,
    catalogRevisionSeq:
      row.catalog_revision_seq === null
        ? undefined
        : parseCount(row.catalog_revision_seq),
    description: row.tool_description || "",
    inputSchema: parseJsonObject(row.tool_input_schema),
    annotations: parseJsonObject(row.tool_annotations),
    definitionHash: row.tool_definition_hash || undefined,
    lastSeenAt: row.tool_last_seen_at || undefined,
    createdAt: row.tool_created_at,
    updatedAt: row.tool_updated_at,
  }
}

function mapInlineSyncSource(
  row: RelayExposureToolRow
): RelaySyncSourceView | undefined {
  if (
    !row.sync_source_id ||
    !row.sync_source_kind ||
    !row.sync_source_key ||
    !row.sync_source_sync_mode ||
    !row.sync_source_status ||
    !row.sync_source_created_at ||
    !row.sync_source_updated_at
  ) {
    return undefined
  }

  return {
    id: row.sync_source_id,
    sourceKind: row.sync_source_kind,
    sourceKey: row.sync_source_key,
    configPath: row.sync_source_config_path || undefined,
    syncMode: normalizeRelaySyncMode(row.sync_source_sync_mode),
    status: row.sync_source_status,
    lastSyncedAt: row.sync_source_last_synced_at || undefined,
    lastError: row.sync_source_last_error || undefined,
    createdAt: row.sync_source_created_at,
    updatedAt: row.sync_source_updated_at,
  }
}

function groupRelayExposures(
  rows: RelayExposureToolRow[],
  workspaceConversationTypeMask: number,
  parentConversationTypeMask: number
): RelayExposureView[] {
  const exposures = new Map<string, RelayExposureView>()

  for (const row of rows) {
    let exposure = exposures.get(row.exposure_id)
    if (!exposure) {
      exposure = {
        capabilityId: row.capability_id,
        id: row.exposure_id,
        stableKey: row.exposure_stable_key,
        displayName: row.exposure_display_name,
        description: row.exposure_description || undefined,
        transport: row.exposure_transport,
        runtimeStatus: row.exposure_runtime_status,
        workspaceConversationTypeMask,
        parentConversationTypeMask,
        parentPolicyLabel: "device",
        conversationTypeMaskOverride:
          row.capability_conversation_type_mask_override ?? null,
        effectiveConversationTypeMask:
          resolveRelayCapabilityConversationTypeMask(
            parentConversationTypeMask,
            row.capability_conversation_type_mask_override
          ),
        lastSeenAt: row.exposure_last_seen_at || undefined,
        lastHealthyAt: row.exposure_last_healthy_at || undefined,
        lastError: row.exposure_last_error || undefined,
        metadata: parseJsonObject(row.exposure_metadata),
        syncSource: mapInlineSyncSource(row),
        tools: [],
        createdAt: row.exposure_created_at,
        updatedAt: row.exposure_updated_at,
      }
      exposures.set(row.exposure_id, exposure)
    }
    const tool = mapRelayTool(row)
    if (tool && exposure) {
      exposure.tools.push(tool)
    }
  }

  return [...exposures.values()]
}

function normalizeRelaySyncMode(
  value: unknown
): RelaySyncSourceView["syncMode"] {
  switch (value) {
    case "snapshot":
    case "import_only":
    case "detached":
      return "snapshot"
    case "follow":
    case "observe":
    case "mirror":
    case "managed":
    default:
      return "follow"
  }
}

function createNotFoundError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

function generatePairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  const bytes = crypto.randomBytes(12)
  for (let index = 0; index < 12; index += 1) {
    code += alphabet[bytes[index] % alphabet.length]
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}

function normalizePairingCode(code: string) {
  return code.trim().toUpperCase()
}

function parseReleaseVersion(value: string): ReleaseVersion | null {
  const normalized = value.trim().replace(/^v/i, "").split("+")[0] || ""
  if (!normalized) return null

  const [core, prerelease = ""] = normalized.split("-", 2)
  const parts = core.split(".")
  if (parts.length !== 3) return null

  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  if (
    ![major, minor, patch].every((part) => Number.isInteger(part) && part >= 0)
  ) {
    return null
  }

  return { major, minor, patch, prerelease }
}

function compareReleaseVersions(left: string, right: string) {
  const leftVersion = parseReleaseVersion(left)
  const rightVersion = parseReleaseVersion(right)
  if (!leftVersion || !rightVersion) {
    return left.localeCompare(right)
  }

  if (leftVersion.major !== rightVersion.major)
    return leftVersion.major - rightVersion.major
  if (leftVersion.minor !== rightVersion.minor)
    return leftVersion.minor - rightVersion.minor
  if (leftVersion.patch !== rightVersion.patch)
    return leftVersion.patch - rightVersion.patch
  if (leftVersion.prerelease === rightVersion.prerelease) return 0
  if (!leftVersion.prerelease) return 1
  if (!rightVersion.prerelease) return -1
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease)
}

function normalizeRelayDesktopCommit(value: string) {
  const trimmed = value.trim()
  if (!relayDesktopCommitPattern.test(trimmed)) {
    return ""
  }
  return trimmed.toLowerCase()
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}

function resolveRelayDesktopUpdateFromCos(
  channel: string,
  platform: string,
  arch: string
): RelayDesktopReleaseView | null {
  const baseUrl = config.relay.updateCosBaseUrl.trim()
  const latestCommit = normalizeRelayDesktopCommit(
    config.relay.updateLatestCommit
  )
  if (!baseUrl || !latestCommit) {
    return null
  }

  const artifactName =
    relayDesktopArtifactFilenames[
      `${platform.toLowerCase()}/${arch.toLowerCase()}`
    ]
  if (!artifactName) {
    return null
  }

  try {
    const downloadUrl = new URL(
      `${latestCommit}/${artifactName}`,
      ensureTrailingSlash(baseUrl)
    ).toString()

    return {
      channel,
      platform: platform.toLowerCase(),
      arch: arch.toLowerCase(),
      version: `dev-${latestCommit.slice(0, 8)}`,
      downloadUrl,
    }
  } catch (error) {
    console.error(
      "[Relay Controller] Invalid relay COS update configuration",
      error
    )
    return null
  }
}

function resolveRelayDesktopUpdate(
  serverBaseUrl: string,
  channel: string,
  platform: string,
  arch: string
): RelayDesktopReleaseView | null {
  const cosRelease = resolveRelayDesktopUpdateFromCos(channel, platform, arch)
  if (cosRelease) {
    return cosRelease
  }

  const releasesJson = process.env.RELAY_DESKTOP_RELEASES_JSON
  if (!releasesJson) return null

  try {
    const parsed = z
      .array(relayDesktopReleaseSchema)
      .parse(JSON.parse(releasesJson))

    const match = parsed
      .filter(
        (release) =>
          release.channel.toLowerCase() === channel.toLowerCase() &&
          release.platform.toLowerCase() === platform.toLowerCase() &&
          release.arch.toLowerCase() === arch.toLowerCase()
      )
      .sort((left, right) =>
        compareReleaseVersions(right.version, left.version)
      )[0]

    if (!match) return null

    return {
      channel: match.channel,
      platform: match.platform,
      arch: match.arch,
      version: match.version,
      downloadUrl: new URL(match.downloadUrl, `${serverBaseUrl}/`).toString(),
      sha256: match.sha256,
      notes: match.notes,
      publishedAt: match.publishedAt,
    }
  } catch (error) {
    console.error(
      "[Relay Controller] Invalid RELAY_DESKTOP_RELEASES_JSON",
      error
    )
    return null
  }
}

function resolveServerBaseUrl(request: FastifyRequest) {
  const protoHeader = request.headers["x-forwarded-proto"]
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host
  const proto =
    typeof protoHeader === "string"
      ? protoHeader.split(",")[0]
      : request.protocol || "http"
  const host =
    typeof hostHeader === "string" ? hostHeader.split(",")[0] : "localhost:3000"
  return `${proto}://${host}`
}

function buildVerificationUri(serverBaseUrl: string, pairingId: string) {
  const url = new URL("/dashboard/plugins", `${serverBaseUrl}/`)
  url.searchParams.set("relayPairing", pairingId)
  return url.toString()
}

function buildVerificationUriComplete(
  serverBaseUrl: string,
  pairingId: string,
  pairingCode: string
) {
  const url = new URL("/dashboard/plugins", `${serverBaseUrl}/`)
  url.searchParams.set("relayPairing", pairingId)
  url.searchParams.set("code", pairingCode)
  return url.toString()
}

function buildRelayWebSocketUrl(serverBaseUrl: string) {
  const url = new URL(serverBaseUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/ws/relay"
  url.search = ""
  url.hash = ""
  return url.toString()
}

async function expireRelayPairings(workspaceId?: string) {
  if (workspaceId) {
    await executeSql(
      `UPDATE relay_pairing_sessions
       SET status = 'expired',
           updated_at = NOW()
       WHERE workspace_id = $1
         AND status IN ('pending', 'confirmed')
         AND expires_at <= NOW()`,
      [workspaceId]
    )
    return
  }

  await executeSql(
    `UPDATE relay_pairing_sessions
     SET status = 'expired',
         updated_at = NOW()
     WHERE status IN ('pending', 'confirmed')
       AND expires_at <= NOW()`
  )
}

async function listRelayDeviceSummaries(workspaceId: string) {
  const workspaceConversationTypeMask =
    await getWorkspaceCapabilityConversationTypeMask(
      workspaceId,
      "relay_capability"
    )
  const result = await executeSql<RelayDeviceSummaryRow>(
    `SELECT
        d.id,
        d.workspace_id,
        d.owner_workspace_member_id,
        d.title,
        d.description,
        d.device_type,
        d.platform,
        d.conversation_type_mask_override,
        d.public_key_fingerprint,
        d.trust_status,
        d.last_seen_at,
        d.last_connected_at,
        d.last_catalog_changed_at,
        d.created_at,
        d.updated_at,
        COALESCE(session_stats.is_connected, FALSE) AS is_connected,
        COALESCE(exposure_stats.exposure_count, 0) AS exposure_count,
        COALESCE(exposure_stats.healthy_exposure_count, 0) AS healthy_exposure_count,
        COALESCE(exposure_stats.degraded_exposure_count, 0) AS degraded_exposure_count,
        COALESCE(exposure_stats.failed_exposure_count, 0) AS failed_exposure_count,
        COALESCE(exposure_stats.offline_exposure_count, 0) AS offline_exposure_count,
        COALESCE(exposure_stats.tool_count, 0) AS tool_count,
        COALESCE(sync_stats.sync_source_count, 0) AS sync_source_count
     FROM relay_devices d
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS exposure_count,
         COUNT(*) FILTER (WHERE runtime_status = 'healthy') AS healthy_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status = 'degraded') AS degraded_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status IN ('failed', 'quarantined')) AS failed_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status IN ('offline', 'discovered', 'starting')) AS offline_exposure_count,
         COALESCE(SUM(tool_count), 0) AS tool_count
       FROM (
         SELECT
           e.id,
           e.runtime_status,
           (
             SELECT COUNT(*)
             FROM relay_tools t
             WHERE t.exposure_id = e.id
               AND t.status = 'active'
           ) AS tool_count
         FROM relay_exposures e
         WHERE e.device_id = d.id
       ) exposure_rows
     ) exposure_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS sync_source_count
       FROM relay_sync_sources source
       WHERE source.device_id = d.id
     ) sync_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT EXISTS (
         SELECT 1
         FROM relay_device_sessions session_row
         WHERE session_row.device_id = d.id
           AND session_row.status = 'active'
       ) AS is_connected
     ) session_stats ON TRUE
     WHERE d.workspace_id = $1
     ORDER BY d.created_at DESC`,
    [workspaceId]
  )

  return result.rows.map((row) =>
    mapRelayDeviceSummary(row, workspaceConversationTypeMask)
  )
}

async function listPendingRelayPairings(workspaceId: string) {
  const result = await executeSql<RelayPairingRow>(
    `SELECT *
     FROM relay_pairing_sessions
     WHERE workspace_id = $1
       AND status IN ('pending', 'confirmed')
     ORDER BY created_at DESC`,
    [workspaceId]
  )
  return result.rows.map(mapRelayPairingSession)
}

async function getRelayDeviceSummary(workspaceId: string, deviceId: string) {
  const workspaceConversationTypeMask =
    await getWorkspaceCapabilityConversationTypeMask(
      workspaceId,
      "relay_capability"
    )
  const result = await executeSql<RelayDeviceSummaryRow>(
    `SELECT
        d.id,
        d.workspace_id,
        d.owner_workspace_member_id,
        d.title,
        d.description,
        d.device_type,
        d.platform,
        d.conversation_type_mask_override,
        d.public_key_fingerprint,
        d.trust_status,
        d.last_seen_at,
        d.last_connected_at,
        d.last_catalog_changed_at,
        d.created_at,
        d.updated_at,
        COALESCE(session_stats.is_connected, FALSE) AS is_connected,
        COALESCE(exposure_stats.exposure_count, 0) AS exposure_count,
        COALESCE(exposure_stats.healthy_exposure_count, 0) AS healthy_exposure_count,
        COALESCE(exposure_stats.degraded_exposure_count, 0) AS degraded_exposure_count,
        COALESCE(exposure_stats.failed_exposure_count, 0) AS failed_exposure_count,
        COALESCE(exposure_stats.offline_exposure_count, 0) AS offline_exposure_count,
        COALESCE(exposure_stats.tool_count, 0) AS tool_count,
        COALESCE(sync_stats.sync_source_count, 0) AS sync_source_count
     FROM relay_devices d
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS exposure_count,
         COUNT(*) FILTER (WHERE runtime_status = 'healthy') AS healthy_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status = 'degraded') AS degraded_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status IN ('failed', 'quarantined')) AS failed_exposure_count,
         COUNT(*) FILTER (WHERE runtime_status IN ('offline', 'discovered', 'starting')) AS offline_exposure_count,
         COALESCE(SUM(tool_count), 0) AS tool_count
       FROM (
         SELECT
           e.id,
           e.runtime_status,
           (
             SELECT COUNT(*)
             FROM relay_tools t
             WHERE t.exposure_id = e.id
               AND t.status = 'active'
           ) AS tool_count
         FROM relay_exposures e
         WHERE e.device_id = d.id
       ) exposure_rows
     ) exposure_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS sync_source_count
       FROM relay_sync_sources source
       WHERE source.device_id = d.id
     ) sync_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT EXISTS (
         SELECT 1
         FROM relay_device_sessions session_row
         WHERE session_row.device_id = d.id
           AND session_row.status = 'active'
       ) AS is_connected
     ) session_stats ON TRUE
     WHERE d.workspace_id = $1
       AND d.id = $2
     LIMIT 1`,
    [workspaceId, deviceId]
  )

  if (result.rows.length === 0) {
    throw createNotFoundError(
      "RELAY_DEVICE_NOT_FOUND",
      "Relay device not found"
    )
  }

  return mapRelayDeviceSummary(result.rows[0], workspaceConversationTypeMask)
}

async function getRelayPairingSession(workspaceId: string, pairingId: string) {
  const result = await executeSql<RelayPairingRow>(
    `SELECT *
     FROM relay_pairing_sessions
     WHERE id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [pairingId, workspaceId]
  )

  if (result.rows.length === 0) {
    throw createNotFoundError(
      "RELAY_PAIRING_NOT_FOUND",
      "Relay pairing session not found"
    )
  }

  return mapRelayPairingSession(result.rows[0])
}

async function assertRelayExposureInWorkspaceDevice(
  workspaceId: string,
  deviceId: string,
  exposureId: string
) {
  const result = await executeSql<{ id: string }>(
    `SELECT e.id
     FROM relay_exposures e
     INNER JOIN relay_devices d
       ON d.id = e.device_id
     WHERE e.id = $1
       AND e.device_id = $2
       AND d.workspace_id = $3
     LIMIT 1`,
    [exposureId, deviceId, workspaceId]
  )

  if (result.rows.length === 0) {
    throw createNotFoundError(
      "RELAY_EXPOSURE_NOT_FOUND",
      "Relay exposure not found"
    )
  }
}

function mapRelayAuthorizationGrantView(
  record: RelayAuthorizationGrantRecord
): RelayAuthorizationGrantView {
  return {
    id: record.id,
    capability: record.capability,
    filesystem: record.filesystem,
    cua: record.cua,
    browser: record.browser,
    commandline: record.commandline,
    workspaceId: record.workspaceId,
    deviceId: record.relayDeviceId,
    relayCapabilityId: record.relayCapabilityId,
    exposureId: record.relayExposureId,
    conversationId: record.conversationId,
    actorId: record.actorId,
    scope: record.scope,
    retention: record.retention,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    consumedAt: record.consumedAt,
    revokedAt: record.revokedAt,
  }
}

async function buildRelayDeviceDetail(
  workspaceId: string,
  deviceId: string
): Promise<RelayDeviceDetailView> {
  const [device, pairingsResult, syncSourcesResult, exposuresResult] =
    await Promise.all([
      getRelayDeviceSummary(workspaceId, deviceId),
      executeSql<RelayPairingRow>(
        `SELECT *
       FROM relay_pairing_sessions
       WHERE workspace_id = $1
         AND device_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
        [workspaceId, deviceId]
      ),
      executeSql<RelaySyncSourceRow>(
        `SELECT *
       FROM relay_sync_sources
       WHERE device_id = $1
       ORDER BY created_at DESC`,
        [deviceId]
      ),
      executeSql<RelayExposureToolRow>(
        `SELECT
          e.id AS exposure_id,
          capability.id AS capability_id,
          e.stable_key AS exposure_stable_key,
          e.display_name AS exposure_display_name,
          e.description AS exposure_description,
          e.transport AS exposure_transport,
          e.runtime_status AS exposure_runtime_status,
          capability.conversation_type_mask_override AS capability_conversation_type_mask_override,
          e.last_seen_at AS exposure_last_seen_at,
          e.last_healthy_at AS exposure_last_healthy_at,
          e.last_error AS exposure_last_error,
          e.metadata AS exposure_metadata,
          e.created_at AS exposure_created_at,
          e.updated_at AS exposure_updated_at,
          source.id AS sync_source_id,
          source.source_kind AS sync_source_kind,
          source.source_key AS sync_source_key,
          source.config_path AS sync_source_config_path,
          source.sync_mode AS sync_source_sync_mode,
          source.status AS sync_source_status,
          source.last_synced_at AS sync_source_last_synced_at,
          source.last_error AS sync_source_last_error,
          source.created_at AS sync_source_created_at,
          source.updated_at AS sync_source_updated_at,
          t.id AS tool_id,
          t.stable_key AS tool_stable_key,
          t.current_name AS tool_current_name,
          t.status AS tool_status,
          t.last_seen_at AS tool_last_seen_at,
          t.created_at AS tool_created_at,
          t.updated_at AS tool_updated_at,
          tr.id AS tool_revision_id,
          tr.catalog_revision_id AS catalog_revision_id,
          cr.revision_seq AS catalog_revision_seq,
          tr.description AS tool_description,
          tr.input_schema AS tool_input_schema,
          tr.annotations AS tool_annotations,
          tr.definition_hash AS tool_definition_hash
       FROM relay_exposures e
       LEFT JOIN relay_capabilities capability
         ON capability.exposure_id = e.id
       LEFT JOIN relay_sync_sources source
         ON source.id = e.sync_source_id
       LEFT JOIN relay_tools t
         ON t.exposure_id = e.id
       LEFT JOIN relay_tool_revisions tr
         ON tr.id = t.latest_revision_id
       LEFT JOIN relay_catalog_revisions cr
         ON cr.id = tr.catalog_revision_id
       WHERE e.device_id = $1
      ORDER BY e.display_name ASC, t.current_name ASC NULLS LAST`,
        [deviceId]
      ),
    ])

  return {
    device,
    pairings: pairingsResult.rows.map(mapRelayPairingSession),
    syncSources: syncSourcesResult.rows.map(mapRelaySyncSource),
    exposures: groupRelayExposures(
      exposuresResult.rows,
      device.workspaceConversationTypeMask,
      device.effectiveConversationTypeMask
    ),
  }
}

async function createRelayPairingSession(params: {
  workspaceId: string
  requestedByWorkspaceMemberId: string
  serverBaseUrl: string
  title?: string
}) {
  const expiresAt = new Date(Date.now() + RELAY_PAIRING_TTL_MS).toISOString()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pairingCode = generatePairingCode()

    try {
      const result = await executeSql<RelayPairingRow>(
        `INSERT INTO relay_pairing_sessions (
           workspace_id,
           requested_by_workspace_member_id,
           server_base_url,
           requested_title,
           pairing_code,
           verification_uri,
           verification_uri_complete,
           expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          params.workspaceId,
          params.requestedByWorkspaceMemberId,
          params.serverBaseUrl,
          params.title || null,
          pairingCode,
          buildVerificationUri(params.serverBaseUrl, "pending"),
          buildVerificationUriComplete(
            params.serverBaseUrl,
            "pending",
            pairingCode
          ),
          expiresAt,
        ]
      )

      const inserted = result.rows[0]
      const verificationUri = buildVerificationUri(
        params.serverBaseUrl,
        inserted.id
      )
      const verificationUriComplete = buildVerificationUriComplete(
        params.serverBaseUrl,
        inserted.id,
        pairingCode
      )

      const updated = await executeSql<RelayPairingRow>(
        `UPDATE relay_pairing_sessions
         SET verification_uri = $2,
             verification_uri_complete = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [inserted.id, verificationUri, verificationUriComplete]
      )

      return mapRelayPairingSession(updated.rows[0])
    } catch (error: any) {
      if (error?.code === "23505") {
        continue
      }
      throw error
    }
  }

  throw new Error("Unable to allocate a unique relay pairing code")
}

async function ensureRelayLifecycleAutomationSourcesForDeviceTx(
  runQuery: (text: string, params?: any[]) => Promise<{ rows: any[] }>,
  params: { workspaceId: string; deviceId: string; displayName: string }
) {
  for (const definition of relayLifecycleEventDefinitions) {
    const source = definition.buildSource({
      providerRef: params.deviceId,
      providerLabel: params.displayName,
    })
    const existing = (await runQuery(
      `SELECT id
       FROM automation_event_sources
       WHERE workspace_id = $1
         AND provider_kind = 'relay'
         AND provider_ref = $2
         AND source_key = $3
       LIMIT 1`,
      [params.workspaceId, params.deviceId, source.sourceKey]
    )) as { rows: Array<{ id: string }> }

    if (existing.rows[0]) {
      await runQuery(
        `UPDATE automation_event_sources
         SET name = $2,
             description = $3,
             recommended_usage = $4,
             payload_schema = $5,
             example_payload = $6,
             status = 'active',
             metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          existing.rows[0].id,
          source.name,
          source.description,
          source.recommendedUsage || "",
          JSON.stringify(source.payloadSchema),
          JSON.stringify(source.examplePayload),
          JSON.stringify(source.metadata || {}),
        ]
      )
      continue
    }

    await runQuery(
      `INSERT INTO automation_event_sources (
         workspace_id,
         provider_kind,
         provider_ref,
         source_key,
         name,
         description,
         recommended_usage,
         payload_schema,
         example_payload,
         status,
         created_by_kind,
         metadata
       )
       VALUES ($1, 'relay', $2, $3, $4, $5, $6, $7, $8, 'active', 'system', $9)`,
      [
        params.workspaceId,
        params.deviceId,
        source.sourceKey,
        source.name,
        source.description,
        source.recommendedUsage || "",
        JSON.stringify(source.payloadSchema),
        JSON.stringify(source.examplePayload),
        JSON.stringify(source.metadata || {}),
      ]
    )
  }
}

async function claimRelayPairingSession(
  input: z.infer<typeof claimPairingSchema>
) {
  return transaction(async (client) => {
    await executeSqlOn(
      client,
      `UPDATE relay_pairing_sessions
       SET status = 'expired',
           updated_at = NOW()
       WHERE status IN ('pending', 'confirmed')
         AND expires_at <= NOW()`
    )

    const pairingResult = await executeSqlOn<RelayPairingRow>(
      client,
      `SELECT *
       FROM relay_pairing_sessions
       WHERE pairing_code = $1
       FOR UPDATE`,
      [normalizePairingCode(input.pairingCode)]
    )

    if (pairingResult.rows.length === 0) {
      throw createNotFoundError(
        "RELAY_PAIRING_NOT_FOUND",
        "Relay pairing session not found"
      )
    }

    const pairing = pairingResult.rows[0]
    if (pairing.status === "expired") {
      throw createNotFoundError(
        "RELAY_PAIRING_EXPIRED",
        "Relay pairing session expired"
      )
    }
    if (pairing.status !== "pending" && pairing.status !== "confirmed") {
      const error = new Error(
        `Relay pairing session is already ${pairing.status}`
      ) as Error & { code: string }
      error.code = "RELAY_PAIRING_INVALID"
      throw error
    }
    if (new Date(pairing.expires_at).getTime() <= Date.now()) {
      await executeSqlOn(
        client,
        `UPDATE relay_pairing_sessions
         SET status = 'expired',
             updated_at = NOW()
         WHERE id = $1`,
        [pairing.id]
      )
      throw createNotFoundError(
        "RELAY_PAIRING_EXPIRED",
        "Relay pairing session expired"
      )
    }

    let computedFingerprint: string
    try {
      computedFingerprint = computeRelayPublicKeyFingerprint(input.publicKey)
    } catch {
      const error = new Error("Relay device public key is invalid") as Error & {
        code: string
      }
      error.code = "RELAY_DEVICE_PUBLIC_KEY_INVALID"
      throw error
    }
    if (computedFingerprint !== input.publicKeyFingerprint) {
      const error = new Error(
        "Relay device fingerprint does not match the supplied public key"
      ) as Error & { code: string }
      error.code = "RELAY_DEVICE_FINGERPRINT_MISMATCH"
      throw error
    }

    const existingFingerprint = await executeSqlOn(
      client,
      `SELECT id
       FROM relay_devices
       WHERE public_key_fingerprint = $1
       LIMIT 1`,
      [computedFingerprint]
    )
    if (existingFingerprint.rows.length > 0) {
      const error = new Error("Relay device fingerprint conflict") as Error & {
        code: string
      }
      error.code = "RELAY_DEVICE_FINGERPRINT_CONFLICT"
      throw error
    }

    const deviceResult = await executeSqlOn(
      client,
      `INSERT INTO relay_devices (
         workspace_id,
         owner_workspace_member_id,
         title,
         description,
         device_type,
         platform,
         public_key,
         public_key_fingerprint,
         trust_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id, workspace_id, title`,
      [
        pairing.workspace_id,
        pairing.requested_by_workspace_member_id,
        input.title || pairing.requested_title || "Relay Device",
        input.description || pairing.requested_description || null,
        input.deviceType || pairing.requested_device_type || "desktop_computer",
        input.platform || null,
        input.publicKey,
        computedFingerprint,
      ]
    )

    const device = deviceResult.rows[0]
    await executeSqlOn(
      client,
      `UPDATE relay_pairing_sessions
       SET device_id = $2,
           confirmed_at = NOW(),
           consumed_at = NOW(),
           status = 'consumed',
           updated_at = NOW()
       WHERE id = $1`,
      [pairing.id, device.id]
    )

    await ensureRelayLifecycleAutomationSourcesForDeviceTx(
      clientRunner(client),
      {
        workspaceId: device.workspace_id as string,
        deviceId: device.id as string,
        displayName: device.title as string,
      }
    )

    return {
      deviceId: device.id as string,
      workspaceId: device.workspace_id as string,
      ownerWorkspaceMemberId:
        pairing.requested_by_workspace_member_id || undefined,
      title: device.title as string,
      serverBaseUrl: pairing.server_base_url,
      websocketUrl: buildRelayWebSocketUrl(pairing.server_base_url),
    }
  })
}

function computeRelayPublicKeyFingerprint(publicKeyPem: string) {
  const publicKey = crypto.createPublicKey(publicKeyPem)
  const spkiDer = publicKey.export({ type: "spki", format: "der" })
  return crypto.createHash("sha256").update(spkiDer).digest("hex")
}

export function registerRelayRoutes(app: FastifyInstance) {
  const workspacePreHandler = [authMiddleware, workspaceMiddleware]

  app.get("/api/v1/mcp/relay/updates/latest", async (request, reply) => {
    try {
      const queryParams = relayDesktopUpdateQuerySchema.parse(
        request.query ?? {}
      )
      const release = resolveRelayDesktopUpdate(
        resolveServerBaseUrl(request),
        queryParams.channel,
        queryParams.platform,
        queryParams.arch
      )

      if (!release) {
        reply.status(204).send()
        return
      }

      reply.send(release)
    } catch (error) {
      handleError(reply, error)
    }
  })

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/relays",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.view",
          "Not allowed to access relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as WorkspaceParams
        await expireRelayPairings(workspaceId)

        const response: RelayDashboardView = {
          devices: await listRelayDeviceSummaries(workspaceId),
          pendingPairings: await listPendingRelayPairings(workspaceId),
        }
        reply.send(response)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/pairing-sessions",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as WorkspaceParams
        const body = createPairingSchema.parse(request.body)
        const userId = request.user.userId as string
        const workspaceMemberId = request.workspaceMember?.id as
          | string
          | undefined
        if (!workspaceMemberId) {
          reply.status(403).send({ error: "Workspace member not found" })
          return
        }
        const pairing = await createRelayPairingSession({
          workspaceId,
          requestedByWorkspaceMemberId: workspaceMemberId,
          serverBaseUrl: resolveServerBaseUrl(request),
          title: body.title,
        })

        logEvent({
          workspaceId,
          userId,
          eventType: "relay.pairing.created",
          eventData: {
            pairingId: pairing.id,
            requestedTitle: pairing.requestedDisplayName,
          },
        })

        reply.status(201).send({ pairing })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/relays/pairing-sessions/:pairingId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.view",
          "Not allowed to access relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, pairingId } = request.params as PairingParams
        await expireRelayPairings(workspaceId)
        const pairing = await getRelayPairingSession(workspaceId, pairingId)
        reply.send({ pairing })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/pairing-sessions/:pairingId/cancel",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, pairingId } = request.params as PairingParams
        const result = await executeSql<RelayPairingRow>(
          `UPDATE relay_pairing_sessions
         SET status = 'cancelled',
             updated_at = NOW()
         WHERE id = $1
           AND workspace_id = $2
           AND status IN ('pending', 'confirmed')
         RETURNING *`,
          [pairingId, workspaceId]
        )

        if (result.rows.length === 0) {
          throw createNotFoundError(
            "RELAY_PAIRING_NOT_FOUND",
            "Relay pairing session not found"
          )
        }

        reply.send({ pairing: mapRelayPairingSession(result.rows[0]) })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post("/api/v1/mcp/relay/pairing/claim", async (request, reply) => {
    try {
      const body = claimPairingSchema.parse(request.body)
      const claimed = await claimRelayPairingSession(body)

      logEvent({
        workspaceId: claimed.workspaceId,
        relayId: claimed.deviceId,
        eventType: "relay.pairing.claimed",
        eventData: {
          deviceId: claimed.deviceId,
          title: claimed.title,
        },
      })

      reply.status(201).send({
        deviceId: claimed.deviceId,
        title: claimed.title,
        workspaceId: claimed.workspaceId,
        protocolVersion: RELAY_PROTOCOL_VERSION,
        websocketUrl: claimed.websocketUrl,
        serverBaseUrl: claimed.serverBaseUrl,
      })
    } catch (error) {
      handleError(reply, error)
    }
  })

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.view",
          "Not allowed to access relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id } = request.params as RelayParams
        const detail = await buildRelayDeviceDetail(workspaceId, id)
        reply.send(detail)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/access",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relay exposure access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId } =
          request.params as RelayExposureParams
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        reply.send(await listRelayExposureAccessState(workspaceId, exposureId))
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relay exposure policies in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId } =
          request.params as RelayExposureParams
        const body = updateRelayExposureSchema.parse(request.body || {})
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        await updateRelayExposurePolicy({
          workspaceId,
          exposureId,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
        })
        reply.send(await listRelayExposureAccessState(workspaceId, exposureId))
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/access",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relay exposure access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId } =
          request.params as RelayExposureParams
        const body = accessGrantSchema.parse(request.body)

        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        const grant = await grantRelayExposureAccess({
          workspaceId,
          exposureId,
          accessTarget: body.accessTarget,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
          reason: body.reason,
          grantedByWorkspaceMemberId: request.workspaceMember!.id,
        })

        reply.status(201).send({ grant })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/access/:bindingId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relay exposure access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId, bindingId } =
          request.params as RelayExposureAccessParams
        const body = accessGrantUpdateSchema.parse(request.body || {})
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        const grant = await updateRelayExposureAccessGrant({
          workspaceId,
          exposureId,
          bindingId,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
        })

        reply.send({ grant })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/access/:bindingId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relay exposure access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId, bindingId } =
          request.params as RelayExposureAccessParams
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        await revokeRelayExposureAccess({
          workspaceId,
          exposureId,
          bindingId,
        })
        reply.send({ success: true })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/relay-authorizations",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to view relay authorizations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId } =
          request.params as RelayExposureParams
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        const grants =
          await listActiveRelayAuthorizationGrantsForExposure(exposureId)
        reply.send({ grants: grants.map(mapRelayAuthorizationGrantView) })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/exposures/:exposureId/relay-authorizations/:grantId/revoke",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to revoke relay authorizations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id, exposureId, grantId } =
          request.params as RelayExposureParams & { grantId: string }
        await assertRelayExposureInWorkspaceDevice(workspaceId, id, exposureId)
        const grant = await getRelayAuthorizationGrant(grantId)
        if (
          !grant ||
          grant.workspaceId !== workspaceId ||
          grant.relayExposureId !== exposureId
        ) {
          throw createNotFoundError(
            "RELAY_AUTHORIZATION_GRANT_NOT_FOUND",
            "Relay authorization grant not found"
          )
        }
        await revokeRelayAuthorizationGrant(grantId)
        reply.send({ success: true })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id } = request.params as RelayParams
        const body = updateRelayDeviceSchema.parse(request.body)
        const hasTitle = "title" in body
        const hasDescription = "description" in body
        const hasDeviceType = "deviceType" in body
        const hasConversationTypeMaskOverride =
          "conversationTypeMaskOverride" in body
        if (hasConversationTypeMaskOverride) {
          const workspaceConversationTypeMask =
            await getWorkspaceCapabilityConversationTypeMask(
              workspaceId,
              "relay_capability"
            )
          assertRelayConversationTypeMaskWithinParent(
            workspaceConversationTypeMask,
            body.conversationTypeMaskOverride,
            {
              errorCode: "RELAY_DEVICE_CONVERSATION_POLICY_INVALID",
              errorMessage:
                "Relay device conversation policy must allow at least one workspace conversation type.",
            }
          )
        }

        const result = await executeSql(
          `UPDATE relay_devices
         SET title = CASE WHEN $3 THEN $4 ELSE title END,
             description = CASE WHEN $5 THEN $6 ELSE description END,
             device_type = CASE WHEN $7 THEN $8 ELSE device_type END,
             conversation_type_mask_override = CASE
               WHEN $9 THEN $10
               ELSE conversation_type_mask_override
             END,
             updated_at = NOW()
         WHERE id = $1
           AND workspace_id = $2
         RETURNING id`,
          [
            id,
            workspaceId,
            hasTitle,
            body.title ?? null,
            hasDescription,
            body.description ?? null,
            hasDeviceType,
            body.deviceType ?? null,
            hasConversationTypeMaskOverride,
            body.conversationTypeMaskOverride ?? null,
          ]
        )

        if (result.rows.length === 0) {
          throw createNotFoundError(
            "RELAY_DEVICE_NOT_FOUND",
            "Relay device not found"
          )
        }

        if (hasTitle && body.title) {
          await ensureRelayLifecycleAutomationSourcesForDeviceTx(executeSql, {
            workspaceId,
            deviceId: id,
            displayName: body.title,
          })
        }

        logEvent({
          workspaceId,
          relayId: id,
          eventType: "relay.device.updated",
          eventData: {
            title: body.title,
            updatedFields: [
              hasTitle ? "title" : null,
              hasDescription ? "description" : null,
              hasDeviceType ? "deviceType" : null,
              hasConversationTypeMaskOverride
                ? "conversationTypeMaskOverride"
                : null,
            ].filter(Boolean),
          },
        })

        const detail = await buildRelayDeviceDetail(workspaceId, id)
        reply.send(detail.device)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/disconnect",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id } = request.params as RelayParams
        await getRelayDeviceSummary(workspaceId, id)
        disconnectRelay(id)

        logEvent({
          workspaceId,
          relayId: id,
          eventType: "relay.device.disconnect_requested",
          eventData: { deviceId: id },
        })

        reply.status(204).send()
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id/trust-status",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id } = request.params as RelayParams
        const body = updateRelayTrustSchema.parse(request.body)
        await getRelayDeviceSummary(workspaceId, id)

        const result = await executeSql<RelayDeviceSummaryRow>(
          `UPDATE relay_devices
         SET trust_status = $3,
             updated_at = NOW()
         WHERE id = $1
           AND workspace_id = $2
        RETURNING
           id,
           workspace_id,
           owner_workspace_member_id,
           title,
           description,
           device_type,
           platform,
           conversation_type_mask_override,
           public_key_fingerprint,
           trust_status,
           EXISTS(
             SELECT 1
             FROM relay_device_sessions session_row
             WHERE session_row.device_id = relay_devices.id
               AND session_row.status = 'active'
           ) AS is_connected,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
           ), 0) AS exposure_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
               AND e.runtime_status = 'healthy'
           ), 0) AS healthy_exposure_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
               AND e.runtime_status = 'degraded'
           ), 0) AS degraded_exposure_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
               AND e.runtime_status = 'failed'
           ), 0) AS failed_exposure_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
               AND e.runtime_status = 'offline'
           ), 0) AS offline_exposure_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_tool_lineages t
             JOIN relay_exposures e ON e.id = t.exposure_id
             WHERE e.device_id = relay_devices.id
               AND t.status = 'active'
           ), 0) AS tool_count,
           COALESCE((
             SELECT COUNT(*)
             FROM relay_sync_sources s
             WHERE s.device_id = relay_devices.id
           ), 0) AS sync_source_count,
           (
             SELECT MAX(e.last_seen_at)
             FROM relay_exposures e
             WHERE e.device_id = relay_devices.id
           ) AS last_seen_at,
           (
             SELECT MAX(session_row.started_at)
             FROM relay_device_sessions session_row
             WHERE session_row.device_id = relay_devices.id
           ) AS last_connected_at,
           (
             SELECT MAX(rev.created_at)
             FROM relay_catalog_revisions rev
             WHERE rev.device_id = relay_devices.id
           ) AS last_catalog_changed_at,
           created_at,
           updated_at`,
          [id, workspaceId, body.trustStatus]
        )

        if (result.rows.length === 0) {
          throw createNotFoundError(
            "RELAY_DEVICE_NOT_FOUND",
            "Relay device not found"
          )
        }

        if (body.trustStatus !== "active") {
          disconnectRelay(id)
        }

        logEvent({
          workspaceId,
          relayId: id,
          eventType: "relay.device.trust_status_changed",
          eventData: {
            deviceId: id,
            trustStatus: body.trustStatus,
          },
        })

        reply.send({ device: await getRelayDeviceSummary(workspaceId, id) })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/mcp/relays/:id",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: WorkspaceParams }>,
          reply,
          "workspace.manage_relays",
          "Not allowed to manage relays in this workspace"
        )
        if (!allowed) return

        const { workspaceId, id } = request.params as RelayParams
        const device = await getRelayDeviceSummary(workspaceId, id)
        const exposuresResult = await executeSql<{ id: string }>(
          `SELECT id
         FROM relay_exposures
         WHERE device_id = $1`,
          [id]
        )

        disconnectRelay(id)

        await revokeRelayDeviceAccessState({
          workspaceId,
          deviceId: id,
          ownerWorkspaceMemberId: device.ownerWorkspaceMemberId || null,
          exposureIds: exposuresResult.rows.map((row) => row.id),
        })

        await executeSql(
          `DELETE FROM relay_devices
         WHERE id = $1
           AND workspace_id = $2`,
          [id, workspaceId]
        )

        await incrementMcpVersion(workspaceId)
        emitEvent({
          type: "relay.servers_updated",
          workspaceId,
          payload: { deviceId: id, exposureCount: 0 },
          timestamp: new Date().toISOString(),
        })

        logEvent({
          workspaceId,
          relayId: id,
          eventType: "relay.device.deleted",
          eventData: { deviceId: id },
        })

        reply.status(204).send()
      } catch (error) {
        handleError(reply, error)
      }
    }
  )
}
