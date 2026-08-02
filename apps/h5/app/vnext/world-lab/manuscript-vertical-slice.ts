import type {
  ManuscriptAnalysis,
  ManuscriptKnowledgeKind,
} from "./manuscript-import";

/**
 * A vertical slice is a small, deliberately distributed sample of a mature
 * manuscript. It is not a summary and it is not a canon import. Its job is
 * to prove that the distillation can explain how a story works at different
 * narrative pressures before the resulting cards are promoted to a library.
 */
export const VERTICAL_SLICE_POSITIONS = [
  "opening",
  "first_conflict",
  "midpoint_turn",
  "pre_climax_setup",
  "climax_payoff",
] as const;

export type VerticalSlicePosition = (typeof VERTICAL_SLICE_POSITIONS)[number];

export type VerticalSliceChoiceDriverKind = "system_rule" | "culture_motif";

export type VerticalSliceJokeFunction =
  | "character"
  | "pacing"
  | "information_gap"
  | "contrast"
  | "unserved";

export interface VerticalSliceChoiceEvidence {
  id: string;
  characterKey: string;
  driverKind: VerticalSliceChoiceDriverKind;
  driverKey: string;
  observedChoice: string;
  counterfactual: string;
  effectOnChoice: string;
  sourceChapterIds: string[];
}

export interface VerticalSlicePositionEvidence {
  position: VerticalSlicePosition;
  chapterIds: string[];
  summary: string;
  knowledgeKeys?: string[];
  techniqueKeys?: string[];
  expressionKeys?: string[];
  choices?: VerticalSliceChoiceEvidence[];
}

export interface VerticalSliceCommitment {
  key: string;
  kind: "foreshadowing" | "promise" | "mystery";
  status: "open" | "paid_off" | "abandoned";
  setup: {
    position: VerticalSlicePosition;
    chapterIds: string[];
    summary: string;
  };
  payoff?: {
    position: VerticalSlicePosition;
    chapterIds: string[];
    summary: string;
  };
}

export interface VerticalSliceJokeEvidence {
  key: string;
  position: VerticalSlicePosition;
  dramaticFunction: VerticalSliceJokeFunction;
  rationale: string;
  repeatCount: number;
  sourceChapterIds: string[];
}

/**
 * A migration test deliberately changes the surface situation while keeping
 * the narrative function. This guards against copying a source's plot,
 * names, or wording under the label of style learning.
 */
export interface VerticalSliceMigrationTest {
  id: string;
  sourceTechniqueKey: string;
  targetPosition: VerticalSlicePosition;
  targetScene: string;
  adaptationNote: string;
  originalityNote: string;
  preservesFunction: boolean;
  changesSurface: boolean;
  result: "passed" | "failed";
}

export interface ManuscriptVerticalSliceInput {
  manuscriptId: string;
  genre: string;
  chapterIds: string[];
  analysis: ManuscriptAnalysis;
  positions: VerticalSlicePositionEvidence[];
  commitments: VerticalSliceCommitment[];
  jokeUses: VerticalSliceJokeEvidence[];
  migrationTests: VerticalSliceMigrationTest[];
}

export interface VerticalSliceAcceptanceOptions {
  minKnowledgeCards?: number;
  maxKnowledgeCards?: number;
  minTechniqueCards?: number;
  maxTechniqueCards?: number;
  systemRuleKinds?: ManuscriptKnowledgeKind[];
  cultureMotifKinds?: ManuscriptKnowledgeKind[];
}

export type VerticalSliceCheckKey =
  | "positionCoverage"
  | "knowledgeCardVolume"
  | "techniqueCardVolume"
  | "expressionReport"
  | "sourceTraceability"
  | "systemRuleChangesChoice"
  | "cultureMotifChangesChoice"
  | "payoffRecall"
  | "jokeUse"
  | "originalMigration";

export interface VerticalSliceCheck {
  passed: boolean;
  observed: number;
  expected: string;
  evidence: string[];
}

