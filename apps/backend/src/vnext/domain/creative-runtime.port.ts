import { types as nodeUtilTypes } from "node:util";

const IS_PROXY = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
type ExoticDataRecordPredicate = (value: unknown) => boolean;
const EXOTIC_DATA_RECORD_PREDICATES: readonly ExoticDataRecordPredicate[] = [
  nodeUtilTypes.isAnyArrayBuffer.bind(nodeUtilTypes),
  nodeUtilTypes.isArgumentsObject.bind(nodeUtilTypes),
  nodeUtilTypes.isBoxedPrimitive.bind(nodeUtilTypes),
  nodeUtilTypes.isDataView.bind(nodeUtilTypes),
  nodeUtilTypes.isDate.bind(nodeUtilTypes),
  nodeUtilTypes.isGeneratorObject.bind(nodeUtilTypes),
  nodeUtilTypes.isMap.bind(nodeUtilTypes),
  nodeUtilTypes.isMapIterator.bind(nodeUtilTypes),
  nodeUtilTypes.isModuleNamespaceObject.bind(nodeUtilTypes),
  nodeUtilTypes.isNativeError.bind(nodeUtilTypes),
  nodeUtilTypes.isPromise.bind(nodeUtilTypes),
  nodeUtilTypes.isRegExp.bind(nodeUtilTypes),
  nodeUtilTypes.isSet.bind(nodeUtilTypes),
  nodeUtilTypes.isSetIterator.bind(nodeUtilTypes),
  nodeUtilTypes.isTypedArray.bind(nodeUtilTypes),
  nodeUtilTypes.isWeakMap.bind(nodeUtilTypes),
  nodeUtilTypes.isWeakSet.bind(nodeUtilTypes),
];
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const OBJECT_CREATE = Object.create;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const NUMBER_IS_INTEGER = Number.isInteger;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const DATE = Date;
const DATE_PARSE = Date.parse.bind(Date);
const DATE_TO_ISO_STRING = Function.prototype.call.bind(
  Date.prototype.toISOString,
) as (value: Date) => string;
const TO_NUMBER = Number;
const TO_STRING = String;
const ARRAY_PUSH = Function.prototype.call.bind(Array.prototype.push) as <T>(
  array: T[],
  value: T,
) => number;
const SET_HAS = Function.prototype.call.bind(Set.prototype.has) as (
  set: ReadonlySet<string>,
  value: string,
) => boolean;
const WEAK_SET_ADD = Function.prototype.call.bind(WeakSet.prototype.add) as (
  set: WeakSet<object>,
  value: object,
) => WeakSet<object>;
const WEAK_SET_HAS = Function.prototype.call.bind(WeakSet.prototype.has) as (
  set: WeakSet<object>,
  value: unknown,
) => boolean;
const STRING_TRIM = Function.prototype.call.bind(String.prototype.trim) as (
  value: string,
) => string;
const REGEXP_TEST = Function.prototype.call.bind(RegExp.prototype.test) as (
  expression: RegExp,
  value: string,
) => boolean;
const FUNCTION_HAS_INSTANCE = Function.prototype.call.bind(
  Function.prototype[Symbol.hasInstance],
) as (constructor: Function, value: unknown) => boolean;
const ARRAY_INDEX_PATTERN = /^(0|[1-9]\d*)$/;
const SNAPSHOT_DATA_FIELDS = new Set([
  "snapshotId",
  "ownerPrincipalId",
  "version",
  "capturedAt",
  "items",
]);
const SNAPSHOT_ITEM_DATA_FIELDS = new Set([
  "boundaryId",
  "value",
  "sourceRef",
  "status",
  "version",
]);

export interface ActiveHardBoundaryItemInput {
  readonly boundaryId: string;
  readonly value: string;
  readonly sourceRef: string;
  readonly status?: "active";
  readonly version: number;
}

export interface ActiveHardBoundarySnapshotInput {
  readonly snapshotId: string;
  readonly ownerPrincipalId: string;
  readonly version: number;
  readonly capturedAt: string;
  readonly items: readonly ActiveHardBoundaryItemInput[];
}

export interface ActiveHardBoundaryItem {
  readonly boundaryId: string;
  readonly value: string;
  readonly sourceRef: string;
  readonly status: "active";
  readonly version: number;
}

