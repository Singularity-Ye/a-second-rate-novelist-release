import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { OpsActorRole } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  createReleaseCandidate,
  createRestoreDrill,
  getOpsBetaSupportOverview,
  getOpsDashboardOverview,
  getOpsEnvironments,
  getOpsFunnel,
  getOpsBackups,
  getOpsStory360,
  getOpsUser360,
  listOpsReviewCases,
  listOpsReleases,
  promoteRelease,
  rollbackRelease,
  resolveOpsReviewCase,
  searchOpsUsers,
} from "./ops-console.service.js";

@Controller()
export class OpsConsoleController {
  @Get("/ops/environments")
  async environments() {
    return successEnvelope(await getOpsEnvironments());
  }

  @Get("/ops/releases")
  async releases() {
    return successEnvelope(await listOpsReleases());
  }

  @Get("/ops/dashboard/overview")
  async overview(
    @Query("actor_role") actor_role: OpsActorRole = "ops_support",
    @Query("dashboard_key") dashboard_key?: string,
  ) {
    return successEnvelope(
      await getOpsDashboardOverview({
        actor_role,
        ...(dashboard_key ? { dashboard_key } : {}),
      }),
    );
  }

  @Get("/ops/funnels/:funnelKey")
  async funnel(@Param("funnelKey") funnelKey: string, @Query("actor_role") actor_role: OpsActorRole = "ops_support") {
    return successEnvelope(
      await getOpsFunnel({
        actor_role,
        funnel_key: funnelKey,
      }),
    );
  }

  @Get("/ops/users/search")
  async users(
    @Query("actor_role") actor_role: OpsActorRole = "ops_support",
    @Query("q") q?: string,
    @Query("membership_tier") membership_tier?: string,
    @Query("has_open_case") has_open_case?: string,
    @Query("cursor") cursor?: string,
  ) {
    return successEnvelope(
      await searchOpsUsers({
        actor_role,
        ...(q ? { q } : {}),
        ...(membership_tier ? { membership_tier } : {}),
        ...(typeof has_open_case === "string" ? { has_open_case: has_open_case === "true" } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    );
  }

  @Get("/ops/users/:accountId")
  async user360(@Param("accountId") accountId: string, @Query("actor_role") actor_role: OpsActorRole = "ops_support") {
    return successEnvelope(
      await getOpsUser360({
        actor_role,
        account_id: accountId,
      }),
    );
  }

  @Get("/ops/stories/:storyId")
  async story360(@Param("storyId") storyId: string, @Query("actor_role") actor_role: OpsActorRole = "ops_support") {
    return successEnvelope(
      await getOpsStory360({
        actor_role,
        story_id: storyId,
      }),
    );
  }

  @Get("/ops/review-cases")
  async reviewCases(
    @Query("actor_role") actor_role: OpsActorRole = "ops_risk_reviewer",
    @Query("case_type") case_type?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("owner") owner?: string,
  ) {
    return successEnvelope(
      await listOpsReviewCases({
        actor_role,
        ...(case_type ? { case_type } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(owner ? { owner } : {}),
      }),
    );
  }

  @Get("/ops/backups")
  async backups() {
    return successEnvelope(await getOpsBackups());
  }

  @Get("/ops/beta-support")
  async betaSupport(@Query("actor_role") actor_role: OpsActorRole = "ops_support") {
    return successEnvelope(
      await getOpsBetaSupportOverview({
        actor_role,
      }),
    );
  }

  @Post("/ops/releases")
  async createRelease(
    @Body()
    body: {
      source_commit_sha: string;
      artifact_uri: string;
      target_environment: "shared-dev" | "staging" | "live";
      migration_bundle_id: string;
      change_summary: string;
    },
  ) {
    return successEnvelope(await createReleaseCandidate(body));
  }

  @Post("/ops/releases/:releaseId/promote")
  async promote(
    @Param("releaseId") releaseId: string,
    @Body()
    body: {
      from_environment: "shared-dev" | "staging" | "live";
      to_environment: "shared-dev" | "staging" | "live";
      approval_note: string;
      run_migrations: boolean;
    },
  ) {
    return successEnvelope(
      await promoteRelease({
        release_id: releaseId,
        ...body,
      }),
    );
  }

  @Post("/ops/releases/:releaseId/rollback")
  async rollback(
    @Param("releaseId") releaseId: string,
    @Body()
    body: {
      target_release_id: string;
      reason: string;
      include_migration_restore: boolean;
    },
  ) {
    return successEnvelope(
      await rollbackRelease({
        release_id: releaseId,
        ...body,
      }),
    );
  }

  @Post("/ops/restore-drills")
  async restoreDrill(
    @Body()
    body: {
      environment_key: "shared-dev" | "staging" | "live";
      snapshot_id: string;
      drill_type: "db_only" | "db_and_object_storage" | "full_stack";
    },
  ) {
    return successEnvelope(await createRestoreDrill(body));
  }

  @Post("/ops/review-cases/:caseId/decision")
  async decide(
    @Param("caseId") caseId: string,
    @Body()
    body: {
      actor_role?: OpsActorRole;
      actor_id?: string;
      decision: "approve" | "warn" | "block" | "request_info" | "escalate";
      note: string;
      notify_user: boolean;
    },
  ) {
    return successEnvelope(
      await resolveOpsReviewCase({
        actor_role: body.actor_role ?? "ops_risk_reviewer",
        actor_id: body.actor_id ?? "ops-reviewer-default",
        case_id: caseId,
        decision: body.decision,
        note: body.note,
        notify_user: body.notify_user,
      }),
    );
  }
}
