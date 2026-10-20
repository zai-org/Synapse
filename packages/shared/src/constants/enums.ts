export const INVITE_TRUST_LEVELS = ["admin", "member", "guest"] as const
export const WORKSPACE_TRUST_LEVELS = ["owner", ...INVITE_TRUST_LEVELS] as const
export const PLATFORM_ACCESS_KEY = {
  SUPER_ADMIN: "super_admin",
  WORKSPACE_ADMIN: "workspace_admin",
  MODEL_ADMIN: "model_admin",
  SUPPORT: "support",
} as const
export const PLATFORM_ACCESS_KEYS = [
  PLATFORM_ACCESS_KEY.SUPER_ADMIN,
  PLATFORM_ACCESS_KEY.WORKSPACE_ADMIN,
  PLATFORM_ACCESS_KEY.MODEL_ADMIN,
  PLATFORM_ACCESS_KEY.SUPPORT,
] as const
export const PLATFORM_ACCESS_SOURCE = {
  CONFIG: "config",
  MANUAL: "manual",
} as const
export const PLATFORM_ACCESS_SOURCES = [
  PLATFORM_ACCESS_SOURCE.CONFIG,
  PLATFORM_ACCESS_SOURCE.MANUAL,
] as const

export const WORKSPACE_ACCESS_KEYS = [
  "model_admin",
  "actor_admin",
  "remote_agent_admin",
  "skill_admin",
  "plugin_admin",
  "memory_admin",
  "device_admin",
  "conversation_admin",
  "automation_admin",
] as const

export const EVENT_TYPE = {
  WORK_ITEM_CREATED: "work_item.created",
  WORK_ITEM_UPDATED: "work_item.updated",
  WORK_ITEM_TRANSITIONED: "work_item.transitioned",
  MESSAGE_CREATED: "message.created",
  ACTOR_CREATED: "actor.created",
  ACTOR_UPDATED: "actor.updated",
  MEMORY_CREATED: "memory.created",
  ACTOR_THINKING: "actor.thinking",
  ACTOR_ACTION: "actor.action",
  CHAT_SYNC_EVENT: "chat.sync.event",
  RUNTIME_UPDATED: "runtime.updated",
  MCP_CONFIG_CHANGED: "mcp.config.changed",
  CHAT_TYPING: "chat.typing",
} as const
export const EVENT_TYPES = [
  EVENT_TYPE.WORK_ITEM_CREATED,
  EVENT_TYPE.WORK_ITEM_UPDATED,
  EVENT_TYPE.WORK_ITEM_TRANSITIONED,
  EVENT_TYPE.MESSAGE_CREATED,
  EVENT_TYPE.ACTOR_CREATED,
  EVENT_TYPE.ACTOR_UPDATED,
  EVENT_TYPE.MEMORY_CREATED,
  EVENT_TYPE.ACTOR_THINKING,
  EVENT_TYPE.ACTOR_ACTION,
  EVENT_TYPE.CHAT_SYNC_EVENT,
  EVENT_TYPE.RUNTIME_UPDATED,
  EVENT_TYPE.MCP_CONFIG_CHANGED,
  EVENT_TYPE.CHAT_TYPING,
] as const

