import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import type { DeepLinkExchangeRequest, DeepLinkIssueRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import { exchangeDeepLinkToken, issueDeepLinkToken } from "./shadow-account-registry.js";

@Controller()
export class SessionExchangeController {
  @Post("/internal/session/issue")
  async issue(@Body() body: DeepLinkIssueRequest) {
    return successEnvelope(await issueDeepLinkToken(body));
  }

  @Post("/internal/session/exchange")
  async exchange(@Body() body: DeepLinkExchangeRequest) {
    try {
      return successEnvelope(await exchangeDeepLinkToken(body.token));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NET-003")) {
        throw new UnauthorizedException(error.message);
      }

      throw error;
    }
  }
}
