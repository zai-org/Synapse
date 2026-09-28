/**
 * mcp-plugins module repo.
 *
 * The only mcp-plugins service-facing file (besides mijia/repo.ts) allowed to
 * import the db client + `sql` (guard-layering r8/r1/r2). It owns the module's
 * raw queries and returns camelCase domain records, KEEPING Date objects (time
 * serialization belongs to presenters — guard r3). Raw `sql` fragments that
 * reference snake_case / enum-cast Postgres are kept verbatim because they
 * intentionally bypass the CamelCasePlugin.
 */

import type pg from "pg"
import { CompiledQuery, sql, type RawBuilder, type SqlBool } from "kysely"
import {
  DEFAULT_CONVERSATION_TYPE_MASK,
  MARKETPLACE_VERSION_STATUS,
  REUSE_SCOPES,
  SUBJECT_KIND,
  WORKSPACE_RESOURCE_KIND,
  WORKSPACE_RESOURCE_STATUS,
  WORKSPACE_RESOURCE_GRANT_STATUS,
  PLUGIN_AUTH_CONNECTION_STATUS,
  PLUGIN_AUTH_SESSION_STATUS,
  maskAllowsConversationType,
  redactSecrets,
  resolveEffectiveConversationTypeMask,
  resolveNarrowedConversationTypeMask,
  slugify,
  type WorkspaceResourceGrantStatus,
  type MarketplaceSyncMode,
  type MarketplaceVersionStatus,
  type McpSetupStep,
  type McpValidationRule,
  type PluginAuthBindingDefinition,
  type PluginConfigFieldDefinition,
  type PluginInstallFlow,
  type PluginInstallationStatus,
  type PluginReuseScopeV2,
  type PluginSpecTransport,
  type ReuseScope,
  type RuntimeBindingScope,
  type ToolSourceKind,
  type WorkspaceResourceGrantSource,
} from "@synapse/shared"
import type { CapabilityAccessTarget } from "@synapse/shared/types"
import {
  db,
  type Executor,
  type TableInsert,
  withDbTransaction,
} from "../../infrastructure/database/kysely.js"
import { validateConversationScopedAccessTarget } from "../access/policy.js"
import { buildConversationCapabilitySubjects } from "../access/subject-resolution.js"
import {
  findAccessSubjectId,
  upsertAccessSubject,
} from "../access/subject-registry.js"
import { getWorkspaceCapabilityConversationTypePolicyMap } from "../capabilities/conversation-type-policies.js"
import { revokeWorkspaceResourceGrant } from "../workspace-resources/grant-storage.js"
import {
  PLUGIN_CONNECTION_LIVE_STATUSES,
  PLUGIN_INSTALLATION_LIVE_STATUSES,
} from "./live-status.js"
import type {
  CatalogCategoriesMetadata,
  CatalogCategoryTableRow,
  PluginAuthSessionRow,
  PluginAuthSessionTableRow,
  PluginAuthSessionsUpdate,
  PluginConnectionRow,
  PluginConnectionTableRow,
  PluginConnectionsUpdate,
  PluginInstallationsConfigData,
  PluginPackageVersionSpecsTransport,
  PluginCategoryRecord,
  PublisherRecord,
} from "./repo.types.js"

type JsonObject = Record<string, unknown>
type QueryRow = pg.QueryResultRow
type QueryResultLike<T extends QueryRow> = { rows: T[] }
export type QueryRunner = <T extends QueryRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResultLike<T>>

export type PluginCatalogRow = {
  itemId: string
  itemWorkspaceId: string | null
  itemSlug: string
  itemDisplayName: string
  itemSummary: string
  itemLongDescription: string
  itemSourceKind: "builtin" | "official" | "workspace" | "user"
  itemVisibility: "public" | "workspace" | "private"
  itemTags: string[] | null
  itemIsActive: boolean
  itemDownloadCount: number
  itemMetadata: JsonObject
  itemCreatedAt: Date
  itemUpdatedAt: Date
  versionId: string | null
  versionValue: string | null
  versionStatus: MarketplaceVersionStatus | null
  versionChangelog: string | null
  versionMetadata: JsonObject
  versionCreatedByUserId: string | null
  versionCreatedAt: Date | null
  specTransport: PluginSpecTransport | null
  specEntryPoint: string | null
  specToolManifest: unknown[]
  specConfigSchema: JsonObject
  specDefaultConfig: JsonObject
  specInstallFlow: JsonObject
  specAuthBindings: PluginAuthBindingDefinition[]
  specDefaultReuseScope: PluginReuseScopeV2 | null
  specDefaultConversationTypeMask: number | null
  specSupportedReuseScopes: unknown[]
  specRequiresHandshake: boolean | null
  specMetadata: JsonObject
  publisherId: string
  publisherSlug: string
  publisherDisplayName: string
  publisherDescription: string
  publisherWorkspaceId: string | null
  publisherIsBuiltin: boolean
  publisherIsVerified: boolean
  publisherOwnerUserId: string | null
  publisherLogoFileId: string | null
  categoriesJson: JsonObject[]
  runtimePermissionsJson: JsonObject[]
}

export type PluginCatalogDbRow = Omit<
  PluginCatalogRow,
  | "itemMetadata"
  | "versionMetadata"
  | "specToolManifest"
  | "specConfigSchema"
  | "specDefaultConfig"
  | "specInstallFlow"
  | "specAuthBindings"
  | "specSupportedReuseScopes"
  | "specMetadata"
  | "categoriesJson"
  | "runtimePermissionsJson"
> & {
  itemMetadata: unknown
  versionMetadata: unknown
  specToolManifest: unknown
  specConfigSchema: unknown
  specDefaultConfig: unknown
  specInstallFlow: unknown
  specAuthBindings: unknown
  specSupportedReuseScopes: unknown
  specMetadata: unknown
  categoriesJson: unknown
  runtimePermissionsJson: unknown
}

export type InstallationRow = {
  installationId: string
  rootWorkspaceId: string
  catalogItemId: string
  catalogVersionId: string
  rootDisplayName: string
  configData: Record<string, unknown>
  approvedRuntimePermissions: string[] | null
  reuseScope: PluginReuseScopeV2
  rootConversationTypeMaskOverride: number | null
  rootStatus: PluginInstallationStatus
  rootOwnerWorkspaceMemberId: string | null
  installationCreatedAt: Date
  installationUpdatedAt: Date
  sourceCatalogItemId: string | null
  sourceCatalogVersionId: string | null
  sourceSyncMode: MarketplaceSyncMode | null
}

export type InstallationRowRaw = Omit<InstallationRow, "configData"> & {
  configData: unknown
}

// camelCase row shape. The producer is a Kysely builder query, but
// CamelCasePlugin.transformResult camelCases every top-level result key
// unconditionally — so the SELECT aliases to camelCase and consumers read
// camelCase. (Aliasing to snake_case would round-trip back to camelCase at
// runtime and silently break the snake reads.)
export type InstallationAccessRow = {
  id: string
  workspaceId: string
  installationId: string
  accessTargetType: RuntimeBindingScope
  conversationId: string | null
  actorId: string | null
  remoteAgentId: string | null
  workspaceMemberId: string | null
  conversationTypeMaskOverride: number | null
  status: WorkspaceResourceGrantStatus
  source: WorkspaceResourceGrantSource
  createdByWorkspaceMemberId: string | null
  reason: string | null
  createdAt: Date
  revokedAt: Date | null
}

function sanitizeSlug(value: string) {
  return slugify(value, { maxLength: 120 })
}

function isReuseScope(value: unknown): value is ReuseScope {
  return typeof value === "string" && REUSE_SCOPES.includes(value as ReuseScope)
}

function normalizeSupportedReuseScopes(
  value: unknown,
  defaultScope: ReuseScope
): ReuseScope[] {
  const requested = Array.isArray(value) ? value.filter(isReuseScope) : []
  const enabledScopes = new Set<ReuseScope>(requested)
  if (enabledScopes.size === 0) {
    for (const scope of REUSE_SCOPES) {
      enabledScopes.add(scope)
    }
  }
  enabledScopes.add(defaultScope)
  return REUSE_SCOPES.filter((scope) => enabledScopes.has(scope))
}

function internalReuseScope(scope: ReuseScope): PluginReuseScopeV2 {
  return scope
}

export function normalizeInstallationConfigData(
  value: unknown
): Record<string, unknown> {
  return normalizeJsonObject(value, "installation.configData")
}

export function normalizeNullablePluginConnectionPublicPayload(
  value: unknown
): Record<string, unknown> | null {
  if (value === null || typeof value === "undefined") return null
  return normalizeJsonObject(value, "pluginConnection.publicPayload")
}

function normalizeJsonObject(
  value: unknown,
  label = "JSON object field"
): Record<string, unknown> {
  if (value === null || typeof value === "undefined") return {}

  let candidate: unknown = value
  if (typeof value === "string") {
    if (!value.trim()) {
      throw new Error(`${label} must be valid JSON`)
    }
    try {
      candidate = JSON.parse(value) as unknown
    } catch {
      throw new Error(`${label} must be valid JSON`)
    }
  }

  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    throw new Error(`${label} must be a JSON object`)
  }

  return candidate as Record<string, unknown>
}

export function normalizeJsonArray<T = unknown>(
  value: unknown,
  label = "JSON array field"
): T[] {
  if (value === null || typeof value === "undefined") return []
  if (typeof value === "string") {
    if (!value.trim()) return []
    try {
      const parsed = JSON.parse(value) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON array`)
      }
      return parsed as T[]
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === `${label} must be a JSON array`
      ) {
        throw error
      }
      throw new Error(`${label} must be valid JSON`)
    }
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array`)
  }
  return value as T[]
}