export const RELATIONSHIP_PROFILE_SUBJECT_TYPE = {
  MEMBER: "workspace_member",
  ACTOR: "actor",
  REMOTE_AGENT: "remote_agent",
} as const
export const RELATIONSHIP_PROFILE_SUBJECT_TYPES = [
  RELATIONSHIP_PROFILE_SUBJECT_TYPE.MEMBER,
  RELATIONSHIP_PROFILE_SUBJECT_TYPE.ACTOR,
  RELATIONSHIP_PROFILE_SUBJECT_TYPE.REMOTE_AGENT,
] as const
export const RELATIONSHIP_APPROVAL_MODE = {
  AUTO: "auto",
  MANUAL: "manual",
} as const
export const RELATIONSHIP_APPROVAL_MODES = [
  RELATIONSHIP_APPROVAL_MODE.AUTO,
  RELATIONSHIP_APPROVAL_MODE.MANUAL,
] as const
export const RELATIONSHIP_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const
export const RELATIONSHIP_REQUEST_STATUSES = [
  RELATIONSHIP_REQUEST_STATUS.PENDING,
  RELATIONSHIP_REQUEST_STATUS.APPROVED,
  RELATIONSHIP_REQUEST_STATUS.REJECTED,
] as const
export const CONTACT_TARGET_TYPE = {
  MEMBER: "workspace_member",
  ACTOR: "actor",
  REMOTE_AGENT: "remote_agent",
} as const
export const CONTACT_TARGET_TYPES = [
  CONTACT_TARGET_TYPE.MEMBER,
  CONTACT_TARGET_TYPE.ACTOR,
  CONTACT_TARGET_TYPE.REMOTE_AGENT,
] as const
export const CONTACT_HUB_KIND = {
  WORKSPACE_ACTOR: "workspace-actor",
  WORKSPACE_REMOTE_AGENT: "workspace-remote-agent",
  WORKSPACE_MEMBER: "workspace-member",
  FRIEND_ACTOR: "friend-actor",
  FRIEND_REMOTE_AGENT: "friend-remote-agent",
  FRIEND_MEMBER: "friend-member",
} as const
export const CONTACT_HUB_KINDS = [
  CONTACT_HUB_KIND.WORKSPACE_ACTOR,
  CONTACT_HUB_KIND.WORKSPACE_REMOTE_AGENT,
  CONTACT_HUB_KIND.WORKSPACE_MEMBER,
  CONTACT_HUB_KIND.FRIEND_ACTOR,
  CONTACT_HUB_KIND.FRIEND_REMOTE_AGENT,
  CONTACT_HUB_KIND.FRIEND_MEMBER,
] as const
export const CONTACT_DIRECT_STATE = {
  EXISTING: "existing",
  AVAILABLE: "available",
  APPROVAL_REQUIRED: "approval_required",
  PENDING_APPROVAL: "pending_approval",
} as const
export const CONTACT_DIRECT_STATES = [
  CONTACT_DIRECT_STATE.EXISTING,
  CONTACT_DIRECT_STATE.AVAILABLE,
  CONTACT_DIRECT_STATE.APPROVAL_REQUIRED,
  CONTACT_DIRECT_STATE.PENDING_APPROVAL,
] as const
export const IDENTITY_SEARCH_OUTCOME = {
  EMPTY: "empty",
  INVALID: "invalid",
  SELF: "self",
  NOT_FOUND: "not_found",
  FOUND: "found",
} as const
export const IDENTITY_SEARCH_OUTCOMES = [
  IDENTITY_SEARCH_OUTCOME.EMPTY,
  IDENTITY_SEARCH_OUTCOME.INVALID,
  IDENTITY_SEARCH_OUTCOME.SELF,
  IDENTITY_SEARCH_OUTCOME.NOT_FOUND,
  IDENTITY_SEARCH_OUTCOME.FOUND,
] as const
export const IDENTITY_SEARCH_MATCH_STATE = {
  SAME_WORKSPACE_MEMBER: "same_workspace_member",
  FRIEND: "friend",
  PENDING_REQUEST: "pending_request",
  REQUESTABLE: "requestable",
  EXISTING: CONTACT_DIRECT_STATE.EXISTING,
  AVAILABLE: CONTACT_DIRECT_STATE.AVAILABLE,
  APPROVAL_REQUIRED: CONTACT_DIRECT_STATE.APPROVAL_REQUIRED,
  PENDING_APPROVAL: CONTACT_DIRECT_STATE.PENDING_APPROVAL,
} as const
export const IDENTITY_SEARCH_MATCH_STATES = [
  IDENTITY_SEARCH_MATCH_STATE.SAME_WORKSPACE_MEMBER,
  IDENTITY_SEARCH_MATCH_STATE.FRIEND,
  IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST,
  IDENTITY_SEARCH_MATCH_STATE.REQUESTABLE,
  IDENTITY_SEARCH_MATCH_STATE.EXISTING,
  IDENTITY_SEARCH_MATCH_STATE.AVAILABLE,
  IDENTITY_SEARCH_MATCH_STATE.APPROVAL_REQUIRED,
  IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL,
] as const
export const RELATIONSHIP_SCAN_OUTCOME = {
  SELF_SCAN: "self_scan",
  SAME_WORKSPACE_MEMBER: "same_workspace_member",
  FRIEND_ACTIVE: "friend_active",
  FRIEND_REQUEST_CREATED: "friend_request_created",
  FRIEND_REQUEST_PENDING: "friend_request_pending",
  ACTOR_ACCESS_GRANTED: "actor_access_granted",
  ACTOR_ACCESS_REQUEST_CREATED: "actor_access_request_created",
  ACTOR_ACCESS_PENDING: "actor_access_pending",
  REMOTE_AGENT_ACCESS_GRANTED: "remote_agent_access_granted",
  REMOTE_AGENT_ACCESS_REQUEST_CREATED: "remote_agent_access_request_created",
  REMOTE_AGENT_ACCESS_PENDING: "remote_agent_access_pending",
} as const
export const RELATIONSHIP_SCAN_OUTCOMES = [
  RELATIONSHIP_SCAN_OUTCOME.SELF_SCAN,
  RELATIONSHIP_SCAN_OUTCOME.SAME_WORKSPACE_MEMBER,
  RELATIONSHIP_SCAN_OUTCOME.FRIEND_ACTIVE,
  RELATIONSHIP_SCAN_OUTCOME.FRIEND_REQUEST_CREATED,
  RELATIONSHIP_SCAN_OUTCOME.FRIEND_REQUEST_PENDING,
  RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_GRANTED,
  RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_REQUEST_CREATED,
  RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_PENDING,
  RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_GRANTED,
  RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_REQUEST_CREATED,
  RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_PENDING,
] as const
export const DIRECT_CONVERSATION_OPEN_STATUS = {
  READY: "ready",
  PENDING_APPROVAL: "pending_approval",
} as const
export const DIRECT_CONVERSATION_OPEN_STATUSES = [
  DIRECT_CONVERSATION_OPEN_STATUS.READY,
  DIRECT_CONVERSATION_OPEN_STATUS.PENDING_APPROVAL,
] as const
export const CANONICAL_FILE_CATEGORIES = [
  "image",
  "audio",
  "video",
  "document",
] as const
export const FILE_STORAGE_BACKENDS = ["local_cas"] as const
export const FILE_ORIGIN_FAMILIES = [
  "user_upload",
  "actor_output",
  "tool_output",
  "model_output",
  "external_import",
  "package_import",
  "system_generated",
  "platform_asset",
] as const
export const FILE_ORIGIN_SYSTEMS = {
  WORKSPACE_WEB_UPLOAD: "workspace_web_upload",
  WORKSPACE_MOBILE_UPLOAD: "workspace_mobile_upload",
  ACTOR_TOOL_UPLOAD_FILE: "actor_tool_upload_file",
  MCP_TOOL_RESULT_INGEST: "mcp_tool_result_ingest",
  MCP_RESULT_NORMALIZER: "mcp_result_normalizer",
  ZHIPU_TEXT_TO_SPEECH: "zhipu_text_to_speech",
  ZHIPU_FILE_PARSER_SYNC: "zhipu_file_parser_sync",
  ZHIPU_IMAGE_GENERATION: "zhipu_image_generation",
  ZHIPU_LAYOUT_PARSING: "zhipu_layout_parsing",
  ANTHROPIC_RESPONSE_MEDIA_INGEST: "anthropic_response_media_ingest",
  OPENAI_RESPONSE_MEDIA_INGEST: "openai_response_media_ingest",
  GENERIC_MODEL_RESPONSE_MEDIA_INGEST: "generic_model_response_media_ingest",
  FEISHU_DOCS_DOWNLOAD_MEDIA: "feishu_docs_download_media",
  FEISHU_DRIVE_DOWNLOAD_FILE: "feishu_drive_download_file",
  QQ_INBOUND_MEDIA_INGEST: "qq_inbound_media_ingest",
  FEISHU_INBOUND_MEDIA_INGEST: "feishu_inbound_media_ingest",
  WEIXIN_INBOUND_MEDIA_INGEST: "weixin_inbound_media_ingest",
  DINGTALK_INBOUND_MEDIA_INGEST: "dingtalk_inbound_media_ingest",
  TELEGRAM_INBOUND_MEDIA_INGEST: "telegram_inbound_media_ingest",
  WHATSAPP_INBOUND_MEDIA_INGEST: "whatsapp_inbound_media_ingest",
  WHATSAPP_UNOFFICIAL_INBOUND_MEDIA_INGEST:
    "whatsapp_unofficial_inbound_media_ingest",
  SKILL_MIRROR_IMPORT: "skill_mirror_import",
  GENERATED_USER_AVATAR: "generated_user_avatar",
  GENERATED_OFFICIAL_ACTOR_AVATAR: "generated_official_actor_avatar",
  GENERATED_ACTOR_PIXEL_ART_AVATAR: "generated_actor_pixel_art_avatar",
  MARKETPLACE_SKILL_ICON_COPY: "marketplace_skill_icon_copy",
} as const
export const USER_UPLOAD_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.WORKSPACE_WEB_UPLOAD,
  FILE_ORIGIN_SYSTEMS.WORKSPACE_MOBILE_UPLOAD,
] as const
export const ACTOR_OUTPUT_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.ACTOR_TOOL_UPLOAD_FILE,
] as const
export const TOOL_OUTPUT_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.MCP_TOOL_RESULT_INGEST,
  FILE_ORIGIN_SYSTEMS.MCP_RESULT_NORMALIZER,
  FILE_ORIGIN_SYSTEMS.ZHIPU_TEXT_TO_SPEECH,
  FILE_ORIGIN_SYSTEMS.ZHIPU_FILE_PARSER_SYNC,
  FILE_ORIGIN_SYSTEMS.ZHIPU_IMAGE_GENERATION,
  FILE_ORIGIN_SYSTEMS.ZHIPU_LAYOUT_PARSING,
] as const
export const MODEL_OUTPUT_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.ANTHROPIC_RESPONSE_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.OPENAI_RESPONSE_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.GENERIC_MODEL_RESPONSE_MEDIA_INGEST,
] as const
export const EXTERNAL_IMPORT_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.FEISHU_DOCS_DOWNLOAD_MEDIA,
  FILE_ORIGIN_SYSTEMS.FEISHU_DRIVE_DOWNLOAD_FILE,
  FILE_ORIGIN_SYSTEMS.QQ_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.FEISHU_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.WEIXIN_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.DINGTALK_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.TELEGRAM_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.WHATSAPP_INBOUND_MEDIA_INGEST,
  FILE_ORIGIN_SYSTEMS.WHATSAPP_UNOFFICIAL_INBOUND_MEDIA_INGEST,
] as const
export const PACKAGE_IMPORT_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.SKILL_MIRROR_IMPORT,
] as const
export const SYSTEM_GENERATED_FILE_ORIGIN_SYSTEMS = [
  FILE_ORIGIN_SYSTEMS.GENERATED_USER_AVATAR,
  FILE_ORIGIN_SYSTEMS.GENERATED_OFFICIAL_ACTOR_AVATAR,
  FILE_ORIGIN_SYSTEMS.GENERATED_ACTOR_PIXEL_ART_AVATAR,
  FILE_ORIGIN_SYSTEMS.MARKETPLACE_SKILL_ICON_COPY,
] as const
export const FILE_PARSE_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const
export const FILE_PARSE_OUTPUT_KINDS = [
  "text",
  "structured_json",
  "derived_file",
] as const
export const CONVERSATION_KIND = {
  DIRECT: "direct",
  GROUP: "group",
} as const
export const CONVERSATION_KINDS = [
  CONVERSATION_KIND.DIRECT,
  CONVERSATION_KIND.GROUP,
] as const
export const CONVERSATION_STATUS = {
  ACTIVE: "active",
  COMPLETED: "completed",
} as const
export const CONVERSATION_STATUSES = [
  CONVERSATION_STATUS.ACTIVE,
  CONVERSATION_STATUS.COMPLETED,
] as const
export const CONVERSATION_PARTICIPANT_TYPE = {
  WORKSPACE_MEMBER: "workspace_member",
  ACTOR: "actor",
  REMOTE_AGENT: "remote_agent",
  EXTERNAL: "external",
} as const
export const CONVERSATION_PARTICIPANT_TYPES = [
  CONVERSATION_PARTICIPANT_TYPE.WORKSPACE_MEMBER,
  CONVERSATION_PARTICIPANT_TYPE.ACTOR,
  CONVERSATION_PARTICIPANT_TYPE.REMOTE_AGENT,
  CONVERSATION_PARTICIPANT_TYPE.EXTERNAL,
] as const
export const CONVERSATION_PARTICIPANT_STATE = {
  ACTIVE: "active",
  LEFT: "left",
  REMOVED: "removed",
} as const
export const CONVERSATION_PARTICIPANT_STATES = [
  CONVERSATION_PARTICIPANT_STATE.ACTIVE,
  CONVERSATION_PARTICIPANT_STATE.LEFT,
  CONVERSATION_PARTICIPANT_STATE.REMOVED,
] as const
export const CONVERSATION_PARTICIPANT_ROLE_KEY = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const
export const CONVERSATION_PARTICIPANT_ROLE_KEYS = [
  CONVERSATION_PARTICIPANT_ROLE_KEY.OWNER,
  CONVERSATION_PARTICIPANT_ROLE_KEY.ADMIN,
  CONVERSATION_PARTICIPANT_ROLE_KEY.MEMBER,
] as const
export const CHAT_PARTICIPANT_REMOVAL_STATE = {
  LEFT: CONVERSATION_PARTICIPANT_STATE.LEFT,
  REMOVED: CONVERSATION_PARTICIPANT_STATE.REMOVED,
} as const
export const CHAT_PARTICIPANT_REMOVAL_STATES = [
  CHAT_PARTICIPANT_REMOVAL_STATE.LEFT,
  CHAT_PARTICIPANT_REMOVAL_STATE.REMOVED,
] as const
export const CHAT_MEMBERSHIP_UPDATE_REASON = {
  KICKED: "kicked",
  LEFT: "left",
  ADDED: "added",
} as const
export const CHAT_MEMBERSHIP_UPDATE_REASONS = [
  CHAT_MEMBERSHIP_UPDATE_REASON.KICKED,
  CHAT_MEMBERSHIP_UPDATE_REASON.LEFT,
  CHAT_MEMBERSHIP_UPDATE_REASON.ADDED,
] as const

export const CHAT_TYPING_STATE = {
  STARTED: "started",
  STOPPED: "stopped",
} as const
export const CHAT_TYPING_STATES = [
  CHAT_TYPING_STATE.STARTED,
  CHAT_TYPING_STATE.STOPPED,
] as const
export type ChatTypingState = (typeof CHAT_TYPING_STATES)[number]

