import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  SESSION_CHANNEL_INPUTS,
  SESSION_STATUSES,
  extractText,
  type CanonicalContentBlock,
  type SessionChannelInput,
  type SessionStatus,
} from "@synapse/shared"
import type { SessionsChannelType } from "../../infrastructure/database/generated/db.js"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import type { AccessAction } from "../access/actions.js"
import { authorizeAction, workspaceMemberSubject } from "../access/service.js"
import {
  createSession,
  getSession,
  getSessionsByActor,
  getSessionMessages,
  cancelSession,
  addSessionMessage,
} from "./service.js"
import { enqueueSessionWakeup } from "./runtime.js"

const createSessionSchema = z.object({
  contentBlocks: z.array(z.any()).min(1),
  channelType: z.enum(SESSION_CHANNEL_INPUTS).optional().default("web"),
})

const sendMessageSchema = z.object({
  contentBlocks: z.array(z.any()).min(1),
})

const retrySessionSchema = z.object({
  itemId: z.string().uuid().optional(),
})

const listSessionsQuerySchema = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
})

async function requireActorPermission(
  request: any,
  reply: any,
  actorId: string,
  action: AccessAction,
  errorMessage: string
) {
  return requireRequestAction(request, reply, action, actorId, errorMessage)
}

async function requireSessionConversationPermission(
  request: any,
  reply: any,
  action: AccessAction,
  errorMessage: string
) {
  const { workspaceId, sessionId } = request.params as {
    workspaceId: string
    sessionId: string
  }
  const session = await getSession(sessionId)
  if (!session || session.workspace_id !== workspaceId) {
    reply.status(404).send({ error: "Session not found" })
    return null
  }

  const workspaceMemberId = request.workspaceMember?.id as
    | string
    | undefined
  if (!workspaceMemberId) {
    reply.status(401).send({ error: "Unauthorized" })
    return null
  }

  const allowed = await authorizeAction({
    subject: workspaceMemberSubject(workspaceMemberId),
    action,
    resourceId: session.conversation_id,
  })
  if (!allowed) {
    reply.status(403).send({ error: errorMessage })
    return null
  }

  return session
}

