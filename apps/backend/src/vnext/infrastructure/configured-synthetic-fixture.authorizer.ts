import {
  SyntheticFixtureNotApprovedError,
  syntheticFixtureDigest,
  type SyntheticFixtureAuthorizer,
} from "../domain/synthetic-fixture.js";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface ConfiguredSyntheticFixtureCatalog {
  readonly version: string;
  readonly digests: ReadonlySet<string>;
}

export function readConfiguredSyntheticFixtureCatalog(
  env: Record<string, string | undefined> = process.env,
): ConfiguredSyntheticFixtureCatalog {
  const version = env.VNEXT_SYNTHETIC_FIXTURE_CATALOG_VERSION?.trim() ?? "";
  const rawDigests = env.VNEXT_APPROVED_SYNTHETIC_FIXTURE_DIGESTS?.trim() ?? "";
  const digests = rawDigests === "" ? [] : rawDigests.split(",").map((item) => item.trim());
  if (
    env.NODE_ENV === "production" ||
    env.VNEXT_SYNTHETIC_FIXTURE_MODE?.trim() !== "internal_sandbox" ||
    env.VNEXT_REAL_PERSON_INPUT_ENABLED?.trim().toLowerCase() === "true" ||
    !VERSION_PATTERN.test(version) ||
    digests.length === 0 ||
    digests.some((digest) => !DIGEST_PATTERN.test(digest))
  ) {
    return { version: "unconfigured", digests: new Set() };
  }
  return { version, digests: new Set(digests) };
}

export class ConfiguredSyntheticFixtureAuthorizer
  implements SyntheticFixtureAuthorizer
{
  constructor(private readonly catalog: ConfiguredSyntheticFixtureCatalog) {}

  authorize(content: string) {
    const digest = syntheticFixtureDigest(content);
    if (!this.catalog.digests.has(digest)) {
      throw new SyntheticFixtureNotApprovedError();
    }
    return {
      digest,
      evidenceRef: `fixture:${this.catalog.version}:sha256:${digest}`,
    };
  }
}
