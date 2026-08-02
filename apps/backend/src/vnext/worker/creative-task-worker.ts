import { createHash } from "node:crypto";
import type {
  CreativeRuntimePort,
  CreativeRuntimeTrace,
  StoryTextOutput,
  UnderstandingOutput,
} from "../domain/creative-runtime.port.js";
import type { CheckInputSafety } from "../application/check-input-safety.js";
import type { CheckOutputSafety } from "../application/check-output-safety.js";
import { SafetyPolicyUnavailableError } from "../domain/safety-policy.port.js";
import {
  CreativeRuntimeExecutionError,
  CreativeTaskInputStaleError,
  type CreativeTaskCompletionPort,
  type CreativeTaskExecutionSuccess,
  type CreativeTaskInputLoader,
  type CreativeTaskLease,
  type CreativeTaskLeasePort,
  type CreativeTaskRuntimeInput,
  type Tc164SupportedCreativeTaskKind,
  type CreativeWorkerRuntimeMode,
} from "../domain/creative-task.js";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_SUPPORTED_KINDS = ["write_opening"] as const;

export type CreativeTaskClaimObserver = (
  lease: CreativeTaskLease,
) => void | Promise<void>;

export class CreativeWorkerOperationalError extends Error {
  constructor(
    readonly errorCode: "claim_unavailable",
    options?: ErrorOptions,
  ) {
    super(errorCode, options);
    this.name = "CreativeWorkerOperationalError";
  }
}

export interface CreativeTaskWorkerOptions {
  readonly workerInstanceId: string;
  readonly runtimeMode: CreativeWorkerRuntimeMode;
  readonly route: string;
  readonly runtime: CreativeRuntimePort;
  readonly leasePort: CreativeTaskLeasePort;
  readonly inputLoader: CreativeTaskInputLoader;
  readonly completionPort: CreativeTaskCompletionPort;
  readonly inputSafety: Pick<CheckInputSafety, "execute">;
  readonly outputSafety: Pick<CheckOutputSafety, "execute">;
  readonly supportedKinds?: readonly Tc164SupportedCreativeTaskKind[];
  readonly leaseDurationMs: number;
  readonly retryDelayMs: number;
}

function normalizedSupportedKinds(
  kinds: readonly Tc164SupportedCreativeTaskKind[] | undefined,
) {
  const normalized = [...new Set(kinds ?? DEFAULT_SUPPORTED_KINDS)];
  if (normalized.length === 0) {
    throw new Error("creative worker must support at least one task kind");
  }
  return normalized;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function exactDataRecord(value: unknown, fields: readonly string[]) {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    ) {
      return false;
    }
    return keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function canonicalUnderstanding(output: UnderstandingOutput) {
  const common = {
    storyDesire: output.storyDesire,
    emotionalTarget: output.emotionalTarget,
    relationshipTension: output.relationshipTension,
    clarificationQuestion: output.clarificationQuestion,
    confidence: output.confidence,
    commission: {
      premise: output.commission.premise,
      emotionalPromise: output.commission.emotionalPromise,
      relationshipCore: output.commission.relationshipCore,
      styleConstraints: [...output.commission.styleConstraints],
      continuationIntent: output.commission.continuationIntent,
    },
  };
  return JSON.stringify(
    output.boundaryActions === undefined
      ? {
          ...common,
          explicitHardBoundaries: output.explicitHardBoundaries.map((boundary) => ({
            value: boundary.value,
            evidenceStart: boundary.evidenceStart,
            evidenceEnd: boundary.evidenceEnd,
          })),
        }
      : {
          ...common,
          boundaryActions: output.boundaryActions.map((action) => ({
            operation: action.operation,
            targetBoundaryId: action.targetBoundaryId,
            expectedTargetVersion: action.expectedTargetVersion,
            evidence: {
              value: action.evidence.value,
              evidenceStart: action.evidence.evidenceStart,
              evidenceEnd: action.evidence.evidenceEnd,
            },
          })),
        },
  );
}

function validTextList(value: unknown, maximum: number): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => nonEmptyString(item))
  );
}

