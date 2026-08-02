import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BetaLandingView } from "./beta-landing-view";
import { fetchBetaAccessStatus, redeemBetaInvite, registerBetaAccessChannel } from "../lib/beta-access-api";

const push = vi.fn();
const mockState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(""),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => mockState.searchParams,
}));

vi.mock("../lib/beta-access-api", () => ({
  fetchBetaAccessStatus: vi.fn().mockResolvedValue({
    program: {
      program_key: "external_beta_phase0",
      status: "active",
      seat_limit: 500,
      seats_used: 0,
      waitlist_open: true,
      invite_only: true,
    },
    invite: {
      invite_code: "PHASE0-XHS-001",
      status: "available",
      source_channel: "xiaohongshu",
      source_label: "小红书 KOL 招募",
      campaign_key: "phase0_xiaohongshu_kol",
      inviter_account_id: null,
      root_invite_code: "PHASE0-XHS-001",
      issued_by: "ops_seed",
      allowed_channels: ["h5", "wechat", "feishu"],
      max_redemptions: 1,
      redeemed_count: 0,
    },
    account: null,
  }),
  redeemBetaInvite: vi.fn().mockResolvedValue({
    account_token: "beta-reader-ui-001",
    account_id: "account-beta-reader-ui-001",
    invite_code: "PHASE0-XHS-001",
    access_state: "ready",
    onboarding_status: "invite_redeemed",
    primary_channel: "h5",
    bound_channels: ["h5"],
    allowed_channels: ["h5", "wechat", "feishu"],
    next_step_copy: "先进入私聊，再决定要不要绑定微信或飞书。",
    deny_reason_copy: null,
    attribution: {
      source_channel: "xiaohongshu",
      source_label: "小红书 KOL 招募",
      campaign_key: "phase0_xiaohongshu_kol",
      inviter_account_id: null,
      root_invite_code: "PHASE0-XHS-001",
    },
    entry_links: {
      beta_url: "/beta?account_token=beta-reader-ui-001",
      chat_url: "http://127.0.0.1:3000/chat?token=beta-chat-token",
      room_url: "http://127.0.0.1:3000/room?token=beta-room-token",
    },
    runtime_gate_summary: {
      story_slots_status: "ready",
      branch_quota_status: "ready",
      ai_budget_status: "ready",
    },
    share_invites: [
      {
        invite_code: "SHARE-001",
        status: "available",
        source_channel: "referral",
        source_label: "好友分享",
        campaign_key: "phase0_referral",
      },
    ],
  }),
  registerBetaAccessChannel: vi.fn().mockResolvedValue({
    onboarding_status: "chat_ready",
    bound_channels: ["h5", "wechat"],
    next_step_copy: "现在可以直接从微信 ClawBot 继续催更了。",
  }),
}));

