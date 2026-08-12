import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperienceProjection } from "@erliu/shared-contracts/vnext-experience";
import {
  applyCreativeSupportDecision,
  createOriginStorySpec,
  createSystemBinding,
  getSystemDialogue,
  InvalidSystemBindingError,
  InvalidCreativeTaskTransitionError,
  isValidSystemBinding,
  loadSystemBinding,
  projectSystemLayer,
  recordNextDayMemory,
  resolveCreativeEvidence,
  saveSystemBinding,
  SYSTEM_BINDING_STORAGE_KEY,
  submitCreativeEvidence,
  updateCreativeSupportTask,
  updateNovelistRelationship,
  updateSystemConversation,
} from "./system-layer";
import type { RoomUiActionView, RoomUiPresentationalSurfaceProps } from "./room-ui-adapter";
import { SystemLayerPanel } from "./system-layer-panel";
import {
  EARLY_ROOM_HYDRATED_DATASET_KEY,
  EARLY_ROOM_OPEN_PENDING_DATASET_KEY,
} from "../../lib/early-room-open-intent";

const xianxia = {
  id: "xianxia",
  name: "玄烛剑尊",
  icon: "⚡",
  tag: "无敌剑尊",
  poseAssetRef: "/assets/prologue/reincarnation/xuanzhu/v1/character-card.webp",
};

const availableProjection = {
  versionId: "projection:test:available",
  status: "available",
  headline: "小韩在这里",
  body: "把你想看的故事直接告诉他。",
  understanding: null,
  primaryAction: { code: "submit_intent", label: "说说想看的故事" },
  secondaryActions: [],
} as const satisfies ExperienceProjection;

const retryProjection = {
  versionId: "projection:test:retry",
  status: "unavailable",
  headline: "现在还写不了",
  body: "委托仍然保留，可以按当前版本重试。",
  understanding: null,
  primaryAction: {
    code: "retry_current_task",
    label: "重试",
    basedOnVersionId: "task:test:retry-v2",
  },
  secondaryActions: [{ code: "return_later", label: "稍后再来" }],
} as const satisfies ExperienceProjection;

const draftProjection = {
  versionId: "projection:test:draft",
  status: "draft_ready",
  headline: "新稿已写好",
  body: "这仍是等待阅读的草稿。",
  understanding: null,
  primaryAction: { code: "open_draft", label: "阅读新稿" },
  secondaryActions: [],
} as const satisfies ExperienceProjection;

const writingProjection = {
  versionId: "projection:test:writing",
  status: "writing",
  headline: "正在写",
  body: "委托已经进入正式写作。",
  understanding: null,
  primaryAction: null,
  secondaryActions: [{ code: "return_later", label: "稍后再来" }],
} as const satisfies ExperienceProjection;

const correctionProjection = {
  versionId: "projection:test:correction",
  status: "listening",
  headline: "需要补充说明",
  body: "先确认你的意思。",
  understanding: {
    versionId: "understanding:test:correction",
    statement: "先写雨夜里的相遇。",
    clarificationQuestion: "你希望谁先开口？",
  },
  primaryAction: {
    code: "correct_understanding",
    label: "补充说明",
    basedOnVersionId: "understanding:test:correction",
  },
  secondaryActions: [],
} as const satisfies ExperienceProjection;

const admissionManifest = {
  audienceMode: "internal",
  inputPolicy: "synthetic_only",
  admissionPolicyVersion: "internal-synthetic-v1",
  aiIdentityNoticeVersion: "ai-notice-v1",
  serviceTermsVersion: "internal-terms-v1",
  privacyNoticeVersion: "internal-privacy-v1",
} as const;

function projectionResponse(projection: ExperienceProjection = availableProjection) {
  return new Response(JSON.stringify(projection), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const draftReadyContentId = "77777777-7777-4777-8777-777777777777";
const draftReadyProjectionVersionId = "projection:room-story-draft";
const draftReadyUpdatedAt = "2026-08-04T06:00:00.000Z";

const blockedRoomStoryContext = {
  schemaVersion: 2,
  access: "blocked",
  blockedReason: "compliance",
  source: "none",
  progress: "blocked",
  workspace: null,
  understanding: null,
  commission: null,
  acceptedContent: null,
  draft: null,
  creativeJob: null,
  updatedAt: null,
} as const;

const draftReadyRoomStoryContext = {
  schemaVersion: 2,
  access: "available",
  blockedReason: null,
  source: "persisted_story_truth",
  progress: "draft_ready",
  workspace: {
    id: "88888888-8888-4888-8888-888888888888",
    storyId: "88888888-8888-4888-8888-888888888888",
    title: "雨夜未寄的信",
    currentChapter: null,
    status: "forming",
    aggregateVersion: 2,
    updatedAt: draftReadyUpdatedAt,
  },
  understanding: null,
  commission: null,
  acceptedContent: null,
  draft: {
    contentId: draftReadyContentId,
    kind: "opening",
    status: "draft",
    version: 1,
    characterCount: 168,
    updatedAt: draftReadyUpdatedAt,
    preview: "雨夜里，门锁响了一声。",
  },
  creativeJob: {
    taskId: "99999999-9999-4999-8999-999999999999",
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "write_opening",
    status: "succeeded",
    progress: "draft_ready",
    stateVersion: 2,
    startedAt: draftReadyUpdatedAt,
    completedAt: draftReadyUpdatedAt,
    updatedAt: draftReadyUpdatedAt,
    route: {
      provider: "company-router",
      model: "grok-4.5",
      fallbackApplied: false,
    },
  },
  updatedAt: draftReadyUpdatedAt,
} as const;

const variantCandidateSetId = "11111111-1111-4111-8111-111111111111";
const variantCandidateIds = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
] as const;
const variantSelectedContentId = "55555555-5555-4555-8555-555555555555";
const variantReviewRoomStoryContext = {
  ...draftReadyRoomStoryContext,
  progress: "variant_review",
  workspace: {
    ...draftReadyRoomStoryContext.workspace,
    aggregateVersion: 5,
  },
  understanding: {
    id: "66666666-6666-4666-8666-666666666666",
    version: 2,
    storyDesire: "雨夜重逢",
    emotionalTarget: "迟疑",
    relationshipTension: "旧事未说破",
  },
  commission: {
    id: "77777777-7777-4777-8777-777777777777",
    version: 3,
    status: "active",
    premise: "雨夜重逢",
    emotionalPromise: "让人物先行动",
    continuationIntent: "从门锁声开始",
  },
  draft: null,
  creativeJob: {
    ...draftReadyRoomStoryContext.creativeJob,
    taskId: "99999999-9999-4999-8999-999999999999",
    progress: "variant_review",
    stateVersion: 4,
    route: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      fallbackApplied: false,
    },
    candidateReview: {
      candidateSetId: variantCandidateSetId,
      candidateSetVersion: 1,
      status: "pending",
      candidateCount: 3,
    },
  },
} as const;

async function variantCandidateSetPayload(selected = false) {
  const bodies = ["甲".repeat(500), "乙".repeat(520), "丙".repeat(540)];
  const candidates = await Promise.all(bodies.map(async (body, index) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const bodyHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return {
      candidateId: variantCandidateIds[index],
      candidateSetId: variantCandidateSetId,
      candidateSetVersion: 1,
      ordinal: index + 1,
      techniqueLabels: [`技法${index + 1}`],
      techniqueSummary: `第${index + 1}种写法`,
      body,
      bodyHash,
      status: selected ? (index === 1 ? "selected" : "rejected") : "pending",
    };
  }));
  return {
    candidateSetId: variantCandidateSetId,
    candidateSetVersion: 1,
    status: selected ? "selected" : "pending",
    workspace: {
      id: draftReadyRoomStoryContext.workspace.id,
      aggregateVersion: 5,
    },
    understanding: {
      id: variantReviewRoomStoryContext.understanding.id,
      version: 2,
    },
    commission: {
      id: variantReviewRoomStoryContext.commission.id,
      version: 3,
    },
    task: {
      id: variantReviewRoomStoryContext.creativeJob.taskId,
      stateVersion: 4,
    },
    trace: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      attemptNumber: 1,
      outputHash: "a".repeat(64),
    },
    attestation: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      route: "creative_large",
      workflowVersion: "write-opening-variants-v1",
      providerTraceId: "provider-trace-1",
      fallbackApplied: false,
    },
    candidates,
    selectedCandidateId: selected ? variantCandidateIds[1] : null,
    selectedContentId: selected ? variantSelectedContentId : null,
  };
}

