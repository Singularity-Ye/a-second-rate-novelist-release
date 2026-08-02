export type OnboardingStepKey =
  | "reading_archive"
  | "taste_archive"
  | "boundaries"
  | "collaboration_mode";

export type ReaderProfileCompletionState =
  | "collecting"
  | "resumable"
  | "confirm_pending"
  | "confirmed";

export interface ReaderProfileView {
  profile_id: string;
  account_id: string;
  reading_archive: {
    favorite_books: string[];
  };
  taste_archive: {
    relationship_preference: string[];
    pace: string;
    emotion: string;
    ending: string;
  };
  boundaries: {
    red_lines: string[];
  };
  collaboration_mode: "read_only" | "co_create" | "director";
  safety_mode: "default" | "minor_safe" | "strict";
  profile_status: "draft" | "confirmed" | "evolving" | "archived";
  last_confirmed_at: string | null;
  completion_status: {
    state: ReaderProfileCompletionState;
    captured_dimensions: OnboardingStepKey[];
    pending_dimensions: OnboardingStepKey[];
    conversation_cue: string | null;
  };
}