export function normalizePluginCatalogRow(
  row: PluginCatalogDbRow
): PluginCatalogRow {
  const {
    itemMetadata,
    versionMetadata,
    specToolManifest,
    specConfigSchema,
    specDefaultConfig,
    specInstallFlow,
    specAuthBindings,
    specSupportedReuseScopes,
    specMetadata,
    categoriesJson,
    runtimePermissionsJson,
    ...rest
  } = row
  return {
    ...rest,
    itemMetadata: normalizeJsonObject(itemMetadata, "item.metadata"),
    versionMetadata: normalizeJsonObject(versionMetadata, "version.metadata"),
    specToolManifest: normalizeJsonArray(specToolManifest, "spec.toolManifest"),
    specConfigSchema: normalizeJsonObject(
      specConfigSchema,
      "spec.configSchema"
    ),
    specDefaultConfig: normalizeJsonObject(
      specDefaultConfig,
      "spec.defaultConfig"
    ),
    specInstallFlow: normalizeJsonObject(specInstallFlow, "spec.installFlow"),
    specAuthBindings: normalizeJsonArray<PluginAuthBindingDefinition>(
      specAuthBindings,
      "spec.authBindings"
    ),
    specSupportedReuseScopes: normalizeJsonArray(
      specSupportedReuseScopes,
      "spec.supportedReuseScopes"
    ),
    specMetadata: normalizeJsonObject(specMetadata, "spec.metadata"),
    categoriesJson: normalizeJsonArray<JsonObject>(
      categoriesJson,
      "catalog.categories"
    ),
    runtimePermissionsJson: normalizeJsonArray<JsonObject>(
      runtimePermissionsJson,
      "plugin.runtimePermissions"
    ),
  }
}

export function normalizeInstallationRow(
  row: InstallationRowRaw
): InstallationRow {
  return {
    installationId: row.installationId,
    rootWorkspaceId: row.rootWorkspaceId,
    catalogItemId: row.catalogItemId,
    catalogVersionId: row.catalogVersionId,
    rootDisplayName: row.rootDisplayName,
    configData: normalizeInstallationConfigData(row.configData),
    approvedRuntimePermissions: row.approvedRuntimePermissions,
    reuseScope: row.reuseScope,
    rootConversationTypeMaskOverride: row.rootConversationTypeMaskOverride,
    rootStatus: row.rootStatus,
    rootOwnerWorkspaceMemberId: row.rootOwnerWorkspaceMemberId,
    installationCreatedAt: row.installationCreatedAt,
    installationUpdatedAt: row.installationUpdatedAt,
    sourceCatalogItemId: row.sourceCatalogItemId,
    sourceCatalogVersionId: row.sourceCatalogVersionId,
    sourceSyncMode: row.sourceSyncMode,
  }
}

/**
 * Build a query runner backed by an Executor (db/trx).
 *
 * CamelCasePlugin already camelCases top-level result keys for raw queries.
 * Auth connection presentation expects the camelCase pluginConnections shape,
 * so rows pass through unchanged.
 */
export function createMcpPluginQueryRunner(executor: Executor): QueryRunner {
  return <T extends QueryRow>(text: string, params?: unknown[]) =>
    executor.executeQuery<T>(
      CompiledQuery.raw(text, params ? [...params] : [])
    ) as Promise<QueryResultLike<T>>
}

export async function withMcpPluginTransaction<T>(
  fn: (client: Executor) => Promise<T>
): Promise<T> {
  return withDbTransaction((client) => fn(client))
}

const PLUGIN_CATALOG_SELECT = `
  SELECT
    item.id AS "itemId",
    item.workspace_id AS "itemWorkspaceId",
    item.slug AS "itemSlug",
    item.display_name AS "itemDisplayName",
    item.summary AS "itemSummary",
    item.long_description AS "itemLongDescription",
    item.source_kind AS "itemSourceKind",
    item.visibility AS "itemVisibility",
    item.tags AS "itemTags",
    item.is_active AS "itemIsActive",
    item.download_count AS "itemDownloadCount",
    item.metadata AS "itemMetadata",
    item.created_at AS "itemCreatedAt",
    item.updated_at AS "itemUpdatedAt",
    version.id AS "versionId",
    version.version AS "versionValue",
    version.status AS "versionStatus",
    version.changelog AS "versionChangelog",
    version.metadata AS "versionMetadata",
    version.created_by_user_id AS "versionCreatedByUserId",
    version.created_at AS "versionCreatedAt",
    spec.transport AS "specTransport",
    spec.entry_point AS "specEntryPoint",
    spec.tool_manifest AS "specToolManifest",
    spec.config_schema AS "specConfigSchema",
    spec.default_config AS "specDefaultConfig",
    spec.install_flow AS "specInstallFlow",
    spec.auth_bindings AS "specAuthBindings",
    spec.default_reuse_scope AS "specDefaultReuseScope",
    spec.default_conversation_type_mask AS "specDefaultConversationTypeMask",
    to_jsonb(spec.supported_reuse_scopes) AS "specSupportedReuseScopes",
    spec.requires_handshake AS "specRequiresHandshake",
    spec.metadata AS "specMetadata",
    publisher.id AS "publisherId",
    publisher.slug AS "publisherSlug",
    publisher.display_name AS "publisherDisplayName",
    publisher.description AS "publisherDescription",
    publisher.workspace_id AS "publisherWorkspaceId",
    publisher.is_builtin AS "publisherIsBuiltin",
    publisher.is_verified AS "publisherIsVerified",
    publisher.owner_user_id AS "publisherOwnerUserId",
    publisher.logo_file_id AS "publisherLogoFileId",
    COALESCE(categories.categories_json, '[]'::jsonb) AS "categoriesJson",
    COALESCE(runtime_permissions.runtime_permissions_json, '[]'::jsonb) AS "runtimePermissionsJson"
  FROM catalog_items item
  JOIN publishers publisher
    ON publisher.id = item.publisher_id
  JOIN catalog_versions version
    ON version.catalog_item_id = item.id
  LEFT JOIN plugin_package_version_specs spec
    ON spec.catalog_version_id = version.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', category.id,
        'slug', category.slug,
        'display_name', category.display_name,
        'description', category.description,
        'display_name_i18n', COALESCE(category.metadata->'displayNameI18n', '{}'::jsonb),
        'description_i18n', COALESCE(category.metadata->'descriptionI18n', '{}'::jsonb),
        'default_locale', COALESCE(category.metadata->>'defaultLocale', 'en')
      )
      ORDER BY category.sort_order ASC, category.display_name ASC
    ) AS categories_json
    FROM catalog_item_categories item_category
    JOIN catalog_categories category
      ON category.id = item_category.category_id
    WHERE item_category.catalog_item_id = item.id
      AND category.item_kind = 'plugin_package'
  ) categories ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'permissionKey', permission_key,
        'isRequired', is_required,
        'rationale', rationale
      )
      ORDER BY permission_key ASC
    ) AS runtime_permissions_json
    FROM plugin_version_runtime_permissions permission_row
    WHERE permission_row.catalog_version_id = version.id
  ) runtime_permissions ON TRUE
  WHERE item.item_kind = 'plugin_package'
`

export async function ensureCatalogItem(
  ex: Executor,
  input: {
    orgId: string
    workspaceId?: string
    slug: string
    displayName: string
    description?: string
    longDescription?: string
    tags?: string[]
    isBuiltin?: boolean
    transport: PluginSpecTransport
    displayNameI18n?: Record<string, string>
    descriptionI18n?: Record<string, string>
    longDescriptionI18n?: Record<string, string>
    summaryI18n?: Record<string, string>
    defaultLocale?: string
  }
) {
  const normalizedSlug = sanitizeSlug(input.slug)
  const existing = await ex
    .selectFrom("catalogItems")
    .select("id")
    .where("publisherId", "=", input.orgId)
    .where("itemKind", "=", "plugin_package")
    .where("slug", "=", normalizedSlug)
    .where(
      sql<SqlBool>`${sql.ref("workspaceId")} is not distinct from ${
        input.workspaceId || null
      }`
    )
    .limit(1)
    .execute()

  const metadata = {
    displayNameI18n: input.displayNameI18n || { en: input.displayName },
    descriptionI18n: input.descriptionI18n || { en: input.description || "" },
    longDescriptionI18n:
      input.longDescriptionI18n ||
      (input.longDescription ? { en: input.longDescription } : undefined),
    summaryI18n: input.summaryI18n,
    defaultLocale: input.defaultLocale || "en",
  }

  if (existing.length > 0) {
    const itemId = existing[0]!.id
    await ex
      .updateTable("catalogItems")
      .set({
        displayName: input.displayName,
        summary: input.description || "",
        longDescription: input.longDescription || "",
        sourceKind: input.isBuiltin ? "builtin" : "official",
        visibility: "public",
        tags: input.tags || [],
        isActive: true,
        metadata: sql`${JSON.stringify(metadata)}::jsonb`,
      })
      .where("id", "=", itemId)
      .execute()
    return itemId
  }

  const inserted = await ex
    .insertInto("catalogItems")
    .values({
      publisherId: input.orgId,
      workspaceId: input.workspaceId || null,
      itemKind: "plugin_package",
      slug: normalizedSlug,
      displayName: input.displayName,
      summary: input.description || "",
      longDescription: input.longDescription || "",
      sourceKind: input.isBuiltin ? "builtin" : "official",
      visibility: "public",
      tags: input.tags || [],
      isActive: true,
      metadata: sql`${JSON.stringify(metadata)}::jsonb`,
    })
    .returning("id")
    .execute()

  return inserted[0]!.id
}

