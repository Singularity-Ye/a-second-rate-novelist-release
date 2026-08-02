-- DropForeignKey
ALTER TABLE "story_intake_sessions" DROP CONSTRAINT "story_intake_sessions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "story_proposals" DROP CONSTRAINT "story_proposals_session_id_fkey";

-- DropForeignKey
ALTER TABLE "story_workspaces" DROP CONSTRAINT "story_workspaces_account_id_fkey";

-- AlterTable
ALTER TABLE "story_intake_sessions" ALTER COLUMN "brief_payload" DROP DEFAULT;

-- AlterTable
ALTER TABLE "story_proposals" ALTER COLUMN "payload" DROP DEFAULT;

-- AlterTable
ALTER TABLE "story_workspaces" ALTER COLUMN "keywords" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "story_workspaces_account_id_title_idx" ON "story_workspaces"("account_id", "title");

-- AddForeignKey
ALTER TABLE "story_intake_sessions" ADD CONSTRAINT "story_intake_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_proposals" ADD CONSTRAINT "story_proposals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "story_intake_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_workspaces" ADD CONSTRAINT "story_workspaces_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
