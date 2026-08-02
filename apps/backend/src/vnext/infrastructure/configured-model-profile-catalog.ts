import {
  VNEXT_MODEL_PROFILE_IDS,
  VNEXT_MODEL_PURPOSES,
  isVnextModelProfileId,
  type VnextModelProfileId,
  type VnextModelProfileStatus,
  type VnextModelPurpose,
  type VnextPublicModelProfile,
} from "@erliu/shared-contracts";

const PROFILE_LABELS: Readonly<Record<VnextModelProfileId, string>> = {
  deepseek: "DeepSeek",
  gpt: "GPT",
  gemini: "Gemini",
  grok: "Grok",
};

const PROFILE_HINTS: Readonly<Record<VnextModelProfileId, readonly string[]>> = {
  deepseek: ["deepseek"],
  gpt: ["gpt", "openai"],
  gemini: ["gemini", "google"],
  grok: ["grok", "xai", "x.ai"],
};

export type ConfiguredModelProfileSource =
  | "explicit"
  | "legacy_light"
  | "legacy_large";

export interface ConfiguredModelProfile extends VnextPublicModelProfile {
  readonly source: ConfiguredModelProfileSource | null;
}

export interface ConfiguredModelProfileCatalog {
  readonly version: "v1";
  readonly profiles: readonly ConfiguredModelProfile[];
  readonly defaults: Readonly<
    Record<VnextModelPurpose, VnextModelProfileId | null>
  >;
}

interface LegacyRoute {
  readonly source: "legacy_light" | "legacy_large";
  readonly provider: string;
  readonly model: string;
}

function optional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function profilePrefix(id: VnextModelProfileId) {
  return `VNEXT_MODEL_PROFILE_${id.toUpperCase()}`;
}

export function configuredModelProfileEnvironmentPrefix(
  id: VnextModelProfileId,
) {
  return profilePrefix(id);
}

