import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { OpencodeDriver } from "./opencode-driver.js"
import type { AgentSessionEvent } from "./types.js"

const FAKE_SESSION_ID = "ses_fake_1234"

function writeFakeOpencode(dir: string, name: string): string {
  const script = `#!/bin/sh
# Fake opencode for driver tests. Emits a canned --format json turn.
echo '{"type":"step_start","timestamp":1,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-start"}}'
echo '{"type":"text","timestamp":2,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"text","text":"fake reply","time":{"start":1,"end":2}}}'
echo '{"type":"step_finish","timestamp":3,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-finish","reason":"stop"}}'
exit 0
`
  const filePath = path.join(dir, name)
  writeFileSync(filePath, script, { mode: 0o755 })
  return filePath
}

/**
 * Fake opencode that records the argv it was invoked with (one arg per line)
 * before emitting the canned NDJSON turn. Used to pin the resume contract:
 * the first run must NOT pass --session; after the session id is captured,
 * every later send must pass --session <id>.
 */
function writeArgRecordingOpencode(dir: string, name: string, argvLog: string): string {
  const script = `#!/bin/sh
printf '%s\n' "$@" > "${argvLog}"
echo '{"type":"step_start","timestamp":1,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-start"}}'
echo '{"type":"text","timestamp":2,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"text","text":"fake reply","time":{"start":1,"end":2}}}'
echo '{"type":"step_finish","timestamp":3,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-finish","reason":"stop"}}'
exit 0
`
  const filePath = path.join(dir, name)
  writeFileSync(filePath, script, { mode: 0o755 })
  return filePath
}

async function collectSessionEvents(
  session: { events(): AsyncIterable<AgentSessionEvent>; send(p: string): Promise<void>; close(r: string): Promise<void> },
  deadlineMs = 10_000
): Promise<AgentSessionEvent[]> {
  const events: AgentSessionEvent[] = []
  const iterator = session.events()[Symbol.asyncIterator]()
  const deadline = Date.now() + deadlineMs
  while (true) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("timed out waiting for turn_completed")
    const next = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("event wait timeout")), remaining)
      ),
    ])
    if (next.done) break
    events.push(next.value)
    if (next.value.kind === "turn_completed") break
  }
  return events
}

test("OpencodeDriver metadata", () => {
  const driver = new OpencodeDriver()
  assert.equal(driver.runtimeKind, "opencode")
  assert.equal(driver.label, "opencode")
  // Honest capability advertising: no interactive permission support in run mode.
  assert.equal(driver.capabilities.supportsRequestUserInput, undefined)
  assert.equal(driver.capabilities.supportsPersistentSession, true)
})

test("OpencodeDriver.detect reports missing_binary when nothing on PATH", () => {
  const originalPath = process.env.PATH
  const originalSynapse = process.env.SYNAPSE_OPENCODE_PATH
  process.env.PATH = "/tmp/__nonexistent_path_segment_for_test_opencode"
  delete process.env.SYNAPSE_OPENCODE_PATH
  try {
    const entry = new OpencodeDriver().detect()
    assert.equal(entry.runtimeKind, "opencode")
    assert.equal(entry.status, "missing_binary")
    assert.equal(entry.executablePath, undefined)
  } finally {
    if (originalPath !== undefined) process.env.PATH = originalPath
    if (originalSynapse !== undefined)
      process.env.SYNAPSE_OPENCODE_PATH = originalSynapse
  }
})

test("OpencodeDriver.detect honors SYNAPSE_OPENCODE_PATH with a fake script", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-detect-"))
  const fake = path.join(dir, "fake-opencode")
  writeFileSync(
    fake,
    "#!/bin/sh\necho '1.2.3-fake'\n",
    { mode: 0o755 }
  )
  const originalSynapse = process.env.SYNAPSE_OPENCODE_PATH
  process.env.SYNAPSE_OPENCODE_PATH = fake
  try {
    const entry = new OpencodeDriver().detect()
    assert.equal(entry.status, "available")
    assert.equal(entry.executablePath, fake)
    assert.equal(entry.version, "1.2.3-fake")
  } finally {
    if (originalSynapse !== undefined)
      process.env.SYNAPSE_OPENCODE_PATH = originalSynapse
    else delete process.env.SYNAPSE_OPENCODE_PATH
  }
})