interface SnapshotFields {
  readonly snapshotId: string;
  readonly ownerPrincipalId: string;
  readonly version: number;
  readonly capturedAt: string;
  readonly items: readonly ActiveHardBoundaryItem[];
}

const ACTIVE_HARD_BOUNDARY_SNAPSHOT_CONSTRUCTION_TOKEN = Symbol(
  "ActiveHardBoundarySnapshot construction token",
);
const ACTIVE_HARD_BOUNDARY_SNAPSHOTS = new WeakSet<object>();

class ValidatedActiveHardBoundarySnapshot implements SnapshotFields {
  readonly #validated = true;
  readonly snapshotId: string;
  readonly ownerPrincipalId: string;
  readonly version: number;
  readonly capturedAt: string;
  readonly items: readonly ActiveHardBoundaryItem[];

  constructor(
    token: typeof ACTIVE_HARD_BOUNDARY_SNAPSHOT_CONSTRUCTION_TOKEN,
    fields: SnapshotFields,
  ) {
    if (token !== ACTIVE_HARD_BOUNDARY_SNAPSHOT_CONSTRUCTION_TOKEN) {
      throw new Error("ActiveHardBoundarySnapshot requires its private construction token");
    }
    this.snapshotId = fields.snapshotId;
    this.ownerPrincipalId = fields.ownerPrincipalId;
    this.version = fields.version;
    this.capturedAt = fields.capturedAt;
    this.items = fields.items;
    WEAK_SET_ADD(ACTIVE_HARD_BOUNDARY_SNAPSHOTS, this);
    OBJECT_FREEZE(this);
  }
}

export type ActiveHardBoundarySnapshot = ValidatedActiveHardBoundarySnapshot;

export function isActiveHardBoundarySnapshot(
  value: unknown,
): value is ActiveHardBoundarySnapshot {
  try {
    if (IS_PROXY(value) || !WEAK_SET_HAS(ACTIVE_HARD_BOUNDARY_SNAPSHOTS, value)) {
      return false;
    }
    return FUNCTION_HAS_INSTANCE(ValidatedActiveHardBoundarySnapshot, value);
  } catch {
    return false;
  }
}

export function assertActiveHardBoundarySnapshot(
  value: unknown,
): asserts value is ActiveHardBoundarySnapshot {
  if (!isActiveHardBoundarySnapshot(value)) {
    throw new Error("value must be a validated active hard-boundary snapshot");
  }
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || STRING_TRIM(value).length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requirePositiveInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !NUMBER_IS_SAFE_INTEGER(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`);
  }
}

function requireCanonicalIsoInstant(value: unknown, field: string): asserts value is string {
  requireNonEmpty(value, field);
  const timestamp = DATE_PARSE(value);
  if (!NUMBER_IS_INTEGER(timestamp)) {
    throw new Error(`${field} must be a valid ISO instant`);
  }
  let canonical: string;
  try {
    canonical = DATE_TO_ISO_STRING(new DATE(timestamp));
  } catch {
    throw new Error(`${field} must be a valid ISO instant`);
  }
  if (canonical !== value) {
    throw new Error(`${field} must be a valid ISO instant`);
  }
}

function isExoticDataRecord(input: unknown) {
  for (let index = 0; index < EXOTIC_DATA_RECORD_PREDICATES.length; index += 1) {
    try {
      if (EXOTIC_DATA_RECORD_PREDICATES[index]!(input)) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function readPlainDataRecord(
  input: unknown,
  allowedFields: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  let prototype: object | null;
  let ownKeys: PropertyKey[];
  try {
    if (
      IS_PROXY(input) ||
      typeof input !== "object" ||
      input === null ||
      ARRAY_IS_ARRAY(input) ||
      isExoticDataRecord(input)
    ) {
      throw new Error("not a record");
    }
    prototype = OBJECT_GET_PROTOTYPE_OF(input);
    ownKeys = REFLECT_OWN_KEYS(input);
  } catch {
    throw new Error(`${label} must be a plain data record`);
  }
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null) {
    throw new Error(`${label} must be a plain data record`);
  }

  const values = OBJECT_CREATE(null) as Record<string, unknown>;
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const key = ownKeys[keyIndex]!;
    if (typeof key !== "string" || !SET_HAS(allowedFields, key)) {
      throw new Error(`${label} has unknown field ${TO_STRING(key)}`);
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
    } catch {
      throw new Error(`${label} must be a plain data record`);
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must be a plain data record with data fields only`);
    }
    values[key] = descriptor.value;
  }
  return values;
}

