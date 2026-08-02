import { createHash } from "node:crypto";
import {
  SPOILER_SAFE_MECHANISM_CORE_PACK_V1,
  type SpoilerSafeMechanismCard,
} from "./spoiler-safe-mechanism-core-pack.v1.js";

export type SpoilerSafeMechanismMode = "off" | "shadow" | "active";
export type SpoilerSafeMechanismWorkflow =
  | "opening"
  | "revise"
  | "continue";

export interface SpoilerSafeMechanismRuntimeConfig {
  readonly mode: SpoilerSafeMechanismMode;
  readonly retrievalLimit: number;
}

export interface MechanismPromptCard {
  readonly candidateId: string;
  readonly role: "primary" | "secondary";
  readonly instruction: string;
  readonly estimatedTokens: number;
}

export interface MechanismPromptGuidance {
  readonly protocol: "spoiler-safe-mechanism-guidance.v1";
  readonly truthStatus: "candidate";
  readonly reviewStatus: "pending";
  readonly instruction: string;
  readonly selectedMechanisms: readonly MechanismPromptCard[];
  readonly qualityGates: typeof SPOILER_SAFE_MECHANISM_CORE_PACK_V1.qualityGates;
}

export interface MechanismSelectionAuditRecord {
  readonly protocol: "spoiler-safe-mechanism-selection-audit.v1";
  readonly sourcePackSha256: string;
  readonly mode: Exclude<SpoilerSafeMechanismMode, "off">;
  readonly workflow: SpoilerSafeMechanismWorkflow;
  readonly storyScopeHash: string;
  readonly candidateId: readonly string[];
  readonly queryIntent: readonly string[];
  readonly selectedBecause: readonly {
    readonly candidateId: string;
    readonly role: "primary" | "secondary";
    readonly score: number;
    readonly reasons: readonly string[];
  }[];
  readonly rejectedAlternatives: readonly {
    readonly candidateId: string;
    readonly reason:
      | "cooldown"
      | "high_risk_family_cap"
      | "duplicate_family"
      | "role_cap"
      | "outside_retrieval_budget";
  }[];
  readonly promptBudget: {
    readonly retrievalLimit: number;
    readonly hardMaxRetrieve: number;
    readonly selectedCount: number;
    readonly maxSelectedCount: 2;
    readonly perCardTokenLimit: 260;
    readonly perCardEstimatedTokens: readonly {
      readonly candidateId: string;
      readonly estimatedTokens: number;
    }[];
    readonly sharedGateEstimatedTokens: number;
  };
  readonly cooldownDecision: readonly {
    readonly candidateId: string;
    readonly decision: "eligible" | "blocked";
    readonly remainingSelectionTurns: number;
    readonly scope: "adapter_process";
  }[];
  readonly stateIncrementCoverage: readonly [
    "belief",
    "confidence",
    "option",
    "risk",
    "emotion",
    "action",
  ];
  readonly reversibleCostDiscount: "required_before_cost_claim";
  readonly borrowedInformation: "not_native_intelligence_or_moral_superiority";
  readonly opponentUpdate: "observe_then_revalue_then_change_method_or_win_condition";
  readonly harmProximityDecision: "victim_weight_must_survive_adjacent_humor";
  readonly gateDecision:
    | "active_injected"
    | "shadow_observed"
    | "skipped_no_eligible_candidate";
  readonly outputTraceId: string;
}

export interface PreparedMechanismSelection {
  readonly mode: Exclude<SpoilerSafeMechanismMode, "off">;
  readonly workflow: SpoilerSafeMechanismWorkflow;
  readonly storyScopeHash: string;
  readonly sequence: number;
  readonly selectedCandidateIds: readonly string[];
  readonly guidance: MechanismPromptGuidance | null;
  readonly auditWithoutTrace: Omit<
    MechanismSelectionAuditRecord,
    "outputTraceId"
  >;
}

export type MechanismSelectionAuditSink = (
  record: MechanismSelectionAuditRecord,
) => void | Promise<void>;

export interface SpoilerSafeMechanismRuntimeOptions {
  readonly config: SpoilerSafeMechanismRuntimeConfig;
  readonly auditSink?: MechanismSelectionAuditSink;
}

