import type { FastifyRequest, FastifyReply } from "fastify"
import { requireRequestAction } from "../../modules/access/guards.js"
import { db } from "../database/kysely.js"

export async function workspaceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const workspaceId = (request.params as { workspaceId?: string }).workspaceId
  if (!workspaceId) {
    return reply.status(400).send({ error: "Workspace ID is required" })
  }

  const user = request.user
  if (!user) {
    return reply.status(401).send({ error: "Authentication required" })
  }

  const member = await db
    .selectFrom("workspace_members")
    .select(["id", "workspace_id", "user_id", "trust_level"])
    .where("workspace_id", "=", workspaceId)
    .where("user_id", "=", user.userId)
    .executeTakeFirst()

  request.workspaceMember = member ?? null

  const allowed = await requireRequestAction(
    request,
    reply,
    "workspace.view",
    workspaceId,
    "Not allowed to access this workspace"
  )
  if (!allowed) {
    return
  }
}
