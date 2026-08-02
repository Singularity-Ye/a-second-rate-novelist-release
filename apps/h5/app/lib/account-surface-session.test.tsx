import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountSurfaceSession } from "./account-surface-session";
import { exchangeSessionToken, issueSessionToken } from "./session-bridge";

let mockSearchParams = new URLSearchParams("account_token=wx-legacy-account&story_id=story-legacy-001");

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("./session-bridge", () => ({
  exchangeSessionToken: vi.fn(),
  issueSessionToken: vi.fn(),
}));

function SessionHarness({
  surfacePath,
  issueTokenForLegacyAccount,
}: {
  surfacePath: Parameters<typeof useAccountSurfaceSession>[0];
  issueTokenForLegacyAccount?: boolean;
}) {
  const session = useAccountSurfaceSession(surfacePath, {
    issueTokenForLegacyAccount,
  });

  return (
    <div>
      <div data-testid="recovery-state">{session.recoveryState}</div>
      <div data-testid="query-string">{session.queryString}</div>
      <div data-testid="retry-href">{session.retryHref}</div>
      <div data-testid="profile-href">{session.profileHref}</div>
      <div data-testid="room-href">{session.roomHref}</div>
    </div>
  );
}

describe("useAccountSurfaceSession", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams("account_token=wx-legacy-account&story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?account_token=wx-legacy-account&story_id=story-legacy-001");
    window.sessionStorage.clear();
    vi.mocked(exchangeSessionToken).mockReset();
    vi.mocked(issueSessionToken).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("upgrades legacy account_token entries into token-led continuity when the surface opts in", async () => {
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "issued-surface-token",
      expires_at: "2026-04-18T00:30:00.000Z",
      target_route: "/feedback",
    });

    render(<SessionHarness surfacePath="/feedback" issueTokenForLegacyAccount />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-legacy-account",
        target_route: "/feedback",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("ready");
      expect(screen.getByTestId("query-string").textContent).toBe("story_id=story-legacy-001");
      expect(screen.getByTestId("query-string").textContent).not.toContain("token=");
      expect(screen.getByTestId("query-string").textContent).not.toContain("account_token=");
      expect(screen.getByTestId("retry-href").textContent).toBe("/feedback?story_id=story-legacy-001");
      expect(screen.getByTestId("profile-href").textContent).toBe("/profile?story_id=story-legacy-001");
      expect(screen.getByTestId("room-href").textContent).toBe("/room?story_id=story-legacy-001");
      expect(window.location.search).not.toContain("token=");
      expect(window.location.search).not.toContain("account_token=");
      expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("issued-surface-token");
    });
  });

  it("still upgrades legacy account_token continuity by default so frontstage links stay share-safe", async () => {
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "default-issued-token",
      expires_at: "2026-04-18T00:30:00.000Z",
      target_route: "/feedback",
    });

    render(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("ready");
      expect(screen.getByTestId("query-string").textContent).toBe("story_id=story-legacy-001");
      expect(screen.getByTestId("profile-href").textContent).toBe("/profile?story_id=story-legacy-001");
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-legacy-account",
        target_route: "/feedback",
      });
    });
  });

  it("reuses stored frontstage session when a clean url is reopened in the same browser session", async () => {
    window.sessionStorage.setItem(
      "erliu.frontstage.session",
      JSON.stringify({
        token: "stored-frontstage-token",
        accountToken: "stored-account-token",
      }),
    );
    mockSearchParams = new URLSearchParams("story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?story_id=story-legacy-001");

    render(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("ready");
      expect(screen.getByTestId("query-string").textContent).toBe("story_id=story-legacy-001");
      expect(screen.getByTestId("profile-href").textContent).toBe("/profile?story_id=story-legacy-001");
      expect(issueSessionToken).not.toHaveBeenCalled();
      expect(exchangeSessionToken).not.toHaveBeenCalled();
    });
  });

  it("falls through to missing_context after mount when the clean url has no query token and no stored session", async () => {
    mockSearchParams = new URLSearchParams("story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?story_id=story-legacy-001");

    render(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("missing_context");
      expect(issueSessionToken).not.toHaveBeenCalled();
      expect(exchangeSessionToken).not.toHaveBeenCalled();
    });
  });

  it("keeps a token-led deep link retryable after the visible url has been scrubbed clean", async () => {
    mockSearchParams = new URLSearchParams("token=retry-token-only&story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?token=retry-token-only&story_id=story-legacy-001");
    vi.mocked(exchangeSessionToken)
      .mockRejectedValueOnce(new Error("temporary exchange failure"))
      .mockResolvedValueOnce({
        account_token: "wx-retried-token-account",
        expires_at: "2026-04-18T00:30:00.000Z",
      });

    const { rerender } = render(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("recovery_failed");
      expect(screen.getByTestId("retry-href").textContent).toBe("/feedback?story_id=story-legacy-001");
      expect(window.location.search).toBe("?story_id=story-legacy-001");
      expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("retry-token-only");
    });

    mockSearchParams = new URLSearchParams("story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?story_id=story-legacy-001");
    rerender(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(vi.mocked(exchangeSessionToken)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(exchangeSessionToken)).toHaveBeenLastCalledWith("retry-token-only");
      expect(screen.getByTestId("recovery-state").textContent).toBe("ready");
    });
  });

  it("keeps a legacy account_token entry retryable after the clean page retries in the same tab", async () => {
    vi.mocked(issueSessionToken)
      .mockRejectedValueOnce(new Error("temporary issue failure"))
      .mockResolvedValueOnce({
        token: "issued-after-clean-retry",
        expires_at: "2026-04-18T00:30:00.000Z",
        target_route: "/feedback",
      });

    const { rerender } = render(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-state").textContent).toBe("recovery_failed");
      expect(screen.getByTestId("retry-href").textContent).toBe("/feedback?story_id=story-legacy-001");
      expect(window.location.search).toBe("?story_id=story-legacy-001");
      expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("wx-legacy-account");
    });

    mockSearchParams = new URLSearchParams("story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?story_id=story-legacy-001");
    rerender(<SessionHarness surfacePath="/feedback" />);

    await waitFor(() => {
      expect(vi.mocked(issueSessionToken)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(issueSessionToken)).toHaveBeenLastCalledWith({
        account_token: "wx-legacy-account",
        target_route: "/feedback",
      });
      expect(screen.getByTestId("recovery-state").textContent).toBe("ready");
      expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("issued-after-clean-retry");
    });
  });
});