export async function upsertPluginVersion(
  ex: Executor,
  itemId: string,
  input: {
    version?: string
    transport: PluginSpecTransport
    entryPoint?: string
    lifecycleScope?: ReuseScope
    supportedReuseScopes?: ReuseScope[]
    defaultConversationTypeMask?: number
    requiresHandshake?: boolean
    toolsManifest?: unknown[]
    configSchema?: Record<string, unknown>
    defaultConfig?: Record<string, unknown>
    installFlow?: PluginInstallFlow
    authBindings?: PluginAuthBindingDefinition[]
    configFields?: PluginConfigFieldDefinition[]
    validationRules?: McpValidationRule[]
    setupSteps?: McpSetupStep[]
    authorization?: {
      requiredPermissions?: string[]
      reason?: string
    }
  }
) {
  const versionValue = input.version || "1.0.0"
  const upsertedVersion = await ex
    .insertInto("catalogVersions")
    .values({
      catalogItemId: itemId,
      version: versionValue,
      status: MARKETPLACE_VERSION_STATUS.ACTIVE,
      changelog: "",
      metadata: sql`'{}'::jsonb`,
    })
    .onConflict((oc) =>
      oc.columns(["catalogItemId", "version"]).doUpdateSet({
        status: MARKETPLACE_VERSION_STATUS.ACTIVE,
      })
    )
    .returning("id")
    .execute()
  const versionId = upsertedVersion[0]!.id

  const metadata = {
    configFields: input.configFields || [],
    validationRules: input.validationRules || [],
    setupSteps: input.setupSteps || [],
    authorization: {
      reason: input.authorization?.reason || undefined,
    },
  }
  const defaultReuseScope = input.lifecycleScope || "conversation"
  const defaultConversationTypeMask = resolveEffectiveConversationTypeMask({
    defaultMask: input.defaultConversationTypeMask,
    overrideMask: null,
  })
  const supportedReuseScopes = normalizeSupportedReuseScopes(
    input.supportedReuseScopes,
    defaultReuseScope
  )

  await ex
    .insertInto("pluginPackageVersionSpecs")
    .values({
      catalogVersionId: versionId,
      transport: input.transport as PluginPackageVersionSpecsTransport,
      entryPoint: input.entryPoint || null,
      toolManifest: sql`${JSON.stringify(input.toolsManifest || [])}::jsonb`,
      configSchema: sql`${JSON.stringify(input.configSchema || {})}::jsonb`,
      defaultConfig: sql`${JSON.stringify(input.defaultConfig || {})}::jsonb`,
      installFlow: sql`${JSON.stringify(
        input.installFlow || { steps: input.setupSteps || [] }
      )}::jsonb`,
      authBindings: sql`${JSON.stringify(input.authBindings || [])}::jsonb`,
      defaultReuseScope: internalReuseScope(defaultReuseScope),
      defaultConversationTypeMask: defaultConversationTypeMask,
      supportedReuseScopes: supportedReuseScopes.map((scope) =>
        internalReuseScope(scope)
      ),
      requiresHandshake:
        input.requiresHandshake ?? input.transport !== "builtin",
      metadata: sql`${JSON.stringify(metadata)}::jsonb`,
    })
    .onConflict((oc) =>
      oc.column("catalogVersionId").doUpdateSet({
        transport: sql`excluded.transport`,
        entryPoint: sql`excluded.entry_point`,
        toolManifest: sql`excluded.tool_manifest`,
        configSchema: sql`excluded.config_schema`,
        defaultConfig: sql`excluded.default_config`,
        installFlow: sql`excluded.install_flow`,
        authBindings: sql`excluded.auth_bindings`,
        defaultReuseScope: sql`excluded.default_reuse_scope`,
        defaultConversationTypeMask: sql`excluded.default_conversation_type_mask`,
        supportedReuseScopes: sql`excluded.supported_reuse_scopes`,
        requiresHandshake: sql`excluded.requires_handshake`,
        metadata: sql`excluded.metadata`,
      })
    )
    .execute()

  await sql`SELECT sd_replace_plugin_runtime_permissions(${versionId}::uuid)`.execute(
    ex
  )

  for (const permissionKey of input.authorization?.requiredPermissions || []) {
    await ex
      .insertInto("pluginVersionRuntimePermissions")
      .values({
        catalogVersionId: versionId,
        permissionKey: permissionKey,
        isRequired: true,
        rationale: "",
      })
      .execute()
  }

  await ex
    .updateTable("catalogItems")
    .set({
      latestVersionId: versionId,
    })
    .where("id", "=", itemId)
    .execute()

  return versionId
}

export async function assignPluginCategories(
  ex: Executor,
  itemId: string,
  categorySlugs: string[]
) {
  await sql`SELECT sd_replace_catalog_item_categories(${itemId}::uuid)`.execute(
    ex
  )

  if (categorySlugs.length === 0) return

  const result = await ex
    .selectFrom("catalogCategories")
    .select("id")
    .where("itemKind", "=", "plugin_package")
    .where("slug", "in", categorySlugs)
    .execute()

  for (const row of result) {
    await ex
      .insertInto("catalogItemCategories")
      .values({
        catalogItemId: itemId,
        categoryId: row.id,
      })
      .onConflict((oc) => oc.doNothing())
      .execute()
  }
}

export async function loadPluginCatalogRows(
  whereClause: RawBuilder<unknown>
): Promise<PluginCatalogRow[]> {
  const result = await db.executeQuery(
    sql<PluginCatalogDbRow>`
      ${sql.raw(PLUGIN_CATALOG_SELECT)}
      ${whereClause}
    `.compile(db)
  )
  return result.rows.map(normalizePluginCatalogRow)
}

export async function getPluginCatalogRowByItemId(
  itemId: string
): Promise<PluginCatalogRow | null> {
  const rows = await loadPluginCatalogRows(
    sql`AND item.id = ${itemId}
       AND version.id = item.latest_version_id
       LIMIT 1`
  )

  return rows[0] || null
}

export async function listPluginCatalogRowsByVersionIds(
  versionIds: string[]
): Promise<PluginCatalogRow[]> {
  if (versionIds.length === 0) {
    return []
  }

  return loadPluginCatalogRows(sql`AND version.id = ANY(${versionIds}::uuid[])`)
}

export async function listPublicPluginCatalogRows(filters?: {
  orgId?: string
  transport?: string
  search?: string
  tags?: string[]
  categorySlugs?: string[]
}): Promise<PluginCatalogRow[]> {
  const conditions: RawBuilder<unknown>[] = [
    sql`version.id = item.latest_version_id`,
    sql`item.is_active = TRUE`,
    sql`item.workspace_id IS NULL`,
  ]

  if (filters?.orgId) {
    conditions.push(sql`item.publisher_id = ${filters.orgId}`)
  }

  if (filters?.transport) {
    conditions.push(sql`spec.transport = ${filters.transport}`)
  }

  if (filters?.search) {
    const search = `%${filters.search.trim()}%`
    conditions.push(
      sql`(item.display_name ILIKE ${search} OR item.summary ILIKE ${search} OR item.long_description ILIKE ${search} OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(item.tags, ARRAY[]::text[])) tag
         WHERE tag ILIKE ${search}
       ))`
    )
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(sql`item.tags && ${filters.tags}::text[]`)
  }

  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    conditions.push(
      sql`EXISTS (
         SELECT 1
         FROM catalog_item_categories item_category
         JOIN catalog_categories category
           ON category.id = item_category.category_id
         WHERE item_category.catalog_item_id = item.id
           AND category.item_kind = 'plugin_package'
           AND category.slug = ANY(${filters.categorySlugs}::text[])
       )`
    )
  }

  return loadPluginCatalogRows(
    sql`AND ${sql.join(conditions, sql` AND `)}
       ORDER BY item.download_count DESC, item.created_at DESC`
  )
}

export async function getActivePluginConnectionPublicPayload(
  ex: Executor,
  connectionId: string
): Promise<Record<string, unknown> | null> {
  const row = await ex
    .selectFrom("pluginConnections")
    .select("publicPayload")
    .where("id", "=", connectionId)
    .where("deletedAt", "is", null)
    .where("status", "in", PLUGIN_CONNECTION_LIVE_STATUSES)
    .limit(1)
    .executeTakeFirst()

  return normalizeNullablePluginConnectionPublicPayload(row?.publicPayload)
}

export async function insertPluginInstallationRecord(
  ex: Executor,
  input: {
    id: string
    catalogItemId: string
    catalogVersionId: string
    configData: Record<string, unknown>
    approvedRuntimePermissions: string[]
    reuseScope: PluginReuseScopeV2
  }
): Promise<string> {
  const inserted = await ex
    .insertInto("pluginInstallations")
    .values({
      id: input.id,
      catalogItemId: input.catalogItemId,
      catalogVersionId: input.catalogVersionId,
      configData: input.configData as PluginInstallationsConfigData,
      approvedRuntimePermissions: input.approvedRuntimePermissions,
      reuseScope: input.reuseScope,
    })
    .returning("id")
    .executeTakeFirstOrThrow()

  return inserted.id
}

export async function updatePluginInstallationConfigData(
  ex: Executor,
  installationId: string,
  configData: Record<string, unknown>
): Promise<void> {
  await ex
    .updateTable("pluginInstallations")
    .set({
      configData: sql`${JSON.stringify(configData)}::jsonb`,
    })
    .where("id", "=", installationId)
    .execute()
}

