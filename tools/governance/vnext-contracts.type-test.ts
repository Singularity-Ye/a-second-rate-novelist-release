import type {
  ActiveHardBoundarySnapshotInput,
  ActiveHardBoundarySnapshot,
  CreativeRuntimePort,
} from "../../apps/backend/src/vnext/domain/creative-runtime.port.js";
import {
  assertActiveHardBoundarySnapshot,
  isActiveHardBoundarySnapshot,
  rehydrateActiveHardBoundarySnapshot,
} from "../../apps/backend/src/vnext/domain/creative-runtime.port.js";
import {
  vnextExperienceRequestSchema,
  type ExperienceDraft,
  type VnextExperienceRequest,
} from "../../packages/shared-contracts/vnext-experience.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;
type NormalizeUnion<TValue> = TValue extends unknown
  ? { [TKey in keyof TValue]: TValue[TKey] }
  : never;

type _ExactPortMethods = Assert<
  Equal<keyof CreativeRuntimePort, "understand" | "writeOpening" | "revise" | "continueStory">
>;

type _ExactSnapshotPublicKeys = Assert<
  Equal<
    keyof ActiveHardBoundarySnapshot,
    "snapshotId" | "ownerPrincipalId" | "version" | "capturedAt" | "items"
  >
>;
type _ExactSnapshotInputKeys = Assert<
  Equal<
    keyof ActiveHardBoundarySnapshotInput,
    "snapshotId" | "ownerPrincipalId" | "version" | "capturedAt" | "items"
  >
>;
type _ExactSnapshotItemKeys = Assert<
  Equal<
    keyof ActiveHardBoundarySnapshot["items"][number],
    "boundaryId" | "value" | "sourceRef" | "status" | "version"
  >
>;
type _ExactSnapshotInputItemKeys = Assert<
  Equal<
    keyof ActiveHardBoundarySnapshotInput["items"][number],
    "boundaryId" | "value" | "sourceRef" | "status" | "version"
  >
>;
type ExpectedSnapshotPublicShape = {
  readonly snapshotId: string;
  readonly ownerPrincipalId: string;
  readonly version: number;
  readonly capturedAt: string;
  readonly items: readonly {
    readonly boundaryId: string;
    readonly value: string;
    readonly sourceRef: string;
    readonly status: "active";
    readonly version: number;
  }[];
};
type ExpectedSnapshotInputShape = {
  readonly snapshotId: string;
  readonly ownerPrincipalId: string;
  readonly version: number;
  readonly capturedAt: string;
  readonly items: readonly {
    readonly boundaryId: string;
    readonly value: string;
    readonly sourceRef: string;
    readonly status?: "active";
    readonly version: number;
  }[];
};
type _ExactSnapshotPublicFieldTypes = Assert<
  Equal<
    { [Key in keyof ActiveHardBoundarySnapshot]: ActiveHardBoundarySnapshot[Key] },
    ExpectedSnapshotPublicShape
  >
>;
type _ExactSnapshotInputFieldTypes = Assert<
  Equal<ActiveHardBoundarySnapshotInput, ExpectedSnapshotInputShape>
>;

