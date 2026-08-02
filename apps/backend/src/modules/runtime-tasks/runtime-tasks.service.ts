import type { ChapterGenerateResponse, RuntimeTaskView } from "@erliu/shared-contracts";
import { buildRuntimeTaskArtifactRef } from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import {
  createChapterRuntimeRepository,
  type RuntimeTaskRecord,
} from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import {
  toChapterDraftArtifact,
  toReaderReviewArtifact,
  toReaderReviewObjectKey,
  toSceneCardSetObjectKey,
} from "../../common/truth-source/creative-artifact.contract.js";
import { scheduleCreativeArtifactObjectStorageShadowUpload } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { scheduleRuntimeTaskRedisShadowEnqueue } from "../../common/truth-source/runtime-task-redis-shadow-mirror.js";
import { recordAiRuntimeObservation } from "../ai-runtime/ai-runtime-observability.service.js";
import { buildPlannedSceneCardSet } from "../chapter-runtime/scene-card-planning.js";
import { composeContextBundle } from "../context-composer/context-composer.service.js";
import { recordAccountCapabilitySpend } from "../identity-membership/account-control-plane.service.js";
import {
  buildChapterGenerationRuntimeDispatch,
  runChapterGenerationViaServerAdapter,
} from "../opencode-runtime/opencode-runtime.service.js";
import { getRoomPersona, resolvePersonaRuntime } from "../persona-runtime/persona-runtime.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

