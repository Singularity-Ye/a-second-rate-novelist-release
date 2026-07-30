export const EXPERIENCE_STATES = Object.freeze([
  "available",
  "listening",
  "writing",
  "revising",
  "draft_ready",
  "unavailable",
] as const);

export type ExperienceState = (typeof EXPERIENCE_STATES)[number];

export const EXPERIENCE_SEMANTIC_ACTIONS = Object.freeze([
  "submit_intent",
  "correct_understanding",
  "retry_current_task",
  "return_later",
  "open_draft",
  "request_revision",
  "accept_current",
  "accept_and_continue",
  "reject_and_rebrief",
  "restore_session",
  "acknowledge_ai_identity",
  "withdraw_consent",
  "exit_experience",
  "appeal_safety_decision",
  "download_accepted_content",
] as const);

export type ExperienceSemanticAction = (typeof EXPERIENCE_SEMANTIC_ACTIONS)[number];

export const EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS = Object.freeze([
  "correct_understanding",
  "retry_current_task",
  "request_revision",
  "accept_current",
  "accept_and_continue",
  "reject_and_rebrief",
  "acknowledge_ai_identity",
  "download_accepted_content",
] as const);

export type ExperienceVersionedSemanticAction =
  (typeof EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS)[number];

export type ExperienceAction<
  TAction extends ExperienceSemanticAction = ExperienceSemanticAction,
> = TAction extends ExperienceVersionedSemanticAction
  ? { code: TAction; label: string; basedOnVersionId: string }
  : { code: TAction; label: string; basedOnVersionId?: never };

export interface ExperienceProjection {
  versionId: string;
  status: ExperienceState;
  headline: string;
  body: string;
  understanding: {
    /** Opaque UnderstandingDraft identity; the internal numeric version stays server-side. */
    versionId: string;
    statement: string;
    clarificationQuestion: string | null;
  } | null;
  primaryAction: ExperienceAction | null;
  secondaryActions: readonly ExperienceAction[];
}

export interface ExperienceDraft {
  contentId: string;
  versionId: string;
  kind: "opening" | "scene" | "chapter";
  body: string;
}

export const ROOM_MESSAGE_INTENTS = Object.freeze([
  "conversation",
  "creative_intent",
  "revise",
  "continue",
  "reject",
] as const);

export type RoomMessageIntent = (typeof ROOM_MESSAGE_INTENTS)[number];

export const ROOM_MESSAGE_HANDLINGS = Object.freeze([
  "conversation",
  "submitted",
  "not_available",
] as const);

export type RoomMessageHandling = (typeof ROOM_MESSAGE_HANDLINGS)[number];

export interface VnextRoomRouteEvent {
  readonly type: "route";
  readonly requestId: string;
  readonly intent: RoomMessageIntent;
  readonly handling: RoomMessageHandling;
  readonly projection: ExperienceProjection;
}

export interface VnextRoomCompleteEvent {
  readonly type: "room_complete";
  readonly requestId: string;
  readonly intent: Exclude<RoomMessageIntent, "conversation">;
  readonly handling: Exclude<RoomMessageHandling, "conversation">;
}

export interface VnextSessionAdmissionManifest {
  readonly audienceMode: "internal";
  readonly inputPolicy: "synthetic_only";
  readonly admissionPolicyVersion: string;
  readonly aiIdentityNoticeVersion: string;
  readonly serviceTermsVersion: string;
  readonly privacyNoticeVersion: string;
}

export const EXPERIENCE_PUBLIC_ERROR_CODES = Object.freeze([
  "invalid_request",
  "authentication_required",
  "session_expired",
  "not_found",
  "stale_version",
  "temporarily_unavailable",
  "compliance_blocked",
  "safety_blocked",
  "conflict",
] as const);

export type ExperiencePublicErrorCode = (typeof EXPERIENCE_PUBLIC_ERROR_CODES)[number];

export const EXPERIENCE_RECOVERY_ACTIONS = Object.freeze([
  "retry_current_task",
  "refresh_projection",
  "refresh_admission",
  "return_later",
  "restore_session",
  "correct_request",
  "appeal_safety_decision",
  "none",
] as const);

export type ExperienceRecoveryAction = (typeof EXPERIENCE_RECOVERY_ACTIONS)[number];

export interface ExperiencePublicError {
  code: ExperiencePublicErrorCode;
  recovery: ExperienceRecoveryAction;
}

export function createExperiencePublicError(
  code: ExperiencePublicErrorCode,
  recovery: ExperienceRecoveryAction,
): ExperiencePublicError {
  return Object.freeze({ code, recovery });
}

