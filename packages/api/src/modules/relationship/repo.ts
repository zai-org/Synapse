// relationship/repo.ts — DB-touching helpers for the relationship module.
//
// The only relationship file permitted to import the db client (guard r8). Owns
// every query the relationship service runs against the tables this module owns
// (workspaceRelationshipProfiles, workspaceFriendEntries, workspaceFriendRequests,
// directConversationBindings) plus the cross-module reads the contact-hub /
// friend-request / access-request surfaces need (workspaces, workspaceMembers+
// users, actors, remote_agents via workspace_resources_live, workspaceResourceGrants,
// workspaceResourceGrantRequests). service.ts holds the business logic (approval-mode
// branching, retry-on-unique-violation, presenter shaping) and calls these; it no
// longer imports the db client. round-6 P1-6.
//
// There are NO transactions in the relationship service — every db use is an
// independent auto-committing query — so these stay plain default-db functions.
// Records keep Date columns (createdAt/updatedAt/resolvedAt); the presenter
// serializes for the wire. JSON columns stay raw. Raw-SQL sites preserve their
// snake_case identifiers and aliasing under CamelCasePlugin verbatim.
//
// Several access-engine / grant-storage / direct-binding helpers are already
// executor-injectable; this repo hosts default-db binder wrappers for the ones
// not covered by access/guards.ts so the service threads no db value anywhere.

import { sql } from "kysely"
import type { RemoteAgentRuntimeKind } from "@synapse/shared"
import { db } from "../../infrastructure/database/kysely.js"
import type { RelationshipApprovalMode } from "../../infrastructure/database/generated/db.js"
import {
  deriveRequiresContactApproval,
  deriveRequiresContactApprovalMany,
} from "../access/contact-approval.js"
import {
  insertWorkspaceResourceGrant,
  insertWorkspaceResourceGrantRequest,
} from "../workspace-resources/grant-storage.js"
import {
  directConversationBindingPeer,
  directConversationBindingValues,
} from "../chat/direct-binding.js"

// ---------------------------------------------------------------------------
// Default-db binder wrappers for executor-injectable cross-module helpers.
// (access/guards.ts already hosts authorizeActionDefault /
// resolveWorkspaceAccessSubjectDefault / upsertAccessSubjectDefault — those are
// reused directly by the service. The helpers below live in modules without a
// default binder, so the relationship repo hosts one here.)
// ---------------------------------------------------------------------------

export function deriveRequiresContactApprovalDefault(
  resourceType: "actor" | "remote_agent",
  resourceId: string,
  workspaceId: string
): ReturnType<typeof deriveRequiresContactApproval> {
  return deriveRequiresContactApproval(
    db,
    resourceType,
    resourceId,
    workspaceId
  )
}

export function deriveRequiresContactApprovalManyDefault(
  resourceType: "actor" | "remote_agent",
  workspaceId: string,
  resourceIds: readonly string[]
): ReturnType<typeof deriveRequiresContactApprovalMany> {
  return deriveRequiresContactApprovalMany(
    db,
    resourceType,
    workspaceId,
    resourceIds
  )
}

export function insertWorkspaceResourceGrantDefault(
  input: Parameters<typeof insertWorkspaceResourceGrant>[1]
): ReturnType<typeof insertWorkspaceResourceGrant> {
  return insertWorkspaceResourceGrant(db, input)
}

export function insertWorkspaceResourceGrantRequestDefault(
  input: Parameters<typeof insertWorkspaceResourceGrantRequest>[1]
): ReturnType<typeof insertWorkspaceResourceGrantRequest> {
  return insertWorkspaceResourceGrantRequest(db, input)
}

export function directConversationBindingValuesDefault(
  pair: Parameters<typeof directConversationBindingValues>[1]
): ReturnType<typeof directConversationBindingValues> {
  return directConversationBindingValues(db, pair)
}

