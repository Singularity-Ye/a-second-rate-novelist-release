import { existsSync, readFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type HealthzSummary = {
  url: string;
  status: string | null;
  environment_key: string | null;
  runtime_enabled: boolean | null;
  runtime_configured: boolean | null;
  router_kind: string | null;
  base_url_present: boolean;
  primary_provider_present: boolean;
  primary_model_present: boolean;
  preflight_status: string | null;
  router_api_key_present: boolean | null;
  ready: boolean;
  blockers: string[];
};

const MODEL_ENTRY_REQUIRED = [
  "MODEL_BASE_URL",
  "MODEL_API_KEY",
  "MODEL_NAME",
  "MODEL_GATEWAY_TOKEN",
] as const;
const ISOLATED_LIGHT_REQUIRED = [
  "MODEL_LIGHT_BASE_URL",
  "MODEL_LIGHT_API_KEY",
  "MODEL_LIGHT_NAME",
  "MODEL_LIGHT_PROVIDER_ID",
] as const;
const REQUIRED_ROUTE_ATTESTATION_VERSION = "v1";
const PREFLIGHT_EVIDENCE_LEVEL = "configuration_declaration_only";
const ROUTE_ATTESTATION_V1_REQUIRED_RESPONSE_HEADERS = [
  "x-vnext-route-attestation: v1",
  "x-vnext-actual-provider",
  "x-vnext-actual-model",
  "x-vnext-fallback-applied: false",
] as const;

function parseArgs(argv: string[]) {
  const options = {
    envFile: ".env.hosted",
    healthzUrls: [] as string[],
    healthzJsonPaths: [] as string[],
    expectBlocked: false,
    requireIsolatedLight: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--env-file") {
      options.envFile = argv[++index] ?? options.envFile;
    } else if (arg === "--healthz") {
      const value = argv[++index];
      if (value) options.healthzUrls.push(value);
    } else if (arg === "--healthz-json") {
      const value = argv[++index];
      if (value) options.healthzJsonPaths.push(value);
    } else if (arg === "--expect-blocked") {
      options.expectBlocked = true;
    } else if (arg === "--require-isolated-light") {
      options.requireIsolatedLight = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseEnvFile(path: string): EnvMap {
  if (!existsSync(path)) {
    throw new Error(`env file not found: ${path}`);
  }

  const env: EnvMap = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    env[key] = unquote(rawValue);
  }
  return env;
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isPresent(env: EnvMap, key: string) {
  return Boolean(env[key]?.trim());
}

function modelBaseUrlBlocker(env: EnvMap, key: "MODEL_BASE_URL" | "MODEL_LIGHT_BASE_URL") {
  const value = env[key]?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return `${key} must be a credential-free HTTPS URL`;
    }
  } catch {
    return `${key} must be a valid HTTPS URL`;
  }
  return null;
}

function gatewayCredentialIsolationBlocker(env: EnvMap) {
  const gatewayToken = env.MODEL_GATEWAY_TOKEN?.trim();
  if (!gatewayToken) return null;

  const providerKeys = [
    env.MODEL_API_KEY?.trim(),
    env.MODEL_LIGHT_API_KEY?.trim(),
  ].filter((value): value is string => Boolean(value));

  return providerKeys.includes(gatewayToken)
    ? "MODEL_GATEWAY_TOKEN must differ from provider credentials"
    : null;
}

function envProfile(env: EnvMap, requireIsolatedLight = false) {
  const modelEntryMissing = MODEL_ENTRY_REQUIRED.filter(
    (key) => !isPresent(env, key),
  );
  const baseUrlBlocker = modelBaseUrlBlocker(env, "MODEL_BASE_URL");
  const gatewayIsolationBlocker = gatewayCredentialIsolationBlocker(env);
  const modelGatewayBlockers = [
    ...modelEntryMissing.map((key) => `${key} is missing`),
    ...(baseUrlBlocker ? [baseUrlBlocker] : []),
    ...(gatewayIsolationBlocker ? [gatewayIsolationBlocker] : []),
  ];
  const modelGatewayConfigured = modelGatewayBlockers.length === 0;
  const isolatedLightRequested = ISOLATED_LIGHT_REQUIRED.some((key) => isPresent(env, key));
  const isolatedLightMissing = requireIsolatedLight || isolatedLightRequested
    ? ISOLATED_LIGHT_REQUIRED.filter((key) => !isPresent(env, key))
    : [];
  const lightBaseUrlBlocker = isPresent(env, "MODEL_LIGHT_BASE_URL")
    ? modelBaseUrlBlocker(env, "MODEL_LIGHT_BASE_URL")
    : null;
  const isolatedLightBlockers = [
    ...isolatedLightMissing.map((key) => `${key} is missing`),
    ...(lightBaseUrlBlocker ? [lightBaseUrlBlocker] : []),
  ];
  const isolatedLightConfigured =
    ISOLATED_LIGHT_REQUIRED.every((key) => isPresent(env, key))
    && isolatedLightBlockers.length === 0;
  const ready = modelGatewayConfigured && isolatedLightBlockers.length === 0;
  return {
    ready,
    active_path: modelGatewayConfigured ? "model_gateway" : null,
    evidence_level: PREFLIGHT_EVIDENCE_LEVEL,
    live_provider_evidence: false,
    blockers: [...modelGatewayBlockers, ...isolatedLightBlockers],
    model_gateway: {
      configured: modelGatewayConfigured,
      ready,
      presence: keyPresence(env, MODEL_ENTRY_REQUIRED),
      missing: modelEntryMissing,
      provider_id: env.MODEL_PROVIDER_ID?.trim() || "configured-openai-compatible",
    },
    isolated_light: {
      required: requireIsolatedLight,
      requested: isolatedLightRequested,
      configured: isolatedLightConfigured,
      ready: isolatedLightBlockers.length === 0,
      presence: keyPresence(env, ISOLATED_LIGHT_REQUIRED),
      missing: isolatedLightMissing,
      provider_id: env.MODEL_LIGHT_PROVIDER_ID?.trim() || null,
      blockers: isolatedLightBlockers,
    },
    route_attestation: {
      required_version: REQUIRED_ROUTE_ATTESTATION_VERSION,
      required_response_headers:
        ROUTE_ATTESTATION_V1_REQUIRED_RESPONSE_HEADERS,
      declared_version: REQUIRED_ROUTE_ATTESTATION_VERSION,
      configured: ready,
      evidence_level: PREFLIGHT_EVIDENCE_LEVEL,
      live_provider_evidence: false,
      blockers: ready
        ? []
        : ["built-in route adapter is blocked until the model entries are complete"],
    },
  };
}

function keyPresence(env: EnvMap, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, isPresent(env, key) ? "present" : "blank"]));
}

