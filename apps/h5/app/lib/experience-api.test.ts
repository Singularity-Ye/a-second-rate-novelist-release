import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUEST_ID_1 = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID_2 = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID_3 = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID_4 = "88888888-8888-4888-8888-888888888888";
const UNDERSTANDING_ID = "44444444-4444-4444-8444-444444444444";
const CONSENT_ID = "55555555-5555-4555-8555-555555555555";
const SAFETY_CASE_ID = "66666666-6666-4666-8666-666666666666";
const RECEIPT_ID = "77777777-7777-4777-8777-777777777777";

const MANIFEST = {
  audienceMode: "internal",
  inputPolicy: "synthetic_only",
  admissionPolicyVersion: "internal-synthetic-v1",
  aiIdentityNoticeVersion: "ai-notice-v1",
  serviceTermsVersion: "internal-terms-v1",
  privacyNoticeVersion: "internal-privacy-v1",
} as const;

const PROJECTION = {
  versionId: "projection-v1",
  status: "available",
  headline: "小韩在这里",
  body: "把你想看的关系告诉我。",
  understanding: null,
  primaryAction: {
    code: "submit_intent",
    label: "说说想看的故事",
  },
  secondaryActions: [],
} as const;

const WRITING_PROJECTION = {
  versionId: "projection-v2",
  status: "writing",
  headline: "正在为你写",
  body: "委托已保存。",
  understanding: {
    versionId: UNDERSTANDING_ID,
    statement: "你想看两个人在风雪夜重逢。",
    clarificationQuestion: null,
  },
  primaryAction: null,
  secondaryActions: [
    {
      code: "correct_understanding",
      label: "不是这个意思",
      basedOnVersionId: UNDERSTANDING_ID,
    },
    { code: "return_later", label: "稍后再来" },
  ],
} as const;

const DRAFT = {
  contentId: "content-v1",
  versionId: "draft-v1",
  kind: "opening",
  body: "风雪把来路都盖住了。",
} as const;

type ApiModule = typeof import("./experience-api");

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function installCrypto(uuidValues: readonly string[] = [REQUEST_ID_1]) {
  let uuidIndex = 0;
  let secretIndex = 0;
  const randomUUID = vi.fn(() => {
    const value = uuidValues[uuidIndex];
    uuidIndex += 1;
    if (value === undefined) {
      throw new Error("test UUID sequence exhausted");
    }
    return value;
  });
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    const offset = secretIndex;
    secretIndex += 1;
    bytes.forEach((_value, index) => {
      bytes[index] = (index + offset + 1) % 256;
    });
    return bytes;
  });
  vi.stubGlobal("crypto", { randomUUID, getRandomValues });
  return { randomUUID, getRandomValues };
}

async function captureRejection(promise: Promise<unknown>) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  return caught;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function expectProtectedTransport(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
  path: string,
  method: "GET" | "POST",
) {
  const call = fetchMock.mock.calls[callIndex] as
    | [string, RequestInit]
    | undefined;
  expect(call?.[0]).toBe(path);
  expect(call?.[0]).toMatch(/^\/api\/vnext(?:\/|$)/);
  expect(call?.[1]).toMatchObject({
    method,
    credentials: "include",
    cache: "no-store",
    redirect: "error",
  });
}

