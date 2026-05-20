import type { FastifyInstance } from "fastify"
import { validateAutomationRuleCreatePayload } from "@synapse/shared/automation"
import {
  ACCESS_TARGET_TYPES,
  AUTOMATION_COMPLETION_STATUSES,
  AUTOMATION_EVENT_SOURCE_PROVIDER_KINDS,
  AUTOMATION_EVENT_SOURCE_STATUSES,
  AUTOMATION_INTEGRATION_INGRESS_KINDS,
  AUTOMATION_INTEGRATION_PROVIDERS,
  AUTOMATION_INTEGRATION_TARGET_KINDS,
  AUTOMATION_RULE_STATUSES,
  AUTOMATION_SCHEDULE_KINDS,
  AUTOMATION_TARGET_POLICIES,
  AUTOMATION_TRIGGER_KINDS,
  AUTOMATION_TRIGGER_SOURCE_KINDS,
} from "@synapse/shared/constants"
import { z } from "zod"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import {
  archiveAutomationEventSource,
  createAutomationEventSource,
  createAutomationRule,
  createAutomationWebhookEndpoint,
  deleteAutomationRule,
  getAutomationEventSource,
  getAutomationRule,
  ingestAutomationEvent,
  ingestIntegrationAutomationWebhookEvent,
  ingestAutomationWebhookEvent,
  listAutomationOccurrences,
  listAutomationEventSources,
  listAutomationEventSourceAccessState,
  listAutomationExecutions,
  listAutomationRules,
  listAutomationWebhookEndpoints,
  grantAutomationEventSourceAccess,
  revokeAutomationEventSourceAccess,
  updateAutomationEventSource,
  updateAutomationEventSourceAccessGrant,
  updateAutomationRule,
} from "./service.js"
import { enqueueAutomationExecutionJobs } from "../../workers/queues.js"

const contentBlocksSchema = z.array(z.any()).optional()

const triggerSchema = z.object({
  triggerKind: z.enum(AUTOMATION_TRIGGER_KINDS),
  eventSourceId: z.string().uuid().optional(),
  sourceKind: z.enum(AUTOMATION_TRIGGER_SOURCE_KINDS).optional(),
  sourceLocator: z.string().trim().min(1).max(255).optional(),
  matchKey: z.string().trim().min(1).max(255).optional(),
  matcher: z.record(z.unknown()).optional(),
  scheduleKind: z.enum(AUTOMATION_SCHEDULE_KINDS).optional(),
  scheduleExpr: z.string().trim().min(1).max(255).optional(),
  scheduleTimezone: z.string().trim().min(1).max(64).optional(),
  intervalSeconds: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
})

const policySchema = z.object({
  activeFrom: z.string().datetime().optional(),
  activeUntil: z.string().datetime().optional(),
  maxTriggerCount: z.number().int().positive().optional(),
  completionStatus: z.enum(AUTOMATION_COMPLETION_STATUSES).optional(),
})

const deliverySchema = z.object({
  message: z.string().default(""),
  wakeReason: z.string().optional(),
  messageBlocks: contentBlocksSchema,
  targetPolicy: z.enum(AUTOMATION_TARGET_POLICIES).optional(),
  targetParticipantIds: z.array(z.string().uuid()).optional(),
})

const updateDeliverySchema = z.object({
  message: z.string().optional(),
  wakeReason: z.string().optional(),
  messageBlocks: contentBlocksSchema,
  targetPolicy: z.enum(AUTOMATION_TARGET_POLICIES).optional(),
  targetParticipantIds: z.array(z.string().uuid()).optional(),
})

const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().default(""),
  status: z.enum(AUTOMATION_RULE_STATUSES).optional(),
  conversationId: z.string().uuid(),
  trigger: triggerSchema,
  policy: policySchema.optional(),
  delivery: deliverySchema,
  metadata: z.record(z.unknown()).optional(),
})

const updateAutomationSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(AUTOMATION_RULE_STATUSES).optional(),
  conversationId: z.string().uuid().optional(),
  trigger: triggerSchema.partial().optional(),
  policy: policySchema.partial().optional(),
  delivery: updateDeliverySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})

const conversationTypeMaskSchema = z.number().int().min(1).max(31)
const accessTargetSchema = z
  .object({
    type: z.enum(ACCESS_TARGET_TYPES),
    conversationId: z.string().uuid().optional(),
    actorId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.type === "conversation" ||
        value.type === "actor_in_conversation") &&
      !value.conversationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationId"],
        message: "conversationId is required for this access target",
      })
    }
    if (
      (value.type === "actor" || value.type === "actor_in_conversation") &&
      !value.actorId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actorId"],
        message: "actorId is required for this access target",
      })
    }
  })
