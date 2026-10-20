import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk"

/**
 * Parsing helpers for `opencode run --format json` NDJSON output.
 *
 * Every line is a flat envelope:
 *   { type: string, timestamp: number(ms), sessionID: string, ...data }
 * Emitted types observed live against opencode 1.18.33 and cross-checked
 * against its `run.ts` source:
 *   - step_start  { part: { type: "step-start", ... } }
 *   - step_finish { part: { type: "step-finish", reason, tokens, ... } }
 *   - text        { part: { type: "text", text, time: { start, end } } }
 *   - tool_use    { part: { type: "tool", tool, state: { status, ... } } }
 *   - reasoning   { part: { type: "reasoning", text } } (only with --thinking)
 *   - error       { error: { name, data?: { message? } } }
 * Unknown future types must be tolerated (ignored), not fatal.
 */

export type OpencodeRunLineResult =
  | { kind: "session"; sessionID: string }
  | { kind: "assistant_text"; text: string }
  | { kind: "error"; message: string }
  | { kind: "ignored" }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Mirror of run.ts's own error formatting: data.message if present, else name. */
export function readOpencodeErrorMessage(error: unknown): string {
  const record = asRecord(error)
  const data = asRecord(record.data)
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message
  }
  if (typeof record.name === "string" && record.name.trim()) {
    return record.name
  }
  return "opencode run failed"
}

export function parseOpencodeRunLine(line: string): OpencodeRunLineResult {
  const trimmed = line.trim()
  if (!trimmed) return { kind: "ignored" }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // opencode run prints occasional human-readable lines on stdout even in
    // --format json mode (e.g. the permission auto-reject warning); skip them.
    return { kind: "ignored" }
  }
  const record = asRecord(parsed)
  if (typeof record.type !== "string") return { kind: "ignored" }

  switch (record.type) {
    case "error":
      return { kind: "error", message: readOpencodeErrorMessage(record.error) }
    case "text": {
      // Only the run loop's own gate already filtered to finished text parts
      // (part.time.end set); the emitted event is a completed assistant text.
      const text =
        typeof asRecord(record.part).text === "string"
          ? (asRecord(record.part).text as string).trim()
          : ""
      if (!text) return { kind: "ignored" }
      return { kind: "assistant_text", text }
    }
    case "step_start":
    case "step_finish":
    case "tool_use":
    case "reasoning":
      // Recognized but not projected into AgentSessionEvent: step lifecycle
      // maps onto nothing the Synapse runtime consumes, tool results arrive
      // through the transcript, and reasoning is noise for the thread.
      return { kind: "ignored" }
    default:
      return { kind: "ignored" }
  }
}

/** Extract the envelope's sessionID, when present. */
export function readOpencodeSessionId(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  try {
    const record = asRecord(JSON.parse(trimmed))
    return typeof record.sessionID === "string" && record.sessionID
      ? record.sessionID
      : undefined
  } catch {
    return undefined
  }
}

/** Map a Synapse McpServerConfig entry to opencode's config-schema MCP shape. */
export function toOpencodeMcpServer(
  server: McpServerConfig
): Record<string, unknown> | undefined {
  if ("type" in server && server.type === "http") {
    const remote: Record<string, unknown> = {
      type: "remote",
      url: server.url,
    }
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(server.headers ?? {})) {
      if (typeof value === "string") headers[key] = value
    }
    if (Object.keys(headers).length > 0) remote.headers = headers
    return remote
  }
  if ("command" in server && typeof server.command === "string") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      ...(server.env && Object.keys(server.env).length > 0
        ? { environment: server.env }
        : {}),
    }
  }
  return undefined
}

/**
 * Merge our `mcp` servers into the OPENCODE_CONFIG_CONTENT env value the
 * child will read. opencode has no per-run MCP flag on `run` (`-c` is
 * `--continue`), so config injection rides through the env.
 *
 * Channel note (verified against opencode 1.18.33's binary): OPENCODE_CONFIG
 * takes a PATH to a config file; OPENCODE_CONFIG_CONTENT takes inline JSON.
 * Inline content is the right channel here — no temp-file lifecycle to own.
 * Our servers win over same-named entries in a pre-existing value; an
 * unparseable existing value is replaced, not crashed on.
 */
export function mergeOpencodeConfigEnv(
  existing: string | undefined,
  servers: Record<string, Record<string, unknown>>
): string {
  let base: Record<string, unknown> = {}
  if (existing && existing.trim()) {
    try {
      const parsed = JSON.parse(existing)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = { ...(parsed as Record<string, unknown>) }
      }
    } catch {
      // Corrupt ambient config — replace rather than propagate the breakage.
    }
  }
  const prevMcp = asRecord(base.mcp)
  base.mcp = { ...prevMcp, ...servers }
  return JSON.stringify(base)
}
