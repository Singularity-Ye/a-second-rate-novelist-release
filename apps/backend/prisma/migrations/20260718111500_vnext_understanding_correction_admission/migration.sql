BEGIN;

ALTER TABLE "vnext_creative_tasks"
  DROP CONSTRAINT "vnext_creative_task_artifact_shape_check",
  ADD CONSTRAINT "vnext_creative_task_artifact_shape_check"
    CHECK (
      (
        "kind" = 'understand'
        AND "source_message_id" IS NOT NULL
        AND (
          (
            "workspace_id" IS NULL
            AND "understanding_id" IS NULL
            AND "commission_id" IS NULL
          )
          OR
          (
            "workspace_id" IS NOT NULL
            AND "understanding_id" IS NOT NULL
            AND "commission_id" IS NOT NULL
          )
        )
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
    );

CREATE UNIQUE INDEX "vnext_creative_tasks_active_correction_basis_key"
ON "vnext_creative_tasks"("owner_principal_id", "understanding_id")
WHERE
  "kind" = 'understand'
  AND "workspace_id" IS NOT NULL
  AND "understanding_id" IS NOT NULL
  AND "commission_id" IS NOT NULL
  AND "status" IN ('queued', 'leased', 'retry_wait');

COMMIT;
