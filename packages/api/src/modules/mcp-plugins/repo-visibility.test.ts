import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { fileURLToPath } from "node:url"

const spec = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const lookups: string[] = []
let upserts = 0

mock.module(spec("../access/subject-resolution.ts"), {
  namedExports: {
    buildConversationCapabilitySubjects: async () => [
      { type: "workspace", id: "workspace-1" },
      { type: "remote_agent", id: "agent-1" },
    ],
  },
})
mock.module(spec("../access/subject-registry.ts"), {
  namedExports: {
    subjectKindToParticipantType: () => "remote_agent",
    rowToSubjectRef: () => ({}),
    findAccessSubjectId: async (_db: unknown, ref: { kind: string }) => {
      lookups.push(ref.kind)
      return `subject-${ref.kind}`
    },
    findAccessSubjectIdOn: async () => null,
    loadAccessSubject: async () => null,
    loadAccessSubjectOn: async () => null,
    loadAccessSubjectMany: async () => [],
    upsertAccessSubject: async () => {
      upserts++
      return "inserted-subject"
    },
    upsertAccessSubjectOn: async () => "inserted-subject",
    upsertAccessSubjectOnTrx: async () => "inserted-subject",
  },
})

const { buildPluginVisibilitySubjectIds } = await import("./repo.js")

test("execution visibility resolves existing subjects without writes", async () => {
  const subjects = await buildPluginVisibilitySubjectIds(
    {
      workspaceId: "workspace-1",
      remoteAgentId: "agent-1",
      conversationId: "conversation-1",
    },
    true
  )

  assert.deepEqual(lookups, ["workspace", "remote_agent", "conversation"])
  assert.deepEqual(subjects.subjectIds, [
    "subject-workspace",
    "subject-remote_agent",
    "subject-conversation",
  ])
  assert.deepEqual(subjects.runtimeScopeSubjectIds, ["subject-conversation"])
  assert.equal(upserts, 0)
})
