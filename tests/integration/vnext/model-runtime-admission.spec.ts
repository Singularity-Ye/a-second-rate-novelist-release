import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { ExperienceProjection } from "@erliu/shared-contracts/vnext-experience";
import { describe, expect, it, vi } from "vitest";
import {
  VnextRoomMessageController,
  writeSseEvent,
} from "../../../apps/backend/src/modules/novelist-chat/vnext-room-message.controller";
import {
  InMemoryModelRuntimeAdmission,
  readInMemoryModelRuntimeAdmissionConfig,
} from "../../../apps/backend/src/vnext/infrastructure/in-memory-model-runtime-admission";

const CONFIG = {
  perPrincipal: 1,
  perProfile: 2,
  global: 4,
  retryAfterSeconds: 2,
} as const;

async function acceptedLease(
  admission: InMemoryModelRuntimeAdmission,
  input: {
    ownerPrincipalId: string;
    requestId: string;
    profileId?: "deepseek" | "gpt" | "gemini" | "grok";
    purpose?: "conversation" | "analysis";
  },
) {
  const result = await admission.tryAcquire({
    ownerPrincipalId: input.ownerPrincipalId,
    requestId: input.requestId,
    profileId: input.profileId ?? "deepseek",
    purpose: input.purpose ?? "conversation",
  });
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error(`unexpected denial:${result.code}`);
  return result.lease;
}

class FakeStreamRequest extends EventEmitter {
  readonly vnextSessionId = randomUUID();
  aborted = false;
  destroyed = false;
}

class FakeStreamResponse extends EventEmitter {
  headersSent = false;
  destroyed = false;
  writableEnded = false;
  statusCode = 200;
  jsonBody: unknown;
  writeResult = true;
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  flushHeaders() {
    this.headersSent = true;
  }

  write(chunk: string) {
    this.headersSent = true;
    this.chunks.push(chunk);
    return this.writeResult;
  }

  end() {
    this.writableEnded = true;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: unknown) {
    this.headersSent = true;
    this.writableEnded = true;
    this.jsonBody = body;
  }
}

describe("InMemoryModelRuntimeAdmission", () => {
  it("limits one principal while allowing different principals within budget", async () => {
    const admission = new InMemoryModelRuntimeAdmission(CONFIG);
    const first = await acceptedLease(admission, {
      ownerPrincipalId: "principal-a",
      requestId: "request-a",
    });

    await expect(
      admission.tryAcquire({
        ownerPrincipalId: "principal-a",
        purpose: "conversation",
        profileId: "gpt",
        requestId: "request-b",
      }),
    ).resolves.toEqual({
      accepted: false,
      code: "principal_capacity",
      retryAfterSeconds: 2,
    });

    const second = await acceptedLease(admission, {
      ownerPrincipalId: "principal-b",
      requestId: "request-c",
    });
    await first.release();
    await first.release();
    await second.release();

    const recovered = await acceptedLease(admission, {
      ownerPrincipalId: "principal-a",
      requestId: "request-d",
    });
    await recovered.release();
  });

  it("rejects the same in-flight owner/request pair as a conflict", async () => {
    const admission = new InMemoryModelRuntimeAdmission({
      ...CONFIG,
      perPrincipal: 2,
    });
    const first = await acceptedLease(admission, {
      ownerPrincipalId: "principal-a",
      requestId: "same-request",
    });

    await expect(
      admission.tryAcquire({
        ownerPrincipalId: "principal-a",
        purpose: "conversation",
        profileId: "deepseek",
        requestId: "same-request",
      }),
    ).resolves.toEqual({
      accepted: false,
      code: "duplicate_request",
      retryAfterSeconds: 2,
    });
    await first.release();
  });

  it("enforces profile and global budgets independently", async () => {
    const admission = new InMemoryModelRuntimeAdmission({
      perPrincipal: 2,
      perProfile: 2,
      global: 3,
      retryAfterSeconds: 5,
    });
    const leases = [
      await acceptedLease(admission, {
        ownerPrincipalId: "principal-a",
        requestId: "request-a",
      }),
      await acceptedLease(admission, {
        ownerPrincipalId: "principal-b",
        requestId: "request-b",
      }),
    ];

    await expect(
      admission.tryAcquire({
        ownerPrincipalId: "principal-c",
        purpose: "conversation",
        profileId: "deepseek",
        requestId: "request-c",
      }),
    ).resolves.toEqual({
      accepted: false,
      code: "profile_capacity",
      retryAfterSeconds: 5,
    });

    leases.push(
      await acceptedLease(admission, {
        ownerPrincipalId: "principal-c",
        requestId: "request-d",
        profileId: "grok",
        purpose: "analysis",
      }),
    );
    await expect(
      admission.tryAcquire({
        ownerPrincipalId: "principal-d",
        purpose: "conversation",
        profileId: "gpt",
        requestId: "request-e",
      }),
    ).resolves.toEqual({
      accepted: false,
      code: "global_capacity",
      retryAfterSeconds: 5,
    });
    await Promise.all(leases.map((lease) => lease.release()));
  });

  it("fails startup configuration closed for invalid capacity values", () => {
    expect(() =>
      readInMemoryModelRuntimeAdmissionConfig({
        VNEXT_MODEL_STREAMS_GLOBAL: "0",
      }),
    ).toThrow(/VNEXT_MODEL_STREAMS_GLOBAL/u);
    expect(() =>
      readInMemoryModelRuntimeAdmissionConfig({
        VNEXT_MODEL_STREAMS_PER_PROFILE: "unbounded",
      }),
    ).toThrow(/VNEXT_MODEL_STREAMS_PER_PROFILE/u);
  });
});