export function directConversationBindingPeerDefault(
  row: Parameters<typeof directConversationBindingPeer>[1],
  viewer: Parameters<typeof directConversationBindingPeer>[2]
): ReturnType<typeof directConversationBindingPeer> {
  return directConversationBindingPeer(db, row, viewer)
}

// ---------------------------------------------------------------------------
// workspaces / workspaceMembers+users / actors / remote_agents (cross-module reads)
// ---------------------------------------------------------------------------

export async function selectWorkspaceById(workspaceId: string) {
  return db
    .selectFrom("workspaces")
    .select(["id", "name", "slug"])
    .where("id", "=", workspaceId)
    .executeTakeFirst()
}

const workspaceMemberSummarySelection = [
  "wm.id as workspaceMemberId",
  "wm.workspaceId",
  "w.name as workspaceName",
  "w.slug as workspaceSlug",
  "wm.userId",
  "wm.trustLevel",
  "u.name",
  "u.email",
  "u.avatarFileId",
] as const

export async function selectWorkspaceMemberSummaryByUser(
  workspaceId: string,
  userId: string
) {
  return db
    .selectFrom("workspaceMembers as wm")
    .innerJoin("users as u", "u.id", "wm.userId")
    .innerJoin("workspaces as w", "w.id", "wm.workspaceId")
    .select(workspaceMemberSummarySelection)
    .where("wm.workspaceId", "=", workspaceId)
    .where("wm.userId", "=", userId)
    .executeTakeFirst()
}

export async function selectWorkspaceMemberSummaryById(
  workspaceMemberId: string
) {
  return db
    .selectFrom("workspaceMembers as wm")
    .innerJoin("users as u", "u.id", "wm.userId")
    .innerJoin("workspaces as w", "w.id", "wm.workspaceId")
    .select(workspaceMemberSummarySelection)
    .where("wm.id", "=", workspaceMemberId)
    .executeTakeFirst()
}

export async function selectActorSummaryRow(actorId: string) {
  return db
    .selectFrom("actors as a")
    .innerJoin("workspaceResources as resource", "resource.id", "a.id")
    .innerJoin("workspaces as w", "w.id", "resource.workspaceId")
    .leftJoin("fileAssets as avatar_file", "avatar_file.id", "a.avatarFileId")
    .select([
      "a.id as actorId",
      "resource.workspaceId",
      "w.name as workspaceName",
      "w.slug as workspaceSlug",
      "resource.displayName",
      "a.title",
      "a.role",
      "a.isPublicShared",
      "a.avatarEmoji",
      "avatar_file.id as avatarFileId",
    ])
    .where("a.id", "=", actorId)
    .where("resource.deletedAt", "is", null)
    .where("resource.status", "=", "active")
    .executeTakeFirst()
}

export async function selectRemoteAgentSummaryRow(remoteAgentId: string) {
  const result = await sql<{
    remoteAgentId: string
    workspaceId: string
    workspaceName: string
    workspaceSlug: string
    displayName: string
    title: string
    runtimeKind: RemoteAgentRuntimeKind
    isPublicShared: boolean
    avatarFileId: string | null
    avatarEmoji: string | null
  }>`
      SELECT
        ra.id AS remote_agent_id,
        resource.workspace_id,
        w.name AS workspace_name,
        w.slug AS workspace_slug,
        resource.display_name,
        ra.title,
        ra.runtime_kind,
        ra.avatar_file_id,
        ra.avatar_emoji,
        ra.is_public_shared
      FROM remote_agents ra
      INNER JOIN workspace_resources_live resource
        ON resource.id = ra.id
      INNER JOIN workspaces w ON w.id = resource.workspace_id
      WHERE ra.id = ${remoteAgentId}
        AND resource.deleted_at IS NULL
        AND resource.status = 'active'
      LIMIT 1
    `.execute(db)
  return result.rows[0] ?? null
}

export async function selectWorkspaceMembersForHub(
  workspaceId: string,
  excludeUserId: string
) {
  return db
    .selectFrom("workspaceMembers as wm")
    .innerJoin("users as u", "u.id", "wm.userId")
    .innerJoin("workspaces as w", "w.id", "wm.workspaceId")
    .select(workspaceMemberSummarySelection)
    .where("wm.workspaceId", "=", workspaceId)
    .where("wm.userId", "<>", excludeUserId)
    .orderBy("u.name", "asc")
    .execute()
}

