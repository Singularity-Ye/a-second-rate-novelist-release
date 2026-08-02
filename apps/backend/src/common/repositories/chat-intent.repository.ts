import { randomUUID } from "node:crypto";
import type {
  ChatAckView,
  ChatIntentType,
  ChatRouteMode,
  ChatRouteStatus,
  ConfidenceBand,
  IntentCorrectionStateView,
  IntentRouteHint,
  IntentTargetObjectView,
} from "@erliu/shared-contracts";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type NormalizedMessageRecord = AppState["messages"][number];
export type IntentEnvelopeRecord = AppState["intentEnvelopes"][number];
export type ChatRouteDecisionRecord = AppState["chatRouteDecisions"][number];
export type MessageIntentRecord = AppState["messageIntents"][number];

export interface ChatIntentListItem extends MessageIntentRecord {
  message_text: string;
}

export interface ChatIntentRepository {
  appendNormalizedMessage(input: {
    account_id: string;
    channel_message_id: string;
    channel: string;
    text: string;
    created_at?: string;
  }): Promise<NormalizedMessageRecord>;
  findMessageById(message_id: string): Promise<NormalizedMessageRecord | null>;
  createIntentEnvelope(input: Omit<IntentEnvelopeRecord, "id" | "created_at"> & { created_at?: string }): Promise<IntentEnvelopeRecord>;
  findIntentEnvelopeById(envelope_id: string): Promise<IntentEnvelopeRecord | null>;
  recordRouteDecision(input: {
    message_id: string;
    account_id: string;
    candidate_story_ids: string[];
    selected_story_id: string | null;
    confidence_score: number;
    route_mode: ChatRouteMode;
    status: ChatRouteStatus;
    reason_summary: ChatRouteDecisionRecord["reason_summary"];
    created_at?: string;
  }): Promise<ChatRouteDecisionRecord>;
  saveRouteDecision(decision: ChatRouteDecisionRecord): Promise<ChatRouteDecisionRecord>;
  findRouteDecisionById(route_decision_id: string): Promise<ChatRouteDecisionRecord | null>;
  upsertMessageIntent(input: {
    envelope_id: string;
    message_id: string;
    account_id: string;
    channel_message_id?: string | null;
    intent_type: ChatIntentType;
    target_type: ChatAckView["target_type"];
    target_id: string | null;
    target_label: string;
    target_object: IntentTargetObjectView;
    proposed_patch: Record<string, unknown>;
    ack_copy: string;
    deep_link: string | null;
    confidence_band: ConfidenceBand;
    confidence_score: number;
    route_hint: IntentRouteHint;
    correction_state: IntentCorrectionStateView;
  }): Promise<MessageIntentRecord>;
  saveMessageIntent(intent: MessageIntentRecord): Promise<MessageIntentRecord>;
  findMessageIntentById(intent_id: string): Promise<MessageIntentRecord | null>;
  findMessageIntentByMessageId(message_id: string): Promise<MessageIntentRecord | null>;
  listMessageIntentsByAccount(account_id: string, limit?: number): Promise<ChatIntentListItem[]>;
}

let chatIntentRepositoryDriverOverride: ChatIntentRepository | null = null;

export function __setChatIntentRepositoryDriverForTests(override: ChatIntentRepository | null) {
  chatIntentRepositoryDriverOverride = override;
}

