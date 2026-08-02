import type {
  SafetyDispositionCommand,
  SafetyDispositionUnitOfWork,
} from "../domain/safety-disposition.uow.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function requireUuid(value: string | null, field: string) {
  if (value !== null && !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
}

export class HandleSafetyCase {
  constructor(private readonly uow: SafetyDispositionUnitOfWork) {}

  execute(command: SafetyDispositionCommand) {
    requireUuid(command.ownerPrincipalId, "ownerPrincipalId");
    requireUuid(command.experienceSessionId, "experienceSessionId");
    requireUuid(command.workspaceId, "workspaceId");
    if (
      command.triggeringTask !== null &&
      command.triggeringTask.ownerPrincipalId !== command.ownerPrincipalId
    ) {
      throw new Error("safety task owner mismatch");
    }
    if (!DIGEST_PATTERN.test(command.evidence.triggerDigest)) {
      throw new Error("triggerDigest must be a SHA-256 hex digest");
    }
    if (
      command.idempotencyKey.trim().length === 0 ||
      command.idempotencyKey.length > 200 ||
      command.suppressedContentRefs.length > 100 ||
      command.suppressedContentRefs.some(
        (ref) => ref.trim().length === 0 || ref.length > 200,
      ) ||
      new Set(command.suppressedContentRefs).size !==
        command.suppressedContentRefs.length
    ) {
      throw new Error("invalid safety disposition command");
    }
    return this.uow.apply(command);
  }
}
