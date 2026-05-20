import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import {
  ACTOR_DOC_TEMPLATES,
  ACTOR_DOC_VISIBILITIES,
  ACTOR_PACKAGE_SYNC_MODES,
  ACTOR_ROLES,
  CANONICAL_FILE_CATEGORIES,
  type ActorDoc,
} from "@synapse/shared"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import { workspaceMemberSubject } from "../access/service.js"
import type { AccessAction } from "../access/actions.js"
import * as service from "./service.js"

const actorDocKeys = new Set(
  ACTOR_DOC_TEMPLATES.map((template) => template.key)
)

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

const actorDocSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.custom<ActorDoc["key"]>(
    (value) =>
      typeof value === "string" &&
      (actorDocKeys.has(value as any) || value === "custom"),
    { message: "Invalid actor doc key" }
  ),
  title: z.string().min(1).max(255),
  content: z.array(contentBlockSchema).default([]),
  visibility: z.enum(ACTOR_DOC_VISIBILITIES),
  priority: z.number().int().min(-1000).max(1000),
})

const createActorSchema = z
  .object({
    name: z.string().min(1).max(255),
    role: z.enum(ACTOR_ROLES),
    title: z.string().max(255).default(""),
    avatarFileId: z.string().uuid().optional(),
    avatarEmoji: z.string().min(1).max(32).optional(),
    canRepresentUser: z.boolean().default(false),
    docs: z.array(actorDocSchema).optional(),
    parentId: z.string().uuid().optional(),
    specialties: z.array(z.string()).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((body) => !(body.avatarFileId && body.avatarEmoji), {
    message: "avatarFileId and avatarEmoji are mutually exclusive",
    path: ["avatarEmoji"],
  })

const updateActorSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    role: z.enum(ACTOR_ROLES).optional(),
    title: z.string().max(255).optional(),
    avatarFileId: z.string().uuid().nullable().optional(),
    avatarEmoji: z.string().min(1).max(32).nullable().optional(),
    canRepresentUser: z.boolean().optional(),
    docs: z.array(actorDocSchema).optional(),
    parentId: z.string().uuid().nullable().optional(),
    specialties: z.array(z.string()).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((body) => !(body.avatarFileId && body.avatarEmoji), {
    message: "avatarFileId and avatarEmoji are mutually exclusive",
    path: ["avatarEmoji"],
  })

const installActorPackageSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  title: z.string().max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
  syncMode: z.enum(ACTOR_PACKAGE_SYNC_MODES).default("notify"),
})

type WorkspaceParams = { workspaceId: string }

async function requireWorkspacePermission(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  action: AccessAction,
  errorMessage: string
) {
  return requireRequestAction(
    request,
    reply,
    action,
    request.params.workspaceId,
    errorMessage
  )
}

async function requireActorPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  actorId: string,
  action: AccessAction,
  errorMessage: string
) {
  return requireRequestAction(request, reply, action, actorId, errorMessage)
}