export const CONVERSATION_MESSAGE_TRANSPORT_DIRECTION = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const
export const CONVERSATION_MESSAGE_TRANSPORT_DIRECTIONS = [
  CONVERSATION_MESSAGE_TRANSPORT_DIRECTION.INBOUND,
  CONVERSATION_MESSAGE_TRANSPORT_DIRECTION.OUTBOUND,
] as const

export const PUSH_TOKEN_PLATFORM = {
  IOS: "ios",
  ANDROID: "android",
  WEB: "web",
} as const
export const PUSH_TOKEN_PLATFORMS = [
  PUSH_TOKEN_PLATFORM.IOS,
  PUSH_TOKEN_PLATFORM.ANDROID,
  PUSH_TOKEN_PLATFORM.WEB,
] as const
export type PushTokenPlatform = (typeof PUSH_TOKEN_PLATFORMS)[number]
export const CONVERSATION_ITEM_SCOPE = {
  SHARED: "shared",
  PRIVATE: "private",
} as const
export const CONVERSATION_ITEM_SCOPES = [
  CONVERSATION_ITEM_SCOPE.SHARED,
  CONVERSATION_ITEM_SCOPE.PRIVATE,
] as const
export const CONVERSATION_ITEM_SURFACE = {
  VISIBLE: "visible",
  INTERNAL: "internal",
} as const
export const CONVERSATION_ITEM_SURFACES = [
  CONVERSATION_ITEM_SURFACE.VISIBLE,
  CONVERSATION_ITEM_SURFACE.INTERNAL,
] as const
export const CONVERSATION_ITEM_TYPE = {
  MESSAGE: "message",
  EVENT: "event",
  SUMMARY: "summary",
  CONTROL: "control",
} as const
export const CONVERSATION_ITEM_TYPES = [
  CONVERSATION_ITEM_TYPE.MESSAGE,
  CONVERSATION_ITEM_TYPE.EVENT,
  CONVERSATION_ITEM_TYPE.SUMMARY,
  CONVERSATION_ITEM_TYPE.CONTROL,
] as const
export const CONVERSATION_ITEM_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
  TOOL: "tool",
} as const
export const CONVERSATION_ITEM_ROLES = [
  CONVERSATION_ITEM_ROLE.USER,
  CONVERSATION_ITEM_ROLE.ASSISTANT,
  CONVERSATION_ITEM_ROLE.SYSTEM,
  CONVERSATION_ITEM_ROLE.TOOL,
] as const
export const CONVERSATION_MESSAGE_SUBTYPE = {
  CHAT_MESSAGE: "chat.message",
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
  TOOL_RESULT: "tool_result",
  MODEL_ERROR_NOTICE: "model_error_notice",
} as const
export const CONVERSATION_MESSAGE_SUBTYPES = [
  CONVERSATION_MESSAGE_SUBTYPE.CHAT_MESSAGE,
  CONVERSATION_MESSAGE_SUBTYPE.USER,
  CONVERSATION_MESSAGE_SUBTYPE.ASSISTANT,
  CONVERSATION_MESSAGE_SUBTYPE.SYSTEM,
  CONVERSATION_MESSAGE_SUBTYPE.TOOL_RESULT,
  CONVERSATION_MESSAGE_SUBTYPE.MODEL_ERROR_NOTICE,
] as const
export const CONVERSATION_FEED_MESSAGE_TYPE = {
  ...CONVERSATION_MESSAGE_SUBTYPE,
  SUMMARY: "summary",
} as const
export const CONVERSATION_FEED_MESSAGE_TYPES = [
  ...CONVERSATION_MESSAGE_SUBTYPES,
  CONVERSATION_FEED_MESSAGE_TYPE.SUMMARY,
] as const
export const CONVERSATION_FEED_EVENT_TYPE = {
  PARTICIPANT_JOINED: "participant_joined",
  PARTICIPANT_KICKED: "participant_kicked",
  PARTICIPANT_LEFT: "participant_left",
  MEMORY_SAVED: "memory_saved",
  MEMORY_UPDATED: "memory_updated",
  ACTOR_RENAMED: "actor_renamed",
  ACTOR_AVATAR_CHANGED: "actor_avatar_changed",
  AUTOMATION_NOTICE: "automation_notice",
  TASK_REQUESTED: "task_requested",
  TASK_NOTICE: "task_notice",
} as const
export const CONVERSATION_FEED_EVENT_TYPES = [
  CONVERSATION_FEED_EVENT_TYPE.PARTICIPANT_JOINED,
  CONVERSATION_FEED_EVENT_TYPE.PARTICIPANT_KICKED,
  CONVERSATION_FEED_EVENT_TYPE.PARTICIPANT_LEFT,
  CONVERSATION_FEED_EVENT_TYPE.MEMORY_SAVED,
  CONVERSATION_FEED_EVENT_TYPE.MEMORY_UPDATED,
  CONVERSATION_FEED_EVENT_TYPE.ACTOR_RENAMED,
  CONVERSATION_FEED_EVENT_TYPE.ACTOR_AVATAR_CHANGED,
  CONVERSATION_FEED_EVENT_TYPE.AUTOMATION_NOTICE,
  CONVERSATION_FEED_EVENT_TYPE.TASK_REQUESTED,
  CONVERSATION_FEED_EVENT_TYPE.TASK_NOTICE,
] as const
export const CONVERSATION_FEED_ITEM_SUBTYPES = [
  ...CONVERSATION_FEED_MESSAGE_TYPES,
  ...CONVERSATION_FEED_EVENT_TYPES,
] as const
export const CONVERSATION_REPLY_REF_SPECIAL_SUBTYPE = {
  UNAVAILABLE: "unavailable",
} as const
export const CONVERSATION_REPLY_REF_SPECIAL_SUBTYPES = [
  CONVERSATION_REPLY_REF_SPECIAL_SUBTYPE.UNAVAILABLE,
] as const
export const CONVERSATION_REPLY_REF_SUBTYPES = [
  ...CONVERSATION_FEED_ITEM_SUBTYPES,
  ...CONVERSATION_REPLY_REF_SPECIAL_SUBTYPES,
] as const
export const CONVERSATION_EVENT_TIMELINE_POLICY = {
  NONE: "none",
  ALL_MEMBERS: "all_members",
  USERS_ONLY: "users_only",
  ACTORS_ONLY: "actors_only",
  TARGETED_MEMBERS: "targeted_members",
} as const
export const CONVERSATION_EVENT_TIMELINE_POLICIES = [
  CONVERSATION_EVENT_TIMELINE_POLICY.NONE,
  CONVERSATION_EVENT_TIMELINE_POLICY.ALL_MEMBERS,
  CONVERSATION_EVENT_TIMELINE_POLICY.USERS_ONLY,
  CONVERSATION_EVENT_TIMELINE_POLICY.ACTORS_ONLY,
  CONVERSATION_EVENT_TIMELINE_POLICY.TARGETED_MEMBERS,
] as const
export const CONVERSATION_EVENT_CONTEXT_POLICY = {
  NONE: "none",
  SHARED: "shared",
  ACTOR_PRIVATE: "actor_private",
  TARGETED_MEMBERS: "targeted_members",
} as const
export const CONVERSATION_EVENT_CONTEXT_POLICIES = [
  CONVERSATION_EVENT_CONTEXT_POLICY.NONE,
  CONVERSATION_EVENT_CONTEXT_POLICY.SHARED,
  CONVERSATION_EVENT_CONTEXT_POLICY.ACTOR_PRIVATE,
  CONVERSATION_EVENT_CONTEXT_POLICY.TARGETED_MEMBERS,
] as const
export const CONVERSATION_TYPE_KEYS = [
  "direct",
  "group",
  "im_direct",
  "im_group",
] as const
export const CONVERSATION_TYPE_MASK_BITS = {
  direct: 1 << 0,
  group: 1 << 1,
  im_direct: 1 << 2,
  im_group: 1 << 3,
} as const
export const CONVERSATION_TYPE_MASK_PRESETS = {
  ALL:
    CONVERSATION_TYPE_MASK_BITS.direct |
    CONVERSATION_TYPE_MASK_BITS.group |
    CONVERSATION_TYPE_MASK_BITS.im_direct |
    CONVERSATION_TYPE_MASK_BITS.im_group,
  // Native (in-app, non-IM) conversations only — replaces the old INTERNAL_ONLY.
  NATIVE_ONLY:
    CONVERSATION_TYPE_MASK_BITS.direct | CONVERSATION_TYPE_MASK_BITS.group,
  // IM-bridged conversations only — replaces the old EXTERNAL_ONLY / VIRTUAL_ONLY.
  IM_ONLY:
    CONVERSATION_TYPE_MASK_BITS.im_direct |
    CONVERSATION_TYPE_MASK_BITS.im_group,
  // 1:1 conversations across both native and IM.
  DIRECT_ONLY:
    CONVERSATION_TYPE_MASK_BITS.direct | CONVERSATION_TYPE_MASK_BITS.im_direct,
  // Group conversations across both native and IM.
  GROUP_ONLY:
    CONVERSATION_TYPE_MASK_BITS.group | CONVERSATION_TYPE_MASK_BITS.im_group,
  // Native (in-app) group conversations only — excludes IM groups. Used by
  // capabilities that must not act on IM-bridged group chats (e.g. invite_actor,
  // which must not pull more actors into a third-party IM group).
  NATIVE_GROUP_ONLY: CONVERSATION_TYPE_MASK_BITS.group,
} as const
export const DEFAULT_CONVERSATION_TYPE_MASK = CONVERSATION_TYPE_MASK_PRESETS.ALL
export const CAPABILITY_CONVERSATION_TYPE_POLICY_RESOURCE_FAMILIES = [
  "plugin_installation",
  "installed_skill",
  "runtime_capability",
] as const
export const ACCESS_TARGET_TYPES = [
  "workspace",
  "workspace_member",
  "conversation",
  "actor",
  "remote_agent",
] as const
export const CAPABILITY_ACCESS_TARGET_TYPES = [
  "workspace",
  "workspace_member",
  "conversation",
  "actor",
  "remote_agent",
] as const
export const REALTIME_ASR_AUDIO_FORMAT = {
  PCM: "pcm",
  OGG: "ogg",
} as const
export const REALTIME_ASR_AUDIO_FORMATS = [
  REALTIME_ASR_AUDIO_FORMAT.PCM,
  REALTIME_ASR_AUDIO_FORMAT.OGG,
] as const
export const REALTIME_ASR_AUDIO_CODEC = {
  RAW: "raw",
  OPUS: "opus",
} as const
export const REALTIME_ASR_AUDIO_CODECS = [
  REALTIME_ASR_AUDIO_CODEC.RAW,
  REALTIME_ASR_AUDIO_CODEC.OPUS,
] as const

