import type {
  ChatAckView,
  ChatIntentType,
  ConfidenceBand,
  IntentCorrectionStateView,
  IntentEnvelopeSurface,
  IntentRouteHint,
  IntentTargetObjectView,
} from "@erliu/shared-contracts";
import { createChatIntentRepository } from "../../common/repositories/chat-intent.repository.js";

export function recordIntentEnvelope(input: {
  message_id: string;
  account_id: string;
  session_id: string;
  surface: IntentEnvelopeSurface;
  channel: string;
  channel_message_id: string;
  story_id: string | null;
  chapter_id: string | null;
  message_text: string;
  attachments: Array<{
    file_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
  delivery_constraints: {
    reply_window: "active" | "passive_limited";
    max_segment_chars: number;
    async_allowed: boolean;
  };
  intent_seed: {
    raw_text: string;
    source_surface: "chat" | "room";
  };
}) {
  return createChatIntentRepository().createIntentEnvelope(input);
}

export function recordMessageIntent(input: {
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
}) {
  return createChatIntentRepository().upsertMessageIntent(input);
}

export async function getMessageIntentById(intent_id: string) {
  const intent = await createChatIntentRepository().findMessageIntentById(intent_id);

  if (!intent) {
    throw new Error(`Intent not found for id ${intent_id}`);
  }

  return {
    ...intent,
    confidence: {
      score: intent.confidence_score,
      band: intent.confidence_band,
    },
  };
}