function roomStoryContextResponse(
  context: typeof blockedRoomStoryContext | typeof draftReadyRoomStoryContext = blockedRoomStoryContext,
  projectionVersionId = context === draftReadyRoomStoryContext
    ? draftReadyProjectionVersionId
    : "projection:room-story-blocked",
) {
  return new Response(JSON.stringify({ projectionVersionId, context }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function unauthenticatedRoomStoryContextResponse() {
  return new Response(JSON.stringify({
    code: "authentication_required",
    recovery: "restore_session",
  }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function modelProfileSettingsResponse() {
  return new Response(JSON.stringify({
    catalogVersion: "v1",
    profiles: [
      {
        id: "deepseek",
        label: "DeepSeek",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
      {
        id: "gpt",
        label: "GPT",
        provider: null,
        model: null,
        purposes: ["conversation", "analysis"],
        status: "not_configured",
        streaming: true,
      },
      {
        id: "gemini",
        label: "Gemini",
        provider: null,
        model: null,
        purposes: ["conversation", "analysis"],
        status: "not_configured",
        streaming: true,
      },
      {
        id: "grok",
        label: "Grok",
        provider: null,
        model: null,
        purposes: ["conversation", "analysis"],
        status: "not_configured",
        streaming: true,
      },
    ],
    preferences: {
      conversation: {
        purpose: "conversation",
        profileId: "deepseek",
        revision: 1,
        source: "stored",
        available: true,
      },
      analysis: {
        purpose: "analysis",
        profileId: "deepseek",
        revision: 1,
        source: "stored",
        available: true,
      },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function deepSeekDraftReadyRoomStoryContextResponse() {
  return new Response(JSON.stringify({
    projectionVersionId: draftReadyProjectionVersionId,
    context: {
      ...draftReadyRoomStoryContext,
      creativeJob: {
        ...draftReadyRoomStoryContext.creativeJob,
        route: {
          provider: "deepseek",
          model: "deepseek-v4-creative",
          fallbackApplied: false,
        },
      },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubActiveGateway(
  roomRequest: (input?: RequestInfo | URL, init?: RequestInit) => Promise<Response> = async () => {
    throw new Error("provider offline in local component tests");
  },
  storyContextResponse: () => Response = unauthenticatedRoomStoryContextResponse,
  experienceProjection: ExperienceProjection = availableProjection,
) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/vnext/experience")) return projectionResponse(experienceProjection);
    if (url.endsWith("/vnext/model-profiles")) {
      return new Response(JSON.stringify({ code: "provider_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/vnext/room/context")) return storyContextResponse();
    return roomRequest(input, init);
  }));
}

async function waitForActiveGateway() {
  await waitFor(() => {
    expect(screen.getByTestId("system-model-status").getAttribute("data-gateway-state")).toBe("active");
  });
}

function PresentationalProbe({ model, onClose, onSendMessage }: RoomUiPresentationalSurfaceProps) {
  return (
    <section
      data-testid="room-presentational-surface"
      data-chat-phase={model.chat.streamState.phase}
      data-life-source={model.life.mood?.source ?? "none"}
      data-progress-source={model.progress.source}
      data-draft-content-id={model.draftReady?.contentId ?? "none"}
      data-projection-version-id={model.task.projection?.versionId ?? "none"}
      data-conversation-model={model.modelRuntime?.conversation?.model ?? "none"}
      data-conversation-profile={model.modelRuntime?.conversation?.profileId ?? "none"}
      data-creative-job-model={model.modelRuntime?.creativeJob?.model ?? "none"}
      data-creative-job-provider={model.modelRuntime?.creativeJob?.provider ?? "none"}
    >
      <span data-testid="room-presentational-message-count">{model.chat.messages.length}</span>
      <button type="button" onClick={onClose}>probe-close</button>
      <button type="button" onClick={() => onSendMessage("测试已核验模型")}>probe-send</button>
    </section>
  );
}

function ProjectionActionProbe({
  model,
  draftReader,
  onCloseDraftReader,
  onProjectionAction,
}: RoomUiPresentationalSurfaceProps) {
  const projection = model.task.projection;
  const actions = projection === null
    ? []
    : [projection.primaryAction, ...projection.secondaryActions].filter(
      (action): action is RoomUiActionView => action !== null,
    );
  return (
    <section
      data-testid="projection-action-probe"
      data-projection-version-id={projection?.versionId ?? "none"}
      data-recovery-code={model.recovery?.code ?? "none"}
    >
      {actions.map((action) => (
        <button
          type="button"
          key={`${action.code}-${action.basedOnVersionId ?? "none"}`}
          onClick={() => onProjectionAction(action)}
        >
          {`probe-action-${action.code}`}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onProjectionAction({
          code: "retry_current_task",
          label: "旧重试",
          basedOnVersionId: "task:test:stale",
        })}
      >
        probe-stale-retry
      </button>
      {draftReader !== null && (
        <aside
          data-testid="probe-draft-reader"
          data-content-id={draftReader.contentId}
          data-version-id={draftReader.versionId}
          data-draft-kind={draftReader.kind}
        >
          <article>{draftReader.body}</article>
          <button type="button" onClick={onCloseDraftReader}>probe-close-draft-reader</button>
        </aside>
      )}
    </section>
  );
}

function GatewayAccessProbe({
  model,
  gatewayReady,
  onAdmissionAcknowledge,
  onGatewayReconnect,
}: RoomUiPresentationalSurfaceProps) {
  return (
    <section
      data-testid="gateway-access-probe"
      data-recovery-code={model.recovery?.code ?? "none"}
      data-conversation-runtime={model.modelRuntime?.conversation?.source ?? "none"}
      data-creative-runtime={model.modelRuntime?.creativeJob?.source ?? "none"}
      data-gateway-ready={gatewayReady === true ? "true" : "false"}
    >
      {onAdmissionAcknowledge && (
        <button type="button" onClick={onAdmissionAcknowledge}>probe-admission-acknowledge</button>
      )}
      {onGatewayReconnect && (
        <button type="button" onClick={onGatewayReconnect}>probe-gateway-reconnect</button>
      )}
    </section>
  );
}

function VariantReviewProbe({
  model,
  variantReview,
  onOpenVariantCandidate,
  onCloseVariantPreview,
  onSelectVariantCandidate,
}: RoomUiPresentationalSurfaceProps) {
  return (
    <section
      data-testid="variant-review-probe"
      data-state={variantReview?.state ?? "none"}
      data-preview-id={variantReview?.selectedPreviewId ?? "none"}
      data-draft-id={model.draftReady?.contentId ?? "none"}
      data-recovery-code={model.recovery?.code ?? "none"}
    >
      {variantReview?.candidates.map((candidate) => (
        <button
          key={candidate.candidateId}
          type="button"
          onClick={() => onOpenVariantCandidate?.(candidate.candidateId)}
        >
          {`probe-open-${candidate.ordinal}`}
        </button>
      ))}
      {variantReview?.selectedPreviewId && (
        <>
          <button type="button" onClick={() => onSelectVariantCandidate?.(variantReview.selectedPreviewId!)}>
            probe-select
          </button>
          <button type="button" onClick={() => onCloseVariantPreview?.()}>
            probe-close-preview
          </button>
        </>
      )}
    </section>
  );
}

describe("system layer binding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("provider offline in local component tests");
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns the three choices into one stable persona snapshot", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "ABC", chosenAt: "2026-07-29T00:00:00.000Z" });

    expect(binding.origin.originStoryRef).toBe("paper-mirror:xianxia:origin-story-v1");
    expect(binding.origin.poseAssetRef).toContain("xuanzhu/v1/character-card.webp");
    expect(binding.origin.accidentBeatId).toBe("accident-02");
    expect(binding.persona.personaSnapshotId).toBe("persona:xianxia:ABC");
    expect(binding.persona.interventionStyle).toBe("observe");
    expect(binding.persona.forbiddenBehaviors).toContain("替小说家写正文");
    expect(binding.task.personaSnapshotId).toBe(binding.persona.personaSnapshotId);
  });

  it("keeps the origin manga and accident sequence on stable beat ids", () => {
    const story = createOriginStorySpec({ id: "xianxia", name: "玄烛剑尊", icon: "⚡", tag: "无敌剑尊" });

    expect(story.beats.map((beat) => beat.beatId)).toEqual([
      "memory-one",
      "memory-two",
      "memory-climax",
      "accident-01",
      "accident-02",
      "accident-03",
      "blackout",
      "awakening",
    ]);
    expect(story.beats.find((beat) => beat.beatId === "accident-02")?.panelCount).toBe(1);
    expect(story.beats.find((beat) => beat.beatId === "awakening")?.assetRef).toBe("paper-mirror:xianxia:origin-story-v1:awakening");
    expect(story.awakening.subsystemRef).toBe("evidence-boundary-audit");
    expect(story.scriptVersion).toBe("xuanzhu-origin-comic-v5");
    expect(JSON.stringify(story)).not.toContain("破鼎");
  });

  it("keeps task decisions and evidence separate from formal life execution", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "AAA", chosenAt: "2026-07-29T00:00:00.000Z" });
    const scoped = updateCreativeSupportTask(binding, {
      status: "scoped",
      deliverable: "完成一段 60—100 字的草稿，只要求让一个具体动作发生。",
    });
    const withEvidence = updateCreativeSupportTask(scoped, {
      evidence: {
        status: "submitted",
        artifactRef: "draft://chapter-01/paragraph-01",
        submittedAt: "2026-07-29T01:00:00.000Z",
        note: "已登记引用，等待验收。",
      },
    });

    expect(withEvidence.task.routeKey).toBe("study-desk-stay");
    expect(withEvidence.task.activityKey).toBe("study-writing");
    expect(withEvidence.task.evidence.status).toBe("submitted");
    expect(withEvidence.task.evidence.artifactRef).toBe("draft://chapter-01/paragraph-01");
    expect(withEvidence.memory.status).toBe("pending");
  });

  it("enforces creative support and evidence transitions without fabricating a draft", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "AAA", chosenAt: "2026-07-29T00:00:00.000Z" });

    expect(() => submitCreativeEvidence(binding, { artifactRef: "draft://too-early" }))
      .toThrow(InvalidCreativeTaskTransitionError);

    const accepted = applyCreativeSupportDecision(binding, {
      decision: "accept",
      userInstruction: "先写一个动作。",
    });
    const submitted = submitCreativeEvidence(accepted, {
      artifactRef: "draft://chapter-01/paragraph-01",
      submittedAt: "2026-07-29T01:00:00.000Z",
    });
    const needsRevision = resolveCreativeEvidence(submitted, {
      status: "needs-revision",
      note: "动作清楚了，但还需要补一处因果。",
    });
    const acceptedEvidence = resolveCreativeEvidence(needsRevision, {
      status: "accepted",
      note: "因果已经补齐，证据可以归档。",
    });

    expect(accepted.task.status).toBe("accepted");
    expect(submitted.task.evidence.status).toBe("submitted");
    expect(needsRevision.task.evidence.status).toBe("needs-revision");
    expect(acceptedEvidence.task.evidence.status).toBe("accepted");
    expect(acceptedEvidence.task.evidence.artifactRef).toBe("draft://chapter-01/paragraph-01");
  });

  it("projects a read-only system contract and records next-day memory separately", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    const withMemory = recordNextDayMemory(binding, "宿主接受了缩小后的任务，但没有把系统对白当成稿件。");
    const projection = projectSystemLayer(withMemory);

    expect(projection.schema).toBe("system-layer-projection-v1");
    expect(projection.identity.personalityCode).toBe("BCD");
    expect(projection.identity.poseAssetRef).toContain("xuanzhu/v1/character-card.webp");
    expect(projection.persona.personaSnapshotId).toBe("persona:xianxia:BCD");
    expect(projection.task.routeKey).toBe("study-desk-stay");
    expect(projection.task.activityKey).toBe("study-writing");
    expect(projection.task.evidence.artifactRef).toBeNull();
    expect(projection.memory.status).toBe("recorded");
    expect(projection.memory.entries).toHaveLength(1);
  });

  it("persists a bound snapshot and restores it without changing its id", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    saveSystemBinding(binding);

    const restored = loadSystemBinding();
    expect(restored?.origin).toEqual(binding.origin);
    expect(restored?.persona.origin).toEqual(binding.origin);
    expect(restored?.origin.personalityCode).toBe("BCD");
    expect(restored?.persona.personaSnapshotId).toBe("persona:xianxia:BCD");
    expect(restored?.persona.subsystem.subsystemId).toBe("evidence-boundary-audit");
    expect(restored?.task.personaSnapshotId).toBe(restored?.persona.personaSnapshotId);
    expect(restored?.memory.entries).toEqual([]);
  });

  it("rejects malformed, incomplete, and unknown-version local snapshots", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    const malformedSnapshots = [
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        delete snapshot.memory;
        return snapshot;
      })(),
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        delete snapshot.persona.subsystem;
        return snapshot;
      })(),
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        delete snapshot.task.evidence;
        return snapshot;
      })(),
      { ...JSON.parse(JSON.stringify(binding)), version: 2 },
    ];

    for (const snapshot of malformedSnapshots) {
      localStorage.setItem(SYSTEM_BINDING_STORAGE_KEY, JSON.stringify(snapshot));
      expect(loadSystemBinding()).toBeNull();
    }

    localStorage.setItem(SYSTEM_BINDING_STORAGE_KEY, "{not-json");
    expect(loadSystemBinding()).toBeNull();
  });

  it("rejects identity, persona, and task linkage mismatches", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    const mismatchedSnapshots = [
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        snapshot.persona.origin.personalityCode = "AAA";
        return snapshot;
      })(),
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        snapshot.persona.personaSnapshotId = "persona:xianxia:AAA";
        return snapshot;
      })(),
      (() => {
        const snapshot = JSON.parse(JSON.stringify(binding));
        snapshot.task.personaSnapshotId = "persona:xianxia:AAA";
        return snapshot;
      })(),
    ];

    for (const snapshot of mismatchedSnapshots) {
      localStorage.setItem(SYSTEM_BINDING_STORAGE_KEY, JSON.stringify(snapshot));
      expect(loadSystemBinding()).toBeNull();
    }
  });

  it("fails closed when code attempts to persist an invalid snapshot", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    const invalid = JSON.parse(JSON.stringify(binding));
    invalid.task.personaSnapshotId = "persona:xianxia:AAA";

    expect(isValidSystemBinding(invalid)).toBe(false);
    expect(() => saveSystemBinding(invalid)).toThrow(InvalidSystemBindingError);
    expect(localStorage.getItem(SYSTEM_BINDING_STORAGE_KEY)).toBeNull();
  });

  it("persists a bounded room conversation without changing the task authority", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    updateSystemConversation(binding, [
      { id: "system-1", role: "system", text: "今天继续写吧", createdAt: "2026-07-29T00:01:00.000Z" },
      { id: "novelist-1", role: "novelist", text: "好，我接下了。", createdAt: "2026-07-29T00:01:00.000Z" },
    ]);

    const restored = loadSystemBinding();
    expect(restored?.conversation?.map((message) => message.role)).toEqual(["system", "novelist"]);
    expect(restored?.task.status).toBe("offered");
  });

  it("persists a lightweight novelist relationship independently of the system persona", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "BCD", chosenAt: "2026-07-29T00:00:00.000Z" });
    const next = updateNovelistRelationship(binding, 2);

    expect(next.novelistRelationship).toEqual({ trust: 24, turns: 1 });
    expect(next.persona.personaSnapshotId).toBe(binding.persona.personaSnapshotId);
    expect(next.persona.voice).toEqual(binding.persona.voice);
  });

  it("keeps dialogue tied to the same persona while changing only task state", () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "CBA", chosenAt: "2026-07-29T00:00:00.000Z" });
    const first = getSystemDialogue(binding.persona, binding.task, {
      sceneLabel: "书房",
      activityLabel: "study-writing",
      focus: 70,
      fatigue: 20,
    });
    const deferred = updateCreativeSupportTask(binding, { status: "deferred" });
    const second = getSystemDialogue(deferred.persona, deferred.task, {
      sceneLabel: "书房",
      activityLabel: "study-writing",
      focus: 70,
      fatigue: 20,
    });

    expect(first).toContain("玄烛剑尊");
    expect(second).toContain("暂不追着你跑");
    expect(deferred.persona.personaSnapshotId).toBe(binding.persona.personaSnapshotId);
  });
});

