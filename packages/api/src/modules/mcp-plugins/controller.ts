import { z } from "zod"
import type { FastifyInstance, FastifyReply } from "fastify"
import {
  ATTACHMENT_TARGET_TYPES,
  CAPABILITY_ACCESS_TARGET_TYPES,
  REUSE_SCOPES,
} from "@synapse/shared/constants"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  createPluginInstallPlan,
  getInstallation,
  getInstallations,
  getOrganization,
  getPlugin,
  getPluginInstallationAccessState,
  grantPluginInstallationAccess,
  installPluginUnified,
  listOrganizations,
  listPluginCategories,
  listPlugins,
  McpPluginError,
  revokePluginInstallationAccess,
  uninstallPluginUnified,
  updatePluginInstallationAccessGrant,
  updateInstallation,
  validateConfig,
} from "./service.js"
import {
  getPluginAuthSession,
  handlePluginAuthCallback,
  inspectPluginAuthSession,
  PluginAuthError,
  startPluginAuthSession,
} from "./auth-service.js"
import { getEventLogs, getToolCallLogs } from "./audit.js"

const attachmentTargetTypeSchema = z.enum(ATTACHMENT_TARGET_TYPES)
const accessTargetTypeSchema = z.enum(CAPABILITY_ACCESS_TARGET_TYPES)
const lifecycleScopeSchema = z.enum(REUSE_SCOPES)
const conversationTypeMaskSchema = z.number().int().min(1).max(31)
const attachmentTargetSchema = z.object({
  type: attachmentTargetTypeSchema,
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  workspaceMemberId: z.string().uuid().optional(),
})
const accessTargetSchema = z.object({
  type: accessTargetTypeSchema,
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
})

const installSchema = z.object({
  pluginId: z.string().uuid(),
  attachmentTarget: attachmentTargetSchema,
  lifecycleScope: lifecycleScopeSchema.optional(),
  configData: z.record(z.unknown()).optional(),
  authSessionIds: z.record(z.string().uuid()).optional(),
})

const updateInstallSchema = z.object({
  isEnabled: z.boolean().optional(),
  configData: z.record(z.unknown()).optional(),
  lifecycleScope: lifecycleScopeSchema.optional(),
  attachmentTarget: attachmentTargetSchema.optional(),
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
  authSessionIds: z.record(z.string().uuid()).optional(),
})

const installPlanSchema = z.object({
  attachmentTarget: attachmentTargetSchema,
})

const startAuthSchema = z.object({
  installationId: z.string().uuid().optional(),
  draftConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
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

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof McpPluginError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  if (error instanceof PluginAuthError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Validation error",
      details: error.errors,
    })
  }
  console.error("[MCP Controller]", error)
  return reply.status(500).send({ error: "Internal server error" })
}

async function requireWorkspacePermission(
  request: any,
  reply: FastifyReply,
  action: "workspace.view" | "workspace.manage_plugins",
  errorMessage: string
) {
  const { workspaceId } = request.params as { workspaceId: string }
  return requireRequestAction(request, reply, action, workspaceId, errorMessage)
}

