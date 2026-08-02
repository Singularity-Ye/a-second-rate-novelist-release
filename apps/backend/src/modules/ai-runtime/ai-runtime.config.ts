function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readBooleanFlag(value?: string | null) {
  return value === "true" || value === "1";
}

export const AI_RUNTIME_ROUTE_KEYS = [
  "creative_large",
  "balanced_mid",
  "utility_small",
  "rules_first",
] as const;

export type AiRuntimeTier = (typeof AI_RUNTIME_ROUTE_KEYS)[number];

type AiRuntimeRouteStrategy = "model" | "rules_first";
type AiRuntimeCompatibilityMode = "opencode_env" | null;

export const AI_CAPABILITY_KEYS = [
  "text_generation",
  "planning_review_eval",
  "asr",
  "ocr_document_extraction",
  "vision_understanding",
  "policy_moderation",
  "human_review_trigger",
] as const;

export type AiCapabilityKey = (typeof AI_CAPABILITY_KEYS)[number];

export const AI_CAPABILITY_BACKEND_KEYS = [
  "platform_text_router",
  "platform_multimodal_router",
  "platform_policy_router",
  "ops_human_review",
] as const;

export type AiCapabilityBackendKey = (typeof AI_CAPABILITY_BACKEND_KEYS)[number];
export type AiCapabilitySupplyMode =
  | "platform_api_key"
  | "self_hosted"
  | "public_compute_pool"
  | "human_queue";
export type AiCapabilityStrategy = "tier_route" | "model_route" | "human_review";
export type AiCapabilityHealthStatus = "ready" | "degraded" | "blocked";
export type AiCapabilityPreflightSummaryStatus = "ready" | "warn" | "block";

export interface AiRuntimeRouteDefinition {
  tier: AiRuntimeTier;
  strategy: AiRuntimeRouteStrategy;
  provider_id: string | null;
  model_id: string | null;
  temperature: number;
  timeout_ms: number;
  fallback_tier: AiRuntimeTier | null;
}

export interface AiCapabilityBudgetDefinition {
  max_cost_usd_per_request: number;
  max_cost_usd_per_day: number;
  metric_key: string;
}

export interface AiCapabilityBackendDefinition {
  backend_id: AiCapabilityBackendKey;
  supply_mode: AiCapabilitySupplyMode;
  base_url: string | null;
  queue_key: string | null;
  healthcheck_path: string | null;
  secret_scope: string[];
  health_status: "ready" | "blocked";
}

export interface AiCapabilityDefinition {
  capability: AiCapabilityKey;
  backend_id: AiCapabilityBackendKey;
  strategy: AiCapabilityStrategy;
  default_tier: AiRuntimeTier | null;
  provider_id: string | null;
  model_id: string | null;
  timeout_ms: number;
  fallback_capability: AiCapabilityKey | null;
  budget: AiCapabilityBudgetDefinition;
  secret_scope: string[];
}

export interface AiCapabilityPreflightEntry {
  capability: AiCapabilityKey;
  status: AiCapabilityHealthStatus;
  backend_id: AiCapabilityBackendKey;
  strategy: AiCapabilityStrategy;
  fallback_capability: AiCapabilityKey | null;
  reason_codes: string[];
}

export interface AiCapabilityPlanePreflight {
  summary: {
    status: AiCapabilityPreflightSummaryStatus;
    ready_capability_count: number;
    degraded_capability_count: number;
    blocked_capability_count: number;
  };
  backends: Record<
    AiCapabilityBackendKey,
    {
      status: "ready" | "blocked";
      supply_mode: AiCapabilitySupplyMode;
      base_url: string | null;
      queue_key: string | null;
      secret_scope: string[];
    }
  >;
  capabilities: Record<AiCapabilityKey, AiCapabilityPreflightEntry>;
}

export interface AiCapabilityPlaneConfig {
  supply_strategy: "platform_api_key_first";
  provider_registry: Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition>;
  capability_registry: Record<AiCapabilityKey, AiCapabilityDefinition>;
  preflight: AiCapabilityPlanePreflight;
}

