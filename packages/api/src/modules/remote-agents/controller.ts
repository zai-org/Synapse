import type { FastifyInstance, FastifyReply } from "fastify"
import { z } from "zod"
import {
  RELATIONSHIP_ACCESS_POLICIES,
  REMOTE_AGENT_RUNTIME_KINDS,
} from "@synapse/shared"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  bindRemoteAgent,
  checkRemoteAgentMessages,
  completeRemoteAgentDeliveries,
  createRemoteAgent,
  createRemoteAgentPlanApprovalInteraction,
  createRemoteAgentMachinePairingSession,
  createRemoteAgentUserInputInteraction,
  deleteRemoteAgent,
  getMachineKeyFromHeaders,
  getRemoteAgent,
  getRemoteAgentConversationHistory,
  getRemoteAgentMachine,
  listRemoteAgentGroupInteractionGrants,
  listRemoteAgentConversations,
  listRemoteAgentMachines,
  listRemoteAgents,
  searchRemoteAgentMessages,
  sendRemoteAgentConversationMessage,
  updateRemoteAgentGroupInteractionGrants,
  updateRemoteAgent,
} from "./service.js"

const runtimeKindSchema = z.enum(REMOTE_AGENT_RUNTIME_KINDS)
const accessPolicySchema = z.enum(RELATIONSHIP_ACCESS_POLICIES)

const createRemoteAgentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  runtimeKind: runtimeKindSchema,
  avatarFileId: z.string().uuid().optional(),
  avatarEmoji: z.string().trim().max(32).optional(),
  accessPolicy: accessPolicySchema.optional(),
  isPublicShared: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
})

const updateRemoteAgentSchema = createRemoteAgentSchema.partial().extend({
  description: z.string().trim().max(5000).nullable().optional(),
  avatarFileId: z.string().uuid().nullable().optional(),
  avatarEmoji: z.string().trim().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
})

const createMachineSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
})

const bindRemoteAgentSchema = z.object({
  machineId: z.string().uuid(),
  runtimeKind: runtimeKindSchema,
  runtimePath: z.string().trim().min(1).optional(),
  localRootPath: z.string().trim().min(1).optional(),
})

const groupInteractionGrantsSchema = z.object({
  workspaceMemberIds: z.array(z.string().uuid()).max(200),
})

