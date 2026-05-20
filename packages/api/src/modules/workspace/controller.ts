import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import {
  CAPABILITY_CONVERSATION_TYPE_POLICY_RESOURCE_FAMILIES,
  INVITE_TRUST_LEVELS,
  WORKSPACE_ACCESS_KEYS,
} from "@synapse/shared/constants"
import {
  authMiddleware,
  optionalAuth,
} from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  authorizeAction,
  resolveWorkspaceAccessSubject,
} from "../access/service.js"
import type { AccessAction } from "../access/actions.js"
import {
  createWorkspace,
  listUserWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  addMember,
  listMembers,
  getWorkspaceChiefActorPreference,
  updateWorkspaceChiefActorPreference,
  listWorkspaceAccessBindings,
  grantWorkspaceAccess,
  revokeWorkspaceAccess,
  type WorkspaceAccessKey,
} from "./service.js"
import {
  listWorkspaceCapabilityConversationTypePolicies,
  updateWorkspaceCapabilityConversationTypePolicies,
} from "../capabilities/conversation-type-policies.js"
import {
  createInvite,
  getInviteByToken,
  redeemInvite,
  listWorkspaceInvites,
  revokeInvite,
} from "./invite-service.js"

// ── Schemas ──

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
})

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
})

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  trustLevel: z.enum(INVITE_TRUST_LEVELS),
})

const createInviteSchema = z.object({
  trustLevel: z.enum(INVITE_TRUST_LEVELS).optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
})

const workspaceAccessSchema = z.object({
  workspaceMemberId: z.string().uuid(),
  accessKey: z.enum(WORKSPACE_ACCESS_KEYS),
})

const chiefActorPreferenceSchema = z.object({
  chiefActorId: z.string().uuid().nullable(),
})

const conversationTypeMaskSchema = z.number().int().min(1).max(31)
const capabilityConversationTypePolicyFamilySchema = z.enum(
  CAPABILITY_CONVERSATION_TYPE_POLICY_RESOURCE_FAMILIES
)
const workspaceCapabilityConversationTypePolicyUpdateSchema = z.object({
  policies: z
    .record(
      capabilityConversationTypePolicyFamilySchema,
      conversationTypeMaskSchema
    )
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one policy update is required",
    }),
})

// ── Helpers ──

type WorkspaceParams = { workspaceId: string }

async function canWorkspacePermission(
  workspaceId: string,
  userId: string,
  action: AccessAction
): Promise<boolean> {
  return authorizeAction({
    subject: await resolveWorkspaceAccessSubject(workspaceId, userId),
    action,
    resourceId: workspaceId,
  })
}

async function requireWorkspacePermission(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  action: AccessAction,
  errorMessage = "Forbidden"
): Promise<boolean> {
  return requireRequestAction(
    request,
    reply,
    action,
    request.params.workspaceId,
    errorMessage
  )
}

// ── Handlers ──

export async function handleCreateWorkspace(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = createWorkspaceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  const workspace = await createWorkspace({
    name: parsed.data.name,
    description: parsed.data.description,
    userId: request.user!.userId,
  })

  return reply.status(201).send(workspace)
}

export async function handleListWorkspaces(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const workspaces = await listUserWorkspaces(request.user!.userId)
  return reply.send({ data: workspaces })
}

export async function handleGetWorkspace(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.view",
    "Not allowed to view this workspace"
  )
  if (!allowed) return

  const workspace = await getWorkspaceById(request.params.workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: "Workspace not found" })
  }

  return reply.send(workspace)
}

export async function handleUpdateWorkspace(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage",
    "Not allowed to manage this workspace"
  )
  if (!allowed) return

  const parsed = updateWorkspaceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  const workspace = await updateWorkspace(
    request.params.workspaceId,
    parsed.data
  )
  if (!workspace) {
    return reply.status(404).send({ error: "Workspace not found" })
  }

  return reply.send(workspace)
}

export async function handleAddMember(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to manage workspace members"
  )
  if (!allowed) return

  const parsed = addMemberSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  const member = await addMember({
    workspaceId: request.params.workspaceId,
    userId: parsed.data.userId,
    trustLevel: parsed.data.trustLevel,
  })

  if (!member) {
    return reply
      .status(409)
      .send({ error: "User is already a member of this workspace" })
  }

  return reply.status(201).send(member)
}

export async function handleListMembers(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to view workspace members"
  )
  if (!allowed) return

  const members = await listMembers(request.params.workspaceId)
  return reply.send({ data: members })
}

export async function handleListWorkspaceAccess(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to view workspace access"
  )
  if (!allowed) return

  const accessBindings = await listWorkspaceAccessBindings(
    request.params.workspaceId
  )
  return reply.send({ data: accessBindings })
}

