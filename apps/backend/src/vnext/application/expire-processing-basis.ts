import type {
  ProcessingBasisControlRepository,
  ProcessingBasisTransition,
  ProcessingBasisTransitionResult,
} from "../domain/compliance-readiness.js";
import type { VnextClock } from "../domain/vnext-session.repository.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTHORIZATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export type ProcessingBasisControlActor =
  | "privacy_owner"
  | "legal_owner"
  | "system_policy";

export const VNEXT_PROCESSING_BASIS_CONTROL_AUTHORITY = Symbol(
  "VNEXT_PROCESSING_BASIS_CONTROL_AUTHORITY",
);

export interface ProcessingBasisControlAuthority {
  authorize(input: {
    readonly transition: ProcessingBasisTransition;
    readonly processingBasisRecordId: string;
  }): {
    readonly actor: ProcessingBasisControlActor;
    readonly authorizationRef: string;
  };
}

export class ConfiguredProcessingBasisControlAuthority
  implements ProcessingBasisControlAuthority
{
  private readonly actor: string;
  private readonly authorizationRef: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.actor = env.VNEXT_PROCESSING_BASIS_CONTROL_ACTOR?.trim() ?? "";
    this.authorizationRef =
      env.VNEXT_PROCESSING_BASIS_CONTROL_AUTHORIZATION_REF?.trim() ?? "";
  }

  get configured() {
    return (
      ["privacy_owner", "legal_owner", "system_policy"].includes(this.actor) &&
      AUTHORIZATION_REF_PATTERN.test(this.authorizationRef)
    );
  }

  authorize() {
    if (!this.configured) {
      throw new Error("processing-basis control authority is unavailable");
    }
    return {
      actor: this.actor as ProcessingBasisControlActor,
      authorizationRef: this.authorizationRef,
    };
  }
}

export interface ExpireProcessingBasisInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly processingBasisRecordId: string;
  readonly expectedVersion: number;
  readonly transition: ProcessingBasisTransition;
}

export class ExpireProcessingBasis {
  constructor(
    private readonly repository: ProcessingBasisControlRepository,
    private readonly clock: VnextClock,
    private readonly controlAuthority: ProcessingBasisControlAuthority,
  ) {}

  execute(
    input: ExpireProcessingBasisInput,
  ): Promise<ProcessingBasisTransitionResult> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId) ||
      !UUID_V4_PATTERN.test(input.processingBasisRecordId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion <= 0 ||
      (input.transition !== "expired" && input.transition !== "revoked") ||
      Reflect.ownKeys(input).length !== 5
    ) {
      throw new TypeError("invalid controlled processing-basis transition");
    }
    const control = this.controlAuthority.authorize({
      transition: input.transition,
      processingBasisRecordId: input.processingBasisRecordId,
    });
    if (
      !["privacy_owner", "legal_owner", "system_policy"].includes(
        control.actor,
      ) ||
      !AUTHORIZATION_REF_PATTERN.test(control.authorizationRef)
    ) {
      throw new Error("processing-basis control authority is unavailable");
    }
    return this.repository.transitionProcessingBasis({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      processingBasisRecordId: input.processingBasisRecordId,
      expectedVersion: input.expectedVersion,
      transition: input.transition,
      authorizationRef: control.authorizationRef,
      now: this.clock.now(),
    });
  }
}
