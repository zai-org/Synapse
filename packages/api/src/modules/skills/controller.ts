import { z } from "zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { CAPABILITY_ACCESS_TARGET_TYPES } from "@synapse/shared/constants"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { PLATFORM_RESOURCE_ID } from "../access/core.js"
import { requireRequestAction } from "../access/guards.js"
import {
  authorizeAction,
  getRequestUserId,
  resolveWorkspaceAccessSubject,
} from "../access/service.js"
import {
  createWorkspaceSkill,
  SkillError,
  getInstalledSkillAccessState,
  getInstalledSkill,
  getMarketplaceSkill,
  grantInstalledSkillAccess,
  importMarketplaceMirrorSkill,
  refreshMarketplaceSkill,
  installMarketplaceSkill,
  listInstalledSkills,
  listMarketplaceSkills,
  publishMarketplaceSkill,
  revokeInstalledSkillAccess,
  uninstallInstalledSkill,
  updateInstalledSkillAccessGrant,
  updateInstalledSkill,
  upgradeInstalledSkill,
} from "./service.js"

const accessTargetTypeSchema = z.enum(CAPABILITY_ACCESS_TARGET_TYPES)
const conversationTypeMaskSchema = z.number().int().min(1).max(31)
const accessTargetSchema = z.object({
  type: accessTargetTypeSchema,
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
})

const skillAttachmentSchema = z.object({
  path: z.string().min(1),
  contentBlocks: z.array(z.any()).default([]),
  mediaType: z.string().min(1).optional(),
})

const publishSkillSchema = z.object({
  skillId: z.string().uuid().optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.any().optional(),
  iconFileId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().min(1),
  changelog: z.string().optional(),
  isActive: z.boolean().optional(),
  defaultConversationTypeMask: conversationTypeMaskSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  attachmentFiles: z.array(skillAttachmentSchema).optional(),
})

const createWorkspaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.any().optional(),
  iconFileId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  attachmentFiles: z.array(skillAttachmentSchema).optional(),
  accessTarget: accessTargetSchema,
})

const installSkillSchema = z.object({
  marketSkillId: z.string().uuid(),
  accessTarget: accessTargetSchema,
})

const importMarketplaceSkillSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("github"),
    repoUrl: z.string().url(),
    path: z.string().min(1),
    ref: z.string().trim().min(1).optional(),
  }),
  z.object({
    sourceType: z.literal("clawhub"),
    ownerId: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1),
    version: z.string().trim().min(1).optional(),
  }),
])

const updateInstalledSkillSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.any().optional(),
  iconFileId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
  attachmentFiles: z.array(skillAttachmentSchema).optional(),
})

const skillAccessGrantSchema = z.object({
  accessTarget: accessTargetSchema.optional(),
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
  reason: z.string().trim().min(1).optional(),
})

const skillAccessGrantUpdateSchema = z.object({
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
})

const listInstalledSkillsQuerySchema = z.object({
  accessTargetType: accessTargetTypeSchema.optional(),
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  sourceSkillId: z.string().uuid().optional(),
})

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof SkillError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Validation failed",
      details: error.errors.map((item) => ({
        field: item.path.join("."),
        message: item.message,
      })),
    })
  }
  throw error
}

async function requirePlatformManage(
  request: FastifyRequest,
  reply: FastifyReply,
  errorMessage: string
) {
  return requireRequestAction(
    request,
    reply,
    "platform.manage",
    PLATFORM_RESOURCE_ID,
    errorMessage
  )
}

async function requireWorkspaceQueryView(
  request: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
  errorMessage: string
) {
  const allowed = await authorizeAction({
    subject: await resolveWorkspaceAccessSubject(
      workspaceId,
      getRequestUserId(request)
    ),
    action: "workspace.view",
    resourceId: workspaceId,
  })

  if (!allowed) {
    reply.status(403).send({ error: errorMessage })
    return false
  }

  return true
}

