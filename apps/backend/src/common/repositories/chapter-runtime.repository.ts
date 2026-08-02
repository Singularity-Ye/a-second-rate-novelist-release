import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type ChapterRecord = AppState["chapters"][number];
export type ChapterRevisionRecord = AppState["chapterRevisions"][number];
export type RuntimeTaskRecord = AppState["runtimeTasks"][number];
export type NotificationRecord = AppState["notifications"][number];

export interface ChapterRuntimeRepository {
  createRuntimeTask(input: {
    job_type: RuntimeTaskRecord["job_type"];
    account_id: string;
    story_id: string | null;
    session_id?: string | null;
    target: RuntimeTaskRecord["target"];
    client_request_id: string;
    idempotency_key: string;
    created_at?: string;
  }): Promise<RuntimeTaskRecord>;
  listQueuedRuntimeTasks(): Promise<RuntimeTaskRecord[]>;
  saveRuntimeTask(task: RuntimeTaskRecord): Promise<RuntimeTaskRecord>;
  findRuntimeTaskById(task_id: string): Promise<RuntimeTaskRecord | null>;
  findRuntimeTaskByIdempotencyKey(idempotency_key: string): Promise<RuntimeTaskRecord | null>;
  findLatestRuntimeTaskBySession(
    session_id: string,
    job_type: RuntimeTaskRecord["job_type"],
  ): Promise<RuntimeTaskRecord | null>;
  createChapter(input: {
    chapter_id?: string;
    story_id: string;
    chapter_no: number;
    status: ChapterRecord["status"];
    title: string;
    body_text: string;
    summary: string;
    scene_card_set?: ChapterRecord["scene_card_set"];
    reader_review?: ChapterRecord["reader_review"];
    generation_job_id: string | null;
    created_at?: string;
  }): Promise<ChapterRecord>;
  saveChapter(chapter: ChapterRecord): Promise<ChapterRecord>;
  findChapterById(chapter_id: string): Promise<ChapterRecord | null>;
  findChapterByStoryAndId(story_id: string, chapter_id: string): Promise<ChapterRecord | null>;
  listChaptersByStory(story_id: string): Promise<ChapterRecord[]>;
  createChapterRevision(input: {
    chapter_id: string;
    revision_kind: ChapterRevisionRecord["revision_kind"];
    instruction_text: string;
    anchor_range: ChapterRevisionRecord["anchor_range"];
    revised_text: string;
    source_intent_id: string;
    created_at?: string;
  }): Promise<ChapterRevisionRecord>;
  listRevisionsByChapterId(chapter_id: string): Promise<ChapterRevisionRecord[]>;
  createNotification(input: {
    account_id: string;
    story_id: string;
    title: string;
    body: string;
    deep_link: string;
    status: NotificationRecord["status"];
    created_at?: string;
  }): Promise<NotificationRecord>;
  listRecentNotificationsByAccount(account_id: string, limit?: number): Promise<NotificationRecord[]>;
}

let chapterRuntimeRepositoryDriverOverride: ChapterRuntimeRepository | null = null;

export function __setChapterRuntimeRepositoryDriverForTests(override: ChapterRuntimeRepository | null) {
  chapterRuntimeRepositoryDriverOverride = override;
}