test("OpencodeDriver.createSession runs the bootstrap turn and maps events", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-session-"))
  const fakeBinary = writeFakeOpencode(dir, "fake-opencode-run")
  const driver = new OpencodeDriver()

  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-1",
    workingDirectory: dir,
    initialPrompt: "hello bootstrap",
    runtimePath: fakeBinary,
  })

  try {
    assert.equal(session.runtimeKind, "opencode")
    const events = await collectSessionEvents(session)
    const kinds = events.map((event) => event.kind)
    assert.ok(kinds.includes("session_started"), `saw ${kinds.join(",")}`)
    assert.ok(kinds.includes("assistant_message"))
    assert.equal(kinds[kinds.length - 1], "turn_completed")
    const started = events.find((event) => event.kind === "session_started")
    assert.equal(
      started && started.kind === "session_started" ? started.sessionId : undefined,
      FAKE_SESSION_ID
    )
    assert.equal(session.sessionId, FAKE_SESSION_ID)
    const text = events.find((event) => event.kind === "assistant_message")
    assert.equal(text && text.kind === "assistant_message" ? text.text : "", "fake reply")
  } finally {
    await session.close("test done")
  }
})

test("OpencodeAgentSession.send() spawns a follow-up turn reusing the cached session id", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-send-"))
  const fakeBinary = writeFakeOpencode(dir, "fake-opencode-send")
  const driver = new OpencodeDriver()

  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-2",
    workingDirectory: dir,
    initialPrompt: "first",
    resumeSessionId: FAKE_SESSION_ID,
    runtimePath: fakeBinary,
  })

  try {
    // Bootstrap turn consumes the initial events; session id came pre-cached
    // from resumeSessionId, so the fake's matching sessionID must NOT emit a
    // duplicate session_started.
    const first = await collectSessionEvents(session)
    assert.ok(
      !first.some((event) => event.kind === "session_started"),
      "resumed session must not re-emit session_started for a known id"
    )
    assert.equal(session.sessionId, FAKE_SESSION_ID)

    // Follow-up send: a fresh child runs and completes another turn.
    const sendPromise = session.send("second")
    const events = await collectSessionEvents(session)
    await sendPromise
    const kinds = events.map((event) => event.kind)
    assert.ok(kinds.includes("assistant_message"))
    assert.equal(kinds[kinds.length - 1], "turn_completed")
  } finally {
    await session.close("test done")
  }
})

test("OpencodeAgentSession.respondPermission honestly refuses: run mode cannot answer permissions", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-perm-"))
  const fakeBinary = writeFakeOpencode(dir, "fake-opencode-perm")
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-3",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: fakeBinary,
  })
  try {
    await assert.rejects(
      () =>
        session.respondPermission("req-1", {
          behavior: "deny",
          message: "no",
        }),
      /not available|auto-rejects/i
    )
  } finally {
    await session.close("test done")
  }
})

test("a failing child surfaces as error + turn_completed exactly once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-fail-"))
  const failing = path.join(dir, "failing-opencode")
  writeFileSync(
    failing,
    `#!/bin/sh\necho '{"type":"error","timestamp":1,"sessionID":"${FAKE_SESSION_ID}","error":{"name":"APIError","data":{"message":"boom"}}}'\nexit 1\n`,
    { mode: 0o755 }
  )
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-4",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: failing,
  })
  try {
    const events = await collectSessionEvents(session)
    const errors = events.filter((event) => event.kind === "error")
    const terminals = events.filter((event) => event.kind === "turn_completed")
    assert.equal(errors.length, 1)
    assert.equal(
      errors[0].kind === "error" ? errors[0].message : "",
      "boom"
    )
    assert.equal(terminals.length, 1)
  } finally {
    await session.close("test done")
  }
})

