import test from "node:test"
import assert from "node:assert/strict"
import {
  CONVERSATION_PARTICIPANT_TYPE,
  extractText,
  isCanonicalContentBlock,
  type CanonicalContentBlockInput,
} from "@synapse/shared"
import { ChatSendMessageInputSchema } from "@synapse/shared/schemas"
import {
  buildNormalizedMessageContent,
  draftPartsToCanonicalContentBlocks,
  itemPartsToCanonicalContentBlocks,
} from "./message-content.js"

function parseMessageInput(contentBlocks: CanonicalContentBlockInput[]) {
  return ChatSendMessageInputSchema.parse({
    contentBlocks,
    clientMessageId: "00000000-0000-4000-8000-000000000001",
    clientInstanceId: "00000000-0000-4000-8000-000000000002",
    metadata: {},
  })
}

test("buildNormalizedMessageContent preserves schema-accepted text without a client block id", async () => {
  const input = parseMessageInput([{ type: "text", text: "message body" }])
  const result = await buildNormalizedMessageContent({ content: "", ...input })

  assert.equal(result.normalizedContent, "message body")
  assert.deepEqual(result.parts, [{ type: "text", text: "message body" }])
  assert.equal(result.contentBlocks.length, 1)
  assert.ok(result.contentBlocks.every(isCanonicalContentBlock))
})

test("buildNormalizedMessageContent keeps idless attachments and mentions beside identified text", async () => {
  const input = parseMessageInput([
    {
      id: "00000000-0000-4000-8000-000000000003",
      type: "text",
      text: "attached report ",
    },
    {
      type: "file_ref",
      sha256: "a".repeat(64),
      mimeType: "text/plain",
      name: "report.txt",
      sizeBytes: 42,
      category: "document",
    },
    {
      type: "mention",
      mention: {
        participantType: CONVERSATION_PARTICIPANT_TYPE.WORKSPACE_MEMBER,
        workspaceMemberId: "00000000-0000-4000-8000-000000000004",
        name: "Alice",
      },
    },
  ])
  const result = await buildNormalizedMessageContent({ content: "", ...input })

  assert.deepEqual(
    result.parts.map((part) => part.type),
    ["text", "file_ref", "json"]
  )
  assert.equal(result.normalizedContent, "attached report @Alice")
  assert.equal(result.contentBlocks[1]?.type, "file_ref")
  if (result.contentBlocks[1]?.type !== "file_ref")
    assert.fail("expected file_ref")
  assert.equal(result.contentBlocks[1].sha256, "a".repeat(64))
  assert.equal(result.contentBlocks[1].path, undefined)
  assert.ok(result.contentBlocks.every(isCanonicalContentBlock))
  assert.equal(new Set(result.contentBlocks.map((block) => block.id)).size, 3)
})

test("buildNormalizedMessageContent continues to reject malformed blocks", async () => {
  const result = await buildNormalizedMessageContent({
    content: "fallback body",
    contentBlocks: [
      { type: "text", text: 42 },
      { type: "file_ref", sha256: "a".repeat(64) },
      { type: "mention", mention: { participantType: 42 } },
    ] as unknown as CanonicalContentBlockInput[],
  })
  assert.equal(result.normalizedContent, "fallback body")
  assert.deepEqual(result.parts, [{ type: "text", text: "fallback body" }])
})

test("buildNormalizedMessageContent keeps identified text ahead of plain fallback", async () => {
  const input = parseMessageInput([
    {
      id: "00000000-0000-4000-8000-000000000003",
      type: "text",
      text: "explicit body",
    },
  ])
  const result = await buildNormalizedMessageContent({
    content: "fallback",
    ...input,
  })
  assert.equal(result.normalizedContent, "explicit body")
})