function validBoundaryEvidence(value: unknown) {
  return (
    exactDataRecord(value, ["value", "evidenceStart", "evidenceEnd"]) &&
    nonEmptyString((value as { value?: unknown }).value) &&
    Number.isSafeInteger((value as { evidenceStart?: unknown }).evidenceStart) &&
    Number.isSafeInteger((value as { evidenceEnd?: unknown }).evidenceEnd) &&
    Number((value as { evidenceStart?: unknown }).evidenceStart) >= 0 &&
    Number((value as { evidenceEnd?: unknown }).evidenceEnd) >
      Number((value as { evidenceStart?: unknown }).evidenceStart)
  );
}

function validCorrectionBoundaryAction(value: unknown) {
  if (
    !exactDataRecord(value, [
      "operation",
      "targetBoundaryId",
      "expectedTargetVersion",
      "evidence",
    ])
  ) {
    return false;
  }
  const action = value as {
    operation: unknown;
    targetBoundaryId: unknown;
    expectedTargetVersion: unknown;
    evidence: unknown;
  };
  if (!validBoundaryEvidence(action.evidence)) {
    return false;
  }
  if (action.operation === "add") {
    return action.targetBoundaryId === null && action.expectedTargetVersion === null;
  }
  return (
    (action.operation === "replace" || action.operation === "revoke") &&
    nonEmptyString(action.targetBoundaryId) &&
    Number.isSafeInteger(action.expectedTargetVersion) &&
    Number(action.expectedTargetVersion) > 0
  );
}

