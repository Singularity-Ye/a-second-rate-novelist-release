import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NovelistChatRuntimeError,
  NovelistChatService,
  type NovelistChatInput,
} from "../../../apps/backend/src/modules/novelist-chat/novelist-chat.service";

const ENV_KEYS = [
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "MODEL_ROUTE_CREATIVE_LARGE_PROVIDER",
  "MODEL_ROUTE_CREATIVE_LARGE_MODEL",
  "MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER",
  "MODEL_ROUTE_CREATIVE_LIGHT_MODEL",
  "VNEXT_CREATIVE_TIMEOUT_MS",
] as const;

const previousEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function input(signal: AbortSignal): NovelistChatInput {
  return {
    requestId: "disconnect-test",
    channel: "novelist",
    text: "在吗？",
    messages: [],
    persona: {
      identityName: "测试主系统",
      personalityCode: "AAA",
      addressStyle: "直说",
      interventionStyle: "observe",
      relationshipLabel: "刚刚绑定",
      lexicon: [],
      voice: {
        authority: 50,
        warmth: 50,
        pressure: 30,
        humor: 40,
        distance: 40,
      },
    },
    task: {
      status: "offered",
      title: "连接测试",
      deliverable: "只验证断线取消",
      evidenceStatus: "awaiting",
    },
    observation: {
      sceneLabel: "书房",
      activityLabel: "等待",
      focus: 50,
      fatigue: 20,
      inspiration: 40,
      emotionalLoad: 10,
    },
    runtimeAbortSignal: signal,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = previousEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("NovelistChatService client cancellation", () => {
  it("aborts the provider fetch when the room client disconnects", async () => {
    process.env.LITELLM_BASE_URL = "https://gateway.example/v1";
    process.env.LITELLM_API_KEY = "test-only-token";
    process.env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER = "test-provider";
    process.env.MODEL_ROUTE_CREATIVE_LARGE_MODEL = "test-large";
    process.env.MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER = "test-provider";
    process.env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL = "test-light";
    process.env.VNEXT_CREATIVE_TIMEOUT_MS = "10000";

    let upstreamSignal: AbortSignal | undefined;
    const fetchStarted = Promise.withResolvers<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined;
        fetchStarted.resolve();
        return new Promise<Response>((_resolve, reject) => {
          upstreamSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const client = new AbortController();
    const next = new NovelistChatService().stream(input(client.signal)).next();
    await fetchStarted.promise;
    expect(upstreamSignal?.aborted).toBe(false);

    client.abort();

    await expect(next).rejects.toMatchObject<Partial<NovelistChatRuntimeError>>({
      code: "client_disconnected",
      status: 499,
    });
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("disables DeepSeek thinking for the low-latency conversation profile only", async () => {
    process.env.LITELLM_BASE_URL = "https://gateway.example/v1";
    process.env.LITELLM_API_KEY = "test-only-token";
    process.env.VNEXT_CREATIVE_TIMEOUT_MS = "10000";

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestBodies.push(body);
        const profileId = String(
          new Headers(init?.headers).get("x-vnext-model-profile-id"),
        );
        const provider = profileId === "deepseek" ? "deepseek" : "vibekey";
        const model = String(body.model);
        return new Response(
          "data: {\"choices\":[{\"delta\":{\"content\":\"收到。\"}}]}\n\n"
            + "data: [DONE]\n\n",
          {
            status: 200,
            headers: {
              "content-type": "text/event-stream",
              "x-vnext-route-attestation": "v1",
              "x-vnext-actual-profile-id": profileId,
              "x-vnext-actual-provider": provider,
              "x-vnext-actual-model": model,
              "x-vnext-fallback-applied": "false",
            },
          },
        );
      }),
    );

    for (const profile of [
      {
        id: "deepseek" as const,
        label: "DeepSeek",
        provider: "deepseek",
        model: "deepseek-v4-flash",
      },
      {
        id: "grok" as const,
        label: "Grok",
        provider: "vibekey",
        model: "grok-4.5",
      },
    ]) {
      const events: string[] = [];
      for await (const event of new NovelistChatService().stream({
        ...input(new AbortController().signal),
        runtimeProfile: {
          ...profile,
          purposes: ["conversation", "analysis"],
          status: "available",
          streaming: true,
          source: "explicit",
        },
      })) {
        events.push(event.type);
      }
      expect(events).toEqual(["ready", "chunk", "complete"]);
    }

    expect(requestBodies[0]?.thinking).toEqual({ type: "disabled" });
    expect(requestBodies[1]?.thinking).toBeUndefined();
  });
});