export const RUNTIME_CAPABILITY_ACCESS_SUBJECT_KIND = {
  WORKSPACE: "workspace",
  ACTOR: "actor",
  REMOTE_AGENT: "remote_agent",
  CONVERSATION: "conversation",
} as const
export const RUNTIME_CAPABILITY_ACCESS_SUBJECT_KINDS = [
  RUNTIME_CAPABILITY_ACCESS_SUBJECT_KIND.WORKSPACE,
  RUNTIME_CAPABILITY_ACCESS_SUBJECT_KIND.ACTOR,
  RUNTIME_CAPABILITY_ACCESS_SUBJECT_KIND.REMOTE_AGENT,
  RUNTIME_CAPABILITY_ACCESS_SUBJECT_KIND.CONVERSATION,
] as const
export const RUNTIME_CAPABILITY_ACCESS_SCOPE_KIND = {
  CONVERSATION: "conversation",
} as const
export const RUNTIME_CAPABILITY_ACCESS_SCOPE_KINDS = [
  RUNTIME_CAPABILITY_ACCESS_SCOPE_KIND.CONVERSATION,
] as const
export const REUSE_SCOPES = [
  "turn",
  "session",
  "workspace",
  "conversation",
  "actor",
] as const
export const CONVERSATION_GRANT_PERMISSIONS = [
  "send",
  "moderate",
  "manage",
  "manage_members",
  "attach_resources",
] as const
export const TASK_REQUEST_KIND = {
  USER_INPUT: "user_input",
  PLAN_APPROVAL: "plan_approval",
  RUNTIME_AUTHORIZATION: "runtime_authorization",
} as const
export const TASK_REQUEST_KINDS = [
  TASK_REQUEST_KIND.USER_INPUT,
  TASK_REQUEST_KIND.PLAN_APPROVAL,
  TASK_REQUEST_KIND.RUNTIME_AUTHORIZATION,
] as const
export const TARGETED_TASK_REQUEST_KINDS = [
  TASK_REQUEST_KIND.USER_INPUT,
  TASK_REQUEST_KIND.PLAN_APPROVAL,
] as const
export const TASK_LIFECYCLE_STATUSES = [
  "submitted",
  "working",
  "input_required",
  "auth_required",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const
export const TASK_OUTCOMES = [
  "answered",
  "approved",
  "revision_requested",
  "granted",
  "denied",
  "ok",
  "tool_error",
] as const
export const TASK_INPUT_QUESTION_TYPES = [
  "single_select",
  "multi_select",
  "text",
] as const
export const TASK_DECISIONS = ["approve", "reject"] as const
export const PLAN_APPROVAL_DECISIONS = ["approve", "revise"] as const
export const MODEL_GROUP_ROUTING_STRATEGY = {
  WEIGHTED_RANDOM: "weighted_random",
  PRIORITY_FAILOVER: "priority_failover",
} as const
export const MODEL_GROUP_ROUTING_STRATEGIES = [
  MODEL_GROUP_ROUTING_STRATEGY.WEIGHTED_RANDOM,
  MODEL_GROUP_ROUTING_STRATEGY.PRIORITY_FAILOVER,
] as const
export const MODEL_GROUP_OWNER_TYPE = {
  PLATFORM: "platform",
  WORKSPACE: "workspace",
  WORKSPACE_MEMBER: "workspace_member",
} as const
export const MODEL_GROUP_OWNER_TYPES = [
  MODEL_GROUP_OWNER_TYPE.PLATFORM,
  MODEL_GROUP_OWNER_TYPE.WORKSPACE,
  MODEL_GROUP_OWNER_TYPE.WORKSPACE_MEMBER,
] as const
export const MODEL_GROUP_GRANT_SCOPE = {
  PLATFORM: "platform",
  WORKSPACE: "workspace",
  WORKSPACE_MEMBER: "workspace_member",
  ACTOR: "actor",
} as const
export const MODEL_GROUP_GRANT_SCOPES = [
  MODEL_GROUP_GRANT_SCOPE.PLATFORM,
  MODEL_GROUP_GRANT_SCOPE.WORKSPACE,
  MODEL_GROUP_GRANT_SCOPE.WORKSPACE_MEMBER,
  MODEL_GROUP_GRANT_SCOPE.ACTOR,
] as const
export const MODEL_GROUP_GRANT_STATUS = {
  ACTIVE: "active",
  REVOKED: "revoked",
} as const
export const MODEL_GROUP_GRANT_STATUSES = [
  MODEL_GROUP_GRANT_STATUS.ACTIVE,
  MODEL_GROUP_GRANT_STATUS.REVOKED,
] as const
export const MODEL_API_STYLE = {
  CHAT: "chat",
  RESPONSES: "responses",
} as const
export const MODEL_API_STYLES = [
  MODEL_API_STYLE.CHAT,
  MODEL_API_STYLE.RESPONSES,
] as const
export const MODEL_SERVER_TOOL = {
  WEB_SEARCH: "web_search",
  WEB_FETCH: "web_fetch",
} as const
export const MODEL_SERVER_TOOLS = [
  MODEL_SERVER_TOOL.WEB_SEARCH,
  MODEL_SERVER_TOOL.WEB_FETCH,
] as const

export const REMOTE_AGENT_RUNTIME_KIND = {
  CLAUDE_CODE: "claude_code",
  CODEX: "codex",
  PI: "pi",
  OPENCODE: "opencode",
} as const
export const REMOTE_AGENT_RUNTIME_KINDS = [
  REMOTE_AGENT_RUNTIME_KIND.CLAUDE_CODE,
  REMOTE_AGENT_RUNTIME_KIND.CODEX,
  REMOTE_AGENT_RUNTIME_KIND.PI,
  REMOTE_AGENT_RUNTIME_KIND.OPENCODE,
] as const
/** Display labels for remote-agent runtime kinds — lookup, not ternaries. */
export const REMOTE_AGENT_RUNTIME_LABELS: Record<
  (typeof REMOTE_AGENT_RUNTIME_KINDS)[number],
  string
> = {
  [REMOTE_AGENT_RUNTIME_KIND.CLAUDE_CODE]: "Claude Code",
  [REMOTE_AGENT_RUNTIME_KIND.CODEX]: "Codex CLI",
  [REMOTE_AGENT_RUNTIME_KIND.PI]: "pi",
  [REMOTE_AGENT_RUNTIME_KIND.OPENCODE]: "opencode",
}
export const REMOTE_AGENT_RUNTIME_STATE = {
  OFFLINE: "offline",
  IDLE: "idle",
  RUNNING: "running",
  WAITING_USER_INPUT: "waiting_user_input",
  PLAN_DRAFTING: "plan_drafting",
  WAITING_PLAN_APPROVAL: "waiting_plan_approval",
  ERROR: "error",
} as const
export const REMOTE_AGENT_RUNTIME_STATES = [
  REMOTE_AGENT_RUNTIME_STATE.OFFLINE,
  REMOTE_AGENT_RUNTIME_STATE.IDLE,
  REMOTE_AGENT_RUNTIME_STATE.RUNNING,
  REMOTE_AGENT_RUNTIME_STATE.WAITING_USER_INPUT,
  REMOTE_AGENT_RUNTIME_STATE.PLAN_DRAFTING,
  REMOTE_AGENT_RUNTIME_STATE.WAITING_PLAN_APPROVAL,
  REMOTE_AGENT_RUNTIME_STATE.ERROR,
] as const
export const REMOTE_AGENT_RUNTIME_CATALOG_STATUS = {
  AVAILABLE: "available",
  MISSING_BINARY: "missing_binary",
  BROKEN_PATH: "broken_path",
  UNSUPPORTED_PLATFORM: "unsupported_platform",
  RUNTIME_ERROR: "runtime_error",
} as const
export const REMOTE_AGENT_RUNTIME_CATALOG_STATUSES = [
  REMOTE_AGENT_RUNTIME_CATALOG_STATUS.AVAILABLE,
  REMOTE_AGENT_RUNTIME_CATALOG_STATUS.MISSING_BINARY,
  REMOTE_AGENT_RUNTIME_CATALOG_STATUS.BROKEN_PATH,
  REMOTE_AGENT_RUNTIME_CATALOG_STATUS.UNSUPPORTED_PLATFORM,
  REMOTE_AGENT_RUNTIME_CATALOG_STATUS.RUNTIME_ERROR,
] as const
export const REMOTE_AGENT_BINDING_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ERROR: "error",
} as const
export const REMOTE_AGENT_BINDING_STATUSES = [
  REMOTE_AGENT_BINDING_STATUS.ACTIVE,
  REMOTE_AGENT_BINDING_STATUS.DISABLED,
  REMOTE_AGENT_BINDING_STATUS.ERROR,
] as const
export const REMOTE_AGENT_MACHINE_TRUST_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  REVOKED: "revoked",
  BLOCKED: "blocked",
} as const
export const REMOTE_AGENT_MACHINE_TRUST_STATUSES = [
  REMOTE_AGENT_MACHINE_TRUST_STATUS.PENDING,
  REMOTE_AGENT_MACHINE_TRUST_STATUS.ACTIVE,
  REMOTE_AGENT_MACHINE_TRUST_STATUS.REVOKED,
  REMOTE_AGENT_MACHINE_TRUST_STATUS.BLOCKED,
] as const
export const REMOTE_AGENT_MACHINE_LIFECYCLE_STATE = {
  ONLINE: "online",
  OFFLINE: "offline",
} as const
export const REMOTE_AGENT_MACHINE_LIFECYCLE_STATES = [
  REMOTE_AGENT_MACHINE_LIFECYCLE_STATE.ONLINE,
  REMOTE_AGENT_MACHINE_LIFECYCLE_STATE.OFFLINE,
] as const