test("itemPartsToCanonicalContentBlocks reads Kysely camelCase part rows", () => {
  const blocks = itemPartsToCanonicalContentBlocks([
    {
      partType: "text",
      textValue: "hello from tool_result_parts",
    },
    {
      partType: "file_ref",
      refSha256:
        "0000000000000000000000000000000000000000000000000000000000000001",
      refPath: "/tmp/report.txt",
      mimeType: "text/plain",
      name: "report.txt",
      metadata: {
        sizeBytes: 42,
        category: "document",
      },
    },
  ])

  assert.equal(extractText(blocks), "hello from tool_result_parts")
  assert.equal(blocks[1]?.type, "file_ref")
  assert.equal(blocks[1]?.path, "/tmp/report.txt")
  assert.equal(blocks[1]?.mimeType, "text/plain")
})

test("itemPartsToCanonicalContentBlocks keeps legacy snake_case part rows working", () => {
  const blocks = itemPartsToCanonicalContentBlocks([
    {
      part_type: "text",
      text_value: "legacy archive text",
    },
  ])

  assert.equal(extractText(blocks), "legacy archive text")
})

test("itemPartsToCanonicalContentBlocks parses stringified file metadata as object only", () => {
  const blocks = itemPartsToCanonicalContentBlocks([
    {
      partType: "file_ref",
      refSha256:
        "0000000000000000000000000000000000000000000000000000000000000002",
      metadata: JSON.stringify({
        path: "/tmp/photo.png",
        mimeType: "image/png",
        name: "photo.png",
        sizeBytes: "128",
        category: "image",
      }),
    },
    {
      partType: "file_ref",
      refSha256:
        "0000000000000000000000000000000000000000000000000000000000000003",
      metadata: JSON.stringify([{ mimeType: "image/png" }]),
    },
  ])

  assert.equal(blocks[0]?.type, "file_ref")
  if (blocks[0]?.type !== "file_ref") throw new Error("expected file_ref")
  assert.equal(blocks[0].path, "/tmp/photo.png")
  assert.equal(blocks[0].mimeType, "image/png")
  assert.equal(blocks[0].name, "photo.png")
  assert.equal(blocks[0].sizeBytes, 128)
  assert.equal(blocks[0].category, "image")

  assert.equal(blocks[1]?.type, "file_ref")
  if (blocks[1]?.type !== "file_ref") throw new Error("expected file_ref")
  assert.equal(blocks[1].mimeType, "application/octet-stream")
  assert.equal(blocks[1].name, "file")
  assert.equal(blocks[1].sizeBytes, 0)
  assert.equal(blocks[1].category, "document")
})

test("itemPartsToCanonicalContentBlocks parses json part payloads as object only", () => {
  const blocks = itemPartsToCanonicalContentBlocks([
    {
      partType: "json",
      jsonValue: JSON.stringify({
        type: "mention",
        mention: {
          participantType: "user",
          userId: "user-1",
          name: "Alice",
        },
      }),
    },
    {
      partType: "json",
      jsonValue: JSON.stringify([
        {
          type: "mention",
          mention: { participantType: "user", name: "Ignored" },
        },
      ]),
    },
    {
      partType: "json",
      jsonValue: JSON.stringify("not a block"),
    },
  ])

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0]?.type, "mention")
  if (blocks[0]?.type !== "mention") throw new Error("expected mention")
  assert.equal(blocks[0].mention.name, "Alice")
})

test("draftPartsToCanonicalContentBlocks parses json payloads as object only", () => {
  const blocks = draftPartsToCanonicalContentBlocks([
    {
      type: "json",
      json: [
        {
          type: "mention",
          mention: { participantType: "user", name: "Ignored" },
        },
      ],
    },
    {
      type: "json",
      metadata: {
        jsonValue: JSON.stringify({
          type: "mention",
          mention: {
            participantType: "actor",
            actorId: "actor-1",
            name: "Bot",
          },
        }),
      },
    },
  ])

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0]?.type, "mention")
  if (blocks[0]?.type !== "mention") throw new Error("expected mention")
  assert.equal(blocks[0].mention.name, "Bot")
})