export async function handleGetWorkspaceCapabilityConversationTypePolicies(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage",
    "Not allowed to view workspace capability policies"
  )
  if (!allowed) return

  return reply.send(
    await listWorkspaceCapabilityConversationTypePolicies(
      request.params.workspaceId
    )
  )
}

export async function handleUpdateWorkspaceCapabilityConversationTypePolicies(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage",
    "Not allowed to manage workspace capability policies"
  )
  if (!allowed) return

  const parsed =
    workspaceCapabilityConversationTypePolicyUpdateSchema.safeParse(
      request.body
    )
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  return reply.send(
    await updateWorkspaceCapabilityConversationTypePolicies({
      workspaceId: request.params.workspaceId,
      policies: parsed.data.policies,
    })
  )
}

export async function handleGetWorkspaceChiefActorPreference(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.view",
    "Not allowed to view this workspace"
  )
  if (!allowed) return

  const userId = request.user!.userId
  const workspaceMemberId = request.workspaceMember?.id as
    | string
    | undefined
  if (!workspaceMemberId) {
    return reply.status(403).send({
      error: "Workspace membership required for chief actor preference",
    })
  }
  const preference = await getWorkspaceChiefActorPreference(
    request.params.workspaceId,
    userId
  )
  return reply.send(preference)
}

export async function handleUpdateWorkspaceChiefActorPreference(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.view",
    "Not allowed to update preferences for this workspace"
  )
  if (!allowed) return

  const parsed = chiefActorPreferenceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  try {
    const workspaceMemberId = request.workspaceMember?.id as
      | string
      | undefined
    if (!workspaceMemberId) {
      return reply.status(403).send({
        error: "Workspace membership required for chief actor preference",
      })
    }
    const preference = await updateWorkspaceChiefActorPreference(
      request.params.workspaceId,
      request.user!.userId,
      parsed.data.chiefActorId
    )
    return reply.send(preference)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update chief actor preference"
    return reply.status(400).send({ error: message })
  }
}

export async function handleGetWorkspaceNavigation(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const userId = request.user!.userId
  const { workspaceId } = request.params

  const [canViewWorkspace, canAccessWorkspaceModels, canAccessWorkspaceAccess] =
    await Promise.all([
      canWorkspacePermission(workspaceId, userId, "workspace.view"),
      canWorkspacePermission(workspaceId, userId, "workspace.manage_models"),
      canWorkspacePermission(workspaceId, userId, "workspace.manage_members"),
    ])

  return reply.send({
    data: {
      canViewWorkspace,
      canAccessWorkspaceModels,
      canAccessWorkspaceMemberModels: canViewWorkspace,
      canAccessWorkspaceAccess,
    },
  })
}

export async function handleGrantWorkspaceAccess(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to manage workspace access"
  )
  if (!allowed) return

  const parsed = workspaceAccessSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  try {
    const accessBinding = await grantWorkspaceAccess({
      workspaceId: request.params.workspaceId,
      workspaceMemberId: parsed.data.workspaceMemberId,
      accessKey: parsed.data.accessKey as WorkspaceAccessKey,
      assignedByWorkspaceMemberId: request.workspaceMember!.id,
    })
    return reply.status(201).send(accessBinding)
  } catch (err: any) {
    const msg = err.message || "Failed to grant workspace access"
    if (msg === "Workspace member is not part of this workspace") {
      return reply.status(400).send({ error: msg })
    }
    if (msg === "Access already granted") {
      return reply.status(409).send({ error: msg })
    }
    throw err
  }
}

export async function handleRevokeWorkspaceAccess(
  request: FastifyRequest<{
    Params: WorkspaceParams & {
      workspaceMemberId: string
      accessKey: WorkspaceAccessKey
    }
  }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request as FastifyRequest<{ Params: WorkspaceParams }>,
    reply,
    "workspace.manage_members",
    "Not allowed to manage workspace access"
  )
  if (!allowed) return

  try {
    await revokeWorkspaceAccess(
      request.params.workspaceId,
      request.params.workspaceMemberId,
      request.params.accessKey
    )
    return reply.status(204).send()
  } catch (err: any) {
    const msg = err.message || "Failed to revoke workspace access"
    if (msg === "Access grant not found") {
      return reply.status(404).send({ error: msg })
    }
    throw err
  }
}

// ── Invite Handlers ──

type InviteParams = { workspaceId: string; inviteId: string }
type TokenParams = { token: string }

export async function handleCreateInvite(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to manage workspace invites"
  )
  if (!allowed) return

  const parsed = createInviteSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Validation failed", details: parsed.error.flatten() })
  }

  const invite = await createInvite({
    workspaceId: request.params.workspaceId,
    createdByWorkspaceMemberId: request.workspaceMember!.id,
    trustLevel: parsed.data.trustLevel,
    maxUses: parsed.data.maxUses,
    expiresAt: parsed.data.expiresAt,
  })

  return reply.status(201).send(invite)
}

