import type { VnextModelProfileSettings } from "@erliu/shared-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ModelProfileRequestError,
  readModelProfileSettings,
  setModelPreference,
} from "./model-profile-api";

function modelSettings(input?: {
  readonly conversationProfileId?: "deepseek" | "gpt" | "gemini" | "grok";
  readonly conversationRevision?: number;
  readonly analysisProfileId?: "deepseek" | "gpt" | "gemini" | "grok";
  readonly analysisRevision?: number;
}): VnextModelProfileSettings {
  return {
    catalogVersion: "v1",
    profiles: [
      {
        id: "deepseek",
        label: "DeepSeek",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
      {
        id: "gpt",
        label: "GPT",
        provider: null,
        model: null,
        purposes: ["conversation", "analysis"],
        status: "not_configured",
        streaming: true,
      },
      {
        id: "gemini",
        label: "Gemini",
        provider: "google",
        model: "gemini-flash",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
      {
        id: "grok",
        label: "Grok",
        provider: "xai",
        model: "grok-fast",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
    ],
    preferences: {
      conversation: {
        purpose: "conversation",
        profileId: input?.conversationProfileId ?? "deepseek",
        revision: input?.conversationRevision ?? 3,
        source: "stored",
        available: true,
      },
      analysis: {
        purpose: "analysis",
        profileId: input?.analysisProfileId ?? "grok",
        revision: input?.analysisRevision ?? 8,
        source: "stored",
        available: true,
      },
    },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function publicFieldNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(publicFieldNames);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...publicFieldNames(nested),
  ]);
}

function expectNoServerSecretFieldNames(value: unknown) {
  for (const fieldName of publicFieldNames(value)) {
    const normalized = fieldName.toLowerCase().replaceAll("_", "").replaceAll("-", "");
    expect(normalized).not.toContain("endpoint");
    expect(normalized).not.toContain("apikey");
    expect(normalized).not.toContain("credentialenv");
    expect(normalized).not.toContain("secret");
    expect(normalized).not.toContain("token");
    expect(normalized).not.toBe("key");
    expect(normalized).not.toBe("env");
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model profile API", () => {
  it("reads the complete public catalog and both purpose preferences", async () => {
    const response = modelSettings();
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readModelProfileSettings();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl.endsWith("/vnext/model-profiles")).toBe(true);
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
    expect(result.profiles.map((profile) => profile.id)).toEqual([
      "deepseek",
      "gpt",
      "gemini",
      "grok",
    ]);
    expect(result.profiles.find((profile) => profile.id === "gpt")).toMatchObject({
      provider: null,
      model: null,
      status: "not_configured",
    });
    expect(result.preferences.conversation).toMatchObject({
      purpose: "conversation",
      profileId: "deepseek",
      revision: 3,
    });
    expect(result.preferences.analysis).toMatchObject({
      purpose: "analysis",
      profileId: "grok",
      revision: 8,
    });
    expectNoServerSecretFieldNames(response);
    expectNoServerSecretFieldNames(result);
  });

  it("puts only the selected profile and expected revision under the requested purpose", async () => {
    const response = modelSettings({
      conversationProfileId: "gemini",
      conversationRevision: 4,
    });
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse(response);
      }),
    );

    const result = await setModelPreference({
      purpose: "conversation",
      profileId: "gemini",
      expectedRevision: 3,
    });

    expect(requestUrl.endsWith("/vnext/model-profiles/preferences/conversation")).toBe(true);
    expect(requestInit?.method).toBe("PUT");
    expect(requestInit?.credentials).toBe("include");
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(body).toEqual({ profileId: "gemini", expectedRevision: 3 });
    expect(Object.keys(body).sort()).toEqual(["expectedRevision", "profileId"]);
    expect(result.preferences.conversation).toMatchObject({
      purpose: "conversation",
      profileId: "gemini",
      revision: 4,
    });
    expect(result.preferences.analysis).toMatchObject({
      purpose: "analysis",
      profileId: "grok",
      revision: 8,
    });
    expectNoServerSecretFieldNames(body);
    expectNoServerSecretFieldNames(result);
  });

  it("routes an analysis preference to the analysis purpose without changing conversation", async () => {
    const response = modelSettings({
      analysisProfileId: "deepseek",
      analysisRevision: 9,
    });
    let requestUrl = "";
    let requestBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(response);
      }),
    );

    const result = await setModelPreference({
      purpose: "analysis",
      profileId: "deepseek",
      expectedRevision: 8,
    });

    expect(requestUrl.endsWith("/vnext/model-profiles/preferences/analysis")).toBe(true);
    expect(requestBody).toEqual({ profileId: "deepseek", expectedRevision: 8 });
    expect(result.preferences.conversation).toMatchObject({
      profileId: "deepseek",
      revision: 3,
    });
    expect(result.preferences.analysis).toMatchObject({
      profileId: "deepseek",
      revision: 9,
    });
    expectNoServerSecretFieldNames(requestBody);
    expectNoServerSecretFieldNames(result);
  });

  it("preserves the server conflict code when a stale revision receives 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({
        code: "model_preference_conflict",
        recovery: "reload_model_settings",
      }, 409)),
    );

    const request = setModelPreference({
      purpose: "analysis",
      profileId: "deepseek",
      expectedRevision: 7,
    });

    await expect(request).rejects.toBeInstanceOf(ModelProfileRequestError);
    await expect(request).rejects.toMatchObject({
      code: "model_preference_conflict",
      name: "ModelProfileRequestError",
    });
  });
});
