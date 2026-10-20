import type { PermissionDecision } from "./types.js"

/**
 * Pure mapping helpers for the pi driver: pi SDK events / tool payloads →
 * Synapse AgentSessionEvent shapes. Kept free of SDK imports so the mapping
 * logic stays unit-testable without instantiating a real pi session (the SDK
 * reads ~/.pi/agent auth + models at construction time).
 *
 * Pattern mirrors claude-driver-events.ts.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Extract the model-facing text of a pi assistant message (the `message` of a
 * `message_end` event, or one of `agent_end`'s `messages`). User messages,
 * tool results, and thinking-only assistant messages yield "".
 */
export function extractPiAssistantText(message: unknown): string {
  const record = asRecord(message)
  if (record.role !== "assistant") return ""
  const content = record.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    const blockRecord = asRecord(block)
    if (blockRecord.type === "text" && typeof blockRecord.text === "string") {
      parts.push(blockRecord.text)
    }
  }
  return parts.join("")
}

export interface PiAskUserQuestionInputView {
  title: string
  questions: Array<Record<string, unknown>>
  originalInput: Record<string, unknown>
}

/**
 * Normalize the raw params of the ask_question tool call into the
 * user_input_requested payload. Accepts the Claude AskUserQuestion-compatible
 * shape ({ questions: [{ question, options, multiple }] }); the api-side
 * question normalizer reads prompt/question/text/label, so `question` keys
 * pass through untouched.
 */
export function parseAskUserQuestionInput(
  input: unknown
): PiAskUserQuestionInputView {
  const originalInput = asRecord(input)
  const questions = Array.isArray(originalInput.questions)
    ? originalInput.questions.filter(
        (question): question is Record<string, unknown> =>
          !!question && typeof question === "object" && !Array.isArray(question)
      )
    : []
  return {
    title:
      (typeof questions[0]?.question === "string"
        ? String(questions[0].question).trim()
        : "") || "Question from pi",
    questions,
    originalInput,
  }
}

/** Result contract of a pi custom-tool execute() (AgentToolResult subset). */
export interface PiAskQuestionToolResult {
  content: Array<{ type: "text"; text: string }>
  details: Record<string, unknown>
  isError?: boolean
}

/**
 * Render the resolved user-input decision back into the ask_question tool
 * result the model sees. The daemon's resolveTask builds the allow decision
 * as `{ ...originalInput, answers: Record<question, answer> }`; deny carries
 * the user-facing message.
 */
export function buildAskQuestionToolResult(
  decision: PermissionDecision
): PiAskQuestionToolResult {
  if (decision.behavior === "deny") {
    return {
      content: [
        {
          type: "text",
          text: `The user declined to answer: ${decision.message}`,
        },
      ],
      details: {},
      isError: true,
    }
  }
  const answers = asRecord(decision.updatedInput?.answers)
  const text = renderAskQuestionAnswers(answers)
  if (!text) {
    return {
      content: [
        { type: "text", text: "The user responded without a specific answer." },
      ],
      details: {},
    }
  }
  return {
    content: [{ type: "text", text }],
    details: { answers },
  }
}

/**
 * Render an answers map (question → answer) as the model-facing
 * "- question: answer" text of a resolved ask_question call.
 */
export function renderAskQuestionAnswers(
  answers: Record<string, unknown>
): string {
  return Object.entries(answers)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([question, answer]) => `- ${question}: ${String(answer).trim()}`)
    .join("\n")
}
