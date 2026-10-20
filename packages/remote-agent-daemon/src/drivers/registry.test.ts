import test from "node:test"
import assert from "node:assert/strict"
import {
  __clearDriversForTest,
  getDriver,
  listDrivers,
  registerDriver,
  tryGetDriver,
} from "./registry.js"
import type {
  AgentDriver,
  AgentSession,
  RuntimeCatalogEntry,
  SessionSpec,
} from "./types.js"

function buildFakeDriver(
  runtimeKind: "claude_code" | "codex",
  override: Partial<RuntimeCatalogEntry> = {}
): AgentDriver {
  return {
    runtimeKind,
    label: `fake-${runtimeKind}`,
    capabilities: {},
    detect(): RuntimeCatalogEntry {
      return { runtimeKind, status: "available", ...override }
    },
    async createSession(_spec: SessionSpec): Promise<AgentSession> {
      throw new Error("not implemented in fake driver")
    },
  }
}

test("registry returns null until a driver is registered", () => {
  __clearDriversForTest()
  assert.equal(tryGetDriver("claude_code"), null)
  assert.throws(() => getDriver("claude_code"), /No driver registered/)
})

test("registry round-trips driver lookup by runtimeKind", () => {
  __clearDriversForTest()
  const claude = buildFakeDriver("claude_code")
  const codex = buildFakeDriver("codex")
  registerDriver(claude)
  registerDriver(codex)
  assert.equal(getDriver("claude_code"), claude)
  assert.equal(getDriver("codex"), codex)
  assert.deepEqual(
    listDrivers().sort(byRuntimeKind),
    [claude, codex].sort(byRuntimeKind)
  )
})

test("registry registration replaces a previous driver for the same runtime", () => {
  __clearDriversForTest()
  const first = buildFakeDriver("claude_code", { version: "1.0" })
  const second = buildFakeDriver("claude_code", { version: "2.0" })
  registerDriver(first)
  registerDriver(second)
  assert.equal(getDriver("claude_code"), second)
  assert.equal(listDrivers().length, 1)
})

function byRuntimeKind(left: AgentDriver, right: AgentDriver) {
  return left.runtimeKind.localeCompare(right.runtimeKind)
}
