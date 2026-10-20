import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type {
  AgentSessionEvent,
  PermissionDecision,
} from "./types.js"
import { PiDriver } from "./pi-driver.js"

/**
 * The PiAgentSession maps a duck-typed pi SDK session (subscribe/prompt/
 * followUp/isStreaming/abort/dispose/sessionId) onto AgentSessionEvents. The
 * tests drive the captured subscribe listener by hand — no real pi runtime
 * (auth/models under ~/.pi/agent) is touched.
 *
 * Turn-terminal semantics (review #11): the terminal is the SDK's
 * `agent_settled` event — the real SDK emits it exactly once per dispatched
 * run, AFTER retry continuations and auto-compaction continuations, right
 * before session.prompt() resolves. The fake mirrors that ordering by
 * default (promptImpl emits agent_settled, then resolves); event-order tests
 * override promptImpl with a never-settling gate and emit the SDK's REAL
 * event order by hand (agent_end BEFORE compaction_end; threshold compaction
 * has no second agent_end).
 */
type SdkEvent = Record<string, unknown> & { type: string }

class FakeSdkSession {
  sessionId = `sess-${randomUUID().slice(0, 8)}`
  isStreaming = false
  promptImpl: (text: string) => Promise<void> = async () => {
    // Real ordering: agent_settled (the terminal) fires just before the
    // prompt() promise resolves.
    this.emit({ type: "agent_settled" })
  }
  followUps: string[] = []
  prompts: string[] = []
  aborted = 0
  disposed = false
  private listener: ((event: SdkEvent) => void) | null = null

  subscribe(listener: (event: SdkEvent) => void) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emit(event: SdkEvent) {
    this.listener?.(event)
  }

  /** Override promptImpl so the run never settles on its own. */
  holdRuns() {
    this.promptImpl = () => new Promise<void>(() => {})
  }

  async prompt(text: string) {
    this.prompts.push(text)
    await this.promptImpl(text)
  }

  async followUp(text: string) {
    this.followUps.push(text)
  }

  async abort() {
    this.aborted += 1
  }

  dispose() {
    this.disposed = true
  }
}

type SessionLike = InstanceType<typeof PiAgentSession>

import { PiAgentSession } from "./pi-driver.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

class EventCollector {
  private readonly events: AgentSessionEvent[] = []
  private done: (() => void) | null = null
  private readonly finished: Promise<void>
  constructor(session: { events(): AsyncIterable<AgentSessionEvent> }) {
    this.finished = new Promise((resolve) => {
      this.done = resolve
    })
    void (async () => {
      for await (const event of session.events()) {
        this.events.push(event)
      }
      this.done?.()
    })()
  }
  async snapshot() {
    await tick()
    return [...this.events]
  }
  async end() {
    await this.finished
    return [...this.events]
  }
}

/** Narrowed view of the ask_question tool for tests (full signature has 5 args). */
type AskTool = {
  execute: (
    toolCallId: string,
    params: unknown
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>
    isError?: boolean
  }>
}

function attachSession(initialSessionId?: string) {
  const session = new PiAgentSession("agent-1", "conv-1", initialSessionId)
  const sdk = new FakeSdkSession()
  session.attach(sdk as unknown as Parameters<typeof session.attach>[0])
  return { session, sdk, collector: new EventCollector(session) }
}

const countTerminals = (events: AgentSessionEvent[]) =>
  events.filter((event) => event.kind === "turn_completed").length

test("PiDriver metadata: kind, label, capabilities", () => {
  const driver = new PiDriver()
  assert.equal(driver.runtimeKind, "pi")
  assert.equal(driver.label, "pi")
  assert.deepEqual(driver.capabilities, {
    supportsRequestUserInput: true,
    supportsPersistentSession: true,
  })
})