export interface AiRuntimeConfig {
  enabled: boolean;
  configured: boolean;
  router: {
    kind: "litellm";
    base_url: string | null;
    compatibility_mode: AiRuntimeCompatibilityMode;
  };
  routes: Record<AiRuntimeTier, AiRuntimeRouteDefinition>;
  observability: {
    langfuse_enabled: boolean;
    promptfoo_enabled: boolean;
    opik_enabled: boolean;
  };
  secret_scope: {
    router_api_key_present: boolean;
    langfuse_public_key_present: boolean;
    langfuse_secret_key_present: boolean;
    opik_api_key_present: boolean;
  };
  capability_plane: AiCapabilityPlaneConfig;
}

export interface AiRuntimeExecutionPlan {
  requested_tier: AiRuntimeTier;
  selected_tier: AiRuntimeTier;
  provider_id: string | null;
  model_id: string | null;
  strategy: AiRuntimeRouteStrategy;
  temperature: number;
  timeout_ms: number;
  fallback_applied: boolean;
  attempted_tiers: AiRuntimeTier[];
}

export interface AiCapabilityExecutionPlan {
  capability: AiCapabilityKey;
  selected_capability: AiCapabilityKey;
  selected_tier: AiRuntimeTier | null;
  provider_id: string | null;
  model_id: string | null;
  strategy: AiCapabilityStrategy;
  timeout_ms: number;
  fallback_applied: boolean;
  attempted_routes: string[];
  budget_max_cost_usd: number;
  backend_id: AiCapabilityBackendKey;
  secret_scope: string[];
  supply_mode: AiCapabilitySupplyMode;
}

export interface AiRuntimeHealthSnapshot {
  enabled: boolean;
  configured: boolean;
  router_kind: "litellm";
  base_url: string | null;
  compatibility_mode: AiRuntimeCompatibilityMode;
  route_keys: AiRuntimeTier[];
  primary_route: {
    tier: AiRuntimeTier;
    provider_id: string | null;
    model_id: string | null;
    fallback_tier: AiRuntimeTier | null;
    temperature: number;
    timeout_ms: number;
  };
  observability: AiRuntimeConfig["observability"];
  secret_scope: AiRuntimeConfig["secret_scope"];
  capability_plane: {
    supply_strategy: "platform_api_key_first";
    preflight_status: AiCapabilityPreflightSummaryStatus;
    capability_matrix: Record<
      AiCapabilityKey,
      {
        status: AiCapabilityHealthStatus;
        strategy: AiCapabilityStrategy;
        backend_id: AiCapabilityBackendKey;
        fallback_capability: AiCapabilityKey | null;
      }
    >;
    provider_registry: Record<
      AiCapabilityBackendKey,
      {
        status: "ready" | "blocked";
        supply_mode: AiCapabilitySupplyMode;
        base_url: string | null;
        queue_key: string | null;
      }
    >;
  };
}

type AiRuntimeConfigFoundation = Omit<AiRuntimeConfig, "capability_plane">;

const CAPABILITY_BUDGETS: Record<AiCapabilityKey, AiCapabilityBudgetDefinition> = {
  text_generation: {
    max_cost_usd_per_request: 1.5,
    max_cost_usd_per_day: 30,
    metric_key: "capability_budget_text_generation_usd",
  },
  planning_review_eval: {
    max_cost_usd_per_request: 0.3,
    max_cost_usd_per_day: 8,
    metric_key: "capability_budget_planning_review_eval_usd",
  },
  asr: {
    max_cost_usd_per_request: 0.08,
    max_cost_usd_per_day: 5,
    metric_key: "capability_budget_asr_usd",
  },
  ocr_document_extraction: {
    max_cost_usd_per_request: 0.12,
    max_cost_usd_per_day: 5,
    metric_key: "capability_budget_ocr_document_extraction_usd",
  },
  vision_understanding: {
    max_cost_usd_per_request: 0.15,
    max_cost_usd_per_day: 5,
    metric_key: "capability_budget_vision_understanding_usd",
  },
  policy_moderation: {
    max_cost_usd_per_request: 0.03,
    max_cost_usd_per_day: 2,
    metric_key: "capability_budget_policy_moderation_usd",
  },
  human_review_trigger: {
    max_cost_usd_per_request: 0,
    max_cost_usd_per_day: 0,
    metric_key: "capability_budget_human_review_trigger_usd",
  },
};

