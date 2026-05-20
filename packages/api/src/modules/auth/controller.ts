import { z } from "zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  AUTH_CLIENT_TYPES,
  AUTH_SESSION_PERSISTENCES,
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_TRANSPORTS,
  type AuthSessionPersistence,
} from "@synapse/shared"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { AuthError, createAuthService } from "./service.js"

const authClientTypeSchema = z.enum(AUTH_CLIENT_TYPES)
const authTransportSchema = z.enum(AUTH_TRANSPORTS)
const authSessionPersistenceSchema = z.enum(AUTH_SESSION_PERSISTENCES)

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
  clientType: authClientTypeSchema.optional(),
  transport: authTransportSchema.optional(),
  sessionPersistence: authSessionPersistenceSchema.optional(),
  deviceName: z.string().trim().min(1).max(255).optional(),
  platform: z.string().trim().min(1).max(120).optional(),
})

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  clientType: authClientTypeSchema.optional(),
  transport: authTransportSchema.optional(),
  sessionPersistence: authSessionPersistenceSchema.optional(),
  deviceName: z.string().trim().min(1).max(255).optional(),
  platform: z.string().trim().min(1).max(120).optional(),
})

const updateMeSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    avatarFileId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.avatarFileId !== undefined,
    {
      message: "At least one field is required",
    }
  )

const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
})

const qrLoginRequestParamsSchema = z.object({
  requestId: z.string().uuid(),
})

const qrLoginTokenSchema = z.object({
  token: z.string().trim().min(16).max(255),
})

const qrLoginApproveSchema = qrLoginTokenSchema.extend({
  sessionPersistence: authSessionPersistenceSchema.optional(),
})

const qrLoginFinalizeSchema = z.object({
  browserToken: z.string().trim().min(16).max(255),
})

const qrLoginStatusHeadersSchema = z.object({
  "x-browser-token": z.string().trim().min(16).max(255),
})

function getCookieOptions(
  sessionPersistence: AuthSessionPersistence = "persistent"
) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    ...(sessionPersistence === "persistent"
      ? { maxAge: AUTH_SESSION_MAX_AGE_SECONDS }
      : {}),
  }
}

function setSessionCookie(
  reply: FastifyReply,
  sessionToken: string,
  sessionPersistence?: AuthSessionPersistence
) {
  reply.setCookie(
    AUTH_SESSION_COOKIE_NAME,
    sessionToken,
    getCookieOptions(sessionPersistence)
  )
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(AUTH_SESSION_COOKIE_NAME, { path: "/" })
}

function handleAuthError(error: unknown, reply: FastifyReply) {
  if (error instanceof AuthError) {
    return reply
      .status(error.statusCode)
      .send({ error: error.message, code: error.code })
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: error.errors.map((item) => ({
        field: item.path.join("."),
        message: item.message,
      })),
    })
  }
  throw error
}

function buildSessionContext(
  request: FastifyRequest,
  input: z.infer<typeof loginSchema> | z.infer<typeof registerSchema>
) {
  return {
    request,
    clientType: input.clientType,
    transport: input.transport,
    sessionPersistence: input.sessionPersistence,
    deviceName: input.deviceName,
    platform: input.platform,
  }
}

export function registerAuthRoutes(app: FastifyInstance) {
  const authService = createAuthService(app)

  app.post(
    "/api/v1/auth/register",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = registerSchema.parse(request.body)
        const result = await authService.register(
          body.email,
          body.password,
          body.name,
          buildSessionContext(request, body)
        )

        if (result.session.transport === "cookie" && result.sessionToken) {
          setSessionCookie(
            reply,
            result.sessionToken,
            result.sessionPersistence
          )
        }

        return reply.status(201).send({
          user: result.user,
          session: result.session,
          ...(result.session.transport === "token"
            ? { sessionToken: result.sessionToken }
            : {}),
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = loginSchema.parse(request.body)
        const result = await authService.login(
          body.email,
          body.password,
          buildSessionContext(request, body)
        )

        if (result.session.transport === "cookie" && result.sessionToken) {
          setSessionCookie(
            reply,
            result.sessionToken,
            result.sessionPersistence
          )
        }

        return reply.status(200).send({
          user: result.user,
          session: result.session,
          ...(result.session.transport === "token"
            ? { sessionToken: result.sessionToken }
            : {}),
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/qr-login/requests",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply
          .status(201)
          .send(await authService.createQrLoginRequest(request))
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.get(
    "/api/v1/auth/qr-login/requests/:requestId/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = qrLoginRequestParamsSchema.parse(request.params)
        const headers = qrLoginStatusHeadersSchema.parse(request.headers)
        return reply
          .status(200)
          .send(
            await authService.getQrLoginRequestStatus(
              params.requestId,
              headers["x-browser-token"]
            )
          )
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/qr-login/resolve",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = qrLoginTokenSchema.parse(request.body)
        return reply
          .status(200)
          .send(
            await authService.resolveQrLoginRequest(
              body.token,
              request.user.userId
            )
          )
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/qr-login/approve",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = qrLoginApproveSchema.parse(request.body)
        return reply
          .status(200)
          .send(
            await authService.approveQrLoginRequest(
              body.token,
              request.user.userId,
              body.sessionPersistence ?? "persistent"
            )
          )
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/qr-login/reject",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = qrLoginTokenSchema.parse(request.body)
        return reply
          .status(200)
          .send(
            await authService.rejectQrLoginRequest(
              body.token,
              request.user.userId
            )
          )
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/qr-login/requests/:requestId/finalize",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = qrLoginRequestParamsSchema.parse(request.params)
        const body = qrLoginFinalizeSchema.parse(request.body)
        const result = await authService.finalizeQrLoginRequest(
          params.requestId,
          body.browserToken,
          request
        )

        if (result.session.transport === "cookie" && result.sessionToken) {
          setSessionCookie(
            reply,
            result.sessionToken,
            result.sessionPersistence
          )
        }

        return reply.status(200).send({
          user: result.user,
          session: result.session,
          ...(result.session.transport === "token"
            ? { sessionToken: result.sessionToken }
            : {}),
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/logout",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currentSession = request.authSession
        await authService.logoutCurrentSession(currentSession.id)
        clearSessionCookie(reply)
        return reply.status(204).send()
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.post(
    "/api/v1/auth/logout-all",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await authService.logoutAllSessions(request.user.userId)
        clearSessionCookie(reply)
        return reply.status(204).send()
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.get(
    "/api/v1/auth/me",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.status(200).send({
          user: await authService.getProfile(request.user.userId),
          session: request.authSession,
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.put(
    "/api/v1/auth/me",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = updateMeSchema.parse(request.body)
        return reply.status(200).send({
          user: await authService.updateProfile(request.user.userId, {
            name: body.name,
            avatarFileId: body.avatarFileId,
          }),
          session: request.authSession,
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.get(
    "/api/v1/auth/sessions",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.status(200).send({
          sessions: await authService.listSessions(
            request.user.userId,
            request.authSession.id
          ),
        })
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )

  app.delete(
    "/api/v1/auth/sessions/:sessionId",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = sessionParamsSchema.parse(request.params)
        const currentSessionId = request.authSession.id as string
        await authService.revokeSessionForUser(
          request.user.userId,
          params.sessionId
        )

        if (params.sessionId === currentSessionId) {
          clearSessionCookie(reply)
        }

        return reply.status(204).send()
      } catch (error) {
        return handleAuthError(error, reply)
      }
    }
  )
}
