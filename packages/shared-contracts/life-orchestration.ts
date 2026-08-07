export const LIFE_ORCHESTRATION_SCHEMA_VERSION = 1 as const;

export const LIFE_SUGGESTION_INTENTS = [
  "care",
  "nudge",
  "rest",
  "stuck",
] as const;

export type LifeSuggestionIntent =
  (typeof LIFE_SUGGESTION_INTENTS)[number];

export const LIFE_PLAN_MODES = [
  "steady-draft",
  "field-notes",
  "old-pages",
  "quiet-recovery",
  "wind-walk",
  "archive-echo",
  "slow-sunday",
] as const;

export type LifePlanMode = (typeof LIFE_PLAN_MODES)[number];

export type LifeMood =
  | "steady"
  | "energized"
  | "stuck"
  | "burdened"
  | "exhausted";

export interface MoodSnapshot {
  readonly schemaVersion: typeof LIFE_ORCHESTRATION_SCHEMA_VERSION;
  readonly source: "life_runtime";
  readonly basisVersionId: string;
  readonly observedAt: string;
  readonly sceneLabel: string;
  readonly activityLabel: string;
  readonly focus: number;
  readonly fatigue: number;
  readonly inspiration: number;
  readonly emotionalLoad: number;
  readonly mood: LifeMood;
  readonly signals: readonly string[];
}

export interface ContextualSuggestion {
  readonly intentId: LifeSuggestionIntent;
  readonly score: number;
  readonly reasonCodes: readonly string[];
  readonly reasonText: string;
  readonly editablePrefill: string;
}

export interface ContextualSuggestionSet {
  readonly schemaVersion: typeof LIFE_ORCHESTRATION_SCHEMA_VERSION;
  readonly source: "life_runtime";
  readonly basisVersionId: string;
  readonly lifeStateVersion: number;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly mood: MoodSnapshot;
  readonly provenance:
    | "rules_only"
    | "rules_plus_model"
    | "deterministic_fallback";
  readonly suggestions: readonly ContextualSuggestion[];
  readonly modelAttestation?: {
    readonly provider: string;
    readonly model: string;
    readonly profile: "deepseek";
    readonly fallbackApplied: false;
  };
}

export interface ContextualSuggestionModelRequest {
  readonly clientRequestId: string;
  /**
   * This is an untrusted browser observation. The server may rewrite copy for
   * the admitted intents, but it must not persist or execute it as life truth.
   */
  readonly suggestionSet: ContextualSuggestionSet;
}

export interface ContextualSuggestionModelResponse
  extends Omit<ContextualSuggestionSet, "provenance" | "modelAttestation"> {
  readonly provenance: "rules_plus_model";
  readonly modelAttestation: {
    readonly provider: string;
    readonly model: string;
    readonly profile: "deepseek";
    readonly fallbackApplied: false;
  };
}

export interface LifeUtilityFactors {
  readonly needUrgency: number;
  readonly taskContinuity: number;
  readonly personalityAffinity: number;
  readonly novelty: number;
  readonly executionCost: number;
  readonly cooldownPenalty: number;
}

export interface NextDayPlanCandidate {
  readonly mode: LifePlanMode;
  readonly label: string;
  readonly beatIds: readonly string[];
  readonly utilityFactors: LifeUtilityFactors;
  readonly ruleScore: number;
}

export interface NextDayPlanDraft {
  readonly schemaVersion: typeof LIFE_ORCHESTRATION_SCHEMA_VERSION;
  readonly source: "life_runtime";
  readonly sourceDay: number;
  readonly targetDay: number;
  readonly basisVersionId: string;
  readonly seed: string;
  readonly generatedAt: string;
  readonly status: "proposed" | "validated" | "committed" | "fallback";
  readonly candidates: readonly NextDayPlanCandidate[];
  readonly selectedPlanMode: LifePlanMode;
  readonly resolution: {
    readonly strategy: "utility_seeded_top_band" | "calendar_fallback";
    readonly topBandModes: readonly LifePlanMode[];
    readonly reasonCodes: readonly string[];
  };
  readonly provenance: "rules_only" | "rules_plus_model" | "deterministic_fallback";
  readonly modelAttestation?: {
    readonly provider: string;
    readonly model: string;
    readonly profile: "deepseek";
    readonly fallbackApplied: false;
  };
}
