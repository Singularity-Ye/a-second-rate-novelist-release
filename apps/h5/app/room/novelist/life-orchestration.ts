import {
  LIFE_PLAN_MODES,
  LIFE_SUGGESTION_INTENTS,
  type ContextualSuggestion,
  type ContextualSuggestionSet,
  type LifeMood,
  type LifePlanMode as SharedLifePlanMode,
  type LifeSuggestionIntent,
  type LifeUtilityFactors,
  type MoodSnapshot,
  type NextDayPlanCandidate,
  type NextDayPlanDraft,
} from "@erliu/shared-contracts";
import {
  getLifeDayPlanByMode,
  type LifeDayPlan,
  type LifePlanMode,
} from "./life-rhythm";

export interface LifeOrchestrationObservation {
  readonly sceneLabel: string;
  readonly activityLabel: string;
  readonly focus: number;
  readonly fatigue: number;
  readonly inspiration: number;
  readonly emotionalLoad: number;
}

export interface BuildContextualSuggestionInput {
  readonly observation: LifeOrchestrationObservation;
  readonly lifeStateVersion?: number;
  readonly now?: Date;
}

export interface BuildNextDayPlanInput {
  readonly sourceDay: number;
  readonly lifeStateVersion: number;
  readonly observation: LifeOrchestrationObservation;
  readonly now?: Date;
}

