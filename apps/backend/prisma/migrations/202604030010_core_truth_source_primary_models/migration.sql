CREATE TABLE "account_sessions" (
    "session_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "device_id" TEXT,
    "device_type" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("session_id")
);

CREATE INDEX "account_sessions_account_id_idx" ON "account_sessions"("account_id");
CREATE INDEX "account_sessions_account_id_device_id_idx" ON "account_sessions"("account_id", "device_id");
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "normalized_messages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "channel_message_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "normalized_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "normalized_messages_account_id_created_at_idx" ON "normalized_messages"("account_id", "created_at");

CREATE TABLE "chat_route_decisions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "candidate_story_ids" JSONB NOT NULL,
    "selected_story_id" UUID,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "route_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason_summary" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chat_route_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_route_decisions_account_id_created_at_idx" ON "chat_route_decisions"("account_id", "created_at");
CREATE INDEX "chat_route_decisions_message_id_idx" ON "chat_route_decisions"("message_id");

CREATE TABLE "message_intents" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "channel_message_id" TEXT,
    "final_intent" TEXT NOT NULL,
    "intent_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "target_label" TEXT NOT NULL,
    "ack_copy" TEXT NOT NULL,
    "deep_link" TEXT,
    "confidence_band" TEXT NOT NULL,
    "patch_document" JSONB,
    "status" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "message_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_intents_message_id_key" ON "message_intents"("message_id");
CREATE INDEX "message_intents_account_id_updated_at_idx" ON "message_intents"("account_id", "updated_at");

CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "generation_job_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chapters_story_id_created_at_idx" ON "chapters"("story_id", "created_at");
CREATE INDEX "chapters_story_id_chapter_no_idx" ON "chapters"("story_id", "chapter_no");

CREATE TABLE "chapter_revisions" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "revision_kind" TEXT NOT NULL,
    "instruction_text" TEXT NOT NULL,
    "anchor_range" JSONB,
    "revised_text" TEXT NOT NULL,
    "source_intent_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chapter_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chapter_revisions_chapter_id_created_at_idx" ON "chapter_revisions"("chapter_id", "created_at");

CREATE TABLE "runtime_tasks" (
    "id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "story_id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notification_id" UUID,
    "result_chapter_id" UUID,
    "client_request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "runtime_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "runtime_tasks_story_id_created_at_idx" ON "runtime_tasks"("story_id", "created_at");
CREATE INDEX "runtime_tasks_status_created_at_idx" ON "runtime_tasks"("status", "created_at");

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deep_link" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT,
    "source_type" TEXT,
    "source_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_account_id_created_at_idx" ON "notifications"("account_id", "created_at");
