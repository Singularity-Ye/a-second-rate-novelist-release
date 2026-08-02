import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type ChannelEventRecord = AppState["channelEvents"][number];
export type ChannelDeliveryRecord = AppState["channelDeliveries"][number];

export interface ChannelIngressRepository {
  findEventByIdempotencyKey(idempotency_key: string): Promise<ChannelEventRecord | null>;
  createEvent(
    input: Omit<ChannelEventRecord, "id" | "created_at" | "updated_at" | "replay_count" | "last_replayed_at"> & {
      created_at?: string;
    },
  ): Promise<ChannelEventRecord>;
  saveEvent(event: ChannelEventRecord): Promise<ChannelEventRecord>;
  findDeliveryByEventId(channel_event_id: string): Promise<ChannelDeliveryRecord | null>;
  saveDelivery(
    input: Omit<ChannelDeliveryRecord, "id" | "created_at" | "updated_at"> & { created_at?: string },
  ): Promise<ChannelDeliveryRecord>;
}

export function createChannelIngressRepository(): ChannelIngressRepository {
  return {
    async findEventByIdempotencyKey(idempotency_key) {
      return (await readAppState()).channelEvents.find((item) => item.idempotency_key === idempotency_key) ?? null;
    },
    async createEvent(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: ChannelEventRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        session_id: input.session_id,
        channel: input.channel,
        adapter_kind: input.adapter_kind,
        direction: input.direction,
        provider_message_id: input.provider_message_id,
        idempotency_key: input.idempotency_key,
        status: input.status,
        replay_count: 0,
        last_replayed_at: null,
        message_text: input.message_text,
        attachment_handoff: input.attachment_handoff,
        capability_preflight: input.capability_preflight,
        linked_message_id: input.linked_message_id,
        linked_intent_id: input.linked_intent_id,
        linked_route_decision_id: input.linked_route_decision_id,
        response_snapshot: input.response_snapshot,
        created_at: now,
        updated_at: now,
      };

      state.channelEvents.push(created);
      await writeAppState(state);
      return created;
    },
    async saveEvent(event) {
      const state = await readAppState();
      const index = state.channelEvents.findIndex((item) => item.id === event.id);

      if (index >= 0) {
        state.channelEvents[index] = event;
      } else {
        state.channelEvents.push(event);
      }

      await writeAppState(state);
      return event;
    },
    async findDeliveryByEventId(channel_event_id) {
      return (await readAppState()).channelDeliveries.find((item) => item.channel_event_id === channel_event_id) ?? null;
    },
    async saveDelivery(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const existingIndex = state.channelDeliveries.findIndex((item) => item.channel_event_id === input.channel_event_id);
      const existing = existingIndex >= 0 ? state.channelDeliveries[existingIndex] : null;
      const record: ChannelDeliveryRecord = {
        id: existing?.id ?? randomUUID(),
        channel_event_id: input.channel_event_id,
        channel: input.channel,
        adapter_kind: input.adapter_kind,
        status: input.status,
        attempt_count: input.attempt_count,
        max_attempts: input.max_attempts,
        retry_backoff_ms: input.retry_backoff_ms,
        last_error: input.last_error,
        segments: input.segments,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      if (existingIndex >= 0) {
        state.channelDeliveries[existingIndex] = record;
      } else {
        state.channelDeliveries.push(record);
      }

      await writeAppState(state);
      return record;
    },
  };
}