export async function selectWorkspaceActorsForHub(workspaceId: string) {
  return db
    .selectFrom("actors as a")
    .innerJoin("workspaceResources as resource", "resource.id", "a.id")
    .innerJoin("workspaces as w", "w.id", "resource.workspaceId")
    .leftJoin("fileAssets as avatar_file", "avatar_file.id", "a.avatarFileId")
    .select([
      "a.id as actorId",
      "resource.workspaceId",
      "w.name as workspaceName",
      "w.slug as workspaceSlug",
      "resource.displayName",
      "a.title",
      "a.role",
      "a.isPublicShared",
      "a.avatarEmoji",
      "avatar_file.id as avatarFileId",
    ])
    .where("resource.workspaceId", "=", workspaceId)
    .where("resource.deletedAt", "is", null)
    .where("resource.status", "=", "active")
    .orderBy("resource.displayName", "asc")
    .execute()
}

export async function selectWorkspaceRemoteAgentsForHub(workspaceId: string) {
  const result = await sql<{
    remoteAgentId: string
    workspaceId: string
    workspaceName: string
    workspaceSlug: string
    displayName: string
    title: string
    runtimeKind: RemoteAgentRuntimeKind
    isPublicShared: boolean
    avatarEmoji: string | null
    avatarFileId: string | null
  }>`
          SELECT
            ra.id AS remote_agent_id,
            resource.workspace_id,
            w.name AS workspace_name,
            w.slug AS workspace_slug,
            resource.display_name,
            ra.title,
            ra.runtime_kind,
            ra.is_public_shared,
            ra.avatar_emoji,
            ra.avatar_file_id
          FROM remote_agents ra
          INNER JOIN workspace_resources_live resource
            ON resource.id = ra.id
          INNER JOIN workspaces w ON w.id = resource.workspace_id
          WHERE resource.workspace_id = ${workspaceId}
            AND resource.deleted_at IS NULL
            AND resource.status = 'active'
          ORDER BY resource.display_name ASC, ra.created_at ASC
        `.execute(db)
  return result.rows
}

// ---------------------------------------------------------------------------
// workspaceRelationshipProfiles (owned table)
// ---------------------------------------------------------------------------

export async function selectMemberRelationshipProfileBySubjectId(
  subjectId: string
) {
  return db
    .selectFrom("workspaceRelationshipProfiles")
    .select([
      "id",
      "workspaceId",
      "identityId",
      "identitySearchEnabled",
      "approvalMode",
      "qrToken",
    ])
    .where("subjectId", "=", subjectId)
    .executeTakeFirst()
}

export async function selectRelationshipProfileByWorkspaceAndSubject(
  workspaceId: string,
  subjectId: string
) {
  return db
    .selectFrom("workspaceRelationshipProfiles")
    .selectAll()
    .where("workspaceId", "=", workspaceId)
    .where("subjectId", "=", subjectId)
    .executeTakeFirst()
}

export async function insertRelationshipProfile(input: {
  workspaceId: string
  subjectId: string
  qrToken: string
  createdByWorkspaceMemberId: string
}) {
  return db
    .insertInto("workspaceRelationshipProfiles")
    .values({
      workspaceId: input.workspaceId,
      subjectId: input.subjectId,
      qrToken: input.qrToken,
      createdByWorkspaceMemberId: input.createdByWorkspaceMemberId,
      approvalMode: "manual",
    })
    .returningAll()
    .executeTakeFirst()
}

const relationshipProfileJoinSelection = [
  "p.id",
  "p.workspaceId",
  "p.subjectId",
  "p.identityId",
  "p.identitySearchEnabled",
  "p.approvalMode",
  "p.qrToken",
  "p.createdByWorkspaceMemberId",
  "p.createdAt",
  "p.updatedAt",
  "s.kind as subjectType",
  "s.workspaceMemberId as subjectWorkspaceMemberId",
  "s.actorId as subjectActorId",
  "s.remoteAgentId as subjectRemoteAgentId",
] as const

