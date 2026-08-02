export interface PrologueLifeRequest {
  sessionSeed: string;
  originArchetype: "student" | "office" | "court" | "cultivator";
}

export interface PrologueLifeResponse {
  scenes: { one: string; two: string; climax: string };
  accidentLine: string;
  accidentReport: string;
  trace: {
    traceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.prologue-life.v1";
    outputHash: string;
  };
  logicalTier: "medium";
  fallbackApplied: false;
}

export type PrologueScenePhase = "one" | "two" | "climax";

export interface PrologueSceneRequest {
  sessionSeed: string;
  originArchetype: PrologueLifeRequest["originArchetype"];
  phase: PrologueScenePhase;
  previousScenes: Array<{ phase: PrologueScenePhase; text: string }>;
  assetContext?: string;
}

export interface PrologueSceneResponse {
  phase: PrologueScenePhase;
  scene: string;
  accidentLine: string | null;
  accidentReport: string | null;
  trace: {
    traceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.prologue-scene.v1";
    outputHash: string;
  };
  logicalTier: "light" | "medium";
  routeFallbackApplied: boolean;
  fallbackApplied: false;
}

function validText(value: unknown, max = 2_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= max;
}

function parseResponse(value: unknown): PrologueLifeResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_runtime_output");
  }
  const output = value as Record<string, unknown>;
  const scenes = output.scenes as Record<string, unknown> | null;
  const trace = output.trace as Record<string, unknown> | null;
  if (
    !scenes || Array.isArray(scenes) ||
    !validText(scenes.one) || !validText(scenes.two) || !validText(scenes.climax) ||
    !validText(output.accidentLine, 500) || !validText(output.accidentReport, 800) ||
    !trace || Array.isArray(trace) ||
    !validText(trace.traceId, 200) || !validText(trace.provider, 100) || !validText(trace.model, 200) ||
    trace.workflowVersion !== "vnext.prologue-life.v1" ||
    output.logicalTier !== "medium" || output.fallbackApplied !== false
  ) {
    throw new Error("invalid_runtime_output");
  }
  return output as unknown as PrologueLifeResponse;
}

export async function generatePrologueLife(input: PrologueLifeRequest): Promise<PrologueLifeResponse> {
  const response = await fetch("/api/vnext/prologue/life", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...input, requestId: globalThis.crypto.randomUUID() }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("provider_unavailable");
  }
  if (!response.ok) {
    const code = typeof payload === "object" && payload !== null && "code" in payload
      ? String((payload as { code: unknown }).code)
      : "provider_unavailable";
    throw new Error(code);
  }
  return parseResponse(payload);
}

function parseSceneResponse(value: unknown): PrologueSceneResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_runtime_output");
  const output = value as Record<string, unknown>;
  const trace = output.trace as Record<string, unknown> | null;
  if (
    !["one", "two", "climax"].includes(String(output.phase)) ||
    !validText(output.scene, 1_600) ||
    !(output.accidentLine === null || validText(output.accidentLine, 500)) ||
    !(output.accidentReport === null || validText(output.accidentReport, 800)) ||
    !trace || Array.isArray(trace) || !validText(trace.traceId, 200) || !validText(trace.provider, 100) || !validText(trace.model, 200) ||
    trace.workflowVersion !== "vnext.prologue-scene.v1" ||
    !["light", "medium"].includes(String(output.logicalTier)) || typeof output.routeFallbackApplied !== "boolean" ||
    output.fallbackApplied !== false
  ) throw new Error("invalid_runtime_output");
  return output as unknown as PrologueSceneResponse;
}

export async function generatePrologueScene(input: PrologueSceneRequest): Promise<PrologueSceneResponse> {
  const response = await fetch("/api/vnext/prologue/scene", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...input, requestId: globalThis.crypto.randomUUID() }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("provider_unavailable");
  }
  if (!response.ok) {
    const code = typeof payload === "object" && payload !== null && "code" in payload ? String((payload as { code: unknown }).code) : "provider_unavailable";
    throw new Error(code);
  }
  return parseSceneResponse(payload);
}
