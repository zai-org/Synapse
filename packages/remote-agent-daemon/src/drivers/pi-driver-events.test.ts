import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAskQuestionToolResult,
  extractPiAssistantText,
  parseAskUserQuestionInput,
  renderAskQuestionAnswers,
} from "./pi-driver-events.js"

test("extractPiAssistantText joins text blocks of an assistant message", () => {
  const message = {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "internal reasoning" },
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ],
  }
  assert.equal(extractPiAssistantText(message), "Hello world")
})

test("extractPiAssistantText returns string content directly", () => {
  assert.equal(
    extractPiAssistantText({ role: "user", content: "plain text" }),
    ""
  )
  const assistant = { role: "assistant", content: "plain text" }
  assert.equal(extractPiAssistantText(assistant), "plain text")
})

test("extractPiAssistantText ignores thinking-only assistant messages", () => {
  const message = {
    role: "assistant",
    content: [{ type: "thinking", thinking: "only thoughts" }],
  }
  assert.equal(extractPiAssistantText(message), "")
})

test("extractPiAssistantText handles tool-call-only and malformed messages", () => {
  assert.equal(
    extractPiAssistantText({
      role: "assistant",
      content: [{ type: "tool_call", id: "t1", name: "bash" }],
    }),
    ""
  )
  assert.equal(extractPiAssistantText(null), "")
  assert.equal(extractPiAssistantText({}), "")
  assert.equal(extractPiAssistantText({ role: "assistant" }), "")
})

test("parseAskUserQuestionInput derives the title from the first question", () => {
  const parsed = parseAskUserQuestionInput({
    questions: [
      { question: "  Which database?  ", options: [{ label: "postgres" }] },
      { question: "And the cache?" },
    ],
  })
  assert.equal(parsed.title, "Which database?")
  assert.equal(parsed.questions.length, 2)
  assert.deepEqual(parsed.originalInput.questions, parsed.questions)
})

test("parseAskUserQuestionInput falls back to a default title and filters junk", () => {
  const parsed = parseAskUserQuestionInput({
    questions: ["not-a-record", null, { question: "" }],
  })
  assert.equal(parsed.title, "Question from pi")
  assert.equal(parsed.questions.length, 1)
})

test("parseAskUserQuestionInput tolerates missing questions", () => {
  const parsed = parseAskUserQuestionInput({ foo: 1 })
  assert.equal(parsed.title, "Question from pi")
  assert.deepEqual(parsed.questions, [])
  assert.deepEqual(parsed.originalInput, { foo: 1 })
})

test("buildAskQuestionToolResult renders allow decisions as answer lines", () => {
  const result = buildAskQuestionToolResult({
    behavior: "allow",
    updatedInput: {
      questions: [{ question: "Deploy now?" }],
      answers: { "Deploy now?": "Yes, with smoke tests", "Other?": "  " },
    },
  })
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.content, [
    { type: "text", text: "- Deploy now?: Yes, with smoke tests" },
  ])
  assert.deepEqual(result.details, {
    answers: { "Deploy now?": "Yes, with smoke tests", "Other?": "  " },
  })
})

test("buildAskQuestionToolResult handles allow without usable answers", () => {
  const result = buildAskQuestionToolResult({ behavior: "allow" })
  assert.equal(result.isError, undefined)
  assert.equal(result.content[0].text, "The user responded without a specific answer.")
})

test("buildAskQuestionToolResult marks deny decisions as errors", () => {
  const result = buildAskQuestionToolResult({
    behavior: "deny",
    message: "user asked to revise",
  })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /user asked to revise/)
})

test("renderAskQuestionAnswers skips non-string and empty values", () => {
  assert.equal(
    renderAskQuestionAnswers({
      "Q1?": "answer",
      "Q2?": "",
      "Q3?": 42,
      "Q4?": "  spaced  ",
    }),
    "- Q1?: answer\n- Q4?: spaced"
  )
})
