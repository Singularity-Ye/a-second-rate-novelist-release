BEGIN;

CREATE TYPE "vnext_creative_task_kind" AS ENUM ('understand', 'write_opening', 'revise', 'continue_story');
CREATE TYPE "vnext_creative_task_status" AS ENUM ('queued', 'leased', 'retry_wait', 'succeeded', 'failed', 'cancelled', 'timed_out', 'blocked');
CREATE TYPE "vnext_creative_run_status" AS ENUM ('running', 'succeeded', 'failed', 'timed_out', 'blocked', 'cancelled', 'lease_expired', 'stale_input');
CREATE TYPE "vnext_creative_runtime_mode" AS ENUM ('runtime_worker_synthetic', 'runtime_worker_configured');
CREATE TYPE "vnext_story_content_kind" AS ENUM ('opening', 'scene', 'chapter');
CREATE TYPE "vnext_story_content_status" AS ENUM ('draft', 'revision', 'accepted', 'rejected');
CREATE TYPE "vnext_outbox_event_status" AS ENUM ('pending', 'leased', 'retry_wait', 'published', 'dead_letter');
CREATE TYPE "vnext_worker_kind" AS ENUM ('creative', 'outbox');
CREATE TYPE "vnext_worker_status" AS ENUM ('starting', 'ready', 'draining', 'stopped', 'error');

CREATE TABLE "vnext_creative_tasks" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "source_message_id" UUID,
    "workspace_id" UUID,
    "understanding_id" UUID,
    "commission_id" UUID,
    "request_id" VARCHAR(200) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "kind" "vnext_creative_task_kind" NOT NULL,
    "status" "vnext_creative_task_status" NOT NULL DEFAULT 'queued',
    "input_artifact_versions" JSONB NOT NULL,
    "input_digest" CHAR(64) NOT NULL,
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL DEFAULT 3,
    "state_version" INTEGER NOT NULL DEFAULT 1,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "lease_owner" VARCHAR(200),
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "cancellation_requested_at" TIMESTAMPTZ(6),
    "last_failure_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_creative_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_creative_task_request_check"
      CHECK ("request_id" ~ '[^[:space:]]' AND "idempotency_key" ~ '[^[:space:]]'),
    CONSTRAINT "vnext_creative_task_input_check"
      CHECK (
        jsonb_typeof("input_artifact_versions") = 'object'
        AND "input_digest" ~ '^[0-9a-f]{64}$'
      ),
    CONSTRAINT "vnext_creative_task_attempt_check"
      CHECK (
        "attempt_count" >= 0
        AND "max_attempts" BETWEEN 1 AND 10
        AND "attempt_count" <= "max_attempts"
      ),
    CONSTRAINT "vnext_creative_task_version_check" CHECK ("state_version" > 0),
    CONSTRAINT "vnext_creative_task_time_check"
      CHECK ("deadline_at" > "created_at" AND "available_at" < "deadline_at"),
    CONSTRAINT "vnext_creative_task_lease_check"
      CHECK (
        (
          "status" = 'leased'
          AND "lease_owner" IS NOT NULL
          AND "lease_token" IS NOT NULL
          AND "lease_expires_at" IS NOT NULL
        )
        OR
        (
          "status" <> 'leased'
          AND "lease_owner" IS NULL
          AND "lease_token" IS NULL
          AND "lease_expires_at" IS NULL
        )
      ),
    CONSTRAINT "vnext_creative_task_terminal_check"
      CHECK (
        ("status" IN ('succeeded', 'failed', 'cancelled', 'timed_out', 'blocked'))
        = ("completed_at" IS NOT NULL)
      ),
    CONSTRAINT "vnext_creative_task_started_check"
      CHECK (
        ("attempt_count" = 0 AND "started_at" IS NULL)
        OR ("attempt_count" > 0 AND "started_at" IS NOT NULL)
      ),
    CONSTRAINT "vnext_creative_task_retry_check"
      CHECK ("status" <> 'retry_wait' OR "attempt_count" < "max_attempts"),
    CONSTRAINT "vnext_creative_task_failure_check"
      CHECK (
        ("status" <> 'succeeded' OR "last_failure_code" IS NULL)
        AND (
          "status" NOT IN ('retry_wait', 'failed', 'timed_out', 'blocked')
          OR "last_failure_code" IS NOT NULL
        )
      ),
    CONSTRAINT "vnext_creative_task_artifact_shape_check"
      CHECK (
        (
          "kind" = 'understand'
          AND "source_message_id" IS NOT NULL
          AND "workspace_id" IS NULL
          AND "understanding_id" IS NULL
          AND "commission_id" IS NULL
        )
        OR
        (
          "kind" = 'write_opening'
          AND "source_message_id" IS NULL
          AND "workspace_id" IS NOT NULL
          AND "understanding_id" IS NOT NULL
          AND "commission_id" IS NOT NULL
        )
        OR
        (
          "kind" IN ('revise', 'continue_story')
          AND "source_message_id" IS NULL
          AND "workspace_id" IS NOT NULL
        )
      )
);

