DO $$
DECLARE
  matching_fk_count INTEGER;
  matching_index_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "story_intake_sessions"
    WHERE "id" = '22222222-2222-4222-8222-222222222221'
      AND "brief_payload" = '{"genre":"mystery","tone":"quiet"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'TC178 upgrade lost story_intake_sessions data';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "story_proposals"
    WHERE "id" = '33333333-3333-4333-8333-333333333333'
      AND "payload" = '{"openingPromise":"一页真稿"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'TC178 upgrade lost story_proposals data';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "story_workspaces"
    WHERE "id" = '44444444-4444-4444-8444-444444444444'
      AND "keywords" = '["雨夜","来信"]'::jsonb
      AND "commission_brief" = '{"promise":"preserve-me"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'TC178 upgrade lost story_workspaces data';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "story_intake_sessions"
    WHERE "id" = '22222222-2222-4222-8222-222222222223'
      AND "brief_payload" = '{}'::jsonb
  ) OR NOT EXISTS (
    SELECT 1
    FROM "story_proposals"
    WHERE "id" = '33333333-3333-4333-8333-333333333334'
      AND "payload" = '{}'::jsonb
  ) OR NOT EXISTS (
    SELECT 1
    FROM "story_workspaces"
    WHERE "id" = '44444444-4444-4444-8444-444444444445'
      AND "keywords" = '[]'::jsonb
  ) THEN
    RAISE EXCEPTION 'TC178 upgrade lost materialized legacy default values';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "app_state_snapshots"
    WHERE "state_key" = 'tc178-upgrade-sentinel'
      AND "schema_version" = 7
      AND "state_version" = 11
      AND "payload" = '{"preserve":true}'::jsonb
  ) OR NOT EXISTS (
    SELECT 1
    FROM "vnext_principals"
    WHERE "id" = '55555555-5555-4555-8555-555555555555'
  ) OR NOT EXISTS (
    SELECT 1
    FROM "vnext_experience_sessions"
    WHERE "id" = '66666666-6666-4666-8666-666666666666'
      AND "principal_id" = '55555555-5555-4555-8555-555555555555'
  ) OR NOT EXISTS (
    SELECT 1
    FROM "vnext_compliance_sessions"
    WHERE "id" = '99999999-9999-4999-8999-999999999999'
      AND "owner_principal_id" = '55555555-5555-4555-8555-555555555555'
      AND "experience_session_id" = '66666666-6666-4666-8666-666666666666'
  ) THEN
    RAISE EXCEPTION 'TC178 upgrade changed unrelated or vNext sentinel data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'story_intake_sessions' AND column_name = 'brief_payload') OR
        (table_name = 'story_proposals' AND column_name = 'payload') OR
        (table_name = 'story_workspaces' AND column_name = 'keywords')
      )
      AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TC178 legacy JSON defaults still exist';
  END IF;

  SELECT COUNT(*)
  INTO matching_fk_count
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
    AND contype = 'f'
    AND confupdtype = 'c'
    AND confdeltype = 'c'
    AND convalidated
    AND (
      (conname = 'story_intake_sessions_account_id_fkey' AND conrelid = 'story_intake_sessions'::regclass) OR
      (conname = 'story_proposals_session_id_fkey' AND conrelid = 'story_proposals'::regclass) OR
      (conname = 'story_workspaces_account_id_fkey' AND conrelid = 'story_workspaces'::regclass)
    );
  IF matching_fk_count <> 3 THEN
    RAISE EXCEPTION 'TC178 expected 3 validated ON UPDATE/DELETE CASCADE foreign keys, found %', matching_fk_count;
  END IF;

  SELECT COUNT(*)
  INTO matching_index_count
  FROM pg_index AS index_meta
  JOIN pg_class AS index_relation ON index_relation.oid = index_meta.indexrelid
  JOIN pg_class AS table_relation ON table_relation.oid = index_meta.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  WHERE table_namespace.nspname = 'public'
    AND table_relation.relname = 'story_workspaces'
    AND index_relation.relname = 'story_workspaces_account_id_title_idx'
    AND index_meta.indisvalid
    AND index_meta.indisready
    AND NOT index_meta.indisunique
    AND index_meta.indnkeyatts = 2
    AND pg_get_indexdef(index_meta.indexrelid, 1, TRUE) = 'account_id'
    AND pg_get_indexdef(index_meta.indexrelid, 2, TRUE) = 'title';
  IF matching_index_count <> 1 THEN
    RAISE EXCEPTION 'TC178 story workspace index shape is invalid';
  END IF;
END
$$;

BEGIN;

UPDATE "accounts"
SET "id" = '11111111-1111-4111-8111-111111111112'
WHERE "id" = '11111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "story_intake_sessions"
    WHERE "id" = '22222222-2222-4222-8222-222222222221'
      AND "account_id" = '11111111-1111-4111-8111-111111111112'
  ) OR NOT EXISTS (
    SELECT 1
    FROM "story_workspaces"
    WHERE "id" = '44444444-4444-4444-8444-444444444444'
      AND "account_id" = '11111111-1111-4111-8111-111111111112'
  ) THEN
    RAISE EXCEPTION 'TC178 account foreign keys do not cascade on update';
  END IF;
END
$$;

UPDATE "story_intake_sessions"
SET "id" = '22222222-2222-4222-8222-222222222222'
WHERE "id" = '22222222-2222-4222-8222-222222222221';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "story_proposals"
    WHERE "id" = '33333333-3333-4333-8333-333333333333'
      AND "session_id" = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'TC178 proposal foreign key does not cascade on update';
  END IF;
END
$$;

ROLLBACK;
