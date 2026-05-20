import { z } from "zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  MODEL_GROUP_GRANT_SCOPES,
  MODEL_GROUP_ROUTING_STRATEGIES,
  isKnownModelEngineKind,
  isKnownModelProviderType,
} from "@synapse/shared"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { PLATFORM_RESOURCE_ID } from "../access/core.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  authorizeAction,
  userSubject,
  workspaceMemberSubject,
} from "../access/service.js"
import {
  addModelItem,
  createModelGroup,
  deleteModelGroup,
  deleteModelItem,
  getActorModelGroups,
  getItemVersions,
  getModelGroup,
  isModelGroupAvailableInWorkspace,
  issueModelGroupGrant,
  listModelGroupGrants,
  listPlatformModelGroups,
  listWorkspaceMemberOwnedModelGroups,
  listVisibleActorModelGroups,
  listWorkspaceModelGroups,
  ModelGroupError,
  revokeModelGroupGrant,
  setActorModelGroups,
  updateModelGroup,
  updateModelItem,
} from "./service.js"

const routingStrategyEnum = z.enum(MODEL_GROUP_ROUTING_STRATEGIES)
const providerTypeSchema = z
  .string()
  .min(1)
  .refine(isKnownModelProviderType, "Unknown provider type")
const engineKindSchema = z
  .string()
  .min(1)
  .refine(isKnownModelEngineKind, "Unknown engine kind")
const grantScopeEnum = z.enum(MODEL_GROUP_GRANT_SCOPES)

const attemptPolicySchema = z
  .object({
    maxAttemptsTotal: z.number().int().positive().optional(),
    maxAttemptsPerBinding: z.number().int().positive().optional(),
    timeoutMsPerAttempt: z.number().int().positive().optional(),
    continueOn: z.array(z.string()).optional(),
    stopOn: z.array(z.string()).optional(),
    retryBackoffMs: z.array(z.number().int().min(0)).optional(),
  })
  .passthrough()

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  routingStrategy: routingStrategyEnum.optional(),
  attemptPolicy: attemptPolicySchema.optional(),
  isDefault: z.boolean().optional(),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  routingStrategy: routingStrategyEnum.optional(),
  attemptPolicy: attemptPolicySchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const addItemSchema = z.object({
  displayName: z.string().min(1).max(255),
  priority: z.number().int().optional(),
  weight: z.number().int().min(0).max(1000).optional(),
  providerType: providerTypeSchema,
  engineKind: engineKindSchema.optional(),
  apiKey: z.string().min(1),
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  capabilityTags: z.array(z.string()).optional(),
  extraConfig: z.record(z.unknown()).optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).optional(),
})

const updateItemSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  priority: z.number().int().optional(),
  weight: z.number().int().min(0).max(1000).optional(),
  isEnabled: z.boolean().optional(),
  providerType: providerTypeSchema.optional(),
  engineKind: engineKindSchema.optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  maxTokens: z.number().int().positive().optional(),
  capabilityTags: z.array(z.string()).optional(),
  extraConfig: z.record(z.unknown()).optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).optional(),
})

const setActorGroupsSchema = z.object({
  groups: z.array(
    z.object({
      groupId: z.string().uuid(),
      priority: z.number().int(),
    })
  ),
})

const issueGrantSchema = z.object({
  grantScope: grantScopeEnum,
  workspaceId: z.string().uuid().optional(),
  workspaceMemberId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
})

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof ModelGroupError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Validation failed",
      details: error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    })
  }
  throw error
}

async function requireWorkspacePermission(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
  permission: "view" | "manage_models",
  errorMessage: string
) {
  const { workspaceId } = request.params
  return requireRequestAction(
    request,
    reply,
    permission === "view" ? "workspace.view" : "workspace.manage_models",
    workspaceId,
    errorMessage
  )
}

async function requireActorPermission(
  request: FastifyRequest<{ Params: { workspaceId: string; actorId: string } }>,
  reply: FastifyReply,
  permission: "view" | "edit",
  errorMessage: string
) {
  const { actorId } = request.params
  return requireRequestAction(
    request,
    reply,
    permission === "view" ? "actor.view" : "actor.edit",
    actorId,
    errorMessage
  )
}

