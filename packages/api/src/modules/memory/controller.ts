import { z } from "zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  CANONICAL_FILE_CATEGORIES,
  MEMORY_CATEGORIES,
  MEMORY_ITEM_STATES,
  MEMORY_RECALL_TYPES,
  MEMORY_SPACE_TYPES,
  MEMORY_STABILITIES,
} from "@synapse/shared/constants"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  authorizeAction,
  authorizePermission,
  getRequestAccessSubject,
} from "../access/service.js"
import {
  createMemory,
  deleteMemory,
  getMemory,
  listMemories,
  MemoryError,
  recallMemories,
  runMemorySearch,
  updateMemory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
} from "./service.js"
import { ensureConversationActorSessionContext } from "../session/service.js"

const memorySpaceTypeEnum = z.enum(MEMORY_SPACE_TYPES)
const memoryCategoryEnum = z.enum(MEMORY_CATEGORIES)
const memoryStateEnum = z.enum(MEMORY_ITEM_STATES)
const memoryStabilityEnum = z.enum(MEMORY_STABILITIES)

const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid().optional(),
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    id: z.string().uuid().optional(),
    type: z.literal("file_ref"),
    fileId: z.string().uuid(),
    url: z.string(),
    mimeType: z.string(),
    originalName: z.string(),
    sizeBytes: z.number(),
    category: z.enum(CANONICAL_FILE_CATEGORIES),
  }),
])

const memoryPayloadSchema = z.object({
  spaceType: memorySpaceTypeEnum.optional(),
  ownerScope: memorySpaceTypeEnum.optional(),
  actorId: z.string().uuid().optional(),
  ownerActorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  ownerConversationId: z.string().uuid().optional(),
  workspaceMemberId: z.string().uuid().optional(),
  ownerWorkspaceMemberId: z.string().uuid().optional(),
  category: memoryCategoryEnum.optional(),
  state: memoryStateEnum.optional(),
  status: memoryStateEnum.optional(),
  stability: memoryStabilityEnum.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional(),
  contentBlocks: z.array(contentBlockSchema).optional(),
  textDigest: z.string().optional(),
  searchText: z.string().optional(),
  sourceItemId: z.string().uuid().optional(),
  sourceToolCallId: z.string().uuid().optional(),
  sourceTurnId: z.string().uuid().optional(),
  supersedesMemoryId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
})

const createMemorySchema = memoryPayloadSchema
  .extend({
    category: memoryCategoryEnum,
  })
  .refine(
    (value) => !!value.content || !!value.contentBlocks || !!value.textDigest,
    {
      message: "content, contentBlocks, or textDigest is required",
    }
  )

const updateMemorySchema = memoryPayloadSchema.partial()