function resolveRouterBaseUrl(env: Record<string, string | undefined>) {
  return normalizeOptional(env.LITELLM_BASE_URL) ?? normalizeOptional(env.OPENCODE_BASE_URL);
}

function resolveCompatibilityMode(env: Record<string, string | undefined>): AiRuntimeCompatibilityMode {
  return normalizeOptional(env.LITELLM_BASE_URL)
    ? null
    : normalizeOptional(env.OPENCODE_BASE_URL)
      ? "opencode_env"
      : null;
}

function resolveRouteValue(
  env: Record<string, string | undefined>,
  routeKey: Exclude<AiRuntimeTier, "rules_first">,
  field: "PROVIDER" | "MODEL",
) {
  const prefixed = normalizeOptional(env[`MODEL_ROUTE_${routeKey.toUpperCase()}_${field}`]);
  if (prefixed) {
    return prefixed;
  }

  return normalizeOptional(env[`OPENCODE_${field}_ID`]);
}

function resolveCapabilityRouteValue(
  env: Record<string, string | undefined>,
  capability: Exclude<AiCapabilityKey, "text_generation" | "planning_review_eval" | "human_review_trigger">,
  field: "PROVIDER" | "MODEL",
) {
  return normalizeOptional(env[`CAPABILITY_ROUTE_${capability.toUpperCase()}_${field}`]);
}

function resolveCapabilityBackendBaseUrl(
  env: Record<string, string | undefined>,
  backend: Extract<AiCapabilityBackendKey, "platform_text_router" | "platform_multimodal_router" | "platform_policy_router">,
  fallbackBaseUrl: string | null,
) {
  const configured = normalizeOptional(env[`CAPABILITY_BACKEND_${backend.toUpperCase()}_BASE_URL`]);
  return configured ?? fallbackBaseUrl;
}

function buildRouteDefinition(
  env: Record<string, string | undefined>,
  tier: Exclude<AiRuntimeTier, "rules_first">,
  temperature: number,
  timeout_ms: number,
  fallback_tier: AiRuntimeTier,
): AiRuntimeRouteDefinition {
  return {
    tier,
    strategy: "model",
    provider_id: resolveRouteValue(env, tier, "PROVIDER"),
    model_id: resolveRouteValue(env, tier, "MODEL"),
    temperature,
    timeout_ms,
    fallback_tier,
  };
}

function isTierReady(config: AiRuntimeConfigFoundation, tier: AiRuntimeTier) {
  const route = config.routes[tier];
  if (route.strategy === "rules_first") {
    return true;
  }

  return Boolean(config.router.base_url && route.provider_id && route.model_id);
}

