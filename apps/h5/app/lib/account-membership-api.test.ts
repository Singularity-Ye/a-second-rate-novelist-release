import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivacyDataRequest } from "./account-membership-api";

describe("createPrivacyDataRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the delete confirmation phrase for story deletion requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data_request_id: "privacy-delete-001",
          status: "cooling_off",
          due_at: "2026-04-01T00:00:00.000Z",
          cooling_off_until: "2026-04-04T00:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createPrivacyDataRequest({
      account_token: "wx-openid-delete-ui",
      request_type: "delete",
      scope: "story",
      story_id: "story-delete-ui",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(body.confirm_phrase).toBe("DELETE MY ACCOUNT");
    expect(body.request_type).toBe("delete");
    expect(body.scope).toBe("story");
    expect(body.story_id).toBe("story-delete-ui");
  });

  it("keeps the generic confirmation phrase for export requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data_request_id: "privacy-export-001",
          status: "queued",
          due_at: "2026-04-01T00:00:00.000Z",
          cooling_off_until: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createPrivacyDataRequest({
      account_token: "wx-openid-export-ui",
      request_type: "export",
      scope: "account",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(body.confirm_phrase).toBe("CONFIRM");
    expect(body.request_type).toBe("export");
    expect(body.scope).toBe("account");
  });
});
