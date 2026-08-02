import { describe, expect, it } from "vitest";
import { normalizeInternalHref, withH5Context, withSessionContext } from "./navigation";

describe("navigation helpers", () => {
  it("keeps frontstage tab links share-safe by default", () => {
    const searchParams = new URLSearchParams("token=deep-link-token&account_token=account-001");

    expect(withH5Context("/room", searchParams)).toBe("/room");
    expect(withH5Context("/stories", searchParams)).toBe("/stories");
    expect(withH5Context("/profile", searchParams)).toBe("/profile");
  });

  it("keeps non-session params while stripping session query by default", () => {
    const searchParams = new URLSearchParams("token=deep-link-token");

    expect(withH5Context("/stories/new?mode=guided", searchParams)).toBe("/stories/new?mode=guided");
  });

  it("can explicitly preserve legacy session query for non-product rails", () => {
    const searchParams = new URLSearchParams("account_token=account-001");

    expect(withH5Context("/profile", searchParams, { preserveSessionQuery: true })).toBe(
      "/profile?account_token=account-001",
    );
    expect(withSessionContext("/profile", { accountToken: "account-001" })).toBe(
      "/profile",
    );
    expect(withSessionContext("/profile", { accountToken: "account-001" }, { preserveSessionQuery: true })).toBe(
      "/profile?account_token=account-001",
    );
  });

  it("strips session query from target routes in share-safe mode", () => {
    expect(
      withSessionContext("/profile/account?account_token=legacy-account", {
        token: "deep-link-token",
        accountToken: "account-001",
      }),
    ).toBe("/profile/account");
  });

  it("preserves an explicit target token only when a caller opts into session query continuity", () => {
    expect(
      withSessionContext("/room?token=target-token&account_token=legacy-account", {
        token: "deep-link-token",
        accountToken: "account-001",
      }),
    ).toBe("/room");
    expect(
      withSessionContext(
        "/room?token=target-token&account_token=legacy-account",
        {
          token: "deep-link-token",
          accountToken: "account-001",
        },
        { preserveSessionQuery: true },
      ),
    ).toBe("/room?token=target-token");
  });

  it("normalizes absolute deep links into relative app hrefs", () => {
    expect(normalizeInternalHref("http://127.0.0.1:3000/room?token=abc")).toBe("/room");
    expect(normalizeInternalHref("/profile?account_token=acct")).toBe("/profile");
  });
});