const accessGrantSchema = z.object({
  accessTarget: accessTargetSchema.optional(),
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
  reason: z.string().trim().min(1).max(500).optional(),
})
const accessGrantUpdateSchema = z.object({
  conversationTypeMaskOverride: conversationTypeMaskSchema
    .nullable()
    .optional(),
})

const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
})

const integrationEventSourceSchema = z.object({
  installationId: z.string().uuid(),
  provider: z.enum(AUTOMATION_INTEGRATION_PROVIDERS),
  ingressKind: z.enum(AUTOMATION_INTEGRATION_INGRESS_KINDS).optional(),
  targetKind: z.enum(AUTOMATION_INTEGRATION_TARGET_KINDS),
  targetId: z.string().trim().min(1).max(255),
  targetLabel: z.string().trim().min(1).max(255).optional(),
})

const eventSourceSchema = z
  .object({
    providerKind: z.enum(AUTOMATION_EVENT_SOURCE_PROVIDER_KINDS),
    providerRef: z.string().trim().min(1).max(255).optional(),
    integration: integrationEventSourceSchema.optional(),
    sourceKey: z.string().trim().min(1).max(255).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).optional(),
    recommendedUsage: z.string().trim().min(1).optional(),
    payloadSchema: z.record(z.unknown()).optional(),
    examplePayload: z.record(z.unknown()).optional(),
    status: z.enum(AUTOMATION_EVENT_SOURCE_STATUSES).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.providerKind === "integration") {
      if (!value.integration) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["integration"],
          message: "integration is required",
        })
      }
      if (!value.sourceKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceKey"],
          message: "sourceKey is required",
        })
      }
      return
    }

    if (!value.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "name is required",
      })
    }
    if (!value.description?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "description is required",
      })
    }
    if (value.providerKind === "webhook" && !value.providerRef?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerRef"],
        message: "providerRef is required",
      })
    }
  })