const suggestionTieOrder: Readonly<Record<LifeSuggestionIntent, number>> = {
  nudge: 0,
  care: 1,
  rest: 2,
  stuck: 3,
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const rounded = (value: number) => Math.round(clamp(value) * 10) / 10;
const finiteMetric = (value: number) => Number.isFinite(value) ? clamp(value) : 0;

function normalizedObservation(
  observation: LifeOrchestrationObservation,
): LifeOrchestrationObservation {
  return {
    sceneLabel: observation.sceneLabel.trim().slice(0, 80),
    activityLabel: observation.activityLabel.trim().slice(0, 80),
    focus: finiteMetric(observation.focus),
    fatigue: finiteMetric(observation.fatigue),
    inspiration: finiteMetric(observation.inspiration),
    emotionalLoad: finiteMetric(observation.emotionalLoad),
  };
}

function moodFor(observation: LifeOrchestrationObservation): LifeMood {
  if (observation.fatigue >= 82) return "exhausted";
  if (observation.emotionalLoad >= 72) return "burdened";
  if (observation.focus <= 38 || observation.inspiration <= 32) return "stuck";
  if (
    observation.focus >= 72 &&
    observation.inspiration >= 68 &&
    observation.fatigue < 50 &&
    observation.emotionalLoad < 55
  ) return "energized";
  return "steady";
}

function moodSignals(observation: LifeOrchestrationObservation) {
  const signals: string[] = [];
  if (observation.fatigue >= 72) signals.push("fatigue_high");
  if (observation.emotionalLoad >= 68) signals.push("emotional_load_high");
  if (observation.focus <= 42) signals.push("focus_low");
  if (observation.inspiration <= 38) signals.push("inspiration_low");
  if (observation.focus >= 72) signals.push("focus_ready");
  if (observation.inspiration >= 68) signals.push("inspiration_ready");
  if (signals.length === 0) signals.push("steady");
  return signals;
}

function stableBasisVersion(
  observation: LifeOrchestrationObservation,
  lifeStateVersion: number,
) {
  const revision = Number.isSafeInteger(lifeStateVersion)
    ? Math.max(0, lifeStateVersion)
    : 0;
  return [
    "life-runtime",
    revision,
    Math.round(observation.focus),
    Math.round(observation.fatigue),
    Math.round(observation.inspiration),
    Math.round(observation.emotionalLoad),
  ].join(":");
}

export function buildMoodSnapshot(
  input: BuildContextualSuggestionInput,
): MoodSnapshot {
  const observation = normalizedObservation(input.observation);
  const lifeStateVersion = input.lifeStateVersion ?? 0;
  const now = input.now ?? new Date();
  return {
    schemaVersion: 1,
    source: "life_runtime",
    basisVersionId: stableBasisVersion(observation, lifeStateVersion),
    observedAt: now.toISOString(),
    ...observation,
    mood: moodFor(observation),
    signals: moodSignals(observation),
  };
}

function suggestionScore(
  intent: LifeSuggestionIntent,
  observation: LifeOrchestrationObservation,
) {
  const writing = /写|draft|writing/iu.test(observation.activityLabel);
  const scores: Record<LifeSuggestionIntent, number> = {
    care:
      22 + observation.emotionalLoad * 0.56 + observation.fatigue * 0.2
      + (100 - observation.focus) * 0.08,
    nudge:
      12 + observation.focus * 0.43 + observation.inspiration * 0.36
      - observation.fatigue * 0.34 - observation.emotionalLoad * 0.22
      + (writing ? 10 : 0),
    rest:
      6 + observation.fatigue * 0.78 + observation.emotionalLoad * 0.16
      - observation.inspiration * 0.08,
    stuck:
      10 + (100 - observation.focus) * 0.42
      + (100 - observation.inspiration) * 0.4
      + observation.emotionalLoad * 0.08,
  };
  if (observation.fatigue >= 82) {
    scores.rest = 100;
    scores.nudge = Math.min(scores.nudge, 24);
  }
  if (observation.emotionalLoad >= 78) {
    scores.care = Math.max(scores.care, 96);
    scores.nudge = Math.min(scores.nudge, 28);
  }
  return rounded(scores[intent]);
}

function contextualCopy(
  intent: LifeSuggestionIntent,
  observation: LifeOrchestrationObservation,
): Pick<ContextualSuggestion, "reasonCodes" | "reasonText" | "editablePrefill"> {
  if (intent === "rest") {
    if (observation.fatigue >= 82) return {
      reasonCodes: ["fatigue_urgent"],
      reasonText: "疲劳已经很高，先允许停笔",
      editablePrefill: "你今天已经很累了，先休息吧。暂停不算失败，明天再接着来。",
    };
    return {
      reasonCodes: ["recovery_window"],
      reasonText: "留一个恢复窗口，避免硬撑",
      editablePrefill: "要不要先休息一会儿？不用靠硬撑证明今天有进度。",
    };
  }
  if (intent === "care") {
    if (observation.emotionalLoad >= 72) return {
      reasonCodes: ["emotional_load_high"],
      reasonText: "情绪负荷偏高，先确认状态",
      editablePrefill: "你今天心里似乎有点重。先不催稿，愿意跟我说说吗？",
    };
    return {
      reasonCodes: ["relationship_check_in"],
      reasonText: "先问问近况，不把聊天变催稿",
      editablePrefill: "先不谈交稿。你现在感觉怎么样，最需要我帮你守住什么？",
    };
  }
  if (intent === "stuck") {
    if (observation.focus <= 42 || observation.inspiration <= 38) return {
      reasonCodes: [
        observation.focus <= 42 ? "focus_low" : "inspiration_low",
      ],
      reasonText: "专注或灵感偏低，先拆一个卡点",
      editablePrefill: "先不要求交稿。你现在最难下笔的是哪一处？我们只拆这一处。",
    };
    return {
      reasonCodes: ["clarify_blocker"],
      reasonText: "把阻力说清，再决定怎么推进",
      editablePrefill: "你现在最卡的是哪一句？先把阻力说清，不急着扩大任务。",
    };
  }
  if (
    observation.focus >= 72 &&
    observation.inspiration >= 68 &&
    observation.fatigue < 60
  ) return {
    reasonCodes: ["focus_ready", "inspiration_ready"],
    reasonText: "状态接得上，可以推进一小步",
    editablePrefill: "你现在状态还接得上。继续写吧，只完成一个具体动作就好。",
  };
  return {
    reasonCodes: ["bounded_progress"],
    reasonText: "只推进一小步，不扩大任务",
    editablePrefill: "如果还写得动，就只完成一个具体动作，写完我们再看下一步。",
  };
}

export function buildContextualSuggestionSet(
  input: BuildContextualSuggestionInput,
): ContextualSuggestionSet {
  const observation = normalizedObservation(input.observation);
  const lifeStateVersion = Number.isSafeInteger(input.lifeStateVersion)
    ? Math.max(0, input.lifeStateVersion ?? 0)
    : 0;
  const now = input.now ?? new Date();
  const mood = buildMoodSnapshot({
    observation,
    lifeStateVersion,
    now,
  });
  const suggestions = LIFE_SUGGESTION_INTENTS.map((intentId) => ({
    intentId,
    score: suggestionScore(intentId, observation),
    ...contextualCopy(intentId, observation),
  })).sort((left, right) =>
    right.score - left.score
    || suggestionTieOrder[left.intentId] - suggestionTieOrder[right.intentId]);

  return {
    schemaVersion: 1,
    source: "life_runtime",
    basisVersionId: mood.basisVersionId,
    lifeStateVersion,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    mood,
    provenance: "rules_only",
    suggestions,
  };
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function candidateFactors(
  mode: SharedLifePlanMode,
  observation: LifeOrchestrationObservation,
): LifeUtilityFactors {
  const lowFocus = 100 - observation.focus;
  const lowInspiration = 100 - observation.inspiration;
  const recoveryNeed = Math.max(observation.fatigue, observation.emotionalLoad);
  const factors: Record<SharedLifePlanMode, LifeUtilityFactors> = {
    "steady-draft": {
      needUrgency: (100 - recoveryNeed) * 0.2,
      taskContinuity: observation.focus * 0.9,
      personalityAffinity: observation.inspiration * 0.55,
      novelty: 28,
      executionCost: observation.fatigue * 0.55,
      cooldownPenalty: observation.emotionalLoad * 0.18,
    },
    "field-notes": {
      needUrgency: lowInspiration * 0.48,
      taskContinuity: observation.focus * 0.34,
      personalityAffinity: 52,
      novelty: 68,
      executionCost: observation.fatigue * 0.34,
      cooldownPenalty: 8,
    },
    "old-pages": {
      needUrgency: lowInspiration * 0.32,
      taskContinuity: observation.focus * 0.52,
      personalityAffinity: 58,
      novelty: 46,
      executionCost: observation.fatigue * 0.24,
      cooldownPenalty: observation.emotionalLoad * 0.12,
    },
    "quiet-recovery": {
      needUrgency: recoveryNeed * 0.92,
      taskContinuity: 24,
      personalityAffinity: 48,
      novelty: 22,
      executionCost: 8,
      cooldownPenalty: 0,
    },
    "wind-walk": {
      needUrgency: Math.max(lowInspiration, observation.emotionalLoad) * 0.55,
      taskContinuity: observation.focus * 0.28,
      personalityAffinity: 60,
      novelty: 72,
      executionCost: observation.fatigue * 0.3,
      cooldownPenalty: 6,
    },
    "archive-echo": {
      needUrgency: lowInspiration * 0.38,
      taskContinuity: observation.focus * 0.58,
      personalityAffinity: 62,
      novelty: 50,
      executionCost: observation.fatigue * 0.25,
      cooldownPenalty: observation.emotionalLoad * 0.12,
    },
    "slow-sunday": {
      needUrgency: recoveryNeed * 0.72 + lowFocus * 0.18,
      taskContinuity: 18,
      personalityAffinity: 54,
      novelty: 38,
      executionCost: 4,
      cooldownPenalty: 0,
    },
  };
  return factors[mode];
}

function candidateScore(factors: LifeUtilityFactors) {
  return rounded(
    factors.needUrgency * 0.42
    + factors.taskContinuity * 0.28
    + factors.personalityAffinity * 0.14
    + factors.novelty * 0.16
    - factors.executionCost * 0.38
    - factors.cooldownPenalty * 0.3,
  );
}

function candidateFor(
  sourceDay: number,
  mode: SharedLifePlanMode,
  observation: LifeOrchestrationObservation,
): NextDayPlanCandidate {
  const plan = getLifeDayPlanByMode(sourceDay + 1, mode as LifePlanMode);
  const utilityFactors = candidateFactors(mode, observation);
  return {
    mode,
    label: plan.label,
    beatIds: plan.beats.map((beat) => beat.id),
    utilityFactors,
    ruleScore: candidateScore(utilityFactors),
  };
}

export function buildNextDayPlanDraft(
  input: BuildNextDayPlanInput,
): NextDayPlanDraft {
  const observation = normalizedObservation(input.observation);
  const sourceDay = Number.isSafeInteger(input.sourceDay)
    ? Math.max(1, input.sourceDay)
    : 1;
  const targetDay = sourceDay + 1;
  const now = input.now ?? new Date();
  const basisVersionId = stableBasisVersion(
    observation,
    input.lifeStateVersion,
  );
  const seed = `${sourceDay}:${targetDay}:${basisVersionId}`;
  const candidates = LIFE_PLAN_MODES.map((mode) =>
    candidateFor(sourceDay, mode, observation));
  const maximum = Math.max(...candidates.map((candidate) => candidate.ruleScore));
  const topBand = candidates.filter((candidate) => candidate.ruleScore >= maximum - 8);
  const selected = topBand[stableHash(seed) % topBand.length]
    ?? candidates[0]!;
  const mood = moodFor(observation);
  return {
    schemaVersion: 1,
    source: "life_runtime",
    sourceDay,
    targetDay,
    basisVersionId,
    seed,
    generatedAt: now.toISOString(),
    status: "validated",
    candidates,
    selectedPlanMode: selected.mode,
    resolution: {
      strategy: "utility_seeded_top_band",
      topBandModes: topBand.map((candidate) => candidate.mode),
      reasonCodes: [
        `mood:${mood}`,
        ...moodSignals(observation),
      ],
    },
    provenance: "rules_only",
  };
}

export function planFromDraft(draft: NextDayPlanDraft): LifeDayPlan {
  return getLifeDayPlanByMode(
    draft.targetDay,
    draft.selectedPlanMode as LifePlanMode,
  );
}
