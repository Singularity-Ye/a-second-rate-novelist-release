BEGIN;

CREATE TYPE "vnext_source_message_action" AS ENUM ('commission', 'correction', 'boundary_update');
CREATE TYPE "vnext_understanding_status" AS ENUM ('proposed', 'corrected', 'confirmed', 'expired');
CREATE TYPE "vnext_story_workspace_status" AS ENUM ('forming', 'active', 'paused', 'archived');
CREATE TYPE "vnext_commission_status" AS ENUM ('draft', 'active', 'superseded');
CREATE TYPE "vnext_reader_memory_scope" AS ENUM ('principal');
CREATE TYPE "vnext_reader_memory_item_kind" AS ENUM ('taste', 'hard_boundary');
CREATE TYPE "vnext_reader_memory_item_status" AS ENUM ('provisional', 'confirmed', 'active', 'revoked');

CREATE TABLE "vnext_source_messages" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "experience_session_id" UUID NOT NULL,
    "client_request_id" VARCHAR(200) NOT NULL,
    "action" "vnext_source_message_action" NOT NULL,
    "body" TEXT NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "based_on_understanding_id" UUID,
    "based_on_version" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vnext_source_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_source_request_digest_check"
      CHECK ("request_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_source_request_id_check"
      CHECK (char_length("client_request_id") <= 200 AND "client_request_id" ~ '[^[:space:]]'),
    CONSTRAINT "vnext_source_body_check"
      CHECK (char_length("body") <= 50000 AND "body" ~ '[^[:space:]]'),
    CONSTRAINT "vnext_source_based_on_pair_check"
      CHECK (("based_on_understanding_id" IS NULL) = ("based_on_version" IS NULL)),
    CONSTRAINT "vnext_source_based_on_version_check"
      CHECK ("based_on_version" IS NULL OR "based_on_version" > 0),
    CONSTRAINT "vnext_source_action_basis_check"
      CHECK (
        ("action" = 'commission' AND "based_on_understanding_id" IS NULL)
        OR
        ("action" IN ('correction', 'boundary_update') AND "based_on_understanding_id" IS NOT NULL)
      )
);

CREATE TABLE "vnext_story_workspaces" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "origin_source_message_id" UUID NOT NULL,
    "status" "vnext_story_workspace_status" NOT NULL DEFAULT 'forming',
    "aggregate_version" INTEGER NOT NULL DEFAULT 1,
    "publication_digest" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_story_workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_workspace_version_check" CHECK ("aggregate_version" > 0),
    CONSTRAINT "vnext_workspace_digest_check"
      CHECK ("publication_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "vnext_understanding_drafts" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_message_id" UUID NOT NULL,
    "supersedes_understanding_id" UUID,
    "story_desire" TEXT NOT NULL,
    "emotional_target" TEXT NOT NULL,
    "relationship_tension" TEXT NOT NULL,
    "hard_boundaries" JSONB NOT NULL DEFAULT '[]',
    "clarification_questions" JSONB NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
    "user_correction" TEXT,
    "status" "vnext_understanding_status" NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload_digest" CHAR(64) NOT NULL,
    "publication_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_understanding_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_understanding_text_check"
      CHECK (
        "story_desire" ~ '[^[:space:]]'
        AND "emotional_target" ~ '[^[:space:]]'
        AND "relationship_tension" ~ '[^[:space:]]'
      ),
    CONSTRAINT "vnext_understanding_boundaries_check"
      CHECK (jsonb_typeof("hard_boundaries") = 'array'),
    CONSTRAINT "vnext_understanding_questions_check"
      CHECK (
        jsonb_typeof("clarification_questions") = 'array'
        AND jsonb_array_length("clarification_questions") <= 1
      ),
    CONSTRAINT "vnext_understanding_confidence_check"
      CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "vnext_understanding_version_check" CHECK ("version" > 0),
    CONSTRAINT "vnext_understanding_digest_check"
      CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_understanding_snapshot_check"
      CHECK (jsonb_typeof("publication_snapshot") = 'object'),
    CONSTRAINT "vnext_understanding_supersedes_check"
      CHECK ("supersedes_understanding_id" IS NULL OR "supersedes_understanding_id" <> "id")
);

CREATE TABLE "vnext_commission_briefs" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_understanding_id" UUID NOT NULL,
    "supersedes_commission_id" UUID,
    "premise" TEXT NOT NULL,
    "emotional_promise" TEXT NOT NULL,
    "relationship_core" TEXT NOT NULL,
    "style_constraints" JSONB NOT NULL DEFAULT '[]',
    "hard_boundaries" JSONB NOT NULL DEFAULT '[]',
    "continuation_intent" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "vnext_commission_status" NOT NULL DEFAULT 'draft',
    "payload_digest" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_commission_briefs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_commission_text_check"
      CHECK (
        "premise" ~ '[^[:space:]]'
        AND "emotional_promise" ~ '[^[:space:]]'
        AND "relationship_core" ~ '[^[:space:]]'
        AND "continuation_intent" ~ '[^[:space:]]'
      ),
    CONSTRAINT "vnext_commission_style_check"
      CHECK (jsonb_typeof("style_constraints") = 'array'),
    CONSTRAINT "vnext_commission_boundaries_check"
      CHECK (jsonb_typeof("hard_boundaries") = 'array'),
    CONSTRAINT "vnext_commission_version_check" CHECK ("version" > 0),
    CONSTRAINT "vnext_commission_digest_check"
      CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_commission_supersedes_check"
      CHECK ("supersedes_commission_id" IS NULL OR "supersedes_commission_id" <> "id")
);