export interface VerticalSlicePositionResult {
  position: VerticalSlicePosition;
  covered: boolean;
  chapterIds: string[];
  evidenceCount: number;
  issues: string[];
}

export interface VerticalSliceAcceptanceReport {
  protocol: "manuscript-vertical-slice.v1";
  manuscriptId: string;
  genre: string;
  pass: boolean;
  score: {
    passed: number;
    total: number;
    ratio: number;
  };
  positions: VerticalSlicePositionResult[];
  checks: Record<VerticalSliceCheckKey, VerticalSliceCheck>;
  blockers: string[];
  warnings: string[];
}

const POSITION_INDEX: Record<VerticalSlicePosition, number> = {
  opening: 0,
  first_conflict: 1,
  midpoint_turn: 2,
  pre_climax_setup: 3,
  climax_payoff: 4,
};

const DEFAULT_OPTIONS: Required<VerticalSliceAcceptanceOptions> = {
  minKnowledgeCards: 20,
  maxKnowledgeCards: 40,
  minTechniqueCards: 3,
  maxTechniqueCards: 8,
  systemRuleKinds: ["progression_rule"],
  cultureMotifKinds: ["culture_motif"],
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function nonEmpty(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function sourceProblems(
  label: string,
  sourceChapterIds: string[] | undefined,
  chapterIds: Set<string>,
) {
  const problems: string[] = [];
  if (!sourceChapterIds || sourceChapterIds.length === 0) {
    problems.push(label + ":missing_source_chapter");
    return problems;
  }
  for (const chapterId of sourceChapterIds) {
    if (!chapterIds.has(chapterId)) problems.push(label + ":unknown_source_chapter:" + chapterId);
  }
  return problems;
}

function check(
  passed: boolean,
  observed: number,
  expected: string,
  evidence: string[],
): VerticalSliceCheck {
  return { passed, observed, expected, evidence: unique(evidence) };
}

function positionEvidenceMap(positions: VerticalSlicePositionEvidence[]) {
  const byPosition = new Map<VerticalSlicePosition, VerticalSlicePositionEvidence>();
  const duplicatePositions: string[] = [];
  for (const position of positions) {
    if (byPosition.has(position.position)) {
      duplicatePositions.push(position.position);
      continue;
    }
    byPosition.set(position.position, position);
  }
  return { byPosition, duplicatePositions };
}

function positionLabel(position: VerticalSlicePosition) {
  return position;
}

export function evaluateManuscriptVerticalSlice(
  input: ManuscriptVerticalSliceInput,
  requestedOptions: VerticalSliceAcceptanceOptions = {},
): VerticalSliceAcceptanceReport {
  const options: Required<VerticalSliceAcceptanceOptions> = {
    ...DEFAULT_OPTIONS,
    ...requestedOptions,
    systemRuleKinds: requestedOptions.systemRuleKinds ?? DEFAULT_OPTIONS.systemRuleKinds,
    cultureMotifKinds: requestedOptions.cultureMotifKinds ?? DEFAULT_OPTIONS.cultureMotifKinds,
  };
  const chapterIds = new Set(input.chapterIds);
  const knowledgeByKey = new Map((input.analysis.knowledgeCards ?? []).map((card) => [card.key, card]));
  const techniqueByKey = new Map((input.analysis.styleTechniques ?? []).map((card) => [card.key, card]));
  const expressionByKey = new Map((input.analysis.expressionObservations ?? []).map((card) => [card.key, card]));
  const { byPosition, duplicatePositions } = positionEvidenceMap(input.positions);
  const traceabilityProblems: string[] = [];
  const warnings: string[] = [];

  if (duplicatePositions.length > 0) {
    traceabilityProblems.push(
      ...duplicatePositions.map((position) => "position:duplicate:" + position),
    );
  }

  for (const position of VERTICAL_SLICE_POSITIONS) {
    const evidence = byPosition.get(position);
    if (!evidence) {
      traceabilityProblems.push("position:missing:" + position);
      continue;
    }
    traceabilityProblems.push(
      ...sourceProblems("position:" + position, evidence.chapterIds, chapterIds),
    );
    if (!nonEmpty(evidence.summary)) traceabilityProblems.push("position:empty_summary:" + position);
    for (const key of evidence.knowledgeKeys ?? []) {
      if (!knowledgeByKey.has(key)) traceabilityProblems.push("position:" + position + ":unknown_knowledge:" + key);
    }
    for (const key of evidence.techniqueKeys ?? []) {
      if (!techniqueByKey.has(key)) traceabilityProblems.push("position:" + position + ":unknown_technique:" + key);
    }
    for (const key of evidence.expressionKeys ?? []) {
      if (!expressionByKey.has(key)) traceabilityProblems.push("position:" + position + ":unknown_expression:" + key);
    }
    for (const choice of evidence.choices ?? []) {
      traceabilityProblems.push(
        ...sourceProblems("choice:" + choice.id, choice.sourceChapterIds, chapterIds),
      );
      if (!nonEmpty(choice.characterKey)) traceabilityProblems.push("choice:" + choice.id + ":missing_character");
      if (!nonEmpty(choice.observedChoice)) traceabilityProblems.push("choice:" + choice.id + ":missing_observed_choice");
      if (!nonEmpty(choice.counterfactual)) traceabilityProblems.push("choice:" + choice.id + ":missing_counterfactual");
      if (!nonEmpty(choice.effectOnChoice)) traceabilityProblems.push("choice:" + choice.id + ":missing_effect");
      if (!knowledgeByKey.has(choice.driverKey)) traceabilityProblems.push("choice:" + choice.id + ":unknown_driver:" + choice.driverKey);
    }
  }

  for (const card of input.analysis.knowledgeCards ?? []) {
    traceabilityProblems.push(...sourceProblems("knowledge:" + card.key, card.sourceChapterIds, chapterIds));
  }
  for (const technique of input.analysis.styleTechniques ?? []) {
    traceabilityProblems.push(...sourceProblems("technique:" + technique.key, technique.sourceChapterIds, chapterIds));
  }
  for (const expression of input.analysis.expressionObservations ?? []) {
    traceabilityProblems.push(...sourceProblems("expression:" + expression.key, expression.sourceChapterIds, chapterIds));
  }

  for (const commitment of input.commitments) {
    traceabilityProblems.push(
      ...sourceProblems("commitment:" + commitment.key + ":setup", commitment.setup.chapterIds, chapterIds),
    );
    if (!nonEmpty(commitment.setup.summary)) traceabilityProblems.push("commitment:" + commitment.key + ":empty_setup");
    if (commitment.payoff) {
      traceabilityProblems.push(
        ...sourceProblems("commitment:" + commitment.key + ":payoff", commitment.payoff.chapterIds, chapterIds),
      );
      if (!nonEmpty(commitment.payoff.summary)) traceabilityProblems.push("commitment:" + commitment.key + ":empty_payoff");
    }
  }

  for (const joke of input.jokeUses) {
    traceabilityProblems.push(
      ...sourceProblems("joke:" + joke.key, joke.sourceChapterIds, chapterIds),
    );
    if (!nonEmpty(joke.rationale)) traceabilityProblems.push("joke:" + joke.key + ":missing_rationale");
    if (!Number.isInteger(joke.repeatCount) || joke.repeatCount < 1) {
      traceabilityProblems.push("joke:" + joke.key + ":invalid_repeat_count");
    }
    if (joke.repeatCount > 3) warnings.push("joke:" + joke.key + ":review_frequency");
  }

  for (const migration of input.migrationTests) {
    if (!techniqueByKey.has(migration.sourceTechniqueKey)) {
      traceabilityProblems.push("migration:" + migration.id + ":unknown_source_technique");
    }
    if (!nonEmpty(migration.targetScene)) traceabilityProblems.push("migration:" + migration.id + ":empty_target_scene");
    if (!nonEmpty(migration.adaptationNote)) traceabilityProblems.push("migration:" + migration.id + ":missing_adaptation_note");
    if (!nonEmpty(migration.originalityNote)) traceabilityProblems.push("migration:" + migration.id + ":missing_originality_note");
  }

  const positionResults = VERTICAL_SLICE_POSITIONS.map((position) => {
    const evidence = byPosition.get(position);
    const issues: string[] = [];
    if (!evidence) {
      issues.push("missing");
    } else {
      if (evidence.chapterIds.length === 0) issues.push("missing_chapters");
      if (!nonEmpty(evidence.summary)) issues.push("missing_summary");
      if (evidence.knowledgeKeys?.length === 0 && evidence.techniqueKeys?.length === 0 && evidence.expressionKeys?.length === 0 && evidence.choices?.length === 0) {
        issues.push("no_layer_evidence");
      }
    }
    return {
      position,
      covered: issues.length === 0,
      chapterIds: evidence?.chapterIds ? [...evidence.chapterIds] : [],
      evidenceCount: (evidence?.knowledgeKeys?.length ?? 0)
        + (evidence?.techniqueKeys?.length ?? 0)
        + (evidence?.expressionKeys?.length ?? 0)
        + (evidence?.choices?.length ?? 0),
      issues,
    };
  });

  const coveredPositionCount = positionResults.filter((result) => result.covered).length;
  const knowledgeCount = input.analysis.knowledgeCards?.length ?? 0;
  const techniqueCount = input.analysis.styleTechniques?.length ?? 0;
  const knowledgeVolume = check(
    knowledgeCount >= options.minKnowledgeCards && knowledgeCount <= options.maxKnowledgeCards,
    knowledgeCount,
    String(options.minKnowledgeCards) + "-" + String(options.maxKnowledgeCards),
    ["knowledge_cards:" + String(knowledgeCount)],
  );
  const techniqueVolume = check(
    techniqueCount >= options.minTechniqueCards && techniqueCount <= options.maxTechniqueCards,
    techniqueCount,
    String(options.minTechniqueCards) + "-" + String(options.maxTechniqueCards),
    ["technique_cards:" + String(techniqueCount)],
  );
  const positionCoverage = check(
    coveredPositionCount === VERTICAL_SLICE_POSITIONS.length,
    coveredPositionCount,
    String(VERTICAL_SLICE_POSITIONS.length),
    positionResults.filter((result) => result.covered).map((result) => positionLabel(result.position)),
  );

  const expressionCoveredPositions = VERTICAL_SLICE_POSITIONS.filter((position) => {
    const evidence = byPosition.get(position);
    return (evidence?.expressionKeys ?? []).length > 0
      && (evidence?.expressionKeys ?? []).every((key) => expressionByKey.has(key));
  });
  const expressionReport = check(
    expressionCoveredPositions.length === VERTICAL_SLICE_POSITIONS.length
      && (input.analysis.expressionObservations?.length ?? 0) > 0,
    expressionCoveredPositions.length,
    String(VERTICAL_SLICE_POSITIONS.length) + " positions with expression observations",
    expressionCoveredPositions.map(positionLabel),
  );

  const validSourceProblemCount = unique(traceabilityProblems).length;
  const sourceTraceability = check(
    validSourceProblemCount === 0,
    validSourceProblemCount,
    "0 traceability errors",
    unique(traceabilityProblems).slice(0, 20),
  );

  const choiceEvidence = input.positions.flatMap((position) => position.choices ?? []);
  const systemRuleChoices = choiceEvidence.filter((choice) => {
    const card = knowledgeByKey.get(choice.driverKey);
    return choice.driverKind === "system_rule"
      && card !== undefined
      && options.systemRuleKinds.includes(card.kind)
      && nonEmpty(choice.observedChoice)
      && nonEmpty(choice.counterfactual)
      && nonEmpty(choice.effectOnChoice)
      && choice.sourceChapterIds.length > 0;
  });
  const cultureMotifChoices = choiceEvidence.filter((choice) => {
    const card = knowledgeByKey.get(choice.driverKey);
    return choice.driverKind === "culture_motif"
      && card !== undefined
      && options.cultureMotifKinds.includes(card.kind)
      && nonEmpty(choice.observedChoice)
      && nonEmpty(choice.counterfactual)
      && nonEmpty(choice.effectOnChoice)
      && choice.sourceChapterIds.length > 0;
  });
  const systemRuleChangesChoice = check(
    systemRuleChoices.length > 0,
    systemRuleChoices.length,
    "at least 1 evidenced choice",
    systemRuleChoices.map((choice) => choice.id),
  );
  const cultureMotifChangesChoice = check(
    cultureMotifChoices.length > 0,
    cultureMotifChoices.length,
    "at least 1 evidenced choice",
    cultureMotifChoices.map((choice) => choice.id),
  );

  const paidOffCommitments = input.commitments.filter((commitment) => {
    if (commitment.status !== "paid_off" || !commitment.payoff) return false;
    return POSITION_INDEX[commitment.payoff.position] > POSITION_INDEX[commitment.setup.position]
      && nonEmpty(commitment.payoff.summary)
      && commitment.payoff.chapterIds.length > 0;
  });
  const payoffRecall = check(
    paidOffCommitments.length > 0,
    paidOffCommitments.length,
    "at least 1 paid-off commitment",
    paidOffCommitments.map((commitment) => commitment.key),
  );

  const servedJokes = input.jokeUses.filter((joke) => {
    return joke.dramaticFunction !== "unserved"
      && nonEmpty(joke.rationale)
      && joke.repeatCount > 0
      && joke.sourceChapterIds.length > 0;
  });
  const jokeUse = check(
    servedJokes.length > 0,
    servedJokes.length,
    "at least 1 joke with a dramatic function",
    servedJokes.map((joke) => joke.key + ":" + joke.dramaticFunction),
  );

  const passedMigrations = input.migrationTests.filter((migration) => {
    return migration.result === "passed"
      && techniqueByKey.has(migration.sourceTechniqueKey)
      && nonEmpty(migration.targetScene)
      && nonEmpty(migration.adaptationNote)
      && nonEmpty(migration.originalityNote)
      && migration.preservesFunction
      && migration.changesSurface;
  });
  const originalMigration = check(
    passedMigrations.length > 0,
    passedMigrations.length,
    "at least 1 passed migration test",
    passedMigrations.map((migration) => migration.id),
  );

  const checks: Record<VerticalSliceCheckKey, VerticalSliceCheck> = {
    positionCoverage,
    knowledgeCardVolume: knowledgeVolume,
    techniqueCardVolume: techniqueVolume,
    expressionReport,
    sourceTraceability,
    systemRuleChangesChoice,
    cultureMotifChangesChoice,
    payoffRecall,
    jokeUse,
    originalMigration,
  };
  const checkValues = Object.values(checks);
  const passedCount = checkValues.filter((item) => item.passed).length;
  const blockers = Object.entries(checks)
    .filter(([, item]) => !item.passed)
    .map(([key, item]) => key + ":" + item.expected);

  return {
    protocol: "manuscript-vertical-slice.v1",
    manuscriptId: input.manuscriptId,
    genre: input.genre,
    pass: passedCount === checkValues.length,
    score: {
      passed: passedCount,
      total: checkValues.length,
      ratio: checkValues.length === 0 ? 0 : passedCount / checkValues.length,
    },
    positions: positionResults,
    checks,
    blockers,
    warnings: unique(warnings),
  };
}

export const runManuscriptVerticalSliceAcceptance = evaluateManuscriptVerticalSlice;