export async function selectSearchableProfileByIdentityId(identityId: string) {
  return db
    .selectFrom("workspaceRelationshipProfiles as p")
    .innerJoin("accessSubjects as s", "s.id", "p.subjectId")
    .select(relationshipProfileJoinSelection)
    .where("p.identityId", "=", identityId)
    .where("p.identitySearchEnabled", "=", true)
    .executeTakeFirst()
}

export async function selectProfileById(profileId: string) {
  return db
    .selectFrom("workspaceRelationshipProfiles as p")
    .innerJoin("accessSubjects as s", "s.id", "p.subjectId")
    .select(relationshipProfileJoinSelection)
    .where("p.id", "=", profileId)
    .executeTakeFirst()
}

export async function selectProfileByQrToken(qrToken: string) {
  return db
    .selectFrom("workspaceRelationshipProfiles as p")
    .innerJoin("accessSubjects as s", "s.id", "p.subjectId")
    .select(relationshipProfileJoinSelection)
    .where("p.qrToken", "=", qrToken)
    .executeTakeFirst()
}

export async function updateRelationshipProfile(
  profileId: string,
  next: {
    approvalMode: RelationshipApprovalMode
    identityId: string
    identitySearchEnabled: boolean
  }
) {
  return db
    .updateTable("workspaceRelationshipProfiles")
    .set({
      approvalMode: next.approvalMode,
      identityId: next.identityId,
      identitySearchEnabled: next.identitySearchEnabled,
    })
    .where("id", "=", profileId)
    .returningAll()
    .executeTakeFirst()
}

// ---------------------------------------------------------------------------
// actors / remote_agents publish toggle (cross-module writes)
// ---------------------------------------------------------------------------

export async function updateActorPublicShared(
  actorId: string,
  workspaceId: string,
  isPublicShared: boolean
) {
  return db
    .updateTable("actors")
    .set({
      isPublicShared,
    })
    .where("id", "=", actorId)
    .where((eb) =>
      eb.exists(
        db
          .selectFrom("workspaceResourcesLive as resource")
          .select("resource.id")
          .where("resource.id", "=", actorId)
          .where("resource.workspaceId", "=", workspaceId)
          .where("resource.deletedAt", "is", null)
      )
    )
    .returning(["isPublicShared"])
    .executeTakeFirst()
}

export async function updateRemoteAgentPublicShared(
  remoteAgentId: string,
  workspaceId: string,
  isPublicShared: boolean
) {
  const updateResult = await sql<{ isPublicShared: boolean }>`
        UPDATE remote_agents
        SET is_public_shared = ${isPublicShared},
            updated_at = NOW()
        WHERE id = ${remoteAgentId}
          AND EXISTS (
            SELECT 1
            FROM workspace_resources_live resource
            WHERE resource.id = remote_agents.id
              AND resource.workspace_id = ${workspaceId}
              AND resource.deleted_at IS NULL
              AND resource.status = 'active'
          )
        RETURNING is_public_shared
      `.execute(db)
  return updateResult.rows[0] ?? null
}

// ---------------------------------------------------------------------------
// workspaceFriendEntries (owned table)
// ---------------------------------------------------------------------------

export async function insertFriendEntry(input: {
  workspaceId: string
  ownerWorkspaceMemberId: string
  peerSubjectId: string
  sourceRequestId: string | null
}) {
  await db
    .insertInto("workspaceFriendEntries")
    .values({
      workspaceId: input.workspaceId,
      ownerWorkspaceMemberId: input.ownerWorkspaceMemberId,
      peerSubjectId: input.peerSubjectId,
      sourceRequestId: input.sourceRequestId,
    })
    .onConflict((oc) => oc.doNothing())
    .execute()
}

