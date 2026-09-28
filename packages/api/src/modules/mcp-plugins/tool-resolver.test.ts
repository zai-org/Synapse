import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { fileURLToPath } from "node:url"
import type { VisiblePluginRow } from "./repo.js"

const spec = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

let visible = true
let executions = 0
let visibilityChecks = 0
const plugin: VisiblePluginRow = {
  installationId: "installation-1",
  ownerWorkspaceId: "workspace-1",
  installationStatus: "active",
  catalogItemId: "catalog-1",
  itemSlug: "test-plugin",
  publisherSlug: "test",
  transport: "builtin",
  entryPoint: "test",
  toolManifest: [{ name: "ping" }],
  reuseScope: "conversation",
  conversationTypeMaskOverride: null,
}

mock.module(spec("./repo.ts"), {
  namedExports: {
    loadVisiblePluginRows: async () => [plugin],
    isPluginInstallationVisible: async (
      params: { workspaceId: string; conversationId: string },
      installationId: string
    ) => {
      assert.equal(params.workspaceId, "workspace-1")
      assert.equal(params.conversationId, "conversation-1")
      assert.equal(installationId, plugin.installationId)
      visibilityChecks++
      return visible
    },
  },
})
mock.module(spec("./config-resolver.ts"), {
  namedExports: {
    resolveInstallationConfig: async () => ({
      installationId: plugin.installationId,
      config: {},
    }),
  },
})
mock.module(spec("./instance-manager.ts"), {
  namedExports: {
    getOrCreateInstance: async () => ({
      installationId: plugin.installationId,
      pluginSlug: plugin.itemSlug,
      orgSlug: plugin.publisherSlug,
      transport: "builtin",
      scope: "conversation",
      scopeId: "conversation:conversation-1",
      configHash: "test",
      tools: [
        {
          name: "ping",
          description: "",
          parameters: { type: "object", properties: {}, required: [] },
        },
      ],
      execute: async () => {
        executions++
        return "pong"
      },
    }),
  },
})
mock.module(spec("./runtime-version.ts"), {
  namedExports: { getMcpVersion: async () => 1 },
})
mock.module(spec("./result-normalizer.ts"), {
  namedExports: {
    normalizeMcpToolResult: async (raw: unknown) => ({
      content: [],
      rawResult: raw,
    }),
  },
})
mock.module(spec("../../infrastructure/logger/index.ts"), {
  namedExports: { createLogger: () => ({ error: () => {} }) },
})

const { resolveMcpToolsForRemoteAgent } = await import("./tool-resolver.js")

test("revoked plugin grant prevents execution through an existing resolver", async () => {
  const resolved = await resolveMcpToolsForRemoteAgent({
    workspaceId: "workspace-1",
    remoteAgentId: "remote-agent-1",
    sessionId: "session-1",
    conversationId: "conversation-1",
  })
  const toolId = resolved.tools[0]?.ref.toolId
  assert.ok(toolId)

  await resolved.executor(toolId, {})
  assert.equal(executions, 1)
  assert.equal(visibilityChecks, 1)

  visible = false
  await assert.rejects(resolved.executor(toolId, {}), /no longer authorized/i)
  assert.equal(executions, 1)
  assert.equal(visibilityChecks, 2)
})
