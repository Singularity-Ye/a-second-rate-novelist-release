import {
  EXPERIENCE_PUBLIC_ERROR_CODES,
  EXPERIENCE_RECOVERY_ACTIONS,
  EXPERIENCE_SEMANTIC_ACTIONS,
  EXPERIENCE_STATES,
  EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS,
  vnextAcknowledgeContinuousUseReceiptRequestSchema,
  vnextAppealSafetyDecisionRequestSchema,
  vnextConsentListResponseSchema,
  vnextContinuousUseAcknowledgementResponseSchema,
  vnextContinuousUseResponseSchema,
  vnextEvaluateContinuousUseRequestSchema,
  vnextExitExperienceRequestSchema,
  vnextExperienceRequestSchema,
  vnextSafetyAppealResponseSchema,
  vnextSafetyCaseListResponseSchema,
  vnextSessionAdmissionManifestSchema,
  vnextSessionExitResponseSchema,
  vnextWithdrawConsentRequestSchema,
  vnextWithdrawConsentResponseSchema,
  type ExperienceAction,
  type ExperienceDraft,
  type ExperienceProjection,
  type ExperiencePublicErrorCode,
  type ExperienceRecoveryAction,
  type ExperienceSemanticAction,
  type ExperienceState,
  type VnextAcknowledgeContinuousUseReceiptRequest,
  type VnextConsentListResponse,
  type VnextContinuousUseAcknowledgementResponse,
  type VnextContinuousUseResponse,
  type VnextSafetyAppealResponse,
  type VnextSafetyCaseListResponse,
  type VnextSessionAdmissionManifest,
  type VnextSessionExitResponse,
  type VnextWithdrawConsentResponse,
} from "@erliu/shared-contracts/vnext-experience";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

function apiRoot() {
  return `${resolveH5ApiBaseUrl()}/vnext`;
}
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPERIENCE_STATE_SET = new Set<string>(EXPERIENCE_STATES);
const EXPERIENCE_ACTION_SET = new Set<string>(EXPERIENCE_SEMANTIC_ACTIONS);
const VERSIONED_ACTION_SET = new Set<string>(
  EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS,
);
const PUBLIC_ERROR_CODE_SET = new Set<string>(EXPERIENCE_PUBLIC_ERROR_CODES);
const RECOVERY_ACTION_SET = new Set<string>(EXPERIENCE_RECOVERY_ACTIONS);

export type ExperienceProjectionResponse = ExperienceProjection;
export type ExperienceDraftResponse = ExperienceDraft;
export type SubmitExperienceActionResponse = ExperienceProjection;
export type ExperienceAdmissionManifestResponse =
  VnextSessionAdmissionManifest;
export type EvaluateContinuousUseResponse = VnextContinuousUseResponse;
export type AcknowledgeContinuousUseResponse =
  VnextContinuousUseAcknowledgementResponse;
export type ListConsentsResponse = VnextConsentListResponse;
export type WithdrawConsentResponse = VnextWithdrawConsentResponse;
export type ListSafetyCasesResponse = VnextSafetyCaseListResponse;
export type AppealSafetyCaseResponse = VnextSafetyAppealResponse;
export type ExitExperienceResponse = VnextSessionExitResponse;

export type BootstrapExperienceSessionResponse =
  | {
      readonly status: "active";
      readonly projection: ExperienceProjectionResponse;
    }
  | {
      readonly status: "admission_required";
      readonly manifest: ExperienceAdmissionManifestResponse;
    };

export interface AcceptExperienceAdmissionResponse {
  readonly status: "active";
  readonly projection: ExperienceProjectionResponse;
}

export type SubmitExperienceActionInput =
  | {
      readonly action: "submit_intent";
      readonly text: string;
      readonly basedOnVersionId?: never;
    }
  | {
      readonly action: "correct_understanding";
      readonly text: string;
      readonly basedOnVersionId: string;
    }
  | {
      readonly action: "retry_current_task";
      readonly text?: never;
      readonly basedOnVersionId: string;
    };

export class ExperienceApiError extends Error {
  constructor(
    readonly code: ExperiencePublicErrorCode,
    readonly recovery: ExperienceRecoveryAction,
    readonly status: number,
  ) {
    super(`vNext request failed: ${code}`);
  }

