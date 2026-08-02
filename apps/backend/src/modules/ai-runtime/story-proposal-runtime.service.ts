import type { OpencodeClient } from "@opencode-ai/sdk";
import {
  generateStoryProposalsViaOpenCode,
  readOpenCodeRuntimeConfig,
  type OpenCodeRuntimeConfig,
  type StoryProposalCandidate,
  type StoryProposalRuntimeTrace,
} from "../opencode-runtime/opencode-runtime.service.js";
import {
  readAiRuntimeConfig,
  resolveAiRuntimeExecutionPlan,
  type AiRuntimeExecutionPlan,
  type AiRuntimeTier,
} from "./ai-runtime.config.js";
import { buildFallbackStoryProposalCandidates } from "../story-intake/story-proposal-fallbacks.js";

interface StoryProposalRuntimeInput {
  seedText: string;
  intakeMode: string;
}

export interface StoryProposalRuntimeError {
  tier: AiRuntimeTier;
  message: string;
}

export interface StoryProposalAiRuntimeResult {
  proposals: StoryProposalCandidate[];
  execution: AiRuntimeExecutionPlan;
  trace: StoryProposalRuntimeTrace | null;
  errors: StoryProposalRuntimeError[];
}

export interface StoryProposalAiRuntimeOverrides {
  env?: Record<string, string | undefined>;
  clientFactory?: (config: OpenCodeRuntimeConfig) => Pick<OpencodeClient, "session">;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildOpenCodeCompatibilityConfig(input: {
  env: Record<string, string | undefined>;
  execution: AiRuntimeExecutionPlan;
  baseUrl: string;
}): OpenCodeRuntimeConfig {
  const inherited = readOpenCodeRuntimeConfig(input.env);

  return {
    ...inherited,
    enabled: true,
    baseUrl: input.baseUrl,
    ...(input.execution.provider_id ? { providerId: input.execution.provider_id } : {}),
    ...(input.execution.model_id ? { modelId: input.execution.model_id } : {}),
  };
}

export async function generateStoryProposalsViaAiRuntime(
  input: StoryProposalRuntimeInput,
  overrides: StoryProposalAiRuntimeOverrides = {},
): Promise<StoryProposalAiRuntimeResult> {
  const env = overrides.env ?? process.env;
  const runtimeConfig = readAiRuntimeConfig(env);
  const unavailableTiers: AiRuntimeTier[] = [];
  const errors: StoryProposalRuntimeError[] = [];

  while (true) {
    const execution = resolveAiRuntimeExecutionPlan(runtimeConfig, {
      requested_tier: "creative_large",
      unavailable_tiers: unavailableTiers,
    });

    if (execution.strategy === "rules_first" || !runtimeConfig.router.base_url) {
      return {
        proposals: buildFallbackStoryProposalCandidates({
          seedText: input.seedText,
        }),
        execution,
        trace: null,
        errors,
      };
    }

    try {
      const runtimeResult = await generateStoryProposalsViaOpenCode(
        {
          seedText: input.seedText,
          intakeMode: input.intakeMode,
        },
        {
          config: buildOpenCodeCompatibilityConfig({
            env,
            execution,
            baseUrl: runtimeConfig.router.base_url,
          }),
          ...(overrides.clientFactory ? { clientFactory: overrides.clientFactory } : {}),
        },
      );

      return {
        proposals: runtimeResult.proposals,
        execution,
        trace: runtimeResult.trace,
        errors,
      };
    } catch (error) {
      errors.push({
        tier: execution.selected_tier,
        message: toErrorMessage(error),
      });

      if (!unavailableTiers.includes(execution.selected_tier)) {
        unavailableTiers.push(execution.selected_tier);
      }
    }
  }
}
