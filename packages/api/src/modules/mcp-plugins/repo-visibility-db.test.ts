import assert from "node:assert/strict"
import crypto from "node:crypto"
import { mock, test } from "node:test"
import { fileURLToPath } from "node:url"
import { SUBJECT_KIND } from "@synapse/shared"
import * as database from "../../infrastructure/database/kysely.js"
import { withTestDb } from "../../test/helpers/db.js"
import { upsertAccessSubject } from "../access/subject-registry.js"

const databasePath = fileURLToPath(
  new URL("../../infrastructure/database/kysely.ts", import.meta.url)
)

test(
  "installation visibility is rechecked after a grant is revoked",
  { timeout: 5 * 60_000 },
  async (t) => {
    await withTestDb(async (db) => {
      const databaseMock = mock.module(databasePath, {
        namedExports: { ...database, db },
      })
      try {
        const mockedDatabase =
          await import("../../infrastructure/database/kysely.js")
        assert.equal(mockedDatabase.db, db)
        const { buildPluginVisibilitySubjectIds, isPluginInstallationVisible } =
          await import("./repo.js")
        const user = await db
          .insertInto("users")
          .values({
            email: `plugin-visibility-${crypto.randomUUID()}@example.test`,
            name: "plugin visibility test",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        const workspace = await db
          .insertInto("workspaces")
          .values({
            ownerId: user.id,
            slug: `plugin-${crypto.randomUUID().slice(0, 8)}`,
            name: "plugin visibility test",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        const subjectId = await upsertAccessSubject(db, {
          kind: SUBJECT_KIND.WORKSPACE,
          workspaceId: workspace.id,
        })
        const publisher = await db
          .insertInto("publishers")
          .values({
            slug: `plugin-${crypto.randomUUID().slice(0, 8)}`,
            displayName: "plugin visibility test",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        const item = await db
          .insertInto("catalogItems")
          .values({
            publisherId: publisher.id,
            itemKind: "plugin_package",
            slug: `plugin-${crypto.randomUUID().slice(0, 8)}`,
            displayName: "plugin visibility test",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        const version = await db
          .insertInto("catalogVersions")
          .values({
            catalogItemId: item.id,
            version: "1.0.0",
            status: "active",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        await db
          .insertInto("pluginPackageVersionSpecs")
          .values({ catalogVersionId: version.id, transport: "builtin" })
          .execute()
        const installationId = crypto.randomUUID()
        await db
          .insertInto("workspaceResources")
          .values({
            id: installationId,
            workspaceId: workspace.id,
            kind: "plugin_installation",
            displayName: "plugin visibility test",
            createdBySubjectId: subjectId,
            status: "active",
          })
          .execute()
        await db
          .insertInto("pluginInstallations")
          .values({
            id: installationId,
            catalogItemId: item.id,
            catalogVersionId: version.id,
          })
          .execute()
        const grant = await db
          .insertInto("workspaceResourceGrants")
          .values({
            workspaceId: workspace.id,
            workspaceResourceId: installationId,
            subjectId,
            permissions: ["use"],
            status: "active",
          })
          .returning("id")
          .executeTakeFirstOrThrow()

        const conversation = await db
          .insertInto("conversations")
          .values({
            workspaceId: workspace.id,
            kind: "group",
            title: "plugin visibility test",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
        const context = {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          conversationKind: "group" as const,
        }
        assert.deepEqual(
          (await buildPluginVisibilitySubjectIds(context, true)).subjectIds,
          [subjectId]
        )
        assert.equal(
          await isPluginInstallationVisible(context, installationId),
          true
        )
        await t.test("an empty installation ID fails closed", async () => {
          assert.equal(await isPluginInstallationVisible(context, ""), false)
        })

        await db
          .updateTable("workspaceResourceGrants")
          .set({ status: "revoked", revokedAt: new Date() })
          .where("id", "=", grant.id)
          .execute()
        assert.equal(
          await isPluginInstallationVisible(context, installationId),
          false
        )

        const conversationSubjectId = await upsertAccessSubject(db, {
          kind: SUBJECT_KIND.CONVERSATION,
          conversationId: conversation.id,
        })
        await db
          .insertInto("workspaceResourceGrants")
          .values({
            workspaceId: workspace.id,
            workspaceResourceId: installationId,
            subjectId: conversationSubjectId,
            permissions: ["use"],
            status: "active",
          })
          .execute()
        // Actorless workspace callers can still use a conversation grant.
        assert.equal(
          await isPluginInstallationVisible(context, installationId),
          true
        )

        for (const kind of [SUBJECT_KIND.ACTOR, SUBJECT_KIND.REMOTE_AGENT]) {
          await t.test(
            `${kind} conversation grants require active participation`,
            async () => {
              const principalId = crypto.randomUUID()
              await db
                .insertInto("workspaceResources")
                .values({
                  id: principalId,
                  workspaceId: workspace.id,
                  kind,
                  displayName: "plugin visibility principal",
                  createdBySubjectId: subjectId,
                  status: "active",
                })
                .execute()
              if (kind === SUBJECT_KIND.ACTOR) {
                await db
                  .insertInto("actors")
                  .values({
                    id: principalId,
                    role: "assistant",
                    title: "plugin visibility actor",
                    currentVersion: 1,
                  })
                  .execute()
              } else {
                await db
                  .insertInto("remoteAgents")
                  .values({
                    id: principalId,
                    title: "plugin visibility agent",
                    runtimeKind: "claude_code",
                  })
                  .execute()
              }
              const principalSubjectId = await upsertAccessSubject(
                db,
                kind === SUBJECT_KIND.ACTOR
                  ? { kind, actorId: principalId }
                  : { kind, remoteAgentId: principalId }
              )
              const principalContext = {
                ...context,
                ...(kind === SUBJECT_KIND.ACTOR
                  ? { actorId: principalId }
                  : { remoteAgentId: principalId }),
              }
              // A conversation-only grant must not recover an absent participant.
              assert.equal(
                await isPluginInstallationVisible(
                  principalContext,
                  installationId
                ),
                false
              )
              const participant = await db
                .insertInto("conversationParticipants")
                .values({
                  conversationId: conversation.id,
                  subjectId: principalSubjectId,
                  roleKey: "member",
                  state: "active",
                })
                .returning("id")
                .executeTakeFirstOrThrow()
              assert.equal(
                await isPluginInstallationVisible(
                  principalContext,
                  installationId
                ),
                true
              )
              await db
                .updateTable("conversationParticipants")
                .set({ state: "left" })
                .where("id", "=", participant.id)
                .execute()
              assert.equal(
                await isPluginInstallationVisible(
                  principalContext,
                  installationId
                ),
                false
              )
              assert.deepEqual(
                await buildPluginVisibilitySubjectIds(principalContext),
                { subjectIds: [], runtimeScopeSubjectIds: [] }
              )
            }
          )
        }
      } finally {
        databaseMock.restore()
      }
    })
  }
)
