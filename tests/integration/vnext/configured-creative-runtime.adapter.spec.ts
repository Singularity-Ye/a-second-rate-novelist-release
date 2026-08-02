import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createActiveHardBoundarySnapshot,
  type ActiveHardBoundarySnapshot,
  type CreativeRuntimePort,
  type UnderstandingOutput,
} from "../../../apps/backend/src/vnext/domain/creative-runtime.port";
import { CreativeRuntimeExecutionError } from "../../../apps/backend/src/vnext/domain/creative-task";
import {
  ConfiguredCreativeRuntimeAdapter,
  VNEXT_GATEWAY_ROUTE_ATTESTATION_V1,
  readConfiguredCreativeRuntimeConfig,
  type ConfiguredCreativeRuntimeConfig,
} from "../../../apps/backend/src/vnext/infrastructure/configured-creative-runtime.adapter";

const CONFIG: ConfiguredCreativeRuntimeConfig = {
  apiKey: "test-secret",
  endpoint: "https://runtime.example/v1/chat/completions",
  model: "creative-model-v1",
  provider: "provider-a",
  timeoutMs: 1_000,
};
const VALID_OPENING = "她".repeat(600);

const UNDERSTANDING: UnderstandingOutput = {
  storyDesire: "写一个关于修复信任的故事",
  emotionalTarget: "克制而真实的希望",
  relationshipTension: "背叛后重建信任",
  clarificationQuestion: null,
  confidence: 0.91,
  commission: {
    premise: "两个分开多年的人因一本未完成的小说重逢",
    emotionalPromise: "不用廉价和解换取团圆",
    relationshipCore: "信任需要通过行动重建",
    styleConstraints: ["第三人称", "少解释"],
    continuationIntent: "先完成开篇再由读者决定是否继续",
  },
  explicitHardBoundaries: [
    {
      value: "不写非自愿亲密关系",
      evidenceStart: 10,
      evidenceEnd: 19,
    },
  ],
};

function boundaries(): ActiveHardBoundarySnapshot {
  return createActiveHardBoundarySnapshot({
    snapshotId: "memory:owner-1:2",
    ownerPrincipalId: "owner-1",
    version: 2,
    capturedAt: "2026-07-18T02:00:00.000Z",
    items: [
      {
        boundaryId: "boundary-1",
        value: "不写非自愿亲密关系",
        sourceRef: "source-old",
        version: 1,
      },
    ],
  });
}

function runtimeResponse(
  output: unknown,
  overrides: {
    finishReason?: string;
    id?: string | null;
    message?: Record<string, unknown> | null;
    model?: string | null;
    routeAttestation?:
      | {
          marker?: string | null;
          provider?: string | null;
          model?: string | null;
          fallbackApplied?: string | null;
        }
      | null;
    status?: number;
  } = {},
) {
  const status = overrides.status ?? 200;
  const responseModel =
    overrides.model === undefined ? CONFIG.model : overrides.model;
  const headers = new Headers({ "content-type": "application/json" });
  if (overrides.routeAttestation !== null) {
    const attestation = overrides.routeAttestation ?? {};
    const marker =
      attestation.marker === undefined
        ? VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerValue
        : attestation.marker;
    const provider =
      attestation.provider === undefined ? CONFIG.provider : attestation.provider;
    const model =
      attestation.model === undefined
        ? typeof responseModel === "string"
          ? responseModel
          : CONFIG.model
        : attestation.model;
    const fallbackApplied =
      attestation.fallbackApplied === undefined
        ? "false"
        : attestation.fallbackApplied;
    if (marker !== null) {
      headers.set(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerHeader, marker);
    }
    if (provider !== null) {
      headers.set(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.providerHeader, provider);
    }
    if (model !== null) {
      headers.set(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.modelHeader, model);
    }
    if (fallbackApplied !== null) {
      headers.set(
        VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.fallbackAppliedHeader,
        fallbackApplied,
      );
    }
  }
  return new Response(
    JSON.stringify({
      id: overrides.id === undefined ? "provider-run-1" : overrides.id,
      model: responseModel,
      choices: [
        {
          finish_reason: overrides.finishReason ?? "stop",
          message:
            overrides.message === undefined
              ?
            ({ role: "assistant", content: JSON.stringify(output) } satisfies Record<
              string,
              unknown
            >)
              : overrides.message,
        },
      ],
    }),
    {
      status,
      headers,
    },
  );
}