const friendEntryJoinSelection = [
  "e.id",
  "e.workspaceId",
  "e.ownerWorkspaceMemberId",
  "e.peerSubjectId",
  "e.sourceRequestId",
  "e.createdAt",
  "e.updatedAt",
  "s.workspaceMemberId as peerWorkspaceMemberId",
  "s.actorId as peerActorId",
  "s.remoteAgentId as peerRemoteAgentId",
  "s.kind as peerKind",
] as const

export async function selectFriendEntryByPeerSubject(input: {
  workspaceId: string
  ownerWorkspaceMemberId: string
  peerSubjectId: string
}) {
  return db
    .selectFrom("workspaceFriendEntries as e")
    .innerJoin("accessSubjects as s", "s.id", "e.peerSubjectId")
    .select(friendEntryJoinSelection)
    .where("e.workspaceId", "=", input.workspaceId)
    .where("e.ownerWorkspaceMemberId", "=", input.ownerWorkspaceMemberId)
    .where("e.peerSubjectId", "=", input.peerSubjectId)
    .executeTakeFirst()
}

export async function selectFriendEntryById(input: {
  workspaceId: string
  ownerWorkspaceMemberId: string
  id: string
}) {
  return db
    .selectFrom("workspaceFriendEntries as e")
    .innerJoin("accessSubjects as s", "s.id", "e.peerSubjectId")
    .select(friendEntryJoinSelection)
    .where("e.workspaceId", "=", input.workspaceId)
    .where("e.ownerWorkspaceMemberId", "=", input.ownerWorkspaceMemberId)
    .where("e.id", "=", input.id)
    .executeTakeFirst()
}

export async function selectFriendEntriesForOwner(input: {
  workspaceId: string
  ownerWorkspaceMemberId: string
}) {
  return db
    .selectFrom("workspaceFriendEntries as e")
    .innerJoin("accessSubjects as s", "s.id", "e.peerSubjectId")
    .select(friendEntryJoinSelection)
    .where("e.workspaceId", "=", input.workspaceId)
    .where("e.ownerWorkspaceMemberId", "=", input.ownerWorkspaceMemberId)
    .orderBy("e.createdAt", "desc")
    .execute()
}

// ---------------------------------------------------------------------------
// workspaceFriendRequests (owned table)
// ---------------------------------------------------------------------------

const friendRequestJoinSelection = [
  "r.id",
  "r.requesterWorkspaceMemberId",
  "r.targetSubjectId",
  "r.requestedViaProfileId",
  "r.status",
  "r.resolvedByWorkspaceMemberId",
  "r.resolvedAt",
  "r.createdAt",
  "r.updatedAt",
] as const

export async function selectPendingFriendRequestByTarget(input: {
  requesterWorkspaceMemberId: string
  targetSubjectId: string
}) {
  return db
    .selectFrom("workspaceFriendRequests as r")
    .innerJoin("accessSubjects as s", "s.id", "r.targetSubjectId")
    .select([
      ...friendRequestJoinSelection,
      "s.kind as targetKind",
      "s.workspaceMemberId as targetWorkspaceMemberId",
      "s.actorId as targetActorId",
      "s.remoteAgentId as targetRemoteAgentId",
    ])
    .where(
      "r.requesterWorkspaceMemberId",
      "=",
      input.requesterWorkspaceMemberId
    )
    .where("r.targetSubjectId", "=", input.targetSubjectId)
    .where("r.status", "=", "pending")
    .executeTakeFirst()
}

export async function insertFriendRequest(input: {
  requesterWorkspaceMemberId: string
  targetSubjectId: string
  requestedViaProfileId: string | null
}) {
  return db
    .insertInto("workspaceFriendRequests")
    .values({
      requesterWorkspaceMemberId: input.requesterWorkspaceMemberId,
      targetSubjectId: input.targetSubjectId,
      requestedViaProfileId: input.requestedViaProfileId,
      status: "pending",
    })
    .returningAll()
    .executeTakeFirst()
}