export async function updatePluginInstallationReuseScope(
  ex: Executor,
  installationId: string,
  reuseScope: PluginReuseScopeV2
): Promise<void> {
  await ex
    .updateTable("pluginInstallations")
    .set({
      reuseScope,
    })
    .where("id", "=", installationId)
    .execute()
}

export async function insertPluginSourceRefRecord(
  ex: Executor,
  input: {
    installationId: string
    sourceCatalogItemId: string
    sourceCatalogVersionId: string
    syncMode: MarketplaceSyncMode
  }
): Promise<void> {
  await ex
    .insertInto("pluginSourceRefs")
    .values({
      installationId: input.installationId,
      sourceCatalogItemId: input.sourceCatalogItemId,
      sourceCatalogVersionId: input.sourceCatalogVersionId,
      syncMode: input.syncMode,
    })
    .execute()
}

export async function incrementPluginCatalogDownloadCount(
  ex: Executor,
  catalogItemId: string
): Promise<void> {
  await ex
    .updateTable("catalogItems")
    .set({
      downloadCount: sql`download_count + 1`,
    })
    .where("id", "=", catalogItemId)
    .execute()
}

export async function revokePluginConnectionsForInstallation(
  ex: Executor,
  installationId: string
): Promise<void> {
  await ex
    .updateTable("pluginConnections")
    .set({
      deletedAt: sql`NOW()`,
      status: PLUGIN_AUTH_CONNECTION_STATUS.REVOKED,
    })
    .where("installationId", "=", installationId)
    .where("deletedAt", "is", null)
    .execute()
}

export async function loadInstallationRows(
  workspaceId: string,
  filters?: {
    installationIds?: string[]
    pluginId?: string
    installationId?: string
  }
): Promise<InstallationRow[]> {
  const conditions: RawBuilder<unknown>[] = [
    sql`resource.workspace_id = ${workspaceId}`,
  ]

  if (filters?.pluginId) {
    conditions.push(sql`installation.catalog_item_id = ${filters.pluginId}`)
  }

  if (filters?.installationId) {
    conditions.push(sql`installation.id = ${filters.installationId}`)
  }
  if (filters?.installationIds?.length) {
    conditions.push(
      sql`installation.id = ANY(${filters.installationIds}::uuid[])`
    )
  }

  const result = await db.executeQuery(
    sql<InstallationRowRaw>`SELECT
        installation.id AS "installationId",
        resource.workspace_id AS "rootWorkspaceId",
        installation.catalog_item_id AS "catalogItemId",
        installation.catalog_version_id AS "catalogVersionId",
        resource.display_name AS "rootDisplayName",
        installation.config_data AS "configData",
        installation.approved_runtime_permissions AS "approvedRuntimePermissions",
        installation.reuse_scope AS "reuseScope",
        resource.conversation_type_mask_override AS "rootConversationTypeMaskOverride",
        resource.status AS "rootStatus",
        owner_subject.workspace_member_id AS "rootOwnerWorkspaceMemberId",
        resource.created_at AS "installationCreatedAt",
        resource.updated_at AS "installationUpdatedAt",
        source_ref.source_catalog_item_id AS "sourceCatalogItemId",
        source_ref.source_catalog_version_id AS "sourceCatalogVersionId",
        source_ref.sync_mode AS "sourceSyncMode"
      FROM plugin_installations installation
      INNER JOIN workspace_resources_live resource
        ON resource.id = installation.id
      LEFT JOIN access_subjects owner_subject
        ON owner_subject.id = resource.owner_subject_id
      LEFT JOIN plugin_source_refs source_ref
        ON source_ref.installation_id = installation.id
      WHERE resource.deleted_at IS NULL
        AND resource.status IN ('active', 'disabled', 'error')
        AND ${sql.join(conditions, sql` AND `)}
      ORDER BY installation.created_at DESC`.compile(db)
  )

  return result.rows.map(normalizeInstallationRow)
}

export async function listPluginInstallationAccessRows(
  installationId: string,
  includeRevoked = false
): Promise<InstallationAccessRow[]> {
  let query = db
    .selectFrom("workspaceResourceGrants as resource_grant")
    .innerJoin("accessSubjects as subj", "subj.id", "resource_grant.subjectId")
    .leftJoin(
      "accessSubjects as scope",
      "scope.id",
      "resource_grant.scopeSubjectId"
    )
    .select([
      "resource_grant.id",
      "resource_grant.workspaceId",
      "resource_grant.workspaceResourceId as installationId",
      sql<RuntimeBindingScope>`
        CASE subj.kind
          WHEN 'workspace' THEN 'workspace'
          WHEN 'workspace_member' THEN 'workspace_member'
          WHEN 'conversation' THEN 'conversation'
          WHEN 'actor' THEN 'actor'
          WHEN 'remote_agent' THEN 'remote_agent'
        END
      `.as("accessTargetType"),
      "subj.actorId",
      "subj.remoteAgentId",
      "subj.workspaceMemberId",
      // A conversation can be the grant SUBJECT (subj.conversation_id, scope is
      // NULL) or the grant SCOPE (scope.conversation_id). Coalesce both so a
      // conversation-subject grant keeps its bound conversation instead of
      // null-ing out and being re-targeted workspace-wide downstream. Mirrors
      // loadVisiblePluginGrants (scopeConversationId ?? subjectConversationId).
      sql<
        string | null
      >`COALESCE(scope.conversation_id, subj.conversation_id)`.as(
        "conversationId"
      ),
      "resource_grant.conversationTypeMaskOverride",
      "resource_grant.status",
      "resource_grant.source",
      "resource_grant.createdByWorkspaceMemberId",
      "resource_grant.reason",
      "resource_grant.createdAt",
      "resource_grant.revokedAt",
    ])
    .where("resource_grant.workspaceResourceId", "=", installationId)
    .where(
      sql<boolean>`'use'::workspace_resource_grant_permission = ANY(resource_grant.permissions)`
    )
    .orderBy("resource_grant.createdAt", "desc")

  if (!includeRevoked) {
    query = query.where(
      "resource_grant.status",
      "=",
      WORKSPACE_RESOURCE_GRANT_STATUS.ACTIVE
    )
  }

  // The builder aliases to camelCase and CamelCasePlugin.transformResult yields
  // camelCase keys, so the rows already match InstallationAccessRow's shape.
  // created_at is DEFAULT NOW() but not NOT NULL; coalesce the rare null.
  const rows = await query.execute()
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt,
  }))
}

