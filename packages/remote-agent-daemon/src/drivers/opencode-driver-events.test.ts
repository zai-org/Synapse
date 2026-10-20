import test from "node:test"
import assert from "node:assert/strict"
import {
  mergeOpencodeConfigEnv,
  parseOpencodeRunLine,
  readOpencodeErrorMessage,
  readOpencodeSessionId,
  toOpencodeMcpServer,
} from "./opencode-driver-events.js"

// Fixtures below are REAL lines captured live from `opencode run --format
// json` on opencode 1.18.33 (success streams from actual turns, plus an
// API-error event), so the parser is pinned against observed output, not
// imagination. Shapes cross-checked against the 1.18.33 run.ts source.

const REAL_STEP_START =
  '{"type":"step_start","timestamp":1790773886601,"sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","part":{"id":"prt_0f270fe80001zUQigeZtuZduwX","messageID":"msg_0f270e6fa001P0FLpuXa0hIb0G","sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","type":"step-start"}}'

const REAL_TEXT =
  '{"type":"text","timestamp":1790773887373,"sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","part":{"id":"prt_0f270fe85001Ft0hcRAIxiKakh","messageID":"msg_0f270e6fa001P0FLpuXa0hIb0G","sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","type":"text","text":"Hi! What can I help you with?","time":{"start":1790773886597,"end":1790773887349}}}'

const REAL_STEP_FINISH =
  '{"type":"step_finish","timestamp":1790773887373,"sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","part":{"id":"prt_0f271017f001GOM43u73F4HJO8","reason":"stop","messageID":"msg_0f270e6fa001P0FLpuXa0hIb0G","sessionID":"ses_f0d8f1a0cffePAuvd8Fue3A1mJ","type":"step-finish","tokens":{"total":8158,"input":6209,"output":10,"reasoning":0,"cache":{"write":0,"read":1939}},"cost":0}}'

const REAL_TOOL_USE =
  '{"type":"tool_use","timestamp":1790773990000,"sessionID":"ses_f0d8ec799ffeZMXxz4rpBFUpzk","part":{"id":"prt_tool1","messageID":"msg_1","sessionID":"ses_f0d8ec799ffeZMXxz4rpBFUpzk","type":"tool","tool":"bash","state":{"status":"completed","input":{"command":"echo synapse-test"},"content":[],"structured":{}}}}'

// Real API-error event (model unavailable): message lives in error.data.message.
const REAL_ERROR =
  '{"type":"error","timestamp":1790773348249,"sessionID":"ses_f0d98628affemiW4ZHfoVQdz5Z","error":{"name":"APIError","data":{"message":"Upstream request failed: Insufficient account funds","statusCode":402,"isRetryable":false}}}'

test("parseOpencodeRunLine maps a real text part to assistant_text", () => {
  assert.deepEqual(parseOpencodeRunLine(REAL_TEXT), {
    kind: "assistant_text",
    text: "Hi! What can I help you with?",
  })
})

test("parseOpencodeRunLine extracts the data.message from a real error event", () => {
  assert.deepEqual(parseOpencodeRunLine(REAL_ERROR), {
    kind: "error",
    message: "Upstream request failed: Insufficient account funds",
  })
})

test("parseOpencodeRunLine ignores step lifecycle, tool_use, and unknown types", () => {
  for (const line of [REAL_STEP_START, REAL_STEP_FINISH, REAL_TOOL_USE]) {
    assert.deepEqual(parseOpencodeRunLine(line), { kind: "ignored" })
  }
  assert.deepEqual(
    parseOpencodeRunLine(
      '{"type":"some_future_event","timestamp":1,"sessionID":"ses_x","part":{"type":"whatever"}}'
    ),
    { kind: "ignored" }
  )
})

