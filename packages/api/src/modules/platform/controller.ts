import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { PLATFORM_ACCESS_KEYS } from "@synapse/shared/constants"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { PLATFORM_RESOURCE_ID } from "../access/core.js"
import {
  grantPlatformAccess,
  listPlatformAccessBindings,
  revokePlatformAccess,
  type PlatformAccessKey,
} from "./admin-service.js"
import { requireRequestAction } from "../access/guards.js"
import { authorizeAction, userSubject } from "../access/service.js"

const platformAccessSchema = z.object({
  userId: z.string().uuid(),
  accessKey: z.enum(PLATFORM_ACCESS_KEYS),
})

async function requirePlatformManagePermission(
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

async function canPlatformPermission(userId: string) {
  return authorizeAction({
    subject: userSubject(userId),
    action: "platform.manage",
    resourceId: PLATFORM_RESOURCE_ID,
  })
}

export function registerPlatformRoutes(app: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }

  app.get("/api/v1/platform/navigation", authHook, async (request, reply) => {
    const userId = request.user!.userId
    const canManagePlatform = await canPlatformPermission(userId)

    return reply.send({
      data: {
        canAccessPlatformModels: canManagePlatform,
        canAccessPlatformAccess: canManagePlatform,
        canAccessPlatformSkills: canManagePlatform,
      },
    })
  })

  app.get("/api/v1/platform/access", authHook, async (request, reply) => {
    const allowed = await requirePlatformManagePermission(
      request,
      reply,
      "Not allowed to manage platform access"
    )
    if (!allowed) return

    const accessBindings = await listPlatformAccessBindings()
    return reply.send({ data: accessBindings })
  })

  app.post("/api/v1/platform/access", authHook, async (request, reply) => {
    const allowed = await requirePlatformManagePermission(
      request,
      reply,
      "Not allowed to manage platform access"
    )
    if (!allowed) return

    const parsed = platformAccessSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() })
    }

    try {
      const accessBinding = await grantPlatformAccess({
        userId: parsed.data.userId,
        accessKey: parsed.data.accessKey as PlatformAccessKey,
        assignedByUserId: request.user!.userId,
      })
      return reply.status(201).send(accessBinding)
    } catch (err: any) {
      const msg = err.message || "Failed to grant platform access"
      if (msg === "User not found") {
        return reply.status(404).send({ error: msg })
      }
      if (msg === "Access already granted") {
        return reply.status(409).send({ error: msg })
      }
      throw err
    }
  })

  app.post<{
    Params: { accessKey: PlatformAccessKey; userId: string }
  }>(
    "/api/v1/platform/access/:accessKey/users/:userId/revoke",
    authHook,
    async (request, reply) => {
      const allowed = await requirePlatformManagePermission(
        request,
        reply,
        "Not allowed to manage platform access"
      )
      if (!allowed) return

      try {
        await revokePlatformAccess(
          request.params.userId,
          request.params.accessKey
        )
        return reply.status(204).send()
      } catch (err: any) {
        const msg = err.message || "Failed to revoke platform access"
        if (msg === "Access grant not found") {
          return reply.status(404).send({ error: msg })
        }
        if (msg === "Config-managed access cannot be revoked manually") {
          return reply.status(409).send({ error: msg })
        }
        throw err
      }
    }
  )
}
