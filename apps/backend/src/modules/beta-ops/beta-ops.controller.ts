import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { BetaSupportCaseCreateRequest, OpsActorRole, OpsBetaIncidentCreateRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  createBetaIncidentBroadcast,
  createBetaSupportCase,
  getBetaSupportOverview,
  getOpsBetaSupportOverview,
  resolveBetaIncidentBroadcast,
} from "./beta-ops.service.js";

@Controller()
export class BetaOpsController {
  @Get("/beta/support/overview")
  async overview(@Query("account_token") account_token: string) {
    return successEnvelope(await getBetaSupportOverview({ account_token }));
  }

  @Post("/beta/support/cases")
  async create(@Body() body: BetaSupportCaseCreateRequest) {
    return successEnvelope(await createBetaSupportCase(body));
  }

  @Get("/ops/beta-support/overview")
  async opsOverview(@Query("actor_role") actor_role: OpsActorRole = "ops_support") {
    return successEnvelope(
      await getOpsBetaSupportOverview({
        actor_role,
      }),
    );
  }

  @Post("/ops/beta-support/incidents")
  async createIncident(@Body() body: OpsBetaIncidentCreateRequest) {
    return successEnvelope(await createBetaIncidentBroadcast(body));
  }

  @Post("/ops/beta-support/incidents/:incidentId/resolve")
  async resolveIncident(
    @Param("incidentId") incidentId: string,
    @Body()
    body: {
      actor_role?: OpsActorRole;
      actor_id?: string;
    },
  ) {
    const resolveInput = {
      incident_id: incidentId,
      ...(body.actor_role ? { actor_role: body.actor_role } : {}),
      ...(body.actor_id ? { actor_id: body.actor_id } : {}),
    };

    return successEnvelope(
      await resolveBetaIncidentBroadcast(resolveInput),
    );
  }
}
