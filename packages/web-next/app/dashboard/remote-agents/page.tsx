"use client"

import Link from "next/link"
import { useDeferredValue, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Copy, Plus, RefreshCcw, SquareTerminal } from "lucide-react"
import { RuntimeKindIcon } from "@/components/runtime-kind-icon"
import {
  REMOTE_AGENT_RUNTIME_KINDS,
  REMOTE_AGENT_RUNTIME_LABELS,
} from "@synapse/shared"

import { useWorkspace } from "../workspace-provider"
import type {
  RemoteAgentMachinePairingSessionView,
  RemoteAgentMachineTrustStatus,
  RemoteAgentRuntimeSummaryView,
  RemoteAgentRuntimeKind,
  RemoteAgentRuntimeStatus,
} from "@/lib/api"
import { api } from "@/lib/api"
import { qk } from "@/lib/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value)
  toast.success(`${label} copied`)
}

const emptyMachineDraft = {
  title: "",
  description: "",
}

type CreateAgentDraft = {
  displayName: string
  title: string
  description: string
  runtimeKind: RemoteAgentRuntimeKind
  isPublicShared: boolean
}

const emptyAgentDraft: CreateAgentDraft = {
  displayName: "",
  title: "",
  description: "",
  runtimeKind: "claude_code" as RemoteAgentRuntimeKind,
  isPublicShared: false,
}

