import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify"
import { db, type TableInsert } from "../database/kysely.js"

export function auditMiddleware(app: FastifyInstance) {
  app.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only audit mutating requests
      if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return

      const action = deriveAction(request.method, request.url)
      if (!action) return

      try {
        await db
          .insertInto("audit_logs")
          .values({
            workspace_id: (request.params as { workspaceId?: string })?.workspaceId || null,
            user_id: request.user?.userId || null,
            action,
            resource_type: deriveResourceType(request.url),
            resource_id: (request.params as { id?: string })?.id || null,
            details: {
              method: request.method,
              url: request.url,
              statusCode: reply.statusCode,
            } as TableInsert<"audit_logs">["details"],
            ip_address: request.ip,
          })
          .execute()
      } catch (err) {
        console.error("Audit log insert failed:", (err as Error).message)
      }
    }
  )
}

function deriveAction(method: string, url: string): string | null {
  const segments = url.split("/").filter(Boolean)
  const resource = segments.find(
    (s) => !s.match(/^[0-9a-f-]{36}$/i) && s !== "api" && s !== "v1"
  )
  if (!resource) return null

  const actionMap: Record<string, string> = {
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  }

  return `${resource}.${actionMap[method] || method.toLowerCase()}`
}

function deriveResourceType(url: string): string {
  const segments = url.split("/").filter(Boolean)
  return (
    segments.find(
      (s) => !s.match(/^[0-9a-f-]{36}$/i) && s !== "api" && s !== "v1"
    ) || "unknown"
  )
}
