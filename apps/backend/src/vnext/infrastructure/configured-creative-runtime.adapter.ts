import { createHash } from "node:crypto";
import {
  isVnextModelProfileId,
  type VnextModelProfileId,
} from "@erliu/shared-contracts";
import {
  assertActiveHardBoundarySnapshot,
  type ContinueStoryInput,
  type ContinueStoryResult,
  type CreativeRuntimePort,
  type CreativeRuntimeTrace,
  type ReviseInput,
  type ReviseResult,
  type StoryTextOutput,
  type UnderstandInput,
  type UnderstandingOutput,
  type UnderstandResult,
  type WriteOpeningInput,
  type WriteOpeningResult,
} from "../domain/creative-runtime.port.js";
import { CreativeRuntimeExecutionError } from "../domain/creative-task.js";
import {
  renderSpoilerSafeMechanismSystemAddon,
  PreparedMechanismSelection,
  SpoilerSafeMechanismRuntime,
} from "./spoiler-safe-mechanism-selector.js";
import type { ConfiguredModelProfile } from "./configured-model-profile-catalog.js";

const DEFAULT_TIMEOUT_MS = 45_000;
const MINIMUM_TIMEOUT_MS = 100;
const MAXIMUM_TIMEOUT_MS = 180_000;
const MAXIMUM_PROVIDER_RESPONSE_BYTES = 1_000_000;
const MAXIMUM_PROVIDER_TRACE_ID_CODE_POINTS = 200;
const MAXIMUM_PROVIDER_ID_CODE_POINTS = 100;
const MAXIMUM_PROVIDER_MODEL_CODE_POINTS = 200;
const MAXIMUM_STORY_BODY_LENGTH = 200_000;
const MINIMUM_OPENING_BODY_CODE_POINTS = 600;
const MAXIMUM_OPENING_BODY_CODE_POINTS = 1_200;
const MAXIMUM_TEXT_FIELD_CODE_POINTS = 10_000;
const MAXIMUM_BOUNDARY_CODE_POINTS = 1_000;
const MAXIMUM_STYLE_CONSTRAINTS = 20;
const MAXIMUM_EXPLICIT_BOUNDARIES = 100;

const UNDERSTANDING_KEYS = new Set([
  "storyDesire",
  "emotionalTarget",
  "relationshipTension",
  "clarificationQuestion",
  "confidence",
  "commission",
  "explicitHardBoundaries",
]);
const CORRECTION_UNDERSTANDING_KEYS = new Set([
  "storyDesire",
  "emotionalTarget",
  "relationshipTension",
  "clarificationQuestion",
  "confidence",
  "commission",
  "boundaryActions",
]);
const COMMISSION_KEYS = new Set([
  "premise",
  "emotionalPromise",
  "relationshipCore",
  "styleConstraints",
  "continuationIntent",
]);
const BOUNDARY_EVIDENCE_KEYS = new Set([
  "value",
  "evidenceStart",
  "evidenceEnd",
]);
const CORRECTION_BOUNDARY_ACTION_KEYS = new Set([
  "operation",
  "targetRef",
  "expectedTargetVersion",
  "evidence",
]);
const STORY_OUTPUT_KEYS = new Set(["body"]);

export const VNEXT_GATEWAY_ROUTE_ATTESTATION_V1 = Object.freeze({
  markerHeader: "x-vnext-route-attestation",
  markerValue: "v1",
  providerHeader: "x-vnext-actual-provider",
  modelHeader: "x-vnext-actual-model",
  profileHeader: "x-vnext-actual-profile-id",
  fallbackAppliedHeader: "x-vnext-fallback-applied",
} as const);