export async function sessionController(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware)
  app.addHook("onRequest", workspaceMiddleware)

  // POST /workspaces/:wsId/actors/:actorId/sessions — start a session with an actor in a private conversation
  app.post<{
    Params: { workspaceId: string; actorId: string }
    Body: {
      contentBlocks: CanonicalContentBlock[]
      channelType?: "web" | "im" | "api"
    }
  }>(
    "/workspaces/:workspaceId/actors/:actorId/sessions",
    async (request, reply) => {
      const { workspaceId, actorId } = request.params
      const { contentBlocks, channelType } = createSessionSchema.parse(
        request.body
      ) as {
        contentBlocks: CanonicalContentBlock[]
        channelType?: SessionChannelInput
      }
      const normalizedChannelType: SessionsChannelType =
        channelType === "im" ? "bridge" : (channelType ?? "web")
      const workspaceMemberId = request.workspaceMember!.id as string

      const allowed = await requireActorPermission(
        request,
        reply,
        actorId,
        "actor.invoke",
        "Not allowed to invoke this actor"
      )
      if (!allowed) return

      const session = await createSession({
        workspaceId,
        actorId,
        workspaceMemberId,
        channelType: normalizedChannelType,
        trigger: "user_message",
        metadata: { workspaceMemberId },
      })

      // Add initial message
      await addSessionMessage({
        sessionId: session.id,
        workspaceId,
        role: "user",
        contentBlocks,
        fromWorkspaceMemberId: workspaceMemberId,
      })

      // Enqueue thinking
      await enqueueSessionWakeup({
        sessionId: session.id,
        actorId,
        workspaceId,
        sourceType: "user_message",
        sourceParticipantType: "workspace_member",
        sourceParticipantId: workspaceMemberId,
        summary:
          extractText(contentBlocks).trim().slice(0, 96) || "New message",
        trigger: "user_message",
      })

      return reply.status(201).send({
        sessionId: session.id,
        status: "processing",
      })
    }
  )

  // POST /workspaces/:wsId/sessions/:sessionId/messages — send a message in an existing session
  app.post<{
    Params: { workspaceId: string; sessionId: string }
    Body: { contentBlocks: CanonicalContentBlock[] }
  }>(
    "/workspaces/:workspaceId/sessions/:sessionId/messages",
    async (request, reply) => {
      const { workspaceId, sessionId } = request.params
      const { contentBlocks } = sendMessageSchema.parse(request.body) as {
        contentBlocks: CanonicalContentBlock[]
      }
      const workspaceMemberId = request.workspaceMember!.id as string

      const session = await requireSessionConversationPermission(
        request,
        reply,
        "conversation.send",
        "Not allowed to send messages in this session"
      )
      if (!session) return

      if (session.status === "closed") {
        return reply
          .status(400)
          .send({ error: `Cannot send message to ${session.status} session` })
      }

      // Add user message to the session
      const message = await addSessionMessage({
        sessionId,
        workspaceId,
        role: "user",
        contentBlocks,
        fromWorkspaceMemberId: workspaceMemberId,
      })

      await enqueueSessionWakeup({
        sessionId,
        actorId: session.actor_id,
        workspaceId,
        sourceType: "user_message",
        sourceParticipantType: "workspace_member",
        sourceParticipantId: workspaceMemberId,
        summary:
          extractText(contentBlocks).trim().slice(0, 96) || "New message",
        trigger: "user_message",
      })

      return reply
        .status(201)
        .send({ messageId: message.id, status: "processing" })
    }
  )

  // GET /workspaces/:wsId/sessions/:sessionId — session details
  app.get<{
    Params: { workspaceId: string; sessionId: string }
  }>("/workspaces/:workspaceId/sessions/:sessionId", async (request, reply) => {
    const session = await requireSessionConversationPermission(
      request,
      reply,
      "conversation.view",
      "Not allowed to view this session"
    )
    if (!session) return

    return reply.send({ session })
  })

  // GET /workspaces/:wsId/sessions/:sessionId/messages — session messages
  app.get<{
    Params: { workspaceId: string; sessionId: string }
  }>(
    "/workspaces/:workspaceId/sessions/:sessionId/messages",
    async (request, reply) => {
      const { sessionId } = request.params
      const session = await requireSessionConversationPermission(
        request,
        reply,
        "conversation.view",
        "Not allowed to view this session"
      )
      if (!session) return

      const messages = await getSessionMessages(sessionId)
      return reply.send({ messages })
    }
  )

  // POST /workspaces/:wsId/sessions/:sessionId/retry — retry a failed/blocked session
  app.post<{
    Params: { workspaceId: string; sessionId: string }
    Body: { itemId?: string }
  }>(
    "/workspaces/:workspaceId/sessions/:sessionId/retry",
    async (request, reply) => {
      const { workspaceId, sessionId } = request.params
      const { itemId } = retrySessionSchema.parse(request.body || {})
      const userId = request.user!.userId
      const workspaceMemberId = request.workspaceMember!.id as string

      const session = await requireSessionConversationPermission(
        request,
        reply,
        "conversation.send",
        "Not allowed to retry this session"
      )
      if (!session) return

      if (session.status === "closed") {
        return reply
          .status(400)
          .send({ error: `Cannot retry ${session.status} session` })
      }

      const wakeup = await enqueueSessionWakeup({
        sessionId,
        actorId: session.actor_id,
        workspaceId,
        sourceType: "retry",
        sourceItemId: itemId,
        sourceParticipantType: "workspace_member",
        sourceParticipantId: workspaceMemberId,
        summary: "Retry requested",
        reasonText: "User requested a retry after a model error.",
        trigger: "retry",
        metadata: {
          requestedByUserId: userId,
          requestedByWorkspaceMemberId: workspaceMemberId,
          source: "model_error_notice",
        },
      })

      return reply.status(201).send({
        wakeupId: wakeup.id,
        status: "queued",
      })
    }
  )

  // GET /workspaces/:wsId/actors/:actorId/sessions — list actor's sessions
  app.get<{
    Params: { workspaceId: string; actorId: string }
    Querystring: { status?: SessionStatus }
  }>(
    "/workspaces/:workspaceId/actors/:actorId/sessions",
    async (request, reply) => {
      const { workspaceId, actorId } = request.params
      const { status } = listSessionsQuerySchema.parse(request.query) as {
        status?: SessionStatus
      }

      const allowed = await requireActorPermission(
        request,
        reply,
        actorId,
        "actor.view",
        "Not allowed to view this actor"
      )
      if (!allowed) return

      const sessions = await getSessionsByActor(workspaceId, actorId, status)
      return reply.send({ sessions })
    }
  )

  // DELETE /workspaces/:wsId/sessions/:sessionId — cancel session
  app.delete<{
    Params: { workspaceId: string; sessionId: string }
  }>("/workspaces/:workspaceId/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params
    const session = await requireSessionConversationPermission(
      request,
      reply,
      "conversation.manage",
      "Not allowed to manage this session"
    )
    if (!session) return

    await cancelSession(sessionId)
    return reply.status(204).send()
  })
}