function buildProviderRegistry(
  env: Record<string, string | undefined>,
  config: AiRuntimeConfigFoundation,
): Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition> {
  const routerSecretScope = ["LITELLM_API_KEY", "OPENCODE_API_KEY"];
  const routerHealthReady = Boolean(config.router.base_url && config.secret_scope.router_api_key_present);
  const textBaseUrl = resolveCapabilityBackendBaseUrl(env, "platform_text_router", config.router.base_url);
  const multimodalBaseUrl = resolveCapabilityBackendBaseUrl(env, "platform_multimodal_router", config.router.base_url);
  const policyBaseUrl = resolveCapabilityBackendBaseUrl(env, "platform_policy_router", config.router.base_url);
  const reviewQueue = normalizeOptional(env.HUMAN_REVIEW_QUEUE);

  return {
    platform_text_router: {
      backend_id: "platform_text_router",
      supply_mode: "platform_api_key",
      base_url: textBaseUrl,
      queue_key: null,
      healthcheck_path: "/healthz",
      secret_scope: routerSecretScope,
      health_status: textBaseUrl && routerHealthReady ? "ready" : "blocked",
    },
    platform_multimodal_router: {
      backend_id: "platform_multimodal_router",
      supply_mode: "platform_api_key",
      base_url: multimodalBaseUrl,
      queue_key: null,
      healthcheck_path: "/healthz",
      secret_scope: routerSecretScope,
      health_status: multimodalBaseUrl && routerHealthReady ? "ready" : "blocked",
    },
    platform_policy_router: {
      backend_id: "platform_policy_router",
      supply_mode: "platform_api_key",
      base_url: policyBaseUrl,
      queue_key: null,
      healthcheck_path: "/healthz",
      secret_scope: routerSecretScope,
      health_status: policyBaseUrl && routerHealthReady ? "ready" : "blocked",
    },
    ops_human_review: {
      backend_id: "ops_human_review",
      supply_mode: "human_queue",
      base_url: null,
      queue_key: reviewQueue,
      healthcheck_path: null,
      secret_scope: [],
      health_status: reviewQueue ? "ready" : "blocked",
    },
  };
}

function buildCapabilityRegistry(
  env: Record<string, string | undefined>,
  config: AiRuntimeConfigFoundation,
  providerRegistry: Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition>,
): Record<AiCapabilityKey, AiCapabilityDefinition> {
  const textSecretScope = providerRegistry.platform_text_router.secret_scope;
  const multimodalSecretScope = providerRegistry.platform_multimodal_router.secret_scope;
  const policySecretScope = providerRegistry.platform_policy_router.secret_scope;

  return {
    text_generation: {
      capability: "text_generation",
      backend_id: "platform_text_router",
      strategy: "tier_route",
      default_tier: "creative_large",
      provider_id: null,
      model_id: null,
      timeout_ms: config.routes.creative_large.timeout_ms,
      fallback_capability: null,
      budget: CAPABILITY_BUDGETS.text_generation,
      secret_scope: textSecretScope,
    },
    planning_review_eval: {
      capability: "planning_review_eval",
      backend_id: "platform_text_router",
      strategy: "tier_route",
      default_tier: "balanced_mid",
      provider_id: null,
      model_id: null,
      timeout_ms: config.routes.balanced_mid.timeout_ms,
      fallback_capability: null,
      budget: CAPABILITY_BUDGETS.planning_review_eval,
      secret_scope: textSecretScope,
    },
    asr: {
      capability: "asr",
      backend_id: "platform_multimodal_router",
      strategy: "model_route",
      default_tier: null,
      provider_id: resolveCapabilityRouteValue(env, "asr", "PROVIDER"),
      model_id: resolveCapabilityRouteValue(env, "asr", "MODEL"),
      timeout_ms: 30000,
      fallback_capability: "human_review_trigger",
      budget: CAPABILITY_BUDGETS.asr,
      secret_scope: multimodalSecretScope,
    },
    ocr_document_extraction: {
      capability: "ocr_document_extraction",
      backend_id: "platform_multimodal_router",
      strategy: "model_route",
      default_tier: null,
      provider_id: resolveCapabilityRouteValue(env, "ocr_document_extraction", "PROVIDER"),
      model_id: resolveCapabilityRouteValue(env, "ocr_document_extraction", "MODEL"),
      timeout_ms: 30000,
      fallback_capability: "human_review_trigger",
      budget: CAPABILITY_BUDGETS.ocr_document_extraction,
      secret_scope: multimodalSecretScope,
    },
    vision_understanding: {
      capability: "vision_understanding",
      backend_id: "platform_multimodal_router",
      strategy: "model_route",
      default_tier: null,
      provider_id: resolveCapabilityRouteValue(env, "vision_understanding", "PROVIDER"),
      model_id: resolveCapabilityRouteValue(env, "vision_understanding", "MODEL"),
      timeout_ms: 30000,
      fallback_capability: "human_review_trigger",
      budget: CAPABILITY_BUDGETS.vision_understanding,
      secret_scope: multimodalSecretScope,
    },
    policy_moderation: {
      capability: "policy_moderation",
      backend_id: "platform_policy_router",
      strategy: "model_route",
      default_tier: null,
      provider_id: resolveCapabilityRouteValue(env, "policy_moderation", "PROVIDER"),
      model_id: resolveCapabilityRouteValue(env, "policy_moderation", "MODEL"),
      timeout_ms: 8000,
      fallback_capability: "human_review_trigger",
      budget: CAPABILITY_BUDGETS.policy_moderation,
      secret_scope: policySecretScope,
    },
    human_review_trigger: {
      capability: "human_review_trigger",
      backend_id: "ops_human_review",
      strategy: "human_review",
      default_tier: null,
      provider_id: null,
      model_id: null,
      timeout_ms: 0,
      fallback_capability: null,
      budget: CAPABILITY_BUDGETS.human_review_trigger,
      secret_scope: [],
    },
  };
}