CREATE TABLE "vnext_reader_memories" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "scope" "vnext_reader_memory_scope" NOT NULL DEFAULT 'principal',
    "participation_style" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_reader_memories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_reader_memory_version_check" CHECK ("version" > 0)
);

CREATE TABLE "vnext_reader_memory_items" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "reader_memory_id" UUID NOT NULL,
    "item_kind" "vnext_reader_memory_item_kind" NOT NULL,
    "value" TEXT NOT NULL,
    "value_digest" CHAR(64) NOT NULL,
    "evidence_value" TEXT NOT NULL,
    "source_message_id" UUID NOT NULL,
    "evidence_start" INTEGER NOT NULL,
    "evidence_end" INTEGER NOT NULL,
    "status" "vnext_reader_memory_item_status" NOT NULL,
    "confidence" REAL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_item_id" UUID,
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_reader_memory_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_memory_item_value_check"
      CHECK (char_length("value") <= 1000 AND "value" ~ '[^[:space:]]'),
    CONSTRAINT "vnext_memory_item_evidence_check"
      CHECK (char_length("evidence_value") <= 1000 AND "evidence_value" ~ '[^[:space:]]'),
    CONSTRAINT "vnext_memory_item_digest_check"
      CHECK ("value_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_memory_item_range_check"
      CHECK ("evidence_start" >= 0 AND "evidence_end" > "evidence_start"),
    CONSTRAINT "vnext_memory_item_version_check" CHECK ("version" > 0),
    CONSTRAINT "vnext_memory_item_supersedes_check"
      CHECK ("supersedes_item_id" IS NULL OR "supersedes_item_id" <> "id"),
    CONSTRAINT "vnext_memory_item_kind_status_check"
      CHECK (
        (
          "item_kind" = 'hard_boundary'
          AND "status" IN ('active', 'revoked')
          AND "confidence" IS NULL
        )
        OR
        (
          "item_kind" = 'taste'
          AND "status" IN ('provisional', 'confirmed', 'revoked')
          AND "confidence" IS NOT NULL
          AND "confidence" >= 0
          AND "confidence" <= 1
        )
      ),
    CONSTRAINT "vnext_memory_item_active_check"
      CHECK ("status" <> 'active' OR "superseded_at" IS NULL)
);

CREATE INDEX "vnext_source_messages_owner_created_idx" ON "vnext_source_messages"("owner_principal_id", "created_at");
CREATE UNIQUE INDEX "vnext_source_messages_id_owner_key" ON "vnext_source_messages"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_source_messages_owner_request_key" ON "vnext_source_messages"("owner_principal_id", "client_request_id");

CREATE INDEX "vnext_story_workspaces_owner_status_idx" ON "vnext_story_workspaces"("owner_principal_id", "status", "updated_at");
CREATE UNIQUE INDEX "vnext_story_workspaces_id_owner_key" ON "vnext_story_workspaces"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_story_workspaces_owner_origin_key" ON "vnext_story_workspaces"("origin_source_message_id", "owner_principal_id");

