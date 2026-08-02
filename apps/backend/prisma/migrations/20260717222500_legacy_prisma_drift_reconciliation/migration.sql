BEGIN;

-- Build the longest explicit index scan before taking AccessExclusive locks on
-- the other legacy tables. The validated FK rebuilds below also scan child rows,
-- and the transaction holds acquired locks through COMMIT. This is intentionally
-- non-concurrent so the migration remains atomic; production rollout still
-- requires a lock-budget / maintenance-window rehearsal.
CREATE INDEX "story_workspaces_account_id_title_idx"
  ON "story_workspaces"("account_id", "title");

-- Align legacy JSON columns with the current datamodel. Existing values are preserved.
ALTER TABLE "story_intake_sessions" ALTER COLUMN "brief_payload" DROP DEFAULT;
ALTER TABLE "story_proposals" ALTER COLUMN "payload" DROP DEFAULT;
ALTER TABLE "story_workspaces" ALTER COLUMN "keywords" DROP DEFAULT;

-- Historical migrations omitted ON UPDATE CASCADE. Rebuild each key atomically so
-- existing valid rows remain protected and future primary-key updates cascade.
ALTER TABLE "story_intake_sessions"
  DROP CONSTRAINT "story_intake_sessions_account_id_fkey",
  ADD CONSTRAINT "story_intake_sessions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_proposals"
  DROP CONSTRAINT "story_proposals_session_id_fkey",
  ADD CONSTRAINT "story_proposals_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "story_intake_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_workspaces"
  DROP CONSTRAINT "story_workspaces_account_id_fkey",
  ADD CONSTRAINT "story_workspaces_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