async function fetchHealthz(url: string): Promise<HealthzSummary> {
  const response = await fetch(url);
  const envelope = await response.json();
  return summarizeHealthz(url, envelope);
}

function readHealthzJson(path: string): HealthzSummary {
  if (!existsSync(path)) {
    throw new Error(`healthz json not found: ${path}`);
  }
  return summarizeHealthz(path, JSON.parse(readFileSync(path, "utf8")));
}

function summarizeHealthz(url: string, envelope: any): HealthzSummary {
  const data = envelope.data ?? envelope;
  const runtime = data.runtime ?? {};
  const blockers: string[] = [];
  const baseUrlPresent = Boolean(runtime.base_url || runtime.baseUrl);
  const providerPresent = Boolean(runtime.primary_route?.provider_id ?? runtime.primaryRoute?.providerId);
  const modelPresent = Boolean(runtime.primary_route?.model_id ?? runtime.primaryRoute?.modelId);
  const preflightStatus = runtime.capability_plane?.preflight_status ?? runtime.capabilityPlane?.preflightStatus ?? null;
  const routerApiKeyPresent =
    runtime.secret_scope?.router_api_key_present ?? runtime.secretScope?.routerApiKeyPresent ?? null;

  if (runtime.enabled !== true) blockers.push("runtime.enabled is not true");
  if (runtime.configured !== true) blockers.push("runtime.configured is not true");
  if (!baseUrlPresent) blockers.push("runtime.base_url is blank");
  if (!providerPresent) blockers.push("primary route provider is blank");
  if (!modelPresent) blockers.push("primary route model is blank");
  if (preflightStatus === "block") blockers.push("capability preflight is block");
  if (routerApiKeyPresent !== true) blockers.push("router api key is not present");

  return {
    url,
    status: data.status ?? null,
    environment_key: data.environment_key ?? null,
    runtime_enabled: runtime.enabled ?? null,
    runtime_configured: runtime.configured ?? null,
    router_kind: runtime.router_kind ?? runtime.routerKind ?? null,
    base_url_present: baseUrlPresent,
    primary_provider_present: providerPresent,
    primary_model_present: modelPresent,
    preflight_status: preflightStatus,
    router_api_key_present: routerApiKeyPresent,
    ready: blockers.length === 0,
    blockers,
  };
}

