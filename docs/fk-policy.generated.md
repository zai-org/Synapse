# FK Policy — generated from soft-delete-table-classification.yml

> **GENERATED FILE — do not edit by hand.** Run `node scripts/derive-fk-policy.mjs`.
> Source of truth: `packages/api/src/infrastructure/database/soft-delete-table-classification.yml`.

## Table classification (counts)

| class | count |
|---|---|
| root | 20 |
| junction | 8 |
| child | 33 |
| append-only | 37 |
| ephemeral | 40 |
| reference | 13 |
| **total** | **151** |

## Soft-delete roots (deleted_at) — 20

`account`, `automation_integration_bindings`, `automation_rules`, `automation_webhook_endpoints`, `catalog_items`, `conversations`, `file_assets`, `file_spaces`, `memory_items`, `memory_spaces`, `model_bindings`, `model_groups`, `plugin_connections`, `publishers`, `remote_agent_machines`, `runtimes`, `transport_accounts`, `users`, `workspace_resources`, `workspaces`

## Status-flip tables — 8

- `file_access_grants` live=["active"]
- `memory_access_grants` live=["active"]
- `model_group_grants` live=["active"]
- `platform_access_bindings` live=["active"]
- `runtime_authorization_grants` live=["active"]
- `workspace_access_bindings` live=["active"]
- `workspace_members` live=["active"]
- `workspace_resource_grants` live=["active"]

## FK target ON DELETE distribution

| target action | count |
|---|---|
| RESTRICT | 297 |
| NO ACTION | 0 |
| SET NULL | 151 |
| CASCADE | 0 |
| **total** | **448** |

## FK live integrity distribution

| live integrity | count |
|---|---|
| enforce | 130 |
| historical | 71 |
| none | 19 |
| — | 228 |
| **total** | **448** |

## SET NULL whitelist — 151

| child | column(s) | -> parent | canLose | needsSnapshot | snapshotColumn |
|---|---|---|---|---|---|
| actor_source_refs | source_catalog_item_id | catalog_items | true | false | — |
| actor_source_refs | source_catalog_version_id | catalog_versions | true | false | — |
| actor_template_version_specs | avatar_file_id | file_assets | true | false | — |
| actor_versions | previous_version_id | actor_versions | true | false | — |
| actor_versions | parent_id | actors | true | false | — |
| actor_versions | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| actor_versions | source_workspace_member_id | workspace_members | true | false | — |
| actor_versions | source_actor_id | actors | false | true | source_actor_id_snapshot |
| actor_versions | source_conversation_id | conversations | true | false | — |
| actors | avatar_file_id | file_assets | true | false | — |
| actors | parent_id | actors | true | false | — |
| automation_execution_targets | conversation_id | conversations | true | false | — |
| automation_execution_targets | target_participant_id | conversation_participants | true | false | — |
| automation_execution_targets | session_id | sessions | true | false | — |
| automation_execution_targets | target_actor_id | actors | true | false | — |
| automation_execution_targets | created_item_id | conversation_items | true | false | — |
| automation_execution_targets | wakeup_id | session_wakeups | true | false | — |
| automation_occurrences | event_source_id | automation_event_sources | true | false | — |
| automation_rules | created_by_session_id | sessions | false | true | created_by_session_id_snapshot |
| automation_webhook_endpoints | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| catalog_categories | icon_file_id | file_assets | true | false | — |
| catalog_items | icon_file_id | file_assets | true | false | — |
| catalog_items | mirror_source_id | skill_mirror_sources | true | false | — |
| catalog_items | latest_version_id | catalog_versions | true | false | — |
| catalog_versions | created_by_user_id | users | false | true | created_by_user_id_snapshot |
| context_archive_points | parent_archive_point_id | context_archive_points | true | false | — |
| context_compaction_run_inputs | archive_point_id | context_archive_points | true | false | — |
| context_compaction_run_inputs | item_id | conversation_items | true | false | — |
| context_compaction_runs | base_archive_point_id | context_archive_points | true | false | — |
| context_compaction_runs | output_archive_point_id | context_archive_points | true | false | — |
| conversation_context_states | active_shared_archive_point_id | context_archive_points | true | false | — |
| conversation_items | session_id | sessions | true | false | — |
| conversation_items | reply_to_item_id | conversation_items | true | false | — |
| conversation_items | caused_by_item_id | conversation_items | true | false | — |
| conversation_items | author_participant_id | conversation_participants | true | false | — |
| conversation_items | turn_id | turns | true | false | — |
| conversation_participant_states | last_read_item_id | conversation_items | true | false | — |
| conversation_participants | actor_join_version_id | actor_versions | true | false | — |
| conversation_transport_bindings | inbound_actor_id | actors | false | true | inbound_actor_id_snapshot |
| conversations | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| devices | owner_workspace_member_id | workspace_members | true | false | — |
| file_access_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| file_access_grants | source_task_id | tool_call_tasks | true | false | — |
| file_assets | uploader_user_id | users | false | true | uploader_user_id_snapshot |
| file_assets | parent_asset_id | file_assets | true | false | — |
| file_mounts | sandbox_id,workspace_id | sandboxes | true | false | — |
| file_mounts | base_snapshot_id,file_space_id | file_snapshots | true | false | — |
| file_mounts | result_snapshot_id,file_space_id | file_snapshots | true | false | — |
| file_parse_outputs | derived_asset_id | file_assets | true | false | — |
| file_snapshots | created_by_session_id | sessions | false | true | created_by_session_id_snapshot |
| file_snapshots | parent_snapshot_id,file_space_id | file_snapshots | true | false | — |
| file_spaces | current_snapshot_id,id | file_snapshots | true | false | — |
| installed_skills | icon_file_id | file_assets | true | false | — |
| memory_access_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| memory_access_grants | source_task_id | tool_call_tasks | true | false | — |
| memory_items | supersedes_item_id | memory_items | true | false | — |
| memory_recall_run_results | matched_chunk_id | memory_item_chunks | true | false | — |
| memory_recall_runs | actor_id | actors | true | false | — |
| memory_recall_runs | conversation_id | conversations | true | false | — |
| memory_recall_runs | workspace_member_id | workspace_members | true | false | — |
| model_bindings | installed_by_workspace_member_id | workspace_members | false | true | installed_by_workspace_member_id_snapshot |
| model_bindings | current_version_id | model_binding_versions | true | false | — |
| model_group_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| model_groups | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| platform_access_bindings | assigned_by_user_id | users | false | true | assigned_by_user_id_snapshot |
| platform_access_bindings | revoked_by_user_id | users | true | false | — |
| plugin_auth_sessions | catalog_version_id | catalog_versions | true | false | — |
| plugin_source_refs | source_catalog_item_id | catalog_items | true | false | — |
| plugin_source_refs | source_catalog_version_id | catalog_versions | true | false | — |
| provider_steps | model_group_id | model_groups | true | false | — |
| provider_steps | model_binding_id | model_bindings | true | false | — |
| provider_steps | request_payload_blob_id | payload_blobs | true | false | — |
| provider_steps | response_payload_blob_id | payload_blobs | true | false | — |
| publishers | logo_file_id | file_assets | true | false | — |
| publishers | owner_user_id | users | false | true | owner_user_id_snapshot |
| remote_agent_conversation_contexts | active_task_id | tool_call_tasks | true | false | — |
| remote_agent_conversation_contexts | active_plan_approval_task_id | tool_call_tasks | true | false | — |
| remote_agent_conversation_views | last_read_item_id | conversation_items | true | false | — |
| remote_agent_conversation_views | last_delivery_item_id | conversation_items | true | false | — |
| remote_agent_group_task_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| remote_agent_machines | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| remote_agent_runs | conversation_id | conversations | true | false | — |
| remote_agent_runs | task_id | tool_call_tasks | true | false | — |
| remote_agents | avatar_file_id | file_assets | true | false | — |
| runtime_authorization_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| runtime_authorization_grants | source_task_id | tool_call_tasks | true | false | — |
| runtime_authorization_grants | governing_resource_grant_id | workspace_resource_grants | true | false | — |
| runtime_events | workspace_id | workspaces | true | false | — |
| runtime_events | conversation_id | conversations | true | false | — |
| runtime_events | session_id | sessions | true | false | — |
| runtime_events | turn_id | turns | true | false | — |
| runtime_events | provider_step_id | provider_steps | true | false | — |
| runtime_events | tool_call_id | tool_calls | true | false | — |
| runtime_events | tool_attempt_id | tool_execution_attempts | true | false | — |
| runtime_events | actor_id | actors | true | false | — |
| runtime_events | user_id | users | true | false | — |
| runtime_operation_attempts | runtime_control_plane_session_id | runtime_control_plane_sessions | true | false | — |
| runtime_operations | conversation_id | conversations | true | false | — |
| runtime_operations | task_id | tool_call_tasks | true | false | — |
| runtime_operations | initiated_by_workspace_member_id | workspace_members | false | true | initiated_by_workspace_member_id_snapshot |
| runtime_operations | initiated_by_session_id | sessions | false | true | initiated_by_session_id_snapshot |
| runtime_operations | runtime_session_id | runtime_sessions | true | false | — |
| runtime_pairing_sessions | requested_by_workspace_member_id | workspace_members | false | true | requested_by_workspace_member_id_snapshot |
| runtime_pairing_sessions | runtime_id | runtimes | true | false | — |
| runtime_services | current_session_id | runtime_control_plane_sessions | true | false | — |
| runtime_sessions | conversation_id | conversations | true | false | — |
| runtime_sessions | actor_id | actors | true | false | — |
| runtime_tools | latest_revision_id | runtime_tool_revisions | true | false | — |
| sandboxes | session_id | sessions | true | false | — |
| sandboxes | pairing_session_id | runtime_pairing_sessions | true | false | — |
| session_context_states | active_private_archive_point_id | context_archive_points | true | false | — |
| session_interrupts | from_session_id | sessions | true | false | — |
| session_wakeups | source_item_id | conversation_items | true | false | — |
| session_wakeups | source_session_id | sessions | true | false | — |
| session_wakeups | automation_execution_id | automation_executions | true | false | — |
| session_wakeups | automation_occurrence_id | automation_occurrences | true | false | — |
| sessions | active_plan_approval_task_id | tool_call_tasks | true | false | — |
| skill_snapshots | mirror_source_id | skill_mirror_sources | true | false | — |
| skill_source_refs | source_catalog_item_id | catalog_items | true | false | — |
| skill_source_refs | source_catalog_version_id | catalog_versions | true | false | — |
| skill_versions | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| tool_call_task_external_mcp | plugin_installation_id | plugin_installations | true | false | — |
| tool_call_task_response_commands | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| tool_call_task_runtime_tool | runtime_operation_id | runtime_operations | true | false | — |
| tool_call_task_transport_projections | transport_message_link_id | transport_message_links | true | false | — |
| tool_call_tasks | turn_id | turns | true | false | — |
| tool_call_tasks | source_tool_call_id | tool_calls | true | false | — |
| tool_call_tasks | conversation_item_id | conversation_items | true | false | — |
| tool_call_tasks | completion_item_id | conversation_items | true | false | — |
| tool_calls | provider_step_id | provider_steps | true | false | — |
| tool_calls | session_id | sessions | true | false | — |
| tool_calls | plugin_installation_id | plugin_installations | true | false | — |
| tool_calls | runtime_tool_id | runtime_tools | true | false | — |
| tool_execution_attempts | request_payload_blob_id | payload_blobs | true | false | — |
| tool_execution_attempts | response_payload_blob_id | payload_blobs | true | false | — |
| tool_results | attempt_id | tool_execution_attempts | true | false | — |
| transport_accounts | inbound_actor_id | actors | false | true | inbound_actor_id_snapshot |
| transport_addresses | workspace_member_id | workspace_members | true | false | — |
| turns | trigger_item_id | conversation_items | true | false | — |
| users | avatar_file_id | file_assets | true | false | — |
| workspace_access_bindings | assigned_by_workspace_member_id | workspace_members | false | true | assigned_by_workspace_member_id_snapshot |
| workspace_access_bindings | revoked_by_workspace_member_id | workspace_members | true | false | — |
| workspace_friend_entries | source_request_id | workspace_friend_requests | true | false | — |
| workspace_friend_requests | requested_via_profile_id | workspace_relationship_profiles | true | false | — |
| workspace_friend_requests | resolved_by_workspace_member_id | workspace_members | false | true | resolved_by_workspace_member_id_snapshot |
| workspace_member_conversation_views | last_visible_item_id | conversation_items | true | false | — |
| workspace_member_preferences | chief_actor_id | actors | true | false | — |
| workspace_member_sync_events | item_id | conversation_items | true | false | — |
| workspace_relationship_profiles | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |
| workspace_resource_grant_requests | resolved_by_workspace_member_id | workspace_members | false | true | resolved_by_workspace_member_id_snapshot |
| workspace_resource_grants | created_by_workspace_member_id | workspace_members | false | true | created_by_workspace_member_id_snapshot |