  override get name() {
    return "ExperienceApiError";
  }
}

interface PendingAdmissionAttempt {
  readonly manifestKey: string;
  readonly clientRequestId: string;
  readonly bootstrapRecoverySecret: string;
  readonly createdAt: number;
}

interface AdmissionAcceptInFlight {
  readonly manifestKey: string;
  readonly promise: Promise<AcceptExperienceAdmissionResponse>;
}

interface PendingSubmitAttempt {
  readonly fingerprint: string;
  readonly input: SubmitExperienceActionInput;
  readonly request: Record<string, string> & { readonly clientRequestId: string };
  inFlight: Promise<SubmitExperienceActionResponse> | null;
}

export type ContinuousUseOfferListener = (
  offer: VnextContinuousUseResponse | null,
) => void;

const pendingAdmissionAttempts = new Map<string, PendingAdmissionAttempt>();
let admissionAcceptInFlight: AdmissionAcceptInFlight | null = null;
let bootstrapInFlight: Promise<BootstrapExperienceSessionResponse> | null = null;
let pendingSubmitAttempt: PendingSubmitAttempt | null = null;
const continuousUseOfferListeners = new Set<ContinuousUseOfferListener>();

function clearPendingExperienceState() {
  pendingAdmissionAttempts.clear();
  pendingSubmitAttempt = null;
}

function isMissingSessionVerification(error: unknown): error is ExperienceApiError {
  return (
    error instanceof ExperienceApiError &&
    error.status === 401 &&
    error.recovery === "restore_session" &&
    (error.code === "authentication_required" || error.code === "session_expired")
  );
}

export function subscribeContinuousUseOffer(
  listener: ContinuousUseOfferListener,
) {
  continuousUseOfferListeners.add(listener);
  return () => {
    continuousUseOfferListeners.delete(listener);
  };
}

function publishContinuousUseOfferHeaders(headers: Headers) {
  const status = headers.get("x-vnext-continuous-use-reminder");
  if (status === null) return;
  let offer: VnextContinuousUseResponse | null | undefined;
  if (status === "acknowledged") {
    offer = null;
  } else if (status === "not_due") {
    const nextReminderAt = headers.get("x-vnext-continuous-use-next-at");
    if (nextReminderAt !== null) {
      const parsed = vnextContinuousUseResponseSchema.safeParse({
        status: "not_due",
        nextReminderAt,
      });
      offer = parsed.success ? parsed.data : undefined;
    }
  } else if (status === "pending") {
    const receiptId = headers.get("x-vnext-continuous-use-receipt-id");
    const receiptVersion = headers.get("x-vnext-continuous-use-receipt-version");
    const emittedAt = headers.get("x-vnext-continuous-use-emitted-at");
    const numericReceiptVersion = receiptVersion === null ? NaN : Number(receiptVersion);
    if (
      receiptId !== null &&
      emittedAt !== null &&
      Number.isSafeInteger(numericReceiptVersion)
    ) {
      const parsed = vnextContinuousUseResponseSchema.safeParse({
        status: "pending",
        receiptId,
        receiptVersion: numericReceiptVersion,
        emittedAt,
      });
      offer = parsed.success ? parsed.data : undefined;
    }
  }
  if (offer === undefined) return;
  for (const listener of continuousUseOfferListeners) listener(offer);
}

function publicFailure(
  code: ExperiencePublicErrorCode,
  recovery: ExperienceRecoveryAction,
  status: number,
) {
  return new ExperienceApiError(code, recovery, status);
}

function invalidClientRequest(): ExperienceApiError {
  return publicFailure("invalid_request", "correct_request", 400);
}

function unavailable(status: number): ExperienceApiError {
  return publicFailure("temporarily_unavailable", "return_later", status);
}

function normalizeHttpStatus(status: number) {
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(
  value: unknown,
  fields: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === fields.size &&
    keys.every((key) => typeof key === "string" && fields.has(key))
  );
}