export async function handleListInvites(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request,
    reply,
    "workspace.manage_members",
    "Not allowed to view workspace invites"
  )
  if (!allowed) return

  const invites = await listWorkspaceInvites(request.params.workspaceId)
  return reply.send({ data: invites })
}

export async function handleRevokeInvite(
  request: FastifyRequest<{ Params: InviteParams }>,
  reply: FastifyReply
) {
  const allowed = await requireWorkspacePermission(
    request as FastifyRequest<{ Params: WorkspaceParams }>,
    reply,
    "workspace.manage_members",
    "Not allowed to manage workspace invites"
  )
  if (!allowed) return

  const { workspaceId, inviteId } = request.params

  const revoked = await revokeInvite(inviteId, workspaceId)
  if (!revoked) {
    return reply.status(404).send({ error: "Invite not found" })
  }
  return reply.send(revoked)
}

export async function handleGetInviteInfo(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply
) {
  const invite = await getInviteByToken(request.params.token)
  if (!invite || invite.isRevoked) {
    return reply.status(404).send({ error: "Invite not found or revoked" })
  }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return reply.status(410).send({ error: "Invite has expired" })
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    return reply.status(410).send({ error: "Invite has reached maximum uses" })
  }

  // Return public info only
  return reply.send({
    token: invite.token,
    workspaceName: invite.workspaceName,
    trustLevel: invite.trustLevel,
  })
}

export async function handleRedeemInvite(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply
) {
  const userId = request.user!.userId
  try {
    const result = await redeemInvite(request.params.token, userId)
    return reply.send(result)
  } catch (err: any) {
    const msg = err.message || "Failed to redeem invite"
    if (msg === "Already a member of this workspace") {
      return reply.status(409).send({ error: msg })
    }
    return reply.status(400).send({ error: msg })
  }
}

// ── Plugin registration ──

export async function registerWorkspaceRoutes(fastify: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }
  const workspaceAuthHook = {
    preHandler: [authMiddleware, workspaceMiddleware],
  }
  const optionalAuthHook = { preHandler: [optionalAuth] }

  // Workspace collection routes
  fastify.post("/api/v1/workspaces", authHook, handleCreateWorkspace)
  fastify.get("/api/v1/workspaces", authHook, handleListWorkspaces)

  // Workspace instance routes
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId",
    workspaceAuthHook,
    handleGetWorkspace
  )
  fastify.put<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId",
    workspaceAuthHook,
    handleUpdateWorkspace
  )

  // Workspace member routes
  fastify.post<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/members",
    workspaceAuthHook,
    handleAddMember
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/members",
    workspaceAuthHook,
    handleListMembers
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/navigation",
    authHook,
    handleGetWorkspaceNavigation
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/preferences/chief-actor",
    workspaceAuthHook,
    handleGetWorkspaceChiefActorPreference
  )
  fastify.put<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/preferences/chief-actor",
    workspaceAuthHook,
    handleUpdateWorkspaceChiefActorPreference
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/access",
    workspaceAuthHook,
    handleListWorkspaceAccess
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/capability-conversation-type-policies",
    workspaceAuthHook,
    handleGetWorkspaceCapabilityConversationTypePolicies
  )
  fastify.put<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/capability-conversation-type-policies",
    workspaceAuthHook,
    handleUpdateWorkspaceCapabilityConversationTypePolicies
  )
  fastify.post<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/access",
    workspaceAuthHook,
    handleGrantWorkspaceAccess
  )
  fastify.post<{
    Params: WorkspaceParams & {
      workspaceMemberId: string
      accessKey: WorkspaceAccessKey
    }
  }>(
    "/api/v1/workspaces/:workspaceId/access/:accessKey/members/:workspaceMemberId/revoke",
    workspaceAuthHook,
    handleRevokeWorkspaceAccess
  )

  // Workspace invite management (requires workspace membership)
  fastify.post<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/invites",
    workspaceAuthHook,
    handleCreateInvite
  )
  fastify.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/invites",
    workspaceAuthHook,
    handleListInvites
  )
  fastify.delete<{ Params: InviteParams }>(
    "/api/v1/workspaces/:workspaceId/invites/:inviteId",
    workspaceAuthHook,
    handleRevokeInvite
  )

  // Public invite routes (by token)
  fastify.get<{ Params: TokenParams }>(
    "/api/v1/invites/:token",
    optionalAuthHook,
    handleGetInviteInfo
  )
  fastify.post<{ Params: TokenParams }>(
    "/api/v1/invites/:token/redeem",
    authHook,
    handleRedeemInvite
  )
}
