import { Body, Controller, Post } from "@nestjs/common";
import type { ChannelMessageRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import { buildChatSessionResponse } from "./chat-session-bridge.js";

@Controller()
export class ChannelIngressController {
  @Post("/chat/messages")
  async handleMessage(@Body() body: ChannelMessageRequest) {
    return successEnvelope(await buildChatSessionResponse(body));
  }

  @Post("/channel/events/text")
  async handleExternalTextEvent(@Body() body: ChannelMessageRequest) {
    return successEnvelope(
      await buildChatSessionResponse({
        ...body,
        adapter_kind: body.adapter_kind ?? (body.channel === "wechat" ? "clawbot_text_webhook" : body.channel === "feishu" ? "feishu_text_webhook" : "generic_channel_gateway"),
      }),
    );
  }
}