async function requirePlatformPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  _permission: "manage_models",
  errorMessage: string
) {
  return requireRequestAction(
    request,
    reply,
    "platform.manage_models",
    PLATFORM_RESOURCE_ID,
    errorMessage
  )
}

async function requireModelGroupPermission(
  principalId: string,
  groupId: string,
  permission: "view" | "edit" | "grant" | "delete",
  reply: FastifyReply,
  errorMessage: string,
  workspaceId?: string
) {
  const action =
    permission === "view"
      ? "model_group.view"
      : permission === "edit"
        ? "model_group.edit"
        : permission === "grant"
          ? "model_group.grant"
          : "model_group.delete"
  const allowed = await authorizeAction({
    subject: workspaceId
      ? workspaceMemberSubject(principalId)
      : userSubject(principalId),
    action,
    resourceId: groupId,
  })

  if (!allowed) {
    reply.status(403).send({ error: errorMessage })
    return false
  }

  return true
}

async function requireWorkspaceVisibleGroup(
  request: FastifyRequest<{ Params: { workspaceId: string; groupId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, groupId } = request.params
  const visible = await isModelGroupAvailableInWorkspace(groupId, workspaceId)
  if (!visible) {
    reply.status(404).send({ error: "Model group not found" })
    return null
  }
  return getModelGroup(groupId)
}

async function requirePlatformGroup(
  request: FastifyRequest<{ Params: { groupId: string } }>,
  reply: FastifyReply
) {
  const group = await getModelGroup(request.params.groupId)
  if (group.owner_type !== "platform") {
    reply.status(404).send({ error: "Model group not found" })
    return null
  }
  return group
}

async function requireWorkspaceMemberOwnedGroup(
  request: FastifyRequest<{ Params: { workspaceId: string; groupId: string } }>,
  reply: FastifyReply
) {
  const workspaceMemberId = request.workspaceMember?.id as
    | string
    | undefined
  if (!workspaceMemberId) {
    reply.status(403).send({ error: "Workspace member not found" })
    return null
  }
  const group = await getModelGroup(request.params.groupId)
  if (
    group.owner_type !== "workspace_member" ||
    group.owner_workspace_member_id !== workspaceMemberId
  ) {
    reply.status(404).send({ error: "Model group not found" })
    return null
  }
  return group
}

export function registerModelGroupRoutes(app: FastifyInstance) {
  const wsPrefix = "/api/v1/workspaces/:workspaceId/model-groups"
  const platformPrefix = "/api/v1/platform/model-groups"
  const workspaceMemberPrefix =
    "/api/v1/workspaces/:workspaceId/me/model-groups"
  const wsPreHandler = [authMiddleware, workspaceMiddleware]
  const authPreHandler = [authMiddleware]

  app.get(
    wsPrefix,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const groups = await listWorkspaceModelGroups(workspaceId)
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    wsPrefix,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const body = createGroupSchema.parse(request.body)
        const workspaceMemberId = request.workspaceMember?.id as string
        const group = await createModelGroup({
          ...body,
          ownerType: "workspace",
          workspaceId,
          createdByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${wsPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "view",
          reply,
          "Not allowed to view this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        return reply.send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${wsPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const scopedGroup = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!scopedGroup) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          scopedGroup.id,
          "edit",
          reply,
          "Not allowed to edit this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const body = updateGroupSchema.parse(request.body)
        const group = await updateModelGroup(scopedGroup.id, body)
        return reply.send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${wsPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const scopedGroup = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!scopedGroup) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          scopedGroup.id,
          "delete",
          reply,
          "Not allowed to delete this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        await deleteModelGroup(scopedGroup.id)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${wsPrefix}/:groupId/grants`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "grant",
          reply,
          "Not allowed to manage grants for this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const grants = await listModelGroupGrants(group.id)
        return reply.send({ grants })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${wsPrefix}/:groupId/grants`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "grant",
          reply,
          "Not allowed to manage grants for this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const body = issueGrantSchema.parse(request.body)
        const grant = await issueModelGroupGrant(group.id, {
          ...body,
          grantedByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ grant })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${wsPrefix}/:groupId/grants/:grantId/revoke`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "grant",
          reply,
          "Not allowed to manage grants for this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const { grantId } = request.params as { grantId: string }
        await revokeModelGroupGrant(group.id, grantId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${wsPrefix}/:groupId/items`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const body = addItemSchema.parse(request.body)
        const item = await addModelItem(group.id, {
          ...body,
          installedByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${wsPrefix}/:groupId/items/:itemId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const { itemId } = request.params as { itemId: string }
        const body = updateItemSchema.parse(request.body)
        const item = await updateModelItem(group.id, itemId, body)
        return reply.send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${wsPrefix}/:groupId/items/:itemId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const { itemId } = request.params as { itemId: string }
        await deleteModelItem(group.id, itemId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${wsPrefix}/:groupId/items/:itemId/versions`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const group = await requireWorkspaceVisibleGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "view",
          reply,
          "Not allowed to view this model group",
          (request.params as any).workspaceId
        )
        if (!groupAllowed) return

        const { itemId } = request.params as { itemId: string }
        const versions = await getItemVersions(itemId, group.id)
        return reply.send({ versions })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/actors/:actorId/model-groups",
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const actorAllowed = await requireActorPermission(
          request as FastifyRequest<{
            Params: { workspaceId: string; actorId: string }
          }>,
          reply,
          "view",
          "Not allowed to view this actor"
        )
        if (!actorAllowed) return

        const { actorId, workspaceId } = request.params as {
          actorId: string
          workspaceId: string
        }
        const groups = await getActorModelGroups(actorId, workspaceId)
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/actors/:actorId/model-groups/visible",
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const actorAllowed = await requireActorPermission(
          request as FastifyRequest<{
            Params: { workspaceId: string; actorId: string }
          }>,
          reply,
          "view",
          "Not allowed to view this actor"
        )
        if (!actorAllowed) return

        const { actorId, workspaceId } = request.params as {
          actorId: string
          workspaceId: string
        }
        const groups = await listVisibleActorModelGroups(actorId, workspaceId)
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/actors/:actorId/model-groups",
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceAllowed = await requireWorkspacePermission(
          request as FastifyRequest<{ Params: { workspaceId: string } }>,
          reply,
          "manage_models",
          "Not allowed to manage model groups in this workspace"
        )
        if (!workspaceAllowed) return

        const actorAllowed = await requireActorPermission(
          request as FastifyRequest<{
            Params: { workspaceId: string; actorId: string }
          }>,
          reply,
          "edit",
          "Not allowed to edit this actor"
        )
        if (!actorAllowed) return

        const { actorId, workspaceId } = request.params as {
          actorId: string
          workspaceId: string
        }
        const body = setActorGroupsSchema.parse(request.body)
        const groups = await setActorModelGroups(
          actorId,
          workspaceId,
          body.groups
        )
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    platformPrefix,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const groups = await listPlatformModelGroups()
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    platformPrefix,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const body = createGroupSchema.parse(request.body)
        const group = await createModelGroup({
          ...body,
          ownerType: "platform",
        })
        return reply.status(201).send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${platformPrefix}/:groupId`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        return reply.send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${platformPrefix}/:groupId`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const userId = request.user.userId
        const groupAllowed = await requireModelGroupPermission(
          userId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group"
        )
        if (!groupAllowed) return

        const body = updateGroupSchema.parse(request.body)
        const updated = await updateModelGroup(group.id, body)
        return reply.send({ group: updated })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${platformPrefix}/:groupId`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const userId = request.user.userId
        const groupAllowed = await requireModelGroupPermission(
          userId,
          group.id,
          "delete",
          reply,
          "Not allowed to delete this model group"
        )
        if (!groupAllowed) return

        await deleteModelGroup(group.id)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${platformPrefix}/:groupId/grants`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const grants = await listModelGroupGrants(group.id)
        return reply.send({ grants })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${platformPrefix}/:groupId/grants`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const body = issueGrantSchema.parse(request.body)
        const grant = await issueModelGroupGrant(group.id, {
          ...body,
        })
        return reply.status(201).send({ grant })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${platformPrefix}/:groupId/grants/:grantId/revoke`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const { grantId } = request.params as { grantId: string }
        await revokeModelGroupGrant(group.id, grantId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${platformPrefix}/:groupId/items`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const userId = request.user.userId
        const groupAllowed = await requireModelGroupPermission(
          userId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group"
        )
        if (!groupAllowed) return

        const body = addItemSchema.parse(request.body)
        const item = await addModelItem(group.id, {
          ...body,
        })
        return reply.status(201).send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${platformPrefix}/:groupId/items/:itemId`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const userId = request.user.userId
        const groupAllowed = await requireModelGroupPermission(
          userId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group"
        )
        if (!groupAllowed) return

        const { itemId } = request.params as { itemId: string }
        const body = updateItemSchema.parse(request.body)
        const item = await updateModelItem(group.id, itemId, body)
        return reply.send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${platformPrefix}/:groupId/items/:itemId`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const userId = request.user.userId
        const groupAllowed = await requireModelGroupPermission(
          userId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group"
        )
        if (!groupAllowed) return

        const { itemId } = request.params as { itemId: string }
        await deleteModelItem(group.id, itemId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${platformPrefix}/:groupId/items/:itemId/versions`,
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requirePlatformPermission(
          request,
          reply,
          "manage_models",
          "Not allowed to manage platform model groups"
        )
        if (!allowed) return

        const group = await requirePlatformGroup(
          request as FastifyRequest<{ Params: { groupId: string } }>,
          reply
        )
        if (!group) return

        const { itemId } = request.params as { itemId: string }
        const versions = await getItemVersions(itemId, group.id)
        return reply.send({ versions })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    workspaceMemberPrefix,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceMemberId = request.workspaceMember?.id as string
        const groups =
          await listWorkspaceMemberOwnedModelGroups(workspaceMemberId)
        return reply.send({ groups })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    workspaceMemberPrefix,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createGroupSchema.parse(request.body)
        const workspaceMemberId = request.workspaceMember?.id as string
        const group = await createModelGroup({
          ...body,
          ownerType: "workspace_member",
          ownerWorkspaceMemberId: workspaceMemberId,
          createdByWorkspaceMemberId: workspaceMemberId,
        })
        return reply.status(201).send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${workspaceMemberPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return
        return reply.send({ group })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${workspaceMemberPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceId = (request.params as any).workspaceId as string
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "edit",
          reply,
          "Not allowed to edit this model group",
          workspaceId
        )
        if (!groupAllowed) return

        const body = updateGroupSchema.parse(request.body)
        const updated = await updateModelGroup(group.id, body)
        return reply.send({ group: updated })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${workspaceMemberPrefix}/:groupId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const workspaceId = (request.params as any).workspaceId as string
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const workspaceMemberId = request.workspaceMember?.id as string
        const groupAllowed = await requireModelGroupPermission(
          workspaceMemberId,
          group.id,
          "delete",
          reply,
          "Not allowed to delete this model group",
          workspaceId
        )
        if (!groupAllowed) return

        await deleteModelGroup(group.id)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${workspaceMemberPrefix}/:groupId/grants`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const grants = await listModelGroupGrants(group.id)
        return reply.send({ grants })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${workspaceMemberPrefix}/:groupId/grants`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const body = issueGrantSchema.parse(request.body)
        const grant = await issueModelGroupGrant(group.id, {
          ...body,
          grantedByWorkspaceMemberId: request.workspaceMember
            ?.id as string,
        })
        return reply.status(201).send({ grant })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${workspaceMemberPrefix}/:groupId/grants/:grantId/revoke`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const { grantId } = request.params as { grantId: string }
        await revokeModelGroupGrant(group.id, grantId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${workspaceMemberPrefix}/:groupId/items`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const body = addItemSchema.parse(request.body)
        const item = await addModelItem(group.id, {
          ...body,
          installedByWorkspaceMemberId: request.workspaceMember
            ?.id as string,
        })
        return reply.status(201).send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${workspaceMemberPrefix}/:groupId/items/:itemId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const { itemId } = request.params as { itemId: string }
        const body = updateItemSchema.parse(request.body)
        const item = await updateModelItem(group.id, itemId, body)
        return reply.send({ item })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${workspaceMemberPrefix}/:groupId/items/:itemId`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const { itemId } = request.params as { itemId: string }
        await deleteModelItem(group.id, itemId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${workspaceMemberPrefix}/:groupId/items/:itemId/versions`,
    { preHandler: wsPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const group = await requireWorkspaceMemberOwnedGroup(
          request as FastifyRequest<{
            Params: { workspaceId: string; groupId: string }
          }>,
          reply
        )
        if (!group) return

        const { itemId } = request.params as { itemId: string }
        const versions = await getItemVersions(itemId, group.id)
        return reply.send({ versions })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )
}