export async function createPluginPublisherRecord(data: {
  slug: string
  displayName: string
  description?: string
  logoFileId?: string
  isBuiltin?: boolean
  isVerified?: boolean
  ownerUserId?: string
}): Promise<PublisherRecord> {
  return db
    .insertInto("publishers")
    .values({
      slug: data.slug,
      displayName: data.displayName,
      description: data.description || "",
      logoFileId: data.logoFileId || null,
      ownerUserId: data.ownerUserId || null,
      workspaceId: null,
      isBuiltin: data.isBuiltin === true,
      isVerified: data.isVerified === true,
    })
    .onConflict((oc) =>
      oc
        .column("slug")
        .where("deletedAt", "is", null)
        .doUpdateSet({
          displayName: data.displayName,
          description: data.description || "",
          logoFileId: data.logoFileId || null,
          ownerUserId: sql`COALESCE(publishers.owner_user_id, excluded.owner_user_id)`,
          isBuiltin: data.isBuiltin === true,
          isVerified: data.isVerified === true,
        })
    )
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function listPluginPublisherRecords(): Promise<PublisherRecord[]> {
  return db
    .selectFrom("publishers as publisher")
    .leftJoin("catalogItems as item", (join) =>
      join
        .onRef("item.publisherId", "=", "publisher.id")
        .on("item.itemKind", "=", "plugin_package")
        .on("item.isActive", "=", true)
        .on("item.workspaceId", "is", null)
    )
    .selectAll("publisher")
    .select(sql<number>`COUNT(item.id)::int`.as("pluginCount"))
    .groupBy("publisher.id")
    .orderBy("publisher.isVerified", "desc")
    .orderBy("publisher.displayName", "asc")
    .execute()
}

export async function getPluginPublisherRecord(
  id: string
): Promise<PublisherRecord | null> {
  const row = await db
    .selectFrom("publishers")
    .selectAll()
    .select(sql<number>`0::int`.as("pluginCount"))
    .where("id", "=", id)
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export async function getPluginPublisherRecordBySlug(
  slug: string
): Promise<PublisherRecord | null> {
  const row = await db
    .selectFrom("publishers")
    .selectAll()
    .select(sql<number>`0::int`.as("pluginCount"))
    .where("slug", "=", slug)
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export function normalizePluginCategoryRecord(
  row: CatalogCategoryTableRow
): PluginCategoryRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    sortOrder: row.sortOrder,
    metadata: normalizeJsonObject(row.metadata, "category.metadata"),
  }
}

export async function listPluginCategoryRecords(): Promise<
  import("./repo.types.js").PluginCategoryRecord[]
> {
  const rows = await db
    .selectFrom("catalogCategories")
    .selectAll()
    .where("itemKind", "=", "plugin_package")
    .orderBy("sortOrder", "asc")
    .orderBy("displayName", "asc")
    .execute()
  return rows.map(normalizePluginCategoryRecord)
}

export async function findPluginInstallationWorkspace(
  installId: string
): Promise<{ installationId: string; workspaceId: string } | null> {
  const row = await db
    .selectFrom("pluginInstallations as installation")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "installation.id"
    )
    .select([
      "installation.id as installationId",
      "resource.workspaceId as workspaceId",
    ])
    .where("installation.id", "=", installId)
    .where("resource.deletedAt", "is", null)
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export async function validateMcpPluginConversationScopedAccessTarget(params: {
  target: CapabilityAccessTarget
  effectiveConversationTypeMask: number
  buildError: (message: string) => Error
}) {
  return validateConversationScopedAccessTarget({
    db,
    target: params.target,
    effectiveConversationTypeMask: params.effectiveConversationTypeMask,
    buildError: params.buildError,
  })
}

export async function updatePluginInstallationGrantConversationTypeMask(params: {
  workspaceId: string
  grantId: string
  conversationTypeMaskOverride: number | null
}) {
  await db
    .updateTable("workspaceResourceGrants")
    .set({
      conversationTypeMaskOverride: params.conversationTypeMaskOverride,
    } as any)
    .where("id", "=", params.grantId)
    .where("workspaceId", "=", params.workspaceId)
    .execute()
}

export async function revokePluginWorkspaceResourceGrant(grantId: string) {
  await revokeWorkspaceResourceGrant(db as any, grantId)
}

export async function upsertBuiltinPluginCategory(input: {
  slug: string
  displayName: string
  description?: string
  sortOrder: number
  metadata: CatalogCategoriesMetadata
}) {
  await db
    .insertInto("catalogCategories")
    .values({
      slug: input.slug,
      itemKind: "plugin_package",
      displayName: input.displayName,
      description: input.description || "",
      sortOrder: input.sortOrder,
      metadata: input.metadata,
    })
    .onConflict((oc) =>
      oc.columns(["itemKind", "slug"]).doUpdateSet({
        displayName: input.displayName,
        description: input.description || "",
        sortOrder: input.sortOrder,
        metadata: input.metadata,
      })
    )
    .execute()
}

// ---------------------------------------------------------------------------
// audit.ts queries
// ---------------------------------------------------------------------------

export type ToolCallAuditLogRecord = {
  id: string
  conversationId: string
  sessionId: string | null
  turnId: string
  actorId: string | null
  providerCallId: string | null
  toolName: string
  sourceKind: ToolSourceKind
  sourceSnapshot: unknown
  pluginInstallationId: string | null
  runtimeToolId: string | null
  normalizedInput: Record<string, unknown>
  status: string
  createdAt: Date
  completedAt: Date | null
  isError: boolean | null
  errorMessage: string | null
  resultMetadata: unknown
}

export async function listToolCallAuditLogs(
  workspaceId: string,
  filters?: {
    pluginId?: string
    sessionId?: string
    actorId?: string
    limit?: number
    before?: string
  }
): Promise<ToolCallAuditLogRecord[]> {
  const limit = Math.min(filters?.limit || 50, 200)
  let statement = db
    .selectFrom("toolCalls as tc")
    .innerJoin("conversations as c", "c.id", "tc.conversationId")
    .innerJoin("turns as t", "t.id", "tc.turnId")
    .leftJoin("pluginInstallations as pi", "pi.id", "tc.pluginInstallationId")
    .leftJoin("toolResults as tr", (join) =>
      join.onRef("tr.toolCallId", "=", "tc.id").on("tr.resultIndex", "=", 0)
    )
    .select([
      "tc.id",
      "tc.conversationId",
      "tc.sessionId",
      "tc.turnId",
      "t.actorId",
      "tc.providerCallId",
      "tc.toolName",
      "tc.sourceKind",
      "tc.sourceSnapshot",
      "tc.pluginInstallationId",
      "tc.runtimeToolId",
      "tc.normalizedInput",
      "tc.status",
      "tc.createdAt",
      "tc.completedAt",
      "tr.isError",
      "tr.errorMessage",
      "tr.metadata as resultMetadata",
    ])
    .where("c.workspaceId", "=", workspaceId)

  if (filters?.sessionId) {
    statement = statement.where("tc.sessionId", "=", filters.sessionId)
  }
  if (filters?.actorId) {
    statement = statement.where("t.actorId", "=", filters.actorId)
  }
  if (filters?.pluginId) {
    statement = statement.where((eb) =>
      eb.or([
        eb("tc.pluginInstallationId", "=", filters.pluginId!),
        eb("pi.catalogItemId", "=", filters.pluginId!),
      ])
    )
  }
  if (filters?.before) {
    statement = statement.where("tc.createdAt", "<", new Date(filters.before))
  }

  const rows = await statement
    .orderBy("tc.createdAt", "desc")
    .limit(limit)
    .execute()
  return rows.map((row) => ({
    ...row,
    normalizedInput: redactSecrets(
      row.normalizedInput as Record<string, unknown>
    ),
  })) as ToolCallAuditLogRecord[]
}

export async function listRuntimeEventAuditLogs(
  workspaceId: string,
  filters?: {
    eventType?: string
    pluginId?: string
    limit?: number
    before?: string
  }
) {
  const limit = Math.min(filters?.limit || 50, 200)
  let statement = db
    .selectFrom("runtimeEvents")
    .selectAll()
    .where("workspaceId", "=", workspaceId)

  if (filters?.eventType) {
    statement = statement.where("eventType", "=", filters.eventType)
  }
  if (filters?.pluginId) {
    statement = statement.where(
      sql<boolean>`payload->>'pluginId' = ${filters.pluginId}`
    )
  }
  if (filters?.before) {
    statement = statement.where("createdAt", "<", new Date(filters.before))
  }

  return statement.orderBy("createdAt", "desc").limit(limit).execute()
}

// ---------------------------------------------------------------------------
// config-resolver.ts query
// ---------------------------------------------------------------------------

export interface InstallationConfigRow {
  catalogItemId: string
  configData: Record<string, unknown>
  defaultConfig: Record<string, unknown>
  configSchema: Record<string, unknown>
}

export type InstallationConfigRowRaw = Omit<
  InstallationConfigRow,
  "configData" | "defaultConfig" | "configSchema"
> & {
  configData: unknown
  defaultConfig: unknown
  configSchema: unknown
}

export function normalizeInstallationConfigRow(
  row: InstallationConfigRowRaw
): InstallationConfigRow {
  return {
    catalogItemId: row.catalogItemId,
    configData: normalizeInstallationConfigData(row.configData),
    defaultConfig: normalizeJsonObject(row.defaultConfig, "spec.defaultConfig"),
    configSchema: normalizeJsonObject(row.configSchema, "spec.configSchema"),
  }
}

export async function findInstallationConfigRow(
  installationId: string
): Promise<InstallationConfigRow | undefined> {
  const row = await db
    // Live predicate (review F16): exclude tombstoned AND non-live status
    // (archived) installs — same definition as plugin_installations_live /
    // manifest liveValues. Read the base table (not the _live view) so the NOT
    // NULL column types are preserved (views type every column nullable).
    .selectFrom("pluginInstallations as installation")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "installation.id"
    )
    .innerJoin(
      "pluginPackageVersionSpecs as spec",
      "spec.catalogVersionId",
      "installation.catalogVersionId"
    )
    .select([
      "installation.catalogItemId",
      "installation.configData",
      "spec.defaultConfig",
      "spec.configSchema",
    ])
    .where("installation.id", "=", installationId)
    .where("resource.deletedAt", "is", null)
    .where("resource.status", "in", PLUGIN_INSTALLATION_LIVE_STATUSES)
    .limit(1)
    .executeTakeFirst()

  return row ? normalizeInstallationConfigRow(row) : undefined
}

// ---------------------------------------------------------------------------
// tool-resolver.ts queries + subject builders
// ---------------------------------------------------------------------------

export type VisiblePluginToolManifestEntry = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type VisiblePluginRow = {
  installationId: string
  ownerWorkspaceId: string
  installationStatus: PluginInstallationStatus
  catalogItemId: string
  itemSlug: string
  publisherSlug: string
  transport: PluginSpecTransport
  entryPoint: string | null
  toolManifest: VisiblePluginToolManifestEntry[]
  reuseScope: ReuseScope | null
  conversationTypeMaskOverride: number | null
}

export type VisiblePluginRowRaw = Omit<
  VisiblePluginRow,
  "installationStatus" | "toolManifest"
> & {
  installationStatus: VisiblePluginRow["installationStatus"] | "deprecated"
  toolManifest: unknown
}

export function normalizeVisiblePluginRow(
  row: VisiblePluginRowRaw
): VisiblePluginRow {
  return {
    installationId: row.installationId,
    ownerWorkspaceId: row.ownerWorkspaceId,
    installationStatus:
      row.installationStatus as VisiblePluginRow["installationStatus"],
    catalogItemId: row.catalogItemId,
    itemSlug: row.itemSlug,
    publisherSlug: row.publisherSlug,
    transport: row.transport,
    entryPoint: row.entryPoint,
    toolManifest: normalizeJsonArray<VisiblePluginToolManifestEntry>(
      row.toolManifest,
      "visiblePlugin.toolManifest"
    ),
    reuseScope: row.reuseScope,
    conversationTypeMaskOverride: row.conversationTypeMaskOverride,
  }
}

export type VisiblePluginGrantRow = {
  id: string
  workspace_id: string
  resource_type: typeof WORKSPACE_RESOURCE_KIND.PLUGIN_INSTALLATION
  resource_id: string
  target_type:
    | "workspace"
    | "workspace_member"
    | "conversation"
    | "actor"
    | "remote_agent"
  subject_workspace_id: string | null
  subject_workspace_member_id: string | null
  subject_actor_id: string | null
  subject_remote_agent_id: string | null
  subject_conversation_id: string | null
  conversation_type_mask_override: number | null
  status: WorkspaceResourceGrantStatus
  created_by_workspace_member_id: string | null
  reason: string | null
  metadata: unknown
  created_at: Date | null
  revoked_at: Date | null
  actor_id: string | null
  remote_agent_id: string | null
  conversation_id: string | null
}