CREATE TABLE "vnext_creative_run_traces" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "status" "vnext_creative_run_status" NOT NULL DEFAULT 'running',
    "runtime_mode" "vnext_creative_runtime_mode" NOT NULL,
    "provider_trace_id" VARCHAR(200),
    "provider" VARCHAR(100),
    "model" VARCHAR(200),
    "route" VARCHAR(200),
    "workflow_version" VARCHAR(200),
    "input_artifact_versions" JSONB NOT NULL,
    "input_digest" CHAR(64) NOT NULL,
    "output_hash" CHAR(64),
    "fallback_applied" BOOLEAN,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "failure_code" VARCHAR(100),
    "latency_ms" INTEGER,
    "token_usage" JSONB,
    "cost_micros" BIGINT,
    "sanitized_metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_creative_run_traces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_creative_run_attempt_check" CHECK ("attempt_number" > 0),
    CONSTRAINT "vnext_creative_run_input_check"
      CHECK (
        jsonb_typeof("input_artifact_versions") = 'object'
        AND "input_digest" ~ '^[0-9a-f]{64}$'
        AND jsonb_typeof("sanitized_metadata") = 'object'
      ),
    CONSTRAINT "vnext_creative_run_metric_check"
      CHECK (
        ("latency_ms" IS NULL OR "latency_ms" >= 0)
        AND ("cost_micros" IS NULL OR "cost_micros" >= 0)
      ),
    CONSTRAINT "vnext_creative_run_hash_check"
      CHECK ("output_hash" IS NULL OR "output_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_creative_run_completion_check"
      CHECK (
        (("status" = 'running') = ("completed_at" IS NULL))
        AND ("completed_at" IS NULL OR "completed_at" >= "started_at")
      ),
    CONSTRAINT "vnext_creative_run_success_check"
      CHECK (
        "status" <> 'succeeded'
        OR (
          "provider_trace_id" IS NOT NULL
          AND "provider_trace_id" ~ '[^[:space:]]'
          AND "provider" IS NOT NULL
          AND "provider" ~ '[^[:space:]]'
          AND "model" IS NOT NULL
          AND "model" ~ '[^[:space:]]'
          AND "route" IS NOT NULL
          AND "route" ~ '[^[:space:]]'
          AND "workflow_version" IS NOT NULL
          AND "workflow_version" ~ '[^[:space:]]'
          AND "output_hash" IS NOT NULL
          AND "fallback_applied" IS FALSE
          AND "failure_code" IS NULL
          AND "retryable" = false
        )
      ),
    CONSTRAINT "vnext_creative_run_failure_check"
      CHECK (
        "status" NOT IN ('failed', 'timed_out', 'blocked', 'lease_expired', 'stale_input')
        OR "failure_code" IS NOT NULL
      )
);

CREATE TABLE "vnext_story_contents" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "parent_content_id" UUID,
    "kind" "vnext_story_content_kind" NOT NULL,
    "status" "vnext_story_content_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "body_hash" CHAR(64) NOT NULL,
    "created_by_task_id" UUID NOT NULL,
    "created_by_trace_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_story_contents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_story_content_version_check" CHECK ("version" > 0),
    CONSTRAINT "vnext_story_content_parent_check"
      CHECK ("parent_content_id" IS NULL OR "parent_content_id" <> "id"),
    CONSTRAINT "vnext_story_content_body_check"
      CHECK ("body" ~ '[^[:space:]]' AND char_length("body") <= 200000),
    CONSTRAINT "vnext_story_content_hash_check"
      CHECK ("body_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_story_content_acceptance_check"
      CHECK (("status" = 'accepted') = ("accepted_at" IS NOT NULL))
);

