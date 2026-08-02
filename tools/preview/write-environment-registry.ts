import { writeFileSync } from "node:fs";

function readArg(flag: string, fallback?: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function createEnvironment(environment_key: "shared-dev" | "staging" | "live", domain: string) {
  return {
    environment_key,
    domain,
    artifact_channel: environment_key,
    health_endpoint: `${domain.replace(/\/+$/, "")}/healthz`,
    provider: "self_hosted",
    access_mode: environment_key === "live" ? "restricted" : "basic_auth",
    access_username_env:
      environment_key === "shared-dev"
        ? "SHARED_DEV_BASIC_AUTH_USERNAME"
        : environment_key === "staging"
          ? "STAGING_BASIC_AUTH_USERNAME"
          : "LIVE_ACCESS_USERNAME",
  };
}

const sharedDevDomain = readArg("--shared-dev");
const stagingDomain = readArg("--staging");
const liveDomain = readArg("--live", "https://lumialove.xn--6qq986b3xl");

if (!sharedDevDomain || !stagingDomain) {
  throw new Error("Both --shared-dev and --staging must be provided");
}

writeFileSync(
  "infra/observability/environment-registry.json",
  `${JSON.stringify(
    {
      environments: [
        createEnvironment("shared-dev", sharedDevDomain),
        createEnvironment("staging", stagingDomain),
        createEnvironment("live", liveDomain),
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log("environment registry updated");
