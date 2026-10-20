"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, RefreshCcw, Server } from "lucide-react"
import { RuntimeKindIcon } from "@/components/runtime-kind-icon"
import {
  REMOTE_AGENT_BINDING_STATUS,
  REMOTE_AGENT_RUNTIME_LABELS,
  type RemoteAgentRuntimeKind,
} from "@synapse/shared"

import { useWorkspace } from "@/app/dashboard/workspace-provider"
import type {
  RemoteAgentMachineDetailView,
  RemoteAgentMachineTrustStatus,
  RemoteAgentRuntimeSummaryView,
  RemoteAgentRuntimeStatus,
} from "@/lib/api"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

import { createLogger } from "@/lib/client-logger"

const clientLog = createLogger(
  "web.dashboard.remote-agents.machines.[machineId]"
)

function formatDateTime(value?: string) {
  if (!value) return "Never"
  return new Date(value).toLocaleString()
}

function trustVariant(status?: RemoteAgentMachineTrustStatus) {
  switch (status) {
    case "active":
      return "secondary"
    case "blocked":
    case "revoked":
      return "destructive"
    default:
      return "outline"
  }
}

function runtimeVariant(status?: RemoteAgentRuntimeStatus) {
  switch (status) {
    case "available":
      return "secondary"
    case "broken_path":
    case "missing_binary":
    case "runtime_error":
      return "destructive"
    default:
      return "outline"
  }
}

function runtimeLabel(value: string) {
  return REMOTE_AGENT_RUNTIME_LABELS[value as RemoteAgentRuntimeKind] ?? value
}

function sessionStateVariant(state?: RemoteAgentRuntimeSummaryView["state"]) {
  switch (state) {
    case "running":
    case "plan_drafting":
      return "secondary"
    case "waiting_user_input":
    case "waiting_plan_approval":
      return "default"
    case "error":
      return "destructive"
    default:
      return "outline"
  }
}

function sessionStateLabel(state?: RemoteAgentRuntimeSummaryView["state"]) {
  switch (state) {
    case "waiting_user_input":
      return "waiting input"
    case "waiting_plan_approval":
      return "waiting approval"
    case "plan_drafting":
      return "planning"
    default:
      return state || "offline"
  }
}