function getTierCapabilityHealth(
  config: AiRuntimeConfigFoundation,
  definition: AiCapabilityDefinition,
): Pick<AiCapabilityPreflightEntry, "status" | "reason_codes"> {
  const defaultTier = definition.default_tier;
  if (!defaultTier) {
    return {
      status: "blocked",
      reason_codes: ["CAPABILITY_DEFAULT_TIER_MISSING"],
    };
  }

  if (isTierReady(config, defaultTier)) {
    return {
      status: "ready",
      reason_codes: [],
    };
  }

  let currentTier = config.routes[defaultTier].fallback_tier;
  while (currentTier) {
    if (isTierReady(config, currentTier)) {
      return {
        status: "degraded",
        reason_codes: ["CAPABILITY_TIER_FALLBACK_ACTIVE"],
      };
    }
    currentTier = config.routes[currentTier].fallback_tier;
  }

  return {
    status: "blocked",
    reason_codes: ["CAPABILITY_TIER_ROUTE_UNAVAILABLE"],
  };
}

function getModelCapabilityHealth(
  definition: AiCapabilityDefinition,
  providerRegistry: Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition>,
): Pick<AiCapabilityPreflightEntry, "status" | "reason_codes"> {
  const backend = providerRegistry[definition.backend_id];
  const reason_codes: string[] = [];

  if (backend.health_status !== "ready") {
    reason_codes.push("BACKEND_UNHEALTHY");
  }
  if (!definition.provider_id) {
    reason_codes.push("PROVIDER_ID_MISSING");
  }
  if (!definition.model_id) {
    reason_codes.push("MODEL_ID_MISSING");
  }

  if (reason_codes.length === 0) {
    return {
      status: "ready",
      reason_codes,
    };
  }

  return {
    status: definition.fallback_capability ? "degraded" : "blocked",
    reason_codes,
  };
}

function getHumanReviewCapabilityHealth(
  providerRegistry: Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition>,
): Pick<AiCapabilityPreflightEntry, "status" | "reason_codes"> {
  const backend = providerRegistry.ops_human_review;
  if (backend.health_status === "ready") {
    return {
      status: "ready",
      reason_codes: [],
    };
  }

  return {
    status: "blocked",
    reason_codes: ["HUMAN_REVIEW_QUEUE_MISSING"],
  };
}