function outputHash(
  kind: "understand" | "write_opening",
  output: unknown,
  correctionMode = false,
) {
  if (kind === "understand") {
    const fields = correctionMode
      ? [
          "storyDesire",
          "emotionalTarget",
          "relationshipTension",
          "clarificationQuestion",
          "confidence",
          "commission",
          "boundaryActions",
        ]
      : [
          "storyDesire",
          "emotionalTarget",
          "relationshipTension",
          "clarificationQuestion",
          "confidence",
          "commission",
          "explicitHardBoundaries",
        ];
    const value = output as Record<string, unknown>;
    const commission =
      typeof value.commission === "object" && value.commission !== null
        ? (value.commission as Record<string, unknown>)
        : null;
    if (
      !exactDataRecord(value, fields) ||
      !nonEmptyString(value.storyDesire) ||
      !nonEmptyString(value.emotionalTarget) ||
      !nonEmptyString(value.relationshipTension) ||
      (value.clarificationQuestion !== null &&
        !nonEmptyString(value.clarificationQuestion)) ||
      typeof value.confidence !== "number" ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1 ||
      commission === null ||
      !exactDataRecord(commission, [
        "premise",
        "emotionalPromise",
        "relationshipCore",
        "styleConstraints",
        "continuationIntent",
      ]) ||
      !nonEmptyString(commission.premise) ||
      !nonEmptyString(commission.emotionalPromise) ||
      !nonEmptyString(commission.relationshipCore) ||
      !validTextList(commission.styleConstraints, 20) ||
      !nonEmptyString(commission.continuationIntent) ||
      (correctionMode
        ? !Array.isArray(value.boundaryActions) ||
          value.boundaryActions.length > 100 ||
          !value.boundaryActions.every(validCorrectionBoundaryAction)
        : !Array.isArray(value.explicitHardBoundaries) ||
          value.explicitHardBoundaries.length > 100 ||
          !value.explicitHardBoundaries.every(validBoundaryEvidence))
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    return createHash("sha256")
      .update(canonicalUnderstanding(value as unknown as UnderstandingOutput))
      .digest("hex");
  }
  const value = output as Partial<StoryTextOutput>;
  if (
    !exactDataRecord(value, ["body"]) ||
    !nonEmptyString(value.body) ||
    value.body.length > 200_000
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  return createHash("sha256").update(value.body).digest("hex");
}

function validateTrace(trace: CreativeRuntimeTrace, expectedOutputHash: string) {
  if (
    !exactDataRecord(trace, [
      "traceId",
      "provider",
      "model",
      "workflowVersion",
      "startedAt",
      "completedAt",
      "outputHash",
    ]) ||
    !nonEmptyString(trace.traceId) ||
    !nonEmptyString(trace.provider) ||
    !nonEmptyString(trace.model) ||
    !nonEmptyString(trace.workflowVersion) ||
    !HASH_PATTERN.test(trace.outputHash) ||
    trace.outputHash !== expectedOutputHash
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  const startedAt = Date.parse(trace.startedAt);
  const completedAt = Date.parse(trace.completedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    new Date(startedAt).toISOString() !== trace.startedAt ||
    new Date(completedAt).toISOString() !== trace.completedAt ||
    completedAt < startedAt
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
}

function validateResult(
  kind: "understand" | "write_opening",
  result: Awaited<
    | ReturnType<CreativeRuntimePort["understand"]>
    | ReturnType<CreativeRuntimePort["writeOpening"]>
  >,
  correctionMode = false,
) {
  if (
    !exactDataRecord(result, ["output", "trace", "fallbackApplied"]) ||
    result.fallbackApplied !== false ||
    typeof result.output !== "object" ||
    result.output === null ||
    typeof result.trace !== "object" ||
    result.trace === null
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  validateTrace(result.trace, outputHash(kind, result.output, correctionMode));
}

function runtimeFailure(error: unknown) {
  if (error instanceof CreativeRuntimeExecutionError) {
    return error;
  }
  if (error instanceof CreativeTaskInputStaleError) {
    return new CreativeRuntimeExecutionError(error.failureCode, false);
  }
  return new CreativeRuntimeExecutionError("runtime_execution_failed", true);
}

function completionFailure(error: unknown) {
  if (error instanceof CreativeRuntimeExecutionError) {
    return error;
  }
  if (error instanceof CreativeTaskInputStaleError) {
    return new CreativeRuntimeExecutionError(error.failureCode, false);
  }
  return new CreativeRuntimeExecutionError("persistence_failed", true);
}

export function creativeInputSafetyContent(input: CreativeTaskRuntimeInput) {
  if (input.kind === "understand") {
    return input.input.sourceText;
  }
  if (input.kind !== "write_opening") {
    throw new SafetyPolicyUnavailableError();
  }
  return JSON.stringify({
    kind: "write_opening",
    premise: input.input.premise,
    emotionalPromise: input.input.emotionalPromise,
    relationshipCore: input.input.relationshipCore,
    styleConstraints: [...input.input.styleConstraints],
    continuationIntent: input.input.continuationIntent,
    hardBoundaries: input.input.hardBoundaries.items.map((item) => ({
      value: item.value,
      status: item.status,
    })),
  });
}

export function creativeOutputSafetyContent(
  success: CreativeTaskExecutionSuccess,
) {
  if (success.kind === "write_opening") {
    return success.result.output.body;
  }
  const boundaryActions =
    success.kind === "understand"
      ? success.result.output.boundaryActions
      : undefined;
  if (
    success.kind !== "understand" ||
    !Array.isArray(boundaryActions)
  ) {
    return JSON.stringify(success.result.output);
  }
  const output = success.result.output;
  return JSON.stringify({
    storyDesire: output.storyDesire,
    emotionalTarget: output.emotionalTarget,
    relationshipTension: output.relationshipTension,
    clarificationQuestion: output.clarificationQuestion,
    confidence: output.confidence,
    commission: {
      premise: output.commission.premise,
      emotionalPromise: output.commission.emotionalPromise,
      relationshipCore: output.commission.relationshipCore,
      styleConstraints: [...output.commission.styleConstraints],
      continuationIntent: output.commission.continuationIntent,
    },
    boundaryActions: boundaryActions.map((action) => ({
      operation: action.operation,
      evidence: {
        value: action.evidence.value,
        evidenceStart: action.evidence.evidenceStart,
        evidenceEnd: action.evidence.evidenceEnd,
      },
    })),
  });
}

function safetyFailure() {
  return new CreativeRuntimeExecutionError("safety_policy_unavailable", true);
}

export class CreativeTaskWorker {
  readonly supportedKinds: readonly Tc164SupportedCreativeTaskKind[];

  constructor(private readonly options: CreativeTaskWorkerOptions) {
    this.supportedKinds = normalizedSupportedKinds(options.supportedKinds);
  }

  private async fail(
    lease: CreativeTaskLease,
    failure: CreativeRuntimeExecutionError,
  ) {
    try {
      const disposition = await this.options.leasePort.failLease({
        lease,
        failureCode: failure.failureCode,
        retryable: failure.retryable,
        retryDelayMs: this.options.retryDelayMs,
      });
      return { status: disposition, taskId: lease.taskId } as const;
    } catch {
      return { status: "lease_recovery_pending" as const, taskId: lease.taskId };
    }
  }

  private async execute(
    lease: CreativeTaskLease,
    loaded: CreativeTaskRuntimeInput,
  ): Promise<CreativeTaskExecutionSuccess> {
    if (loaded.kind !== lease.kind) {
      throw new CreativeRuntimeExecutionError("task_input_kind_mismatch", false);
    }
    if (loaded.kind === "understand") {
      const result = await this.options.runtime.understand(loaded.input);
      validateResult(
        "understand",
        result,
        loaded.input.correctionContext !== undefined,
      );
      return {
        kind: "understand",
        lease,
        result,
        route: this.options.route,
        runtimeMode: this.options.runtimeMode,
      };
    }
    if (loaded.kind === "write_opening") {
      const result = await this.options.runtime.writeOpening(loaded.input);
      validateResult("write_opening", result);
      return {
        kind: "write_opening",
        lease,
        result,
        route: this.options.route,
        runtimeMode: this.options.runtimeMode,
      };
    }
    throw new CreativeRuntimeExecutionError("unsupported_task_kind", false);
  }

  async runOnce(onClaim?: CreativeTaskClaimObserver) {
    let lease: CreativeTaskLease | null;
    try {
      lease = await this.options.leasePort.claimNext({
        workerInstanceId: this.options.workerInstanceId,
        runtimeMode: this.options.runtimeMode,
        supportedKinds: this.supportedKinds,
        leaseDurationMs: this.options.leaseDurationMs,
      });
    } catch (error) {
      throw new CreativeWorkerOperationalError("claim_unavailable", {
        cause: error,
      });
    }
    if (lease === null) {
      return { status: "idle" as const };
    }
    try {
      await onClaim?.(lease);
    } catch {
      // Heartbeat/telemetry failure must not consume or abandon a claimed task.
    }
    if (!this.supportedKinds.some((kind) => kind === lease.kind)) {
      return this.fail(
        lease,
        new CreativeRuntimeExecutionError("unsupported_task_kind", false),
      );
    }
    if (
      lease.kind !== "understand" &&
      lease.kind !== "write_opening"
    ) {
      return this.fail(
        lease,
        new CreativeRuntimeExecutionError("unsupported_task_kind", false),
      );
    }

    let loaded: CreativeTaskRuntimeInput;
    try {
      loaded = await this.options.inputLoader.load(lease);
    } catch (error) {
      return this.fail(lease, runtimeFailure(error));
    }

    try {
      const inputSafety = await this.options.inputSafety.execute({
        ownerPrincipalId: lease.ownerPrincipalId,
        experienceSessionId: loaded.safetyScope.experienceSessionId,
        workspaceId: loaded.safetyScope.workspaceId,
        triggeringTask: lease,
        content: creativeInputSafetyContent(loaded),
      });
      if (inputSafety.disposition !== "support") {
        return { status: "blocked" as const, taskId: lease.taskId };
      }
    } catch {
      return this.fail(lease, safetyFailure());
    }

    let success: CreativeTaskExecutionSuccess;
    try {
      success = await this.execute(lease, loaded);
    } catch (error) {
      return this.fail(lease, runtimeFailure(error));
    }

    try {
      const outputSafety = await this.options.outputSafety.execute({
        ownerPrincipalId: lease.ownerPrincipalId,
        experienceSessionId: loaded.safetyScope.experienceSessionId,
        workspaceId: loaded.safetyScope.workspaceId,
        lease,
        content: creativeOutputSafetyContent(success),
      });
      if (outputSafety.disposition !== "support") {
        return { status: "blocked" as const, taskId: lease.taskId };
      }
    } catch {
      return this.fail(lease, safetyFailure());
    }

    try {
      const disposition = await this.options.completionPort.complete(success);
      return { status: disposition, taskId: lease.taskId } as const;
    } catch (error) {
      return this.fail(lease, completionFailure(error));
    }
  }
}
