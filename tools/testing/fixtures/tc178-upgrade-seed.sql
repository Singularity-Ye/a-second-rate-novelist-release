INSERT INTO "accounts" (
  "id",
  "account_token",
  "account_status",
  "primary_channel",
  "accepted_policy_version",
  "created_at",
  "updated_at"
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'tc178-upgrade-account',
  'active',
  'h5',
  'tc178-policy-v1',
  '2026-07-17T00:00:00Z',
  '2026-07-17T00:00:00Z'
);

INSERT INTO "story_intake_sessions" (
  "id",
  "account_id",
  "entry_surface",
  "intake_mode",
  "brief_payload",
  "status",
  "selected_proposal_id",
  "client_request_id",
  "created_at",
  "updated_at"
) VALUES (
  '22222222-2222-4222-8222-222222222221',
  '11111111-1111-4111-8111-111111111111',
  'tc178-upgrade',
  'conversation',
  '{"genre":"mystery","tone":"quiet"}'::jsonb,
  'proposal_ready',
  NULL,
  'tc178-upgrade-request',
  '2026-07-17T00:01:00Z',
  '2026-07-17T00:01:00Z'
);

-- This row deliberately relies on the historical JSONB default. The
-- reconciliation must preserve the materialized value while removing the default.
INSERT INTO "story_intake_sessions" (
  "id",
  "account_id",
  "entry_surface",
  "intake_mode",
  "status",
  "selected_proposal_id",
  "client_request_id",
  "created_at",
  "updated_at"
) VALUES (
  '22222222-2222-4222-8222-222222222223',
  '11111111-1111-4111-8111-111111111111',
  'tc178-default',
  'conversation',
  'collecting',
  NULL,
  'tc178-default-request',
  '2026-07-17T00:01:30Z',
  '2026-07-17T00:01:30Z'
);

INSERT INTO "story_proposals" (
  "id",
  "session_id",
  "proposal_no",
  "title",
  "summary",
  "payload",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222221',
  1,
  '夜雨来信',
  '代表性升级数据',
  '{"openingPromise":"一页真稿"}'::jsonb,
  'ready',
  '2026-07-17T00:02:00Z',
  '2026-07-17T00:02:00Z'
);

INSERT INTO "story_proposals" (
  "id",
  "session_id",
  "proposal_no",
  "title",
  "summary",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '33333333-3333-4333-8333-333333333334',
  '22222222-2222-4222-8222-222222222223',
  1,
  '默认载荷',
  '验证历史 default 已物化',
  'ready',
  '2026-07-17T00:02:30Z',
  '2026-07-17T00:02:30Z'
);

INSERT INTO "story_workspaces" (
  "id",
  "account_id",
  "title",
  "keywords",
  "workspace_status",
  "entry_surface",
  "intake_mode",
  "privacy_scope",
  "commission_brief",
  "current_chapter_id",
  "created_at",
  "updated_at",
  "updated_by"
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '升级中的故事',
  '["雨夜","来信"]'::jsonb,
  'active',
  'tc178-upgrade',
  'conversation',
  'private',
  '{"promise":"preserve-me"}'::jsonb,
  NULL,
  '2026-07-17T00:03:00Z',
  '2026-07-17T00:03:00Z',
  'tc178-gate'
);

INSERT INTO "story_workspaces" (
  "id",
  "account_id",
  "title",
  "workspace_status",
  "entry_surface",
  "intake_mode",
  "privacy_scope",
  "commission_brief",
  "current_chapter_id",
  "created_at",
  "updated_at",
  "updated_by"
) VALUES (
  '44444444-4444-4444-8444-444444444445',
  '11111111-1111-4111-8111-111111111111',
  '升级中的故事',
  'active',
  'tc178-default',
  'conversation',
  'private',
  NULL,
  NULL,
  '2026-07-17T00:03:30Z',
  '2026-07-17T00:03:30Z',
  'tc178-gate'
);

INSERT INTO "app_state_snapshots" (
  "state_key",
  "schema_version",
  "state_version",
  "payload",
  "updated_at"
) VALUES (
  'tc178-upgrade-sentinel',
  7,
  11,
  '{"preserve":true}'::jsonb,
  '2026-07-17T00:04:00Z'
);

INSERT INTO "vnext_principals" (
  "id",
  "kind",
  "created_at",
  "updated_at"
) VALUES (
  '55555555-5555-4555-8555-555555555555',
  'guest',
  '2026-07-17T00:05:00Z',
  '2026-07-17T00:05:00Z'
);

INSERT INTO "vnext_experience_sessions" (
  "id",
  "principal_id",
  "cookie_token_hash",
  "client_request_id",
  "bootstrap_recovery_secret_hash",
  "projection_version_id",
  "surface",
  "auth_state",
  "age_mode",
  "ai_identity_acknowledged_at",
  "guest_expires_at",
  "expires_at",
  "revoked_at",
  "last_seen_at",
  "created_at",
  "updated_at"
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  repeat('a', 64),
  '77777777-7777-4777-8777-777777777777',
  repeat('b', 64),
  '88888888-8888-4888-8888-888888888888',
  'vnext',
  'guest_active',
  'pending',
  '2026-07-17T00:05:00Z',
  '2026-07-18T00:05:00Z',
  '2026-07-19T00:05:00Z',
  NULL,
  '2026-07-17T00:05:00Z',
  '2026-07-17T00:05:00Z',
  '2026-07-17T00:05:00Z'
);

INSERT INTO "vnext_compliance_sessions" (
  "id",
  "owner_principal_id",
  "experience_session_id",
  "audience_mode",
  "input_policy",
  "admission_policy_version",
  "ai_identity_notice_version",
  "ai_identity_acknowledged_at",
  "service_terms_version",
  "service_terms_accepted_at",
  "privacy_notice_version",
  "privacy_notice_acknowledged_at",
  "age_verification_status",
  "age_verification_ref",
  "safety_contact_ref",
  "continuous_use_started_at",
  "last_duration_reminder_at",
  "status",
  "version",
  "processing_basis_refs",
  "consent_refs",
  "safety_case_refs",
  "audit_refs",
  "created_at",
  "updated_at"
) VALUES (
  '99999999-9999-4999-8999-999999999999',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  'internal',
  'synthetic_only',
  'tc178-admission-v1',
  'tc178-ai-v1',
  '2026-07-17T00:05:00Z',
  'tc178-terms-v1',
  '2026-07-17T00:05:00Z',
  'tc178-privacy-v1',
  '2026-07-17T00:05:00Z',
  'pending',
  NULL,
  NULL,
  '2026-07-17T00:05:00Z',
  NULL,
  'eligible',
  1,
  '["tc178-processing"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["tc178-audit"]'::jsonb,
  '2026-07-17T00:05:00Z',
  '2026-07-17T00:05:00Z'
);