export function createChatIntentRepository(): ChatIntentRepository {
  if (chatIntentRepositoryDriverOverride) {
    return chatIntentRepositoryDriverOverride;
  }

  return {
    async appendNormalizedMessage(input) {
      const state = await readAppState();
      const created: NormalizedMessageRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        channel_message_id: input.channel_message_id,
        channel: input.channel,
        text: input.text,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.messages.push(created);
      await writeAppState(state);
      return created;
    },
    async findMessageById(message_id) {
      return (await readAppState()).messages.find((item) => item.id === message_id) ?? null;
    },
    async createIntentEnvelope(input) {
      const state = await readAppState();
      const created: IntentEnvelopeRecord = {
        id: randomUUID(),
        message_id: input.message_id,
        account_id: input.account_id,
        session_id: input.session_id,
        surface: input.surface,
        channel: input.channel,
        channel_message_id: input.channel_message_id,
        story_id: input.story_id,
        chapter_id: input.chapter_id,
        message_text: input.message_text,
        attachments: input.attachments,
        delivery_constraints: input.delivery_constraints,
        intent_seed: input.intent_seed,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.intentEnvelopes.push(created);
      await writeAppState(state);
      return created;
    },
    async findIntentEnvelopeById(envelope_id) {
      return (await readAppState()).intentEnvelopes.find((item) => item.id === envelope_id) ?? null;
    },
    async recordRouteDecision(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: ChatRouteDecisionRecord = {
        id: randomUUID(),
        message_id: input.message_id,
        account_id: input.account_id,
        candidate_story_ids: input.candidate_story_ids,
        selected_story_id: input.selected_story_id,
        confidence_score: input.confidence_score,
        route_mode: input.route_mode,
        status: input.status,
        reason_summary: input.reason_summary,
        created_at: now,
        updated_at: now,
      };

      state.chatRouteDecisions.push(created);
      await writeAppState(state);
      return created;
    },
    async saveRouteDecision(decision) {
      const state = await readAppState();
      const index = state.chatRouteDecisions.findIndex((item) => item.id === decision.id);

      if (index >= 0) {
        state.chatRouteDecisions[index] = decision;
      } else {
        state.chatRouteDecisions.push(decision);
      }

      await writeAppState(state);
      return decision;
    },
    async findRouteDecisionById(route_decision_id) {
      return (await readAppState()).chatRouteDecisions.find((item) => item.id === route_decision_id) ?? null;
    },
    async upsertMessageIntent(input) {
      const state = await readAppState();
      const now = new Date().toISOString();
      const existing = state.messageIntents.find((item) => item.message_id === input.message_id);
      const targetObject =
        input.target_object ??
        ({
          object_type:
            input.target_type === "story_workspace"
              ? "workspace"
              : input.target_type === "route_decision"
                ? "route_decision"
                : "recent_note",
          object_id: input.target_id,
          object_label: input.target_label,
        } satisfies IntentTargetObjectView);
      const proposedPatch = input.proposed_patch ?? {};
      const confidenceScore = typeof input.confidence_score === "number" ? input.confidence_score : 0.5;
      const routeHint = input.route_hint ?? "coordinator_only";
      const correctionState =
        input.correction_state ??
        ({
          status: "recorded",
          entry_deep_link: input.deep_link,
          last_corrected_at: null,
        } satisfies IntentCorrectionStateView);

      if (existing) {
        existing.envelope_id = input.envelope_id;
        existing.intent_type = input.intent_type;
        existing.final_intent = input.intent_type;
        existing.target_type = input.target_type;
        existing.target_id = input.target_id;
        existing.target_label = input.target_label;
        existing.target_object =
          targetObject.object_type === "recent_note" && !targetObject.object_id
            ? {
                ...targetObject,
                object_id: existing.id,
              }
            : targetObject;
        existing.proposed_patch = proposedPatch;
        existing.ack_copy = input.ack_copy;
        existing.deep_link = input.deep_link;
        existing.confidence_band = input.confidence_band;
        existing.confidence_score = confidenceScore;
        existing.route_hint = routeHint;
        existing.correction_state = correctionState;
        existing.version_no += 1;
        existing.updated_at = now;
        await writeAppState(state);
        return existing;
      }

      const created: MessageIntentRecord = {
        id: randomUUID(),
        envelope_id: input.envelope_id,
        message_id: input.message_id,
        account_id: input.account_id,
        channel_message_id: input.channel_message_id ?? null,
        final_intent: input.intent_type,
        intent_type: input.intent_type,
        target_type: input.target_type,
        target_id: input.target_id,
        target_label: input.target_label,
        target_object:
          targetObject.object_type === "recent_note" && !targetObject.object_id
            ? {
                ...targetObject,
                object_id: null,
              }
            : targetObject,
        proposed_patch: proposedPatch,
        ack_copy: input.ack_copy,
        deep_link: input.deep_link,
        confidence_band: input.confidence_band,
        confidence_score: confidenceScore,
        route_hint: routeHint,
        correction_state: correctionState,
        patch_document: null,
        status: "acknowledged",
        version_no: 1,
        created_at: now,
        updated_at: now,
      };

      state.messageIntents.push(created);
      if (created.target_object.object_type === "recent_note" && !created.target_object.object_id) {
        created.target_object = {
          ...created.target_object,
          object_id: created.id,
        };
      }
      await writeAppState(state);
      return created;
    },
    async saveMessageIntent(intent) {
      const state = await readAppState();
      const index = state.messageIntents.findIndex((item) => item.id === intent.id);

      if (index >= 0) {
        state.messageIntents[index] = intent;
      } else {
        state.messageIntents.push(intent);
      }

      await writeAppState(state);
      return intent;
    },
    async findMessageIntentById(intent_id) {
      return (await readAppState()).messageIntents.find((item) => item.id === intent_id) ?? null;
    },
    async findMessageIntentByMessageId(message_id) {
      return (await readAppState()).messageIntents.find((item) => item.message_id === message_id) ?? null;
    },
    async listMessageIntentsByAccount(account_id, limit = 20) {
      const state = await readAppState();

      return state.messageIntents
        .filter((item) => item.account_id === account_id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, limit)
        .map((intent) => ({
          ...intent,
          message_text: state.messages.find((item) => item.id === intent.message_id)?.text ?? "",
        }));
    },
  };
}
