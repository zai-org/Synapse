import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildAnswerMap,
  buildResolvedUserInputPrompt,
  parseResolvedTaskPayload,
} from "./resolved-task-payload.js"

test("parseResolvedTaskPayload normalizes resolved user-input task fields", () => {
  const task = parseResolvedTaskPayload({
    conversationId: "conversation-1",
    kind: "user_input",
    lifecycleStatus: "completed",
    userInput: {
      title: "Pick a path",
      questions: [
        {
          id: "q1",
          prompt: "Which path?",
          answer: {
            selectedOptionLabels: ["Safe"],
            otherText: "with smoke tests",
          },
        },
        "drifted-question",
      ],
    },
  })

  assert.equal(task.conversationId, "conversation-1")
  assert.equal(task.kind, "user_input")
  assert.equal(task.lifecycleStatus, "completed")
  assert.equal(task.userInput?.questions?.length, 1)
  assert.deepEqual(buildAnswerMap(task), {
    "Which path?": "Safe, with smoke tests",
  })
  assert.match(
    buildResolvedUserInputPrompt(task),
    /Which path\?: Safe \| with smoke tests/
  )
})

test("parseResolvedTaskPayload ignores malformed nested payload fields", () => {
  const task = parseResolvedTaskPayload({
    conversationId: 42,
    kind: "plan_approval",
    outcome: "approved",
    resolutionNote: ["ship it"],
    userInput: {
      title: 99,
      questions: [{ prompt: 123, answer: "bad-answer" }],
    },
  })

  assert.equal(task.conversationId, undefined)
  assert.equal(task.kind, "plan_approval")
  assert.equal(task.outcome, "approved")
  assert.equal(task.resolutionNote, undefined)
  assert.equal(task.userInput?.title, undefined)
  assert.equal(task.userInput?.questions?.length, 1)
  assert.deepEqual(buildAnswerMap(task), {})
})

test("parseResolvedTaskPayload returns an empty payload for non-object tasks", () => {
  assert.deepEqual(parseResolvedTaskPayload(null), {})
  assert.deepEqual(parseResolvedTaskPayload([]), {})
})