function ownDataValue(record: Record<string, unknown>, field: string) {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function isBoundedNonEmptyString(
  value: unknown,
  maximumCodePoints: number,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  let count = 0;
  for (const _point of value) {
    count += 1;
    if (count > maximumCodePoints) return false;
  }
  return true;
}

function parseAction(value: unknown): ExperienceAction | null {
  if (!isPlainRecord(value)) return null;
  const code = ownDataValue(value, "code");
  if (typeof code !== "string" || !EXPERIENCE_ACTION_SET.has(code)) {
    return null;
  }
  const versioned = VERSIONED_ACTION_SET.has(code);
  const fields = versioned
    ? new Set(["code", "label", "basedOnVersionId"])
    : new Set(["code", "label"]);
  if (!hasExactFields(value, fields)) return null;
  const label = ownDataValue(value, "label");
  if (!isBoundedNonEmptyString(label, 200)) return null;
  if (!versioned) {
    return { code: code as ExperienceSemanticAction, label } as ExperienceAction;
  }
  const basedOnVersionId = ownDataValue(value, "basedOnVersionId");
  if (!isBoundedNonEmptyString(basedOnVersionId, 200)) return null;
  return {
    code: code as ExperienceSemanticAction,
    label,
    basedOnVersionId,
  } as ExperienceAction;
}

const UNDERSTANDING_FIELDS = new Set([
  "versionId",
  "statement",
  "clarificationQuestion",
]);

function parseUnderstanding(
  value: unknown,
): ExperienceProjection["understanding"] | undefined {
  if (!hasExactFields(value, UNDERSTANDING_FIELDS)) return undefined;
  const versionId = ownDataValue(value, "versionId");
  const statement = ownDataValue(value, "statement");
  const clarificationQuestion = ownDataValue(
    value,
    "clarificationQuestion",
  );
  if (
    !isBoundedNonEmptyString(versionId, 200) ||
    !isBoundedNonEmptyString(statement, 50_000) ||
    (clarificationQuestion !== null &&
      !isBoundedNonEmptyString(clarificationQuestion, 10_000))
  ) {
    return undefined;
  }
  return { versionId, statement, clarificationQuestion };
}

const PROJECTION_FIELDS = new Set([
  "versionId",
  "status",
  "headline",
  "body",
  "understanding",
  "primaryAction",
  "secondaryActions",
]);

function parseExperienceProjection(value: unknown): ExperienceProjection | null {
  if (!hasExactFields(value, PROJECTION_FIELDS)) return null;
  const versionId = ownDataValue(value, "versionId");
  const status = ownDataValue(value, "status");
  const headline = ownDataValue(value, "headline");
  const body = ownDataValue(value, "body");
  const rawUnderstanding = ownDataValue(value, "understanding");
  const rawPrimaryAction = ownDataValue(value, "primaryAction");
  const rawSecondaryActions = ownDataValue(value, "secondaryActions");
  if (
    !isBoundedNonEmptyString(versionId, 200) ||
    typeof status !== "string" ||
    !EXPERIENCE_STATE_SET.has(status) ||
    !isBoundedNonEmptyString(headline, 2_000) ||
    !isBoundedNonEmptyString(body, 50_000) ||
    !Array.isArray(rawSecondaryActions) ||
    rawSecondaryActions.length > 20
  ) {
    return null;
  }
  const understanding =
    rawUnderstanding === null
      ? null
      : parseUnderstanding(rawUnderstanding);
  if (understanding === undefined) return null;
  const primaryAction =
    rawPrimaryAction === null ? null : parseAction(rawPrimaryAction);
  if (rawPrimaryAction !== null && primaryAction === null) return null;
  const secondaryActions: ExperienceAction[] = [];
  for (const rawAction of rawSecondaryActions) {
    const action = parseAction(rawAction);
    if (action === null) return null;
    secondaryActions.push(action);
  }
  return {
    versionId,
    status: status as ExperienceState,
    headline,
    body,
    understanding,
    primaryAction,
    secondaryActions,
  };
}

const DRAFT_FIELDS = new Set(["contentId", "versionId", "kind", "body"]);
const DRAFT_KINDS = new Set(["opening", "scene", "chapter"] as const);

function parseExperienceDraft(value: unknown): ExperienceDraft | null {
  if (!hasExactFields(value, DRAFT_FIELDS)) return null;
  const contentId = ownDataValue(value, "contentId");
  const versionId = ownDataValue(value, "versionId");
  const kind = ownDataValue(value, "kind");
  const body = ownDataValue(value, "body");
  if (
    !isBoundedNonEmptyString(contentId, 200) ||
    !isBoundedNonEmptyString(versionId, 200) ||
    typeof kind !== "string" ||
    !DRAFT_KINDS.has(kind as "opening" | "scene" | "chapter") ||
    !isBoundedNonEmptyString(body, 1_000_000)
  ) {
    return null;
  }
  return {
    contentId,
    versionId,
    kind: kind as ExperienceDraft["kind"],
    body,
  };
}

const PUBLIC_ERROR_FIELDS = new Set(["code", "recovery"]);

function parsePublicError(value: unknown, status: number) {
  try {
    if (!hasExactFields(value, PUBLIC_ERROR_FIELDS)) {
      return unavailable(normalizeHttpStatus(status));
    }
    const code = ownDataValue(value, "code");
    const recovery = ownDataValue(value, "recovery");
    if (
      typeof code !== "string" ||
      !PUBLIC_ERROR_CODE_SET.has(code) ||
      typeof recovery !== "string" ||
      !RECOVERY_ACTION_SET.has(recovery)
    ) {
      return unavailable(normalizeHttpStatus(status));
    }
    return publicFailure(
      code as ExperiencePublicErrorCode,
      recovery as ExperienceRecoveryAction,
      normalizeHttpStatus(status),
    );
  } catch {
    return unavailable(normalizeHttpStatus(status));
  }
}

interface JsonRequest<TResponse> {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly expectedStatus: number;
  readonly body?: unknown;
  readonly parse: (value: unknown) => TResponse;
}

async function requestJson<TResponse>(
  request: JsonRequest<TResponse>,
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(request.path, {
      method: request.method,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers:
        request.method === "POST"
          ? {
              accept: "application/json",
              "content-type": "application/json",
            }
          : { accept: "application/json" },
      ...(request.method === "POST"
        ? { body: JSON.stringify(request.body) }
        : {}),
    });
  } catch {
    throw unavailable(0);
  }
  publishContinuousUseOfferHeaders(response.headers);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unavailable(response.ok ? 502 : normalizeHttpStatus(response.status));
  }

  if (!response.ok) {
    throw parsePublicError(payload, response.status);
  }
  if (response.status !== request.expectedStatus) {
    throw unavailable(502);
  }
  try {
    return request.parse(payload);
  } catch {
    throw unavailable(502);
  }
}

