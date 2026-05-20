import type { FastifyInstance, FastifyReply } from "fastify"
import { z } from "zod"
import { USER_UPLOAD_FILE_ORIGIN_SYSTEMS } from "@synapse/shared/constants"
import type {
  FileCreateOriginInput,
  UserUploadFileOriginSystem,
} from "@synapse/shared/types"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import {
  getFileRecord,
  buildUserUploadOrigin,
  getFileDetail,
  uploadFile,
  canUserAccessFileWorkspace,
  readFileBufferById,
} from "./service.js"
import {
  enqueueFileParse,
  getLatestAvailableFileParse,
} from "./parse-service.js"

const fileUploadOriginSchema = z
  .object({
    family: z.literal("user_upload"),
    system: z.enum(USER_UPLOAD_FILE_ORIGIN_SYSTEMS),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

async function sendStoredFile(
  reply: FastifyReply,
  info: {
    fileId: string
    mimeType: string
    originalName: string
  }
) {
  try {
    const buffer = await readFileBufferById(info.fileId)
    if (!buffer) {
      return reply.status(404).send({ error: "File not found" })
    }
    reply.type(info.mimeType || "application/octet-stream")
    reply.header(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(info.originalName || "file")}`
    )
    return reply.send(buffer)
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return reply.status(404).send({ error: "File not found" })
    }
    throw error
  }
}

export async function filesUploadController(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware)
  app.addHook("onRequest", workspaceMiddleware)

  app.post<{
    Params: { workspaceId: string }
  }>("/workspaces/:workspaceId/files", async (request, reply) => {
    const { workspaceId } = request.params
    const userId = request.user!.userId

    let filePart: Awaited<ReturnType<typeof request.file>> | null = null
    let originInput: FileCreateOriginInput | null = null
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (!filePart) {
            filePart = part
          } else {
            part.file.resume()
          }
          continue
        }

        if (part.fieldname === "origin" && typeof part.value === "string") {
          try {
            originInput = JSON.parse(part.value) as FileCreateOriginInput
          } catch {
            return reply
              .status(400)
              .send({ error: "origin must be valid JSON" })
          }
        }
      }
    } catch {
      return reply.status(413).send({ error: "File too large (max 25MB)" })
    }

    if (!filePart) {
      return reply.status(400).send({ error: "No file provided" })
    }

    let buffer
    try {
      buffer = await filePart.toBuffer()
    } catch {
      return reply.status(413).send({ error: "File too large (max 25MB)" })
    }

    const parsedOrigin = fileUploadOriginSchema.safeParse(originInput)
    if (!parsedOrigin.success) {
      return reply.status(400).send({
        error: `Invalid origin: ${parsedOrigin.error.issues.map((issue) => issue.message).join(" ")}`,
      })
    }

    const record = await uploadFile(
      buffer,
      filePart.filename,
      filePart.mimetype,
      workspaceId,
      userId,
      buildUserUploadOrigin({
        system: parsedOrigin.data.system as UserUploadFileOriginSystem,
        initiatorUserId: userId,
        details: parsedOrigin.data.details,
      })
    )
    return reply.status(201).send(record)
  })
}

export async function filesReadController(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware)

  app.get<{
    Params: { fileId: string }
  }>("/files/:fileId/info", async (request, reply) => {
    const userId = request.user!.userId
    const detail = await getFileDetail(request.params.fileId)
    if (!detail) {
      return reply.status(404).send({ error: "File not found" })
    }

    const allowed = await canUserAccessFileWorkspace(
      detail.workspaceId ?? null,
      userId
    )
    if (!allowed) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    return detail
  })

  app.get<{
    Params: { fileId: string }
  }>("/files/:fileId/parses/latest", async (request, reply) => {
    const userId = request.user!.userId
    const detail = await getFileDetail(request.params.fileId)
    if (!detail) {
      return reply.status(404).send({ error: "File not found" })
    }

    const allowed = await canUserAccessFileWorkspace(
      detail.workspaceId ?? null,
      userId
    )
    if (!allowed) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const parse = await getLatestAvailableFileParse(request.params.fileId)
    if (!parse) {
      return reply.status(404).send({ error: "No parse found" })
    }

    return parse
  })

  app.post<{
    Params: { fileId: string }
  }>("/files/:fileId/parses", async (request, reply) => {
    const userId = request.user!.userId
    const detail = await getFileDetail(request.params.fileId)
    if (!detail) {
      return reply.status(404).send({ error: "File not found" })
    }

    const allowed = await canUserAccessFileWorkspace(
      detail.workspaceId ?? null,
      userId
    )
    if (!allowed) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const runId = await enqueueFileParse({
      fileId: request.params.fileId,
      trigger: "manual",
    })
    if (!runId) {
      return reply
        .status(400)
        .send({ error: "File type is not supported for default parsing" })
    }

    return reply.status(202).send({ runId })
  })

  app.get<{
    Params: { fileId: string }
  }>("/files/:fileId", async (request, reply) => {
    const userId = request.user!.userId
    const info = await getFileRecord(request.params.fileId)
    if (!info) {
      return reply.status(404).send({ error: "File not found" })
    }

    const allowed = await canUserAccessFileWorkspace(
      info.workspaceId ?? null,
      userId
    )
    if (!allowed) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    return sendStoredFile(reply, {
      fileId: info.id,
      mimeType: info.mimeType,
      originalName: info.originalName,
    })
  })
}