function resolveH5BaseUrl() {
  return process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function emitEvent(event_name: string, account_id: string, payload: Record<string, string | number | boolean | null>) {
  void recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

function nextChapterNumber(existingChapterCount: number, target: RuntimeTaskRecord["target"]) {
  if (target === "next_scene" && existingChapterCount > 0) {
    return existingChapterCount;
  }

  return Math.max(1, existingChapterCount + 1);
}

function toChapterGenerationIdempotencyKey(input: {
  story_id: string;
  target: "next_chapter" | "next_scene" | "first_chapter";
  client_request_id: string;
}) {
  return `chapter_generate:${input.story_id}:${input.target}:${input.client_request_id}`;
}

function toChapterGenerateResponse(task: RuntimeTaskRecord): ChapterGenerateResponse {
  return {
    job_id: task.id,
    status: task.status,
    notification_id: task.notification_id,
  };
}

function resolveSceneCardSet(input: {
  workspace: NonNullable<Awaited<ReturnType<ReturnType<typeof createStoryWorkspaceRepository>["findWorkspaceById"]>>>;
  chapter: {
    id: string;
    chapter_no: number;
    title: string;
  };
}) {
  const commissionBrief =
    input.workspace.commission_brief && typeof input.workspace.commission_brief === "object"
      ? (input.workspace.commission_brief as Record<string, unknown>)
      : {};
  const frontTenPromise =
    typeof commissionBrief.front_ten_chapter_promise === "string"
      ? commissionBrief.front_ten_chapter_promise
      : `前十章先把《${input.workspace.title}》的关系试探和站队压力钉住。`;
  const relationshipPromise =
    typeof commissionBrief.relationship_promise === "string"
      ? commissionBrief.relationship_promise
      : `把《${input.workspace.title}》的关系拉扯继续往前推。`;

  return buildPlannedSceneCardSet({
    story_id: input.workspace.id,
    chapter_id: input.chapter.id,
    relationship_promise: relationshipPromise,
    front_ten_chapter_promise: frontTenPromise,
  });
}

function resolveReaderReview(input: {
  workspace: NonNullable<Awaited<ReturnType<ReturnType<typeof createStoryWorkspaceRepository>["findWorkspaceById"]>>>;
  chapter: {
    id: string;
    body_text: string;
  };
  sceneCardSet: ReturnType<typeof buildPlannedSceneCardSet>;
}) {
  return toReaderReviewArtifact({
    story_id: input.workspace.id,
    chapter_id: input.chapter.id,
    source_artifact_id: input.chapter.id,
    review_dimensions: {
      clarity: 4,
      promise_delivery: 3,
      relationship_tension: 5,
      chapter_progression: 4,
      cliffhanger_strength: 4,
    },
    summary: `${input.sceneCardSet.chapter_goal} 已立住，但 ${input.sceneCardSet.chapter_cliffhanger_goal} 还需要再往章末钉深一点。`,
    rewrite_targets: [
      `把「${input.sceneCardSet.chapter_cliffhanger_goal}」再往前埋一层。`,
      input.sceneCardSet.scenes[1]?.expected_after_state ?? "让章末选择更不可回头。",
    ],
    acceptance_recommendation: "tweak",
  });
}

async function markTaskFailed(
  task: RuntimeTaskRecord,
  message: string,
  failure_kind: RuntimeTaskRecord["failure_kind"] = "model_failed",
) {
  task.status = "failed";
  task.callback_status = "failed";
  task.failure_kind = failure_kind;
  task.task_result_summary = `Task failed: ${message}`;
  task.last_error = message;
  task.updated_at = new Date().toISOString();
  await createChapterRuntimeRepository().saveRuntimeTask(task);
}

async function applyChapterGenerationWriteback(input: {
  task: RuntimeTaskRecord;
  runtimeResult: Awaited<ReturnType<typeof runChapterGenerationViaServerAdapter>>;
  workspace: Awaited<ReturnType<ReturnType<typeof createStoryWorkspaceRepository>["findWorkspaceById"]>>;
  account_id: string;
}) {
  if (!input.workspace) {
    throw new Error(`Story workspace not found for runtime writeback of task ${input.task.id}`);
  }

  const chapterRepository = createChapterRuntimeRepository();
  const now = new Date().toISOString();
  const existingChapters = await chapterRepository.listChaptersByStory(input.workspace.id);
  const callback = input.runtimeResult.callback;
  const draftArtifactRef =
    callback.artifact_refs[0] ??
    buildRuntimeTaskArtifactRef({
      artifact_type: "chapter_draft",
      story_id: input.workspace.id,
      chapter_id: callback.chapter.chapter_id,
      object_key: `creative-artifacts/stories/${input.workspace.id}/chapters/${callback.chapter.chapter_id}/draft.json`,
      created_at: now,
    });
  const sceneCardSet = resolveSceneCardSet({
    workspace: input.workspace,
    chapter: {
      id: callback.chapter.chapter_id,
      chapter_no: nextChapterNumber(existingChapters.length, input.task.target),
      title: callback.chapter.title,
    },
  });
  const readerReview = resolveReaderReview({
    workspace: input.workspace,
    chapter: {
      id: callback.chapter.chapter_id,
      body_text: callback.chapter.body_text,
    },
    sceneCardSet,
  });
  const sceneCardSetRef = buildRuntimeTaskArtifactRef({
    artifact_type: "scene_card_set",
    story_id: input.workspace.id,
    chapter_id: callback.chapter.chapter_id,
    object_key: toSceneCardSetObjectKey(input.workspace.id, callback.chapter.chapter_id),
    created_at: sceneCardSet.created_at,
  });
  const readerReviewRef = buildRuntimeTaskArtifactRef({
    artifact_type: "reader_review",
    story_id: input.workspace.id,
    chapter_id: callback.chapter.chapter_id,
    object_key: toReaderReviewObjectKey(input.workspace.id, callback.chapter.chapter_id),
    created_at: readerReview.created_at,
  });
  const chapter = await chapterRepository.createChapter({
    chapter_id: callback.chapter.chapter_id,
    story_id: input.workspace.id,
    chapter_no: nextChapterNumber(existingChapters.length, input.task.target),
    status: "generated",
    title: callback.chapter.title,
    body_text: callback.chapter.body_text,
    summary: callback.chapter.summary,
    scene_card_set: sceneCardSet as unknown as Record<string, unknown>,
    reader_review: readerReview as unknown as Record<string, unknown>,
    generation_job_id: input.task.id,
    created_at: now,
  });
  const notification = await chapterRepository.createNotification({
    account_id: input.account_id,
    story_id: input.workspace.id,
    title: callback.notification.title,
    body: callback.notification.body,
    deep_link: `${resolveH5BaseUrl()}/stories/${input.workspace.id}/chapters/${chapter.id}`,
    status: "unread",
    created_at: now,
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: input.account_id,
    aggregate_key: "scene_card_set",
    object_key: sceneCardSetRef.object_key,
    body: JSON.stringify(sceneCardSet),
    content_type: "application/json",
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: input.account_id,
    aggregate_key: "chapter_draft",
    object_key: draftArtifactRef.object_key,
    body: JSON.stringify(toChapterDraftArtifact(chapter)),
    content_type: "application/json",
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: input.account_id,
    aggregate_key: "reader_review",
    object_key: readerReviewRef.object_key,
    body: JSON.stringify(readerReview),
    content_type: "application/json",
  });

  input.task.notification_id = notification.id;
  input.task.result_chapter_id = chapter.id;
  input.task.status = "succeeded";
  input.task.callback_status = callback.status;
  input.task.callback_applied_at = now;
  input.task.workflow_key = input.runtimeResult.workflow_key;
  input.task.adapter_kind = input.runtimeResult.adapter_kind;
  input.task.context_bundle_id = input.runtimeResult.context_bundle_id;
  input.task.persona_snapshot_id = input.runtimeResult.persona_snapshot_id;
  input.task.agent_roster = input.runtimeResult.agent_roster;
  input.task.tool_scope = input.runtimeResult.tool_scope;
  input.task.result_artifact_refs = [sceneCardSetRef, draftArtifactRef, readerReviewRef];
  input.task.task_result_summary = `Scene cards, chapter draft ${chapter.id}, and reader review prepared; notification ${notification.id} enqueued.`;
  input.task.failure_kind = null;
  input.task.last_error = null;
  input.task.updated_at = now;
  await chapterRepository.saveRuntimeTask(input.task);

  emitEvent("runtime_task_callback_applied", input.account_id, {
    task_id: input.task.id,
    story_id: input.workspace.id,
    room_events: callback.room_events.join(","),
  });
  emitEvent("chapter_generation_completed", input.account_id, {
    story_id: input.workspace.id,
    chapter_no: chapter.chapter_no,
    latency_ms: 320,
  });

  return {
    chapter,
    notification,
  };
}

export async function queueChapterGenerationTask(input: {
  story_id: string;
  target: "next_chapter" | "next_scene" | "first_chapter";
  client_request_id: string;
}): Promise<ChapterGenerateResponse> {
  const chapterRepository = createChapterRuntimeRepository();
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.story_id);
  const idempotency_key = toChapterGenerationIdempotencyKey(input);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${input.story_id}`);
  }

  const existingTask = await chapterRepository.findRuntimeTaskByIdempotencyKey(idempotency_key);

  if (existingTask) {
    return toChapterGenerateResponse(existingTask);
  }

  const task = await chapterRepository.createRuntimeTask({
    job_type: "chapter_generate",
    account_id: workspace.account_id,
    story_id: input.story_id,
    session_id: null,
    target: input.target,
    client_request_id: input.client_request_id,
    idempotency_key,
  });

  emitEvent("chapter_generation_started", workspace.account_id, {
    story_id: input.story_id,
    target: input.target,
  });
  scheduleRuntimeTaskRedisShadowEnqueue({
    account_id: workspace.account_id,
    task_id: task.id,
    story_id: input.story_id,
    target: input.target,
    client_request_id: input.client_request_id,
    created_at: task.created_at,
  });

  return toChapterGenerateResponse(task);
}

export async function drainQueuedRuntimeTasks() {
  const accountRepository = createAccountRepository();
  const chapterRepository = createChapterRuntimeRepository();
  const workspaceRepository = createStoryWorkspaceRepository();
  const queuedTasks = (await chapterRepository.listQueuedRuntimeTasks()).filter(
    (task) => task.job_type === "chapter_generate",
  );

  for (const task of queuedTasks) {
    if (!task.story_id || !task.target) {
      await markTaskFailed(task, `Runtime task ${task.id} is missing chapter generation coordinates`, "not_found");
      continue;
    }

    const workspace = await workspaceRepository.findWorkspaceById(task.story_id);

    if (!workspace) {
      await markTaskFailed(task, `Story workspace not found for runtime task ${task.id}`, "not_found");
      continue;
    }

    const account = await accountRepository.findAccountById(workspace.account_id);

    if (!account) {
      await markTaskFailed(task, `Account not found for runtime task ${task.id}`, "not_found");
      continue;
    }

    const contextBundle = await composeContextBundle({
      story_id: workspace.id,
      task_type: "write",
      token_budget: 1200,
    });
    const persona = await getRoomPersona({
      account_token: account.account_token,
      story_id: workspace.id,
    });
    const dispatch = buildChapterGenerationRuntimeDispatch({
      task_id: task.id,
      story_id: workspace.id,
      account_id: workspace.account_id,
      target: task.target,
      story_title: workspace.title,
      context_bundle: contextBundle,
      persona,
    });

    task.status = "running";
    task.workflow_key = dispatch.workflow_key;
    task.adapter_kind = dispatch.adapter_kind;
    task.context_bundle_id = dispatch.context_bundle_id;
    task.persona_snapshot_id = dispatch.persona_snapshot_id;
    task.callback_status = "pending";
    task.memory_map = dispatch.memory_map;
    task.agent_roster = dispatch.agent_roster;
    task.tool_scope = dispatch.tool_scope;
    task.dispatch_started_at = dispatch.dispatched_at;
    task.updated_at = dispatch.dispatched_at;
    await chapterRepository.saveRuntimeTask(task);

    emitEvent("runtime_task_dispatched", workspace.account_id, {
      task_id: task.id,
      story_id: workspace.id,
      workflow_key: dispatch.workflow_key,
      adapter_kind: dispatch.adapter_kind,
    });

    const startedAt = Date.now();

    try {
      const runtimeResult = await runChapterGenerationViaServerAdapter({
        dispatch,
        context_bundle: contextBundle,
        persona,
      });
      await applyChapterGenerationWriteback({
        task,
        runtimeResult,
        workspace,
        account_id: workspace.account_id,
      });
      await resolvePersonaRuntime({
        account_token: account.account_token,
        story_id: workspace.id,
        force_refresh: true,
      });
      await recordAiRuntimeObservation({
        account_id: workspace.account_id,
        story_id: workspace.id,
        task_key: "story.chapter.generate",
        latency_ms: Date.now() - startedAt,
        execution: runtimeResult.execution,
        trace: null,
        errors: [],
      });
      await recordAccountCapabilitySpend({
        account_id: workspace.account_id,
        capability: "text_generation",
        provider_id: runtimeResult.execution.provider_id,
      });
    } catch (error) {
      const message = toErrorMessage(error);

      await markTaskFailed(task, message);
      emitEvent("runtime_task_failed", workspace.account_id, {
        task_id: task.id,
        story_id: workspace.id,
        reason: message,
      });
      await recordAiRuntimeObservation({
        account_id: workspace.account_id,
        story_id: workspace.id,
        task_key: "story.chapter.generate",
        latency_ms: Date.now() - startedAt,
        execution: dispatch.execution,
        trace: null,
        errors: [
          {
            tier: dispatch.execution.selected_tier,
            message,
          },
        ],
      });
      await recordAccountCapabilitySpend({
        account_id: workspace.account_id,
        capability: "text_generation",
        provider_id: dispatch.execution.provider_id,
      });
    }

    if (account) {
      const latestTask = await chapterRepository.findRuntimeTaskById(task.id);

      if (latestTask?.notification_id) {
        emitEvent("notification_created", workspace.account_id, {
          notification_id: latestTask.notification_id,
          story_id: workspace.id,
          channel: account.primary_channel,
        });
      }
    }
  }
}

export async function getRuntimeTaskById(job_id: string): Promise<RuntimeTaskView> {
  const task = await createChapterRuntimeRepository().findRuntimeTaskById(job_id);

  if (!task) {
    throw new Error(`Runtime task not found for id ${job_id}`);
  }

  return {
    job_id: task.id,
    job_type: task.job_type,
    status: task.status,
    notification_id: task.notification_id,
    result_chapter_id: task.result_chapter_id,
    workflow_key: task.workflow_key ?? null,
    adapter_kind: task.adapter_kind ?? null,
    context_bundle_id: task.context_bundle_id ?? null,
    persona_snapshot_id: task.persona_snapshot_id ?? null,
    callback_status: task.callback_status ?? null,
    result_artifact_refs: task.result_artifact_refs ?? [],
    task_result_summary: task.task_result_summary ?? null,
    failure_kind: task.failure_kind ?? null,
    memory_map: task.memory_map ?? null,
  };
}
