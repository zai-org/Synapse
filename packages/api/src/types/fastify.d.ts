import type { AuthSessionSummary } from "@synapse/shared"

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: string
      email: string
    }
    authSession?: AuthSessionSummary
    workspaceMember?: {
      id: string
      workspace_id: string
      user_id: string
      trust_level: string
    } | null
  }
}
