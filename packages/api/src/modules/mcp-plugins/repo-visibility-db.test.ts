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
  async () => {
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

        const context = {
          workspaceId: workspace.id,
          conversationId: crypto.randomUUID(),
          conversationKind: "direct" as const,
        }
        assert.deepEqual(
          (await buildPluginVisibilitySubjectIds(context, true)).subjectIds,
          [subjectId]
        )
        assert.equal(
          await isPluginInstallationVisible(context, installationId),
          true
        )

        await db
          .updateTable("workspaceResourceGrants")
          .set({ status: "revoked", revokedAt: new Date() })
          .where("id", "=", grant.id)
          .execute()
        assert.equal(
          await isPluginInstallationVisible(context, installationId),
          false
        )
      } finally {
        databaseMock.restore()
      }
    })
  }
)