CREATE TABLE "vnext_outbox_events" (
    "id" UUID NOT NULL,
    "owner_principal_id" UUID NOT NULL,
    "task_id" UUID,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_digest" CHAR(64) NOT NULL,
    "status" "vnext_outbox_event_status" NOT NULL DEFAULT 'pending',
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL DEFAULT 10,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "lease_owner" VARCHAR(200),
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "last_failure_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vnext_outbox_identity_check"
      CHECK (
        "aggregate_type" ~ '[^[:space:]]'
        AND "event_type" ~ '[^[:space:]]'
        AND "idempotency_key" ~ '[^[:space:]]'
        AND "aggregate_version" > 0
      ),
    CONSTRAINT "vnext_outbox_payload_check"
      CHECK (jsonb_typeof("payload") = 'object' AND "payload_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "vnext_outbox_attempt_check"
      CHECK (
        "attempt_count" >= 0
        AND "max_attempts" BETWEEN 1 AND 20
        AND "attempt_count" <= "max_attempts"
      ),
    CONSTRAINT "vnext_outbox_lease_check"
      CHECK (
        (
          "status" = 'leased'
          AND "lease_owner" IS NOT NULL
          AND "lease_token" IS NOT NULL
          AND "lease_expires_at" IS NOT NULL
        )
        OR
        (
          "status" <> 'leased'
          AND "lease_owner" IS NULL
          AND "lease_token" IS NULL
          AND "lease_expires_at" IS NULL
        )
      ),
    CONSTRAINT "vnext_outbox_publish_check"
      CHECK (("status" = 'published') = ("published_at" IS NOT NULL))
);

CREATE TABLE "vnext_worker_heartbeats" (
    "worker_id" VARCHAR(200) NOT NULL,
    "kind" "vnext_worker_kind" NOT NULL DEFAULT 'creative',
    "status" "vnext_worker_status" NOT NULL DEFAULT 'starting',
    "runtime_mode" "vnext_creative_runtime_mode" NOT NULL,
    "build_id" VARCHAR(200) NOT NULL,
    "process_id" INTEGER NOT NULL,
    "supported_kinds" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_heartbeat_at" TIMESTAMPTZ(6) NOT NULL,
    "last_claimed_at" TIMESTAMPTZ(6),
    "last_succeeded_at" TIMESTAMPTZ(6),
    "last_failed_at" TIMESTAMPTZ(6),
    "stopped_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vnext_worker_heartbeats_pkey" PRIMARY KEY ("worker_id"),
    CONSTRAINT "vnext_worker_identity_check"
      CHECK ("worker_id" ~ '[^[:space:]]' AND "build_id" ~ '[^[:space:]]' AND "process_id" > 0),
    CONSTRAINT "vnext_worker_metadata_check"
      CHECK (jsonb_typeof("supported_kinds") = 'array' AND jsonb_typeof("metadata") = 'object'),
    CONSTRAINT "vnext_worker_time_check"
      CHECK ("last_heartbeat_at" >= "started_at"),
    CONSTRAINT "vnext_worker_stop_check"
      CHECK (("status" = 'stopped') = ("stopped_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "vnext_creative_tasks_id_owner_key" ON "vnext_creative_tasks"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_creative_tasks_owner_idempotency_key" ON "vnext_creative_tasks"("owner_principal_id", "idempotency_key");
CREATE UNIQUE INDEX "vnext_creative_tasks_owner_request_key" ON "vnext_creative_tasks"("owner_principal_id", "request_id");
CREATE INDEX "vnext_creative_tasks_owner_workspace_status_idx" ON "vnext_creative_tasks"("owner_principal_id", "workspace_id", "status", "updated_at");
CREATE INDEX "vnext_creative_tasks_claim_idx" ON "vnext_creative_tasks"("status", "available_at", "created_at");
CREATE INDEX "vnext_creative_tasks_lease_idx" ON "vnext_creative_tasks"("status", "lease_expires_at");
CREATE INDEX "vnext_creative_tasks_deadline_idx" ON "vnext_creative_tasks"("status", "deadline_at");
CREATE INDEX "vnext_creative_tasks_claim_due_idx" ON "vnext_creative_tasks"("available_at", "created_at", "id") WHERE "status" IN ('queued', 'retry_wait');
CREATE INDEX "vnext_creative_tasks_lease_expired_idx" ON "vnext_creative_tasks"("lease_expires_at", "id") WHERE "status" = 'leased';
CREATE INDEX "vnext_creative_tasks_deadline_due_idx" ON "vnext_creative_tasks"("deadline_at", "id") WHERE "status" IN ('queued', 'retry_wait', 'leased');

CREATE UNIQUE INDEX "vnext_creative_runs_task_attempt_key" ON "vnext_creative_run_traces"("task_id", "attempt_number");
CREATE UNIQUE INDEX "vnext_creative_runs_id_task_owner_key" ON "vnext_creative_run_traces"("id", "task_id", "owner_principal_id");
CREATE INDEX "vnext_creative_runs_owner_task_idx" ON "vnext_creative_run_traces"("owner_principal_id", "task_id", "started_at");

CREATE UNIQUE INDEX "vnext_story_contents_id_owner_key" ON "vnext_story_contents"("id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_story_contents_id_owner_workspace_key" ON "vnext_story_contents"("id", "owner_principal_id", "workspace_id");
CREATE UNIQUE INDEX "vnext_story_contents_task_owner_key" ON "vnext_story_contents"("created_by_task_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_story_contents_trace_owner_key" ON "vnext_story_contents"("created_by_trace_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_story_contents_trace_task_owner_key" ON "vnext_story_contents"("created_by_trace_id", "created_by_task_id", "owner_principal_id");
CREATE UNIQUE INDEX "vnext_story_contents_workspace_version_key" ON "vnext_story_contents"("workspace_id", "owner_principal_id", "version");
CREATE INDEX "vnext_story_contents_owner_workspace_idx" ON "vnext_story_contents"("owner_principal_id", "workspace_id", "status", "created_at");

CREATE UNIQUE INDEX "vnext_outbox_owner_idempotency_key" ON "vnext_outbox_events"("owner_principal_id", "idempotency_key");
CREATE INDEX "vnext_outbox_aggregate_idx" ON "vnext_outbox_events"("aggregate_type", "aggregate_id", "aggregate_version");
CREATE INDEX "vnext_outbox_dispatch_idx" ON "vnext_outbox_events"("status", "available_at", "created_at");
CREATE INDEX "vnext_outbox_lease_idx" ON "vnext_outbox_events"("status", "lease_expires_at");
CREATE INDEX "vnext_outbox_dispatch_due_idx" ON "vnext_outbox_events"("available_at", "created_at", "id") WHERE "status" IN ('pending', 'retry_wait');
CREATE INDEX "vnext_outbox_lease_expired_idx" ON "vnext_outbox_events"("lease_expires_at", "id") WHERE "status" = 'leased';

CREATE INDEX "vnext_worker_heartbeat_readiness_idx" ON "vnext_worker_heartbeats"("kind", "status", "last_heartbeat_at");

ALTER TABLE "vnext_creative_tasks" ADD CONSTRAINT "vnext_creative_tasks_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_creative_tasks" ADD CONSTRAINT "vnext_creative_tasks_source_message_id_owner_principal_id_fkey" FOREIGN KEY ("source_message_id", "owner_principal_id") REFERENCES "vnext_source_messages"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_creative_tasks" ADD CONSTRAINT "vnext_creative_tasks_workspace_id_owner_principal_id_fkey" FOREIGN KEY ("workspace_id", "owner_principal_id") REFERENCES "vnext_story_workspaces"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_creative_tasks" ADD CONSTRAINT "vnext_creative_tasks_understanding_id_owner_principal_id_w_fkey" FOREIGN KEY ("understanding_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_understanding_drafts"("id", "owner_principal_id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_creative_tasks" ADD CONSTRAINT "vnext_creative_tasks_commission_id_owner_principal_id_work_fkey" FOREIGN KEY ("commission_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_commission_briefs"("id", "owner_principal_id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_creative_run_traces" ADD CONSTRAINT "vnext_creative_run_traces_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_creative_run_traces" ADD CONSTRAINT "vnext_creative_run_traces_task_id_owner_principal_id_fkey" FOREIGN KEY ("task_id", "owner_principal_id") REFERENCES "vnext_creative_tasks"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_story_contents" ADD CONSTRAINT "vnext_story_contents_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_story_contents" ADD CONSTRAINT "vnext_story_contents_workspace_id_owner_principal_id_fkey" FOREIGN KEY ("workspace_id", "owner_principal_id") REFERENCES "vnext_story_workspaces"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_story_contents" ADD CONSTRAINT "vnext_story_contents_created_by_task_id_owner_principal_id_fkey" FOREIGN KEY ("created_by_task_id", "owner_principal_id") REFERENCES "vnext_creative_tasks"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_story_contents" ADD CONSTRAINT "vnext_story_contents_created_by_trace_id_created_by_task_i_fkey" FOREIGN KEY ("created_by_trace_id", "created_by_task_id", "owner_principal_id") REFERENCES "vnext_creative_run_traces"("id", "task_id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "vnext_story_contents" ADD CONSTRAINT "vnext_story_contents_parent_content_id_owner_principal_id__fkey" FOREIGN KEY ("parent_content_id", "owner_principal_id", "workspace_id") REFERENCES "vnext_story_contents"("id", "owner_principal_id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "vnext_outbox_events" ADD CONSTRAINT "vnext_outbox_events_owner_principal_id_fkey" FOREIGN KEY ("owner_principal_id") REFERENCES "vnext_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vnext_outbox_events" ADD CONSTRAINT "vnext_outbox_events_task_id_owner_principal_id_fkey" FOREIGN KEY ("task_id", "owner_principal_id") REFERENCES "vnext_creative_tasks"("id", "owner_principal_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

COMMIT;
