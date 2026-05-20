import type { FastifyReply, FastifyRequest } from "fastify"
import { AUTH_SESSION_COOKIE_NAME } from "@synapse/shared"
import { authenticateRequestSession } from "../../modules/auth/service.js"

async function attachAuthenticatedRequest(request: FastifyRequest) {
  const authenticated = await authenticateRequestSession(request)
  if (!authenticated) return null
  request.user = {
    userId: authenticated.user.id,
    email: authenticated.user.email,
  }
  request.authSession = authenticated.session

  return authenticated
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authenticated = await attachAuthenticatedRequest(request)
  if (authenticated) return

  if (request.cookies?.[AUTH_SESSION_COOKIE_NAME]) {
    reply.clearCookie(AUTH_SESSION_COOKIE_NAME, { path: "/" })
  }

  return reply.status(401).send({
    error: "Authentication required",
    code: "UNAUTHENTICATED",
  })
}

export async function optionalAuth(request: FastifyRequest) {
  await attachAuthenticatedRequest(request)
}

export function getUserId(request: FastifyRequest): string {
  return request.user?.userId ?? ""
}
