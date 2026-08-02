BEGIN;

CREATE TYPE "vnext_processing_purpose" AS ENUM ('unverified_migrated', 'synthetic_creative', 'core_creative', 'external_experience', 'model_training');
CREATE TYPE "vnext_processing_basis_status" AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE "vnext_consent_kind" AS ENUM ('required', 'optional');
CREATE TYPE "vnext_consent_status" AS ENUM ('active', 'withdrawn');
CREATE TYPE "vnext_safety_trigger_type" AS ENUM ('input_policy', 'output_policy', 'crisis', 'illegal_content');
CREATE TYPE "vnext_safety_severity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "vnext_safety_disposition" AS ENUM ('support', 'block', 'escalate', 'restrict');
CREATE TYPE "vnext_safety_case_status" AS ENUM ('open', 'appealed', 'resolved');
CREATE TYPE "vnext_continuous_use_receipt_status" AS ENUM ('pending', 'acknowledged');

CREATE UNIQUE INDEX "vnext_compliance_sessions_id_owner_key"
  ON "vnext_compliance_sessions"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_compliance_sessions_scope_key"
  ON "vnext_compliance_sessions"("id", "experience_session_id", "owner_principal_id");

ALTER TABLE "vnext_compliance_sessions"
  ADD CONSTRAINT "vnext_compliance_audience_input_policy_check"
    CHECK (
      "audience_mode" = 'internal'
      OR
      ("audience_mode" = 'verified_adult_external' AND "input_policy" = 'real_input')
    );

CREATE FUNCTION "vnext_valid_data_categories"(categories JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  category_json JSONB;
  category_text TEXT;
  previous_category TEXT := NULL;
  category_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(categories) <> 'array' THEN
    RETURN FALSE;
  END IF;
  IF jsonb_array_length(categories) < 1
     OR jsonb_array_length(categories) > 32 THEN
    RETURN FALSE;
  END IF;
  FOR category_json IN
    SELECT item
      FROM jsonb_array_elements(categories) AS category(item)
  LOOP
    IF jsonb_typeof(category_json) <> 'string' THEN
      RETURN FALSE;
    END IF;
    category_text := category_json #>> '{}';
    IF category_text !~ '^[a-z][a-z0-9_]{0,63}$'
       OR (
         previous_category IS NOT NULL
         AND (category_text COLLATE "C") <= (previous_category COLLATE "C")
       )
    THEN
      RETURN FALSE;
    END IF;
    previous_category := category_text;
    category_count := category_count + 1;
  END LOOP;
  RETURN category_count > 0;
END;
$$;

CREATE FUNCTION "vnext_valid_notice_versions"(notice_versions JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  reference_json JSONB;
  reference_text TEXT;
  previous_reference TEXT := NULL;
  reference_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(notice_versions) <> 'array' THEN
    RETURN FALSE;
  END IF;
  IF jsonb_array_length(notice_versions) < 1
     OR jsonb_array_length(notice_versions) > 16 THEN
    RETURN FALSE;
  END IF;
  FOR reference_json IN
    SELECT item
      FROM jsonb_array_elements(notice_versions) AS notice_entry(item)
  LOOP
    IF jsonb_typeof(reference_json) <> 'string' THEN
      RETURN FALSE;
    END IF;
    reference_text := reference_json #>> '{}';
    IF reference_text !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
       OR (
         previous_reference IS NOT NULL
         AND (reference_text COLLATE "C") <= (previous_reference COLLATE "C")
       )
    THEN
      RETURN FALSE;
    END IF;
    previous_reference := reference_text;
    reference_count := reference_count + 1;
  END LOOP;
  RETURN reference_count > 0;
END;
$$;

CREATE TABLE "vnext_processing_basis_records" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "compliance_session_id" UUID NOT NULL,
    "purpose" "vnext_processing_purpose" NOT NULL,
    "coverage_key" VARCHAR(100) NOT NULL,
    "data_categories" JSONB NOT NULL,
    "legal_basis" VARCHAR(100) NOT NULL,
    "notice_versions" JSONB NOT NULL,
    "status" "vnext_processing_basis_status" NOT NULL DEFAULT 'active',
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_or_expired_at" TIMESTAMPTZ(6),
    "evidence_ref" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_processing_basis_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_processing_basis_shape_check"
      CHECK (
        "purpose" IN ('core_creative', 'external_experience')
        AND "coverage_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
        AND "vnext_valid_data_categories"("data_categories")
        AND "vnext_valid_notice_versions"("notice_versions")
        AND "legal_basis" ~ '[^[:space:]]'
        AND "evidence_ref" ~ '[^[:space:]]'
        AND "version" > 0
      ),
    CONSTRAINT "vnext_processing_basis_lifecycle_check"
      CHECK (
        (("status" = 'active') = ("revoked_or_expired_at" IS NULL))
        AND ("revoked_or_expired_at" IS NULL OR "revoked_or_expired_at" >= "effective_at")
      )
);

CREATE TABLE "vnext_consent_records" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "compliance_session_id" UUID NOT NULL,
    "purpose" "vnext_processing_purpose" NOT NULL,
    "coverage_key" VARCHAR(100) NOT NULL,
    "scope" JSONB NOT NULL,
    "consent_kind" "vnext_consent_kind" NOT NULL,
    "notice_versions" JSONB NOT NULL,
    "status" "vnext_consent_status" NOT NULL DEFAULT 'active',
    "granted_at" TIMESTAMPTZ(6) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6),
    "evidence_ref" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_consent_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_consent_shape_check"
      CHECK (
        "purpose" IN ('core_creative', 'external_experience', 'model_training')
        AND jsonb_typeof("scope") = 'object'
        AND "coverage_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
        AND "scope" ? 'schemaVersion'
        AND "scope" ? 'coverageKey'
        AND "scope" ? 'dataCategories'
        AND ("scope" - 'schemaVersion' - 'coverageKey' - 'dataCategories') = '{}'::jsonb
        AND "scope" -> 'schemaVersion' = '1'::jsonb
        AND jsonb_typeof("scope" -> 'coverageKey') = 'string'
        AND "scope" ->> 'coverageKey' = "coverage_key"
        AND "vnext_valid_data_categories"("scope" -> 'dataCategories')
        AND "vnext_valid_notice_versions"("notice_versions")
        AND "evidence_ref" ~ '[^[:space:]]'
        AND "version" > 0
        AND ("purpose" <> 'external_experience' OR "consent_kind" = 'required')
        AND ("purpose" <> 'model_training' OR "consent_kind" = 'optional')
      ),
    CONSTRAINT "vnext_consent_lifecycle_check"
      CHECK (
        (("status" = 'withdrawn') = ("withdrawn_at" IS NOT NULL))
        AND ("withdrawn_at" IS NULL OR "withdrawn_at" >= "granted_at")
      )
);

CREATE FUNCTION "vnext_reject_synthetic_compliance_authority"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  compliance_input_policy "vnext_input_policy";
BEGIN
  SELECT "input_policy"
    INTO compliance_input_policy
    FROM "vnext_compliance_sessions"
   WHERE "id" = NEW."compliance_session_id"
     AND "owner_principal_id" = NEW."owner_principal_id"
   FOR UPDATE;
  IF compliance_input_policy = 'synthetic_only'
  THEN
    RAISE EXCEPTION 'synthetic-only compliance cannot own authority records'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vnext_processing_basis_reject_synthetic_compliance"
BEFORE INSERT OR UPDATE OF "owner_principal_id", "compliance_session_id"
ON "vnext_processing_basis_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_synthetic_compliance_authority"();

CREATE TRIGGER "vnext_consent_reject_synthetic_compliance"
BEFORE INSERT OR UPDATE OF "owner_principal_id", "compliance_session_id"
ON "vnext_consent_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_synthetic_compliance_authority"();

