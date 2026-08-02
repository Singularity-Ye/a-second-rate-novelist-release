import type { ExperienceState } from "@erliu/shared-contracts/vnext-experience";

export const VNEXT_CREATIVE_TASK_KINDS = [
  "understand",
  "write_opening",
  "revise",
  "continue_story",
] as const;

export type VnextCreativeTaskKind = (typeof VNEXT_CREATIVE_TASK_KINDS)[number];

export interface ExperienceStateFacts {
  unreadPersistedDraft: boolean;
  activeTaskKinds: readonly VnextCreativeTaskKind[];
  awaitingClarification: boolean;
  retryableTaskVersionId: string | null;
  readinessBlocked: boolean;
  complianceBlocked: boolean;
}

export function reduceExperienceState(facts: ExperienceStateFacts): ExperienceState {
  if (facts.unreadPersistedDraft) {
    return "draft_ready";
  }
  if (facts.activeTaskKinds.includes("revise")) {
    return "revising";
  }
  if (
    facts.activeTaskKinds.includes("write_opening") ||
    facts.activeTaskKinds.includes("continue_story")
  ) {
    return "writing";
  }
  if (facts.activeTaskKinds.includes("understand")) {
    return "listening";
  }
  if (
    facts.retryableTaskVersionId !== null ||
    facts.readinessBlocked ||
    facts.complianceBlocked
  ) {
    return "unavailable";
  }
  if (facts.awaitingClarification) {
    return "listening";
  }
  return "available";
}
