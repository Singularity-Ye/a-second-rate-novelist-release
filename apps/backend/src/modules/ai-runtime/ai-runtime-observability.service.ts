import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createObservabilityRepository } from "../../common/repositories/observability.repository.js";
import {
  AI_CAPABILITY_KEYS,
  AI_RUNTIME_ROUTE_KEYS,
  readAiRuntimeConfig,
  type AiRuntimeConfig,
  type AiRuntimeExecutionPlan,
} from "./ai-runtime.config.js";
import { buildCreativeGoldenEvalSuite } from "./creative-quality-gate.js";
import type { StoryProposalRuntimeTrace } from "../opencode-runtime/opencode-runtime.service.js";

const LANGFUSE_PACKAGE_NAMES = ["@langfuse/tracing", "@langfuse/otel"] as const;
const PROMPTFOO_PACKAGE_NAME = "promptfoo";
const OPIK_PACKAGE_NAME = "opik";
const OTEL_PACKAGE_NAME = "@opentelemetry/sdk-node";

interface AiRuntimeObservationError {
  tier: string;
  message: string;
}

export interface AiRuntimeObservabilityConfig {
  langfuse: {
    enabled: boolean;
    package_names: string[];
    base_url: string | null;
    public_key_present: boolean;
    secret_key_present: boolean;
  };
  promptfoo: {
    enabled: boolean;
    package_name: string;
    suite_id: string;
  };
  opik: {
    enabled: boolean;
    package_name: string;
    workspace: string | null;
    project_name: string | null;
    api_key_present: boolean;
  };
  otel: {
    enabled: boolean;
    package_name: string;
  };
}