export async function selectPendingFriendRequests() {
  return db
    .selectFrom("workspaceFriendRequests as r")
    .innerJoin("accessSubjects as s", "s.id", "r.targetSubjectId")
    .select([
      ...friendRequestJoinSelection,
      "s.kind as targetKind",
      "s.workspaceMemberId as targetWorkspaceMemberId",
      "s.actorId as targetActorId",
      "s.remoteAgentId as targetRemoteAgentId",
    ])
    .where("r.status", "=", "pending")
    .orderBy("r.createdAt", "desc")
    .execute()
}

export async function selectFriendRequestById(requestId: string) {
  return db
    .selectFrom("workspaceFriendRequests as r")
    .innerJoin("accessSubjects as s", "s.id", "r.targetSubjectId")
    .select([
      ...friendRequestJoinSelection,
      "s.kind as targetSubjectType",
      "s.workspaceMemberId as targetWorkspaceMemberId",
      "s.actorId as targetActorId",
      "s.remoteAgentId as targetRemoteAgentId",
    ])
    .where("r.id", "=", requestId)
    .executeTakeFirst()
}

export async function updateFriendRequestResolution(input: {
  id: string
  status: "approved" | "rejected"
  resolvedByWorkspaceMemberId: string
}) {
  return db
    .updateTable("workspaceFriendRequests")
    .set({
      status: input.status,
      resolvedByWorkspaceMemberId: input.resolvedByWorkspaceMemberId,
      resolvedAt: sql`NOW()`,
    })
    .where("id", "=", input.id)
    .returningAll()
    .executeTakeFirst()
}

// ---------------------------------------------------------------------------
// directConversationBindings (owned table)
// ---------------------------------------------------------------------------

export async function selectDirectConversationBindingsForSubject(
  subjectId: string
) {
  return db
    .selectFrom("directConversationBindings")
    .selectAll()
    .where((eb) =>
      eb.or([
        eb("participantOneSubjectId", "=", subjectId),
        eb("participantTwoSubjectId", "=", subjectId),
      ])
    )
    .execute()
}

export async function selectDirectConversationIdByPair(values: {
  participant_one_subject_id: string
  participant_two_subject_id: string
}) {
  const row = await db
    .selectFrom("directConversationBindings")
    .select(["conversationId"])
    .where("participantOneSubjectId", "=", values.participant_one_subject_id)
    .where("participantTwoSubjectId", "=", values.participant_two_subject_id)
    .executeTakeFirst()
  return row?.conversationId || null
}

export async function insertDirectConversationBinding(input: {
  conversationId: string
  participantOneSubjectId: string
  participantTwoSubjectId: string
}) {
  await db
    .insertInto("directConversationBindings")
    .values({
      conversationId: input.conversationId,
      participantOneSubjectId: input.participantOneSubjectId,
      participantTwoSubjectId: input.participantTwoSubjectId,
    })
    .execute()
}

// ---------------------------------------------------------------------------
// workspaceResourceGrants / workspaceResourceGrantRequests (cross-module reads;
// grant-storage already owns the writes via the *Default binders above)
// ---------------------------------------------------------------------------

export async function selectWorkspaceResourceContactVisibleGrant(input: {
  workspaceResourceId: string
  workspaceSubjectId: string
  memberSubjectId: string
}) {
  return db
    .selectFrom("workspaceResourceGrants")
    .select("id")
    .where("workspaceResourceId", "=", input.workspaceResourceId)
    .where("status", "=", "active")
    .where("scopeSubjectId", "is", null)
    .where(
      sql<boolean>`'contact_visible'::workspace_resource_grant_permission = ANY(permissions)`
    )
    .where((eb) =>
      eb.or([
        eb("subjectId", "=", input.workspaceSubjectId),
        eb("subjectId", "=", input.memberSubjectId),
      ])
    )
    .limit(1)
    .executeTakeFirst()
}