export default function RemoteAgentsPage() {
  const { workspaceId } = useWorkspace()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [machineDialogOpen, setMachineDialogOpen] = useState(false)
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [creatingMachine, setCreatingMachine] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [machineDraft, setMachineDraft] = useState(emptyMachineDraft)
  const [agentDraft, setAgentDraft] =
    useState<CreateAgentDraft>(emptyAgentDraft)
  const [pairingResult, setPairingResult] =
    useState<RemoteAgentMachinePairingSessionView | null>(null)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const machinesQuery = useQuery({
    queryKey: workspaceId
      ? qk.remoteAgentMachines(workspaceId)
      : ["remote-agent-machines", "disabled"],
    queryFn: () => api.getRemoteAgentMachines(workspaceId!),
    enabled: !!workspaceId,
    select: (res) => res.machines,
  })
  const agentsQuery = useQuery({
    queryKey: workspaceId
      ? qk.remoteAgents(workspaceId)
      : ["remote-agents", "disabled"],
    queryFn: () => api.getRemoteAgents(workspaceId!),
    enabled: !!workspaceId,
    select: (res) => res.remoteAgents,
  })

  const machines = machinesQuery.data ?? []
  const agents = agentsQuery.data ?? []
  const loading =
    (machinesQuery.isPending || agentsQuery.isPending) && !!workspaceId
  const refreshing = machinesQuery.isFetching || agentsQuery.isFetching

  // Refetch both lists (replaces the old loadConsole(false) manual reload).
  const reloadConsole = () => {
    if (!workspaceId) return
    void queryClient.invalidateQueries({
      queryKey: qk.remoteAgentMachines(workspaceId),
    })
    void queryClient.invalidateQueries({
      queryKey: qk.remoteAgents(workspaceId),
    })
  }

  const filteredMachines = useMemo(() => {
    if (!deferredSearch) return machines
    return machines.filter((machine) =>
      [
        machine.title,
        machine.description,
        machine.trustStatus,
        machine.lifecycleState,
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch)
    )
  }, [deferredSearch, machines])

  const filteredAgents = useMemo(() => {
    if (!deferredSearch) return agents
    return agents.filter((agent) =>
      [
        agent.displayName,
        agent.title,
        agent.description,
        agent.runtimeKind,
        agent.binding?.machineTitle,
        agent.binding?.localRootPath,
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch)
    )
  }, [agents, deferredSearch])

  async function handleCreateMachine() {
    if (!workspaceId) return
    setCreatingMachine(true)
    try {
      const result = await api.createRemoteAgentMachinePairingSession(
        workspaceId,
        {
          title: machineDraft.title.trim() || undefined,
          description: machineDraft.description.trim() || undefined,
        }
      )
      setPairingResult(result)
      setMachineDialogOpen(false)
      setMachineDraft(emptyMachineDraft)
      reloadConsole()
      toast.success("Remote machine created")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create machine"
      )
    } finally {
      setCreatingMachine(false)
    }
  }

  async function handleCreateAgent() {
    if (!workspaceId) return
    setCreatingAgent(true)
    try {
      const result = await api.createRemoteAgent(workspaceId, {
        displayName: agentDraft.displayName.trim(),
        title: agentDraft.title.trim(),
        description: agentDraft.description.trim() || undefined,
        runtimeKind: agentDraft.runtimeKind,
        isPublicShared: agentDraft.isPublicShared,
      })
      setAgentDialogOpen(false)
      setAgentDraft(emptyAgentDraft)
      reloadConsole()
      toast.success("Remote agent created")
      window.location.href = `/dashboard/remote-agents/agents/${result.remoteAgent.id}`
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create agent"
      )
    } finally {
      setCreatingAgent(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-6 px-4 py-4 lg:px-6">
      <Card className="rounded-[28px] border-border/70 bg-gradient-to-br from-background via-background to-muted/30 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SquareTerminal className="size-4" />
                Desktop web console
              </div>
              <CardTitle className="text-2xl">Remote Agents</CardTitle>
              <CardDescription className="max-w-2xl text-sm">
                Pair a machine, create a RemoteAgent, then bind that agent to a
                local CLI session. One daemon can host multiple RemoteAgents.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => reloadConsole()}
                disabled={refreshing}
              >
                <RefreshCcw className="mr-2 size-4" />
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setMachineDialogOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                Create machine
              </Button>
              <Button
                className="rounded-full"
                onClick={() => setAgentDialogOpen(true)}
              >
                <Bot className="mr-2 size-4" />
                Create agent
              </Button>
            </div>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search machines, runtimes, root paths"
            className="rounded-2xl"
          />
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Machines</CardTitle>
                <CardDescription>
                  Pair a daemon once, then bind one or more RemoteAgents onto
                  it.
                </CardDescription>
              </div>
              <Badge variant="outline">{machines.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading ? (
              <>
                <Skeleton className="h-28 rounded-[24px]" />
                <Skeleton className="h-28 rounded-[24px]" />
              </>
            ) : filteredMachines.length > 0 ? (
              filteredMachines.map((machine) => (
                <Link
                  key={machine.id}
                  href={`/dashboard/remote-agents/machines/${machine.id}`}
                  className="rounded-[24px] border border-border/70 p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-foreground">
                        {machine.title}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {machine.description || "No description yet"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={trustVariant(machine.trustStatus)}>
                        {machine.trustStatus}
                      </Badge>
                      <Badge
                        variant={
                          machine.lifecycleState === "online"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {machine.lifecycleState || "offline"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>Bindings: {machine.bindingCount}</div>
                    <div>Last seen: {formatDateTime(machine.lastSeenAt)}</div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No machine matched this view yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Agents</CardTitle>
                <CardDescription>
                  Each RemoteAgent maps to one independent local CLI session.
                </CardDescription>
              </div>
              <Badge variant="outline">{agents.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading ? (
              <>
                <Skeleton className="h-32 rounded-[24px]" />
                <Skeleton className="h-32 rounded-[24px]" />
              </>
            ) : filteredAgents.length > 0 ? (
              filteredAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/dashboard/remote-agents/agents/${agent.id}`}
                  className="rounded-[24px] border border-border/70 p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-foreground">
                        {agent.displayName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {agent.title}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={agent.isActive ? "secondary" : "outline"}>
                        {agent.isActive ? "active" : "disabled"}
                      </Badge>
                      <Badge
                        variant={runtimeVariant(
                          agent.binding ? "available" : "unsupported_platform"
                        )}
                      >
                        <RuntimeKindIcon kind={agent.runtimeKind} />
                        {REMOTE_AGENT_RUNTIME_LABELS[agent.runtimeKind]}
                      </Badge>
                      {agent.runtimeSummary ? (
                        <Badge
                          variant={sessionStateVariant(
                            agent.runtimeSummary.state
                          )}
                        >
                          {sessionStateLabel(agent.runtimeSummary.state)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {agent.description ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {agent.description}
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>
                      Machine: {agent.binding?.machineTitle || "Not bound yet"}
                    </div>
                    <div className="sm:col-span-2">
                      Root: {agent.binding?.localRootPath || "Not configured"}
                    </div>
                    {agent.runtimeSummary ? (
                      <>
                        <div>
                          Pending conversations:{" "}
                          {agent.runtimeSummary.pendingConversationCount}
                        </div>
                        <div>
                          Unread deliveries:{" "}
                          {agent.runtimeSummary.unreadDeliveryCount}
                        </div>
                        <div className="sm:col-span-2">
                          Status:{" "}
                          {agent.runtimeSummary.statusText ||
                            "No live status text"}
                        </div>
                      </>
                    ) : null}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No RemoteAgent matched this view yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={machineDialogOpen} onOpenChange={setMachineDialogOpen}>
        <DialogContent className="max-w-2xl rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Create remote machine</DialogTitle>
            <DialogDescription>
              This creates a machine key and daemon command for one
              workspace-scoped daemon process.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="machine-title">Title</FieldLabel>
              <FieldContent>
                <Input
                  id="machine-title"
                  value={machineDraft.title}
                  onChange={(event) =>
                    setMachineDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="My workstation"
                  className="rounded-2xl"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="machine-description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="machine-description"
                  value={machineDraft.description}
                  onChange={(event) =>
                    setMachineDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="macOS laptop in the office"
                  className="min-h-28 rounded-2xl"
                />
                <FieldDescription>
                  The API key is shown once after creation.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setMachineDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleCreateMachine()}
              disabled={creatingMachine}
            >
              {creatingMachine ? "Creating..." : "Create machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-2xl rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Create remote agent</DialogTitle>
            <DialogDescription>
              A RemoteAgent is one persistent local CLI session identity.
            </DialogDescription>
          </DialogHeader>
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
                  placeholder="Claude Repo A"
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
                  placeholder="Repository assistant"
                  className="rounded-2xl"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-runtime">Runtime</FieldLabel>
              <FieldContent>
                <Select
                  value={agentDraft.runtimeKind}
                  onValueChange={(value: RemoteAgentRuntimeKind) =>
                    setAgentDraft((current) => ({
                      ...current,
                      runtimeKind: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="agent-runtime"
                    className="w-full rounded-2xl"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {REMOTE_AGENT_RUNTIME_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {REMOTE_AGENT_RUNTIME_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-description">Description</FieldLabel>
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
                  placeholder="What this session is responsible for"
                  className="min-h-28 rounded-2xl"
                />
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="agent-public-shared">
                Public sharing
              </FieldLabel>
              <FieldContent>
                <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Allow other workspaces to discover this agent by
                    relationship.
                  </div>
                  <Switch
                    id="agent-public-shared"
                    checked={agentDraft.isPublicShared}
                    onCheckedChange={(checked) =>
                      setAgentDraft((current) => ({
                        ...current,
                        isPublicShared: checked,
                      }))
                    }
                  />
                </div>
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setAgentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleCreateAgent()}
              disabled={
                creatingAgent ||
                !agentDraft.displayName.trim() ||
                !agentDraft.title.trim()
              }
            >
              {creatingAgent ? "Creating..." : "Create agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pairingResult)}
        onOpenChange={(open) => !open && setPairingResult(null)}
      >
        <DialogContent className="max-w-3xl rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Machine pairing ready</DialogTitle>
            <DialogDescription>
              Start the daemon on the target machine with this command. The API
              key is only shown once.
            </DialogDescription>
          </DialogHeader>
          {pairingResult ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-[24px] border border-border/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {pairingResult.machine.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {pairingResult.machine.description || "No description"}
                    </div>
                  </div>
                  <Badge
                    variant={trustVariant(pairingResult.machine.trustStatus)}
                  >
                    {pairingResult.machine.trustStatus}
                  </Badge>
                </div>
              </div>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="pairing-api-key">
                    Machine API key
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="pairing-api-key"
                      readOnly
                      value={pairingResult.apiKey}
                      className="min-h-24 rounded-2xl font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      className="w-full rounded-full"
                      onClick={() =>
                        void copyText(pairingResult.apiKey, "API key")
                      }
                    >
                      <Copy className="mr-2 size-4" />
                      Copy API key
                    </Button>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pairing-command">
                    Daemon command
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="pairing-command"
                      readOnly
                      value={pairingResult.daemonCommand}
                      className="min-h-28 rounded-2xl font-mono text-xs"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          void copyText(
                            pairingResult.daemonCommand,
                            "Daemon command"
                          )
                        }
                      >
                        <Copy className="mr-2 size-4" />
                        Copy command
                      </Button>
                      <Link
                        href={`/dashboard/remote-agents/machines/${pairingResult.machine.id}`}
                      >
                        <Button className="w-full rounded-full">
                          Open machine detail
                        </Button>
                      </Link>
                    </div>
                  </FieldContent>
                </Field>
                {pairingResult.oneClickCommands ? (
                  <Field>
                    <FieldLabel htmlFor="pairing-oneclick-unix">
                      One-click install (no Node required)
                    </FieldLabel>
                    <FieldContent>
                      <p className="text-xs text-muted-foreground">
                        Bootstraps Node + installs the daemon, then starts it.
                        Linux / macOS:
                      </p>
                      <Textarea
                        id="pairing-oneclick-unix"
                        readOnly
                        value={pairingResult.oneClickCommands.unix}
                        className="min-h-28 rounded-2xl font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={() =>
                          void copyText(
                            pairingResult.oneClickCommands!.unix,
                            "One-click (Unix)"
                          )
                        }
                      >
                        <Copy className="mr-2 size-4" />
                        Copy Linux / macOS command
                      </Button>
                      <p className="text-xs text-muted-foreground">Windows:</p>
                      <Textarea
                        id="pairing-oneclick-windows"
                        readOnly
                        value={pairingResult.oneClickCommands.windows}
                        className="min-h-28 rounded-2xl font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={() =>
                          void copyText(
                            pairingResult.oneClickCommands!.windows,
                            "One-click (Windows)"
                          )
                        }
                      >
                        <Copy className="mr-2 size-4" />
                        Copy Windows command
                      </Button>
                    </FieldContent>
                  </Field>
                ) : null}
              </FieldGroup>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
