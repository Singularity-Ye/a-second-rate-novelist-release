SELECT jsonb_build_object(
  'accounts', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "accounts" AS row_value),
    '[]'::jsonb
  ),
  'story_intake_sessions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "story_intake_sessions" AS row_value),
    '[]'::jsonb
  ),
  'story_proposals', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "story_proposals" AS row_value),
    '[]'::jsonb
  ),
  'story_workspaces', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "story_workspaces" AS row_value),
    '[]'::jsonb
  ),
  'app_state_snapshots', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.state_key) FROM "app_state_snapshots" AS row_value),
    '[]'::jsonb
  ),
  'vnext_principals', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "vnext_principals" AS row_value),
    '[]'::jsonb
  ),
  'vnext_experience_sessions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "vnext_experience_sessions" AS row_value),
    '[]'::jsonb
  ),
  'vnext_compliance_sessions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM "vnext_compliance_sessions" AS row_value),
    '[]'::jsonb
  )
)::text;
