import { randomUUID } from "crypto"
import {
  MCP_SERVER_TRANSPORTS,
  pluginToolId,
  toPublicOrigin,
  type McpServerTransport,
  type ToolDefinition,
  type ProjectedToolDefinition,
  type ToolRef,
  type ToolResultOrigin,
} from "@synapse/shared"
import type {
  NormalizedMcpToolResult,
  RuntimeActorContext,
} from "@synapse/shared/types"
import { createLogger } from "../../infrastructure/logger/index.js"
import { resolveInstallationConfig } from "./config-resolver.js"
import {
  getOrCreateInstance,
  type McpExecutionContext,
  type McpInstance,
} from "./instance-manager.js"
import { getMcpVersion } from "./runtime-version.js"
import { normalizeMcpToolResult } from "./result-normalizer.js"
import {
  isPluginInstallationVisible,
  loadVisiblePluginRows,
  type VisiblePluginRow,
} from "./repo.js"

const log = createLogger("mcp.tool-resolver")

/**
 * Routed tool surface returned by the resolver.
 *
 * `tools` carries Layer-A identity (each tool has a mandatory `ref`).
 * `executor` is keyed by the deterministic `toolId` (NOT the wire name) — the
 * surface (chat / reverse-MCP) maps wireName→toolId via its own NameRegistry
 * before invoking. This is what removes the `split("__")` name-parsing.
 */
export interface ResolvedMcpTools {
  tools: ProjectedToolDefinition[]
  executor: (
    toolId: string,
    input: Record<string, unknown>,
    executionContext?: McpExecutionContext
  ) => Promise<NormalizedMcpToolResult>
  mcpVersion: number
  refresh: () => Promise<{
    tools: ProjectedToolDefinition[]
    mcpVersion: number
  }>
  setTurnId: (turnId: string, round?: number) => void
  shutdown: () => Promise<void>
}

/** A plugin tool's per-turn dispatch entry, keyed by its deterministic toolId. */
interface PluginDispatchEntry {
  instance: McpInstance
  upstreamToolName: string
  ref: ToolRef
}

interface ResolveParams extends Omit<RuntimeActorContext, "actorId"> {
  conversationId: string
  // Exactly one of actorId / remoteAgentId is set for a given resolver call.
  // Remote agents pick up workspace-shared resources plus an extra
  // conversation-target grant pass.
  actorId?: string
  remoteAgentId?: string
}

/**
 * Build a plugin ToolRef from an instance + its upstream (bare) tool name.
 * The deterministic toolId (`plugin:<installationId>:<upstreamToolName>`) is the
 * routing key; `binding` carries route-only coordinates (never serialized out).
 */
function buildPluginToolRef(
  instance: McpInstance,
  upstreamToolName: string
): ToolRef {
  const transport: ToolRef["binding"]["transport"] =
    instance.transport === "builtin"
      ? "in_process"
      : (instance.transport as "stdio" | "http" | "sse")
  const binding: ToolRef["binding"] =
    transport === "in_process"
      ? { transport: "in_process" }
      : {
          transport,
          instanceKey: `${instance.installationId}:${instance.configHash}:${instance.scope}:${instance.scopeId}`,
        }
  return {
    toolId: pluginToolId(instance.installationId, upstreamToolName),
    source: {
      kind: "plugin",
      installationId: instance.installationId,
      upstreamToolName,
      // Durable display fields so post-purge audit shows a readable name.
      publisherSlug: instance.orgSlug,
      itemSlug: instance.pluginSlug,
    },
    binding,
    identity: {
      stableKey: `plugin/${instance.orgSlug}/${instance.pluginSlug}/${upstreamToolName}`,
    },
  }
}

function publicReuseScope(scope: VisiblePluginRow["reuseScope"]) {
  return scope || "conversation"
}

function resolveReuseOwnerKey(
  scope: ReturnType<typeof publicReuseScope>,
  params: ResolveParams,
  turnOwnerKey: string
) {
  switch (scope) {
    case "workspace":
      return `workspace:${params.workspaceId}`
    case "conversation":
      return `conversation:${params.conversationId}`
    case "actor":
      // Reuse key follows the principal: real actor for an actor-driven turn,
      // remote_agent for a remote-agent-driven one. Both partition cleanly
      // and never collide because actor IDs and remote_agent IDs come from
      // disjoint tables / UUID space anyway, but the prefix makes audit
      // traces unambiguous.
      return params.actorId
        ? `actor:${params.actorId}`
        : `remote_agent:${params.remoteAgentId ?? "unknown"}`
    case "session":
      return `session:${params.sessionId}`
    case "turn":
      return turnOwnerKey
    default:
      return `conversation:${params.conversationId}`
  }
}

function manifestToolToDefinition(tool: {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}): ToolDefinition {
  const inputSchema = tool.inputSchema as Record<string, unknown> | undefined
  const properties =
    inputSchema &&
    typeof inputSchema === "object" &&
    !Array.isArray(inputSchema)
      ? (inputSchema.properties as Record<string, unknown> | undefined) || {}
      : {}
  const required =
    inputSchema &&
    typeof inputSchema === "object" &&
    !Array.isArray(inputSchema)
      ? (inputSchema.required as string[] | undefined) || []
      : []

  return {
    name: tool.name,
    description: tool.description || "",
    parameters: {
      type: "object",
      properties: properties as ToolDefinition["parameters"]["properties"],
      required,
    },
  }
}