export const VNEXT_CONTINUOUS_USE_REMINDER_HEADER =
  "x-vnext-continuous-use-reminder";
export const VNEXT_CONTINUOUS_USE_NEXT_AT_HEADER =
  "x-vnext-continuous-use-next-at";
export const VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER =
  "x-vnext-continuous-use-receipt-id";
export const VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER =
  "x-vnext-continuous-use-receipt-version";
export const VNEXT_CONTINUOUS_USE_EMITTED_AT_HEADER =
  "x-vnext-continuous-use-emitted-at";

export const EXPERIENCE_SERVER_ACTIONS = Object.freeze([
  "submit_intent",
  "correct_understanding",
  "retry_current_task",
  "request_revision",
  "accept_current",
  "accept_and_continue",
  "reject_and_rebrief",
  "acknowledge_ai_identity",
  "download_accepted_content",
] as const);

export type ExperienceServerAction = (typeof EXPERIENCE_SERVER_ACTIONS)[number];

export const OPENING_SLICE_SERVER_ACTIONS = Object.freeze([
  "submit_intent",
  "correct_understanding",
  "retry_current_task",
] as const satisfies readonly ExperienceServerAction[]);

interface ExperienceRequestBase<TAction extends ExperienceServerAction> {
  action: TAction;
  clientRequestId: string;
}

type VersionedTextAction =
  | "correct_understanding"
  | "request_revision"
  | "reject_and_rebrief";

type VersionedAction =
  | "retry_current_task"
  | "accept_current"
  | "accept_and_continue"
  | "acknowledge_ai_identity"
  | "download_accepted_content";

export type VnextExperienceRequest<
  TAction extends ExperienceServerAction = ExperienceServerAction,
> = TAction extends "submit_intent"
  ? ExperienceRequestBase<TAction> & { text: string; basedOnVersionId?: never }
  : TAction extends VersionedTextAction
    ? ExperienceRequestBase<TAction> & { text: string; basedOnVersionId: string }
    : TAction extends VersionedAction
      ? ExperienceRequestBase<TAction> & { text?: never; basedOnVersionId: string }
      : never;

export type VnextExperienceRequestParseResult<
  TRequest extends VnextExperienceRequest = VnextExperienceRequest,
> =
  | { success: true; data: TRequest }
  | { success: false; error: ExperiencePublicError };

export interface VnextExperienceRequestSchema<
  TRequest extends VnextExperienceRequest = VnextExperienceRequest,
> {
  safeParse(input: unknown): VnextExperienceRequestParseResult<TRequest>;
  parse(input: unknown): TRequest;
}

const REQUEST_FIELDS = new Set(["action", "clientRequestId", "text", "basedOnVersionId"]);
const SERVER_ACTION_RULES: Readonly<
  Record<ExperienceServerAction, { requiresText: boolean; requiresVersion: boolean }>
