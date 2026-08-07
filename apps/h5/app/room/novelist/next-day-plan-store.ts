import {
  LIFE_PLAN_MODES,
  type LifePlanMode,
  type LifeUtilityFactors,
  type NextDayPlanCandidate,
  type NextDayPlanDraft,
} from "@erliu/shared-contracts";
import { planFromDraft } from "./life-orchestration";
import { getDailyLifePlan, getLifeDayPlanByMode, type LifeDayPlan } from "./life-rhythm";

export const NEXT_DAY_PLAN_STORAGE_KEY = "novelist-next-day-plan-v1";

let memoryDraft: NextDayPlanDraft | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isLifePlanMode = (value: unknown): value is LifePlanMode =>
  typeof value === "string" && LIFE_PLAN_MODES.includes(value as LifePlanMode);

function isUtilityFactors(value: unknown): value is LifeUtilityFactors {
  if (!isRecord(value)) return false;
  return [
    "needUrgency",
    "taskContinuity",
    "personalityAffinity",
    "novelty",
    "executionCost",
    "cooldownPenalty",
  ].every((key) => isFiniteNumber(value[key]));
}

function isAuthoredCandidate(
  value: unknown,
  targetDay: number,
): value is NextDayPlanCandidate {
  if (!isRecord(value)
    || !isLifePlanMode(value.mode)
    || !isNonEmptyString(value.label)
    || !Array.isArray(value.beatIds)
    || !value.beatIds.every(isNonEmptyString)
    || !isUtilityFactors(value.utilityFactors)
    || !isFiniteNumber(value.ruleScore)) return false;

  const authored = getLifeDayPlanByMode(targetDay, value.mode);
  return value.label === authored.label
    && value.beatIds.length === authored.beats.length
    && value.beatIds.every((beatId, index) => beatId === authored.beats[index]?.id);
}

function parseDraft(value: unknown): NextDayPlanDraft | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== "life_runtime"
    || !isFiniteNumber(value.sourceDay)
    || !Number.isSafeInteger(value.sourceDay)
    || value.sourceDay < 1
    || !isFiniteNumber(value.targetDay)
    || !Number.isSafeInteger(value.targetDay)
    || value.targetDay !== value.sourceDay + 1
    || !isNonEmptyString(value.basisVersionId)
    || !isNonEmptyString(value.seed)
    || !isNonEmptyString(value.generatedAt)
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !["proposed", "validated", "committed", "fallback"].includes(String(value.status))
    || !Array.isArray(value.candidates)
    || value.candidates.length !== LIFE_PLAN_MODES.length
    || !value.candidates.every((candidate) => isAuthoredCandidate(candidate, Number(value.targetDay)))
    || !isLifePlanMode(value.selectedPlanMode)
    || !isRecord(value.resolution)
    || !["utility_seeded_top_band", "calendar_fallback"].includes(String(value.resolution.strategy))
    || !Array.isArray(value.resolution.topBandModes)
    || !value.resolution.topBandModes.every(isLifePlanMode)
    || !Array.isArray(value.resolution.reasonCodes)
    || !value.resolution.reasonCodes.every(isNonEmptyString)
    || !["rules_only", "rules_plus_model", "deterministic_fallback"].includes(String(value.provenance))) {
    return null;
  }

  const candidateModes = value.candidates.map((candidate) => (candidate as NextDayPlanCandidate).mode);
  if (new Set(candidateModes).size !== LIFE_PLAN_MODES.length
    || LIFE_PLAN_MODES.some((mode) => !candidateModes.includes(mode))
    || !candidateModes.includes(value.selectedPlanMode)) return null;

  return value as unknown as NextDayPlanDraft;
}

function readStoredValue(): unknown {
  if (typeof window === "undefined") return memoryDraft;
  try {
    const raw = window.localStorage.getItem(NEXT_DAY_PLAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadNextDayPlanDraft(): NextDayPlanDraft | null {
  return parseDraft(readStoredValue());
}

export function saveNextDayPlanDraft(draft: NextDayPlanDraft): NextDayPlanDraft | null {
  const parsed = parseDraft(draft);
  if (!parsed) return null;
  memoryDraft = parsed;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(NEXT_DAY_PLAN_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // A browser quota/private-mode failure must not stop the life runtime.
    }
  }
  return parsed;
}

export function commitNextDayPlanDraft(
  draft: NextDayPlanDraft,
): NextDayPlanDraft | null {
  return saveNextDayPlanDraft({ ...draft, status: "committed" });
}

export function resolveLifeDayPlan(
  dayIndex: number,
  draft: NextDayPlanDraft | null = loadNextDayPlanDraft(),
): { readonly plan: LifeDayPlan; readonly source: "committed" | "calendar" } {
  const normalizedDay = Number.isSafeInteger(dayIndex) ? Math.max(1, dayIndex) : 1;
  if (draft?.status === "committed" && draft.targetDay === normalizedDay) {
    return { plan: planFromDraft(draft), source: "committed" };
  }
  return { plan: getDailyLifePlan(normalizedDay), source: "calendar" };
}

export function clearNextDayPlanDraft(): void {
  memoryDraft = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NEXT_DAY_PLAN_STORAGE_KEY);
  } catch {
    // Clearing a best-effort local projection must remain non-fatal.
  }
}