interface ScoredCard {
  readonly card: SpoilerSafeMechanismCard;
  readonly score: number;
  readonly matchedSignals: readonly string[];
  readonly workflowAffinity: boolean;
}

interface StoryCooldownState {
  sequence: number;
  readonly lastSuccessfulSelection: Map<string, number>;
}

const MODE_ENV = "VNEXT_SPOILER_SAFE_MECHANISM_MODE";
const RETRIEVAL_ENV = "VNEXT_SPOILER_SAFE_MECHANISM_RETRIEVAL_LIMIT";
const ACTIVE_APPROVAL_ENV =
  "VNEXT_SPOILER_SAFE_MECHANISM_ACTIVE_APPROVED";
const STATE_INCREMENT_COVERAGE = [
  "belief",
  "confidence",
  "option",
  "risk",
  "emotion",
  "action",
] as const;
const HIGH_RISK: ReadonlySet<string> = new Set<string>(
  SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract.highRiskCandidateIds,
);
const WORKFLOW_AFFINITY: Readonly<
  Record<SpoilerSafeMechanismWorkflow, ReadonlySet<string>>
> = {
  opening: new Set([
    "dual_purpose_action",
    "constraint_driven_choice",
    "falsifiable_reasoning",
    "constraint_comedy",
  ]),
  revise: new Set([
    "falsifiable_reasoning",
    "evidence_reconstruction",
    "constraint_driven_choice",
    "constraint_comedy",
  ]),
  continue: new Set([
    "premise_reversal",
    "dual_purpose_action",
    "scale_recontextualization",
    "evidence_reconstruction",
    "distributed_causality",
  ]),
};

const PRIVATE_DRAFT_CONSTRAINTS: Readonly<Record<string, string>> = {
  K01: "让既有方案因一个早已露过痕迹的前提发生变化；保留此前投入，并让当事人亲自止损、改路或承担坚持的代价。",
  K02: "先让读者从现场看见变化，再让尚不知情的人依照旧判断行事；他一旦得到消息就应立刻更新，不能靠装傻续戏。",
  K03: "让同一行动先产生真实的表层好处，同时留下它还在服务另一目的的痕迹；受影响的人仍能怀疑、还价或离开。",
  K04: "让人物依据早已成立的身份、旧事、价值或关系作出两难决定；两个方向都要真有代价，不能像被作者按下按钮。",
  K05: "让现场同时容得下两种说法；人物做一件顺手且有成本的小事分辨它们，结果逼他放弃其中一种说法并改变下一步。",
  K06: "先让人物凭自己的判断完成一个确实成立的局部目标，再显出更大范围的余波；不得抹掉已经付出的努力与所得。",
  K07: "让至少两个旧细节在新事实出现后获得另一种连贯解释，并立即改变当下行动；不能靠旁白承认从前故意撒谎。",
  K08: "让人物确实得到一项好处，再从早有痕迹的具体用途显出给予者的另一层目的；人物仍能利用、谈判、规避或退出。",
  K09: "公开冲突必须有真实胜负与后果，同时让早已露头的另一目标借同一段时间或资源兑现；主线人物的努力不能沦为烟幕。",
  K10: "让人物在对抗中冒险试出能力的一小段边界，只得到不完整结论；对手可以察觉并改变表现，所得日后还须独立兑现。",
  K11: "让不同地点的人各自作出成立的选择，再由共同资源或规则造成可追溯的延迟后果；主角不能预知并导演所有人。",
  K12: "让至少三项早已生效的限制逐个封死常规办法，最后由人物主动接受一个荒诞却守规矩的办法及其代价。",
};

const PRIVATE_PROSE_GUARDS = [
  "这些约束只用于正文外的静默推演；最终只交付故事，不解释推演、卡片、结构、步骤或评分标准。",
  "把因果写成人看见什么、误信什么、做了什么以及付出什么；动作已经说明的事不要再用抽象词总结。",
  "句子要有呼吸，不把品质拆成口号式短句，不逐条报数，也不直接宣布谁聪明、谁各有利益。",
  "前置条件不够时宁可不用；不得为了兑现约束而空降能力、规则、巧合或作者全知。",
] as const;