export default function RemoteAgentMachineDetailPage() {
  const params = useParams<{ machineId: string }>()
  const { workspaceId } = useWorkspace()
  const machineId = Array.isArray(params?.machineId)
    ? params.machineId[0]
    : params?.machineId
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detail, setDetail] = useState<RemoteAgentMachineDetailView | null>(
    null
  )

  async function loadDetail(showLoading = true) {
    if (!workspaceId || !machineId) return
    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    try {
      const result = await api.getRemoteAgentMachine(workspaceId, machineId)
      setDetail(result)
    } catch (error) {
      clientLog.error("Failed to load remote machine:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to load remote machine"
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDetail()
  }, [machineId, workspaceId])

  return (
    <div className="flex min-h-0 flex-col gap-6 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/dashboard/remote-agents"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Remote Agents
          </Link>
          <div className="flex items-center gap-2">
            <Server className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">
              {detail?.machine.title || "Remote machine"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {detail?.machine.description ||
              "Daemon status, runtime discovery, and bound agents."}
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => void loadDetail(false)}
          disabled={refreshing}
        >
          <RefreshCcw className="mr-2 size-4" />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <CardTitle>Machine overview</CardTitle>
            <CardDescription>
              Workspace-scoped daemon status and last heartbeat information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading || !detail ? (
              <>
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={trustVariant(detail.machine.trustStatus)}>
                    {detail.machine.trustStatus}
                  </Badge>
                  <Badge
                    variant={
                      detail.machine.lifecycleState === "online"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {detail.machine.lifecycleState || "offline"}
                  </Badge>
                </div>
                <div className="grid gap-3 rounded-[24px] border border-border/70 p-4 text-sm text-muted-foreground">
                  <div>Machine ID: {detail.machine.id}</div>
                  <div>
                    Last seen: {formatDateTime(detail.machine.lastSeenAt)}
                  </div>
                  <div>Created: {formatDateTime(detail.machine.createdAt)}</div>
                  <div>Updated: {formatDateTime(detail.machine.updatedAt)}</div>
                  <div>Bindings: {detail.bindings.length}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <CardTitle>Runtime catalog</CardTitle>
            <CardDescription>
              What the daemon most recently detected on this machine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading || !detail ? (
              <>
                <Skeleton className="h-24 rounded-[24px]" />
                <Skeleton className="h-24 rounded-[24px]" />
              </>
            ) : detail.runtimeCatalog.length > 0 ? (
              detail.runtimeCatalog.map((entry) => (
                <div
                  key={`${entry.runtimeKind}:${entry.executablePath || "default"}`}
                  className="rounded-[24px] border border-border/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                        <RuntimeKindIcon
                          kind={entry.runtimeKind}
                          className="size-4"
                        />
                        {runtimeLabel(entry.runtimeKind)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.executablePath || "No executable path reported"}
                      </div>
                    </div>
                    <Badge variant={runtimeVariant(entry.status)}>
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div>Version: {entry.version || "Unknown"}</div>
                    <div>Last seen: {formatDateTime(entry.lastSeenAt)}</div>
                    {entry.lastError ? (
                      <div>Error: {entry.lastError}</div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No runtime catalog received yet. Start the daemon once to
                populate this.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] shadow-sm">
        <CardHeader>
          <CardTitle>Bound agents</CardTitle>
          <CardDescription>
            Active RemoteAgents currently attached to this machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading || !detail ? (
            <>
              <Skeleton className="h-24 rounded-[24px]" />
              <Skeleton className="h-24 rounded-[24px]" />
            </>
          ) : detail.bindings.length > 0 ? (
            detail.bindings.map((binding) => (
              <Link
                key={binding.remoteAgentId}
                href={`/dashboard/remote-agents/agents/${binding.remoteAgentId}`}
                className="rounded-[24px] border border-border/70 p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">
                      {binding.displayName}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <RuntimeKindIcon
                        kind={binding.runtimeKind}
                        className="size-3.5"
                      />
                      {runtimeLabel(binding.runtimeKind)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      binding.status === REMOTE_AGENT_BINDING_STATUS.ACTIVE
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {binding.status}
                  </Badge>
                </div>
                {binding.runtimeSummary ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge
                      variant={sessionStateVariant(
                        binding.runtimeSummary.state
                      )}
                    >
                      {sessionStateLabel(binding.runtimeSummary.state)}
                    </Badge>
                    <Badge variant="outline">
                      {binding.runtimeSummary.unreadDeliveryCount} unread
                    </Badge>
                    <Badge variant="outline">
                      {binding.runtimeSummary.pendingConversationCount} pending
                      conversations
                    </Badge>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div>
                    Runtime path: {binding.runtimePath || "Default detection"}
                  </div>
                  <div>
                    Local root: {binding.localRootPath || "Not configured"}
                  </div>
                  {binding.runtimeSummary?.sessionId ? (
                    <div>Session ID: {binding.runtimeSummary.sessionId}</div>
                  ) : null}
                  {binding.runtimeSummary?.statusText ? (
                    <div>Status: {binding.runtimeSummary.statusText}</div>
                  ) : null}
                  {binding.runtimeSummary?.capabilities ? (
                    <div>
                      Capabilities:{" "}
                      {[
                        binding.runtimeSummary.capabilities
                          .supportsRequestUserInput
                          ? "request_user_input"
                          : null,
                        binding.runtimeSummary.capabilities.supportsPlanMode
                          ? "plan_mode"
                          : null,
                        binding.runtimeSummary.capabilities
                          .supportsPersistentSession
                          ? "persistent_session"
                          : null,
                        binding.runtimeSummary.capabilities.supportsStructuredIo
                          ? "structured_io"
                          : null,
                        binding.runtimeSummary.capabilities
                          .supportsCodexAppServer
                          ? "codex_app_server"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none reported"}
                    </div>
                  ) : null}
                  {binding.runtimeSummary?.lastError ? (
                    <div>Error: {binding.runtimeSummary.lastError}</div>
                  ) : null}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing is bound to this machine yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