describe("room model stream capacity and backpressure", () => {
  it("waits for drain when the HTTP response applies backpressure", async () => {
    const response = new FakeStreamResponse();
    response.writeResult = false;
    let settled = false;
    const writing = writeSseEvent(response as never, {
      type: "chunk",
      text: "慢一点",
    }).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(response.listenerCount("drain")).toBe(1);

    response.emit("drain");
    await expect(writing).resolves.toBe(true);
    expect(response.listenerCount("drain")).toBe(0);
    expect(response.listenerCount("close")).toBe(0);
  });

  it("returns 409/429 before a second provider stream and releases within one second after disconnect", async () => {
    const admission = new InMemoryModelRuntimeAdmission(CONFIG);
    const projection: ExperienceProjection = {
      versionId: randomUUID(),
      status: "available",
      headline: "小韩在房间里",
      body: "可以说句话。",
      understanding: null,
      primaryAction: null,
      secondaryActions: [],
    };
    const router = {
      route: vi.fn(async () => ({
        intent: "conversation" as const,
        handling: "conversation" as const,
        projection,
      })),
    };
    const profile = {
      id: "deepseek" as const,
      label: "DeepSeek",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      purposes: ["conversation" as const],
      status: "available" as const,
      streaming: true as const,
      source: "explicit" as const,
    };
    const modelProfiles = {
      resolve: vi.fn(async () => ({
        purpose: "conversation" as const,
        profile,
        revision: 0,
        source: "default" as const,
      })),
    };
    const streamStarted = Promise.withResolvers<AbortSignal>();
    const stream = vi.fn((input: { runtimeAbortSignal?: AbortSignal }) =>
      (async function* () {
        const signal = input.runtimeAbortSignal!;
        streamStarted.resolve(signal);
        if (!signal.aborted) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        }
      })(),
    );
    const controller = new VnextRoomMessageController(
      router as never,
      { stream } as never,
      modelProfiles as never,
      admission,
    );
    const principal = { id: randomUUID(), kind: "guest" as const };
    const requestId = randomUUID();
    const firstRequest = new FakeStreamRequest();
    const firstResponse = new FakeStreamResponse();
    const firstRun = controller.stream(
      { clientRequestId: requestId, text: "在吗？" },
      principal,
      firstRequest as never,
      firstResponse as never,
    );
    await streamStarted.promise;

    const duplicateResponse = new FakeStreamResponse();
    await controller.stream(
      { clientRequestId: requestId, text: "在吗？" },
      principal,
      new FakeStreamRequest() as never,
      duplicateResponse as never,
    );
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.headers.get("retry-after")).toBe("2");
    expect(duplicateResponse.jsonBody).toEqual({
      code: "request_in_progress",
      recovery: "wait_for_current_request",
    });

    const capacityResponse = new FakeStreamResponse();
    await controller.stream(
      { clientRequestId: randomUUID(), text: "还在吗？" },
      principal,
      new FakeStreamRequest() as never,
      capacityResponse as never,
    );
    expect(capacityResponse.statusCode).toBe(429);
    expect(capacityResponse.headers.get("retry-after")).toBe("2");
    expect(capacityResponse.jsonBody).toEqual({
      code: "model_capacity_exceeded",
      recovery: "retry_later",
    });
    expect(stream).toHaveBeenCalledTimes(1);

    firstResponse.destroyed = true;
    firstResponse.emit("close");
    await Promise.race([
      firstRun,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("lease was not released")), 1_000),
      ),
    ]);

    const recovered = await admission.tryAcquire({
      ownerPrincipalId: principal.id,
      purpose: "conversation",
      profileId: "deepseek",
      requestId: randomUUID(),
    });
    expect(recovered.accepted).toBe(true);
    if (recovered.accepted) await recovered.lease.release();
  });
});
