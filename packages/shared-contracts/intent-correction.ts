import type {
  ChatIntentType,
  IntentConfidenceView,
  IntentCorrectionStateView,
  IntentRouteHint,
  IntentTargetObjectView,
} from "./chat-routing.js";
import type { ReaderProfileView } from "./reader-profile.js";

export interface ArchiveIntentItem {
  intent_id: string;
  intent_envelope_id: string;
  intent_type: ChatIntentType;
  message_text: string;
  ack_copy: string;
  target_type: string;
  target_id: string | null;
  target_label: string;
  target_object: IntentTargetObjectView;
  proposed_patch: Record<string, unknown> | null;
  confidence: IntentConfidenceView;
  route_hint: IntentRouteHint;
  correction_state: IntentCorrectionStateView;
  status: string;
  version_no: number;
}

export interface ArchiveIntentListResponse {
  items: ArchiveIntentItem[];
  next_cursor: string | null;
}

export interface ArchiveIntentPatchDocument {
  base_version?: number;
  reading_archive_patch?: {
    favorite_books_append?: string[];
  };
  taste_archive_patch?: {
    relationship_preference_append?: string[];
    pace?: string;
    emotion?: string;
    ending?: string;
  };
  boundaries_patch?: {
    red_lines_append?: string[];
  };
  collaboration_mode?: ReaderProfileView["collaboration_mode"];
}

export interface IntentCorrectionRequest {
  intent_id: string;
  new_target_type: string;
  new_target_id?: string | null;
  patch_document: ArchiveIntentPatchDocument;
  client_request_id: string;
}

export interface IntentCorrectionResponse {
  intent: ArchiveIntentItem;
  affected_objects: Array<{
    object_type: string;
    object_id: string;
  }>;
  replay_preview: {
    summary: string;
  };
}