export function createChapterRuntimeRepository(): ChapterRuntimeRepository {
  if (chapterRuntimeRepositoryDriverOverride) {
    return chapterRuntimeRepositoryDriverOverride;
  }

  return {
    async createRuntimeTask(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: RuntimeTaskRecord = {
        id: randomUUID(),
        job_type: input.job_type,
        account_id: input.account_id,
        story_id: input.story_id,
        session_id: input.session_id ?? null,
        target: input.target,
        status: "queued",
        notification_id: null,
        result_chapter_id: null,
        client_request_id: input.client_request_id,
        idempotency_key: input.idempotency_key,
        workflow_key: null,
        adapter_kind: null,
        context_bundle_id: null,
        persona_snapshot_id: null,
        callback_status: null,
        memory_map: null,
        agent_roster: [],
        tool_scope: [],
        result_artifact_refs: [],
        task_result_summary: null,
        failure_kind: null,
        dispatch_started_at: null,
        callback_applied_at: null,
        last_error: null,
        created_at: now,
        updated_at: now,
      };

      state.runtimeTasks.push(created);
      await writeAppState(state);
      return created;
    },
    async listQueuedRuntimeTasks() {
      return (await readAppState()).runtimeTasks.filter((item) => item.status === "queued");
    },
    async saveRuntimeTask(task) {
      const state = await readAppState();
      const index = state.runtimeTasks.findIndex((item) => item.id === task.id);

      if (index >= 0) {
        state.runtimeTasks[index] = task;
      } else {
        state.runtimeTasks.push(task);
      }

      await writeAppState(state);
      return task;
    },
    async findRuntimeTaskById(task_id) {
      return (await readAppState()).runtimeTasks.find((item) => item.id === task_id) ?? null;
    },
    async findRuntimeTaskByIdempotencyKey(idempotency_key) {
      return (await readAppState()).runtimeTasks.find((item) => item.idempotency_key === idempotency_key) ?? null;
    },
    async findLatestRuntimeTaskBySession(session_id, job_type) {
      return (
        (await readAppState())
          .runtimeTasks.filter((item) => item.session_id === session_id && item.job_type === job_type)
          .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
      );
    },
    async createChapter(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: ChapterRecord = {
        id: input.chapter_id ?? randomUUID(),
        story_id: input.story_id,
        chapter_no: input.chapter_no,
        status: input.status,
        title: input.title,
        body_text: input.body_text,
        summary: input.summary,
        scene_card_set: input.scene_card_set ?? null,
        reader_review: input.reader_review ?? null,
        generation_job_id: input.generation_job_id,
        created_at: now,
        updated_at: now,
      };

      state.chapters.push(created);
      await writeAppState(state);
      return created;
    },
    async saveChapter(chapter) {
      const state = await readAppState();
      const index = state.chapters.findIndex((item) => item.id === chapter.id);

      if (index >= 0) {
        state.chapters[index] = chapter;
      } else {
        state.chapters.push(chapter);
      }

      await writeAppState(state);
      return chapter;
    },
    async findChapterById(chapter_id) {
      return (await readAppState()).chapters.find((item) => item.id === chapter_id) ?? null;
    },
    async findChapterByStoryAndId(story_id, chapter_id) {
      return (await readAppState()).chapters.find((item) => item.story_id === story_id && item.id === chapter_id) ?? null;
    },
    async listChaptersByStory(story_id) {
      return (await readAppState()).chapters.filter((item) => item.story_id === story_id);
    },
    async createChapterRevision(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: ChapterRevisionRecord = {
        id: randomUUID(),
        chapter_id: input.chapter_id,
        revision_kind: input.revision_kind,
        instruction_text: input.instruction_text,
        anchor_range: input.anchor_range,
        revised_text: input.revised_text,
        source_intent_id: input.source_intent_id,
        created_at: now,
        updated_at: now,
      };

      state.chapterRevisions.push(created);
      await writeAppState(state);
      return created;
    },
    async listRevisionsByChapterId(chapter_id) {
      return (await readAppState()).chapterRevisions.filter((item) => item.chapter_id === chapter_id);
    },
    async createNotification(input) {
      const state = await readAppState();
      const created: NotificationRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        story_id: input.story_id,
        title: input.title,
        body: input.body,
        deep_link: input.deep_link,
        status: input.status,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.notifications.push(created);
      await writeAppState(state);
      return created;
    },
    async listRecentNotificationsByAccount(account_id, limit = 3) {
      return (await readAppState())
        .notifications.filter((item) => item.account_id === account_id)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, limit);
    },
  };
}
