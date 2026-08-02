import { createObservabilityRepository } from "../repositories/observability.repository.js";
import { getRedisClient, isRedisConfigured } from "./redis.client.js";

const RUNTIME_TASK_QUEUE_KEY = "story-runtime:chapter-generate";

export interface RuntimeTaskRedisShadowEnqueueInput {
  account_id: string;
  task_id: string;
  story_id: string;
  target: "next_chapter" | "next_scene" | "first_chapter";
  client_request_id: string;
  created_at: string;
}

export interface RuntimeTaskRedisShadowQueue {
  enqueue(input: RuntimeTaskRedisShadowEnqueueInput): Promise<void>;
}

let runtimeTaskRedisShadowOverride: RuntimeTaskRedisShadowQueue | null = null;

const defaultRuntimeTaskRedisShadowQueue: RuntimeTaskRedisShadowQueue = {
  async enqueue(input) {
    const client = await getRedisClient();

    await client.rPush(
      RUNTIME_TASK_QUEUE_KEY,
      JSON.stringify({
        task_id: input.task_id,
        story_id: input.story_id,
        target: input.target,
        client_request_id: input.client_request_id,
        created_at: input.created_at,
      }),
    );
  },
};

export function __setRuntimeTaskRedisShadowQueueForTests(
  override: RuntimeTaskRedisShadowQueue | null,
) {
  runtimeTaskRedisShadowOverride = override;
}

export function scheduleRuntimeTaskRedisShadowEnqueue(
  input: RuntimeTaskRedisShadowEnqueueInput,
) {
  if (!runtimeTaskRedisShadowOverride && !isRedisConfigured()) {
    return;
  }

  const queue = runtimeTaskRedisShadowOverride ?? defaultRuntimeTaskRedisShadowQueue;

  void queue.enqueue(input).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";

    createObservabilityRepository().appendDomainEvent({
      event_name: "truth_source_shadow_mirror_failed",
      account_id: input.account_id,
      mirror_to_audit: true,
      payload: {
        aggregate_key: "runtime_task",
        target_driver: "redis_queue",
        object_key: RUNTIME_TASK_QUEUE_KEY,
        error_name: name,
        error_message: message,
      },
    });
  });
}
