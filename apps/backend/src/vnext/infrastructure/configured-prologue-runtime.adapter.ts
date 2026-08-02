import { createHash } from "node:crypto";
import {
  VNEXT_GATEWAY_ROUTE_ATTESTATION_V1,
  readConfiguredCreativeRuntimeConfig,
  type ConfiguredCreativeRuntimeConfig,
} from "./configured-creative-runtime.adapter.js";

const MAX_RESPONSE_BYTES = 500_000;
const MAX_TEXT = 2_000;

export type PrologueIdentity = "student" | "office" | "court" | "cultivator";

export interface GeneratePrologueLifeInput {
  readonly requestId: string;
  readonly sessionSeed: string;
  readonly originArchetype: PrologueIdentity;
}

export interface GeneratePrologueLifeResult {
  readonly scenes: {
    readonly one: string;
    readonly two: string;
    readonly climax: string;
  };
  readonly accidentLine: string;
  readonly accidentReport: string;
  readonly trace: {
    readonly traceId: string;
    readonly provider: string;
    readonly model: string;
    readonly workflowVersion: "vnext.prologue-life.v1";
    readonly outputHash: string;
  };
  readonly logicalTier: "medium";
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

function text(value: unknown, maximum = MAX_TEXT) {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > maximum) {
    throw new Error("invalid_runtime_output");
  }
  return value;
}

function parseOutput(value: unknown) {
  const output = exact(value, ["scenes", "accidentLine", "accidentReport"]);
  const scenes = exact(output.scenes, ["one", "two", "climax"]);
  return {
    scenes: {
      one: text(scenes.one),
      two: text(scenes.two),
      climax: text(scenes.climax),
    },
    accidentLine: text(output.accidentLine, 500),
    accidentReport: text(output.accidentReport, 800),
  };
}

function schema() {
  const shortText = { type: "string", minLength: 1, maxLength: MAX_TEXT };
  return {
    type: "object",
    additionalProperties: false,
    required: ["scenes", "accidentLine", "accidentReport"],
    properties: {
      scenes: {
        type: "object",
        additionalProperties: false,
        required: ["one", "two", "climax"],
        properties: { one: shortText, two: shortText, climax: shortText },
      },
      accidentLine: { type: "string", minLength: 1, maxLength: 500 },
      accidentReport: { type: "string", minLength: 1, maxLength: 800 },
    },
  };
}

function providerStatusError(status: number) {
  if (status === 408 || status === 504) return "provider_timeout";
  return "provider_unavailable";
}

export class ConfiguredPrologueRuntimeAdapter {
  private readonly config: ConfiguredCreativeRuntimeConfig;
  private readonly fetcher: typeof fetch;

  constructor(options: { readonly env?: Record<string, string | undefined>; readonly fetcher?: typeof fetch } = {}) {
    this.config = readConfiguredCreativeRuntimeConfig(options.env ?? process.env);
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async generateLife(input: GeneratePrologueLifeInput): Promise<GeneratePrologueLifeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timeout.unref?.();
    let response: Response;
    let raw: string;
    try {
      response = await this.fetcher(this.config.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: "You write the opening life montage for an interactive Chinese reincarnation story. Return only strict JSON matching the schema. Generate exactly three concise but emotionally connected fragments: one shows the origin wound, two shows accumulated effort and a credible turning point, climax brings the character to the edge of rising before an absurd cross-world traffic accident interrupts it. Do not start with the system, user, app, webpage or host search. Do not reveal the character's full biography. Keep the character competent and sympathetic. The accident must be caused by an anomalous cross-world event called 异界大运; for a cultivator it must interrupt a nearly completed tribulation rather than imply weak cultivation. The accident line may contain a short punchline. The report must be a diegetic system-style diagnosis, not an explanation to the real user.",
            },
            { role: "user", content: JSON.stringify(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "vnext_prologue_life_v1",
              strict: true,
              schema: schema(),
            },
          },
          stream: false,
          temperature: 0.85,
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
    if (marker !== "v1" || provider !== this.config.provider || model !== this.config.model || fallback !== "false") {
      throw new Error("invalid_runtime_output");
    }
    let envelopeValue: unknown;
    try {
      envelopeValue = JSON.parse(raw);
    } catch {
      throw new Error("invalid_runtime_output");
    }
    const envelope = record(envelopeValue);
    if (envelope.model !== this.config.model || typeof envelope.id !== "string") throw new Error("invalid_runtime_output");
    if (!Array.isArray(envelope.choices) || envelope.choices.length !== 1) throw new Error("invalid_runtime_output");
    const choice = record(envelope.choices[0]);
    const message = record(choice.message);
    const content = text(message.content, MAX_RESPONSE_BYTES);
    let outputValue: unknown;
    try {
      outputValue = JSON.parse(content);
    } catch {
      throw new Error("invalid_runtime_output");
    }
    const output = parseOutput(outputValue);
    return {
      ...output,
      trace: {
        traceId: text(envelope.id, 200),
        provider,
        model,
        workflowVersion: "vnext.prologue-life.v1",
        outputHash: createHash("sha256").update(JSON.stringify(output)).digest("hex"),
      },
      logicalTier: "medium",
      fallbackApplied: false,
    };
  }
}
