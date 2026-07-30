import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveIntentsView } from "./archive-intents-view";
import { correctArchiveIntent, fetchArchiveIntents } from "../../lib/archive-intents-api";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";

const defaultFrontstageSession = {
  accountToken: null,
  contextSearchParams: new URLSearchParams(),
  homeHref: "/",
  profileHref: "/profile",
  queryString: "",
  recoveryState: "missing_context" as const,
  retryHref: "/archive/intents",
  roomHref: "/room",
  storyId: null,
  token: null,
};

let mockFrontstageSession = { ...defaultFrontstageSession };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-archive-intents-ui",
    account_token: "wx-openid-archive-intents-ui",
    target_route: "/archive/intents",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../../lib/account-surface-session", () => ({
  useAccountSurfaceSession: vi.fn(() => mockFrontstageSession),
}));

vi.mock("../../lib/archive-intents-api", () => ({
  fetchArchiveIntents: vi.fn().mockResolvedValue({
    items: [
      {
        intent_id: "intent-archive-ui-001",
        intent_envelope_id: "envelope-archive-ui-001",
        intent_type: "recent_note",
        message_text: "这句可能被放错地方了。",
        ack_copy: "我先替你记到最近记下。",
        target_type: "recent_notes",
        target_id: null,
        target_label: "最近记下",
        target_object: {
          object_type: "recent_note",
          object_id: "intent-archive-ui-001",
          object_label: "最近记下",
        },
        proposed_patch: {
          note_text: "这句可能被放错地方了。",
        },
        confidence: {
          score: 0.88,
          band: "high",
        },
        route_hint: "coordinator_only",
        correction_state: {
          status: "recorded",
          entry_deep_link: "/archive/intents?token=fake-token",
          last_corrected_at: null,
        },
        status: "acknowledged",
        version_no: 1,
      },
    ],
    next_cursor: null,
  }),
  correctArchiveIntent: vi.fn().mockResolvedValue({
    intent: {
      intent_id: "intent-archive-ui-001",
      intent_envelope_id: "envelope-archive-ui-001",
      intent_type: "recent_note",
      message_text: "这句可能被放错地方了。",
      ack_copy: "我先替你记到最近记下。",
      target_type: "reader_profile",
      target_id: null,
      target_label: "读者档案",
      target_object: {
        object_type: "reader_profile",
        object_id: "profile-archive-ui-001",
        object_label: "读者档案",
      },
      proposed_patch: {
        patch_document: {
          reading_archive_patch: {
            favorite_books_append: ["《白夜行》"],
          },
        },
      },
      confidence: {
        score: 0.88,
        band: "high",
      },
      route_hint: "coordinator_only",
      correction_state: {
        status: "replayed",
        entry_deep_link: "/archive/intents?token=fake-token",
        last_corrected_at: "2026-04-03T04:45:00.000Z",
      },
      status: "corrected",
      version_no: 2,
    },
    affected_objects: [
      {
        object_type: "reader_profile",
        object_id: "profile-archive-ui-001",
      },
    ],
    replay_preview: {
      summary: "这条最近记下现在会回流到读者档案，并影响后续理解。",
    },
  }),
}));

describe("archive intents view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockFrontstageSession = { ...defaultFrontstageSession };
  });

  it("loads recent notes and submits a correction patch with replay preview", async () => {
    render(<ArchiveIntentsView token="fake-token" />);

    await waitFor(() => {
      expect(fetchArchiveIntents).toHaveBeenCalledWith("wx-openid-archive-intents-ui");
      expect(screen.getByTestId("archive-intent-detail").textContent).toContain("这句可能被放错地方了。");
    });

    fireEvent.change(screen.getByLabelText("纠错补丁输入框"), {
      target: { value: "《白夜行》" },
    });
    fireEvent.click(screen.getByRole("button", { name: "纠正到读者档案" }));

    await waitFor(() => {
      expect(correctArchiveIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_id: "intent-archive-ui-001",
          new_target_type: "reader_profile",
          patch_document: {
            base_version: 1,
            reading_archive_patch: {
              favorite_books_append: ["《白夜行》"],
            },
          },
        }),
      );
      expect(screen.getByTestId("intent-correction-result").textContent).toContain("回流到读者档案");
    });
  });

  it("shows patch conflict errors without hiding the selected note", async () => {
    vi.mocked(correctArchiveIntent).mockRejectedValueOnce(new Error("AUD-001 intent patch conflict"));

    render(<ArchiveIntentsView token="fake-token" />);

    await waitFor(() => {
      expect(screen.getByTestId("archive-intent-detail").textContent).toContain("这句可能被放错地方了。");
    });

    fireEvent.change(screen.getByLabelText("纠错补丁输入框"), {
      target: { value: "《漫长的季节》" },
    });
    fireEvent.click(screen.getByRole("button", { name: "纠正到读者档案" }));

    await waitFor(() => {
      expect(screen.getByTestId("archive-intents-error").textContent).toContain("AUD-001");
      expect(screen.getByTestId("archive-intent-detail").textContent).toContain("最近记下");
    });
  });

  it("keeps the page stable when archive intent payload omits items", async () => {
    vi.mocked(fetchArchiveIntents).mockResolvedValue({
      next_cursor: null,
    } as never);

    render(<ArchiveIntentsView token="fake-token" />);

    await waitFor(() => {
      expect(screen.getByTestId("archive-intents-page").textContent).toContain("暂无最近记下。");
    });

    expect(screen.queryByTestId("archive-intent-detail")).toBeNull();
  });

  it("reuses frontstage account continuity when a story recent-notes route reopens cleanly", async () => {
    mockFrontstageSession = {
      ...defaultFrontstageSession,
      accountToken: "wx-openid-archive-intents-ui",
      recoveryState: "ready",
      retryHref: "/stories/story-archive-ui/intents/recent",
      token: "stored-frontstage-token",
    };

    render(
      <ArchiveIntentsView
        allowAccountSurfaceFallback
        surfacePath="/stories/story-archive-ui/intents/recent"
      />,
    );

    await waitFor(() => {
      expect(useAccountSurfaceSession).toHaveBeenCalledWith("/stories/story-archive-ui/intents/recent", {
        issueTokenForLegacyAccount: false,
      });
      expect(fetchArchiveIntents).toHaveBeenCalledWith("wx-openid-archive-intents-ui");
      expect(screen.getByTestId("archive-intents-page").textContent).toContain("这几句已经和你的私聊接上");
    });
  });
});