export interface RecordAiRuntimeObservationInput {
  account_id: string;
  story_id?: string | null;
  task_key: string;
  latency_ms: number;
  execution: AiRuntimeExecutionPlan;
  trace: StoryProposalRuntimeTrace | null;
  errors: AiRuntimeObservationError[];
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function todayBucketStart(now: string) {
  return `${now.slice(0, 10)}T00:00:00.000Z`;
}

export function readAiRuntimeObservabilityConfig(
  env: Record<string, string | undefined> = process.env,
): AiRuntimeObservabilityConfig {
  return {
    langfuse: {
      enabled: Boolean(normalizeOptional(env.LANGFUSE_PUBLIC_KEY) && normalizeOptional(env.LANGFUSE_SECRET_KEY)),
      package_names: [...LANGFUSE_PACKAGE_NAMES],
      base_url: normalizeOptional(env.LANGFUSE_BASE_URL),
      public_key_present: Boolean(normalizeOptional(env.LANGFUSE_PUBLIC_KEY)),
      secret_key_present: Boolean(normalizeOptional(env.LANGFUSE_SECRET_KEY)),
    },
    promptfoo: {
      enabled: env.PROMPTFOO_ENABLED === "true" || env.PROMPTFOO_ENABLED === "1",
      package_name: PROMPTFOO_PACKAGE_NAME,
      suite_id: normalizeOptional(env.PROMPTFOO_SUITE_ID) ?? "ai-runtime-smoke",
    },
    opik: {
      enabled: Boolean(normalizeOptional(env.OPIK_API_KEY)),
      package_name: OPIK_PACKAGE_NAME,
      workspace: normalizeOptional(env.OPIK_WORKSPACE),
      project_name: normalizeOptional(env.OPIK_PROJECT_NAME),
      api_key_present: Boolean(normalizeOptional(env.OPIK_API_KEY)),
    },
    otel: {
      enabled: Boolean(
        normalizeOptional(env.LANGFUSE_PUBLIC_KEY) ||
          normalizeOptional(env.LANGFUSE_SECRET_KEY) ||
          normalizeOptional(env.OPIK_API_KEY),
      ),
      package_name: OTEL_PACKAGE_NAME,
    },
  };
}

export async function recordAiRuntimeObservation(input: RecordAiRuntimeObservationInput) {
  const repository = createObservabilityRepository();
  const now = new Date().toISOString();
  const trace_id = input.trace?.message_id ?? `ai-trace-${randomUUID()}`;
  const segment_key = `${input.task_key}:${input.execution.selected_tier}`;

  await repository.appendDomainEvent({
    event_name: "ai_runtime_trace_recorded",
    account_id: input.account_id,
    payload: {
      task_key: input.task_key,
      ...(input.story_id ? { story_id: input.story_id } : {}),
      trace_id,
      requested_tier: input.execution.requested_tier,
      selected_tier: input.execution.selected_tier,
      fallback_applied: input.execution.fallback_applied,
      provider_id: input.execution.provider_id ?? "rules_first",
      model_id: input.execution.model_id ?? "rules_first",
      attempted_tiers: input.execution.attempted_tiers.join(","),
      error_count: input.errors.length,
      latency_ms: input.latency_ms,
    },
    created_at: now,
  });

  await repository.upsertMetricSnapshots([
    {
      metric_key: "ai_runtime_latency_ms",
      value: input.latency_ms,
      segment_key,
      now,
    },
    {
      metric_key: "ai_runtime_cost_usd",
      value: input.trace?.cost ?? 0,
      segment_key,
      now,
    },
    {
      metric_key: "ai_runtime_tokens_input",
      value: input.trace?.tokens.input ?? 0,
      segment_key,
      now,
    },
    {
      metric_key: "ai_runtime_tokens_output",
      value: input.trace?.tokens.output ?? 0,
      segment_key,
      now,
    },
    {
      metric_key: "ai_runtime_tokens_reasoning",
      value: input.trace?.tokens.reasoning ?? 0,
      segment_key,
      now,
    },
  ]);

  return {
    trace_id,
    metric_keys: [
      "ai_runtime_latency_ms",
      "ai_runtime_cost_usd",
      "ai_runtime_tokens_input",
      "ai_runtime_tokens_output",
      "ai_runtime_tokens_reasoning",
    ],
  };
}

export function buildAiRuntimeEvalSmokeBundle(input: {
  runtime_config?: AiRuntimeConfig;
  env?: Record<string, string | undefined>;
  prompt_id: string;
  task_key: string;
  sample_seed_text: string;
  suite?: "runtime-smoke" | "creative-golden";
}) {
  const runtime_config = input.runtime_config ?? readAiRuntimeConfig(input.env);
  const suite = input.suite ?? "runtime-smoke";
  const base_observability = readAiRuntimeObservabilityConfig(input.env);
  const observability = {
    langfuse: {
      ...base_observability.langfuse,
      enabled: runtime_config.observability.langfuse_enabled || base_observability.langfuse.enabled,
    },
    promptfoo: {
      ...base_observability.promptfoo,
      enabled: runtime_config.observability.promptfoo_enabled || base_observability.promptfoo.enabled,
    },
    opik: {
      ...base_observability.opik,
      enabled: runtime_config.observability.opik_enabled || base_observability.opik.enabled,
    },
    otel: {
      ...base_observability.otel,
      enabled:
        runtime_config.observability.langfuse_enabled ||
        runtime_config.observability.opik_enabled ||
        base_observability.otel.enabled,
    },
  };
  const route_snapshot = Object.fromEntries(
    AI_RUNTIME_ROUTE_KEYS.map((tier) => [tier, runtime_config.routes[tier]]),
  );
  const creativeSuite = suite === "creative-golden" ? buildCreativeGoldenEvalSuite(runtime_config) : null;

  return {
    generated_at: new Date().toISOString(),
    suite_id: suite,
    task_key: input.task_key,
    prompt_id: input.prompt_id,
    route_snapshot,
    capability_plane: {
      supply_strategy: runtime_config.capability_plane.supply_strategy,
      preflight_status: runtime_config.capability_plane.preflight.summary.status,
      capability_keys: [...AI_CAPABILITY_KEYS],
      ready_capability_count: runtime_config.capability_plane.preflight.summary.ready_capability_count,
      degraded_capability_count: runtime_config.capability_plane.preflight.summary.degraded_capability_count,
      blocked_capability_count: runtime_config.capability_plane.preflight.summary.blocked_capability_count,
    },
    langfuse: {
      enabled: observability.langfuse.enabled,
      package_names: observability.langfuse.package_names,
      base_url: observability.langfuse.base_url,
      trace_tags: [input.task_key, input.prompt_id, suite],
    },
    promptfoo: {
      enabled: observability.promptfoo.enabled,
      package_name: observability.promptfoo.package_name,
      suite_id: creativeSuite?.suite_id ?? observability.promptfoo.suite_id,
      tests: creativeSuite?.promptfoo_tests ?? [
        {
          description: "story proposal runtime smoke",
          vars: {
            seed_text: input.sample_seed_text,
            requested_tier: "creative_large",
          },
          assert: [
            {
              type: "contains-json",
              value: "proposals",
            },
            {
              type: "javascript",
              value: "output.proposals && output.proposals.length === 3",
            },
          ],
        },
      ],
    },
    opik: {
      enabled: observability.opik.enabled,
      package_name: observability.opik.package_name,
      workspace: observability.opik.workspace,
      project_name:
        creativeSuite?.suite_id === "creative-golden"
          ? creativeSuite.suite_id
          : observability.opik.project_name,
      dataset_items: creativeSuite?.opik_dataset_items ?? [
        {
          input: {
            seed_text: input.sample_seed_text,
            requested_tier: "creative_large",
          },
          expected: {
            proposal_count: 3,
            preferred_tier: "creative_large",
          },
          tags: [input.task_key, "runtime-smoke"],
        },
      ],
    },
    ...(creativeSuite ? { creative_quality: creativeSuite } : {}),
    otel: observability.otel,
  };
}

export function writeAiRuntimeEvalSmokeBundleFile(
  output_path: string,
  input: {
    runtime_config?: AiRuntimeConfig;
    env?: Record<string, string | undefined>;
    prompt_id: string;
    task_key: string;
    sample_seed_text: string;
    suite?: "runtime-smoke" | "creative-golden";
  },
) {
  const bundle = buildAiRuntimeEvalSmokeBundle(input);
  mkdirSync(path.dirname(output_path), { recursive: true });
  writeFileSync(output_path, JSON.stringify(bundle, null, 2), "utf8");

  return {
    output_path,
    route_keys: Object.keys(bundle.route_snapshot),
  };
}