export function registerMcpPluginRoutes(app: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }
  const workspaceHook = { preHandler: [authMiddleware, workspaceMiddleware] }

  app.get("/api/v1/mcp/marketplace", authHook, async (request, reply) => {
    try {
      const { search, tags, categories, transport } = request.query as {
        search?: string
        tags?: string
        categories?: string
        transport?: string
      }
      const plugins = await listPlugins({
        search,
        transport,
        tags: tags
          ? tags
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined,
        categorySlugs: categories
          ? categories
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined,
      })
      reply.send(plugins)
    } catch (error) {
      handleError(reply, error)
    }
  })

  app.get("/api/v1/mcp/categories", authHook, async (_request, reply) => {
    try {
      reply.send(await listPluginCategories())
    } catch (error) {
      handleError(reply, error)
    }
  })

  app.get(
    "/api/v1/mcp/marketplace/:pluginId",
    authHook,
    async (request, reply) => {
      try {
        const { pluginId } = request.params as { pluginId: string }
        reply.send(await getPlugin(pluginId))
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get("/api/v1/mcp/organizations", authHook, async (_request, reply) => {
    try {
      reply.send(await listOrganizations())
    } catch (error) {
      handleError(reply, error)
    }
  })

  app.get(
    "/api/v1/mcp/organizations/:orgId",
    authHook,
    async (request, reply) => {
      try {
        const { orgId } = request.params as { orgId: string }
        const org = await getOrganization(orgId)
        const plugins = await listPlugins({ orgId })
        reply.send({ ...org, plugins })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/plugins/:pluginId/install-plan",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, pluginId } = request.params as {
          workspaceId: string
          pluginId: string
        }
        const body = installPlanSchema.parse(request.body)
        const plan = await createPluginInstallPlan({
          workspaceId,
          pluginId,
          attachmentTarget: body.attachmentTarget,
        })
        reply.send({ plan })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/plugins/:pluginId/auth/:bindingKey/start",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, pluginId, bindingKey } = request.params as {
          workspaceId: string
          pluginId: string
          bindingKey: string
        }
        const body = startAuthSchema.parse(request.body || {})
        const workspaceMember = request.workspaceMember
        const result = await startPluginAuthSession({
          workspaceId,
          pluginId,
          installationId: body.installationId,
          bindingKey,
          workspaceMemberId: workspaceMember?.id,
          draftConfig: body.draftConfig,
          metadata: body.metadata,
        })
        reply.send(result)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/auth/sessions/:sessionId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, sessionId } = request.params as {
          workspaceId: string
          sessionId: string
        }
        const workspaceMember = request.workspaceMember
        reply.send({
          session: await getPluginAuthSession(
            sessionId,
            workspaceId,
            workspaceMember?.id
          ),
        })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/auth/sessions/:sessionId/inspect",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, sessionId } = request.params as {
          workspaceId: string
          sessionId: string
        }
        const workspaceMember = request.workspaceMember
        reply.send(
          await inspectPluginAuthSession({
            workspaceId,
            sessionId,
            workspaceMemberId: workspaceMember?.id,
          })
        )
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get("/api/v1/mcp/auth/callback", async (request, reply) => {
    try {
      const {
        state,
        code,
        error,
        error_description: errorDescription,
      } = request.query as {
        state?: string
        code?: string
        error?: string
        error_description?: string
      }
      const session = await handlePluginAuthCallback({
        state,
        code,
        error,
        errorDescription,
      })
      reply
        .type("text/html; charset=utf-8")
        .send(
          `<!doctype html><html><body><script>window.opener&&window.opener.postMessage({type:'synapse:mcp-auth',sessionId:'${session.id}',status:'${session.status}'},'*');window.close&&window.close();</script><p>Authorization ${session.status}. You can close this window.</p></body></html>`
        )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authorization failed"
      reply
        .status(400)
        .type("text/html; charset=utf-8")
        .send(`<!doctype html><html><body><p>${message}</p></body></html>`)
    }
  })

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/installations",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to view plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const {
          attachmentType,
          conversationId,
          actorId,
          workspaceMemberId,
          pluginId,
        } = request.query as {
          attachmentType?:
            | "workspace"
            | "conversation"
            | "actor"
            | "workspace_member"
          conversationId?: string
          actorId?: string
          workspaceMemberId?: string
          pluginId?: string
        }
        reply.send(
          await getInstallations(workspaceId, {
            attachmentType,
            conversationId,
            actorId,
            workspaceMemberId,
            pluginId,
          })
        )
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to view plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId } = request.params as {
          workspaceId: string
          installId: string
        }
        reply.send({
          installation: await getInstallation(workspaceId, installId),
        })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/installations",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const body = installSchema.parse(request.body)

        if (body.configData) {
          const plugin = await getPlugin(body.pluginId)
          const validation = validateConfig(
            body.configData,
            plugin.validation_rules || []
          )
          if (!validation.valid) {
            return reply.status(400).send({
              error: "Validation failed",
              details: validation.errors,
            })
          }
        }

        const installation = await installPluginUnified({
          workspaceId,
          pluginId: body.pluginId,
          attachmentTarget: body.attachmentTarget,
          lifecycleScope: body.lifecycleScope,
          configData: body.configData,
          authSessionIds: body.authSessionIds,
          installedByWorkspaceMemberId: request.workspaceMember!.id,
        })
        reply.status(201).send(installation)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId } = request.params as {
          workspaceId: string
          installId: string
        }
        const body = updateInstallSchema.parse(request.body)

        if (body.configData) {
          const existing = await getInstallation(workspaceId, installId)
          const plugin = await getPlugin(existing.plugin_id)
          const validation = validateConfig(
            body.configData,
            plugin.validation_rules || []
          )
          if (!validation.valid) {
            return reply.status(400).send({
              error: "Validation failed",
              details: validation.errors,
            })
          }
        }

        const installation = await updateInstallation(installId, {
          ...body,
          updatedByWorkspaceMemberId: request.workspaceMember!.id,
        })
        reply.send(installation)
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin installations in this workspace"
        )
        if (!allowed) return

        const { installId } = request.params as { installId: string }
        await uninstallPluginUnified(installId)
        reply.send({ success: true })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId/access",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId } = request.params as {
          workspaceId: string
          installId: string
        }
        reply.send(
          await getPluginInstallationAccessState(workspaceId, installId)
        )
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId/access",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId } = request.params as {
          workspaceId: string
          installId: string
        }
        const body = accessGrantSchema.parse(request.body)

        const grant = await grantPluginInstallationAccess({
          workspaceId,
          installationId: installId,
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
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId/access/:grantId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId, grantId } = request.params as {
          workspaceId: string
          installId: string
          grantId: string
        }
        const body = accessGrantUpdateSchema.parse(request.body)

        const grant = await updatePluginInstallationAccessGrant({
          workspaceId,
          installationId: installId,
          grantId,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
        })

        reply.send({ grant })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/mcp/installations/:installId/access/:grantId",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to manage plugin access in this workspace"
        )
        if (!allowed) return

        const { workspaceId, installId, grantId } = request.params as {
          workspaceId: string
          installId: string
          grantId: string
        }
        await revokePluginInstallationAccess({
          workspaceId,
          installationId: installId,
          grantId,
        })
        reply.send({ success: true })
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/audit/tool-calls",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to view plugin audit logs in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const { pluginId, sessionId, actorId, limit, before } =
          request.query as {
            pluginId?: string
            sessionId?: string
            actorId?: string
            limit?: string
            before?: string
          }
        reply.send(
          await getToolCallLogs(workspaceId, {
            pluginId,
            sessionId,
            actorId,
            limit: limit ? parseInt(limit, 10) : undefined,
            before,
          })
        )
      } catch (error) {
        handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/mcp/audit/events",
    workspaceHook,
    async (request, reply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.manage_plugins",
          "Not allowed to view plugin audit logs in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const { eventType, pluginId, limit, before } = request.query as {
          eventType?: string
          pluginId?: string
          limit?: string
          before?: string
        }
        reply.send(
          await getEventLogs(workspaceId, {
            eventType,
            pluginId,
            limit: limit ? parseInt(limit, 10) : undefined,
            before,
          })
        )
      } catch (error) {
        handleError(reply, error)
      }
    }
  )
}
