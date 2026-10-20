-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE platform_access_bindings_access_key AS ENUM ('super_admin', 'workspace_admin', 'model_admin', 'support');
CREATE TYPE platform_access_bindings_source AS ENUM ('config', 'manual');
CREATE TYPE workspace_members_trust_level AS ENUM ('admin', 'member', 'guest');
-- soft-delete: workspace_members is a single durable identity row; leaving /
-- removal flip status (member id is stable, re-join revives). See
-- docs/soft-delete-design.md §6.
CREATE TYPE workspace_members_status AS ENUM ('active', 'left', 'removed');
-- soft-delete: composite-PK access binding tables flip status instead of being
-- hard-deleted on revoke; re-grant revives the row (design §6.2 option A).
CREATE TYPE access_binding_status AS ENUM ('active', 'revoked');
CREATE TYPE workspace_access_bindings_access_key AS ENUM ('model_admin', 'actor_admin', 'remote_agent_admin', 'skill_admin', 'plugin_admin', 'memory_admin', 'device_admin', 'conversation_admin', 'automation_admin');
CREATE TYPE workspace_invites_trust_level AS ENUM ('admin', 'member', 'guest');
CREATE TYPE conversations_kind AS ENUM ('direct', 'group');
CREATE TYPE file_content_kind AS ENUM ('image', 'audio', 'video', 'document');
CREATE TYPE file_origin_family AS ENUM ('user_upload', 'actor_output', 'tool_output', 'model_output', 'external_import', 'package_import', 'system_generated', 'platform_asset');
CREATE TYPE file_parse_run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped');
CREATE TYPE file_parse_output_kind AS ENUM ('text', 'structured_json', 'derived_file');
CREATE TYPE file_snapshot_reason AS ENUM ('session_commit', 'manual', 'import', 'gc_root');
CREATE TYPE file_permission AS ENUM ('read', 'write', 'admin');
CREATE TYPE file_access_grants_status AS ENUM ('active', 'revoked', 'superseded');
-- 'recovering' is a durable LEASE (R6 H-2): a 'failed' recoverable mount a recovery
-- sweep has CLAIMED (CAS 'failed'→'recovering' under FOR UPDATE SKIP LOCKED) so only
-- one worker/replica re-pulls its VM. It is NOT a live mount (excluded from the active
-- partial-unique + live-sandbox indexes, like 'failed'/'closed') but IS still failed-
-- recoverable (keepalive + the #4 defer keep its sole-source VM alive). A crashed
-- worker's stale 'recovering' lease is re-claimed once updated_at ages past the TTL.
CREATE TYPE file_mount_status AS ENUM ('provisioning', 'active', 'closed', 'failed', 'recovering');
-- NOTE: content_blobs.backend is plain TEXT (no per-backend CHECK) — the backend
-- set is deployment config, validated at the app write boundary (see the table
-- def + content-storage-multi-backend-plan §7). key = f(sha), so no per-blob locator.
CREATE TYPE workspace_resources_kind AS ENUM ('plugin_installation', 'installed_skill', 'actor', 'remote_agent', 'runtime_capability', 'automation_event_source');
CREATE TYPE workspace_resources_status AS ENUM ('active', 'disabled', 'error', 'deprecated', 'archived');
CREATE TYPE workspace_resource_grants_status AS ENUM ('active', 'revoked');
CREATE TYPE workspace_resource_grants_source AS ENUM ('manual', 'approval', 'system');
CREATE TYPE workspace_resource_grant_permission AS ENUM ('use', 'manage', 'contact_visible');
CREATE TYPE workspace_resource_grant_requests_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE realtime_event_outbox_status AS ENUM ('pending', 'processing', 'dispatched', 'failed');
CREATE TYPE catalog_categories_item_kind AS ENUM ('actor_template', 'skill_package', 'plugin_package');
CREATE TYPE catalog_items_item_kind AS ENUM ('actor_template', 'skill_package', 'plugin_package');
CREATE TYPE catalog_items_source_kind AS ENUM ('builtin', 'official', 'workspace', 'user');
CREATE TYPE catalog_items_visibility AS ENUM ('public', 'workspace', 'private');
CREATE TYPE catalog_versions_status AS ENUM ('draft', 'active', 'deprecated', 'archived');
CREATE TYPE catalog_version_files_file_role AS ENUM ('document', 'reference', 'script', 'image', 'json', 'binary');
CREATE TYPE plugin_package_version_specs_transport AS ENUM ('builtin', 'stdio', 'http', 'sse');
CREATE TYPE plugin_package_version_specs_default_reuse_scope AS ENUM ('turn', 'session', 'workspace', 'conversation', 'actor');
CREATE TYPE actors_role AS ENUM ('secretary', 'manager', 'specialist', 'reviewer', 'archivist', 'receptionist', 'assistant');
CREATE TYPE remote_agents_runtime_kind AS ENUM ('claude_code', 'codex', 'pi', 'opencode');
CREATE TYPE remote_agent_machines_trust_status AS ENUM ('pending', 'active', 'revoked', 'blocked');
CREATE TYPE remote_agent_machines_lifecycle_state AS ENUM ('online', 'offline');
CREATE TYPE remote_agent_machine_sessions_status AS ENUM ('connecting', 'active', 'closing', 'closed', 'rejected');
CREATE TYPE remote_agent_machine_sessions_transport AS ENUM ('websocket');
CREATE TYPE remote_agent_bindings_status AS ENUM ('active', 'disabled', 'error');
CREATE TYPE remote_agent_bindings_runtime_state AS ENUM ('offline', 'idle', 'running', 'waiting_user_input', 'plan_drafting', 'waiting_plan_approval', 'error');
CREATE TYPE remote_agent_runs_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE remote_agent_message_deliveries_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE remote_agent_runtime_catalog_status AS ENUM ('available', 'missing_binary', 'broken_path', 'unsupported_platform', 'runtime_error');
CREATE TYPE relationship_approval_mode AS ENUM ('auto', 'manual');
CREATE TYPE relationship_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE actor_versions_source_type AS ENUM ('workspace_member', 'actor', 'system', 'sync');
CREATE TYPE actor_version_docs_visibility AS ENUM ('always', 'direct_only', 'multi_member_only', 'internal_only');
CREATE TYPE actor_source_refs_sync_mode AS ENUM ('notify', 'manual_merge', 'follow_upstream', 'detached');
CREATE TYPE model_groups_owner_type AS ENUM ('platform', 'workspace', 'workspace_member');
CREATE TYPE model_groups_routing_strategy AS ENUM ('weighted_random', 'priority_failover');
CREATE TYPE model_group_grants_status AS ENUM ('active', 'revoked');
CREATE TYPE sessions_status AS ENUM ('idle', 'queued', 'running', 'blocked', 'closed');
CREATE TYPE sessions_collaboration_mode AS ENUM ('default', 'plan_drafting', 'plan_awaiting_approval');
CREATE TYPE conversation_participants_state AS ENUM ('active', 'left', 'removed');
CREATE TYPE subject_kind AS ENUM (
  'workspace',
  'workspace_member',
  'actor',
  'remote_agent',
  'conversation',
  'user',
  'external',
  'platform'
);
CREATE TYPE chat_client_instances_status AS ENUM ('active', 'revoked');
CREATE TYPE transport_accounts_transport_kind AS ENUM ('feishu', 'weixin', 'wecom', 'dingtalk', 'qq', 'telegram', 'whatsapp', 'whatsapp_unofficial');
CREATE TYPE transport_accounts_owner_scope AS ENUM ('workspace', 'workspace_member');
CREATE TYPE transport_accounts_inbound_actor_mode AS ENUM ('none', 'specified_actor', 'follow_owner_chief_actor');
CREATE TYPE transport_accounts_connection_mode AS ENUM ('webhook', 'long_connection');
CREATE TYPE transport_accounts_status AS ENUM ('active', 'disabled', 'error');
CREATE TYPE transport_endpoints_endpoint_type AS ENUM ('direct', 'group');
CREATE TYPE conversation_transport_bindings_inbound_actor_mode AS ENUM ('inherit_account', 'none', 'specified_actor');
CREATE TYPE transport_addresses_transport_kind AS ENUM ('feishu', 'weixin', 'wecom', 'dingtalk', 'qq', 'telegram', 'whatsapp', 'whatsapp_unofficial');
CREATE TYPE transport_addresses_address_type AS ENUM ('user', 'bot', 'system');
CREATE TYPE conversation_items_scope AS ENUM ('shared', 'private');
CREATE TYPE conversation_items_surface AS ENUM ('visible', 'internal');
CREATE TYPE conversation_items_item_type AS ENUM ('message', 'event', 'summary', 'control');
CREATE TYPE conversation_items_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE conversation_items_event_timeline_policy AS ENUM ('none', 'all_members', 'users_only', 'actors_only', 'targeted_members');
CREATE TYPE conversation_items_event_context_policy AS ENUM ('none', 'shared', 'actor_private', 'targeted_members');
CREATE TYPE conversation_item_parts_part_type AS ENUM ('text', 'file_ref', 'json');
CREATE TYPE conversation_item_targets_target_kind AS ENUM ('to', 'cc', 'visible');
CREATE TYPE transport_message_links_transport_kind AS ENUM ('feishu', 'weixin', 'wecom', 'dingtalk', 'qq', 'telegram', 'whatsapp', 'whatsapp_unofficial');
CREATE TYPE transport_message_links_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE transport_message_links_delivery_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
CREATE TYPE turns_status AS ENUM ('running', 'completed', 'failed', 'cancelled');
CREATE TYPE payload_blobs_content_type AS ENUM ('json', 'text');
CREATE TYPE payload_blobs_retention_class AS ENUM ('ephemeral', 'debug', 'audit');
CREATE TYPE provider_steps_request_type AS ENUM ('actor_think', 'ai_complete');
CREATE TYPE provider_steps_status AS ENUM ('success', 'error', 'timeout');
-- Routed source family (tool provenance & routing refactor).
CREATE TYPE tool_calls_source_kind AS ENUM ('system', 'plugin', 'runtime');
CREATE TYPE tool_calls_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
-- ── Task unification (docs/task-unification-design.md) ──────────────────────
-- A Task is "everything a principal (actor or remote agent) waits on", modelled
-- on three ORTHOGONAL axes:
--   executor_kind  — where the result comes from
--   delivery_kind  — how the blocked waiter (agent) is woken
--   human_surface  — whether a human sees/answers it (gates the chat-feed card)
-- plus a lifecycle ⟂ outcome split (lifecycle = pure state machine the agent
-- polls; outcome = business verdict, set only on `completed`).
CREATE TYPE tool_call_tasks_executor_kind AS ENUM ('user_input', 'plan_approval', 'runtime_authorization', 'runtime_tool', 'external_mcp');
CREATE TYPE tool_call_tasks_delivery_kind AS ENUM ('session_wakeup', 'remote_agent_channel', 'none');
CREATE TYPE tool_call_tasks_human_surface AS ENUM ('needs_response', 'silent');
-- Pure lifecycle state machine. submitted? → working ⇄ input_required ⇄
-- auth_required → {completed | failed | cancelled | expired}. Terminals are
-- irreversible (SQL-predicate guarded).
CREATE TYPE tool_call_tasks_lifecycle_status AS ENUM ('submitted', 'working', 'input_required', 'auth_required', 'completed', 'failed', 'cancelled', 'expired');
-- Business verdict, NULL unless lifecycle_status='completed'. Discriminated by
-- executor_kind: human_input→answered; plan_approval→approved|revision_requested;
-- runtime_authorization→granted|denied; device_tool/external_mcp→ok|tool_error.
CREATE TYPE tool_call_tasks_outcome AS ENUM ('answered', 'approved', 'revision_requested', 'granted', 'denied', 'ok', 'tool_error');
-- Transport sub-state for device tasks (queued/dispatched/received/started/
-- output_streaming) lives on the runtime_operations ledger, NOT on the task.
CREATE TYPE tool_call_task_output_chunks_stream AS ENUM ('stdout', 'stderr', 'system');
CREATE TYPE tool_execution_attempts_status AS ENUM ('success', 'error', 'timeout');
CREATE TYPE tool_result_parts_part_type AS ENUM ('text', 'file_ref', 'json');
CREATE TYPE session_wakeups_source_type AS ENUM ('user_message', 'actor_message', 'automation', 'system_interrupt', 'retry');
CREATE TYPE session_wakeups_source_participant_type AS ENUM ('workspace_member', 'actor', 'remote_agent', 'external', 'system');
CREATE TYPE session_wakeups_status AS ENUM ('pending', 'attached', 'processed', 'dropped');
CREATE TYPE automation_rules_category AS ENUM ('schedule', 'event_subscription');
CREATE TYPE automation_rules_status AS ENUM ('active', 'paused', 'error', 'archived', 'completed', 'expired');
CREATE TYPE automation_policies_completion_status AS ENUM ('completed', 'archived');
CREATE TYPE automation_event_sources_provider_kind AS ENUM ('device', 'webhook', 'internal', 'integration');
CREATE TYPE automation_triggers_trigger_kind AS ENUM ('schedule', 'event');
CREATE TYPE automation_triggers_source_kind AS ENUM ('clock', 'device', 'webhook', 'internal', 'integration');
CREATE TYPE automation_triggers_schedule_kind AS ENUM ('cron', 'at', 'interval');
CREATE TYPE automation_deliveries_target_policy AS ENUM ('all_members', 'specified_members');
CREATE TYPE automation_webhook_endpoints_status AS ENUM ('active', 'disabled', 'archived');
CREATE TYPE automation_occurrences_source_kind AS ENUM ('clock', 'device', 'webhook', 'internal', 'integration');
CREATE TYPE automation_executions_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
CREATE TYPE automation_execution_targets_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
-- subject-scope-refactor D4: memory_spaces_space_type enum dropped at cutover.
-- Replaced by (owner_subject_id, scope_subject_id?, namespace_key) triple.
-- See `CREATE TABLE memory_spaces` further down for the new shape.
CREATE TYPE memory_permission AS ENUM ('read','recall','write','edit','delete','manage');
CREATE TYPE memory_access_grants_status AS ENUM ('active','revoked','superseded');
CREATE TYPE memory_items_category AS ENUM ('fact', 'preference', 'decision', 'relationship', 'procedure', 'artifact', 'summary');
CREATE TYPE memory_items_state AS ENUM ('active', 'superseded', 'archived');
CREATE TYPE memory_items_index_status AS ENUM ('lexical_ready', 'ready', 'failed');
CREATE TYPE memory_item_parts_part_type AS ENUM ('text', 'file_ref', 'json');
CREATE TYPE memory_recall_runs_recall_type AS ENUM ('bootstrap', 'turn_recall', 'manual_search');
CREATE TYPE context_archive_points_chain_scope AS ENUM ('shared', 'private');
CREATE TYPE context_archive_frames_role AS ENUM ('system', 'user', 'assistant', 'tool');
CREATE TYPE context_archive_frame_parts_part_type AS ENUM ('text', 'file_ref', 'json');
CREATE TYPE context_compaction_runs_chain_scope AS ENUM ('shared', 'private');
CREATE TYPE context_compaction_runs_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE context_compaction_run_inputs_input_kind AS ENUM ('archive_point', 'sequence_range', 'item');
CREATE TYPE session_interrupts_type AS ENUM ('remote_control_terminated');
CREATE TYPE runtime_events_source AS ENUM ('conversation', 'provider', 'tool', 'device', 'system');
CREATE TYPE runtime_events_level AS ENUM ('debug', 'info', 'warn', 'error');
CREATE TYPE skill_source_refs_sync_mode AS ENUM ('notify', 'manual_merge', 'follow_upstream', 'detached');
CREATE TYPE skill_mirror_sources_source_type AS ENUM ('github', 'clawhub');
CREATE TYPE skill_mirror_sources_refresh_mode AS ENUM ('manual');
CREATE TYPE skill_mirror_sources_sync_status AS ENUM ('pending', 'synced', 'error');
CREATE TYPE plugin_installations_reuse_scope AS ENUM ('turn', 'session', 'workspace', 'conversation', 'actor');
CREATE TYPE automation_integration_bindings_provider AS ENUM ('github', 'gitlab');
CREATE TYPE automation_integration_bindings_ingress_kind AS ENUM ('webhook', 'polling');
CREATE TYPE automation_integration_bindings_target_kind AS ENUM ('repository', 'project');
CREATE TYPE plugin_auth_sessions_status AS ENUM ('pending', 'completed', 'failed', 'expired', 'consumed');
CREATE TYPE plugin_connections_status AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE plugin_source_refs_sync_mode AS ENUM ('notify', 'manual_merge', 'follow_upstream', 'detached');
-- Runtime authorization enums (renamed from relay_* in PR #20). These back the
-- runtime_authorization_grants + tool_call_task_runtime_authorization (detail)
-- tables and the matching shared enum re-exports.
-- (tool_call_tasks_kind / tool_call_tasks_status removed in the task
-- unification: kind → tool_call_tasks_executor_kind; status → lifecycle_status
-- ⟂ outcome.)
CREATE TYPE runtime_authorization_request_mode AS ENUM ('background', 'blocking');
-- Runtime authorization grant scope enum dropped at subject-scope-refactor cutover.
-- Scope is now expressed by `runtime_authorization_grants.subject_id + scope_subject_id`
-- (two FK columns into access_subjects). UI/auto-retry derive the display label via
-- `subjectScopeLabel(target)` in packages/shared/src/access/subject.ts.
CREATE TYPE runtime_authorization_grants_retention AS ENUM ('consume_once', 'until_revoked');
CREATE TYPE runtime_authorization_grants_status AS ENUM ('active', 'consumed', 'revoked', 'superseded');

-- ============ Device Runtime v3 enum types ============
-- See docs/device-runtime-v3.md §3 and §6. relay_* enums were dropped at
-- the v3 cutover (PR #1); only the device_* enum types live here.
CREATE TYPE devices_device_type AS ENUM (
  'desktop_computer', 'laptop_computer', 'mobile_phone', 'tablet',
  'server', 'virtual_machine', 'custom'
);
CREATE TYPE devices_trust_status AS ENUM ('pending', 'trusted', 'revoked');
CREATE TYPE devices_automation_lifecycle_state AS ENUM ('online', 'offline');
-- soft-delete: distinguishes long-lived registered devices (soft-deletable via
-- markDeviceDeleted) from per-session sandbox devices (soft-close, records kept;
-- see docs/soft-delete-design.md §5.3). source_session_id is a pure marker.
CREATE TYPE runtime_services_service_kind AS ENUM ('device_runtime', 'remote_agent_daemon', 'bare_dataplane');
CREATE TYPE runtime_services_status AS ENUM ('starting', 'online', 'degraded', 'offline');
-- Data-plane reachability class (§3 dual-transport). 'indirect' = runtime dials a
-- reverse tunnel back (frp) and the API dials the edge; 'direct' = the API dials the
-- runtime (loopback / docker-internal DNS / provider domain, or the degenerate
-- in-process / docker-exec bare planes that are never network-dialed); 'none' =
-- CP-only, no data plane registered (registry-miss dispatch is a hard error, preserved).
CREATE TYPE runtime_services_transport AS ENUM ('direct', 'indirect', 'none');
CREATE TYPE runtime_control_plane_sessions_status AS ENUM ('connecting', 'active', 'closing', 'closed', 'rejected');
CREATE TYPE runtime_control_plane_sessions_transport AS ENUM ('websocket');
CREATE TYPE runtime_pairing_sessions_mode AS ENUM ('local_qr', 'cloud_bootstrap');
CREATE TYPE runtime_pairing_sessions_status AS ENUM ('pending', 'confirmed', 'consumed', 'expired', 'cancelled', 'rejected');
CREATE TYPE runtime_exposures_transport AS ENUM ('builtin', 'stdio', 'http', 'sse', 'custom');
CREATE TYPE runtime_exposures_builtin_kind AS ENUM ('filesystem', 'commandline', 'browser', 'cua');
CREATE TYPE runtime_exposures_runtime_status AS ENUM (
  'discovered', 'healthy', 'degraded', 'failed', 'quarantined', 'offline'
);
CREATE TYPE runtime_catalog_revisions_status AS ENUM ('active', 'superseded', 'invalid');
CREATE TYPE runtime_tools_status AS ENUM ('active', 'hidden', 'removed');
CREATE TYPE runtime_operations_task_mode AS ENUM ('sync', 'async');
CREATE TYPE runtime_operations_status AS ENUM (
  'created', 'dispatched', 'awaiting_authorization', 'received', 'started',
  'output_streaming', 'succeeded', 'failed', 'cancelled', 'expired'
);
CREATE TYPE runtime_operations_principal_kind AS ENUM (
  'actor', 'conversation', 'remote_agent', 'workspace_member'
);
CREATE TYPE runtime_operation_attempts_transport AS ENUM ('mcp_http', 'control_plane_task', 'data_plane');
CREATE TYPE runtime_operation_attempts_status AS ENUM (
  'issued', 'sent', 'response_received', 'acknowledged', 'failed', 'abandoned'
);
CREATE TYPE runtime_sessions_status AS ENUM ('open', 'closing', 'closed', 'aborted');
CREATE TYPE runtime_session_services_status AS ENUM ('open', 'closed');

-- ============ Runtime supertype (CTI) — device + sandbox generalization ============
-- `runtimes` is the class-table-inheritance root; `devices` (kind='device') and
-- `sandboxes` (kind='sandbox') are its detail tables. It is the SOLE soft-delete
-- root for the whole runtime (details inherit liveness via sd_fk_live_*_id).
CREATE TYPE runtimes_kind   AS ENUM ('device', 'sandbox');
CREATE TYPE sandboxes_mode  AS ENUM ('resident', 'bare');
CREATE TYPE sandboxes_state AS ENUM ('provisioning', 'active', 'closing', 'closed', 'failed');

-- ============ Users ============
-- Account/identity model is provided by Better Auth (better-auth@1.6.13). The
-- four BA core tables (users/account/session/verification) plus the
-- device_code table (deviceAuthorization plugin) are hand-written here in
-- snake_case and Better Auth is configured (modelName + per-field `fields`) to
-- map onto them. BA never auto-migrates at runtime, so this single schema.sql
-- stays the source of truth. generateId:false => BA omits `id` on INSERT, so
-- every BA table's id MUST carry a DB-side DEFAULT uuid_generate_v4().
-- Password lives in `account` (credential provider), NOT on users.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- BA core `image` (avatar URL from OAuth providers). Kept separate from
  -- avatar_file_id (Synapse's generated-avatar file id) on purpose: URL vs UUID.
  image TEXT,
  avatar_file_id UUID,
  -- Feishu identity surfaced onto the user row via BA additionalFields
  -- (account.account_id holds the stable union_id; these are convenience copies).
  feishu_open_id VARCHAR(255),
  feishu_union_id VARCHAR(255),
  feishu_tenant_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============ Better Auth: account (sign-in methods + provider tokens) ============
-- One row per (provider_id, account_id). For the credential provider,
-- account_id = users.id and `password` holds the BA scrypt hash. For OAuth
-- providers (feishu), account_id = the provider's stable subject (union_id) and
-- the *_token columns hold the (encrypted) provider tokens.
CREATE TABLE account (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_account_provider_account UNIQUE (provider_id, account_id)
);

CREATE INDEX idx_account_user ON account(user_id);

-- ============ Better Auth: session ============
CREATE TABLE session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_user ON session(user_id);
CREATE INDEX idx_session_token ON session(token);

-- ============ Better Auth: verification (email/token verification) ============
CREATE TABLE verification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_identifier ON verification(identifier);

-- ============ Better Auth: device_code (deviceAuthorization, RFC 8628) ============
-- Backs cross-device QR login: web shows verification_uri_complete (encoding
-- user_code) as a QR, an already-authenticated mobile device claims+approves it.
CREATE TABLE device_code (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_code TEXT NOT NULL,
  user_code TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  last_polled_at TIMESTAMPTZ,
  polling_interval INT,
  client_id TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_code_device_code UNIQUE (device_code),
  CONSTRAINT uq_device_code_user_code UNIQUE (user_code)
);

CREATE INDEX idx_device_code_expires ON device_code(expires_at);

-- ============ Workspaces ============
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);

CREATE TABLE platform_access_bindings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  access_key platform_access_bindings_access_key NOT NULL,
  source platform_access_bindings_source NOT NULL DEFAULT 'manual',
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, access_key)
);

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trust_level workspace_members_trust_level NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE workspace_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  kind workspace_resources_kind NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  -- owner_subject_id / created_by_subject_id both FK into access_subjects via a
  -- deferred ALTER (added after access_subjects is defined), ON DELETE RESTRICT.
  owner_subject_id UUID,
  created_by_subject_id UUID NOT NULL,
  status workspace_resources_status NOT NULL DEFAULT 'active',
  conversation_type_mask_override INT
    CHECK (conversation_type_mask_override IS NULL OR (conversation_type_mask_override > 0 AND conversation_type_mask_override <= 15)),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id, workspace_id)
);

CREATE INDEX idx_workspace_resources_workspace ON workspace_resources(workspace_id, kind, created_at DESC);
CREATE INDEX idx_workspace_resources_owner ON workspace_resources(owner_subject_id, created_at DESC)
  WHERE owner_subject_id IS NOT NULL;

CREATE TABLE workspace_access_bindings (
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  access_key workspace_access_bindings_access_key NOT NULL,
  assigned_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_member_id, access_key)
);

CREATE TABLE workspace_capability_conversation_type_policies (
  -- P1b: workspace_id collapsed into subject_id (always kind='workspace') so
  -- this table participates in the same subject registry as other access-side
  -- tables. Deferred FK to access_subjects is added after access_subjects is
  -- defined.
  subject_id UUID NOT NULL,
  resource_family VARCHAR(60) NOT NULL
    CHECK (resource_family IN ('plugin_installation', 'installed_skill', 'runtime_capability')),
  default_conversation_type_mask INT NOT NULL
    CHECK (default_conversation_type_mask > 0 AND default_conversation_type_mask <= 15),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subject_id, resource_family)
);

CREATE TABLE workspace_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  token VARCHAR(12) UNIQUE NOT NULL,
  created_by_workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  trust_level workspace_invites_trust_level NOT NULL DEFAULT 'member',
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Conversations ============
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind conversations_kind NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  title VARCHAR(500),
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- IM-ness is derived from the presence of a conversation_transport_bindings
  -- row (see hasConversationTransportBinding); there is no stored boundary axis.
  -- Every conversation is workspace-scoped (workspace_id NOT NULL). The
  -- (id, workspace_id) UNIQUE is the target for composite FKs that enforce the
  -- same-workspace invariant on transport bindings and conversation subjects.
  CONSTRAINT uq_conversations_id_workspace UNIQUE (id, workspace_id)
);

CREATE INDEX idx_conversations_kind ON conversations(kind, created_at DESC);
CREATE INDEX idx_conversations_workspace
  ON conversations(workspace_id, created_at DESC);

-- ============ Files (content-addressed) ============
-- file-service refactor: unified content-addressed store shared by the by-id
-- asset library (file_assets, below) AND the by-path working-tree snapshots
-- (file_snapshots, defined later after access_subjects). A blob's identity IS
-- its sha256; the same sha256 is one physical blob regardless of how many
-- logical paths/assets point at it (zero-copy publish/pull). The scope layer
-- (file_spaces / file_access_grants / file_mounts) lives in the late section
-- because it references access_subjects + the scope-validation helpers.

CREATE TABLE content_blobs (
  -- sha256 hex IS the primary key — the CAS path is derived from it
  -- (blobs/<aa>/<sha256>), so there is no separate surrogate id and no
  -- storage_key (that's what makes publish/pull a pure reference change).
  sha256 VARCHAR(64) PRIMARY KEY,
  size_bytes BIGINT NOT NULL,
  -- TEXT, NO per-backend CHECK: the backend set is DEPLOYMENT CONFIG, validated
  -- at the app write boundary against the configured registry (plan §7#1) — not a
  -- schema migration per backend. key is ALWAYS f(sha) (blobs/<aa>/<sha>), so
  -- there is NO per-blob locator — the old locator_json JSONB was DROPPED;
  -- bucket/region/endpoint live in the config registry (plan §6.2/§7#2).
  backend TEXT NOT NULL DEFAULT 'local_cas',
  -- Set when the bytes are confirmed durable: NOW at landing for local_cas; after
  -- the remote PUT confirms for remote backends. First-class column (not JSONB)
  -- that gates durable-GC grace + the persistence check (plan §7#3).
  durable_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: deliberately NO mime_type/name here — the same bytes can be a PDF
  -- named "report.pdf" in one context and an attachment named "q3.pdf" in
  -- another. MIME/name live on the referencing row (file_assets) or are
  -- inferred from the path by the content resolver.
);

-- Persistent-tier GC enumerates only remote-backed rows (plan §7#5); local_cas
-- rows are swept by the Rust fs-helper against the local CAS dir, not by SQL.
CREATE INDEX content_blobs_remote_backend_idx
  ON content_blobs (backend) WHERE backend <> 'local_cas';

-- The by-id asset library: stable entity assets (avatars, icons, skill
-- icons) + any "produced file" that needs an addressable id. Folds the old
-- files + file_origins (1:1) into one row. The asset's "current bytes"
-- pointer is `content_sha256`; re-pointing it (zero-copy) is publish/pull.
CREATE TABLE file_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  content_sha256 VARCHAR(64) NOT NULL REFERENCES content_blobs(sha256) ON DELETE RESTRICT,
  original_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  content_kind file_content_kind NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploader_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- provenance (folded from file_origins). initiator_actor_id has no FK by
  -- convention (matches the old file_origins shape).
  initiator_actor_id UUID,
  source_family file_origin_family NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  parent_asset_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  details_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE file_parse_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
  pipeline VARCHAR(100) NOT NULL,
  parser_key VARCHAR(100) NOT NULL,
  parser_version VARCHAR(50),
  trigger VARCHAR(50) NOT NULL,
  status file_parse_run_status NOT NULL DEFAULT 'pending',
  error_code VARCHAR(100),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE file_parse_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES file_parse_runs(id) ON DELETE RESTRICT,
  output_kind file_parse_output_kind NOT NULL,
  role VARCHAR(100) NOT NULL,
  text_content TEXT,
  structured_json JSONB NOT NULL DEFAULT '{}',
  derived_asset_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_file_assets_workspace ON file_assets(workspace_id, created_at DESC);
CREATE INDEX idx_file_assets_uploader ON file_assets(uploader_user_id, created_at DESC);
CREATE INDEX idx_file_assets_content ON file_assets(content_sha256);
CREATE INDEX idx_file_assets_origin ON file_assets(source_family, source_system, created_at DESC);
CREATE INDEX idx_file_assets_parent ON file_assets(parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX idx_file_parse_runs_asset ON file_parse_runs(asset_id, created_at DESC);
CREATE INDEX idx_file_parse_runs_status ON file_parse_runs(status, created_at DESC);
CREATE INDEX idx_file_parse_outputs_run ON file_parse_outputs(run_id, created_at);

ALTER TABLE users
  ADD CONSTRAINT users_avatar_file_id_fkey
  FOREIGN KEY (avatar_file_id) REFERENCES file_assets(id) ON DELETE SET NULL;

CREATE TABLE realtime_event_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  recipient_workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}',
  event_timestamp TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status realtime_event_outbox_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processing_started_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_realtime_event_outbox_status
  ON realtime_event_outbox(status, available_at, created_at);
CREATE INDEX idx_realtime_event_outbox_workspace
  ON realtime_event_outbox(workspace_id, event_timestamp DESC, created_at DESC);
CREATE INDEX idx_realtime_event_outbox_recipient
  ON realtime_event_outbox(recipient_workspace_member_id, event_timestamp DESC, created_at DESC);

-- ============ Skill Content ============
CREATE TABLE skill_mirror_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type skill_mirror_sources_source_type NOT NULL,
  locator_key TEXT NOT NULL,
  locator JSONB NOT NULL DEFAULT '{}',
  requested_ref VARCHAR(255),
  resolved_revision VARCHAR(255),
  refresh_mode skill_mirror_sources_refresh_mode NOT NULL DEFAULT 'manual',
  last_sync_status skill_mirror_sources_sync_status NOT NULL DEFAULT 'pending',
  source_warnings TEXT[] NOT NULL DEFAULT '{}',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_type, locator_key)
);

CREATE INDEX idx_skill_mirror_sources_sync
  ON skill_mirror_sources(source_type, last_sync_status, updated_at DESC);

CREATE TABLE skill_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mirror_source_id UUID REFERENCES skill_mirror_sources(id) ON DELETE SET NULL,
  entry_path TEXT NOT NULL DEFAULT 'SKILL.md',
  name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  argument_hint VARCHAR(255),
  disable_model_invocation BOOLEAN NOT NULL DEFAULT FALSE,
  user_invocable BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  model VARCHAR(255),
  effort VARCHAR(16)
    CHECK (effort IS NULL OR effort IN ('low', 'medium', 'high', 'max')),
  context VARCHAR(16)
    CHECK (context IS NULL OR context IN ('fork')),
  agent VARCHAR(255),
  hooks JSONB NOT NULL DEFAULT '{}',
  body_blocks JSONB NOT NULL DEFAULT '[]',
  content_hash VARCHAR(64) NOT NULL,
  source_warnings TEXT[] NOT NULL DEFAULT '{}',
  resolved_revision VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skill_snapshots_mirror_source
  ON skill_snapshots(mirror_source_id, created_at DESC);
CREATE INDEX idx_skill_snapshots_content_hash
  ON skill_snapshots(content_hash);

CREATE TABLE skill_snapshot_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_snapshot_id UUID NOT NULL REFERENCES skill_snapshots(id) ON DELETE RESTRICT,
  path TEXT NOT NULL,
  media_type VARCHAR(255),
  content_blocks JSONB NOT NULL DEFAULT '[]',
  sha256 VARCHAR(64) NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_snapshot_id, path)
);

CREATE INDEX idx_skill_snapshot_files_snapshot
  ON skill_snapshot_files(skill_snapshot_id, path);

-- ============ Catalog Core ============
CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  logo_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  is_builtin BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE catalog_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) NOT NULL,
  item_kind catalog_categories_item_kind NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  icon_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_kind, slug)
);

CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  item_kind catalog_items_item_kind NOT NULL,
  slug VARCHAR(120) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  summary TEXT DEFAULT '',
  long_description TEXT DEFAULT '',
  icon_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  mirror_source_id UUID REFERENCES skill_mirror_sources(id) ON DELETE SET NULL,
  source_kind catalog_items_source_kind NOT NULL DEFAULT 'official',
  visibility catalog_items_visibility NOT NULL DEFAULT 'public',
  tags TEXT[] DEFAULT '{}',
  latest_version_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  download_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_catalog_items_global_slug
  ON catalog_items(publisher_id, item_kind, slug)
  WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX uq_catalog_items_workspace_slug
  ON catalog_items(publisher_id, workspace_id, item_kind, slug)
  WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX uq_catalog_items_mirror_source
  ON catalog_items(mirror_source_id)
  WHERE mirror_source_id IS NOT NULL;
CREATE INDEX idx_catalog_items_kind ON catalog_items(item_kind, created_at DESC);
CREATE INDEX idx_catalog_items_workspace ON catalog_items(workspace_id, item_kind, created_at DESC);
CREATE INDEX idx_catalog_items_tags ON catalog_items USING GIN(tags);

CREATE TABLE catalog_item_categories (
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (catalog_item_id, category_id)
);

CREATE TABLE catalog_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  version VARCHAR(80) NOT NULL,
  status catalog_versions_status NOT NULL DEFAULT 'active',
  changelog TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(catalog_item_id, version)
);

CREATE INDEX idx_catalog_versions_item ON catalog_versions(catalog_item_id, created_at DESC);

ALTER TABLE catalog_items
  ADD CONSTRAINT fk_catalog_items_latest_version
  FOREIGN KEY (latest_version_id) REFERENCES catalog_versions(id) ON DELETE SET NULL;

CREATE TABLE catalog_version_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_version_id UUID NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  path TEXT NOT NULL,
  file_role catalog_version_files_file_role NOT NULL,
  media_type VARCHAR(255),
  text_content TEXT NOT NULL,
  content_blocks JSONB DEFAULT '[]',
  sha256 VARCHAR(64) NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(catalog_version_id, path)
);

CREATE INDEX idx_catalog_version_files_version ON catalog_version_files(catalog_version_id, path);

-- ============ Catalog Specs ============
CREATE TABLE actor_template_version_specs (
  catalog_version_id UUID PRIMARY KEY REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  role actors_role NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  avatar_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  avatar_emoji VARCHAR(32),
  title VARCHAR(255) NOT NULL,
  can_represent_user BOOLEAN NOT NULL DEFAULT FALSE,
  docs JSONB NOT NULL DEFAULT '[]',
  specialties TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (avatar_file_id IS NULL OR avatar_emoji IS NULL)
);

CREATE TABLE skill_package_version_specs (
  catalog_version_id UUID PRIMARY KEY REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  skill_snapshot_id UUID NOT NULL REFERENCES skill_snapshots(id) ON DELETE RESTRICT,
  default_conversation_type_mask INT NOT NULL DEFAULT 15
    CHECK (default_conversation_type_mask > 0 AND default_conversation_type_mask <= 15),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_package_version_specs (
  catalog_version_id UUID PRIMARY KEY REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  transport plugin_package_version_specs_transport NOT NULL,
  entry_point TEXT,
  tool_manifest JSONB NOT NULL DEFAULT '[]',
  config_schema JSONB NOT NULL DEFAULT '{}',
  default_config JSONB NOT NULL DEFAULT '{}',
  install_flow JSONB NOT NULL DEFAULT '{}',
  auth_bindings JSONB NOT NULL DEFAULT '[]',
  default_reuse_scope plugin_package_version_specs_default_reuse_scope NOT NULL DEFAULT 'conversation',
  default_conversation_type_mask INT NOT NULL DEFAULT 15
    CHECK (default_conversation_type_mask > 0 AND default_conversation_type_mask <= 15),
  supported_reuse_scopes plugin_package_version_specs_default_reuse_scope[] NOT NULL
    DEFAULT ARRAY['turn', 'session', 'workspace', 'conversation', 'actor']::plugin_package_version_specs_default_reuse_scope[],
  requires_handshake BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION validate_catalog_version_spec_consistency_for_version(
  v_catalog_version_id UUID
)
RETURNS void AS $$
DECLARE
  v_item_kind catalog_items_item_kind;
  v_has_actor_template_spec BOOLEAN;
  v_has_skill_package_spec BOOLEAN;
  v_has_plugin_package_spec BOOLEAN;
  v_spec_count INT;
BEGIN
  SELECT item.item_kind,
         EXISTS (
           SELECT 1
           FROM actor_template_version_specs actor_spec
           WHERE actor_spec.catalog_version_id = version.id
         ) AS has_actor_template_spec,
         EXISTS (
           SELECT 1
           FROM skill_package_version_specs skill_spec
           WHERE skill_spec.catalog_version_id = version.id
         ) AS has_skill_package_spec,
         EXISTS (
           SELECT 1
           FROM plugin_package_version_specs plugin_spec
           WHERE plugin_spec.catalog_version_id = version.id
         ) AS has_plugin_package_spec
    INTO
      v_item_kind,
      v_has_actor_template_spec,
      v_has_skill_package_spec,
      v_has_plugin_package_spec
    FROM catalog_versions version
    JOIN catalog_items item
      ON item.id = version.catalog_item_id
   WHERE version.id = v_catalog_version_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_spec_count :=
    v_has_actor_template_spec::INT +
    v_has_skill_package_spec::INT +
    v_has_plugin_package_spec::INT;

  IF v_spec_count <> 1 THEN
    RAISE EXCEPTION
      'catalog_version % must have exactly one spec row, found actor_template=% skill_package=% plugin_package=%',
      v_catalog_version_id,
      v_has_actor_template_spec,
      v_has_skill_package_spec,
      v_has_plugin_package_spec
      USING ERRCODE = '23514',
            CONSTRAINT = 'catalog_versions_exactly_one_spec_chk';
  END IF;

  IF v_item_kind = 'actor_template' AND NOT v_has_actor_template_spec THEN
    RAISE EXCEPTION
      'catalog_version % belongs to actor_template item but is missing actor_template_version_specs row',
      v_catalog_version_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'catalog_versions_item_kind_spec_match_chk';
  END IF;

  IF v_item_kind = 'skill_package' AND NOT v_has_skill_package_spec THEN
    RAISE EXCEPTION
      'catalog_version % belongs to skill_package item but is missing skill_package_version_specs row',
      v_catalog_version_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'catalog_versions_item_kind_spec_match_chk';
  END IF;

  IF v_item_kind = 'plugin_package' AND NOT v_has_plugin_package_spec THEN
    RAISE EXCEPTION
      'catalog_version % belongs to plugin_package item but is missing plugin_package_version_specs row',
      v_catalog_version_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'catalog_versions_item_kind_spec_match_chk';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_catalog_version_spec_consistency()
RETURNS trigger AS $$
DECLARE
  v_catalog_version_id UUID;
  version_row RECORD;
BEGIN
  IF TG_TABLE_NAME = 'catalog_items' THEN
    IF TG_OP <> 'UPDATE' OR NEW.item_kind = OLD.item_kind THEN
      RETURN NULL;
    END IF;

    FOR version_row IN
      SELECT version.id
      FROM catalog_versions version
      WHERE version.catalog_item_id = NEW.id
    LOOP
      PERFORM validate_catalog_version_spec_consistency_for_version(version_row.id);
    END LOOP;

    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'catalog_versions' THEN
      v_catalog_version_id := OLD.id;
    ELSE
      v_catalog_version_id := OLD.catalog_version_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'catalog_versions' THEN
      v_catalog_version_id := NEW.id;
    ELSE
      v_catalog_version_id := NEW.catalog_version_id;
    END IF;
  END IF;

  PERFORM validate_catalog_version_spec_consistency_for_version(v_catalog_version_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER catalog_versions_spec_consistency_chk
AFTER INSERT OR UPDATE OF catalog_item_id OR DELETE ON catalog_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_catalog_version_spec_consistency();

CREATE CONSTRAINT TRIGGER actor_template_version_specs_parent_kind_chk
AFTER INSERT OR UPDATE OR DELETE ON actor_template_version_specs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_catalog_version_spec_consistency();

CREATE CONSTRAINT TRIGGER skill_package_version_specs_parent_kind_chk
AFTER INSERT OR UPDATE OR DELETE ON skill_package_version_specs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_catalog_version_spec_consistency();

CREATE CONSTRAINT TRIGGER plugin_package_version_specs_parent_kind_chk
AFTER INSERT OR UPDATE OR DELETE ON plugin_package_version_specs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_catalog_version_spec_consistency();

CREATE CONSTRAINT TRIGGER catalog_items_version_spec_kind_chk
AFTER UPDATE OF item_kind ON catalog_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_catalog_version_spec_consistency();

CREATE TABLE plugin_version_runtime_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_version_id UUID NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  permission_key VARCHAR(120) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  rationale TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(catalog_version_id, permission_key)
);

-- ============ Actor Runtime ============
CREATE TABLE actors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role actors_role NOT NULL,
  title VARCHAR(255) NOT NULL,
  avatar_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  avatar_emoji VARCHAR(32),
  parent_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  can_represent_user BOOLEAN NOT NULL DEFAULT FALSE,
  specialties TEXT[] DEFAULT '{}',
  -- P2: the old access-policy column has been removed. Authorization intent is now
  -- represented by the existence of a workspace-scoped `contact_visible`
  -- grant in `workspace_resource_grants` with `source='system'` or by explicit
  -- per-subject grants/requests. See packages/api/src/modules/access/contact-approval.ts.
  config JSONB DEFAULT '{}',
  current_version INT NOT NULL DEFAULT 1,
  is_public_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (avatar_file_id IS NULL OR avatar_emoji IS NULL)
);

CREATE INDEX idx_actors_parent ON actors(parent_id);

CREATE TABLE remote_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  runtime_kind remote_agents_runtime_kind NOT NULL,
  avatar_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  avatar_emoji VARCHAR(32),
  -- P2: see actor authorization comment above.
  is_public_shared BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (avatar_file_id IS NULL OR avatar_emoji IS NULL)
);

CREATE INDEX idx_remote_agents_runtime ON remote_agents(runtime_kind, created_at DESC);

CREATE TABLE remote_agent_machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  api_key_hash VARCHAR(128) NOT NULL UNIQUE,
  trust_status remote_agent_machines_trust_status NOT NULL DEFAULT 'active',
  lifecycle_state remote_agent_machines_lifecycle_state,
  last_seen_at TIMESTAMPTZ,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_machines_workspace
  ON remote_agent_machines(workspace_id, created_at DESC);

CREATE TABLE remote_agent_machine_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id UUID NOT NULL REFERENCES remote_agent_machines(id) ON DELETE RESTRICT,
  fencing_token UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  status remote_agent_machine_sessions_status NOT NULL DEFAULT 'connecting',
  transport remote_agent_machine_sessions_transport NOT NULL DEFAULT 'websocket',
  remote_addr TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  close_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_machine_sessions_machine
  ON remote_agent_machine_sessions(machine_id, created_at DESC);

CREATE UNIQUE INDEX uq_remote_agent_machine_sessions_machine_active
  ON remote_agent_machine_sessions(machine_id)
  WHERE status IN ('connecting', 'active');

CREATE TABLE remote_agent_runtime_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id UUID NOT NULL REFERENCES remote_agent_machines(id) ON DELETE RESTRICT,
  runtime_kind remote_agents_runtime_kind NOT NULL,
  executable_path TEXT,
  status remote_agent_runtime_catalog_status NOT NULL DEFAULT 'missing_binary',
  version VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, runtime_kind)
);

CREATE TABLE remote_agent_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  remote_agent_id UUID NOT NULL UNIQUE REFERENCES remote_agents(id) ON DELETE RESTRICT,
  machine_id UUID NOT NULL REFERENCES remote_agent_machines(id) ON DELETE RESTRICT,
  runtime_kind remote_agents_runtime_kind NOT NULL,
  runtime_path TEXT,
  local_root_path TEXT,
  status remote_agent_bindings_status NOT NULL DEFAULT 'active',
  runtime_state remote_agent_bindings_runtime_state NOT NULL DEFAULT 'offline',
  status_text TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}',
  last_activity_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_bindings_machine
  ON remote_agent_bindings(machine_id, created_at DESC);

CREATE TABLE remote_agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  remote_agent_id UUID NOT NULL REFERENCES remote_agents(id) ON DELETE RESTRICT,
  run_key TEXT NOT NULL UNIQUE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status remote_agent_runs_status NOT NULL DEFAULT 'queued',
  status_text TEXT,
  task_id UUID,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_runs_remote_agent
  ON remote_agent_runs(remote_agent_id, created_at DESC);

CREATE TABLE remote_agent_conversation_contexts (
  remote_agent_id UUID NOT NULL REFERENCES remote_agents(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  runtime_kind remote_agents_runtime_kind,
  runtime_session_id VARCHAR(255),
  runtime_state remote_agent_bindings_runtime_state NOT NULL DEFAULT 'offline',
  status_text TEXT,
  active_task_id UUID,
  collaboration_mode TEXT NOT NULL DEFAULT 'default',
  collaboration_state JSONB NOT NULL DEFAULT '{}',
  active_plan_approval_task_id UUID,
  last_run_started_at TIMESTAMPTZ,
  last_run_finished_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (remote_agent_id, conversation_id)
);

CREATE INDEX idx_remote_agent_conversation_contexts_remote_agent
  ON remote_agent_conversation_contexts(remote_agent_id, updated_at DESC);

CREATE INDEX idx_remote_agent_conversation_contexts_conversation
  ON remote_agent_conversation_contexts(conversation_id, updated_at DESC);

CREATE INDEX idx_remote_agent_conversation_contexts_runtime_session
  ON remote_agent_conversation_contexts(remote_agent_id, runtime_session_id)
  WHERE runtime_session_id IS NOT NULL;

CREATE INDEX idx_remote_agent_conversation_contexts_active_state
  ON remote_agent_conversation_contexts(remote_agent_id, runtime_state)
  WHERE runtime_state IN (
    'running', 'waiting_user_input', 'plan_drafting', 'waiting_plan_approval'
  );

CREATE TABLE remote_agent_group_task_grants (
  remote_agent_id UUID NOT NULL REFERENCES remote_agents(id) ON DELETE RESTRICT,
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (remote_agent_id, workspace_member_id)
);

CREATE INDEX idx_remote_agent_group_task_grants_workspace_member
  ON remote_agent_group_task_grants(workspace_member_id, created_at DESC);

CREATE TABLE workspace_relationship_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- P1b: subject_type + 3 nullable FKs collapsed into a single subject_id FK
  -- into access_subjects. Deferred FK applied below.
  subject_id UUID NOT NULL,
  identity_id VARCHAR(32) NOT NULL UNIQUE
    DEFAULT lower('id_' || substr(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  identity_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  approval_mode relationship_approval_mode NOT NULL DEFAULT 'manual',
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workspace_relationship_profiles_subject
  ON workspace_relationship_profiles(workspace_id, subject_id);
CREATE INDEX idx_workspace_relationship_profiles_subject
  ON workspace_relationship_profiles(subject_id);
CREATE INDEX idx_workspace_relationship_profiles_identity_lookup
  ON workspace_relationship_profiles(identity_id)
  WHERE identity_search_enabled = TRUE;

CREATE TABLE workspace_friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  -- P1b: target_subject_type + 3 nullable FKs collapsed into a single
  -- target_subject_id FK into access_subjects. Deferred FK below.
  target_subject_id UUID NOT NULL,
  requested_via_profile_id UUID REFERENCES workspace_relationship_profiles(id) ON DELETE SET NULL,
  status relationship_request_status NOT NULL DEFAULT 'pending',
  resolved_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workspace_friend_requests_pending_target
  ON workspace_friend_requests(requester_workspace_member_id, target_subject_id)
  WHERE status = 'pending';
CREATE INDEX idx_workspace_friend_requests_target_subject
  ON workspace_friend_requests(target_subject_id, created_at DESC);
CREATE INDEX idx_workspace_friend_requests_requester
  ON workspace_friend_requests(requester_workspace_member_id, created_at DESC);

CREATE TABLE workspace_friend_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  owner_workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  -- P1b: peer_type + 3 nullable polymorphic FKs collapsed into a single
  -- peer_subject_id FK into access_subjects. Peer kind is recoverable from
  -- the joined subject's `kind` (workspace_member / actor / remote_agent).
  -- Deferred FK applied below in the post-access_subjects ALTER section.
  peer_subject_id UUID NOT NULL,
  source_request_id UUID REFERENCES workspace_friend_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workspace_friend_entries_peer
  ON workspace_friend_entries(workspace_id, owner_workspace_member_id, peer_subject_id);
CREATE INDEX idx_workspace_friend_entries_owner
  ON workspace_friend_entries(workspace_id, owner_workspace_member_id, created_at DESC);
CREATE INDEX idx_workspace_friend_entries_peer_subject
  ON workspace_friend_entries(peer_subject_id);
CREATE TABLE direct_conversation_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE RESTRICT,
  -- P1b: participant_*_kind + 3 nullable polymorphic FKs collapsed into a
  -- single subject_id FK per participant (deferred ALTER below).
  participant_one_subject_id UUID NOT NULL,
  participant_two_subject_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_direct_conversation_bindings_pair
  ON direct_conversation_bindings(participant_one_subject_id, participant_two_subject_id);
CREATE INDEX idx_direct_conversation_bindings_participant_one
  ON direct_conversation_bindings(participant_one_subject_id);
CREATE INDEX idx_direct_conversation_bindings_participant_two
  ON direct_conversation_bindings(participant_two_subject_id);

CREATE TABLE workspace_member_preferences (
  workspace_member_id UUID PRIMARY KEY REFERENCES workspace_members(id) ON DELETE RESTRICT,
  chief_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_member_preferences_actor ON workspace_member_preferences(chief_actor_id);

CREATE TABLE actor_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  version INT NOT NULL,
  previous_version_id UUID REFERENCES actor_versions(id) ON DELETE SET NULL,
  display_name VARCHAR(255) NOT NULL,
  role actors_role NOT NULL,
  title VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  can_represent_user BOOLEAN NOT NULL DEFAULT FALSE,
  specialties TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  version_delta JSONB,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  source_type actor_versions_source_type NOT NULL DEFAULT 'system',
  source_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  source_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  source_session_id UUID,
  source_turn_id UUID,
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  source_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_id, version)
);

CREATE TABLE actor_version_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_version_id UUID NOT NULL REFERENCES actor_versions(id) ON DELETE RESTRICT,
  doc_key VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  visibility actor_version_docs_visibility NOT NULL DEFAULT 'always',
  priority INT NOT NULL DEFAULT 0,
  content_blocks JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actor_version_docs_version ON actor_version_docs(actor_version_id, priority DESC, created_at);

CREATE TABLE actor_source_refs (
  actor_id UUID PRIMARY KEY REFERENCES actors(id) ON DELETE RESTRICT,
  source_catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
  source_catalog_version_id UUID REFERENCES catalog_versions(id) ON DELETE SET NULL,
  sync_mode actor_source_refs_sync_mode NOT NULL DEFAULT 'notify',
  baseline_actor_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Model Routing ============
CREATE TABLE model_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type model_groups_owner_type NOT NULL,
  owner_workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  owner_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  routing_strategy model_groups_routing_strategy NOT NULL DEFAULT 'priority_failover',
  attempt_policy JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (owner_type = 'platform' AND owner_workspace_id IS NULL AND owner_workspace_member_id IS NULL) OR
    (owner_type = 'workspace' AND owner_workspace_id IS NOT NULL AND owner_workspace_member_id IS NULL) OR
    (owner_type = 'workspace_member' AND owner_workspace_id IS NULL AND owner_workspace_member_id IS NOT NULL)
  )
);

CREATE INDEX idx_model_groups_owner_workspace ON model_groups(owner_workspace_id, created_at DESC);
CREATE INDEX idx_model_groups_owner_workspace_member ON model_groups(owner_workspace_member_id, created_at DESC);
CREATE UNIQUE INDEX idx_model_groups_default_platform
  ON model_groups ((1)) WHERE owner_type = 'platform' AND is_default = TRUE AND is_enabled = TRUE;
CREATE UNIQUE INDEX idx_model_groups_default_workspace
  ON model_groups (owner_workspace_id) WHERE owner_type = 'workspace' AND owner_workspace_id IS NOT NULL AND is_default = TRUE AND is_enabled = TRUE;
CREATE UNIQUE INDEX idx_model_groups_default_workspace_member
  ON model_groups (owner_workspace_member_id) WHERE owner_type = 'workspace_member' AND owner_workspace_member_id IS NOT NULL AND is_default = TRUE AND is_enabled = TRUE;

-- A model BINDING is one endpoint config; it belongs to exactly ONE group
-- (1:N), replacing the old model_profiles + model_group_profiles + revisions
-- chain (the M:N was never used — each item minted a fresh profile). Soft-delete
-- ROOT (deleted_at added in the cutover section).
CREATE TABLE model_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES model_groups(id) ON DELETE RESTRICT,
  display_name VARCHAR(255) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  weight INT NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 1000),
  is_enabled BOOLEAN DEFAULT TRUE,
  current_version_id UUID,
  installed_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_bindings_group ON model_bindings(group_id, priority, created_at DESC);

-- Immutable, insert-only config versions (append-only). The version id is the
-- traceability anchor recorded on provider_steps.model_binding_version_id.
-- provider_kind drives the SDK factory (anthropic|openai|openai_compatible);
-- vendor is a display/catalog label (deepseek/bigmodel/...) and never widens the
-- factory switch. features/provider_options replace the old untyped extra_config.
CREATE TABLE model_binding_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  binding_id UUID NOT NULL REFERENCES model_bindings(id) ON DELETE RESTRICT,
  version INT NOT NULL DEFAULT 1,
  provider_kind VARCHAR(32) NOT NULL CHECK (provider_kind IN ('anthropic', 'openai', 'openai_compatible')),
  vendor VARCHAR(64) NOT NULL CHECK (vendor ~ '^[a-z][a-z0-9_-]*$'),
  api_key TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  max_output_tokens INT NOT NULL DEFAULT 4096,
  capability_tags TEXT[] DEFAULT '{}',
  features JSONB NOT NULL DEFAULT '{}',
  provider_options JSONB NOT NULL DEFAULT '{}',
  request_timeout_ms INT,
  max_retries INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(binding_id, version)
);

CREATE INDEX idx_model_binding_versions_binding ON model_binding_versions(binding_id, version DESC);

-- current_version_id is a SET NULL pointer (kept single-column so the
-- binding<->version FK pair stays acyclic for the purge topo-sort: the version
-- delete is unblocked once this pointer is nulled). Integrity — the current
-- version must belong to THIS binding — is enforced by a trigger below rather
-- than a composite FK (which would re-introduce the cycle).
ALTER TABLE model_bindings ADD CONSTRAINT fk_model_bindings_current_version
  FOREIGN KEY (current_version_id) REFERENCES model_binding_versions(id) ON DELETE SET NULL;

-- Enforce current_version_id ∈ versions OF THIS binding (prevents binding A from
-- pointing at binding B's version — which would corrupt per-call config-version
-- traceability). Fires on insert / current_version_id change.
CREATE OR REPLACE FUNCTION model_bindings_assert_current_version_owned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM model_binding_versions v
    WHERE v.id = NEW.current_version_id AND v.binding_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'current_version_id % does not belong to binding %',
      NEW.current_version_id, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_model_bindings_current_version_owned
  BEFORE INSERT OR UPDATE OF current_version_id ON model_bindings
  FOR EACH ROW EXECUTE FUNCTION model_bindings_assert_current_version_owned();

CREATE TABLE model_group_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES model_groups(id) ON DELETE RESTRICT,
  -- P1b: polymorphic (grant_scope + 3 nullable FKs) collapsed into a single
  -- subject_id FK into access_subjects. The legacy `grant_scope` enum
  -- (platform/workspace/workspace_member/actor) is recoverable from the
  -- subject's `kind` (platform/workspace/workspace_member/actor respectively).
  -- The FK constraint to access_subjects is added after the access_subjects
  -- table is defined later in this file (search "ALTER TABLE model_group_grants").
  subject_id UUID NOT NULL,
  status model_group_grants_status NOT NULL DEFAULT 'active',
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_model_group_grants_group ON model_group_grants(group_id, created_at DESC);
CREATE INDEX idx_model_group_grants_subject ON model_group_grants(subject_id, created_at DESC);
-- P1b: prevent concurrent inserts from both writing a duplicate active grant
-- between the check in ensureNoDuplicateActiveGrant and the subsequent INSERT.
-- Limited to status='active' so revoked rows don't block new grants.
CREATE UNIQUE INDEX uq_model_group_grants_active_subject
  ON model_group_grants(group_id, subject_id)
  WHERE status = 'active';

CREATE TABLE actor_model_group_assignments (
  actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  group_id UUID NOT NULL REFERENCES model_groups(id) ON DELETE RESTRICT,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, group_id)
);

CREATE INDEX idx_actor_model_group_assignments_actor ON actor_model_group_assignments(actor_id);

-- ============ Chat Runtime ============
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  trigger VARCHAR(50) NOT NULL DEFAULT 'user_message',
  status sessions_status NOT NULL DEFAULT 'idle',
  collaboration_mode sessions_collaboration_mode NOT NULL DEFAULT 'default',
  -- FK is added later because sessions and tool_call_tasks participate
  -- in a schema dependency cycle via conversation_items.
  active_plan_approval_task_id UUID,
  collaboration_state JSONB NOT NULL DEFAULT '{}',
  memory_bootstrap_completed BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT sessions_active_plan_approval_pointer_mode_chk CHECK (
    (
      collaboration_mode = 'plan_awaiting_approval'
      AND active_plan_approval_task_id IS NOT NULL
    )
    OR (
      collaboration_mode <> 'plan_awaiting_approval'
      AND active_plan_approval_task_id IS NULL
    )
  )
);

CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX idx_sessions_actor ON sessions(actor_id);
CREATE INDEX idx_sessions_actor_status ON sessions(actor_id, status);
CREATE INDEX idx_sessions_conversation ON sessions(conversation_id);
CREATE UNIQUE INDEX uq_sessions_conversation_actor
  ON sessions(conversation_id, actor_id);
CREATE UNIQUE INDEX uq_sessions_active_plan_approval_task
  ON sessions(active_plan_approval_task_id)
  WHERE active_plan_approval_task_id IS NOT NULL;

-- ============ access_subjects: unified polymorphic subject registry ============
-- Replaces the historical pattern of "kind + N nullable FK columns + CHECK" that
-- was duplicated across 10+ tables. Authorization/relationship/binding tables
-- now hold a single `subject_id` FK into this registry. See
-- `packages/shared/src/access/subject.ts` for the application-layer `SubjectRef`.

CREATE TABLE access_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind subject_kind NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES actors(id) ON DELETE RESTRICT,
  remote_agent_id UUID REFERENCES remote_agents(id) ON DELETE RESTRICT,
  -- conversation_id's single-column FK is replaced by the composite FK
  -- (conversation_id, workspace_id) -> conversations(id, workspace_id) declared
  -- after conversations (search "fk_access_subjects_conversation"); this enforces
  -- that a conversation subject's denormalized workspace_id matches the
  -- conversation's real workspace (the value access_subject_workspace_id trusts).
  conversation_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  -- transport_address_id is the payload for kind='external': a first-class,
  -- workspace-rooted, cross-conversation external IM identity. The composite FK
  -- (transport_address_id, workspace_id) -> transport_addresses(id, workspace_id)
  -- is declared after transport_addresses is defined (search
  -- "fk_access_subjects_transport_address"); it is DEFERRABLE so workspace
  -- deletion's multi-path CASCADE resolves within one transaction without the
  -- constraint blocking it, while a standalone transport_address delete still
  -- fails if an external subject still references it (protecting historical
  -- external authorship).
  transport_address_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- workspace_id is REQUIRED for kinds that are unambiguously workspace-bound
  -- (workspace, workspace_member, actor, remote_agent, external, conversation).
  -- It is denormalized from the underlying table by `upsertAccessSubject` via a
  -- SELECT lookup so that workspace-scoped queries on access_subjects can filter
  -- without a JOIN. Every conversation is now workspace-scoped (conversations.
  -- workspace_id NOT NULL), so conversation subjects also require workspace_id,
  -- and a composite FK keeps it consistent with the conversation's real
  -- workspace. `user` / `platform` are platform-wide subjects and intentionally
  -- have no workspace. Conversation-scoped actor semantics are expressed as
  -- (subject=actor, scope=conversation) at the binding/grant layer.
  CONSTRAINT chk_access_subjects_payload CHECK (
    (kind = 'workspace' AND workspace_id IS NOT NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NULL) OR
    (kind = 'workspace_member' AND workspace_id IS NOT NULL AND workspace_member_id IS NOT NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NULL) OR
    (kind = 'actor' AND workspace_id IS NOT NULL AND workspace_member_id IS NULL AND actor_id IS NOT NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NULL) OR
    (kind = 'remote_agent' AND workspace_id IS NOT NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NOT NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NULL) OR
    (kind = 'conversation' AND workspace_id IS NOT NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NOT NULL AND user_id IS NULL AND transport_address_id IS NULL) OR
    (kind = 'user' AND workspace_id IS NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NOT NULL AND transport_address_id IS NULL) OR
    (kind = 'external' AND workspace_id IS NOT NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NOT NULL) OR
    (kind = 'platform' AND workspace_id IS NULL AND workspace_member_id IS NULL AND actor_id IS NULL AND remote_agent_id IS NULL AND conversation_id IS NULL AND user_id IS NULL AND transport_address_id IS NULL)
  )
);

-- Partial-unique indexes let upsertAccessSubject reuse the same row for the
-- same logical subject (one row per actor, one per member, etc.).
CREATE UNIQUE INDEX uq_access_subjects_workspace
  ON access_subjects(workspace_id) WHERE kind = 'workspace';
CREATE UNIQUE INDEX uq_access_subjects_workspace_member
  ON access_subjects(workspace_member_id) WHERE kind = 'workspace_member';
CREATE UNIQUE INDEX uq_access_subjects_actor
  ON access_subjects(actor_id) WHERE kind = 'actor';
CREATE UNIQUE INDEX uq_access_subjects_remote_agent
  ON access_subjects(remote_agent_id) WHERE kind = 'remote_agent';
CREATE UNIQUE INDEX uq_access_subjects_conversation
  ON access_subjects(conversation_id) WHERE kind = 'conversation';
CREATE UNIQUE INDEX uq_access_subjects_user
  ON access_subjects(user_id) WHERE kind = 'user';
-- One external subject per transport_address (cross-conversation dedup). The
-- partial predicate keys on the column's NOT NULL state rather than kind so the
-- index also serves the composite FK's child-side lookup.
CREATE UNIQUE INDEX uq_access_subjects_external
  ON access_subjects(transport_address_id) WHERE transport_address_id IS NOT NULL;
CREATE UNIQUE INDEX uq_access_subjects_platform
  ON access_subjects((1)) WHERE kind = 'platform';

CREATE INDEX idx_access_subjects_kind
  ON access_subjects(kind, created_at DESC);

-- P1b: deferred FK from model_group_grants.subject_id (defined earlier in this
-- file, before access_subjects exists). Adding the constraint here keeps the
-- single-pass schema.sql apply-order working.
ALTER TABLE model_group_grants
  ADD CONSTRAINT fk_model_group_grants_subject
  FOREIGN KEY (subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FK from workspace_friend_entries.peer_subject_id.
ALTER TABLE workspace_friend_entries
  ADD CONSTRAINT fk_workspace_friend_entries_peer_subject
  FOREIGN KEY (peer_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FK from workspace_friend_requests.target_subject_id.
ALTER TABLE workspace_friend_requests
  ADD CONSTRAINT fk_workspace_friend_requests_target_subject
  FOREIGN KEY (target_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FK from workspace_relationship_profiles.subject_id.
ALTER TABLE workspace_relationship_profiles
  ADD CONSTRAINT fk_workspace_relationship_profiles_subject
  FOREIGN KEY (subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FK from direct_conversation_bindings's two subject columns.
ALTER TABLE direct_conversation_bindings
  ADD CONSTRAINT fk_direct_conversation_bindings_participant_one_subject
  FOREIGN KEY (participant_one_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
ALTER TABLE direct_conversation_bindings
  ADD CONSTRAINT fk_direct_conversation_bindings_participant_two_subject
  FOREIGN KEY (participant_two_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FK from workspace_capability_conversation_type_policies.subject_id
-- (always points to a kind='workspace' access_subjects row).
ALTER TABLE workspace_capability_conversation_type_policies
  ADD CONSTRAINT fk_workspace_capability_conversation_type_policies_subject
  FOREIGN KEY (subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

-- P1b: deferred FKs from workspace_resources.owner_subject_id /
-- created_by_subject_id (the table is defined earlier, before access_subjects
-- exists). Allowed owner subject kind is enforced by the validate_workspace_resource_root
-- trigger via is_workspace_resource_owner_subject_kind; the FK itself is a plain
-- RESTRICT reference into access_subjects.
ALTER TABLE workspace_resources
  ADD CONSTRAINT fk_workspace_resources_owner_subject
  FOREIGN KEY (owner_subject_id) REFERENCES access_subjects(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workspace_resources
  ADD CONSTRAINT fk_workspace_resources_created_by_subject
  FOREIGN KEY (created_by_subject_id) REFERENCES access_subjects(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;


CREATE TABLE transport_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  transport_kind transport_accounts_transport_kind NOT NULL,
  account_key VARCHAR(120) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  owner_scope transport_accounts_owner_scope NOT NULL DEFAULT 'workspace',
  owner_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE RESTRICT,
  inbound_actor_mode transport_accounts_inbound_actor_mode NOT NULL DEFAULT 'none',
  inbound_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  connection_mode transport_accounts_connection_mode NOT NULL,
  status transport_accounts_status NOT NULL DEFAULT 'active',
  credentials JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (owner_scope = 'workspace' AND owner_workspace_member_id IS NULL) OR
    (owner_scope = 'workspace_member' AND owner_workspace_member_id IS NOT NULL)
  ),
  CHECK (
    owner_scope = 'workspace_member' OR
    inbound_actor_mode <> 'follow_owner_chief_actor'
  ),
  CHECK (
    (inbound_actor_mode = 'specified_actor' AND inbound_actor_id IS NOT NULL) OR
    (inbound_actor_mode <> 'specified_actor' AND inbound_actor_id IS NULL)
  ),
  UNIQUE(workspace_id, transport_kind, account_key),
  -- Target for conversation_transport_bindings' composite FK enforcing that a
  -- binding's account lives in the same workspace as the binding/conversation.
  UNIQUE(id, workspace_id)
);

CREATE INDEX idx_transport_accounts_workspace
  ON transport_accounts(workspace_id, transport_kind, created_at DESC);
CREATE INDEX idx_transport_accounts_owner_workspace_member
  ON transport_accounts(owner_workspace_member_id, created_at DESC)
  WHERE owner_workspace_member_id IS NOT NULL;

CREATE TABLE transport_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transport_account_id UUID NOT NULL REFERENCES transport_accounts(id) ON DELETE RESTRICT,
  endpoint_type transport_endpoints_endpoint_type NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  parent_external_id VARCHAR(255),
  display_name VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transport_account_id, endpoint_type, external_id),
  -- Target for conversation_transport_bindings' composite FK enforcing that a
  -- binding's endpoint belongs to the binding's account (account→workspace chain).
  UNIQUE(id, transport_account_id)
);

CREATE INDEX idx_transport_endpoints_account
  ON transport_endpoints(transport_account_id, endpoint_type, created_at DESC);

CREATE TABLE conversation_transport_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- The presence of this row is the sole source of a conversation's "IM-ness"
  -- (see hasConversationTransportBinding / resolveConversationTypeKey). The FKs
  -- below are composite so the bound conversation, account and endpoint all
  -- share the binding's workspace. conversation_id CASCADEs (deleting the
  -- conversation removes its binding). account_id / endpoint_id are
  -- DEFERRABLE NO ACTION, NOT cascade: a standalone delete of an account or
  -- endpoint that still has a bound conversation must be rejected (otherwise the
  -- conversation would silently flip from IM to native while keeping external
  -- participants). Workspace deletion's multi-path CASCADE still settles within
  -- the transaction because the binding is removed via the conversation/workspace
  -- path before COMMIT. Standalone account/endpoint deletion is gated in the
  -- service layer (archive/migrate bound conversations first).
  conversation_id UUID NOT NULL,
  transport_account_id UUID NOT NULL,
  transport_endpoint_id UUID NOT NULL,
  outbound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inbound_actor_mode conversation_transport_bindings_inbound_actor_mode NOT NULL DEFAULT 'inherit_account',
  inbound_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (inbound_actor_mode = 'specified_actor' AND inbound_actor_id IS NOT NULL) OR
    (inbound_actor_mode <> 'specified_actor' AND inbound_actor_id IS NULL)
  ),
  UNIQUE(conversation_id),
  UNIQUE(transport_endpoint_id),
  FOREIGN KEY (conversation_id, workspace_id)
    REFERENCES conversations(id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (transport_account_id, workspace_id)
    REFERENCES transport_accounts(id, workspace_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (transport_endpoint_id, transport_account_id)
    REFERENCES transport_endpoints(id, transport_account_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_conversation_transport_bindings_workspace
  ON conversation_transport_bindings(workspace_id, created_at DESC);

CREATE TABLE transport_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- transport_account_id's workspace MUST equal this row's workspace. Enforced
  -- by the composite FK (transport_account_id, workspace_id) ->
  -- transport_accounts(id, workspace_id) below (transport_accounts has
  -- UNIQUE(id, workspace_id)); a plain single-column FK would let a
  -- cross-workspace address poison the (account, address_type, external_id)
  -- unique key and later be rejected by the participant trigger.
  transport_account_id UUID NOT NULL,
  transport_kind transport_addresses_transport_kind NOT NULL,
  address_type transport_addresses_address_type NOT NULL DEFAULT 'user',
  external_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transport_account_id, address_type, external_id),
  -- Supports the composite FK access_subjects(transport_address_id, workspace_id)
  -- -> transport_addresses(id, workspace_id), which enforces that an external
  -- subject's denormalized workspace_id matches its address's workspace. id is
  -- already the PK; this extra UNIQUE is required because Postgres composite FKs
  -- must reference a UNIQUE/PK column set.
  UNIQUE(id, workspace_id),
  FOREIGN KEY (transport_account_id, workspace_id)
    REFERENCES transport_accounts(id, workspace_id) ON DELETE RESTRICT
);

CREATE INDEX idx_transport_addresses_workspace
  ON transport_addresses(workspace_id, transport_kind, created_at DESC);
CREATE INDEX idx_transport_addresses_workspace_member
  ON transport_addresses(workspace_member_id, transport_kind, created_at DESC)
  WHERE workspace_member_id IS NOT NULL;

-- Composite FK from access_subjects.external payload. Declared here (after
-- transport_addresses exists) rather than inline on access_subjects, which is
-- defined earlier in this file. DEFERRABLE INITIALLY DEFERRED: checked at COMMIT,
-- so workspace deletion's multi-path CASCADE (which removes both transport_addresses
-- and access_subjects rows) settles within the transaction without the constraint
-- aborting it; a standalone transport_address delete that leaves an external
-- subject dangling still fails at COMMIT, protecting historical authorship.
ALTER TABLE access_subjects
  ADD CONSTRAINT fk_access_subjects_transport_address
  FOREIGN KEY (transport_address_id, workspace_id)
  REFERENCES transport_addresses(id, workspace_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Composite FK for kind='conversation' subjects: the denormalized workspace_id
-- must match the conversation's real workspace (the value trusted by
-- access_subject_workspace_id and downstream grant/scope checks). ON DELETE
-- CASCADE preserves the original single-column FK's behavior — deleting a
-- conversation (directly or via workspace cascade) removes its conversation
-- subject row, so a conversation that has been referenced by a conversationRef
-- subject (scope grant / memory subject) is still deletable.
ALTER TABLE access_subjects
  ADD CONSTRAINT fk_access_subjects_conversation
  FOREIGN KEY (conversation_id, workspace_id)
  REFERENCES conversations(id, workspace_id)
  ON DELETE RESTRICT;

CREATE TABLE conversation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  turn_id UUID,
  client_message_id UUID,
  scope conversation_items_scope NOT NULL,
  surface conversation_items_surface NOT NULL,
  item_type conversation_items_item_type NOT NULL,
  subtype VARCHAR(50) NOT NULL,
  role conversation_items_role NOT NULL,
  author_participant_id UUID,
  bundle_id UUID,
  reply_to_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  caused_by_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  event_payload JSONB DEFAULT '{}',
  event_timeline_policy conversation_items_event_timeline_policy,
  event_context_policy conversation_items_event_context_policy,
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_conversation_items_sequence_unique
  ON conversation_items(conversation_id, sequence);
CREATE INDEX idx_conversation_items_conversation_created
  ON conversation_items(conversation_id, created_at);
CREATE INDEX idx_conversation_items_session_created
  ON conversation_items(session_id, created_at) WHERE session_id IS NOT NULL;
CREATE INDEX idx_conversation_items_turn
  ON conversation_items(turn_id) WHERE turn_id IS NOT NULL;
CREATE INDEX idx_conversation_items_bundle
  ON conversation_items(bundle_id) WHERE bundle_id IS NOT NULL;
CREATE UNIQUE INDEX idx_conversation_items_client_message_idempotency
  ON conversation_items(conversation_id, author_participant_id, client_message_id)
  WHERE author_participant_id IS NOT NULL AND client_message_id IS NOT NULL;

CREATE TABLE conversation_item_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  part_type conversation_item_parts_part_type NOT NULL,
  text_value TEXT,
  ref_path TEXT,
  ref_sha256 VARCHAR(64),
  json_value JSONB,
  mime_type VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  UNIQUE(item_id, ordinal),
  CHECK (
    (part_type = 'text' AND text_value IS NOT NULL) OR
    (part_type = 'file_ref' AND ref_sha256 IS NOT NULL) OR
    (part_type = 'json' AND json_value IS NOT NULL)
  )
);

CREATE INDEX idx_conversation_item_parts_item ON conversation_item_parts(item_id, ordinal);
CREATE INDEX idx_conversation_item_parts_ref_sha ON conversation_item_parts(ref_sha256) WHERE ref_sha256 IS NOT NULL;

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  -- The participant's identity/type is the kind of its access_subjects row
  -- (workspace_member / actor / remote_agent / external), derived at read time
  -- via subjectKindToParticipantType. There is no denormalized participant_type
  -- column; tg_conversation_participant_validate enforces that subject_id refers
  -- to one of those four kinds, and that the subject's workspace matches the
  -- conversation's (every conversation is workspace-scoped; external subjects are
  -- additionally restricted to IM conversations matching the binding account).
  -- External participants carry a first-class, cross-conversation
  -- access_subjects row keyed by transport_address_id.
  subject_id UUID NOT NULL,
  actor_join_version_id UUID REFERENCES actor_versions(id) ON DELETE SET NULL,
  display_name VARCHAR(255),
  role_key VARCHAR(64) NOT NULL DEFAULT 'member',
  state conversation_participants_state NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE INDEX idx_conversation_participants_conversation
  ON conversation_participants(conversation_id, state, joined_at DESC);
CREATE INDEX idx_conversation_participants_subject
  ON conversation_participants(subject_id, joined_at DESC);
CREATE UNIQUE INDEX idx_conversation_participants_unique_subject
  ON conversation_participants(conversation_id, subject_id);

-- P1b: deferred FK from conversation_participants.subject_id. Declared here
-- rather than inline because access_subjects is defined before this table; this
-- placement keeps the schema topologically valid without requiring the
-- registry to live in the conversation cluster.
ALTER TABLE conversation_participants
  ADD CONSTRAINT fk_conversation_participants_subject
  FOREIGN KEY (subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;

CREATE TABLE conversation_item_mentions (
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  mentioned_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, ordinal)
);

CREATE INDEX idx_conversation_item_mentions_participant
  ON conversation_item_mentions(mentioned_participant_id, item_id);

CREATE TABLE conversation_participant_addresses (
  conversation_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  transport_address_id UUID NOT NULL REFERENCES transport_addresses(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_participant_id, transport_address_id)
);

CREATE UNIQUE INDEX idx_conversation_participant_addresses_primary
  ON conversation_participant_addresses(conversation_participant_id)
  WHERE is_primary = TRUE;
CREATE INDEX idx_conversation_participant_addresses_address
  ON conversation_participant_addresses(transport_address_id, created_at DESC);

CREATE TABLE conversation_item_targets (
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  target_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  target_kind conversation_item_targets_target_kind NOT NULL DEFAULT 'to',
  PRIMARY KEY (item_id, target_participant_id, target_kind)
);

CREATE INDEX idx_conversation_item_targets_participant
  ON conversation_item_targets(target_participant_id, item_id);

CREATE TABLE conversation_item_context_targets (
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  target_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, target_participant_id)
);

CREATE INDEX idx_conversation_item_context_targets_participant
  ON conversation_item_context_targets(target_participant_id, item_id);

CREATE TABLE conversation_participant_states (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  read_watermark_sequence BIGINT NOT NULL DEFAULT 0,
  last_read_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, participant_id)
);

CREATE INDEX idx_conversation_participant_states_conversation
  ON conversation_participant_states(conversation_id, updated_at DESC);

CREATE TABLE chat_client_instances (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  platform VARCHAR(64),
  device_label VARCHAR(255),
  status chat_client_instances_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_client_instances_workspace_member
  ON chat_client_instances(workspace_member_id, updated_at DESC);
CREATE INDEX idx_chat_client_instances_workspace
  ON chat_client_instances(workspace_id, updated_at DESC);

CREATE TABLE conversation_device_states (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  client_instance_id UUID NOT NULL REFERENCES chat_client_instances(id) ON DELETE RESTRICT,
  last_visible_sequence BIGINT NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  last_inbox_seq BIGINT NOT NULL DEFAULT 0,
  draft_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, client_instance_id)
);

CREATE INDEX idx_conversation_device_states_client
  ON conversation_device_states(client_instance_id, updated_at DESC);

CREATE TABLE workspace_member_conversation_views (
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  last_visible_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  last_visible_sequence BIGINT NOT NULL DEFAULT 0,
  last_visible_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_sort_key TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_member_id, conversation_id),
  CHECK (unread_count >= 0)
);

CREATE INDEX idx_workspace_member_conversation_views_workspace_member
  ON workspace_member_conversation_views(workspace_member_id, archived, updated_at DESC);
CREATE INDEX idx_workspace_member_conversation_views_conversation
  ON workspace_member_conversation_views(conversation_id, updated_at DESC);

CREATE TABLE remote_agent_conversation_views (
  remote_agent_id UUID NOT NULL REFERENCES remote_agents(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  last_read_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  last_read_sequence BIGINT NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  last_delivery_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (remote_agent_id, conversation_id),
  CHECK (unread_count >= 0)
);

CREATE INDEX idx_remote_agent_conversation_views_remote_agent
  ON remote_agent_conversation_views(remote_agent_id, updated_at DESC);
CREATE INDEX idx_remote_agent_conversation_views_conversation
  ON remote_agent_conversation_views(conversation_id, updated_at DESC);

CREATE TABLE remote_agent_message_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  remote_agent_id UUID NOT NULL REFERENCES remote_agents(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  status remote_agent_message_deliveries_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  last_acked_at TIMESTAMPTZ,
  -- W3C traceparent of the request that enqueued this delivery, captured at
  -- insert time. Lets a delivery replayed on daemon reconnect or by the retry
  -- worker (both of which run with NO active request span) still be sent to the
  -- daemon carrying its ORIGINATING trace, so the remote-agent turn correlates
  -- back to the user request that caused it. NULL when tracing was off at enqueue.
  origin_traceparent TEXT,
  -- The api-minted turn epoch this delivery was FIRST dispatched under — the
  -- durable identity of the remote-agent turn it belongs to. NULL until the
  -- first dispatch, then stamped once and REUSED on every retry so a re-notified
  -- delivery re-enters the same api-side turn-carrier bucket instead of churning
  -- a fresh never-fronted one (the eviction that dropped a queued origin). A new
  -- (still-NULL) delivery gets a fresh epoch = a new turn. Not a FK.
  turn_epoch TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(remote_agent_id, item_id)
);

CREATE INDEX idx_remote_agent_message_deliveries_remote_agent
  ON remote_agent_message_deliveries(remote_agent_id, status, updated_at DESC);

CREATE INDEX idx_remote_agent_message_deliveries_due
  ON remote_agent_message_deliveries(next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE workspace_member_sync_events (
  sync_seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Per-member, COMMIT-ordered, gap-free sequence. Unlike sync_seq (a global
  -- INSERT-time IDENTITY that is neither commit-ordered nor per-member
  -- contiguous), member_seq is assigned under an advisory lock inside the
  -- producing transaction (see appendWorkspaceMemberSyncEventInTransaction):
  -- the lock serializes that member's writes so commit order == member_seq
  -- order with no holes. This is the authoritative client sync cursor; getChatSync
  -- pages by `member_seq > cursor`.
  member_seq BIGINT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE RESTRICT,
  item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_member_id, member_seq)
);

CREATE INDEX idx_workspace_member_sync_events_cursor
  ON workspace_member_sync_events(workspace_member_id, sync_seq);
-- Authoritative cursor index: getChatSync pages by (workspace_member_id, member_seq).
CREATE INDEX idx_workspace_member_sync_events_member_seq
  ON workspace_member_sync_events(workspace_member_id, member_seq);
CREATE INDEX idx_workspace_member_sync_events_conversation
  ON workspace_member_sync_events(workspace_member_id, conversation_id, sync_seq DESC);

CREATE TABLE chat_conversation_create_requests (
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_member_id, client_request_id)
);

ALTER TABLE conversation_items ADD CONSTRAINT fk_conversation_items_author_participant
  FOREIGN KEY (author_participant_id) REFERENCES conversation_participants(id) ON DELETE SET NULL;

CREATE TABLE transport_message_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES conversation_items(id) ON DELETE RESTRICT,
  transport_account_id UUID NOT NULL REFERENCES transport_accounts(id) ON DELETE RESTRICT,
  transport_endpoint_id UUID NOT NULL REFERENCES transport_endpoints(id) ON DELETE RESTRICT,
  transport_kind transport_message_links_transport_kind NOT NULL,
  direction transport_message_links_direction NOT NULL,
  delivery_status transport_message_links_delivery_status NOT NULL DEFAULT 'pending',
  external_message_id VARCHAR(255),
  external_reply_to_id VARCHAR(255),
  external_thread_id VARCHAR(255),
  external_emoji_reactions JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, transport_endpoint_id, direction)
);

CREATE INDEX idx_transport_message_links_conversation
  ON transport_message_links(conversation_id, created_at DESC);
CREATE INDEX idx_transport_message_links_endpoint
  ON transport_message_links(transport_endpoint_id, created_at DESC);
CREATE INDEX idx_transport_message_links_status
  ON transport_message_links(delivery_status, created_at DESC);
CREATE INDEX idx_transport_message_links_reply_to
  ON transport_message_links(transport_endpoint_id, external_reply_to_id)
  WHERE external_reply_to_id IS NOT NULL;
CREATE UNIQUE INDEX uq_transport_message_links_inbound_external_message
  ON transport_message_links(transport_account_id, transport_endpoint_id, direction, external_message_id)
  WHERE direction = 'inbound'
    AND NULLIF(BTRIM(external_message_id), '') IS NOT NULL;

-- ============ Turns ============
CREATE TABLE turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  trigger_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  trigger_type VARCHAR(50) NOT NULL,
  status turns_status NOT NULL DEFAULT 'running',
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_turns_session_started ON turns(session_id, started_at DESC);
CREATE INDEX idx_turns_conversation_started ON turns(conversation_id, started_at DESC);

ALTER TABLE conversation_items ADD CONSTRAINT fk_conversation_items_turn
  FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE SET NULL;

-- ============ Payload Blobs ============
CREATE TABLE payload_blobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sha256 VARCHAR(64) UNIQUE NOT NULL,
  content_type payload_blobs_content_type NOT NULL,
  json_body JSONB,
  text_body TEXT,
  byte_size INT NOT NULL DEFAULT 0,
  retention_class payload_blobs_retention_class NOT NULL DEFAULT 'audit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (content_type = 'json' AND json_body IS NOT NULL) OR
    (content_type = 'text' AND text_body IS NOT NULL)
  )
);

-- ============ Provider Steps ============
CREATE TABLE provider_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turn_id UUID NOT NULL REFERENCES turns(id) ON DELETE RESTRICT,
  step_index INT NOT NULL,
  provider_type VARCHAR(64) NOT NULL CHECK (provider_type ~ '^[a-z][a-z0-9_-]*$'),
  request_type provider_steps_request_type NOT NULL,
  model_group_id UUID REFERENCES model_groups(id) ON DELETE SET NULL,
  model_binding_id UUID REFERENCES model_bindings(id) ON DELETE SET NULL,
  model_binding_version_id UUID REFERENCES model_binding_versions(id) ON DELETE RESTRICT,
  model_name VARCHAR(255) NOT NULL,
  capabilities_snapshot JSONB DEFAULT '{}',
  request_payload_blob_id UUID REFERENCES payload_blobs(id) ON DELETE SET NULL,
  response_payload_blob_id UUID REFERENCES payload_blobs(id) ON DELETE SET NULL,
  stop_reason VARCHAR(50),
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cost_micros BIGINT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  status provider_steps_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(turn_id, step_index)
);

CREATE INDEX idx_provider_steps_turn ON provider_steps(turn_id, step_index);
CREATE INDEX idx_provider_steps_binding ON provider_steps(model_binding_id);
CREATE INDEX idx_provider_steps_binding_version ON provider_steps(model_binding_version_id);

-- ============ Tool Calls ============
CREATE TABLE tool_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turn_id UUID NOT NULL REFERENCES turns(id) ON DELETE RESTRICT,
  provider_step_id UUID REFERENCES provider_steps(id) ON DELETE SET NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  call_index INT NOT NULL DEFAULT 0,
  provider_call_id VARCHAR(255),
  bundle_id UUID NOT NULL,
  -- The WIRE name the model actually saw (collision-safe, possibly qualified).
  -- History replay reads this verbatim — no NameRegistry needed for old turns.
  tool_name VARCHAR(255) NOT NULL,
  -- Immutable PUBLIC source snapshot frozen at call time (tool provenance &
  -- routing refactor). Survives hard-purge of the source entity, so audit stays
  -- fully readable even after the plugin install / device tool is gone.
  --   system : { kind, registryKey }
  --   plugin : { kind, installationId, upstreamToolName }
  --   runtime : { kind, runtimeToolId, exposureStableKey, runtimeName? }
  source_snapshot JSONB NOT NULL DEFAULT '{}',
  -- Provenance discriminator (single source axis). Written explicitly from the
  -- ToolRef at insert time and kept consistent with source_snapshot via CHECK.
  -- (A GENERATED column can't be used here: the text→enum cast is not IMMUTABLE.)
  source_kind tool_calls_source_kind NOT NULL,
  -- SOFT pointers to the live source entity. Convenience + referential
  -- integrity while the entity lives; nulled on hard purge (snapshot is the
  -- durable truth). Plugin points at the INSTALL instance, not the catalog id.
  plugin_installation_id UUID,
  runtime_tool_id UUID,
  normalized_input JSONB NOT NULL DEFAULT '{}',
  status tool_calls_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  -- source_kind must agree with the snapshot's discriminator.
  CONSTRAINT tool_calls_source_kind_matches_snapshot_ck CHECK (
    source_kind::text = (source_snapshot ->> 'kind')
  ),
  -- Source ↔ discriminator-column consistency (mutually exclusive by kind).
  CONSTRAINT tool_calls_source_columns_ck CHECK (
    (source_kind = 'system'
      AND plugin_installation_id IS NULL AND runtime_tool_id IS NULL)
    OR (source_kind = 'plugin'
      AND runtime_tool_id IS NULL)
    OR (source_kind = 'runtime'
      AND plugin_installation_id IS NULL)
  )
);

CREATE INDEX idx_tool_calls_turn ON tool_calls(turn_id, created_at);
CREATE INDEX idx_tool_calls_bundle ON tool_calls(bundle_id);
CREATE INDEX idx_tool_calls_provider_step ON tool_calls(provider_step_id);

-- ── tool_call_tasks — the unified Task (docs/task-unification-design.md) ─────
-- Single source of truth for "everything a principal waits on". Absorbs the old
-- tool_call_tasks lifecycle (revision / request_key / resolved_* / the
-- conversation feed item) so there is no second hand-synced row. Kind-specific
-- payload lives in request_payload (human_input / plan_approval) or in a 1:1
-- detail table (runtime_authorization / device_tool / external_mcp; CTI).
CREATE TABLE tool_call_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  -- Axis 1: where the result comes from.
  executor_kind tool_call_tasks_executor_kind NOT NULL,
  -- Axis 2: how the blocked waiter (agent) is woken. Derivable from the
  -- principal subject kind; denormalized for indexability. The DELIVERY KEY is
  -- principal_subject_id, never remote_agent_run_id.
  delivery_kind tool_call_tasks_delivery_kind NOT NULL,
  -- Axis 3: does a human see/answer this? needs_response ⇒ a task_requested
  -- feed card; silent ⇒ no chat item (agent-only, e.g. device_tool execution).
  human_surface tool_call_tasks_human_surface NOT NULL,
  -- The waiter principal (actor OR remote_agent). THE delivery key. Replaces the
  -- old actor_id NOT NULL. Deferred FK → access_subjects (added post-section).
  principal_subject_id UUID NOT NULL,
  -- Delivery-specific columns (conditional CHECK below):
  --   session_wakeup       ⇒ session_id NOT NULL (in-session actor)
  --   remote_agent_channel ⇒ principal subject is a remote_agent;
  --                          remote_agent_run_id OPTIONAL (ask/plan have it,
  --                          runtime_auth does not) — never the delivery key.
  session_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  remote_agent_run_id UUID REFERENCES remote_agent_runs(id) ON DELETE RESTRICT,
  turn_id UUID REFERENCES turns(id) ON DELETE SET NULL,
  source_tool_call_id UUID REFERENCES tool_calls(id) ON DELETE SET NULL,
  source_tool_name VARCHAR(255) NOT NULL,
  -- Lifecycle (pure state machine the agent polls) ⟂ outcome (business verdict).
  lifecycle_status tool_call_tasks_lifecycle_status NOT NULL DEFAULT 'working',
  outcome tool_call_tasks_outcome,
  status_message TEXT,
  supports_cancel BOOLEAN NOT NULL DEFAULT FALSE,
  supports_output_tail BOOLEAN NOT NULL DEFAULT FALSE,
  -- Optimistic-concurrency token for human task resolution.
  revision BIGINT NOT NULL DEFAULT 1,
  -- Dedupe key (content-derived for runtime_authorization, task-derived for
  -- user_input/plan_approval). Partial-unique while non-terminal (below) so a
  -- losing concurrent dispatch never materializes a second task.
  request_key TEXT NOT NULL,
  -- Human resolution provenance.
  requester_participant_id UUID REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  target_participant_id UUID REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  resolved_by_participant_id UUID REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  -- W3C traceparent of the request that flipped this task to a terminal
  -- lifecycle, captured at the single terminal-flip writer
  -- (tasks/repo.ts updateResolvedTaskRequestRow). Lets the agent:task:resolved
  -- frame REPLAYED on daemon reconnect (which runs with no resolver span)
  -- still carry the resolver's trace, mirroring
  -- remote_agent_message_deliveries.origin_traceparent. Persisted trace
  -- context is traceparent-only by design. NULL when tracing was off at
  -- resolution.
  resolution_traceparent TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}',
  immediate_result_payload JSONB NOT NULL DEFAULT '{}',
  final_result_payload JSONB NOT NULL DEFAULT '{}',
  final_error_payload JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  -- The task_requested feed item (needs_response tasks); also the completion
  -- notice anchor.
  conversation_item_id UUID UNIQUE REFERENCES conversation_items(id) ON DELETE SET NULL,
  completion_item_id UUID UNIQUE REFERENCES conversation_items(id) ON DELETE SET NULL,
  deadline_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  retention_ttl_ms BIGINT CHECK (retention_ttl_ms >= 0),
  retain_until TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancel_reason TEXT,
  last_output_seq BIGINT NOT NULL DEFAULT 0,
  last_output_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- outcome is set only on a completed lifecycle.
  CONSTRAINT tool_call_tasks_outcome_requires_completed_chk CHECK (
    outcome IS NULL OR lifecycle_status = 'completed'
  ),
  -- Delivery-specific column requirement (the principal-subject-kind half is
  -- enforced by tg_tool_call_tasks_delivery_validate after access_subjects).
  CONSTRAINT tool_call_tasks_delivery_columns_chk CHECK (
    (delivery_kind = 'session_wakeup' AND session_id IS NOT NULL)
    OR (delivery_kind = 'remote_agent_channel')
    OR (delivery_kind = 'none')
  )
);

CREATE INDEX idx_tool_call_tasks_session_status
  ON tool_call_tasks(session_id, lifecycle_status, created_at DESC)
  WHERE session_id IS NOT NULL;
CREATE INDEX idx_tool_call_tasks_source_tool_call
  ON tool_call_tasks(source_tool_call_id)
  WHERE source_tool_call_id IS NOT NULL;
CREATE INDEX idx_tool_call_tasks_conversation_status
  ON tool_call_tasks(conversation_id, lifecycle_status, created_at DESC);
CREATE INDEX idx_tool_call_tasks_remote_agent_run
  ON tool_call_tasks(remote_agent_run_id)
  WHERE remote_agent_run_id IS NOT NULL;
-- Dedupe: at most one live (non-terminal) task per (workspace, request_key).
CREATE UNIQUE INDEX idx_tool_call_tasks_pending_request_key
  ON tool_call_tasks(workspace_id, request_key)
  WHERE lifecycle_status IN ('submitted', 'working', 'input_required', 'auth_required');

CREATE TABLE tool_call_task_output_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  seq BIGINT NOT NULL,
  stream tool_call_task_output_chunks_stream NOT NULL,
  text_value TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, seq)
);

CREATE INDEX idx_tool_call_task_output_chunks_task
  ON tool_call_task_output_chunks(task_id, seq DESC);

-- ============ Tool Execution Attempts ============
CREATE TABLE tool_execution_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_call_id UUID NOT NULL REFERENCES tool_calls(id) ON DELETE RESTRICT,
  attempt_no INT NOT NULL,
  -- Provenance (plugin_installation / device_tool) is NOT duplicated here: it is
  -- the parent tool_calls row's single source of truth. attempts only carry
  -- execution-state. (tool provenance & routing refactor)
  transport VARCHAR(30),
  request_payload_blob_id UUID REFERENCES payload_blobs(id) ON DELETE SET NULL,
  response_payload_blob_id UUID REFERENCES payload_blobs(id) ON DELETE SET NULL,
  status tool_execution_attempts_status NOT NULL DEFAULT 'success',
  is_error BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tool_call_id, attempt_no)
);

CREATE INDEX idx_tool_execution_attempts_tool_call ON tool_execution_attempts(tool_call_id, attempt_no);

-- ============ Tool Results ============
CREATE TABLE tool_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_call_id UUID NOT NULL REFERENCES tool_calls(id) ON DELETE RESTRICT,
  attempt_id UUID REFERENCES tool_execution_attempts(id) ON DELETE SET NULL,
  result_index INT NOT NULL DEFAULT 0,
  is_error BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tool_call_id, result_index)
);

CREATE INDEX idx_tool_results_tool_call ON tool_results(tool_call_id, result_index);

-- ============ Tool Result Parts ============
CREATE TABLE tool_result_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_result_id UUID NOT NULL REFERENCES tool_results(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  part_type tool_result_parts_part_type NOT NULL,
  text_value TEXT,
  ref_path TEXT,
  ref_sha256 VARCHAR(64),
  json_value JSONB,
  mime_type VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  UNIQUE(tool_result_id, ordinal),
  CHECK (
    (part_type = 'text' AND text_value IS NOT NULL) OR
    (part_type = 'file_ref' AND ref_sha256 IS NOT NULL) OR
    (part_type = 'json' AND json_value IS NOT NULL)
  )
);

CREATE INDEX idx_tool_result_parts_result ON tool_result_parts(tool_result_id, ordinal);
CREATE INDEX idx_tool_result_parts_ref_sha ON tool_result_parts(ref_sha256) WHERE ref_sha256 IS NOT NULL;

CREATE TABLE session_wakeups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  turn_id UUID,
  source_type session_wakeups_source_type NOT NULL,
  source_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  source_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  source_participant_type session_wakeups_source_participant_type,
  source_participant_id UUID,
  source_name VARCHAR(255),
  summary TEXT NOT NULL,
  reason_text TEXT,
  status session_wakeups_status NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  -- W3C traceparent of the request that enqueued this wakeup, captured at insert.
  -- A wakeup that arrives while the session is already 'running' enqueues no
  -- think job, so this row is the only place its originating trace survives; the
  -- draining turn reads it back to add a span LINK (fan-in causal join). NULL
  -- when tracing was off at enqueue.
  origin_traceparent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_session_wakeups_session_created
  ON session_wakeups(session_id, created_at DESC);
CREATE INDEX idx_session_wakeups_session_status
  ON session_wakeups(session_id, status, created_at DESC);
CREATE INDEX idx_session_wakeups_turn
  ON session_wakeups(turn_id, created_at DESC) WHERE turn_id IS NOT NULL;
CREATE UNIQUE INDEX idx_session_wakeups_source_item_unique
  ON session_wakeups(session_id, source_type, source_item_id)
  WHERE source_item_id IS NOT NULL;

-- ============ Automation Runtime ============
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  category automation_rules_category NOT NULL,
  status automation_rules_status NOT NULL DEFAULT 'active',
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  created_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  last_triggered_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_rules_workspace
  ON automation_rules(workspace_id, created_at DESC);
CREATE INDEX idx_automation_rules_workspace_status
  ON automation_rules(workspace_id, status, created_at DESC);
CREATE INDEX idx_automation_rules_conversation
  ON automation_rules(conversation_id, created_at DESC);
CREATE INDEX idx_automation_rules_conversation_status
  ON automation_rules(conversation_id, status, created_at DESC);
CREATE INDEX idx_automation_rules_created_by_participant
  ON automation_rules(created_by_participant_id, created_at DESC);

CREATE TABLE automation_policies (
  rule_id UUID PRIMARY KEY REFERENCES automation_rules(id) ON DELETE RESTRICT,
  active_from TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  max_trigger_count INT CHECK (max_trigger_count IS NULL OR max_trigger_count > 0),
  trigger_count INT NOT NULL DEFAULT 0 CHECK (trigger_count >= 0),
  completion_status automation_policies_completion_status NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    active_from IS NULL OR active_until IS NULL OR active_until >= active_from
  )
);

CREATE INDEX idx_automation_policies_active_until
  ON automation_policies(active_until)
  WHERE active_until IS NOT NULL;

-- automation_event_source is a workspace_resources subtype (a 6th "child" of the
-- root). Its id is the workspace_resources root id (deferred root FK below, like
-- actors/remote_agents/installed_skills/plugin_installations/runtime_capabilities);
-- name/status/created_by_* now live on the root (display_name/status/created_by_subject_id).
CREATE TABLE automation_event_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider_kind automation_event_sources_provider_kind NOT NULL,
  provider_ref TEXT,
  webhook_endpoint_id UUID,
  integration_binding_id UUID,
  source_key VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  recommended_usage TEXT NOT NULL DEFAULT '',
  payload_schema JSONB NOT NULL DEFAULT '{}',
  example_payload JSONB NOT NULL DEFAULT '{}',
  last_triggered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (
      provider_kind = 'integration' AND
      integration_binding_id IS NOT NULL AND
      webhook_endpoint_id IS NULL
    ) OR (
      provider_kind <> 'integration' AND
      integration_binding_id IS NULL
    )
  ),
  CHECK (
    (
      provider_kind = 'webhook' AND
      webhook_endpoint_id IS NOT NULL
    ) OR (
      provider_kind IN ('device', 'internal', 'integration') AND
      webhook_endpoint_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX uq_automation_event_sources_provider_key_non_integration
  ON automation_event_sources(
    workspace_id,
    provider_kind,
    COALESCE(provider_ref, ''),
    COALESCE(webhook_endpoint_id::text, ''),
    source_key
  )
  WHERE provider_kind <> 'integration';
CREATE UNIQUE INDEX uq_automation_event_sources_integration_target_key
  ON automation_event_sources(
    workspace_id,
    integration_binding_id,
    source_key
  )
  WHERE provider_kind = 'integration';
CREATE INDEX idx_automation_event_sources_workspace
  ON automation_event_sources(workspace_id, created_at DESC);
CREATE INDEX idx_automation_event_sources_provider
  ON automation_event_sources(workspace_id, provider_kind, source_key, created_at DESC);
CREATE INDEX idx_automation_event_sources_endpoint
  ON automation_event_sources(webhook_endpoint_id)
  WHERE webhook_endpoint_id IS NOT NULL;
CREATE INDEX idx_automation_event_sources_integration_binding
  ON automation_event_sources(integration_binding_id, created_at DESC)
  WHERE integration_binding_id IS NOT NULL;

CREATE TABLE automation_triggers (
  rule_id UUID PRIMARY KEY REFERENCES automation_rules(id) ON DELETE RESTRICT,
  trigger_kind automation_triggers_trigger_kind NOT NULL,
  source_kind automation_triggers_source_kind NOT NULL,
  event_source_id UUID REFERENCES automation_event_sources(id) ON DELETE RESTRICT,
  source_locator TEXT,
  match_key VARCHAR(255),
  matcher JSONB NOT NULL DEFAULT '{}',
  schedule_kind automation_triggers_schedule_kind,
  schedule_expr VARCHAR(255),
  schedule_timezone VARCHAR(64),
  interval_seconds INT,
  starts_at TIMESTAMPTZ,
  next_fire_at TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (trigger_kind = 'schedule' AND source_kind = 'clock' AND event_source_id IS NULL) OR
    (trigger_kind = 'event' AND source_kind IN ('device', 'webhook', 'internal', 'integration') AND event_source_id IS NOT NULL)
  ),
  CHECK (
    (trigger_kind = 'schedule' AND schedule_kind IS NOT NULL) OR
    (trigger_kind = 'event' AND schedule_kind IS NULL)
  )
);

CREATE INDEX idx_automation_triggers_due
  ON automation_triggers(next_fire_at)
  WHERE trigger_kind = 'schedule';
CREATE INDEX idx_automation_triggers_event_source
  ON automation_triggers(event_source_id)
  WHERE event_source_id IS NOT NULL;
CREATE INDEX idx_automation_triggers_event_match
  ON automation_triggers(source_kind, match_key, source_locator)
  WHERE trigger_kind = 'event';

CREATE TABLE automation_deliveries (
  rule_id UUID PRIMARY KEY REFERENCES automation_rules(id) ON DELETE RESTRICT,
  message_text TEXT NOT NULL DEFAULT '',
  wake_reason_text TEXT,
  message_blocks JSONB NOT NULL DEFAULT '[]',
  target_policy automation_deliveries_target_policy NOT NULL DEFAULT 'all_members',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE automation_delivery_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE RESTRICT,
  target_participant_id UUID NOT NULL REFERENCES conversation_participants(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, target_participant_id)
);

CREATE OR REPLACE FUNCTION validate_automation_delivery_target_policy_for_rule(
  v_rule_id UUID
)
RETURNS void AS $$
DECLARE
  v_target_policy automation_deliveries_target_policy;
  v_target_count INT;
BEGIN
  SELECT delivery.target_policy
    INTO v_target_policy
    FROM automation_deliveries delivery
   WHERE delivery.rule_id = v_rule_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
    INTO v_target_count
    FROM automation_delivery_targets target
   WHERE target.rule_id = v_rule_id;

  IF v_target_policy = 'specified_members' AND v_target_count = 0 THEN
    RAISE EXCEPTION
      'automation delivery % uses specified_members but has no automation_delivery_targets rows',
      v_rule_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'automation_deliveries_target_policy_targets_chk';
  END IF;

  IF v_target_policy = 'all_members' AND v_target_count <> 0 THEN
    RAISE EXCEPTION
      'automation delivery % uses all_members but still has % automation_delivery_targets rows',
      v_rule_id,
      v_target_count
      USING ERRCODE = '23514',
            CONSTRAINT = 'automation_deliveries_target_policy_targets_chk';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_automation_delivery_target_policy()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'automation_deliveries' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM validate_automation_delivery_target_policy_for_rule(OLD.rule_id);
    ELSE
      PERFORM validate_automation_delivery_target_policy_for_rule(NEW.rule_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM validate_automation_delivery_target_policy_for_rule(OLD.rule_id);
    RETURN NULL;
  END IF;

  PERFORM validate_automation_delivery_target_policy_for_rule(NEW.rule_id);

  IF TG_OP = 'UPDATE' AND OLD.rule_id IS DISTINCT FROM NEW.rule_id THEN
    PERFORM validate_automation_delivery_target_policy_for_rule(OLD.rule_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER automation_deliveries_target_policy_chk
AFTER INSERT OR UPDATE OF target_policy OR DELETE ON automation_deliveries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_automation_delivery_target_policy();

CREATE CONSTRAINT TRIGGER automation_delivery_targets_policy_chk
AFTER INSERT OR UPDATE OR DELETE ON automation_delivery_targets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_automation_delivery_target_policy();

CREATE INDEX idx_automation_delivery_targets_rule
  ON automation_delivery_targets(rule_id, created_at);

CREATE TABLE automation_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  status automation_webhook_endpoints_status NOT NULL DEFAULT 'active',
  path_token VARCHAR(64) UNIQUE NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_hint VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_webhook_endpoints_workspace
  ON automation_webhook_endpoints(workspace_id, created_at DESC);

ALTER TABLE automation_event_sources
  ADD CONSTRAINT fk_automation_event_sources_webhook_endpoint
  FOREIGN KEY (webhook_endpoint_id)
  REFERENCES automation_webhook_endpoints(id)
  ON DELETE RESTRICT;

CREATE TABLE automation_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_kind automation_occurrences_source_kind NOT NULL,
  event_source_id UUID REFERENCES automation_event_sources(id) ON DELETE SET NULL,
  source_locator TEXT,
  match_key VARCHAR(255),
  dedupe_key VARCHAR(255),
  source_snapshot JSONB NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_automation_occurrences_event_source_dedupe
  ON automation_occurrences(workspace_id, event_source_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND event_source_id IS NOT NULL;
CREATE UNIQUE INDEX uq_automation_occurrences_source_kind_dedupe
  ON automation_occurrences(workspace_id, source_kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND event_source_id IS NULL;
CREATE INDEX idx_automation_occurrences_workspace_created
  ON automation_occurrences(workspace_id, created_at DESC);
CREATE INDEX idx_automation_occurrences_event_source
  ON automation_occurrences(event_source_id, created_at DESC)
  WHERE event_source_id IS NOT NULL;
CREATE INDEX idx_automation_occurrences_event_match
  ON automation_occurrences(workspace_id, source_kind, match_key, source_locator, created_at DESC);

CREATE TABLE automation_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE RESTRICT,
  occurrence_id UUID NOT NULL REFERENCES automation_occurrences(id) ON DELETE RESTRICT,
  status automation_executions_status NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, occurrence_id)
);

CREATE INDEX idx_automation_executions_rule_created
  ON automation_executions(rule_id, created_at DESC);
CREATE INDEX idx_automation_executions_status_created
  ON automation_executions(status, created_at);
CREATE INDEX idx_automation_executions_occurrence
  ON automation_executions(occurrence_id, created_at DESC);

CREATE TABLE automation_execution_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES automation_executions(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  target_participant_id UUID REFERENCES conversation_participants(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  target_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  created_item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  wakeup_id UUID REFERENCES session_wakeups(id) ON DELETE SET NULL,
  status automation_execution_targets_status NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_execution_targets_execution
  ON automation_execution_targets(execution_id, created_at);
CREATE INDEX idx_automation_execution_targets_session
  ON automation_execution_targets(session_id, created_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX idx_automation_execution_targets_conversation
  ON automation_execution_targets(conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

ALTER TABLE session_wakeups
  ADD COLUMN automation_execution_id UUID REFERENCES automation_executions(id) ON DELETE SET NULL,
  ADD COLUMN automation_occurrence_id UUID REFERENCES automation_occurrences(id) ON DELETE SET NULL;

CREATE INDEX idx_session_wakeups_automation_execution
  ON session_wakeups(automation_execution_id, created_at DESC)
  WHERE automation_execution_id IS NOT NULL;
CREATE INDEX idx_session_wakeups_automation_occurrence
  ON session_wakeups(automation_occurrence_id, created_at DESC)
  WHERE automation_occurrence_id IS NOT NULL;

-- ============ Memory Runtime ============
-- subject-scope-refactor D4: memory_spaces rewrite. Replaces the legacy
-- `space_type + 5 anchor_*_id` shape with `(owner_subject_id, scope_subject_id?,
-- namespace_key)`. Owner kinds are restricted via the
-- tg_memory_space_validate trigger to {workspace_member, actor, remote_agent,
-- workspace, conversation} — user/external/platform can never own a space.
-- Scope (when present) must be workspace|conversation per is_scope_eligible_subject.
CREATE TABLE memory_spaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  owner_subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  namespace_key VARCHAR(255) NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_memory_spaces_scoped
  ON memory_spaces(workspace_id, owner_subject_id, scope_subject_id, namespace_key)
  WHERE scope_subject_id IS NOT NULL;

CREATE UNIQUE INDEX uq_memory_spaces_unscoped
  ON memory_spaces(workspace_id, owner_subject_id, namespace_key)
  WHERE scope_subject_id IS NULL;

CREATE INDEX idx_memory_spaces_owner ON memory_spaces(owner_subject_id);
CREATE INDEX idx_memory_spaces_workspace ON memory_spaces(workspace_id);

CREATE TABLE memory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  memory_space_id UUID NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
  category memory_items_category NOT NULL,
  state memory_items_state NOT NULL DEFAULT 'active',
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  confidence REAL NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  tags TEXT[] DEFAULT '{}',
  text_digest TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  index_status memory_items_index_status NOT NULL DEFAULT 'lexical_ready',
  active_index_version INT NOT NULL DEFAULT 0,
  staged_index_version INT,
  embedding_model TEXT NOT NULL DEFAULT '',
  embedding_dim INT,
  indexed_at TIMESTAMPTZ,
  index_error TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual',
  source_item_id UUID,
  source_tool_call_id UUID,
  source_turn_id UUID,
  supersedes_item_id UUID REFERENCES memory_items(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_items_workspace ON memory_items(workspace_id, created_at DESC);
CREATE INDEX idx_memory_items_space ON memory_items(memory_space_id, updated_at DESC);
CREATE INDEX idx_memory_items_state ON memory_items(workspace_id, state, updated_at DESC);
CREATE INDEX idx_memory_items_tags ON memory_items USING GIN(tags);

CREATE TABLE memory_item_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_item_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  part_type memory_item_parts_part_type NOT NULL,
  text_value TEXT,
  ref_path TEXT,
  ref_sha256 VARCHAR(64),
  json_value JSONB,
  mime_type VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  UNIQUE(memory_item_id, ordinal),
  CHECK (
    (part_type = 'text' AND text_value IS NOT NULL) OR
    (part_type = 'file_ref' AND ref_sha256 IS NOT NULL) OR
    (part_type = 'json' AND json_value IS NOT NULL)
  )
);

CREATE INDEX idx_memory_item_parts_item ON memory_item_parts(memory_item_id, ordinal);
CREATE INDEX idx_memory_item_parts_ref_sha ON memory_item_parts(ref_sha256) WHERE ref_sha256 IS NOT NULL;

CREATE TABLE memory_item_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_item_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  index_version INT NOT NULL,
  chunk_index INT NOT NULL,
  chunk_kind TEXT NOT NULL DEFAULT 'body',
  search_text TEXT NOT NULL,
  embedding VECTOR(1024),
  token_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(memory_item_id, index_version, chunk_index)
);

CREATE INDEX idx_memory_item_chunks_item ON memory_item_chunks(memory_item_id, index_version, chunk_index);
CREATE INDEX idx_memory_item_chunks_workspace ON memory_item_chunks(workspace_id, created_at DESC);
CREATE INDEX idx_memory_item_chunks_fts ON memory_item_chunks USING GIN(to_tsvector('simple', search_text));
CREATE INDEX idx_memory_item_chunks_trgm ON memory_item_chunks USING GIN(search_text gin_trgm_ops);
CREATE INDEX idx_memory_item_chunks_hnsw ON memory_item_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE memory_embedding_cache (
  model_id TEXT NOT NULL,
  input_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  embedding_dim INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (model_id, input_type, content_hash),
  CHECK (input_type = 'passage')
);

CREATE INDEX idx_memory_embedding_cache_updated_at
  ON memory_embedding_cache(updated_at DESC);

CREATE TABLE memory_recall_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  recall_type memory_recall_runs_recall_type NOT NULL,
  query_text TEXT NOT NULL DEFAULT '',
  query_blocks JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_recall_runs_workspace ON memory_recall_runs(workspace_id, created_at DESC);
CREATE INDEX idx_memory_recall_runs_actor ON memory_recall_runs(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_memory_recall_runs_conversation ON memory_recall_runs(conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_memory_recall_runs_workspace_member ON memory_recall_runs(workspace_member_id, created_at DESC) WHERE workspace_member_id IS NOT NULL;

CREATE TABLE memory_recall_run_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES memory_recall_runs(id) ON DELETE RESTRICT,
  memory_item_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE RESTRICT,
  matched_chunk_id UUID REFERENCES memory_item_chunks(id) ON DELETE SET NULL,
  rank INT NOT NULL,
  final_score REAL NOT NULL DEFAULT 0,
  vector_score REAL,
  text_score REAL,
  similarity_score REAL,
  matched_terms TEXT[] DEFAULT '{}',
  recall_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_recall_run_results_run ON memory_recall_run_results(run_id, rank);
CREATE INDEX idx_memory_recall_run_results_memory ON memory_recall_run_results(memory_item_id, created_at DESC);

-- ============ Context Runtime ============
CREATE TABLE context_archive_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  chain_scope context_archive_points_chain_scope NOT NULL,
  parent_archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  covers_until_sequence BIGINT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (chain_scope = 'shared' AND session_id IS NULL) OR
    (chain_scope = 'private' AND session_id IS NOT NULL)
  )
);

CREATE INDEX idx_context_archive_points_conversation
  ON context_archive_points(conversation_id, chain_scope, covers_until_sequence DESC);
CREATE INDEX idx_context_archive_points_session
  ON context_archive_points(session_id, covers_until_sequence DESC) WHERE session_id IS NOT NULL;

CREATE TABLE context_archive_frames (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  archive_point_id UUID NOT NULL REFERENCES context_archive_points(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  role context_archive_frames_role NOT NULL,
  frame_type VARCHAR(50) NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  source_item_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  UNIQUE(archive_point_id, ordinal)
);

CREATE INDEX idx_context_archive_frames_point
  ON context_archive_frames(archive_point_id, ordinal);

CREATE TABLE context_archive_frame_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  archive_frame_id UUID NOT NULL REFERENCES context_archive_frames(id) ON DELETE RESTRICT,
  ordinal INT NOT NULL,
  part_type context_archive_frame_parts_part_type NOT NULL,
  text_value TEXT,
  ref_path TEXT,
  ref_sha256 VARCHAR(64),
  json_value JSONB,
  mime_type VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  UNIQUE(archive_frame_id, ordinal),
  CHECK (
    (part_type = 'text' AND text_value IS NOT NULL) OR
    (part_type = 'file_ref' AND ref_sha256 IS NOT NULL) OR
    (part_type = 'json' AND json_value IS NOT NULL)
  )
);

CREATE INDEX idx_context_archive_frame_parts_frame
  ON context_archive_frame_parts(archive_frame_id, ordinal);
CREATE INDEX idx_context_archive_frame_parts_ref_sha
  ON context_archive_frame_parts(ref_sha256) WHERE ref_sha256 IS NOT NULL;

CREATE TABLE context_compaction_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  chain_scope context_compaction_runs_chain_scope NOT NULL,
  strategy_key VARCHAR(255) NOT NULL,
  base_archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  output_archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  status context_compaction_runs_status NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (chain_scope = 'shared' AND session_id IS NULL) OR
    (chain_scope = 'private' AND session_id IS NOT NULL)
  )
);

CREATE INDEX idx_context_compaction_runs_conversation
  ON context_compaction_runs(conversation_id, chain_scope, started_at DESC);
CREATE INDEX idx_context_compaction_runs_session
  ON context_compaction_runs(session_id, started_at DESC) WHERE session_id IS NOT NULL;

CREATE TABLE context_compaction_run_inputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES context_compaction_runs(id) ON DELETE RESTRICT,
  input_kind context_compaction_run_inputs_input_kind NOT NULL,
  archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  from_sequence BIGINT,
  to_sequence BIGINT,
  item_id UUID REFERENCES conversation_items(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  CHECK (
    (input_kind = 'archive_point' AND archive_point_id IS NOT NULL AND from_sequence IS NULL AND to_sequence IS NULL AND item_id IS NULL) OR
    (input_kind = 'sequence_range' AND archive_point_id IS NULL AND from_sequence IS NOT NULL AND to_sequence IS NOT NULL AND item_id IS NULL) OR
    (input_kind = 'item' AND archive_point_id IS NULL AND from_sequence IS NULL AND to_sequence IS NULL AND item_id IS NOT NULL)
  )
);

CREATE INDEX idx_context_compaction_run_inputs_run
  ON context_compaction_run_inputs(run_id);

CREATE TABLE conversation_context_states (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE RESTRICT,
  active_shared_archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_context_states (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE RESTRICT,
  active_private_archive_point_id UUID REFERENCES context_archive_points(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_interrupts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  type session_interrupts_type NOT NULL,
  content TEXT NOT NULL,
  from_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  is_consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_interrupts_target
  ON session_interrupts(target_session_id) WHERE is_consumed = FALSE;

-- ============ Runtime Events ============
CREATE TABLE runtime_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  turn_id UUID REFERENCES turns(id) ON DELETE SET NULL,
  provider_step_id UUID REFERENCES provider_steps(id) ON DELETE SET NULL,
  tool_call_id UUID REFERENCES tool_calls(id) ON DELETE SET NULL,
  tool_attempt_id UUID REFERENCES tool_execution_attempts(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source runtime_events_source NOT NULL,
  level runtime_events_level NOT NULL DEFAULT 'info',
  event_type VARCHAR(50) NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runtime_events_workspace_time ON runtime_events(workspace_id, created_at DESC);
CREATE INDEX idx_runtime_events_turn_time ON runtime_events(turn_id, created_at DESC) WHERE turn_id IS NOT NULL;
CREATE INDEX idx_runtime_events_tool_call_time ON runtime_events(tool_call_id, created_at DESC) WHERE tool_call_id IS NOT NULL;

-- ============ Skill Runtime ============
CREATE TABLE installed_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  icon_file_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  current_version INT NOT NULL DEFAULT 1,
  current_snapshot_id UUID NOT NULL REFERENCES skill_snapshots(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE skill_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES installed_skills(id) ON DELETE RESTRICT,
  version INT NOT NULL,
  skill_snapshot_id UUID NOT NULL REFERENCES skill_snapshots(id) ON DELETE RESTRICT,
  metadata JSONB DEFAULT '{}',
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_id, version)
);

CREATE TABLE skill_source_refs (
  skill_id UUID PRIMARY KEY REFERENCES installed_skills(id) ON DELETE RESTRICT,
  source_catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
  source_catalog_version_id UUID REFERENCES catalog_versions(id) ON DELETE SET NULL,
  sync_mode skill_source_refs_sync_mode NOT NULL DEFAULT 'manual_merge',
  is_customized BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Plugin Runtime ============
CREATE TABLE plugin_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  catalog_version_id UUID NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT,
  config_data JSONB NOT NULL DEFAULT '{}',
  approved_runtime_permissions TEXT[] DEFAULT '{}',
  reuse_scope plugin_installations_reuse_scope NOT NULL DEFAULT 'conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plugin_installations_item ON plugin_installations(catalog_item_id, created_at DESC);

CREATE TABLE automation_integration_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  installation_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE RESTRICT,
  provider automation_integration_bindings_provider NOT NULL,
  ingress_kind automation_integration_bindings_ingress_kind NOT NULL,
  target_kind automation_integration_bindings_target_kind NOT NULL,
  target_id TEXT NOT NULL,
  target_label VARCHAR(255) NOT NULL,
  webhook_endpoint_id UUID REFERENCES automation_webhook_endpoints(id) ON DELETE RESTRICT,
  external_subscription_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (
      ingress_kind = 'webhook' AND
      webhook_endpoint_id IS NOT NULL
    ) OR (
      ingress_kind = 'polling' AND
      webhook_endpoint_id IS NULL
    )
  ),
  UNIQUE(workspace_id, installation_id, provider, ingress_kind, target_kind, target_id)
);

CREATE UNIQUE INDEX uq_automation_integration_bindings_webhook_endpoint
  ON automation_integration_bindings(webhook_endpoint_id)
  WHERE webhook_endpoint_id IS NOT NULL;
CREATE INDEX idx_automation_integration_bindings_workspace
  ON automation_integration_bindings(workspace_id, created_at DESC);
CREATE INDEX idx_automation_integration_bindings_installation
  ON automation_integration_bindings(installation_id, created_at DESC);
ALTER TABLE automation_integration_bindings
  ADD CONSTRAINT fk_automation_integration_bindings_workspace_resource_root
  FOREIGN KEY (installation_id, workspace_id)
  REFERENCES workspace_resources(id, workspace_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE automation_event_sources
  ADD CONSTRAINT fk_automation_event_sources_integration_binding
  FOREIGN KEY (integration_binding_id)
  REFERENCES automation_integration_bindings(id)
  ON DELETE RESTRICT;

CREATE TABLE plugin_auth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  catalog_version_id UUID REFERENCES catalog_versions(id) ON DELETE SET NULL,
  installation_id UUID REFERENCES plugin_installations(id) ON DELETE RESTRICT,
  binding_key VARCHAR(100) NOT NULL,
  driver VARCHAR(100) NOT NULL,
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  status plugin_auth_sessions_status NOT NULL DEFAULT 'pending',
  phase VARCHAR(64),
  state VARCHAR(255) UNIQUE,
  challenge_payload JSONB DEFAULT '{}',
  transient_payload JSONB DEFAULT '{}',
  error_code VARCHAR(120),
  error_message TEXT,
  result_preview JSONB DEFAULT '{}',
  result_payload JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plugin_auth_sessions_workspace ON plugin_auth_sessions(workspace_id, created_at DESC);
CREATE INDEX idx_plugin_auth_sessions_item ON plugin_auth_sessions(catalog_item_id, created_at DESC);
CREATE INDEX idx_plugin_auth_sessions_workspace_member ON plugin_auth_sessions(workspace_member_id, created_at DESC);
ALTER TABLE plugin_auth_sessions
  ADD CONSTRAINT fk_plugin_auth_sessions_workspace_resource_root
  FOREIGN KEY (installation_id, workspace_id)
  REFERENCES workspace_resources(id, workspace_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE plugin_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installation_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  binding_key VARCHAR(100) NOT NULL,
  driver VARCHAR(100) NOT NULL,
  external_account_id VARCHAR(255),
  display_name VARCHAR(255),
  avatar_url TEXT,
  status plugin_connections_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  public_payload JSONB DEFAULT '{}',
  secret_payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plugin_connections_installation ON plugin_connections(installation_id, created_at DESC);
CREATE INDEX idx_plugin_connections_binding ON plugin_connections(binding_key, created_at DESC);
ALTER TABLE plugin_connections
  ADD CONSTRAINT fk_plugin_connections_workspace_resource_root
  FOREIGN KEY (installation_id, workspace_id)
  REFERENCES workspace_resources(id, workspace_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE plugin_source_refs (
  installation_id UUID PRIMARY KEY REFERENCES plugin_installations(id) ON DELETE RESTRICT,
  source_catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
  source_catalog_version_id UUID REFERENCES catalog_versions(id) ON DELETE SET NULL,
  sync_mode plugin_source_refs_sync_mode NOT NULL DEFAULT 'manual_merge',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Workspace Resource Grants ============
CREATE TABLE workspace_resource_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_resource_id UUID NOT NULL REFERENCES workspace_resources(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  permissions workspace_resource_grant_permission[] NOT NULL,
  conversation_type_mask_override INT
    CHECK (conversation_type_mask_override IS NULL OR (conversation_type_mask_override > 0 AND conversation_type_mask_override <= 15)),
  status workspace_resource_grants_status NOT NULL DEFAULT 'active',
  source workspace_resource_grants_source NOT NULL DEFAULT 'manual',
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_workspace_resource_grants_active
  ON workspace_resource_grants(
    workspace_resource_id,
    subject_id,
    scope_subject_id
  ) NULLS NOT DISTINCT
  WHERE status = 'active';
CREATE INDEX idx_workspace_resource_grants_workspace
  ON workspace_resource_grants(workspace_id, created_at DESC);
CREATE INDEX idx_workspace_resource_grants_resource
  ON workspace_resource_grants(workspace_resource_id, status, created_at DESC);
CREATE INDEX idx_workspace_resource_grants_subject
  ON workspace_resource_grants(subject_id, status, created_at DESC);

CREATE TABLE workspace_resource_grant_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_resource_id UUID NOT NULL REFERENCES workspace_resources(id) ON DELETE RESTRICT,
  grantee_subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  grantee_scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  requested_permissions workspace_resource_grant_permission[] NOT NULL,
  requester_workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  status workspace_resource_grant_requests_status NOT NULL DEFAULT 'pending',
  resolved_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workspace_resource_grant_requests_pending
  ON workspace_resource_grant_requests(
    workspace_resource_id,
    requester_workspace_member_id,
    grantee_subject_id,
    grantee_scope_subject_id
  ) NULLS NOT DISTINCT
  WHERE status = 'pending';
CREATE INDEX idx_workspace_resource_grant_requests_workspace
  ON workspace_resource_grant_requests(workspace_id, status, created_at DESC);
CREATE INDEX idx_workspace_resource_grant_requests_resource
  ON workspace_resource_grant_requests(workspace_resource_id, status, created_at DESC);
CREATE INDEX idx_workspace_resource_grant_requests_requester
  ON workspace_resource_grant_requests(requester_workspace_member_id, status, created_at DESC);

-- ── tool_call_task_runtime_authorization (CTI detail) ───────────────────────
-- 1:1 detail for executor_kind='runtime_authorization'. Kept as a typed detail
-- table (not folded into request_payload JSONB) because these are real FK
-- columns with ON DELETE RESTRICT + dispatch indexes: a device delete must not
-- silently orphan a pending authorization, and the scope-drift gate compares
-- the frozen principal_scope_subject_id. The 1:1 binding to tool_call_tasks is
-- enforced by tg_tool_call_tasks_detail_consistency.
CREATE TABLE tool_call_task_runtime_authorization (
  task_id UUID PRIMARY KEY REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  runtime_id UUID NOT NULL,                         -- FK added at bottom
  runtime_capability_id UUID NOT NULL,              -- FK added at bottom
  runtime_exposure_id UUID NOT NULL,                -- FK added at bottom
  requested_tool_name TEXT NOT NULL,
  runtime_tool_stable_key TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  request_mode runtime_authorization_request_mode NOT NULL,
  source_runtime_session_id TEXT,
  source_retry_nonce TEXT,
  source_request_args JSONB NOT NULL DEFAULT '{}',
  -- subject-scope-refactor: principal columns (subject_id, scope_subject_id),
  -- both → access_subjects via deferred FK (post-access_subjects ALTER).
  -- principal_subject_id NOT NULL (every dispatch has a known principal);
  -- principal_scope_subject_id nullable (only when actor/remote_agent is an
  -- active conversation participant). ON DELETE RESTRICT so durable audit can't
  -- lose its principal. NOTE: this scope subject is the runtime-auth-specific
  -- frozen value used by the scope-drift gate, distinct from the parent task's
  -- principal_subject_id (the delivery key).
  principal_subject_id UUID NOT NULL,              -- FK added at bottom
  principal_scope_subject_id UUID,                 -- FK added at bottom
  requested_action JSONB NOT NULL DEFAULT '{}',
  grant_options JSONB NOT NULL DEFAULT '[]',
  available_presets JSONB NOT NULL DEFAULT '[]',
  dedupe_key TEXT NOT NULL
);

-- ── tool_call_task_runtime_tool (CTI detail) ─────────────────────────────────
-- 1:1 detail for executor_kind='runtime_tool'. Fully wired in the device
-- rendezvous (design §3.6 / step 4). The async device lifecycle is recorded on
-- the runtime_operations ledger (transport sub-state); this row carries the
-- task-side device binding. FK columns added at the bottom ALTER section.
CREATE TABLE tool_call_task_runtime_tool (
  task_id UUID PRIMARY KEY REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  runtime_id UUID NOT NULL,                          -- FK added at bottom
  runtime_capability_id UUID NOT NULL,               -- FK added at bottom
  runtime_exposure_id UUID NOT NULL,                 -- FK added at bottom
  tool_id UUID NOT NULL,                            -- FK added at bottom
  tool_revision_id UUID NOT NULL,                   -- FK added at bottom
  runtime_operation_id UUID,                         -- FK added at bottom (the ledger row)
  task_mode runtime_operations_task_mode NOT NULL DEFAULT 'async',
  input_hash VARCHAR(128) NOT NULL DEFAULT '',
  operation_timeout_ms INT
);

-- ── tool_call_task_external_mcp (CTI detail) ────────────────────────────────
-- 1:1 detail for executor_kind='external_mcp'. Wired behind the RC-shaped MCP
-- wire adapter (design §3.3 / step 5). Mirrors the upstream MCP task handle.
CREATE TABLE tool_call_task_external_mcp (
  task_id UUID PRIMARY KEY REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  plugin_installation_id UUID,                      -- FK added at bottom
  upstream_task_id TEXT,
  wire_version TEXT NOT NULL DEFAULT '2026-07-28',
  poll_interval_ms BIGINT CHECK (poll_interval_ms >= 0),
  ttl_ms BIGINT CHECK (ttl_ms >= 0)
);

-- ── tool_call_task_action_tokens ────────────────────────────────────────────
-- Short, opaque tokens minted by `tasks/action-tokens.ts` when a
-- needs_response task is projected onto an IM transport that supports
-- interaction_prompt (e.g. QQ Inline Keyboard). The token lives in the button's
-- `action.data`; on click the connector redeems it to recover the full respond
-- payload. NOT one-shot — idempotence comes from tool_call_task_response_commands'
-- (task_id, command_id) dedup.
CREATE TABLE tool_call_task_action_tokens (
  token UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tool_call_task_action_tokens_task
  ON tool_call_task_action_tokens(task_id);
CREATE INDEX idx_tool_call_task_action_tokens_expires
  ON tool_call_task_action_tokens(expires_at);

-- ────────────────────────────────────────────────────────────────────
-- tool_call_task_transport_projections
--
-- Durable "this needs_response task must be (re)projected onto an IM
-- transport" state. Inserted from the core task-creation tx so projection
-- cannot be lost on crash. Consumed by the projection worker:
--    binding resolve → mint tokens → create conversation item →
--    persist link → enqueue delivery   (inside a SAVEPOINT).
--
-- Status lifecycle: pending → projected | skipped | failed.
-- `ON CONFLICT (task_id) DO UPDATE … WHERE status='skipped' AND error IN (...)`
-- in the creation path lets reuse trigger a re-project after a binding fix.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE tool_call_task_transport_projections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL UNIQUE REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'projected', 'skipped', 'failed')),
  transport_message_link_id UUID REFERENCES transport_message_links(id) ON DELETE SET NULL,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tool_call_task_transport_projections_pending
  ON tool_call_task_transport_projections(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX idx_tool_call_task_transport_projections_skipped_recovery
  ON tool_call_task_transport_projections(workspace_id, conversation_id, error)
  WHERE status = 'skipped';
CREATE INDEX idx_tool_call_task_transport_projections_link
  ON tool_call_task_transport_projections(transport_message_link_id)
  WHERE transport_message_link_id IS NOT NULL;

-- Help the account/binding recovery helpers find bindings to flip when a
-- QQ account's webhookInboundConfirmed/connectionMode/status changes.
CREATE INDEX idx_conversation_transport_bindings_account
  ON conversation_transport_bindings(transport_account_id, conversation_id);

-- Idempotency ledger for task resolution commands.
CREATE TABLE tool_call_task_response_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tool_call_tasks(id) ON DELETE RESTRICT,
  command_id UUID NOT NULL,
  base_revision BIGINT NOT NULL,
  outcome TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}',
  response_payload JSONB NOT NULL DEFAULT '{}',
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  -- Snapshot so the append-only audit row keeps its actor after the member is
  -- soft-deleted/purged (matches the prevailing created_by_* pattern).
  created_by_workspace_member_id_snapshot UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tool_call_task_response_commands_task_command_unique
    UNIQUE (task_id, command_id)
);

CREATE OR REPLACE FUNCTION validate_tool_call_task_detail_consistency()
RETURNS trigger AS $$
DECLARE
  v_task_id UUID;
  v_executor_kind tool_call_tasks_executor_kind;
  v_has_runtime_authorization BOOLEAN;
  v_has_runtime_tool BOOLEAN;
  v_has_external_mcp BOOLEAN;
  v_detail_count INT;
BEGIN
  -- CTI consistency: a task whose executor_kind has a detail table must have
  -- exactly that one detail row; human_input / plan_approval have none (their
  -- payload lives in tool_call_tasks.request_payload).
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'tool_call_tasks' THEN
      v_task_id := OLD.id;
    ELSE
      v_task_id := OLD.task_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'tool_call_tasks' THEN
      v_task_id := NEW.id;
    ELSE
      v_task_id := NEW.task_id;
    END IF;
  END IF;

  SELECT t.executor_kind,
         EXISTS (
           SELECT 1 FROM tool_call_task_runtime_authorization d
           WHERE d.task_id = t.id
         ) AS has_runtime_authorization,
         EXISTS (
           SELECT 1 FROM tool_call_task_runtime_tool d
           WHERE d.task_id = t.id
         ) AS has_runtime_tool,
         EXISTS (
           SELECT 1 FROM tool_call_task_external_mcp d
           WHERE d.task_id = t.id
         ) AS has_external_mcp
    INTO
      v_executor_kind,
      v_has_runtime_authorization,
      v_has_runtime_tool,
      v_has_external_mcp
    FROM tool_call_tasks t
   WHERE t.id = v_task_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_detail_count :=
    v_has_runtime_authorization::INT +
    v_has_runtime_tool::INT +
    v_has_external_mcp::INT;

  IF v_executor_kind IN ('user_input', 'plan_approval') THEN
    IF v_detail_count <> 0 THEN
      RAISE EXCEPTION
        'tool_call_task % has executor_kind=% but carries a detail row (count=%)',
        v_task_id, v_executor_kind, v_detail_count
        USING ERRCODE = '23514',
              CONSTRAINT = 'tool_call_tasks_no_detail_chk';
    END IF;
    RETURN NULL;
  END IF;

  IF v_detail_count <> 1 THEN
    RAISE EXCEPTION
      'tool_call_task % must have exactly one detail row, found runtime_authorization=% runtime_tool=% external_mcp=%',
      v_task_id, v_has_runtime_authorization, v_has_runtime_tool, v_has_external_mcp
      USING ERRCODE = '23514',
            CONSTRAINT = 'tool_call_tasks_exactly_one_detail_chk';
  END IF;

  IF v_executor_kind = 'runtime_authorization' AND NOT v_has_runtime_authorization THEN
    RAISE EXCEPTION
      'tool_call_task % has executor_kind=runtime_authorization but is missing its detail row',
      v_task_id USING ERRCODE = '23514', CONSTRAINT = 'tool_call_tasks_kind_detail_match_chk';
  END IF;
  IF v_executor_kind = 'runtime_tool' AND NOT v_has_runtime_tool THEN
    RAISE EXCEPTION
      'tool_call_task % has executor_kind=runtime_tool but is missing its detail row',
      v_task_id USING ERRCODE = '23514', CONSTRAINT = 'tool_call_tasks_kind_detail_match_chk';
  END IF;
  IF v_executor_kind = 'external_mcp' AND NOT v_has_external_mcp THEN
    RAISE EXCEPTION
      'tool_call_task % has executor_kind=external_mcp but is missing its detail row',
      v_task_id USING ERRCODE = '23514', CONSTRAINT = 'tool_call_tasks_kind_detail_match_chk';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tool_call_tasks_detail_consistency_chk
AFTER INSERT OR UPDATE OF executor_kind OR DELETE ON tool_call_tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_tool_call_task_detail_consistency();

CREATE CONSTRAINT TRIGGER tool_call_task_runtime_authorization_parent_chk
AFTER INSERT OR UPDATE OR DELETE ON tool_call_task_runtime_authorization
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_tool_call_task_detail_consistency();

CREATE CONSTRAINT TRIGGER tool_call_task_runtime_tool_parent_chk
AFTER INSERT OR UPDATE OR DELETE ON tool_call_task_runtime_tool
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_tool_call_task_detail_consistency();

CREATE CONSTRAINT TRIGGER tool_call_task_external_mcp_parent_chk
AFTER INSERT OR UPDATE OR DELETE ON tool_call_task_external_mcp
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_tool_call_task_detail_consistency();

-- The active_*_task_id columns reference tool_call_tasks(id). These FKs cannot
-- be inline because tool_call_tasks depends on conversation_items which depends
-- on sessions.
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_active_plan_approval_task
  FOREIGN KEY (active_plan_approval_task_id)
  REFERENCES tool_call_tasks(id)
  ON DELETE SET NULL;

ALTER TABLE remote_agent_conversation_contexts ADD CONSTRAINT fk_remote_agent_conversation_contexts_active_task
  FOREIGN KEY (active_task_id)
  REFERENCES tool_call_tasks(id)
  ON DELETE SET NULL;

ALTER TABLE remote_agent_conversation_contexts ADD CONSTRAINT fk_remote_agent_conversation_contexts_active_plan_approval_task
  FOREIGN KEY (active_plan_approval_task_id)
  REFERENCES tool_call_tasks(id)
  ON DELETE SET NULL;

ALTER TABLE remote_agent_runs ADD CONSTRAINT fk_remote_agent_runs_task
  FOREIGN KEY (task_id)
  REFERENCES tool_call_tasks(id)
  ON DELETE SET NULL;

-- Runtime authorization grants (renamed from relay_authorization_grants in
-- PR #20; subject-scope-refactor: scope enum dropped in favor of the
-- subject_id + scope_subject_id pair).
CREATE TABLE runtime_authorization_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  runtime_id UUID NOT NULL,                         -- FK added at bottom
  runtime_capability_id UUID NOT NULL,              -- FK added at bottom
  runtime_exposure_id UUID NOT NULL,                -- FK added at bottom
  -- subject-scope-refactor: grant subject is unconditional now (NOT NULL).
  -- Deferred FK applied below in the post-access_subjects ALTER section.
  -- Wire-level "scope" labels (once / actor / conversation /
  -- scoped actor / remote_agent / workspace) are derived from
  -- (subject_kind, scope_subject_id, retention) via
  -- `subjectScopeLabel` + `presetToOwnerScope` in the runtime-authorizations
  -- service. The legacy `scope` enum column was dropped.
  subject_id UUID NOT NULL,
  -- Optional scope tightens visibility to a particular runtime context.
  -- Currently only (subject.kind ∈ {actor, remote_agent}, scope.kind=conversation)
  -- is supported; the tg_runtime_authorization_grant_validate trigger enforces
  -- the whitelist. Immediate FK so the trigger reads access_subjects
  -- synchronously; callers must upsert subject + scope BEFORE inserting.
  scope_subject_id UUID,                           -- FK added at bottom
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  -- Optional backref to the task that produced this grant.
  source_task_id UUID REFERENCES tool_call_tasks(id) ON DELETE SET NULL,
  retention runtime_authorization_grants_retention NOT NULL,
  status runtime_authorization_grants_status NOT NULL DEFAULT 'active',
  policy JSONB NOT NULL DEFAULT '{}',
  source_retry_nonce TEXT,
  source_runtime_session_id TEXT,
  source_request_args JSONB NOT NULL DEFAULT '{}',
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_call_task_runtime_authorization_runtime
  ON tool_call_task_runtime_authorization(runtime_id, task_id);
CREATE INDEX idx_tool_call_task_runtime_authorization_dedupe
  ON tool_call_task_runtime_authorization(dedupe_key);
CREATE INDEX idx_tool_call_task_response_commands_task
  ON tool_call_task_response_commands(task_id, created_at DESC);
CREATE INDEX idx_runtime_authorization_grants_capability
  ON runtime_authorization_grants(runtime_capability_id, status, created_at DESC);
CREATE INDEX idx_runtime_authorization_grants_subject
  ON runtime_authorization_grants(subject_id, scope_subject_id, status, created_at DESC);
-- subject-scope-refactor: four-dimension dispatch composite index for
-- selectAndClaimRuntimeAuthorizationGrant's canonical SELECT (workspace + device
-- + capability + exposure + subject + scope + status). Without this the
-- planner falls back to per-capability scan in concurrent dispatch.
CREATE INDEX idx_runtime_authorization_grants_dispatch
  ON runtime_authorization_grants(
    runtime_id, runtime_capability_id, runtime_exposure_id,
    subject_id, scope_subject_id, status
  );
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_workspace_resource_root
  FOREIGN KEY (runtime_capability_id, workspace_id)
  REFERENCES workspace_resources(id, workspace_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;
-- subject-scope-refactor: subject_id is now NOT NULL; deferred FK still added
-- post-access_subjects so the cross-reference works even if the tables are
-- created out of order at bootstrap.
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_subject
  FOREIGN KEY (subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_scope_subject
  FOREIGN KEY (scope_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
-- subject-scope-refactor: principal_subject_id / principal_scope_subject_id
-- FKs on tool_call_task_runtime_authorization. ON DELETE RESTRICT keeps durable
-- audit/request rows from losing their principal when a subject is deleted.
ALTER TABLE tool_call_task_runtime_authorization
  ADD CONSTRAINT fk_tool_call_task_runtime_authorization_principal_subject
  FOREIGN KEY (principal_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_authorization
  ADD CONSTRAINT fk_tool_call_task_runtime_authorization_principal_scope_subject
  FOREIGN KEY (principal_scope_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
CREATE INDEX idx_tool_call_task_runtime_authorization_principal_subject
  ON tool_call_task_runtime_authorization(principal_subject_id);

-- Task delivery key: principal_subject_id → access_subjects (deferred FK; the
-- table is created earlier than access_subjects at bootstrap). ON DELETE RESTRICT
-- so a task never loses its waiter principal.
ALTER TABLE tool_call_tasks
  ADD CONSTRAINT fk_tool_call_tasks_principal_subject
  FOREIGN KEY (principal_subject_id) REFERENCES access_subjects(id) ON DELETE RESTRICT;
CREATE INDEX idx_tool_call_tasks_principal_subject
  ON tool_call_tasks(principal_subject_id);

-- delivery_kind ↔ principal-subject-kind consistency (the half the inline CHECK
-- can't express without reading access_subjects): session_wakeup ⇒ actor;
-- remote_agent_channel ⇒ remote_agent. Deferred so callers may upsert the
-- subject within the same tx before the task row is visible.
CREATE OR REPLACE FUNCTION validate_tool_call_task_delivery()
RETURNS trigger AS $$
DECLARE
  v_subject_kind subject_kind;
BEGIN
  SELECT kind INTO v_subject_kind
    FROM access_subjects WHERE id = NEW.principal_subject_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tool_call_task % principal_subject_id % not found',
      NEW.id, NEW.principal_subject_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.delivery_kind = 'session_wakeup' AND v_subject_kind <> 'actor' THEN
    RAISE EXCEPTION
      'tool_call_task % delivery_kind=session_wakeup requires an actor principal (got %)',
      NEW.id, v_subject_kind
      USING ERRCODE = '23514', CONSTRAINT = 'tool_call_tasks_delivery_principal_chk';
  END IF;
  IF NEW.delivery_kind = 'remote_agent_channel' AND v_subject_kind <> 'remote_agent' THEN
    RAISE EXCEPTION
      'tool_call_task % delivery_kind=remote_agent_channel requires a remote_agent principal (got %)',
      NEW.id, v_subject_kind
      USING ERRCODE = '23514', CONSTRAINT = 'tool_call_tasks_delivery_principal_chk';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tool_call_tasks_delivery_validate_chk
AFTER INSERT OR UPDATE OF delivery_kind, principal_subject_id ON tool_call_tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_tool_call_task_delivery();

-- ============ Device Runtime v3 (devices subsystem) ============
-- See docs/device-runtime-v3.md §6. Device tables now own all runtime
-- capability state; the legacy relay_* tables were removed in PR #20.

-- ============ Runtime supertype (CTI root) ============
-- SOLE soft-delete root for a runtime; `devices`/`sandboxes` are detail tables
-- that inherit liveness via generated sd_fk_live_*_id → runtimes triggers.
CREATE TABLE runtimes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  kind runtimes_kind NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_runtimes_workspace ON runtimes(workspace_id, kind, created_at DESC);

-- ============ Sandbox detail (kind='sandbox') ============
-- First-class per-session sandbox; NO deleted_at (inherits from runtimes).
-- FKs (id→runtimes, session_id, pairing_session_id) live in the bottom-ALTER
-- block (targets defined later / CTI-cycle). Mint sites in devices/repo.ts INSERT
-- the row; the provision/teardown paths in sandbox/repo.ts UPDATE it.
CREATE TABLE sandboxes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  session_id UUID,
  mode sandboxes_mode NOT NULL,
  adapter TEXT NOT NULL,
  state sandboxes_state NOT NULL DEFAULT 'provisioning',
  resource_id TEXT,
  host_pid INT,
  pairing_session_id UUID,
  capability_descriptor JSONB NOT NULL DEFAULT '{}',
  data_plane_cert_fingerprint TEXT,
  -- R4 #6: off-box data-plane credentials, AES-256-GCM envelope (nonce‖ct‖tag,
  -- base64; AAD bound to sandboxId(‖workspaceId)). Nullable: NULL for host-side/
  -- resident adapters and any bare adapter that mints no data-plane token — only the
  -- off-box cubesandbox adapter persists a non-null envelope. (R6 H-9 / R8) A
  -- NON-NULL value MUST be the `enc:b1:` envelope WITH a non-empty payload — a cheap
  -- internal-integrity CHECK that fail-closes a plaintext/corrupt/empty write at the
  -- DB layer (the encoder always emits base64 of nonce‖tag, so the payload is never
  -- empty; `_%` requires ≥1 char after the prefix, rejecting a bare `enc:b1:`).
  data_plane_credentials_encrypted TEXT
    CHECK (
      data_plane_credentials_encrypted IS NULL
      OR data_plane_credentials_encrypted LIKE 'enc:b1:_%'
    ),
  -- Runtime platform facts for the capability projection's bundle/OS-guard logic.
  -- local adapter: the API host's process.platform/process.arch; docker: 'linux' +
  -- the container's declared arch; off-box (Cube): provider-declared. R3.P2d:
  -- NOT NULL + fail-closed (no back-compat) — every sandbox mint site populates
  -- these, and a cloud bootstrap that omits them is rejected at the wire, so the
  -- capability projection never has to guess a sandbox's platform.
  platform VARCHAR(40) NOT NULL,              -- darwin, linux, win32
  arch VARCHAR(32) NOT NULL,                  -- x64, arm64, ... (process.arch)
  -- R3.6: durable process-identity token for a local sandbox's host_pid, of the
  -- form '<boot_id>:<starttime>' (Linux /proc). Recovery signals a persisted PID
  -- ONLY when this token still matches, eliminating the PID-reuse kill-wrong-
  -- process hazard. NULL for docker/off-box (no host pid) and non-Linux hosts.
  host_pid_identity TEXT,
  deadline_at TIMESTAMPTZ,
  -- R5 #6 (multi-replica durable fencing). Monotonic teardown ownership token.
  -- The teardown that flips active/provisioning→'closing' bumps this and captures
  -- N; it re-reads it right BEFORE the irreversible cluster (provider VM DELETE →
  -- dir rm → mount-close → soft-delete) and aborts if it changed (a concurrent
  -- teardown on another replica took over), and every terminal DB write carries
  -- WHERE teardown_epoch=N. This fences the destructive side effects across
  -- processes — the state-CAS alone only makes the final row transition idempotent.
  teardown_epoch BIGINT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX idx_sandboxes_reconcile ON sandboxes(adapter, state) WHERE state NOT IN ('closed', 'failed');
-- R4 #4 (F3-corrected): at most ONE live (provisioning|active) sandbox per session.
-- The predicate is IN ('provisioning','active') — NOT NOT-IN('closed','failed') —
-- so a single 'closing' straggler (the R3.4-shield / pull-failure transient) can
-- coexist with a fresh provision without wedging re-provision. Wrong-sandbox kill
-- is prevented by the explicit-runtimeId teardown (the closing reaper tears down
-- the specific runtimes.id it found), and a genuinely-stuck 'closing' row is
-- force-'failed' by the closing reaper after a bounded grace.
CREATE UNIQUE INDEX uq_sandboxes_live_session ON sandboxes(session_id)
  WHERE session_id IS NOT NULL AND state IN ('provisioning', 'active');
-- R3.P2b: TTL-reap sweep index — sandboxes stuck in 'provisioning' past deadline_at.
CREATE INDEX idx_sandboxes_reap ON sandboxes(state, deadline_at) WHERE state = 'provisioning';

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  owner_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  device_type devices_device_type NOT NULL DEFAULT 'desktop_computer',
  platform VARCHAR(40),                       -- darwin, linux, win32
  arch VARCHAR(32),                            -- x64, arm64, ... (process.arch). Combined with platform forms the platformKey the device-runtime bundles manifest keys on.
  public_key TEXT NOT NULL,
  public_key_fingerprint VARCHAR(128) NOT NULL UNIQUE,
  trust_status devices_trust_status NOT NULL DEFAULT 'pending',
  conversation_type_mask_override INT
    CHECK (conversation_type_mask_override IS NULL OR (conversation_type_mask_override > 0 AND conversation_type_mask_override <= 15)),
  last_seen_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_catalog_changed_at TIMESTAMPTZ,
  automation_lifecycle_state devices_automation_lifecycle_state,
  automation_lifecycle_grace_until TIMESTAMPTZ,
  automation_lifecycle_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devices_workspace ON devices(workspace_id, created_at DESC);
CREATE INDEX idx_devices_automation_lifecycle_due
  ON devices(automation_lifecycle_grace_until)
  WHERE automation_lifecycle_grace_until IS NOT NULL;

CREATE TABLE runtime_pairing_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  requested_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  runtime_id UUID REFERENCES runtimes(id) ON DELETE SET NULL,
  mode runtime_pairing_sessions_mode NOT NULL,
  -- Which runtime kind this pairing will mint — drives the consume fork (a docker
  -- sandbox pairing sets 'sandbox'; a device pairing uses the 'device' DEFAULT).
  target_runtime_kind runtimes_kind NOT NULL DEFAULT 'device',
  server_base_url TEXT NOT NULL,
  requested_title VARCHAR(255),
  requested_description TEXT,
  requested_device_type devices_device_type,
  -- local_qr / service_join: pairing_code is the short user-visible code.
  -- cloud_bootstrap: bootstrap_token_hash holds a hash of the one-time token;
  -- pairing_code stays NULL in that mode. Enforced by the CHECK below.
  pairing_code VARCHAR(32) UNIQUE,
  bootstrap_token_hash BYTEA,
  verification_uri TEXT,
  verification_uri_complete TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  status runtime_pairing_sessions_status NOT NULL DEFAULT 'pending',
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_runtime_pairing_sessions_mode_payload CHECK (
    (mode = 'local_qr' AND pairing_code IS NOT NULL AND bootstrap_token_hash IS NULL)
    OR
    (mode = 'cloud_bootstrap' AND bootstrap_token_hash IS NOT NULL AND pairing_code IS NULL)
  )
);
CREATE INDEX idx_runtime_pairing_sessions_workspace
  ON runtime_pairing_sessions(workspace_id, created_at DESC);
CREATE INDEX idx_runtime_pairing_sessions_runtime
  ON runtime_pairing_sessions(runtime_id, status, created_at DESC)
  WHERE runtime_id IS NOT NULL;

CREATE TABLE runtime_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE RESTRICT,
  service_kind runtime_services_service_kind NOT NULL,
  version TEXT,                                       -- runtime build for device_runtime; NULL for daemon (use remote_agent_runtime_catalog.version)
  status runtime_services_status NOT NULL DEFAULT 'starting',
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  -- current_session_id ONLY populated for service_kind='device_runtime'; the
  -- daemon does not open a CP WSS in v1. FK added at bottom (forward ref).
  current_session_id UUID,
  -- REQUIRED when service_kind='remote_agent_daemon'; NULL for runtime.
  -- ON DELETE CASCADE so removing the underlying machine row drops the
  -- daemon association row too.
  remote_agent_machine_id UUID REFERENCES remote_agent_machines(id) ON DELETE RESTRICT,
  -- Server-issued path token used by the device to register its tunnel
  -- endpoint. The frp control-plane URL must include `/d/<tunnel_path_token>`
  -- so device.tunnel.up requests for one device can never claim another
  -- device's route. Set at first device.hello (random 32-byte hex);
  -- persisted so the device can re-use it across reconnects.
  tunnel_path_token VARCHAR(64),
  -- bare_dataplane (Mode-B sandbox) reachability: no CP session / tunnel; the API
  -- dials this endpoint directly (scheme-tagged: inprocess:/docker-exec:/https).
  data_plane_endpoint TEXT,
  -- Reachability class for this service's data plane (§3). Provision-time fact set
  -- from the resolved SANDBOX_TRANSPORT / adapter transportDefault (or established at
  -- tunnel.up for a real device); NOT re-derived per dispatch. Default 'none' keeps a
  -- freshly-minted CP-only service registry-miss-safe until a data plane comes up.
  transport runtime_services_transport NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(runtime_id, service_kind),
  CONSTRAINT chk_runtime_services_kind_payload CHECK (
    (service_kind = 'remote_agent_daemon'
      AND remote_agent_machine_id IS NOT NULL
      AND current_session_id IS NULL
      AND data_plane_endpoint IS NULL)
    OR
    (service_kind = 'device_runtime'
      AND remote_agent_machine_id IS NULL
      AND data_plane_endpoint IS NULL)
    OR
    (service_kind = 'bare_dataplane'
      AND remote_agent_machine_id IS NULL
      AND current_session_id IS NULL
      AND tunnel_path_token IS NULL
      AND data_plane_endpoint IS NOT NULL)
  ),
  -- Transport is constrained by service kind: a bare data plane is always API-dialed
  -- ('direct', including the degenerate in/exec planes); the remote-agent daemon has no
  -- data plane ('none'); a device_runtime may take any reachability (frp 'indirect',
  -- loopback/docker-internal 'direct', or CP-only 'none').
  CONSTRAINT chk_runtime_services_transport_kind CHECK (
    (service_kind = 'bare_dataplane' AND transport = 'direct')
    OR (service_kind = 'remote_agent_daemon' AND transport = 'none')
    OR (service_kind = 'device_runtime')
  )
);
CREATE INDEX idx_runtime_services_runtime ON runtime_services(runtime_id, service_kind);
-- One daemon-association row per underlying machine.
CREATE UNIQUE INDEX uq_runtime_services_daemon_machine
  ON runtime_services(remote_agent_machine_id)
  WHERE service_kind = 'remote_agent_daemon';

CREATE TABLE runtime_service_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES runtime_services(id) ON DELETE RESTRICT,
  pubkey TEXT NOT NULL,
  pubkey_fingerprint VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
-- Exactly one active key per service at any time. The CP handshake MUST
-- reject connections whose key has revoked_at IS NOT NULL.
CREATE UNIQUE INDEX uq_runtime_service_keys_active
  ON runtime_service_keys(service_id)
  WHERE revoked_at IS NULL;

CREATE TABLE runtime_control_plane_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES runtime_services(id) ON DELETE RESTRICT,
  protocol_version INT NOT NULL DEFAULT 1,
  client_version VARCHAR(64),
  status runtime_control_plane_sessions_status NOT NULL DEFAULT 'connecting',
  transport runtime_control_plane_sessions_transport NOT NULL DEFAULT 'websocket',
  remote_addr TEXT,
  last_sequence BIGINT NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  close_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_runtime_control_plane_sessions_runtime
  ON runtime_control_plane_sessions(runtime_id, status, started_at DESC);
CREATE INDEX idx_runtime_control_plane_sessions_service
  ON runtime_control_plane_sessions(service_id, status, started_at DESC);

CREATE TABLE runtime_exposures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES runtime_services(id) ON DELETE RESTRICT,
  stable_key VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  transport runtime_exposures_transport NOT NULL,
  builtin_kind runtime_exposures_builtin_kind,        -- only when transport='builtin'
  runtime_status runtime_exposures_runtime_status NOT NULL DEFAULT 'discovered',
  last_seen_at TIMESTAMPTZ,
  last_healthy_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(runtime_id, stable_key),
  CONSTRAINT chk_runtime_exposures_builtin_kind CHECK (
    (transport = 'builtin' AND builtin_kind IS NOT NULL)
    OR
    (transport <> 'builtin' AND builtin_kind IS NULL)
  )
);
CREATE INDEX idx_runtime_exposures_runtime
  ON runtime_exposures(runtime_id, runtime_status, last_seen_at DESC);
CREATE INDEX idx_runtime_exposures_service
  ON runtime_exposures(service_id, runtime_status, last_seen_at DESC);

CREATE TABLE runtime_capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exposure_id UUID NOT NULL UNIQUE REFERENCES runtime_exposures(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE actors
  ADD CONSTRAINT fk_actors_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE remote_agents
  ADD CONSTRAINT fk_remote_agents_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE installed_skills
  ADD CONSTRAINT fk_installed_skills_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE plugin_installations
  ADD CONSTRAINT fk_plugin_installations_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE runtime_capabilities
  ADD CONSTRAINT fk_runtime_capabilities_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE automation_event_sources
  ADD CONSTRAINT fk_automation_event_sources_workspace_resource_root
  FOREIGN KEY (id)
  REFERENCES workspace_resources(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE runtime_catalog_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exposure_id UUID NOT NULL REFERENCES runtime_exposures(id) ON DELETE RESTRICT,
  revision_seq BIGINT NOT NULL,
  schema_hash VARCHAR(128) NOT NULL,
  status runtime_catalog_revisions_status NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exposure_id, revision_seq)
);

CREATE TABLE runtime_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exposure_id UUID NOT NULL REFERENCES runtime_exposures(id) ON DELETE RESTRICT,
  stable_key VARCHAR(255) NOT NULL,
  latest_revision_id UUID,
  current_name VARCHAR(255) NOT NULL,
  status runtime_tools_status NOT NULL DEFAULT 'active',
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exposure_id, stable_key)
);

CREATE TABLE runtime_tool_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES runtime_tools(id) ON DELETE RESTRICT,
  catalog_revision_id UUID NOT NULL REFERENCES runtime_catalog_revisions(id) ON DELETE RESTRICT,
  tool_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema JSONB NOT NULL DEFAULT '{}',
  annotations JSONB NOT NULL DEFAULT '{}',
  definition_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tool_id, catalog_revision_id)
);

ALTER TABLE runtime_tools ADD CONSTRAINT fk_runtime_tools_latest_revision
  FOREIGN KEY (latest_revision_id) REFERENCES runtime_tool_revisions(id) ON DELETE SET NULL;

CREATE TABLE runtime_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  status runtime_sessions_status NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_runtime_sessions_runtime
  ON runtime_sessions(runtime_id, status, opened_at DESC);
CREATE INDEX idx_runtime_sessions_conversation
  ON runtime_sessions(conversation_id, status, opened_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE runtime_session_services (
  session_id UUID NOT NULL REFERENCES runtime_sessions(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES runtime_services(id) ON DELETE RESTRICT,
  status runtime_session_services_status NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, service_id)
);

CREATE TABLE runtime_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tool_call_tasks(id) ON DELETE SET NULL,
  -- Principal: the entity the call runs on behalf of (matches RuntimePrincipalContext).
  principal_kind runtime_operations_principal_kind NOT NULL,
  -- subject-scope-refactor: ON DELETE RESTRICT so the chk_runtime_operations_principal
  -- CHECK below (NOT NULL for all 4 kinds) cannot be violated by a subject
  -- deletion silently setting the column to NULL. Admins must archive/delete
  -- the runtime_operations row before the subject can be deleted.
  principal_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  -- Initiator: orthogonal to principal — the human who triggered the call,
  -- always recorded when applicable (e.g. workspace member triggered an actor
  -- turn that called a device tool: principal_kind='actor',
  -- initiated_by_workspace_member_id=<member>).
  initiated_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  initiated_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE RESTRICT,
  runtime_exposure_id UUID NOT NULL REFERENCES runtime_exposures(id) ON DELETE RESTRICT,
  runtime_capability_id UUID NOT NULL REFERENCES runtime_capabilities(id) ON DELETE RESTRICT,
  catalog_revision_id UUID NOT NULL REFERENCES runtime_catalog_revisions(id) ON DELETE RESTRICT,
  tool_id UUID NOT NULL REFERENCES runtime_tools(id) ON DELETE RESTRICT,
  tool_revision_id UUID NOT NULL REFERENCES runtime_tool_revisions(id) ON DELETE RESTRICT,
  visible_tool_name VARCHAR(255) NOT NULL,
  runtime_session_id UUID REFERENCES runtime_sessions(id) ON DELETE SET NULL,
  task_mode runtime_operations_task_mode NOT NULL DEFAULT 'sync',
  status runtime_operations_status NOT NULL DEFAULT 'created',
  input_payload JSONB NOT NULL DEFAULT '{}',
  authorization_payload JSONB NOT NULL DEFAULT '{}',
  input_hash VARCHAR(128) NOT NULL,
  operation_timeout_ms INT,
  expires_at TIMESTAMPTZ,
  result_hash VARCHAR(128),
  error_code VARCHAR(100),
  error_message TEXT,
  requires_replan BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- subject-scope-refactor: principal_subject_id is REQUIRED for all 4 allowed
  -- principal_kinds (no workspace_member exception). principal_kind ↔
  -- access_subjects.kind consistency + workspace consistency is an app-only
  -- invariant enforced by deriveOperationPrincipalAudit at dispatch boundary;
  -- DB only enforces non-null (cross-table CHECK in PG requires deferrable
  -- constraint trigger, which is not cost-effective here). Regression tests
  -- lock that raw-SQL inserts of inconsistent (kind, subject) combos remain
  -- possible (known limitation) and that the dispatch path itself produces
  -- 100% consistent rows. See docs/device-runtime-v3.md §6 Notes.
  CONSTRAINT chk_runtime_operations_principal CHECK (
    principal_kind IN ('actor', 'conversation', 'remote_agent', 'workspace_member')
    AND principal_subject_id IS NOT NULL
  )
);
CREATE INDEX idx_runtime_operations_runtime_status
  ON runtime_operations(runtime_id, status, created_at DESC);
CREATE INDEX idx_runtime_operations_task
  ON runtime_operations(task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX idx_runtime_operations_runtime_session
  ON runtime_operations(runtime_session_id)
  WHERE runtime_session_id IS NOT NULL;
ALTER TABLE runtime_operations
  ADD CONSTRAINT fk_runtime_operations_workspace_resource_root
  FOREIGN KEY (runtime_capability_id, workspace_id)
  REFERENCES workspace_resources(id, workspace_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE runtime_operation_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES runtime_operations(id) ON DELETE RESTRICT,
  attempt_seq BIGINT NOT NULL,
  transport runtime_operation_attempts_transport NOT NULL,
  runtime_service_id UUID NOT NULL REFERENCES runtime_services(id) ON DELETE RESTRICT,
  runtime_control_plane_session_id UUID REFERENCES runtime_control_plane_sessions(id) ON DELETE SET NULL,
  tunnel_internal_url TEXT,
  mcp_request_id TEXT,
  envelope_signature_kid TEXT,
  status runtime_operation_attempts_status NOT NULL DEFAULT 'issued',
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(operation_id, attempt_seq)
);
CREATE INDEX idx_runtime_operation_attempts_service
  ON runtime_operation_attempts(runtime_service_id, status, created_at DESC);

CREATE TABLE runtime_operation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL UNIQUE REFERENCES runtime_operations(id) ON DELETE RESTRICT,
  output_payload JSONB NOT NULL DEFAULT '{}',
  output_preview TEXT,
  result_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forward-reference FKs deferred because their target tables (devices,
-- runtime_capabilities, runtime_exposures) sit
-- after the consuming tables in the file. v3 ALTER block below.
ALTER TABLE runtime_services
  ADD CONSTRAINT fk_runtime_services_current_session
  FOREIGN KEY (current_session_id) REFERENCES runtime_control_plane_sessions(id) ON DELETE SET NULL;
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_runtime
  FOREIGN KEY (runtime_id) REFERENCES runtimes(id) ON DELETE RESTRICT;
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_runtime_capability
  FOREIGN KEY (runtime_capability_id) REFERENCES runtime_capabilities(id) ON DELETE RESTRICT;
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_runtime_authorization_grants_runtime_exposure
  FOREIGN KEY (runtime_exposure_id) REFERENCES runtime_exposures(id) ON DELETE RESTRICT;
-- subject-scope-refactor: conversation context is expressed by
-- (subject_id → actor/remote_agent subject, scope_subject_id → conversation
-- subject) and enforced by tg_runtime_authorization_grant_validate.
ALTER TABLE tool_call_task_runtime_authorization
  ADD CONSTRAINT fk_tool_call_task_runtime_auth_runtime
  FOREIGN KEY (runtime_id) REFERENCES runtimes(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_authorization
  ADD CONSTRAINT fk_tool_call_task_runtime_auth_runtime_capability
  FOREIGN KEY (runtime_capability_id) REFERENCES runtime_capabilities(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_authorization
  ADD CONSTRAINT fk_tool_call_task_runtime_auth_runtime_exposure
  FOREIGN KEY (runtime_exposure_id) REFERENCES runtime_exposures(id) ON DELETE RESTRICT;

-- Indexes covering the runtime-capability column so chat dispatch reading runtime-capability
-- grants stays on an index plan.
CREATE INDEX idx_tool_call_task_runtime_auth_runtime_capability
  ON tool_call_task_runtime_authorization(runtime_capability_id, task_id);

-- runtime_tool detail FKs (executor_kind='runtime_tool'; design §3.6 / step 4).
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_runtime
  FOREIGN KEY (runtime_id) REFERENCES runtimes(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_runtime_capability
  FOREIGN KEY (runtime_capability_id) REFERENCES runtime_capabilities(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_runtime_exposure
  FOREIGN KEY (runtime_exposure_id) REFERENCES runtime_exposures(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_tool
  FOREIGN KEY (tool_id) REFERENCES runtime_tools(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_tool_revision
  FOREIGN KEY (tool_revision_id) REFERENCES runtime_tool_revisions(id) ON DELETE RESTRICT;
ALTER TABLE tool_call_task_runtime_tool
  ADD CONSTRAINT fk_tool_call_task_runtime_tool_operation
  FOREIGN KEY (runtime_operation_id) REFERENCES runtime_operations(id) ON DELETE SET NULL;
CREATE INDEX idx_tool_call_task_runtime_tool_runtime_capability
  ON tool_call_task_runtime_tool(runtime_capability_id, task_id);

-- ============================================================================
-- ★ CTI root pins + §6.3 unified-authz anchors/pins (runtime/sandbox generalize)
-- ============================================================================
-- runtime_exposures gains workspace_id (persistCatalogSync sets it from the
-- authenticated runtime). UNIQUE(id,workspace_id) is the composite-FK anchor for
-- runtime_capabilities; the (runtime_id,workspace_id) pin guards workspace drift
-- vs the exposure's authoritative runtime. Table is empty at bootstrap so the
-- bare NOT NULL add is safe.
ALTER TABLE runtime_exposures ADD COLUMN workspace_id UUID NOT NULL;
ALTER TABLE runtime_exposures
  ADD CONSTRAINT uq_runtime_exposures_id_ws UNIQUE (id, workspace_id);
ALTER TABLE runtime_exposures
  ADD CONSTRAINT fk_runtime_exposures_runtime_ws
  FOREIGN KEY (runtime_id, workspace_id) REFERENCES runtimes(id, workspace_id)
  DEFERRABLE INITIALLY DEFERRED;

-- runtime_capabilities gains workspace_id + UNIQUE(id,workspace_id) (its
-- workspace_resources composite root pin anchor) + the mandated exposure pin so
-- the denormalized workspace_id cannot silently drift from the capability's
-- authoritative exposure/runtime. exposure_id is already UNIQUE.
ALTER TABLE runtime_capabilities ADD COLUMN workspace_id UUID NOT NULL;
ALTER TABLE runtime_capabilities
  ADD CONSTRAINT uq_runtime_capabilities_id_ws UNIQUE (id, workspace_id);
ALTER TABLE runtime_capabilities
  ADD CONSTRAINT fk_runtime_capabilities_exposure_ws
  FOREIGN KEY (exposure_id, workspace_id) REFERENCES runtime_exposures(id, workspace_id)
  DEFERRABLE INITIALLY DEFERRED;

-- runtime_authorization_grants: optional backref to the governing resource grant
-- (audit/refine edge; SET NULL so purging the grant does not block).
ALTER TABLE runtime_authorization_grants
  ADD COLUMN governing_resource_grant_id UUID
  REFERENCES workspace_resource_grants(id) ON DELETE SET NULL;
-- Grant-side composite FKs — IMMEDIATE (NOT deferred): surface workspace drift at
-- the INSERT, exactly as the deleted tg validate principal block did.
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_rag_runtime_ws
  FOREIGN KEY (runtime_id, workspace_id) REFERENCES runtimes(id, workspace_id);
ALTER TABLE runtime_authorization_grants
  ADD CONSTRAINT fk_rag_exposure_ws
  FOREIGN KEY (runtime_exposure_id, workspace_id)
  REFERENCES runtime_exposures(id, workspace_id);

-- ★ CTI root pins — TWO FKs per detail, BOTH DEFERRABLE INITIALLY DEFERRED.
-- (1) single-column id→runtimes(id): liveIntegrity=enforce → GENERATES
--     sd_fk_live_devices_id / sd_fk_live_sandboxes_id and folds runtimes_live
--     into devices_live/sandboxes_live. Mirrors fk_actors_workspace_resource_root.
--     DEFERRABLE preserves detail-first insert order for the deferred
--     detail-consistency trigger and the P2 sandbox provisioning path.
-- (2) composite (id,workspace_id)→runtimes(id,workspace_id): the §2.4
--     workspace-drift pin (liveIntegrity=none).
ALTER TABLE devices
  ADD CONSTRAINT fk_devices_runtime_root
  FOREIGN KEY (id) REFERENCES runtimes(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sandboxes
  ADD CONSTRAINT fk_sandboxes_runtime_root
  FOREIGN KEY (id) REFERENCES runtimes(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE devices
  ADD CONSTRAINT fk_devices_runtime_ws
  FOREIGN KEY (id, workspace_id) REFERENCES runtimes(id, workspace_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sandboxes
  ADD CONSTRAINT fk_sandboxes_runtime_ws
  FOREIGN KEY (id, workspace_id) REFERENCES runtimes(id, workspace_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
-- sandboxes side pointers (targets defined earlier; SET NULL, acyclic).
ALTER TABLE sandboxes
  ADD CONSTRAINT fk_sandboxes_session
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sandboxes
  ADD CONSTRAINT fk_sandboxes_pairing_session
  FOREIGN KEY (pairing_session_id) REFERENCES runtime_pairing_sessions(id) ON DELETE SET NULL;

-- external_mcp detail FK (executor_kind='external_mcp'; design §3.3 / step 5).
ALTER TABLE tool_call_task_external_mcp
  ADD CONSTRAINT fk_tool_call_task_external_mcp_installation
  FOREIGN KEY (plugin_installation_id) REFERENCES plugin_installations(id) ON DELETE SET NULL;

-- ============ Chat push notification tokens (S7) ============
CREATE TABLE IF NOT EXISTS chat_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  token TEXT NOT NULL,
  device_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_member_id, token)
);

CREATE INDEX IF NOT EXISTS idx_chat_push_tokens_workspace_member
  ON chat_push_tokens(workspace_member_id);

-- ============================================================================
-- subject-scope-refactor: subject + scope SQL helpers and validation triggers
-- ============================================================================
-- These helpers + triggers enforce the (subject, scope?) two-tuple model that
-- replaced the polymorphic (kind + N nullable FK + scope enum) shape on
-- workspace_resource_grants, runtime_authorization_grants, and (Batch 11)
-- memory_spaces / memory_access_grants. All triggers are immediate (not
-- deferred) — callers MUST `upsertAccessSubjectOnTrx(trx, ...)` (Kysely) or
-- `upsertAccessSubjectOn(qx, ...)` (pg QueryExecutor) BEFORE inserting any row
-- with subject_id / scope_subject_id, so the trigger can read access_subjects
-- synchronously.
-- ============================================================================

-- Predicate: subject kinds that can legitimately anchor a workspace-bound
-- authorization row (workspace_resource_grants, runtime_authorization_grants,
-- memory_access_grants). Excludes user / external / platform. NOTE: external is
-- workspace-rooted (it carries workspace_id) but is intentionally still excluded
-- here — first-class external identities are not yet authorization principals;
-- opening that is a deliberate future step (see plan's "后续可选").
CREATE OR REPLACE FUNCTION is_workspace_bound_subject_kind(p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_kind subject_kind;
BEGIN
  IF p_subject_id IS NULL THEN RETURN FALSE; END IF;
  SELECT kind INTO v_kind FROM access_subjects WHERE id = p_subject_id;
  IF v_kind IS NULL THEN RETURN FALSE; END IF;
  RETURN v_kind IN ('workspace', 'workspace_member', 'actor', 'remote_agent', 'conversation');
END;
$$;

-- Predicate: subject kinds eligible to be a scope (i.e., a runtime context).
-- Only workspace and conversation are valid scopes.
CREATE OR REPLACE FUNCTION is_scope_eligible_subject(p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_kind subject_kind;
BEGIN
  IF p_subject_id IS NULL THEN RETURN TRUE; END IF;  -- NULL scope is always valid (means "unscoped")
  SELECT kind INTO v_kind FROM access_subjects WHERE id = p_subject_id;
  IF v_kind IS NULL THEN RETURN FALSE; END IF;
  RETURN v_kind IN ('workspace', 'conversation');
END;
$$;

-- Predicate: subject kinds allowed as memory_spaces.owner_subject_id (stricter
-- than workspace-bound — excludes platform-wide kinds AND any future kind that
-- doesn't have a stable "owner-of-memory" semantics).
CREATE OR REPLACE FUNCTION is_memory_owner_subject_kind(p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_kind subject_kind;
BEGIN
  IF p_subject_id IS NULL THEN RETURN FALSE; END IF;
  SELECT kind INTO v_kind FROM access_subjects WHERE id = p_subject_id;
  IF v_kind IS NULL THEN RETURN FALSE; END IF;
  RETURN v_kind IN ('workspace', 'workspace_member', 'actor', 'remote_agent', 'conversation');
END;
$$;

-- Predicate: subject kinds allowed as workspace_resources.owner_subject_id. The
-- owner of a workspace resource is a workspace_member (a person) or an agentic
-- identity (actor / remote_agent). Workspaces, conversations, users, external
-- and platform are not valid resource owners.
CREATE OR REPLACE FUNCTION is_workspace_resource_owner_subject_kind(p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_kind subject_kind;
BEGIN
  IF p_subject_id IS NULL THEN RETURN FALSE; END IF;
  SELECT kind INTO v_kind FROM access_subjects WHERE id = p_subject_id;
  IF v_kind IS NULL THEN RETURN FALSE; END IF;
  RETURN v_kind IN ('workspace_member', 'actor', 'remote_agent');
END;
$$;

-- Helper: resolve the workspace_id of an access_subjects row. NULL for
-- platform-wide subjects (user / platform) or unknown subject_id. external is
-- workspace-rooted and returns its workspace_id (denormalized, kept consistent
-- with its transport_address via the composite FK).
CREATE OR REPLACE FUNCTION access_subject_workspace_id(p_subject_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_workspace_id UUID;
BEGIN
  IF p_subject_id IS NULL THEN RETURN NULL; END IF;
  SELECT workspace_id INTO v_workspace_id FROM access_subjects WHERE id = p_subject_id;
  RETURN v_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_member_workspace_id(p_workspace_member_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_workspace_id UUID;
BEGIN
  IF p_workspace_member_id IS NULL THEN RETURN NULL; END IF;
  SELECT workspace_id INTO v_workspace_id
    FROM workspace_members
   WHERE id = p_workspace_member_id;
  RETURN v_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION assert_workspace_resource_detail_consistency(p_workspace_resource_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_kind workspace_resources_kind;
  v_workspace_id UUID;
  v_has_actor BOOLEAN;
  v_has_remote_agent BOOLEAN;
  v_has_installed_skill BOOLEAN;
  v_has_plugin_installation BOOLEAN;
  v_has_runtime_capability BOOLEAN;
  v_has_automation_event_source BOOLEAN;
  v_detail_count INT;
BEGIN
  IF p_workspace_resource_id IS NULL THEN
    RETURN;
  END IF;

  SELECT kind, workspace_id
    INTO v_kind, v_workspace_id
    FROM workspace_resources
   WHERE id = p_workspace_resource_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS(
           SELECT 1 FROM actors
            WHERE id = p_workspace_resource_id
         ),
         EXISTS(
           SELECT 1 FROM remote_agents
            WHERE id = p_workspace_resource_id
         ),
         EXISTS(
           SELECT 1 FROM installed_skills
            WHERE id = p_workspace_resource_id
         ),
         EXISTS(
           SELECT 1 FROM plugin_installations
            WHERE id = p_workspace_resource_id
         ),
         EXISTS(
           SELECT 1 FROM runtime_capabilities
            WHERE id = p_workspace_resource_id
         ),
         EXISTS(
           SELECT 1 FROM automation_event_sources
            WHERE id = p_workspace_resource_id
         )
    INTO v_has_actor,
         v_has_remote_agent,
         v_has_installed_skill,
         v_has_plugin_installation,
         v_has_runtime_capability,
         v_has_automation_event_source;

  v_detail_count :=
    v_has_actor::INT +
    v_has_remote_agent::INT +
    v_has_installed_skill::INT +
    v_has_plugin_installation::INT +
    v_has_runtime_capability::INT +
    v_has_automation_event_source::INT;

  IF v_detail_count <> 1 THEN
    RAISE EXCEPTION
      'workspace_resource % kind=% must have exactly one matching detail row, found actor=% remote_agent=% installed_skill=% plugin_installation=% runtime_capability=% automation_event_source=%',
      p_workspace_resource_id,
      v_kind,
      v_has_actor,
      v_has_remote_agent,
      v_has_installed_skill,
      v_has_plugin_installation,
      v_has_runtime_capability,
      v_has_automation_event_source
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_exactly_one_detail_chk';
  END IF;

  IF v_kind = 'actor' AND NOT v_has_actor THEN
    RAISE EXCEPTION
      'workspace_resource % kind=actor is missing its actor detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  ELSIF v_kind = 'remote_agent' AND NOT v_has_remote_agent THEN
    RAISE EXCEPTION
      'workspace_resource % kind=remote_agent is missing its remote_agent detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  ELSIF v_kind = 'installed_skill' AND NOT v_has_installed_skill THEN
    RAISE EXCEPTION
      'workspace_resource % kind=installed_skill is missing its installed_skill detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  ELSIF v_kind = 'plugin_installation' AND NOT v_has_plugin_installation THEN
    RAISE EXCEPTION
      'workspace_resource % kind=plugin_installation is missing its plugin_installation detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  ELSIF v_kind = 'runtime_capability' AND NOT v_has_runtime_capability THEN
    RAISE EXCEPTION
      'workspace_resource % kind=runtime_capability is missing its runtime_capability detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  ELSIF v_kind = 'automation_event_source' AND NOT v_has_automation_event_source THEN
    RAISE EXCEPTION
      'workspace_resource % kind=automation_event_source is missing its automation_event_source detail row',
      p_workspace_resource_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_resources_kind_detail_match_chk';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_workspace_resource_detail_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_resource_id UUID;
BEGIN
  v_workspace_resource_id := COALESCE(NEW.id, OLD.id);
  PERFORM assert_workspace_resource_detail_consistency(v_workspace_resource_id);
  RETURN NULL;
END;
$$;

-- (device_capability_workspace_id / device_workspace_id /
-- device_exposure_workspace_id helpers were deleted in the runtime/sandbox
-- generalization: the runtime_authorization_grants workspace-drift guard is now
-- the IMMEDIATE composite FKs fk_rag_runtime_ws / fk_rag_exposure_ws, and the
-- capability/exposure workspace pins fk_runtime_capabilities_exposure_ws /
-- fk_runtime_exposures_runtime_ws — so no plpgsql lookup helper is needed.)

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_root_chk
AFTER INSERT OR UPDATE OF kind, workspace_id ON workspace_resources
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_actor_chk
AFTER INSERT OR UPDATE OR DELETE ON actors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_remote_agent_chk
AFTER INSERT OR UPDATE OR DELETE ON remote_agents
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_installed_skill_chk
AFTER INSERT OR UPDATE OR DELETE ON installed_skills
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_plugin_installation_chk
AFTER INSERT OR UPDATE OR DELETE ON plugin_installations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

CREATE CONSTRAINT TRIGGER workspace_resources_detail_consistency_runtime_capability_chk
AFTER INSERT OR UPDATE OR DELETE ON runtime_capabilities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_resource_detail_consistency();

-- ============================================================================
-- CTI detail-consistency for the runtimes supertype (device XOR sandbox).
-- Mirrors assert_workspace_resource_detail_consistency: a runtime of kind=device
-- must have exactly one devices row (zero sandboxes) and vice-versa. All three
-- triggers are DEFERRABLE so provisioning may insert the detail row before/after
-- the runtimes row within one tx.
-- ============================================================================
CREATE OR REPLACE FUNCTION assert_runtime_detail_consistency(p_runtime_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_kind runtimes_kind;
  v_has_device BOOLEAN;
  v_has_sandbox BOOLEAN;
  v_detail_count INT;
BEGIN
  IF p_runtime_id IS NULL THEN
    RETURN;
  END IF;

  SELECT kind INTO v_kind FROM runtimes WHERE id = p_runtime_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM devices WHERE id = p_runtime_id),
         EXISTS(SELECT 1 FROM sandboxes WHERE id = p_runtime_id)
    INTO v_has_device, v_has_sandbox;

  v_detail_count := v_has_device::INT + v_has_sandbox::INT;

  IF v_detail_count <> 1 THEN
    RAISE EXCEPTION
      'runtime % kind=% must have exactly one matching detail row, found device=% sandbox=%',
      p_runtime_id, v_kind, v_has_device, v_has_sandbox
      USING ERRCODE = '23514',
            CONSTRAINT = 'runtimes_exactly_one_detail_chk';
  END IF;

  IF v_kind = 'device' AND NOT v_has_device THEN
    RAISE EXCEPTION
      'runtime % kind=device is missing its devices detail row',
      p_runtime_id
      USING ERRCODE = '23514', CONSTRAINT = 'runtimes_kind_detail_match_chk';
  ELSIF v_kind = 'sandbox' AND NOT v_has_sandbox THEN
    RAISE EXCEPTION
      'runtime % kind=sandbox is missing its sandboxes detail row',
      p_runtime_id
      USING ERRCODE = '23514', CONSTRAINT = 'runtimes_kind_detail_match_chk';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_runtime_detail_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_runtime_id UUID;
BEGIN
  v_runtime_id := COALESCE(NEW.id, OLD.id);
  PERFORM assert_runtime_detail_consistency(v_runtime_id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER runtimes_detail_consistency_root_chk
AFTER INSERT OR UPDATE OF kind ON runtimes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_runtime_detail_consistency();

CREATE CONSTRAINT TRIGGER runtimes_detail_consistency_device_chk
AFTER INSERT OR UPDATE OR DELETE ON devices
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_runtime_detail_consistency();

CREATE CONSTRAINT TRIGGER runtimes_detail_consistency_sandbox_chk
AFTER INSERT OR UPDATE OR DELETE ON sandboxes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_runtime_detail_consistency();

-- runtime kind <-> service_kind guard: after the substrate re-key there is no
-- devices FK on runtime_services, so a runtime-scoped constraint trigger enforces
-- the kind<->service matrix. Deferred so the runtimes row may be created within
-- the same tx as the service. R4 #8 HOLE-2 fix: the guard now covers BOTH
-- directions of the sandbox/device split — remote_agent_daemon requires a
-- device-kind runtime, and bare_dataplane requires a sandbox-kind runtime (a
-- device runtime holding a bare_dataplane service used to commit). device_runtime
-- stays legal on both device and sandbox runtimes. INSERT/UPDATE-only ⇒ NEW is
-- always present (safe to reference NEW.service_kind/NEW.runtime_id).
CREATE OR REPLACE FUNCTION validate_runtime_service_kind_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_runtime_kind runtimes_kind;
BEGIN
  IF NEW.service_kind = 'remote_agent_daemon' THEN
    SELECT kind INTO v_runtime_kind FROM runtimes WHERE id = NEW.runtime_id;
    IF v_runtime_kind IS DISTINCT FROM 'device' THEN
      RAISE EXCEPTION
        'runtime_services.service_kind=remote_agent_daemon requires runtimes.kind=device (runtime % kind=%)',
        NEW.runtime_id, v_runtime_kind
        USING ERRCODE = '23514', CONSTRAINT = 'runtime_services_daemon_kind_chk';
    END IF;
  ELSIF NEW.service_kind = 'bare_dataplane' THEN
    SELECT kind INTO v_runtime_kind FROM runtimes WHERE id = NEW.runtime_id;
    IF v_runtime_kind IS DISTINCT FROM 'sandbox' THEN
      RAISE EXCEPTION
        'runtime_services.service_kind=bare_dataplane requires runtimes.kind=sandbox (runtime % kind=%)',
        NEW.runtime_id, v_runtime_kind
        USING ERRCODE = '23514', CONSTRAINT = 'runtime_services_daemon_kind_chk';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER runtime_services_daemon_kind_chk
AFTER INSERT OR UPDATE OF service_kind, runtime_id ON runtime_services
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_runtime_service_kind_guard();

-- sandbox mode <-> service_kind invariant (P1.6 + R3.8). A sandbox runtime's
-- services must match its mode (resident => device_runtime, bare => bare_dataplane)
-- AND, when state='active', it must have EXACTLY ONE of them. R3.8 fix: this is
-- now SNAPSHOT-INDEPENDENT — at deferred (commit-time) execution it re-reads the
-- FINAL committed runtime kind + sandbox mode/state + ALL of the runtime's services
-- by runtime_id, instead of trusting the NEW.mode/NEW.service_kind of whichever row
-- fired (which let device_runtime+bare_dataplane commit and mis-rejected a legit
-- resident->bare->resident). Fires from runtime_services INSERT/UPDATE/DELETE — the
-- DELETE arm closes the old "detach the last service" hole — AND from sandboxes
-- mode/state changes. Exempt: non-sandbox / soft-deleted runtimes, and an absent
-- sandboxes row (detail-consistency triggers cover a genuinely missing detail). The
-- EXACTLY-ONE requirement applies ONLY to state='active': provisioning has not
-- minted the service yet, and terminal (closed/failed/closing) states may have
-- detached it during teardown.
-- R4 #8 (F9) helper: the per-runtime assertion body, extracted VERBATIM so both
-- endpoints of an UPDATE-move can be re-validated. Resolves the FINAL committed
-- runtime kind + sandbox mode/state + ALL of the runtime's services by runtime_id
-- (snapshot-independent, R3.8). Exempt: non-sandbox / soft-deleted runtimes and
-- an absent sandboxes row. v_wrong>0 always rejects; the EXACTLY-ONE requirement
-- applies ONLY to state='active'.
CREATE OR REPLACE FUNCTION assert_sandbox_mode_service_kind(p_runtime_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind runtimes_kind;
  v_mode sandboxes_mode;
  v_state sandboxes_state;
  v_required runtime_services_service_kind;
  v_ok INT;
  v_wrong INT;
BEGIN
  IF p_runtime_id IS NULL THEN RETURN; END IF;

  SELECT kind INTO v_kind FROM runtimes WHERE id = p_runtime_id AND deleted_at IS NULL;
  IF v_kind IS DISTINCT FROM 'sandbox' THEN RETURN; END IF;
  SELECT mode, state INTO v_mode, v_state FROM sandboxes WHERE id = p_runtime_id;
  IF v_mode IS NULL THEN RETURN; END IF;

  v_required := CASE v_mode WHEN 'resident' THEN 'device_runtime'::runtime_services_service_kind
                            ELSE 'bare_dataplane'::runtime_services_service_kind END;

  SELECT COUNT(*) FILTER (WHERE service_kind = v_required),
         COUNT(*) FILTER (WHERE service_kind IS DISTINCT FROM v_required)
    INTO v_ok, v_wrong
    FROM runtime_services WHERE runtime_id = p_runtime_id;

  IF v_wrong > 0 THEN
    RAISE EXCEPTION
      'sandbox % (mode=%) has % runtime_services of the wrong service_kind (required %)',
      p_runtime_id, v_mode, v_wrong, v_required
      USING ERRCODE = '23514', CONSTRAINT = 'sandbox_mode_service_kind_chk';
  END IF;

  IF v_state = 'active' AND v_ok <> 1 THEN
    RAISE EXCEPTION
      'active sandbox % (mode=%) must have exactly one % service (has %)',
      p_runtime_id, v_mode, v_required, v_ok
      USING ERRCODE = '23514', CONSTRAINT = 'sandbox_mode_service_kind_chk';
  END IF;
END;
$$;

-- R4 #8 (F9) HOLE-1 fix: an UPDATE that moves a service A->B must re-validate the
-- SOURCE runtime A too (it may be left illegal: active + 0 services). The old body
-- resolved a single runtime via COALESCE(NEW,OLD) so a move validated only B. Now,
-- for a runtime_services move, we assert BOTH endpoints. The TG_TABLE_NAME guard
-- MUST stay: this function ALSO backs the sandboxes trigger (which has no
-- runtime_id column — referencing NEW.runtime_id there raises "record new has no
-- field runtime_id"). The DELETE arm still re-checks OLD via the COALESCE.
CREATE OR REPLACE FUNCTION validate_sandbox_mode_service_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'runtime_services' THEN
    PERFORM assert_sandbox_mode_service_kind(COALESCE(NEW.runtime_id, OLD.runtime_id));
    IF TG_OP = 'UPDATE' AND NEW.runtime_id IS DISTINCT FROM OLD.runtime_id THEN
      PERFORM assert_sandbox_mode_service_kind(OLD.runtime_id);
    END IF;
  ELSE
    PERFORM assert_sandbox_mode_service_kind(COALESCE(NEW.id, OLD.id));
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER sandbox_mode_service_kind_on_service
AFTER INSERT OR DELETE OR UPDATE OF service_kind, runtime_id ON runtime_services
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_sandbox_mode_service_kind();

CREATE CONSTRAINT TRIGGER sandbox_mode_service_kind_on_sandbox
AFTER INSERT OR UPDATE OF mode, state ON sandboxes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_sandbox_mode_service_kind();

-- ============================================================================
-- workspace_resources / workspace_resource_grants / workspace_resource_grant_requests
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_workspace_resource_root() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_owner_ws UUID;
  v_creator_ws UUID;
BEGIN
  IF NEW.owner_subject_id IS NOT NULL THEN
    IF NOT is_workspace_resource_owner_subject_kind(NEW.owner_subject_id) THEN
      RAISE EXCEPTION
        'workspace_resources.owner_subject_id % refers to a kind that is not an allowed owner (workspace_member|actor|remote_agent)',
        NEW.owner_subject_id;
    END IF;
    v_owner_ws := access_subject_workspace_id(NEW.owner_subject_id);
    IF v_owner_ws IS NULL OR v_owner_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION
        'workspace_resources.owner_subject_id % workspace % does not match resource workspace %',
        NEW.owner_subject_id, v_owner_ws, NEW.workspace_id;
    END IF;
  END IF;

  -- created_by may be a platform subject (device_capability creator) whose
  -- workspace is NULL; only enforce the workspace match when it is non-null.
  v_creator_ws := access_subject_workspace_id(NEW.created_by_subject_id);
  IF v_creator_ws IS NOT NULL AND v_creator_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resources.created_by_subject_id % workspace % does not match resource workspace %',
      NEW.created_by_subject_id, v_creator_ws, NEW.workspace_id;
  END IF;

  IF NEW.kind = 'plugin_installation'
     AND NEW.status NOT IN ('active', 'disabled', 'error', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=plugin_installation does not allow status=%', NEW.status;
  ELSIF NEW.kind = 'installed_skill'
     AND NEW.status NOT IN ('active', 'disabled', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=installed_skill does not allow status=%', NEW.status;
  ELSIF NEW.kind = 'actor'
     AND NEW.status NOT IN ('active', 'disabled', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=actor does not allow status=%', NEW.status;
  ELSIF NEW.kind = 'remote_agent'
     AND NEW.status NOT IN ('active', 'disabled', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=remote_agent does not allow status=%', NEW.status;
  ELSIF NEW.kind = 'runtime_capability'
     AND NEW.status NOT IN ('active', 'deprecated', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=runtime_capability does not allow status=%', NEW.status;
  ELSIF NEW.kind = 'automation_event_source'
     AND NEW.status NOT IN ('active', 'deprecated', 'disabled', 'archived') THEN
    RAISE EXCEPTION 'workspace_resources.kind=automation_event_source does not allow status=%', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_workspace_resources_validate
  BEFORE INSERT OR UPDATE ON workspace_resources
  FOR EACH ROW
  EXECUTE FUNCTION validate_workspace_resource_root();

CREATE OR REPLACE FUNCTION normalize_workspace_resource_grant_permissions(
  p_permissions workspace_resource_grant_permission[]
)
RETURNS workspace_resource_grant_permission[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT permission
      FROM unnest(p_permissions) AS permission
      ORDER BY permission
    ),
    ARRAY[]::workspace_resource_grant_permission[]
  );
$$;

CREATE OR REPLACE FUNCTION validate_workspace_resource_grant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_subject_ws UUID;
  v_scope_ws UUID;
  v_resource_ws UUID;
  v_resource_kind workspace_resources_kind;
  v_subject_kind subject_kind;
  v_scope_kind subject_kind;
  v_creator_ws UUID;
BEGIN
  NEW.permissions := normalize_workspace_resource_grant_permissions(NEW.permissions);
  IF cardinality(NEW.permissions) = 0 THEN
    RAISE EXCEPTION 'workspace_resource_grants.permissions must be non-empty';
  END IF;

  SELECT workspace_id, kind INTO v_resource_ws, v_resource_kind
    FROM workspace_resources
   WHERE id = NEW.workspace_resource_id;
  IF v_resource_ws IS NULL OR v_resource_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resource_grants.workspace_resource_id % workspace % does not match grant workspace %',
      NEW.workspace_resource_id, v_resource_ws, NEW.workspace_id;
  END IF;

  IF NEW.created_by_workspace_member_id IS NOT NULL THEN
    v_creator_ws := workspace_member_workspace_id(NEW.created_by_workspace_member_id);
    IF v_creator_ws IS NULL OR v_creator_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION
        'workspace_resource_grants.created_by_workspace_member_id % workspace % does not match grant workspace %',
        NEW.created_by_workspace_member_id, v_creator_ws, NEW.workspace_id;
    END IF;
  END IF;

  IF NOT is_workspace_bound_subject_kind(NEW.subject_id) THEN
    RAISE EXCEPTION 'workspace_resource_grants.subject_id % is not workspace-bound', NEW.subject_id;
  END IF;
  v_subject_ws := access_subject_workspace_id(NEW.subject_id);
  IF v_subject_ws IS NULL OR v_subject_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resource_grants.subject_id % workspace % does not match grant workspace %',
      NEW.subject_id, v_subject_ws, NEW.workspace_id;
  END IF;

  SELECT kind INTO v_subject_kind FROM access_subjects WHERE id = NEW.subject_id;

  IF NEW.scope_subject_id IS NOT NULL THEN
    IF NOT is_scope_eligible_subject(NEW.scope_subject_id) THEN
      RAISE EXCEPTION
        'workspace_resource_grants.scope_subject_id % must reference workspace|conversation',
        NEW.scope_subject_id;
    END IF;
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION
        'workspace_resource_grants.scope_subject_id % workspace % does not match grant workspace %',
        NEW.scope_subject_id, v_scope_ws, NEW.workspace_id;
    END IF;
    SELECT kind INTO v_scope_kind FROM access_subjects WHERE id = NEW.scope_subject_id;
  END IF;

  IF NEW.conversation_type_mask_override IS NOT NULL
     AND NOT ('use'::workspace_resource_grant_permission = ANY(NEW.permissions)) THEN
    RAISE EXCEPTION
      'workspace_resource_grants.conversation_type_mask_override is only allowed on use grants';
  END IF;

  IF 'use'::workspace_resource_grant_permission = ANY(NEW.permissions) THEN
    IF v_resource_kind NOT IN ('plugin_installation', 'installed_skill', 'runtime_capability', 'automation_event_source') THEN
      RAISE EXCEPTION 'workspace_resource_grants.use is not allowed for resource kind=%', v_resource_kind;
    END IF;
    IF NEW.scope_subject_id IS NOT NULL THEN
      IF v_subject_kind NOT IN ('actor', 'remote_agent') OR v_scope_kind <> 'conversation' THEN
        RAISE EXCEPTION
          'workspace_resource_grants scoped use requires subject kind actor|remote_agent and conversation scope';
      END IF;
    ELSIF v_subject_kind NOT IN ('workspace', 'workspace_member', 'actor', 'remote_agent', 'conversation') THEN
      RAISE EXCEPTION
        'workspace_resource_grants.use does not allow subject kind=%', v_subject_kind;
    END IF;
  END IF;

  IF 'manage'::workspace_resource_grant_permission = ANY(NEW.permissions) THEN
    IF NEW.scope_subject_id IS NOT NULL OR v_subject_kind <> 'workspace_member' THEN
      RAISE EXCEPTION
        'workspace_resource_grants.manage requires an unscoped workspace_member subject';
    END IF;
  END IF;

  IF 'contact_visible'::workspace_resource_grant_permission = ANY(NEW.permissions) THEN
    IF v_resource_kind NOT IN ('actor', 'remote_agent') THEN
      RAISE EXCEPTION
        'workspace_resource_grants.contact_visible is not allowed for resource kind=%', v_resource_kind;
    END IF;
    IF NEW.scope_subject_id IS NOT NULL
       OR v_subject_kind NOT IN ('workspace', 'workspace_member') THEN
      RAISE EXCEPTION
        'workspace_resource_grants.contact_visible requires an unscoped workspace|workspace_member subject';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_workspace_resource_grants_validate
  BEFORE INSERT OR UPDATE ON workspace_resource_grants
  FOR EACH ROW
  EXECUTE FUNCTION validate_workspace_resource_grant();

CREATE OR REPLACE FUNCTION validate_workspace_resource_grant_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_grantee_ws UUID;
  v_resource_ws UUID;
  v_resource_kind workspace_resources_kind;
  v_grantee_kind subject_kind;
  v_requester_ws UUID;
  v_resolver_ws UUID;
BEGIN
  NEW.requested_permissions :=
    normalize_workspace_resource_grant_permissions(NEW.requested_permissions);
  IF NEW.requested_permissions <>
     ARRAY['contact_visible'::workspace_resource_grant_permission] THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests.requested_permissions must be exactly [contact_visible] in this phase';
  END IF;

  SELECT workspace_id, kind INTO v_resource_ws, v_resource_kind
    FROM workspace_resources
   WHERE id = NEW.workspace_resource_id;
  IF v_resource_ws IS NULL OR v_resource_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests.workspace_resource_id % workspace % does not match request workspace %',
      NEW.workspace_resource_id, v_resource_ws, NEW.workspace_id;
  END IF;
  IF v_resource_kind NOT IN ('actor', 'remote_agent') THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests are only allowed for actor|remote_agent resources in this phase';
  END IF;

  v_requester_ws := workspace_member_workspace_id(NEW.requester_workspace_member_id);
  IF v_requester_ws IS NULL OR v_requester_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests.requester_workspace_member_id % workspace % does not match request workspace %',
      NEW.requester_workspace_member_id, v_requester_ws, NEW.workspace_id;
  END IF;

  IF NEW.resolved_by_workspace_member_id IS NOT NULL THEN
    v_resolver_ws := workspace_member_workspace_id(NEW.resolved_by_workspace_member_id);
    IF v_resolver_ws IS NULL OR v_resolver_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION
        'workspace_resource_grant_requests.resolved_by_workspace_member_id % workspace % does not match request workspace %',
        NEW.resolved_by_workspace_member_id, v_resolver_ws, NEW.workspace_id;
    END IF;
  END IF;

  IF NEW.grantee_scope_subject_id IS NOT NULL THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests do not allow scoped grantees in this phase';
  END IF;

  IF NOT is_workspace_bound_subject_kind(NEW.grantee_subject_id) THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests.grantee_subject_id % is not workspace-bound',
      NEW.grantee_subject_id;
  END IF;

  v_grantee_ws := access_subject_workspace_id(NEW.grantee_subject_id);
  IF v_grantee_ws IS NULL OR v_grantee_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests.grantee_subject_id % workspace % does not match request workspace %',
      NEW.grantee_subject_id, v_grantee_ws, NEW.workspace_id;
  END IF;

  SELECT kind INTO v_grantee_kind FROM access_subjects WHERE id = NEW.grantee_subject_id;
  IF v_grantee_kind <> 'workspace_member' THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests only allow workspace_member grantees in this phase';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM access_subjects subj
     WHERE subj.id = NEW.grantee_subject_id
       AND subj.workspace_member_id = NEW.requester_workspace_member_id
  ) THEN
    RAISE EXCEPTION
      'workspace_resource_grant_requests requester must request on behalf of their own workspace_member subject';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_workspace_resource_grant_requests_validate
  BEFORE INSERT OR UPDATE ON workspace_resource_grant_requests
  FOR EACH ROW
  EXECUTE FUNCTION validate_workspace_resource_grant_request();

-- ============================================================================
-- tg_conversation_participant_validate: participant subject invariants
-- ============================================================================
-- DB-level enforcement that the participant model can't be corrupted by raw SQL
-- (there is no participant_type column; the type is derived from the joined
-- subject kind, so these invariants must live in the DB). The boundary axis was
-- removed: a conversation is "IM" iff a conversation_transport_bindings row
-- exists for it. The invariants are:
--   (1) kind: a participant's subject must be one of
--       workspace_member / actor / remote_agent / external. platform / user /
--       workspace / conversation subjects can never be conversation participants.
--   (2) workspace match (ALL participants, unconditional): every conversation is
--       workspace-scoped (conversations.workspace_id NOT NULL) and every
--       participant subject — including external — carries a workspace_id, so the
--       subject's workspace must equal the conversation's workspace.
--   (3) external is IM-only: an external subject may join only a conversation
--       that has a transport binding (i.e. an IM conversation).
--   (4) external account match: the external subject's transport address must
--       belong to the same transport account that the conversation is bound to,
--       so account B's address can't join a conversation bound to account A
--       within the same workspace.
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_conversation_participant_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind subject_kind;
  v_conv_ws UUID;
  v_subject_ws UUID;
  v_binding_account_id UUID;
  v_subject_account_id UUID;
BEGIN
  SELECT kind INTO v_kind FROM access_subjects WHERE id = NEW.subject_id;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'conversation_participants.subject_id % does not exist in access_subjects', NEW.subject_id;
  END IF;
  IF v_kind NOT IN ('workspace_member', 'actor', 'remote_agent', 'external') THEN
    RAISE EXCEPTION 'conversation_participants.subject_id % has kind % which cannot be a participant', NEW.subject_id, v_kind;
  END IF;

  SELECT workspace_id INTO v_conv_ws
    FROM conversations WHERE id = NEW.conversation_id;

  -- (2) Unconditional workspace match for every participant kind.
  v_subject_ws := access_subject_workspace_id(NEW.subject_id);
  IF v_subject_ws IS NULL OR v_subject_ws IS DISTINCT FROM v_conv_ws THEN
    RAISE EXCEPTION 'conversation_participants.subject_id % workspace % does not match conversation % workspace %', NEW.subject_id, v_subject_ws, NEW.conversation_id, v_conv_ws;
  END IF;

  -- (3)/(4) External participants are IM-only and must match the binding account.
  IF v_kind = 'external' THEN
    SELECT transport_account_id INTO v_binding_account_id
      FROM conversation_transport_bindings WHERE conversation_id = NEW.conversation_id;
    IF v_binding_account_id IS NULL THEN
      RAISE EXCEPTION 'conversation_participants.subject_id % is external but conversation % has no transport binding (external participants are IM-only)', NEW.subject_id, NEW.conversation_id;
    END IF;
    SELECT ta.transport_account_id INTO v_subject_account_id
      FROM access_subjects asx
      JOIN transport_addresses ta ON ta.id = asx.transport_address_id
      WHERE asx.id = NEW.subject_id;
    IF v_subject_account_id IS DISTINCT FROM v_binding_account_id THEN
      RAISE EXCEPTION 'conversation_participants.subject_id % transport account % does not match conversation % binding account %', NEW.subject_id, v_subject_account_id, NEW.conversation_id, v_binding_account_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_conversation_participant_validate
  BEFORE INSERT OR UPDATE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION validate_conversation_participant_subject();

-- ============================================================================
-- tg_binding_account_consistency: a binding's account can't drift away from its
-- external participants
-- ============================================================================
-- tg_conversation_participant_validate enforces, at participant write time, that
-- an external participant's transport address belongs to the conversation's
-- binding account. But that check does not re-fire when the BINDING itself is
-- replaced (upsertConversationTransportBinding's ON CONFLICT swaps
-- transport_account_id / transport_endpoint_id). Without this guard a
-- conversation could be re-bound from account A to account B while keeping
-- account A's external participants OR account A's participant addresses
-- (conversation_participant_addresses) — leaving rows the participant /
-- participant-address triggers would now reject. We forbid changing a binding's
-- transport_account_id while ANY external participant OR any attached
-- participant address on that conversation still resolves to a different account
-- (re-pointing the endpoint within the same account is fine).
CREATE OR REPLACE FUNCTION validate_binding_account_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transport_account_id IS DISTINCT FROM OLD.transport_account_id THEN
    -- (a) external participants whose address belongs to another account.
    IF EXISTS (
      SELECT 1
        FROM conversation_participants cp
        JOIN access_subjects asx ON asx.id = cp.subject_id
        JOIN transport_addresses ta ON ta.id = asx.transport_address_id
       WHERE cp.conversation_id = NEW.conversation_id
         AND asx.kind = 'external'
         AND ta.transport_account_id IS DISTINCT FROM NEW.transport_account_id
    ) THEN
      RAISE EXCEPTION 'conversation_transport_bindings(%) cannot change transport_account to % while external participants from another account remain', NEW.conversation_id, NEW.transport_account_id;
    END IF;
    -- (b) attached participant addresses (incl. linked workspace_member rows)
    --     belonging to another account.
    IF EXISTS (
      SELECT 1
        FROM conversation_participant_addresses cpa
        JOIN conversation_participants cp
          ON cp.id = cpa.conversation_participant_id
        JOIN transport_addresses ta ON ta.id = cpa.transport_address_id
       WHERE cp.conversation_id = NEW.conversation_id
         AND ta.transport_account_id IS DISTINCT FROM NEW.transport_account_id
    ) THEN
      RAISE EXCEPTION 'conversation_transport_bindings(%) cannot change transport_account to % while participant addresses from another account remain', NEW.conversation_id, NEW.transport_account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_binding_account_consistency
  BEFORE UPDATE OF transport_account_id ON conversation_transport_bindings
  FOR EACH ROW
  EXECUTE FUNCTION validate_binding_account_consistency();

-- ============================================================================
-- tg_binding_delete_guard: deleting a binding can't silently strip a
-- conversation's IM-ness while IM-only rows remain
-- ============================================================================
-- IM-ness is derived purely from the presence of a conversation_transport_
-- bindings row. Deleting the binding flips the conversation IM -> native, but
-- external participants and participant addresses (conversation_participant_
-- addresses) are IM-only artifacts that would be orphaned and would no longer
-- satisfy their own triggers. Forbid deleting a binding while its conversation
-- still exists AND still has external participants or attached addresses.
--
-- DEFERRABLE INITIALLY DEFERRED + the "conversation still exists" guard make the
-- legitimate teardown paths pass: deleting the conversation (or the workspace)
-- cascades to conversation_participants / _addresses / the binding within one
-- transaction; by COMMIT the conversation row is gone, so this constraint is
-- satisfied. Only a standalone binding delete (conversation kept) is rejected —
-- callers must first migrate/remove the IM participants + addresses.
CREATE OR REPLACE FUNCTION guard_binding_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Conversation already gone (cascade teardown) -> nothing to protect.
  IF NOT EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = OLD.conversation_id
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM conversation_participants cp
      JOIN access_subjects asx ON asx.id = cp.subject_id
     WHERE cp.conversation_id = OLD.conversation_id
       AND asx.kind = 'external'
  ) THEN
    RAISE EXCEPTION 'conversation_transport_bindings(%) cannot be deleted while external participants remain (migrate/remove them first)', OLD.conversation_id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM conversation_participant_addresses cpa
      JOIN conversation_participants cp
        ON cp.id = cpa.conversation_participant_id
     WHERE cp.conversation_id = OLD.conversation_id
  ) THEN
    RAISE EXCEPTION 'conversation_transport_bindings(%) cannot be deleted while participant addresses remain (migrate/remove them first)', OLD.conversation_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE CONSTRAINT TRIGGER tg_binding_delete_guard
  AFTER DELETE ON conversation_transport_bindings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION guard_binding_delete();

-- ============================================================================
-- tg_access_subject_identity_guard: freeze a referenced subject's identity
-- ============================================================================
-- The participant invariant trigger above validates subject kind + workspace at
-- participant insert/update time, but a raw UPDATE of the subject's own identity
-- columns afterwards would not re-fire it, leaving a participant whose subject no
-- longer matches the conversation/workspace (or is no longer a participant kind).
-- The application never UPDATEs these columns (subjects are upsert-only), so once
-- a subject is referenced by a conversation_participant we freeze its entire
-- identity payload (kind + every FK/payload column + workspace_id). Pure
-- defence-in-depth against out-of-band SQL.
CREATE OR REPLACE FUNCTION guard_access_subject_identity_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
       NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.workspace_member_id IS DISTINCT FROM OLD.workspace_member_id
       OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
       OR NEW.remote_agent_id IS DISTINCT FROM OLD.remote_agent_id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.transport_address_id IS DISTINCT FROM OLD.transport_address_id
     )
     AND EXISTS (SELECT 1 FROM conversation_participants WHERE subject_id = NEW.id) THEN
    RAISE EXCEPTION 'access_subjects.% identity is immutable while referenced by a conversation participant', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_access_subject_identity_guard
  BEFORE UPDATE OF
    kind, workspace_id, workspace_member_id, actor_id,
    remote_agent_id, conversation_id, user_id, transport_address_id
  ON access_subjects
  FOR EACH ROW
  EXECUTE FUNCTION guard_access_subject_identity_update();

-- ============================================================================
-- tg_participant_address_consistency: an attached transport address must match
-- the conversation's workspace and (if bound) its binding account
-- ============================================================================
-- conversation_participant_addresses links a participant to a transport_address
-- for delivery. Nothing structurally prevented attaching an address from the
-- wrong workspace or a different transport account than the conversation's
-- binding — the linked-workspace_member branch in
-- syncTransportAddressConversationParticipant creates a non-external participant
-- (which the participant trigger does NOT account-check) and then attaches an
-- address, and raw SQL / exported helpers could do the same. This trigger closes
-- that gap: resolve participant -> conversation, require the address's workspace
-- to equal the conversation's workspace, and — when the conversation has a
-- transport binding — require the address's transport_account_id to equal the
-- binding's account.
CREATE OR REPLACE FUNCTION validate_participant_address_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conv_id UUID;
  v_conv_ws UUID;
  v_addr_ws UUID;
  v_addr_account UUID;
  v_binding_account UUID;
BEGIN
  SELECT cp.conversation_id INTO v_conv_id
    FROM conversation_participants cp
   WHERE cp.id = NEW.conversation_participant_id;
  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'conversation_participant_addresses.conversation_participant_id % does not exist', NEW.conversation_participant_id;
  END IF;

  SELECT c.workspace_id INTO v_conv_ws
    FROM conversations c WHERE c.id = v_conv_id;
  SELECT ta.workspace_id, ta.transport_account_id
    INTO v_addr_ws, v_addr_account
    FROM transport_addresses ta WHERE ta.id = NEW.transport_address_id;

  IF v_addr_ws IS DISTINCT FROM v_conv_ws THEN
    RAISE EXCEPTION 'conversation_participant_addresses: address % workspace % does not match conversation % workspace %', NEW.transport_address_id, v_addr_ws, v_conv_id, v_conv_ws;
  END IF;

  -- Participant addresses are an IM-only artifact (they drive IM delivery), so
  -- the conversation MUST have a transport binding, and the address MUST belong
  -- to that binding's account. A native (non-IM) conversation can never carry a
  -- participant address.
  SELECT b.transport_account_id INTO v_binding_account
    FROM conversation_transport_bindings b
   WHERE b.conversation_id = v_conv_id;
  IF v_binding_account IS NULL THEN
    RAISE EXCEPTION 'conversation_participant_addresses: conversation % has no transport binding (participant addresses are IM-only)', v_conv_id;
  END IF;
  IF v_addr_account IS DISTINCT FROM v_binding_account THEN
    RAISE EXCEPTION 'conversation_participant_addresses: address % account % does not match conversation % binding account %', NEW.transport_address_id, v_addr_account, v_conv_id, v_binding_account;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_participant_address_consistency
  BEFORE INSERT OR UPDATE ON conversation_participant_addresses
  FOR EACH ROW
  EXECUTE FUNCTION validate_participant_address_consistency();

-- ============================================================================
-- tg_runtime_authorization_grant_validate: subject + scope combination
-- whitelist + subject/scope workspace consistency
-- ============================================================================
-- Mirrors the service-layer `assertSupportedRuntimeGrantTarget` so raw SQL
-- inserts cannot bypass the whitelist:
--   - unscoped (scope_subject_id IS NULL): subject.kind must be one of
--     workspace / workspace_member / actor / remote_agent / conversation.
--   - scoped: only (actor + conversation) and (remote_agent + conversation)
--     are allowed.
-- All other combinations (e.g. workspace_member + conversation,
-- actor + workspace, conversation + conversation) RAISE EXCEPTION.
-- runtime/capability/exposure workspace consistency is now enforced by the
-- IMMEDIATE composite FKs fk_rag_runtime_ws / fk_rag_exposure_ws and the
-- capability→exposure→runtime workspace pins (no plpgsql lookup needed).
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_runtime_authorization_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_subject_kind subject_kind;
  v_scope_kind subject_kind;
  v_subject_ws UUID;
  v_scope_ws UUID;
BEGIN
  -- Look up subject and scope kinds
  SELECT kind INTO v_subject_kind FROM access_subjects WHERE id = NEW.subject_id;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'runtime_authorization_grants.subject_id % does not exist in access_subjects', NEW.subject_id;
  END IF;
  IF NEW.scope_subject_id IS NOT NULL THEN
    SELECT kind INTO v_scope_kind FROM access_subjects WHERE id = NEW.scope_subject_id;
    IF v_scope_kind IS NULL THEN
      RAISE EXCEPTION 'runtime_authorization_grants.scope_subject_id % does not exist in access_subjects', NEW.scope_subject_id;
    END IF;
  END IF;

  -- Whitelist: subject + scope combinations
  IF NEW.scope_subject_id IS NULL THEN
    IF v_subject_kind NOT IN ('workspace', 'workspace_member', 'actor', 'remote_agent', 'conversation') THEN
      RAISE EXCEPTION 'runtime_authorization_grants: unscoped grant subject.kind=% is not allowed (only workspace/workspace_member/actor/remote_agent/conversation)', v_subject_kind;
    END IF;
  ELSE
    -- scoped: only actor/remote_agent + conversation
    IF NOT (
      (v_subject_kind = 'actor' AND v_scope_kind = 'conversation')
      OR (v_subject_kind = 'remote_agent' AND v_scope_kind = 'conversation')
    ) THEN
      RAISE EXCEPTION 'runtime_authorization_grants: scoped grant (subject.kind=%, scope.kind=%) is not in whitelist (only actor+conversation, remote_agent+conversation)', v_subject_kind, v_scope_kind;
    END IF;
  END IF;

  -- subject workspace consistency
  v_subject_ws := access_subject_workspace_id(NEW.subject_id);
  IF v_subject_ws IS NULL OR v_subject_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'runtime_authorization_grants.subject_id % workspace % does not match grant workspace %', NEW.subject_id, v_subject_ws, NEW.workspace_id;
  END IF;
  -- scope workspace consistency (if set)
  IF NEW.scope_subject_id IS NOT NULL THEN
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'runtime_authorization_grants.scope_subject_id % workspace % does not match grant workspace %', NEW.scope_subject_id, v_scope_ws, NEW.workspace_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_runtime_authorization_grant_validate
  BEFORE INSERT OR UPDATE ON runtime_authorization_grants
  FOR EACH ROW
  EXECUTE FUNCTION validate_runtime_authorization_grant();

-- ============================================================================
-- subject-scope-refactor: memory_access_grants + memory_spaces validation
-- triggers. memory_spaces table itself was rewritten in place above (owner +
-- optional scope + namespace_key); validation lands here after access_subjects
-- helpers were defined.
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_memory_space_subject_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_ws UUID;
  v_scope_ws UUID;
BEGIN
  IF NOT is_memory_owner_subject_kind(NEW.owner_subject_id) THEN
    RAISE EXCEPTION 'memory_spaces.owner_subject_id % must reference a subject of kind workspace_member|actor|remote_agent|workspace|conversation', NEW.owner_subject_id;
  END IF;
  IF NOT is_scope_eligible_subject(NEW.scope_subject_id) THEN
    RAISE EXCEPTION 'memory_spaces.scope_subject_id % must reference a subject of kind workspace|conversation', NEW.scope_subject_id;
  END IF;
  v_owner_ws := access_subject_workspace_id(NEW.owner_subject_id);
  IF v_owner_ws IS NULL OR v_owner_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'memory_spaces.owner_subject_id % workspace % does not match space workspace %', NEW.owner_subject_id, v_owner_ws, NEW.workspace_id;
  END IF;
  IF NEW.scope_subject_id IS NOT NULL THEN
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'memory_spaces.scope_subject_id % workspace % does not match space workspace %', NEW.scope_subject_id, v_scope_ws, NEW.workspace_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_memory_space_validate
  BEFORE INSERT OR UPDATE ON memory_spaces
  FOR EACH ROW
  EXECUTE FUNCTION validate_memory_space_subject_scope();

CREATE TABLE memory_access_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  memory_space_id UUID NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
  memory_item_id UUID REFERENCES memory_items(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  permissions memory_permission[] NOT NULL
    CHECK (cardinality(permissions) > 0 AND array_position(permissions, NULL) IS NULL),
  status memory_access_grants_status NOT NULL DEFAULT 'active',
  source TEXT,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  -- Optional backref to the task that produced this grant.
  source_task_id UUID REFERENCES tool_call_tasks(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_memory_access_grants_active
  ON memory_access_grants(
    memory_space_id,
    COALESCE(memory_item_id::text, ''),
    subject_id,
    COALESCE(scope_subject_id::text, '')
  )
  WHERE status = 'active';
CREATE INDEX idx_memory_access_grants_space
  ON memory_access_grants(memory_space_id, status, created_at DESC);
CREATE INDEX idx_memory_access_grants_subject
  ON memory_access_grants(subject_id, status, created_at DESC);
CREATE INDEX idx_memory_access_grants_item
  ON memory_access_grants(memory_item_id)
  WHERE memory_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_memory_access_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_subject_kind subject_kind;
  v_subject_ws   UUID;
  v_scope_ws     UUID;
  v_space_ws     UUID;
  v_item_space   UUID;
  v_item_ws      UUID;
BEGIN
  IF NOT is_scope_eligible_subject(NEW.scope_subject_id) THEN
    RAISE EXCEPTION 'memory_access_grants.scope_subject_id % must reference a subject of kind workspace|conversation', NEW.scope_subject_id;
  END IF;
  SELECT kind INTO v_subject_kind FROM access_subjects WHERE id = NEW.subject_id;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'memory_access_grants.subject_id % not found', NEW.subject_id;
  END IF;
  IF v_subject_kind NOT IN ('workspace_member','actor','remote_agent','workspace','conversation') THEN
    RAISE EXCEPTION 'memory_access_grants.subject_id % refers to kind % which is not allowed (must be workspace_member|actor|remote_agent|workspace|conversation)', NEW.subject_id, v_subject_kind;
  END IF;
  v_subject_ws := access_subject_workspace_id(NEW.subject_id);
  IF v_subject_ws IS NULL OR v_subject_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'memory_access_grants.subject_id % workspace mismatch (% vs %)', NEW.subject_id, v_subject_ws, NEW.workspace_id;
  END IF;
  IF NEW.scope_subject_id IS NOT NULL THEN
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'memory_access_grants.scope_subject_id % workspace mismatch', NEW.scope_subject_id;
    END IF;
  END IF;
  SELECT workspace_id INTO v_space_ws FROM memory_spaces WHERE id = NEW.memory_space_id;
  IF v_space_ws IS NULL OR v_space_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'memory_access_grants.memory_space_id % missing or workspace mismatch (% vs %)', NEW.memory_space_id, v_space_ws, NEW.workspace_id;
  END IF;
  IF NEW.memory_item_id IS NOT NULL THEN
    SELECT memory_space_id, workspace_id INTO v_item_space, v_item_ws
      FROM memory_items WHERE id = NEW.memory_item_id;
    IF v_item_space IS NULL THEN
      RAISE EXCEPTION 'memory_access_grants.memory_item_id % not found', NEW.memory_item_id;
    END IF;
    IF v_item_space IS DISTINCT FROM NEW.memory_space_id THEN
      RAISE EXCEPTION 'memory_access_grants.memory_item_id % does not belong to memory_space %', NEW.memory_item_id, NEW.memory_space_id;
    END IF;
    IF v_item_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'memory_access_grants.memory_item_id % workspace mismatch', NEW.memory_item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_memory_grant_validate
  BEFORE INSERT OR UPDATE ON memory_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION validate_memory_access_grant();

-- ============================================================================
-- file-service refactor: scope layer (file_spaces) + working-tree snapshot
-- DAG (file_snapshots) + access grants (file_access_grants) + sandbox mounts
-- (file_mounts). Placed here (after access_subjects + the scope-validation
-- helpers is_memory_owner_subject_kind / is_scope_eligible_subject /
-- access_subject_workspace_id) because the validation triggers depend on them.
-- Mirrors the memory_spaces / memory_access_grants design (the proven
-- subject+scope+grant pattern) so file scoping is multi-owner from day one.
-- ============================================================================

-- Multi-scope file space: one logical namespace owned by a subject (actor /
-- conversation / workspace / workspace_member / remote_agent), optionally
-- scoped to a second subject (conversation), with a namespace_key. Mirrors
-- memory_spaces exactly. `current_snapshot_id` is the working-tree HEAD; its
-- composite FK to file_snapshots(id, file_space_id) is added after that table
-- so the snapshot is guaranteed to belong to THIS space.
CREATE TABLE file_spaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  owner_subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  namespace_key VARCHAR(255) NOT NULL DEFAULT 'default',
  current_snapshot_id UUID,  -- composite FK added after file_snapshots
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Needed as a composite-FK target so file_snapshots/file_mounts can pin a
  -- snapshot to its space.
  UNIQUE (id, workspace_id)
);

CREATE UNIQUE INDEX uq_file_spaces_scoped
  ON file_spaces(workspace_id, owner_subject_id, scope_subject_id, namespace_key)
  WHERE scope_subject_id IS NOT NULL;
CREATE UNIQUE INDEX uq_file_spaces_unscoped
  ON file_spaces(workspace_id, owner_subject_id, namespace_key)
  WHERE scope_subject_id IS NULL;
CREATE INDEX idx_file_spaces_owner ON file_spaces(owner_subject_id);
CREATE INDEX idx_file_spaces_workspace ON file_spaces(workspace_id);

-- Working-tree snapshot DAG (replaces the helper's history.sqlite as the
-- authoritative history). Each row points at a manifest blob in the CAS
-- (content_blobs) whose serialization lists path -> {kind, sha256, mode,
-- size, target}. `version` is monotonic per space; parent_snapshot_id forms
-- the DAG. The (parent_snapshot_id, file_space_id) composite FK keeps the
-- chain inside one space (no cross-space DAG splicing).
CREATE TABLE file_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  file_space_id UUID NOT NULL REFERENCES file_spaces(id) ON DELETE RESTRICT,
  parent_snapshot_id UUID,
  version BIGINT NOT NULL,
  manifest_sha256 VARCHAR(64) NOT NULL REFERENCES content_blobs(sha256) ON DELETE RESTRICT,
  reason file_snapshot_reason NOT NULL DEFAULT 'session_commit',
  entry_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  created_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Composite-FK target: lets file_spaces.current_snapshot_id +
  -- file_mounts.base/result_snapshot_id pin a snapshot to its space.
  UNIQUE (id, file_space_id),
  UNIQUE (file_space_id, version),
  -- parent must be in the same space.
  FOREIGN KEY (parent_snapshot_id, file_space_id)
    REFERENCES file_snapshots(id, file_space_id) ON DELETE SET NULL
);

CREATE INDEX idx_file_snapshots_space ON file_snapshots(file_space_id, created_at DESC);
CREATE INDEX idx_file_snapshots_parent ON file_snapshots(parent_snapshot_id) WHERE parent_snapshot_id IS NOT NULL;
CREATE INDEX idx_file_snapshots_manifest ON file_snapshots(manifest_sha256);
CREATE INDEX idx_file_snapshots_session ON file_snapshots(created_by_session_id) WHERE created_by_session_id IS NOT NULL;

-- Deferred composite FK: file_spaces.current_snapshot_id must reference a
-- snapshot of the SAME space. Column-level ON DELETE SET NULL (PG15+) nulls
-- only current_snapshot_id, never the PK id, when the pointed-at snapshot is
-- deleted. (Target is PG16 — see test/helpers/db.ts pgvector:pg16.)
ALTER TABLE file_spaces
  ADD CONSTRAINT file_spaces_current_snapshot_fkey
  FOREIGN KEY (current_snapshot_id, id)
  REFERENCES file_snapshots(id, file_space_id)
  ON DELETE SET NULL (current_snapshot_id);

-- file_space owner/scope validation (mirrors validate_memory_space_subject_scope).
CREATE OR REPLACE FUNCTION validate_file_space_subject_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_ws UUID;
  v_scope_ws UUID;
BEGIN
  IF NOT is_memory_owner_subject_kind(NEW.owner_subject_id) THEN
    RAISE EXCEPTION 'file_spaces.owner_subject_id % must reference a subject of kind workspace_member|actor|remote_agent|workspace|conversation', NEW.owner_subject_id;
  END IF;
  IF NOT is_scope_eligible_subject(NEW.scope_subject_id) THEN
    RAISE EXCEPTION 'file_spaces.scope_subject_id % must reference a subject of kind workspace|conversation', NEW.scope_subject_id;
  END IF;
  v_owner_ws := access_subject_workspace_id(NEW.owner_subject_id);
  IF v_owner_ws IS NULL OR v_owner_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'file_spaces.owner_subject_id % workspace % does not match space workspace %', NEW.owner_subject_id, v_owner_ws, NEW.workspace_id;
  END IF;
  IF NEW.scope_subject_id IS NOT NULL THEN
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'file_spaces.scope_subject_id % workspace % does not match space workspace %', NEW.scope_subject_id, v_scope_ws, NEW.workspace_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_file_space_validate
  BEFORE INSERT OR UPDATE ON file_spaces
  FOR EACH ROW
  EXECUTE FUNCTION validate_file_space_subject_scope();

-- Access grants over a file space (space-wide) or a single asset (mirrors
-- memory_access_grants). file_asset_id NULL = space-wide grant.
CREATE TABLE file_access_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  file_space_id UUID NOT NULL REFERENCES file_spaces(id) ON DELETE RESTRICT,
  file_asset_id UUID REFERENCES file_assets(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES access_subjects(id) ON DELETE RESTRICT,
  scope_subject_id UUID REFERENCES access_subjects(id) ON DELETE RESTRICT,
  permissions file_permission[] NOT NULL
    CHECK (cardinality(permissions) > 0 AND array_position(permissions, NULL) IS NULL),
  status file_access_grants_status NOT NULL DEFAULT 'active',
  source TEXT,
  created_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  -- task unification: repointed from tool_call_tasks → tool_call_tasks.
  source_task_id UUID REFERENCES tool_call_tasks(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_file_access_grants_active
  ON file_access_grants(
    file_space_id,
    COALESCE(file_asset_id::text, ''),
    subject_id,
    COALESCE(scope_subject_id::text, '')
  )
  WHERE status = 'active';
CREATE INDEX idx_file_access_grants_space
  ON file_access_grants(file_space_id, status, created_at DESC);
CREATE INDEX idx_file_access_grants_subject
  ON file_access_grants(subject_id, status, created_at DESC);
CREATE INDEX idx_file_access_grants_asset
  ON file_access_grants(file_asset_id)
  WHERE file_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_file_access_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_subject_kind subject_kind;
  v_subject_ws   UUID;
  v_scope_ws     UUID;
  v_space_ws     UUID;
  v_asset_ws     UUID;
BEGIN
  IF NOT is_scope_eligible_subject(NEW.scope_subject_id) THEN
    RAISE EXCEPTION 'file_access_grants.scope_subject_id % must reference a subject of kind workspace|conversation', NEW.scope_subject_id;
  END IF;
  SELECT kind INTO v_subject_kind FROM access_subjects WHERE id = NEW.subject_id;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'file_access_grants.subject_id % not found', NEW.subject_id;
  END IF;
  IF v_subject_kind NOT IN ('workspace_member','actor','remote_agent','workspace','conversation') THEN
    RAISE EXCEPTION 'file_access_grants.subject_id % refers to kind % which is not allowed', NEW.subject_id, v_subject_kind;
  END IF;
  v_subject_ws := access_subject_workspace_id(NEW.subject_id);
  IF v_subject_ws IS NULL OR v_subject_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'file_access_grants.subject_id % workspace mismatch (% vs %)', NEW.subject_id, v_subject_ws, NEW.workspace_id;
  END IF;
  IF NEW.scope_subject_id IS NOT NULL THEN
    v_scope_ws := access_subject_workspace_id(NEW.scope_subject_id);
    IF v_scope_ws IS NULL OR v_scope_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'file_access_grants.scope_subject_id % workspace mismatch', NEW.scope_subject_id;
    END IF;
  END IF;
  SELECT workspace_id INTO v_space_ws FROM file_spaces WHERE id = NEW.file_space_id;
  IF v_space_ws IS NULL OR v_space_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'file_access_grants.file_space_id % missing or workspace mismatch (% vs %)', NEW.file_space_id, v_space_ws, NEW.workspace_id;
  END IF;
  IF NEW.file_asset_id IS NOT NULL THEN
    -- Existence is the FOUND flag, NOT a non-null workspace_id: a library-global
    -- asset legitimately has workspace_id NULL, so testing v_asset_ws IS NULL
    -- would wrongly reject a real global asset.
    SELECT workspace_id INTO v_asset_ws FROM file_assets WHERE id = NEW.file_asset_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'file_access_grants.file_asset_id % not found', NEW.file_asset_id;
    END IF;
    -- file_assets.workspace_id may be NULL for library-global assets; only
    -- enforce a match when the asset is workspace-scoped.
    IF v_asset_ws IS NOT NULL AND v_asset_ws IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'file_access_grants.file_asset_id % workspace mismatch', NEW.file_asset_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_file_grant_validate
  BEFORE INSERT OR UPDATE ON file_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION validate_file_access_grant();

-- Sandbox mounts: one row per (session, space) projection. A session's
-- sandbox mounts up to three spaces (/conversation, /actor,
-- /actor-conversation) under one mount_subpath each. runtime_id is the local
-- sandbox device-runtime spawned for the session (ON DELETE SET NULL so
-- teardown's deleteDevice doesn't block and the mount audit row survives).
CREATE TABLE file_mounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  -- The mounted space, pinned to the mount's workspace by a COMPOSITE FK (below) so a
  -- mount can never mount a cross-workspace space (mirrors the sandbox_id pin).
  file_space_id UUID NOT NULL,
  mount_subpath TEXT NOT NULL
    CHECK (mount_subpath IN ('conversation', 'actor', 'actor-conversation')),
  -- The sandbox that owns this mount (CTI detail row; sandboxes.id == runtimes.id).
  -- This is the SOLE mount→runtime identity (P3): reconcile/teardown resolve the
  -- sandbox row from here and read adapter / resource_id / host_pid / pairing_session
  -- off THAT row — never duplicated onto the mount. Pinned to the mount's workspace by
  -- a COMPOSITE FK (below) so a mount can never reference a cross-workspace sandbox.
  sandbox_id UUID,
  base_snapshot_id UUID,
  result_snapshot_id UUID,
  refresh_policy TEXT NOT NULL DEFAULT 'per_turn'
    CHECK (refresh_policy IN ('per_turn', 'on_teardown')),
  status file_mount_status NOT NULL DEFAULT 'provisioning',
  materialized_dir TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  -- Ownership pin: the space exists AND shares this mount's workspace.
  FOREIGN KEY (file_space_id, workspace_id)
    REFERENCES file_spaces(id, workspace_id) ON DELETE RESTRICT,
  -- Ownership pin: the sandbox exists AND shares this mount's workspace. SET NULL
  -- (sandbox_id only) so teardown of the sandbox never blocks on a live mount and the
  -- mount audit survives; workspace_id (NOT NULL) is untouched. MATCH SIMPLE ⇒ when
  -- sandbox_id is NULL (pre-backfill / post-teardown) the pin is inactive.
  FOREIGN KEY (sandbox_id, workspace_id)
    REFERENCES sandboxes(id, workspace_id) ON DELETE SET NULL (sandbox_id),
  -- base/result snapshots must belong to the mounted space.
  FOREIGN KEY (base_snapshot_id, file_space_id)
    REFERENCES file_snapshots(id, file_space_id) ON DELETE SET NULL,
  FOREIGN KEY (result_snapshot_id, file_space_id)
    REFERENCES file_snapshots(id, file_space_id) ON DELETE SET NULL
);

-- One active mount per (session, space) AND per (session, mount_subpath) so a
-- session never has two live mounts competing for the same path (resolver
-- ambiguity) or the same space.
-- 'recovering' is a leased FAILED mount (never a live mount) → excluded here alongside
-- 'closed'/'failed' so a failed→recovering CAS can never collide with a re-provisioned
-- generation's live mount for the same (session, space/subpath).
CREATE UNIQUE INDEX uq_file_mounts_active_session_space
  ON file_mounts(session_id, file_space_id)
  WHERE status NOT IN ('closed', 'failed', 'recovering');
CREATE UNIQUE INDEX uq_file_mounts_active_session_subpath
  ON file_mounts(session_id, mount_subpath)
  WHERE status NOT IN ('closed', 'failed', 'recovering');
-- Live mounts by owning CTI sandbox detail id (the sole mount→runtime identity).
CREATE INDEX idx_file_mounts_live_sandbox
  ON file_mounts(sandbox_id)
  WHERE sandbox_id IS NOT NULL AND status NOT IN ('closed', 'failed', 'recovering');
CREATE INDEX idx_file_mounts_status ON file_mounts(status, created_at DESC);
CREATE INDEX idx_file_mounts_space ON file_mounts(file_space_id);

-- ============================================================================
-- SOFT DELETE — P0a additive lifecycle columns (pure-add, no behavior change)
-- ============================================================================
-- See docs/soft-delete-design.md §10 (P0a). This block is intentionally pure
-- additive: every column is nullable, or NOT NULL with a DEFAULT that backfills
-- existing rows to "live". It introduces NO tombstones, changes NO FK/cascade
-- behavior, and is the safe prerequisite for the atomic cutover. The manifest
-- soft-delete-table-classification.yml is the source of truth for which tables
-- get which columns; derive-fk-policy.mjs enforces consistency.

-- 1) deleted_at on the 24 soft-delete ROOT entities (NULL = live).
ALTER TABLE account                          ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE automation_integration_bindings  ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE automation_rules                 ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE automation_webhook_endpoints     ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE catalog_items                    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE conversations                    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE file_assets                      ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE file_spaces                      ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE memory_items                     ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE memory_spaces                    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE model_groups                     ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE model_bindings                   ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE plugin_connections               ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE publishers                       ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE remote_agent_machines            ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE transport_accounts               ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE users                            ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE workspaces                       ADD COLUMN deleted_at TIMESTAMPTZ;

-- 2) workspace_members: single durable identity row (design §6). status flips on
--    leave/removal; member id is stable; re-join revives. DEFAULT 'active'
--    backfills existing members.
ALTER TABLE workspace_members ADD COLUMN status workspace_members_status NOT NULL DEFAULT 'active';
ALTER TABLE workspace_members ADD COLUMN left_at TIMESTAMPTZ;
ALTER TABLE workspace_members ADD COLUMN removed_at TIMESTAMPTZ;

-- 3) Composite-PK access binding tables: status flip on revoke (design §6.2 A).
ALTER TABLE platform_access_bindings  ADD COLUMN status access_binding_status NOT NULL DEFAULT 'active';
ALTER TABLE platform_access_bindings  ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE platform_access_bindings  ADD COLUMN revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workspace_access_bindings ADD COLUMN status access_binding_status NOT NULL DEFAULT 'active';
ALTER TABLE workspace_access_bindings ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE workspace_access_bindings ADD COLUMN revoked_by_workspace_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL;

-- 4) devices: lifecycle marker so sandbox-ephemeral devices are distinguished
--    from registered ones (design §5.3). DEFAULT 'registered' backfills.

-- 5) model_bindings: enabled display-name uniqueness within a group, live-only
--    (added here since it references the deleted_at column added above).
CREATE UNIQUE INDEX uq_model_bindings_group_display_live
  ON model_bindings (group_id, display_name) WHERE deleted_at IS NULL;

-- 6) tool_calls soft pointers (tool provenance & routing refactor). Declared
--    post-hoc because plugin_installations / runtime_tools are created after
--    tool_calls. ON DELETE SET NULL: the immutable source_snapshot is the
--    durable audit truth, so losing the live pointer on hard-purge is fine and
--    must NOT block sd_purge_* (which hard-deletes those parents).
ALTER TABLE tool_calls
  ADD CONSTRAINT fk_tool_calls_plugin_installation
  FOREIGN KEY (plugin_installation_id) REFERENCES plugin_installations(id) ON DELETE SET NULL;
ALTER TABLE tool_calls
  ADD CONSTRAINT fk_tool_calls_runtime_tool
  FOREIGN KEY (runtime_tool_id) REFERENCES runtime_tools(id) ON DELETE SET NULL;
CREATE INDEX idx_tool_calls_plugin_installation ON tool_calls(plugin_installation_id);
CREATE INDEX idx_tool_calls_runtime_tool ON tool_calls(runtime_tool_id);

-- 7) `updated_at` is database-owned. Application code may still set it
--    redundantly, but correctness must not depend on every write path
--    remembering to do so. Install one generic trigger on every public base
--    table that exposes an `updated_at` column.
CREATE OR REPLACE FUNCTION touch_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $touch_updated_at$
DECLARE
  row_record RECORD;
BEGIN
  FOR row_record IN
    SELECT columns.table_name
    FROM information_schema.columns AS columns
    JOIN information_schema.tables AS tables
      ON tables.table_schema = columns.table_schema
     AND tables.table_name = columns.table_name
    WHERE columns.table_schema = 'public'
      AND tables.table_type = 'BASE TABLE'
      AND columns.column_name = 'updated_at'
    ORDER BY columns.table_name
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_updated_at__%1$I ON %1$I',
      row_record.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at__%1$I BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION touch_updated_at_column()',
      row_record.table_name
    );
  END LOOP;
END;
$touch_updated_at$;

-- >>> SOFT-DELETE CUTOVER (generated by cutover-emit-ddl.mjs) >>>
-- Source of truth: soft-delete-table-classification.yml. Regenerate with
-- `node scripts/cutover-emit-ddl.mjs`. See docs/soft-delete-design.md §7.

-- 0. Privileged delete roles (NOLOGIN). SECURITY DEFINER cleanup/purge
-- functions are owned by synapse_purge_fn_owner; the reject-delete guard
-- recognizes these as current_user (design §7.5.1). Idempotent.
DO $sd_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synapse_purge_fn_owner') THEN
    CREATE ROLE synapse_purge_fn_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synapse_purge_role') THEN
    CREATE ROLE synapse_purge_role NOLOGIN;
  END IF;
END
$sd_roles$;

-- 1/2. Partial unique indexes (business keys survive soft delete) ---------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_live ON users (email) WHERE deleted_at IS NULL;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_slug_live ON workspaces (slug) WHERE deleted_at IS NULL;
ALTER TABLE publishers DROP CONSTRAINT IF EXISTS publishers_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_publishers_slug_live ON publishers (slug) WHERE deleted_at IS NULL;
ALTER TABLE account DROP CONSTRAINT IF EXISTS uq_account_provider_account;
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_provider_id_account_id_live ON account (provider_id, account_id) WHERE deleted_at IS NULL;
ALTER TABLE transport_accounts DROP CONSTRAINT IF EXISTS transport_accounts_workspace_id_transport_kind_account_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_accounts_workspace_id_transport_kind_account_key_live ON transport_accounts (workspace_id, transport_kind, account_key) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS uq_catalog_items_global_slug;
CREATE UNIQUE INDEX uq_catalog_items_global_slug ON catalog_items (publisher_id, item_kind, slug) WHERE (workspace_id IS NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_catalog_items_workspace_slug;
CREATE UNIQUE INDEX uq_catalog_items_workspace_slug ON catalog_items (publisher_id, workspace_id, item_kind, slug) WHERE (workspace_id IS NOT NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_catalog_items_mirror_source;
CREATE UNIQUE INDEX uq_catalog_items_mirror_source ON catalog_items (mirror_source_id) WHERE (mirror_source_id IS NOT NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_memory_spaces_scoped;
CREATE UNIQUE INDEX uq_memory_spaces_scoped ON memory_spaces (workspace_id, owner_subject_id, scope_subject_id, namespace_key) WHERE (scope_subject_id IS NOT NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_memory_spaces_unscoped;
CREATE UNIQUE INDEX uq_memory_spaces_unscoped ON memory_spaces (workspace_id, owner_subject_id, namespace_key) WHERE (scope_subject_id IS NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_file_spaces_scoped;
CREATE UNIQUE INDEX uq_file_spaces_scoped ON file_spaces (workspace_id, owner_subject_id, scope_subject_id, namespace_key) WHERE (scope_subject_id IS NOT NULL) AND deleted_at IS NULL;
DROP INDEX IF EXISTS uq_file_spaces_unscoped;
CREATE UNIQUE INDEX uq_file_spaces_unscoped ON file_spaces (workspace_id, owner_subject_id, namespace_key) WHERE (scope_subject_id IS NULL) AND deleted_at IS NULL;

-- 3. Reject-delete guard: app role cannot hard-delete persistent tables --
-- Bypass only for privileged delete roles (purge / definer-owned fns);
-- keyed on current_user, NOT a forgeable GUC (design §7.5.1).
CREATE OR REPLACE FUNCTION sd_reject_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- current_user is the function owner inside a SECURITY DEFINER purge fn, or
  -- the privileged purge role on a break-glass login. Everyone else is blocked.
  IF current_user IN ('synapse_purge_fn_owner', 'synapse_purge_role') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'hard delete of % is forbidden (soft-delete only; use markDeleted/closeSandbox or an offline purge fn)', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS sd_reject_delete ON access_subjects;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON account;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON account FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON actor_source_refs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON actor_source_refs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON actor_template_version_specs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON actor_template_version_specs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON actor_version_docs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON actor_version_docs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON actor_versions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON actor_versions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON actors;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON actors FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_event_sources;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_event_sources FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_integration_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_integration_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_occurrences;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_occurrences FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_policies;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_policies FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_rules;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_rules FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON automation_webhook_endpoints;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON automation_webhook_endpoints FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON catalog_categories;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON catalog_categories FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON catalog_items;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON catalog_items FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON catalog_version_files;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON catalog_version_files FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON catalog_versions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON catalog_versions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON chat_client_instances;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON chat_client_instances FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON chat_conversation_create_requests;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON chat_conversation_create_requests FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON content_blobs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON content_blobs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON context_archive_frame_parts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON context_archive_frame_parts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON context_archive_frames;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON context_archive_frames FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON context_archive_points;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON context_archive_points FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_device_states;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_device_states FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_item_context_targets;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_item_context_targets FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_item_mentions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_item_mentions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_item_parts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_item_parts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_item_targets;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_item_targets FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_items;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_items FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_participant_addresses;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_participant_addresses FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_participant_states;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_participant_states FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_participants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_participants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversation_transport_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversation_transport_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON conversations;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON devices;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON devices FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON direct_conversation_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON direct_conversation_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON file_access_grants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON file_access_grants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON file_assets;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON file_assets FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON file_snapshots;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON file_snapshots FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON file_spaces;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON file_spaces FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON installed_skills;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON installed_skills FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_access_grants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_access_grants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_item_parts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_item_parts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_items;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_items FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_recall_run_results;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_recall_run_results FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_recall_runs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_recall_runs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON memory_spaces;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON memory_spaces FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON model_binding_versions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON model_binding_versions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON model_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON model_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON model_group_grants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON model_group_grants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON model_groups;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON model_groups FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON payload_blobs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON payload_blobs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON platform_access_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON platform_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON plugin_connections;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON plugin_connections FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON plugin_installations;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON plugin_installations FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON plugin_package_version_specs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON plugin_package_version_specs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON plugin_source_refs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON plugin_source_refs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON provider_steps;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON provider_steps FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON publishers;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON publishers FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agent_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agent_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agent_conversation_views;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agent_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agent_machines;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agent_machines FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agent_message_deliveries;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agent_message_deliveries FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agent_runtime_catalog;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agent_runtime_catalog FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON remote_agents;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON remote_agents FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_authorization_grants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_capabilities;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_capabilities FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_catalog_revisions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_catalog_revisions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_events;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_events FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_exposures;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_exposures FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_operation_attempts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_operation_attempts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_operation_results;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_operation_results FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_operations;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_service_keys;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_service_keys FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_services;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_services FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_tool_revisions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_tool_revisions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtime_tools;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtime_tools FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON runtimes;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON runtimes FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON sandboxes;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON sandboxes FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_mirror_sources;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_mirror_sources FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_package_version_specs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_package_version_specs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_snapshot_files;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_snapshot_files FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_snapshots;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_snapshots FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_source_refs;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_source_refs FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON skill_versions;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON skill_versions FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_call_task_output_chunks;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_call_task_output_chunks FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_call_task_response_commands;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_call_task_response_commands FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_calls;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_calls FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_execution_attempts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_execution_attempts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_result_parts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_result_parts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON tool_results;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON tool_results FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON transport_accounts;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON transport_accounts FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON transport_addresses;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON transport_addresses FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON transport_endpoints;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON transport_endpoints FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON transport_message_links;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON transport_message_links FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON turns;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON turns FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON users;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_access_bindings;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_capability_conversation_type_policies;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_capability_conversation_type_policies FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_friend_entries;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_friend_entries FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_friend_requests;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_friend_requests FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_invites;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_invites FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_member_conversation_views;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_member_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_member_preferences;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_member_preferences FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_member_sync_events;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_member_sync_events FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_members;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_members FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_relationship_profiles;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_relationship_profiles FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_resource_grant_requests;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_resource_grant_requests FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_resource_grants;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_resource_grants FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspace_resources;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspace_resources FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();
DROP TRIGGER IF EXISTS sd_reject_delete ON workspaces;
CREATE TRIGGER sd_reject_delete BEFORE DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION sd_reject_delete();

-- 4. Soft-delete-aware referential integrity: forbid NEW/revived refs to
-- a non-live parent. Fires only on INSERT / FK-col change / revive
-- (design §7.3); failing-active transitions are allowed.
-- 'Parent live' is defined by the parent's own _live view (review F15), so a
-- dual-axis root (deleted_at + status liveValues, e.g. plugin_installations)
-- counts as dead once archived/expired, not only once tombstoned — the same
-- definition the read surface and sd_assert_status_parent_live use.
CREATE OR REPLACE FUNCTION sd_assert_parent_live()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_parent_table CONSTANT text := TG_ARGV[0];
  v_child_col    CONSTANT text := TG_ARGV[1];
  v_parent_col   CONSTANT text := TG_ARGV[2];
  v_child_has_deleted_at CONSTANT boolean := TG_ARGV[3] = 'true';
  v_child_live_values CONSTANT text[] := CASE
    WHEN TG_NARGS >= 5 AND TG_ARGV[4] <> '' THEN string_to_array(TG_ARGV[4], ',')
    ELSE ARRAY[]::text[]
  END;
  v_child_live_col CONSTANT text := CASE
    WHEN TG_NARGS >= 6 AND TG_ARGV[5] <> '' THEN TG_ARGV[5]
    ELSE 'status'
  END;
  v_fk_value     uuid;
  v_old_value    uuid;
  v_alive        boolean;
  v_recheck      boolean := FALSE;
  v_old_deleted  timestamptz;
  v_new_deleted  timestamptz;
  v_old_status   text;
  v_new_status   text;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_child_col) INTO v_fk_value USING NEW;
  IF v_fk_value IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_recheck := TRUE;
  ELSE
    -- UPDATE: re-check when the FK column changed OR on a REVIVE
    -- (deleted_at non-null -> NULL), so a restored child can't point at a
    -- soft-deleted parent. A plain failing transition (active -> deleted) and
    -- non-FK updates are NOT re-checked (the orchestration relies on that).
    EXECUTE format('SELECT ($1).%I', v_child_col) INTO v_old_value USING OLD;
    IF v_old_value IS DISTINCT FROM v_fk_value THEN
      v_recheck := TRUE;
    ELSIF v_child_has_deleted_at THEN
      EXECUTE 'SELECT ($1).deleted_at' INTO v_old_deleted USING OLD;
      EXECUTE 'SELECT ($1).deleted_at' INTO v_new_deleted USING NEW;
      IF v_old_deleted IS NOT NULL AND v_new_deleted IS NULL THEN
        v_recheck := TRUE; -- revive
      END IF;
    ELSIF array_length(v_child_live_values, 1) IS NOT NULL THEN
      EXECUTE format('SELECT ($1).%I::text', v_child_live_col) INTO v_old_status USING OLD;
      EXECUTE format('SELECT ($1).%I::text', v_child_live_col) INTO v_new_status USING NEW;
      IF v_new_status = ANY(v_child_live_values)
         AND NOT (v_old_status = ANY(v_child_live_values)) THEN
        v_recheck := TRUE; -- live-state revive (dead -> live)
      END IF;
    END IF;
    IF NOT v_recheck
       AND v_child_has_deleted_at
       AND array_length(v_child_live_values, 1) IS NOT NULL THEN
      EXECUTE format('SELECT ($1).%I::text', v_child_live_col) INTO v_old_status USING OLD;
      EXECUTE format('SELECT ($1).%I::text', v_child_live_col) INTO v_new_status USING NEW;
      IF v_new_status = ANY(v_child_live_values)
         AND NOT (v_old_status = ANY(v_child_live_values)) THEN
        v_recheck := TRUE; -- dual-axis root live-state revive
      END IF;
    END IF;
  END IF;
  IF NOT v_recheck THEN
    RETURN NEW;
  END IF;
  -- Liveness = a row with this key exists in the parent's _live view (folds in
  -- deleted_at IS NULL and liveValues/livePredicate where declared).
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I_live WHERE %I = $1)',
    v_parent_table, v_parent_col
  ) INTO v_alive USING v_fk_value;
  IF v_alive IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '%.% references non-live %(%) = %', TG_TABLE_NAME, v_child_col, v_parent_table, v_parent_col, v_fk_value
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sd_fk_live_account_user_id ON account;
DROP TRIGGER IF EXISTS sd_fk_live_workspaces_owner_id ON workspaces;
DROP TRIGGER IF EXISTS sd_fk_live_platform_access_bindings_user_id ON platform_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_platform_access_bindings_assigned_by_user_id ON platform_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_members_workspace_id ON workspace_members;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_members_user_id ON workspace_members;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resources_workspace_id ON workspace_resources;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_access_bindings_workspace_member_id ON workspace_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_access_bindings_assigned_by_workspace_member_id ON workspace_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_invites_workspace_id ON workspace_invites;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_invites_created_by_workspace_member_id ON workspace_invites;
DROP TRIGGER IF EXISTS sd_fk_live_conversations_workspace_id ON conversations;
DROP TRIGGER IF EXISTS sd_fk_live_conversations_created_by_workspace_member_id ON conversations;
DROP TRIGGER IF EXISTS sd_fk_live_file_assets_workspace_id ON file_assets;
DROP TRIGGER IF EXISTS sd_fk_live_file_assets_uploader_user_id ON file_assets;
DROP TRIGGER IF EXISTS sd_fk_live_file_assets_parent_asset_id ON file_assets;
DROP TRIGGER IF EXISTS sd_fk_live_publishers_logo_file_id ON publishers;
DROP TRIGGER IF EXISTS sd_fk_live_publishers_owner_user_id ON publishers;
DROP TRIGGER IF EXISTS sd_fk_live_publishers_workspace_id ON publishers;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_categories_icon_file_id ON catalog_categories;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_items_publisher_id ON catalog_items;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_items_workspace_id ON catalog_items;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_items_icon_file_id ON catalog_items;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_versions_catalog_item_id ON catalog_versions;
DROP TRIGGER IF EXISTS sd_fk_live_catalog_versions_created_by_user_id ON catalog_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_template_version_specs_avatar_file_id ON actor_template_version_specs;
DROP TRIGGER IF EXISTS sd_fk_live_actors_avatar_file_id ON actors;
DROP TRIGGER IF EXISTS sd_fk_live_actors_parent_id ON actors;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agents_avatar_file_id ON remote_agents;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_machines_workspace_id ON remote_agent_machines;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_machines_created_by_workspace_member_id ON remote_agent_machines;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_runtime_catalog_machine_id ON remote_agent_runtime_catalog;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_bindings_remote_agent_id ON remote_agent_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_bindings_machine_id ON remote_agent_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_relationship_profiles_workspace_id ON workspace_relationship_profiles;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_relationship_profiles_created_by_workspace_member_id ON workspace_relationship_profiles;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_friend_requests_requester_workspace_member_id ON workspace_friend_requests;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_friend_requests_resolved_by_workspace_member_id ON workspace_friend_requests;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_friend_entries_workspace_id ON workspace_friend_entries;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_friend_entries_owner_workspace_member_id ON workspace_friend_entries;
DROP TRIGGER IF EXISTS sd_fk_live_direct_conversation_bindings_conversation_id ON direct_conversation_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_preferences_workspace_member_id ON workspace_member_preferences;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_preferences_chief_actor_id ON workspace_member_preferences;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_actor_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_parent_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_created_by_workspace_member_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_source_workspace_member_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_source_actor_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_versions_source_conversation_id ON actor_versions;
DROP TRIGGER IF EXISTS sd_fk_live_actor_source_refs_actor_id ON actor_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_actor_source_refs_source_catalog_item_id ON actor_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_model_groups_owner_workspace_id ON model_groups;
DROP TRIGGER IF EXISTS sd_fk_live_model_groups_owner_workspace_member_id ON model_groups;
DROP TRIGGER IF EXISTS sd_fk_live_model_groups_created_by_workspace_member_id ON model_groups;
DROP TRIGGER IF EXISTS sd_fk_live_model_bindings_group_id ON model_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_model_bindings_installed_by_workspace_member_id ON model_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_model_binding_versions_binding_id ON model_binding_versions;
DROP TRIGGER IF EXISTS sd_fk_live_model_group_grants_group_id ON model_group_grants;
DROP TRIGGER IF EXISTS sd_fk_live_model_group_grants_created_by_workspace_member_id ON model_group_grants;
DROP TRIGGER IF EXISTS sd_fk_live_access_subjects_workspace_id ON access_subjects;
DROP TRIGGER IF EXISTS sd_fk_live_access_subjects_workspace_member_id ON access_subjects;
DROP TRIGGER IF EXISTS sd_fk_live_access_subjects_actor_id ON access_subjects;
DROP TRIGGER IF EXISTS sd_fk_live_access_subjects_remote_agent_id ON access_subjects;
DROP TRIGGER IF EXISTS sd_fk_live_access_subjects_user_id ON access_subjects;
DROP TRIGGER IF EXISTS sd_fk_live_transport_accounts_workspace_id ON transport_accounts;
DROP TRIGGER IF EXISTS sd_fk_live_transport_accounts_owner_workspace_member_id ON transport_accounts;
DROP TRIGGER IF EXISTS sd_fk_live_transport_accounts_inbound_actor_id ON transport_accounts;
DROP TRIGGER IF EXISTS sd_fk_live_transport_endpoints_transport_account_id ON transport_endpoints;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_transport_bindings_workspace_id ON conversation_transport_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_transport_bindings_inbound_actor_id ON conversation_transport_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_transport_addresses_workspace_id ON transport_addresses;
DROP TRIGGER IF EXISTS sd_fk_live_transport_addresses_workspace_member_id ON transport_addresses;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_items_conversation_id ON conversation_items;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_participants_conversation_id ON conversation_participants;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_item_mentions_mentioned_participant_id ON conversation_item_mentions;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_participant_addresses_conversation_participant_id ON conversation_participant_addresses;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_item_targets_target_participant_id ON conversation_item_targets;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_item_context_targets_target_participant_id ON conversation_item_context_targets;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_participant_states_conversation_id ON conversation_participant_states;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_participant_states_participant_id ON conversation_participant_states;
DROP TRIGGER IF EXISTS sd_fk_live_chat_client_instances_workspace_id ON chat_client_instances;
DROP TRIGGER IF EXISTS sd_fk_live_chat_client_instances_workspace_member_id ON chat_client_instances;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_device_states_conversation_id ON conversation_device_states;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_conversation_views_workspace_member_id ON workspace_member_conversation_views;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_conversation_views_conversation_id ON workspace_member_conversation_views;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_conversation_views_remote_agent_id ON remote_agent_conversation_views;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_conversation_views_conversation_id ON remote_agent_conversation_views;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_message_deliveries_remote_agent_id ON remote_agent_message_deliveries;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agent_message_deliveries_conversation_id ON remote_agent_message_deliveries;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_sync_events_workspace_id ON workspace_member_sync_events;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_sync_events_workspace_member_id ON workspace_member_sync_events;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_member_sync_events_conversation_id ON workspace_member_sync_events;
DROP TRIGGER IF EXISTS sd_fk_live_chat_conversation_create_requests_workspace_member_id ON chat_conversation_create_requests;
DROP TRIGGER IF EXISTS sd_fk_live_chat_conversation_create_requests_workspace_id ON chat_conversation_create_requests;
DROP TRIGGER IF EXISTS sd_fk_live_chat_conversation_create_requests_conversation_id ON chat_conversation_create_requests;
DROP TRIGGER IF EXISTS sd_fk_live_transport_message_links_workspace_id ON transport_message_links;
DROP TRIGGER IF EXISTS sd_fk_live_transport_message_links_conversation_id ON transport_message_links;
DROP TRIGGER IF EXISTS sd_fk_live_transport_message_links_transport_account_id ON transport_message_links;
DROP TRIGGER IF EXISTS sd_fk_live_turns_conversation_id ON turns;
DROP TRIGGER IF EXISTS sd_fk_live_turns_actor_id ON turns;
DROP TRIGGER IF EXISTS sd_fk_live_provider_steps_model_group_id ON provider_steps;
DROP TRIGGER IF EXISTS sd_fk_live_provider_steps_model_binding_id ON provider_steps;
DROP TRIGGER IF EXISTS sd_fk_live_tool_calls_conversation_id ON tool_calls;
DROP TRIGGER IF EXISTS sd_fk_live_automation_rules_workspace_id ON automation_rules;
DROP TRIGGER IF EXISTS sd_fk_live_automation_rules_conversation_id ON automation_rules;
DROP TRIGGER IF EXISTS sd_fk_live_automation_rules_created_by_participant_id ON automation_rules;
DROP TRIGGER IF EXISTS sd_fk_live_automation_policies_rule_id ON automation_policies;
DROP TRIGGER IF EXISTS sd_fk_live_automation_event_sources_workspace_id ON automation_event_sources;
DROP TRIGGER IF EXISTS sd_fk_live_automation_webhook_endpoints_workspace_id ON automation_webhook_endpoints;
DROP TRIGGER IF EXISTS sd_fk_live_automation_webhook_endpoints_created_by_workspace_member_id ON automation_webhook_endpoints;
DROP TRIGGER IF EXISTS sd_fk_live_automation_occurrences_workspace_id ON automation_occurrences;
DROP TRIGGER IF EXISTS sd_fk_live_automation_occurrences_event_source_id ON automation_occurrences;
DROP TRIGGER IF EXISTS sd_fk_live_memory_spaces_workspace_id ON memory_spaces;
DROP TRIGGER IF EXISTS sd_fk_live_memory_items_workspace_id ON memory_items;
DROP TRIGGER IF EXISTS sd_fk_live_memory_items_memory_space_id ON memory_items;
DROP TRIGGER IF EXISTS sd_fk_live_memory_items_supersedes_item_id ON memory_items;
DROP TRIGGER IF EXISTS sd_fk_live_memory_item_parts_memory_item_id ON memory_item_parts;
DROP TRIGGER IF EXISTS sd_fk_live_memory_recall_runs_workspace_id ON memory_recall_runs;
DROP TRIGGER IF EXISTS sd_fk_live_memory_recall_runs_actor_id ON memory_recall_runs;
DROP TRIGGER IF EXISTS sd_fk_live_memory_recall_runs_conversation_id ON memory_recall_runs;
DROP TRIGGER IF EXISTS sd_fk_live_memory_recall_runs_workspace_member_id ON memory_recall_runs;
DROP TRIGGER IF EXISTS sd_fk_live_memory_recall_run_results_memory_item_id ON memory_recall_run_results;
DROP TRIGGER IF EXISTS sd_fk_live_context_archive_points_conversation_id ON context_archive_points;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_events_workspace_id ON runtime_events;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_events_conversation_id ON runtime_events;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_events_actor_id ON runtime_events;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_events_user_id ON runtime_events;
DROP TRIGGER IF EXISTS sd_fk_live_installed_skills_icon_file_id ON installed_skills;
DROP TRIGGER IF EXISTS sd_fk_live_skill_versions_skill_id ON skill_versions;
DROP TRIGGER IF EXISTS sd_fk_live_skill_versions_created_by_workspace_member_id ON skill_versions;
DROP TRIGGER IF EXISTS sd_fk_live_skill_source_refs_skill_id ON skill_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_skill_source_refs_source_catalog_item_id ON skill_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_installations_catalog_item_id ON plugin_installations;
DROP TRIGGER IF EXISTS sd_fk_live_automation_integration_bindings_workspace_id ON automation_integration_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_automation_integration_bindings_installation_id ON automation_integration_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_automation_integration_bindings_webhook_endpoint_id ON automation_integration_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_connections_installation_id ON plugin_connections;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_connections_workspace_id ON plugin_connections;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_source_refs_installation_id ON plugin_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_source_refs_source_catalog_item_id ON plugin_source_refs;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grants_workspace_id ON workspace_resource_grants;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grants_workspace_resource_id ON workspace_resource_grants;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grants_created_by_workspace_member_id ON workspace_resource_grants;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grant_requests_workspace_id ON workspace_resource_grant_requests;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grant_requests_workspace_resource_id ON workspace_resource_grant_requests;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grant_requests_requester_workspace_member_id ON workspace_resource_grant_requests;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_resource_grant_requests_resolved_by_workspace_member_id ON workspace_resource_grant_requests;
DROP TRIGGER IF EXISTS sd_fk_live_tool_call_task_response_commands_created_by_workspace_member_id ON tool_call_task_response_commands;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_workspace_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_created_by_workspace_member_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_runtimes_workspace_id ON runtimes;
DROP TRIGGER IF EXISTS sd_fk_live_devices_workspace_id ON devices;
DROP TRIGGER IF EXISTS sd_fk_live_devices_owner_workspace_member_id ON devices;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_services_runtime_id ON runtime_services;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_services_remote_agent_machine_id ON runtime_services;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_service_keys_service_id ON runtime_service_keys;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_exposures_runtime_id ON runtime_exposures;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_exposures_service_id ON runtime_exposures;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_capabilities_exposure_id ON runtime_capabilities;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_catalog_revisions_exposure_id ON runtime_catalog_revisions;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_tools_exposure_id ON runtime_tools;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_tool_revisions_tool_id ON runtime_tool_revisions;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_workspace_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_conversation_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_initiated_by_workspace_member_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_runtime_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_runtime_exposure_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_runtime_capability_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operations_tool_id ON runtime_operations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_operation_attempts_runtime_service_id ON runtime_operation_attempts;
DROP TRIGGER IF EXISTS sd_fk_live_memory_access_grants_workspace_id ON memory_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_memory_access_grants_memory_space_id ON memory_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_memory_access_grants_memory_item_id ON memory_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_memory_access_grants_created_by_workspace_member_id ON memory_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_file_spaces_workspace_id ON file_spaces;
DROP TRIGGER IF EXISTS sd_fk_live_file_snapshots_workspace_id ON file_snapshots;
DROP TRIGGER IF EXISTS sd_fk_live_file_snapshots_file_space_id ON file_snapshots;
DROP TRIGGER IF EXISTS sd_fk_live_file_access_grants_workspace_id ON file_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_file_access_grants_file_space_id ON file_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_file_access_grants_file_asset_id ON file_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_file_access_grants_created_by_workspace_member_id ON file_access_grants;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_governing_resource_grant_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_platform_access_bindings_revoked_by_user_id ON platform_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_workspace_access_bindings_revoked_by_workspace_member_id ON workspace_access_bindings;
DROP TRIGGER IF EXISTS sd_fk_live_users_avatar_file_id ON users;
DROP TRIGGER IF EXISTS sd_fk_live_conversation_items_author_participant_id ON conversation_items;
DROP TRIGGER IF EXISTS sd_fk_live_automation_event_sources_webhook_endpoint_id ON automation_event_sources;
DROP TRIGGER IF EXISTS sd_fk_live_automation_event_sources_integration_binding_id ON automation_event_sources;
DROP TRIGGER IF EXISTS sd_fk_live_actors_id ON actors;
DROP TRIGGER IF EXISTS sd_fk_live_remote_agents_id ON remote_agents;
DROP TRIGGER IF EXISTS sd_fk_live_installed_skills_id ON installed_skills;
DROP TRIGGER IF EXISTS sd_fk_live_plugin_installations_id ON plugin_installations;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_capabilities_id ON runtime_capabilities;
DROP TRIGGER IF EXISTS sd_fk_live_automation_event_sources_id ON automation_event_sources;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_runtime_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_runtime_capability_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_runtime_authorization_grants_runtime_exposure_id ON runtime_authorization_grants;
DROP TRIGGER IF EXISTS sd_fk_live_devices_id ON devices;
DROP TRIGGER IF EXISTS sd_fk_live_sandboxes_id ON sandboxes;
DROP TRIGGER IF EXISTS sd_fk_live_tool_calls_plugin_installation_id ON tool_calls;
DROP TRIGGER IF EXISTS sd_fk_live_tool_calls_runtime_tool_id ON tool_calls;

CREATE TRIGGER sd_fk_live_account_user_id BEFORE INSERT OR UPDATE OF user_id, deleted_at ON account FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('users', 'user_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_workspaces_owner_id BEFORE INSERT OR UPDATE OF owner_id, deleted_at ON workspaces FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('users', 'owner_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_platform_access_bindings_user_id BEFORE INSERT OR UPDATE OF user_id, status ON platform_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('users', 'user_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_members_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, status ON workspace_members FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_members_user_id BEFORE INSERT OR UPDATE OF user_id, status ON workspace_members FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('users', 'user_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_resources_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at, status ON workspace_resources FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', 'active,disabled,error,deprecated');
CREATE TRIGGER sd_fk_live_workspace_access_bindings_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id, status ON workspace_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_invites_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON workspace_invites FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_conversations_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON conversations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_file_assets_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON file_assets FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_publishers_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON publishers FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_catalog_items_publisher_id BEFORE INSERT OR UPDATE OF publisher_id, deleted_at ON catalog_items FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('publishers', 'publisher_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_catalog_items_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON catalog_items FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_catalog_versions_catalog_item_id BEFORE INSERT OR UPDATE OF catalog_item_id ON catalog_versions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('catalog_items', 'catalog_item_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_machines_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON remote_agent_machines FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_remote_agent_runtime_catalog_machine_id BEFORE INSERT OR UPDATE OF machine_id ON remote_agent_runtime_catalog FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agent_machines', 'machine_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_bindings_remote_agent_id BEFORE INSERT OR UPDATE OF remote_agent_id ON remote_agent_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agents', 'remote_agent_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_bindings_machine_id BEFORE INSERT OR UPDATE OF machine_id ON remote_agent_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agent_machines', 'machine_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_relationship_profiles_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON workspace_relationship_profiles FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_friend_entries_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON workspace_friend_entries FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_friend_entries_owner_workspace_member_id BEFORE INSERT OR UPDATE OF owner_workspace_member_id ON workspace_friend_entries FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'owner_workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_direct_conversation_bindings_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON direct_conversation_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_preferences_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON workspace_member_preferences FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_actor_versions_actor_id BEFORE INSERT OR UPDATE OF actor_id ON actor_versions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('actors', 'actor_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_actor_source_refs_actor_id BEFORE INSERT OR UPDATE OF actor_id ON actor_source_refs FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('actors', 'actor_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_model_groups_owner_workspace_id BEFORE INSERT OR UPDATE OF owner_workspace_id, deleted_at ON model_groups FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'owner_workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_model_groups_owner_workspace_member_id BEFORE INSERT OR UPDATE OF owner_workspace_member_id, deleted_at ON model_groups FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'owner_workspace_member_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_model_bindings_group_id BEFORE INSERT OR UPDATE OF group_id, deleted_at ON model_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('model_groups', 'group_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_model_binding_versions_binding_id BEFORE INSERT OR UPDATE OF binding_id ON model_binding_versions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('model_bindings', 'binding_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_model_group_grants_group_id BEFORE INSERT OR UPDATE OF group_id, status ON model_group_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('model_groups', 'group_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_access_subjects_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_access_subjects_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_access_subjects_actor_id BEFORE INSERT OR UPDATE OF actor_id ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('actors', 'actor_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_access_subjects_remote_agent_id BEFORE INSERT OR UPDATE OF remote_agent_id ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agents', 'remote_agent_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_access_subjects_user_id BEFORE INSERT OR UPDATE OF user_id ON access_subjects FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('users', 'user_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_transport_accounts_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at, status ON transport_accounts FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', 'active,disabled,error');
CREATE TRIGGER sd_fk_live_transport_accounts_owner_workspace_member_id BEFORE INSERT OR UPDATE OF owner_workspace_member_id, deleted_at, status ON transport_accounts FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'owner_workspace_member_id', 'id', 'true', 'active,disabled,error');
CREATE TRIGGER sd_fk_live_transport_endpoints_transport_account_id BEFORE INSERT OR UPDATE OF transport_account_id ON transport_endpoints FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('transport_accounts', 'transport_account_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_conversation_transport_bindings_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON conversation_transport_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_transport_addresses_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON transport_addresses FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_conversation_items_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON conversation_items FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_conversation_participants_conversation_id BEFORE INSERT OR UPDATE OF conversation_id, state ON conversation_participants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', 'active', 'state');
CREATE TRIGGER sd_fk_live_conversation_participant_states_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON conversation_participant_states FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_chat_client_instances_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON chat_client_instances FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_chat_client_instances_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON chat_client_instances FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_conversation_device_states_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON conversation_device_states FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_conversation_views_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON workspace_member_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_conversation_views_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON workspace_member_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_conversation_views_remote_agent_id BEFORE INSERT OR UPDATE OF remote_agent_id ON remote_agent_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agents', 'remote_agent_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_conversation_views_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON remote_agent_conversation_views FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_message_deliveries_remote_agent_id BEFORE INSERT OR UPDATE OF remote_agent_id ON remote_agent_message_deliveries FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agents', 'remote_agent_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agent_message_deliveries_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON remote_agent_message_deliveries FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_sync_events_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON workspace_member_sync_events FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_sync_events_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON workspace_member_sync_events FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_member_sync_events_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON workspace_member_sync_events FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_chat_conversation_create_requests_workspace_member_id BEFORE INSERT OR UPDATE OF workspace_member_id ON chat_conversation_create_requests FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_members', 'workspace_member_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_chat_conversation_create_requests_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON chat_conversation_create_requests FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_chat_conversation_create_requests_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON chat_conversation_create_requests FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_transport_message_links_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON transport_message_links FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_transport_message_links_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON transport_message_links FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_transport_message_links_transport_account_id BEFORE INSERT OR UPDATE OF transport_account_id ON transport_message_links FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('transport_accounts', 'transport_account_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_turns_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON turns FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_turns_actor_id BEFORE INSERT OR UPDATE OF actor_id ON turns FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('actors', 'actor_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_tool_calls_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON tool_calls FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_rules_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at, status ON automation_rules FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', 'active,paused,error');
CREATE TRIGGER sd_fk_live_automation_rules_conversation_id BEFORE INSERT OR UPDATE OF conversation_id, deleted_at, status ON automation_rules FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'true', 'active,paused,error');
CREATE TRIGGER sd_fk_live_automation_policies_rule_id BEFORE INSERT OR UPDATE OF rule_id ON automation_policies FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('automation_rules', 'rule_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_event_sources_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON automation_event_sources FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_webhook_endpoints_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at, status ON automation_webhook_endpoints FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', 'active,disabled');
CREATE TRIGGER sd_fk_live_automation_occurrences_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON automation_occurrences FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_memory_spaces_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON memory_spaces FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_memory_items_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON memory_items FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_memory_items_memory_space_id BEFORE INSERT OR UPDATE OF memory_space_id, deleted_at ON memory_items FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('memory_spaces', 'memory_space_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_memory_item_parts_memory_item_id BEFORE INSERT OR UPDATE OF memory_item_id ON memory_item_parts FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('memory_items', 'memory_item_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_memory_recall_runs_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON memory_recall_runs FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_memory_recall_run_results_memory_item_id BEFORE INSERT OR UPDATE OF memory_item_id ON memory_recall_run_results FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('memory_items', 'memory_item_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_context_archive_points_conversation_id BEFORE INSERT OR UPDATE OF conversation_id ON context_archive_points FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('conversations', 'conversation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_skill_versions_skill_id BEFORE INSERT OR UPDATE OF skill_id ON skill_versions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('installed_skills', 'skill_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_skill_source_refs_skill_id BEFORE INSERT OR UPDATE OF skill_id ON skill_source_refs FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('installed_skills', 'skill_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_plugin_installations_catalog_item_id BEFORE INSERT OR UPDATE OF catalog_item_id ON plugin_installations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('catalog_items', 'catalog_item_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_integration_bindings_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON automation_integration_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_automation_integration_bindings_installation_id BEFORE INSERT OR UPDATE OF installation_id, deleted_at ON automation_integration_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('plugin_installations', 'installation_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_automation_integration_bindings_webhook_endpoint_id BEFORE INSERT OR UPDATE OF webhook_endpoint_id, deleted_at ON automation_integration_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('automation_webhook_endpoints', 'webhook_endpoint_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_plugin_connections_installation_id BEFORE INSERT OR UPDATE OF installation_id, deleted_at, status ON plugin_connections FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('plugin_installations', 'installation_id', 'id', 'true', 'active');
CREATE TRIGGER sd_fk_live_plugin_connections_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at, status ON plugin_connections FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', 'active');
CREATE TRIGGER sd_fk_live_plugin_source_refs_installation_id BEFORE INSERT OR UPDATE OF installation_id ON plugin_source_refs FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('plugin_installations', 'installation_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_resource_grants_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, status ON workspace_resource_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_resource_grants_workspace_resource_id BEFORE INSERT OR UPDATE OF workspace_resource_id, status ON workspace_resource_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'workspace_resource_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_workspace_resource_grant_requests_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON workspace_resource_grant_requests FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_workspace_resource_grant_requests_workspace_resource_id BEFORE INSERT OR UPDATE OF workspace_resource_id ON workspace_resource_grant_requests FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'workspace_resource_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_authorization_grants_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, status ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_runtimes_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON runtimes FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_devices_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON devices FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_services_runtime_id BEFORE INSERT OR UPDATE OF runtime_id, status ON runtime_services FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'runtime_id', 'id', 'false', 'starting,online,degraded');
CREATE TRIGGER sd_fk_live_runtime_services_remote_agent_machine_id BEFORE INSERT OR UPDATE OF remote_agent_machine_id, status ON runtime_services FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('remote_agent_machines', 'remote_agent_machine_id', 'id', 'false', 'starting,online,degraded');
CREATE TRIGGER sd_fk_live_runtime_service_keys_service_id BEFORE INSERT OR UPDATE OF service_id ON runtime_service_keys FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_services', 'service_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_exposures_runtime_id BEFORE INSERT OR UPDATE OF runtime_id ON runtime_exposures FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'runtime_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_exposures_service_id BEFORE INSERT OR UPDATE OF service_id ON runtime_exposures FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_services', 'service_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_capabilities_exposure_id BEFORE INSERT OR UPDATE OF exposure_id ON runtime_capabilities FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_exposures', 'exposure_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_catalog_revisions_exposure_id BEFORE INSERT OR UPDATE OF exposure_id ON runtime_catalog_revisions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_exposures', 'exposure_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_tools_exposure_id BEFORE INSERT OR UPDATE OF exposure_id, status ON runtime_tools FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_exposures', 'exposure_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_runtime_tool_revisions_tool_id BEFORE INSERT OR UPDATE OF tool_id ON runtime_tool_revisions FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_tools', 'tool_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operations_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operations_runtime_id BEFORE INSERT OR UPDATE OF runtime_id ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'runtime_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operations_runtime_exposure_id BEFORE INSERT OR UPDATE OF runtime_exposure_id ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_exposures', 'runtime_exposure_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operations_runtime_capability_id BEFORE INSERT OR UPDATE OF runtime_capability_id ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_capabilities', 'runtime_capability_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operations_tool_id BEFORE INSERT OR UPDATE OF tool_id ON runtime_operations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_tools', 'tool_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_operation_attempts_runtime_service_id BEFORE INSERT OR UPDATE OF runtime_service_id ON runtime_operation_attempts FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_services', 'runtime_service_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_memory_access_grants_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, status ON memory_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_memory_access_grants_memory_space_id BEFORE INSERT OR UPDATE OF memory_space_id, status ON memory_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('memory_spaces', 'memory_space_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_memory_access_grants_memory_item_id BEFORE INSERT OR UPDATE OF memory_item_id, status ON memory_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('memory_items', 'memory_item_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_file_spaces_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON file_spaces FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'true', '');
CREATE TRIGGER sd_fk_live_file_snapshots_workspace_id BEFORE INSERT OR UPDATE OF workspace_id ON file_snapshots FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_file_snapshots_file_space_id BEFORE INSERT OR UPDATE OF file_space_id ON file_snapshots FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('file_spaces', 'file_space_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_file_access_grants_workspace_id BEFORE INSERT OR UPDATE OF workspace_id, status ON file_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspaces', 'workspace_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_file_access_grants_file_space_id BEFORE INSERT OR UPDATE OF file_space_id, status ON file_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('file_spaces', 'file_space_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_file_access_grants_file_asset_id BEFORE INSERT OR UPDATE OF file_asset_id, status ON file_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('file_assets', 'file_asset_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_automation_event_sources_webhook_endpoint_id BEFORE INSERT OR UPDATE OF webhook_endpoint_id ON automation_event_sources FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('automation_webhook_endpoints', 'webhook_endpoint_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_event_sources_integration_binding_id BEFORE INSERT OR UPDATE OF integration_binding_id ON automation_event_sources FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('automation_integration_bindings', 'integration_binding_id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_actors_id BEFORE INSERT OR UPDATE OF id ON actors FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_remote_agents_id BEFORE INSERT OR UPDATE OF id ON remote_agents FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_installed_skills_id BEFORE INSERT OR UPDATE OF id ON installed_skills FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_plugin_installations_id BEFORE INSERT OR UPDATE OF id ON plugin_installations FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_capabilities_id BEFORE INSERT OR UPDATE OF id ON runtime_capabilities FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_automation_event_sources_id BEFORE INSERT OR UPDATE OF id ON automation_event_sources FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('workspace_resources', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_runtime_authorization_grants_runtime_id BEFORE INSERT OR UPDATE OF runtime_id, status ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'runtime_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_runtime_authorization_grants_runtime_capability_id BEFORE INSERT OR UPDATE OF runtime_capability_id, status ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_capabilities', 'runtime_capability_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_runtime_authorization_grants_runtime_exposure_id BEFORE INSERT OR UPDATE OF runtime_exposure_id, status ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtime_exposures', 'runtime_exposure_id', 'id', 'false', 'active');
CREATE TRIGGER sd_fk_live_devices_id BEFORE INSERT OR UPDATE OF id ON devices FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'id', 'id', 'false', '');
CREATE TRIGGER sd_fk_live_sandboxes_id BEFORE INSERT OR UPDATE OF id ON sandboxes FOR EACH ROW EXECUTE FUNCTION sd_assert_parent_live('runtimes', 'id', 'id', 'false', '');

-- 4b. Status-junction parent-liveness: block reviving/inserting a live
-- status row under a non-live parent (design §7.3 revive case, review F3).
CREATE OR REPLACE FUNCTION sd_assert_status_parent_live()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_live_values CONSTANT text[] := string_to_array(TG_ARGV[0], ',');
  v_new_status text;
  v_old_status text;
  v_i int := 1;
  v_parent text;
  v_col text;
  v_fk uuid;
  v_alive boolean;
BEGIN
  EXECUTE 'SELECT ($1).status::text' INTO v_new_status USING NEW;
  -- not transitioning into a live state -> always allowed.
  IF NOT (v_new_status = ANY(v_live_values)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    EXECUTE 'SELECT ($1).status::text' INTO v_old_status USING OLD;
    -- already live and staying live: FK columns on these junctions are
    -- immutable, so no parent re-check is needed.
    IF v_old_status = ANY(v_live_values) THEN
      RETURN NEW;
    END IF;
  END IF;
  -- INSERT of a live row, or a dead->live revive: every parent must be live.
  WHILE v_i < TG_NARGS LOOP
    v_parent := TG_ARGV[v_i];
    v_col := TG_ARGV[v_i + 1];
    EXECUTE format('SELECT ($1).%I', v_col) INTO v_fk USING NEW;
    IF v_fk IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I_live WHERE id = $1)', v_parent)
        INTO v_alive USING v_fk;
      IF NOT v_alive THEN
        RAISE EXCEPTION '%.% cannot be set live: parent %(id=%) is not live', TG_TABLE_NAME, v_col, v_parent, v_fk
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    v_i := v_i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sd_status_parent_live_file_access_grants ON file_access_grants;
CREATE TRIGGER sd_status_parent_live_file_access_grants BEFORE INSERT OR UPDATE OF status ON file_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspaces', 'workspace_id', 'file_spaces', 'file_space_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_memory_access_grants ON memory_access_grants;
CREATE TRIGGER sd_status_parent_live_memory_access_grants BEFORE INSERT OR UPDATE OF status ON memory_access_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspaces', 'workspace_id', 'memory_spaces', 'memory_space_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_model_group_grants ON model_group_grants;
CREATE TRIGGER sd_status_parent_live_model_group_grants BEFORE INSERT OR UPDATE OF status ON model_group_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'model_groups', 'group_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_platform_access_bindings ON platform_access_bindings;
CREATE TRIGGER sd_status_parent_live_platform_access_bindings BEFORE INSERT OR UPDATE OF status ON platform_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'users', 'user_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_runtime_authorization_grants ON runtime_authorization_grants;
CREATE TRIGGER sd_status_parent_live_runtime_authorization_grants BEFORE INSERT OR UPDATE OF status ON runtime_authorization_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspaces', 'workspace_id', 'runtimes', 'runtime_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_workspace_access_bindings ON workspace_access_bindings;
CREATE TRIGGER sd_status_parent_live_workspace_access_bindings BEFORE INSERT OR UPDATE OF status ON workspace_access_bindings FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspace_members', 'workspace_member_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_workspace_members ON workspace_members;
CREATE TRIGGER sd_status_parent_live_workspace_members BEFORE INSERT OR UPDATE OF status ON workspace_members FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspaces', 'workspace_id', 'users', 'user_id');
DROP TRIGGER IF EXISTS sd_status_parent_live_workspace_resource_grants ON workspace_resource_grants;
CREATE TRIGGER sd_status_parent_live_workspace_resource_grants BEFORE INSERT OR UPDATE OF status ON workspace_resource_grants FOR EACH ROW EXECUTE FUNCTION sd_assert_status_parent_live('active', 'workspaces', 'workspace_id', 'workspace_resources', 'workspace_resource_id');

-- 4.5 SECURITY DEFINER controlled-delete functions (design §7.5/§11).
-- app role gets EXECUTE; functions run as synapse_purge_fn_owner so the
-- reject-delete guard permits the delete. Fixed search_path; audited.
CREATE OR REPLACE FUNCTION sd_replace_memory_item_parts(p_memory_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM memory_item_parts WHERE memory_item_id = p_memory_item_id;
END;
$$;
ALTER FUNCTION sd_replace_memory_item_parts(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_memory_item_parts(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_detach_participant_address(p_participant_id uuid, p_transport_address_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM conversation_participant_addresses WHERE conversation_participant_id = p_participant_id AND transport_address_id = p_transport_address_id;
END;
$$;
ALTER FUNCTION sd_detach_participant_address(uuid, uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_detach_participant_address(uuid, uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_detach_runtime_service(p_service_id uuid, p_runtime_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM runtime_services WHERE id = p_service_id AND runtime_id = p_runtime_id;
END;
$$;
ALTER FUNCTION sd_detach_runtime_service(uuid, uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_detach_runtime_service(uuid, uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_clear_member_preferences(p_workspace_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM workspace_member_preferences WHERE workspace_member_id = p_workspace_member_id;
END;
$$;
ALTER FUNCTION sd_clear_member_preferences(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_clear_member_preferences(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_actor_model_groups(p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM actor_model_group_assignments WHERE actor_id = p_actor_id;
END;
$$;
ALTER FUNCTION sd_replace_actor_model_groups(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_actor_model_groups(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_group_actor_assignments(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM actor_model_group_assignments WHERE group_id = p_group_id;
END;
$$;
ALTER FUNCTION sd_replace_group_actor_assignments(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_group_actor_assignments(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_plugin_runtime_permissions(p_catalog_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM plugin_version_runtime_permissions WHERE catalog_version_id = p_catalog_version_id;
END;
$$;
ALTER FUNCTION sd_replace_plugin_runtime_permissions(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_plugin_runtime_permissions(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_catalog_item_categories(p_catalog_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM catalog_item_categories WHERE catalog_item_id = p_catalog_item_id;
END;
$$;
ALTER FUNCTION sd_replace_catalog_item_categories(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_catalog_item_categories(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_remote_agent_group_grants(p_remote_agent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM remote_agent_group_task_grants WHERE remote_agent_id = p_remote_agent_id;
END;
$$;
ALTER FUNCTION sd_replace_remote_agent_group_grants(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_remote_agent_group_grants(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_replace_memory_item_chunks(p_memory_item_id uuid, p_index_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM memory_item_chunks WHERE memory_item_id = p_memory_item_id AND index_version = p_index_version;
END;
$$;
ALTER FUNCTION sd_replace_memory_item_chunks(uuid, int) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_replace_memory_item_chunks(uuid, int) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_gc_expired_action_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM tool_call_task_action_tokens WHERE expires_at < NOW();
END;
$$;
ALTER FUNCTION sd_gc_expired_action_tokens() OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_gc_expired_action_tokens() FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_gc_dispatched_outbox(p_older_than timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM realtime_event_outbox WHERE status = 'dispatched' AND created_at < p_older_than;
END;
$$;
ALTER FUNCTION sd_gc_dispatched_outbox(timestamptz) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_gc_dispatched_outbox(timestamptz) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_delete_chat_push_token(p_token_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM chat_push_tokens WHERE id = p_token_id;
END;
$$;
ALTER FUNCTION sd_delete_chat_push_token(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_delete_chat_push_token(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sd_delete_content_blob(p_sha varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM content_blobs WHERE sha256 = p_sha;
END;
$$;
ALTER FUNCTION sd_delete_content_blob(varchar) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_delete_content_blob(varchar) FROM PUBLIC;
DO $sd_exec_grants$
DECLARE v_app_role text := current_user;
BEGIN
  IF v_app_role <> 'synapse_purge_fn_owner' THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_memory_item_parts(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_detach_participant_address(uuid, uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_detach_runtime_service(uuid, uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_clear_member_preferences(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_actor_model_groups(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_group_actor_assignments(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_plugin_runtime_permissions(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_catalog_item_categories(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_remote_agent_group_grants(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_replace_memory_item_chunks(uuid, int) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_gc_expired_action_tokens() TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_gc_dispatched_outbox(timestamptz) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_delete_chat_push_token(uuid) TO %I', v_app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sd_delete_content_blob(varchar) TO %I', v_app_role);
  END IF;
END
$sd_exec_grants$;
GRANT SELECT, DELETE ON memory_item_parts, conversation_participant_addresses, runtime_services, workspace_member_preferences, actor_model_group_assignments, plugin_version_runtime_permissions, catalog_item_categories, remote_agent_group_task_grants, memory_item_chunks, tool_call_task_action_tokens, realtime_event_outbox, chat_push_tokens, content_blobs TO synapse_purge_fn_owner;

-- 5. Live views: canonical read surface that hides soft-deleted rows.
-- Single-table views over a base table are auto-updatable; WITH CASCADED
-- CHECK OPTION blocks inserting/surfacing a row outside the predicate.
DROP VIEW IF EXISTS workspace_resource_grants_live;
DROP VIEW IF EXISTS workspace_access_bindings_live;
DROP VIEW IF EXISTS transport_accounts_live;
DROP VIEW IF EXISTS sandboxes_live;
DROP VIEW IF EXISTS runtime_tools_live;
DROP VIEW IF EXISTS runtime_authorization_grants_live;
DROP VIEW IF EXISTS runtime_capabilities_live;
DROP VIEW IF EXISTS runtime_exposures_live;
DROP VIEW IF EXISTS runtime_services_live;
DROP VIEW IF EXISTS remote_agents_live;
DROP VIEW IF EXISTS remote_agent_machines_live;
DROP VIEW IF EXISTS plugin_connections_live;
DROP VIEW IF EXISTS platform_access_bindings_live;
DROP VIEW IF EXISTS model_group_grants_live;
DROP VIEW IF EXISTS model_bindings_live;
DROP VIEW IF EXISTS model_groups_live;
DROP VIEW IF EXISTS workspace_members_live;
DROP VIEW IF EXISTS memory_access_grants_live;
DROP VIEW IF EXISTS memory_items_live;
DROP VIEW IF EXISTS memory_spaces_live;
DROP VIEW IF EXISTS installed_skills_live;
DROP VIEW IF EXISTS file_access_grants_live;
DROP VIEW IF EXISTS file_assets_live;
DROP VIEW IF EXISTS file_spaces_live;
DROP VIEW IF EXISTS devices_live;
DROP VIEW IF EXISTS runtimes_live;
DROP VIEW IF EXISTS conversation_participants_live;
DROP VIEW IF EXISTS automation_rules_live;
DROP VIEW IF EXISTS conversations_live;
DROP VIEW IF EXISTS automation_event_sources_live;
DROP VIEW IF EXISTS automation_integration_bindings_live;
DROP VIEW IF EXISTS plugin_installations_live;
DROP VIEW IF EXISTS catalog_items_live;
DROP VIEW IF EXISTS publishers_live;
DROP VIEW IF EXISTS automation_webhook_endpoints_live;
DROP VIEW IF EXISTS actors_live;
DROP VIEW IF EXISTS workspace_resources_live;
DROP VIEW IF EXISTS workspaces_live;
DROP VIEW IF EXISTS account_live;
DROP VIEW IF EXISTS users_live;
CREATE VIEW users_live AS SELECT * FROM users WHERE deleted_at IS NULL WITH CASCADED CHECK OPTION;
CREATE VIEW account_live AS SELECT base.* FROM account base WHERE deleted_at IS NULL AND (base.user_id IS NULL OR EXISTS (SELECT 1 FROM users_live lp0 WHERE lp0.id = base.user_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW workspaces_live AS SELECT base.* FROM workspaces base WHERE deleted_at IS NULL AND (base.owner_id IS NULL OR EXISTS (SELECT 1 FROM users_live lp0 WHERE lp0.id = base.owner_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW workspace_resources_live AS SELECT base.* FROM workspace_resources base WHERE deleted_at IS NULL AND status IN ('active', 'disabled', 'error', 'deprecated') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW actors_live AS SELECT base.* FROM actors base WHERE true AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp0 WHERE lp0.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW automation_webhook_endpoints_live AS SELECT base.* FROM automation_webhook_endpoints base WHERE deleted_at IS NULL AND status IN ('active', 'disabled') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW publishers_live AS SELECT base.* FROM publishers base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW catalog_items_live AS SELECT base.* FROM catalog_items base WHERE deleted_at IS NULL AND (base.publisher_id IS NULL OR EXISTS (SELECT 1 FROM publishers_live lp0 WHERE lp0.id = base.publisher_id)) AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp1 WHERE lp1.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW plugin_installations_live AS SELECT base.* FROM plugin_installations base WHERE true AND (base.catalog_item_id IS NULL OR EXISTS (SELECT 1 FROM catalog_items_live lp0 WHERE lp0.id = base.catalog_item_id)) AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp1 WHERE lp1.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW automation_integration_bindings_live AS SELECT base.* FROM automation_integration_bindings base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.installation_id IS NULL OR EXISTS (SELECT 1 FROM plugin_installations_live lp1 WHERE lp1.id = base.installation_id)) AND (base.webhook_endpoint_id IS NULL OR EXISTS (SELECT 1 FROM automation_webhook_endpoints_live lp2 WHERE lp2.id = base.webhook_endpoint_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW automation_event_sources_live AS SELECT base.* FROM automation_event_sources base WHERE true AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.webhook_endpoint_id IS NULL OR EXISTS (SELECT 1 FROM automation_webhook_endpoints_live lp1 WHERE lp1.id = base.webhook_endpoint_id)) AND (base.integration_binding_id IS NULL OR EXISTS (SELECT 1 FROM automation_integration_bindings_live lp2 WHERE lp2.id = base.integration_binding_id)) AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp3 WHERE lp3.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW conversations_live AS SELECT base.* FROM conversations base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW automation_rules_live AS SELECT base.* FROM automation_rules base WHERE deleted_at IS NULL AND status IN ('active', 'paused', 'error') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.conversation_id IS NULL OR EXISTS (SELECT 1 FROM conversations_live lp1 WHERE lp1.id = base.conversation_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW conversation_participants_live AS SELECT base.* FROM conversation_participants base WHERE state IN ('active') AND (base.conversation_id IS NULL OR EXISTS (SELECT 1 FROM conversations_live lp0 WHERE lp0.id = base.conversation_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtimes_live AS SELECT base.* FROM runtimes base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW devices_live AS SELECT base.* FROM devices base WHERE true AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.id IS NULL OR EXISTS (SELECT 1 FROM runtimes_live lp1 WHERE lp1.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW file_spaces_live AS SELECT base.* FROM file_spaces base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW file_assets_live AS SELECT base.* FROM file_assets base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW file_access_grants_live AS SELECT base.* FROM file_access_grants base WHERE status IN ('active') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.file_space_id IS NULL OR EXISTS (SELECT 1 FROM file_spaces_live lp1 WHERE lp1.id = base.file_space_id)) AND (base.file_asset_id IS NULL OR EXISTS (SELECT 1 FROM file_assets_live lp2 WHERE lp2.id = base.file_asset_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW installed_skills_live AS SELECT base.* FROM installed_skills base WHERE true AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp0 WHERE lp0.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW memory_spaces_live AS SELECT base.* FROM memory_spaces base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW memory_items_live AS SELECT base.* FROM memory_items base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.memory_space_id IS NULL OR EXISTS (SELECT 1 FROM memory_spaces_live lp1 WHERE lp1.id = base.memory_space_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW memory_access_grants_live AS SELECT base.* FROM memory_access_grants base WHERE status IN ('active') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.memory_space_id IS NULL OR EXISTS (SELECT 1 FROM memory_spaces_live lp1 WHERE lp1.id = base.memory_space_id)) AND (base.memory_item_id IS NULL OR EXISTS (SELECT 1 FROM memory_items_live lp2 WHERE lp2.id = base.memory_item_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW workspace_members_live AS SELECT base.* FROM workspace_members base WHERE status IN ('active') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.user_id IS NULL OR EXISTS (SELECT 1 FROM users_live lp1 WHERE lp1.id = base.user_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW model_groups_live AS SELECT base.* FROM model_groups base WHERE deleted_at IS NULL AND (base.owner_workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.owner_workspace_id)) AND (base.owner_workspace_member_id IS NULL OR EXISTS (SELECT 1 FROM workspace_members_live lp1 WHERE lp1.id = base.owner_workspace_member_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW model_bindings_live AS SELECT base.* FROM model_bindings base WHERE deleted_at IS NULL AND (base.group_id IS NULL OR EXISTS (SELECT 1 FROM model_groups_live lp0 WHERE lp0.id = base.group_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW model_group_grants_live AS SELECT base.* FROM model_group_grants base WHERE status IN ('active') AND (base.group_id IS NULL OR EXISTS (SELECT 1 FROM model_groups_live lp0 WHERE lp0.id = base.group_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW platform_access_bindings_live AS SELECT base.* FROM platform_access_bindings base WHERE status IN ('active') AND (base.user_id IS NULL OR EXISTS (SELECT 1 FROM users_live lp0 WHERE lp0.id = base.user_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW plugin_connections_live AS SELECT base.* FROM plugin_connections base WHERE deleted_at IS NULL AND status IN ('active') AND (base.installation_id IS NULL OR EXISTS (SELECT 1 FROM plugin_installations_live lp0 WHERE lp0.id = base.installation_id)) AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp1 WHERE lp1.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW remote_agent_machines_live AS SELECT base.* FROM remote_agent_machines base WHERE deleted_at IS NULL AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW remote_agents_live AS SELECT base.* FROM remote_agents base WHERE true AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp0 WHERE lp0.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtime_services_live AS SELECT base.* FROM runtime_services base WHERE status IN ('starting', 'online', 'degraded') AND (base.runtime_id IS NULL OR EXISTS (SELECT 1 FROM runtimes_live lp0 WHERE lp0.id = base.runtime_id)) AND (base.remote_agent_machine_id IS NULL OR EXISTS (SELECT 1 FROM remote_agent_machines_live lp1 WHERE lp1.id = base.remote_agent_machine_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtime_exposures_live AS SELECT base.* FROM runtime_exposures base WHERE (base.runtime_id IS NULL OR EXISTS (SELECT 1 FROM runtimes_live lp0 WHERE lp0.id = base.runtime_id)) AND (base.service_id IS NULL OR EXISTS (SELECT 1 FROM runtime_services_live lp1 WHERE lp1.id = base.service_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtime_capabilities_live AS SELECT base.* FROM runtime_capabilities base WHERE true AND (base.exposure_id IS NULL OR EXISTS (SELECT 1 FROM runtime_exposures_live lp0 WHERE lp0.id = base.exposure_id)) AND (base.id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp1 WHERE lp1.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtime_authorization_grants_live AS SELECT base.* FROM runtime_authorization_grants base WHERE status IN ('active') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.runtime_id IS NULL OR EXISTS (SELECT 1 FROM runtimes_live lp1 WHERE lp1.id = base.runtime_id)) AND (base.runtime_capability_id IS NULL OR EXISTS (SELECT 1 FROM runtime_capabilities_live lp2 WHERE lp2.id = base.runtime_capability_id)) AND (base.runtime_exposure_id IS NULL OR EXISTS (SELECT 1 FROM runtime_exposures_live lp3 WHERE lp3.id = base.runtime_exposure_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW runtime_tools_live AS SELECT base.* FROM runtime_tools base WHERE status IN ('active') AND (base.exposure_id IS NULL OR EXISTS (SELECT 1 FROM runtime_exposures_live lp0 WHERE lp0.id = base.exposure_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW sandboxes_live AS SELECT base.* FROM sandboxes base WHERE true AND (base.id IS NULL OR EXISTS (SELECT 1 FROM runtimes_live lp0 WHERE lp0.id = base.id)) WITH CASCADED CHECK OPTION;
CREATE VIEW transport_accounts_live AS SELECT base.* FROM transport_accounts base WHERE deleted_at IS NULL AND status IN ('active', 'disabled', 'error') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.owner_workspace_member_id IS NULL OR EXISTS (SELECT 1 FROM workspace_members_live lp1 WHERE lp1.id = base.owner_workspace_member_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW workspace_access_bindings_live AS SELECT base.* FROM workspace_access_bindings base WHERE status IN ('active') AND (base.workspace_member_id IS NULL OR EXISTS (SELECT 1 FROM workspace_members_live lp0 WHERE lp0.id = base.workspace_member_id)) WITH CASCADED CHECK OPTION;
CREATE VIEW workspace_resource_grants_live AS SELECT base.* FROM workspace_resource_grants base WHERE status IN ('active') AND (base.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces_live lp0 WHERE lp0.id = base.workspace_id)) AND (base.workspace_resource_id IS NULL OR EXISTS (SELECT 1 FROM workspace_resources_live lp1 WHERE lp1.id = base.workspace_resource_id)) WITH CASCADED CHECK OPTION;

-- <<< SOFT-DELETE CUTOVER <<<

-- >>> SOFT-DELETE PURGE (generated by cutover-emit-purge.mjs) >>>
-- Offline purge functions (design §9). Owner = synapse_purge_fn_owner
-- (NOLOGIN); the reject-delete guard recognizes current_user. These are
-- the ONLY sanctioned hard-delete path for persistent business data.
-- Regenerate with `node scripts/cutover-emit-purge.mjs`.

-- Tier B: tenant hard-erase. NULLs nullable edges, then deletes every
-- workspace-reachable row leaf→root (incl child tables without a
-- workspace_id, scoped via their FK chain). Irreversible; ledgered.
CREATE OR REPLACE FUNCTION sd_purge_workspace(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_total bigint := 0;
  v_n bigint;
BEGIN
  -- 1. break cycles: null nullable cross-table FKs for in-scope rows
  UPDATE platform_access_bindings t0 SET assigned_by_user_id = NULL WHERE assigned_by_user_id IS NOT NULL AND (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_1 WHERE t1_1.id = t0.assigned_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_1.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_2 WHERE t1_2.id = t0.revoked_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_2.avatar_file_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE workspace_access_bindings t0 SET assigned_by_workspace_member_id = NULL WHERE assigned_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.assigned_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.revoked_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE conversations t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_assets t0 SET uploader_user_id = NULL WHERE uploader_user_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_parse_outputs t0 SET derived_asset_id = NULL WHERE derived_asset_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.derived_asset_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE publishers t0 SET logo_file_id = NULL WHERE logo_file_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE publishers t0 SET owner_user_id = NULL WHERE owner_user_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE catalog_categories t0 SET icon_file_id = NULL WHERE icon_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.icon_file_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE catalog_items t0 SET icon_file_id = NULL WHERE icon_file_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE catalog_items t0 SET mirror_source_id = NULL WHERE mirror_source_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE catalog_versions t0 SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE actor_template_version_specs t0 SET avatar_file_id = NULL WHERE avatar_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE actors t0 SET avatar_file_id = NULL WHERE avatar_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id));
  UPDATE remote_agents t0 SET avatar_file_id = NULL WHERE avatar_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id));
  UPDATE remote_agent_machines t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE remote_agent_runs t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.task_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE remote_agent_group_task_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE workspace_relationship_profiles t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE workspace_friend_requests t0 SET requested_via_profile_id = NULL WHERE requested_via_profile_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.requester_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_relationship_profiles t1_1 WHERE t1_1.id = t0.requested_via_profile_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.resolved_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_3 WHERE t1_3.id = t0.target_subject_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE workspace_friend_requests t0 SET resolved_by_workspace_member_id = NULL WHERE resolved_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.requester_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_relationship_profiles t1_1 WHERE t1_1.id = t0.requested_via_profile_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.resolved_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_3 WHERE t1_3.id = t0.target_subject_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE workspace_friend_entries t0 SET source_request_id = NULL WHERE source_request_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE workspace_member_preferences t0 SET chief_actor_id = NULL WHERE chief_actor_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE actor_versions t0 SET parent_id = NULL WHERE parent_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE actor_versions t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE actor_versions t0 SET source_workspace_member_id = NULL WHERE source_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE actor_versions t0 SET source_actor_id = NULL WHERE source_actor_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE actor_versions t0 SET source_conversation_id = NULL WHERE source_conversation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE actor_source_refs t0 SET source_catalog_item_id = NULL WHERE source_catalog_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE actor_source_refs t0 SET source_catalog_version_id = NULL WHERE source_catalog_version_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE model_groups t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.owner_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE model_bindings t0 SET installed_by_workspace_member_id = NULL WHERE installed_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.installed_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE model_group_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.subject_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE transport_accounts t0 SET inbound_actor_id = NULL WHERE inbound_actor_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE conversation_transport_bindings t0 SET inbound_actor_id = NULL WHERE inbound_actor_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE conversation_items t0 SET session_id = NULL WHERE session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE conversation_participants t0 SET actor_join_version_id = NULL WHERE actor_join_version_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.subject_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE conversation_participant_states t0 SET last_read_item_id = NULL WHERE last_read_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE workspace_member_conversation_views t0 SET last_visible_item_id = NULL WHERE last_visible_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE remote_agent_conversation_views t0 SET last_read_item_id = NULL WHERE last_read_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE remote_agent_conversation_views t0 SET last_delivery_item_id = NULL WHERE last_delivery_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE workspace_member_sync_events t0 SET item_id = NULL WHERE item_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE turns t0 SET trigger_item_id = NULL WHERE trigger_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE provider_steps t0 SET model_group_id = NULL WHERE model_group_id IS NOT NULL AND (EXISTS (SELECT 1 FROM turns t1_0 WHERE t1_0.id = t0.turn_id AND (EXISTS (SELECT 1 FROM sessions t2_0 WHERE t2_0.id = t1_0.session_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.model_group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_bindings t1_2 WHERE t1_2.id = t0.model_binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_2.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE provider_steps t0 SET model_binding_id = NULL WHERE model_binding_id IS NOT NULL AND (EXISTS (SELECT 1 FROM turns t1_0 WHERE t1_0.id = t0.turn_id AND (EXISTS (SELECT 1 FROM sessions t2_0 WHERE t2_0.id = t1_0.session_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.model_group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_bindings t1_2 WHERE t1_2.id = t0.model_binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_2.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE provider_steps t0 SET request_payload_blob_id = NULL WHERE request_payload_blob_id IS NOT NULL AND (EXISTS (SELECT 1 FROM turns t1_0 WHERE t1_0.id = t0.turn_id AND (EXISTS (SELECT 1 FROM sessions t2_0 WHERE t2_0.id = t1_0.session_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.model_group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_bindings t1_2 WHERE t1_2.id = t0.model_binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_2.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE provider_steps t0 SET response_payload_blob_id = NULL WHERE response_payload_blob_id IS NOT NULL AND (EXISTS (SELECT 1 FROM turns t1_0 WHERE t1_0.id = t0.turn_id AND (EXISTS (SELECT 1 FROM sessions t2_0 WHERE t2_0.id = t1_0.session_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.model_group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_bindings t1_2 WHERE t1_2.id = t0.model_binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_2.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE tool_calls t0 SET provider_step_id = NULL WHERE provider_step_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE tool_calls t0 SET session_id = NULL WHERE session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE tool_call_tasks t0 SET turn_id = NULL WHERE turn_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_tasks t0 SET source_tool_call_id = NULL WHERE source_tool_call_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_tasks t0 SET conversation_item_id = NULL WHERE conversation_item_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_tasks t0 SET completion_item_id = NULL WHERE completion_item_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_execution_attempts t0 SET request_payload_blob_id = NULL WHERE request_payload_blob_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_calls t1_0 WHERE t1_0.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))));
  UPDATE tool_execution_attempts t0 SET response_payload_blob_id = NULL WHERE response_payload_blob_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_calls t1_0 WHERE t1_0.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))));
  UPDATE tool_results t0 SET attempt_id = NULL WHERE attempt_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_calls t1_0 WHERE t1_0.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))));
  UPDATE session_wakeups t0 SET source_item_id = NULL WHERE source_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.source_session_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_executions t1_2 WHERE t1_2.id = t0.automation_execution_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_occurrences t1_3 WHERE t1_3.id = t0.automation_occurrence_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE session_wakeups t0 SET source_session_id = NULL WHERE source_session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.source_session_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_executions t1_2 WHERE t1_2.id = t0.automation_execution_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_occurrences t1_3 WHERE t1_3.id = t0.automation_occurrence_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE automation_rules t0 SET created_by_session_id = NULL WHERE created_by_session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE automation_webhook_endpoints t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE automation_occurrences t0 SET event_source_id = NULL WHERE event_source_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE automation_execution_targets t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE automation_execution_targets t0 SET target_participant_id = NULL WHERE target_participant_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE automation_execution_targets t0 SET session_id = NULL WHERE session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE automation_execution_targets t0 SET target_actor_id = NULL WHERE target_actor_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE automation_execution_targets t0 SET created_item_id = NULL WHERE created_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE automation_execution_targets t0 SET wakeup_id = NULL WHERE wakeup_id IS NOT NULL AND (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE memory_recall_runs t0 SET actor_id = NULL WHERE actor_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE memory_recall_runs t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE memory_recall_runs t0 SET workspace_member_id = NULL WHERE workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE memory_recall_run_results t0 SET matched_chunk_id = NULL WHERE matched_chunk_id IS NOT NULL AND (EXISTS (SELECT 1 FROM memory_recall_runs t1_0 WHERE t1_0.id = t0.run_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM memory_items t1_1 WHERE t1_1.id = t0.memory_item_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM memory_item_chunks t1_2 WHERE t1_2.id = t0.matched_chunk_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE context_compaction_runs t0 SET base_archive_point_id = NULL WHERE base_archive_point_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE context_compaction_runs t0 SET output_archive_point_id = NULL WHERE output_archive_point_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE context_compaction_run_inputs t0 SET archive_point_id = NULL WHERE archive_point_id IS NOT NULL AND (EXISTS (SELECT 1 FROM context_compaction_runs t1_0 WHERE t1_0.id = t0.run_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM context_archive_points t1_1 WHERE t1_1.id = t0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_1.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_items t1_2 WHERE t1_2.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_2.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_2.session_id AND t2_1.workspace_id = p_workspace_id))));
  UPDATE context_compaction_run_inputs t0 SET item_id = NULL WHERE item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM context_compaction_runs t1_0 WHERE t1_0.id = t0.run_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM context_archive_points t1_1 WHERE t1_1.id = t0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_1.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_items t1_2 WHERE t1_2.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_2.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_2.session_id AND t2_1.workspace_id = p_workspace_id))));
  UPDATE conversation_context_states t0 SET active_shared_archive_point_id = NULL WHERE active_shared_archive_point_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE session_context_states t0 SET active_private_archive_point_id = NULL WHERE active_private_archive_point_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE session_interrupts t0 SET from_session_id = NULL WHERE from_session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.target_session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.from_session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE runtime_events t0 SET workspace_id = NULL WHERE workspace_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET session_id = NULL WHERE session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET turn_id = NULL WHERE turn_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET provider_step_id = NULL WHERE provider_step_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET tool_call_id = NULL WHERE tool_call_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET tool_attempt_id = NULL WHERE tool_attempt_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET actor_id = NULL WHERE actor_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_events t0 SET user_id = NULL WHERE user_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE installed_skills t0 SET icon_file_id = NULL WHERE icon_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.icon_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id));
  UPDATE skill_versions t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE skill_source_refs t0 SET source_catalog_item_id = NULL WHERE source_catalog_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE skill_source_refs t0 SET source_catalog_version_id = NULL WHERE source_catalog_version_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE plugin_auth_sessions t0 SET catalog_version_id = NULL WHERE catalog_version_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE plugin_source_refs t0 SET source_catalog_item_id = NULL WHERE source_catalog_item_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE plugin_source_refs t0 SET source_catalog_version_id = NULL WHERE source_catalog_version_id IS NOT NULL AND (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE workspace_resource_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE workspace_resource_grant_requests t0 SET resolved_by_workspace_member_id = NULL WHERE resolved_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_task_transport_projections t0 SET transport_message_link_id = NULL WHERE transport_message_link_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_task_response_commands t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE runtime_authorization_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_authorization_grants t0 SET source_task_id = NULL WHERE source_task_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE devices t0 SET owner_workspace_member_id = NULL WHERE owner_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_pairing_sessions t0 SET requested_by_workspace_member_id = NULL WHERE requested_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_pairing_sessions t0 SET runtime_id = NULL WHERE runtime_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_sessions t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE runtime_sessions t0 SET actor_id = NULL WHERE actor_id IS NOT NULL AND (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE runtime_operations t0 SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_operations t0 SET task_id = NULL WHERE task_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_operations t0 SET initiated_by_workspace_member_id = NULL WHERE initiated_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_operations t0 SET initiated_by_session_id = NULL WHERE initiated_by_session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_operations t0 SET runtime_session_id = NULL WHERE runtime_session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE runtime_operation_attempts t0 SET runtime_control_plane_session_id = NULL WHERE runtime_control_plane_session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM runtime_operations t1_0 WHERE t1_0.id = t0.operation_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE memory_access_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE memory_access_grants t0 SET source_task_id = NULL WHERE source_task_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_snapshots t0 SET created_by_session_id = NULL WHERE created_by_session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_access_grants t0 SET created_by_workspace_member_id = NULL WHERE created_by_workspace_member_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_access_grants t0 SET source_task_id = NULL WHERE source_task_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_mounts t0 SET sandbox_id = NULL WHERE sandbox_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_mounts t0 SET base_snapshot_id = NULL WHERE base_snapshot_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE file_mounts t0 SET result_snapshot_id = NULL WHERE result_snapshot_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE session_wakeups t0 SET automation_execution_id = NULL WHERE automation_execution_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.source_session_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_executions t1_2 WHERE t1_2.id = t0.automation_execution_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_occurrences t1_3 WHERE t1_3.id = t0.automation_occurrence_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE session_wakeups t0 SET automation_occurrence_id = NULL WHERE automation_occurrence_id IS NOT NULL AND (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.source_session_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_executions t1_2 WHERE t1_2.id = t0.automation_execution_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_occurrences t1_3 WHERE t1_3.id = t0.automation_occurrence_id AND t1_3.workspace_id = p_workspace_id));
  UPDATE runtime_authorization_grants t0 SET governing_resource_grant_id = NULL WHERE governing_resource_grant_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE platform_access_bindings t0 SET revoked_by_user_id = NULL WHERE revoked_by_user_id IS NOT NULL AND (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_1 WHERE t1_1.id = t0.assigned_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_1.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_2 WHERE t1_2.id = t0.revoked_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_2.avatar_file_id AND t2_0.workspace_id = p_workspace_id))));
  UPDATE workspace_access_bindings t0 SET revoked_by_workspace_member_id = NULL WHERE revoked_by_workspace_member_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.assigned_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.revoked_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE users t0 SET avatar_file_id = NULL WHERE avatar_file_id IS NOT NULL AND (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE catalog_items t0 SET latest_version_id = NULL WHERE latest_version_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE model_bindings t0 SET current_version_id = NULL WHERE current_version_id IS NOT NULL AND (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.installed_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE conversation_items t0 SET author_participant_id = NULL WHERE author_participant_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE conversation_items t0 SET turn_id = NULL WHERE turn_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE sessions t0 SET active_plan_approval_task_id = NULL WHERE active_plan_approval_task_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE remote_agent_conversation_contexts t0 SET active_task_id = NULL WHERE active_task_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.active_task_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_2 WHERE t1_2.id = t0.active_plan_approval_task_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE remote_agent_conversation_contexts t0 SET active_plan_approval_task_id = NULL WHERE active_plan_approval_task_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.active_task_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_2 WHERE t1_2.id = t0.active_plan_approval_task_id AND t1_2.workspace_id = p_workspace_id));
  UPDATE remote_agent_runs t0 SET task_id = NULL WHERE task_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.task_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE runtime_tools t0 SET latest_revision_id = NULL WHERE latest_revision_id IS NOT NULL AND (EXISTS (SELECT 1 FROM runtime_exposures t1_0 WHERE t1_0.id = t0.exposure_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE runtime_services t0 SET current_session_id = NULL WHERE current_session_id IS NOT NULL AND (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM remote_agent_machines t1_1 WHERE t1_1.id = t0.remote_agent_machine_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE tool_call_task_runtime_tool t0 SET runtime_operation_id = NULL WHERE runtime_operation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtimes t1_1 WHERE t1_1.id = t0.runtime_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_capabilities t1_2 WHERE t1_2.id = t0.runtime_capability_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_exposures t1_3 WHERE t1_3.id = t0.runtime_exposure_id AND t1_3.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_operations t1_4 WHERE t1_4.id = t0.runtime_operation_id AND t1_4.workspace_id = p_workspace_id));
  UPDATE sandboxes t0 SET session_id = NULL WHERE session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE sandboxes t0 SET pairing_session_id = NULL WHERE pairing_session_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_call_task_external_mcp t0 SET plugin_installation_id = NULL WHERE plugin_installation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id));
  UPDATE file_spaces t0 SET current_snapshot_id = NULL WHERE current_snapshot_id IS NOT NULL AND t0.workspace_id = p_workspace_id;
  UPDATE tool_calls t0 SET plugin_installation_id = NULL WHERE plugin_installation_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));
  UPDATE tool_calls t0 SET runtime_tool_id = NULL WHERE runtime_tool_id IS NOT NULL AND (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id));

  -- 2. delete every workspace-reachable row leaf→root
  DELETE FROM account t0 WHERE (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_model_group_assignments t0 WHERE (EXISTS (SELECT 1 FROM actors t1_0 WHERE t1_0.id = t0.actor_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t2_1 WHERE t2_1.id = t1_0.id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_source_refs t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_template_version_specs t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_version_docs t0 WHERE (EXISTS (SELECT 1 FROM actor_versions t1_0 WHERE t1_0.id = t0.actor_version_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_0.created_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_0.source_workspace_member_id AND t2_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_2 WHERE t2_2.id = t1_0.source_conversation_id AND t2_2.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_deliveries t0 WHERE (EXISTS (SELECT 1 FROM automation_rules t1_0 WHERE t1_0.id = t0.rule_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_delivery_targets t0 WHERE (EXISTS (SELECT 1 FROM automation_rules t1_0 WHERE t1_0.id = t0.rule_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_execution_targets t0 WHERE (EXISTS (SELECT 1 FROM automation_executions t1_0 WHERE t1_0.id = t0.execution_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_2 WHERE t1_2.id = t0.session_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_policies t0 WHERE (EXISTS (SELECT 1 FROM automation_rules t1_0 WHERE t1_0.id = t0.rule_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_triggers t0 WHERE (EXISTS (SELECT 1 FROM automation_rules t1_0 WHERE t1_0.id = t0.rule_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_event_sources t1_1 WHERE t1_1.id = t0.event_source_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_item_categories t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.catalog_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_version_files t0 WHERE (EXISTS (SELECT 1 FROM catalog_versions t1_0 WHERE t1_0.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items t2_0 WHERE t2_0.id = t1_0.catalog_item_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_conversation_create_requests t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_push_tokens t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_frame_parts t0 WHERE (EXISTS (SELECT 1 FROM context_archive_frames t1_0 WHERE t1_0.id = t0.archive_frame_id AND (EXISTS (SELECT 1 FROM context_archive_points t2_0 WHERE t2_0.id = t1_0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations t3_0 WHERE t3_0.id = t2_0.conversation_id AND t3_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t3_1 WHERE t3_1.id = t2_0.session_id AND t3_1.workspace_id = p_workspace_id)))))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_compaction_run_inputs t0 WHERE (EXISTS (SELECT 1 FROM context_compaction_runs t1_0 WHERE t1_0.id = t0.run_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM context_archive_points t1_1 WHERE t1_1.id = t0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_1.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_items t1_2 WHERE t1_2.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_2.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_2.session_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_context_states t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_device_states t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM chat_client_instances t1_1 WHERE t1_1.id = t0.client_instance_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_context_targets t0 WHERE (EXISTS (SELECT 1 FROM conversation_items t1_0 WHERE t1_0.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_participants t1_1 WHERE t1_1.id = t0.target_participant_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t2_1 WHERE t2_1.id = t1_1.subject_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_mentions t0 WHERE (EXISTS (SELECT 1 FROM conversation_items t1_0 WHERE t1_0.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_participants t1_1 WHERE t1_1.id = t0.mentioned_participant_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t2_1 WHERE t2_1.id = t1_1.subject_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_parts t0 WHERE (EXISTS (SELECT 1 FROM conversation_items t1_0 WHERE t1_0.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_targets t0 WHERE (EXISTS (SELECT 1 FROM conversation_items t1_0 WHERE t1_0.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM conversation_participants t1_1 WHERE t1_1.id = t0.target_participant_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_1.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t2_1 WHERE t2_1.id = t1_1.subject_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participant_addresses t0 WHERE (EXISTS (SELECT 1 FROM transport_addresses t1_0 WHERE t1_0.id = t0.transport_address_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participant_states t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_transport_bindings t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM device_code t0 WHERE (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM devices t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM direct_conversation_bindings t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.participant_one_subject_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_2 WHERE t1_2.id = t0.participant_two_subject_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_access_grants t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_mounts t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_parse_outputs t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.derived_asset_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_snapshots t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_access_grants t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_item_chunks t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_item_parts t0 WHERE (EXISTS (SELECT 1 FROM memory_items t1_0 WHERE t1_0.id = t0.memory_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_recall_run_results t0 WHERE (EXISTS (SELECT 1 FROM memory_recall_runs t1_0 WHERE t1_0.id = t0.run_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM memory_items t1_1 WHERE t1_1.id = t0.memory_item_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM memory_item_chunks t1_2 WHERE t1_2.id = t0.matched_chunk_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_group_grants t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.subject_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM platform_access_bindings t0 WHERE (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_1 WHERE t1_1.id = t0.assigned_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_1.avatar_file_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM users t1_2 WHERE t1_2.id = t0.revoked_by_user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_2.avatar_file_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_auth_sessions t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_connections t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_package_version_specs t0 WHERE (EXISTS (SELECT 1 FROM catalog_versions t1_0 WHERE t1_0.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items t2_0 WHERE t2_0.id = t1_0.catalog_item_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_source_refs t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_version_runtime_permissions t0 WHERE (EXISTS (SELECT 1 FROM catalog_versions t1_0 WHERE t1_0.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items t2_0 WHERE t2_0.id = t1_0.catalog_item_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM provider_steps t0 WHERE (EXISTS (SELECT 1 FROM turns t1_0 WHERE t1_0.id = t0.turn_id AND (EXISTS (SELECT 1 FROM sessions t2_0 WHERE t2_0.id = t1_0.session_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_groups t1_1 WHERE t1_1.id = t0.model_group_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_1.owner_workspace_member_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t2_1 WHERE t2_1.id = t1_1.created_by_workspace_member_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM model_bindings t1_2 WHERE t1_2.id = t0.model_binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_2.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM realtime_event_outbox t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_bindings t0 WHERE (EXISTS (SELECT 1 FROM remote_agent_machines t1_0 WHERE t1_0.id = t0.machine_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_conversation_contexts t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.active_task_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_2 WHERE t1_2.id = t0.active_plan_approval_task_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_conversation_views t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_group_task_grants t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_machine_sessions t0 WHERE (EXISTS (SELECT 1 FROM remote_agent_machines t1_0 WHERE t1_0.id = t0.machine_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_message_deliveries t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_runtime_catalog t0 WHERE (EXISTS (SELECT 1 FROM remote_agent_machines t1_0 WHERE t1_0.id = t0.machine_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_authorization_grants t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_control_plane_sessions t0 WHERE (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_events t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operation_attempts t0 WHERE (EXISTS (SELECT 1 FROM runtime_operations t1_0 WHERE t1_0.id = t0.operation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operation_results t0 WHERE (EXISTS (SELECT 1 FROM runtime_operations t1_0 WHERE t1_0.id = t0.operation_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_pairing_sessions t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_service_keys t0 WHERE (EXISTS (SELECT 1 FROM runtime_services t1_0 WHERE t1_0.id = t0.service_id AND (EXISTS (SELECT 1 FROM runtimes t2_0 WHERE t2_0.id = t1_0.runtime_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM remote_agent_machines t2_1 WHERE t2_1.id = t1_0.remote_agent_machine_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_session_services t0 WHERE (EXISTS (SELECT 1 FROM runtime_sessions t1_0 WHERE t1_0.id = t0.session_id AND (EXISTS (SELECT 1 FROM runtimes t2_0 WHERE t2_0.id = t1_0.runtime_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t2_1 WHERE t2_1.id = t1_0.conversation_id AND t2_1.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM runtime_services t1_1 WHERE t1_1.id = t0.service_id AND (EXISTS (SELECT 1 FROM runtimes t2_0 WHERE t2_0.id = t1_1.runtime_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM remote_agent_machines t2_1 WHERE t2_1.id = t1_1.remote_agent_machine_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM sandboxes t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session t0 WHERE (EXISTS (SELECT 1 FROM users t1_0 WHERE t1_0.id = t0.user_id AND (EXISTS (SELECT 1 FROM file_assets t2_0 WHERE t2_0.id = t1_0.avatar_file_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_context_states t0 WHERE (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_interrupts t0 WHERE (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.target_session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.from_session_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_wakeups t0 WHERE (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.source_session_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_executions t1_2 WHERE t1_2.id = t0.automation_execution_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM automation_occurrences t1_3 WHERE t1_3.id = t0.automation_occurrence_id AND t1_3.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_package_version_specs t0 WHERE (EXISTS (SELECT 1 FROM catalog_versions t1_0 WHERE t1_0.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items t2_0 WHERE t2_0.id = t1_0.catalog_item_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_source_refs t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.source_catalog_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_versions t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_action_tokens t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_external_mcp t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_output_chunks t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_response_commands t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_runtime_authorization t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.principal_subject_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_2 WHERE t1_2.id = t0.principal_scope_subject_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtimes t1_3 WHERE t1_3.id = t0.runtime_id AND t1_3.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_capabilities t1_4 WHERE t1_4.id = t0.runtime_capability_id AND t1_4.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_exposures t1_5 WHERE t1_5.id = t0.runtime_exposure_id AND t1_5.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_runtime_tool t0 WHERE (EXISTS (SELECT 1 FROM tool_call_tasks t1_0 WHERE t1_0.id = t0.task_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtimes t1_1 WHERE t1_1.id = t0.runtime_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_capabilities t1_2 WHERE t1_2.id = t0.runtime_capability_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_exposures t1_3 WHERE t1_3.id = t0.runtime_exposure_id AND t1_3.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM runtime_operations t1_4 WHERE t1_4.id = t0.runtime_operation_id AND t1_4.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_transport_projections t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_execution_attempts t0 WHERE (EXISTS (SELECT 1 FROM tool_calls t1_0 WHERE t1_0.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_result_parts t0 WHERE (EXISTS (SELECT 1 FROM tool_results t1_0 WHERE t1_0.id = t0.tool_result_id AND (EXISTS (SELECT 1 FROM tool_calls t2_0 WHERE t2_0.id = t1_0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t3_0 WHERE t3_0.id = t2_0.conversation_id AND t3_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t3_1 WHERE t3_1.id = t2_0.session_id AND t3_1.workspace_id = p_workspace_id)))))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM transport_message_links t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_access_bindings t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.assigned_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.revoked_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_capability_conversation_type_policies t0 WHERE (EXISTS (SELECT 1 FROM access_subjects t1_0 WHERE t1_0.id = t0.subject_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_friend_entries t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_friend_requests t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.requester_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_relationship_profiles t1_1 WHERE t1_1.id = t0.requested_via_profile_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_2 WHERE t1_2.id = t0.resolved_by_workspace_member_id AND t1_2.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_3 WHERE t1_3.id = t0.target_subject_id AND t1_3.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_invites t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_conversation_views t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_preferences t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.workspace_member_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_sync_events t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_relationship_profiles t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resource_grant_requests t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resource_grants t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_versions t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.created_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.source_workspace_member_id AND t1_1.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_2 WHERE t1_2.id = t0.source_conversation_id AND t1_2.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_event_sources t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_executions t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_categories t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.icon_file_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_client_instances t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_frames t0 WHERE (EXISTS (SELECT 1 FROM context_archive_points t1_0 WHERE t1_0.id = t0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_compaction_runs t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_items t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_parse_runs t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.asset_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_spaces t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM installed_skills t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.icon_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_items t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_recall_runs t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_binding_versions t0 WHERE (EXISTS (SELECT 1 FROM model_bindings t1_0 WHERE t1_0.id = t0.binding_id AND (EXISTS (SELECT 1 FROM workspace_members t2_0 WHERE t2_0.id = t1_0.installed_by_workspace_member_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operations t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_sessions t0 WHERE (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_tasks t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_results t0 WHERE (EXISTS (SELECT 1 FROM tool_calls t1_0 WHERE t1_0.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations t2_0 WHERE t2_0.id = t1_0.conversation_id AND t2_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t2_1 WHERE t2_1.id = t1_0.session_id AND t2_1.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM transport_endpoints t0 WHERE (EXISTS (SELECT 1 FROM transport_accounts t1_0 WHERE t1_0.id = t0.transport_account_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_integration_bindings t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_occurrences t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_rules t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_points t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_assets t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_spaces t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_bindings t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.installed_by_workspace_member_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_runs t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM tool_call_tasks t1_1 WHERE t1_1.id = t0.task_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_capabilities t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_tool_revisions t0 WHERE (EXISTS (SELECT 1 FROM runtime_tools t1_0 WHERE t1_0.id = t0.tool_id AND (EXISTS (SELECT 1 FROM runtime_exposures t2_0 WHERE t2_0.id = t1_0.exposure_id AND t2_0.workspace_id = p_workspace_id))) OR EXISTS (SELECT 1 FROM runtime_catalog_revisions t1_1 WHERE t1_1.id = t0.catalog_revision_id AND (EXISTS (SELECT 1 FROM runtime_exposures t2_0 WHERE t2_0.id = t1_1.exposure_id AND t2_0.workspace_id = p_workspace_id)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_calls t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM sessions t1_1 WHERE t1_1.id = t0.session_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM transport_accounts t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_webhook_endpoints t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participants t0 WHERE (EXISTS (SELECT 1 FROM conversations t1_0 WHERE t1_0.id = t0.conversation_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM access_subjects t1_1 WHERE t1_1.id = t0.subject_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_groups t0 WHERE (EXISTS (SELECT 1 FROM workspace_members t1_0 WHERE t1_0.id = t0.owner_workspace_member_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_members t1_1 WHERE t1_1.id = t0.created_by_workspace_member_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_installations t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.catalog_item_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_catalog_revisions t0 WHERE (EXISTS (SELECT 1 FROM runtime_exposures t1_0 WHERE t1_0.id = t0.exposure_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_tools t0 WHERE (EXISTS (SELECT 1 FROM runtime_exposures t1_0 WHERE t1_0.id = t0.exposure_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM turns t0 WHERE (EXISTS (SELECT 1 FROM sessions t1_0 WHERE t1_0.id = t0.session_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM conversations t1_1 WHERE t1_1.id = t0.conversation_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM access_subjects t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_versions t0 WHERE (EXISTS (SELECT 1 FROM catalog_items t1_0 WHERE t1_0.id = t0.catalog_item_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_exposures t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM sessions t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actors t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_items t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversations t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agents t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM workspace_resources t1_1 WHERE t1_1.id = t0.id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_services t0 WHERE (EXISTS (SELECT 1 FROM runtimes t1_0 WHERE t1_0.id = t0.runtime_id AND t1_0.workspace_id = p_workspace_id) OR EXISTS (SELECT 1 FROM remote_agent_machines t1_1 WHERE t1_1.id = t0.remote_agent_machine_id AND t1_1.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_members t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM publishers t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_machines t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtimes t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resources t0 WHERE t0.workspace_id = p_workspace_id; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM users t0 WHERE (EXISTS (SELECT 1 FROM file_assets t1_0 WHERE t1_0.id = t0.avatar_file_id AND t1_0.workspace_id = p_workspace_id)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- 3. finally the workspace row itself
  DELETE FROM workspaces WHERE id = p_workspace_id;
END;
$$;
ALTER FUNCTION sd_purge_workspace(uuid) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_purge_workspace(uuid) FROM PUBLIC;

-- Tier A: retention purge. For each expired soft-deleted root, deletes its
-- child rows (leaf→root) then the root row. Skips never-purge registries +
-- registries (access_subjects/transport_addresses) and roots pinned by
-- them via RESTRICT (those are erased only by a tier-B tenant erase).
CREATE OR REPLACE FUNCTION sd_purge_expired_soft_deleted(p_before timestamptz)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_total bigint := 0;
  v_n bigint;
BEGIN
  -- 1. child rows whose owning soft-delete root is an expired tombstone (leaf→root)
  DELETE FROM actor_model_group_assignments t0 WHERE EXISTS (SELECT 1 FROM model_groups r1 WHERE r1.id = t0.group_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_source_refs t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.source_catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_template_version_specs t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.avatar_file_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_version_docs t0 WHERE EXISTS (SELECT 1 FROM actor_versions r1 WHERE r1.id = t0.actor_version_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.source_conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_deliveries t0 WHERE EXISTS (SELECT 1 FROM automation_rules r1 WHERE r1.id = t0.rule_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_delivery_targets t0 WHERE EXISTS (SELECT 1 FROM automation_rules r1 WHERE r1.id = t0.rule_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_execution_targets t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_policies t0 WHERE EXISTS (SELECT 1 FROM automation_rules r1 WHERE r1.id = t0.rule_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_triggers t0 WHERE EXISTS (SELECT 1 FROM automation_rules r1 WHERE r1.id = t0.rule_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_item_categories t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_version_files t0 WHERE EXISTS (SELECT 1 FROM catalog_versions r1 WHERE r1.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items r2 WHERE r2.id = r1.catalog_item_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_conversation_create_requests t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_push_tokens t0 WHERE EXISTS (SELECT 1 FROM workspace_members r1 WHERE r1.id = t0.workspace_member_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_frame_parts t0 WHERE EXISTS (SELECT 1 FROM context_archive_frames r1 WHERE r1.id = t0.archive_frame_id AND (EXISTS (SELECT 1 FROM context_archive_points r2 WHERE r2.id = r1.archive_point_id AND (EXISTS (SELECT 1 FROM conversations r3 WHERE r3.id = r2.conversation_id AND (r3.deleted_at IS NOT NULL AND r3.deleted_at < p_before)))))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_compaction_run_inputs t0 WHERE EXISTS (SELECT 1 FROM context_compaction_runs r1 WHERE r1.id = t0.run_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_context_states t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_device_states t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_context_targets t0 WHERE EXISTS (SELECT 1 FROM conversation_items r1 WHERE r1.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_mentions t0 WHERE EXISTS (SELECT 1 FROM conversation_items r1 WHERE r1.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_parts t0 WHERE EXISTS (SELECT 1 FROM conversation_items r1 WHERE r1.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_item_targets t0 WHERE EXISTS (SELECT 1 FROM conversation_items r1 WHERE r1.id = t0.item_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participant_addresses t0 WHERE EXISTS (SELECT 1 FROM conversation_participants r1 WHERE r1.id = t0.conversation_participant_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participant_states t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_transport_bindings t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM device_code t0 WHERE EXISTS (SELECT 1 FROM users r1 WHERE r1.id = t0.user_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM devices t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM direct_conversation_bindings t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_access_grants t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_mounts t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_parse_outputs t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.derived_asset_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_snapshots t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_access_grants t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_item_chunks t0 WHERE EXISTS (SELECT 1 FROM memory_items r1 WHERE r1.id = t0.memory_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_item_parts t0 WHERE EXISTS (SELECT 1 FROM memory_items r1 WHERE r1.id = t0.memory_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_recall_run_results t0 WHERE EXISTS (SELECT 1 FROM memory_items r1 WHERE r1.id = t0.memory_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_group_grants t0 WHERE EXISTS (SELECT 1 FROM model_groups r1 WHERE r1.id = t0.group_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM platform_access_bindings t0 WHERE EXISTS (SELECT 1 FROM users r1 WHERE r1.id = t0.user_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_auth_sessions t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_package_version_specs t0 WHERE EXISTS (SELECT 1 FROM catalog_versions r1 WHERE r1.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items r2 WHERE r2.id = r1.catalog_item_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_source_refs t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.source_catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_version_runtime_permissions t0 WHERE EXISTS (SELECT 1 FROM catalog_versions r1 WHERE r1.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items r2 WHERE r2.id = r1.catalog_item_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM realtime_event_outbox t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_bindings t0 WHERE EXISTS (SELECT 1 FROM remote_agent_machines r1 WHERE r1.id = t0.machine_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_conversation_contexts t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_conversation_views t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_group_task_grants t0 WHERE EXISTS (SELECT 1 FROM remote_agents r1 WHERE r1.id = t0.remote_agent_id AND (EXISTS (SELECT 1 FROM file_assets r2 WHERE r2.id = r1.avatar_file_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_machine_sessions t0 WHERE EXISTS (SELECT 1 FROM remote_agent_machines r1 WHERE r1.id = t0.machine_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_message_deliveries t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_runtime_catalog t0 WHERE EXISTS (SELECT 1 FROM remote_agent_machines r1 WHERE r1.id = t0.machine_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_authorization_grants t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_control_plane_sessions t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_events t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operation_attempts t0 WHERE EXISTS (SELECT 1 FROM runtime_operations r1 WHERE r1.id = t0.operation_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operation_results t0 WHERE EXISTS (SELECT 1 FROM runtime_operations r1 WHERE r1.id = t0.operation_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_pairing_sessions t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_service_keys t0 WHERE EXISTS (SELECT 1 FROM runtime_services r1 WHERE r1.id = t0.service_id AND (EXISTS (SELECT 1 FROM runtimes r2 WHERE r2.id = r1.runtime_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_session_services t0 WHERE EXISTS (SELECT 1 FROM runtime_sessions r1 WHERE r1.id = t0.session_id AND (EXISTS (SELECT 1 FROM runtimes r2 WHERE r2.id = r1.runtime_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM sandboxes t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session t0 WHERE EXISTS (SELECT 1 FROM users r1 WHERE r1.id = t0.user_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_context_states t0 WHERE EXISTS (SELECT 1 FROM sessions r1 WHERE r1.id = t0.session_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_interrupts t0 WHERE EXISTS (SELECT 1 FROM sessions r1 WHERE r1.id = t0.target_session_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM session_wakeups t0 WHERE EXISTS (SELECT 1 FROM sessions r1 WHERE r1.id = t0.session_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_package_version_specs t0 WHERE EXISTS (SELECT 1 FROM catalog_versions r1 WHERE r1.id = t0.catalog_version_id AND (EXISTS (SELECT 1 FROM catalog_items r2 WHERE r2.id = r1.catalog_item_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_source_refs t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.source_catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM skill_versions t0 WHERE EXISTS (SELECT 1 FROM installed_skills r1 WHERE r1.id = t0.skill_id AND (EXISTS (SELECT 1 FROM file_assets r2 WHERE r2.id = r1.icon_file_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_action_tokens t0 WHERE EXISTS (SELECT 1 FROM tool_call_tasks r1 WHERE r1.id = t0.task_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_external_mcp t0 WHERE EXISTS (SELECT 1 FROM tool_call_tasks r1 WHERE r1.id = t0.task_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_output_chunks t0 WHERE EXISTS (SELECT 1 FROM tool_call_tasks r1 WHERE r1.id = t0.task_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_response_commands t0 WHERE EXISTS (SELECT 1 FROM tool_call_tasks r1 WHERE r1.id = t0.task_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_runtime_authorization t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_runtime_tool t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_task_transport_projections t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_execution_attempts t0 WHERE EXISTS (SELECT 1 FROM tool_calls r1 WHERE r1.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_result_parts t0 WHERE EXISTS (SELECT 1 FROM tool_results r1 WHERE r1.id = t0.tool_result_id AND (EXISTS (SELECT 1 FROM tool_calls r2 WHERE r2.id = r1.tool_call_id AND (EXISTS (SELECT 1 FROM conversations r3 WHERE r3.id = r2.conversation_id AND (r3.deleted_at IS NOT NULL AND r3.deleted_at < p_before)))))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM transport_message_links t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_access_bindings t0 WHERE EXISTS (SELECT 1 FROM workspace_members r1 WHERE r1.id = t0.workspace_member_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_capability_conversation_type_policies t0 WHERE EXISTS (SELECT 1 FROM access_subjects r1 WHERE r1.id = t0.subject_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_friend_entries t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_friend_requests t0 WHERE EXISTS (SELECT 1 FROM workspace_members r1 WHERE r1.id = t0.requester_workspace_member_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_invites t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_conversation_views t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_preferences t0 WHERE EXISTS (SELECT 1 FROM workspace_members r1 WHERE r1.id = t0.workspace_member_id AND (EXISTS (SELECT 1 FROM workspaces r2 WHERE r2.id = r1.workspace_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_member_sync_events t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_relationship_profiles t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resource_grant_requests t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resource_grants t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actor_versions t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.source_conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_event_sources t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_executions t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_categories t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.icon_file_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM chat_client_instances t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_frames t0 WHERE EXISTS (SELECT 1 FROM context_archive_points r1 WHERE r1.id = t0.archive_point_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_compaction_runs t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_items t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_parse_runs t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.asset_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM installed_skills t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.icon_file_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_recall_runs t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_operations t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_sessions t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_call_tasks t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_results t0 WHERE EXISTS (SELECT 1 FROM tool_calls r1 WHERE r1.id = t0.tool_call_id AND (EXISTS (SELECT 1 FROM conversations r2 WHERE r2.id = r1.conversation_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM transport_endpoints t0 WHERE EXISTS (SELECT 1 FROM transport_accounts r1 WHERE r1.id = t0.transport_account_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_occurrences t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM context_archive_points t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_runs t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_capabilities t0 WHERE EXISTS (SELECT 1 FROM workspace_resources r1 WHERE r1.id = t0.id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_tool_revisions t0 WHERE EXISTS (SELECT 1 FROM runtime_tools r1 WHERE r1.id = t0.tool_id AND (EXISTS (SELECT 1 FROM runtime_exposures r2 WHERE r2.id = r1.exposure_id AND (EXISTS (SELECT 1 FROM runtimes r3 WHERE r3.id = r2.runtime_id AND (r3.deleted_at IS NOT NULL AND r3.deleted_at < p_before)))))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM tool_calls t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM conversation_participants t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_installations t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_catalog_revisions t0 WHERE EXISTS (SELECT 1 FROM runtime_exposures r1 WHERE r1.id = t0.exposure_id AND (EXISTS (SELECT 1 FROM runtimes r2 WHERE r2.id = r1.runtime_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_tools t0 WHERE EXISTS (SELECT 1 FROM runtime_exposures r1 WHERE r1.id = t0.exposure_id AND (EXISTS (SELECT 1 FROM runtimes r2 WHERE r2.id = r1.runtime_id AND (r2.deleted_at IS NOT NULL AND r2.deleted_at < p_before)))); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM turns t0 WHERE EXISTS (SELECT 1 FROM conversations r1 WHERE r1.id = t0.conversation_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_versions t0 WHERE EXISTS (SELECT 1 FROM catalog_items r1 WHERE r1.id = t0.catalog_item_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_exposures t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM sessions t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM actors t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.avatar_file_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agents t0 WHERE EXISTS (SELECT 1 FROM file_assets r1 WHERE r1.id = t0.avatar_file_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtime_services t0 WHERE EXISTS (SELECT 1 FROM runtimes r1 WHERE r1.id = t0.runtime_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_members t0 WHERE EXISTS (SELECT 1 FROM workspaces r1 WHERE r1.id = t0.workspace_id AND (r1.deleted_at IS NOT NULL AND r1.deleted_at < p_before)); GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- 2. the expired soft-delete root rows themselves (leaf→root)
  DELETE FROM account WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM plugin_connections WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_spaces WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_items WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_integration_bindings WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_rules WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM file_assets WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM memory_spaces WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM automation_webhook_endpoints WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM model_groups WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM catalog_items WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM publishers WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM remote_agent_machines WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM runtimes WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM workspace_resources WHERE deleted_at IS NOT NULL AND deleted_at < p_before; GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  RETURN v_total;
END;
$$;
ALTER FUNCTION sd_purge_expired_soft_deleted(timestamptz) OWNER TO synapse_purge_fn_owner;
REVOKE EXECUTE ON FUNCTION sd_purge_expired_soft_deleted(timestamptz) FROM PUBLIC;

GRANT SELECT, UPDATE, DELETE ON access_subjects, account, actor_model_group_assignments, actor_source_refs, actor_template_version_specs, actor_version_docs, actor_versions, actors, automation_deliveries, automation_delivery_targets, automation_event_sources, automation_execution_targets, automation_executions, automation_integration_bindings, automation_occurrences, automation_policies, automation_rules, automation_triggers, automation_webhook_endpoints, catalog_categories, catalog_item_categories, catalog_items, catalog_version_files, catalog_versions, chat_client_instances, chat_conversation_create_requests, chat_push_tokens, context_archive_frame_parts, context_archive_frames, context_archive_points, context_compaction_run_inputs, context_compaction_runs, conversation_context_states, conversation_device_states, conversation_item_context_targets, conversation_item_mentions, conversation_item_parts, conversation_item_targets, conversation_items, conversation_participant_addresses, conversation_participant_states, conversation_participants, conversation_transport_bindings, conversations, device_code, devices, direct_conversation_bindings, file_access_grants, file_assets, file_mounts, file_parse_outputs, file_parse_runs, file_snapshots, file_spaces, installed_skills, memory_access_grants, memory_item_chunks, memory_item_parts, memory_items, memory_recall_run_results, memory_recall_runs, memory_spaces, model_binding_versions, model_bindings, model_group_grants, model_groups, platform_access_bindings, plugin_auth_sessions, plugin_connections, plugin_installations, plugin_package_version_specs, plugin_source_refs, plugin_version_runtime_permissions, provider_steps, publishers, realtime_event_outbox, remote_agent_bindings, remote_agent_conversation_contexts, remote_agent_conversation_views, remote_agent_group_task_grants, remote_agent_machine_sessions, remote_agent_machines, remote_agent_message_deliveries, remote_agent_runs, remote_agent_runtime_catalog, remote_agents, runtime_authorization_grants, runtime_capabilities, runtime_catalog_revisions, runtime_control_plane_sessions, runtime_events, runtime_exposures, runtime_operation_attempts, runtime_operation_results, runtime_operations, runtime_pairing_sessions, runtime_service_keys, runtime_services, runtime_session_services, runtime_sessions, runtime_tool_revisions, runtime_tools, runtimes, sandboxes, session, session_context_states, session_interrupts, session_wakeups, sessions, skill_package_version_specs, skill_source_refs, skill_versions, tool_call_task_action_tokens, tool_call_task_external_mcp, tool_call_task_output_chunks, tool_call_task_response_commands, tool_call_task_runtime_authorization, tool_call_task_runtime_tool, tool_call_task_transport_projections, tool_call_tasks, tool_calls, tool_execution_attempts, tool_result_parts, tool_results, transport_accounts, transport_endpoints, transport_message_links, turns, users, workspace_access_bindings, workspace_capability_conversation_type_policies, workspace_friend_entries, workspace_friend_requests, workspace_invites, workspace_member_conversation_views, workspace_member_preferences, workspace_member_sync_events, workspace_members, workspace_relationship_profiles, workspace_resource_grant_requests, workspace_resource_grants, workspace_resources, workspaces TO synapse_purge_fn_owner;
GRANT SELECT ON access_subjects, transport_addresses TO synapse_purge_fn_owner;

-- <<< SOFT-DELETE PURGE <<<