type ExpectedUnderstandInput = {
  readonly requestId: string;
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
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
};
type ExpectedWriteOpeningInput = {
  readonly requestId: string;
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
  readonly storyId: string;
  readonly understandingId: string;
  readonly commissionId: string;
  readonly premise: string;
  readonly emotionalPromise: string;
  readonly relationshipCore: string;
  readonly styleConstraints: readonly string[];
  readonly continuationIntent: string;
};
type ExpectedReviseInput = {
  readonly requestId: string;
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
  readonly storyId: string;
  readonly contentId: string;
  readonly draftBody: string;
  readonly instruction: string;
};
type ExpectedContinueStoryInput = {
  readonly requestId: string;
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
  readonly storyId: string;
  readonly acceptedContentIds: readonly string[];
  readonly canonVersion: number;
  readonly continuityVersion: number;
};
type ExpectedRuntimeTrace = {
  readonly traceId: string;
  readonly provider: string;
  readonly model: string;
  readonly workflowVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputHash: string;
};
interface ExpectedUnderstandingOutputBase {
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
interface ExpectedInitialUnderstandingOutput
  extends ExpectedUnderstandingOutputBase {
  readonly explicitHardBoundaries: readonly {
    readonly value: string;
    readonly evidenceStart: number;
    readonly evidenceEnd: number;
  }[];
  readonly boundaryActions?: never;
}
interface ExpectedCorrectionUnderstandingOutput
  extends ExpectedUnderstandingOutputBase {
  readonly explicitHardBoundaries?: never;
  readonly boundaryActions: readonly {
    readonly operation: "add" | "replace" | "revoke";
    readonly targetBoundaryId: string | null;
    readonly expectedTargetVersion: number | null;
    readonly evidence: {
      readonly value: string;
      readonly evidenceStart: number;
      readonly evidenceEnd: number;
    };
  }[];
}
type ExpectedUnderstandResult = {
  readonly output:
    | ExpectedInitialUnderstandingOutput
    | ExpectedCorrectionUnderstandingOutput;
  readonly trace: ExpectedRuntimeTrace;
  readonly fallbackApplied: false;
};
type ExpectedWriteOpeningResult = {
  readonly output: { readonly body: string };
  readonly trace: ExpectedRuntimeTrace;
  readonly fallbackApplied: false;
};
type ExpectedReviseResult = {
  readonly output: { readonly body: string };
  readonly trace: ExpectedRuntimeTrace;
  readonly fallbackApplied: false;
};
type ExpectedContinueStoryResult = {
  readonly output: { readonly body: string };
  readonly trace: ExpectedRuntimeTrace;
  readonly fallbackApplied: false;
};

type _ExactUnderstandMethod = Assert<
  Equal<
    CreativeRuntimePort["understand"],
    (input: ExpectedUnderstandInput) => Promise<ExpectedUnderstandResult>
  >
>;
type _ExactWriteOpeningMethod = Assert<
  Equal<
    CreativeRuntimePort["writeOpening"],
    (input: ExpectedWriteOpeningInput) => Promise<ExpectedWriteOpeningResult>
  >
>;
type _ExactReviseMethod = Assert<
  Equal<
    CreativeRuntimePort["revise"],
    (input: ExpectedReviseInput) => Promise<ExpectedReviseResult>
  >
>;
type _ExactContinueStoryMethod = Assert<
  Equal<
    CreativeRuntimePort["continueStory"],
    (input: ExpectedContinueStoryInput) => Promise<ExpectedContinueStoryResult>
  >
>;
type _ExactUnderstandInputKeys = Assert<
  Equal<keyof Parameters<CreativeRuntimePort["understand"]>[0], keyof ExpectedUnderstandInput>
>;
type _ExactWriteOpeningInputKeys = Assert<
  Equal<
    keyof Parameters<CreativeRuntimePort["writeOpening"]>[0],
    keyof ExpectedWriteOpeningInput
  >
>;
type _ExactReviseInputKeys = Assert<
  Equal<keyof Parameters<CreativeRuntimePort["revise"]>[0], keyof ExpectedReviseInput>
>;
type _ExactContinueStoryInputKeys = Assert<
  Equal<
    keyof Parameters<CreativeRuntimePort["continueStory"]>[0],
    keyof ExpectedContinueStoryInput
  >
>;

type RuntimeResult = Awaited<ReturnType<CreativeRuntimePort[keyof CreativeRuntimePort]>>;
type _FallbackIsAlwaysFalse = Assert<Equal<RuntimeResult["fallbackApplied"], false>>;
type _EveryResultHasTrace = Assert<
  RuntimeResult extends {
    readonly trace: {
      readonly traceId: string;
      readonly provider: string;
      readonly model: string;
      readonly workflowVersion: string;
      readonly startedAt: string;
      readonly completedAt: string;
      readonly outputHash: string;
    };
  }
    ? true
    : false
>;
type OpeningBrowserRequest = ReturnType<typeof vnextExperienceRequestSchema.parse>;
type ExpectedOpeningBrowserRequest =
  | {
      action: "submit_intent";
      clientRequestId: string;
      text: string;
      basedOnVersionId?: never;
    }
  | {
      action: "correct_understanding";
      clientRequestId: string;
      text: string;
      basedOnVersionId: string;
    }
  | {
      action: "retry_current_task";
      clientRequestId: string;
      text?: never;
      basedOnVersionId: string;
    };
type _ExactOpeningBrowserRequest = Assert<
  Equal<NormalizeUnion<OpeningBrowserRequest>, ExpectedOpeningBrowserRequest>
>;
type _ExactExperienceDraft = Assert<
  Equal<
    ExperienceDraft,
    {
      contentId: string;
      versionId: string;
      kind: "opening" | "scene" | "chapter";
      body: string;
    }
  >
>;

declare const snapshot: ActiveHardBoundarySnapshot;
declare const input: Parameters<CreativeRuntimePort["understand"]>[0];

// @ts-expect-error validated snapshot ownership is immutable
snapshot.ownerPrincipalId = "mutated";
// @ts-expect-error validated snapshot item collection is immutable
snapshot.items.push(snapshot.items[0]!);
// @ts-expect-error validated snapshot items are deeply immutable
snapshot.items[0]!.value = "mutated";
// @ts-expect-error adapter input fields are immutable
input.requestId = "mutated";
// @ts-expect-error the snapshot owner is the only owner truth
input.ownerPrincipalId;

const understandWithForbiddenOwner: Parameters<CreativeRuntimePort["understand"]>[0] = {
  requestId: "runtime-v1",
  hardBoundaries: snapshot,
  sourceMessageId: "message-v1",
  sourceText: "story intent",
  // @ts-expect-error runtime inputs must not duplicate snapshot owner truth
  ownerPrincipalId: "forged-owner",
};
const understandWithExtraField: Parameters<CreativeRuntimePort["understand"]>[0] = {
  requestId: "runtime-v2",
  hardBoundaries: snapshot,
  sourceMessageId: "message-v2",
  sourceText: "story intent",
  // @ts-expect-error unexpected adapter fields must not drift into the port
  unexpectedAdapterField: true,
};

const spreadSnapshot = { ...snapshot, ownerPrincipalId: "forged-owner" };
// @ts-expect-error spreading a validated snapshot loses its private brand
const forgedSnapshot: ActiveHardBoundarySnapshot = spreadSnapshot;

const serializedSnapshot: ActiveHardBoundarySnapshotInput = {
  snapshotId: "snapshot-v1",
  ownerPrincipalId: "principal-v1",
  version: 1,
  capturedAt: "2026-07-10T12:00:00.000Z",
  items: [
    {
      boundaryId: "boundary-v1",
      value: "boundary",
      sourceRef: "message-v1",
      status: "active",
      version: 1,
    },
  ],
};
declare const untrustedSnapshot: unknown;
if (isActiveHardBoundarySnapshot(untrustedSnapshot)) {
  const validatedSnapshot: ActiveHardBoundarySnapshot = untrustedSnapshot;
  void validatedSnapshot;
}
assertActiveHardBoundarySnapshot(untrustedSnapshot);
const assertedSnapshot: ActiveHardBoundarySnapshot = untrustedSnapshot;
const rehydratedSnapshot: ActiveHardBoundarySnapshot =
  rehydrateActiveHardBoundarySnapshot(serializedSnapshot);

const submitRequest: OpeningBrowserRequest = {
  action: "submit_intent",
  clientRequestId: "submit-v1",
  text: "new story",
};
// @ts-expect-error submit requires the new story intent text
const submitWithoutText: OpeningBrowserRequest = {
  action: "submit_intent",
  clientRequestId: "submit-missing-text",
};
const correctionRequest: OpeningBrowserRequest = {
  action: "correct_understanding",
  clientRequestId: "correction-v1",
  text: "change the relationship tension",
  basedOnVersionId: "understanding-v1",
};
const acceptRequest: OpeningBrowserRequest = {
  // @ts-expect-error opening browser requests exclude acceptance writes
  action: "accept_current",
  clientRequestId: "accept-v1",
  basedOnVersionId: "draft-v1",
};
const versionedSubmitShape = {
  action: "submit_intent",
  clientRequestId: "submit-v2",
  text: "new story",
  basedOnVersionId: "draft-v1",
} as const;
// @ts-expect-error a fresh submit must not target an existing version
const versionedSubmitRequest: OpeningBrowserRequest = versionedSubmitShape;

const revisionRequest: VnextExperienceRequest<"request_revision"> = {
  action: "request_revision",
  clientRequestId: "revision-v1",
  text: "make it quieter",
  basedOnVersionId: "draft-v1",
};
// @ts-expect-error a revision requires instruction text
const revisionWithoutText: VnextExperienceRequest<"request_revision"> = {
  action: "request_revision",
  clientRequestId: "revision-v2",
  basedOnVersionId: "draft-v1",
};
// @ts-expect-error a revision requires the draft version it targets
const revisionWithoutVersion: VnextExperienceRequest<"request_revision"> = {
  action: "request_revision",
  clientRequestId: "revision-v3",
  text: "make it quieter",
};

const acceptCurrentRequest: VnextExperienceRequest<"accept_current"> = {
  action: "accept_current",
  clientRequestId: "accept-current-v1",
  basedOnVersionId: "draft-v1",
};
// @ts-expect-error accepting a draft requires the version being accepted
const acceptCurrentWithoutVersion: VnextExperienceRequest<"accept_current"> = {
  action: "accept_current",
  clientRequestId: "accept-current-v2",
};
const acceptCurrentWithTextShape = {
  action: "accept_current",
  clientRequestId: "accept-current-v3",
  basedOnVersionId: "draft-v1",
  text: "accept this",
} as const;
// @ts-expect-error accepting current draft must not carry revision text
const acceptCurrentWithText: VnextExperienceRequest<"accept_current"> =
  acceptCurrentWithTextShape;

const retryRequest: OpeningBrowserRequest = {
  action: "retry_current_task",
  clientRequestId: "retry-v1",
  basedOnVersionId: "task-v1",
};
// @ts-expect-error retry requires the persisted task version
const retryWithoutVersion: OpeningBrowserRequest = {
  action: "retry_current_task",
  clientRequestId: "retry-missing-version",
};
const retryWithTextShape = {
  action: "retry_current_task",
  clientRequestId: "retry-v2",
  basedOnVersionId: "task-v1",
  text: "replace task",
} as const;
// @ts-expect-error retry reuses the persisted task and must not carry text
const retryWithText: OpeningBrowserRequest = retryWithTextShape;

void (null as unknown as _ExactPortMethods);
void (null as unknown as _ExactSnapshotPublicKeys);
void (null as unknown as _ExactSnapshotInputKeys);
void (null as unknown as _ExactSnapshotItemKeys);
void (null as unknown as _ExactSnapshotInputItemKeys);
void (null as unknown as _ExactSnapshotPublicFieldTypes);
void (null as unknown as _ExactSnapshotInputFieldTypes);
void (null as unknown as _ExactUnderstandMethod);
void (null as unknown as _ExactWriteOpeningMethod);
void (null as unknown as _ExactReviseMethod);
void (null as unknown as _ExactContinueStoryMethod);
void (null as unknown as _ExactUnderstandInputKeys);
void (null as unknown as _ExactWriteOpeningInputKeys);
void (null as unknown as _ExactReviseInputKeys);
void (null as unknown as _ExactContinueStoryInputKeys);
void (null as unknown as _FallbackIsAlwaysFalse);
void (null as unknown as _EveryResultHasTrace);
void (null as unknown as _ExactOpeningBrowserRequest);
void forgedSnapshot;
void understandWithForbiddenOwner;
void understandWithExtraField;
void assertedSnapshot;
void rehydratedSnapshot;
void submitRequest;
void submitWithoutText;
void acceptRequest;
void versionedSubmitRequest;
void revisionRequest;
void revisionWithoutText;
void revisionWithoutVersion;
void acceptCurrentRequest;
void acceptCurrentWithoutVersion;
void acceptCurrentWithText;
void retryRequest;
void retryWithoutVersion;
void retryWithText;