describe("beta landing view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockState.searchParams = new URLSearchParams("");
    window.history.replaceState({}, "", "/beta");
  });

  it("redeems an invite and lets the user continue into beta chat", async () => {
    window.sessionStorage.clear();
    render(<BetaLandingView initialInviteCode="PHASE0-XHS-001" />);

    await waitFor(() => {
      expect(fetchBetaAccessStatus).toHaveBeenCalled();
      expect(screen.getByTestId("beta-invite-preview").textContent).toContain("可以继续");
    });

    fireEvent.click(screen.getByRole("button", { name: "兑换邀请码" }));

    await waitFor(() => {
      expect(redeemBetaInvite).toHaveBeenCalledWith({
        invite_code: "PHASE0-XHS-001",
        entry_channel: "h5",
      });
    });

    expect(screen.getByTestId("beta-share-invites").textContent).toContain("SHARE-001");
    expect(screen.getByTestId("launch-tracking-strip").textContent).toContain("phase0_xiaohongshu_kol");
    expect(screen.getByRole("link", { name: /查看使用说明/ }).getAttribute("href")).toContain(
      "/faq?invite_code=PHASE0-XHS-001",
    );

    fireEvent.click(screen.getByRole("button", { name: "进入私聊" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/chat");
    });

    expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("beta-chat-token");
    expect(screen.getByRole("link", { name: /进入房间/ }).getAttribute("href")).toBe("/room");
  });

  it("registers a bound wechat id after invite redemption", async () => {
    render(<BetaLandingView initialInviteCode="PHASE0-XHS-001" />);

    await waitFor(() => {
      expect(screen.getByTestId("beta-invite-preview").textContent).toContain("可以继续");
    });

    fireEvent.click(screen.getByRole("button", { name: "兑换邀请码" }));

    await screen.findByTestId("beta-share-invites");

    fireEvent.change(screen.getByLabelText("微信入口标识"), {
      target: { value: "wx-beta-ui-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定微信入口" }));

    await waitFor(() => {
      expect(registerBetaAccessChannel).toHaveBeenCalledWith({
        account_token: "beta-reader-ui-001",
        channel: "wechat",
        provider_user_id: "wx-beta-ui-001",
        set_as_primary: true,
      });
    });

    expect(screen.getByTestId("beta-binding-state").textContent).toContain("可以直接去私聊");
    expect(screen.getByRole("link", { name: /查看示范故事/ }).getAttribute("href")).toContain(
      "campaign_key=phase0_xiaohongshu_kol",
    );
  });

  it("keeps beta account continuity available when the clean beta page is reopened in the same tab", async () => {
    window.sessionStorage.setItem(
      "erliu.frontstage.session",
      JSON.stringify({
        token: null,
        accountToken: "beta-reader-ui-001",
      }),
    );

    render(<BetaLandingView />);

    await waitFor(() => {
      expect(fetchBetaAccessStatus).toHaveBeenCalledWith({
        account_token: "beta-reader-ui-001",
      });
    });
  });

  it("scrubs raw account_token from the visible beta url after seeding session continuity", async () => {
    mockState.searchParams = new URLSearchParams("account_token=beta-reader-ui-001");
    window.history.replaceState({}, "", "/beta?account_token=beta-reader-ui-001");

    render(<BetaLandingView />);

    await waitFor(() => {
      expect(fetchBetaAccessStatus).toHaveBeenCalledWith({
        account_token: "beta-reader-ui-001",
      });
    });

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("beta-reader-ui-001");
  });

  it("shows exhausted invite status without surfacing a generic 500 error", async () => {
    vi.mocked(fetchBetaAccessStatus).mockResolvedValueOnce({
      program: {
        program_key: "external_beta_phase0",
        status: "active",
        seat_limit: 500,
        seats_used: 12,
        waitlist_open: true,
        invite_only: true,
      },
      invite: {
        invite_code: "PHASE0-XHS-001",
        status: "exhausted",
        source_channel: "xiaohongshu",
        source_label: "小红书 KOL 招募",
        campaign_key: "phase0_xiaohongshu_kol",
        inviter_account_id: null,
        root_invite_code: "PHASE0-XHS-001",
        issued_by: "ops_seed",
        allowed_channels: ["h5", "wechat", "feishu"],
        max_redemptions: 1,
        redeemed_count: 1,
      },
      account: null,
    });

    render(<BetaLandingView initialInviteCode="PHASE0-XHS-001" />);

    await waitFor(() => {
      expect(fetchBetaAccessStatus).toHaveBeenCalledWith({
        invite_code: "PHASE0-XHS-001",
      });
    });

    expect(screen.getByText(/这个邀请码已经用完了/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "兑换邀请码" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Beta access API failed: 500")).toBeNull();
  });

  it("shows invalid invite status explicitly before redeem", async () => {
    vi.mocked(fetchBetaAccessStatus).mockResolvedValueOnce({
      program: {
        program_key: "external_beta_phase0",
        status: "active",
        seat_limit: 500,
        seats_used: 0,
        waitlist_open: true,
        invite_only: true,
      },
      invite: null,
      account: null,
    });

    render(<BetaLandingView initialInviteCode="NOT-A-CODE" />);

    await waitFor(() => {
      expect(fetchBetaAccessStatus).toHaveBeenCalledWith({
        invite_code: "NOT-A-CODE",
      });
    });

    expect(screen.getByText(/没有找到这个邀请码/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "兑换邀请码" }).hasAttribute("disabled")).toBe(true);
  });
});