test("non-zero exit with only stderr (no JSON error) reports the stderr tail", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-stderr-"))
  const failing = path.join(dir, "stderr-opencode")
  // Mirrors the real stale-session behavior: "Session not found" on stderr, exit 1.
  writeFileSync(
    failing,
    "#!/bin/sh\necho 'Error: Session not found' >&2\nexit 1\n",
    { mode: 0o755 }
  )
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-5",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: failing,
  })
  try {
    const events = await collectSessionEvents(session)
    const error = events.find((event) => event.kind === "error")
    assert.ok(error, "expected an error event")
    if (error && error.kind === "error") {
      assert.match(error.message, /Session not found/)
      assert.match(error.message, /exited with code 1/)
    }
    assert.equal(
      events.filter((event) => event.kind === "turn_completed").length,
      1
    )
  } finally {
    await session.close("test done")
  }
})

test("missing binary surfaces as a spawn error terminal, not a wedge", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-enoent-"))
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-6",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: path.join(dir, "definitely-not-installed-opencode"),
  })
  try {
    const events = await collectSessionEvents(session)
    const kinds = events.map((event) => event.kind)
    assert.ok(kinds.includes("error"), `saw ${kinds.join(",")}`)
    assert.equal(kinds[kinds.length - 1], "turn_completed")
  } finally {
    await session.close("test done")
  }
})

test("resume contract: first run has no --session, follow-up sends pass --session <captured id>", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-argv-"))
  const argvLog = path.join(dir, "argv.log")
  const fakeBinary = writeArgRecordingOpencode(dir, "fake-opencode-argv", argvLog)
  const driver = new OpencodeDriver()

  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-7",
    workingDirectory: dir,
    initialPrompt: "first turn",
    runtimePath: fakeBinary,
  })

  try {
    // Bootstrap turn: session id is unknown, so --session must NOT be passed.
    await collectSessionEvents(session)
    const firstArgv = readArgvLog(argvLog)
    assert.ok(
      !firstArgv.includes("--session"),
      `first run must not pass --session, saw ${firstArgv.join(" ")}`
    )
    // Sanity: the run subcommand and json format are always present.
    assert.ok(firstArgv.includes("run"))
    assert.ok(firstArgv.includes("json"))
    assert.equal(session.sessionId, FAKE_SESSION_ID)

    // Follow-up send: the captured session id must ride along as --session <id>.
    const sendPromise = session.send("second turn")
    await collectSessionEvents(session)
    await sendPromise
    const secondArgv = readArgvLog(argvLog)
    const sessionFlagIndex = secondArgv.indexOf("--session")
    assert.ok(
      sessionFlagIndex !== -1,
      `follow-up run must pass --session, saw ${secondArgv.join(" ")}`
    )
    assert.equal(
      secondArgv[sessionFlagIndex + 1],
      FAKE_SESSION_ID,
      `--session must carry the captured id, saw ${secondArgv.join(" ")}`
    )
  } finally {
    await session.close("test done")
  }
})

function readArgvLog(argvLog: string): string[] {
  return readFileSync(argvLog, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

test("clean exit-0 turn emits NO error event (spurious-error regression)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-cleanexit-"))
  const fakeBinary = writeFakeOpencode(dir, "fake-opencode-clean")
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-8",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: fakeBinary,
  })
  try {
    const events = await collectSessionEvents(session)
    const kinds = events.map((event) => event.kind)
    // The fake exits 0 after a full NDJSON turn: that is a SUCCESS. The old
    // finalizeTurn pushed "exited with code 0" as an error on every clean
    // turn — poison for last_error bookkeeping. Only the terminal is allowed.
    assert.ok(
      !kinds.includes("error"),
      `clean exit must not emit error, saw ${kinds.join(",")}`
    )
    assert.equal(kinds[kinds.length - 1], "turn_completed")
  } finally {
    await session.close("test done")
  }
})