export const ACTOR_ROLES = [
  "secretary",
  "manager",
  "specialist",
  "reviewer",
  "archivist",
  "receptionist",
  "assistant",
] as const

export const ACTOR_DOC_VISIBILITIES = [
  "always",
  "direct_only",
  "multi_member_only",
  "internal_only",
] as const

// Single source of truth for actor-doc keys. CoreActorDocKey / ActorDocKey
// (types/index.ts) derive from these, and the actor-doc schemas z.enum() over
// them — so the schema's `key` field and the hand-written union can't drift.
export const CORE_ACTOR_DOC_KEYS = [
  "identity_card",
  "public_persona",
  "soul",
  "self_narrative",
  "origin_story",
  "relationship_with_user",
  "relationship_with_team",
  "representation_guidelines",
  "social_protocol",
  "role_charter",
  "mission",
  "work_doctrine",
  "limitations_and_escalation",
  "quirks_and_signatures",
  "routines",
  "conversation_examples",
] as const
export const ACTOR_DOC_KEYS = [...CORE_ACTOR_DOC_KEYS, "custom"] as const

export const SKILL_SOURCE_TYPES = ["github", "clawhub"] as const
export const SKILL_MIRROR_SYNC_STATUSES = [
  "pending",
  "synced",
  "error",
] as const
export const SKILL_FRONTMATTER_EFFORTS = [
  "low",
  "medium",
  "high",
  "max",
] as const

export const MEMORY_SPACE_TYPES = [
  "workspace_shared",
  "conversation_shared",
  "actor_private",
  "participant_private",
  "user_private",
] as const

// Deprecated alias kept for in-repo transition.
export const MEMORY_SCOPES = MEMORY_SPACE_TYPES

export const MEMORY_CATEGORIES = [
  "fact",
  "preference",
  "decision",
  "relationship",
  "procedure",
  "artifact",
  "summary",
] as const

export const MEMORY_ITEM_STATES = ["active", "superseded", "archived"] as const

// Deprecated alias kept for in-repo transition.
export const MEMORY_STATUSES = MEMORY_ITEM_STATES

// Durable-only memory in v1. Extraction/ephemeral lifecycle is deferred.
export const MEMORY_STABILITIES = ["durable"] as const
export const MEMORY_INDEX_STATUSES = [
  "lexical_ready",
  "ready",
  "failed",
] as const
export const MEMORY_RECALL_TYPES = [
  "bootstrap",
  "turn_recall",
  "manual_search",
] as const

export const SESSION_STATUSES = [
  "idle",
  "queued",
  "running",
  "blocked",
  "closed",
] as const
export const ACTOR_RUNTIME_HEALTH = {
  OK: "ok",
  ERROR: "error",
} as const
export const ACTOR_RUNTIME_HEALTHS = [
  ACTOR_RUNTIME_HEALTH.OK,
  ACTOR_RUNTIME_HEALTH.ERROR,
] as const
export const SESSION_COLLABORATION_MODES = [
  "default",
  "plan_drafting",
  "plan_awaiting_approval",
] as const
export const PLAN_CHECKLIST_STEP_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const
export const SESSION_TRIGGERS = [
  "user_message",
  "actor_message",
  "automation",
  "system_interrupt",
  "retry",
] as const

export const SESSION_INTERRUPT_TYPES = ["remote_control_terminated"] as const
export const SESSION_WAKEUP_SOURCE_TYPES = [
  "user_message",
  "actor_message",
  "automation",
  "system_interrupt",
  "retry",
] as const
export const SESSION_WAKEUP_SOURCE_PARTICIPANT_TYPES = [
  "workspace_member",
  "actor",
  "remote_agent",
  "external",
  "system",
] as const

export const SESSION_WAKEUP_STATUSES = [
  "pending",
  "attached",
  "processed",
  "dropped",
] as const
export const SEND_TO_INTENTS = ["reply", "request"] as const

export const TRANSPORT_ACCOUNT_OWNER_SCOPES = [
  "workspace",
  "workspace_member",
] as const
export const TRANSPORT_ACCOUNT_INBOUND_ACTOR_MODES = [
  "none",
  "specified_actor",
  "follow_owner_chief_actor",
] as const

export const TRANSPORT_CONVERSATION_INBOUND_ACTOR_MODES = [
  "inherit_account",
  "none",
  "specified_actor",
] as const

export const TRANSPORT_KINDS = [
  "feishu",
  "weixin",
  "wecom",
  "dingtalk",
  "qq",
  "telegram",
  "whatsapp",
  "whatsapp_unofficial",
] as const
export const TRANSPORT_CONNECTION_MODES = [
  "webhook",
  "long_connection",
] as const
export const TRANSPORT_ENDPOINT_TYPES = ["direct", "group"] as const
export const TRANSPORT_ACCOUNT_STATUSES = [
  "active",
  "disabled",
  "error",
] as const
export const WEIXIN_QR_LOGIN_STATUS = {
  WAITING: "waiting",
  SCANNED: "scanned",
  // The phone shows a numeric pairing code the user must type back to continue.
  NEED_VERIFYCODE: "need_verifycode",
  CONFIRMED: "confirmed",
  EXPIRED: "expired",
  ERROR: "error",
} as const
export const WEIXIN_QR_LOGIN_STATUSES = [
  WEIXIN_QR_LOGIN_STATUS.WAITING,
  WEIXIN_QR_LOGIN_STATUS.SCANNED,
  WEIXIN_QR_LOGIN_STATUS.NEED_VERIFYCODE,
  WEIXIN_QR_LOGIN_STATUS.CONFIRMED,
  WEIXIN_QR_LOGIN_STATUS.EXPIRED,
  WEIXIN_QR_LOGIN_STATUS.ERROR,
] as const
export const DINGTALK_DEVICE_FLOW_STATUS = {
  WAITING: "waiting",
  SUCCESS: "success",
  FAIL: "fail",
  EXPIRED: "expired",
} as const
export const DINGTALK_DEVICE_FLOW_STATUSES = [
  DINGTALK_DEVICE_FLOW_STATUS.WAITING,
  DINGTALK_DEVICE_FLOW_STATUS.SUCCESS,
  DINGTALK_DEVICE_FLOW_STATUS.FAIL,
  DINGTALK_DEVICE_FLOW_STATUS.EXPIRED,
] as const
export const TRANSPORT_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const

// Hard cap for WeCom custom websocket URLs. Kept in shared because both the
// app request DTO and the API connector validator must enforce the same value.
export const WECOM_BASE_WS_URL_MAX_BYTES = 255

export const PLUGIN_AUTH_SESSION_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  EXPIRED: "expired",
  CONSUMED: "consumed",
} as const
export const PLUGIN_AUTH_SESSION_STATUSES = [
  PLUGIN_AUTH_SESSION_STATUS.PENDING,
  PLUGIN_AUTH_SESSION_STATUS.COMPLETED,
  PLUGIN_AUTH_SESSION_STATUS.FAILED,
  PLUGIN_AUTH_SESSION_STATUS.EXPIRED,
  PLUGIN_AUTH_SESSION_STATUS.CONSUMED,
] as const

export const PLUGIN_AUTH_SESSION_PHASE = {
  AWAITING_START: "awaiting_start",
  AWAITING_EXTERNAL_INPUT: "awaiting_external_input",
  AWAITING_CALLBACK: "awaiting_callback",
  PENDING_SCAN: "pending_scan",
  PENDING_CONFIRM: "pending_confirm",
  FINALIZING: "finalizing",
} as const
export const PLUGIN_AUTH_SESSION_PHASES = [
  PLUGIN_AUTH_SESSION_PHASE.AWAITING_START,
  PLUGIN_AUTH_SESSION_PHASE.AWAITING_EXTERNAL_INPUT,
  PLUGIN_AUTH_SESSION_PHASE.AWAITING_CALLBACK,
  PLUGIN_AUTH_SESSION_PHASE.PENDING_SCAN,
  PLUGIN_AUTH_SESSION_PHASE.PENDING_CONFIRM,
  PLUGIN_AUTH_SESSION_PHASE.FINALIZING,
] as const

export const PLUGIN_AUTH_CONNECTION_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const
export const PLUGIN_AUTH_CONNECTION_STATUSES = [
  PLUGIN_AUTH_CONNECTION_STATUS.ACTIVE,
  PLUGIN_AUTH_CONNECTION_STATUS.EXPIRED,
  PLUGIN_AUTH_CONNECTION_STATUS.REVOKED,
] as const

