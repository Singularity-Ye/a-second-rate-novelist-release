CREATE TABLE "app_state_snapshots" (
  "state_key" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "state_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_state_snapshots_pkey" PRIMARY KEY ("state_key")
);
