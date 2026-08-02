import { createHash } from "node:crypto";
import {
  VNEXT_GATEWAY_ROUTE_ATTESTATION_V1,
  readConfiguredCreativeRuntimeConfigForTier,
  type ConfiguredCreativeRuntimeConfig,
} from "./configured-creative-runtime.adapter.js";

const MAX_RESPONSE_BYTES = 300_000;
const MAX_SCENE_TEXT = 1_600;

export type PrologueScenePhase = "one" | "two" | "climax";
export type PrologueSceneIdentity = "student" | "office" | "court" | "cultivator";

export interface GeneratePrologueSceneInput {
  readonly requestId: string;
  readonly sessionSeed: string;
  readonly originArchetype: PrologueSceneIdentity;
  readonly phase: PrologueScenePhase;
  readonly previousScenes: readonly { phase: PrologueScenePhase; text: string }[];
  readonly assetContext?: string;
}

export interface GeneratePrologueSceneResult {
  readonly phase: PrologueScenePhase;
  readonly scene: string;
  readonly accidentLine: string | null;
  readonly accidentReport: string | null;
  readonly trace: {
    readonly traceId: string;
    readonly provider: string;
    readonly model: string;
    readonly workflowVersion: "vnext.prologue-scene.v1";
    readonly outputHash: string;
  };
  readonly logicalTier: "light" | "medium";
  readonly routeFallbackApplied: boolean;
  readonly fallbackApplied: false;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_runtime_output");
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[]) {
  const output = record(value);
  const actual = Object.keys(output);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error("invalid_runtime_output");
  }
  return output;
}

function text(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > maximum) {
    throw new Error("invalid_runtime_output");
  }
  return value;
}

function nullableText(value: unknown, maximum: number) {
  return value === null ? null : text(value, maximum);
}

function parseOutput(value: unknown, phase: PrologueScenePhase) {
  const output = exact(value, ["scene", "accidentLine", "accidentReport"]);
  const accidentLine = nullableText(output.accidentLine, 500);
  const accidentReport = nullableText(output.accidentReport, 800);
  if (phase === "climax" && (accidentLine === null || accidentReport === null)) {
    throw new Error("invalid_runtime_output");
  }
  if (phase !== "climax" && (accidentLine !== null || accidentReport !== null)) {
    throw new Error("invalid_runtime_output");
  }
  return {
    scene: text(output.scene, MAX_SCENE_TEXT),
    accidentLine,
    accidentReport,
  };
}

function schema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["scene", "accidentLine", "accidentReport"],
    properties: {
      scene: { type: "string", minLength: 1, maxLength: MAX_SCENE_TEXT },
      accidentLine: { anyOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "null" }] },
      accidentReport: { anyOf: [{ type: "string", minLength: 1, maxLength: 800 }, { type: "null" }] },
    },
  };
}

function providerStatusError(status: number) {
  return status === 408 || status === 504 ? "provider_timeout" : "provider_unavailable";
}

function phaseInstruction(phase: PrologueScenePhase) {
  if (phase === "one") return "展示这个人的第一枚伤痕与最初动机，不要概括完整前生。";
  if (phase === "two") return "展示长期积累、一次可信的转折，以及他如何逐渐拥有改变命运的资格。";
  return "把这个人推到即将崛起的命运高潮；若是修士，必须是渡劫将成、道基稳固时被异界大运打断。";
}

function phasePrompt(phase: PrologueScenePhase) {
  return `You write one concise Chinese life fragment for an interactive reincarnation story. Return only strict JSON. ${phaseInstruction(phase)} The fragment must be vivid, concrete and emotionally connected to the previous fragments. Do not mention the real user, app, webpage, model or host search. Do not make the character incompetent merely to create drama. For the climax, include the absurd cross-world accident called 异界大运 in accidentLine and a diegetic diagnosis in accidentReport. For earlier phases, accidentLine and accidentReport must be null.`;
}

export class ConfiguredPrologueSceneRuntimeAdapter {
  private readonly light: { config: ConfiguredCreativeRuntimeConfig; routeFallbackApplied: boolean };
  private readonly medium: { config: ConfiguredCreativeRuntimeConfig; routeFallbackApplied: boolean };
  private readonly fetcher: typeof fetch;

  constructor(options: { readonly env?: Record<string, string | undefined>; readonly fetcher?: typeof fetch } = {}) {
    const env = options.env ?? process.env;
    const light = readConfiguredCreativeRuntimeConfigForTier("light", env);
    const medium = readConfiguredCreativeRuntimeConfigForTier("large", env);
    this.light = { config: light.config, routeFallbackApplied: light.routeFallbackApplied };
    this.medium = { config: medium.config, routeFallbackApplied: medium.routeFallbackApplied };
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async generateScene(input: GeneratePrologueSceneInput): Promise<GeneratePrologueSceneResult> {
    const logicalTier = input.phase === "climax" ? "medium" : "light";
    const route = logicalTier === "medium" ? this.medium : this.light;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), route.config.timeoutMs);
    timeout.unref?.();
    let response: Response;
    let raw: string;
    try {
      response = await this.fetcher(route.config.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${route.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: route.config.model,
          messages: [
            { role: "system", content: phasePrompt(input.phase) },
            {
              role: "user",
              content: JSON.stringify({
                sessionSeed: input.sessionSeed,
                originArchetype: input.originArchetype,
                phase: input.phase,
                previousScenes: input.previousScenes,
                assetContext: input.assetContext ?? null,
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "vnext_prologue_scene_v1", strict: true, schema: schema() },
          },
          stream: false,
          temperature: logicalTier === "light" ? 0.65 : 0.8,
          max_tokens: logicalTier === "light" ? 420 : 620,
        }),
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status !== 200) throw new Error(providerStatusError(response.status));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES) throw new Error("invalid_runtime_output");
      raw = bytes.toString("utf8");
    } catch (error) {
      if (controller.signal.aborted) throw new Error("provider_timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const marker = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerHeader);
    const provider = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.providerHeader);
    const model = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.modelHeader);
    const fallback = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.fallbackAppliedHeader);
    if (marker !== "v1" || provider !== route.config.provider || model !== route.config.model || fallback !== "false") {
      throw new Error("invalid_runtime_output");
    }

    let envelopeValue: unknown;
    try {
      envelopeValue = JSON.parse(raw);
    } catch {
      throw new Error("invalid_runtime_output");
    }
    const envelope = record(envelopeValue);
    if (envelope.model !== route.config.model || typeof envelope.id !== "string" || !Array.isArray(envelope.choices) || envelope.choices.length !== 1) {
      throw new Error("invalid_runtime_output");
    }
    const choice = record(envelope.choices[0]);
    const message = record(choice.message);
    const content = text(message.content, MAX_RESPONSE_BYTES);
    let outputValue: unknown;
    try {
      outputValue = JSON.parse(content);
    } catch {
      throw new Error("invalid_runtime_output");
    }
    const output = parseOutput(outputValue, input.phase);
    const traceOutput = { phase: input.phase, ...output };
    return {
      phase: input.phase,
      ...output,
      trace: {
        traceId: text(envelope.id, 200),
        provider,
        model,
        workflowVersion: "vnext.prologue-scene.v1",
        outputHash: createHash("sha256").update(JSON.stringify(traceOutput)).digest("hex"),
      },
      logicalTier,
      routeFallbackApplied: route.routeFallbackApplied,
      fallbackApplied: false,
    };
  }
}