test("PiDriver.detect prefers SYNAPSE_PI_PATH and probes --version", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-detect-"))
  const script = path.join(dir, "pi")
  writeFileSync(script, "#!/bin/sh\necho 'pi 0.99.1-test'\n")
  chmodSync(script, 0o755)
  const original = process.env.SYNAPSE_PI_PATH
  process.env.SYNAPSE_PI_PATH = script
  try {
    const entry = new PiDriver().detect()
    assert.equal(entry.runtimeKind, "pi")
    assert.equal(entry.status, "available")
    assert.equal(entry.executablePath, script)
    assert.equal(entry.version, "pi 0.99.1-test")
  } finally {
    if (original === undefined) delete process.env.SYNAPSE_PI_PATH
    else process.env.SYNAPSE_PI_PATH = original
  }
})

test("PiDriver.detect reports missing_binary without a pi CLI (review #11 item 4)", () => {
  const originalPath = process.env.PATH
  const originalSynapse = process.env.SYNAPSE_PI_PATH
  process.env.PATH = "/tmp/__nonexistent_path_segment_for_test"
  delete process.env.SYNAPSE_PI_PATH
  try {
    const entry = new PiDriver().detect()
    assert.equal(entry.runtimeKind, "pi")
    // The supervisor gates starts on status available + executablePath, so
    // available-without-path would arm turns that fail at wake. Honest
    // signal: missing_binary with actionable guidance.
    assert.equal(entry.status, "missing_binary")
    assert.equal(entry.executablePath, undefined)
    assert.match(entry.lastError ?? "", /pi CLI not found/)
    assert.match(entry.lastError ?? "", /SYNAPSE_PI_PATH/)
  } finally {
    if (originalPath !== undefined) process.env.PATH = originalPath
    if (originalSynapse !== undefined)
      process.env.SYNAPSE_PI_PATH = originalSynapse
  }
})

test("attach emits session_started for a fresh session id only", async () => {
  const { session, sdk, collector } = attachSession()
  await session.close("done")
  const events = await collector.end()
  const starts = events.filter((event) => event.kind === "session_started")
  assert.equal(starts.length, 1)
  assert.deepEqual(starts[0], {
    kind: "session_started",
    sessionId: sdk.sessionId,
  })
})

test("attach does not re-emit session_started when resuming the same id", async () => {
  const sdk = new FakeSdkSession()
  const session = new PiAgentSession("agent-1", "conv-1", sdk.sessionId)
  const collector = new EventCollector(session)
  session.attach(sdk as unknown as Parameters<typeof session.attach>[0])
  await session.close("done")
  const events = await collector.end()
  assert.equal(
    events.filter((event) => event.kind === "session_started").length,
    0
  )
})

test("message_end maps assistant text, ignores thinking/user/tool messages", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.emit({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "Working on it" },
      ],
    },
  })
  sdk.emit({
    type: "message_end",
    message: { role: "user", content: [{ type: "text", text: "echo" }] },
  })
  sdk.emit({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: "only thoughts" }],
    },
  })
  await session.close("done")
  const events = await collector.end()
  const messages = events.filter((e) => e.kind === "assistant_message")
  assert.deepEqual(messages, [
    { kind: "assistant_message", text: "Working on it" },
  ])
})

test("agent_settled is the single terminal per dispatched turn; retry agent_ends are not terminals", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.holdRuns()
  await session.send("do something")
  sdk.emit({ type: "agent_start" })
  // Retry continuation and stray run events must NOT terminal the turn.
  sdk.emit({ type: "agent_end", messages: [], willRetry: true })
  sdk.emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1, errorMessage: "x" })
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  let events = await collector.snapshot()
  assert.equal(countTerminals(events), 0)
  // The run settles — exactly one terminal.
  sdk.emit({ type: "agent_settled" })
  events = await collector.snapshot()
  assert.equal(countTerminals(events), 1)
  assert.equal(sdk.prompts.length, 1)
  await session.close("done")
  events = await collector.end()
  assert.equal(countTerminals(events), 1)
})

