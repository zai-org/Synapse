"use client"

import {
  RELATIONSHIP_APPROVAL_MODE,
  REMOTE_AGENT_RUNTIME_LABELS,
  REMOTE_AGENT_RUNTIME_STATE,
  type RemoteAgentRuntimeKind,
  type TrustLevel,
} from "@synapse/shared"
import Link from "next/link"
import QRCode from "qrcode"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Bot, RefreshCcw, Shield, Trash2 } from "lucide-react"
import { RuntimeKindIcon } from "@/components/runtime-kind-icon"

import { useWorkspace } from "@/app/dashboard/workspace-provider"
import type {
  RelationshipProfileView,
  RemoteAgentGroupTaskGrantsResponseSchemaType,
  RemoteAgentMachineListResponseSchemaType,
  RemoteAgentResponseSchemaType,
  RemoteAgentRuntimeSummaryView,
} from "@/lib/api"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

import { createLogger } from "@/lib/client-logger"

const clientLog = createLogger(
  "web.dashboard.remote-agents.agents.[remoteAgentId]"
)

type RemoteAgentDetailView = RemoteAgentResponseSchemaType["remoteAgent"]
type RemoteAgentMachineListItemView =
  RemoteAgentMachineListResponseSchemaType["machines"][number]
type RemoteAgentGroupTaskGrantItemView =
  RemoteAgentGroupTaskGrantsResponseSchemaType["grants"][number]

function formatDateTime(value?: string) {
  if (!value) return "Never"
  return new Date(value).toLocaleString()
}

function toggleApprovalMode(current: RelationshipProfileView["approvalMode"]) {
  return current === RELATIONSHIP_APPROVAL_MODE.AUTO
    ? RELATIONSHIP_APPROVAL_MODE.MANUAL
    : RELATIONSHIP_APPROVAL_MODE.AUTO
}

function approvalModeLabel(value?: RelationshipProfileView["approvalMode"]) {
  return value || RELATIONSHIP_APPROVAL_MODE.MANUAL
}

function contactApprovalLabel(
  value?:
    | RelationshipProfileView["requiresContactApproval"]
    | RemoteAgentDetailView["requiresContactApproval"]
) {
  return value ? "approval required" : "open to workspace"
}

const runtimeLabel = (value: string) =>
  REMOTE_AGENT_RUNTIME_LABELS[value as RemoteAgentRuntimeKind] ?? value

function sessionStateVariant(state?: RemoteAgentRuntimeSummaryView["state"]) {
  switch (state) {
    case REMOTE_AGENT_RUNTIME_STATE.RUNNING:
    case REMOTE_AGENT_RUNTIME_STATE.PLAN_DRAFTING:
      return "secondary"
    case REMOTE_AGENT_RUNTIME_STATE.WAITING_USER_INPUT:
    case REMOTE_AGENT_RUNTIME_STATE.WAITING_PLAN_APPROVAL:
      return "default"
    case REMOTE_AGENT_RUNTIME_STATE.ERROR:
      return "destructive"
    default:
      return "outline"
  }
}

function sessionStateLabel(state?: RemoteAgentRuntimeSummaryView["state"]) {
  switch (state) {
    case REMOTE_AGENT_RUNTIME_STATE.WAITING_USER_INPUT:
      return "waiting input"
    case REMOTE_AGENT_RUNTIME_STATE.WAITING_PLAN_APPROVAL:
      return "waiting approval"
    case REMOTE_AGENT_RUNTIME_STATE.PLAN_DRAFTING:
      return "planning"
    default:
      return state || REMOTE_AGENT_RUNTIME_STATE.OFFLINE
  }
}

type WorkspaceMemberDirectoryEntry = {
  id: string
  userId: string
  userName?: string
  userEmail?: string
  avatarUrl?: string | null
  trustLevel?: TrustLevel
}

type AgentDraft = {
  displayName: string
  title: string
  description: string
  avatarEmoji: string
  isActive: boolean
}

type BindingDraft = {
  machineId: string
  runtimePath: string
  localRootPath: string
}