function parseProjectionResponse(value: unknown) {
  const parsed = parseExperienceProjection(value);
  if (parsed === null) throw new TypeError("invalid projection response");
  return parsed;
}

function parseActiveSessionResponse(value: unknown) {
  if (!hasExactFields(value, new Set(["status"]))) {
    throw new TypeError("invalid active session response");
  }
  if (ownDataValue(value, "status") !== "active") {
    throw new TypeError("invalid active session status");
  }
  return { status: "active" as const };
}

function parseDraftResponse(value: unknown) {
  const parsed = parseExperienceDraft(value);
  if (parsed === null) throw new TypeError("invalid draft response");
  return parsed;
}

function readAdmissionManifest() {
  return requestJson({
    path: `${apiRoot()}/sessions/admission-manifest`,
    method: "GET",
    expectedStatus: 200,
    parse: (value) => vnextSessionAdmissionManifestSchema.parse(value),
  });
}

function readBrowserCrypto() {
  const browserCrypto = globalThis.crypto;
  if (
    browserCrypto === undefined ||
    typeof browserCrypto.randomUUID !== "function" ||
    typeof browserCrypto.getRandomValues !== "function"
  ) {
    throw unavailable(0);
  }
  return browserCrypto;
}

function createClientRequestId() {
  const requestId = readBrowserCrypto().randomUUID();
  if (!UUID_V4_PATTERN.test(requestId)) throw unavailable(0);
  return requestId;
}

function createBootstrapRecoverySecret() {
  const bytes = new Uint8Array(32);
  readBrowserCrypto().getRandomValues(bytes);
  try {
    try {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/u, "");
      if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) throw unavailable(0);
      return encoded;
    } catch (error) {
      throw error instanceof ExperienceApiError ? error : unavailable(0);
    }
  } finally {
    bytes.fill(0);
  }
}