async function resolveTools(
  params: ResolveParams,
  dispatch: Map<string, PluginDispatchEntry>,
  turnOwnerKey: string
) {
  const visiblePlugins = await loadVisiblePluginRows(params)
  const tools: ProjectedToolDefinition[] = []

  for (const plugin of visiblePlugins) {
    if (!plugin.reuseScope) {
      continue
    }

    // Narrow to runtime-startable server transports before forwarding to
    // getOrCreateInstance.
    if (
      !(MCP_SERVER_TRANSPORTS as readonly string[]).includes(plugin.transport)
    ) {
      continue
    }
    const serverTransport = plugin.transport as McpServerTransport

    try {
      const resolved = await resolveInstallationConfig(plugin.installationId)
      const reuseScope = publicReuseScope(plugin.reuseScope)
      const runtimeInstance = await getOrCreateInstance({
        pluginId: plugin.catalogItemId,
        installationId: resolved.installationId,
        pluginSlug: plugin.itemSlug,
        orgSlug: plugin.publisherSlug || "plugin",
        transport: serverTransport,
        entryPoint: plugin.entryPoint || "",
        scope: reuseScope,
        scopeId: resolveReuseOwnerKey(reuseScope, params, turnOwnerKey),
        config: resolved.config,
        workspaceId: plugin.ownerWorkspaceId,
      })

      const upstreamTools =
        runtimeInstance.tools.length > 0
          ? runtimeInstance.tools
          : plugin.toolManifest.map((tool) => manifestToolToDefinition(tool))

      for (const tool of upstreamTools) {
        const ref = buildPluginToolRef(runtimeInstance, tool.name)
        // The plugin attribution that used to be baked into the name now lives
        // on the ref; keep the bracketed description hint for the model.
        const projected: ProjectedToolDefinition = {
          ...tool,
          description: `[${plugin.publisherSlug || "plugin"}/${plugin.itemSlug}] ${tool.description}`,
          ref,
        }
        tools.push(projected)
        dispatch.set(ref.toolId, {
          instance: runtimeInstance,
          upstreamToolName: tool.name,
          ref,
        })
      }
    } catch (error: any) {
      log.error(
        { err: error.message },
        `[MCP ToolResolver] Failed to initialize plugin ${plugin.publisherSlug || "plugin"}/${plugin.itemSlug}`
      )
    }
  }

  return tools
}

export async function resolveMcpToolsForActor(
  params: ResolveParams
): Promise<ResolvedMcpTools> {
  if (!params.actorId) {
    throw new Error(
      "resolveMcpToolsForActor requires actorId; call resolveMcpToolsForRemoteAgent for the remote-agent flow"
    )
  }
  return resolveMcpToolsCommon(params)
}

export async function resolveMcpToolsForRemoteAgent(
  params: Omit<ResolveParams, "actorId"> & {
    remoteAgentId: string
    conversationId: string
  }
): Promise<ResolvedMcpTools> {
  // actorId stays undefined; subject builder + pluginGrantMatchesContext
  // already understand this discriminator and route through the workspace +
  // conversation-target grant paths only.
  return resolveMcpToolsCommon({ ...params, actorId: undefined })
}

async function resolveMcpToolsCommon(
  params: ResolveParams
): Promise<ResolvedMcpTools> {
  const mcpVersion = await getMcpVersion(params.workspaceId)
  const turnOwnerKey = `session:${params.sessionId}:turn:${randomUUID()}`
  const dispatch = new Map<string, PluginDispatchEntry>()
  const allTools = await resolveTools(params, dispatch, turnOwnerKey)

  const setTurnId = (_turnId: string, _round?: number) => {}

  const executor = async (
    toolId: string,
    input: Record<string, unknown>,
    executionContext?: McpExecutionContext
  ): Promise<NormalizedMcpToolResult> => {
    const entry = dispatch.get(toolId)
    if (!entry) {
      throw new Error(`No MCP instance found for toolId ${toolId}`)
    }
    const { instance, upstreamToolName, ref } = entry

    const origin: ToolResultOrigin = toPublicOrigin(ref)

    try {
      if (
        !(await isPluginInstallationVisible(params, instance.installationId))
      ) {
        throw new Error(`Plugin tool ${toolId} is no longer authorized`)
      }
      const rawOutput = await instance.execute(
        upstreamToolName,
        input,
        executionContext
      )
      return await normalizeMcpToolResult(rawOutput, params.workspaceId, {
        origin,
      })
    } catch (error: any) {
      if (error && typeof error === "object" && !error.origin) {
        try {
          error.origin = origin
        } catch {}
      }
      throw error
    }
  }

  const refresh = async () => {
    const nextVersion = await getMcpVersion(params.workspaceId)
    dispatch.clear()
    const refreshedTools = await resolveTools(params, dispatch, turnOwnerKey)
    return {
      tools: refreshedTools,
      mcpVersion: nextVersion,
    }
  }

  const shutdown = async () => {
    const seen = new Set<McpInstance>()
    const turnScopedInstances: McpInstance[] = []
    for (const { instance } of dispatch.values()) {
      if (seen.has(instance)) continue
      seen.add(instance)
      if (instance.scope === "turn" && instance.scopeId === turnOwnerKey) {
        turnScopedInstances.push(instance)
      }
    }
    await Promise.allSettled(
      turnScopedInstances.map((instance) => instance.shutdown())
    )
  }

  return {
    tools: allTools,
    executor,
    mcpVersion,
    refresh,
    setTurnId,
    shutdown,
  }
}
