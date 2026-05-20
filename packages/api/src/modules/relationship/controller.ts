import type { FastifyInstance, FastifyReply } from "fastify"
import { z } from "zod"
import {
  CONTACT_HUB_KINDS,
  RELATIONSHIP_ACCESS_POLICIES,
  RELATIONSHIP_APPROVAL_MODES,
} from "@synapse/shared"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  getActorRelationshipProfile,
  getContactHub,
  getContactHubDetail,
  getMemberRelationshipProfile,
  getRemoteAgentRelationshipProfile,
  listActorAccessRequests,
  listFriendRequests,
  listFriends,
  listRemoteAgentAccessRequests,
  openDirectConversation,
  requestRelationshipByIdentityProfile,
  resolveActorAccessRequest,
  resolveFriendRequest,
  resolveRemoteAgentAccessRequest,
  scanRelationshipQr,
  searchRelationshipsByIdentity,
  updateActorRelationshipProfile,
  updateMemberRelationshipProfile,
  updateRemoteAgentRelationshipProfile,
} from "./service.js"

const approvalModeSchema = z.enum(RELATIONSHIP_APPROVAL_MODES)
const actorAccessPolicySchema = z.enum(RELATIONSHIP_ACCESS_POLICIES)
const contactKindSchema = z.enum(CONTACT_HUB_KINDS)

const scanSchema = z.object({
  token: z.string().trim().min(1).max(256),
})

const openDirectSchema = z.object({
  contactKind: contactKindSchema,
  contactId: z.string().trim().min(1).max(255),
})

const updateMemberProfileSchema = z.object({
  approvalMode: approvalModeSchema,
  identityId: z.string().trim().min(4).max(32).optional(),
  identitySearchEnabled: z.boolean().optional(),
})

const identitySearchQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
})

const requestRelationshipBySearchSchema = z.object({
  profileId: z.string().uuid(),
})

const updateActorProfileSchema = z.object({
  approvalMode: approvalModeSchema,
  identityId: z.string().trim().min(4).max(32).optional(),
  identitySearchEnabled: z.boolean().optional(),
  accessPolicy: actorAccessPolicySchema.optional(),
  isPublicShared: z.boolean().optional(),
})

function sendServiceError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error && error.message ? error.message : "Request failed"
  if (/not found/i.test(message)) {
    return reply.status(404).send({ error: message })
  }
  if (/not allowed|forbidden/i.test(message)) {
    return reply.status(403).send({ error: message })
  }
  return reply.status(400).send({ error: message })
}