function requiredField(values: Record<string, unknown>, field: string, label: string) {
  if (!OBJECT_HAS_OWN(values, field)) {
    throw new Error(`${label}.${field} is required`);
  }
  return values[field];
}

function readNativePlainArray(input: unknown, label: string) {
  let prototype: object | null;
  let ownKeys: PropertyKey[];
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    if (IS_PROXY(input) || !ARRAY_IS_ARRAY(input)) {
      throw new Error("not an array");
    }
    prototype = OBJECT_GET_PROTOTYPE_OF(input);
    ownKeys = REFLECT_OWN_KEYS(input);
    lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(input, "length");
  } catch {
    throw new Error(`${label} must be a native plain array`);
  }
  if (
    prototype !== ARRAY_PROTOTYPE ||
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    throw new Error(`${label} must be a native plain array`);
  }
  const length = lengthDescriptor.value as number;
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const key = ownKeys[keyIndex]!;
    if (key === "length") {
      continue;
    }
    if (
      typeof key !== "string" ||
      !REGEXP_TEST(ARRAY_INDEX_PATTERN, key) ||
      TO_NUMBER(key) >= length
    ) {
      throw new Error(`${label} must be a native plain array`);
    }
  }

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(input, TO_STRING(index));
    } catch {
      throw new Error(`${label} must be a native plain array`);
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must be a dense native plain array with data items only`);
    }
    ARRAY_PUSH(values, descriptor.value);
  }
  return values;
}

function buildActiveHardBoundarySnapshot(input: unknown): ActiveHardBoundarySnapshot {
  const snapshot = readPlainDataRecord(
    input,
    SNAPSHOT_DATA_FIELDS,
    "hard-boundary snapshot",
  );
  const snapshotId = requiredField(snapshot, "snapshotId", "hard-boundary snapshot");
  const ownerPrincipalId = requiredField(snapshot, "ownerPrincipalId", "hard-boundary snapshot");
  const version = requiredField(snapshot, "version", "hard-boundary snapshot");
  const capturedAt = requiredField(snapshot, "capturedAt", "hard-boundary snapshot");
  const rawItems = readNativePlainArray(
    requiredField(snapshot, "items", "hard-boundary snapshot"),
    "hard-boundary snapshot.items",
  );

  requireNonEmpty(snapshotId, "snapshotId");
  requireNonEmpty(ownerPrincipalId, "ownerPrincipalId");
  requireCanonicalIsoInstant(capturedAt, "capturedAt");
  requirePositiveInteger(version, "version");

  const items: ActiveHardBoundaryItem[] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const rawItem = rawItems[index];
    const item = readPlainDataRecord(
      rawItem,
      SNAPSHOT_ITEM_DATA_FIELDS,
      `hard-boundary snapshot.items[${index}]`,
    );
    const boundaryId = requiredField(item, "boundaryId", `items[${index}]`);
    const value = requiredField(item, "value", `items[${index}]`);
    const sourceRef = requiredField(item, "sourceRef", `items[${index}]`);
    const status = OBJECT_HAS_OWN(item, "status") ? item.status : "active";
    const itemVersion = requiredField(item, "version", `items[${index}]`);
    requireNonEmpty(boundaryId, `items[${index}].boundaryId`);
    requireNonEmpty(value, `items[${index}].value`);
    requireNonEmpty(sourceRef, `items[${index}].sourceRef`);
    if (status !== "active") {
      throw new Error(`items[${index}].status must be active`);
    }
    requirePositiveInteger(itemVersion, `items[${index}].version`);
    ARRAY_PUSH(
      items,
      OBJECT_FREEZE({
        boundaryId,
        value,
        sourceRef,
        status: "active" as const,
        version: itemVersion,
      }),
    );
  }

  return new ValidatedActiveHardBoundarySnapshot(
    ACTIVE_HARD_BOUNDARY_SNAPSHOT_CONSTRUCTION_TOKEN,
    {
      snapshotId,
      ownerPrincipalId,
      version,
      capturedAt,
      items: OBJECT_FREEZE(items),
    },
  );
}

export function createActiveHardBoundarySnapshot(
  input: ActiveHardBoundarySnapshotInput,
): ActiveHardBoundarySnapshot {
  return buildActiveHardBoundarySnapshot(input);
}

export function rehydrateActiveHardBoundarySnapshot(
  input: unknown,
): ActiveHardBoundarySnapshot {
  return buildActiveHardBoundarySnapshot(input);
}

interface CreativeRuntimeContext {
  readonly requestId: string;
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
}

export interface UnderstandInput extends CreativeRuntimeContext {
  readonly sourceMessageId: string;
  readonly sourceText: string;
  readonly correctionContext?: {
    readonly previousUnderstanding: {
      readonly storyDesire: string;
      readonly emotionalTarget: string;
      readonly relationshipTension: string;
      readonly clarificationQuestion: string | null;
      readonly confidence: number;
    };
    readonly previousCommission: {
      readonly premise: string;
      readonly emotionalPromise: string;
      readonly relationshipCore: string;
      readonly styleConstraints: readonly string[];
      readonly continuationIntent: string;
    };
  };
}

export interface WriteOpeningInput extends CreativeRuntimeContext {
  readonly storyId: string;
  readonly understandingId: string;
  readonly commissionId: string;
  readonly premise: string;
  readonly emotionalPromise: string;
  readonly relationshipCore: string;
  readonly styleConstraints: readonly string[];
  readonly continuationIntent: string;
}

export interface ReviseInput extends CreativeRuntimeContext {
  readonly storyId: string;
  readonly contentId: string;
  readonly draftBody: string;
  readonly instruction: string;
}

export interface ContinueStoryInput extends CreativeRuntimeContext {
  readonly storyId: string;
  readonly acceptedContentIds: readonly string[];
  readonly canonVersion: number;
  readonly continuityVersion: number;
}

export interface CreativeRuntimeTrace {
  readonly traceId: string;
  readonly provider: string;
  readonly model: string;
  readonly workflowVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputHash: string;
}

interface CreativeRuntimeResult<TOutput> {
  readonly output: TOutput;
  readonly trace: CreativeRuntimeTrace;
  readonly fallbackApplied: false;
}

interface UnderstandingOutputBase {
  readonly storyDesire: string;
  readonly emotionalTarget: string;
  readonly relationshipTension: string;
  readonly clarificationQuestion: string | null;
  readonly confidence: number;
  readonly commission: {
    readonly premise: string;
    readonly emotionalPromise: string;
    readonly relationshipCore: string;
    readonly styleConstraints: readonly string[];
    readonly continuationIntent: string;
  };
}

export interface InitialUnderstandingOutput extends UnderstandingOutputBase {
  readonly explicitHardBoundaries: readonly {
    readonly value: string;
    readonly evidenceStart: number;
    readonly evidenceEnd: number;
  }[];
  readonly boundaryActions?: never;
}

export interface CorrectionBoundaryAction {
  readonly operation: "add" | "replace" | "revoke";
  readonly targetBoundaryId: string | null;
  readonly expectedTargetVersion: number | null;
  readonly evidence: {
    readonly value: string;
    readonly evidenceStart: number;
    readonly evidenceEnd: number;
  };
}

export interface CorrectionUnderstandingOutput extends UnderstandingOutputBase {
  readonly explicitHardBoundaries?: never;
  readonly boundaryActions: readonly CorrectionBoundaryAction[];
}

export type UnderstandingOutput =
  | InitialUnderstandingOutput
  | CorrectionUnderstandingOutput;

export interface StoryTextOutput {
  readonly body: string;
}

export type UnderstandResult = CreativeRuntimeResult<UnderstandingOutput>;
export type WriteOpeningResult = CreativeRuntimeResult<StoryTextOutput>;
export type ReviseResult = CreativeRuntimeResult<StoryTextOutput>;
export type ContinueStoryResult = CreativeRuntimeResult<StoryTextOutput>;

export interface CreativeRuntimePort {
  understand(input: UnderstandInput): Promise<UnderstandResult>;
  writeOpening(input: WriteOpeningInput): Promise<WriteOpeningResult>;
  revise(input: ReviseInput): Promise<ReviseResult>;
  continueStory(input: ContinueStoryInput): Promise<ContinueStoryResult>;
}