describe("SystemLayerPanel", () => {
  it("replays a room-open intent captured before hydration", async () => {
    const onRequestChannel = vi.fn();
    document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY] = "true";
    try {
      render(
        <SystemLayerPanel
          activeChannel={null}
          onRequestChannel={onRequestChannel}
          observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
        />,
      );

      await waitFor(() => expect(onRequestChannel).toHaveBeenCalledWith("novelist"));
      expect(document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY]).toBeUndefined();
      expect(document.documentElement.dataset[EARLY_ROOM_HYDRATED_DATASET_KEY]).toBe("true");
    } finally {
      delete document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY];
      delete document.documentElement.dataset[EARLY_ROOM_HYDRATED_DATASET_KEY];
    }
  });

  it("passes formal room state and callbacks to an optional presentational surface while keeping the old UI fallback", async () => {
    const onRequestChannel = vi.fn();
    stubActiveGateway(async () => {
      throw new Error("chat is not part of this insertion-point test");
    }, () => roomStoryContextResponse(draftReadyRoomStoryContext));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={onRequestChannel}
        presentationalSurface={PresentationalProbe}
        observation={{ sceneLabel: "涔︽埧", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const surface = await screen.findByTestId("room-presentational-surface");
    await waitFor(() => {
      expect(surface.getAttribute("data-progress-source")).toBe("persisted_story_truth");
      expect(surface.getAttribute("data-draft-content-id")).toBe(draftReadyContentId);
      expect(surface.getAttribute("data-creative-job-model")).toBe("grok-4.5");
      expect(surface.getAttribute("data-creative-job-provider")).toBe("company-router");
      expect(surface.getAttribute("data-projection-version-id")).toBe(availableProjection.versionId);
    });
    expect(surface.getAttribute("data-life-source")).toBe("life_runtime");
    expect(screen.queryByTestId("room-v6-frontstage")).toBeNull();
    expect(screen.queryByTestId("system-dialogue")).toBeNull();
    expect(screen.getByTestId("room-presentational-message-count").textContent).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "probe-close" }));
    expect(onRequestChannel).toHaveBeenCalledWith(null);
  });

  it("keeps both model roles unverified until their independent formal proofs exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) return projectionResponse();
      if (url.endsWith("/vnext/model-profiles")) return modelProfileSettingsResponse();
      if (url.endsWith("/vnext/room/context")) return roomStoryContextResponse();
      if (url.endsWith("/vnext/room/life-suggestions")) {
        return new Response(JSON.stringify({ code: "temporarily_unavailable", recovery: "return_later" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const toggle = await screen.findByTestId("system-model-picker-toggle");
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toggle);

    expect((await screen.findByTestId("system-conversation-runtime-contract")).textContent)
      .toBe("聊天模型待发送后核验");
    expect(screen.getByTestId("system-creative-job-runtime-contract").textContent)
      .toBe("正式写作模型待服务器确认");
    expect(screen.getByTestId("model-role-contract").textContent).not.toContain("Grok 4.5");
  });

  it("shows conversation and creative model identities only from their separate verified sources", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) return projectionResponse();
      if (url.endsWith("/vnext/model-profiles")) return modelProfileSettingsResponse();
      if (url.endsWith("/vnext/room/context")) return deepSeekDraftReadyRoomStoryContextResponse();
      if (url.endsWith("/vnext/room/life-suggestions")) {
        return new Response(JSON.stringify({ code: "temporarily_unavailable", recovery: "return_later" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/vnext/room/messages/stream")) {
        return new Response(
          `event: route\ndata: ${JSON.stringify({ type: "route", requestId: "room-role-proof", intent: "conversation", handling: "conversation", projection: availableProjection })}\n\n`
          + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"room-role-proof\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
          + "event: chunk\ndata: {\"type\":\"chunk\",\"requestId\":\"room-role-proof\",\"text\":\"模型职责已分开核验。\"}\n\n"
          + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"room-role-proof\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n",
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`unexpected request: ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "核对两条模型职责" } });
    fireEvent.click(screen.getByTestId("system-message-send"));
    await waitFor(() => {
      expect(screen.getByTestId("system-model-status").getAttribute("data-model")).toBe("deepseek-v4-flash");
    });

    const toggle = screen.getByTestId("system-model-picker-toggle");
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toggle);

    expect((await screen.findByTestId("system-conversation-runtime-contract")).textContent)
      .toBe("deepseek / deepseek-v4-flash · 对话证明已核验");
    expect(screen.getByTestId("system-creative-job-runtime-contract").textContent)
      .toBe("deepseek / deepseek-v4-creative · 服务器作品真值");
  });

  it.each([
    [availableProjection, "probe-action-submit_intent", "说说想看的故事"],
    [correctionProjection, "probe-action-correct_understanding", "补充说明"],
  ] as const)("keeps %s projection actions as editable composer fills", async (experienceProjection, buttonName, expectedDraft) => {
    const onRequestChannel = vi.fn();
    stubActiveGateway(
      async () => {
        throw new Error("projection fill must not execute a server action");
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      experienceProjection,
    );

    const view = render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={onRequestChannel}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await screen.findByRole("button", { name: buttonName });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    view.rerender(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={onRequestChannel}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );
    expect((await screen.findByLabelText("对小说家说点什么") as HTMLTextAreaElement).value).toBe(expectedDraft);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/messages"))).toBe(false);
  });

  it("fails closed when a presentational surface replays a stale versioned action", async () => {
    stubActiveGateway(
      async () => {
        throw new Error("stale projection action must not reach the server");
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      retryProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const staleButton = await screen.findByRole("button", { name: "probe-stale-retry" });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fireEvent.click(staleButton);

    await waitFor(() => {
      expect(screen.getByTestId("projection-action-probe").getAttribute("data-recovery-code")).toBe("conflict");
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/messages"))).toBe(false);
  });

  it("executes retry_current_task only with the current basedOnVersionId", async () => {
    stubActiveGateway(
      async (input, init) => {
        if (String(input).endsWith("/vnext/experience/messages")) {
          return new Response(JSON.stringify(writingProjection), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected request: ${String(input)} ${init?.method ?? "GET"}`);
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      retryProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-action-retry_current_task" }));
    await waitFor(() => {
      expect(screen.getByTestId("projection-action-probe").getAttribute("data-projection-version-id")).toBe(writingProjection.versionId);
    });

    const actionCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith("/vnext/experience/messages"));
    expect(actionCall).toBeDefined();
    expect(JSON.parse(String(actionCall?.[1]?.body))).toMatchObject({
      action: "retry_current_task",
      basedOnVersionId: "task:test:retry-v2",
    });
  });

  it("routes open_draft to the read-only draft endpoint", async () => {
    stubActiveGateway(
      async (input) => {
        if (String(input).endsWith("/vnext/experience/draft")) {
          return new Response(JSON.stringify({
            contentId: draftReadyContentId,
            versionId: `${draftReadyContentId}:1`,
            kind: "opening",
            body: "雨声从窗沿落下来。",
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected request: ${String(input)}`);
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      draftProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-action-open_draft" }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/draft"))).toBe(true);
    });
    const reader = await screen.findByTestId("probe-draft-reader");
    expect(reader.getAttribute("data-content-id")).toBe(draftReadyContentId);
    expect(reader.getAttribute("data-version-id")).toBe(`${draftReadyContentId}:1`);
    expect(reader.getAttribute("data-draft-kind")).toBe("opening");
    expect(reader.querySelector("article")?.textContent).toBe("雨声从窗沿落下来。");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/messages"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "probe-close-draft-reader" }));
    expect(screen.queryByTestId("probe-draft-reader")).toBeNull();
  });

  it("does not expose a stale draft response to the presentational surface", async () => {
    stubActiveGateway(
      async (input) => {
        if (String(input).endsWith("/vnext/experience/draft")) {
          return new Response(JSON.stringify({
            contentId: draftReadyContentId,
            versionId: `${draftReadyContentId}:0`,
            kind: "opening",
            body: "这是已经过期的版本。",
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected request: ${String(input)}`);
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      draftProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-action-open_draft" }));
    await waitFor(() => {
      expect(screen.getByTestId("projection-action-probe").getAttribute("data-recovery-code")).toBe("conflict");
    });
    expect(screen.queryByTestId("probe-draft-reader")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/messages"))).toBe(false);
  });

  it("keeps the draft reader closed when the read endpoint fails", async () => {
    stubActiveGateway(
      async (input) => {
        if (String(input).endsWith("/vnext/experience/draft")) {
          return new Response(JSON.stringify({
            code: "temporarily_unavailable",
            recovery: "return_later",
          }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected request: ${String(input)}`);
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      draftProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-action-open_draft" }));
    await waitFor(() => {
      expect(screen.getByTestId("projection-action-probe").getAttribute("data-recovery-code")).toBe("temporarily_unavailable");
    });
    expect(screen.queryByTestId("probe-draft-reader")).toBeNull();
  });

  it("keeps return_later local by pausing progress checks and closing the room", async () => {
    const onRequestChannel = vi.fn();
    stubActiveGateway(
      async () => {
        throw new Error("return_later must not execute a server action");
      },
      () => roomStoryContextResponse(draftReadyRoomStoryContext),
      writingProjection,
    );
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={onRequestChannel}
        presentationalSurface={ProjectionActionProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const fetchMock = vi.mocked(fetch);
    fireEvent.click(await screen.findByRole("button", { name: "probe-action-return_later" }));
    expect(onRequestChannel).toHaveBeenCalledWith(null);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/vnext/experience/messages"))).toBe(false);
  });

  it("passes only a completed chat attestation to the presentational model", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async () => new Response(
      `event: route\ndata: ${JSON.stringify({
        type: "route",
        requestId: "room-model-runtime",
        intent: "conversation",
        handling: "conversation",
        projection: availableProjection,
      })}\n\n`
      + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"room-model-runtime\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: chunk\ndata: {\"type\":\"chunk\",\"text\":\"已收到。\"}\n\n"
      + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"room-model-runtime\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={PresentationalProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const surface = await screen.findByTestId("room-presentational-surface");
    await waitFor(() => {
      expect(surface.getAttribute("data-projection-version-id")).toBe(availableProjection.versionId);
    });
    expect(surface.getAttribute("data-conversation-model")).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "probe-send" }));
    await waitFor(() => {
      expect(surface.getAttribute("data-conversation-model")).toBe("deepseek-v4-flash");
      expect(surface.getAttribute("data-conversation-profile")).toBe("deepseek");
    });
  });

  it("layers the v6 room bookmark and novelist status sheet without baking live state into artwork", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }} />);

    const frontstage = screen.getByTestId("room-v6-frontstage");
    const bookmark = screen.getByTestId("room-title-bookmark");
    const status = screen.getByTestId("novelist-status-card");
    const paper = screen.getByTestId("novelist-conversation-workspace").querySelector("[data-art-layer=central-chat-paper-v6-alpha]");
    const inputBar = screen.getByTestId("system-message-input").parentElement;

    expect(bookmark.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ui/system-layer-materials-v6/room-title-bookmark-v6-alpha.webp",
    );
    expect(frontstage.textContent).toContain("小说家频道");
    expect(frontstage.textContent).toContain("聊天主轴 · 任务作为附件");
    expect(status.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ui/system-layer-materials-v6/novelist-status-v6-alpha.webp",
    );
    expect(status.getAttribute("data-avatar-state")).toBe("writing");
    expect(status.textContent).toContain("正在写");
    expect(status.textContent).toContain("书房");
    expect(status.textContent).toContain("72%");
    expect(status.textContent).toContain("还没完全服你");
    expect(paper).toBeTruthy();
    expect(inputBar?.getAttribute("data-art-layer")).toBe("writing-input-bar-v6-alpha");
    expect(screen.getByRole("button", { name: "收起小说家房间" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起小说家房间" }).textContent).toContain("×");
  });

  it("keeps the writing portrait as the default avatar state", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }} />);

    const avatar = screen.getByLabelText("小说家：写作中");
    expect(avatar.getAttribute("data-avatar-state")).toBe("writing");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ecology/characters/novelist/avatars/novelist-avatar-writing-v1-normalized.webp",
    );
    expect(avatar.querySelector("span")?.textContent).toBe("✎");
  });

  it("carries the live non-writing activity into the chat identity without faking a new portrait asset", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "露台绿植角", activityLabel: "外出中", focus: 58, fatigue: 32, inspiration: 54, emotionalLoad: 18 }} />);

    const avatar = screen.getByLabelText("小说家：外出中");
    expect(avatar.getAttribute("data-avatar-state")).toBe("away");
    expect(avatar.querySelector("span")?.textContent).toBe("↗");
    expect(screen.getByTestId("system-layer-panel").textContent).toContain("正在外出");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ecology/characters/novelist/avatars/novelist-avatar-writing-v1-normalized.webp",
    );
  });

  it("uses the blocked portrait when the novelist is emotionally overloaded", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 40, fatigue: 82, inspiration: 38, emotionalLoad: 82 }} />);

    const avatar = screen.getByLabelText("小说家：卡住了");
    expect(avatar.getAttribute("data-avatar-state")).toBe("blocked");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ecology/characters/novelist/avatars/novelist-avatar-blocked-v1-normalized.webp",
    );
  });

  it("uses the tired portrait for fatigue without emotional overload", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 58, fatigue: 82, inspiration: 38, emotionalLoad: 20 }} />);

    const avatar = screen.getByLabelText("小说家：有点疲惫");
    expect(avatar.getAttribute("data-avatar-state")).toBe("tired");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ecology/characters/novelist/avatars/novelist-avatar-tired-v1-normalized.webp",
    );
  });

  it("uses the relieved portrait when inspiration is high and fatigue is low", () => {
    render(<SystemLayerPanel observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 88, fatigue: 18, inspiration: 82, emotionalLoad: 12 }} />);

    const avatar = screen.getByLabelText("小说家：松了一口气");
    expect(avatar.getAttribute("data-avatar-state")).toBe("relieved");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/ecology/characters/novelist/avatars/novelist-avatar-relieved-v1-normalized.webp",
    );
  });

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "true");
    stubActiveGateway();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the same bound persona snapshot when the formal room mounts", async () => {
    const binding = createSystemBinding({ identity: xianxia, personalityCode: "DCA", chosenAt: "2026-07-30T00:00:00.000Z" });
    saveSystemBinding(binding);

    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("persona-snapshot-id").textContent).toBe("persona:xianxia:DCA"));
    await waitForActiveGateway();
    expect(screen.getByTestId("system-persona-summary").textContent).toContain("[DCA]");
    expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("offered");
  });

  it("keeps novelist dialogue primary and exposes intent suggestions beside it", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    expect(screen.getByTestId("system-layer-panel")).toBeTruthy();
    expect(screen.getByTestId("system-task-suggestion")).toBeTruthy();
    expect(screen.getByTestId("system-task-suggestion").textContent).toContain("建议怎么说");
    expect(screen.getByTestId("system-chat-identity").textContent).toContain("主系统");
    expect(screen.getByTestId("system-intent-suggestion").textContent).toContain("可编辑后发送");
    expect(screen.getByTestId("system-task-suggestion").querySelectorAll('[data-hit-area="intent-card"]')).toHaveLength(4);
    expect(screen.getByTestId("system-dialogue")).toBeTruthy();
    expect(screen.getByLabelText("对小说家说点什么")).toBeTruthy();
    expect(screen.getByTestId("system-message-send")).toBeTruthy();
    expect(screen.getByTestId("system-dialogue").textContent).toContain("先别站我背后数句号");
    expect(screen.getByTestId("system-dialogue").getAttribute("data-event-type")).toBe("system_dialogue");
    expect(screen.getByTestId("subsystem-notice").getAttribute("data-event-type")).toBe("subsystem_notice");
    expect(screen.getByTestId("system-task")).toBeTruthy();
    expect(screen.getByTestId("system-evidence")).toBeTruthy();
  });

  it("puts rest first from formal life state when fatigue is urgent", async () => {
    render(
      <SystemLayerPanel
        observation={{
          sceneLabel: "书房",
          activityLabel: "书房写作",
          focus: 78,
          fatigue: 92,
          inspiration: 80,
          emotionalLoad: 20,
          lifeStateVersion: 17,
        }}
      />,
    );

    await waitForActiveGateway();
    const rail = screen.getByTestId("system-task-suggestion");
    const cards = rail.querySelectorAll<HTMLButtonElement>('[data-hit-area="intent-card"]');

    expect(rail.getAttribute("data-life-source")).toBe("life_runtime");
    expect(rail.getAttribute("data-life-mood")).toBe("exhausted");
    expect(rail.getAttribute("data-provenance")).toBe("rules_only");
    expect(cards[0]?.getAttribute("data-intent-key")).toBe("rest");
    expect(cards[0]?.textContent).toContain("疲劳已经很高");

    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.click(cards[0]!);
    expect(input.value).toContain("休息");
    expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("offered");
  });

  it("puts care first when emotional load is high", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "发呆", focus: 62, fatigue: 32, inspiration: 48, emotionalLoad: 84, lifeStateVersion: 18 }}
      />,
    );

    await waitForActiveGateway();
    const firstCard = screen.getByTestId("system-task-suggestion")
      .querySelector<HTMLButtonElement>('[data-hit-area="intent-card"]');
    expect(firstCard?.getAttribute("data-intent-key")).toBe("care");
    expect(firstCard?.textContent).toContain("情绪负荷偏高");
  });

  it("puts a bounded writing nudge first when focus and inspiration are ready", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "书房写作", focus: 88, fatigue: 14, inspiration: 86, emotionalLoad: 10, lifeStateVersion: 19 }}
      />,
    );

    await waitForActiveGateway();
    const firstCard = screen.getByTestId("system-task-suggestion")
      .querySelector<HTMLButtonElement>('[data-hit-area="intent-card"]');
    expect(firstCard?.getAttribute("data-intent-key")).toBe("nudge");
    expect(firstCard?.textContent).toContain("状态接得上");
  });

  it("uses the selected reincarnation persona when filling a polished intent", async () => {
    saveSystemBinding(createSystemBinding({ identity: xianxia, personalityCode: "DDD", chosenAt: "2026-07-30T00:00:00.000Z" }));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    await waitFor(() => expect(screen.getByTestId("system-task-suggestion").getAttribute("data-personality-code")).toBe("DDD"));

    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId("system-task-accept"));

    expect(input.value).toContain("别一上来就想封神");
    expect(input.value).toContain("道友");
    expect(input.value).toContain("完成即结算");
    expect(screen.getByRole("status").textContent).toContain("天道奖赏");
  });

  it("opens the enlarged task attachment without turning it into a second chat stream", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    expect(screen.queryByTestId("system-task-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("system-task"));

    const taskPanel = screen.getByTestId("system-task-panel");
    expect(taskPanel.textContent).toContain("为什么现在");
    expect(taskPanel.textContent).toContain("完成条件");
    expect(taskPanel.textContent).toContain("展开验收与边界");
    expect(screen.getByTestId("system-task-panel-meta").textContent).toContain("等你一句话");
    expect(screen.getByTestId("system-task-panel-meta").textContent).toContain("还没交稿");
    expect(taskPanel.textContent).toContain("只装填草稿，不自动发布或替他接受");
    expect(screen.getByRole("button", { name: "装填至小说家对话" })).toBeTruthy();
    expect(screen.getByTestId("system-task").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "装填至小说家对话" }));
    expect(screen.queryByTestId("system-task-panel")).toBeNull();
    expect((screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement).value).toContain("子系统给了一条建议");
  });

  it("loads an editable intent draft and keeps raw intent separate from the polished host message", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;

    fireEvent.click(screen.getByTestId("system-task-accept"));
    expect(input.value).toContain("继续写吧");
    expect(screen.getByTestId("system-intent-draft").textContent).toContain("催稿一下");
    expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("offered");

    fireEvent.click(screen.getByRole("button", { name: "原文直发" }));
    expect(input.value).toContain("催稿：");
    fireEvent.click(screen.getByRole("button", { name: "人格润色" }));
    expect(input.value).toContain("继续写吧");

    fireEvent.change(input, { target: { value: "继续写吧，先只写一个动作，写完给我看。" } });
    fireEvent.click(screen.getByTestId("system-message-send"));
    await waitFor(() => expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("accepted"));
  });

  it("accepts or shrinks a task and refuses fabricated evidence", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId("system-task-scope"));
    expect(input.value).toContain("先不催");
    fireEvent.change(input, { target: { value: "今天少写一点，先只完成一小段。" } });
    fireEvent.click(screen.getByTestId("system-message-send"));
    await waitFor(() => expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("scoped"));
    await waitFor(() => expect(screen.getByTestId("system-dialogue").textContent).not.toContain("···"));
    fireEvent.click(screen.getByTestId("system-evidence-submit"));
    expect(screen.getByRole("status").textContent).toContain("内部记录");

    fireEvent.change(screen.getByLabelText("真实稿件引用"), { target: { value: "draft://chapter-01/paragraph-01" } });
    fireEvent.click(screen.getByTestId("system-evidence-submit"));
    expect(screen.getByTestId("system-evidence").textContent).toContain("等待验收");
  });

  it("turns plain-language room messages into real task choices and revision state", async () => {
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "继续写吧，写完给我看" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => expect(screen.getByTestId("system-task").getAttribute("data-task-status")).toBe("accepted"));
    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("继续写吧，写完给我看");
      expect(screen.getByTestId("system-dialogue").textContent).toContain("写得不好你可以退");
    });

    fireEvent.click(screen.getByTestId("system-task-reject"));
    expect(input.value).toContain("卡点");
    fireEvent.change(input, { target: { value: "这版不行，打回重写。" } });
    fireEvent.click(screen.getByTestId("system-message-send"));
    await waitFor(() => expect(screen.getByTestId("system-evidence").getAttribute("data-evidence-status")).toBe("needs-revision"));
    await waitFor(() => expect(screen.getByTestId("system-dialogue").textContent).toContain("先重理，不硬抬杠"));
  });

  it("keeps subsystem directives primary and reveals negotiation chat only on request", async () => {
    render(
      <SystemLayerPanel
        activeChannel="subsystem"
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    await waitFor(() => expect(screen.getByTestId("system-layer-panel").getAttribute("data-chat-mode")).toBe("subsystem"));

    expect(screen.getByTestId("subsystem-directive-workspace")).toBeTruthy();
    expect(screen.queryByTestId("system-dialogue")).toBeNull();
    expect(screen.queryByLabelText("对子系统说点什么")).toBeNull();

    const chatToggle = screen.getByTestId("subsystem-chat-toggle");
    expect(chatToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chatToggle);

    expect(chatToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("system-dialogue")).toBeTruthy();
    expect(screen.getByLabelText("对子系统说点什么")).toBeTruthy();
  });

  it("keeps the original message and offers retry when gateway bootstrap fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("gateway bootstrap unavailable");
    }));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitFor(() => expect(screen.getByText("房间暂时没连上")).toBeTruthy());

    const input = screen.getByLabelText("对小说家说点什么") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "这句原话不能被断线吞掉" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const dialogue = screen.getByTestId("system-dialogue");
      const userMessages = [...dialogue.querySelectorAll<HTMLElement>('[data-message-role="system"]')];
      expect(userMessages.some((message) => message.textContent?.includes("这句原话不能被断线吞掉"))).toBe(true);
      expect(input.value).toBe("");
      expect(screen.getByTestId("system-gateway-retry")).toBeTruthy();
    });

    const assistantMessages = [
      ...screen.getByTestId("system-dialogue").querySelectorAll<HTMLElement>('[data-message-role="novelist"]'),
    ];
    expect(assistantMessages.every((message) => /未生成回复|没有伪造回复|连接尚未建立/.test(message.textContent ?? ""))).toBe(true);
  });

  it("exposes the validated admission acknowledgement to v6 and removes it after session activation", async () => {
    let experienceReads = 0;
    let admissionPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/vnext/experience") && method === "GET") {
        experienceReads += 1;
        if (experienceReads === 1) {
          return new Response(JSON.stringify({ code: "authentication_required", recovery: "restore_session" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        return projectionResponse();
      }
      if (url.endsWith("/vnext/sessions/admission-manifest") && method === "GET") {
        return new Response(JSON.stringify(admissionManifest), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/vnext/sessions/guest") && method === "POST") {
        admissionPosts += 1;
        return new Response(JSON.stringify({ status: "active" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/vnext/room/context")) return roomStoryContextResponse();
      if (url.endsWith("/vnext/model-profiles")) {
        return new Response(JSON.stringify({ code: "provider_unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={GatewayAccessProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const acknowledge = await screen.findByRole("button", { name: "probe-admission-acknowledge" });
    expect(screen.getByTestId("gateway-access-probe").getAttribute("data-gateway-ready")).toBe("false");
    expect(screen.queryByRole("button", { name: "probe-gateway-reconnect" })).toBeNull();
    fireEvent.click(acknowledge);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "probe-admission-acknowledge" })).toBeNull();
      expect(screen.queryByRole("button", { name: "probe-gateway-reconnect" })).toBeNull();
      expect(screen.getByTestId("gateway-access-probe").getAttribute("data-gateway-ready")).toBe("true");
    });
    expect(experienceReads).toBe(2);
    expect(admissionPosts).toBe(1);
  });

  it("keeps admission fail closed when the server rejects a stale acknowledgement", async () => {
    let admissionPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/vnext/experience") && method === "GET") {
        return new Response(JSON.stringify({ code: "authentication_required", recovery: "restore_session" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/vnext/sessions/admission-manifest") && method === "GET") {
        return new Response(JSON.stringify(admissionManifest), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/vnext/sessions/guest") && method === "POST") {
        admissionPosts += 1;
        return new Response(JSON.stringify({ code: "conflict", recovery: "refresh_projection" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={GatewayAccessProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-admission-acknowledge" }));
    await waitFor(() => {
      const probe = screen.getByTestId("gateway-access-probe");
      expect(screen.getByRole("button", { name: "probe-admission-acknowledge" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "probe-gateway-reconnect" })).toBeNull();
      expect(probe.getAttribute("data-conversation-runtime")).toBe("none");
      expect(probe.getAttribute("data-creative-runtime")).toBe("none");
    });
    expect(admissionPosts).toBe(1);
  });

  it("exposes the formal gateway reconnect only after bootstrap failure and clears recovery after success", async () => {
    let projectionReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) {
        projectionReads += 1;
        if (projectionReads === 1) {
          return new Response(JSON.stringify({ code: "temporarily_unavailable", recovery: "return_later" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        return projectionResponse();
      }
      if (url.endsWith("/vnext/room/context")) return roomStoryContextResponse();
      if (url.endsWith("/vnext/model-profiles")) {
        return new Response(JSON.stringify({ code: "provider_unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={GatewayAccessProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    const reconnect = await screen.findByRole("button", { name: "probe-gateway-reconnect" });
    expect(screen.getByTestId("gateway-access-probe").getAttribute("data-recovery-code")).toBe("provider_unavailable");
    fireEvent.click(reconnect);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "probe-gateway-reconnect" })).toBeNull();
      expect(screen.getByTestId("gateway-access-probe").getAttribute("data-recovery-code")).toBe("none");
    });
    expect(projectionReads).toBe(2);
  });

  it("keeps recovery fail closed when the formal gateway reconnect also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) {
        return new Response(JSON.stringify({ code: "temporarily_unavailable", recovery: "return_later" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }));

    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={GatewayAccessProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-gateway-reconnect" }));
    await waitFor(() => {
      const probe = screen.getByTestId("gateway-access-probe");
      expect(probe.getAttribute("data-recovery-code")).toBe("provider_unavailable");
      expect(screen.getByRole("button", { name: "probe-gateway-reconnect" })).toBeTruthy();
      expect(probe.getAttribute("data-conversation-runtime")).toBe("none");
      expect(probe.getAttribute("data-creative-runtime")).toBe("none");
    });
  });

  it("renders a real SSE response as online streaming instead of a local rule reply", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async () => new Response(
      `event: route\ndata: ${JSON.stringify({ type: "route", requestId: "room-request-1", intent: "conversation", handling: "conversation", projection: availableProjection })}\n\n`
      + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"room-request-1\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: chunk\ndata: {\"type\":\"chunk\",\"text\":\"这句来自流式接口。\"}\n\n"
      + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"room-request-1\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: "你现在接到我了吗？" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("这句来自流式接口。");
      expect(screen.getByTestId("system-layer-panel").textContent).toContain("在线流式");
    });
  });

  it("bridges a submitted creative intent into the formal vnext workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    const listeningProjection = {
      versionId: "projection:test:listening",
      status: "listening",
      headline: "先把想写的事说清楚",
      body: "正式创作入口正在确认你的意思。",
      understanding: {
        versionId: "understanding:test",
        statement: "小说家需要先确认一个具体场景。",
        clarificationQuestion: "你想让哪一个动作先发生？",
      },
      primaryAction: { code: "correct_understanding", label: "补充说明", basedOnVersionId: "projection:test:listening" },
      secondaryActions: [],
    } as const;
    stubActiveGateway(async () => new Response(
      `event: route\ndata: ${JSON.stringify({ type: "route", requestId: "creative-room-request", intent: "creative_intent", handling: "submitted", projection: listeningProjection })}\n\n`
      + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"creative-room-request\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: chunk\ndata: {\"type\":\"chunk\",\"requestId\":\"creative-room-request\",\"text\":\"已接单，后台正式写作中。\"}\n\n"
      + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"creative-room-request\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: room_complete\ndata: {\"type\":\"room_complete\",\"requestId\":\"creative-room-request\",\"intent\":\"creative_intent\",\"handling\":\"submitted\"}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: "请把雨夜书房写成一个正式片段" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => {
      const handoff = screen.getByTestId("experience-handoff");
      expect(handoff.getAttribute("data-experience-status")).toBe("listening");
      expect(handoff.getAttribute("data-art-layer")).toBe("creative-progress-v6-alpha");
      expect(handoff.textContent).toContain("已提交");
      expect(handoff.textContent).toContain("理解中");
      expect(handoff.textContent).toContain("聊天回复不会被当作正文");
      expect(screen.getByRole("link", { name: "进入正式创作台" }).getAttribute("href")).toBe("/vnext");
    });
    expect(screen.getByTestId("system-dialogue").textContent).toContain("已接单，后台正式写作中。");
  });

  it.each(["别开始写了", "我再想想"])("keeps %s as conversation without submitting creative work", async (text) => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async () => new Response(
      `event: route\ndata: ${JSON.stringify({ type: "route", requestId: "conversation-request", intent: "conversation", handling: "conversation", projection: availableProjection })}\n\n`
      + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"conversation-request\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: chunk\ndata: {\"type\":\"chunk\",\"requestId\":\"conversation-request\",\"text\":\"先聊聊，不启动正式写作。\"}\n\n"
      + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"conversation-request\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"requestedProfileId\":\"deepseek\",\"actualProfileId\":\"deepseek\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: text } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("先聊聊，不启动正式写作。");
      expect(screen.getByTestId("system-layer-panel").getAttribute("data-chat-status")).not.toBe("queued");
    });
    expect(screen.queryByTestId("experience-handoff")).toBeNull();
  });

  it("shows persisted draft progress and lets the novelist report it through the verified light route", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    let feedbackBody: { clientRequestId?: string } = {};
    stubActiveGateway(async (input, init) => {
      if (!String(input).endsWith("/vnext/room/draft-feedback/stream")) {
        throw new Error(`unexpected room request: ${String(input)}`);
      }
      feedbackBody = JSON.parse(String(init?.body)) as { clientRequestId?: string };
      const ready = {
        type: "draft_feedback_ready",
        requestId: feedbackBody.clientRequestId,
        projectionVersionId: draftReadyProjectionVersionId,
        draftContentId: draftReadyContentId,
        provider: "deepseek",
        model: "deepseek-v4-flash",
        requestedTier: "light",
        requestedProfileId: "deepseek",
        actualProfileId: "deepseek",
        routeFallbackApplied: false,
        fallbackApplied: false,
        feedback: {
          summary: "草稿已经完成一个具体动作，尚未进入正式正史。",
          nextStep: "先阅读这段，再决定是否要求返修。",
          revisionSuggestion: "可以补一处信件的触感。",
        },
        storyContext: draftReadyRoomStoryContext,
      };
      const complete = {
        type: "draft_feedback_complete",
        requestId: feedbackBody.clientRequestId,
        projectionVersionId: draftReadyProjectionVersionId,
        draftContentId: draftReadyContentId,
      };
      return new Response(
        `data: ${JSON.stringify(ready)}\n\n` + `data: ${JSON.stringify(complete)}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }, () => roomStoryContextResponse(draftReadyRoomStoryContext));

    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    await waitFor(() => {
      const context = screen.getByTestId("room-story-context");
      expect(context.getAttribute("data-story-source")).toBe("persisted_story_truth");
      expect(context.getAttribute("data-story-progress")).toBe("draft_ready");
      expect(context.textContent).toContain("雨夜未寄的信");
      expect(screen.getByTestId("room-draft-preview").textContent).toContain("雨夜里，门锁响了一声");
      expect(screen.getByTestId("room-draft-feedback")).toBeTruthy();
    });

    expect(screen.getByTestId("experience-handoff").getAttribute("data-experience-status")).toBe("draft_ready");
    fireEvent.click(screen.getByTestId("room-draft-feedback"));

    await waitFor(() => {
      const result = screen.getByTestId("room-draft-feedback-result");
      expect(result.textContent).toContain("草稿已经完成一个具体动作");
      expect(result.textContent).toContain("先阅读这段，再决定是否要求返修");
      expect(result.textContent).toContain("可以补一处信件的触感");
    });
    expect(feedbackBody.clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(screen.getByTestId("room-story-context").getAttribute("data-story-source")).toBe("persisted_story_truth");
  });

  it.each([
    ["a large provider", { provider: "grok" }],
    ["a fallback route", { fallbackApplied: true }],
  ])("does not show draft feedback when the %s attestation is invalid", async (_label, attestation) => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async (input, init) => {
      if (!String(input).endsWith("/vnext/room/draft-feedback/stream")) {
        throw new Error(`unexpected room request: ${String(input)}`);
      }
      const body = JSON.parse(String(init?.body)) as { clientRequestId?: string };
      const ready = {
        type: "draft_feedback_ready",
        requestId: body.clientRequestId,
        projectionVersionId: draftReadyProjectionVersionId,
        draftContentId: draftReadyContentId,
        provider: "deepseek",
        model: "deepseek-v4-flash",
        requestedTier: "light",
        requestedProfileId: "deepseek",
        actualProfileId: "deepseek",
        routeFallbackApplied: false,
        fallbackApplied: false,
        feedback: {
          summary: "不应展示",
          nextStep: "不应展示",
          revisionSuggestion: null,
        },
        storyContext: draftReadyRoomStoryContext,
        ...attestation,
      };
      return new Response(`data: ${JSON.stringify(ready)}\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }, () => roomStoryContextResponse(draftReadyRoomStoryContext));

    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    await waitFor(() => expect(screen.getByTestId("room-draft-feedback")).toBeTruthy());
    fireEvent.click(screen.getByTestId("room-draft-feedback"));

    await waitFor(() => {
      expect(screen.queryByTestId("room-draft-feedback-result")).toBeNull();
      expect(screen.getByTestId("system-layer-panel").textContent).toContain("invalid_runtime_output");
    });
  });

  it("renders the first SSE chunk while the response is still open", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    stubActiveGateway(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();
    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: "边说边显示给我看。" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    streamController.enqueue(encoder.encode(
      `event: route\ndata: ${JSON.stringify({ type: "route", requestId: "room-request-open", intent: "conversation", handling: "conversation", projection: availableProjection })}\n\n`
      + "event: ready\ndata: {\"type\":\"ready\",\"requestId\":\"room-request-open\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n"
      + "event: chunk\ndata: {\"type\":\"chunk\",\"text\":\"先到的半句，\"}\n\n",
    ));

    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("先到的半句，");
      expect(screen.getByTestId("system-layer-panel").textContent).toContain("在线流式");
      expect(screen.getByLabelText("停止回复")).toBeTruthy();
    });
    expect(screen.getByTestId("system-dialogue").textContent).not.toContain("随后才到。");

    streamController.enqueue(encoder.encode(
      "event: chunk\ndata: {\"type\":\"chunk\",\"text\":\"随后才到。\"}\n\n"
      + "event: complete\ndata: {\"type\":\"complete\",\"requestId\":\"room-request-open\",\"provider\":\"deepseek\",\"model\":\"deepseek-v4-flash\",\"requestedTier\":\"light\",\"routeFallbackApplied\":false,\"fallbackApplied\":false}\n\n",
    ));
    streamController.close();

    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("先到的半句，随后才到。");
      expect(screen.queryByLabelText("停止回复")).toBeNull();
    });
  });

  it("does not impersonate an online reply when production preview is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async () => {
      throw new Error("provider unavailable");
    });
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: "继续写吧" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => {
      expect(screen.getByTestId("system-dialogue").textContent).toContain("未生成回复");
      expect(screen.getByTestId("system-layer-panel").textContent).toContain("连接中断");
    });
  });

  it("discovers three variants, keeps preview read-only, and opens draft only after verified promotion", async () => {
    let selected = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) {
        return projectionResponse(selected ? draftProjection : writingProjection);
      }
      if (url.endsWith("/vnext/model-profiles")) {
        return new Response(JSON.stringify({ code: "provider_unavailable" }), { status: 503 });
      }
      if (url.endsWith("/vnext/room/context")) {
        const context = selected
          ? {
              ...draftReadyRoomStoryContext,
              draft: {
                ...draftReadyRoomStoryContext.draft,
                contentId: variantSelectedContentId,
              },
              creativeJob: {
                ...draftReadyRoomStoryContext.creativeJob,
                route: {
                  provider: "deepseek",
                  model: "deepseek-v4-flash",
                  fallbackApplied: false,
                },
              },
            }
          : variantReviewRoomStoryContext;
        return new Response(JSON.stringify({
          projectionVersionId: selected ? draftProjection.versionId : "projection:variant-review",
          context,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith(`/write-opening-variants/${variantCandidateSetId}/select`)) {
        selected = true;
        return new Response(JSON.stringify(await variantCandidateSetPayload(true)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith(`/write-opening-variants/${variantCandidateSetId}`)) {
        return new Response(JSON.stringify(await variantCandidateSetPayload(selected)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={VariantReviewProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await screen.findByRole("button", { name: "probe-open-2" });
    expect(screen.getByTestId("variant-review-probe").getAttribute("data-state")).toBe("ready");
    fireEvent.click(screen.getByRole("button", { name: "probe-open-2" }));
    expect(screen.getByTestId("variant-review-probe").getAttribute("data-preview-id")).toBe(variantCandidateIds[1]);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "probe-close-preview" }));
    expect(screen.getByTestId("variant-review-probe").getAttribute("data-preview-id")).toBe("none");

    fireEvent.click(screen.getByRole("button", { name: "probe-open-2" }));
    fireEvent.click(screen.getByRole("button", { name: "probe-select" }));
    await waitFor(() => {
      expect(screen.getByTestId("variant-review-probe").getAttribute("data-state")).toBe("none");
      expect(screen.getByTestId("variant-review-probe").getAttribute("data-draft-id")).toBe(variantSelectedContentId);
    });
    const selectionCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const selectionBody = JSON.parse(String(selectionCall?.[1]?.body));
    expect(selectionBody).toMatchObject({
      candidateId: variantCandidateIds[1],
      candidateSetVersion: 1,
      workspaceAggregateVersion: 5,
      understandingVersion: 2,
      commissionVersion: 3,
      taskStateVersion: 4,
    });
    expect(JSON.stringify(selectionBody)).not.toMatch(/body|bodyHash|provider|model/);
  });

  it("does not report success when select returns 200 but context is not promoted", async () => {
    let selected = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/vnext/experience")) return projectionResponse(writingProjection);
      if (url.endsWith("/vnext/model-profiles")) {
        return new Response(JSON.stringify({ code: "provider_unavailable" }), { status: 503 });
      }
      if (url.endsWith("/vnext/room/context")) {
        return new Response(JSON.stringify({
          projectionVersionId: "projection:variant-review",
          context: variantReviewRoomStoryContext,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith(`/write-opening-variants/${variantCandidateSetId}/select`)) {
        selected = true;
        return new Response(JSON.stringify(await variantCandidateSetPayload(true)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith(`/write-opening-variants/${variantCandidateSetId}`)) {
        return new Response(JSON.stringify(await variantCandidateSetPayload(selected)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }));
    render(
      <SystemLayerPanel
        activeChannel="novelist"
        onRequestChannel={vi.fn()}
        presentationalSurface={VariantReviewProbe}
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "probe-open-2" }));
    fireEvent.click(screen.getByRole("button", { name: "probe-select" }));
    await waitFor(() => {
      const probe = screen.getByTestId("variant-review-probe");
      expect(probe.getAttribute("data-state")).toBe("none");
      expect(probe.getAttribute("data-draft-id")).toBe("none");
      expect(probe.getAttribute("data-recovery-code")).toBe("candidate_selection_not_promoted");
    });
    expect(screen.getByTestId("system-layer-panel").textContent).not.toContain("已采用所选版本");
  });

  it("explains synthetic-only creative access without pretending the model is offline", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW", "false");
    stubActiveGateway(async () => new Response(JSON.stringify({ code: "compliance_blocked", recovery: "none" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }));
    render(
      <SystemLayerPanel
        observation={{ sceneLabel: "书房", activityLabel: "study-writing", focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 }}
      />,
    );

    await waitForActiveGateway();

    fireEvent.change(screen.getByLabelText("对小说家说点什么"), { target: { value: "帮我写一个关于雨夜书房的短篇故事" } });
    fireEvent.click(screen.getByTestId("system-message-send"));

    await waitFor(() => {
      expect(screen.getByTestId("system-layer-panel").textContent).toContain("创作链路尚未启用：当前运行时缺少合规 worker；普通聊天可用");
      expect(screen.getByTestId("system-layer-panel").getAttribute("data-chat-mode")).toBe("novelist");
      expect(screen.getByTestId("system-dialogue").textContent).toContain("原话已保留；当前没有生成正式创作结果");
      expect(screen.getByTestId("system-layer-panel").textContent).not.toContain("写作引擎暂时不可用");
      expect(screen.queryByTestId("system-message-retry")).toBeNull();
      expect(screen.getByTestId("system-request-issue").textContent).toContain("compliance_blocked");
      expect(screen.getByTestId("system-request-issue").textContent).toContain("recovery=none");
    });
  });
});
