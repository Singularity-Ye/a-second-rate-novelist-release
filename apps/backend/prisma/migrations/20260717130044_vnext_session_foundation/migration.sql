-- CreateEnum
CREATE TYPE "vnext_principal_kind" AS ENUM ('guest', 'account');

-- CreateEnum
CREATE TYPE "vnext_experience_auth_state" AS ENUM ('guest_active', 'binding', 'account_active', 'expired');

-- CreateEnum
CREATE TYPE "vnext_audience_mode" AS ENUM ('internal', 'verified_adult_external');

-- CreateEnum
CREATE TYPE "vnext_input_policy" AS ENUM ('synthetic_only', 'real_input');

-- CreateEnum
CREATE TYPE "vnext_compliance_status" AS ENUM ('pending', 'eligible', 'withdrawn', 'blocked', 'expired');

-- CreateEnum
CREATE TYPE "vnext_age_verification_status" AS ENUM ('pending', 'verified_adult', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "vnext_principals" (
    "id" UUID NOT NULL,
    "kind" "vnext_principal_kind" NOT NULL DEFAULT 'guest',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vnext_principals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vnext_experience_sessions" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "cookie_token_hash" CHAR(64) NOT NULL,
    "client_request_id" UUID NOT NULL,
    "bootstrap_recovery_secret_hash" CHAR(64) NOT NULL,
    "projection_version_id" UUID NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'vnext',
    "auth_state" "vnext_experience_auth_state" NOT NULL DEFAULT 'guest_active',
    "age_mode" "vnext_age_verification_status" NOT NULL DEFAULT 'pending',
    "ai_identity_acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
    "guest_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vnext_experience_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_experience_sessions_cookie_hash_check" CHECK ("cookie_token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_experience_sessions_recovery_hash_check" CHECK ("bootstrap_recovery_secret_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_experience_sessions_guest_expiry_check" CHECK ("guest_expires_at" <= "expires_at")
);

-- CreateTable
CREATE TABLE "vnext_compliance_sessions" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "experience_session_id" UUID NOT NULL,
    "audience_mode" "vnext_audience_mode" NOT NULL,
    "input_policy" "vnext_input_policy" NOT NULL,
    "admission_policy_version" TEXT NOT NULL,
    "ai_identity_notice_version" TEXT NOT NULL,
    "ai_identity_acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
    "service_terms_version" TEXT NOT NULL,
    "service_terms_accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "privacy_notice_version" TEXT NOT NULL,
    "privacy_notice_acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
    "age_verification_status" "vnext_age_verification_status" NOT NULL DEFAULT 'pending',
    "age_verification_ref" TEXT,
    "safety_contact_ref" TEXT,
    "continuous_use_started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_duration_reminder_at" TIMESTAMPTZ(6),
    "status" "vnext_compliance_status" NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "processing_basis_refs" JSONB NOT NULL DEFAULT '[]',
    "consent_refs" JSONB NOT NULL DEFAULT '[]',
    "safety_case_refs" JSONB NOT NULL DEFAULT '[]',
    "audit_refs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vnext_compliance_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_compliance_sessions_version_check" CHECK ("version" > 0),
    CONSTRAINT "vnext_compliance_sessions_processing_refs_check" CHECK (jsonb_typeof("processing_basis_refs") = 'array'),
    CONSTRAINT "vnext_compliance_sessions_consent_refs_check" CHECK (jsonb_typeof("consent_refs") = 'array'),
    CONSTRAINT "vnext_compliance_sessions_safety_refs_check" CHECK (jsonb_typeof("safety_case_refs") = 'array'),
    CONSTRAINT "vnext_compliance_sessions_audit_refs_check" CHECK (jsonb_typeof("audit_refs") = 'array')
);

-- CreateIndex
CREATE UNIQUE INDEX "vnext_experience_sessions_cookie_token_hash_key" ON "vnext_experience_sessions"("cookie_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_experience_sessions_client_request_id_key" ON "vnext_experience_sessions"("client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_experience_sessions_bootstrap_recovery_secret_hash_key" ON "vnext_experience_sessions"("bootstrap_recovery_secret_hash");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_experience_sessions_projection_version_id_key" ON "vnext_experience_sessions"("projection_version_id");

-- CreateIndex
CREATE INDEX "vnext_experience_sessions_principal_id_expires_at_idx" ON "vnext_experience_sessions"("principal_id", "expires_at");

-- CreateIndex
CREATE INDEX "vnext_experience_sessions_auth_state_expires_at_idx" ON "vnext_experience_sessions"("auth_state", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_experience_sessions_id_principal_id_key" ON "vnext_experience_sessions"("id", "principal_id");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_compliance_sessions_experience_session_id_key" ON "vnext_compliance_sessions"("experience_session_id");

-- CreateIndex
CREATE INDEX "vnext_compliance_sessions_owner_principal_id_status_idx" ON "vnext_compliance_sessions"("owner_principal_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vnext_compliance_sessions_experience_session_id_owner_princ_key" ON "vnext_compliance_sessions"("experience_session_id", "owner_principal_id");

-- AddForeignKey
ALTER TABLE "vnext_experience_sessions" ADD CONSTRAINT "vnext_experience_sessions_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vnext_compliance_sessions" ADD CONSTRAINT "vnext_compliance_sessions_experience_session_id_owner_prin_fkey" FOREIGN KEY ("experience_session_id", "owner_principal_id") REFERENCES "vnext_experience_sessions"("id", "principal_id") ON DELETE CASCADE ON UPDATE CASCADE;
