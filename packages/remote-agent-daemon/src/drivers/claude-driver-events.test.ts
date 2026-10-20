import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPermissionResultForDecision,
  extractAssistantText,
  parseAskUserQuestionInput,
  parsePlanApprovalInput,
  readClaudeResultErrorMessage,
} from "./claude-driver-events.js"

test("extractAssistantText concatenates only text content blocks", () => {
  assert.equal(
    extractAssistantText({
      message: {
        content: [
          { type: "text", text: "hello " },
          { type: "tool_use", id: "x", name: "Read", input: {} },
          { type: "text", text: "world" },
        ],
      },
    }),
    "hello world"
  )
})

test("extractAssistantText returns empty string when content is missing or empty", () => {
  assert.equal(extractAssistantText({}), "")
  assert.equal(extractAssistantText({ message: {} }), "")
  assert.equal(extractAssistantText({ message: { content: [] } }), "")
})

test("buildPermissionResultForDecision encodes an allow decision with updatedInput", () => {
  const result = buildPermissionResultForDecision(
    { behavior: "allow", updatedInput: { answers: { a: "1" } } },
    "tool-use-42"
  )
  assert.deepEqual(result, {
    behavior: "allow",
    updatedInput: { answers: { a: "1" } },
    toolUseID: "tool-use-42",
  })
})

test("buildPermissionResultForDecision defaults updatedInput to empty when omitted", () => {
  const result = buildPermissionResultForDecision(
    { behavior: "allow" },
    "tool-use-1"
  )
  assert.deepEqual(
    result.behavior === "allow" ? result.updatedInput : undefined,
    {}
  )
})

test("buildPermissionResultForDecision propagates deny with the supplied user-visible message", () => {
  const result = buildPermissionResultForDecision(
    { behavior: "deny", message: "user asked to revise" },
    "tool-use-99"
  )
  assert.deepEqual(result, {
    behavior: "deny",
    message: "user asked to revise",
    toolUseID: "tool-use-99",
  })
})

test("readClaudeResultErrorMessage maps failed result events", () => {
  assert.equal(
    readClaudeResultErrorMessage({
      is_error: true,
      stop_reason: "error",
      errors: ["boom"],
    }),
    "boom"
  )
  assert.equal(
    readClaudeResultErrorMessage({
      is_error: true,
      stop_reason: "max_tokens",
      result: "truncated",
    }),
    null
  )
  assert.equal(readClaudeResultErrorMessage({ is_error: false }), null)
})

test("parseAskUserQuestionInput normalizes question payloads", () => {
  assert.deepEqual(
    parseAskUserQuestionInput({
      questions: [{ id: "q1", question: "  Need input? " }, "drifted-question"],
      extra: true,
    }),
    {
      title: "Need input?",
      questions: [{ id: "q1", question: "  Need input? " }],
      originalInput: {
        questions: [
          { id: "q1", question: "  Need input? " },
          "drifted-question",
        ],
        extra: true,
      },
    }
  )
  assert.deepEqual(parseAskUserQuestionInput(null), {
    title: "Question from Claude",
    questions: [],
    originalInput: {},
  })
})

test("parsePlanApprovalInput normalizes plan payloads", () => {
  assert.deepEqual(parsePlanApprovalInput({ plan: "ship it" }), {
    planMarkdown: "ship it",
    originalInput: { plan: "ship it" },
  })
  assert.deepEqual(parsePlanApprovalInput({ plan: 123 }), {
    planMarkdown: "Claude did not include a plan body.",
    originalInput: { plan: 123 },
  })
})
