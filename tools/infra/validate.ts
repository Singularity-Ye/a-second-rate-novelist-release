import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const composeFiles = [
  "infra/docker-compose/shared-dev.compose.yaml",
  "infra/docker-compose/staging.compose.yaml",
  "infra/docker-compose/live.compose.yaml",
];

for (const file of composeFiles) {
  const body = read(file);
  assert.match(body, /backend:/, `${file} must define backend service`);
  assert.match(body, /ops:/, `${file} must define ops service`);
  assert.match(body, /healthcheck:/, `${file} must define healthcheck`);
}

const sharedDevCompose = read("infra/docker-compose/shared-dev.compose.yaml");
assert.match(sharedDevCompose, /postgres:/, "shared-dev compose must define postgres service");
assert.match(sharedDevCompose, /redis:/, "shared-dev compose must define redis service");
assert.match(sharedDevCompose, /minio:/, "shared-dev compose must define minio service");
assert.match(sharedDevCompose, /DATABASE_URL:/, "shared-dev compose backend must receive DATABASE_URL");
assert.match(sharedDevCompose, /REDIS_URL:/, "shared-dev compose backend must receive REDIS_URL");
assert.match(sharedDevCompose, /S3_ENDPOINT:/, "shared-dev compose backend must receive S3_ENDPOINT");
assert.match(sharedDevCompose, /S3_BUCKET:/, "shared-dev compose backend must receive S3_BUCKET");

const workflow = read("infra/github-actions/release-promote.yaml");
assert.match(workflow, /workflow_dispatch/, "release workflow must stay manual");
assert.match(workflow, /artifact_sha/, "release workflow must validate immutable artifact_sha");

const environmentRegistry = JSON.parse(read("infra/observability/environment-registry.json")) as {
  environments: Array<{ environment_key: string; domain: string; provider?: string; access_mode?: string }>;
};
assert.deepEqual(
  environmentRegistry.environments.map((item) => item.environment_key),
  ["shared-dev", "staging", "live"],
  "environment registry must cover shared-dev, staging, live",
);
const sharedDev = environmentRegistry.environments.find((item) => item.environment_key === "shared-dev");
const staging = environmentRegistry.environments.find((item) => item.environment_key === "staging");
assert.equal(sharedDev?.domain, "https://shared-dev.lumialove.xn--6qq986b3xl", "shared-dev must use the Tencent self-hosted shared-dev domain");
assert.equal(staging?.domain, "https://staging.lumialove.xn--6qq986b3xl", "staging must use the Tencent self-hosted staging domain");
assert.equal(sharedDev?.provider, "self_hosted", "shared-dev provider must be self_hosted");
assert.equal(staging?.provider, "self_hosted", "staging provider must be self_hosted");
assert.equal(sharedDev?.access_mode, "basic_auth", "shared-dev must declare basic auth access");
assert.equal(staging?.access_mode, "basic_auth", "staging must declare basic auth access");

const alertPolicy = JSON.parse(read("infra/observability/alert-policy.json")) as {
  routes: Array<{ environment_key: string; channel: string }>;
};
assert.equal(alertPolicy.routes.length, 3, "alert routes must cover three environments");

const selfHostedCompose = read("infra/docker-compose/tencent-shared-dev-staging.compose.yaml");
const companyParallelCompose = read("infra/docker-compose/company-vnext-parallel.compose.yaml");
const dockerignore = read(".dockerignore");
assert.match(selfHostedCompose, /caddy:/, "self-hosted compose must include caddy");
assert.match(selfHostedCompose, /shared-dev-gateway:/, "self-hosted compose must include shared-dev gateway");
assert.match(selfHostedCompose, /staging-gateway:/, "self-hosted compose must include staging gateway");
assert.match(selfHostedCompose, /postgres:/, "self-hosted compose must include postgres");
assert.match(selfHostedCompose, /redis:/, "self-hosted compose must include redis");
assert.match(selfHostedCompose, /minio:/, "self-hosted compose must include minio");
assert.match(companyParallelCompose, /profiles: \["public-cutover"\]/, "company parallel compose must keep caddy behind an explicit cutover profile");
assert.match(companyParallelCompose, /VNEXT_PREVIEW_BIND_ADDRESS:-127\.0\.0\.1/, "company parallel preview must bind loopback by default");
assert.match(companyParallelCompose, /NEXT_PUBLIC_API_BASE_URL: \/api/, "company parallel H5 must use the same-origin gateway API");
assert.match(dockerignore, /\*\*\/node_modules/, "docker context must exclude workspace node_modules");
assert.match(dockerignore, /\*\*\/\.next/, "docker context must exclude Next build caches");
assert.match(dockerignore, /\*\*\/\.env\.\*/, "docker context must exclude untracked env files");