function buildCapabilityPlanePreflight(
  config: AiRuntimeConfigFoundation,
  providerRegistry: Record<AiCapabilityBackendKey, AiCapabilityBackendDefinition>,
  capabilityRegistry: Record<AiCapabilityKey, AiCapabilityDefinition>,
): AiCapabilityPlanePreflight {
  const capabilities = {} as Record<AiCapabilityKey, AiCapabilityPreflightEntry>;
  let ready = 0;
  let degraded = 0;
  let blocked = 0;

  for (const capability of AI_CAPABILITY_KEYS) {
    const definition = capabilityRegistry[capability];
    const health =
      definition.strategy === "tier_route"
        ? getTierCapabilityHealth(config, definition)
        : definition.strategy === "model_route"
          ? getModelCapabilityHealth(definition, providerRegistry)
          : getHumanReviewCapabilityHealth(providerRegistry);

    capabilities[capability] = {
      capability,
      status: health.status,
      backend_id: definition.backend_id,
      strategy: definition.strategy,
      fallback_capability: definition.fallback_capability,
      reason_codes: health.reason_codes,
    };

    if (health.status === "ready") {
      ready += 1;
    } else if (health.status === "degraded") {
      degraded += 1;
    } else {
      blocked += 1;
    }
  }

  const status: AiCapabilityPreflightSummaryStatus =
    blocked > 0 ? "block" : degraded > 0 ? "warn" : "ready";

  return {
    summary: {
      status,
      ready_capability_count: ready,
      degraded_capability_count: degraded,
      blocked_capability_count: blocked,
    },
    backends: Object.fromEntries(
      AI_CAPABILITY_BACKEND_KEYS.map((backendKey) => {
        const backend = providerRegistry[backendKey];
        return [
          backendKey,
          {
            status: backend.health_status,
            supply_mode: backend.supply_mode,
            base_url: backend.base_url,
            queue_key: backend.queue_key,
            secret_scope: backend.secret_scope,
          },
        ];
      }),
    ) as AiCapabilityPlanePreflight["backends"],
    capabilities,
  };
}

function buildCapabilityPlaneConfig(
  env: Record<string, string | undefined>,
  config: AiRuntimeConfigFoundation,
): AiCapabilityPlaneConfig {
  const providerRegistry = buildProviderRegistry(env, config);
  const capabilityRegistry = buildCapabilityRegistry(env, config, providerRegistry);
  const preflight = buildCapabilityPlanePreflight(config, providerRegistry, capabilityRegistry);

  return {
    supply_strategy: "platform_api_key_first",
    provider_registry: providerRegistry,
    capability_registry: capabilityRegistry,
    preflight,
  };
}

export function readAiRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): AiRuntimeConfig {
  const base_url = resolveRouterBaseUrl(env);
  const compatibility_mode = resolveCompatibilityMode(env);

  const routes: Record<AiRuntimeTier, AiRuntimeRouteDefinition> = {
    creative_large: buildRouteDefinition(env, "creative_large", 0.8, 45000, "balanced_mid"),
    balanced_mid: buildRouteDefinition(env, "balanced_mid", 0.45, 15000, "utility_small"),
    utility_small: buildRouteDefinition(env, "utility_small", 0.1, 8000, "rules_first"),
    rules_first: {
      tier: "rules_first",
      strategy: "rules_first",
      provider_id: null,
      model_id: null,
      temperature: 0,
      timeout_ms: 0,
      fallback_tier: null,
    },
  };

  const observability = {
    langfuse_enabled: Boolean(
      normalizeOptional(env.LANGFUSE_PUBLIC_KEY) && normalizeOptional(env.LANGFUSE_SECRET_KEY),
    ),
    promptfoo_enabled: readBooleanFlag(normalizeOptional(env.PROMPTFOO_ENABLED)),
    opik_enabled: Boolean(normalizeOptional(env.OPIK_API_KEY)),
  };

  const secret_scope = {
    router_api_key_present: Boolean(
      normalizeOptional(env.LITELLM_API_KEY) ?? normalizeOptional(env.OPENCODE_API_KEY),
    ),
    langfuse_public_key_present: Boolean(normalizeOptional(env.LANGFUSE_PUBLIC_KEY)),
    langfuse_secret_key_present: Boolean(normalizeOptional(env.LANGFUSE_SECRET_KEY)),
    opik_api_key_present: Boolean(normalizeOptional(env.OPIK_API_KEY)),
  };

  const enabled = Boolean(base_url);
  const configured = Boolean(enabled && routes.creative_large.provider_id && routes.creative_large.model_id);

  const foundation: AiRuntimeConfigFoundation = {
    enabled,
    configured,
    router: {
      kind: "litellm",
      base_url,
      compatibility_mode,
    },
    routes,
    observability,
    secret_scope,
  };

  return {
    ...foundation,
    capability_plane: buildCapabilityPlaneConfig(env, foundation),
  };
}

