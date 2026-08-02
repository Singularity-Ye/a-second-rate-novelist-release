import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  getBetaAccessStatus,
  getOpsBetaAccessOverview,
  redeemBetaInvite,
  registerBetaAccessChannel,
} from "./beta-access.service.js";

@Controller()
export class BetaAccessController {
  @Get("/beta/access")
  async status(
    @Query("account_token") account_token?: string,
    @Query("invite_code") invite_code?: string,
    @Headers("x-forwarded-host") forwardedHost?: string,
    @Headers("x-forwarded-proto") forwardedProto?: string,
  ) {
    const publicOrigin = resolveForwardedPublicOrigin(forwardedHost, forwardedProto);

    return successEnvelope(
      await getBetaAccessStatus({
        ...(account_token ? { account_token } : {}),
        ...(invite_code ? { invite_code } : {}),
      }, publicOrigin ? { public_origin: publicOrigin } : {}),
    );
  }

  @Post("/beta/invites/redeem")
  async redeem(
    @Body()
    body: {
      invite_code: string;
      entry_channel: "h5" | "wechat" | "feishu";
      accepted_policy_version?: string;
      client_request_id?: string;
      account_token?: string;
    },
    @Headers("x-forwarded-host") forwardedHost?: string,
    @Headers("x-forwarded-proto") forwardedProto?: string,
  ) {
    const publicOrigin = resolveForwardedPublicOrigin(forwardedHost, forwardedProto);

    return successEnvelope(
      await redeemBetaInvite(body, publicOrigin ? { public_origin: publicOrigin } : {}),
    );
  }

  @Post("/beta/access/channel-bindings")
  async bind(
    @Body()
    body: {
      account_token: string;
      channel: "h5" | "wechat" | "feishu";
      provider_user_id: string;
      set_as_primary: boolean;
    },
  ) {
    return successEnvelope(await registerBetaAccessChannel(body));
  }

  @Get("/ops/beta-access")
  async opsOverview() {
    return successEnvelope(await getOpsBetaAccessOverview());
  }
}

function resolveForwardedPublicOrigin(forwardedHost?: string, forwardedProto?: string) {
  const host = forwardedHost?.split(",")[0]?.trim();
  if (!host) {
    return undefined;
  }

  const proto = forwardedProto?.split(",")[0]?.trim() || "https";
  return `${proto.replace(/:$/, "")}://${host}`;
}
