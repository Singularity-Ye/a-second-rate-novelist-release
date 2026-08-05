export const ROOM_TURN_PLAN_SCHEMA_VERSION = 1 as const;

export const ROOM_TURN_DECISIONS = Object.freeze([
  "conversation",
  "submit_creative",
  "continue",
  "revise",
  "reject",
  "clarify",
] as const);

export type RoomTurnDecision = (typeof ROOM_TURN_DECISIONS)[number];

export const ROOM_TURN_TASK_KINDS = Object.freeze([
  "write_opening",
] as const);

export type RoomTurnTaskKind = (typeof ROOM_TURN_TASK_KINDS)[number];

/**
 * A model-proposed interpretation of one room turn. It is never authority to
 * mutate story state: the backend must still validate session ownership,
 * projection state, processing basis, moderation, and idempotency.
 */
export interface RoomTurnPlan {
  readonly schemaVersion: typeof ROOM_TURN_PLAN_SCHEMA_VERSION;
  readonly decision: RoomTurnDecision;
  readonly explicitAction: boolean;
  readonly confidence: number;
  readonly taskKind: RoomTurnTaskKind | null;
  /** Exact, bounded substrings copied from the current user message. */
  readonly evidenceSpans: readonly string[];
}