> = {
  submit_intent: { requiresText: true, requiresVersion: false },
  correct_understanding: { requiresText: true, requiresVersion: true },
  retry_current_task: { requiresText: false, requiresVersion: true },
  request_revision: { requiresText: true, requiresVersion: true },
  accept_current: { requiresText: false, requiresVersion: true },
  accept_and_continue: { requiresText: false, requiresVersion: true },
  reject_and_rebrief: { requiresText: true, requiresVersion: true },
  acknowledge_ai_identity: { requiresText: false, requiresVersion: true },
  download_accepted_content: { requiresText: false, requiresVersion: true },
};
const SERVER_ACTIONS = new Set<string>(EXPERIENCE_SERVER_ACTIONS);
const UUID_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isSafeRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataField(record: Record<string, unknown>, field: string) {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return {
    present: descriptor !== undefined,
    value: descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoundedNonEmptyString(
  value: unknown,
  maximumCodePoints: number,
): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  let count = 0;
  for (const _codePoint of value) {
    count += 1;
    if (count > maximumCodePoints) {
      return false;
    }
  }
  return true;
}

export function createVnextExperienceRequestSchema<
  const TActions extends readonly ExperienceServerAction[],
>(capabilities: TActions): VnextExperienceRequestSchema<VnextExperienceRequest<TActions[number]>> {
  const capabilitySet = new Set<string>(capabilities);

  const safeParse = (
    input: unknown,
  ): VnextExperienceRequestParseResult<VnextExperienceRequest<TActions[number]>> => {
    const invalid = (): VnextExperienceRequestParseResult<
      VnextExperienceRequest<TActions[number]>
    > => ({
      success: false,
      error: createExperiencePublicError("invalid_request", "correct_request"),
    });

    try {
      if (
        !isSafeRecord(input) ||
        Reflect.ownKeys(input).some(
          (field) => typeof field !== "string" || !REQUEST_FIELDS.has(field),
        )
      ) {
        return invalid();
      }
      const actionField = ownDataField(input, "action");
      const clientRequestIdField = ownDataField(input, "clientRequestId");
      const textField = ownDataField(input, "text");
      const basedOnVersionIdField = ownDataField(input, "basedOnVersionId");
      if (
        !isNonEmptyString(actionField.value) ||
        !SERVER_ACTIONS.has(actionField.value) ||
        !capabilitySet.has(actionField.value)
      ) {
        return invalid();
      }
      if (!isBoundedNonEmptyString(clientRequestIdField.value, 200)) {
        return invalid();
      }

      const action = actionField.value as ExperienceServerAction;
      const rule = SERVER_ACTION_RULES[action];
      if (
        rule.requiresText
          ? !isBoundedNonEmptyString(textField.value, 50_000)
          : textField.present
      ) {
        return invalid();
      }
      if (
        rule.requiresVersion
          ? !isBoundedNonEmptyString(basedOnVersionIdField.value, 200)
          : basedOnVersionIdField.present
      ) {
        return invalid();
      }
      if (
        action === "correct_understanding" &&
        !UUID_ID_PATTERN.test(basedOnVersionIdField.value as string)
      ) {
        return invalid();
      }

      const request: Record<string, string> = {
        action,
        clientRequestId: clientRequestIdField.value,
      };
      if (rule.requiresText) {
        request.text = textField.value as string;
      }
      if (rule.requiresVersion) {
        request.basedOnVersionId = basedOnVersionIdField.value as string;
      }
      return {
        success: true,
        data: request as unknown as VnextExperienceRequest<TActions[number]>,
      };
    } catch {
      return invalid();
    }
  };

  return Object.freeze({
    safeParse,
    parse(input: unknown): VnextExperienceRequest<TActions[number]> {
      const result = safeParse(input);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
  });
}

export const vnextExperienceRequestSchema = createVnextExperienceRequestSchema(
  OPENING_SLICE_SERVER_ACTIONS,
);

export interface VnextWithdrawConsentRequest {
  readonly basedOnVersion: number;
}

export interface VnextAppealSafetyDecisionRequest {
  readonly basedOnVersion: number;
  readonly reason: string;
}

export type VnextEvaluateContinuousUseRequest = Readonly<Record<string, never>>;
export interface VnextAcknowledgeContinuousUseReceiptRequest {
  readonly basedOnReceiptVersion: number;
}
export type VnextExitExperienceRequest = Readonly<Record<string, never>>;

export type VnextComplianceRequestParseResult<TRequest> =
  | { success: true; data: TRequest }
  | { success: false; error: ExperiencePublicError };

export interface VnextComplianceRequestSchema<TRequest> {
  safeParse(input: unknown): VnextComplianceRequestParseResult<TRequest>;
  parse(input: unknown): TRequest;
}

function invalidComplianceRequest<
  TRequest,
>(): VnextComplianceRequestParseResult<TRequest> {
  return {
    success: false,
    error: createExperiencePublicError("invalid_request", "correct_request"),
  };
}

function createComplianceRequestSchema<TRequest>(
  parser: (input: Record<string, unknown>) => TRequest | null,
): VnextComplianceRequestSchema<TRequest> {
  const safeParse = (
    input: unknown,
  ): VnextComplianceRequestParseResult<TRequest> => {
    try {
      if (!isSafeRecord(input)) {
        return invalidComplianceRequest();
      }
      const parsed = parser(input);
      return parsed === null
        ? invalidComplianceRequest()
        : { success: true, data: parsed };
    } catch {
      return invalidComplianceRequest();
    }
  };

  return Object.freeze({
    safeParse,
    parse(input: unknown): TRequest {
      const result = safeParse(input);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
  });
}

function hasExactFields(
  input: Record<string, unknown>,
  fields: ReadonlySet<string>,
) {
  const keys = Reflect.ownKeys(input);
  return (
    keys.length === fields.size &&
    keys.every((key) => typeof key === "string" && fields.has(key))
  );
}

function isPositiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

const WITHDRAW_CONSENT_FIELDS = new Set(["basedOnVersion"]);
const APPEAL_SAFETY_DECISION_FIELDS = new Set([
  "basedOnVersion",
  "reason",
]);
const ACKNOWLEDGE_CONTINUOUS_USE_RECEIPT_FIELDS = new Set([
  "basedOnReceiptVersion",
]);
const EMPTY_COMPLIANCE_COMMAND_FIELDS = new Set<string>();

function parseWithdrawConsentRequest(
  input: Record<string, unknown>,
): VnextWithdrawConsentRequest | null {
  if (!hasExactFields(input, WITHDRAW_CONSENT_FIELDS)) {
    return null;
  }
  const basedOnVersion = ownDataField(input, "basedOnVersion").value;
  return isPositiveVersion(basedOnVersion) ? { basedOnVersion } : null;
}

function validAppealReason(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.normalize("NFKC").trim();
  let codePoints = 0;
  for (const point of normalized) {
    if (point === "\u0000") {
      return false;
    }
    codePoints += 1;
    if (codePoints > 2_000) {
      return false;
    }
  }
  return codePoints > 0;
}

function parseAppealSafetyDecisionRequest(
  input: Record<string, unknown>,
): VnextAppealSafetyDecisionRequest | null {
  if (!hasExactFields(input, APPEAL_SAFETY_DECISION_FIELDS)) {
    return null;
  }
  const basedOnVersion = ownDataField(input, "basedOnVersion").value;
  const reason = ownDataField(input, "reason").value;
  return isPositiveVersion(basedOnVersion) && validAppealReason(reason)
    ? { basedOnVersion, reason }
    : null;
}

function parseEmptyComplianceCommand(
  input: Record<string, unknown>,
): Readonly<Record<string, never>> | null {
  return hasExactFields(input, EMPTY_COMPLIANCE_COMMAND_FIELDS) ? {} : null;
}

function parseAcknowledgeContinuousUseReceiptRequest(
  input: Record<string, unknown>,
): VnextAcknowledgeContinuousUseReceiptRequest | null {
  if (!hasExactFields(input, ACKNOWLEDGE_CONTINUOUS_USE_RECEIPT_FIELDS)) {
    return null;
  }
  const basedOnReceiptVersion = ownDataField(
    input,
    "basedOnReceiptVersion",
  ).value;
  return basedOnReceiptVersion === 1
    ? { basedOnReceiptVersion }
    : null;
}

export const vnextWithdrawConsentRequestSchema = createComplianceRequestSchema(
  parseWithdrawConsentRequest,
);

export const vnextAppealSafetyDecisionRequestSchema =
  createComplianceRequestSchema(parseAppealSafetyDecisionRequest);

export const vnextEvaluateContinuousUseRequestSchema = createComplianceRequestSchema(
  parseEmptyComplianceCommand,
);

export const vnextAcknowledgeContinuousUseReceiptRequestSchema =
  createComplianceRequestSchema(parseAcknowledgeContinuousUseReceiptRequest);

export const vnextExitExperienceRequestSchema = createComplianceRequestSchema(
  parseEmptyComplianceCommand,
);

export const VNEXT_COMPLIANCE_PROCESSING_PURPOSES = Object.freeze([
  "core_creative",
  "external_experience",
  "model_training",
] as const);

export type VnextComplianceProcessingPurpose =
  (typeof VNEXT_COMPLIANCE_PROCESSING_PURPOSES)[number];

export const VNEXT_COMPLIANCE_SESSION_STATUSES = Object.freeze([
  "pending",
  "eligible",
  "withdrawn",
  "blocked",
  "expired",
] as const);

export type VnextComplianceSessionStatus =
  (typeof VNEXT_COMPLIANCE_SESSION_STATUSES)[number];

export interface VnextOwnedConsentResponse {
  readonly id: string;
  readonly purpose: VnextComplianceProcessingPurpose;
  readonly kind: "required" | "optional";
  readonly status: "active" | "withdrawn";
  readonly version: number;
  readonly grantedAt: string;
  readonly withdrawnAt: string | null;
}

export type VnextConsentListResponse = readonly VnextOwnedConsentResponse[];

export interface VnextWithdrawConsentResponse {
  readonly status: "withdrawn";
  readonly version: number;
  readonly purpose: VnextComplianceProcessingPurpose;
  readonly complianceStatus: VnextComplianceSessionStatus;
  readonly cancelledTaskCount: number;
}

export interface VnextOwnedSafetyCaseResponse {
  readonly safetyCaseId: string;
  readonly status: "open" | "appealed" | "resolved";
  readonly disposition: "block" | "escalate" | "restrict";
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly version: number;
  readonly openedAt: string;
  readonly appealedAt: string | null;
  readonly closedAt: string | null;
}

export type VnextSafetyCaseListResponse =
  readonly VnextOwnedSafetyCaseResponse[];

export interface VnextSafetyAppealResponse {
  readonly safetyCaseId: string;
  readonly status: "appealed";
  readonly version: number;
  readonly appealedAt: string;
}

export type VnextContinuousUseResponse =
  | {
      readonly status: "not_due";
      readonly nextReminderAt: string;
    }
  | {
      readonly status: "pending";
      readonly receiptId: string;
      readonly receiptVersion: 1;
      readonly emittedAt: string;
    };

export interface VnextContinuousUseAcknowledgementResponse {
  readonly receiptId: string;
  readonly status: "acknowledged";
  readonly receiptVersion: 2;
  readonly acknowledgedAt: string;
}

export interface VnextSessionExitResponse {
  readonly status: "exited";
  readonly cancelledTaskCount: number;
}

export interface VnextReadinessResponse {
  readonly status: "ready" | "not_ready";
  readonly evidenceLevel: "configuration_declaration_only";
  readonly liveProviderEvidence: false;
  readonly escalationEvidence: "runtime_safety_sandbox";
  readonly checks: {
    readonly database: "ready" | "database_unavailable";
    readonly creativeWorker: "ready" | "creative_worker_unavailable";
    readonly safetyWorker: "ready" | "safety_worker_unavailable";
    readonly provider: "ready" | "provider_configuration_incomplete";
    readonly safetyPolicy: "ready" | "safety_policy_unavailable";
    readonly syntheticFixtures:
      | "ready"
      | "synthetic_fixture_catalog_unavailable";
    readonly sessionAdmission: "ready" | "session_admission_unavailable";
    readonly processingBasisControl:
      | "ready"
      | "processing_basis_control_unavailable";
    readonly continuousUsePolicy:
      | "ready"
      | "continuous_use_policy_unavailable";
    readonly safetyAppealSealing:
      | "ready"
      | "safety_appeal_sealing_unavailable";
    readonly safetyDeadLetter: "ready" | "safety_dead_letter_present";
  };
}

export type VnextResponseParseResult<TResponse> =
  | { readonly success: true; readonly data: TResponse }
  | { readonly success: false };

export interface VnextResponseSchema<TResponse> {
  safeParse(input: unknown): VnextResponseParseResult<TResponse>;
  parse(input: unknown): TResponse;
}

export class VnextResponseContractError extends Error {
  override readonly name = "VnextResponseContractError";
}

function createVnextResponseSchema<TResponse>(
  parser: (input: unknown) => TResponse | null,
): VnextResponseSchema<TResponse> {
  const safeParse = (input: unknown): VnextResponseParseResult<TResponse> => {
    try {
      const data = parser(input);
      return data === null ? { success: false } : { success: true, data };
    } catch {
      return { success: false };
    }
  };
  return Object.freeze({
    safeParse,
    parse(input: unknown): TResponse {
      const parsed = safeParse(input);
      if (!parsed.success) {
        throw new VnextResponseContractError("invalid vNext response contract");
      }
      return parsed.data;
    },
  });
}

function exactResponseRecord(
  input: unknown,
  fields: ReadonlySet<string>,
): Record<string, unknown> | null {
  return isSafeRecord(input) && hasExactFields(input, fields) ? input : null;
}

function responseField(
  input: Record<string, unknown>,
  field: string,
): unknown {
  return ownDataField(input, field).value;
}

function isOneOf<const TValue extends string>(
  value: unknown,
  values: readonly TValue[],
): value is TValue {
  return typeof value === "string" && values.includes(value as TValue);
}

function isUuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNullableCanonicalInstant(value: unknown): value is string | null {
  return value === null || isCanonicalInstant(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

const SESSION_ADMISSION_MANIFEST_FIELDS = new Set([
  "audienceMode",
  "inputPolicy",
  "admissionPolicyVersion",
  "aiIdentityNoticeVersion",
  "serviceTermsVersion",
  "privacyNoticeVersion",
]);
const SESSION_ADMISSION_MANIFEST_VERSION_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isSessionAdmissionManifestVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SESSION_ADMISSION_MANIFEST_VERSION_PATTERN.test(value)
  );
}

export const vnextSessionAdmissionManifestSchema = createVnextResponseSchema(
  (input): VnextSessionAdmissionManifest | null => {
    const record = exactResponseRecord(
      input,
      SESSION_ADMISSION_MANIFEST_FIELDS,
    );
    if (record === null) return null;
    const audienceMode = responseField(record, "audienceMode");
    const inputPolicy = responseField(record, "inputPolicy");
    const admissionPolicyVersion = responseField(
      record,
      "admissionPolicyVersion",
    );
    const aiIdentityNoticeVersion = responseField(
      record,
      "aiIdentityNoticeVersion",
    );
    const serviceTermsVersion = responseField(record, "serviceTermsVersion");
    const privacyNoticeVersion = responseField(
      record,
      "privacyNoticeVersion",
    );
    if (
      audienceMode !== "internal" ||
      inputPolicy !== "synthetic_only" ||
      !isSessionAdmissionManifestVersion(admissionPolicyVersion) ||
      !isSessionAdmissionManifestVersion(aiIdentityNoticeVersion) ||
      !isSessionAdmissionManifestVersion(serviceTermsVersion) ||
      !isSessionAdmissionManifestVersion(privacyNoticeVersion)
    ) {
      return null;
    }
    return {
      audienceMode,
      inputPolicy,
      admissionPolicyVersion,
      aiIdentityNoticeVersion,
      serviceTermsVersion,
      privacyNoticeVersion,
    };
  },
);

const OWNED_CONSENT_RESPONSE_FIELDS = new Set([
  "id",
  "purpose",
  "kind",
  "status",
  "version",
  "grantedAt",
  "withdrawnAt",
]);

function parseOwnedConsentResponse(
  input: unknown,
): VnextOwnedConsentResponse | null {
  const record = exactResponseRecord(input, OWNED_CONSENT_RESPONSE_FIELDS);
  if (record === null) return null;
  const id = responseField(record, "id");
  const purpose = responseField(record, "purpose");
  const kind = responseField(record, "kind");
  const status = responseField(record, "status");
  const version = responseField(record, "version");
  const grantedAt = responseField(record, "grantedAt");
  const withdrawnAt = responseField(record, "withdrawnAt");
  if (
    !isUuidV4(id) ||
    !isOneOf(purpose, VNEXT_COMPLIANCE_PROCESSING_PURPOSES) ||
    !isOneOf(kind, ["required", "optional"] as const) ||
    !isOneOf(status, ["active", "withdrawn"] as const) ||
    !isPositiveVersion(version) ||
    !isCanonicalInstant(grantedAt) ||
    !isNullableCanonicalInstant(withdrawnAt) ||
    (purpose === "external_experience" && kind !== "required") ||
    (purpose === "model_training" && kind !== "optional") ||
    (status === "active" ? withdrawnAt !== null : withdrawnAt === null) ||
    (status === "withdrawn" && version < 2) ||
    (withdrawnAt !== null && Date.parse(withdrawnAt) < Date.parse(grantedAt))
  ) {
    return null;
  }
  return { id, purpose, kind, status, version, grantedAt, withdrawnAt };
}

function parseResponseList<TResponse>(
  input: unknown,
  parser: (item: unknown) => TResponse | null,
): readonly TResponse[] | null {
  if (!Array.isArray(input)) return null;
  const parsed: TResponse[] = [];
  for (const item of input) {
    const value = parser(item);
    if (value === null) return null;
    parsed.push(value);
  }
  return parsed;
}

export const vnextConsentListResponseSchema = createVnextResponseSchema(
  (input): VnextConsentListResponse | null =>
    parseResponseList(input, parseOwnedConsentResponse),
);

const WITHDRAW_CONSENT_RESPONSE_FIELDS = new Set([
  "status",
  "version",
  "purpose",
  "complianceStatus",
  "cancelledTaskCount",
]);

export const vnextWithdrawConsentResponseSchema = createVnextResponseSchema(
  (input): VnextWithdrawConsentResponse | null => {
    const record = exactResponseRecord(input, WITHDRAW_CONSENT_RESPONSE_FIELDS);
    if (record === null) return null;
    const status = responseField(record, "status");
    const version = responseField(record, "version");
    const purpose = responseField(record, "purpose");
    const complianceStatus = responseField(record, "complianceStatus");
    const cancelledTaskCount = responseField(record, "cancelledTaskCount");
    if (
      status !== "withdrawn" ||
      !isPositiveVersion(version) ||
      !isOneOf(purpose, VNEXT_COMPLIANCE_PROCESSING_PURPOSES) ||
      !isOneOf(complianceStatus, VNEXT_COMPLIANCE_SESSION_STATUSES) ||
      !isNonNegativeInteger(cancelledTaskCount)
    ) {
      return null;
    }
    return {
      status,
      version,
      purpose,
      complianceStatus,
      cancelledTaskCount,
    };
  },
);

const OWNED_SAFETY_CASE_RESPONSE_FIELDS = new Set([
  "safetyCaseId",
  "status",
  "disposition",
  "severity",
  "version",
  "openedAt",
  "appealedAt",
  "closedAt",
]);

function parseOwnedSafetyCaseResponse(
  input: unknown,
): VnextOwnedSafetyCaseResponse | null {
  const record = exactResponseRecord(input, OWNED_SAFETY_CASE_RESPONSE_FIELDS);
  if (record === null) return null;
  const safetyCaseId = responseField(record, "safetyCaseId");
  const status = responseField(record, "status");
  const disposition = responseField(record, "disposition");
  const severity = responseField(record, "severity");
  const version = responseField(record, "version");
  const openedAt = responseField(record, "openedAt");
  const appealedAt = responseField(record, "appealedAt");
  const closedAt = responseField(record, "closedAt");
  if (
    !isUuidV4(safetyCaseId) ||
    !isOneOf(status, ["open", "appealed", "resolved"] as const) ||
    !isOneOf(disposition, ["block", "escalate", "restrict"] as const) ||
    !isOneOf(severity, ["low", "medium", "high", "critical"] as const) ||
    !isPositiveVersion(version) ||
    !isCanonicalInstant(openedAt) ||
    !isNullableCanonicalInstant(appealedAt) ||
    !isNullableCanonicalInstant(closedAt) ||
    (disposition === "escalate" &&
      severity !== "high" &&
      severity !== "critical") ||
    (appealedAt !== null && Date.parse(appealedAt) < Date.parse(openedAt)) ||
    (closedAt !== null && Date.parse(closedAt) < Date.parse(openedAt)) ||
    (status === "open" && (appealedAt !== null || closedAt !== null)) ||
    (status === "appealed" && (appealedAt === null || closedAt !== null)) ||
    (status === "appealed" && version < 2) ||
    (status === "resolved" && closedAt === null)
  ) {
    return null;
  }
  return {
    safetyCaseId,
    status,
    disposition,
    severity,
    version,
    openedAt,
    appealedAt,
    closedAt,
  };
}

export const vnextSafetyCaseResponseSchema = createVnextResponseSchema(
  parseOwnedSafetyCaseResponse,
);

export const vnextSafetyCaseListResponseSchema = createVnextResponseSchema(
  (input): VnextSafetyCaseListResponse | null =>
    parseResponseList(input, parseOwnedSafetyCaseResponse),
);

const SAFETY_APPEAL_RESPONSE_FIELDS = new Set([
  "safetyCaseId",
  "status",
  "version",
  "appealedAt",
]);

export const vnextSafetyAppealResponseSchema = createVnextResponseSchema(
  (input): VnextSafetyAppealResponse | null => {
    const record = exactResponseRecord(input, SAFETY_APPEAL_RESPONSE_FIELDS);
    if (record === null) return null;
    const safetyCaseId = responseField(record, "safetyCaseId");
    const status = responseField(record, "status");
    const version = responseField(record, "version");
    const appealedAt = responseField(record, "appealedAt");
    if (
      !isUuidV4(safetyCaseId) ||
      status !== "appealed" ||
      !isPositiveVersion(version) ||
      version < 2 ||
      !isCanonicalInstant(appealedAt)
    ) {
      return null;
    }
    return { safetyCaseId, status, version, appealedAt };
  },
);

const CONTINUOUS_USE_NOT_DUE_RESPONSE_FIELDS = new Set([
  "status",
  "nextReminderAt",
]);
const CONTINUOUS_USE_PENDING_RESPONSE_FIELDS = new Set([
  "status",
  "receiptId",
  "receiptVersion",
  "emittedAt",
]);

export const vnextContinuousUseResponseSchema = createVnextResponseSchema(
  (input): VnextContinuousUseResponse | null => {
    if (!isSafeRecord(input)) return null;
    const status = responseField(input, "status");
    const fields =
      status === "pending"
        ? CONTINUOUS_USE_PENDING_RESPONSE_FIELDS
        : CONTINUOUS_USE_NOT_DUE_RESPONSE_FIELDS;
    if (!hasExactFields(input, fields)) return null;
    if (status === "not_due") {
      const nextReminderAt = responseField(input, "nextReminderAt");
      return isCanonicalInstant(nextReminderAt)
        ? { status, nextReminderAt }
        : null;
    }
    const receiptId = responseField(input, "receiptId");
    const receiptVersion = responseField(input, "receiptVersion");
    const emittedAt = responseField(input, "emittedAt");
    if (
      status !== "pending" ||
      !isUuidV4(receiptId) ||
      receiptVersion !== 1 ||
      !isCanonicalInstant(emittedAt)
    ) {
      return null;
    }
    return { status, receiptId, receiptVersion, emittedAt };
  },
);

const CONTINUOUS_USE_ACKNOWLEDGEMENT_RESPONSE_FIELDS = new Set([
  "receiptId",
  "status",
  "receiptVersion",
  "acknowledgedAt",
]);

export const vnextContinuousUseAcknowledgementResponseSchema =
  createVnextResponseSchema(
    (input): VnextContinuousUseAcknowledgementResponse | null => {
      const record = exactResponseRecord(
        input,
        CONTINUOUS_USE_ACKNOWLEDGEMENT_RESPONSE_FIELDS,
      );
      if (record === null) return null;
      const receiptId = responseField(record, "receiptId");
      const status = responseField(record, "status");
      const receiptVersion = responseField(record, "receiptVersion");
      const acknowledgedAt = responseField(record, "acknowledgedAt");
      return isUuidV4(receiptId) &&
        status === "acknowledged" &&
        receiptVersion === 2 &&
        isCanonicalInstant(acknowledgedAt)
        ? { receiptId, status, receiptVersion, acknowledgedAt }
        : null;
    },
  );

const SESSION_EXIT_RESPONSE_FIELDS = new Set([
  "status",
  "cancelledTaskCount",
]);

export const vnextSessionExitResponseSchema = createVnextResponseSchema(
  (input): VnextSessionExitResponse | null => {
    const record = exactResponseRecord(input, SESSION_EXIT_RESPONSE_FIELDS);
    if (record === null) return null;
    const status = responseField(record, "status");
    const cancelledTaskCount = responseField(record, "cancelledTaskCount");
    return status === "exited" && isNonNegativeInteger(cancelledTaskCount)
      ? { status, cancelledTaskCount }
      : null;
  },
);

const READINESS_RESPONSE_FIELDS = new Set([
  "status",
  "evidenceLevel",
  "liveProviderEvidence",
  "escalationEvidence",
  "checks",
]);
const READINESS_RESPONSE_CHECK_FIELDS = new Set([
  "database",
  "creativeWorker",
  "safetyWorker",
  "provider",
  "safetyPolicy",
  "syntheticFixtures",
  "sessionAdmission",
  "processingBasisControl",
  "continuousUsePolicy",
  "safetyAppealSealing",
  "safetyDeadLetter",
]);

export const vnextReadinessResponseSchema = createVnextResponseSchema(
  (input): VnextReadinessResponse | null => {
    const record = exactResponseRecord(input, READINESS_RESPONSE_FIELDS);
    if (record === null) return null;
    const checks = exactResponseRecord(
      responseField(record, "checks"),
      READINESS_RESPONSE_CHECK_FIELDS,
    );
    if (checks === null) return null;
    const status = responseField(record, "status");
    const parsedChecks = {
      database: responseField(checks, "database"),
      creativeWorker: responseField(checks, "creativeWorker"),
      safetyWorker: responseField(checks, "safetyWorker"),
      provider: responseField(checks, "provider"),
      safetyPolicy: responseField(checks, "safetyPolicy"),
      syntheticFixtures: responseField(checks, "syntheticFixtures"),
      sessionAdmission: responseField(checks, "sessionAdmission"),
      processingBasisControl: responseField(checks, "processingBasisControl"),
      continuousUsePolicy: responseField(checks, "continuousUsePolicy"),
      safetyAppealSealing: responseField(checks, "safetyAppealSealing"),
      safetyDeadLetter: responseField(checks, "safetyDeadLetter"),
    };
    if (
      !isOneOf(status, ["ready", "not_ready"] as const) ||
      responseField(record, "evidenceLevel") !==
        "configuration_declaration_only" ||
      responseField(record, "liveProviderEvidence") !== false ||
      responseField(record, "escalationEvidence") !==
        "runtime_safety_sandbox" ||
      !isOneOf(parsedChecks.database, ["ready", "database_unavailable"] as const) ||
      !isOneOf(parsedChecks.creativeWorker, [
        "ready",
        "creative_worker_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.safetyWorker, [
        "ready",
        "safety_worker_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.provider, [
        "ready",
        "provider_configuration_incomplete",
      ] as const) ||
      !isOneOf(parsedChecks.safetyPolicy, [
        "ready",
        "safety_policy_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.syntheticFixtures, [
        "ready",
        "synthetic_fixture_catalog_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.sessionAdmission, [
        "ready",
        "session_admission_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.processingBasisControl, [
        "ready",
        "processing_basis_control_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.continuousUsePolicy, [
        "ready",
        "continuous_use_policy_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.safetyAppealSealing, [
        "ready",
        "safety_appeal_sealing_unavailable",
      ] as const) ||
      !isOneOf(parsedChecks.safetyDeadLetter, [
        "ready",
        "safety_dead_letter_present",
      ] as const)
    ) {
      return null;
    }
    const allReady = Object.values(parsedChecks).every(
      (value) => value === "ready",
    );
    if ((status === "ready") !== allReady) return null;
    return {
      status,
      evidenceLevel: "configuration_declaration_only",
      liveProviderEvidence: false,
      escalationEvidence: "runtime_safety_sandbox",
      checks: parsedChecks as VnextReadinessResponse["checks"],
    };
  },
);
