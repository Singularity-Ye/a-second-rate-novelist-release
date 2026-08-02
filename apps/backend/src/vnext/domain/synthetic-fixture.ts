import { createHash } from "node:crypto";

export const VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER = Symbol(
  "VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER",
);

export interface SyntheticFixtureAuthorization {
  readonly digest: string;
  readonly evidenceRef: string;
}

export interface SyntheticFixtureAuthorizer {
  authorize(content: string): SyntheticFixtureAuthorization;
}

export class SyntheticFixtureNotApprovedError extends Error {
  override readonly name = "SyntheticFixtureNotApprovedError";

  constructor() {
    super("input is not an approved synthetic fixture");
  }
}

export function syntheticFixtureDigest(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