const caddyfile = read("infra/caddy/Caddyfile");
assert.match(caddyfile, /shared-dev\.lumialove\.xn--6qq986b3xl/, "caddy config must include shared-dev domain");
assert.match(caddyfile, /staging\.lumialove\.xn--6qq986b3xl/, "caddy config must include staging domain");

const selfHostedRunbook = read("docs/runbooks/tencent-lighthouse-shared-dev-staging.md");
assert.match(selfHostedRunbook, /1\.15\.42\.132/, "self-hosted runbook must mention the Tencent host");
assert.match(selfHostedRunbook, /docker compose/i, "self-hosted runbook must mention docker compose");
assert.match(selfHostedRunbook, /AI Runtime Secret Preflight/, "self-hosted runbook must document AI runtime secret preflight");
assert.match(selfHostedRunbook, /pnpm hosted:ai-preflight/, "self-hosted runbook must reference the AI runtime preflight script");
assert.match(selfHostedRunbook, /--healthz-json/, "self-hosted runbook must document file-based healthz validation for TUN-blocked workstations");

const selfHostedEnvExample = read("infra/tencent/shared-dev-staging.env.example");
const companyParallelEnvExample = read("infra/tencent/company-vnext-parallel.env.example");
assert.match(selfHostedEnvExample, /SHARED_DEV_BASIC_AUTH_USERNAME/, "self-hosted env example must declare shared-dev auth username");
assert.match(selfHostedEnvExample, /STAGING_BASIC_AUTH_USERNAME/, "self-hosted env example must declare staging auth username");
assert.match(selfHostedEnvExample, /H5_BASE_URL=https:\/\/shared-dev\.lumialove\.xn--6qq986b3xl/, "self-hosted env example must declare shared-dev H5 base url");
assert.match(selfHostedEnvExample, /MODEL_BASE_URL=https:\/\/api\.vibekey\.cn\/v1/, "self-hosted env example must declare the server-side model base url");
assert.match(selfHostedEnvExample, /MODEL_API_KEY=/, "self-hosted env example must declare the server-side model key slot");
assert.match(selfHostedEnvExample, /MODEL_NAME=grok-4\.5/, "self-hosted env example must declare the configured model name");
assert.match(selfHostedEnvExample, /MODEL_LIGHT_NAME=deepseek-v4-flash/, "self-hosted env example must declare the light model slot");
assert.match(selfHostedEnvExample, /MODEL_GATEWAY_TOKEN=/, "self-hosted env example must separate the local gateway token from provider keys");
assert.match(selfHostedEnvExample, /hosted:ai-preflight/, "self-hosted env example must reference no-secret AI preflight");
assert.match(selfHostedCompose, /x-ai-runtime-env:/, "self-hosted compose must expose AI runtime env anchor");
assert.match(selfHostedCompose, /model-gateway:/, "self-hosted compose must include the private model gateway");
assert.match(selfHostedCompose, /LITELLM_BASE_URL: http:\/\/model-gateway:4317\/v1/, "self-hosted backend must use the private model gateway");
assert.match(selfHostedCompose, /VNEXT_UPSTREAM_BASE_URL: \$\{MODEL_BASE_URL:-\}/, "model gateway must receive the three-field base url");
assert.match(selfHostedCompose, /VNEXT_UPSTREAM_API_KEY: \$\{MODEL_API_KEY:-\}/, "model gateway must receive the server-only model key");
assert.match(selfHostedCompose, /VNEXT_UPSTREAM_LIGHT_API_KEY: \$\{MODEL_LIGHT_API_KEY:-\}/, "model gateway must receive the isolated light provider key");
assert.match(selfHostedCompose, /VNEXT_LOCAL_ROUTE_ADAPTER_TOKEN: \$\{MODEL_GATEWAY_TOKEN:-\}/, "model gateway must use a local token distinct from provider credentials");
assert.match(selfHostedCompose, /LITELLM_API_KEY: \$\{MODEL_GATEWAY_TOKEN:-\}/, "backend must receive only the local model-gateway token");
assert.match(selfHostedCompose, /MODEL_ROUTE_CREATIVE_LARGE_MODEL: \$\{MODEL_NAME:-\}/, "model gateway must pin the configured model name");
assert.match(selfHostedCompose, /local-trusted-route-adapter-main\.js/, "model gateway must run the trusted route adapter");
assert.match(selfHostedCompose, /NODE_ENV: production/, "self-hosted backends must use production cookie semantics");
assert.match(selfHostedCompose, /VNEXT_SESSION_COOKIE_SECURE: "true"/, "self-hosted vNext cookies must be explicitly secure");
assert.match(selfHostedCompose, /VNEXT_SESSION_TOKEN_SECRET:/, "self-hosted vNext backend must receive the token derivation secret");
assert.match(selfHostedCompose, /VNEXT_TRUST_PROXY_HOPS: "1"/, "self-hosted vNext backend must trust exactly one gateway hop");
assert.match(selfHostedEnvExample, /SHARED_DEV_VNEXT_SESSION_TOKEN_SECRET=/, "shared-dev env must expose an isolated vNext token secret slot");
assert.match(selfHostedEnvExample, /STAGING_VNEXT_SESSION_TOKEN_SECRET=/, "staging env must expose an isolated vNext token secret slot");
assert.match(companyParallelEnvExample, /COMPOSE_PROJECT_NAME=erlx-vnext/, "company parallel env must use an isolated compose project");
assert.match(companyParallelEnvExample, /SHARED_DEV_DB_NAME=erlx_vnext_shared_dev/, "company parallel env must use an isolated database");
assert.match(companyParallelEnvExample, /VNEXT_PREVIEW_BIND_ADDRESS=127\.0\.0\.1/, "company parallel env must default to loopback-only preview");
assert.match(caddyfile, /header_up X-Forwarded-For \{remote_host\}/, "caddy must overwrite forwarded client IP before the trusted gateway hop");