export const TASK_NOTICE_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const

// ============ Runtime authorization + device access (PR #20) ============
// Replaces the legacy RELAY_AUTHORIZATION_* / RELAY_DEVICE_* / RELAY_EXPOSURE_*
// constants. All consumers were migrated to the RUNTIME_* / DEVICE_* names; the
// relay_* tables and the Go relay binaries were deleted at the same time.

// subject-scope-refactor: RUNTIME_AUTHORIZATION_GRANT_SCOPE / RUNTIME_AUTHORIZATION_GRANT_SCOPES
// constants dropped at cutover. Scope is now expressed via subject_id +
// scope_subject_id on runtime_authorization_grants; the wire-stable
// `grant_scope` envelope field carries the subject kind; conversation scoping
// is represented separately by scope_subject_id.

export const RUNTIME_AUTHORIZATION_PRESETS = [
  "once",
  "actor",
  "conversation",
  "remote_agent",
  "workspace",
] as const
export const RUNTIME_AUTHORIZATION_GRANT_RETENTIONS = [
  "consume_once",
  "until_revoked",
] as const
export const RUNTIME_AUTHORIZATION_GRANT_STATUSES = [
  "active",
  "consumed",
  "revoked",
  "superseded",
] as const
export const RUNTIME_AUTHORIZATION_REQUEST_MODES = [
  "background",
  "blocking",
] as const
export const DEVICE_ACCESS_DENIAL_KINDS = [
  "permission_denied",
  "runtime_constraint",
  "invalid_request",
] as const
export const DEVICE_ACCESS_DENIAL_RESOLUTIONS = [
  "server_grant",
  "local_setting",
  "unresolvable",
] as const
export const RUNTIME_AUTHORIZATION_CAPABILITIES = [
  "filesystem",
  "cua",
  "browser",
  "commandline",
] as const
export const RUNTIME_AUTHORIZATION_FILESYSTEM_ACCESSES = [
  "read",
  "write",
] as const
export const RUNTIME_AUTHORIZATION_CUA_ACCESSES = ["read", "write"] as const
export const RUNTIME_AUTHORIZATION_BROWSER_ACTIONS = ["read", "write"] as const
export const RUNTIME_AUTHORIZATION_BROWSER_SCOPE_TYPES = [
  "host",
  "domain",
  "origin",
] as const
// v3.1: Re-export the operation enum from device-protocol so both packages stay
// in lockstep. Import from the enum-only subpath so the shared root does not
// pull in the browser tool map/descriptors.
export {
  BROWSER_OPERATION_REQUIRED_ACTION,
  RUNTIME_AUTHORIZATION_BROWSER_OPERATIONS,
  browserActionCoversOperations,
  type BrowserOperation,
  type BrowserOperationRequiredAction,
} from "@synapse/device-protocol/enums"
export const RUNTIME_AUTHORIZATION_COMMAND_EXECUTORS = [
  "bash",
  "powershell",
  "exec_file",
  // Sandbox confinement: "any command inside a bwrap jail (no network, root =
  // the mounted file space)". Isolation is the boundary, so this variant carries
  // no command/argv matcher — a sandbox grant authorizes every command whose cwd
  // resolves inside the sandbox mount points. Linux-only; fail-closed elsewhere.
  "sandbox",
] as const
export const RUNTIME_AUTHORIZATION_COMMAND_MATCH_TYPES = [
  "exact",
  "prefix",
  "tool",
  "argv_exact",
  "argv_prefix",
  "argv_exact_preapproved",
  "program_only",
] as const

// The fixed mount points a sandbox device-runtime exposes (the materialized
// file-space roots). A commandline:sandbox grant only covers a command whose
// working directory resolves within one of these. Kept here (not device-runtime)
// so the shared matcher and the API projection agree on the boundary.
export const SANDBOX_MOUNT_POINTS = [
  "/conversation",
  "/actor",
  "/actor-conversation",
] as const

export const AUTOMATION_TRIGGER_KINDS = ["schedule", "event"] as const
export const AUTOMATION_RULE_CATEGORY = {
  SCHEDULE: "schedule",
  EVENT_SUBSCRIPTION: "event_subscription",
} as const
export const AUTOMATION_RULE_CATEGORIES = [
  AUTOMATION_RULE_CATEGORY.SCHEDULE,
  AUTOMATION_RULE_CATEGORY.EVENT_SUBSCRIPTION,
] as const
export const AUTOMATION_TRIGGER_SOURCE_KINDS = [
  "clock",
  "device",
  "webhook",
  "internal",
  "integration",
] as const

export const AUTOMATION_SCHEDULE_KINDS = ["cron", "at", "interval"] as const
export const AUTOMATION_COMPLETION_STATUSES = ["completed", "archived"] as const
export const AUTOMATION_TARGET_POLICIES = [
  "all_members",
  "specified_members",
] as const
export const AUTOMATION_RULE_STATUSES = [
  "active",
  "paused",
  "error",
  "archived",
  "completed",
  "expired",
] as const
export const AUTOMATION_EXECUTION_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const
export const AUTOMATION_EXECUTION_STATUSES = [
  AUTOMATION_EXECUTION_STATUS.PENDING,
  AUTOMATION_EXECUTION_STATUS.RUNNING,
  AUTOMATION_EXECUTION_STATUS.COMPLETED,
  AUTOMATION_EXECUTION_STATUS.FAILED,
  AUTOMATION_EXECUTION_STATUS.SKIPPED,
] as const
export const AUTOMATION_WEBHOOK_ENDPOINT_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ARCHIVED: "archived",
} as const
export const AUTOMATION_WEBHOOK_ENDPOINT_STATUSES = [
  AUTOMATION_WEBHOOK_ENDPOINT_STATUS.ACTIVE,
  AUTOMATION_WEBHOOK_ENDPOINT_STATUS.DISABLED,
  AUTOMATION_WEBHOOK_ENDPOINT_STATUS.ARCHIVED,
] as const

export const AUTOMATION_INTEGRATION_PROVIDERS = ["github", "gitlab"] as const
export const AUTOMATION_INTEGRATION_INGRESS_KINDS = [
  "webhook",
  "polling",
] as const
export const AUTOMATION_INTEGRATION_TARGET_KINDS = [
  "repository",
  "project",
] as const
export const AUTOMATION_EVENT_SOURCE_PROVIDER_KINDS = [
  "device",
  "webhook",
  "internal",
  "integration",
] as const

export const AUTOMATION_EVENT_SOURCE_STATUSES = [
  "active",
  "deprecated",
  "disabled",
  "archived",
] as const