function adapter(fetcher: typeof fetch, clockValues?: readonly string[]) {
  let clockIndex = 0;
  return new ConfiguredCreativeRuntimeAdapter({
    config: CONFIG,
    fetcher,
    clock: () => {
      const value = clockValues?.[clockIndex] ?? "2026-07-18T02:00:00.000Z";
      clockIndex += 1;
      return new Date(value);
    },
  });
}

function expectRuntimeError(
  error: unknown,
  failureCode: string,
  retryable: boolean,
) {
  expect(error).toBeInstanceOf(CreativeRuntimeExecutionError);
  expect(error).toMatchObject({ failureCode, retryable });
}

function openingInput() {
  return {
    requestId: "request-1",
    storyId: "story-1",
    understandingId: "understanding-1",
    commissionId: "commission-1",
    premise: "premise",
    emotionalPromise: "earned hope",
    relationshipCore: "trust rebuilt through action",
    styleConstraints: ["third person", "minimal exposition"],
    continuationIntent: "stop after the opening",
    hardBoundaries: boundaries(),
  };
}

describe("ConfiguredCreativeRuntimeAdapter", () => {
  it("locks the trusted vNext gateway route-attestation header contract", () => {
    expect(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1).toEqual({
      markerHeader: "x-vnext-route-attestation",
      markerValue: "v1",
      providerHeader: "x-vnext-actual-provider",
      modelHeader: "x-vnext-actual-model",
      profileHeader: "x-vnext-actual-profile-id",
      fallbackAppliedHeader: "x-vnext-fallback-applied",
    });
  });

  it("reads only the configured LiteLLM route slots and fails closed without them", () => {
    expect(
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "https://router.example/base",
        LITELLM_API_KEY: "secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "provider-a",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "model-a",
        VNEXT_CREATIVE_TIMEOUT_MS: "1200",
      }),
    ).toEqual({
      apiKey: "secret",
      endpoint: "https://router.example/base/v1/chat/completions",
      model: "model-a",
      provider: "provider-a",
      timeoutMs: 1_200,
    });

    expect(() =>
      readConfiguredCreativeRuntimeConfig({
        OPENCODE_BASE_URL: "https://legacy.example",
        OPENCODE_API_KEY: "legacy-secret",
        OPENCODE_PROVIDER_ID: "legacy-provider",
        OPENCODE_MODEL_ID: "legacy-model",
      }),
    ).toThrowError(
      expect.objectContaining({
        failureCode: "provider_unavailable",
        retryable: false,
      }),
    );

    expect(() =>
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "http://runtime.example",
        LITELLM_API_KEY: "secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "provider-a",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "model-a",
      }),
    ).toThrowError(
      expect.objectContaining({ failureCode: "provider_unavailable" }),
    );
    expect(
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "http://127.0.0.1:4000",
        LITELLM_API_KEY: "secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "provider-a",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "model-a",
      }).endpoint,
    ).toBe("http://127.0.0.1:4000/v1/chat/completions");
    expect(
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "http://127.0.0.1:4317/v1",
        LITELLM_API_KEY: "local-secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "company-router",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "gpt-5.5",
        VNEXT_CREATIVE_TIMEOUT_MS: "180000",
      }).timeoutMs,
    ).toBe(180_000);

    expect(() =>
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "http://model-gateway:4317/v1",
        LITELLM_API_KEY: "internal-secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "company-router",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "gpt-5.5",
      }),
    ).toThrowError(
      expect.objectContaining({ failureCode: "provider_unavailable" }),
    );
    expect(
      readConfiguredCreativeRuntimeConfig({
        LITELLM_BASE_URL: "http://model-gateway:4317/v1",
        LITELLM_API_KEY: "internal-secret",
        MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "company-router",
        MODEL_ROUTE_CREATIVE_LARGE_MODEL: "gpt-5.5",
        VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_MODEL_GATEWAY: "true",
      }).endpoint,
    ).toBe("http://model-gateway:4317/v1/chat/completions");
    for (const baseUrl of [
      "http://runtime.example:4317/v1",
      "http://model-gateway:4000/v1",
    ]) {
      expect(() =>
        readConfiguredCreativeRuntimeConfig({
          LITELLM_BASE_URL: baseUrl,
          LITELLM_API_KEY: "internal-secret",
          MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "company-router",
          MODEL_ROUTE_CREATIVE_LARGE_MODEL: "gpt-5.5",
          VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_MODEL_GATEWAY: "true",
        }),
      ).toThrowError(
        expect.objectContaining({ failureCode: "provider_unavailable" }),
      );
    }
  });

  it("rejects DB-incompatible configured provider trace fields before transport", () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const config of [
      { ...CONFIG, provider: "p".repeat(101) },
      { ...CONFIG, model: "m".repeat(201) },
    ]) {
      expect(
        () => new ConfiguredCreativeRuntimeAdapter({ config, fetcher }),
      ).toThrowError(
        expect.objectContaining({
          failureCode: "provider_unavailable",
          retryable: false,
        }),
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("strictly parses understanding, derives a truthful trace, and sends only boundary values", async () => {
    const sourceText = `我想写一个慢热故事。不写非自愿亲密关系。`;
    const fetcher = vi.fn<typeof fetch>(async () => runtimeResponse(UNDERSTANDING));
    const runtime = adapter(fetcher, [
      "2026-07-18T02:00:00.000Z",
      "2026-07-18T02:00:00.125Z",
    ]);

    const result = await runtime.understand({
      requestId: "request-1",
      sourceMessageId: "source-1",
      sourceText,
      hardBoundaries: boundaries(),
    });

    const canonical = JSON.stringify(UNDERSTANDING);
    expect(result).toEqual({
      output: UNDERSTANDING,
      fallbackApplied: false,
      trace: {
        traceId: "provider-run-1",
        provider: "provider-a",
        model: "creative-model-v1",
        workflowVersion: "vnext.understand.v1",
        startedAt: "2026-07-18T02:00:00.000Z",
        completedAt: "2026-07-18T02:00:00.125Z",
        outputHash: createHash("sha256").update(canonical).digest("hex"),
      },
    });

    const request = fetcher.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body)) as {
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { strict: boolean; schema: object } };
    };
    const context = JSON.parse(payload.messages[1]!.content) as Record<string, unknown>;
    expect(context).toMatchObject({
      sourceText,
      activeHardBoundaries: ["不写非自愿亲密关系"],
    });
    expect(JSON.stringify(context)).not.toContain("owner-1");
    expect(JSON.stringify(context)).not.toContain("source-old");
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(request?.redirect).toBe("error");
  });

  it("uses a strict correction workflow, maps ephemeral boundary refs, and does not disclose internal ids", async () => {
    const sourceText = "把原来的限制改成不写胁迫关系。";
    const value = "不写胁迫关系";
    const evidenceStart = sourceText.indexOf(value);
    const providerOutput = {
      storyDesire: "写一个关于修复信任的故事",
      emotionalTarget: "克制而真实的希望",
      relationshipTension: "背叛后重建信任",
      clarificationQuestion: null,
      confidence: 0.94,
      commission: {
        premise: "两个分开多年的人因一本未完成的小说重逢",
        emotionalPromise: "不用廉价和解换取团圆",
        relationshipCore: "信任需要通过行动重建",
        styleConstraints: ["第三人称", "少解释"],
        continuationIntent: "先完成开篇再由读者决定是否继续",
      },
      boundaryActions: [
        {
          operation: "replace",
          targetRef: "ref-1",
          expectedTargetVersion: 1,
          evidence: {
            value,
            evidenceStart,
            evidenceEnd: evidenceStart + value.length,
          },
        },
      ],
    };
    const fetcher = vi.fn<typeof fetch>(async () => runtimeResponse(providerOutput));
    const runtime = adapter(fetcher, [
      "2026-07-18T02:00:00.000Z",
      "2026-07-18T02:00:00.125Z",
    ]);

    const result = await runtime.understand({
      requestId: "request-correction",
      sourceMessageId: "source-correction",
      sourceText,
      hardBoundaries: boundaries(),
      correctionContext: {
        previousUnderstanding: {
          storyDesire: UNDERSTANDING.storyDesire,
          emotionalTarget: UNDERSTANDING.emotionalTarget,
          relationshipTension: UNDERSTANDING.relationshipTension,
          clarificationQuestion: UNDERSTANDING.clarificationQuestion,
          confidence: UNDERSTANDING.confidence,
        },
        previousCommission: { ...UNDERSTANDING.commission },
      },
    });

    expect(result.output).toMatchObject({
      boundaryActions: [
        {
          operation: "replace",
          targetBoundaryId: "boundary-1",
          expectedTargetVersion: 1,
          evidence: { value, evidenceStart },
        },
      ],
    });
    expect(result.trace.workflowVersion).toBe("vnext.correct-understanding.v1");
    const request = fetcher.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const context = JSON.parse(payload.messages[1]!.content) as Record<string, unknown>;
    expect(context).toMatchObject({
      sourceText,
      activeHardBoundaries: [
        { targetRef: "ref-1", value: "不写非自愿亲密关系", version: 1 },
      ],
    });
    expect(JSON.stringify(context)).not.toContain("boundary-1");
    expect(JSON.stringify(context)).not.toContain("source-old");
    expect(JSON.stringify(context)).not.toContain("source-correction");
  });

  it("rejects correction boundary targets whose ephemeral ref or version is not exact", async () => {
    const sourceText = "撤回原来的限制。";
    const value = "撤回原来的限制";
    const evidenceStart = sourceText.indexOf(value);
    const {
      explicitHardBoundaries: _initialBoundaries,
      ...commonUnderstanding
    } = UNDERSTANDING;
    for (const action of [
      {
        operation: "revoke",
        targetRef: "boundary-1",
        expectedTargetVersion: 1,
      },
      {
        operation: "revoke",
        targetRef: "ref-1",
        expectedTargetVersion: 2,
      },
    ]) {
      const fetcher = vi.fn<typeof fetch>(async () =>
        runtimeResponse({
          ...commonUnderstanding,
          boundaryActions: [
            {
              ...action,
              evidence: {
                value,
                evidenceStart,
                evidenceEnd: evidenceStart + value.length,
              },
            },
          ],
        }),
      );
      await expect(
        adapter(fetcher).understand({
          requestId: "request-correction",
          sourceMessageId: "source-correction",
          sourceText,
          hardBoundaries: boundaries(),
          correctionContext: {
            previousUnderstanding: {
              storyDesire: UNDERSTANDING.storyDesire,
              emotionalTarget: UNDERSTANDING.emotionalTarget,
              relationshipTension: UNDERSTANDING.relationshipTension,
              clarificationQuestion: UNDERSTANDING.clarificationQuestion,
              confidence: UNDERSTANDING.confidence,
            },
            previousCommission: { ...UNDERSTANDING.commission },
          },
        }),
      ).rejects.toMatchObject({
        failureCode: "invalid_runtime_output",
        retryable: false,
      });
    }
  });

  it.each([
    ["all route attestation", { routeAttestation: null }],
    ["the v1 marker", { routeAttestation: { marker: null } }],
    ["the actual provider", { routeAttestation: { provider: null } }],
    ["the actual model", { routeAttestation: { model: null } }],
    ["a recognized marker", { routeAttestation: { marker: "v2" } }],
    ["the configured provider", { routeAttestation: { provider: "provider-b" } }],
    [
      "the configured model",
      {
        model: "creative-model-alias",
        routeAttestation: { model: "creative-model-alias" },
      },
    ],
    [
      "the response-envelope model",
      {
        model: "creative-model-alias",
        routeAttestation: { model: CONFIG.model },
      },
    ],
    ["an explicit non-fallback route", { routeAttestation: { fallbackApplied: "true" } }],
  ] as const)(
    "rejects success without %s",
    async (_description, overrides) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        runtimeResponse({ body: VALID_OPENING }, overrides),
      );

      await expect(
        adapter(fetcher).writeOpening(openingInput()),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["provider trace id", { id: "t".repeat(201) }],
    [
      "response-envelope model",
      {
        model: "m".repeat(201),
        routeAttestation: { model: "m".repeat(201) },
      },
    ],
    ["attested provider", { routeAttestation: { provider: "p".repeat(101) } }],
    ["attested model", { routeAttestation: { model: "m".repeat(201) } }],
  ] as const)(
    "rejects a DB-incompatible %s",
    async (_description, overrides) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        runtimeResponse({ body: VALID_OPENING }, overrides),
      );

      await expect(
        adapter(fetcher).writeOpening(openingInput()),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("maps all four methods and carries the active boundary snapshot on every call", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(runtimeResponse(UNDERSTANDING))
      .mockResolvedValueOnce(runtimeResponse({ body: VALID_OPENING }))
      .mockResolvedValueOnce(runtimeResponse({ body: "revision" }))
      .mockResolvedValueOnce(runtimeResponse({ body: "continuation" }));
    const runtime: CreativeRuntimePort = adapter(fetcher);
    const hardBoundaries = boundaries();
    const sourceText = `我想写一个慢热故事。不写非自愿亲密关系。`;

    await runtime.understand({
      requestId: "request-understand",
      sourceMessageId: "source-1",
      sourceText,
      hardBoundaries,
    });
    const opening = await runtime.writeOpening({
      requestId: "request-opening",
      storyId: "story-1",
      understandingId: "understanding-1",
      commissionId: "commission-1",
      premise: "premise",
      emotionalPromise: "earned hope",
      relationshipCore: "trust rebuilt through action",
      styleConstraints: ["third person", "minimal exposition"],
      continuationIntent: "stop after the opening",
      hardBoundaries,
    });
    const revision = await runtime.revise({
      requestId: "request-revise",
      storyId: "story-1",
      contentId: "content-1",
      draftBody: "draft",
      instruction: "make it quieter",
      hardBoundaries,
    });
    const continuation = await runtime.continueStory({
      requestId: "request-continue",
      storyId: "story-1",
      acceptedContentIds: ["content-accepted-1"],
      canonVersion: 2,
      continuityVersion: 3,
      hardBoundaries,
    });

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(opening.trace.outputHash).toBe(
      createHash("sha256").update(VALID_OPENING).digest("hex"),
    );
    expect(revision.trace.outputHash).toBe(
      createHash("sha256").update("revision").digest("hex"),
    );
    expect(continuation.trace.outputHash).toBe(
      createHash("sha256").update("continuation").digest("hex"),
    );
    const workflows = fetcher.mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
        response_format: { json_schema: { name: string } };
      };
      const context = JSON.parse(body.messages[1]!.content) as {
        activeHardBoundaries: string[];
        [key: string]: unknown;
      };
      expect(context.activeHardBoundaries).toEqual(["不写非自愿亲密关系"]);
      if (body.response_format.json_schema.name === "vnext_write_opening_v1") {
        expect(context).toEqual({
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          activeHardBoundaries: ["不写非自愿亲密关系"],
        });
        expect(JSON.stringify(context)).not.toMatch(
          /story-1|understanding-1|commission-1/,
        );
      }
      return body.response_format.json_schema.name;
    });
    expect(workflows).toEqual([
      "vnext_understand_v1",
      "vnext_write_opening_v1",
      "vnext_revise_v1",
      "vnext_continue_story_v1",
    ]);
  });

  it.each(["understand", "writeOpening", "revise", "continueStory"] as const)(
    "rejects a forged boundary snapshot before transport for %s",
    async (method) => {
      const fetcher = vi.fn<typeof fetch>();
      const runtime = adapter(fetcher);
      const forged = structuredClone(boundaries()) as ActiveHardBoundarySnapshot;
      const calls = {
        understand: () =>
          runtime.understand({
            requestId: "request-1",
            sourceMessageId: "source-1",
            sourceText: "source",
            hardBoundaries: forged,
          }),
        writeOpening: () =>
          runtime.writeOpening({
            requestId: "request-1",
            storyId: "story-1",
            understandingId: "understanding-1",
            commissionId: "commission-1",
            premise: "premise",
            emotionalPromise: "earned hope",
            relationshipCore: "trust rebuilt through action",
            styleConstraints: ["third person", "minimal exposition"],
            continuationIntent: "stop after the opening",
            hardBoundaries: forged,
          }),
        revise: () =>
          runtime.revise({
            requestId: "request-1",
            storyId: "story-1",
            contentId: "content-1",
            draftBody: "draft",
            instruction: "instruction",
            hardBoundaries: forged,
          }),
        continueStory: () =>
          runtime.continueStory({
            requestId: "request-1",
            storyId: "story-1",
            acceptedContentIds: ["content-1"],
            canonVersion: 1,
            continuityVersion: 1,
            hardBoundaries: forged,
          }),
      };

      await expect(calls[method]()).rejects.toThrow(
        "validated active hard-boundary snapshot",
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown understanding keys and evidence that is not an exact source slice", async () => {
    const sourceText = `我想写一个慢热故事。不写非自愿亲密关系。`;
    const unknownKey = vi.fn<typeof fetch>(async () =>
      runtimeResponse({ ...UNDERSTANDING, unexpected: true }),
    );
    const wrongEvidence = vi.fn<typeof fetch>(async () =>
      runtimeResponse({
        ...UNDERSTANDING,
        explicitHardBoundaries: [
          { value: "不写非自愿亲密关系", evidenceStart: 0, evidenceEnd: 9 },
        ],
      }),
    );

    for (const fetcher of [unknownKey, wrongEvidence]) {
      await expect(
        adapter(fetcher).understand({
          requestId: "request-1",
          sourceMessageId: "source-1",
          sourceText,
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
    }
  });

  it("rejects unknown story-output keys, markdown JSON, and missing provider trace truth", async () => {
    const cases = [
      runtimeResponse({ body: VALID_OPENING, unexpected: true }),
      runtimeResponse({ body: VALID_OPENING }, {
        message: {
          role: "assistant",
          content: `\`\`\`json\n${JSON.stringify({ body: VALID_OPENING })}\n\`\`\``,
        },
      }),
      runtimeResponse({ body: VALID_OPENING }, { id: null }),
      runtimeResponse({ body: VALID_OPENING }, { model: null }),
    ];

    for (const response of cases) {
      const fetcher = vi.fn<typeof fetch>(async () => response);
      await expect(
        adapter(fetcher).writeOpening({
          requestId: "request-1",
          storyId: "story-1",
          understandingId: "understanding-1",
          commissionId: "commission-1",
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
    }
  });

  it("rejects an opening outside the locked 600-1200 code-point range", async () => {
    for (const body of ["短", "超".repeat(1_201)]) {
      await expect(
        adapter(vi.fn<typeof fetch>(async () => runtimeResponse({ body }))).writeOpening({
          requestId: "request-1",
          storyId: "story-1",
          understandingId: "understanding-1",
          commissionId: "commission-1",
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
    }
  });

  it("rejects replacement characters, control bytes, and unpaired surrogates in story output", async () => {
    const invalidBodies = [
      `${"正".repeat(599)}\ufffd`,
      `${"正".repeat(599)}\u0001`,
      `${"正".repeat(599)}\ud800`,
    ];
    for (const body of invalidBodies) {
      const fetcher = vi.fn<typeof fetch>(async () => runtimeResponse({ body }));
      await expect(
        adapter(fetcher).writeOpening(openingInput()),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "invalid_runtime_output", false);
        return true;
      });
    }
  });

  it("aborts an in-flight provider request when the configured timer expires", async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | null = null;
      const timeout = vi.fn<typeof fetch>(async (_input, init) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) {
          throw new Error("expected an AbortSignal");
        }
        observedSignal = signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted by timer", "AbortError")),
            { once: true },
          );
        });
      });
      const runtime = new ConfiguredCreativeRuntimeAdapter({
        config: { ...CONFIG, timeoutMs: 100 },
        fetcher: timeout,
      });
      const execution = runtime.writeOpening(openingInput());
      const assertion = expect(execution).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "provider_timeout", true);
        expect(String(error)).not.toContain("test-secret");
        return true;
      });

      expect(timeout).toHaveBeenCalledOnce();
      expect(observedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(99);
      expect(observedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps sanitized HTTP failure semantics without exposing response bodies", async () => {
    const statuses = [
      [408, "provider_timeout", true],
      [429, "provider_unavailable", true],
      [503, "provider_unavailable", true],
      [504, "provider_timeout", true],
      [401, "provider_auth_failed", false],
      [403, "provider_auth_failed", false],
      [400, "provider_request_rejected", false],
    ] as const;
    for (const [status, failureCode, retryable] of statuses) {
      const fetcher = vi.fn<typeof fetch>(async () =>
        new Response("sensitive provider body", { status }),
      );
      await expect(
        adapter(fetcher).writeOpening({
          requestId: "request-1",
          storyId: "story-1",
          understandingId: "understanding-1",
          commissionId: "commission-1",
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, failureCode, retryable);
        expect(String(error)).not.toContain("sensitive provider body");
        return true;
      });
    }
  });

  it("cancels a non-success response body before mapping its status", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(stream, { status: 503 }),
    );

    await expect(
      adapter(fetcher).writeOpening(openingInput()),
    ).rejects.toSatisfy((error: unknown) => {
      expectRuntimeError(error, "provider_unavailable", true);
      return true;
    });
    expect(cancelled).toBe(true);
  });

  it("accepts only HTTP 200 and cancels a different 2xx response body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(stream, {
        status: 201,
        headers: {
          [VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerHeader]:
            VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerValue,
        },
      }),
    );

    await expect(
      adapter(fetcher).writeOpening(openingInput()),
    ).rejects.toSatisfy((error: unknown) => {
      expectRuntimeError(error, "provider_request_rejected", false);
      return true;
    });
    expect(cancelled).toBe(true);
  });

  it("fails closed on a redirect response and instructs fetch never to follow it", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.redirect).toBe("error");
      return new Response(null, {
        status: 307,
        headers: { location: "https://redirected.example/v1/chat/completions" },
      });
    });

    await expect(
      adapter(fetcher).writeOpening({
        requestId: "request-1",
        storyId: "story-1",
        understandingId: "understanding-1",
        commissionId: "commission-1",
        premise: "premise",
        emotionalPromise: "earned hope",
        relationshipCore: "trust rebuilt through action",
        styleConstraints: ["third person", "minimal exposition"],
        continuationIntent: "stop after the opening",
        hardBoundaries: boundaries(),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectRuntimeError(error, "provider_request_rejected", false);
      return true;
    });
  });

  it("cancels a provider response stream as soon as it exceeds the byte limit", async () => {
    let pullCount = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(
          new Uint8Array(pullCount === 1 ? 800_000 : 300_001),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(stream));

    await expect(
      adapter(fetcher).writeOpening({
        requestId: "request-1",
        storyId: "story-1",
        understandingId: "understanding-1",
        commissionId: "commission-1",
        premise: "premise",
        emotionalPromise: "earned hope",
        relationshipCore: "trust rebuilt through action",
        styleConstraints: ["third person", "minimal exposition"],
        continuationIntent: "stop after the opening",
        hardBoundaries: boundaries(),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectRuntimeError(error, "invalid_runtime_output", false);
      return true;
    });
    expect(pullCount).toBeGreaterThanOrEqual(2);
    expect(pullCount).toBeLessThan(5);
    expect(cancelled).toBe(true);
  });

  it("maps provider refusal and filtered output to a non-retryable safety block", async () => {
    const responses = [
      runtimeResponse(
        {},
        {
          message: { role: "assistant", content: null, refusal: "cannot comply" },
        },
      ),
      runtimeResponse({}, { finishReason: "content_filter", message: null }),
    ];

    for (const response of responses) {
      const fetcher = vi.fn<typeof fetch>(async () => response);
      await expect(
        adapter(fetcher).writeOpening({
          requestId: "request-1",
          storyId: "story-1",
          understandingId: "understanding-1",
          commissionId: "commission-1",
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, "safety_blocked", false);
        return true;
      });
    }
  });

  it("never falls back when transport or provider JSON is invalid", async () => {
    const responses: Array<() => Promise<Response>> = [
      async () => {
        throw new Error("network failed");
      },
      async () => new Response("not-json", { status: 200 }),
      async () => runtimeResponse({ body: "" }),
    ];
    const expected = [
      ["provider_unavailable", true],
      ["invalid_runtime_output", false],
      ["invalid_runtime_output", false],
    ] as const;

    for (let index = 0; index < responses.length; index += 1) {
      const fetcher = vi.fn<typeof fetch>(responses[index]!);
      await expect(
        adapter(fetcher).writeOpening({
          requestId: "request-1",
          storyId: "story-1",
          understandingId: "understanding-1",
          commissionId: "commission-1",
          premise: "premise",
          emotionalPromise: "earned hope",
          relationshipCore: "trust rebuilt through action",
          styleConstraints: ["third person", "minimal exposition"],
          continuationIntent: "stop after the opening",
          hardBoundaries: boundaries(),
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expectRuntimeError(error, expected[index]![0], expected[index]![1]);
        return true;
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
});
