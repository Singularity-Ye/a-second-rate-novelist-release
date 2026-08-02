import { Controller, Get, Query } from "@nestjs/common";
import type { RoomHotspotCode } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import { getRoomOverview, getRoomPersona } from "./room-projection.service.js";

@Controller()
export class RoomProjectionController {
  @Get("/room/overview")
  overview(
    @Query("account_token") account_token: string,
    @Query("story_id") story_id?: string,
    @Query("fallback_target") fallback_target?: RoomHotspotCode,
  ) {
    return this.overviewAsync(account_token, story_id, fallback_target);
  }

  private async overviewAsync(
    account_token: string,
    story_id?: string,
    fallback_target?: RoomHotspotCode,
  ) {
    return successEnvelope(
      await getRoomOverview({
        account_token,
        ...(story_id ? { story_id } : {}),
        ...(fallback_target ? { fallback_target } : {}),
      }),
    );
  }

  @Get("/room/persona")
  persona(
    @Query("account_token") account_token: string,
    @Query("story_id") story_id?: string,
  ) {
    return this.personaAsync(account_token, story_id);
  }

  private async personaAsync(account_token: string, story_id?: string) {
    return successEnvelope(
      await getRoomPersona({
        account_token,
        ...(story_id ? { story_id } : {}),
      }),
    );
  }
}