export function resolveAiRuntimeExecutionPlan(
  config: AiRuntimeConfig,
  input: {
    requested_tier: AiRuntimeTier;
    unavailable_tiers?: AiRuntimeTier[];
  },
): AiRuntimeExecutionPlan {
  const unavailable = new Set(input.unavailable_tiers ?? []);
  const attempted_tiers: AiRuntimeTier[] = [];
  let currentTier: AiRuntimeTier | null = input.requested_tier;

  while (currentTier) {
    attempted_tiers.push(currentTier);
    const route: AiRuntimeRouteDefinition = config.routes[currentTier];

    if (route.strategy === "rules_first") {
      return {
        requested_tier: input.requested_tier,
        selected_tier: route.tier,
        provider_id: null,
        model_id: null,
        strategy: route.strategy,
        temperature: route.temperature,
        timeout_ms: route.timeout_ms,
        fallback_applied: route.tier !== input.requested_tier,
        attempted_tiers,
      };
    }

    if (!unavailable.has(currentTier) && config.router.base_url && route.provider_id && route.model_id) {
      return {
        requested_tier: input.requested_tier,
        selected_tier: route.tier,
        provider_id: route.provider_id,
        model_id: route.model_id,
        strategy: route.strategy,
        temperature: route.temperature,
        timeout_ms: route.timeout_ms,
        fallback_applied: route.tier !== input.requested_tier,
        attempted_tiers,
      };
    }

    currentTier = route.fallback_tier;
  }

  return {
    requested_tier: input.requested_tier,
    selected_tier: "rules_first",
    provider_id: null,
    model_id: null,
    strategy: "rules_first",
    temperature: 0,
    timeout_ms: 0,
    fallback_applied: true,
    attempted_tiers,
  };
}

function buildHumanReviewExecutionPlan(
  config: AiRuntimeConfig,
  input: {
    capability: AiCapabilityKey;
    attempted_routes: string[];
  },
): AiCapabilityExecutionPlan {
  const definition = config.capability_plane.capability_registry.human_review_trigger;
  const backend = config.capability_plane.provider_registry[definition.backend_id];

  return {
    capability: input.capability,
    selected_capability: "human_review_trigger",
    selected_tier: null,
    provider_id: null,
    model_id: null,
    strategy: "human_review",
    timeout_ms: definition.timeout_ms,
    fallback_applied: true,
    attempted_routes: [...input.attempted_routes, "human_review_trigger"],
    budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
    backend_id: definition.backend_id,
    secret_scope: definition.secret_scope,
    supply_mode: backend.supply_mode,
  };
}