export default async function relationshipController(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware)
  app.addHook("onRequest", workspaceMiddleware)

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/me/relationship-profile",
    async (request, reply) => {
      const userId = request.user!.userId
      return reply.send(
        await getMemberRelationshipProfile({
          workspaceId: request.params.workspaceId,
          userId,
        })
      )
    }
  )

  app.put<{
    Params: { workspaceId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/me/relationship-profile",
    async (request, reply) => {
      const userId = request.user!.userId
      const body = updateMemberProfileSchema.parse(request.body)
      return reply.send(
        await updateMemberRelationshipProfile({
          workspaceId: request.params.workspaceId,
          userId,
          approvalMode: body.approvalMode,
          identityId: body.identityId,
          identitySearchEnabled: body.identitySearchEnabled,
        })
      )
    }
  )

  app.get<{
    Params: { workspaceId: string; actorId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/actors/:actorId/relationship-profile",
    async (request, reply) => {
      const allowed = await requireRequestAction(
        request,
        reply,
        "actor.grant",
        request.params.actorId,
        "Not allowed to manage this actor relationship profile"
      )
      if (!allowed) return
      const userId = request.user!.userId
      try {
        return reply.send(
          await getActorRelationshipProfile({
            workspaceId: request.params.workspaceId,
            actorId: request.params.actorId,
            userId,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.put<{
    Params: { workspaceId: string; actorId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/actors/:actorId/relationship-profile",
    async (request, reply) => {
      const allowed = await requireRequestAction(
        request,
        reply,
        "actor.grant",
        request.params.actorId,
        "Not allowed to manage this actor relationship profile"
      )
      if (!allowed) return
      const userId = request.user!.userId
      const body = updateActorProfileSchema.parse(request.body)
      try {
        return reply.send(
          await updateActorRelationshipProfile({
            workspaceId: request.params.workspaceId,
            actorId: request.params.actorId,
            userId,
            approvalMode: body.approvalMode,
            identityId: body.identityId,
            identitySearchEnabled: body.identitySearchEnabled,
            accessPolicy: body.accessPolicy,
            isPublicShared: body.isPublicShared,
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
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId/relationship-profile",
    async (request, reply) => {
      const allowed = await requireRequestAction(
        request,
        reply,
        "remote_agent.grant",
        request.params.remoteAgentId,
        "Not allowed to manage this remote agent relationship profile"
      )
      if (!allowed) return
      const userId = request.user!.userId
      try {
        return reply.send(
          await getRemoteAgentRelationshipProfile({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId,
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
    "/api/v1/workspaces/:workspaceId/remote-agents/:remoteAgentId/relationship-profile",
    async (request, reply) => {
      const allowed = await requireRequestAction(
        request,
        reply,
        "remote_agent.grant",
        request.params.remoteAgentId,
        "Not allowed to manage this remote agent relationship profile"
      )
      if (!allowed) return
      const userId = request.user!.userId
      const body = updateActorProfileSchema.parse(request.body)
      try {
        return reply.send(
          await updateRemoteAgentRelationshipProfile({
            workspaceId: request.params.workspaceId,
            remoteAgentId: request.params.remoteAgentId,
            userId,
            approvalMode: body.approvalMode,
            identityId: body.identityId,
            identitySearchEnabled: body.identitySearchEnabled,
            accessPolicy: body.accessPolicy,
            isPublicShared: body.isPublicShared,
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
    "/api/v1/workspaces/:workspaceId/relationship-qr/scan",
    async (request, reply) => {
      const userId = request.user!.userId
      const body = scanSchema.parse(request.body)
      try {
        return reply.send(
          await scanRelationshipQr({
            workspaceId: request.params.workspaceId,
            userId,
            token: body.token,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string }
    Querystring: { q?: string }
  }>(
    "/api/v1/workspaces/:workspaceId/identity-search",
    async (request, reply) => {
      const userId = request.user!.userId
      const query = identitySearchQuerySchema.parse(request.query)
      return reply.send(
        await searchRelationshipsByIdentity({
          workspaceId: request.params.workspaceId,
          userId,
          query: query.q || "",
        })
      )
    }
  )

  app.post<{
    Params: { workspaceId: string }
    Body: unknown
  }>(
    "/api/v1/workspaces/:workspaceId/identity-search/request",
    async (request, reply) => {
      const userId = request.user!.userId
      const body = requestRelationshipBySearchSchema.parse(request.body)
      try {
        return reply.send(
          await requestRelationshipByIdentityProfile({
            workspaceId: request.params.workspaceId,
            userId,
            profileId: body.profileId,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string }
  }>("/api/v1/workspaces/:workspaceId/friends", async (request, reply) => {
    const userId = request.user!.userId
    return reply.send(
      await listFriends({
        workspaceId: request.params.workspaceId,
        userId,
      })
    )
  })

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/friend-requests",
    async (request, reply) => {
      const userId = request.user!.userId
      return reply.send(
        await listFriendRequests({
          workspaceId: request.params.workspaceId,
          userId,
        })
      )
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/friend-requests/:requestId/approve",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveFriendRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "approve",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/friend-requests/:requestId/reject",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveFriendRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "reject",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/actor-access-requests",
    async (request, reply) => {
      const userId = request.user!.userId
      return reply.send(
        await listActorAccessRequests({
          workspaceId: request.params.workspaceId,
          userId,
        })
      )
    }
  )

  app.get<{
    Params: { workspaceId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-access-requests",
    async (request, reply) => {
      const userId = request.user!.userId
      return reply.send(
        await listRemoteAgentAccessRequests({
          workspaceId: request.params.workspaceId,
          userId,
        })
      )
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/actor-access-requests/:requestId/approve",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveActorAccessRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "approve",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/actor-access-requests/:requestId/reject",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveActorAccessRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "reject",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-access-requests/:requestId/approve",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveRemoteAgentAccessRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "approve",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.post<{
    Params: { workspaceId: string; requestId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/remote-agent-access-requests/:requestId/reject",
    async (request, reply) => {
      const userId = request.user!.userId
      try {
        return reply.send({
          request: await resolveRemoteAgentAccessRequest({
            workspaceId: request.params.workspaceId,
            userId,
            requestId: request.params.requestId,
            decision: "reject",
          }),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )

  app.get<{
    Params: { workspaceId: string }
  }>("/api/v1/workspaces/:workspaceId/contact-hub", async (request, reply) => {
    const userId = request.user!.userId
    return reply.send(
      await getContactHub({
        workspaceId: request.params.workspaceId,
        userId,
      })
    )
  })

  app.get<{
    Params: { workspaceId: string; kind: string; contactId: string }
  }>(
    "/api/v1/workspaces/:workspaceId/contact-hub/:kind/:contactId",
    async (request, reply) => {
      const userId = request.user!.userId
      const kind = contactKindSchema.parse(request.params.kind)
      try {
        return reply.send(
          await getContactHubDetail({
            workspaceId: request.params.workspaceId,
            userId,
            contactKind: kind,
            contactId: request.params.contactId,
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
    "/api/v1/workspaces/:workspaceId/direct-conversations/open",
    async (request, reply) => {
      const userId = request.user!.userId
      const body = openDirectSchema.parse(request.body)
      try {
        return reply.send(
          await openDirectConversation({
            workspaceId: request.params.workspaceId,
            userId,
            contactKind: body.contactKind,
            contactId: body.contactId,
          })
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    }
  )
}