export async function organizationController(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware)
  app.addHook("onRequest", workspaceMiddleware)

  app.post("/", async (request, reply) => {
    const allowed = await requireWorkspacePermission(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      "workspace.manage_actors",
      "Not allowed to manage actors"
    )
    if (!allowed) return

    const parsed = createActorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() })
    }

    try {
      const actor = await service.createActor({
        workspaceId: (request.params as WorkspaceParams).workspaceId,
        createdByWorkspaceMemberId: request.workspaceMember!.id,
        ...parsed.data,
      })
      return reply.status(201).send(actor)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create actor"
      return reply.status(400).send({ error: message })
    }
  })

  app.get("/", async (request, reply) => {
    const { workspaceId } = request.params as WorkspaceParams
    const actors = await service.listActors(
      workspaceId,
      workspaceMemberSubject(request.workspaceMember!.id)
    )
    return reply.send(actors)
  })

  app.get("/tree", async (request, reply) => {
    const { workspaceId } = request.params as WorkspaceParams
    const tree = await service.getFullOrgTree(
      workspaceId,
      workspaceMemberSubject(request.workspaceMember!.id)
    )
    return reply.send(tree)
  })

  app.get("/packages", async (request, reply) => {
    const { workspaceId } = request.params as WorkspaceParams
    const { search } = request.query as { search?: string }
    const packages = await service.listActorPackages({ workspaceId, search })
    return reply.send(packages)
  })

  app.get("/packages/:packageId", async (request, reply) => {
    try {
      const { workspaceId, packageId } = request.params as WorkspaceParams & {
        packageId: string
      }
      const actorPackage = await service.getActorPackage(packageId, workspaceId)
      return reply.send(actorPackage)
    } catch (error) {
      return reply.status(404).send({
        error:
          error instanceof Error ? error.message : "Actor package not found",
      })
    }
  })

  app.post("/packages/:packageId/install", async (request, reply) => {
    const allowed = await requireWorkspacePermission(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      "workspace.manage_actors",
      "Not allowed to manage actors"
    )
    if (!allowed) return

    const parsed = installActorPackageSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() })
    }

    try {
      const { workspaceId, packageId } = request.params as WorkspaceParams & {
        packageId: string
      }
      const result = await service.installActorPackage({
        workspaceId,
        packageId,
        createdByWorkspaceMemberId: request.workspaceMember!.id,
        name: parsed.data.name,
        title: parsed.data.title,
        parentId: parsed.data.parentId,
        syncMode: parsed.data.syncMode,
      })
      return reply.status(201).send(result)
    } catch (error) {
      return reply.status(400).send({
        error:
          error instanceof Error
            ? error.message
            : "Failed to install actor package",
      })
    }
  })

  app.get("/:actorId/versions", async (request, reply) => {
    const { workspaceId, actorId } = request.params as WorkspaceParams & {
      actorId: string
    }
    const allowed = await requireActorPermission(
      request,
      reply,
      actorId,
      "actor.view",
      "Not allowed to view this actor"
    )
    if (!allowed) return

    const versions = await service.listActorVersions(actorId, workspaceId)
    return reply.send(versions)
  })

  app.get("/:actorId", async (request, reply) => {
    const { workspaceId, actorId } = request.params as WorkspaceParams & {
      actorId: string
    }
    const allowed = await requireActorPermission(
      request,
      reply,
      actorId,
      "actor.view",
      "Not allowed to view this actor"
    )
    if (!allowed) return

    const actor = await service.getActor(actorId, workspaceId)
    if (!actor) {
      return reply.status(404).send({ error: "Actor not found" })
    }

    return reply.send(actor)
  })

  app.put("/:actorId", async (request, reply) => {
    const { workspaceId, actorId } = request.params as WorkspaceParams & {
      actorId: string
    }
    const allowed = await requireActorPermission(
      request,
      reply,
      actorId,
      "actor.edit",
      "Not allowed to edit this actor"
    )
    if (!allowed) return

    const parsed = updateActorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() })
    }

    try {
      const actor = await service.updateActor(
        actorId,
        workspaceId,
        parsed.data,
        {
          type: "workspace_member",
          workspaceMemberId: request.workspaceMember!.id,
          reason: "user_edit",
        }
      )
      if (!actor) {
        return reply.status(404).send({ error: "Actor not found" })
      }
      return reply.send(actor)
    } catch (error) {
      return reply.status(400).send({
        error:
          error instanceof Error ? error.message : "Failed to update actor",
      })
    }
  })

  app.delete("/:actorId", async (request, reply) => {
    const { workspaceId, actorId } = request.params as WorkspaceParams & {
      actorId: string
    }
    const allowed = await requireActorPermission(
      request,
      reply,
      actorId,
      "actor.delete",
      "Not allowed to delete this actor"
    )
    if (!allowed) return

    const deleted = await service.deleteActor(actorId, workspaceId)
    if (!deleted) {
      return reply.status(404).send({ error: "Actor not found" })
    }
    return reply.status(204).send()
  })
}