export async function selectWorkspaceResourceLiveOwnerKind(
  workspaceResourceId: string,
  workspaceId: string
) {
  // owner→subject migration: project the owner member id from the joined
  // access_subjects row so member-owner equality keeps working. Non-member
  // owners (actor/remote_agent) project null here — their owner-implicit
  // visibility is computed subject-side in the evaluator, not here.
  return db
    .selectFrom("workspaceResourcesLive as resource")
    .leftJoin(
      "accessSubjects as owner_subject",
      "owner_subject.id",
      "resource.ownerSubjectId"
    )
    .select([
      "owner_subject.workspaceMemberId as ownerWorkspaceMemberId",
      "resource.kind",
    ])
    .where("resource.id", "=", workspaceResourceId)
    .where("resource.workspaceId", "=", workspaceId)
    .where("resource.deletedAt", "is", null)
    .executeTakeFirst()
}

export async function selectPendingResourceGrantRequest(input: {
  workspaceId: string
  workspaceResourceId: string
  requesterWorkspaceMemberId: string
}) {
  return db
    .selectFrom("workspaceResourceGrantRequests as app_request")
    .selectAll()
    .where("workspaceId", "=", input.workspaceId)
    .where("workspaceResourceId", "=", input.workspaceResourceId)
    .where("requesterWorkspaceMemberId", "=", input.requesterWorkspaceMemberId)
    .where("status", "=", "pending")
    .executeTakeFirst()
}

export async function selectPendingResourceGrantRequestIdsByKind(input: {
  workspaceId: string
  requesterWorkspaceMemberId: string
  kind: "actor" | "remote_agent"
}): Promise<{ workspaceResourceId: string | null }[]> {
  return db
    .selectFrom("workspaceResourceGrantRequests as app_request")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "app_request.workspaceResourceId"
    )
    .select(["app_request.workspaceResourceId as workspaceResourceId"])
    .where("app_request.workspaceId", "=", input.workspaceId)
    .where(
      "app_request.requesterWorkspaceMemberId",
      "=",
      input.requesterWorkspaceMemberId
    )
    .where("app_request.status", "=", "pending")
    .where("resource.kind", "=", input.kind)
    .execute()
}

export async function selectPendingActorResourceGrantRequestId(input: {
  workspaceId: string
  workspaceResourceId: string
  requesterWorkspaceMemberId: string
}) {
  return db
    .selectFrom("workspaceResourceGrantRequests")
    .select(["id"])
    .where("workspaceId", "=", input.workspaceId)
    .where("workspaceResourceId", "=", input.workspaceResourceId)
    .where("requesterWorkspaceMemberId", "=", input.requesterWorkspaceMemberId)
    .where("status", "=", "pending")
    .executeTakeFirst()
}

export async function selectPendingRemoteAgentResourceGrantRequestId(input: {
  workspaceId: string
  workspaceResourceId: string
  requesterWorkspaceMemberId: string
}) {
  const result = await sql<{ id: string }>`
          SELECT id
          FROM workspace_resource_grant_requests
          WHERE workspace_id = ${input.workspaceId}
            AND workspace_resource_id = ${input.workspaceResourceId}
            AND requester_workspace_member_id = ${input.requesterWorkspaceMemberId}
            AND status = 'pending'
          LIMIT 1
        `.execute(db)
  return result.rows[0] ?? null
}

const actorAccessRequestSelection = [
  "app_request.id",
  "app_request.workspaceId",
  "app_request.requesterWorkspaceMemberId",
  "app_request.status",
  "app_request.resolvedByWorkspaceMemberId",
  "app_request.resolvedAt",
  "app_request.createdAt",
  "app_request.updatedAt",
  "app_request.workspaceResourceId as actorId",
] as const

export async function selectIncomingActorAccessRequests(workspaceId: string) {
  return db
    .selectFrom("workspaceResourceGrantRequests as app_request")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "app_request.workspaceResourceId"
    )
    .select(actorAccessRequestSelection)
    .where("app_request.workspaceId", "=", workspaceId)
    .where("app_request.status", "=", "pending")
    .where("resource.kind", "=", "actor")
    .execute()
}