export const MARKETPLACE_ITEM_KIND = {
  PLUGIN: "plugin",
  SKILL: "skill",
  ACTOR: "actor",
  MODEL: "model",
} as const
export const MARKETPLACE_ITEM_KINDS = [
  MARKETPLACE_ITEM_KIND.PLUGIN,
  MARKETPLACE_ITEM_KIND.SKILL,
  MARKETPLACE_ITEM_KIND.ACTOR,
  MARKETPLACE_ITEM_KIND.MODEL,
] as const
export const MARKETPLACE_SOURCE_TYPE = {
  BUILTIN: "builtin",
  OFFICIAL: "official",
  WORKSPACE_UPLOAD: "workspace_upload",
  USER_UPLOAD: "user_upload",
} as const
export const MARKETPLACE_SOURCE_TYPES = [
  MARKETPLACE_SOURCE_TYPE.BUILTIN,
  MARKETPLACE_SOURCE_TYPE.OFFICIAL,
  MARKETPLACE_SOURCE_TYPE.WORKSPACE_UPLOAD,
  MARKETPLACE_SOURCE_TYPE.USER_UPLOAD,
] as const
export const MARKETPLACE_SYNC_MODE = {
  NOTIFY: "notify",
  MANUAL_MERGE: "manual_merge",
  FOLLOW_UPSTREAM: "follow_upstream",
  DETACHED: "detached",
} as const
export const MARKETPLACE_SYNC_MODES = [
  MARKETPLACE_SYNC_MODE.NOTIFY,
  MARKETPLACE_SYNC_MODE.MANUAL_MERGE,
  MARKETPLACE_SYNC_MODE.FOLLOW_UPSTREAM,
  MARKETPLACE_SYNC_MODE.DETACHED,
] as const
export const MARKETPLACE_VERSION_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  DEPRECATED: "deprecated",
  ARCHIVED: "archived",
} as const
export const MARKETPLACE_VERSION_STATUSES = [
  MARKETPLACE_VERSION_STATUS.DRAFT,
  MARKETPLACE_VERSION_STATUS.ACTIVE,
  MARKETPLACE_VERSION_STATUS.DEPRECATED,
  MARKETPLACE_VERSION_STATUS.ARCHIVED,
] as const
export const MARKETPLACE_ASSET_KIND = {
  SKILL_MARKDOWN: "skill_markdown",
  REFERENCE_MARKDOWN: "reference_markdown",
  SCRIPT: "script",
  JSON: "json",
  TEXT: "text",
  BINARY: "binary",
} as const
export const MARKETPLACE_ASSET_KINDS = [
  MARKETPLACE_ASSET_KIND.SKILL_MARKDOWN,
  MARKETPLACE_ASSET_KIND.REFERENCE_MARKDOWN,
  MARKETPLACE_ASSET_KIND.SCRIPT,
  MARKETPLACE_ASSET_KIND.JSON,
  MARKETPLACE_ASSET_KIND.TEXT,
  MARKETPLACE_ASSET_KIND.BINARY,
] as const
export const ACTOR_PACKAGE_DEPENDENCY_KIND = {
  REQUIRED: "required",
  RECOMMENDED: "recommended",
} as const
export const ACTOR_PACKAGE_DEPENDENCY_KINDS = [
  ACTOR_PACKAGE_DEPENDENCY_KIND.REQUIRED,
  ACTOR_PACKAGE_DEPENDENCY_KIND.RECOMMENDED,
] as const
export const ACTOR_PACKAGE_TARGET_KIND = {
  PLUGIN: MARKETPLACE_ITEM_KIND.PLUGIN,
  SKILL: MARKETPLACE_ITEM_KIND.SKILL,
} as const
export const ACTOR_PACKAGE_TARGET_KINDS = [
  ACTOR_PACKAGE_TARGET_KIND.PLUGIN,
  ACTOR_PACKAGE_TARGET_KIND.SKILL,
] as const
export const ACTOR_UPDATE_SOURCE_TYPE = {
  WORKSPACE_MEMBER: "workspace_member",
  ACTOR: "actor",
  SYSTEM: "system",
  SYNC: "sync",
} as const
export const ACTOR_UPDATE_SOURCE_TYPES = [
  ACTOR_UPDATE_SOURCE_TYPE.WORKSPACE_MEMBER,
  ACTOR_UPDATE_SOURCE_TYPE.ACTOR,
  ACTOR_UPDATE_SOURCE_TYPE.SYSTEM,
  ACTOR_UPDATE_SOURCE_TYPE.SYNC,
] as const
export const ACTOR_VERSION_CHANGED_FIELD = {
  DISPLAY_NAME: "displayName",
  ROLE: "role",
  TITLE: "title",
  PARENT_ID: "parentId",
  CAN_REPRESENT_USER: "canRepresentUser",
  SPECIALTIES: "specialties",
  CONFIG: "config",
} as const
export const ACTOR_VERSION_CHANGED_FIELDS = [
  ACTOR_VERSION_CHANGED_FIELD.DISPLAY_NAME,
  ACTOR_VERSION_CHANGED_FIELD.ROLE,
  ACTOR_VERSION_CHANGED_FIELD.TITLE,
  ACTOR_VERSION_CHANGED_FIELD.PARENT_ID,
  ACTOR_VERSION_CHANGED_FIELD.CAN_REPRESENT_USER,
  ACTOR_VERSION_CHANGED_FIELD.SPECIALTIES,
  ACTOR_VERSION_CHANGED_FIELD.CONFIG,
] as const
export const ACTOR_DOC_CHANGED_FIELD = {
  TITLE: "title",
  VISIBILITY: "visibility",
  PRIORITY: "priority",
  CONTENT: "content",
} as const
export const ACTOR_DOC_CHANGED_FIELDS = [
  ACTOR_DOC_CHANGED_FIELD.TITLE,
  ACTOR_DOC_CHANGED_FIELD.VISIBILITY,
  ACTOR_DOC_CHANGED_FIELD.PRIORITY,
  ACTOR_DOC_CHANGED_FIELD.CONTENT,
] as const
export const ACTOR_VERSION_DOC_CHANGE_TYPE = {
  ADDED: "added",
  UPDATED: "updated",
  REMOVED: "removed",
} as const
export const ACTOR_VERSION_DOC_CHANGE_TYPES = [
  ACTOR_VERSION_DOC_CHANGE_TYPE.ADDED,
  ACTOR_VERSION_DOC_CHANGE_TYPE.UPDATED,
  ACTOR_VERSION_DOC_CHANGE_TYPE.REMOVED,
] as const
export const ACTOR_PACKAGE_LINK_STATUS = {
  UP_TO_DATE: "up_to_date",
  UPDATE_AVAILABLE: "update_available",
  DIVERGED: "diverged",
  UPDATE_AVAILABLE_WITH_LOCAL_CHANGES: "update_available_with_local_changes",
  DETACHED: "detached",
} as const
export const ACTOR_PACKAGE_LINK_STATUSES = [
  ACTOR_PACKAGE_LINK_STATUS.UP_TO_DATE,
  ACTOR_PACKAGE_LINK_STATUS.UPDATE_AVAILABLE,
  ACTOR_PACKAGE_LINK_STATUS.DIVERGED,
  ACTOR_PACKAGE_LINK_STATUS.UPDATE_AVAILABLE_WITH_LOCAL_CHANGES,
  ACTOR_PACKAGE_LINK_STATUS.DETACHED,
] as const
export const ACTOR_PACKAGE_SYNC_MODE = {
  NOTIFY: MARKETPLACE_SYNC_MODE.NOTIFY,
  MANUAL_MERGE: MARKETPLACE_SYNC_MODE.MANUAL_MERGE,
} as const
export const ACTOR_PACKAGE_SYNC_MODES = [
  ACTOR_PACKAGE_SYNC_MODE.NOTIFY,
  ACTOR_PACKAGE_SYNC_MODE.MANUAL_MERGE,
] as const

export const PLUGIN_INSTALL_ACTION_KIND = {
  AUTH_START: "auth_start",
  EXTERNAL_LINK: "external_link",
  NOOP: "noop",
} as const
export const PLUGIN_INSTALL_ACTION_KINDS = [
  PLUGIN_INSTALL_ACTION_KIND.AUTH_START,
  PLUGIN_INSTALL_ACTION_KIND.EXTERNAL_LINK,
  PLUGIN_INSTALL_ACTION_KIND.NOOP,
] as const
export const PLUGIN_AUTH_CHALLENGE_KIND = {
  REDIRECT: "redirect",
  QR_CODE: "qr_code",
  NONE: "none",
} as const
export const PLUGIN_AUTH_CHALLENGE_KINDS = [
  PLUGIN_AUTH_CHALLENGE_KIND.REDIRECT,
  PLUGIN_AUTH_CHALLENGE_KIND.QR_CODE,
  PLUGIN_AUTH_CHALLENGE_KIND.NONE,
] as const
export const PLUGIN_AUTH_CHALLENGE_OPEN_MODE = {
  POPUP: "popup",
  REPLACE: "replace",
} as const
export const PLUGIN_AUTH_CHALLENGE_OPEN_MODES = [
  PLUGIN_AUTH_CHALLENGE_OPEN_MODE.POPUP,
  PLUGIN_AUTH_CHALLENGE_OPEN_MODE.REPLACE,
] as const

export const MARKETPLACE_LINEAGE_KIND = {
  INSTALLED_COPY: "installed_copy",
  FORK: "fork",
  SHARE: "share",
} as const
export const MARKETPLACE_LINEAGE_KINDS = [
  MARKETPLACE_LINEAGE_KIND.INSTALLED_COPY,
  MARKETPLACE_LINEAGE_KIND.FORK,
  MARKETPLACE_LINEAGE_KIND.SHARE,
] as const
export const MARKETPLACE_REQUIREMENT_KIND = {
  REQUIRED: "required",
  RECOMMENDED: "recommended",
  OPTIONAL: "optional",
  CONFLICTS_WITH: "conflicts_with",
} as const
export const MARKETPLACE_REQUIREMENT_KINDS = [
  MARKETPLACE_REQUIREMENT_KIND.REQUIRED,
  MARKETPLACE_REQUIREMENT_KIND.RECOMMENDED,
  MARKETPLACE_REQUIREMENT_KIND.OPTIONAL,
  MARKETPLACE_REQUIREMENT_KIND.CONFLICTS_WITH,
] as const
export const MARKETPLACE_REQUIREMENT_TARGET_KIND = {
  PACKAGE: "package",
  TAG: "tag",
} as const
export const MARKETPLACE_REQUIREMENT_TARGET_KINDS = [
  MARKETPLACE_REQUIREMENT_TARGET_KIND.PACKAGE,
  MARKETPLACE_REQUIREMENT_TARGET_KIND.TAG,
] as const
export const MARKETPLACE_REQUIREMENT_STATUS = {
  SATISFIED: "satisfied",
  MISSING_REQUIRED: "missing_required",
  MISSING_RECOMMENDED: "missing_recommended",
  SCOPE_MISMATCH: "scope_mismatch",
  CONFIG_INCOMPLETE: "config_incomplete",
} as const
export const MARKETPLACE_REQUIREMENT_STATUSES = [
  MARKETPLACE_REQUIREMENT_STATUS.SATISFIED,
  MARKETPLACE_REQUIREMENT_STATUS.MISSING_REQUIRED,
  MARKETPLACE_REQUIREMENT_STATUS.MISSING_RECOMMENDED,
  MARKETPLACE_REQUIREMENT_STATUS.SCOPE_MISMATCH,
  MARKETPLACE_REQUIREMENT_STATUS.CONFIG_INCOMPLETE,
] as const