const updateEventSourceSchema = z.object({
  providerRef: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).optional(),
  recommendedUsage: z.string().trim().min(1).optional(),
  payloadSchema: z.record(z.unknown()).optional(),
  examplePayload: z.record(z.unknown()).optional(),
  status: z.enum(AUTOMATION_EVENT_SOURCE_STATUSES).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const ingestEventSchema = z.object({
  payload: z.record(z.unknown()).optional(),
  sourceSnapshot: z.record(z.unknown()).optional(),
  dedupeKey: z.string().trim().min(1).max(255).optional(),
  occurredAt: z.string().datetime().optional(),
})

const webhookIngressSchema = z
  .object({
    payload: z.record(z.unknown()).optional(),
    sourceSnapshot: z.record(z.unknown()).optional(),
    dedupeKey: z.string().trim().min(1).max(255).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .passthrough()

function extractWebhookSecret(headers: Record<string, unknown>) {
  const direct =
    typeof headers["x-synapse-automation-secret"] === "string"
      ? headers["x-synapse-automation-secret"]
      : typeof headers["x-synapse-webhook-secret"] === "string"
        ? headers["x-synapse-webhook-secret"]
        : ""
  if (direct) return direct

  const authorization =
    typeof headers.authorization === "string"
      ? headers.authorization.trim()
      : ""
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim()
  }
  return ""
}

async function enqueueAutomationExecutions(executionIds: string[]) {
  await enqueueAutomationExecutionJobs(executionIds)
}

export default async function automationController(app: FastifyInstance) {
  const protectedPreHandler = [authMiddleware, workspaceMiddleware]

  app.get(
    "/api/v1/workspaces/:workspaceId/automation-event-sources",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view automation event sources in this workspace"
      )
      if (!allowed) return

      const query = request.query as {
        status?: "active" | "deprecated" | "disabled" | "archived"
        providerKind?: "relay" | "webhook" | "internal" | "integration"
        providerRef?: string
        sourceKey?: string
      }
      return listAutomationEventSources(workspaceId, {
        status: query.status,
        providerKind: query.providerKind,
        providerRef: query.providerRef,
        sourceKey: query.sourceKey,
      })
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/automation-event-sources",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation event sources"
      )
      if (!allowed) return

      const body = eventSourceSchema.parse(request.body)
      const workspaceMemberId = request.workspaceMember!.id as string
      const source = await createAutomationEventSource(
        workspaceId,
        { kind: "workspace_member", workspaceMemberId },
        body
      )
      return reply.status(201).send(source)
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view this automation event source"
      )
      if (!allowed) return

      const source = await getAutomationEventSource(workspaceId, eventSourceId)
      if (!source) {
        return reply
          .status(404)
          .send({ error: "Automation event source not found" })
      }
      return source
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/access",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation event source access"
      )
      if (!allowed) return

      return listAutomationEventSourceAccessState(workspaceId, eventSourceId)
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/access",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation event source access"
      )
      if (!allowed) return

      const body = accessGrantSchema.parse(request.body || {})
      const workspaceMemberId = request.workspaceMember!.id as string
      const grant = await grantAutomationEventSourceAccess({
        workspaceId,
        eventSourceId,
        accessTarget: body.accessTarget,
        conversationTypeMaskOverride: body.conversationTypeMaskOverride,
        grantedByWorkspaceMemberId: workspaceMemberId,
        reason: body.reason,
      })
      return reply.status(201).send({ grant })
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/access/:bindingId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId, bindingId } = request.params as {
        workspaceId: string
        eventSourceId: string
        bindingId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation event source access"
      )
      if (!allowed) return

      const body = accessGrantUpdateSchema.parse(request.body || {})
      const grant = await updateAutomationEventSourceAccessGrant({
        workspaceId,
        eventSourceId,
        bindingId,
        conversationTypeMaskOverride: body.conversationTypeMaskOverride,
      })
      return { grant }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/access/:bindingId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId, bindingId } = request.params as {
        workspaceId: string
        eventSourceId: string
        bindingId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation event source access"
      )
      if (!allowed) return

      const workspaceMemberId = request.workspaceMember!.id as string
      await revokeAutomationEventSourceAccess({
        workspaceId,
        eventSourceId,
        bindingId,
        operator: { workspaceMemberId },
      })
      return { success: true }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/occurrences",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view automation event source history"
      )
      if (!allowed) return

      return listAutomationOccurrences(workspaceId, {
        eventSourceId,
      })
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to update this automation event source"
      )
      if (!allowed) return

      const body = updateEventSourceSchema.parse(request.body)
      const workspaceMemberId = request.workspaceMember!.id as string
      return updateAutomationEventSource(
        workspaceId,
        eventSourceId,
        { workspaceMemberId },
        body
      )
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to archive this automation event source"
      )
      if (!allowed) return

      const workspaceMemberId = request.workspaceMember!.id as string
      await archiveAutomationEventSource(workspaceId, eventSourceId, {
        workspaceMemberId,
      })
      return { success: true }
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/automation-event-sources/:eventSourceId/events",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, eventSourceId } = request.params as {
        workspaceId: string
        eventSourceId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to trigger this automation event source"
      )
      if (!allowed) return

      const body = ingestEventSchema.parse(request.body)
      const result = await ingestAutomationEvent({
        workspaceId,
        eventSourceId,
        payload: body.payload,
        sourceSnapshot: body.sourceSnapshot,
        dedupeKey: body.dedupeKey,
        occurredAt: body.occurredAt,
      })
      await enqueueAutomationExecutions(
        result.executions.map((execution) => execution.id)
      )
      return reply.status(202).send({
        occurrence: result.occurrence,
        executions: result.executions,
      })
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automations",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view automations in this workspace"
      )
      if (!allowed) return

      const query = request.query as {
        status?:
          | "active"
          | "paused"
          | "error"
          | "archived"
          | "completed"
          | "expired"
        category?: "schedule" | "event_subscription"
        conversationId?: string
      }
      return listAutomationRules(workspaceId, {
        status: query.status,
        category: query.category,
        conversationId: query.conversationId,
      })
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/automations",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_conversations",
        workspaceId,
        "Not allowed to manage automations in this workspace"
      )
      if (!allowed) return

      const body = createAutomationSchema.parse(request.body)
      const issues = validateAutomationRuleCreatePayload(body)
      if (issues.length > 0) {
        return reply.status(400).send({
          error: issues[0]!.message,
          issues,
        })
      }
      const workspaceMemberId = request.workspaceMember!.id as string
      const automation = await createAutomationRule(
        workspaceId,
        { kind: "workspace_member", workspaceMemberId },
        body
      )
      return reply.status(201).send(automation)
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automations/:automationId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, automationId } = request.params as {
        workspaceId: string
        automationId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view this automation"
      )
      if (!allowed) return

      const automation = await getAutomationRule(workspaceId, automationId)
      if (!automation) {
        return reply.status(404).send({ error: "Automation not found" })
      }
      return automation
    }
  )

  app.put(
    "/api/v1/workspaces/:workspaceId/automations/:automationId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, automationId } = request.params as {
        workspaceId: string
        automationId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_conversations",
        workspaceId,
        "Not allowed to update this automation"
      )
      if (!allowed) return

      const body = updateAutomationSchema.parse(request.body)
      const workspaceMemberId = request.workspaceMember!.id as string
      try {
        const automation = await updateAutomationRule(
          workspaceId,
          automationId,
          { workspaceMemberId },
          body
        )
        return automation
      } catch (error) {
        if (
          error instanceof Error &&
          (error as Error & { statusCode?: number }).statusCode === 400
        ) {
          return reply.status(400).send({
            error: error.message,
            issues: (error as Error & { issues?: unknown }).issues || [],
          })
        }
        throw error
      }
    }
  )

  app.delete(
    "/api/v1/workspaces/:workspaceId/automations/:automationId",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, automationId } = request.params as {
        workspaceId: string
        automationId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_conversations",
        workspaceId,
        "Not allowed to delete this automation"
      )
      if (!allowed) return

      const workspaceMemberId = request.workspaceMember!.id as string
      await deleteAutomationRule(workspaceId, automationId, {
        workspaceMemberId,
      })
      return { success: true }
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automations/:automationId/executions",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId, automationId } = request.params as {
        workspaceId: string
        automationId: string
      }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.view",
        workspaceId,
        "Not allowed to view automation executions"
      )
      if (!allowed) return

      return listAutomationExecutions(workspaceId, automationId)
    }
  )

  app.get(
    "/api/v1/workspaces/:workspaceId/automation-webhooks",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to view automation webhooks"
      )
      if (!allowed) return

      return listAutomationWebhookEndpoints(workspaceId)
    }
  )

  app.post(
    "/api/v1/workspaces/:workspaceId/automation-webhooks",
    { preHandler: protectedPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      const allowed = await requireRequestAction(
        request as any,
        reply as any,
        "workspace.manage_relays",
        workspaceId,
        "Not allowed to manage automation webhooks"
      )
      if (!allowed) return

      const body = createWebhookEndpointSchema.parse(request.body)
      const workspaceMemberId = request.workspaceMember!.id as string
      const created = await createAutomationWebhookEndpoint(
        workspaceId,
        workspaceMemberId,
        body
      )
      return reply.status(201).send(created)
    }
  )

  app.post(
    "/api/v1/automation-webhooks/:pathToken/sources/:sourceKey/events",
    async (request, reply) => {
      const { pathToken, sourceKey } = request.params as {
        pathToken: string
        sourceKey: string
      }
      const incomingBody =
        request.body &&
        typeof request.body === "object" &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : {}
      const isEnvelope =
        "payload" in incomingBody ||
        "sourceSnapshot" in incomingBody ||
        "dedupeKey" in incomingBody ||
        "occurredAt" in incomingBody
      const body = webhookIngressSchema.parse(isEnvelope ? incomingBody : {})
      const secret =
        extractWebhookSecret(request.headers as Record<string, unknown>) ||
        undefined

      const result = await ingestAutomationWebhookEvent({
        pathToken,
        sourceKey,
        secret,
        headers: request.headers as Record<string, unknown>,
        rawBody: (request as any).rawBody as string | undefined,
        payload: isEnvelope ? body.payload : incomingBody,
        sourceSnapshot: isEnvelope ? body.sourceSnapshot : undefined,
        dedupeKey: isEnvelope ? body.dedupeKey : undefined,
        occurredAt: isEnvelope ? body.occurredAt : undefined,
      })
      if ((result as { ignored?: boolean }).ignored) {
        return reply.status(202).send({
          ignored: true,
          occurrence: null,
          executions: [],
        })
      }
      await enqueueAutomationExecutions(
        result.executions.map((execution) => execution.id)
      )
      return reply.status(202).send({
        occurrence: result.occurrence,
        executions: result.executions,
      })
    }
  )

  app.post(
    "/api/v1/automation-webhooks/:pathToken/events",
    async (request, reply) => {
      const { pathToken } = request.params as { pathToken: string }
      const payload =
        request.body &&
        typeof request.body === "object" &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : {}

      const result = await ingestIntegrationAutomationWebhookEvent({
        pathToken,
        headers: request.headers as Record<string, unknown>,
        rawBody: (request as any).rawBody as string | undefined,
        payload,
      })
      if (result.ignored) {
        return reply.status(202).send({
          ignored: true,
          occurrences: [],
          executions: [],
        })
      }

      await enqueueAutomationExecutionJobs(
        result.executions.map((execution) => execution.id)
      )
      return reply.status(202).send({
        occurrences: result.occurrences,
        executions: result.executions,
      })
    }
  )
}