function optionalBoolean(value: string | undefined, name: string) {
  const configured = optional(value);
  if (configured === null) return null;
  const normalized = configured.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function purposes(value: string | undefined, name: string) {
  const normalized = optional(value);
  if (normalized === null) return [...VNEXT_MODEL_PURPOSES];
  const values = [...new Set(normalized.split(",").map((item) => item.trim()))];
  if (
    values.length === 0 ||
    values.some(
      (purpose) =>
        !(VNEXT_MODEL_PURPOSES as readonly string[]).includes(purpose),
    )
  ) {
    throw new Error(
      `${name} must contain only conversation and analysis`,
    );
  }
  return values as VnextModelPurpose[];
}

function boundedIdentity(value: string, maximum: number, name: string) {
  if ([...value].length > maximum) {
    throw new Error(`${name} exceeds the configured trace limit`);
  }
  return value;
}

function legacyRoutes(env: Record<string, string | undefined>) {
  const largeProvider = optional(env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER);
  const largeModel = optional(env.MODEL_ROUTE_CREATIVE_LARGE_MODEL);
  const lightProvider =
    optional(env.MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER) ?? largeProvider;
  const lightModel = optional(env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL);
  const routes: LegacyRoute[] = [];
  if (lightProvider !== null && lightModel !== null) {
    routes.push({
      source: "legacy_light",
      provider: lightProvider,
      model: lightModel,
    });
  }
  if (largeProvider !== null && largeModel !== null) {
    routes.push({
      source: "legacy_large",
      provider: largeProvider,
      model: largeModel,
    });
  }
  return routes;
}

function routeMatchesProfile(route: LegacyRoute, id: VnextModelProfileId) {
  const modelIdentity = route.model.toLowerCase();
  const modelClaims = VNEXT_MODEL_PROFILE_IDS.filter((profileId) =>
    PROFILE_HINTS[profileId].some((hint) => modelIdentity.includes(hint)),
  );
  if (modelClaims.length > 0) return modelClaims.includes(id);

  // A provider may expose an OpenAI-compatible protocol without serving an
  // OpenAI model. Only use provider-name inference when the model itself does
  // not identify any approved profile, otherwise one legacy route could be
  // advertised as two different providers.
  const providerIdentity = route.provider.toLowerCase();
  return PROFILE_HINTS[id].some((hint) => providerIdentity.includes(hint));
}

function preferredLegacyRoute(
  routes: readonly LegacyRoute[],
  id: VnextModelProfileId,
) {
  const preferredSources =
    id === "grok"
      ? (["legacy_large", "legacy_light"] as const)
      : (["legacy_light", "legacy_large"] as const);
  for (const source of preferredSources) {
    const route = routes.find(
      (candidate) =>
        candidate.source === source && routeMatchesProfile(candidate, id),
    );
    if (route !== undefined) return route;
  }
  return null;
}

function explicitProfile(
  id: VnextModelProfileId,
  env: Record<string, string | undefined>,
) {
  const prefix = profilePrefix(id);
  const provider = optional(env[`${prefix}_PROVIDER`]);
  const model = optional(env[`${prefix}_MODEL`]);
  const enabled = optionalBoolean(env[`${prefix}_ENABLED`], `${prefix}_ENABLED`);
  const configuredPurposes = optional(env[`${prefix}_PURPOSES`]);
  const explicit =
    enabled !== null ||
    provider !== null ||
    model !== null ||
    configuredPurposes !== null;
  if (!explicit) return null;
  if ((provider === null) !== (model === null)) {
    throw new Error(`${prefix}_PROVIDER and ${prefix}_MODEL must be configured together`);
  }
  if (enabled === true && (provider === null || model === null)) {
    throw new Error(`${prefix} is enabled but its provider/model are missing`);
  }
  const status: VnextModelProfileStatus =
    enabled === false
      ? "disabled"
      : provider !== null && model !== null
        ? "available"
        : "not_configured";
  return {
    id,
    label: PROFILE_LABELS[id],
    provider:
      provider === null
        ? null
        : boundedIdentity(provider, 100, `${prefix}_PROVIDER`),
    model:
      model === null ? null : boundedIdentity(model, 200, `${prefix}_MODEL`),
    purposes: purposes(env[`${prefix}_PURPOSES`], `${prefix}_PURPOSES`),
    status,
    streaming: true as const,
    source: status === "available" ? ("explicit" as const) : null,
  };
}

function configuredProfile(
  id: VnextModelProfileId,
  env: Record<string, string | undefined>,
  routes: readonly LegacyRoute[],
): ConfiguredModelProfile {
  const explicit = explicitProfile(id, env);
  if (explicit !== null) return explicit;
  const legacy = preferredLegacyRoute(routes, id);
  if (legacy === null) {
    return {
      id,
      label: PROFILE_LABELS[id],
      provider: null,
      model: null,
      purposes: [...VNEXT_MODEL_PURPOSES],
      status: "not_configured",
      streaming: true,
      source: null,
    };
  }
  return {
    id,
    label: PROFILE_LABELS[id],
    provider: boundedIdentity(legacy.provider, 100, `${id} provider`),
    model: boundedIdentity(legacy.model, 200, `${id} model`),
    purposes: [...VNEXT_MODEL_PURPOSES],
    status: "available",
    streaming: true,
    source: legacy.source,
  };
}

function configuredDefault(
  purpose: VnextModelPurpose,
  profiles: readonly ConfiguredModelProfile[],
  env: Record<string, string | undefined>,
) {
  const name =
    purpose === "conversation"
      ? "VNEXT_DEFAULT_CONVERSATION_PROFILE_ID"
      : "VNEXT_DEFAULT_ANALYSIS_PROFILE_ID";
  const configured = optional(env[name]);
  if (configured !== null) {
    if (!isVnextModelProfileId(configured)) {
      throw new Error(`${name} must be a supported model profile id`);
    }
    const profile = profiles.find((candidate) => candidate.id === configured)!;
    if (
      profile.status !== "available" ||
      !profile.purposes.includes(purpose)
    ) {
      throw new Error(`${name} points to an unavailable profile`);
    }
    return configured;
  }
  const conventional = purpose === "conversation" ? "deepseek" : "grok";
  const preferred = profiles.find(
    (profile) =>
      profile.id === conventional &&
      profile.status === "available" &&
      profile.purposes.includes(purpose),
  );
  return (
    preferred ??
    profiles.find(
      (profile) =>
        profile.status === "available" && profile.purposes.includes(purpose),
    ) ??
    null
  )?.id ?? null;
}

export function readConfiguredModelProfileCatalog(
  env: Record<string, string | undefined> = process.env,
): ConfiguredModelProfileCatalog {
  const legacy = legacyRoutes(env);
  const profiles = VNEXT_MODEL_PROFILE_IDS.map((id) =>
    configuredProfile(id, env, legacy),
  );
  return {
    version: "v1",
    profiles,
    defaults: {
      conversation: configuredDefault("conversation", profiles, env),
      analysis: configuredDefault("analysis", profiles, env),
    },
  };
}

export function findConfiguredModelProfile(
  catalog: ConfiguredModelProfileCatalog,
  profileId: VnextModelProfileId,
  purpose: VnextModelPurpose,
) {
  const profile = catalog.profiles.find((candidate) => candidate.id === profileId);
  return profile?.status === "available" && profile.purposes.includes(purpose)
    ? profile
    : null;
}

export function publicModelProfile(
  profile: ConfiguredModelProfile,
): VnextPublicModelProfile {
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    model: profile.model,
    purposes: [...profile.purposes],
    status: profile.status,
    streaming: true,
  };
}