export const PLUGIN_CONFIG_FIELD_TYPE = {
  TEXT: "text",
  TEXTAREA: "textarea",
  NUMBER: "number",
  BOOLEAN: "boolean",
  SELECT: "select",
  MULTISELECT: "multiselect",
  SECRET: "secret",
  AUTH_CONNECTION: "auth_connection",
  FILE: "file",
} as const
export const PLUGIN_CONFIG_FIELD_TYPES = [
  PLUGIN_CONFIG_FIELD_TYPE.TEXT,
  PLUGIN_CONFIG_FIELD_TYPE.TEXTAREA,
  PLUGIN_CONFIG_FIELD_TYPE.NUMBER,
  PLUGIN_CONFIG_FIELD_TYPE.BOOLEAN,
  PLUGIN_CONFIG_FIELD_TYPE.SELECT,
  PLUGIN_CONFIG_FIELD_TYPE.MULTISELECT,
  PLUGIN_CONFIG_FIELD_TYPE.SECRET,
  PLUGIN_CONFIG_FIELD_TYPE.AUTH_CONNECTION,
  PLUGIN_CONFIG_FIELD_TYPE.FILE,
] as const
export const PLUGIN_INSTALL_STEP_KIND = {
  FORM: "form",
  AUTH: "auth",
  CHECK: "check",
  CONFIRM: "confirm",
  REUSE_SCOPE: "reuse_scope",
  INTEGRATION_EVENTS: "integration_events",
} as const
export const PLUGIN_INSTALL_STEP_KINDS = [
  PLUGIN_INSTALL_STEP_KIND.FORM,
  PLUGIN_INSTALL_STEP_KIND.AUTH,
  PLUGIN_INSTALL_STEP_KIND.CHECK,
  PLUGIN_INSTALL_STEP_KIND.CONFIRM,
  PLUGIN_INSTALL_STEP_KIND.REUSE_SCOPE,
  PLUGIN_INSTALL_STEP_KIND.INTEGRATION_EVENTS,
] as const
export const PLUGIN_INSTALL_STEP_SCOPE = {
  WORKSPACE: "workspace",
  PLUGIN: "plugin",
} as const
export const PLUGIN_INSTALL_STEP_SCOPES = [
  PLUGIN_INSTALL_STEP_SCOPE.WORKSPACE,
  PLUGIN_INSTALL_STEP_SCOPE.PLUGIN,
] as const
export const PLUGIN_AUTH_VALUE_SOURCE_KIND = {
  CONFIG: "config",
  ENV: "env",
  LITERAL: "literal",
  DERIVED: "derived",
} as const
export const PLUGIN_AUTH_VALUE_SOURCE_KINDS = [
  PLUGIN_AUTH_VALUE_SOURCE_KIND.CONFIG,
  PLUGIN_AUTH_VALUE_SOURCE_KIND.ENV,
  PLUGIN_AUTH_VALUE_SOURCE_KIND.LITERAL,
  PLUGIN_AUTH_VALUE_SOURCE_KIND.DERIVED,
] as const
export const PLUGIN_AUTH_DERIVED_VALUE_NAME = {
  APP_BASE_URL: "app_base_url",
  OAUTH_CALLBACK_URL: "oauth_callback_url",
} as const
export const PLUGIN_AUTH_DERIVED_VALUE_NAMES = [
  PLUGIN_AUTH_DERIVED_VALUE_NAME.APP_BASE_URL,
  PLUGIN_AUTH_DERIVED_VALUE_NAME.OAUTH_CALLBACK_URL,
] as const
export const PLUGIN_AUTH_BINDING_DRIVER_KIND = {
  OAUTH2_AUTHORIZATION_CODE_PKCE: "oauth2_authorization_code_pkce",
  MIJIA_QR_LOGIN: "mijia_qr_login",
  FEISHU_CLI_SETUP: "feishu_cli_setup",
} as const
export const PLUGIN_AUTH_BINDING_DRIVER_KINDS = [
  PLUGIN_AUTH_BINDING_DRIVER_KIND.OAUTH2_AUTHORIZATION_CODE_PKCE,
  PLUGIN_AUTH_BINDING_DRIVER_KIND.MIJIA_QR_LOGIN,
  PLUGIN_AUTH_BINDING_DRIVER_KIND.FEISHU_CLI_SETUP,
] as const
export const MCP_VALIDATION_RULE_KIND = {
  REQUIRED: "required",
  PATTERN: "pattern",
  URL: "url",
  MIN_LENGTH: "min_length",
  MAX_LENGTH: "max_length",
  PREFIX: "prefix",
  ENUM: "enum",
} as const
export const MCP_VALIDATION_RULE_KINDS = [
  MCP_VALIDATION_RULE_KIND.REQUIRED,
  MCP_VALIDATION_RULE_KIND.PATTERN,
  MCP_VALIDATION_RULE_KIND.URL,
  MCP_VALIDATION_RULE_KIND.MIN_LENGTH,
  MCP_VALIDATION_RULE_KIND.MAX_LENGTH,
  MCP_VALIDATION_RULE_KIND.PREFIX,
  MCP_VALIDATION_RULE_KIND.ENUM,
] as const
export const PLUGIN_INSTALLATION_MODE = {
  MANUAL: "manual",
  SEEDED: "seeded",
  PACKAGE_REQUIRED: "package_required",
  PACKAGE_RECOMMENDED: "package_recommended",
} as const
export const PLUGIN_INSTALLATION_MODES = [
  PLUGIN_INSTALLATION_MODE.MANUAL,
  PLUGIN_INSTALLATION_MODE.SEEDED,
  PLUGIN_INSTALLATION_MODE.PACKAGE_REQUIRED,
  PLUGIN_INSTALLATION_MODE.PACKAGE_RECOMMENDED,
] as const
export const PLUGIN_INSTALLATION_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ERROR: "error",
  ARCHIVED: "archived",
} as const
export const PLUGIN_INSTALLATION_STATUSES = [
  PLUGIN_INSTALLATION_STATUS.ACTIVE,
  PLUGIN_INSTALLATION_STATUS.DISABLED,
  PLUGIN_INSTALLATION_STATUS.ERROR,
  PLUGIN_INSTALLATION_STATUS.ARCHIVED,
] as const

// ============ v3 device-runtime aliases (PR #16) ============
// PR #16 of the device-runtime refactor introduces device-shaped names that
// are now the only ones. PR #20 finally dropped the legacy RELAY_* aliases.

export const DEVICE_KINDS = [
  "desktop_computer",
  "laptop_computer",
  "mobile_phone",
  "tablet",
  "server",
  "virtual_machine",
  "custom",
] as const
export const DEVICE_TRUST_STATUSES_V3 = [
  "pending",
  "trusted",
  "revoked",
] as const
export const RUNTIME_EXPOSURE_RUNTIME_STATUSES = [
  "discovered",
  "healthy",
  "degraded",
  "failed",
  "quarantined",
  "offline",
] as const
export const RUNTIME_EXPOSURE_TRANSPORTS = [
  "builtin",
  "stdio",
  "http",
  "sse",
  "custom",
] as const

// Plugin transport tiers. Three distinct, non-overlapping sets so each
// consumer references the one that matches its semantics:
//  - MCP_SERVER_TRANSPORTS: transports the runtime instance-manager can
//    actually start (in-process builtin, stdio child, remote http/sse). No
//    device exposure transports and no "filesystem".
//  - PLUGIN_SPEC_TRANSPORTS: the values stored in the DB catalog spec column
//    (plugin_package_version_specs.transport).
//  - PLUGIN_TRANSPORTS: the full application-level union — adds "filesystem".
export const MCP_SERVER_TRANSPORTS = [
  "builtin",
  "stdio",
  "http",
  "sse",
] as const
export const PLUGIN_SPEC_TRANSPORTS = [
  "builtin",
  "stdio",
  "http",
  "sse",
] as const
export const PLUGIN_TRANSPORTS = [
  "builtin",
  "stdio",
  "http",
  "sse",
  "filesystem",
] as const

// ============================================================================
// Tool-result origin kinds (runtime tuple; the `ToolResultOriginKind` type is
// derived from this in types/index.ts). Migrated here from types/index.ts so
// that the types barrel stays type-only — see
// docs/architecture-boundary-refactor-master-plan.md §2.2.1.
// ============================================================================
export const TOOL_RESULT_ORIGIN_KINDS = [
  "system",
  "plugin",
  "runtime",
  "provider_native",
  "model_response",
] as const

// ============================================================================
// Enum runtime guards (migrated from types/index.ts §2.2.1). They live next to
// their backing tuples; the narrowing types are derived locally from the same
// tuples (canonical source), and re-exported from types/index.ts for the
// existing `@synapse/shared` / `@synapse/shared/types` consumers.
// ============================================================================

export type TransportKind = (typeof TRANSPORT_KINDS)[number]
export type TaskRequestKind = (typeof TASK_REQUEST_KINDS)[number]
export type TargetedTaskRequestKind =
  (typeof TARGETED_TASK_REQUEST_KINDS)[number]

/**
 * Runtime guard for `TransportKind`. Use instead of hard-coding
 * `value === "feishu" || value === "weixin"` chains in dispatch sites —
 * those drift out of sync when new transports land.
 */
export function isTransportKind(value: unknown): value is TransportKind {
  return (
    typeof value === "string" &&
    (TRANSPORT_KINDS as readonly string[]).includes(value)
  )
}

/**
 * Static fallback label for a `TransportKind`. Intentionally NOT
 * exhaustiveness-checked: adding a new transport must not require
 * editing this file. The authoritative display name is on
 * `TransportConnectorCapability.displayName`; this helper only fires
 * when the metadata provider hasn't mounted yet (client) or no
 * connector is registered (server-side prose).
 */
export function describeTransportKind(kind: TransportKind): string {
  switch (kind) {
    case "feishu":
      return "Feishu"
    case "weixin":
      return "WeChat"
    case "wecom":
      return "WeCom"
    default:
      return String(kind)
  }
}

export function isTaskRequestKind(value: unknown): value is TaskRequestKind {
  return (
    typeof value === "string" &&
    (TASK_REQUEST_KINDS as readonly string[]).includes(value)
  )
}

export function isTargetedTaskRequestKind(
  value: unknown
): value is TargetedTaskRequestKind {
  return (
    typeof value === "string" &&
    (TARGETED_TASK_REQUEST_KINDS as readonly string[]).includes(value)
  )
}