export function resolveAiCapabilityExecutionPlan(
  config: AiRuntimeConfig,
  input: {
    capability: AiCapabilityKey;
    preferred_tier?: AiRuntimeTier;
    unavailable_tiers?: AiRuntimeTier[];
    unavailable_capabilities?: AiCapabilityKey[];
  },
): AiCapabilityExecutionPlan {
  const definition = config.capability_plane.capability_registry[input.capability];
  const backend = config.capability_plane.provider_registry[definition.backend_id];
  const unavailableCapabilities = new Set(input.unavailable_capabilities ?? []);

  if (definition.strategy === "tier_route") {
    const requested_tier = input.preferred_tier ?? definition.default_tier ?? "rules_first";
    const tierPlan = resolveAiRuntimeExecutionPlan(config, {
      requested_tier,
      ...(input.unavailable_tiers ? { unavailable_tiers: input.unavailable_tiers } : {}),
    });

    return {
      capability: input.capability,
      selected_capability: input.capability,
      selected_tier: tierPlan.selected_tier,
      provider_id: tierPlan.provider_id,
      model_id: tierPlan.model_id,
      strategy: "tier_route",
      timeout_ms: tierPlan.timeout_ms,
      fallback_applied: tierPlan.fallback_applied,
      attempted_routes: tierPlan.attempted_tiers.map((tier) => `${input.capability}:${tier}`),
      budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
      backend_id: definition.backend_id,
      secret_scope: definition.secret_scope,
      supply_mode: backend.supply_mode,
    };
  }

  if (definition.strategy === "human_review") {
    return buildHumanReviewExecutionPlan(config, {
      capability: input.capability,
      attempted_routes: [],
    });
  }

  const attempted_routes = [input.capability];
  const routeIsReady =
    !unavailableCapabilities.has(input.capability) &&
    backend.health_status === "ready" &&
    Boolean(definition.provider_id && definition.model_id);

  if (routeIsReady) {
    return {
      capability: input.capability,
      selected_capability: input.capability,
      selected_tier: null,
      provider_id: definition.provider_id,
      model_id: definition.model_id,
      strategy: "model_route",
      timeout_ms: definition.timeout_ms,
      fallback_applied: false,
      attempted_routes,
      budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
      backend_id: definition.backend_id,
      secret_scope: definition.secret_scope,
      supply_mode: backend.supply_mode,
    };
  }

  if (definition.fallback_capability) {
    return buildHumanReviewExecutionPlan(config, {
      capability: input.capability,
      attempted_routes,
    });
  }

  return {
    capability: input.capability,
    selected_capability: input.capability,
    selected_tier: null,
    provider_id: definition.provider_id,
    model_id: definition.model_id,
    strategy: "model_route",
    timeout_ms: definition.timeout_ms,
    fallback_applied: true,
    attempted_routes,
    budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
    backend_id: definition.backend_id,
    secret_scope: definition.secret_scope,
    supply_mode: backend.supply_mode,
  };
}

export function runAiCapabilityPlanePreflight(
  env: Record<string, string | undefined> = process.env,
): AiCapabilityPlanePreflight {
  return readAiRuntimeConfig(env).capability_plane.preflight;
}

export function getAiRuntimeHealthSnapshot(
  env: Record<string, string | undefined> = process.env,
): AiRuntimeHealthSnapshot {
  const config = readAiRuntimeConfig(env);
  const primary = config.routes.creative_large;

  return {
    enabled: config.enabled,
    configured: config.configured,
    router_kind: config.router.kind,
    base_url: config.router.base_url,
    compatibility_mode: config.router.compatibility_mode,
    route_keys: [...AI_RUNTIME_ROUTE_KEYS],
    primary_route: {
      tier: primary.tier,
      provider_id: primary.provider_id,
      model_id: primary.model_id,
      fallback_tier: primary.fallback_tier,
      temperature: primary.temperature,
      timeout_ms: primary.timeout_ms,
    },
    observability: config.observability,
    secret_scope: config.secret_scope,
    capability_plane: {
      supply_strategy: config.capability_plane.supply_strategy,
      preflight_status: config.capability_plane.preflight.summary.status,
      capability_matrix: Object.fromEntries(
        AI_CAPABILITY_KEYS.map((capability) => {
          const entry = config.capability_plane.preflight.capabilities[capability];
          return [
            capability,
            {
              status: entry.status,
              strategy: entry.strategy,
              backend_id: entry.backend_id,
              fallback_capability: entry.fallback_capability,
            },
          ];
        }),
      ) as AiRuntimeHealthSnapshot["capability_plane"]["capability_matrix"],
      provider_registry: Object.fromEntries(
        AI_CAPABILITY_BACKEND_KEYS.map((backendKey) => {
          const backend = config.capability_plane.provider_registry[backendKey];
          return [
            backendKey,
            {
              status: backend.health_status,
              supply_mode: backend.supply_mode,
              base_url: backend.base_url,
              queue_key: backend.queue_key,
            },
          ];
        }),
      ) as AiRuntimeHealthSnapshot["capability_plane"]["provider_registry"],
    },
  };
}