function manifestKey(manifest: VnextSessionAdmissionManifest) {
  return JSON.stringify([
    manifest.audienceMode,
    manifest.inputPolicy,
    manifest.admissionPolicyVersion,
    manifest.aiIdentityNoticeVersion,
    manifest.serviceTermsVersion,
    manifest.privacyNoticeVersion,
  ]);
}

function parseAdmissionManifestInput(value: VnextSessionAdmissionManifest) {
  try {
    return vnextSessionAdmissionManifestSchema.parse(value);
  } catch {
    throw invalidClientRequest();
  }
}

function pendingAttemptFor(manifest: VnextSessionAdmissionManifest) {
  const key = manifestKey(manifest);
  const now = Date.now();
  for (const [manifestKeyValue, attempt] of pendingAdmissionAttempts) {
    if (now - attempt.createdAt > 10 * 60_000) {
      pendingAdmissionAttempts.delete(manifestKeyValue);
    }
  }
  const existing = pendingAdmissionAttempts.get(key);
  if (existing !== undefined) {
    return existing;
  }
  if (pendingAdmissionAttempts.size >= 2) {
    const oldest = pendingAdmissionAttempts.keys().next().value;
    if (typeof oldest === "string") pendingAdmissionAttempts.delete(oldest);
  }
  const attempt = {
    manifestKey: key,
    clientRequestId: createClientRequestId(),
    bootstrapRecoverySecret: createBootstrapRecoverySecret(),
    createdAt: now,
  };
  pendingAdmissionAttempts.set(key, attempt);
  return attempt;
}

async function runBootstrap(): Promise<BootstrapExperienceSessionResponse> {
  try {
    const projection = await readExperienceProjection();
    // Bootstrap success establishes the active session boundary. Ordinary
    // projection polling must not clear an unknown retry.
    pendingSubmitAttempt = null;
    pendingAdmissionAttempts.clear();
    return { status: "active", projection };
  } catch (error) {
    if (
      error instanceof ExperienceApiError &&
      error.code === "compliance_blocked" &&
      error.recovery === "refresh_admission"
    ) {
      pendingSubmitAttempt = null;
      pendingAdmissionAttempts.clear();
      const manifest = await readAdmissionManifest();
      return { status: "admission_required", manifest };
    }
    if (
      !(error instanceof ExperienceApiError) ||
      (error.code !== "authentication_required" &&
        error.code !== "session_expired")
    ) {
      throw error;
    }
  }
  pendingSubmitAttempt = null;
  const manifest = await readAdmissionManifest();
  return { status: "admission_required", manifest };
}

export function bootstrapExperienceSession(): Promise<BootstrapExperienceSessionResponse> {
  if (bootstrapInFlight !== null) return bootstrapInFlight;
  const pending = runBootstrap().finally(() => {
    if (bootstrapInFlight === pending) bootstrapInFlight = null;
  });
  bootstrapInFlight = pending;
  return pending;
}

async function runAcceptExperienceAdmission(
  manifest: VnextSessionAdmissionManifest,
  attempt: PendingAdmissionAttempt,
): Promise<AcceptExperienceAdmissionResponse> {
  try {
    await requestJson({
      path: `${apiRoot()}/sessions/guest`,
      method: "POST",
      expectedStatus: 201,
      body: {
        clientRequestId: attempt.clientRequestId,
        bootstrapRecoverySecret: attempt.bootstrapRecoverySecret,
        audienceMode: manifest.audienceMode,
        inputPolicy: manifest.inputPolicy,
        admissionPolicyVersion: manifest.admissionPolicyVersion,
        aiIdentityNoticeVersion: manifest.aiIdentityNoticeVersion,
        serviceTermsVersion: manifest.serviceTermsVersion,
        privacyNoticeVersion: manifest.privacyNoticeVersion,
        aiIdentityAcknowledged: true,
        serviceTermsAccepted: true,
        privacyNoticeAcknowledged: true,
      },
      parse: parseActiveSessionResponse,
    });
    // A successful guest admission is a new session boundary. Clear the
    // one-shot proof and any prior action retry before the follow-up read.
    pendingAdmissionAttempts.clear();
    pendingSubmitAttempt = null;
    const projection = await readExperienceProjection();
    return { status: "active", projection };
  } catch (error) {
    if (
      error instanceof ExperienceApiError &&
      (error.recovery === "none" || error.recovery === "correct_request") &&
      pendingAdmissionAttempts.get(attempt.manifestKey) === attempt
    ) {
      pendingAdmissionAttempts.delete(attempt.manifestKey);
    }
    throw error;
  }
}