describe("vNext H5 experience API", () => {
  let api: ApiModule;

  beforeEach(async () => {
    vi.resetModules();
    window.__ERLIU_RUNTIME_API_BASE_URL__ = "/api";
    api = await import("./experience-api");
  });

  afterEach(() => {
    delete window.__ERLIU_RUNTIME_API_BASE_URL__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reuses an existing HttpOnly session before reading admission policy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.bootstrapExperienceSession()).resolves.toEqual({
      status: "active",
      projection: PROJECTION,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectProtectedTransport(
      fetchMock,
      0,
      "/api/vnext/experience",
      "GET",
    );
  });

  it("clears every pending admission pair after an authenticated bootstrap GET", async () => {
    const rotatedManifest = {
      ...MANIFEST,
      admissionPolicyVersion: "admission-rotated",
    };
    const cryptoMock = installCrypto([
      REQUEST_ID_1,
      REQUEST_ID_2,
      REQUEST_ID_3,
      REQUEST_ID_4,
    ]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("first admission network failure"))
      .mockRejectedValueOnce(new TypeError("rotated admission network failure"))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION))
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION))
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(api.acceptExperienceAdmission(MANIFEST));
    await captureRejection(api.acceptExperienceAdmission(rotatedManifest));
    await expect(api.bootstrapExperienceSession()).resolves.toMatchObject({
      status: "active",
      projection: PROJECTION,
    });
    await api.acceptExperienceAdmission(MANIFEST);
    await api.acceptExperienceAdmission(rotatedManifest);

    expect(requestBody(fetchMock, 3).clientRequestId).toBe(REQUEST_ID_3);
    expect(requestBody(fetchMock, 5).clientRequestId).toBe(REQUEST_ID_4);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(4);
    expect(cryptoMock.getRandomValues).toHaveBeenCalledTimes(4);
  });

  it.each(["authentication_required", "session_expired"] as const)(
    "returns explicit admission_required after %s without auto-consenting or posting",
    async (code) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(401, { code, recovery: "restore_session" }),
        )
        .mockResolvedValueOnce(jsonResponse(200, MANIFEST));
      vi.stubGlobal("fetch", fetchMock);

      await expect(api.bootstrapExperienceSession()).resolves.toEqual({
        status: "admission_required",
        manifest: MANIFEST,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expectProtectedTransport(
        fetchMock,
        0,
        "/api/vnext/experience",
        "GET",
      );
      expectProtectedTransport(
        fetchMock,
        1,
        "/api/vnext/sessions/admission-manifest",
        "GET",
      );
      expect(fetchMock.mock.calls.every((call) => call[1]?.body === undefined)).toBe(
        true,
      );
    },
  );

  it("does not create a session when the initial projection failure is not authentication-related", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(503, {
        code: "temporarily_unavailable",
        recovery: "return_later",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureRejection(api.bootstrapExperienceSession());

    expect(error).toBeInstanceOf(api.ExperienceApiError);
    expect(error).toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...MANIFEST, provider: "private-provider" },
    { ...MANIFEST, audienceMode: "verified_adult_external" },
    { ...MANIFEST, inputPolicy: "real_input" },
  ])("rejects raw, extra, or non-synthetic admission manifest fields", async (manifest) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, {
          code: "authentication_required",
          recovery: "restore_session",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, manifest));
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureRejection(api.bootstrapExperienceSession());

    expect(error).toBeInstanceOf(api.ExperienceApiError);
    expect(error).toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
      status: 502,
    });
    expect(JSON.stringify(error)).not.toMatch(/provider|private-provider|real_input/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("replays the exact in-memory admission pair after POST outcome is unknown, then clears it after POST success", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network detail must stay private"));
    vi.stubGlobal("fetch", fetchMock);

    const firstError = await captureRejection(
      api.acceptExperienceAdmission(MANIFEST),
    );
    const firstBody = requestBody(fetchMock, 0);
    expect(firstError).toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
      status: 0,
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));

    await expect(api.acceptExperienceAdmission(MANIFEST)).resolves.toEqual({
      status: "active",
      projection: PROJECTION,
    });

    const replayBody = requestBody(fetchMock, 1);
    expect(replayBody).toEqual(firstBody);
    expect(firstBody.clientRequestId).toBe(REQUEST_ID_1);
    expect(firstBody.bootstrapRecoverySecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstBody).toMatchObject({
      ...MANIFEST,
      aiIdentityAcknowledged: true,
      serviceTermsAccepted: true,
      privacyNoticeAcknowledged: true,
    });
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
    expect(cryptoMock.getRandomValues).toHaveBeenCalledTimes(1);
    expect(cryptoMock.getRandomValues.mock.calls[0]?.[0]).toHaveLength(32);
    expectProtectedTransport(
      fetchMock,
      1,
      "/api/vnext/sessions/guest",
      "POST",
    );
    expectProtectedTransport(
      fetchMock,
      2,
      "/api/vnext/experience",
      "GET",
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    await api.acceptExperienceAdmission(MANIFEST);
    const nextLogicalAttemptBody = requestBody(fetchMock, 3);
    expect(nextLogicalAttemptBody.clientRequestId).toBe(REQUEST_ID_2);
    expect(nextLogicalAttemptBody.bootstrapRecoverySecret).not.toBe(
      firstBody.bootstrapRecoverySecret,
    );
  });

  it("drops the admission pair immediately after POST success even when projection verification is uncertain", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockRejectedValueOnce(new TypeError("verification network failure"));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(api.acceptExperienceAdmission(MANIFEST));
    const firstBody = requestBody(fetchMock, 0);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, WRITING_PROJECTION));
    await expect(api.acceptExperienceAdmission(MANIFEST)).resolves.toEqual({
      status: "active",
      projection: WRITING_PROJECTION,
    });

    expect(requestBody(fetchMock, 2).clientRequestId).toBe(REQUEST_ID_2);
    expect(requestBody(fetchMock, 2).bootstrapRecoverySecret).not.toBe(
      firstBody.bootstrapRecoverySecret,
    );
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(2);
    expect(cryptoMock.getRandomValues).toHaveBeenCalledTimes(2);
  });

  it("drops a stale admission pair after a public correct_request rejection", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          code: "invalid_request",
          recovery: "correct_request",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureRejection(api.acceptExperienceAdmission(MANIFEST));
    expect(error).toMatchObject({
      code: "invalid_request",
      recovery: "correct_request",
      status: 400,
    });
    await api.acceptExperienceAdmission(MANIFEST);

    expect(requestBody(fetchMock, 1).clientRequestId).toBe(REQUEST_ID_2);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(2);
    expect(cryptoMock.getRandomValues).toHaveBeenCalledTimes(2);
  });

  it("keeps an older admission replay pair when the manifest rotates", async () => {
    const rotatedManifest = {
      ...MANIFEST,
      admissionPolicyVersion: "admission-rotated",
    };
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("first admission network failure"))
      .mockRejectedValueOnce(new TypeError("rotated admission network failure"))
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(api.acceptExperienceAdmission(MANIFEST));
    const firstBody = requestBody(fetchMock, 0);
    await captureRejection(api.acceptExperienceAdmission(rotatedManifest));
    const rotatedBody = requestBody(fetchMock, 1);
    await expect(api.acceptExperienceAdmission(MANIFEST)).resolves.toMatchObject({
      status: "active",
      projection: PROJECTION,
    });

    expect(requestBody(fetchMock, 2)).toEqual(firstBody);
    expect(rotatedBody.clientRequestId).toBe(REQUEST_ID_2);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent acceptance of the same manifest into one POST and one verification GET", async () => {
    installCrypto([REQUEST_ID_1]);
    let resolvePost: ((response: Response) => void) | undefined;
    const postPending = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(postPending)
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const first = api.acceptExperienceAdmission(MANIFEST);
    const second = api.acceptExperienceAdmission(MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePost?.(jsonResponse(201, { status: "active" }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "active", projection: PROJECTION },
      { status: "active", projection: PROJECTION },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves an indistinguishable admission policy block instead of misreporting it as stale", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(403, {
        code: "compliance_blocked",
        recovery: "none",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureRejection(
      api.acceptExperienceAdmission(MANIFEST),
    );
    expect(error).toMatchObject({
      code: "compliance_blocked",
      recovery: "none",
      status: 403,
    });
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
    expect(cryptoMock.getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery material and user request bodies out of storage, logs, telemetry, and errors", async () => {
    installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const sessionStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const sendBeacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("private network failure"))
      .mockRejectedValueOnce(new Error("private network failure"));
    vi.stubGlobal("fetch", fetchMock);

    const admissionError = await captureRejection(
      api.acceptExperienceAdmission(MANIFEST),
    );
    const admissionBody = requestBody(fetchMock, 0);
    const secret = String(admissionBody.bootstrapRecoverySecret);

    const privateText = "这是一段不应出现在错误对象里的私人故事";
    const actionError = await captureRejection(
      api.submitExperienceAction({ action: "submit_intent", text: privateText }),
    );

    expect(Object.keys(admissionError as object).sort()).toEqual([
      "code",
      "recovery",
      "status",
    ]);
    for (const error of [admissionError, actionError]) {
      const serialized = `${String(error)} ${JSON.stringify(error)} ${String(
        (error as Error).stack,
      )}`;
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(REQUEST_ID_1);
      expect(serialized).not.toContain(privateText);
      expect(error).toMatchObject({
        code: "temporarily_unavailable",
        recovery: "return_later",
        status: 0,
      });
    }
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();
    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("replays a submit with the same request id after an unknown outcome", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped after commit"))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      action: "submit_intent" as const,
      text: "两个合成角色在暴雪前重逢。",
    };

    const firstError = await captureRejection(
      api.submitExperienceAction(input, PROJECTION),
    );
    expect(firstError).toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
      status: 0,
    });

    await expect(
      api.submitExperienceAction(input, PROJECTION),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(requestBody(fetchMock, 0)).toEqual(requestBody(fetchMock, 1));
    expect(requestBody(fetchMock, 0)).toEqual({
      action: "submit_intent",
      clientRequestId: REQUEST_ID_1,
      text: "两个合成角色在暴雪前重逢。",
    });
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);

    await api.submitExperienceAction(input, PROJECTION);
    expect(requestBody(fetchMock, 2).clientRequestId).toBe(REQUEST_ID_2);
  });

  it("locks a different fingerprint during an unknown submit until the original is explicitly retried", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped after commit"))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.submitExperienceAction({
        action: "submit_intent",
        text: "第一句委托。",
      }, PROJECTION),
    ).rejects.toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
    });

    await expect(
      api.submitExperienceAction({
        action: "submit_intent",
        text: "第二句委托。",
      }, PROJECTION),
    ).rejects.toMatchObject({
      code: "conflict",
      recovery: "refresh_projection",
      status: 409,
    });

    await expect(
      api.submitExperienceAction({
        action: "submit_intent",
        text: "第一句委托。",
      }, PROJECTION),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0)).toEqual(requestBody(fetchMock, 1));
    expect(requestBody(fetchMock, 0).clientRequestId).toBe(REQUEST_ID_1);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("does not classify canonical truth and replays the exact unknown request directly", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped after commit"))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(
      api.submitExperienceAction({
        action: "submit_intent",
        text: "已落地的委托。",
      }, PROJECTION),
    );
    await expect(
      api.submitExperienceAction({
        action: "submit_intent",
        text: "已落地的委托。",
      }, PROJECTION),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0).clientRequestId).toBe(REQUEST_ID_1);
    expect(requestBody(fetchMock, 0)).toEqual(requestBody(fetchMock, 1));
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "submit",
      input: { action: "submit_intent" as const, text: "原始委托。" },
    },
    {
      name: "correction",
      input: {
        action: "correct_understanding" as const,
        text: "原始纠正。",
        basedOnVersionId: UNDERSTANDING_ID,
      },
    },
    {
      name: "retry",
      input: {
        action: "retry_current_task" as const,
        basedOnVersionId: UNDERSTANDING_ID,
      },
    },
  ])("replays the exact same-id $name request without client classification", async ({ input }) => {
    const cryptoMock = installCrypto([REQUEST_ID_1]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("outcome lost"))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(api.submitExperienceAction(input, PROJECTION));
    await expect(
      api.submitExperienceAction(input, WRITING_PROJECTION),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectProtectedTransport(fetchMock, 0, "/api/vnext/experience/messages", "POST");
    expectProtectedTransport(fetchMock, 1, "/api/vnext/experience/messages", "POST");
    expect(requestBody(fetchMock, 0)).toEqual(requestBody(fetchMock, 1));
    expect(requestBody(fetchMock, 0).clientRequestId).toBe(REQUEST_ID_1);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("drops an unknown submit at an active bootstrap boundary without reusing its id or body", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2, REQUEST_ID_3]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("old session outcome lost"))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const oldInput = { action: "submit_intent" as const, text: "旧会话委托。" };
    await captureRejection(api.submitExperienceAction(oldInput, PROJECTION));
    await expect(api.bootstrapExperienceSession()).resolves.toMatchObject({
      status: "active",
      projection: PROJECTION,
    });

    await expect(
      api.submitExperienceAction(
        { action: "submit_intent", text: "新会话委托。" },
        PROJECTION,
      ),
    ).resolves.toEqual(WRITING_PROJECTION);
    await expect(api.submitExperienceAction(oldInput, PROJECTION)).resolves.toEqual(
      WRITING_PROJECTION,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/vnext/experience");
    expect(requestBody(fetchMock, 2).clientRequestId).toBe(REQUEST_ID_2);
    expect(requestBody(fetchMock, 2).text).toBe("新会话委托。");
    expect(requestBody(fetchMock, 3).clientRequestId).toBe(REQUEST_ID_3);
    expect(requestBody(fetchMock, 3).text).toBe("旧会话委托。");
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(3);
  });

  it("drops an unknown submit after admission creates the active session", async () => {
    installCrypto([REQUEST_ID_1, REQUEST_ID_2, REQUEST_ID_3]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("old session outcome lost"))
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    await captureRejection(
      api.submitExperienceAction(
        { action: "submit_intent", text: "旧会话委托。" },
        PROJECTION,
      ),
    );
    await expect(api.acceptExperienceAdmission(MANIFEST)).resolves.toMatchObject({
      status: "active",
      projection: PROJECTION,
    });
    await expect(
      api.submitExperienceAction(
        { action: "submit_intent", text: "准入后的新委托。" },
        PROJECTION,
      ),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(requestBody(fetchMock, 3).clientRequestId).toBe(REQUEST_ID_3);
    expect(requestBody(fetchMock, 3).text).toBe("准入后的新委托。");
  });

  it("replays without a projection read when an unrelated mutation changes version", async () => {
    const cryptoMock = installCrypto([REQUEST_ID_1]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped after commit"))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const input = { action: "submit_intent" as const, text: "原始委托。" };
    await captureRejection(api.submitExperienceAction(input, PROJECTION));
    await expect(
      api.submitExperienceAction(input, PROJECTION),
    ).resolves.toEqual(WRITING_PROJECTION);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/vnext/experience/messages");
    expect(requestBody(fetchMock, 0)).toEqual(requestBody(fetchMock, 1));
    expect(requestBody(fetchMock, 0).clientRequestId).toBe(REQUEST_ID_1);
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("publishes valid continuous-use header truth from protected responses", async () => {
    installCrypto([REQUEST_ID_1]);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(202, WRITING_PROJECTION, {
        "x-vnext-continuous-use-reminder": "pending",
        "x-vnext-continuous-use-receipt-id": RECEIPT_ID,
        "x-vnext-continuous-use-receipt-version": "1",
        "x-vnext-continuous-use-emitted-at": "2030-01-01T02:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    const unsubscribe = api.subscribeContinuousUseOffer(listener);

    await api.submitExperienceAction({
      action: "submit_intent",
      text: "两个合成角色在暴雪前重逢。",
    });

    expect(listener).toHaveBeenCalledWith({
      status: "pending",
      receiptId: RECEIPT_ID,
      receiptVersion: 1,
      emittedAt: "2030-01-01T02:00:00.000Z",
    });
    unsubscribe();
  });

  it("provides typed projection, draft, action, reminder, consent, safety, and exit endpoints", async () => {
    installCrypto([REQUEST_ID_1, REQUEST_ID_2, REQUEST_ID_3]);
    const consent = {
      id: CONSENT_ID,
      purpose: "model_training",
      kind: "optional",
      status: "active",
      version: 1,
      grantedAt: "2030-01-01T00:00:00.000Z",
      withdrawnAt: null,
    } as const;
    const safetyCase = {
      safetyCaseId: SAFETY_CASE_ID,
      status: "open",
      disposition: "block",
      severity: "medium",
      version: 1,
      openedAt: "2030-01-01T01:00:00.000Z",
      appealedAt: null,
      closedAt: null,
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, WRITING_PROJECTION))
      .mockResolvedValueOnce(jsonResponse(200, DRAFT))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION))
      .mockResolvedValueOnce(jsonResponse(202, WRITING_PROJECTION))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: "not_due",
          nextReminderAt: "2030-01-01T02:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          receiptId: RECEIPT_ID,
          status: "acknowledged",
          receiptVersion: 2,
          acknowledgedAt: "2030-01-01T02:01:00.000Z",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, [consent]))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: "withdrawn",
          version: 2,
          purpose: "model_training",
          complianceStatus: "eligible",
          cancelledTaskCount: 0,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, [safetyCase]))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          safetyCaseId: SAFETY_CASE_ID,
          status: "appealed",
          version: 2,
          appealedAt: "2030-01-01T01:30:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "exited", cancelledTaskCount: 1 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.readExperienceProjection()).resolves.toEqual(
      WRITING_PROJECTION,
    );
    await expect(api.readExperienceDraft()).resolves.toEqual(DRAFT);
    await api.submitExperienceAction({
      action: "submit_intent",
      text: "风雪夜重逢。",
    });
    await api.submitExperienceAction({
      action: "correct_understanding",
      text: "他们其实从未见过。",
      basedOnVersionId: UNDERSTANDING_ID,
    });
    await api.submitExperienceAction({
      action: "retry_current_task",
      basedOnVersionId: `${UNDERSTANDING_ID}:2`,
    });
    await api.evaluateContinuousUse();
    await api.acknowledgeContinuousUse(RECEIPT_ID, 1);
    await expect(api.listConsents()).resolves.toEqual([consent]);
    await api.withdrawConsent(CONSENT_ID, 1);
    await expect(api.listSafetyCases()).resolves.toEqual([safetyCase]);
    await api.appealSafetyCase(SAFETY_CASE_ID, 1, "这里缺少必要语境。");
    await api.exitExperience();

    const expectedRoutes: ReadonlyArray<
      readonly [string, "GET" | "POST"]
    > = [
      ["/api/vnext/experience", "GET"],
      ["/api/vnext/experience/draft", "GET"],
      ["/api/vnext/experience/messages", "POST"],
      ["/api/vnext/experience/messages", "POST"],
      ["/api/vnext/experience/messages", "POST"],
      ["/api/vnext/safety/continuous-use/evaluate", "POST"],
      [
        `/api/vnext/safety/continuous-use/receipts/${RECEIPT_ID}/acknowledge`,
        "POST",
      ],
      ["/api/vnext/consents", "GET"],
      [`/api/vnext/consents/${CONSENT_ID}/withdraw`, "POST"],
      ["/api/vnext/safety/cases", "GET"],
      [`/api/vnext/safety/cases/${SAFETY_CASE_ID}/appeal`, "POST"],
      ["/api/vnext/safety/session/exit", "POST"],
    ];
    expectedRoutes.forEach(([path, method], index) => {
      expectProtectedTransport(fetchMock, index, path, method);
    });

    expect(requestBody(fetchMock, 2)).toEqual({
      action: "submit_intent",
      clientRequestId: REQUEST_ID_1,
      text: "风雪夜重逢。",
    });
    expect(requestBody(fetchMock, 3)).toEqual({
      action: "correct_understanding",
      clientRequestId: REQUEST_ID_2,
      text: "他们其实从未见过。",
      basedOnVersionId: UNDERSTANDING_ID,
    });
    expect(requestBody(fetchMock, 4)).toEqual({
      action: "retry_current_task",
      clientRequestId: REQUEST_ID_3,
      basedOnVersionId: `${UNDERSTANDING_ID}:2`,
    });
    expect(requestBody(fetchMock, 5)).toEqual({});
    expect(requestBody(fetchMock, 6)).toEqual({ basedOnReceiptVersion: 1 });
    expect(requestBody(fetchMock, 8)).toEqual({ basedOnVersion: 1 });
    expect(requestBody(fetchMock, 10)).toEqual({
      basedOnVersion: 1,
      reason: "这里缺少必要语境。",
    });
    expect(requestBody(fetchMock, 11)).toEqual({});
  });

  it.each(["authentication_required", "session_expired"] as const)(
    "reconciles a lost exit response from a missing-session canonical GET (%s) and clears pending submit state",
    async (code) => {
      const cryptoMock = installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("submit response lost"))
        .mockRejectedValueOnce(new TypeError("exit response lost"))
        .mockResolvedValueOnce(
          jsonResponse(401, {
            code,
            recovery: "restore_session",
          }),
        )
        .mockResolvedValueOnce(jsonResponse(202, PROJECTION));
      vi.stubGlobal("fetch", fetchMock);

      await captureRejection(
        api.submitExperienceAction({
          action: "submit_intent",
          text: "风雪夜重逢。",
        }),
      );
      await expect(api.exitExperience()).resolves.toBeUndefined();
      await expect(
        api.submitExperienceAction({
          action: "submit_intent",
          text: "风雪夜重逢。",
        }),
      ).resolves.toEqual(PROJECTION);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expectProtectedTransport(fetchMock, 1, "/api/vnext/safety/session/exit", "POST");
      expectProtectedTransport(fetchMock, 2, "/api/vnext/experience", "GET");
      expect(requestBody(fetchMock, 3).clientRequestId).toBe(REQUEST_ID_2);
      expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    {
      label: "an active canonical projection",
      verification: jsonResponse(200, PROJECTION),
    },
    {
      label: "a temporarily unavailable canonical projection",
      verification: jsonResponse(503, {
        code: "temporarily_unavailable",
        recovery: "return_later",
      }),
    },
  ])("does not report exit when $label does not prove a missing session", async ({ verification }) => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("exit response lost"))
      .mockResolvedValueOnce(verification);
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureRejection(api.exitExperience());

    expect(error).toMatchObject({
      code: "temporarily_unavailable",
      recovery: "return_later",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectProtectedTransport(fetchMock, 0, "/api/vnext/safety/session/exit", "POST");
    expectProtectedTransport(fetchMock, 1, "/api/vnext/experience", "GET");
  });

  it("strictly rejects extra projection, draft, and public-error fields without leaking them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ...PROJECTION, provider: "private-provider" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ...DRAFT, traceId: "private-trace" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(403, {
          code: "safety_blocked",
          recovery: "appeal_safety_decision",
          caseId: SAFETY_CASE_ID,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const projectionError = await captureRejection(
      api.readExperienceProjection(),
    );
    const draftError = await captureRejection(api.readExperienceDraft());
    const responseError = await captureRejection(api.readExperienceProjection());

    for (const error of [projectionError, draftError, responseError]) {
      expect(error).toBeInstanceOf(api.ExperienceApiError);
      expect(error).toMatchObject({
        code: "temporarily_unavailable",
        recovery: "return_later",
      });
      expect(JSON.stringify(error)).not.toMatch(
        /private-provider|private-trace|caseId/,
      );
    }
  });

  it("rejects invalid client commands before fetch", async () => {
    installCrypto([REQUEST_ID_1, REQUEST_ID_2]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const failures = await Promise.all([
      captureRejection(
        api.submitExperienceAction({ action: "submit_intent", text: "   " }),
      ),
      captureRejection(
        api.submitExperienceAction({
          action: "correct_understanding",
          text: "补充",
          basedOnVersionId: "not-a-version-id",
        }),
      ),
      captureRejection(api.acknowledgeContinuousUse("not-a-receipt", 1)),
      captureRejection(api.withdrawConsent("not-a-consent", 0)),
      captureRejection(
        api.appealSafetyCase("not-a-case", 1, "   "),
      ),
    ]);

    failures.forEach((error) => {
      expect(error).toBeInstanceOf(api.ExperienceApiError);
      expect(error).toMatchObject({
        code: "invalid_request",
        recovery: "correct_request",
        status: 400,
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a stale-cookie bootstrap, reads the current manifest, and re-admits", async () => {
    const rotatedManifest = {
      ...MANIFEST,
      admissionPolicyVersion: "admission-rotated",
    } as const;
    const cryptoMock = installCrypto([REQUEST_ID_1]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(403, {
          code: "compliance_blocked",
          recovery: "refresh_admission",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, rotatedManifest))
      .mockResolvedValueOnce(jsonResponse(201, { status: "active" }))
      .mockResolvedValueOnce(jsonResponse(200, PROJECTION));
    vi.stubGlobal("fetch", fetchMock);

    const refreshed = await api.bootstrapExperienceSession();
    expect(refreshed).toEqual({
      status: "admission_required",
      manifest: rotatedManifest,
    });
    await expect(
      api.acceptExperienceAdmission(rotatedManifest),
    ).resolves.toEqual({
      status: "active",
      projection: PROJECTION,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expectProtectedTransport(fetchMock, 0, "/api/vnext/experience", "GET");
    expectProtectedTransport(
      fetchMock,
      1,
      "/api/vnext/sessions/admission-manifest",
      "GET",
    );
    expectProtectedTransport(fetchMock, 2, "/api/vnext/sessions/guest", "POST");
    expect(requestBody(fetchMock, 2).admissionPolicyVersion).toBe(
      "admission-rotated",
    );
    expectProtectedTransport(fetchMock, 3, "/api/vnext/experience", "GET");
    expect(cryptoMock.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("does not turn an indistinguishable compliance block into admission", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(403, {
        code: "compliance_blocked",
        recovery: "none",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.bootstrapExperienceSession()).rejects.toMatchObject({
      code: "compliance_blocked",
      recovery: "none",
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