export function renderSpoilerSafeMechanismSystemAddon(
  guidance: MechanismPromptGuidance,
) {
  const constraints = guidance.selectedMechanisms.map(
    (item) => item.instruction,
  );
  return [
    "Private drafting constraints follow. Apply them silently and never quote or explain them.",
    ...constraints,
    ...PRIVATE_PROSE_GUARDS,
  ].join("\n");
}

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function codePoints(value: string) {
  return Array.from(value).length;
}

// Conservatively count every Unicode code point as one token. This deliberately
// overestimates most Latin text and keeps Chinese guidance below the card budget.
function estimatedTokens(value: string) {
  return codePoints(value);
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${RETRIEVAL_ENV} must be a positive integer`);
  }
  return parsed;
}

export function readSpoilerSafeMechanismRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): SpoilerSafeMechanismRuntimeConfig {
  const rawMode = env[MODE_ENV]?.trim().toLowerCase() || "off";
  if (rawMode !== "off" && rawMode !== "shadow" && rawMode !== "active") {
    throw new Error(`${MODE_ENV} must be off, shadow, or active`);
  }
  if (
    rawMode === "active" &&
    env[ACTIVE_APPROVAL_ENV]?.trim().toLowerCase() !== "true"
  ) {
    throw new Error(
      `${ACTIVE_APPROVAL_ENV} must be true after a recorded quality approval`,
    );
  }
  const retrievalLimit = nonNegativeInteger(
    env[RETRIEVAL_ENV],
    SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract.defaultRetrieve,
  );
  if (
    retrievalLimit >
    SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract.hardMaxRetrieve
  ) {
    throw new Error(
      `${RETRIEVAL_ENV} exceeds the spoiler-safe hard maximum`,
    );
  }
  return { mode: rawMode, retrievalLimit };
}

function scoreCard(
  card: SpoilerSafeMechanismCard,
  query: string,
  workflow: SpoilerSafeMechanismWorkflow,
): ScoredCard {
  const matchedSignals = card.signals.filter((signal) =>
    query.includes(normalized(signal)),
  );
  const matchedTags = card.intentTags.filter((tag) =>
    query.includes(normalized(tag)),
  );
  const workflowAffinity = WORKFLOW_AFFINITY[workflow].has(card.family);
  return {
    card,
    matchedSignals,
    workflowAffinity,
    score:
      card.independentScore +
      matchedSignals.length * 18 +
      matchedTags.length * 12 +
      (workflowAffinity ? 7 : 0),
  };
}

function byScore(left: ScoredCard, right: ScoredCard) {
  return (
    right.score - left.score ||
    left.card.candidateId.localeCompare(right.card.candidateId)
  );
}

function renderPromptCard(card: SpoilerSafeMechanismCard) {
  const instruction = PRIVATE_DRAFT_CONSTRAINTS[card.candidateId];
  if (instruction === undefined) {
    throw new Error(
      `mechanism card ${card.candidateId} has no private draft constraint`,
    );
  }
  const tokens = estimatedTokens(instruction);
  if (
    tokens >
    SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract
      .promptBudgetTokensPerCard
  ) {
    throw new Error(`mechanism card ${card.candidateId} exceeds prompt budget`);
  }
  return { instruction, estimatedTokens: tokens };
}

function sharedGateTokens() {
  return estimatedTokens(
    Object.values(SPOILER_SAFE_MECHANISM_CORE_PACK_V1.qualityGates)
      .flat()
      .join("\n"),
  );
}

function storyScopeHash(storyKey: string) {
  return createHash("sha256").update(storyKey).digest("hex").slice(0, 24);
}

function reasonForSelection(candidate: ScoredCard) {
  const reasons = candidate.matchedSignals.map((signal) =>
    `intent:${signal}`,
  );
  if (candidate.workflowAffinity) reasons.push("workflow_affinity");
  if (reasons.length === 0) reasons.push("independent_score");
  return reasons;
}

function compactIntent(scored: readonly ScoredCard[], workflow: string) {
  const signals = scored
    .flatMap((candidate) => candidate.matchedSignals)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 8);
  return signals.length > 0 ? signals : [`workflow:${workflow}`];
}

export function writeSpoilerSafeMechanismAuditToStdout(
  record: MechanismSelectionAuditRecord,
) {
  process.stdout.write(
    `${JSON.stringify({
      event: "spoiler_safe_mechanism_selection",
      ...record,
    })}\n`,
  );
}

export class SpoilerSafeMechanismRuntime {
  private readonly config: SpoilerSafeMechanismRuntimeConfig;
  private readonly auditSink: MechanismSelectionAuditSink;
  private readonly cooldownByStory = new Map<string, StoryCooldownState>();
  private readonly completed = new WeakSet<object>();

  constructor(options: SpoilerSafeMechanismRuntimeOptions) {
    if (
      !Number.isSafeInteger(options.config.retrievalLimit) ||
      options.config.retrievalLimit < 1 ||
      options.config.retrievalLimit >
        SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract.hardMaxRetrieve
    ) {
      throw new Error("invalid spoiler-safe mechanism retrieval limit");
    }
    this.config = options.config;
    this.auditSink = options.auditSink ?? (() => undefined);
  }

  prepare(input: {
    readonly workflow: SpoilerSafeMechanismWorkflow;
    readonly storyKey: string;
    readonly query: string;
  }): PreparedMechanismSelection | null {
    if (this.config.mode === "off") return null;
    const mode = this.config.mode;
    const scopeHash = storyScopeHash(input.storyKey);
    const state = this.cooldownByStory.get(scopeHash) ?? {
      sequence: 0,
      lastSuccessfulSelection: new Map<string, number>(),
    };
    state.sequence += 1;
    this.cooldownByStory.set(scopeHash, state);

    const query = normalized(input.query);
    const pool = SPOILER_SAFE_MECHANISM_CORE_PACK_V1.cards.filter(
      (card) => mode === "shadow" || card.runtimeTier === "starter_candidate",
    );
    const scored = pool.map((card) => scoreCard(card, query, input.workflow));
    scored.sort(byScore);

    const cooldownDecision = scored.map((candidate) => {
      const last = state.lastSuccessfulSelection.get(candidate.card.candidateId);
      const elapsed = last === undefined ? Number.POSITIVE_INFINITY : state.sequence - last;
      const remaining =
        last === undefined
          ? 0
          : Math.max(0, candidate.card.cooldownTurns - elapsed + 1);
      return {
        candidateId: candidate.card.candidateId,
        decision: remaining > 0 ? ("blocked" as const) : ("eligible" as const),
        remainingSelectionTurns: remaining,
        scope: "adapter_process" as const,
      };
    });
    const cooldownById = new Map(
      cooldownDecision.map((decision) => [decision.candidateId, decision]),
    );
    const eligible = scored.filter(
      (candidate) =>
        cooldownById.get(candidate.card.candidateId)?.decision === "eligible",
    );
    const retrieved = eligible.slice(0, this.config.retrievalLimit);
    const selected: Array<{
      readonly candidate: ScoredCard;
      readonly role: "primary" | "secondary";
    }> = [];
    const rejectedAlternatives: Array<
      MechanismSelectionAuditRecord["rejectedAlternatives"][number]
    > = [];
    let highRiskSelected = false;
    const selectedFamilies = new Set<string>();

    for (const candidate of retrieved) {
      if (selected.length >= 2) {
        rejectedAlternatives.push({
          candidateId: candidate.card.candidateId,
          reason: "role_cap",
        });
        continue;
      }
      if (HIGH_RISK.has(candidate.card.candidateId) && highRiskSelected) {
        rejectedAlternatives.push({
          candidateId: candidate.card.candidateId,
          reason: "high_risk_family_cap",
        });
        continue;
      }
      if (selectedFamilies.has(candidate.card.family)) {
        rejectedAlternatives.push({
          candidateId: candidate.card.candidateId,
          reason: "duplicate_family",
        });
        continue;
      }
      const role = selected.length === 0 ? "primary" : "secondary";
      selected.push({ candidate, role });
      selectedFamilies.add(candidate.card.family);
      if (HIGH_RISK.has(candidate.card.candidateId)) highRiskSelected = true;
    }

    for (const decision of cooldownDecision) {
      if (
        decision.decision === "blocked" &&
        rejectedAlternatives.length < this.config.retrievalLimit
      ) {
        rejectedAlternatives.push({
          candidateId: decision.candidateId,
          reason: "cooldown",
        });
      }
    }
    for (const candidate of eligible.slice(this.config.retrievalLimit)) {
      if (rejectedAlternatives.length >= this.config.retrievalLimit + 2) break;
      rejectedAlternatives.push({
        candidateId: candidate.card.candidateId,
        reason: "outside_retrieval_budget",
      });
    }

    const promptCards: MechanismPromptCard[] = selected.map(
      ({ candidate, role }) => {
        const rendered = renderPromptCard(candidate.card);
        return {
          candidateId: candidate.card.candidateId,
          role,
          instruction: rendered.instruction,
          estimatedTokens: rendered.estimatedTokens,
        };
      },
    );
    const gateDecision =
      selected.length === 0
        ? "skipped_no_eligible_candidate"
        : mode === "active"
          ? "active_injected"
          : "shadow_observed";
    const guidance: MechanismPromptGuidance | null =
      mode === "active" && promptCards.length > 0
        ? {
            protocol: "spoiler-safe-mechanism-guidance.v1",
            truthStatus: "candidate",
            reviewStatus: "pending",
            instruction:
              "只把下列条目当作结构约束；不得复述卡名、暴露选择过程、复制来源句式，且前置证据不足时宁可不用。",
            selectedMechanisms: promptCards,
            qualityGates: SPOILER_SAFE_MECHANISM_CORE_PACK_V1.qualityGates,
          }
        : null;

    const auditWithoutTrace: Omit<
      MechanismSelectionAuditRecord,
      "outputTraceId"
    > = {
      protocol: "spoiler-safe-mechanism-selection-audit.v1",
      sourcePackSha256:
        SPOILER_SAFE_MECHANISM_CORE_PACK_V1.sourcePackSha256,
      mode,
      workflow: input.workflow,
      storyScopeHash: scopeHash,
      candidateId: selected.map(({ candidate }) => candidate.card.candidateId),
      queryIntent: compactIntent(scored, input.workflow),
      selectedBecause: selected.map(({ candidate, role }) => ({
        candidateId: candidate.card.candidateId,
        role,
        score: candidate.score,
        reasons: reasonForSelection(candidate),
      })),
      rejectedAlternatives,
      promptBudget: {
        retrievalLimit: this.config.retrievalLimit,
        hardMaxRetrieve:
          SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract.hardMaxRetrieve,
        selectedCount: selected.length,
        maxSelectedCount: 2,
        perCardTokenLimit:
          SPOILER_SAFE_MECHANISM_CORE_PACK_V1.selectionContract
            .promptBudgetTokensPerCard,
        perCardEstimatedTokens: promptCards.map((card) => ({
          candidateId: card.candidateId,
          estimatedTokens: card.estimatedTokens,
        })),
        sharedGateEstimatedTokens: sharedGateTokens(),
      },
      cooldownDecision,
      stateIncrementCoverage: STATE_INCREMENT_COVERAGE,
      reversibleCostDiscount: "required_before_cost_claim",
      borrowedInformation: "not_native_intelligence_or_moral_superiority",
      opponentUpdate:
        "observe_then_revalue_then_change_method_or_win_condition",
      harmProximityDecision: "victim_weight_must_survive_adjacent_humor",
      gateDecision,
    };
    return {
      mode,
      workflow: input.workflow,
      storyScopeHash: scopeHash,
      sequence: state.sequence,
      selectedCandidateIds: auditWithoutTrace.candidateId,
      guidance,
      auditWithoutTrace,
    };
  }

  complete(prepared: PreparedMechanismSelection, outputTraceId: string) {
    if (this.completed.has(prepared)) return;
    this.completed.add(prepared);
    const state = this.cooldownByStory.get(prepared.storyScopeHash);
    if (state !== undefined) {
      for (const candidateId of prepared.selectedCandidateIds) {
        state.lastSuccessfulSelection.set(candidateId, prepared.sequence);
      }
    }
    const record: MechanismSelectionAuditRecord = {
      ...prepared.auditWithoutTrace,
      outputTraceId,
    };
    try {
      const result = this.auditSink(record);
      if (result instanceof Promise) void result.catch(() => undefined);
    } catch {
      // Observability must not replace or invalidate a provider-backed draft.
    }
  }
}