CREATE INDEX "vnext_understandings_owner_workspace_idx" ON "vnext_understanding_drafts"("owner_principal_id", "workspace_id", "status");
CREATE UNIQUE INDEX "vnext_understandings_id_owner_key" ON "vnext_understanding_drafts"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_understandings_id_owner_version_key" ON "vnext_understanding_drafts"("id", "owner_principal_id", "version");
CREATE UNIQUE INDEX "vnext_understandings_id_owner_workspace_key" ON "vnext_understanding_drafts"("id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_understandings_owner_source_key" ON "vnext_understanding_drafts"("source_message_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_understandings_supersedes_key" ON "vnext_understanding_drafts"("supersedes_understanding_id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_understandings_workspace_version_key" ON "vnext_understanding_drafts"("workspace_id", "owner_principal_id", "version");
CREATE UNIQUE INDEX "vnext_understandings_one_current_key"
  ON "vnext_understanding_drafts"("workspace_id", "owner_principal_id")
  WHERE "status" IN ('proposed', 'corrected', 'confirmed');

CREATE INDEX "vnext_commissions_owner_workspace_idx" ON "vnext_commission_briefs"("owner_principal_id", "workspace_id", "status");
CREATE UNIQUE INDEX "vnext_commissions_id_owner_key" ON "vnext_commission_briefs"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_commissions_id_owner_workspace_key" ON "vnext_commission_briefs"("id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_commissions_owner_understanding_key" ON "vnext_commission_briefs"("source_understanding_id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_commissions_supersedes_key" ON "vnext_commission_briefs"("supersedes_commission_id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_commissions_workspace_version_key" ON "vnext_commission_briefs"("workspace_id", "owner_principal_id", "version");
CREATE UNIQUE INDEX "vnext_commissions_one_current_key"
  ON "vnext_commission_briefs"("workspace_id", "owner_principal_id")
  WHERE "status" IN ('draft', 'active');

CREATE UNIQUE INDEX "vnext_reader_memories_owner_key" ON "vnext_reader_memories"("owner_principal_id");
CREATE UNIQUE INDEX "vnext_reader_memories_id_owner_key" ON "vnext_reader_memories"("id", "owner_principal_id");

CREATE INDEX "vnext_memory_items_owner_active_idx" ON "vnext_reader_memory_items"("owner_principal_id", "item_kind", "status", "superseded_at");
CREATE UNIQUE INDEX "vnext_memory_items_id_owner_key" ON "vnext_reader_memory_items"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_memory_items_supersedes_key" ON "vnext_reader_memory_items"("supersedes_item_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_memory_items_source_evidence_key" ON "vnext_reader_memory_items"("owner_principal_id", "source_message_id", "evidence_start", "evidence_end", "item_kind");
CREATE UNIQUE INDEX "vnext_memory_items_active_digest_key"
  ON "vnext_reader_memory_items"("owner_principal_id", "value_digest")
  WHERE "item_kind" = 'hard_boundary' AND "status" = 'active' AND "superseded_at" IS NULL;

ALTER TABLE "vnext_source_messages" ADD CONSTRAINT "vnext_source_messages_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_source_messages" ADD CONSTRAINT "vnext_source_messages_experience_session_id_owner_principa_fkey" FOREIGN KEY ("experience_session_id", "owner_principal_id") REFERENCES "vnext_experience_sessions"("id", "principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_source_messages" ADD CONSTRAINT "vnext_source_messages_based_on_understanding_id_owner_prin_fkey" FOREIGN KEY ("based_on_understanding_id", "owner_principal_id", "based_on_version") REFERENCES "vnext_understanding_drafts"("id", "owner_principal_id", "version") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_story_workspaces" ADD CONSTRAINT "vnext_story_workspaces_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_story_workspaces" ADD CONSTRAINT "vnext_story_workspaces_origin_source_message_id_owner_prin_fkey" FOREIGN KEY ("origin_source_message_id", "owner_principal_id") REFERENCES "vnext_source_messages"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_understanding_drafts" ADD CONSTRAINT "vnext_understanding_drafts_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_understanding_drafts" ADD CONSTRAINT "vnext_understanding_drafts_workspace_id_owner_principal_id_fkey" FOREIGN KEY ("workspace_id", "owner_principal_id") REFERENCES "vnext_story_workspaces"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_understanding_drafts" ADD CONSTRAINT "vnext_understanding_drafts_source_message_id_owner_princip_fkey" FOREIGN KEY ("source_message_id", "owner_principal_id") REFERENCES "vnext_source_messages"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_understanding_drafts" ADD CONSTRAINT "vnext_understanding_drafts_supersedes_understanding_id_own_fkey" FOREIGN KEY ("supersedes_understanding_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_understanding_drafts"("id", "owner_principal_id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_commission_briefs" ADD CONSTRAINT "vnext_commission_briefs_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_commission_briefs" ADD CONSTRAINT "vnext_commission_briefs_workspace_id_owner_principal_id_fkey" FOREIGN KEY ("workspace_id", "owner_principal_id") REFERENCES "vnext_story_workspaces"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_commission_briefs" ADD CONSTRAINT "vnext_commission_briefs_source_understanding_id_owner_prin_fkey" FOREIGN KEY ("source_understanding_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_understanding_drafts"("id", "owner_principal_id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_commission_briefs" ADD CONSTRAINT "vnext_commission_briefs_supersedes_commission_id_owner_pri_fkey" FOREIGN KEY ("supersedes_commission_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_commission_briefs"("id", "owner_principal_id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_reader_memories" ADD CONSTRAINT "vnext_reader_memories_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vnext_reader_memory_items" ADD CONSTRAINT "vnext_reader_memory_items_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_reader_memory_items" ADD CONSTRAINT "vnext_reader_memory_items_reader_memory_id_owner_principal_fkey" FOREIGN KEY ("reader_memory_id", "owner_principal_id") REFERENCES "vnext_reader_memories"("id", "owner_principal_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_reader_memory_items" ADD CONSTRAINT "vnext_reader_memory_items_source_message_id_owner_principa_fkey" FOREIGN KEY ("source_message_id", "owner_principal_id") REFERENCES "vnext_source_messages"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_reader_memory_items" ADD CONSTRAINT "vnext_reader_memory_items_supersedes_item_id_owner_princip_fkey" FOREIGN KEY ("supersedes_item_id", "owner_principal_id") REFERENCES "vnext_reader_memory_items"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

COMMIT;
