export interface VnextWriteOpeningCandidate {
  readonly candidateId: string;
  readonly candidateSetId: string;
  readonly candidateSetVersion: number;
  readonly ordinal: 1 | 2 | 3;
  readonly techniqueLabels: readonly string[];
  readonly techniqueSummary: string;
  readonly body: string;
  readonly bodyHash: string;
  readonly status: "pending" | "selected" | "rejected";
}
export interface VnextWriteOpeningCandidateSetResponse {
  readonly candidateSetId: string;
  readonly candidateSetVersion: number;
  readonly status: "pending" | "selected" | "rejected";
  readonly workspace: {
    readonly id: string;
    readonly aggregateVersion: number;
  };
  readonly understanding: {
    readonly id: string;
    readonly version: number;
  };
  readonly commission: {
    readonly id: string;
    readonly version: number;
  };
  readonly task: {
    readonly id: string;
    readonly stateVersion: number;
  };
  readonly trace: {
    readonly id: string;
    readonly attemptNumber: number;
    readonly outputHash: string;
  };
  readonly attestation: {
    readonly provider: string;
    readonly model: string;
    readonly route: string;
    readonly workflowVersion: string;
    readonly providerTraceId: string;
    readonly fallbackApplied: false;
  };
  readonly candidates: readonly [
    VnextWriteOpeningCandidate,
    VnextWriteOpeningCandidate,
    VnextWriteOpeningCandidate,
  ];
  readonly selectedCandidateId: string | null;
  readonly selectedContentId: string | null;
}

export interface VnextSelectWriteOpeningCandidateRequest {
  readonly candidateId: string;
  readonly candidateSetVersion: number;
  readonly workspaceAggregateVersion: number;
  readonly understandingVersion: number;
  readonly commissionVersion: number;
  readonly taskStateVersion: number;
  readonly traceAttemptNumber: number;
  readonly traceOutputHash: string;
  readonly idempotencyKey: string;
}
