import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoFlowView } from "./demo-flow-view";

let mockSearchParams = new URLSearchParams(
  "invite_code=PHASE0-XHS-001&utm_source=xiaohongshu&account_token=account-demo-001&token=token-demo-001&story_id=story-demo-001&chapter_id=chapter-demo-001",
);

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

describe("demo flow view", () => {
  afterEach(() => {
    mockSearchParams = new URLSearchParams(
      "invite_code=PHASE0-XHS-001&utm_source=xiaohongshu&account_token=account-demo-001&token=token-demo-001&story_id=story-demo-001&chapter_id=chapter-demo-001",
    );
  });

  it("renders the self-serve rail and preserves live context on quick-entry links", () => {
    render(<DemoFlowView />);

    expect(screen.getByTestId("demo-flow-page").textContent).toContain("self-serve");
    expect(screen.getByTestId("demo-flow-page").textContent).toContain("首访主链");
    expect(screen.getByTestId("demo-flow-page").textContent).toContain("反馈");
    expect(screen.getByTestId("launch-tracking-strip").textContent).toContain("PHASE0-XHS-001");

    expect(screen.getByRole("link", { name: "回首页看首访主链" }).getAttribute("href")).toContain(
      "/?invite_code=PHASE0-XHS-001",
    );
    expect(screen.getByRole("link", { name: "回首页看首访主链" }).getAttribute("href")).toContain("story_id=story-demo-001");
    expect(screen.getByRole("link", { name: "回首页看首访主链" }).getAttribute("href")).toContain(
      "chapter_id=chapter-demo-001",
    );
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).toContain(
      "/chat?invite_code=PHASE0-XHS-001",
    );
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).toContain("token=token-demo-001");
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "继续去房间" }).getAttribute("href")).toContain("storyId=story-demo-001");
    expect(screen.getByRole("link", { name: "打开阅读器" }).getAttribute("href")).toContain(
      "/stories/story-demo-001/chapters/chapter-demo-001",
    );
    expect(screen.getByRole("link", { name: "去反馈页留问题" }).getAttribute("href")).toContain(
      "account_token=account-demo-001",
    );
    expect(screen.getByRole("link", { name: "去反馈页留问题" }).getAttribute("href")).not.toContain(
      "token=token-demo-001",
    );
    expect(screen.getByRole("link", { name: "打开账号总览" }).getAttribute("href")).toContain(
      "/profile/account?invite_code=PHASE0-XHS-001",
    );
    expect(screen.getByRole("link", { name: "打开账号总览" }).getAttribute("href")).toContain("story_id=story-demo-001");
    expect(screen.getByRole("link", { name: "打开账号总览" }).getAttribute("href")).toContain(
      "account_token=account-demo-001",
    );
    expect(screen.getByRole("link", { name: "打开通知中心" }).getAttribute("href")).toContain(
      "/notifications?invite_code=PHASE0-XHS-001",
    );
    expect(screen.getByRole("link", { name: "打开通知中心" }).getAttribute("href")).toContain("story_id=story-demo-001");
    expect(screen.getByRole("link", { name: "打开通知中心" }).getAttribute("href")).toContain(
      "chapter_id=chapter-demo-001",
    );
    expect(screen.getByRole("link", { name: "打开通知中心" }).getAttribute("href")).toContain(
      "account_token=account-demo-001",
    );
  });

  it("stays guest-safe when session context is missing", () => {
    mockSearchParams = new URLSearchParams("invite_code=PHASE0-GUEST-001&utm_campaign=phase0_guest");

    render(<DemoFlowView />);

    expect(screen.getByTestId("demo-flow-page").textContent).toContain("缺少 token");
    expect(screen.getByTestId("demo-flow-page").textContent).toContain("缺少 account_token");
    expect(screen.queryByRole("link", { name: "打开阅读器" })).toBeNull();
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: "打开通知中心" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByTestId("launch-tracking-strip").textContent).toContain("phase0_guest");
  });

  it("shows a warning and suppresses the reader hop when camelCase and snake_case story context conflict", () => {
    mockSearchParams = new URLSearchParams(
      "invite_code=PHASE0-CONFLICT-001&token=token-conflict-001&account_token=account-conflict-001&story_id=story-snake-001&storyId=story-camel-001&chapter_id=chapter-snake-001&chapterId=chapter-camel-001",
    );

    render(<DemoFlowView />);

    expect(screen.getByTestId("demo-flow-context-warning").textContent).toContain("story_id/storyId");
    expect(screen.queryByRole("link", { name: "打开阅读器" })).toBeNull();
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).toContain("story_id=story-snake-001");
    expect(screen.getByRole("link", { name: "继续去聊天" }).getAttribute("href")).toContain("storyId=story-camel-001");
  });
});
