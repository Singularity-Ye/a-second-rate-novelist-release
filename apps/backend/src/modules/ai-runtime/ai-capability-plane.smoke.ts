import {
  AI_CAPABILITY_KEYS,
  getAiRuntimeHealthSnapshot,
  readAiRuntimeConfig,
  resolveAiCapabilityExecutionPlan,
  runAiCapabilityPlanePreflight,
} from "./ai-runtime.config.js";

function buildSmokeEnv() {
  return {
    LITELLM_BASE_URL: "http://127.0.0.1:4100",
    LITELLM_API_KEY: "router-secret",
    MODEL_ROUTE_CREATIVE_LARGE_PROVIDER: "openai",
    MODEL_ROUTE_CREATIVE_LARGE_MODEL: "gpt-5.4",
    MODEL_ROUTE_BALANCED_MID_PROVIDER: "openai",
    MODEL_ROUTE_BALANCED_MID_MODEL: "gpt-5.4-mini",
    MODEL_ROUTE_UTILITY_SMALL_PROVIDER: "openai",
    MODEL_ROUTE_UTILITY_SMALL_MODEL: "gpt-5.4-nano",
    CAPABILITY_ROUTE_ASR_PROVIDER: "openai",
    CAPABILITY_ROUTE_ASR_MODEL: "gpt-4o-mini-transcribe",
    CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_PROVIDER: "openai",
    CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_MODEL: "gpt-4.1-mini",
    CAPABILITY_ROUTE_VISION_UNDERSTANDING_PROVIDER: "openai",
    CAPABILITY_ROUTE_VISION_UNDERSTANDING_MODEL: "gpt-4.1-mini",
    CAPABILITY_ROUTE_POLICY_MODERATION_PROVIDER: "openai",
    CAPABILITY_ROUTE_POLICY_MODERATION_MODEL: "omni-moderation-latest",
    HUMAN_REVIEW_QUEUE: "ops-human-review",
    ...process.env,
  };
}

const env = buildSmokeEnv();
const config = readAiRuntimeConfig(env);
const preflight = runAiCapabilityPlanePreflight(env);
const health = getAiRuntimeHealthSnapshot(env);

console.log(
  JSON.stringify(
    {
      evidence_level: "runtime",
      generated_at: new Date().toISOString(),
      capability_keys: [...AI_CAPABILITY_KEYS],
      supply_strategy: config.capability_plane.supply_strategy,
      preflight_summary: preflight.summary,
      provider_registry: health.capability_plane.provider_registry,
      capability_matrix: health.capability_plane.capability_matrix,
      text_generation_plan: resolveAiCapabilityExecutionPlan(config, {
        capability: "text_generation",
      }),
      asr_plan: resolveAiCapabilityExecutionPlan(config, {
        capability: "asr",
      }),
      policy_plan: resolveAiCapabilityExecutionPlan(config, {
        capability: "policy_moderation",
      }),
    },
    null,
    2,
  ),
);