test("parseOpencodeRunLine skips blank lines and non-JSON noise", () => {
  // opencode prints the permission auto-reject warning as a plain stdout line
  // even in --format json mode; the parser must not throw on it.
  assert.deepEqual(parseOpencodeRunLine(""), { kind: "ignored" })
  assert.deepEqual(parseOpencodeRunLine("   "), { kind: "ignored" })
  assert.deepEqual(
    parseOpencodeRunLine("! permission requested: bash (*); auto-rejecting"),
    { kind: "ignored" }
  )
  assert.deepEqual(parseOpencodeRunLine("not json at all"), { kind: "ignored" })
})

test("parseOpencodeRunLine ignores a text part with empty/whitespace text", () => {
  const emptyText =
    '{"type":"text","timestamp":1,"sessionID":"ses_x","part":{"type":"text","text":"   \\n ","time":{"start":1,"end":2}}}'
  assert.deepEqual(parseOpencodeRunLine(emptyText), { kind: "ignored" })
})

test("readOpencodeSessionId pulls the envelope sessionID", () => {
  assert.equal(readOpencodeSessionId(REAL_TEXT), "ses_f0d8f1a0cffePAuvd8Fue3A1mJ")
  assert.equal(readOpencodeSessionId(REAL_ERROR), "ses_f0d98628affemiW4ZHfoVQdz5Z")
  assert.equal(readOpencodeSessionId("garbage"), undefined)
  assert.equal(readOpencodeSessionId('{"type":"text"}'), undefined)
})

test("readOpencodeErrorMessage falls back to error.name without data.message", () => {
  assert.equal(readOpencodeErrorMessage({ name: "UnknownError" }), "UnknownError")
  assert.equal(
    readOpencodeErrorMessage({ name: "X", data: { message: "real msg" } }),
    "real msg"
  )
  assert.equal(readOpencodeErrorMessage(null), "opencode run failed")
})

test("toOpencodeMcpServer maps http servers to remote config", () => {
  assert.deepEqual(
    toOpencodeMcpServer({
      type: "http",
      url: "http://127.0.0.1:53000/api/v1/internal/remote-agents/a/mcp/c",
      headers: { Authorization: "Bearer key" },
    }),
    {
      type: "remote",
      url: "http://127.0.0.1:53000/api/v1/internal/remote-agents/a/mcp/c",
      headers: { Authorization: "Bearer key" },
    }
  )
})

test("toOpencodeMcpServer maps stdio servers to local config", () => {
  assert.deepEqual(
    toOpencodeMcpServer({
      command: "npx",
      args: ["-y", "some-mcp"],
      env: { KEY: "value" },
    }),
    {
      type: "local",
      command: ["npx", "-y", "some-mcp"],
      environment: { KEY: "value" },
    }
  )
  // env omitted entirely when empty
  assert.deepEqual(toOpencodeMcpServer({ command: "tool" }), {
    type: "local",
    command: ["tool"],
  })
})

test("mergeOpencodeConfigEnv merges mcp over an existing config without clobbering other keys", () => {
  const existing = JSON.stringify({
    theme: "dark",
    mcp: { other: { type: "remote", url: "http://x" } },
  })
  const merged = mergeOpencodeConfigEnv(existing, {
    synapse: { type: "remote", url: "http://127.0.0.1:1/mcp" },
  })
  const parsed = JSON.parse(merged)
  assert.equal(parsed.theme, "dark")
  assert.equal(parsed.mcp.other.url, "http://x")
  assert.equal(parsed.mcp.synapse.url, "http://127.0.0.1:1/mcp")
})

test("mergeOpencodeConfigEnv replaces corrupt ambient config instead of crashing", () => {
  const merged = mergeOpencodeConfigEnv("{not json", {
    synapse: { type: "remote", url: "u" },
  })
  const parsed = JSON.parse(merged)
  assert.equal(parsed.mcp.synapse.url, "u")
})

test("mergeOpencodeConfigEnv handles no existing config", () => {
  const merged = mergeOpencodeConfigEnv(undefined, {
    synapse: { type: "remote", url: "u" },
  })
  assert.equal(JSON.parse(merged).mcp.synapse.url, "u")
})