type VisibilitySubjectParams = {
  workspaceId: string
  workspaceMemberId?: string | null
  actorId?: string | null
  remoteAgentId?: string | null
  conversationId?: string | null
  sessionId?: string | null
}

async function buildVisibilitySubjects(params: VisibilitySubjectParams) {
  return buildConversationCapabilitySubjects(db, {
    workspaceId: params.workspaceId,
    workspaceMemberId: params.workspaceMemberId,
    actorId: params.actorId,
    remoteAgentId: params.remoteAgentId,
    conversationId: params.conversationId,
    sessionId: params.sessionId,
  })
}

type VisibilitySubject = Awaited<
  ReturnType<typeof buildVisibilitySubjects>
>[number]

function resolveVisibilitySubjectKind(type: VisibilitySubject["type"]) {
  // Mirrors the original chained ternary EXACTLY: only "workspace",
  // "workspace_member" and "actor" map to their own kinds; every other type
  // (including "remote_agent" AND "user") falls through to REMOTE_AGENT. The
  // final branch is the `default` case — not assertNever — so a "user" subject
  // keeps yielding REMOTE_AGENT instead of throwing.
  switch (type) {
    case "workspace":
      return SUBJECT_KIND.WORKSPACE
    case "workspace_member":
      return SUBJECT_KIND.WORKSPACE_MEMBER
    case "actor":
      return SUBJECT_KIND.ACTOR
    default:
      return SUBJECT_KIND.REMOTE_AGENT
  }
}

export async function buildPluginVisibilitySubjectIds(
  params: VisibilitySubjectParams,
  readOnly = false
) {
  const subjects = await buildVisibilitySubjects(params)
  const resolvedSubjectIds = await Promise.all(
    subjects.map((subject) =>
      (readOnly ? findAccessSubjectId : upsertAccessSubject)(db, {
        kind: resolveVisibilitySubjectKind(subject.type),
        ...(subject.type === "workspace" ? { workspaceId: subject.id } : {}),
        ...(subject.type === "workspace_member"
          ? { workspaceMemberId: subject.id }
          : {}),
        ...(subject.type === "actor" ? { actorId: subject.id } : {}),
        ...(subject.type === "remote_agent"
          ? { remoteAgentId: subject.id }
          : {}),
      } as any)
    )
  )
  const subjectIds = resolvedSubjectIds.filter(
    (id): id is string => id !== null
  )

  let conversationSubjectId: string | null = null
  if (params.conversationId) {
    conversationSubjectId = await (
      readOnly ? findAccessSubjectId : upsertAccessSubject
    )(db, {
      kind: SUBJECT_KIND.CONVERSATION,
      conversationId: params.conversationId,
    })
    if (conversationSubjectId) subjectIds.push(conversationSubjectId)
  }

  return {
    subjectIds,
    runtimeScopeSubjectIds: conversationSubjectId
      ? [conversationSubjectId]
      : [],
  }
}

async function loadVisiblePluginGrants(params: { resourceIds: string[] }) {
  if (params.resourceIds.length === 0) {
    return new Map<string, VisiblePluginGrantRow[]>()
  }

  const rows = await db
    .selectFrom("workspaceResourceGrants as resource_grant")
    .innerJoin("accessSubjects as subj", "subj.id", "resource_grant.subjectId")
    .leftJoin(
      "accessSubjects as scope",
      "scope.id",
      "resource_grant.scopeSubjectId"
    )
    .select([
      "resource_grant.id",
      "resource_grant.workspaceId",
      "resource_grant.workspaceResourceId as resourceId",
      "resource_grant.conversationTypeMaskOverride",
      "resource_grant.status",
      "resource_grant.createdByWorkspaceMemberId",
      "resource_grant.reason",
      "resource_grant.createdAt",
      "resource_grant.revokedAt",
      "subj.kind as subjectKind",
      "subj.workspaceId as subjectWorkspaceIdViaJoin",
      "subj.workspaceMemberId as subjectWorkspaceMemberIdViaJoin",
      "subj.actorId as subjectActorIdViaJoin",
      "subj.remoteAgentId as subjectRemoteAgentIdViaJoin",
      "subj.conversationId as subjectConversationIdViaJoin",
      "scope.kind as scopeKind",
      "scope.conversationId as scopeConversationIdViaJoin",
    ])
    .where("resource_grant.workspaceResourceId", "in", params.resourceIds)
    .where("resource_grant.status", "=", WORKSPACE_RESOURCE_GRANT_STATUS.ACTIVE)
    .where(
      sql<boolean>`'use'::workspace_resource_grant_permission = ANY(resource_grant.permissions)`
    )
    .execute()

  const map = new Map<string, VisiblePluginGrantRow[]>()
  for (const rawRow of rows) {
    const row = rawRow as typeof rawRow & {
      subjectKind?: string | null
      subjectWorkspaceIdViaJoin?: string | null
      subjectWorkspaceMemberIdViaJoin?: string | null
      subjectActorIdViaJoin?: string | null
      subjectRemoteAgentIdViaJoin?: string | null
      subjectConversationIdViaJoin?: string | null
      scopeKind?: string | null
      scopeConversationIdViaJoin?: string | null
    }
    let target_type: VisiblePluginGrantRow["target_type"] | null
    switch (row.subjectKind) {
      case "workspace":
        target_type = "workspace"
        break
      case "workspace_member":
        target_type = "workspace_member"
        break
      case "conversation":
        target_type = "conversation"
        break
      case "actor":
        target_type = "actor"
        break
      case "remote_agent":
        target_type = "remote_agent"
        break
      default:
        target_type = null
    }
    if (target_type === null) {
      // Unknown subject kind — fail closed by dropping the row entirely.
      continue
    }
    const subjectActorId = row.subjectActorIdViaJoin ?? null
    const subjectRemoteAgentId = row.subjectRemoteAgentIdViaJoin ?? null
    const subjectConversationId =
      row.scopeConversationIdViaJoin ?? row.subjectConversationIdViaJoin ?? null
    const visible: VisiblePluginGrantRow = {
      id: row.id,
      workspace_id: row.workspaceId,
      resource_type: WORKSPACE_RESOURCE_KIND.PLUGIN_INSTALLATION,
      resource_id: row.resourceId,
      target_type,
      subject_workspace_id: row.subjectWorkspaceIdViaJoin ?? null,
      subject_workspace_member_id: row.subjectWorkspaceMemberIdViaJoin ?? null,
      subject_actor_id: subjectActorId,
      subject_remote_agent_id: subjectRemoteAgentId,
      subject_conversation_id: subjectConversationId,
      conversation_type_mask_override: row.conversationTypeMaskOverride,
      status: row.status,
      created_by_workspace_member_id: row.createdByWorkspaceMemberId,
      reason: row.reason,
      metadata: {},
      created_at: row.createdAt ? new Date(row.createdAt) : null,
      revoked_at: row.revokedAt ? new Date(row.revokedAt) : null,
      actor_id: subjectActorId,
      remote_agent_id: subjectRemoteAgentId,
      conversation_id: subjectConversationId,
    }
    const entries = map.get(visible.resource_id) || []
    entries.push(visible)
    map.set(visible.resource_id, entries)
  }
  return map
}

function isConversationTypeAllowed(
  mask: number,
  params: { conversationKind?: "direct" | "group"; isImConversation?: boolean }
) {
  return maskAllowsConversationType(
    mask,
    params.conversationKind,
    params.isImConversation ?? false
  )
}

function pluginGrantMatchesContext(
  row: VisiblePluginGrantRow,
  params: {
    actorId?: string | null
    conversationId?: string | null
    workspaceMemberId?: string | null
    remoteAgentId?: string | null
  }
) {
  switch (row.target_type) {
    case "workspace":
      return true
    case "workspace_member":
      return (
        !!params.workspaceMemberId &&
        row.subject_workspace_member_id === params.workspaceMemberId
      )
    case "conversation":
      return row.conversation_id === params.conversationId
    case "actor":
      return (
        params.actorId != null &&
        row.actor_id === params.actorId &&
        (!row.conversation_id || row.conversation_id === params.conversationId)
      )
    case "remote_agent":
      return (
        params.remoteAgentId != null &&
        row.remote_agent_id === params.remoteAgentId &&
        (!row.conversation_id || row.conversation_id === params.conversationId)
      )
  }
}

export type LoadVisiblePluginRowsParams = VisibilitySubjectParams & {
  conversationId: string
  conversationKind?: "direct" | "group"
  isImConversation?: boolean
}

export async function loadVisiblePluginRows(
  params: LoadVisiblePluginRowsParams
): Promise<VisiblePluginRow[]> {
  return loadVisiblePluginRowsForQuery(params)
}

export async function isPluginInstallationVisible(
  params: LoadVisiblePluginRowsParams,
  installationId: string
): Promise<boolean> {
  const rows = await loadVisiblePluginRowsForQuery(params, installationId)
  return rows.length > 0
}