const listMemoriesSchema = z.object({
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  workspaceMemberId: z.string().uuid().optional(),
  spaceType: memorySpaceTypeEnum.optional(),
  ownerScope: memorySpaceTypeEnum.optional(),
  category: memoryCategoryEnum.optional(),
  state: memoryStateEnum.optional(),
  status: memoryStateEnum.optional(),
  tags: z
    .union([
      z.string().transform((value) =>
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      ),
      z.array(z.string()),
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const searchMemoriesSchema = z.object({
  queryText: z.string().min(1),
  actorId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  workspaceMemberId: z.string().uuid().optional(),
  spaceTypes: z.array(memorySpaceTypeEnum).optional(),
  scopes: z.array(memorySpaceTypeEnum).optional(),
  categories: z.array(memoryCategoryEnum).optional(),
  states: z.array(memoryStateEnum).optional(),
  statuses: z.array(memoryStateEnum).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  metadata: z.record(z.any()).optional(),
})

const recallMemoriesSchema = searchMemoriesSchema.extend({
  recallType: z.enum(
    MEMORY_RECALL_TYPES.filter((value) => value !== "manual_search") as [
      "bootstrap",
      "turn_recall",
    ]
  ),
  queryBlocks: z.array(contentBlockSchema).optional(),
})

function normalizeMemoryPayload<T extends z.infer<typeof memoryPayloadSchema>>(
  value: T
) {
  return {
    ...value,
    spaceType: value.spaceType || value.ownerScope,
    actorId: value.actorId || value.ownerActorId,
    conversationId: value.conversationId || value.ownerConversationId,
    workspaceMemberId: value.workspaceMemberId || value.ownerWorkspaceMemberId,
    state: value.state || value.status,
  }
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof MemoryError) {
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

async function requireWorkspacePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  action: "workspace.view" | "workspace.manage_memories",
  errorMessage: string
) {
  const { workspaceId } = request.params as { workspaceId: string }
  return requireRequestAction(request, reply, action, workspaceId, errorMessage)
}

async function requireMemoryPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  memoryId: string,
  permission: "read" | "edit" | "retarget" | "delete",
  errorMessage: string
) {
  const allowed = await authorizePermission({
    subject: getRequestAccessSubject(request),
    resourceType: "memory_item",
    resourceId: memoryId,
    permission,
  })

  if (!allowed) {
    reply.status(403).send({ error: errorMessage })
    return false
  }

  return true
}

async function requireMemorySpaceWritePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  body: Pick<
    CreateMemoryInput,
    "spaceType" | "actorId" | "conversationId" | "workspaceMemberId"
  >,
  errorMessage: string
) {
  const workspaceMemberId = request.workspaceMember?.id as
    | string
    | undefined
  const { workspaceId } = request.params as { workspaceId: string }
  let allowed = false

  switch (body.spaceType) {
    case "workspace_shared":
      allowed = await authorizeAction({
        subject: getRequestAccessSubject(request),
        action: "workspace.manage_memories",
        resourceId: workspaceId,
      })
      break
    case "conversation_shared":
      if (body.conversationId) {
        allowed = await authorizePermission({
          subject: getRequestAccessSubject(request),
          resourceType: "conversation",
          resourceId: body.conversationId,
          permission: "memory_edit",
        })
      }
      break
    case "actor_private":
      if (body.actorId) {
        allowed = await authorizePermission({
          subject: getRequestAccessSubject(request),
          resourceType: "actor",
          resourceId: body.actorId,
          permission: "memory_edit",
        })
      }
      break
    case "participant_private":
      if (body.actorId && body.conversationId) {
        const context = await ensureConversationActorSessionContext({
          workspaceId,
          actorId: body.actorId,
          conversationId: body.conversationId,
        })
        allowed = await authorizePermission({
          subject: getRequestAccessSubject(request),
          resourceType: "conversation_actor_context",
          resourceId: context.conversationActorContextId,
          permission: "memory_edit",
        })
      }
      break
    case "user_private":
      allowed = body.workspaceMemberId === workspaceMemberId
      if (!allowed) {
        allowed = await authorizeAction({
          subject: getRequestAccessSubject(request),
          action: "workspace.manage_memories",
          resourceId: workspaceId,
        })
      }
      break
    default:
      allowed = false
  }

  if (!allowed) {
    reply.status(403).send({ error: errorMessage })
    return false
  }

  return true
}

function resolveTargetSpace(
  existing: Awaited<ReturnType<typeof getMemory>>,
  body: z.infer<typeof updateMemorySchema>
) {
  const normalized = normalizeMemoryPayload(body)
  return {
    spaceType: normalized.spaceType ?? existing.spaceType,
    actorId:
      normalized.actorId !== undefined ? normalized.actorId : existing.actorId,
    conversationId:
      normalized.conversationId !== undefined
        ? normalized.conversationId
        : existing.conversationId,
    workspaceMemberId:
      normalized.workspaceMemberId !== undefined
        ? normalized.workspaceMemberId
        : existing.workspaceMemberId,
  } satisfies Pick<
    CreateMemoryInput,
    "spaceType" | "actorId" | "conversationId" | "workspaceMemberId"
  >
}

function updateTouchesMemoryEdit(body: z.infer<typeof updateMemorySchema>) {
  return (
    body.category !== undefined ||
    body.state !== undefined ||
    body.status !== undefined ||
    body.importance !== undefined ||
    body.confidence !== undefined ||
    body.tags !== undefined ||
    body.content !== undefined ||
    body.contentBlocks !== undefined ||
    body.textDigest !== undefined ||
    body.searchText !== undefined ||
    body.sourceItemId !== undefined ||
    body.sourceToolCallId !== undefined ||
    body.sourceTurnId !== undefined ||
    body.supersedesMemoryId !== undefined ||
    body.metadata !== undefined
  )
}

function updateTouchesMemoryRetarget(body: z.infer<typeof updateMemorySchema>) {
  return (
    body.spaceType !== undefined ||
    body.ownerScope !== undefined ||
    body.actorId !== undefined ||
    body.ownerActorId !== undefined ||
    body.conversationId !== undefined ||
    body.ownerConversationId !== undefined ||
    body.workspaceMemberId !== undefined ||
    body.ownerWorkspaceMemberId !== undefined
  )
}

export function registerMemoryRoutes(app: FastifyInstance) {
  const prefix = "/api/v1/workspaces/:workspaceId/memories"
  const preHandler = [authMiddleware, workspaceMiddleware]

  app.post(
    prefix,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.view",
          "Not allowed to view this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const normalizedBody = normalizeMemoryPayload(
          createMemorySchema.parse(request.body)
        )
        const canWrite = await requireMemorySpaceWritePermission(
          request,
          reply,
          normalizedBody as Pick<
            CreateMemoryInput,
            "spaceType" | "actorId" | "conversationId" | "workspaceMemberId"
          >,
          "Not allowed to create a memory in this path"
        )
        if (!canWrite) return

        const memory = await createMemory(
          workspaceId,
          normalizedBody as CreateMemoryInput
        )
        return reply.status(201).send({ memory })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    prefix,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.view",
          "Not allowed to view this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const filters = listMemoriesSchema.parse(request.query)
        const memories = await listMemories(workspaceId, {
          ...filters,
          accessSubject: getRequestAccessSubject(request),
        })
        return reply.status(200).send({ memories })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.get(
    `${prefix}/:memoryId`,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.view",
          "Not allowed to view this workspace"
        )
        if (!allowed) return

        const { workspaceId, memoryId } = request.params as {
          workspaceId: string
          memoryId: string
        }
        const memory = await getMemory(workspaceId, memoryId)
        const readable = await authorizePermission({
          subject: getRequestAccessSubject(request),
          resourceType: "memory_item",
          resourceId: memoryId,
          permission: "read",
        })
        if (!readable) {
          return reply
            .status(403)
            .send({ error: "Not allowed to read this memory" })
        }
        return reply.status(200).send({ memory })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.put(
    `${prefix}/:memoryId`,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, memoryId } = request.params as {
          workspaceId: string
          memoryId: string
        }
        const body = normalizeMemoryPayload(
          updateMemorySchema.parse(request.body)
        )
        const existing = await getMemory(workspaceId, memoryId)

        if (updateTouchesMemoryEdit(body)) {
          const allowed = await requireMemoryPermission(
            request,
            reply,
            memoryId,
            "edit",
            "Not allowed to edit this memory"
          )
          if (!allowed) return
        }

        if (updateTouchesMemoryRetarget(body)) {
          const allowed = await requireMemoryPermission(
            request,
            reply,
            memoryId,
            "retarget",
            "Not allowed to move this memory"
          )
          if (!allowed) return

          const targetSpace = resolveTargetSpace(existing, body)
          const canMoveToTarget = await requireMemorySpaceWritePermission(
            request,
            reply,
            targetSpace,
            "Not allowed to move this memory into the selected path"
          )
          if (!canMoveToTarget) return
        }

        const memory = await updateMemory(
          workspaceId,
          memoryId,
          body as UpdateMemoryInput
        )
        return reply.status(200).send({ memory })
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.delete(
    `${prefix}/:memoryId`,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, memoryId } = request.params as {
          workspaceId: string
          memoryId: string
        }
        const allowed = await requireMemoryPermission(
          request,
          reply,
          memoryId,
          "delete",
          "Not allowed to delete this memory"
        )
        if (!allowed) return

        await deleteMemory(workspaceId, memoryId)
        return reply.status(204).send()
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${prefix}/search`,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.view",
          "Not allowed to view this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const body = searchMemoriesSchema.parse(request.body)
        const result = await runMemorySearch(workspaceId, {
          ...body,
          accessSubject: getRequestAccessSubject(request),
        })
        return reply.status(200).send(result)
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )

  app.post(
    `${prefix}/recall`,
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowed = await requireWorkspacePermission(
          request,
          reply,
          "workspace.view",
          "Not allowed to view this workspace"
        )
        if (!allowed) return

        const { workspaceId } = request.params as { workspaceId: string }
        const body = recallMemoriesSchema.parse(request.body)
        const result = await recallMemories(workspaceId, {
          ...body,
          accessSubject: getRequestAccessSubject(request),
        })
        return reply.status(200).send(result)
      } catch (error) {
        return handleError(error, reply)
      }
    }
  )
}
