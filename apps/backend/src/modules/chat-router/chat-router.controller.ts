import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { ChatContextResolveRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  listQuickActions,
  resolveChatContextDecision,
} from "./chat-routing.service.js";

@Controller()
export class ChatRouterController {
  @Post("/chat/context/resolve")
  async resolve(@Body() body: ChatContextResolveRequest) {
    return successEnvelope(await resolveChatContextDecision(body));
  }

  @Get("/chat/quick-actions")
  quickActions(
    @Query("story_id") story_id?: string,
    @Query("chapter_id") chapter_id?: string,
    @Query("surface") surface: "chat" | "room" = "chat",
  ) {
    return successEnvelope({
      actions: listQuickActions({
        story_id: story_id ?? null,
        chapter_id: chapter_id ?? null,
        surface,
      }),
    });
  }
}
