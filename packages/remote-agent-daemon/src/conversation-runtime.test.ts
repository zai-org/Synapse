import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import {
  ConversationRuntime,
  type ConversationRuntimeCallbacks,
} from "./conversation-runtime.js"
import { __clearDriversForTest, registerDriver } from "./drivers/registry.js"
import {
  RUNTIME_KIND,
  type AgentDriver,
  type AgentSession,
  type AgentSessionEvent,
  type RuntimeCatalogEntry,
} from "./drivers/types.js"
import { getTraceparent, runWithCarrier } from "./trace-context.js"

function tp(n: number): string {
  return `00-${n.toString(16).padStart(32, "0")}-000000000000000f-01`
}

// A manually-pumped async event stream so the test controls exactly WHEN each
// lifecycle event fires (i.e. long after the turn that started the session).
class EventPump {
  private readonly queue: AgentSessionEvent[] = []
  private readonly waiters: Array<
    (r: IteratorResult<AgentSessionEvent>) => void
  > = []
  private done = false

  push(event: AgentSessionEvent) {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: event, done: false })
    else this.queue.push(event)
  }

  end() {
    this.done = true
    const waiter = this.waiters.shift()
    if (waiter)
      waiter({ value: undefined as unknown as AgentSessionEvent, done: true })
  }

  async *iterate(): AsyncIterable<AgentSessionEvent> {
    for (;;) {
      const queued = this.queue.shift()
      if (queued !== undefined) {
        yield queued
        continue
      }
      if (this.done) return
      const next = await new Promise<IteratorResult<AgentSessionEvent>>((res) =>
        this.waiters.push(res)
      )
      if (next.done) return
      yield next.value
    }
  }
}

function fakeDriver(pump: EventPump): AgentDriver {
  const detected: RuntimeCatalogEntry = {
    runtimeKind: RUNTIME_KIND.CLAUDE_CODE,
    executablePath: "/fake/claude",
    status: "available",
  }
  return {
    runtimeKind: RUNTIME_KIND.CLAUDE_CODE,
    label: "Claude Code",
    capabilities: {},
    detect: () => detected,
    createSession: async (spec): Promise<AgentSession> => ({
      runtimeKind: RUNTIME_KIND.CLAUDE_CODE,
      conversationId: spec.conversationId,
      remoteAgentId: spec.remoteAgentId,
      sessionId: undefined,
      send: async () => undefined,
      respondPermission: async () => undefined,
      events: () => pump.iterate(),
      close: async () => pump.end(),
    }),
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

test("F4: the detached drainEvents loop is context-free — no callback inherits the turn-1 carrier that started the session", async () => {
  __clearDriversForTest()
  const pump = new EventPump()
  registerDriver(fakeDriver(pump))

  const observed: Record<string, string | undefined> = {}
  const record = (name: string) => {
    observed[name] = getTraceparent()
  }
  const callbacks: ConversationRuntimeCallbacks = {
    onSessionStarted: () => record("onSessionStarted"),
    onAssistantMessage: () => record("onAssistantMessage"),
    onTurnCompleted: () => record("onTurnCompleted"),
    onError: () => record("onError"),
    onUserInputRequested: async () => record("onUserInputRequested"),
    onPlanApprovalRequested: async () => record("onPlanApprovalRequested"),
    onPlanUpdated: () => record("onPlanUpdated"),
    onTurnDropped: () => record("onTurnDropped"),
    onClosed: () => record("onClosed"),
  }

  const runtime = new ConversationRuntime({
    remoteAgentId: randomUUID(),
    conversationId: randomUUID(),
    runtimeKind: RUNTIME_KIND.CLAUDE_CODE,
    runtimePath: "/fake/claude",
    rootDirectory: path.join(os.tmpdir(), `f4-repro-${randomUUID()}`),
    serverUrl: "http://127.0.0.1:0",
    machineKey: "machine-key",
    callbacks,
  })

  // Turn 1 starts the session inside its carrier scope — this is exactly where
  // the old `void this.drainEvents(session)` captured turn-1's ALS context.
  await runWithCarrier({ traceparent: tp(0x11) }, () =>
    runtime.ensureStarted("hi", "epoch-1")
  )

  // Turn-1 scope has now exited. Events arrive later (as they would across many
  // turns of a long-lived session). Each callback must observe NO ambient
  // carrier (the detach masked it), not turn-1's.
  pump.push({ kind: "session_started", sessionId: "s-1" })
  pump.push({ kind: "plan_updated", explanation: "x", plan: [] })
  pump.push({
    kind: "user_input_requested",
    requestId: "r-1",
    title: "t",
    questions: [],
  })
  pump.push({
    kind: "plan_approval_requested",
    requestId: "r-2",
    title: "t",
    planMarkdown: "m",
  })
  pump.push({ kind: "turn_completed" })
  pump.push({ kind: "error", message: "boom" })
  // Let drainEvents process the queued events.
  for (let i = 0; i < 8; i++) await tick()

  for (const name of [
    "onSessionStarted",
    "onPlanUpdated",
    "onUserInputRequested",
    "onPlanApprovalRequested",
    "onTurnCompleted",
    "onError",
  ]) {
    assert.equal(
      observed[name],
      undefined,
      `${name} must NOT inherit turn-1's carrier (F4)`
    )
  }

  await runtime.close("test done")
  __clearDriversForTest()
})
