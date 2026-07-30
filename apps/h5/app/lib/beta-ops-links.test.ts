import { describe, expect, it } from "vitest";
import { buildFeedbackHref } from "./beta-ops-links";
import { buildReportHref } from "./reporting-case-links";

describe("beta ops/report links", () => {
  it("accepts undefined optional fields from routed session context", () => {
    const accountToken: string | undefined = undefined;
    const targetLabel: string | undefined = undefined;
    const token: string | undefined = undefined;

    expect(
      buildFeedbackHref({
        surface: "chat",
        account_token: accountToken,
        story_id: null,
        target_type: "chat_thread",
        target_id: "chat-thread",
        target_label: targetLabel,
      }),
    ).toBe("/feedback?surface=chat&target_type=chat_thread&target_id=chat-thread");

    expect(
      buildReportHref({
        surface: "reader",
        account_token: accountToken,
        story_id: null,
        target_type: "story_chapter",
        target_id: "chapter-001",
        target_label: targetLabel,
        token,
      }),
    ).toBe("/report/new?surface=reader&target_type=story_chapter&target_id=chapter-001");
  });

  it("keeps support links share-safe even when routed session context exists", () => {
    expect(
      buildFeedbackHref({
        surface: "chat",
        account_token: "wx-openid-001",
        story_id: "story-001",
        target_type: "chat_thread",
        target_id: "chat-thread",
        target_label: "主聊天线程",
        token: "deep-link-token",
      }),
    ).toBe(
      "/feedback?surface=chat&target_type=chat_thread&target_id=chat-thread&target_label=%E4%B8%BB%E8%81%8A%E5%A4%A9%E7%BA%BF%E7%A8%8B&story_id=story-001",
    );

    expect(
      buildReportHref({
        surface: "room",
        account_token: "wx-openid-001",
        story_id: "story-001",
        target_type: "room_session",
        target_id: "room-001",
        target_label: "作家房间",
        token: "deep-link-token",
      }),
    ).toBe(
      "/report/new?surface=room&target_type=room_session&target_id=room-001&target_label=%E4%BD%9C%E5%AE%B6%E6%88%BF%E9%97%B4&story_id=story-001",
    );
  });
});