CREATE FUNCTION "vnext_reject_authority_material_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'processing authority evidence is immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_processing_basis_material_immutable"
BEFORE UPDATE OF
  "owner_principal_id",
  "compliance_session_id",
  "purpose",
  "coverage_key",
  "data_categories",
  "legal_basis",
  "notice_versions",
  "effective_at",
  "evidence_ref"
ON "vnext_processing_basis_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_authority_material_update"();

CREATE TRIGGER "vnext_consent_material_immutable"
BEFORE UPDATE OF
  "owner_principal_id",
  "compliance_session_id",
  "purpose",
  "coverage_key",
  "scope",
  "consent_kind",
  "notice_versions",
  "granted_at",
  "evidence_ref"
ON "vnext_consent_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_authority_material_update"();

CREATE FUNCTION "vnext_enforce_processing_basis_lifecycle_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'active'
     AND NEW."status" IN ('revoked', 'expired')
     AND OLD."revoked_or_expired_at" IS NULL
     AND NEW."revoked_or_expired_at" IS NOT NULL
     AND NEW."version" = OLD."version" + 1
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'processing basis lifecycle transition is not monotonic'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_processing_basis_lifecycle_monotonic"
BEFORE UPDATE OF "status", "revoked_or_expired_at", "version"
ON "vnext_processing_basis_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_processing_basis_lifecycle_transition"();

CREATE FUNCTION "vnext_enforce_consent_lifecycle_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'active'
     AND NEW."status" = 'withdrawn'
     AND OLD."withdrawn_at" IS NULL
     AND NEW."withdrawn_at" IS NOT NULL
     AND NEW."version" = OLD."version" + 1
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'consent lifecycle transition is not monotonic'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_consent_lifecycle_monotonic"
BEFORE UPDATE OF "status", "withdrawn_at", "version"
ON "vnext_consent_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_consent_lifecycle_transition"();

CREATE FUNCTION "vnext_reject_authority_on_synthetic_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."input_policy" = 'synthetic_only'
     AND (
       EXISTS (
         SELECT 1
           FROM "vnext_processing_basis_records"
          WHERE "compliance_session_id" = NEW."id"
            AND "owner_principal_id" = NEW."owner_principal_id"
       )
       OR EXISTS (
         SELECT 1
           FROM "vnext_consent_records"
          WHERE "compliance_session_id" = NEW."id"
            AND "owner_principal_id" = NEW."owner_principal_id"
       )
     )
  THEN
    RAISE EXCEPTION 'compliance with authority records cannot become synthetic-only'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vnext_compliance_reject_synthetic_transition_with_authority"
BEFORE UPDATE OF "audience_mode", "input_policy"
ON "vnext_compliance_sessions"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_authority_on_synthetic_transition"();

ALTER TABLE "vnext_creative_tasks"
  ADD COLUMN "processing_purpose" "vnext_processing_purpose",
  ADD COLUMN "processing_basis_record_id" UUID,
  ADD COLUMN "consent_record_id" UUID,
  ADD COLUMN "processing_coverage_key" VARCHAR(100),
  ADD COLUMN "processing_evidence_ref" VARCHAR(200);

UPDATE "vnext_creative_tasks"
  SET "processing_purpose" = 'unverified_migrated',
      "processing_evidence_ref" = 'migration:unverified'
  WHERE "processing_purpose" IS NULL;

ALTER TABLE "vnext_creative_tasks"
  ALTER COLUMN "processing_purpose" SET NOT NULL,
  ADD CONSTRAINT "vnext_creative_task_processing_authority_check"
    CHECK (
      (
        "processing_purpose" = 'unverified_migrated'
        AND "processing_basis_record_id" IS NULL
        AND "consent_record_id" IS NULL
        AND "processing_coverage_key" IS NULL
        AND "processing_evidence_ref" IS NOT NULL
        AND "processing_evidence_ref" = 'migration:unverified'
      )
      OR
      (
        "processing_purpose" = 'synthetic_creative'
        AND "processing_basis_record_id" IS NULL
        AND "consent_record_id" IS NULL
        AND "processing_coverage_key" IS NULL
        AND "processing_evidence_ref" IS NOT NULL
        AND "processing_evidence_ref" ~ '^fixture:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:sha256:[0-9a-f]{64}$'
      )
      OR
      (
        "processing_purpose" = 'core_creative'
        AND num_nonnulls("processing_basis_record_id", "consent_record_id") = 1
        AND "processing_coverage_key" IS NOT NULL
        AND "processing_coverage_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
        AND "processing_evidence_ref" IS NULL
      )
      OR
      (
        "processing_purpose" = 'external_experience'
        AND num_nonnulls("processing_basis_record_id", "consent_record_id") = 1
        AND "processing_coverage_key" IS NOT NULL
        AND "processing_coverage_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
        AND "processing_evidence_ref" IS NULL
      )
    );

CREATE FUNCTION "vnext_enforce_creative_task_processing_authority"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  origin_experience_session_id UUID;
  matched_authority_id UUID;
BEGIN
  IF NEW."kind" = 'understand' THEN
    SELECT "experience_session_id"
      INTO origin_experience_session_id
      FROM "vnext_source_messages"
     WHERE "id" = NEW."source_message_id"
       AND "owner_principal_id" = NEW."owner_principal_id";
  ELSIF NEW."kind" = 'write_opening' THEN
    SELECT source."experience_session_id"
      INTO origin_experience_session_id
      FROM "vnext_story_workspaces" workspace
      JOIN "vnext_source_messages" source
        ON source."id" = workspace."origin_source_message_id"
       AND source."owner_principal_id" = workspace."owner_principal_id"
     WHERE workspace."id" = NEW."workspace_id"
       AND workspace."owner_principal_id" = NEW."owner_principal_id";
  ELSE
    RAISE EXCEPTION 'creative task kind has no processing-authority origin'
      USING ERRCODE = '23514';
  END IF;
  IF origin_experience_session_id IS NULL THEN
    RAISE EXCEPTION 'creative task processing-authority origin is missing'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."processing_purpose" = 'synthetic_creative' THEN
    SELECT compliance."id"
      INTO matched_authority_id
      FROM "vnext_compliance_sessions" compliance
     WHERE compliance."owner_principal_id" = NEW."owner_principal_id"
       AND compliance."experience_session_id" = origin_experience_session_id
       AND compliance."audience_mode" = 'internal'
       AND compliance."input_policy" = 'synthetic_only'
       AND compliance."status" = 'eligible'
     FOR SHARE OF compliance;
    IF matched_authority_id IS NULL THEN
      RAISE EXCEPTION 'synthetic creative task session is not eligible'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."processing_purpose" NOT IN ('core_creative', 'external_experience') THEN
    RAISE EXCEPTION 'new creative task requires current processing authority'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."processing_basis_record_id" IS NOT NULL THEN
    SELECT basis."id"
      INTO matched_authority_id
      FROM "vnext_processing_basis_records" basis
      JOIN "vnext_compliance_sessions" compliance
        ON compliance."id" = basis."compliance_session_id"
       AND compliance."owner_principal_id" = basis."owner_principal_id"
     WHERE basis."id" = NEW."processing_basis_record_id"
       AND basis."owner_principal_id" = NEW."owner_principal_id"
       AND basis."purpose" = NEW."processing_purpose"
       AND basis."coverage_key" = NEW."processing_coverage_key"
       AND basis."status" = 'active'
       AND basis."effective_at" <= CURRENT_TIMESTAMP
       AND basis."revoked_or_expired_at" IS NULL
       AND compliance."experience_session_id" = origin_experience_session_id
       AND compliance."status" = 'eligible'
     FOR SHARE OF basis, compliance;
  ELSE
    SELECT consent."id"
      INTO matched_authority_id
      FROM "vnext_consent_records" consent
      JOIN "vnext_compliance_sessions" compliance
        ON compliance."id" = consent."compliance_session_id"
       AND compliance."owner_principal_id" = consent."owner_principal_id"
     WHERE consent."id" = NEW."consent_record_id"
       AND consent."owner_principal_id" = NEW."owner_principal_id"
       AND consent."purpose" = NEW."processing_purpose"
       AND consent."coverage_key" = NEW."processing_coverage_key"
       AND consent."status" = 'active'
       AND consent."granted_at" <= CURRENT_TIMESTAMP
       AND consent."withdrawn_at" IS NULL
       AND compliance."experience_session_id" = origin_experience_session_id
       AND compliance."status" = 'eligible'
     FOR SHARE OF consent, compliance;
  END IF;
  IF matched_authority_id IS NULL THEN
    RAISE EXCEPTION 'creative task processing authority is not current or in scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vnext_creative_task_enforce_processing_authority"
