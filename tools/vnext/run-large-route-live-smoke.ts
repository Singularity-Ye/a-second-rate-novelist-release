import { performance } from "node:perf_hooks";
import {
  VNEXT_GATEWAY_ROUTE_ATTESTATION_V1,
  readConfiguredCreativeRuntimeConfig,
} from "../../apps/backend/src/vnext/infrastructure/configured-creative-runtime.adapter.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const config = readConfiguredCreativeRuntimeConfig(process.env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  timer.unref?.();
  const startedAt = performance.now();
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "Return one short JSON object only." },
          { role: "user", content: "Return {\"ok\":true}." },
        ],
        stream: false,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      redirect: "error",
      signal: controller.signal,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const proof = VNEXT_GATEWAY_ROUTE_ATTESTATION_V1;
    const provider = response.headers.get(proof.providerHeader);
    const model = response.headers.get(proof.modelHeader);
    const fallback = response.headers.get(proof.fallbackAppliedHeader);
    assert(response.status === 200, `large route status ${response.status}`);
    assert(response.headers.get(proof.markerHeader) === "v1", "large route attestation missing");
    assert(provider === config.provider, "large route provider mismatch");
    assert(model === config.model, "large route model mismatch");
    assert(fallback === "false", "large route fallback was applied");
    assert(bytes.byteLength > 0, "large route returned an empty body");

    console.log(JSON.stringify({
      verdict: "PASS",
      provider,
      model,
      fallbackApplied: false,
      completeMs: Math.round(performance.now() - startedAt),
      bodyBytes: bytes.byteLength,
    }, null, 2));
  } finally {
    clearTimeout(timer);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