export function registerSkillRoutes(app: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }
  const workspaceHook = { preHandler: [authMiddleware, workspaceMiddleware] }

  app.get("/api/v1/skills/marketplace", authHook, async (request, reply) => {
    try {
      const { search, tags, workspaceId } = request.query as {
        search?: string
        tags?: string
        workspaceId?: string
      }
      if (workspaceId) {
        const allowed = await requireWorkspaceQueryView(
          request,
          reply,
          workspaceId,
          "Not allowed to view skills for this workspace"
        )
        if (!allowed) return
      }
      const skills = await listMarketplaceSkills({
        search,
        tags: tags
          ? tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
        workspaceId,
      })
      return reply.status(200).send({ skills })
    } catch (error) {
      return handleError(reply, error)
    }
  })

  app.get(
    "/api/v1/skills/marketplace/:skillId",
    authHook,
    async (request, reply) => {
      try {
        const { skillId } = request.params as { skillId: string }
        const { workspaceId } = request.query as { workspaceId?: string }
        if (workspaceId) {
          const allowed = await requireWorkspaceQueryView(
            request,
            reply,
            workspaceId,
            "Not allowed to view skills for this workspace"
          )
          if (!allowed) return
        }
        const skill = await getMarketplaceSkill(skillId, workspaceId)
        return reply.status(200).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post("/api/v1/skills/marketplace", authHook, async (request, reply) => {
    try {
      const allowed = await requirePlatformManage(
        request,
        reply,
        "Not allowed to publish marketplace skills"
      )
      if (!allowed) return

      const body = publishSkillSchema.parse(request.body)
      const user = request.user
      const skill = await publishMarketplaceSkill({
        ...body,
        authorUserId: user?.id || user?.userId,
      })
      return reply.status(201).send({ skill })
    } catch (error) {
      return handleError(reply, error)
    }
  })

  app.post(
    "/api/v1/skills/marketplace/import",
    authHook,
    async (request, reply) => {
      try {
        const allowed = await requirePlatformManage(
          request,
          reply,
          "Not allowed to import marketplace skills"
        )
        if (!allowed) return

        const body = importMarketplaceSkillSchema.parse(request.body)
        const user = request.user
        const skill = await importMarketplaceMirrorSkill({
          ...body,
          authorUserId: user?.id || user?.userId,
        } as any)
        return reply.status(201).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/skills/marketplace/:skillId/refresh",
    authHook,
    async (request, reply) => {
      try {
        const allowed = await requirePlatformManage(
          request,
          reply,
          "Not allowed to refresh marketplace skills"
        )
        if (!allowed) return

        const { skillId } = request.params as { skillId: string }
        const user = request.user
        const skill = await refreshMarketplaceSkill({
          skillId,
          authorUserId: user?.id || user?.userId,
        })
        return reply.status(200).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/skills",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId } = request.params as { workspaceId: string }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.view",
          workspaceId,
          "Not allowed to view installed skills in this workspace"
        )
        if (!allowed) return

        const { accessTargetType, actorId, conversationId, sourceSkillId } =
          listInstalledSkillsQuerySchema.parse(request.query || {}) as z.infer<
            typeof listInstalledSkillsQuerySchema
          >

        const skills = await listInstalledSkills(workspaceId, {
          accessTargetType,
          actorId,
          conversationId,
          sourceSkillId,
        })
        return reply.status(200).send({ skills })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/skills",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId } = request.params as { workspaceId: string }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to install skills in this workspace"
        )
        if (!allowed) return

        const body = installSkillSchema.parse(request.body)
        const workspaceMemberId = request.workspaceMember?.id as string
        const skill = await installMarketplaceSkill({
          workspaceId,
          marketSkillId: body.marketSkillId,
          accessTarget: body.accessTarget,
          installedByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/skills/custom",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId } = request.params as { workspaceId: string }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to create skills in this workspace"
        )
        if (!allowed) return

        const body = createWorkspaceSkillSchema.parse(request.body)
        const workspaceMemberId = request.workspaceMember?.id as string
        const skill = await createWorkspaceSkill({
          workspaceId,
          name: body.name,
          description: body.description,
          iconFileId: body.iconFileId,
          tags: body.tags,
          attachmentFiles: body.attachmentFiles,
          accessTarget: body.accessTarget,
          installedByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.view",
          workspaceId,
          "Not allowed to view installed skill details in this workspace"
        )
        if (!allowed) return

        const skill = await getInstalledSkill(workspaceId, installedSkillId)
        return reply.status(200).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to edit installed skills in this workspace"
        )
        if (!allowed) return

        const body = updateInstalledSkillSchema.parse(request.body)
        const skill = await updateInstalledSkill({
          workspaceId,
          installedSkillId,
          ...body,
        })
        return reply.status(200).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId/upgrade",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to upgrade installed skills in this workspace"
        )
        if (!allowed) return

        const skill = await upgradeInstalledSkill({
          workspaceId,
          installedSkillId,
        })
        return reply.status(200).send({ skill })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to uninstall skills in this workspace"
        )
        if (!allowed) return

        await uninstallInstalledSkill(workspaceId, installedSkillId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId/access",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to manage skill access in this workspace"
        )
        if (!allowed) return

        const state = await getInstalledSkillAccessState(
          workspaceId,
          installedSkillId
        )
        return reply.status(200).send(state)
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId/access",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId } = request.params as {
          workspaceId: string
          installedSkillId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to manage skill access in this workspace"
        )
        if (!allowed) return

        const body = skillAccessGrantSchema.parse(request.body)
        const workspaceMemberId = request.workspaceMember?.id as string
        const grant = await grantInstalledSkillAccess({
          workspaceId,
          installedSkillId,
          accessTarget: body.accessTarget,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
          reason: body.reason,
          grantedByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ grant })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId/access/:grantId",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId, grantId } = request.params as {
          workspaceId: string
          installedSkillId: string
          grantId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to manage skill access in this workspace"
        )
        if (!allowed) return

        const body = skillAccessGrantUpdateSchema.parse(request.body)
        const grant = await updateInstalledSkillAccessGrant({
          workspaceId,
          installedSkillId,
          grantId,
          conversationTypeMaskOverride: body.conversationTypeMaskOverride,
        })
        return reply.status(200).send({ grant })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/skills/:installedSkillId/access/:grantId",
    workspaceHook,
    async (request, reply) => {
      try {
        const { workspaceId, installedSkillId, grantId } = request.params as {
          workspaceId: string
          installedSkillId: string
          grantId: string
        }
        const allowed = await requireRequestAction(
          request,
          reply,
          "workspace.manage_skills",
          workspaceId,
          "Not allowed to manage skill access in this workspace"
        )
        if (!allowed) return

        await revokeInstalledSkillAccess({
          workspaceId,
          installedSkillId,
          grantId,
        })
        return reply.status(200).send({ success: true })
      } catch (error) {
        return handleError(reply, error)
      }
    }
  )
}