BEFORE INSERT
ON "vnext_creative_tasks"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_creative_task_processing_authority"();

CREATE FUNCTION "vnext_reject_creative_task_authority_rebind"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'creative task processing authority and origin are immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_creative_task_authority_immutable"
BEFORE UPDATE OF
  "processing_purpose",
  "processing_basis_record_id",
  "consent_record_id",
  "processing_coverage_key",
  "processing_evidence_ref",
  "source_message_id",
  "workspace_id",
  "kind"
ON "vnext_creative_tasks"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_creative_task_authority_rebind"();

ALTER TABLE "vnext_outbox_events"
  ADD CONSTRAINT "vnext_safety_escalation_payload_minimal_check"
    CHECK (
      "event_type" <> 'vnext.safety.escalation_requested'
      OR (
        "aggregate_type" = 'safety_case'
        AND "payload" ? 'caseId'
        AND jsonb_typeof("payload" -> 'caseId') = 'string'
        AND "payload" ->> 'caseId' = "aggregate_id"::text
        AND ("payload" - 'caseId' - 'safetyContactRef') = '{}'::jsonb
        AND "payload" ? 'safetyContactRef'
        AND jsonb_typeof("payload" -> 'safetyContactRef') = 'string'
        AND btrim("payload" ->> 'safetyContactRef') <> ''
        AND char_length("payload" ->> 'safetyContactRef') <= 200
      )
    );

CREATE TABLE "vnext_safety_cases" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "experience_session_id" UUID NOT NULL,
    "compliance_session_id" UUID NOT NULL,
    "workspace_id" UUID,
    "triggering_task_id" UUID,
    "trigger_type" "vnext_safety_trigger_type" NOT NULL,
    "trigger_digest" CHAR(64) NOT NULL,
    "severity" "vnext_safety_severity" NOT NULL,
    "policy_version" VARCHAR(200) NOT NULL,
    "disposition" "vnext_safety_disposition" NOT NULL,
    "status" "vnext_safety_case_status" NOT NULL DEFAULT 'open',
    "safety_contact_ref" VARCHAR(200),
    "task_cancellation_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "suppressed_content_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "human_escalation_ref" VARCHAR(200),
    "audit_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "appeal_reason_digest" CHAR(64),
    "appealed_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_safety_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_safety_case_shape_check"
      CHECK (
        "trigger_digest" ~ '^[0-9a-f]{64}$'
        AND "policy_version" ~ '[^[:space:]]'
        AND jsonb_typeof("task_cancellation_refs") = 'array'
        AND jsonb_typeof("suppressed_content_refs") = 'array'
        AND jsonb_typeof("audit_refs") = 'array'
        AND ("appeal_reason_digest" IS NULL OR "appeal_reason_digest" ~ '^[0-9a-f]{64}$')
        AND "version" > 0
        AND "disposition" <> 'support'
        AND (
          "safety_contact_ref" IS NULL
          OR btrim("safety_contact_ref") <> ''
        )
        AND (
          "human_escalation_ref" IS NULL
          OR "human_escalation_ref" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
        )
        AND (
          "trigger_type" <> 'output_policy'
          OR ("triggering_task_id" IS NOT NULL AND "workspace_id" IS NOT NULL)
        )
        AND (
          "disposition" <> 'escalate'
          OR "safety_contact_ref" IS NOT NULL
        )
        AND ("disposition" <> 'escalate' OR "severity" IN ('high', 'critical'))
      ),
    CONSTRAINT "vnext_safety_case_lifecycle_check"
      CHECK (
        (
          (
            "status" = 'open'
            AND "appeal_reason_digest" IS NULL
            AND "appealed_at" IS NULL
            AND "closed_at" IS NULL
          )
          OR (
            "status" = 'appealed'
            AND "appeal_reason_digest" IS NOT NULL
            AND "appealed_at" IS NOT NULL
            AND "closed_at" IS NULL
          )
          OR (
            "status" = 'resolved'
            AND "closed_at" IS NOT NULL
            AND (("appeal_reason_digest" IS NULL) = ("appealed_at" IS NULL))
          )
        )
        AND ("appealed_at" IS NULL OR "appealed_at" >= "opened_at")
        AND ("closed_at" IS NULL OR "closed_at" >= "opened_at")
        AND (
          "appealed_at" IS NULL
          OR "closed_at" IS NULL
          OR "closed_at" >= "appealed_at"
        )
      )
);

CREATE FUNCTION "vnext_enforce_safety_case_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_delivery_audit_ref TEXT;
  old_delivery_audit_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*)
      INTO old_delivery_audit_count
      FROM jsonb_array_elements(NEW."audit_refs") AS audit_ref(value)
     WHERE jsonb_typeof(audit_ref.value) = 'string'
       AND (audit_ref.value #>> '{}') LIKE 'delivery:%';
    IF NEW."status" <> 'open'
       OR NEW."appeal_reason_digest" IS NOT NULL
       OR NEW."appealed_at" IS NOT NULL
       OR NEW."closed_at" IS NOT NULL
       OR NEW."human_escalation_ref" IS NOT NULL
       OR NEW."version" <> 1
       OR old_delivery_audit_count <> 0
    THEN
      RAISE EXCEPTION 'safety case must be created as an undelivered open version 1 case'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."owner_principal_id" IS DISTINCT FROM OLD."owner_principal_id"
     OR NEW."experience_session_id" IS DISTINCT FROM OLD."experience_session_id"
     OR NEW."compliance_session_id" IS DISTINCT FROM OLD."compliance_session_id"
     OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
     OR NEW."triggering_task_id" IS DISTINCT FROM OLD."triggering_task_id"
     OR NEW."trigger_type" IS DISTINCT FROM OLD."trigger_type"
     OR NEW."trigger_digest" IS DISTINCT FROM OLD."trigger_digest"
     OR NEW."severity" IS DISTINCT FROM OLD."severity"
     OR NEW."policy_version" IS DISTINCT FROM OLD."policy_version"
     OR NEW."disposition" IS DISTINCT FROM OLD."disposition"
     OR NEW."safety_contact_ref" IS DISTINCT FROM OLD."safety_contact_ref"
     OR NEW."task_cancellation_refs" IS DISTINCT FROM OLD."task_cancellation_refs"
     OR NEW."suppressed_content_refs" IS DISTINCT FROM OLD."suppressed_content_refs"
     OR NEW."opened_at" IS DISTINCT FROM OLD."opened_at"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'safety case scope and material evidence are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'open'
     AND NEW."status" = 'appealed'
     AND OLD."appeal_reason_digest" IS NULL
     AND NEW."appeal_reason_digest" IS NOT NULL
     AND OLD."appealed_at" IS NULL
     AND NEW."appealed_at" IS NOT NULL
     AND NEW."appealed_at" >= OLD."opened_at"
     AND NEW."closed_at" IS NULL
     AND NEW."human_escalation_ref" IS NOT DISTINCT FROM OLD."human_escalation_ref"
     AND NEW."audit_refs" = OLD."audit_refs"
     AND NEW."version" = OLD."version" + 1
  THEN
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('open', 'appealed')
     AND NEW."status" = OLD."status"
     AND NEW."appeal_reason_digest" IS NOT DISTINCT FROM OLD."appeal_reason_digest"
     AND NEW."appealed_at" IS NOT DISTINCT FROM OLD."appealed_at"
     AND NEW."closed_at" IS NOT DISTINCT FROM OLD."closed_at"
     AND OLD."human_escalation_ref" IS NULL
     AND NEW."human_escalation_ref" IS NOT NULL
     AND NEW."version" = OLD."version" + 1
  THEN
    SELECT COUNT(*)
      INTO old_delivery_audit_count
      FROM jsonb_array_elements(OLD."audit_refs") AS audit_ref(value)
     WHERE jsonb_typeof(audit_ref.value) = 'string'
       AND (audit_ref.value #>> '{}') LIKE 'delivery:%';
    expected_delivery_audit_ref := 'delivery:' || NEW."human_escalation_ref";
    IF old_delivery_audit_count = 0
       AND NEW."audit_refs" =
         OLD."audit_refs" || jsonb_build_array(expected_delivery_audit_ref)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'invalid safety case lifecycle transition'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_safety_case_lifecycle_guard"
BEFORE INSERT OR UPDATE ON "vnext_safety_cases"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_safety_case_lifecycle"();

CREATE TABLE "vnext_safety_appeal_records" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "safety_case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "reason_digest" CHAR(64) NOT NULL,
    "reason_ciphertext" TEXT NOT NULL,
    "nonce" VARCHAR(16) NOT NULL,
    "auth_tag" VARCHAR(22) NOT NULL,
    "key_version" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vnext_safety_appeal_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_safety_appeal_shape_check"
      CHECK (
        "case_version" > 1
        AND "reason_digest" ~ '^[0-9a-f]{64}$'
        AND "reason_ciphertext" ~ '^[A-Za-z0-9_-]+$'
        AND "nonce" ~ '^[A-Za-z0-9_-]{16}$'
        AND "auth_tag" ~ '^[A-Za-z0-9_-]{22}$'
        AND "key_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
      )
);

CREATE FUNCTION "vnext_reject_safety_appeal_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sealed safety appeal evidence is immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_safety_appeal_immutable"
BEFORE UPDATE ON "vnext_safety_appeal_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_safety_appeal_update"();

CREATE FUNCTION "vnext_reject_live_safety_case_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "vnext_principals" principal
     WHERE principal."id" = OLD."owner_principal_id"
  ) THEN
    RAISE EXCEPTION 'live safety cases cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "vnext_safety_case_delete_guard"