assert.match(
  read("infra/docker/backend.Dockerfile"),
  /pnpm (?:--filter backend build|build:backend)/,
  "backend Dockerfile must build backend through a clean-checkout-safe script",
);
assert.match(read("infra/docker/frontend.Dockerfile"), /next start/, "frontend Dockerfile must start Next.js");
assert.match(read("infra/docker/gateway.Dockerfile"), /preview-gateway\.ts/, "gateway Dockerfile must ship preview gateway");
assert.match(read("package.json"), /"hosted:ai-preflight": "tsx tools\/infra\/hosted-ai-runtime-preflight\.ts"/, "root package must expose AI preflight script");
assert.match(read("tools/infra/hosted-ai-runtime-preflight.ts"), /router_api_key_present/, "AI preflight must check router API key presence without printing secret values");
assert.match(read("tools/infra/hosted-ai-runtime-preflight.ts"), /--healthz-json/, "AI preflight must support healthz JSON files from remote runners");

const goNoGo = read("docs/runbooks/m3-release-go-no-go.md");
assert.match(goNoGo, /immutable/i, "go/no-go runbook must mention immutable artifact");
assert.match(goNoGo, /rollback/i, "go/no-go runbook must mention rollback");

const restoreDrill = read("docs/runbooks/m3-restore-drill.md");
assert.match(restoreDrill, /staging/i, "restore drill runbook must mention staging");
assert.match(restoreDrill, /live/i, "restore drill runbook must mention live restriction");

console.log("infra:validate passed");