test("send() returns without waiting for the turn to finish (non-blocking dispatch)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-nonblock-"))
  const slow = path.join(dir, "slow-opencode")
  // Sleeps 2s before emitting the turn — long enough that a blocking send()
  // (the old `await this.sendChain`) would visibly exceed the margin, short
  // enough to keep the suite fast.
  writeFileSync(
    slow,
    `#!/bin/sh
sleep 2
echo '{"type":"step_start","timestamp":1,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-start"}}'
echo '{"type":"text","timestamp":2,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"text","text":"slow reply","time":{"start":1,"end":2}}}'
echo '{"type":"step_finish","timestamp":3,"sessionID":"${FAKE_SESSION_ID}","part":{"type":"step-finish","reason":"stop"}}'
exit 0
`,
    { mode: 0o755 }
  )
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-11",
    workingDirectory: dir,
    initialPrompt: "hi",
    resumeSessionId: FAKE_SESSION_ID,
    runtimePath: slow,
  })
  try {
    // Bootstrap turn is itself non-blocking now; wait for it to finish so the
    // send below is the one measured.
    await collectSessionEvents(session)
    const started = Date.now()
    await session.send("slow prompt")
    const elapsed = Date.now() - started
    assert.ok(
      elapsed < 1500,
      `send() must hand off to the turn chain and return (took ${elapsed}ms)`
    )
    // The turn still completes via events().
    const events = await collectSessionEvents(session)
    const kinds = events.map((event) => event.kind)
    assert.ok(kinds.includes("assistant_message"))
    assert.equal(kinds[kinds.length - 1], "turn_completed")
  } finally {
    await session.close("test done")
  }
})

test("stderr larger than the pipe buffer is fully drained before finalization (close-event regression)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-stddeburburst-"))
  const failing = path.join(dir, "stderr-burst-opencode")
  // ~120KB of stderr (> the 64KB pipe buffer) with the diagnostic we care
  // about LAST. Under the old 'exit' listener the terminal could fire while
  // the pipe still held buffered chunks (reviewer reproduced this failing on
  // Linux/Node 24): the tail was truncated and "Session not found" — and the
  // stale-session self-heal keyed on it — silently vanished. 'close' fires
  // only after every stdio stream drained, so the full tail is visible.
  writeFileSync(
    failing,
    `#!/bin/sh
i=0
while [ $i -lt 4000 ]; do
  echo "filler noise line $i padding padding padding" >&2
  i=$((i+1))
done
echo 'Error: Session not found' >&2
exit 1
`,
    { mode: 0o755 }
  )
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-9",
    workingDirectory: dir,
    initialPrompt: "hi",
    resumeSessionId: "ses_stale_for_burst",
    runtimePath: failing,
  })
  try {
    const events = await collectSessionEvents(session)
    const error = events.find((event) => event.kind === "error")
    assert.ok(error, "expected an error event")
    if (error && error.kind === "error") {
      assert.match(
        error.message,
        /Session not found/,
        "the stderr tail (incl. the trailing diagnostic past the pipe buffer) must be drained"
      )
      assert.match(error.message, /exited with code 1/)
    }
    // The stale-session self-heal keyed on the drained stderr must fire.
    assert.equal(session.sessionId, undefined)
  } finally {
    await session.close("test done")
  }
})

test("spawn error followed by close emits exactly one terminal (no double-finalize)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-errclose-"))
  const driver = new OpencodeDriver()
  const session = await driver.createSession({
    remoteAgentId: "agent-1",
    conversationId: "conv-10",
    workingDirectory: dir,
    initialPrompt: "hi",
    runtimePath: path.join(dir, "definitely-not-installed-opencode"),
  })
  const events: AgentSessionEvent[] = []
  const drained = (async () => {
    for await (const event of session.events()) events.push(event)
  })()
  try {
    // A failed spawn emits 'error' AND THEN 'close' (Node docs). Give both
    // time to fire before closing the stream.
    await new Promise((resolve) => setTimeout(resolve, 500))
  } finally {
    await session.close("test done")
  }
  await drained
  assert.equal(
    events.filter((event) => event.kind === "error").length,
    1,
    `exactly one error, saw ${events.map((e) => e.kind).join(",")}`
  )
  assert.equal(
    events.filter((event) => event.kind === "turn_completed").length,
    1,
    "close after spawn-error must not finalize a second terminal"
  )
})
