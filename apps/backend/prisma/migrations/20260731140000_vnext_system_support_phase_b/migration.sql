BEGIN;

CREATE TYPE "vnext_system_support_command_type" AS ENUM (
  'register_source',
  'issue_subsystem_directive',
  'publish_host_task',
  'record_host_choice',
  'compile_encounter',
  'record_manifestation',
  'record_creative_attempt',
  'record_formal_evidence',
  'close_day'
);

CREATE TYPE "vnext_system_support_command_actor" AS ENUM (
  'main_system',
  'subsystem',
  'novelist',
  'life_runtime',
  'creative_runtime',
  'system_runtime'
);

CREATE TYPE "vnext_system_support_fact_type" AS ENUM (
  'source_material',
  'subsystem_directive',
  'host_task_draft',
  'published_host_task',
  'host_task_choice',
  'encounter_plan',
  'encounter_manifestation',
  'creative_attempt',
  'formal_work_evidence',
  'day_close'
);

CREATE TABLE "vnext_system_support_cases" (
  "id" UUID NOT NULL,
  "owner_principal_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "aggregate_version" INTEGER NOT NULL DEFAULT 1,
  "version_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "vnext_system_support_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vnext_system_support_cases_aggregate_version_check"
    CHECK ("aggregate_version" >= 1)
);

CREATE TABLE "vnext_system_support_commands" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "owner_principal_id" UUID NOT NULL,
  "client_request_id" VARCHAR(200) NOT NULL,
  "command_type" "vnext_system_support_command_type" NOT NULL,
  "actor" "vnext_system_support_command_actor" NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "based_on_version_id" UUID,
  "result_version_id" UUID NOT NULL,
  "result_aggregate_version" INTEGER NOT NULL,
  "first_fact_sequence" INTEGER NOT NULL,
  "last_fact_sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vnext_system_support_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vnext_system_support_commands_digest_check"
    CHECK ("request_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "vnext_system_support_commands_version_check"
    CHECK ("result_aggregate_version" >= 1),
  CONSTRAINT "vnext_system_support_commands_fact_range_check"
    CHECK (
      "first_fact_sequence" >= 1
      AND "last_fact_sequence" >= "first_fact_sequence"
    ),
  CONSTRAINT "vnext_system_support_commands_basis_check"
    CHECK (
      ("command_type" = 'register_source' AND "based_on_version_id" IS NULL)
      OR
      ("command_type" <> 'register_source' AND "based_on_version_id" IS NOT NULL)
    ),
  CONSTRAINT "vnext_system_support_commands_actor_check"
    CHECK (
      ("command_type" IN ('register_source', 'publish_host_task') AND "actor" = 'main_system')
      OR ("command_type" = 'issue_subsystem_directive' AND "actor" = 'subsystem')
      OR ("command_type" = 'record_host_choice' AND "actor" = 'novelist')
      OR ("command_type" = 'compile_encounter' AND "actor" = 'system_runtime')
      OR ("command_type" = 'record_manifestation' AND "actor" = 'life_runtime')
      OR ("command_type" IN ('record_creative_attempt', 'record_formal_evidence') AND "actor" = 'creative_runtime')
      OR ("command_type" = 'close_day' AND "actor" = 'system_runtime')
    )
);

CREATE TABLE "vnext_system_support_facts" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "owner_principal_id" UUID NOT NULL,
  "command_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "fact_type" "vnext_system_support_fact_type" NOT NULL,
  "payload" JSONB NOT NULL,
  "payload_digest" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vnext_system_support_facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vnext_system_support_facts_sequence_check"
    CHECK ("sequence" >= 1),
  CONSTRAINT "vnext_system_support_facts_digest_check"
    CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "vnext_system_support_facts_payload_check"
    CHECK (
      jsonb_typeof("payload") = 'object'
      AND "payload" ->> 'schemaVersion' = '1'
    )
);

CREATE UNIQUE INDEX "vnext_system_support_cases_version_key"
  ON "vnext_system_support_cases"("version_id");
CREATE UNIQUE INDEX "vnext_system_support_cases_id_owner_key"
  ON "vnext_system_support_cases"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_system_support_cases_scope_key"
  ON "vnext_system_support_cases"("id", "owner_principal_id", "workspace_id");
CREATE INDEX "vnext_system_support_cases_owner_workspace_idx"
  ON "vnext_system_support_cases"("owner_principal_id", "workspace_id", "updated_at");

CREATE UNIQUE INDEX "vnext_system_support_commands_scope_key"
  ON "vnext_system_support_commands"("id", "case_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_system_support_commands_owner_request_key"
  ON "vnext_system_support_commands"("owner_principal_id", "client_request_id");
CREATE UNIQUE INDEX "vnext_system_support_commands_case_version_key"
  ON "vnext_system_support_commands"("case_id", "result_aggregate_version");
CREATE UNIQUE INDEX "vnext_system_support_commands_case_version_id_key"
  ON "vnext_system_support_commands"("case_id", "result_version_id");
CREATE INDEX "vnext_system_support_commands_case_created_idx"
  ON "vnext_system_support_commands"("case_id", "created_at");

CREATE UNIQUE INDEX "vnext_system_support_facts_case_sequence_key"
  ON "vnext_system_support_facts"("case_id", "sequence");
CREATE UNIQUE INDEX "vnext_system_support_facts_scope_key"
  ON "vnext_system_support_facts"("id", "case_id", "owner_principal_id");
CREATE INDEX "vnext_system_support_facts_case_type_idx"
  ON "vnext_system_support_facts"("case_id", "fact_type", "sequence");

ALTER TABLE "vnext_system_support_cases"
  ADD CONSTRAINT "vnext_system_support_cases_owner_principal_id_fkey"
  FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_system_support_cases"
  ADD CONSTRAINT "vnext_system_support_cases_workspace_id_owner_principal_id_fkey"
  FOREIGN KEY ("workspace_id", "owner_principal_id")
  REFERENCES "vnext_story_workspaces"("id", "owner_principal_id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "vnext_system_support_commands"
  ADD CONSTRAINT "vnext_system_support_commands_case_id_owner_principal_id_fkey"
  FOREIGN KEY ("case_id", "owner_principal_id")
  REFERENCES "vnext_system_support_cases"("id", "owner_principal_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_system_support_facts"
  ADD CONSTRAINT "vnext_system_support_facts_case_id_owner_principal_id_fkey"
  FOREIGN KEY ("case_id", "owner_principal_id")
  REFERENCES "vnext_system_support_cases"("id", "owner_principal_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_system_support_facts"
  ADD CONSTRAINT "vnext_system_support_facts_command_id_case_id_owner_princi_fkey"
  FOREIGN KEY ("command_id", "case_id", "owner_principal_id")
  REFERENCES "vnext_system_support_commands"("id", "case_id", "owner_principal_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "vnext_reject_system_support_fact_update"()
RETURNS trigger AS $function$
BEGIN
  RAISE EXCEPTION 'system support facts are immutable'
    USING ERRCODE = '23514';
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "vnext_system_support_facts_immutable"
BEFORE UPDATE ON "vnext_system_support_facts"
FOR EACH ROW EXECUTE FUNCTION "vnext_reject_system_support_fact_update"();

COMMIT;