export function acceptExperienceAdmission(
  input: VnextSessionAdmissionManifest,
): Promise<AcceptExperienceAdmissionResponse> {
  let manifest: VnextSessionAdmissionManifest;
  try {
    manifest = parseAdmissionManifestInput(input);
  } catch (error) {
    return Promise.reject(
      error instanceof ExperienceApiError ? error : invalidClientRequest(),
    );
  }
  const key = manifestKey(manifest);
  if (admissionAcceptInFlight !== null) {
    if (admissionAcceptInFlight.manifestKey === key) {
      return admissionAcceptInFlight.promise;
    }
    return Promise.reject(publicFailure("conflict", "refresh_projection", 409));
  }
  let attempt: PendingAdmissionAttempt;
  try {
    attempt = pendingAttemptFor(manifest);
  } catch (error) {
    return Promise.reject(
      error instanceof ExperienceApiError ? error : unavailable(0),
    );
  }
  const promise = runAcceptExperienceAdmission(manifest, attempt).finally(() => {
    if (admissionAcceptInFlight?.promise === promise) {
      admissionAcceptInFlight = null;
    }
  });
  admissionAcceptInFlight = { manifestKey: key, promise };
  return promise;
}

export function readExperienceProjection(): Promise<ExperienceProjectionResponse> {
  return requestJson({
    path: `${apiRoot()}/experience`,
    method: "GET",
    expectedStatus: 200,
    parse: parseProjectionResponse,
  });
}

export function readExperienceDraft(): Promise<ExperienceDraftResponse> {
  return requestJson({
    path: `${apiRoot()}/experience/draft`,
    method: "GET",
    expectedStatus: 200,
    parse: parseDraftResponse,
  });
}

function submitActionFingerprint(input: SubmitExperienceActionInput) {
  return JSON.stringify([
    input.action,
    input.action === "submit_intent" || input.action === "correct_understanding"
      ? input.text
      : null,
    input.action === "submit_intent" ? null : input.basedOnVersionId,
  ]);
}

function sendSubmitAttempt(
  attempt: PendingSubmitAttempt,
) {
  if (attempt.inFlight !== null) return attempt.inFlight;
  const parsed = vnextExperienceRequestSchema.parse(attempt.request);
  const promise = requestJson({
    path: `${apiRoot()}/experience/messages`,
    method: "POST",
    expectedStatus: 202,
    body: parsed,
    parse: parseProjectionResponse,
  }).then(
    (result) => {
      if (pendingSubmitAttempt === attempt) pendingSubmitAttempt = null;
      return result;
    },
    (error) => {
      if (pendingSubmitAttempt === attempt) {
        attempt.inFlight = null;
        if (
          !(
            error instanceof ExperienceApiError &&
            error.recovery === "return_later"
          )
        ) {
          pendingSubmitAttempt = null;
        }
      }
      throw error;
    },
  );
  attempt.inFlight = promise;
  return promise;
}

export function submitExperienceAction(
  input: SubmitExperienceActionInput,
  _preSubmitProjection: ExperienceProjectionResponse | null = null,
): Promise<SubmitExperienceActionResponse> {
  const fingerprint = submitActionFingerprint(input);
  const existing = pendingSubmitAttempt;
  if (existing !== null) {
    if (existing.fingerprint === fingerprint) {
      if (existing.inFlight !== null) return existing.inFlight;
      return sendSubmitAttempt(existing);
    }
    return Promise.reject(publicFailure("conflict", "refresh_projection", 409));
  }

  let request: Record<string, string> & { readonly clientRequestId: string };
  try {
    const clientRequestId = createClientRequestId();
    request =
      input.action === "submit_intent"
        ? { action: input.action, clientRequestId, text: input.text }
        : input.action === "correct_understanding"
          ? {
              action: input.action,
              clientRequestId,
              text: input.text,
              basedOnVersionId: input.basedOnVersionId,
            }
          : {
              action: input.action,
              clientRequestId,
              basedOnVersionId: input.basedOnVersionId,
            };
  } catch (error) {
    return Promise.reject(
      error instanceof ExperienceApiError ? error : unavailable(0),
    );
  }
  const parsed = vnextExperienceRequestSchema.safeParse(request);
  if (!parsed.success) return Promise.reject(invalidClientRequest());

  const attempt: PendingSubmitAttempt = {
    fingerprint,
    input,
    request,
    inFlight: null,
  };
  pendingSubmitAttempt = attempt;
  return sendSubmitAttempt(attempt);
}