const WORKFLOWS = {
  understand: {
    schemaName: "vnext_understand_v1",
    workflowVersion: "vnext.understand.v1",
    temperature: 0.2,
    systemPrompt: [
      "You are the vNext story-understanding runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Extract at most one clarification question.",
      "Every explicitHardBoundaries entry must be an exact UTF-16 slice of sourceText, using zero-based start and exclusive end offsets.",
      "Do not invent a boundary that the reader did not state explicitly.",
    ].join(" "),
  },
  correctUnderstanding: {
    schemaName: "vnext_correct_understanding_v1",
    workflowVersion: "vnext.correct-understanding.v1",
    temperature: 0.2,
    systemPrompt: [
      "You are the vNext correction runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Reinterpret the story request using the reader correction and the previous understanding and commission.",
      "For boundaryActions, add only an explicitly stated new boundary; replace or revoke only a supplied targetRef at its exact version.",
      "Every boundary action evidence must be an exact UTF-16 slice of sourceText, using zero-based start and exclusive end offsets.",
      "Do not change an existing boundary unless the reader explicitly asks for that change.",
    ].join(" "),
  },
  writeOpening: {
    schemaName: "vnext_write_opening_v1",
    workflowVersion: "vnext.write_opening.v1",
    temperature: 0.8,
    systemPrompt: [
      "You are the vNext opening runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Write the requested opening while obeying every active hard boundary.",
      "Do not describe a fallback, template, or simulated completion as a finished opening.",
    ].join(" "),
  },
  revise: {
    schemaName: "vnext_revise_v1",
    workflowVersion: "vnext.revise.v1",
    temperature: 0.6,
    systemPrompt: [
      "You are the vNext revision runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Revise the supplied draft according to the reader instruction and every active hard boundary.",
    ].join(" "),
  },
  continueStory: {
    schemaName: "vnext_continue_story_v1",
    workflowVersion: "vnext.continue_story.v1",
    temperature: 0.75,
    systemPrompt: [
      "You are the vNext continuation runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Continue only from the supplied accepted-content references and truth versions while obeying every active hard boundary.",
    ].join(" "),
  },
} as const;

export interface ConfiguredCreativeRuntimeConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly provider: string;
  readonly model: string;
  readonly profileId?: VnextModelProfileId;
  readonly timeoutMs: number;
}

export type CreativeRuntimeRouteTier = "large" | "light";

export interface TieredCreativeRuntimeConfig {
  readonly config: ConfiguredCreativeRuntimeConfig;
  readonly requestedTier: CreativeRuntimeRouteTier;
  readonly routeFallbackApplied: boolean;
}

export interface ConfiguredCreativeRuntimeAdapterOptions {
  readonly config: ConfiguredCreativeRuntimeConfig;
  readonly fetcher?: typeof fetch;
  readonly clock?: () => Date;
  readonly mechanismRuntime?: SpoilerSafeMechanismRuntime;
}

interface WorkflowDefinition {
  readonly schemaName: string;
  readonly workflowVersion: string;
  readonly temperature: number;
  readonly systemPrompt: string;
}

interface ProviderEnvelope {
  readonly content: string;
  readonly model: string;
  readonly traceId: string;
}

function mechanismAwareSystemPrompt(
  workflow: WorkflowDefinition,
  selection: PreparedMechanismSelection | undefined,
) {
  if (selection?.guidance === null || selection?.guidance === undefined) {
    return workflow.systemPrompt;
  }
  return [
    workflow.systemPrompt,
    renderSpoilerSafeMechanismSystemAddon(selection.guidance),
  ].join(" ");
}

function runtimeError(failureCode: string, retryable: boolean) {
  return new CreativeRuntimeExecutionError(failureCode, retryable);
}

function invalidOutput(): never {
  throw runtimeError("invalid_runtime_output", false);
}

function containsInvalidUnicodeOrControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (
      unit === 0xfffd ||
      unit === 0x7f ||
      (unit < 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d)
    ) {
      return true;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function modelNameCompatible(actual: unknown, expected: string) {
  if (typeof actual !== "string") return false;
  const left = actual.trim().toLowerCase();
  const right = expected.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(`${right}-`) || left.startsWith(`${right}/`) || left.startsWith(`${right}:`) || right.startsWith(`${left}-`) || right.startsWith(`${left}/`) || right.startsWith(`${left}:`);
}

function providerUnavailable(): never {
  throw runtimeError("provider_unavailable", false);
}

function optionalTrimmed(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function configuredTimeout(value: string | undefined) {
  const trimmed = optionalTrimmed(value);
  if (trimmed === null) {
    return DEFAULT_TIMEOUT_MS;
  }
  const timeout = Number(trimmed);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < MINIMUM_TIMEOUT_MS ||
    timeout > MAXIMUM_TIMEOUT_MS
  ) {
    providerUnavailable();
  }
  return timeout;
}

function endpointFromBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    providerUnavailable();
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    providerUnavailable();
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  if (basePath.endsWith("/v1/chat/completions")) {
    url.pathname = basePath;
  } else if (basePath.endsWith("/v1")) {
    url.pathname = `${basePath}/chat/completions`;
  } else {
    url.pathname = `${basePath}/v1/chat/completions`;
  }
  return url.toString();
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function privatePreviewAllowsInsecureModelGateway(
  env: Record<string, string | undefined>,
  endpoint: URL,
) {
  return (
    optionalTrimmed(
      env.VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_MODEL_GATEWAY,
    )?.toLowerCase() === "true" &&
    endpoint.protocol === "http:" &&
    endpoint.hostname === "model-gateway" &&
    endpoint.port === "4317"
  );
}

function validatedConfig(
  config: ConfiguredCreativeRuntimeConfig,
  env: Record<string, string | undefined> = process.env,
): ConfiguredCreativeRuntimeConfig {
  const apiKey = optionalTrimmed(config.apiKey);
  const provider = optionalTrimmed(config.provider);
  const model = optionalTrimmed(config.model);
  const endpoint = optionalTrimmed(config.endpoint);
  if (
    apiKey === null ||
    provider === null ||
    model === null ||
    endpoint === null ||
    [...provider].length > MAXIMUM_PROVIDER_ID_CODE_POINTS ||
    [...model].length > MAXIMUM_PROVIDER_MODEL_CODE_POINTS ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < MINIMUM_TIMEOUT_MS ||
    config.timeoutMs > MAXIMUM_TIMEOUT_MS
  ) {
    providerUnavailable();
  }
  if (
    config.profileId !== undefined &&
    !isVnextModelProfileId(config.profileId)
  ) {
    providerUnavailable();
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    providerUnavailable();
  }
  if (
    (endpointUrl.protocol !== "https:" &&
      !(endpointUrl.protocol === "http:" &&
        (isLoopbackHostname(endpointUrl.hostname) ||
          privatePreviewAllowsInsecureModelGateway(env, endpointUrl)))) ||
    endpointUrl.username.length > 0 ||
    endpointUrl.password.length > 0 ||
    endpointUrl.search.length > 0 ||
    endpointUrl.hash.length > 0
  ) {
    providerUnavailable();
  }
  return {
    apiKey,
    endpoint: endpointUrl.toString(),
    model,
    provider,
    ...(config.profileId === undefined
      ? {}
      : { profileId: config.profileId }),
    timeoutMs: config.timeoutMs,
  };
}

export function readConfiguredCreativeRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): ConfiguredCreativeRuntimeConfig {
  return readConfiguredCreativeRuntimeConfigForTier("large", env).config;
}

export function readConfiguredCreativeRuntimeConfigForTier(
  tier: CreativeRuntimeRouteTier,
  env: Record<string, string | undefined> = process.env,
): TieredCreativeRuntimeConfig {
  const baseUrl = optionalTrimmed(env.LITELLM_BASE_URL);
  const apiKey = optionalTrimmed(env.LITELLM_API_KEY);
  const largeProvider = optionalTrimmed(env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER);
  const largeModel = optionalTrimmed(env.MODEL_ROUTE_CREATIVE_LARGE_MODEL);
  const lightProvider = optionalTrimmed(env.MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER) ?? largeProvider;
  const lightModel = optionalTrimmed(env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL);
  const provider = tier === "light" ? lightProvider : largeProvider;
  const model = tier === "light" ? lightModel ?? largeModel : largeModel;
  const routeFallbackApplied = tier === "light" && lightModel === null;
  if (baseUrl === null || apiKey === null || provider === null || model === null) {
    providerUnavailable();
  }
  return {
    config: validatedConfig({
      apiKey,
      endpoint: endpointFromBaseUrl(baseUrl),
      model,
      provider,
      timeoutMs: configuredTimeout(env.VNEXT_CREATIVE_TIMEOUT_MS),
    }, env),
    requestedTier: tier,
    routeFallbackApplied,
  };
}

export function readConfiguredCreativeRuntimeConfigForProfile(
  profile: ConfiguredModelProfile,
  env: Record<string, string | undefined> = process.env,
): ConfiguredCreativeRuntimeConfig {
  const baseUrl = optionalTrimmed(env.LITELLM_BASE_URL);
  const apiKey = optionalTrimmed(env.LITELLM_API_KEY);
  if (
    baseUrl === null ||
    apiKey === null ||
    profile.status !== "available" ||
    profile.provider === null ||
    profile.model === null
  ) {
    providerUnavailable();
  }
  return validatedConfig({
    apiKey,
    endpoint: endpointFromBaseUrl(baseUrl),
    model: profile.model,
    profileId: profile.id,
    provider: profile.provider,
    timeoutMs: configuredTimeout(env.VNEXT_CREATIVE_TIMEOUT_MS),
  }, env);
}

function plainDataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidOutput();
  }
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    invalidOutput();
  }
  if (prototype !== Object.prototype && prototype !== null) {
    invalidOutput();
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") {
      invalidOutput();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      invalidOutput();
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      invalidOutput();
    }
    output[key] = descriptor.value;
  }
  return output;
}

function exactDataRecord(
  value: unknown,
  acceptedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const record = plainDataRecord(value);
  const keys = Object.keys(record);
  if (
    keys.length !== acceptedKeys.size ||
    keys.some((key) => !acceptedKeys.has(key)) ||
    [...acceptedKeys].some((key) => !Object.hasOwn(record, key))
  ) {
    invalidOutput();
  }
  return record;
}

function plainArray(value: unknown, maximum: number) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalidOutput();
  }
  if (value.length > maximum || Object.keys(value).length !== value.length) {
    invalidOutput();
  }
  return value as unknown[];
}

function nonEmptyText(value: unknown, maximumCodePoints: number) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    [...value].length > maximumCodePoints
  ) {
    invalidOutput();
  }
  return value;
}

function optionalQuestion(value: unknown) {
  return value === null
    ? null
    : nonEmptyText(value, MAXIMUM_TEXT_FIELD_CODE_POINTS);
}

function confidence(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalidOutput();
  }
  return value;
}

function safeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    invalidOutput();
  }
  return value;
}

function parseBoundaryEvidence(value: unknown, sourceText: string) {
  const boundary = exactDataRecord(value, BOUNDARY_EVIDENCE_KEYS);
  const boundaryValue = nonEmptyText(
    boundary.value,
    MAXIMUM_BOUNDARY_CODE_POINTS,
  );
  const evidenceStart = safeInteger(boundary.evidenceStart);
  const evidenceEnd = safeInteger(boundary.evidenceEnd);
  if (
    evidenceStart < 0 ||
    evidenceEnd <= evidenceStart ||
    evidenceEnd > sourceText.length ||
    sourceText.slice(evidenceStart, evidenceEnd) !== boundaryValue
  ) {
    invalidOutput();
  }
  return { value: boundaryValue, evidenceStart, evidenceEnd };
}

function parseUnderstandingCommon(understanding: Record<string, unknown>) {
  const commission = exactDataRecord(understanding.commission, COMMISSION_KEYS);
  const styleConstraints = plainArray(
    commission.styleConstraints,
    MAXIMUM_STYLE_CONSTRAINTS,
  ).map((item) => nonEmptyText(item, MAXIMUM_TEXT_FIELD_CODE_POINTS));
  return {
    storyDesire: nonEmptyText(
      understanding.storyDesire,
      MAXIMUM_TEXT_FIELD_CODE_POINTS,
    ),
    emotionalTarget: nonEmptyText(
      understanding.emotionalTarget,
      MAXIMUM_TEXT_FIELD_CODE_POINTS,
    ),
    relationshipTension: nonEmptyText(
      understanding.relationshipTension,
      MAXIMUM_TEXT_FIELD_CODE_POINTS,
    ),
    clarificationQuestion: optionalQuestion(understanding.clarificationQuestion),
    confidence: confidence(understanding.confidence),
    commission: {
      premise: nonEmptyText(
        commission.premise,
        MAXIMUM_TEXT_FIELD_CODE_POINTS,
      ),
      emotionalPromise: nonEmptyText(
        commission.emotionalPromise,
        MAXIMUM_TEXT_FIELD_CODE_POINTS,
      ),
      relationshipCore: nonEmptyText(
        commission.relationshipCore,
        MAXIMUM_TEXT_FIELD_CODE_POINTS,
      ),
      styleConstraints,
      continuationIntent: nonEmptyText(
        commission.continuationIntent,
        MAXIMUM_TEXT_FIELD_CODE_POINTS,
      ),
    },
  };
}

function parseUnderstanding(
  value: unknown,
  sourceText: string,
): UnderstandingOutput {
  const understanding = exactDataRecord(value, UNDERSTANDING_KEYS);
  const explicitHardBoundaries = plainArray(
    understanding.explicitHardBoundaries,
    MAXIMUM_EXPLICIT_BOUNDARIES,
  ).map((rawBoundary) => parseBoundaryEvidence(rawBoundary, sourceText));
  return {
    ...parseUnderstandingCommon(understanding),
    explicitHardBoundaries,
  };
}