const historyQuerySchema = z.object({
  afterSequence: z.coerce.number().int().min(0).optional(),
  beforeSequence: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const checkMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const searchMessagesQuerySchema = z.object({
  conversationId: z.string().uuid(),
  q: z.string().trim().min(1).max(512),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  clientMessageId: z.string().uuid().optional(),
  contentBlocks: z.array(z.any()).min(1),
  replyToItemId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
})

const completeDeliveriesSchema = z.object({
  deliveryIds: z.array(z.string().uuid()).min(1),
})

const internalUserInputInteractionSchema = z.object({
  conversationId: z.string().uuid(),
  runKey: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  instructions: z.string().trim().max(5000).optional(),
  questions: z.array(z.any()).min(1).max(4),
  expiresAt: z.string().datetime().optional(),
})

const internalPlanApprovalInteractionSchema = z.object({
  conversationId: z.string().uuid(),
  runKey: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().max(5000).optional(),
  planMarkdown: z.string().trim().min(1),
  checklist: z.array(z.any()).optional(),
  collaborationMode: z.string().trim().max(120).optional(),
  collaborationState: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
})

function getRequestUserId(request: any) {
  return request.user!.userId as string
}

function sendServiceError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error && error.message ? error.message : "Request failed"

  if (/not found/i.test(message)) {
    return reply.status(404).send({ error: message })
  }
  if (
    /not allowed|forbidden|access denied|authentication failed/i.test(message)
  ) {
    return reply.status(403).send({ error: message })
  }
  if (/required|invalid/i.test(message)) {
    return reply.status(400).send({ error: message })
  }
  return reply.status(400).send({ error: message })
}

async function requireWorkspaceRemoteAgentAdmin(
  request: any,
  reply: FastifyReply
) {
  return requireRequestAction(
    request,
    reply,
    "workspace.manage_remote_agents",
    request.params.workspaceId,
    "Not allowed to manage remote agents in this workspace"
  )
}

export default async function remoteAgentsController(app: FastifyInstance) {
  const workspacePreHandler = [authMiddleware, workspaceMiddleware]
  const internalPrefixes = ["/internal", "/api/v1/internal"] as const

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        return reply.send(
          await listRemoteAgents({
            workspaceId: request.params.workspaceId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        const body = createRemoteAgentSchema.parse(request.body)
        return reply.status(201).send(
          await createRemoteAgent({
            workspaceId: request.params.workspaceId,
            userId: getRequestUserId(request),
            name: body.name,
            title: body.title,
            description: body.description,
            runtimeKind: body.runtimeKind,
            avatarFileId: body.avatarFileId,
            avatarEmoji: body.avatarEmoji,
            accessPolicy: body.accessPolicy,
            isPublicShared: body.isPublicShared,
            metadata: body.metadata,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string; remoteAgentId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        return reply.send(
          await getRemoteAgent({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.patch<{
    Params: { workspaceId: string; remoteAgentId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        const body = updateRemoteAgentSchema.parse(request.body)
        return reply.send(
          await updateRemoteAgent({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
            name: body.name,
            title: body.title,
            description: body.description,
            avatarFileId: body.avatarFileId,
            avatarEmoji: body.avatarEmoji,
            accessPolicy: body.accessPolicy,
            isPublicShared: body.isPublicShared,
            isActive: body.isActive,
            metadata: body.metadata,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.delete<{
    Params: { workspaceId: string; remoteAgentId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        return reply.send(
          await deleteRemoteAgent({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string; remoteAgentId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId/bind",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        const body = bindRemoteAgentSchema.parse(request.body)
        return reply.send(
          await bindRemoteAgent({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
            machineId: body.machineId,
            runtimeKind: body.runtimeKind,
            runtimePath: body.runtimePath,
            localRootPath: body.localRootPath,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string; remoteAgentId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId/group-interaction-grants",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        return reply.send(
          await listRemoteAgentGroupInteractionGrants({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.put<{
    Params: { workspaceId: string; remoteAgentId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId/group-interaction-grants",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        const body = groupInteractionGrantsSchema.parse(request.body)
        return reply.send(
          await updateRemoteAgentGroupInteractionGrants({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId: getRequestUserId(request),
            workspaceMemberIds: body.workspaceMemberIds,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-machines/pairing-sessions",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      if (!(await requireWorkspaceRemoteAgentAdmin(request, reply))) return
      try {
        const body = createMachineSchema.parse(request.body)
        return reply.status(201).send(
          await createRemoteAgentMachinePairingSession({
            workspaceId: request.params.workspaceId,
            userId: getRequestUserId(request),
            title: body.title,
            description: body.description,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-machines",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        return reply.send(
          await listRemoteAgentMachines({
            workspaceId: request.params.workspaceId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string; machineId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-machines/:machineId",
    { preHandler: workspacePreHandler },
    async (request, reply) => {
      try {
        return reply.send(
          await getRemoteAgentMachine({
            workspaceId: request.params.workspaceId,
            machineId: request.params.machineId,
            userId: getRequestUserId(request),
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  for (const prefix of internalPrefixes) {
    app.post<{
      Params: { remoteAgentId: string }
      Body: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/interactions/user-input`,
      async (request, reply) => {
        try {
          const body = internalUserInputInteractionSchema.parse(request.body)
          return reply.send(
            await createRemoteAgentUserInputInteraction({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              conversationId: body.conversationId,
              runKey: body.runKey,
              title: body.title,
              instructions: body.instructions,
              questions: body.questions,
              expiresAt: body.expiresAt,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.post<{
      Params: { remoteAgentId: string }
      Body: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/interactions/plan-approval`,
      async (request, reply) => {
        try {
          const body = internalPlanApprovalInteractionSchema.parse(request.body)
          return reply.send(
            await createRemoteAgentPlanApprovalInteraction({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              conversationId: body.conversationId,
              runKey: body.runKey,
              title: body.title,
              summary: body.summary,
              planMarkdown: body.planMarkdown,
              checklist: body.checklist,
              collaborationMode: body.collaborationMode,
              collaborationState: body.collaborationState,
              expiresAt: body.expiresAt,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.get<{
      Params: { remoteAgentId: string }
    }>(
      `${prefix}/remote-agents/:remoteAgentId/conversations`,
      async (request, reply) => {
        try {
          return reply.send(
            await listRemoteAgentConversations({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.get<{
      Params: { remoteAgentId: string }
      Querystring: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/check-messages`,
      async (request, reply) => {
        try {
          const query = checkMessagesQuerySchema.parse(request.query)
          return reply.send(
            await checkRemoteAgentMessages({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              limit: query.limit,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.post<{
      Params: { remoteAgentId: string }
      Body: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/complete-deliveries`,
      async (request, reply) => {
        try {
          const body = completeDeliveriesSchema.parse(request.body)
          return reply.send(
            await completeRemoteAgentDeliveries({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              deliveryIds: body.deliveryIds,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.get<{
      Params: { remoteAgentId: string; conversationId: string }
      Querystring: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/history/:conversationId`,
      async (request, reply) => {
        try {
          const query = historyQuerySchema.parse(request.query)
          return reply.send(
            await getRemoteAgentConversationHistory({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              conversationId: request.params.conversationId,
              afterSequence: query.afterSequence,
              beforeSequence: query.beforeSequence,
              limit: query.limit,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.post<{
      Params: { remoteAgentId: string }
      Body: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/send`,
      async (request, reply) => {
        try {
          const body = sendMessageSchema.parse(request.body)
          return reply.send(
            await sendRemoteAgentConversationMessage({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              conversationId: body.conversationId,
              clientMessageId: body.clientMessageId,
              contentBlocks: body.contentBlocks,
              replyToItemId: body.replyToItemId,
              metadata: body.metadata,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )

    app.get<{
      Params: { remoteAgentId: string }
      Querystring: unknown
    }>(
      `${prefix}/remote-agents/:remoteAgentId/search`,
      async (request, reply) => {
        try {
          const query = searchMessagesQuerySchema.parse(request.query)
          return reply.send(
            await searchRemoteAgentMessages({
              remoteAgentId: request.params.remoteAgentId,
              machineKey: getMachineKeyFromHeaders(request),
              conversationId: query.conversationId,
              query: query.q,
              limit: query.limit,
            })
          )
        } catch (error) {
          return sendServiceError(reply, error)
        }
      }
    )
  }
}