function invalidUuid(value: string) {
  return !UUID_V4_PATTERN.test(value);
}

export function evaluateContinuousUse(): Promise<EvaluateContinuousUseResponse> {
  const body = vnextEvaluateContinuousUseRequestSchema.parse({});
  return requestJson({
    path: `${apiRoot()}/safety/continuous-use/evaluate`,
    method: "POST",
    expectedStatus: 200,
    body,
    parse: (value) => vnextContinuousUseResponseSchema.parse(value),
  });
}

export function acknowledgeContinuousUse(
  receiptId: string,
  basedOnReceiptVersion: number,
): Promise<AcknowledgeContinuousUseResponse> {
  if (invalidUuid(receiptId)) return Promise.reject(invalidClientRequest());
  const parsed = vnextAcknowledgeContinuousUseReceiptRequestSchema.safeParse({
    basedOnReceiptVersion,
  });
  if (!parsed.success) return Promise.reject(invalidClientRequest());
  const body: VnextAcknowledgeContinuousUseReceiptRequest = parsed.data;
  return requestJson({
    path: `${apiRoot()}/safety/continuous-use/receipts/${receiptId}/acknowledge`,
    method: "POST",
    expectedStatus: 200,
    body,
    parse: (value) =>
      vnextContinuousUseAcknowledgementResponseSchema.parse(value),
  });
}

export function listConsents(): Promise<ListConsentsResponse> {
  return requestJson({
    path: `${apiRoot()}/consents`,
    method: "GET",
    expectedStatus: 200,
    parse: (value) => vnextConsentListResponseSchema.parse(value),
  });
}

export function withdrawConsent(
  consentId: string,
  basedOnVersion: number,
): Promise<WithdrawConsentResponse> {
  if (invalidUuid(consentId)) return Promise.reject(invalidClientRequest());
  const parsed = vnextWithdrawConsentRequestSchema.safeParse({ basedOnVersion });
  if (!parsed.success) return Promise.reject(invalidClientRequest());
  return requestJson({
    path: `${apiRoot()}/consents/${consentId}/withdraw`,
    method: "POST",
    expectedStatus: 200,
    body: parsed.data,
    parse: (value) => vnextWithdrawConsentResponseSchema.parse(value),
  });
}

export function listSafetyCases(): Promise<ListSafetyCasesResponse> {
  return requestJson({
    path: `${apiRoot()}/safety/cases`,
    method: "GET",
    expectedStatus: 200,
    parse: (value) => vnextSafetyCaseListResponseSchema.parse(value),
  });
}

export function appealSafetyCase(
  caseId: string,
  basedOnVersion: number,
  reason: string,
): Promise<AppealSafetyCaseResponse> {
  if (invalidUuid(caseId)) return Promise.reject(invalidClientRequest());
  const parsed = vnextAppealSafetyDecisionRequestSchema.safeParse({
    basedOnVersion,
    reason,
  });
  if (!parsed.success) return Promise.reject(invalidClientRequest());
  return requestJson({
    path: `${apiRoot()}/safety/cases/${caseId}/appeal`,
    method: "POST",
    expectedStatus: 200,
    body: parsed.data,
    parse: (value) => vnextSafetyAppealResponseSchema.parse(value),
  });
}

export async function exitExperience(): Promise<void> {
  const body = vnextExitExperienceRequestSchema.parse({});
  try {
    await requestJson({
    path: `${apiRoot()}/safety/session/exit`,
      method: "POST",
      expectedStatus: 200,
      body,
      parse: (value) => vnextSessionExitResponseSchema.parse(value),
    });
  } catch (postError) {
    try {
      await readExperienceProjection();
    } catch (verificationError) {
      if (isMissingSessionVerification(verificationError)) {
        clearPendingExperienceState();
        return;
      }
    }
    throw postError;
  }
  clearPendingExperienceState();
}