BEFORE DELETE ON "vnext_safety_cases"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_live_safety_case_delete"();

CREATE FUNCTION "vnext_reject_safety_evidence_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_case_id UUID;
  evidence_owner_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'vnext_safety_appeal_records' THEN
    evidence_case_id := OLD."safety_case_id";
    evidence_owner_id := OLD."owner_principal_id";
  ELSE
    evidence_case_id := OLD."aggregate_id";
    evidence_owner_id := OLD."owner_principal_id";
  END IF;
  IF EXISTS (
       SELECT 1
         FROM "vnext_principals" principal
        WHERE principal."id" = evidence_owner_id
     )
     AND EXISTS (
       SELECT 1
         FROM "vnext_safety_cases" safety_case
        WHERE safety_case."id" = evidence_case_id
          AND safety_case."owner_principal_id" = evidence_owner_id
     )
  THEN
    RAISE EXCEPTION 'committed safety evidence cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "vnext_safety_appeal_delete_guard"
BEFORE DELETE ON "vnext_safety_appeal_records"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_safety_evidence_delete"();

CREATE TRIGGER "vnext_safety_outbox_delete_guard"
BEFORE DELETE ON "vnext_outbox_events"
FOR EACH ROW
WHEN (OLD."aggregate_type" = 'safety_case')
EXECUTE FUNCTION "vnext_reject_safety_evidence_delete"();

CREATE FUNCTION "vnext_enforce_safety_outbox_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."aggregate_type" <> 'safety_case'
     AND NEW."aggregate_type" <> 'safety_case'
  THEN
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."owner_principal_id" IS DISTINCT FROM OLD."owner_principal_id"
     OR NEW."task_id" IS DISTINCT FROM OLD."task_id"
     OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
     OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
     OR NEW."aggregate_version" IS DISTINCT FROM OLD."aggregate_version"
     OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."payload" IS DISTINCT FROM OLD."payload"
     OR NEW."payload_digest" IS DISTINCT FROM OLD."payload_digest"
     OR NEW."max_attempts" IS DISTINCT FROM OLD."max_attempts"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'safety outbox identity and payload are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."event_type" = 'vnext.safety_case.appealed.v1' THEN
    RAISE EXCEPTION 'safety appeal outbox evidence is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."event_type" = 'vnext.safety.escalation_requested'
     AND OLD."status" = 'published'
  THEN
    RAISE EXCEPTION 'published safety escalation evidence is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vnext_safety_outbox_lifecycle_guard"
BEFORE UPDATE ON "vnext_outbox_events"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_safety_outbox_lifecycle"();

CREATE INDEX "vnext_processing_bases_owner_purpose_idx"
  ON "vnext_processing_basis_records"("owner_principal_id", "purpose", "coverage_key", "status");
CREATE UNIQUE INDEX "vnext_processing_bases_id_owner_key"
  ON "vnext_processing_basis_records"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_processing_bases_id_owner_purpose_key"
  ON "vnext_processing_basis_records"("id", "owner_principal_id", "purpose");
CREATE UNIQUE INDEX "vnext_processing_bases_owner_evidence_key"
  ON "vnext_processing_basis_records"("owner_principal_id", "evidence_ref");

CREATE INDEX "vnext_consents_owner_purpose_idx"
  ON "vnext_consent_records"("owner_principal_id", "purpose", "coverage_key", "status");
CREATE UNIQUE INDEX "vnext_consents_id_owner_key"
  ON "vnext_consent_records"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_consents_id_owner_purpose_key"
  ON "vnext_consent_records"("id", "owner_principal_id", "purpose");
CREATE UNIQUE INDEX "vnext_consents_owner_evidence_key"
  ON "vnext_consent_records"("owner_principal_id", "evidence_ref");

CREATE INDEX "vnext_safety_cases_owner_session_idx"
  ON "vnext_safety_cases"("owner_principal_id", "experience_session_id", "status", "opened_at");
CREATE INDEX "vnext_safety_cases_open_idx"
  ON "vnext_safety_cases"("status", "severity", "opened_at");
CREATE UNIQUE INDEX "vnext_safety_cases_id_owner_key"
  ON "vnext_safety_cases"("id", "owner_principal_id");

CREATE UNIQUE INDEX "vnext_safety_appeals_id_owner_key"
  ON "vnext_safety_appeal_records"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_safety_appeals_case_owner_key"
  ON "vnext_safety_appeal_records"("safety_case_id", "owner_principal_id");
CREATE INDEX "vnext_safety_appeals_owner_created_idx"
  ON "vnext_safety_appeal_records"("owner_principal_id", "created_at");