function parseCorrectionUnderstanding(
  value: unknown,
  sourceText: string,
  targets: ReadonlyMap<string, { readonly boundaryId: string; readonly version: number }>,
): UnderstandingOutput {
  const understanding = exactDataRecord(value, CORRECTION_UNDERSTANDING_KEYS);
  const seenTargets = new Set<string>();
  const seenEvidence = new Set<string>();
  const boundaryActions = plainArray(
    understanding.boundaryActions,
    MAXIMUM_EXPLICIT_BOUNDARIES,
  ).map((rawAction) => {
    const action = exactDataRecord(rawAction, CORRECTION_BOUNDARY_ACTION_KEYS);
    if (
      action.operation !== "add" &&
      action.operation !== "replace" &&
      action.operation !== "revoke"
    ) {
      invalidOutput();
    }
    const evidence = parseBoundaryEvidence(action.evidence, sourceText);
    const evidenceKey = `${evidence.evidenceStart}:${evidence.evidenceEnd}`;
    if (seenEvidence.has(evidenceKey)) {
      invalidOutput();
    }
    seenEvidence.add(evidenceKey);
    if (action.operation === "add") {
      if (action.targetRef !== null || action.expectedTargetVersion !== null) {
        invalidOutput();
      }
      return {
        operation: "add" as const,
        targetBoundaryId: null,
        expectedTargetVersion: null,
        evidence,
      };
    }
    const targetRef = nonEmptyText(action.targetRef, 100);
    const target = targets.get(targetRef);
    const expectedTargetVersion = safeInteger(action.expectedTargetVersion);
    if (
      target === undefined ||
      expectedTargetVersion < 1 ||
      target.version !== expectedTargetVersion ||
      seenTargets.has(target.boundaryId)
    ) {
      invalidOutput();
    }
    seenTargets.add(target.boundaryId);
    return {
      operation: action.operation as "replace" | "revoke",
      targetBoundaryId: target.boundaryId,
      expectedTargetVersion,
      evidence,
    };
  });
  return {
    ...parseUnderstandingCommon(understanding),
    boundaryActions,
  };
}

function parseStoryText(value: unknown): StoryTextOutput {
  const output = exactDataRecord(value, STORY_OUTPUT_KEYS);
  if (
    typeof output.body !== "string" ||
    output.body.trim().length === 0 ||
    output.body.length > MAXIMUM_STORY_BODY_LENGTH ||
    containsInvalidUnicodeOrControl(output.body)
  ) {
    invalidOutput();
  }
  return { body: output.body };
}

function parseOpeningText(value: unknown): StoryTextOutput {
  const output = parseStoryText(value);
  const codePoints = [...output.body].length;
  if (
    codePoints < MINIMUM_OPENING_BODY_CODE_POINTS ||
    codePoints > MAXIMUM_OPENING_BODY_CODE_POINTS
  ) {
    invalidOutput();
  }
  return output;
}

function providerEnvelope(value: unknown): ProviderEnvelope {
  const envelope = plainDataRecord(value);
  const traceId = nonEmptyText(
    envelope.id,
    MAXIMUM_PROVIDER_TRACE_ID_CODE_POINTS,
  );
  const model = nonEmptyText(envelope.model, MAXIMUM_PROVIDER_MODEL_CODE_POINTS);
  const choices = plainArray(envelope.choices, 1);
  if (choices.length !== 1) {
    invalidOutput();
  }
  const choice = plainDataRecord(choices[0]);
  const finishReason = choice.finish_reason;
  if (finishReason === "content_filter") {
    throw runtimeError("safety_blocked", false);
  }
  if (finishReason !== "stop") {
    invalidOutput();
  }
  const message = plainDataRecord(choice.message);
  if (
    Object.hasOwn(message, "refusal") &&
    message.refusal !== null &&
    message.refusal !== ""
  ) {
    throw runtimeError("safety_blocked", false);
  }
  if (Object.hasOwn(message, "tool_calls") && message.tool_calls !== null) {
    invalidOutput();
  }
  return {
    content: nonEmptyText(message.content, MAXIMUM_PROVIDER_RESPONSE_BYTES),
    model,
    traceId,
  };
}