async function loadVisiblePluginRowsForQuery(
  params: LoadVisiblePluginRowsParams,
  installationId?: string
): Promise<VisiblePluginRow[]> {
  const { subjectIds, runtimeScopeSubjectIds } =
    await buildPluginVisibilitySubjectIds(params, installationId !== undefined)
  if (subjectIds.length === 0) return []
  const visibleInstallationIds = new Set<string>()
  let grantQuery = db
    .selectFrom("workspaceResourceGrants as resource_grant")
    .select("resource_grant.workspaceResourceId")
    .distinct()
    .where("resource_grant.status", "=", WORKSPACE_RESOURCE_GRANT_STATUS.ACTIVE)
    .where("resource_grant.subjectId", "in", subjectIds)
    .where(
      sql<boolean>`'use'::workspace_resource_grant_permission = ANY(resource_grant.permissions)`
    )
    .where((eb) =>
      runtimeScopeSubjectIds.length > 0
        ? eb.or([
            eb("resource_grant.scopeSubjectId", "is", null),
            eb("resource_grant.scopeSubjectId", "in", runtimeScopeSubjectIds),
          ])
        : eb("resource_grant.scopeSubjectId", "is", null)
    )
  if (installationId) {
    grantQuery = grantQuery.where(
      "resource_grant.workspaceResourceId",
      "=",
      installationId
    )
  }
  const grantRows = await grantQuery.execute()

  for (const row of grantRows) {
    visibleInstallationIds.add(row.workspaceResourceId)
  }

  if (visibleInstallationIds.size === 0) {
    return [] as VisiblePluginRow[]
  }

  const installationRows = await db
    .selectFrom("pluginInstallations as installation")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "installation.id"
    )
    .innerJoin("catalogItems as item", "item.id", "installation.catalogItemId")
    .innerJoin("publishers as publisher", "publisher.id", "item.publisherId")
    .innerJoin(
      "pluginPackageVersionSpecs as spec",
      "spec.catalogVersionId",
      "installation.catalogVersionId"
    )
    .select([
      "installation.id as installationId",
      "resource.workspaceId as ownerWorkspaceId",
      "resource.status as installationStatus",
      "installation.catalogItemId",
      "item.slug as itemSlug",
      "publisher.slug as publisherSlug",
      "spec.transport",
      "spec.entryPoint",
      "spec.toolManifest",
      sql<number | null>`resource.conversation_type_mask_override`.as(
        "conversationTypeMaskOverride"
      ),
      "installation.reuseScope",
    ])
    .where("installation.id", "in", Array.from(visibleInstallationIds))
    .where("resource.status", "=", WORKSPACE_RESOURCE_STATUS.ACTIVE)
    .where("resource.deletedAt", "is", null)
    .orderBy("installation.updatedAt", "desc")
    .execute()

  const [grantsByInstallationId, workspacePolicyMap] = await Promise.all([
    loadVisiblePluginGrants({
      resourceIds: installationRows.map((row) => row.installationId),
    }),
    getWorkspaceCapabilityConversationTypePolicyMap(
      installationRows.map((row) => row.ownerWorkspaceId)
    ),
  ])

  const visibleRows = installationRows.filter((row) => {
    const workspaceConversationTypeMask =
      workspacePolicyMap.get(row.ownerWorkspaceId)?.plugin_installation ||
      DEFAULT_CONVERSATION_TYPE_MASK
    const instanceConversationTypeMask = resolveNarrowedConversationTypeMask(
      workspaceConversationTypeMask,
      row.conversationTypeMaskOverride
    )
    const matchingGrants = (
      grantsByInstallationId.get(row.installationId) || []
    ).filter(
      (grant) =>
        pluginGrantMatchesContext(grant, params) &&
        isConversationTypeAllowed(
          resolveNarrowedConversationTypeMask(
            instanceConversationTypeMask,
            grant.conversation_type_mask_override
          ),
          params
        )
    )
    return matchingGrants.length > 0
  })
  return visibleRows.map(normalizeVisiblePluginRow)
}

// ---------------------------------------------------------------------------
// plugin-auth-connections.ts queries (OAuth / Mijia / Feishu auth flows)
//
// These own every db-client query the auth-connection service touches. Each
// read returns the camelCase domain row (or undefined) and KEEPS Date objects —
// the service decides whether a miss is a 404 (PluginAuthError). Each mutation
// returns the camelCase row (Date-bearing) the service presents. The service
// keeps building the heterogeneous `.set({…})` patch objects inline (typed via
// repo.types' Update aliases) and hands them here to run.
// ---------------------------------------------------------------------------

export type PluginAuthSpecRow = {
  catalogItemId: string
  catalogVersionId: string | null
  defaultConfig: Record<string, unknown>
  authBindings: PluginAuthBindingDefinition[]
}

export type PluginAuthSpecRowRaw = Omit<
  PluginAuthSpecRow,
  "defaultConfig" | "authBindings"
> & {
  defaultConfig: unknown
  authBindings: unknown
}

export function normalizePluginAuthSpecRow(
  row: PluginAuthSpecRowRaw
): PluginAuthSpecRow {
  return {
    catalogItemId: row.catalogItemId,
    catalogVersionId: row.catalogVersionId,
    defaultConfig: normalizeJsonObject(
      row.defaultConfig,
      "authSpec.defaultConfig"
    ),
    authBindings: normalizeJsonArray<PluginAuthBindingDefinition>(
      row.authBindings,
      "authSpec.authBindings"
    ),
  }
}

export function normalizePluginAuthSessionRow(
  row: PluginAuthSessionTableRow
): PluginAuthSessionRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    catalogItemId: row.catalogItemId,
    catalogVersionId: row.catalogVersionId,
    installationId: row.installationId,
    bindingKey: row.bindingKey,
    driver: row.driver,
    workspaceMemberId: row.workspaceMemberId,
    status: row.status,
    phase: row.phase,
    state: row.state,
    challengePayload: normalizeJsonObject(
      row.challengePayload,
      "authSession.challengePayload"
    ),
    transientPayload: normalizeJsonObject(
      row.transientPayload,
      "authSession.transientPayload"
    ),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    resultPreview: normalizeJsonObject(
      row.resultPreview,
      "authSession.resultPreview"
    ),
    resultPayload: normalizeJsonObject(
      row.resultPayload,
      "authSession.resultPayload"
    ),
    metadata: normalizeJsonObject(row.metadata, "authSession.metadata"),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

type PluginConnectionJoinedTableRow = PluginConnectionTableRow & {
  catalogItemId: string
  catalogVersionId: string | null
}

export function normalizePluginConnectionRow(
  row: PluginConnectionJoinedTableRow
): PluginConnectionRow {
  return {
    id: row.id,
    installationId: row.installationId,
    workspaceId: row.workspaceId,
    bindingKey: row.bindingKey,
    driver: row.driver,
    externalAccountId: row.externalAccountId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    status: row.status,
    expiresAt: row.expiresAt,
    publicPayload: normalizeJsonObject(
      row.publicPayload,
      "pluginConnection.publicPayload"
    ),
    secretPayload: normalizeJsonObject(
      row.secretPayload,
      "pluginConnection.secretPayload"
    ),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    catalogItemId: row.catalogItemId,
    catalogVersionId: row.catalogVersionId,
  }
}

/**
 * Raw catalog/spec read for an auth flow. Snake_case SELECT aliases rely on
 * CamelCasePlugin to map back (catalog_item_id → catalogItemId), so the raw sql
 * is kept verbatim. Returns the row or null (service throws the 404).
 */
export async function getPluginAuthSpecRow(
  pluginId: string,
  catalogVersionId?: string | null
): Promise<PluginAuthSpecRow | null> {
  const result = await db.executeQuery(
    sql<PluginAuthSpecRowRaw>`SELECT
        item.id AS catalog_item_id,
        version.id AS catalog_version_id,
        spec.default_config,
        spec.auth_bindings
      FROM catalog_items item
      LEFT JOIN catalog_versions version
        ON version.id = COALESCE(${catalogVersionId || null}::uuid, item.latest_version_id)
      LEFT JOIN plugin_package_version_specs spec
        ON spec.catalog_version_id = version.id
      WHERE item.id = ${pluginId}
        AND item.item_kind = 'plugin_package'
      LIMIT 1`.compile(db)
  )
  const row = result.rows[0]
  return row ? normalizePluginAuthSpecRow(row) : null
}

/** Auth session scoped to (id, workspace, member). Returns undefined on miss. */
export async function findPluginAuthSessionRow(
  sessionId: string,
  workspaceId: string,
  workspaceMemberId: string
): Promise<PluginAuthSessionRow | undefined> {
  const row = await db
    .selectFrom("pluginAuthSessions")
    .selectAll()
    .where("id", "=", sessionId)
    .where("workspaceId", "=", workspaceId)
    .where("workspaceMemberId", "=", workspaceMemberId)
    .limit(1)
    .executeTakeFirst()
  return row ? normalizePluginAuthSessionRow(row) : undefined
}

/** Auth session by OAuth `state`. Returns undefined on miss. */
export async function findPluginAuthSessionRowByState(
  state: string
): Promise<PluginAuthSessionRow | undefined> {
  const row = await db
    .selectFrom("pluginAuthSessions")
    .selectAll()
    .where("state", "=", state)
    .limit(1)
    .executeTakeFirst()
  return row ? normalizePluginAuthSessionRow(row) : undefined
}

/**
 * Live auth connection (+ catalog ids) for the resolve path. Live predicate
 * (review F5/F16): a connection resolves only when both it and its parent
 * installation are live (deleted_at IS NULL AND status ∈ liveValues — excludes
 * archived install / expired-revoked connection). Base tables (not _live views)
 * so NOT NULL column types survive. Returns undefined on miss.
 */
