import { describe, expect, it } from "vitest";
import {
  evaluateManuscriptVerticalSlice,
  type ManuscriptVerticalSliceInput,
  type VerticalSlicePositionEvidence,
} from "./manuscript-vertical-slice";
import type {
  ManuscriptAnalysis,
  ManuscriptExpressionObservation,
  ManuscriptKnowledgeCard,
  ManuscriptStyleTechnique,
} from "./manuscript-import";

const chapterIds = [
  "chapter-opening",
  "chapter-conflict",
  "chapter-midpoint",
  "chapter-setup",
  "chapter-payoff",
];

function knowledgeCard(
  key: string,
  kind: ManuscriptKnowledgeCard["kind"],
  index: number,
): ManuscriptKnowledgeCard {
  return {
    key,
    label: "knowledge-" + String(index),
    kind,
    coreStatement: "The rule has a stable consequence.",
    sourceUse: "It gives the scene a concrete pressure.",
    dramaticTranslation: "The character must choose under that pressure.",
    misuseRisk: "Do not leave it as decorative terminology.",
    sourceChapterIds: [chapterIds[index % chapterIds.length]!],
  };
}

function technique(key: string, index: number): ManuscriptStyleTechnique {
  return {
    key,
    label: "technique-" + String(index),
    pattern: "Set up a readable expectation and reframe it from another angle.",
    evidence: "The scene records the expectation before the reframe.",
    useWhen: "When the reader understands the first plan.",
    risk: "Without setup it becomes arbitrary authorial mind-reading.",
    sourceChapterIds: [chapterIds[index % chapterIds.length]!],
  };
}

function expression(key: string, index: number): ManuscriptExpressionObservation {
  return {
    key,
    scope: "chapter",
    narrativeDistance: "Close to the active character.",
    pointOfViewPattern: "Action is filtered through a limited viewpoint.",
    sentenceLengthProfile: "Short sentences accelerate decisions.",
    paragraphDensity: "Dense at pressure points and open after release.",
    dialogueNarrationRatio: "Balanced.",
    actionPsychologyRatio: "Action leads and psychology explains the cost.",
    cadence: "A short hook closes the scene.",
    informationReleaseRate: "One meaningful reveal per scene.",
    chapterHookPattern: "An unanswered consequence pulls the next chapter.",
    toneSwitchPattern: "A brief dry contrast after tension.",
    languageDevices: ["reframing"],
    evidence: "The chapter uses the same rhythm at a traceable location.",
    misuseRisk: "Repeating the hook mechanically would flatten the rhythm.",
    sourceChapterIds: [chapterIds[index % chapterIds.length]!],
  };
}

function analysis(): ManuscriptAnalysis {
  const knowledgeCards = [
    knowledgeCard("cultivation-rule", "progression_rule", 0),
    knowledgeCard("ritual-motif", "culture_motif", 1),
    ...Array.from({ length: 22 }, (_, index) => knowledgeCard("knowledge-" + String(index), "world_rule", index + 2)),
  ];
  const styleTechniques = [
    technique("reframed-hope", 0),
    technique("delayed-cost", 1),
    technique("object-echo", 2),
    technique("dry-release", 3),
  ];
  const expressionObservations = chapterIds.map((chapterId, index) => expression("expression-" + String(index), index));
  return {
    genre: "cultivation",
    storyTitle: "A Test Manuscript",
    continuationBrief: "The next choice is constrained by the recovered rule.",
    nodes: [],
    edges: [],
    facts: [],
    memoryUpdates: [],
    choices: [],
    styleTechniques,
    knowledgeCards,
    expressionObservations,
    trace: {
      traceId: "trace-vertical-slice",
      provider: "test",
      model: "test-model",
      workflowVersion: "vnext.manuscript-import.v1",
      outputHash: "a".repeat(64),
    },
    fallbackApplied: false,
  };
}

function positions(): VerticalSlicePositionEvidence[] {
  return [
    {
      position: "opening",
      chapterIds: [chapterIds[0]!],
      summary: "The protagonist learns the cost of the first cultivation choice.",
      knowledgeKeys: ["cultivation-rule"],
      techniqueKeys: ["reframed-hope"],
      expressionKeys: ["expression-0"],
      choices: [{
        id: "choice-opening-rule",
        characterKey: "protagonist",
        driverKind: "system_rule",
        driverKey: "cultivation-rule",
        observedChoice: "Refuse the quick breakthrough.",
        counterfactual: "Without the rule, the quick breakthrough would be the obvious choice.",
        effectOnChoice: "The cost makes patience strategically necessary.",
        sourceChapterIds: [chapterIds[0]!],
      }],
    },
    {
      position: "first_conflict",
      chapterIds: [chapterIds[1]!],
      summary: "A rival uses the protagonist's ritual obligation against them.",
      knowledgeKeys: ["ritual-motif"],
      techniqueKeys: ["delayed-cost"],
      expressionKeys: ["expression-1"],
      choices: [{
        id: "choice-conflict-motif",
        characterKey: "protagonist",
        driverKind: "culture_motif",
        driverKey: "ritual-motif",
        observedChoice: "Protect the shrine before pursuing the rival.",
        counterfactual: "Without the motif, pursuit would outrank protection.",
        effectOnChoice: "The inherited obligation changes the order of action.",
        sourceChapterIds: [chapterIds[1]!],
      }],
    },
    {
      position: "midpoint_turn",
      chapterIds: [chapterIds[2]!],
      summary: "A revealed exception changes what the protagonist thinks winning means.",
      knowledgeKeys: ["knowledge-0"],
      techniqueKeys: ["object-echo"],
      expressionKeys: ["expression-2"],
    },
    {
      position: "pre_climax_setup",
      chapterIds: [chapterIds[3]!],
      summary: "The earlier promise is restated with a visible cost.",
      knowledgeKeys: ["knowledge-1"],
      techniqueKeys: ["dry-release"],
      expressionKeys: ["expression-3"],
    },
    {
      position: "climax_payoff",
      chapterIds: [chapterIds[4]!],
      summary: "The rule and motif jointly constrain the final answer.",
      knowledgeKeys: ["knowledge-2"],
      techniqueKeys: ["reframed-hope"],
      expressionKeys: ["expression-4"],
    },
  ];
}