function gatewayRouteAttestation(
  headers: Headers,
  config: ConfiguredCreativeRuntimeConfig,
  responseModel: string,
) {
  let marker: string | null;
  let providerValue: string | null;
  let modelValue: string | null;
  let profileValue: string | null;
  let fallbackApplied: string | null;
  try {
    marker = headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerHeader);
    providerValue = headers.get(
      VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.providerHeader,
    );
    modelValue = headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.modelHeader);
    profileValue = headers.get(
      VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.profileHeader,
    );
    fallbackApplied = headers.get(
      VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.fallbackAppliedHeader,
    );
  } catch {
    invalidOutput();
  }
  if (
    marker !== VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerValue ||
    fallbackApplied !== "false"
  ) {
    invalidOutput();
  }
  const provider = nonEmptyText(
    providerValue,
    MAXIMUM_PROVIDER_ID_CODE_POINTS,
  );
  const model = nonEmptyText(modelValue, MAXIMUM_PROVIDER_MODEL_CODE_POINTS);
  if (
    provider !== config.provider ||
    !modelNameCompatible(model, config.model) ||
    !modelNameCompatible(model, responseModel) ||
    (config.profileId === undefined
      ? profileValue !== null
      : profileValue !== config.profileId)
  ) {
    invalidOutput();
  }
  return {
    provider,
    model,
    ...(config.profileId === undefined ? {} : { profileId: config.profileId }),
    fallbackApplied: false as const,
  };
}