ALTER TABLE "vnext_processing_basis_records"
  ADD CONSTRAINT "vnext_processing_basis_records_owner_principal_id_fkey"
    FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_processing_basis_records_compliance_session_id_owner_fkey"
    FOREIGN KEY ("compliance_session_id", "owner_principal_id") REFERENCES "vnext_compliance_sessions"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_consent_records"
  ADD CONSTRAINT "vnext_consent_records_owner_principal_id_fkey"
    FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_consent_records_compliance_session_id_owner_principa_fkey"
    FOREIGN KEY ("compliance_session_id", "owner_principal_id") REFERENCES "vnext_compliance_sessions"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_creative_tasks"
  ADD CONSTRAINT "vnext_creative_tasks_processing_basis_record_id_owner_prin_fkey"
    FOREIGN KEY ("processing_basis_record_id", "owner_principal_id", "processing_purpose") REFERENCES "vnext_processing_basis_records"("id", "owner_principal_id", "purpose") ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_creative_tasks_consent_record_id_owner_principal_id__fkey"
    FOREIGN KEY ("consent_record_id", "owner_principal_id", "processing_purpose") REFERENCES "vnext_consent_records"("id", "owner_principal_id", "purpose") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "vnext_safety_cases"
  ADD CONSTRAINT "vnext_safety_cases_owner_principal_id_fkey"
    FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_safety_cases_experience_session_id_owner_principal_i_fkey"
    FOREIGN KEY ("experience_session_id", "owner_principal_id") REFERENCES "vnext_experience_sessions"("id", "principal_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_safety_cases_compliance_session_id_experience_sessio_fkey"
    FOREIGN KEY ("compliance_session_id", "experience_session_id", "owner_principal_id") REFERENCES "vnext_compliance_sessions"("id", "experience_session_id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_safety_cases_workspace_id_owner_principal_id_fkey"
    FOREIGN KEY ("workspace_id", "owner_principal_id") REFERENCES "vnext_story_workspaces"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_safety_cases_triggering_task_id_owner_principal_id_fkey"
    FOREIGN KEY ("triggering_task_id", "owner_principal_id") REFERENCES "vnext_creative_tasks"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "vnext_safety_appeal_records"
  ADD CONSTRAINT "vnext_safety_appeal_records_owner_principal_id_fkey"
    FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_safety_appeal_records_safety_case_id_owner_principal_fkey"
    FOREIGN KEY ("safety_case_id", "owner_principal_id") REFERENCES "vnext_safety_cases"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "vnext_assert_safety_case_truth"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  asserted_case_id UUID;
  safety_case RECORD;
  appeal_record RECORD;
  appeal_record_count INTEGER;
  appeal_event_count INTEGER;
  matching_appeal_event_count INTEGER;
  escalation_event_count INTEGER;
  published_escalation_event_count INTEGER;
  matching_published_escalation_count INTEGER;
  delivery_audit_count INTEGER;
  matching_delivery_audit_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'vnext_safety_cases' THEN
    IF TG_OP = 'DELETE' THEN
      asserted_case_id := OLD."id";
    ELSE
      asserted_case_id := NEW."id";
    END IF;
  ELSIF TG_TABLE_NAME = 'vnext_safety_appeal_records' THEN
    IF TG_OP = 'DELETE' THEN
      asserted_case_id := OLD."safety_case_id";
    ELSE
      asserted_case_id := NEW."safety_case_id";
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      IF OLD."aggregate_type" <> 'safety_case' THEN
        RETURN NULL;
      END IF;
      asserted_case_id := OLD."aggregate_id";
    ELSE
      IF NEW."aggregate_type" <> 'safety_case' THEN
        RETURN NULL;
      END IF;
      asserted_case_id := NEW."aggregate_id";
    END IF;
  END IF;

  SELECT candidate.*
    INTO safety_case
    FROM "vnext_safety_cases" candidate
   WHERE candidate."id" = asserted_case_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
    INTO appeal_record_count
    FROM "vnext_safety_appeal_records" record
   WHERE record."safety_case_id" = safety_case."id";
  SELECT COUNT(*)
    INTO appeal_event_count
    FROM "vnext_outbox_events" event
   WHERE event."aggregate_type" = 'safety_case'
     AND event."aggregate_id" = safety_case."id"
     AND event."event_type" = 'vnext.safety_case.appealed.v1';

  IF safety_case."appeal_reason_digest" IS NULL
     AND safety_case."appealed_at" IS NULL
  THEN
    IF appeal_record_count <> 0 OR appeal_event_count <> 0 THEN
      RAISE EXCEPTION 'unappealed safety case cannot retain appeal evidence'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF appeal_record_count <> 1 THEN
      RAISE EXCEPTION 'appealed safety case requires one immutable appeal record'
        USING ERRCODE = '23514';
    END IF;
    SELECT record.*
      INTO appeal_record
      FROM "vnext_safety_appeal_records" record
     WHERE record."safety_case_id" = safety_case."id";
    IF appeal_record."owner_principal_id" <> safety_case."owner_principal_id"
       OR appeal_record."case_version" < 2
       OR appeal_record."case_version" > safety_case."version"
       OR appeal_record."reason_digest" <> safety_case."appeal_reason_digest"
       OR appeal_record."created_at" <> safety_case."appealed_at"
    THEN
      RAISE EXCEPTION 'safety appeal record does not match case truth'
        USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(*)
      INTO matching_appeal_event_count
      FROM "vnext_outbox_events" event
     WHERE event."owner_principal_id" = safety_case."owner_principal_id"
       AND event."task_id" IS NULL
       AND event."aggregate_type" = 'safety_case'
       AND event."aggregate_id" = safety_case."id"
       AND event."aggregate_version" = appeal_record."case_version"
       AND event."event_type" = 'vnext.safety_case.appealed.v1'
       AND event."idempotency_key" =
         'safety-case-appealed:' || safety_case."id"::text || ':' || appeal_record."case_version"::text
       AND jsonb_typeof(event."payload") = 'object'
       AND (event."payload" - 'safetyCaseId' - 'experienceSessionId' - 'appealRecordId' - 'appealReasonDigest' - 'appealedAt') = '{}'::jsonb
       AND jsonb_typeof(event."payload" -> 'safetyCaseId') = 'string'
       AND event."payload" ->> 'safetyCaseId' = safety_case."id"::text
       AND jsonb_typeof(event."payload" -> 'experienceSessionId') = 'string'
       AND event."payload" ->> 'experienceSessionId' = safety_case."experience_session_id"::text
       AND jsonb_typeof(event."payload" -> 'appealRecordId') = 'string'
       AND event."payload" ->> 'appealRecordId' = appeal_record."id"::text
       AND jsonb_typeof(event."payload" -> 'appealReasonDigest') = 'string'
       AND event."payload" ->> 'appealReasonDigest' = appeal_record."reason_digest"::text
       AND jsonb_typeof(event."payload" -> 'appealedAt') = 'string'
       AND event."payload" ->> 'appealedAt' =
         to_char(
           appeal_record."created_at" AT TIME ZONE 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
         )
       -- Keep this key order aligned with the application canonicalJson digest.
       AND event."payload_digest" = encode(
         sha256(
           convert_to(
             '{"appealedAt":' ||
             to_jsonb(event."payload" ->> 'appealedAt')::text ||
             ',"appealReasonDigest":' ||
             to_jsonb(event."payload" ->> 'appealReasonDigest')::text ||
             ',"appealRecordId":' ||
             to_jsonb(event."payload" ->> 'appealRecordId')::text ||
             ',"experienceSessionId":' ||
             to_jsonb(event."payload" ->> 'experienceSessionId')::text ||
             ',"safetyCaseId":' ||
             to_jsonb(event."payload" ->> 'safetyCaseId')::text ||
             '}',
             'UTF8'
           )
         ),
         'hex'
       )
       AND event."status" = 'pending'
       AND event."attempt_count" = 0
       AND event."max_attempts" = 10
       AND event."available_at" = appeal_record."created_at"
       AND event."lease_owner" IS NULL
       AND event."lease_token" IS NULL
       AND event."lease_expires_at" IS NULL
       AND event."published_at" IS NULL
       AND event."last_failure_code" IS NULL;
    IF appeal_event_count <> 1 OR matching_appeal_event_count <> 1 THEN
      RAISE EXCEPTION 'appealed safety case requires exact immutable outbox truth'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COUNT(*)
    INTO escalation_event_count
    FROM "vnext_outbox_events" event
   WHERE event."aggregate_type" = 'safety_case'
     AND event."aggregate_id" = safety_case."id"
     AND event."event_type" = 'vnext.safety.escalation_requested';
  SELECT COUNT(*)
    INTO published_escalation_event_count
    FROM "vnext_outbox_events" event
   WHERE event."aggregate_type" = 'safety_case'
     AND event."aggregate_id" = safety_case."id"
     AND event."event_type" = 'vnext.safety.escalation_requested'
     AND event."status" = 'published';
  SELECT COUNT(*)
    INTO delivery_audit_count
    FROM jsonb_array_elements(safety_case."audit_refs") AS audit_ref(value)
   WHERE jsonb_typeof(audit_ref.value) = 'string'
     AND (audit_ref.value #>> '{}') LIKE 'delivery:%';

  IF safety_case."human_escalation_ref" IS NULL THEN
    IF published_escalation_event_count <> 0 OR delivery_audit_count <> 0 THEN
      RAISE EXCEPTION 'undelivered safety case cannot retain published delivery evidence'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT COUNT(*)
      INTO matching_delivery_audit_count
      FROM jsonb_array_elements(safety_case."audit_refs") AS audit_ref(value)
     WHERE jsonb_typeof(audit_ref.value) = 'string'
       AND (audit_ref.value #>> '{}') =
         'delivery:' || safety_case."human_escalation_ref";
    SELECT COUNT(*)
      INTO matching_published_escalation_count
      FROM "vnext_outbox_events" event
     WHERE event."owner_principal_id" = safety_case."owner_principal_id"
       AND event."task_id" IS NOT DISTINCT FROM safety_case."triggering_task_id"
       AND event."aggregate_type" = 'safety_case'
       AND event."aggregate_id" = safety_case."id"
       AND event."aggregate_version" = 1
       AND event."event_type" = 'vnext.safety.escalation_requested'
       AND jsonb_typeof(event."payload") = 'object'
       AND (event."payload" - 'caseId' - 'safetyContactRef') = '{}'::jsonb
       AND jsonb_typeof(event."payload" -> 'caseId') = 'string'
       AND event."payload" ->> 'caseId' = safety_case."id"::text
       AND jsonb_typeof(event."payload" -> 'safetyContactRef') = 'string'
       AND event."payload" ->> 'safetyContactRef' = safety_case."safety_contact_ref"
       -- Keep this key order aligned with the application canonicalJson digest.
       AND event."payload_digest" = encode(
         sha256(
           convert_to(
             '{"caseId":' ||
             to_jsonb(event."payload" ->> 'caseId')::text ||
             ',"safetyContactRef":' ||
             to_jsonb(event."payload" ->> 'safetyContactRef')::text ||
             '}',
             'UTF8'
           )
         ),
         'hex'
       )
       AND event."status" = 'published'
       AND event."attempt_count" > 0
       AND event."published_at" IS NOT NULL
       AND event."lease_owner" IS NULL
       AND event."lease_token" IS NULL
       AND event."lease_expires_at" IS NULL
       AND event."last_failure_code" IS NULL;
    IF safety_case."disposition" <> 'escalate'
       OR escalation_event_count <> 1
       OR published_escalation_event_count <> 1
       OR matching_published_escalation_count <> 1
       OR delivery_audit_count <> 1
       OR matching_delivery_audit_count <> 1
    THEN
      RAISE EXCEPTION 'human escalation reference requires exact published delivery truth'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "vnext_safety_case_truth_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "vnext_safety_cases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "vnext_assert_safety_case_truth"();

CREATE CONSTRAINT TRIGGER "vnext_safety_appeal_truth_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "vnext_safety_appeal_records"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "vnext_assert_safety_case_truth"();

CREATE CONSTRAINT TRIGGER "vnext_safety_outbox_truth_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "vnext_outbox_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "vnext_assert_safety_case_truth"();

CREATE TABLE "vnext_continuous_use_reminder_receipts" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "experience_session_id" UUID NOT NULL,
    "compliance_session_id" UUID NOT NULL,
    "status" "vnext_continuous_use_receipt_status" NOT NULL DEFAULT 'pending',
    "policy_version" VARCHAR(100) NOT NULL,
    "interval_seconds" INTEGER NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "emitted_at" TIMESTAMPTZ(6) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "emission_event_id" UUID NOT NULL,
    "acknowledgement_event_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_continuous_use_reminder_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_continuous_use_receipt_shape_check"
      CHECK (
        "policy_version" = 'continuous-use-receipt-v1'
        AND "interval_seconds" BETWEEN 1 AND 7200
        AND "due_at" =
          "window_started_at" + ("interval_seconds" * INTERVAL '1 second')
        AND "emitted_at" >= "due_at"
        AND (
          (
            "status" = 'pending'
            AND "version" = 1
            AND "acknowledged_at" IS NULL
            AND "acknowledgement_event_id" IS NULL
          )
          OR
          (
            "status" = 'acknowledged'
            AND "version" = 2
            AND "acknowledged_at" IS NOT NULL
            AND "acknowledged_at" >= "emitted_at"
            AND "acknowledgement_event_id" IS NOT NULL
          )
        )
      )
);

CREATE UNIQUE INDEX "vnext_continuous_use_receipts_id_owner_key"
  ON "vnext_continuous_use_reminder_receipts"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_continuous_use_receipts_emission_event_key"
  ON "vnext_continuous_use_reminder_receipts"("emission_event_id");
CREATE UNIQUE INDEX "vnext_continuous_use_receipts_ack_event_key"
  ON "vnext_continuous_use_reminder_receipts"("acknowledgement_event_id");
CREATE UNIQUE INDEX "vnext_continuous_use_receipts_one_pending_key"
  ON "vnext_continuous_use_reminder_receipts"("compliance_session_id")
  WHERE "status" = 'pending';
CREATE INDEX "vnext_continuous_use_receipts_owner_session_idx"
  ON "vnext_continuous_use_reminder_receipts"(
    "owner_principal_id",
    "experience_session_id",
    "status",
    "emitted_at"
  );
CREATE INDEX "vnext_continuous_use_receipts_compliance_idx"
  ON "vnext_continuous_use_reminder_receipts"(
    "compliance_session_id",
    "status",
    "emitted_at"
  );

ALTER TABLE "vnext_continuous_use_reminder_receipts"
  ADD CONSTRAINT "vnext_continuous_use_reminder_receipts_owner_principal_id_fkey"
    FOREIGN KEY ("owner_principal_id")
    REFERENCES "vnext_principals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_continuous_use_reminder_receipts_experience_session__fkey"
    FOREIGN KEY ("experience_session_id", "owner_principal_id")
    REFERENCES "vnext_experience_sessions"("id", "principal_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vnext_continuous_use_reminder_receipts_compliance_session__fkey"
    FOREIGN KEY (
      "compliance_session_id",
      "experience_session_id",
      "owner_principal_id"
    )
    REFERENCES "vnext_compliance_sessions"(
      "id",
      "experience_session_id",
      "owner_principal_id"
    )
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_outbox_events"
  ADD CONSTRAINT "vnext_continuous_use_receipt_event_shape_check"
    CHECK (
      "event_type" NOT IN (
        'vnext.continuous_use.reminder.emitted.v1',
        'vnext.continuous_use.reminder.acknowledged.v1'
      )
      OR (
        "aggregate_type" = 'continuous_use_reminder_receipt'
        AND "task_id" IS NULL
        AND "payload" ? 'receiptId'
        AND jsonb_typeof("payload" -> 'receiptId') = 'string'
        AND "payload" ->> 'receiptId' = "aggregate_id"::text
        AND "payload" ? 'experienceSessionId'
        AND jsonb_typeof("payload" -> 'experienceSessionId') = 'string'
        AND "payload" ? 'receiptVersion'
        AND jsonb_typeof("payload" -> 'receiptVersion') = 'number'
        AND (
          (
            "event_type" = 'vnext.continuous_use.reminder.emitted.v1'
            AND "aggregate_version" = 1
            AND "payload" -> 'receiptVersion' = '1'::jsonb
            AND "payload" ? 'emittedAt'
            AND jsonb_typeof("payload" -> 'emittedAt') = 'string'
            AND "payload" ? 'intervalSeconds'
            AND jsonb_typeof("payload" -> 'intervalSeconds') = 'number'
            AND (
              "payload" -
              'receiptId' -
              'experienceSessionId' -
              'receiptVersion' -
              'emittedAt' -
              'intervalSeconds'
            ) = '{}'::jsonb
          )
          OR
          (
            "event_type" = 'vnext.continuous_use.reminder.acknowledged.v1'
            AND "aggregate_version" = 2
            AND "payload" -> 'receiptVersion' = '2'::jsonb
            AND "payload" ? 'acknowledgedAt'
            AND jsonb_typeof("payload" -> 'acknowledgedAt') = 'string'
            AND (
              "payload" -
              'receiptId' -
              'experienceSessionId' -
              'receiptVersion' -
              'acknowledgedAt'
            ) = '{}'::jsonb
          )
        )
      )
    );

CREATE FUNCTION "vnext_enforce_continuous_use_receipt_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_window_started_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'pending'
       OR NEW."version" <> 1
       OR NEW."acknowledged_at" IS NOT NULL
       OR NEW."acknowledgement_event_id" IS NOT NULL
    THEN
      RAISE EXCEPTION 'continuous-use receipt must be created pending at version 1'
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(
             compliance."last_duration_reminder_at",
             compliance."continuous_use_started_at"
           )
      INTO current_window_started_at
      FROM "vnext_compliance_sessions" compliance
      JOIN "vnext_experience_sessions" experience
        ON experience."id" = compliance."experience_session_id"
       AND experience."principal_id" = compliance."owner_principal_id"
     WHERE compliance."id" = NEW."compliance_session_id"
       AND compliance."owner_principal_id" = NEW."owner_principal_id"
       AND compliance."experience_session_id" = NEW."experience_session_id"
       AND compliance."status" = 'eligible'
       AND experience."revoked_at" IS NULL
       AND experience."auth_state" <> 'expired'
       AND experience."guest_expires_at" > NEW."emitted_at"
       AND experience."expires_at" > NEW."emitted_at";
    IF NOT FOUND
       OR NEW."window_started_at" IS DISTINCT FROM current_window_started_at
    THEN
      RAISE EXCEPTION 'continuous-use receipt requires the current eligible compliance window'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."owner_principal_id" IS DISTINCT FROM OLD."owner_principal_id"
     OR NEW."experience_session_id" IS DISTINCT FROM OLD."experience_session_id"
     OR NEW."compliance_session_id" IS DISTINCT FROM OLD."compliance_session_id"
     OR NEW."policy_version" IS DISTINCT FROM OLD."policy_version"
     OR NEW."interval_seconds" IS DISTINCT FROM OLD."interval_seconds"
     OR NEW."window_started_at" IS DISTINCT FROM OLD."window_started_at"
     OR NEW."due_at" IS DISTINCT FROM OLD."due_at"
     OR NEW."emitted_at" IS DISTINCT FROM OLD."emitted_at"
     OR NEW."emission_event_id" IS DISTINCT FROM OLD."emission_event_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'continuous-use receipt scope and emission evidence are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'pending'
     AND OLD."version" = 1
     AND OLD."acknowledged_at" IS NULL
     AND OLD."acknowledgement_event_id" IS NULL
     AND NEW."status" = 'acknowledged'
     AND NEW."version" = 2
     AND NEW."acknowledged_at" IS NOT NULL
     AND NEW."acknowledged_at" >= OLD."emitted_at"
     AND NEW."acknowledgement_event_id" IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'continuous-use receipt lifecycle transition is not monotonic'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_continuous_use_receipt_lifecycle_guard"
BEFORE INSERT OR UPDATE ON "vnext_continuous_use_reminder_receipts"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_continuous_use_receipt_lifecycle"();

CREATE FUNCTION "vnext_reject_live_continuous_use_receipt_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "vnext_principals" principal
     WHERE principal."id" = OLD."owner_principal_id"
  ) THEN
    RAISE EXCEPTION 'live continuous-use receipt cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "vnext_continuous_use_receipt_delete_guard"
BEFORE DELETE ON "vnext_continuous_use_reminder_receipts"
FOR EACH ROW
EXECUTE FUNCTION "vnext_reject_live_continuous_use_receipt_delete"();

CREATE FUNCTION "vnext_enforce_continuous_use_outbox_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."aggregate_type" <> 'continuous_use_reminder_receipt'
     AND NEW."aggregate_type" <> 'continuous_use_reminder_receipt'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'continuous-use audit outbox rows are immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "vnext_continuous_use_outbox_lifecycle_guard"
BEFORE UPDATE ON "vnext_outbox_events"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_continuous_use_outbox_lifecycle"();

CREATE FUNCTION "vnext_reject_continuous_use_outbox_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."aggregate_type" = 'continuous_use_reminder_receipt'
     AND EXISTS (
       SELECT 1
         FROM "vnext_continuous_use_reminder_receipts" receipt
        WHERE receipt."id" = OLD."aggregate_id"
          AND receipt."owner_principal_id" = OLD."owner_principal_id"
     )
     AND EXISTS (
       SELECT 1
         FROM "vnext_principals" principal
        WHERE principal."id" = OLD."owner_principal_id"
     )
  THEN
    RAISE EXCEPTION 'committed continuous-use outbox evidence cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "vnext_continuous_use_outbox_delete_guard"
BEFORE DELETE ON "vnext_outbox_events"
FOR EACH ROW
WHEN (OLD."aggregate_type" = 'continuous_use_reminder_receipt')
EXECUTE FUNCTION "vnext_reject_continuous_use_outbox_delete"();

CREATE FUNCTION "vnext_assert_continuous_use_receipt_truth"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  asserted_receipt_id UUID;
  receipt "vnext_continuous_use_reminder_receipts"%ROWTYPE;
  total_event_count INTEGER;
  emitted_event_count INTEGER;
  acknowledged_event_count INTEGER;
  acknowledgement_anchor_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'vnext_continuous_use_reminder_receipts' THEN
    asserted_receipt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    IF TG_OP = 'DELETE' THEN
      IF OLD."aggregate_type" <> 'continuous_use_reminder_receipt' THEN
        RETURN NULL;
      END IF;
      asserted_receipt_id := OLD."aggregate_id";
    ELSE
      IF NEW."aggregate_type" <> 'continuous_use_reminder_receipt' THEN
        RETURN NULL;
      END IF;
      asserted_receipt_id := NEW."aggregate_id";
    END IF;
  END IF;

  SELECT candidate.*
    INTO receipt
    FROM "vnext_continuous_use_reminder_receipts" candidate
   WHERE candidate."id" = asserted_receipt_id;
  IF NOT FOUND THEN
    IF TG_TABLE_NAME = 'vnext_outbox_events' AND TG_OP <> 'DELETE' THEN
      RAISE EXCEPTION 'continuous-use outbox event requires a receipt'
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
    INTO total_event_count
    FROM "vnext_outbox_events" event
   WHERE event."aggregate_type" = 'continuous_use_reminder_receipt'
     AND event."aggregate_id" = receipt."id";

  SELECT COUNT(*)
    INTO emitted_event_count
    FROM "vnext_outbox_events" event
   WHERE event."id" = receipt."emission_event_id"
     AND event."owner_principal_id" = receipt."owner_principal_id"
     AND event."task_id" IS NULL
     AND event."aggregate_type" = 'continuous_use_reminder_receipt'
     AND event."aggregate_id" = receipt."id"
     AND event."aggregate_version" = 1
     AND event."event_type" = 'vnext.continuous_use.reminder.emitted.v1'
     AND event."idempotency_key" =
       'continuous-use-reminder:emitted:' || receipt."id"::text || ':1'
     AND event."status" = 'pending'
     AND event."attempt_count" = 0
     AND event."max_attempts" = 10
     AND event."available_at" = receipt."emitted_at"
     AND event."lease_owner" IS NULL
     AND event."lease_token" IS NULL
     AND event."lease_expires_at" IS NULL
     AND event."published_at" IS NULL
     AND event."last_failure_code" IS NULL
     AND jsonb_typeof(event."payload") = 'object'
     AND (
       event."payload" -
       'receiptId' -
       'experienceSessionId' -
       'receiptVersion' -
       'emittedAt' -
       'intervalSeconds'
     ) = '{}'::jsonb
     AND event."payload" ->> 'receiptId' = receipt."id"::text
     AND event."payload" ->> 'experienceSessionId' = receipt."experience_session_id"::text
     AND event."payload" -> 'receiptVersion' = '1'::jsonb
     AND event."payload" ->> 'emittedAt' =
       to_char(
         receipt."emitted_at" AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
       )
     AND event."payload" -> 'intervalSeconds' =
       to_jsonb(receipt."interval_seconds")
     AND event."payload_digest" = encode(
       sha256(
         convert_to(
           '{"emittedAt":' ||
           to_jsonb(event."payload" ->> 'emittedAt')::text ||
           ',"experienceSessionId":' ||
           to_jsonb(event."payload" ->> 'experienceSessionId')::text ||
           ',"intervalSeconds":' ||
           (event."payload" ->> 'intervalSeconds')::integer::text ||
           ',"receiptId":' ||
           to_jsonb(event."payload" ->> 'receiptId')::text ||
           ',"receiptVersion":1}',
           'UTF8'
         )
       ),
       'hex'
     );

  SELECT COUNT(*)
    INTO acknowledged_event_count
    FROM "vnext_outbox_events" event
   WHERE event."id" = receipt."acknowledgement_event_id"
     AND event."owner_principal_id" = receipt."owner_principal_id"
     AND event."task_id" IS NULL
     AND event."aggregate_type" = 'continuous_use_reminder_receipt'
     AND event."aggregate_id" = receipt."id"
     AND event."aggregate_version" = 2
     AND event."event_type" = 'vnext.continuous_use.reminder.acknowledged.v1'
     AND event."idempotency_key" =
       'continuous-use-reminder:acknowledged:' || receipt."id"::text || ':2'
     AND event."status" = 'pending'
     AND event."attempt_count" = 0
     AND event."max_attempts" = 10
     AND event."available_at" = receipt."acknowledged_at"
     AND event."lease_owner" IS NULL
     AND event."lease_token" IS NULL
     AND event."lease_expires_at" IS NULL
     AND event."published_at" IS NULL
     AND event."last_failure_code" IS NULL
     AND jsonb_typeof(event."payload") = 'object'
     AND (
       event."payload" -
       'receiptId' -
       'experienceSessionId' -
       'receiptVersion' -
       'acknowledgedAt'
     ) = '{}'::jsonb
     AND event."payload" ->> 'receiptId' = receipt."id"::text
     AND event."payload" ->> 'experienceSessionId' = receipt."experience_session_id"::text
     AND event."payload" -> 'receiptVersion' = '2'::jsonb
     AND event."payload" ->> 'acknowledgedAt' =
       to_char(
         receipt."acknowledged_at" AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
       )
     AND event."payload_digest" = encode(
       sha256(
         convert_to(
           '{"acknowledgedAt":' ||
           to_jsonb(event."payload" ->> 'acknowledgedAt')::text ||
           ',"experienceSessionId":' ||
           to_jsonb(event."payload" ->> 'experienceSessionId')::text ||
           ',"receiptId":' ||
           to_jsonb(event."payload" ->> 'receiptId')::text ||
           ',"receiptVersion":2}',
           'UTF8'
         )
       ),
       'hex'
     );

  SELECT COUNT(*)
    INTO acknowledgement_anchor_count
    FROM "vnext_compliance_sessions" compliance
    JOIN "vnext_experience_sessions" experience
      ON experience."id" = compliance."experience_session_id"
     AND experience."principal_id" = compliance."owner_principal_id"
   WHERE compliance."id" = receipt."compliance_session_id"
     AND compliance."owner_principal_id" = receipt."owner_principal_id"
     AND compliance."experience_session_id" = receipt."experience_session_id"
     AND compliance."status" IN ('eligible', 'blocked', 'withdrawn')
     AND experience."revoked_at" IS NULL
     AND experience."auth_state" <> 'expired'
     AND experience."guest_expires_at" > receipt."acknowledged_at"
     AND experience."expires_at" > receipt."acknowledged_at"
     AND compliance."last_duration_reminder_at" = receipt."acknowledged_at"
     AND jsonb_typeof(compliance."audit_refs") = 'array'
     AND jsonb_array_length(compliance."audit_refs") > 0
     AND compliance."audit_refs" ->> (
       jsonb_array_length(compliance."audit_refs") - 1
     ) = 'outbox:' || receipt."acknowledgement_event_id"::text;

  IF emitted_event_count <> 1 THEN
    RAISE EXCEPTION 'continuous-use receipt requires exact emission outbox truth'
      USING ERRCODE = '23514';
  END IF;
  IF receipt."status" = 'pending' THEN
    IF total_event_count <> 1 OR acknowledged_event_count <> 0 THEN
      RAISE EXCEPTION 'pending continuous-use receipt cannot retain acknowledgement truth'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF total_event_count <> 2
       OR acknowledged_event_count <> 1
       OR acknowledgement_anchor_count <> 1
    THEN
      RAISE EXCEPTION 'acknowledged continuous-use receipt requires exact acknowledgement and anchor truth'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "vnext_continuous_use_receipt_truth_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "vnext_continuous_use_reminder_receipts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "vnext_assert_continuous_use_receipt_truth"();

CREATE CONSTRAINT TRIGGER "vnext_continuous_use_outbox_truth_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "vnext_outbox_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "vnext_assert_continuous_use_receipt_truth"();

CREATE FUNCTION "vnext_enforce_continuous_use_anchor"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_resume_ref TEXT;
  matching_receipt_count INTEGER;
BEGIN
  IF NEW."continuous_use_started_at" IS DISTINCT FROM OLD."continuous_use_started_at" THEN
    expected_resume_ref :=
      'continuous-use-resumed:' ||
      to_char(
        NEW."continuous_use_started_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      );
    IF NEW."continuous_use_started_at" <= OLD."continuous_use_started_at"
       OR NEW."last_duration_reminder_at" IS NOT NULL
       OR NEW."version" <> OLD."version" + 1
       OR NEW."audit_refs" <>
         OLD."audit_refs" || jsonb_build_array(expected_resume_ref)
    THEN
      RAISE EXCEPTION 'continuous-use idle reset is not monotonic or auditable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."last_duration_reminder_at" IS NOT DISTINCT FROM OLD."last_duration_reminder_at" THEN
    RETURN NEW;
  END IF;
  IF NEW."last_duration_reminder_at" IS NULL
     OR NEW."last_duration_reminder_at" < NEW."continuous_use_started_at"
     OR (
       OLD."last_duration_reminder_at" IS NOT NULL
       AND NEW."last_duration_reminder_at" <= OLD."last_duration_reminder_at"
     )
     OR NEW."version" <> OLD."version" + 1
  THEN
    RAISE EXCEPTION 'continuous-use acknowledgement anchor is invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO matching_receipt_count
    FROM "vnext_continuous_use_reminder_receipts" receipt
   WHERE receipt."owner_principal_id" = NEW."owner_principal_id"
     AND receipt."experience_session_id" = NEW."experience_session_id"
     AND receipt."compliance_session_id" = NEW."id"
     AND receipt."status" = 'acknowledged'
     AND receipt."version" = 2
     AND receipt."acknowledged_at" = NEW."last_duration_reminder_at"
     AND NEW."audit_refs" =
       OLD."audit_refs" ||
       jsonb_build_array('outbox:' || receipt."acknowledgement_event_id"::text);
  IF matching_receipt_count <> 1 THEN
    RAISE EXCEPTION 'continuous-use anchor requires exact acknowledged receipt truth'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vnext_continuous_use_anchor_guard"
BEFORE UPDATE OF "continuous_use_started_at", "last_duration_reminder_at"
ON "vnext_compliance_sessions"
FOR EACH ROW
EXECUTE FUNCTION "vnext_enforce_continuous_use_anchor"();

COMMIT;