function validInput(): ManuscriptVerticalSliceInput {
  return {
    manuscriptId: "manuscript-owned-test",
    genre: "cultivation",
    chapterIds,
    analysis: analysis(),
    positions: positions(),
    commitments: [{
      key: "first-promise",
      kind: "promise",
      status: "paid_off",
      setup: {
        position: "opening",
        chapterIds: [chapterIds[0]!],
        summary: "The first breakthrough will require a sacrifice.",
      },
      payoff: {
        position: "climax_payoff",
        chapterIds: [chapterIds[4]!],
        summary: "The protagonist chooses the sacrifice and earns the breakthrough.",
      },
    }],
    jokeUses: [{
      key: "dry-rival-joke",
      position: "first_conflict",
      dramaticFunction: "information_gap",
      rationale: "The rival's joke hides that they misunderstood the ritual.",
      repeatCount: 1,
      sourceChapterIds: [chapterIds[1]!],
    }],
    migrationTests: [{
      id: "migration-one",
      sourceTechniqueKey: "reframed-hope",
      targetPosition: "first_conflict",
      targetScene: "A courier predicts the council's plan before the protagonist reveals the map.",
      adaptationNote: "Keep the expectation-then-reframe function, but change the setting, conflict, characters, and imagery.",
      originalityNote: "The target scene is newly authored and does not reuse the source plot or wording.",
      preservesFunction: true,
      changesSurface: true,
      result: "passed",
    }],
  };
}

describe("manuscript vertical slice acceptance", () => {
  it("passes the cultivation fixture only when all five positions and cross-layer evidence are present", () => {
    const report = evaluateManuscriptVerticalSlice(validInput());

    expect(report.pass).toBe(true);
    expect(report.protocol).toBe("manuscript-vertical-slice.v1");
    expect(report.score).toEqual({ passed: 10, total: 10, ratio: 1 });
    expect(report.positions.every((position) => position.covered)).toBe(true);
    expect(report.checks.knowledgeCardVolume.observed).toBe(24);
    expect(report.checks.techniqueCardVolume.observed).toBe(4);
    expect(report.checks.systemRuleChangesChoice.passed).toBe(true);
    expect(report.checks.cultureMotifChangesChoice.passed).toBe(true);
    expect(report.checks.payoffRecall.passed).toBe(true);
  });

  it("rejects an apparently rich extraction when source chapter links are missing", () => {
    const input = validInput();
    input.analysis.knowledgeCards = input.analysis.knowledgeCards!.map((card) => (
      card.key === "cultivation-rule" ? { ...card, sourceChapterIds: [] } : card
    ));

    const report = evaluateManuscriptVerticalSlice(input);

    expect(report.pass).toBe(false);
    expect(report.checks.sourceTraceability.passed).toBe(false);
    expect(report.checks.sourceTraceability.evidence).toContain("knowledge:cultivation-rule:missing_source_chapter");
  });

  it("requires a system rule and a culture motif to change an evidenced choice", () => {
    const input = validInput();
    const opening = input.positions.find((position) => position.position === "opening")!;
    opening.choices = opening.choices!.map((choice) => (
      choice.id === "choice-opening-rule" ? { ...choice, driverKey: "ritual-motif" } : choice
    ));

    const report = evaluateManuscriptVerticalSlice(input);

    expect(report.pass).toBe(false);
    expect(report.checks.systemRuleChangesChoice.passed).toBe(false);
    expect(report.checks.cultureMotifChangesChoice.passed).toBe(true);
  });

  it("does not count an open promise as a climax payoff", () => {
    const input = validInput();
    input.commitments[0]!.status = "open";

    const report = evaluateManuscriptVerticalSlice(input);

    expect(report.checks.payoffRecall.passed).toBe(false);
    expect(report.blockers).toContain("payoffRecall:at least 1 paid-off commitment");
  });

  it("requires migration to preserve function while changing the surface", () => {
    const input = validInput();
    input.migrationTests[0]!.changesSurface = false;

    const report = evaluateManuscriptVerticalSlice(input);

    expect(report.pass).toBe(false);
    expect(report.checks.originalMigration.passed).toBe(false);
  });

  it("warns about joke frequency without treating a served joke as a blocker", () => {
    const input = validInput();
    input.jokeUses[0]!.repeatCount = 4;

    const report = evaluateManuscriptVerticalSlice(input);

    expect(report.checks.jokeUse.passed).toBe(true);
    expect(report.warnings).toContain("joke:dry-rival-joke:review_frequency");
  });
});