function understandingSchema() {
  const text = { type: "string", minLength: 1 };
  return {
    type: "object",
    additionalProperties: false,
    required: [...UNDERSTANDING_KEYS],
    properties: {
      storyDesire: text,
      emotionalTarget: text,
      relationshipTension: text,
      clarificationQuestion: {
        anyOf: [text, { type: "null" }],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      commission: {
        type: "object",
        additionalProperties: false,
        required: [...COMMISSION_KEYS],
        properties: {
          premise: text,
          emotionalPromise: text,
          relationshipCore: text,
          styleConstraints: {
            type: "array",
            maxItems: MAXIMUM_STYLE_CONSTRAINTS,
            items: text,
          },
          continuationIntent: text,
        },
      },
      explicitHardBoundaries: {
        type: "array",
        maxItems: MAXIMUM_EXPLICIT_BOUNDARIES,
        items: {
          type: "object",
          additionalProperties: false,
          required: [...BOUNDARY_EVIDENCE_KEYS],
          properties: {
            value: text,
            evidenceStart: { type: "integer", minimum: 0 },
            evidenceEnd: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  };
}

function correctionUnderstandingSchema() {
  const text = { type: "string", minLength: 1 };
  const evidence = {
    type: "object",
    additionalProperties: false,
    required: [...BOUNDARY_EVIDENCE_KEYS],
    properties: {
      value: text,
      evidenceStart: { type: "integer", minimum: 0 },
      evidenceEnd: { type: "integer", minimum: 1 },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: [...CORRECTION_UNDERSTANDING_KEYS],
    properties: {
      storyDesire: text,
      emotionalTarget: text,
      relationshipTension: text,
      clarificationQuestion: { anyOf: [text, { type: "null" }] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      commission: {
        type: "object",
        additionalProperties: false,
        required: [...COMMISSION_KEYS],
        properties: {
          premise: text,
          emotionalPromise: text,
          relationshipCore: text,
          styleConstraints: {
            type: "array",
            maxItems: MAXIMUM_STYLE_CONSTRAINTS,
            items: text,
          },
          continuationIntent: text,
        },
      },
      boundaryActions: {
        type: "array",
        maxItems: MAXIMUM_EXPLICIT_BOUNDARIES,
        items: {
          type: "object",
          additionalProperties: false,
          required: [...CORRECTION_BOUNDARY_ACTION_KEYS],
          properties: {
            operation: { enum: ["add", "replace", "revoke"] },
            targetRef: { anyOf: [text, { type: "null" }] },
            expectedTargetVersion: {
              anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
            },
            evidence,
          },
        },
      },
    },
  };
}

function storyTextSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["body"],
    properties: {
      body: {
        type: "string",
        minLength: 1,
        maxLength: MAXIMUM_STORY_BODY_LENGTH,
      },
    },
  };
}

function statusFailure(status: number) {
  if (status === 401 || status === 403) {
    return runtimeError("provider_auth_failed", false);
  }
  if (status === 408 || status === 504) {
    return runtimeError("provider_timeout", true);
  }
  if (status === 429 || status >= 500) {
    return runtimeError("provider_unavailable", true);
  }
  return runtimeError("provider_request_rejected", false);
}

function isAbortError(error: unknown) {
  try {
    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    );
  } catch {
    return false;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function boundedResponseText(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > MAXIMUM_PROVIDER_RESPONSE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      invalidOutput();
    }
  }
  if (response.body === null) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        output += decoder.decode();
        return output;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAXIMUM_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        invalidOutput();
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export class ConfiguredCreativeRuntimeAdapter implements CreativeRuntimePort {
  private readonly config: ConfiguredCreativeRuntimeConfig;
  private readonly fetcher: typeof fetch;
  private readonly clock: () => Date;
  private readonly mechanismRuntime: SpoilerSafeMechanismRuntime | undefined;

  constructor(options: ConfiguredCreativeRuntimeAdapterOptions) {
    this.config = validatedConfig(options.config);
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.clock = options.clock ?? (() => new Date());
    this.mechanismRuntime = options.mechanismRuntime;
  }

  private currentInstant() {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error("configured creative runtime clock returned an invalid date");
    }
    return value.toISOString();
  }

  private activeBoundaryValues(
    input:
      | UnderstandInput
      | WriteOpeningInput
      | ReviseInput
      | ContinueStoryInput,
  ) {
    assertActiveHardBoundarySnapshot(input.hardBoundaries);
    return input.hardBoundaries.items.map((item) => item.value);
  }

  private async execute<TOutput>(input: {
    readonly context: Record<string, unknown>;
    readonly workflow: WorkflowDefinition;
    readonly schema: Record<string, unknown>;
    readonly parse: (value: unknown) => TOutput;
    readonly outputHash: (output: TOutput) => string;
    readonly mechanismSelection?: PreparedMechanismSelection;
  }): Promise<{
    readonly output: TOutput;
    readonly trace: CreativeRuntimeTrace;
    readonly fallbackApplied: false;
  }> {
    const startedAt = this.currentInstant();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timeout.unref?.();
    let response: Response;
    let rawResponse: string;
    try {
      response = await this.fetcher(this.config.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          ...(this.config.profileId === undefined
            ? {}
            : { "x-vnext-model-profile-id": this.config.profileId }),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: mechanismAwareSystemPrompt(
                input.workflow,
                input.mechanismSelection,
              ),
            },
            { role: "user", content: JSON.stringify(input.context) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.workflow.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
          stream: false,
          temperature: input.workflow.temperature,
        }),
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw statusFailure(response.status);
      }
      rawResponse = await boundedResponseText(response);
    } catch (error) {
      if (error instanceof CreativeRuntimeExecutionError) {
        throw error;
      }
      if (controller.signal.aborted || isAbortError(error)) {
        throw runtimeError("provider_timeout", true);
      }
      throw runtimeError("provider_unavailable", true);
    } finally {
      clearTimeout(timeout);
    }
    if (rawResponse.length === 0) {
      invalidOutput();
    }
    let rawEnvelope: unknown;
    try {
      rawEnvelope = JSON.parse(rawResponse);
    } catch {
      invalidOutput();
    }
    const envelope = providerEnvelope(rawEnvelope);
    const routeAttestation = gatewayRouteAttestation(
      response.headers,
      this.config,
      envelope.model,
    );
    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(envelope.content);
    } catch {
      invalidOutput();
    }
    const output = input.parse(rawOutput);
    const completedAt = this.currentInstant();
    if (Date.parse(completedAt) < Date.parse(startedAt)) {
      throw new Error("configured creative runtime clock moved backwards");
    }
    const trace: CreativeRuntimeTrace = {
      traceId: envelope.traceId,
      provider: routeAttestation.provider,
      model: routeAttestation.model,
      workflowVersion: input.workflow.workflowVersion,
      startedAt,
      completedAt,
      outputHash: input.outputHash(output),
    };
    if (
      input.mechanismSelection !== undefined &&
      this.mechanismRuntime !== undefined
    ) {
      this.mechanismRuntime.complete(
        input.mechanismSelection,
        trace.traceId,
      );
    }
    return {
      output,
      fallbackApplied: routeAttestation.fallbackApplied,
      trace,
    };
  }

  async understand(input: UnderstandInput): Promise<UnderstandResult> {
    assertActiveHardBoundarySnapshot(input.hardBoundaries);
    if (input.correctionContext !== undefined) {
      const targets = new Map<
        string,
        { readonly boundaryId: string; readonly version: number }
      >();
      const activeHardBoundaries = input.hardBoundaries.items.map((item, index) => {
        const targetRef = `ref-${index + 1}`;
        targets.set(targetRef, {
          boundaryId: item.boundaryId,
          version: item.version,
        });
        return { targetRef, value: item.value, version: item.version };
      });
      return await this.execute({
        context: {
          sourceText: input.sourceText,
          previousUnderstanding: {
            ...input.correctionContext.previousUnderstanding,
          },
          previousCommission: {
            ...input.correctionContext.previousCommission,
            styleConstraints: [
              ...input.correctionContext.previousCommission.styleConstraints,
            ],
          },
          activeHardBoundaries,
        },
        workflow: WORKFLOWS.correctUnderstanding,
        schema: correctionUnderstandingSchema(),
        parse: (value) =>
          parseCorrectionUnderstanding(value, input.sourceText, targets),
        outputHash: (output) => sha256(JSON.stringify(output)),
      });
    }
    const activeHardBoundaries = this.activeBoundaryValues(input);
    return await this.execute({
      context: {
        sourceText: input.sourceText,
        activeHardBoundaries,
      },
      workflow: WORKFLOWS.understand,
      schema: understandingSchema(),
      parse: (value) => parseUnderstanding(value, input.sourceText),
      outputHash: (output) => sha256(JSON.stringify(output)),
    });
  }

  async writeOpening(input: WriteOpeningInput): Promise<WriteOpeningResult> {
    const activeHardBoundaries = this.activeBoundaryValues(input);
    const mechanismSelection =
      this.mechanismRuntime?.prepare({
        workflow: "opening",
        storyKey: input.storyId,
        query: [
          input.premise,
          input.emotionalPromise,
          input.relationshipCore,
          ...input.styleConstraints,
          input.continuationIntent,
        ].join("\n"),
      }) ?? null;
    return await this.execute({
      context: {
        premise: input.premise,
        emotionalPromise: input.emotionalPromise,
        relationshipCore: input.relationshipCore,
        styleConstraints: [...input.styleConstraints],
        continuationIntent: input.continuationIntent,
        activeHardBoundaries,
      },
      workflow: WORKFLOWS.writeOpening,
      schema: {
        ...storyTextSchema(),
        properties: {
          body: {
            type: "string",
            minLength: MINIMUM_OPENING_BODY_CODE_POINTS,
            maxLength: MAXIMUM_OPENING_BODY_CODE_POINTS,
          },
        },
      },
      parse: parseOpeningText,
      outputHash: (output) => sha256(output.body),
      ...(mechanismSelection === null ? {} : { mechanismSelection }),
    });
  }

  async revise(input: ReviseInput): Promise<ReviseResult> {
    const activeHardBoundaries = this.activeBoundaryValues(input);
    const mechanismSelection =
      this.mechanismRuntime?.prepare({
        workflow: "revise",
        storyKey: input.storyId,
        query: `${input.instruction}\n${input.draftBody.slice(0, 2_000)}`,
      }) ?? null;
    return await this.execute({
      context: {
        draftBody: input.draftBody,
        instruction: input.instruction,
        activeHardBoundaries,
      },
      workflow: WORKFLOWS.revise,
      schema: storyTextSchema(),
      parse: parseStoryText,
      outputHash: (output) => sha256(output.body),
      ...(mechanismSelection === null ? {} : { mechanismSelection }),
    });
  }

  async continueStory(input: ContinueStoryInput): Promise<ContinueStoryResult> {
    const activeHardBoundaries = this.activeBoundaryValues(input);
    const mechanismSelection =
      this.mechanismRuntime?.prepare({
        workflow: "continue",
        storyKey: input.storyId,
        query: "续写已接受正文，推进因果、人物选择、关系变化与风险后果",
      }) ?? null;
    return await this.execute({
      context: {
        acceptedContentIds: [...input.acceptedContentIds],
        canonVersion: input.canonVersion,
        continuityVersion: input.continuityVersion,
        activeHardBoundaries,
      },
      workflow: WORKFLOWS.continueStory,
      schema: storyTextSchema(),
      parse: parseStoryText,
      outputHash: (output) => sha256(output.body),
      ...(mechanismSelection === null ? {} : { mechanismSelection }),
    });
  }
}
