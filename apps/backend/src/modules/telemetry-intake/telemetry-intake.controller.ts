import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  getTelemetryFunnel,
  listTelemetryFeed,
  recordClientTelemetryEvent,
} from "./telemetry-intake.service.js";

@Controller()
export class TelemetryIntakeController {
  @Post("/telemetry/events")
  async track(
    @Body()
    body: {
      account_token: string;
      event_name: string;
      payload?: Record<string, string | number | boolean | null>;
    },
  ) {
    return successEnvelope(
      await recordClientTelemetryEvent({
        account_token: body.account_token,
        event_name: body.event_name,
        payload: body.payload ?? {},
      }),
    );
  }

  @Get("/telemetry/events")
  async events(@Query("account_token") account_token?: string) {
    return successEnvelope(
      await listTelemetryFeed({
        ...(account_token ? { account_token } : {}),
      }),
    );
  }

  @Get("/telemetry/funnel")
  async funnel(@Query("account_token") account_token?: string) {
    return successEnvelope(
      await getTelemetryFunnel({
        ...(account_token ? { account_token } : {}),
      }),
    );
  }
}