export async function selectOutgoingActorAccessRequests(input: {
  workspaceId: string
  requesterWorkspaceMemberId: string
}) {
  return db
    .selectFrom("workspaceResourceGrantRequests as app_request")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "app_request.workspaceResourceId"
    )
    .select(actorAccessRequestSelection)
    .where("app_request.workspaceId", "=", input.workspaceId)
    .where(
      "app_request.requesterWorkspaceMemberId",
      "=",
      input.requesterWorkspaceMemberId
    )
    .where("app_request.status", "=", "pending")
    .where("resource.kind", "=", "actor")
    .execute()
}

type WorkspaceResourceGrantRequestJoinRow = {
  id: string
  workspaceId: string
  requesterWorkspaceMemberId: string
  status: string
  resolvedByWorkspaceMemberId: string | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  remoteAgentId: string | null
}

export async function selectIncomingRemoteAgentAccessRequests(
  workspaceId: string
): Promise<WorkspaceResourceGrantRequestJoinRow[]> {
  const result = await sql<WorkspaceResourceGrantRequestJoinRow>`
        SELECT request.id, request.workspace_id, request.requester_workspace_member_id,
               request.status, request.resolved_by_workspace_member_id, request.resolved_at,
               request.created_at, request.updated_at,
               request.workspace_resource_id AS remote_agent_id
        FROM workspace_resource_grant_requests request
        JOIN workspace_resources_live resource ON resource.id = request.workspace_resource_id
        WHERE request.workspace_id = ${workspaceId}
          AND request.status = 'pending'
          AND resource.kind = 'remote_agent'
        ORDER BY request.created_at DESC
      `.execute(db)
  return result.rows
}

export async function selectOutgoingRemoteAgentAccessRequests(input: {
  workspaceId: string
  requesterWorkspaceMemberId: string
}): Promise<WorkspaceResourceGrantRequestJoinRow[]> {
  const result = await sql<WorkspaceResourceGrantRequestJoinRow>`
        SELECT request.id, request.workspace_id, request.requester_workspace_member_id,
               request.status, request.resolved_by_workspace_member_id, request.resolved_at,
               request.created_at, request.updated_at,
               request.workspace_resource_id AS remote_agent_id
        FROM workspace_resource_grant_requests request
        JOIN workspace_resources_live resource ON resource.id = request.workspace_resource_id
        WHERE request.workspace_id = ${input.workspaceId}
          AND request.requester_workspace_member_id = ${input.requesterWorkspaceMemberId}
          AND request.status = 'pending'
          AND resource.kind = 'remote_agent'
        ORDER BY request.created_at DESC
      `.execute(db)
  return result.rows
}

export async function selectActorAccessRequestForResolve(requestId: string) {
  return db
    .selectFrom("workspaceResourceGrantRequests as app_request")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "app_request.workspaceResourceId"
    )
    .select([
      "app_request.id",
      "app_request.workspaceId",
      "app_request.workspaceResourceId as actorId",
      "app_request.requesterWorkspaceMemberId",
      "app_request.status",
      "resource.kind as targetKind",
    ])
    .where("app_request.id", "=", requestId)
    .executeTakeFirst()
}

export async function selectRemoteAgentAccessRequestForResolve(
  requestId: string
) {
  const result = await sql<{
    id: string
    workspaceId: string
    requesterWorkspaceMemberId: string
    status: string
    resolvedAt: Date | null
    resolvedByWorkspaceMemberId: string | null
    remoteAgentId: string | null
    targetKind: string
  }>`
      SELECT request.id, request.workspace_id, request.requester_workspace_member_id,
             request.status, request.resolved_at, request.resolved_by_workspace_member_id,
             request.workspace_resource_id AS remote_agent_id, resource.kind AS target_kind
      FROM workspace_resource_grant_requests request
      JOIN workspace_resources_live resource ON resource.id = request.workspace_resource_id
      WHERE request.id = ${requestId}
      LIMIT 1
    `.execute(db)
  return result.rows[0] ?? null
}