export default function RemoteAgentDetailPage() {
  const params = useParams<{ remoteAgentId: string }>()
  const { workspaceId } = useWorkspace()
  const remoteAgentId = Array.isArray(params?.remoteAgentId)
    ? params.remoteAgentId[0]
    : params?.remoteAgentId

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingAgent, setSavingAgent] = useState(false)
  const [savingBinding, setSavingBinding] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState(false)
  const [savingGrants, setSavingGrants] = useState(false)
  const [agent, setAgent] = useState<RemoteAgentDetailView | null>(null)
  const [machines, setMachines] = useState<RemoteAgentMachineListItemView[]>([])
  const [profile, setProfile] = useState<RelationshipProfileView | null>(null)
  const [groupGrants, setGroupGrants] = useState<
    RemoteAgentGroupTaskGrantItemView[]
  >([])
  const [workspaceMembers, setWorkspaceMembers] = useState<
    WorkspaceMemberDirectoryEntry[]
  >([])
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([])
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentDraft>({
    displayName: "",
    title: "",
    description: "",
    avatarEmoji: "",
    isActive: true,
  })
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>({
    machineId: "",
    runtimePath: "",
    localRootPath: "",
  })
  const [identityIdDraft, setIdentityIdDraft] = useState("")
  const [identitySearchEnabled, setIdentitySearchEnabled] = useState(false)

  function syncAgentDraft(nextAgent: RemoteAgentDetailView) {
    setAgentDraft({
      displayName: nextAgent.displayName,
      title: nextAgent.title,
      description: nextAgent.description || "",
      avatarEmoji: nextAgent.avatarEmoji || "",
      isActive: nextAgent.isActive,
    })
    setBindingDraft({
      machineId: nextAgent.binding?.machineId || "",
      runtimePath: nextAgent.binding?.runtimePath || "",
      localRootPath: nextAgent.binding?.localRootPath || "",
    })
  }

  function applyProfileToAgent(nextProfile: RelationshipProfileView) {
    setAgent((current) =>
      current
        ? {
            ...current,
            requiresContactApproval: nextProfile.requiresContactApproval,
            isPublicShared:
              typeof nextProfile.isPublicShared === "boolean"
                ? nextProfile.isPublicShared
                : current.isPublicShared,
          }
        : current
    )
  }

  async function loadAgent(showLoading = true) {
    if (!workspaceId || !remoteAgentId) return
    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    try {
      const [
        agentResponse,
        machinesResponse,
        profileResponse,
        grantsResponse,
        workspaceMembersResponse,
      ] = await Promise.all([
        api.getRemoteAgent(workspaceId, remoteAgentId),
        api.getRemoteAgentMachines(workspaceId),
        api.getRemoteAgentRelationshipProfile(workspaceId, remoteAgentId),
        api.getRemoteAgentGroupTaskGrants(workspaceId, remoteAgentId),
        api.getWorkspaceMembers(workspaceId),
      ])
      setAgent(agentResponse.remoteAgent)
      setMachines(machinesResponse.machines)
      setProfile(profileResponse)
      setGroupGrants(grantsResponse.grants)
      setSelectedGrantIds(
        grantsResponse.grants.map((grant) => grant.workspaceMemberId)
      )
      setWorkspaceMembers(
        Array.isArray(workspaceMembersResponse)
          ? (workspaceMembersResponse as WorkspaceMemberDirectoryEntry[])
          : []
      )
      syncAgentDraft(agentResponse.remoteAgent)
      setIdentityIdDraft(profileResponse.identityId)
      setIdentitySearchEnabled(profileResponse.identitySearchEnabled)
    } catch (error) {
      clientLog.error("Failed to load remote agent:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to load remote agent"
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadAgent()
  }, [remoteAgentId, workspaceId])

  useEffect(() => {
    if (!profile?.qrUrl) {
      setQrImage(null)
      return
    }
    let active = true
    void QRCode.toDataURL(profile.qrUrl, { width: 220, margin: 1 })
      .then((value) => {
        if (active) {
          setQrImage(value)
        }
      })
      .catch(() => {
        if (active) {
          setQrImage(null)
        }
      })
    return () => {
      active = false
    }
  }, [profile?.qrUrl])

  async function handleSaveAgent() {
    if (!workspaceId || !remoteAgentId) return
    setSavingAgent(true)
    try {
      const result = await api.updateRemoteAgent(workspaceId, remoteAgentId, {
        displayName: agentDraft.displayName.trim(),
        title: agentDraft.title.trim(),
        description: agentDraft.description.trim() || null,
        avatarEmoji: agentDraft.avatarEmoji.trim() || null,
        isActive: agentDraft.isActive,
      })
      setAgent(result.remoteAgent)
      syncAgentDraft(result.remoteAgent)
      toast.success("Remote agent updated")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update agent"
      )
    } finally {
      setSavingAgent(false)
    }
  }

  async function handleBindAgent() {
    if (!workspaceId || !remoteAgentId || !agent || !bindingDraft.machineId)
      return
    setSavingBinding(true)
    try {
      const result = await api.bindRemoteAgent(workspaceId, remoteAgentId, {
        machineId: bindingDraft.machineId,
        runtimeKind: agent.runtimeKind,
        runtimePath: bindingDraft.runtimePath.trim() || undefined,
        localRootPath: bindingDraft.localRootPath.trim() || undefined,
      })
      setAgent(result.remoteAgent)
      syncAgentDraft(result.remoteAgent)
      setBindingDraft({
        machineId:
          result.remoteAgent.binding?.machineId || bindingDraft.machineId,
        runtimePath: result.remoteAgent.binding?.runtimePath || "",
        localRootPath: result.remoteAgent.binding?.localRootPath || "",
      })
      toast.success("Remote agent binding saved")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to bind agent"
      )
    } finally {
      setSavingBinding(false)
    }
  }

  async function handleSaveIdentitySettings() {
    if (!workspaceId || !remoteAgentId || !profile) return
    setSavingProfile(true)
    try {
      const nextProfile = await api.updateRemoteAgentRelationshipProfile(
        workspaceId,
        remoteAgentId,
        {
          approvalMode: profile.approvalMode,
          identityId: identityIdDraft.trim() || undefined,
          identitySearchEnabled,
          isPublicShared: profile.isPublicShared,
        }
      )
      setProfile(nextProfile)
      setIdentityIdDraft(nextProfile.identityId)
      setIdentitySearchEnabled(nextProfile.identitySearchEnabled)
      applyProfileToAgent(nextProfile)
      toast.success("Relationship profile updated")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update relationship profile"
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleToggleApprovalMode() {
    if (!workspaceId || !remoteAgentId || !profile) return
    setSavingProfile(true)
    try {
      const nextApprovalMode = toggleApprovalMode(profile.approvalMode)
      const nextProfile = await api.updateRemoteAgentRelationshipProfile(
        workspaceId,
        remoteAgentId,
        {
          approvalMode: nextApprovalMode,
          identityId: identityIdDraft.trim() || undefined,
          identitySearchEnabled,
          isPublicShared: profile.isPublicShared,
        }
      )
      setProfile(nextProfile)
      setIdentityIdDraft(nextProfile.identityId)
      setIdentitySearchEnabled(nextProfile.identitySearchEnabled)
      applyProfileToAgent(nextProfile)
      toast.success(
        `Approval mode switched to ${approvalModeLabel(nextProfile.approvalMode)}`
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update approval mode"
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleTogglePublicShare() {
    if (!workspaceId || !remoteAgentId || !profile) return
    setSavingProfile(true)
    try {
      const nextProfile = await api.updateRemoteAgentRelationshipProfile(
        workspaceId,
        remoteAgentId,
        {
          approvalMode: profile.approvalMode,
          identityId: identityIdDraft.trim() || undefined,
          identitySearchEnabled,
          isPublicShared: !profile.isPublicShared,
        }
      )
      setProfile(nextProfile)
      applyProfileToAgent(nextProfile)
      toast.success(
        nextProfile.isPublicShared
          ? "Public sharing enabled"
          : "Public sharing disabled"
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update public sharing"
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleDeleteAgent() {
    if (!workspaceId || !remoteAgentId || !agent) return
    if (!window.confirm(`Delete remote agent "${agent.displayName}"?`)) {
      return
    }
    setDeletingAgent(true)
    try {
      await api.deleteRemoteAgent(workspaceId, remoteAgentId)
      toast.success("Remote agent deleted")
      window.location.href = "/dashboard/remote-agents"
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete agent"
      )
    } finally {
      setDeletingAgent(false)
    }
  }

  async function handleSaveGroupGrants() {
    if (!workspaceId || !remoteAgentId) return
    setSavingGrants(true)
    try {
      const result = await api.updateRemoteAgentGroupTaskGrants(
        workspaceId,
        remoteAgentId,
        {
          workspaceMemberIds: selectedGrantIds,
        }
      )
      setGroupGrants(result.grants)
      setSelectedGrantIds(result.grants.map((grant) => grant.workspaceMemberId))
      toast.success("Group task access updated")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update group access"
      )
    } finally {
      setSavingGrants(false)
    }
  }

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
            <Bot className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">
              {agent?.displayName || "Remote agent"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {agent?.title ||
              "Configure session metadata, binding, and relationship profile."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void loadAgent(false)}
            disabled={refreshing}
          >
            <RefreshCcw className="mr-2 size-4" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="outline"
            className="rounded-full text-destructive hover:text-destructive"
            onClick={() => void handleDeleteAgent()}
            disabled={deletingAgent}
          >
            <Trash2 className="mr-2 size-4" />
            {deletingAgent ? "Deleting..." : "Delete agent"}
          </Button>
        </div>
      </div>

      <Card className="rounded-[28px] shadow-sm">
        <CardContent className="pt-6">
          {loading || !agent ? (
            <Skeleton className="h-24 rounded-[24px]" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={agent.isActive ? "secondary" : "outline"}>
                    {agent.isActive ? "active" : "disabled"}
                  </Badge>
                  <Badge variant="outline">
                    <RuntimeKindIcon kind={agent.runtimeKind} />
                    {runtimeLabel(agent.runtimeKind)}
                  </Badge>
                  <Badge variant="outline">
                    {contactApprovalLabel(agent.requiresContactApproval)}
                  </Badge>
                  <Badge
                    variant={agent.isPublicShared ? "secondary" : "outline"}
                  >
                    {agent.isPublicShared ? "public" : "private"}
                  </Badge>
                  {agent.runtimeSummary ? (
                    <Badge
                      variant={sessionStateVariant(agent.runtimeSummary.state)}
                    >
                      {sessionStateLabel(agent.runtimeSummary.state)}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div>ID: {agent.id}</div>
                  <div>Created: {formatDateTime(agent.createdAt)}</div>
                  <div>Updated: {formatDateTime(agent.updatedAt)}</div>
                  <div>
                    Machine: {agent.binding?.machineTitle || "Not bound yet"}
                  </div>
                  <div>
                    Root: {agent.binding?.localRootPath || "Not configured"}
                  </div>
                  {agent.runtimeSummary?.sessionId ? (
                    <div>Session ID: {agent.runtimeSummary.sessionId}</div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-[24px] border border-border/70 p-4 text-sm text-muted-foreground">
                <div className="text-sm font-medium text-foreground">
                  Runtime summary
                </div>
                <div className="mt-2 grid gap-2">
                  <div>
                    Status:{" "}
                    {agent.runtimeSummary?.statusText ||
                      sessionStateLabel(agent.runtimeSummary?.state)}
                  </div>
                  <div>
                    Pending conversations:{" "}
                    {agent.runtimeSummary?.pendingConversationCount || 0}
                  </div>
                  <div>
                    Unread deliveries:{" "}
                    {agent.runtimeSummary?.unreadDeliveryCount || 0}
                  </div>
                  <div>
                    Last activity:{" "}
                    {formatDateTime(agent.runtimeSummary?.lastActivityAt)}
                  </div>
                  {agent.runtimeSummary?.lastError ? (
                    <div>Error: {agent.runtimeSummary.lastError}</div>
                  ) : (
                    <div>
                      One RemoteAgent maps to one local CLI session, even if
                      multiple agents share the same root path.
                    </div>
                  )}
                  {agent.runtimeSummary?.capabilities ? (
                    <div>
                      Capabilities:{" "}
                      {[
                        agent.runtimeSummary.capabilities
                          .supportsRequestUserInput
                          ? "request_user_input"
                          : null,
                        agent.runtimeSummary.capabilities.supportsPlanMode
                          ? "plan_mode"
                          : null,
                        agent.runtimeSummary.capabilities
                          .supportsPersistentSession
                          ? "persistent_session"
                          : null,
                        agent.runtimeSummary.capabilities.supportsStructuredIo
                          ? "structured_io"
                          : null,
                        agent.runtimeSummary.capabilities.supportsCodexAppServer
                          ? "codex_app_server"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none reported"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <CardTitle>Agent settings</CardTitle>
            <CardDescription>
              Session-facing metadata shown throughout the workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !agent ? (
              <div className="space-y-3">
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="agent-name">Display name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="agent-name"
                      value={agentDraft.displayName}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                      className="rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-title">Title</FieldLabel>
                  <FieldContent>
                    <Input
                      id="agent-title"
                      value={agentDraft.title}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      className="rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-emoji">Avatar emoji</FieldLabel>
                  <FieldContent>
                    <Input
                      id="agent-emoji"
                      value={agentDraft.avatarEmoji}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          avatarEmoji: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                      className="rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-description">
                    Description
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="agent-description"
                      value={agentDraft.description}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      className="min-h-28 rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="agent-active">Enabled</FieldLabel>
                  <FieldContent>
                    <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                      <div className="text-sm text-muted-foreground">
                        Disable this to keep the agent from being started.
                      </div>
                      <Switch
                        id="agent-active"
                        checked={agentDraft.isActive}
                        onCheckedChange={(checked) =>
                          setAgentDraft((current) => ({
                            ...current,
                            isActive: checked,
                          }))
                        }
                      />
                    </div>
                  </FieldContent>
                </Field>
                <Button
                  className="rounded-full"
                  onClick={() => void handleSaveAgent()}
                  disabled={
                    savingAgent ||
                    !agentDraft.displayName.trim() ||
                    !agentDraft.title.trim()
                  }
                >
                  {savingAgent ? "Saving..." : "Save settings"}
                </Button>
              </FieldGroup>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <CardTitle>Binding</CardTitle>
            <CardDescription>
              Attach this session to a daemon machine and local root directory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !agent ? (
              <div className="space-y-3">
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-12 rounded-2xl" />
              </div>
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="binding-runtime">Runtime</FieldLabel>
                  <FieldContent>
                    <Input
                      id="binding-runtime"
                      value={runtimeLabel(agent.runtimeKind)}
                      readOnly
                      className="rounded-2xl"
                    />
                    <FieldDescription>
                      Runtime kind is defined when the RemoteAgent is created.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="binding-machine">Machine</FieldLabel>
                  <FieldContent>
                    <Select
                      value={bindingDraft.machineId}
                      onValueChange={(value) =>
                        setBindingDraft((current) => ({
                          ...current,
                          machineId: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        id="binding-machine"
                        className="w-full rounded-2xl"
                      >
                        <SelectValue placeholder="Select a machine" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {machines.map((machine) => (
                            <SelectItem key={machine.id} value={machine.id}>
                              {machine.title}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {machines.length === 0 ? (
                      <FieldDescription>
                        Create a machine first from the Remote Agents console.
                      </FieldDescription>
                    ) : null}
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="binding-runtime-path">
                    Runtime path
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="binding-runtime-path"
                      value={bindingDraft.runtimePath}
                      onChange={(event) =>
                        setBindingDraft((current) => ({
                          ...current,
                          runtimePath: event.target.value,
                        }))
                      }
                      placeholder="Optional explicit executable path"
                      className="rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="binding-root">
                    Local root path
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="binding-root"
                      value={bindingDraft.localRootPath}
                      onChange={(event) =>
                        setBindingDraft((current) => ({
                          ...current,
                          localRootPath: event.target.value,
                        }))
                      }
                      placeholder="/path/to/repo"
                      className="rounded-2xl"
                    />
                    <FieldDescription>
                      Multiple RemoteAgents may share the same root path.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Button
                  className="rounded-full"
                  onClick={() => void handleBindAgent()}
                  disabled={savingBinding || !bindingDraft.machineId}
                >
                  {savingBinding ? "Saving binding..." : "Save binding"}
                </Button>
              </FieldGroup>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Group task access</CardTitle>
              <CardDescription>
                Question and plan approval cards stay visible to the full group,
                but only selected workspace members can resolve them.
              </CardDescription>
            </div>
            <Shield className="mt-0.5 size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-[24px]" />
              <Skeleton className="h-16 rounded-[24px]" />
            </div>
          ) : workspaceMembers.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {workspaceMembers.map((member) => {
                  const checked = selectedGrantIds.includes(member.id)
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 rounded-[24px] border border-border/70 px-4 py-3"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setSelectedGrantIds((current) => {
                            if (value) {
                              return Array.from(
                                new Set([...current, member.id])
                              )
                            }
                            return current.filter((item) => item !== member.id)
                          })
                        }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {member.userName || member.userEmail || member.id}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {member.userEmail ||
                            member.trustLevel ||
                            "Workspace member"}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border/70 px-4 py-3 text-sm text-muted-foreground">
                <div>Authorized members: {groupGrants.length}</div>
                <Button
                  className="rounded-full"
                  onClick={() => void handleSaveGroupGrants()}
                  disabled={savingGrants}
                >
                  {savingGrants ? "Saving access..." : "Save group access"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No workspace members available to grant yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] shadow-sm">
        <CardHeader>
          <CardTitle>Relationship profile</CardTitle>
          <CardDescription>
            Controls QR, identity search, approval mode, and cross-workspace
            sharing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !profile ? (
            <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
              <Skeleton className="aspect-square rounded-[24px]" />
              <div className="space-y-3">
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-12 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-3">
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt="Remote agent relationship QR"
                    className="w-full rounded-[24px] border border-border bg-white p-4"
                  />
                ) : (
                  <Skeleton className="aspect-square rounded-[24px]" />
                )}
                <div className="rounded-[24px] border border-border/70 p-4 text-sm text-muted-foreground">
                  <div>
                    Approval mode: {approvalModeLabel(profile.approvalMode)}
                  </div>
                  <div>
                    Search visibility:{" "}
                    {profile.identitySearchEnabled ? "on" : "off"}
                  </div>
                  <div>
                    Contact approval:{" "}
                    {contactApprovalLabel(profile.requiresContactApproval)}
                  </div>
                </div>
              </div>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="relationship-id">Identity ID</FieldLabel>
                  <FieldContent>
                    <Input
                      id="relationship-id"
                      value={identityIdDraft}
                      onChange={(event) =>
                        setIdentityIdDraft(event.target.value)
                      }
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="rounded-2xl"
                    />
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="relationship-search">
                    Identity search
                  </FieldLabel>
                  <FieldContent>
                    <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                      <div className="text-sm text-muted-foreground">
                        Allow this RemoteAgent to be found by identity ID.
                      </div>
                      <Switch
                        id="relationship-search"
                        checked={identitySearchEnabled}
                        onCheckedChange={setIdentitySearchEnabled}
                      />
                    </div>
                  </FieldContent>
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void handleToggleApprovalMode()}
                    disabled={savingProfile}
                  >
                    Switch to{" "}
                    {approvalModeLabel(
                      toggleApprovalMode(profile.approvalMode)
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full sm:col-span-2"
                    onClick={() => void handleTogglePublicShare()}
                    disabled={savingProfile}
                  >
                    Turn public sharing {profile.isPublicShared ? "off" : "on"}
                  </Button>
                </div>
                <Button
                  className="rounded-full"
                  onClick={() => void handleSaveIdentitySettings()}
                  disabled={savingProfile || !identityIdDraft.trim()}
                >
                  {savingProfile
                    ? "Saving profile..."
                    : "Save relationship profile"}
                </Button>
              </FieldGroup>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