test("stray agent_settled / agent_end with no dispatched turn is suppressed", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  const events = await collector.end()
  assert.equal(countTerminals(events), 0)
})

test("threshold compaction between turns does not swallow the next turn's terminal (review #11 item 3, real SDK order)", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.holdRuns()

  // Turn 1. Real order: agent_end FIRST, then compaction_end. Threshold
  // compaction does NOT continue — no second agent_end, the run settles
  // directly.
  await session.send("long turn")
  sdk.emit({ type: "agent_start" })
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({
    type: "compaction_end",
    reason: "threshold",
    result: undefined,
    aborted: false,
    willRetry: false,
  })
  let events = await collector.snapshot()
  assert.equal(countTerminals(events), 0, "turn 1 must still be running")
  sdk.emit({ type: "agent_settled" })
  events = await collector.snapshot()
  assert.equal(countTerminals(events), 1)

  // Turn 2 after a threshold compaction: its terminal must fire normally —
  // the old compactionContinuationPending state machine swallowed exactly
  // this terminal (review repro).
  await session.send("next turn after compaction")
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({
    type: "compaction_end",
    reason: "threshold",
    result: undefined,
    aborted: false,
    willRetry: false,
  })
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  events = await collector.end()
  assert.equal(
    countTerminals(events),
    2,
    "each turn keeps its own terminal across a threshold compaction"
  )
})

test("overflow-compaction continuation (agent_end → compaction_end → agent_end) yields ONE terminal", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.holdRuns()
  await session.send("overflowing turn")
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({
    type: "compaction_end",
    reason: "overflow",
    result: undefined,
    aborted: false,
    willRetry: true,
  })
  // The post-run hook continues the turn: a second low-level run.
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  let events = await collector.snapshot()
  assert.equal(countTerminals(events), 0)
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  events = await collector.end()
  assert.equal(countTerminals(events), 1)
})

test("send() is non-blocking: a first-turn ask_question is drainable before the run settles (review #11 item 2)", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.holdRuns()
  const tool = session.buildAskQuestionTool() as unknown as AskTool

  // The run calls ask_question mid-turn (the tool promise is pending).
  const pendingTool = tool.execute("call-boot", {
    questions: [{ question: "Which DB?" }],
  })

  // send() must return even though the run never settles — the old code
  // awaited the whole prompt() and left the event stream undrained.
  await session.send("bootstrap turn")

  const snapshot = await collector.snapshot()
  const request = snapshot.find(
    (event) => event.kind === "user_input_requested"
  )
  assert.ok(request && request.kind === "user_input_requested")
  assert.equal(countTerminals(snapshot), 0, "turn still in flight")

  // The waiter is reachable and resolves the tool.
  await session.respondPermission(request.requestId, {
    behavior: "allow",
    updatedInput: {
      questions: request.questions,
      answers: { "Which DB?": "postgres" },
    },
  })
  const result = await pendingTool
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.content, [
    { type: "text", text: "- Which DB?: postgres" },
  ])

  // Only now does the run settle and the terminal fire.
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  const events = await collector.end()
  assert.equal(countTerminals(events), 1)
})

test("send while streaming routes through followUp; the ongoing run's settle terminals it", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.isStreaming = true
  await session.send("next instruction")
  let events = await collector.snapshot()
  assert.deepEqual(sdk.followUps, ["next instruction"])
  assert.deepEqual(sdk.prompts, [])
  assert.equal(countTerminals(events), 0, "followUp resolution is not a terminal")
  // The queued followUp runs inside the ongoing run; its settle is the turn.
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  events = await collector.end()
  assert.equal(countTerminals(events), 1)
})

test("a rejected prompt emits error + terminal for that turn", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.promptImpl = async () => {
    throw new Error("model 503")
  }
  await session.send("try this")
  await session.close("done")
  const events = await collector.end()
  const error = events.find((event) => event.kind === "error")
  assert.ok(error && error.kind === "error")
  assert.match(error.message, /model 503/)
  assert.equal(
    events.filter((event) => event.kind === "turn_completed").length,
    1
  )
})

