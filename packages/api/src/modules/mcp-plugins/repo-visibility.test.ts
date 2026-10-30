import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { fileURLToPath } from "node:url"

const spec = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const lookups: string[] = []
let upserts = 0
let subjects: { type: string; id: string }[] = [
  { type: "workspace", id: "workspace-1" },
  { type: "remote_agent", id: "agent-1" },
]
let resolveLookup = async (kind: string): Promise<string | null> =>
  `subject-${kind}`

mock.module(spec("../access/subject-resolution.ts"), {
  namedExports: {
    buildConversationCapabilitySubjects: async () => subjects,
  },
})
mock.module(spec("../access/subject-registry.ts"), {
  namedExports: {
    subjectKindToParticipantType: () => "remote_agent",
    rowToSubjectRef: () => ({}),
    findAccessSubjectId: async (_db: unknown, ref: { kind: string }) => {
      lookups.push(ref.kind)
      return resolveLookup(ref.kind)
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

for (const principal of ["actorId", "remoteAgentId"] as const) {
  for (const readOnly of [true, false]) {
    test(`inactive ${principal} cannot recover conversation visibility (readOnly=${readOnly})`, async () => {
      subjects = []
      lookups.length = 0
      upserts = 0
      const result = await buildPluginVisibilitySubjectIds(
        {
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          [principal]: "inactive-principal",
        },
        readOnly
      )

      assert.deepEqual(result, {
        subjectIds: [],
        runtimeScopeSubjectIds: [],
      })
      assert.deepEqual(lookups, [])
      assert.equal(upserts, 0)
    })
  }
}

test("actorless workspace callers retain conversation visibility", async () => {
  subjects = [{ type: "workspace", id: "workspace-1" }]
  lookups.length = 0
  const result = await buildPluginVisibilitySubjectIds(
    { workspaceId: "workspace-1", conversationId: "conversation-1" },
    true
  )

  assert.deepEqual(result, {
    subjectIds: ["subject-workspace", "subject-conversation"],
    runtimeScopeSubjectIds: ["subject-conversation"],
  })
})

test("conversation lookup starts before subject lookups finish and keeps result order", async () => {
  subjects = [
    { type: "workspace", id: "workspace-1" },
    { type: "remote_agent", id: "agent-1" },
  ]
  lookups.length = 0
  upserts = 0
  let releaseWorkspace!: (id: string) => void
  let releaseAgent!: (id: string) => void
  resolveLookup = (kind) => {
    if (kind === "workspace") {
      return new Promise((resolve) => {
        releaseWorkspace = resolve
      })
    }
    if (kind === "remote_agent") {
      return new Promise((resolve) => {
        releaseAgent = resolve
      })
    }
    return Promise.resolve("subject-conversation")
  }

  const pending = buildPluginVisibilitySubjectIds(
    {
      workspaceId: "workspace-1",
      remoteAgentId: "agent-1",
      conversationId: "conversation-1",
    },
    true
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  const started = [...lookups]
  releaseAgent("subject-remote_agent")
  releaseWorkspace("subject-workspace")
  const result = await pending
  resolveLookup = async (kind) => `subject-${kind}`

  assert.deepEqual(started, ["workspace", "remote_agent", "conversation"])
  assert.deepEqual(result, {
    subjectIds: [
      "subject-workspace",
      "subject-remote_agent",
      "subject-conversation",
    ],
    runtimeScopeSubjectIds: ["subject-conversation"],
  })
  assert.equal(upserts, 0)
})