## All foreign keys (target policy)

| child(cols) | -> parent(cols) | schema ON DELETE | target ON DELETE | live integrity | source | key |
|---|---|---|---|---|---|---|
| access_subjects(actor_id) | actors(id) | RESTRICT | RESTRICT | enforce | inline | digest:62e35bc7ac2040bd |
| access_subjects(conversation_id,workspace_id) | conversations(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_access_subjects_conversation |
| access_subjects(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | enforce | inline | digest:9aae144e4c2429c2 |
| access_subjects(transport_address_id,workspace_id) | transport_addresses(id,workspace_id) | NO ACTION | RESTRICT | — | alter | constraint:fk_access_subjects_transport_address |
| access_subjects(user_id) | users(id) | RESTRICT | RESTRICT | enforce | inline | digest:8b7aee378f78f834 |
| access_subjects(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:382157128151b5c4 |
| access_subjects(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:159451ada151e933 |
| account(user_id) | users(id) | RESTRICT | RESTRICT | enforce | inline | digest:e8948e1046f77257 |
| actor_model_group_assignments(actor_id) | actors(id) | RESTRICT | RESTRICT | — | inline | digest:37ac1963eda81802 |
| actor_model_group_assignments(group_id) | model_groups(id) | RESTRICT | RESTRICT | — | inline | digest:e24e9629288c1945 |
| actor_source_refs(actor_id) | actors(id) | RESTRICT | RESTRICT | enforce | inline | digest:184504c91cb7aa52 |
| actor_source_refs(source_catalog_item_id) | catalog_items(id) | SET NULL | SET NULL | historical | inline | digest:1f349f40877c9e00 |
| actor_source_refs(source_catalog_version_id) | catalog_versions(id) | SET NULL | SET NULL | — | inline | digest:ba64409c73955094 |
| actor_template_version_specs(avatar_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:a698b167692963c5 |
| actor_template_version_specs(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:d32720f81fd40b36 |
| actor_version_docs(actor_version_id) | actor_versions(id) | RESTRICT | RESTRICT | — | inline | digest:390c0ff5efcbe648 |
| actor_versions(actor_id) | actors(id) | RESTRICT | RESTRICT | enforce | inline | digest:3803a5aeaf5bfc98 |
| actor_versions(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:42bd7a4568291b4b |
| actor_versions(parent_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:5f3e8a692318ca57 |
| actor_versions(previous_version_id) | actor_versions(id) | SET NULL | SET NULL | — | inline | digest:0a3dfc021cccb532 |
| actor_versions(source_actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:1b19cfcb2bf42b35 |
| actor_versions(source_conversation_id) | conversations(id) | SET NULL | SET NULL | historical | inline | digest:88af0f1839b5b325 |
| actor_versions(source_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:7d4ea6538ab0ab67 |
| actors(avatar_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:863421d63df3444e |
| actors(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_actors_workspace_resource_root |
| actors(parent_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:92173ab39606d470 |
| automation_deliveries(rule_id) | automation_rules(id) | RESTRICT | RESTRICT | — | inline | digest:2a13535304790846 |
| automation_delivery_targets(rule_id) | automation_rules(id) | RESTRICT | RESTRICT | — | inline | digest:137e8efac7755de5 |
| automation_delivery_targets(target_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | — | inline | digest:452ba0953a943f3c |
| automation_event_sources(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_automation_event_sources_workspace_resource_root |
| automation_event_sources(integration_binding_id) | automation_integration_bindings(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_automation_event_sources_integration_binding |
| automation_event_sources(webhook_endpoint_id) | automation_webhook_endpoints(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_automation_event_sources_webhook_endpoint |
| automation_event_sources(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:0e18a0c8365b49f9 |
| automation_execution_targets(conversation_id) | conversations(id) | SET NULL | SET NULL | — | inline | digest:ab55bd148f304d1f |
| automation_execution_targets(created_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:7db92bd7cc8e253f |
| automation_execution_targets(execution_id) | automation_executions(id) | RESTRICT | RESTRICT | — | inline | digest:48f3fb905904df9b |
| automation_execution_targets(session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:20240ad46891c9c7 |
| automation_execution_targets(target_actor_id) | actors(id) | SET NULL | SET NULL | — | inline | digest:531d5af0500ea9ac |
| automation_execution_targets(target_participant_id) | conversation_participants(id) | SET NULL | SET NULL | — | inline | digest:535e46df3a5343e6 |
| automation_execution_targets(wakeup_id) | session_wakeups(id) | SET NULL | SET NULL | — | inline | digest:8ec0e6c5795e5b48 |
| automation_executions(occurrence_id) | automation_occurrences(id) | RESTRICT | RESTRICT | — | inline | digest:eac53607f30c73e8 |
| automation_executions(rule_id) | automation_rules(id) | RESTRICT | RESTRICT | — | inline | digest:4766ea2aef95262f |
| automation_executions(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:cd35be2e315169ab |
| automation_integration_bindings(installation_id) | plugin_installations(id) | RESTRICT | RESTRICT | enforce | inline | digest:efc0c0e7f95b5318 |
| automation_integration_bindings(installation_id,workspace_id) | workspace_resources(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_automation_integration_bindings_workspace_resource_root |
| automation_integration_bindings(webhook_endpoint_id) | automation_webhook_endpoints(id) | RESTRICT | RESTRICT | enforce | inline | digest:c26bc057b80aad3c |
| automation_integration_bindings(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:3c667c1007110505 |
| automation_occurrences(event_source_id) | automation_event_sources(id) | SET NULL | SET NULL | historical | inline | digest:afebd2fe03edca4d |
| automation_occurrences(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:7b1195c0c15744dd |
| automation_policies(rule_id) | automation_rules(id) | RESTRICT | RESTRICT | enforce | inline | digest:13e5a37814372e3c |
| automation_rules(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:f3bcd495652ba058 |
| automation_rules(created_by_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:7058ff55d73745f7 |
| automation_rules(created_by_session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:142065b8dc927285 |
| automation_rules(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:0b683f7bbcfc9722 |
| automation_triggers(event_source_id) | automation_event_sources(id) | RESTRICT | RESTRICT | — | inline | digest:b1a39b7ccbbdfde1 |
| automation_triggers(rule_id) | automation_rules(id) | RESTRICT | RESTRICT | — | inline | digest:31f9775829a19bb8 |
| automation_webhook_endpoints(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:167c7a1ee2996575 |
| automation_webhook_endpoints(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:80a8a1d3dad75fb3 |
| catalog_categories(icon_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:2dbe699149bef13e |
| catalog_item_categories(catalog_item_id) | catalog_items(id) | RESTRICT | RESTRICT | — | inline | digest:c5b690831bf94ad1 |
| catalog_item_categories(category_id) | catalog_categories(id) | RESTRICT | RESTRICT | — | inline | digest:390b5ab0ac8deb94 |
| catalog_items(icon_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:88154a761f4ddf1e |
| catalog_items(latest_version_id) | catalog_versions(id) | SET NULL | SET NULL | — | alter | constraint:fk_catalog_items_latest_version |
| catalog_items(mirror_source_id) | skill_mirror_sources(id) | SET NULL | SET NULL | — | inline | digest:2872823178ba79e0 |
| catalog_items(publisher_id) | publishers(id) | RESTRICT | RESTRICT | enforce | inline | digest:512f41743546bcf8 |
| catalog_items(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:729793326e20f489 |
| catalog_version_files(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:fe1da8514d3c7d8f |
| catalog_versions(catalog_item_id) | catalog_items(id) | RESTRICT | RESTRICT | enforce | inline | digest:5a7a34c1ba8396eb |
| catalog_versions(created_by_user_id) | users(id) | SET NULL | SET NULL | historical | inline | digest:47005fc83263e4f6 |
| chat_client_instances(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:d901dce771c72e09 |
| chat_client_instances(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:6ec5e35c67e82400 |
| chat_conversation_create_requests(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:7c86cf1fe3a773b2 |
| chat_conversation_create_requests(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:73aa86e05fda50d0 |
| chat_conversation_create_requests(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:63c0ae00827102d4 |
| chat_push_tokens(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | — | inline | digest:a6f24a23dcb0ecda |
| context_archive_frame_parts(archive_frame_id) | context_archive_frames(id) | RESTRICT | RESTRICT | — | inline | digest:17efc49a11c5f6ee |
| context_archive_frames(archive_point_id) | context_archive_points(id) | RESTRICT | RESTRICT | — | inline | digest:edb3850a01e8aef7 |
| context_archive_points(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:cb33ec70a7b7be88 |
| context_archive_points(parent_archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:0f884a655e5d55d8 |
| context_archive_points(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:acc78532819ffc6d |
| context_compaction_run_inputs(archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:9c24e43b2c09947c |
| context_compaction_run_inputs(item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:b9a07244873970be |
| context_compaction_run_inputs(run_id) | context_compaction_runs(id) | RESTRICT | RESTRICT | — | inline | digest:1c8a9c2c2dce660e |
| context_compaction_runs(base_archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:b1bbb31b7e1a635f |
| context_compaction_runs(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:784e36aea3921668 |
| context_compaction_runs(output_archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:0124298b9954c755 |
| context_compaction_runs(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:63a82bed57aca271 |
| conversation_context_states(active_shared_archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:3aaad58ae6712f56 |
| conversation_context_states(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:4c81cc95650fa5fe |
| conversation_device_states(client_instance_id) | chat_client_instances(id) | RESTRICT | RESTRICT | — | inline | digest:06e8b6d661ec2478 |
| conversation_device_states(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:ee21d2f85d1f59d6 |
| conversation_item_context_targets(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:bc7dafdc0468fa11 |
| conversation_item_context_targets(target_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:c83066a74e0964d4 |
| conversation_item_mentions(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:d2b1201c5d87d8df |
| conversation_item_mentions(mentioned_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:6b862759729ffc0d |
| conversation_item_parts(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:263def6267076feb |
| conversation_item_targets(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:c3be5bb15e74f5b3 |
| conversation_item_targets(target_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:f1d3784b31861fe9 |
| conversation_items(author_participant_id) | conversation_participants(id) | SET NULL | SET NULL | historical | alter | constraint:fk_conversation_items_author_participant |
| conversation_items(caused_by_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:cf2d7637ce219458 |
| conversation_items(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:8066a2f323e51cf7 |
| conversation_items(reply_to_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:424b5f77b319aeff |
| conversation_items(session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:18a6156fe264ad84 |
| conversation_items(turn_id) | turns(id) | SET NULL | SET NULL | — | alter | constraint:fk_conversation_items_turn |
| conversation_participant_addresses(conversation_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:7303186d05b13770 |
| conversation_participant_addresses(transport_address_id) | transport_addresses(id) | RESTRICT | RESTRICT | — | inline | digest:36f0b7e4dcc1bb79 |
| conversation_participant_states(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:30badfebded9148c |
| conversation_participant_states(last_read_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:9b7dbf0373994022 |
| conversation_participant_states(participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | historical | inline | digest:c468dfa76d940c58 |
| conversation_participants(actor_join_version_id) | actor_versions(id) | SET NULL | SET NULL | — | inline | digest:cc42e38a05b053aa |
| conversation_participants(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:4d2b3cd83e072435 |
| conversation_participants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_conversation_participants_subject |
| conversation_transport_bindings(conversation_id,workspace_id) | conversations(id,workspace_id) | RESTRICT | RESTRICT | none | table | digest:5655893855d4c4f4 |
| conversation_transport_bindings(inbound_actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:2770cdb04fc6010b |
| conversation_transport_bindings(transport_account_id,workspace_id) | transport_accounts(id,workspace_id) | NO ACTION | RESTRICT | none | table | digest:1d8ceb2eadf5c3fc |
| conversation_transport_bindings(transport_endpoint_id,transport_account_id) | transport_endpoints(id,transport_account_id) | NO ACTION | RESTRICT | — | table | digest:45e6763ecd763e8d |
| conversation_transport_bindings(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:58160141b0df023f |
| conversations(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:03062d021ed288d6 |
| conversations(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:ea72b4f3dcaeae10 |
| device_code(user_id) | users(id) | RESTRICT | RESTRICT | — | inline | digest:4a7f992e8b672a6d |
| devices(id) | runtimes(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_devices_runtime_root |
| devices(id,workspace_id) | runtimes(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_devices_runtime_ws |
| devices(owner_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:4e1b38cb3cb1fc1f |
| devices(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:0d0b1dc1ef7278c2 |
| direct_conversation_bindings(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:68b1214ed7e5e3df |
| direct_conversation_bindings(participant_one_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_direct_conversation_bindings_participant_one_subject |
| direct_conversation_bindings(participant_two_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_direct_conversation_bindings_participant_two_subject |
| file_access_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:228179373a1d784a |
| file_access_grants(file_asset_id) | file_assets(id) | RESTRICT | RESTRICT | enforce | inline | digest:598ece0be30e750f |
| file_access_grants(file_space_id) | file_spaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:1ceb46610f404d2e |
| file_access_grants(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:e523f330dfbfb3c2 |
| file_access_grants(source_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | inline | digest:f897ce1bf6b608f2 |
| file_access_grants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:ae7e2efca3e4a8e4 |
| file_access_grants(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:277c2d1870777a54 |
| file_assets(content_sha256) | content_blobs(sha256) | RESTRICT | RESTRICT | — | inline | digest:65ac8082e128159e |
| file_assets(parent_asset_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:82f810b5cc2445b2 |
| file_assets(uploader_user_id) | users(id) | SET NULL | SET NULL | historical | inline | digest:e84a2af3f6d44685 |
| file_assets(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:4d2bcc747acadf6b |
| file_mounts(base_snapshot_id,file_space_id) | file_snapshots(id,file_space_id) | SET NULL | SET NULL | — | table | digest:10782cbf8f2e2b30 |
| file_mounts(file_space_id,workspace_id) | file_spaces(id,workspace_id) | RESTRICT | RESTRICT | — | table | digest:5b2f02c100d79dbf |
| file_mounts(result_snapshot_id,file_space_id) | file_snapshots(id,file_space_id) | SET NULL | SET NULL | — | table | digest:b4b4785f26099570 |
| file_mounts(sandbox_id,workspace_id) | sandboxes(id,workspace_id) | SET NULL | SET NULL | — | table | digest:ba5d382e812645be |
| file_mounts(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:b067b02b5d174cee |
| file_mounts(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:603d55e10d7303be |
| file_parse_outputs(derived_asset_id) | file_assets(id) | SET NULL | SET NULL | — | inline | digest:d1f1a7f065c093b7 |
| file_parse_outputs(run_id) | file_parse_runs(id) | RESTRICT | RESTRICT | — | inline | digest:502360b25124e3eb |
| file_parse_runs(asset_id) | file_assets(id) | RESTRICT | RESTRICT | — | inline | digest:71ba19692fcca428 |
| file_snapshots(created_by_session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:556aa73b321696d6 |
| file_snapshots(file_space_id) | file_spaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:9d38677c17316381 |
| file_snapshots(manifest_sha256) | content_blobs(sha256) | RESTRICT | RESTRICT | — | inline | digest:c95554f915cc6b6b |
| file_snapshots(parent_snapshot_id,file_space_id) | file_snapshots(id,file_space_id) | SET NULL | SET NULL | — | table | digest:b59ce7b9c0c760bf |
| file_snapshots(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:2e2b21d490f06e91 |
| file_spaces(current_snapshot_id,id) | file_snapshots(id,file_space_id) | SET NULL | SET NULL | — | alter | constraint:file_spaces_current_snapshot_fkey |
| file_spaces(owner_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:1a855c67f6094235 |
| file_spaces(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:5afceb71212662f7 |
| file_spaces(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:ebc0c71736e724a9 |
| installed_skills(current_snapshot_id) | skill_snapshots(id) | RESTRICT | RESTRICT | — | inline | digest:bcdbd46e9e44f9b5 |
| installed_skills(icon_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:223fa49a9dbc9d2c |
| installed_skills(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_installed_skills_workspace_resource_root |
| memory_access_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:d4d87e1df2e46892 |
| memory_access_grants(memory_item_id) | memory_items(id) | RESTRICT | RESTRICT | enforce | inline | digest:1af03e77b5f3e6e9 |
| memory_access_grants(memory_space_id) | memory_spaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:cd46feb870562702 |
| memory_access_grants(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:b5abece33fbd29db |
| memory_access_grants(source_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | inline | digest:5eda4d2383b6b7f3 |
| memory_access_grants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:b9cbe4b2fd13cf8a |
| memory_access_grants(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:5189370f57383a25 |
| memory_item_chunks(memory_item_id) | memory_items(id) | RESTRICT | RESTRICT | — | inline | digest:704cffebc5a936fd |
| memory_item_chunks(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:03e6e1ea8d79a639 |
| memory_item_parts(memory_item_id) | memory_items(id) | RESTRICT | RESTRICT | enforce | inline | digest:e6bb6835c0372677 |
| memory_items(memory_space_id) | memory_spaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:2c5f6f403ec13f5f |
| memory_items(supersedes_item_id) | memory_items(id) | SET NULL | SET NULL | historical | inline | digest:d7f191891235c85b |
| memory_items(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:7b4ffd9d26d4fcc2 |
| memory_recall_run_results(matched_chunk_id) | memory_item_chunks(id) | SET NULL | SET NULL | — | inline | digest:609759c97a5f1521 |
| memory_recall_run_results(memory_item_id) | memory_items(id) | RESTRICT | RESTRICT | enforce | inline | digest:357daab331641db8 |
| memory_recall_run_results(run_id) | memory_recall_runs(id) | RESTRICT | RESTRICT | — | inline | digest:14f9867cc58a4ce3 |
| memory_recall_runs(actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:02f86844e84f7a16 |
| memory_recall_runs(conversation_id) | conversations(id) | SET NULL | SET NULL | historical | inline | digest:e3d47c4e86d0190b |
| memory_recall_runs(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:e214c7a98cd99f7d |
| memory_recall_runs(workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:124774567bbe37e8 |
| memory_spaces(owner_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:03f1a0f0a3b363ee |
| memory_spaces(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:8df37a9cd0dc290a |
| memory_spaces(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:1d41cd7bb50bd73d |
| model_binding_versions(binding_id) | model_bindings(id) | RESTRICT | RESTRICT | enforce | inline | digest:b4518f8456a8bc54 |
| model_bindings(current_version_id) | model_binding_versions(id) | SET NULL | SET NULL | — | alter | constraint:fk_model_bindings_current_version |
| model_bindings(group_id) | model_groups(id) | RESTRICT | RESTRICT | enforce | inline | digest:95e34bddb408b8da |
| model_bindings(installed_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:ccccd10c9683d770 |
| model_group_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:a7020e57b07a9c32 |
| model_group_grants(group_id) | model_groups(id) | RESTRICT | RESTRICT | enforce | inline | digest:0dc6f0dfdb5a35b4 |
| model_group_grants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_model_group_grants_subject |
| model_groups(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:d66b3255cb29ad6d |
| model_groups(owner_workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:8396a284b560a954 |
| model_groups(owner_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:b76fd404c1bd4d47 |
| platform_access_bindings(assigned_by_user_id) | users(id) | SET NULL | SET NULL | historical | inline | digest:4e2e8f0769a79d1d |
| platform_access_bindings(revoked_by_user_id) | users(id) | SET NULL | SET NULL | historical | alter-add-column | digest:1e2a3f06cc60ff65 |
| platform_access_bindings(user_id) | users(id) | RESTRICT | RESTRICT | enforce | inline | digest:74e0db9275648c5a |
| plugin_auth_sessions(catalog_item_id) | catalog_items(id) | RESTRICT | RESTRICT | — | inline | digest:0515f8363e1bace5 |
| plugin_auth_sessions(catalog_version_id) | catalog_versions(id) | SET NULL | SET NULL | — | inline | digest:48619887ee3909f3 |
| plugin_auth_sessions(installation_id) | plugin_installations(id) | RESTRICT | RESTRICT | — | inline | digest:433489d61f9f7e07 |
| plugin_auth_sessions(installation_id,workspace_id) | workspace_resources(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_plugin_auth_sessions_workspace_resource_root |
| plugin_auth_sessions(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:60dceccdf67420d4 |
| plugin_auth_sessions(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | — | inline | digest:73b4ca8139942ae8 |
| plugin_connections(installation_id) | plugin_installations(id) | RESTRICT | RESTRICT | enforce | inline | digest:9bd6132244a7fb2d |
| plugin_connections(installation_id,workspace_id) | workspace_resources(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_plugin_connections_workspace_resource_root |
| plugin_connections(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:499b81c42d1b8713 |
| plugin_installations(catalog_item_id) | catalog_items(id) | RESTRICT | RESTRICT | enforce | inline | digest:7ac73d1b58d0552a |
| plugin_installations(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:f1864115951abe68 |
| plugin_installations(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_plugin_installations_workspace_resource_root |
| plugin_package_version_specs(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:34a7c1e60a02f5cd |
| plugin_source_refs(installation_id) | plugin_installations(id) | RESTRICT | RESTRICT | enforce | inline | digest:6b3620f81be0d83b |
| plugin_source_refs(source_catalog_item_id) | catalog_items(id) | SET NULL | SET NULL | historical | inline | digest:410d14eb7fa33d4b |
| plugin_source_refs(source_catalog_version_id) | catalog_versions(id) | SET NULL | SET NULL | — | inline | digest:d104a62e8a294a0c |
| plugin_version_runtime_permissions(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:7af16897c7872e31 |
| provider_steps(model_binding_id) | model_bindings(id) | SET NULL | SET NULL | historical | inline | digest:a344918bf1ac16ea |
| provider_steps(model_binding_version_id) | model_binding_versions(id) | RESTRICT | RESTRICT | — | inline | digest:db17ae7d96411d13 |
| provider_steps(model_group_id) | model_groups(id) | SET NULL | SET NULL | historical | inline | digest:7bb76cdda7c1caef |
| provider_steps(request_payload_blob_id) | payload_blobs(id) | SET NULL | SET NULL | — | inline | digest:d027fbe859c64c9b |
| provider_steps(response_payload_blob_id) | payload_blobs(id) | SET NULL | SET NULL | — | inline | digest:925c44f006ce0515 |
| provider_steps(turn_id) | turns(id) | RESTRICT | RESTRICT | — | inline | digest:387a690902d9d5b1 |
| publishers(logo_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:df5cc738ac7f8554 |
| publishers(owner_user_id) | users(id) | SET NULL | SET NULL | historical | inline | digest:18cc796ae60043e3 |
| publishers(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:58c63e093795c1e1 |
| realtime_event_outbox(recipient_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | — | inline | digest:a8267476810d6f56 |
| realtime_event_outbox(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:b4692adb0ac59bfd |
| remote_agent_bindings(machine_id) | remote_agent_machines(id) | RESTRICT | RESTRICT | enforce | inline | digest:e9d64e1451bd893f |
| remote_agent_bindings(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | enforce | inline | digest:082b14c7aa320ca4 |
| remote_agent_conversation_contexts(active_plan_approval_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | alter | constraint:fk_remote_agent_conversation_contexts_active_plan_approval_task |
| remote_agent_conversation_contexts(active_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | alter | constraint:fk_remote_agent_conversation_contexts_active_task |
| remote_agent_conversation_contexts(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:936dcc9c72d5ab46 |
| remote_agent_conversation_contexts(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | — | inline | digest:e8285dd9854ccab4 |
| remote_agent_conversation_views(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:4bd531a278265207 |
| remote_agent_conversation_views(last_delivery_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:47e6ba1fc27624b0 |
| remote_agent_conversation_views(last_read_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:c74265e1566e433b |
| remote_agent_conversation_views(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | enforce | inline | digest:e66e6dc50924fb0a |
| remote_agent_group_task_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | — | inline | digest:fb830f671eb805da |
| remote_agent_group_task_grants(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | — | inline | digest:f1ba006367706388 |
| remote_agent_group_task_grants(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | — | inline | digest:b6cafb364dbc6511 |
| remote_agent_machine_sessions(machine_id) | remote_agent_machines(id) | RESTRICT | RESTRICT | — | inline | digest:8a28548bdc3c7324 |
| remote_agent_machines(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:32432bc83f309b7f |
| remote_agent_machines(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:cc041dcd33bdd143 |
| remote_agent_message_deliveries(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:0a8bf690016e3c6d |
| remote_agent_message_deliveries(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:e1d122d1cb3ea147 |
| remote_agent_message_deliveries(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | enforce | inline | digest:47096b58e2a48e90 |
| remote_agent_runs(conversation_id) | conversations(id) | SET NULL | SET NULL | — | inline | digest:a9282cb7f904e535 |
| remote_agent_runs(remote_agent_id) | remote_agents(id) | RESTRICT | RESTRICT | — | inline | digest:56ff97100ec42e99 |
| remote_agent_runs(task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | alter | constraint:fk_remote_agent_runs_task |
| remote_agent_runtime_catalog(machine_id) | remote_agent_machines(id) | RESTRICT | RESTRICT | enforce | inline | digest:a7bd588d8c8970ce |
| remote_agents(avatar_file_id) | file_assets(id) | SET NULL | SET NULL | historical | inline | digest:bd26c512c4e5a2fa |
| remote_agents(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_remote_agents_workspace_resource_root |
| runtime_authorization_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:814287e8e659a369 |
| runtime_authorization_grants(governing_resource_grant_id) | workspace_resource_grants(id) | SET NULL | SET NULL | historical | alter-add-column | digest:c80d90e51dc3e559 |
| runtime_authorization_grants(runtime_capability_id) | runtime_capabilities(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_runtime_authorization_grants_runtime_capability |
| runtime_authorization_grants(runtime_capability_id,workspace_id) | workspace_resources(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_runtime_authorization_grants_workspace_resource_root |
| runtime_authorization_grants(runtime_exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_runtime_authorization_grants_runtime_exposure |
| runtime_authorization_grants(runtime_exposure_id,workspace_id) | runtime_exposures(id,workspace_id) | NO ACTION | RESTRICT | none | alter | constraint:fk_rag_exposure_ws |
| runtime_authorization_grants(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_runtime_authorization_grants_runtime |
| runtime_authorization_grants(runtime_id,workspace_id) | runtimes(id,workspace_id) | NO ACTION | RESTRICT | none | alter | constraint:fk_rag_runtime_ws |
| runtime_authorization_grants(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_runtime_authorization_grants_scope_subject |
| runtime_authorization_grants(source_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | inline | digest:6fb2a515460640f8 |
| runtime_authorization_grants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_runtime_authorization_grants_subject |
| runtime_authorization_grants(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:ceb9df2e88119237 |
| runtime_capabilities(exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | enforce | inline | digest:d8718a4537b48d3c |
| runtime_capabilities(exposure_id,workspace_id) | runtime_exposures(id,workspace_id) | NO ACTION | RESTRICT | none | alter | constraint:fk_runtime_capabilities_exposure_ws |
| runtime_capabilities(id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_runtime_capabilities_workspace_resource_root |
| runtime_catalog_revisions(exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | enforce | inline | digest:044b9e85944d7a01 |
| runtime_control_plane_sessions(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | — | inline | digest:6d329e4a5b44ad72 |
| runtime_control_plane_sessions(service_id) | runtime_services(id) | RESTRICT | RESTRICT | — | inline | digest:a3addb98be5eaff1 |
| runtime_events(actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:24ceb4ea555f573e |
| runtime_events(conversation_id) | conversations(id) | SET NULL | SET NULL | historical | inline | digest:2c0b2f9055019730 |
| runtime_events(provider_step_id) | provider_steps(id) | SET NULL | SET NULL | — | inline | digest:f7a1069dce869d83 |
| runtime_events(session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:4f55e3639e386894 |
| runtime_events(tool_attempt_id) | tool_execution_attempts(id) | SET NULL | SET NULL | — | inline | digest:bf052468346e087c |
| runtime_events(tool_call_id) | tool_calls(id) | SET NULL | SET NULL | — | inline | digest:0e45996d7cc9dd7c |
| runtime_events(turn_id) | turns(id) | SET NULL | SET NULL | — | inline | digest:4fdbf749000a20d1 |
| runtime_events(user_id) | users(id) | SET NULL | SET NULL | historical | inline | digest:f14c406d011be629 |
| runtime_events(workspace_id) | workspaces(id) | SET NULL | SET NULL | historical | inline | digest:a476830f26ef0fc9 |
| runtime_exposures(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | enforce | inline | digest:38e5e235b1a4309e |
| runtime_exposures(runtime_id,workspace_id) | runtimes(id,workspace_id) | NO ACTION | RESTRICT | none | alter | constraint:fk_runtime_exposures_runtime_ws |
| runtime_exposures(service_id) | runtime_services(id) | RESTRICT | RESTRICT | enforce | inline | digest:31ebb42605220d2f |
| runtime_operation_attempts(operation_id) | runtime_operations(id) | RESTRICT | RESTRICT | — | inline | digest:1b0b5a468f0a0f9a |
| runtime_operation_attempts(runtime_control_plane_session_id) | runtime_control_plane_sessions(id) | SET NULL | SET NULL | — | inline | digest:62cecc8c772059aa |
| runtime_operation_attempts(runtime_service_id) | runtime_services(id) | RESTRICT | RESTRICT | enforce | inline | digest:6f8ecec9928a7c14 |
| runtime_operation_results(operation_id) | runtime_operations(id) | RESTRICT | RESTRICT | — | inline | digest:4719de8702e1825a |
| runtime_operations(catalog_revision_id) | runtime_catalog_revisions(id) | RESTRICT | RESTRICT | — | inline | digest:d97ab5b7353d8fc4 |
| runtime_operations(conversation_id) | conversations(id) | SET NULL | SET NULL | historical | inline | digest:174f89d06def2173 |
| runtime_operations(initiated_by_session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:2d7a350a11ca3c09 |
| runtime_operations(initiated_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:2b7b5d035f61d3ad |
| runtime_operations(principal_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | inline | digest:e13b94240db48401 |
| runtime_operations(runtime_capability_id) | runtime_capabilities(id) | RESTRICT | RESTRICT | enforce | inline | digest:f793f0839e989585 |
| runtime_operations(runtime_capability_id,workspace_id) | workspace_resources(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_runtime_operations_workspace_resource_root |
| runtime_operations(runtime_exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | enforce | inline | digest:10a7d93a578ee1e6 |
| runtime_operations(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | enforce | inline | digest:8a625e9c6cccb69c |
| runtime_operations(runtime_session_id) | runtime_sessions(id) | SET NULL | SET NULL | — | inline | digest:4b4a919b4879d99a |
| runtime_operations(task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | inline | digest:74dae055043d7dc3 |
| runtime_operations(tool_id) | runtime_tools(id) | RESTRICT | RESTRICT | enforce | inline | digest:51f0dd6e6b0ecb5b |
| runtime_operations(tool_revision_id) | runtime_tool_revisions(id) | RESTRICT | RESTRICT | — | inline | digest:ebbf618ed1e24b47 |
| runtime_operations(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:7b7ea2ff04b53062 |
| runtime_pairing_sessions(requested_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | — | inline | digest:ee75fa47560c0ac0 |
| runtime_pairing_sessions(runtime_id) | runtimes(id) | SET NULL | SET NULL | — | inline | digest:bee90be20c6bcf2f |
| runtime_pairing_sessions(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:20c20349e3e1c0f8 |
| runtime_service_keys(service_id) | runtime_services(id) | RESTRICT | RESTRICT | enforce | inline | digest:73c5c721f8351e7e |
| runtime_services(current_session_id) | runtime_control_plane_sessions(id) | SET NULL | SET NULL | — | alter | constraint:fk_runtime_services_current_session |
| runtime_services(remote_agent_machine_id) | remote_agent_machines(id) | RESTRICT | RESTRICT | enforce | inline | digest:3450d226eb5a2dd8 |
| runtime_services(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | enforce | inline | digest:3661146bd3147448 |
| runtime_session_services(service_id) | runtime_services(id) | RESTRICT | RESTRICT | — | inline | digest:c07c53d96761dd86 |
| runtime_session_services(session_id) | runtime_sessions(id) | RESTRICT | RESTRICT | — | inline | digest:f4dae8c71d7e8579 |
| runtime_sessions(actor_id) | actors(id) | SET NULL | SET NULL | — | inline | digest:7172ac1ea6c6e378 |
| runtime_sessions(conversation_id) | conversations(id) | SET NULL | SET NULL | — | inline | digest:0500c944accb2b5b |
| runtime_sessions(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | — | inline | digest:b19af07ab7a4390c |
| runtime_tool_revisions(catalog_revision_id) | runtime_catalog_revisions(id) | RESTRICT | RESTRICT | — | inline | digest:ccb5f9c2467b2cf7 |
| runtime_tool_revisions(tool_id) | runtime_tools(id) | RESTRICT | RESTRICT | enforce | inline | digest:b05bedf7b6b1d37e |
| runtime_tools(exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | enforce | inline | digest:5a552b01d1b45821 |
| runtime_tools(latest_revision_id) | runtime_tool_revisions(id) | SET NULL | SET NULL | — | alter | constraint:fk_runtime_tools_latest_revision |
| runtimes(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:ef474658abbb978f |
| sandboxes(id) | runtimes(id) | RESTRICT | RESTRICT | enforce | alter | constraint:fk_sandboxes_runtime_root |
| sandboxes(id,workspace_id) | runtimes(id,workspace_id) | RESTRICT | RESTRICT | none | alter | constraint:fk_sandboxes_runtime_ws |
| sandboxes(pairing_session_id) | runtime_pairing_sessions(id) | SET NULL | SET NULL | — | alter | constraint:fk_sandboxes_pairing_session |
| sandboxes(session_id) | sessions(id) | SET NULL | SET NULL | — | alter | constraint:fk_sandboxes_session |
| session(user_id) | users(id) | RESTRICT | RESTRICT | — | inline | digest:3e62616699e5de03 |
| session_context_states(active_private_archive_point_id) | context_archive_points(id) | SET NULL | SET NULL | — | inline | digest:5a03f2e950b6c314 |
| session_context_states(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:aaa73cab7053a98c |
| session_interrupts(from_session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:baa4c99eafff045b |
| session_interrupts(target_session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:dd79f9941dbe660e |
| session_wakeups(automation_execution_id) | automation_executions(id) | SET NULL | SET NULL | — | alter-add-column | digest:64828e3c5e33c67b |
| session_wakeups(automation_occurrence_id) | automation_occurrences(id) | SET NULL | SET NULL | — | alter-add-column | digest:d84f090db0c1d2aa |
| session_wakeups(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:9a91065e44237357 |
| session_wakeups(source_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:63173d0db4354dae |
| session_wakeups(source_session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:396b27eb820a85ee |
| sessions(active_plan_approval_task_id) | tool_call_tasks(id) | SET NULL | SET NULL | — | alter | constraint:fk_sessions_active_plan_approval_task |
| sessions(actor_id) | actors(id) | RESTRICT | RESTRICT | — | inline | digest:8dec1159aed6d022 |
| sessions(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:09126d073b81122a |
| sessions(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:6b4714de0bd1e8cf |
| skill_package_version_specs(catalog_version_id) | catalog_versions(id) | RESTRICT | RESTRICT | — | inline | digest:282cab533d25a94e |
| skill_package_version_specs(skill_snapshot_id) | skill_snapshots(id) | RESTRICT | RESTRICT | — | inline | digest:f09f1770e3a0889e |
| skill_snapshot_files(skill_snapshot_id) | skill_snapshots(id) | RESTRICT | RESTRICT | — | inline | digest:6f2d6475d6937fa0 |
| skill_snapshots(mirror_source_id) | skill_mirror_sources(id) | SET NULL | SET NULL | — | inline | digest:241b97560b9d2478 |
| skill_source_refs(skill_id) | installed_skills(id) | RESTRICT | RESTRICT | enforce | inline | digest:f4cea3f0151faf2f |
| skill_source_refs(source_catalog_item_id) | catalog_items(id) | SET NULL | SET NULL | historical | inline | digest:330386888d414203 |
| skill_source_refs(source_catalog_version_id) | catalog_versions(id) | SET NULL | SET NULL | — | inline | digest:3c2b6579aebbaa1c |
| skill_versions(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:cc2255e7823d78ec |
| skill_versions(skill_id) | installed_skills(id) | RESTRICT | RESTRICT | enforce | inline | digest:61118cd859f7a02e |
| skill_versions(skill_snapshot_id) | skill_snapshots(id) | RESTRICT | RESTRICT | — | inline | digest:ed678888608099aa |
| tool_call_task_action_tokens(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:550742be28d56b62 |
| tool_call_task_external_mcp(plugin_installation_id) | plugin_installations(id) | SET NULL | SET NULL | — | alter | constraint:fk_tool_call_task_external_mcp_installation |
| tool_call_task_external_mcp(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:e7e69fab11a9c08c |
| tool_call_task_output_chunks(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:de7fdb6b6ff4def0 |
| tool_call_task_response_commands(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:9690d75242a8b0d4 |
| tool_call_task_response_commands(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:0bfb75b5d0190e4b |
| tool_call_task_runtime_authorization(principal_scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_authorization_principal_scope_subject |
| tool_call_task_runtime_authorization(principal_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_authorization_principal_subject |
| tool_call_task_runtime_authorization(runtime_capability_id) | runtime_capabilities(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_auth_runtime_capability |
| tool_call_task_runtime_authorization(runtime_exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_auth_runtime_exposure |
| tool_call_task_runtime_authorization(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_auth_runtime |
| tool_call_task_runtime_authorization(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:c70e82d38241c60f |
| tool_call_task_runtime_tool(runtime_capability_id) | runtime_capabilities(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_tool_runtime_capability |
| tool_call_task_runtime_tool(runtime_exposure_id) | runtime_exposures(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_tool_runtime_exposure |
| tool_call_task_runtime_tool(runtime_id) | runtimes(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_tool_runtime |
| tool_call_task_runtime_tool(runtime_operation_id) | runtime_operations(id) | SET NULL | SET NULL | — | alter | constraint:fk_tool_call_task_runtime_tool_operation |
| tool_call_task_runtime_tool(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:4225911228cb0fb7 |
| tool_call_task_runtime_tool(tool_id) | runtime_tools(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_tool_tool |
| tool_call_task_runtime_tool(tool_revision_id) | runtime_tool_revisions(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_task_runtime_tool_tool_revision |
| tool_call_task_transport_projections(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:766e96e40489b6e6 |
| tool_call_task_transport_projections(task_id) | tool_call_tasks(id) | RESTRICT | RESTRICT | — | inline | digest:38f43c5809dc5b63 |
| tool_call_task_transport_projections(transport_message_link_id) | transport_message_links(id) | SET NULL | SET NULL | — | inline | digest:4afed1513bed74b6 |
| tool_call_task_transport_projections(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:ea5dc3151795a3a1 |
| tool_call_tasks(completion_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:81ad8055d66bb655 |
| tool_call_tasks(conversation_id) | conversations(id) | RESTRICT | RESTRICT | — | inline | digest:dc1eee424539cb61 |
| tool_call_tasks(conversation_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:5a9f726952bd093f |
| tool_call_tasks(principal_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_tool_call_tasks_principal_subject |
| tool_call_tasks(remote_agent_run_id) | remote_agent_runs(id) | RESTRICT | RESTRICT | — | inline | digest:f0387b02bf017134 |
| tool_call_tasks(requester_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | — | inline | digest:7422a1c4adab1026 |
| tool_call_tasks(resolved_by_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | — | inline | digest:575d00c4fe21a57c |
| tool_call_tasks(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:c5689c0b30d3d64d |
| tool_call_tasks(source_tool_call_id) | tool_calls(id) | SET NULL | SET NULL | — | inline | digest:770e5a0a02fe8430 |
| tool_call_tasks(target_participant_id) | conversation_participants(id) | RESTRICT | RESTRICT | — | inline | digest:93f1bf51fe72984f |
| tool_call_tasks(turn_id) | turns(id) | SET NULL | SET NULL | — | inline | digest:9dbcd3b844962be6 |
| tool_call_tasks(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | — | inline | digest:c0c0cdc70cfb0c48 |
| tool_calls(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:14a4e5f3a42bf810 |
| tool_calls(plugin_installation_id) | plugin_installations(id) | SET NULL | SET NULL | historical | alter | constraint:fk_tool_calls_plugin_installation |
| tool_calls(provider_step_id) | provider_steps(id) | SET NULL | SET NULL | — | inline | digest:16813e1ee5fcf33e |
| tool_calls(runtime_tool_id) | runtime_tools(id) | SET NULL | SET NULL | historical | alter | constraint:fk_tool_calls_runtime_tool |
| tool_calls(session_id) | sessions(id) | SET NULL | SET NULL | — | inline | digest:c925f567b0f559a2 |
| tool_calls(turn_id) | turns(id) | RESTRICT | RESTRICT | — | inline | digest:56aa0f1dd059fe2e |
| tool_execution_attempts(request_payload_blob_id) | payload_blobs(id) | SET NULL | SET NULL | — | inline | digest:dfd99b9339816012 |
| tool_execution_attempts(response_payload_blob_id) | payload_blobs(id) | SET NULL | SET NULL | — | inline | digest:c0f02b5889c32853 |
| tool_execution_attempts(tool_call_id) | tool_calls(id) | RESTRICT | RESTRICT | — | inline | digest:876836409cc07cef |
| tool_result_parts(tool_result_id) | tool_results(id) | RESTRICT | RESTRICT | — | inline | digest:0c8c86aaa1777605 |
| tool_results(attempt_id) | tool_execution_attempts(id) | SET NULL | SET NULL | — | inline | digest:90e28a377c7c46b7 |
| tool_results(tool_call_id) | tool_calls(id) | RESTRICT | RESTRICT | — | inline | digest:06c768ddfe408ece |
| transport_accounts(inbound_actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:1a9e3c8eae837aea |
| transport_accounts(owner_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:d80acf4d6967f0e9 |
| transport_accounts(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:ba04f71aa8ce1d0f |
| transport_addresses(transport_account_id,workspace_id) | transport_accounts(id,workspace_id) | RESTRICT | RESTRICT | none | table | digest:86a1f330fd23163b |
| transport_addresses(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:4e7e6c268b708b06 |
| transport_addresses(workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:87469eee78ac5b59 |
| transport_endpoints(transport_account_id) | transport_accounts(id) | RESTRICT | RESTRICT | enforce | inline | digest:d8fda2b5b2970dc9 |
| transport_message_links(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:41122da4cc4a8916 |
| transport_message_links(item_id) | conversation_items(id) | RESTRICT | RESTRICT | — | inline | digest:3f4d04a7cfcf937f |
| transport_message_links(transport_account_id) | transport_accounts(id) | RESTRICT | RESTRICT | enforce | inline | digest:60913d14269ee3fc |
| transport_message_links(transport_endpoint_id) | transport_endpoints(id) | RESTRICT | RESTRICT | — | inline | digest:e3fe5eff53346fa5 |
| transport_message_links(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:7f0b4c35beb6732e |
| turns(actor_id) | actors(id) | RESTRICT | RESTRICT | enforce | inline | digest:db7b662b49d85a28 |
| turns(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:c7b5c38b6d6f80e7 |
| turns(session_id) | sessions(id) | RESTRICT | RESTRICT | — | inline | digest:b54d79f6f40911de |
| turns(trigger_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:43581d70ca6c7636 |
| users(avatar_file_id) | file_assets(id) | SET NULL | SET NULL | historical | alter | constraint:users_avatar_file_id_fkey |
| workspace_access_bindings(assigned_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:77511418f798211e |
| workspace_access_bindings(revoked_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | alter-add-column | digest:b8946bc749f4c34e |
| workspace_access_bindings(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:f7b0145784d6c1d5 |
| workspace_capability_conversation_type_policies(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_workspace_capability_conversation_type_policies_subject |
| workspace_friend_entries(owner_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:e7ae4d6cf57a26a8 |
| workspace_friend_entries(peer_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_workspace_friend_entries_peer_subject |
| workspace_friend_entries(source_request_id) | workspace_friend_requests(id) | SET NULL | SET NULL | — | inline | digest:d230e925b9cf8754 |
| workspace_friend_entries(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:8745df8a756aa962 |
| workspace_friend_requests(requested_via_profile_id) | workspace_relationship_profiles(id) | SET NULL | SET NULL | — | inline | digest:c79ab3c51cfd9666 |
| workspace_friend_requests(requester_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | historical | inline | digest:ac4f18df5d1b7e6a |
| workspace_friend_requests(resolved_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:7778b6f71416a327 |
| workspace_friend_requests(target_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_workspace_friend_requests_target_subject |
| workspace_invites(created_by_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | historical | inline | digest:51371a55afaa6df8 |
| workspace_invites(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:0662d58675c86b8d |
| workspace_member_conversation_views(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:9141154d794111b2 |
| workspace_member_conversation_views(last_visible_item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:458108e1733062df |
| workspace_member_conversation_views(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:cb07f22f4d680491 |
| workspace_member_preferences(chief_actor_id) | actors(id) | SET NULL | SET NULL | historical | inline | digest:6e67de559358b3d6 |
| workspace_member_preferences(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:5b13b6dd146c387c |
| workspace_member_sync_events(conversation_id) | conversations(id) | RESTRICT | RESTRICT | enforce | inline | digest:a2de3d70a1cbc193 |
| workspace_member_sync_events(item_id) | conversation_items(id) | SET NULL | SET NULL | — | inline | digest:e0f62927a2f38a4d |
| workspace_member_sync_events(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:af4e802671d3ed50 |
| workspace_member_sync_events(workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | enforce | inline | digest:a16eba1dbc16b078 |
| workspace_members(user_id) | users(id) | RESTRICT | RESTRICT | enforce | inline | digest:564174ef6f6826bd |
| workspace_members(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:4ee84e3ce33cff7d |
| workspace_relationship_profiles(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:0b3195feb9d7fe77 |
| workspace_relationship_profiles(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | — | alter | constraint:fk_workspace_relationship_profiles_subject |
| workspace_relationship_profiles(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:0fae820b0d5d3fd9 |
| workspace_resource_grant_requests(grantee_scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | none | inline | digest:b261ba67fbaa7b15 |
| workspace_resource_grant_requests(grantee_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | none | inline | digest:d29f71e3d5f53fff |
| workspace_resource_grant_requests(requester_workspace_member_id) | workspace_members(id) | RESTRICT | RESTRICT | historical | inline | digest:6c4c66b6243a570e |
| workspace_resource_grant_requests(resolved_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:d6dd65b8980547d1 |
| workspace_resource_grant_requests(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:fdd2e5a003a4a2e0 |
| workspace_resource_grant_requests(workspace_resource_id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | inline | digest:c8fc704a81fa28e1 |
| workspace_resource_grants(created_by_workspace_member_id) | workspace_members(id) | SET NULL | SET NULL | historical | inline | digest:8f2ed1728a1b5e8c |
| workspace_resource_grants(scope_subject_id) | access_subjects(id) | RESTRICT | RESTRICT | none | inline | digest:5f2abb6226db944f |
| workspace_resource_grants(subject_id) | access_subjects(id) | RESTRICT | RESTRICT | none | inline | digest:81877d6de66ad795 |
| workspace_resource_grants(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:3ad5a69756a03688 |
| workspace_resource_grants(workspace_resource_id) | workspace_resources(id) | RESTRICT | RESTRICT | enforce | inline | digest:05dc1cc5ba6e8cd9 |
| workspace_resources(created_by_subject_id) | access_subjects(id) | NO ACTION | RESTRICT | — | alter | constraint:fk_workspace_resources_created_by_subject |
| workspace_resources(owner_subject_id) | access_subjects(id) | NO ACTION | RESTRICT | — | alter | constraint:fk_workspace_resources_owner_subject |
| workspace_resources(workspace_id) | workspaces(id) | RESTRICT | RESTRICT | enforce | inline | digest:2e0dc0754294bfe5 |
| workspaces(owner_id) | users(id) | RESTRICT | RESTRICT | enforce | inline | digest:98ec713652d94f52 |