export async function findPluginAuthConnectionRow(
  connectionId: string,
  workspaceId?: string
): Promise<PluginConnectionRow | undefined> {
  let builder = db
    .selectFrom("pluginConnections as connection")
    .innerJoin(
      "pluginInstallations as installation",
      "installation.id",
      "connection.installationId"
    )
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "installation.id"
    )
    .selectAll("connection")
    .select(["installation.catalogItemId", "installation.catalogVersionId"])
    .where("connection.id", "=", connectionId)
    .where("connection.deletedAt", "is", null)
    .where("connection.status", "in", PLUGIN_CONNECTION_LIVE_STATUSES)
    .where("resource.deletedAt", "is", null)
    .where("resource.status", "in", PLUGIN_INSTALLATION_LIVE_STATUSES)

  if (workspaceId) {
    builder = builder.where("connection.workspaceId", "=", workspaceId)
  }

  const row = await builder.limit(1).executeTakeFirst()
  return row ? normalizePluginConnectionRow(row) : undefined
}

export type PluginInstallationAuthConfigRow = {
  catalogItemId: string
  catalogVersionId: string
  configData: Record<string, unknown>
  defaultConfig: Record<string, unknown>
}

export type PluginInstallationAuthConfigRowRaw = Omit<
  PluginInstallationAuthConfigRow,
  "configData" | "defaultConfig"
> & {
  configData: unknown
  defaultConfig: unknown
}

export function normalizePluginInstallationAuthConfigRow(
  row: PluginInstallationAuthConfigRowRaw
): PluginInstallationAuthConfigRow {
  return {
    catalogItemId: row.catalogItemId,
    catalogVersionId: row.catalogVersionId,
    configData: normalizeInstallationConfigData(row.configData),
    defaultConfig: normalizeJsonObject(row.defaultConfig, "spec.defaultConfig"),
  }
}

/**
 * Installation config (+ spec default config) for an auth flow. Live predicate
 * (review F16): exclude tombstoned + non-live-status installs. Returns undefined
 * on miss (service throws the 404).
 */
export async function findPluginInstallationAuthConfigRow(
  installationId: string,
  workspaceId: string
): Promise<PluginInstallationAuthConfigRow | undefined> {
  const row = await db
    .selectFrom("pluginInstallations as installation")
    .innerJoin(
      "workspaceResources as resource",
      "resource.id",
      "installation.id"
    )
    .innerJoin(
      "pluginPackageVersionSpecs as spec",
      "spec.catalogVersionId",
      "installation.catalogVersionId"
    )
    .select([
      "installation.catalogItemId",
      "installation.catalogVersionId",
      "installation.configData",
      "spec.defaultConfig",
    ])
    .where("installation.id", "=", installationId)
    .where("resource.workspaceId", "=", workspaceId)
    .where("resource.deletedAt", "is", null)
    .where("resource.status", "in", PLUGIN_INSTALLATION_LIVE_STATUSES)
    .limit(1)
    .executeTakeFirst()

  return row ? normalizePluginInstallationAuthConfigRow(row) : undefined
}

/**
 * Insert a new auth session. `expiresAt` is either a Date the service computed,
 * or the server-clock-authoritative `NOW() + INTERVAL '1 hour'` the OAuth start
 * path relies on (kept as raw sql so Postgres' clock — not the app's — sets it).
 */
export async function insertPluginAuthSession(
  values: Omit<TableInsert<"pluginAuthSessions">, "expiresAt">,
  expiresAt: Date | { kind: "now_plus_1h" }
): Promise<PluginAuthSessionRow> {
  const row = await db
    .insertInto("pluginAuthSessions")
    .values({
      ...values,
      expiresAt:
        "kind" in expiresAt ? sql<Date>`NOW() + INTERVAL '1 hour'` : expiresAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return normalizePluginAuthSessionRow(row)
}

/**
 * Apply a typed patch to one auth session and return the updated row. The
 * service builds each `.set({…})` shape; `TableUpdate` keeps it within the
 * table's updatable columns.
 */
export async function updatePluginAuthSession(
  sessionId: string,
  patch: PluginAuthSessionsUpdate
): Promise<PluginAuthSessionRow> {
  const row = await db
    .updateTable("pluginAuthSessions")
    .set(patch)
    .where("id", "=", sessionId)
    .returningAll()
    .executeTakeFirstOrThrow()
  return normalizePluginAuthSessionRow(row)
}

/**
 * Apply a typed patch to one auth session without reading the row back (mirrors
 * the original fire-and-forget `.execute()` on the callback expire path — it does
 * not require a row to exist).
 */
export async function updatePluginAuthSessionNoReturn(
  sessionId: string,
  patch: PluginAuthSessionsUpdate
): Promise<void> {
  await db
    .updateTable("pluginAuthSessions")
    .set(patch)
    .where("id", "=", sessionId)
    .execute()
}

/** Apply a typed patch to one auth connection (no row returned). */
export async function updatePluginConnection(
  connectionId: string,
  patch: PluginConnectionsUpdate
): Promise<void> {
  await db
    .updateTable("pluginConnections")
    .set(patch)
    .where("id", "=", connectionId)
    .execute()
}

/**
 * QueryRunner contract shared with {@link attachAuthConnectionsToConfig}: a
 * parameterized raw-SQL executor. The service composes its
 * withDbTransaction-bound runner; this default backs the unenrolled path.
 */
export type PluginConnectionQueryRunner = <
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(
  text: string,
  params?: unknown[]
) => Promise<{ rows: T[] }>

/**
 * Default {@link PluginConnectionQueryRunner} backed by the top-level db. The
 * service's attach path runs its raw upsert/consume SQL on whichever runner it
 * is handed (its own trx-bound runner inside withDbTransaction, or this default
 * when called standalone) — so the transaction enrollment decision stays with
 * the caller and is never split across auto-committing repo calls.
 */
export const defaultPluginConnectionRunner: PluginConnectionQueryRunner = <
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(
  text: string,
  params?: unknown[]
) =>
  db
    .executeQuery<T>(CompiledQuery.raw(text, params ? [...params] : []))
    .then((r) => ({ rows: r.rows as T[] }))

export async function upsertPluginAuthConnectionFromSessionResult(input: {
  run: PluginConnectionQueryRunner
  installationId: string
  workspaceId: string
  bindingKey: string
  driver: string
  externalAccountId: string | null
  displayName: string | null
  avatarUrl: string | null
  expiresAt: Date | null
  publicPayload: Record<string, unknown>
  secretPayload: Record<string, unknown>
  sessionId: string
  sessionMetadata: Record<string, unknown>
}): Promise<PluginConnectionRow> {
  const existing = await input.run<PluginConnectionJoinedTableRow>(
    `SELECT
       connection.*,
       installation.catalog_item_id,
       installation.catalog_version_id
     FROM plugin_connections_live connection
     JOIN plugin_installations installation
       ON installation.id = connection.installation_id
     WHERE connection.installation_id = $1
       AND connection.workspace_id = $2
       AND connection.binding_key = $3
       AND connection.external_account_id IS NOT DISTINCT FROM $4
     ORDER BY connection.updated_at DESC
     LIMIT 1`,
    [
      input.installationId,
      input.workspaceId,
      input.bindingKey,
      input.externalAccountId,
    ]
  )

  const connectionRow =
    existing.rows.length > 0
      ? (
          await input.run<PluginConnectionJoinedTableRow>(
            `UPDATE plugin_connections
             SET display_name = $2,
                 avatar_url = $3,
                 status = $4,
                 expires_at = $5,
                 public_payload = $6::jsonb,
                 secret_payload = $7::jsonb
             WHERE id = $1
             RETURNING *,
               (
                 SELECT catalog_item_id
                 FROM plugin_installations
                 WHERE id = plugin_connections.installation_id
               ) AS catalog_item_id,
               (
                 SELECT catalog_version_id
                 FROM plugin_installations
                 WHERE id = plugin_connections.installation_id
               ) AS catalog_version_id`,
            [
              existing.rows[0]!.id,
              input.displayName,
              input.avatarUrl,
              PLUGIN_AUTH_CONNECTION_STATUS.ACTIVE,
              input.expiresAt,
              JSON.stringify(input.publicPayload),
              JSON.stringify(input.secretPayload),
            ]
          )
        ).rows[0]!
      : (
          await input.run<PluginConnectionJoinedTableRow>(
            `INSERT INTO plugin_connections (
               installation_id,
               workspace_id,
               binding_key,
               driver,
               external_account_id,
               display_name,
               avatar_url,
               status,
               expires_at,
               public_payload,
               secret_payload
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb
             )
             RETURNING *,
               (
                 SELECT catalog_item_id
                 FROM plugin_installations
                 WHERE id = plugin_connections.installation_id
               ) AS catalog_item_id,
               (
                 SELECT catalog_version_id
                 FROM plugin_installations
                 WHERE id = plugin_connections.installation_id
               ) AS catalog_version_id`,
            [
              input.installationId,
              input.workspaceId,
              input.bindingKey,
              input.driver,
              input.externalAccountId,
              input.displayName,
              input.avatarUrl,
              PLUGIN_AUTH_CONNECTION_STATUS.ACTIVE,
              input.expiresAt,
              JSON.stringify(input.publicPayload),
              JSON.stringify(input.secretPayload),
            ]
          )
        ).rows[0]!

  await input.run(
    `UPDATE plugin_auth_sessions
     SET status = $2,
         metadata = $3::jsonb
     WHERE id = $1`,
    [
      input.sessionId,
      PLUGIN_AUTH_SESSION_STATUS.CONSUMED,
      JSON.stringify({
        ...input.sessionMetadata,
        consumedConnectionId: connectionRow.id,
      }),
    ]
  )

  return normalizePluginConnectionRow(connectionRow)
}