test("auto_retry_end failure attributes to the CURRENT turn (error before its terminal)", async () => {
  const { session, sdk, collector } = attachSession()
  sdk.holdRuns()
  await session.send("flaky turn")
  // Real order: the retry exhausts after the run's last agent_end but BEFORE
  // agent_settled — so the error lands inside the failing turn, not the next.
  sdk.emit({ type: "agent_end", messages: [], willRetry: false })
  sdk.emit({
    type: "auto_retry_end",
    success: false,
    attempt: 3,
    finalError: "provider down",
  })
  sdk.emit({ type: "agent_settled" })
  await session.close("done")
  const events = await collector.end()
  const errorIndex = events.findIndex((event) => event.kind === "error")
  const terminalIndex = events.findIndex(
    (event) => event.kind === "turn_completed"
  )
  assert.ok(errorIndex !== -1, "error event emitted")
  assert.ok(terminalIndex !== -1, "terminal emitted")
  assert.ok(
    errorIndex < terminalIndex,
    "retry-exhausted error must precede its turn's terminal"
  )
  const error = events[errorIndex]
  assert.ok(error && error.kind === "error")
  assert.match(error.message, /provider down/)
})

test("ask_question suspends, surfaces user_input_requested, and resolves with answers", async () => {
  const { session, collector } = attachSession()
  const tool = session.buildAskQuestionTool() as unknown as AskTool
  const pending = tool.execute("call-1", {
    questions: [{ question: "Ship on Friday?", options: [{ label: "yes" }] }],
  })
  const snapshot = await collector.snapshot()
  const request = snapshot.find((event) => event.kind === "user_input_requested")
  assert.ok(request && request.kind === "user_input_requested")
  assert.equal(request.title, "Ship on Friday?")
  assert.equal(request.toolName, "ask_question")
  assert.equal(request.questions.length, 1)

  await session.respondPermission(request.requestId, {
    behavior: "allow",
    updatedInput: {
      questions: request.questions,
      answers: { "Ship on Friday?": "no, wait for Monday" },
    },
  })
  const result = await pending
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.content, [
    { type: "text", text: "- Ship on Friday?: no, wait for Monday" },
  ])
  await session.close("done")
})

test("ask_question deny resolves as an error tool result", async () => {
  const { session, collector } = attachSession()
  const tool = session.buildAskQuestionTool() as unknown as AskTool
  const pending = tool.execute("call-2", {
    questions: [{ question: "Proceed?" }],
  })
  const snapshot = await collector.snapshot()
  const request = snapshot.find((event) => event.kind === "user_input_requested")
  assert.ok(request && request.kind === "user_input_requested")
  await session.respondPermission(request.requestId, {
    behavior: "deny",
    message: "user declined",
  })
  const result = await pending
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /user declined/)
  await session.close("done")
})

test("respondPermission throws for an unknown request id", async () => {
  const { session } = attachSession()
  await assert.rejects(
    session.respondPermission("nope", { behavior: "deny", message: "x" }),
    /No pending user-input request/
  )
  await session.close("done")
})

test("close denies pending inputs, aborts + disposes the sdk, ends the iterator", async () => {
  const { session, sdk, collector } = attachSession()
  const tool = session.buildAskQuestionTool() as unknown as AskTool
  const pending = tool.execute("call-3", {
    questions: [{ question: "Still there?" }],
  })
  const snapshot = await collector.snapshot()
  const request = snapshot.find((event) => event.kind === "user_input_requested")
  assert.ok(request && request.kind === "user_input_requested")
  await session.close("conversation ended")
  const result = await pending
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /session closed/)
  assert.equal(sdk.aborted, 1)
  assert.equal(sdk.disposed, true)
  const events = await collector.end()
  assert.ok(Array.isArray(events))
})
