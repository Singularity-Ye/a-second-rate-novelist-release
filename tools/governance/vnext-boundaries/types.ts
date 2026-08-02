export type VnextBoundaryRule =
  | "forbidden-import"
  | "forbidden-state-type"
  | "browser-server-control"
  | "production-scan-empty";

export interface VnextBoundaryViolation {
  file: string;
  line: number;
  rule: VnextBoundaryRule;
  match: string;
}

export type BoundaryKind = "backend" | "h5" | "experience-api" | "shared-contract";

export interface BoundaryDescriptor {
  kind: BoundaryKind;
  lexicalRoot: string;
}

export interface BoundaryContext {
  repoRoot: string;
  realRepoRoot: string;
  backendRoot: string;
  h5Roots: readonly string[];
  experienceApi: string;
  sharedContractRoot: string;
}

export type ViolationRecorder = (
  file: string,
  line: number,
  rule: VnextBoundaryRule,
  match: string,
) => void;
