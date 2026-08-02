BEGIN;

CREATE TYPE "vnext_model_purpose" AS ENUM (
  'conversation',
  'analysis'
);

CREATE TABLE "vnext_model_preferences" (
  "id" UUID NOT NULL,
  "owner_principal_id" UUID NOT NULL,
  "purpose" "vnext_model_purpose" NOT NULL,
  "profile_id" VARCHAR(32) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "vnext_model_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vnext_model_preferences_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "vnext_model_preferences_profile_id_check"
    CHECK ("profile_id" IN ('deepseek', 'gpt', 'gemini', 'grok'))
);

CREATE UNIQUE INDEX "vnext_model_preferences_owner_purpose_key"
  ON "vnext_model_preferences"("owner_principal_id", "purpose");

CREATE INDEX "vnext_model_preferences_profile_purpose_idx"
  ON "vnext_model_preferences"("profile_id", "purpose");

ALTER TABLE "vnext_model_preferences"
  ADD CONSTRAINT "vnext_model_preferences_owner_principal_id_fkey"
  FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