function renderText(result: {
  env_file: string;
  env_profile: ReturnType<typeof envProfile>;
  healthz: HealthzSummary[];
  decision: "READY" | "BLOCKED";
}) {
  const lines = [
    "Hosted AI runtime preflight",
    `env_file=${result.env_file}`,
    `decision=${result.decision}`,
    `active_path=${result.env_profile.active_path ?? "none"}`,
    `evidence_level=${result.env_profile.evidence_level}`,
    `live_provider_evidence=${result.env_profile.live_provider_evidence}`,
    "evidence_note=READY confirms model-entry presence and the built-in v1 route-adapter declaration only; it is not live provider evidence",
    "",
    "--- env presence ---",
    `model_gateway.configured=${result.env_profile.model_gateway.configured}`,
    `model_gateway.ready=${result.env_profile.model_gateway.ready}`,
    ...Object.entries(result.env_profile.model_gateway.presence).map(([key, value]) => `${key}=${value}`),
    `isolated_light.required=${result.env_profile.isolated_light.required}`,
    `isolated_light.requested=${result.env_profile.isolated_light.requested}`,
    `isolated_light.configured=${result.env_profile.isolated_light.configured}`,
    ...Object.entries(result.env_profile.isolated_light.presence).map(([key, value]) => `${key}=${value}`),
    `route_attestation.required_version=${result.env_profile.route_attestation.required_version}`,
    `route_attestation.required_response_headers=${result.env_profile.route_attestation.required_response_headers.join(",")}`,
    `route_attestation.declared_version=${result.env_profile.route_attestation.declared_version ?? "blank"}`,
    `route_attestation.configured=${result.env_profile.route_attestation.configured}`,
  ];

  for (const blocker of result.env_profile.blockers) {
    lines.push(`env_blocker=${blocker}`);
  }

  if (result.healthz.length > 0) {
    lines.push("", "--- healthz runtime ---");
    for (const item of result.healthz) {
      lines.push(
        `${item.environment_key ?? item.url}: ready=${item.ready} enabled=${item.runtime_enabled} configured=${item.runtime_configured} base_url_present=${item.base_url_present} provider_present=${item.primary_provider_present} model_present=${item.primary_model_present} preflight_status=${item.preflight_status} router_api_key_present=${item.router_api_key_present}`,
      );
      for (const blocker of item.blockers) {
        lines.push(`  blocker=${blocker}`);
      }
    }
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: tsx tools/infra/hosted-ai-runtime-preflight.ts [--env-file .env.hosted] [--healthz URL ...] [--healthz-json PATH ...] [--require-isolated-light] [--json] [--expect-blocked]`);
    return;
  }

  const env = parseEnvFile(options.envFile);
  const profile = envProfile(env, options.requireIsolatedLight);
  const healthz = [];
  for (const url of options.healthzUrls) {
    healthz.push(await fetchHealthz(url));
  }
  for (const path of options.healthzJsonPaths) {
    healthz.push(readHealthzJson(path));
  }
  const healthzReady = healthz.length === 0 || healthz.every((item) => item.ready);
  const ready = profile.ready && healthzReady;
  const result = {
    env_file: options.envFile,
    env_profile: profile,
    healthz,
    decision: ready ? ("READY" as const) : ("BLOCKED" as const),
  };

  console.log(options.json ? JSON.stringify(result, null, 2) : renderText(result));

  if (options.expectBlocked && !ready) return;
  if (!options.expectBlocked && ready) return;
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
