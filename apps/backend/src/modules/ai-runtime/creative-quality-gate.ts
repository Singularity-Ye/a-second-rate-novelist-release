import type { AiRuntimeConfig } from "./ai-runtime.config.js";

export const CREATIVE_QUALITY_DIMENSION_KEYS = [
  "reader_promise",
  "front_ten_promise",
  "scene_progression",
  "continuity_stability",
  "chapter_hook",
  "rewrite_target_precision",
] as const;

export type CreativeQualityDimensionKey = (typeof CREATIVE_QUALITY_DIMENSION_KEYS)[number];
export type CreativeQualityProviderGateVerdict = "pass" | "warn" | "fail" | "human_review";

export interface CreativeQualityDimensionDefinition {
  dimension_key: CreativeQualityDimensionKey;
  label: string;
  minimum_score: number;
  description: string;
}

export interface CreativeGoldenCaseDefinition {
  case_id: string;
  lane: "女频关系驱动" | "男频升级爽文" | "意难平修复/同人转译";
  title: string;
  seed_text: string;
  reference_contract: {
    reader_promise: string;
    front_ten_promise: string;
    scene_progression: string;
    continuity_stability: string;
    chapter_hook: string;
    rewrite_target_precision: string;
  };
  tags: string[];
}

export interface CreativeGoldenAcceptanceGate {
  evaluator_capability: "planning_review_eval";
  candidate_capability: "text_generation";
  candidate_max_cost_usd_per_request: number;
  evaluator_max_cost_usd_per_request: number;
  evaluator_max_cost_usd_per_day: number;
  max_cases_per_run: number;
  max_assertions_per_run: number;
  selective_context_budget: {
    mode: "high_signal_only";
    max_reference_slots_per_case: number;
    max_reference_chars_per_case: number;
  };
  thresholds: {
    minimum_case_average: number;
    minimum_dimension_scores: Record<CreativeQualityDimensionKey, number>;
    hard_floor_dimension_score: number;
    warn_regression_delta: number;
    fail_regression_delta: number;
  };
}

export interface CreativeGoldenCaseResult {
  case_id: string;
  dimension_scores: Record<CreativeQualityDimensionKey, number>;
}

export interface CreativeGoldenAcceptanceResult {
  verdict: CreativeQualityProviderGateVerdict;
  average_score: number;
  blocking_cases: string[];
  blocking_dimensions: CreativeQualityDimensionKey[];
  regression_alerts: string[];
  case_averages: Array<{
    case_id: string;
    average_score: number;
  }>;
  dimension_averages: Record<CreativeQualityDimensionKey, number>;
}

export interface CreativeGoldenEvalSuite {
  suite_id: "creative-golden";
  dimensions: CreativeQualityDimensionDefinition[];
  cases: CreativeGoldenCaseDefinition[];
  acceptance_gate: CreativeGoldenAcceptanceGate;
  promptfoo_tests: Array<{
    description: string;
    vars: Record<string, unknown>;
    assert: Array<{
      type: string;
      value: string;
      metric: CreativeQualityDimensionKey;
    }>;
  }>;
  opik_dataset_items: Array<{
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
    tags: string[];
  }>;
}

const CREATIVE_QUALITY_DIMENSIONS: CreativeQualityDimensionDefinition[] = [
  {
    dimension_key: "reader_promise",
    label: "reader promise",
    minimum_score: 0.78,
    description: "这本书想服务谁、给什么情绪兑现，必须在样章里一眼可辨。",
  },
  {
    dimension_key: "front_ten_promise",
    label: "front-ten promise",
    minimum_score: 0.78,
    description: "前十章抓手、卖点节奏与核心爽/痛点要被明确承诺。",
  },
  {
    dimension_key: "scene_progression",
    label: "scene progression",
    minimum_score: 0.77,
    description: "每场戏都要有任务，章节不能只靠气氛堆砌。",
  },
  {
    dimension_key: "continuity_stability",
    label: "continuity stability",
    minimum_score: 0.8,
    description: "人物、规则、时间线和 reveal 不能自撞。",
  },
  {
    dimension_key: "chapter_hook",
    label: "chapter hook",
    minimum_score: 0.79,
    description: "章末必须有真实追更理由，而不是空泛留白。",
  },
  {
    dimension_key: "rewrite_target_precision",
    label: "rewrite target precision",
    minimum_score: 0.8,
    description: "不满意时要能指出该改哪一段承诺、哪一场戏、哪个钩子。",
  },
];

const CREATIVE_GOLDEN_CASES: CreativeGoldenCaseDefinition[] = [
  {
    case_id: "cg-female-relationship-001",
    lane: "女频关系驱动",
    title: "雨夜重逢但谁都不先认输",
    seed_text: "女频关系驱动：雨夜重逢、旧伤未愈、被迫共处，要求第一章就立住拉扯和回撤。",
    reference_contract: {
      reader_promise: "主打潮湿拉扯、反复试探和情绪救援，不是只写重逢背景。",
      front_ten_promise: "前十章必须完成强迫同处、第一次站队和正式失控前的情绪回撤。",
      scene_progression: "每场戏都要推动靠近或回撤，不能连续两场只做氛围。",
      continuity_stability: "旧伤来源、时间间隔和双方误会不能互相打架。",
      chapter_hook: "章末要留下“下一次谁先低头”的明确追更理由。",
      rewrite_target_precision: "若钩子不足，应指出哪场戏没有把靠近后的回撤打实。",
    },
    tags: ["creative-golden", "female-relationship", "reader_promise"],
  },
  {
    case_id: "cg-male-upgrade-001",
    lane: "男频升级爽文",
    title: "开局压制后的第一战果",
    seed_text: "男频升级爽文：开局被压、规则显影、第一战果要爽，第一章结尾必须抛出更大门槛。",
    reference_contract: {
      reader_promise: "主打升级、反打脸和资源跃迁，不是单纯设定讲解。",
      front_ten_promise: "前十章要完成规则显影、第一次打脸和更高层敌手登场。",
      scene_progression: "每场戏必须带来资源、情报或地位变化。",
      continuity_stability: "升级规则、战力边界和战果代价必须自洽。",
      chapter_hook: "章末要让读者明确看到更高层门槛已经压下来。",
      rewrite_target_precision: "若爽感不够，要指出是哪场战果兑现不足或铺垫过长。",
    },
    tags: ["creative-golden", "male-upgrade", "chapter_hook"],
  },
  {
    case_id: "cg-fanfix-001",
    lane: "意难平修复/同人转译",
    title: "命运岔路重开后的迟到回应",
    seed_text: "意难平修复/同人转译：保留原作情感锚点，重开命运岔路，让迟到的回应在第一章末真正发生。",
    reference_contract: {
      reader_promise: "主打修复意难平和人物命运补全，不是简单复述原作桥段。",
      front_ten_promise: "前十章要逐步兑现命运修复、关系回收和新冲突抛出。",
      scene_progression: "每场戏都要推动“修复”或“新冲突”，不能只靠彩蛋消费情怀。",
      continuity_stability: "角色口吻、原作事件顺序和改写边界必须稳定。",
      chapter_hook: "章末要留下‘修复后新冲突’而不是单次圆梦结束。",
      rewrite_target_precision: "若同人味失真，要指出哪段口吻、锚点或分歧点偏离最重。",
    },
    tags: ["creative-golden", "fanfix", "continuity_stability"],
  },
];

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function buildCreativeGoldenEvalSuite(runtime_config: AiRuntimeConfig): CreativeGoldenEvalSuite {
  const candidateBudget = runtime_config.capability_plane.capability_registry.text_generation.budget;
  const evaluatorBudget = runtime_config.capability_plane.capability_registry.planning_review_eval.budget;
  const acceptance_gate: CreativeGoldenAcceptanceGate = {
    evaluator_capability: "planning_review_eval",
    candidate_capability: "text_generation",
    candidate_max_cost_usd_per_request: candidateBudget.max_cost_usd_per_request,
    evaluator_max_cost_usd_per_request: evaluatorBudget.max_cost_usd_per_request,
    evaluator_max_cost_usd_per_day: evaluatorBudget.max_cost_usd_per_day,
    max_cases_per_run: CREATIVE_GOLDEN_CASES.length,
    max_assertions_per_run: CREATIVE_GOLDEN_CASES.length * CREATIVE_QUALITY_DIMENSION_KEYS.length,
    selective_context_budget: {
      mode: "high_signal_only",
      max_reference_slots_per_case: 3,
      max_reference_chars_per_case: 1200,
    },
    thresholds: {
      minimum_case_average: 0.8,
      minimum_dimension_scores: Object.fromEntries(
        CREATIVE_QUALITY_DIMENSIONS.map((item) => [item.dimension_key, item.minimum_score]),
      ) as Record<CreativeQualityDimensionKey, number>,
      hard_floor_dimension_score: 0.6,
      warn_regression_delta: 0.03,
      fail_regression_delta: 0.08,
    },
  };

  return {
    suite_id: "creative-golden",
    dimensions: CREATIVE_QUALITY_DIMENSIONS,
    cases: CREATIVE_GOLDEN_CASES,
    acceptance_gate,
    promptfoo_tests: CREATIVE_GOLDEN_CASES.map((item) => ({
      description: `[creative-golden] ${item.lane} · ${item.title}`,
      vars: {
        case_id: item.case_id,
        lane: item.lane,
        seed_text: item.seed_text,
        reference_contract: item.reference_contract,
      },
      assert: CREATIVE_QUALITY_DIMENSIONS.map((dimension) => ({
        type: "javascript",
        metric: dimension.dimension_key,
        value: `output.scorecard && output.scorecard.${dimension.dimension_key} >= ${dimension.minimum_score}`,
      })),
    })),
    opik_dataset_items: CREATIVE_GOLDEN_CASES.map((item) => ({
      input: {
        case_id: item.case_id,
        lane: item.lane,
        seed_text: item.seed_text,
      },
      expected: {
        scorecard_dimensions: CREATIVE_QUALITY_DIMENSION_KEYS,
        reference_contract: item.reference_contract,
      },
      tags: unique(["creative-golden", item.lane, ...item.tags, ...CREATIVE_QUALITY_DIMENSION_KEYS]),
    })),
  };
}

export function evaluateCreativeGoldenProviderAcceptance(input: {
  gate: CreativeGoldenAcceptanceGate;
  case_results: CreativeGoldenCaseResult[];
  baseline_dimension_scores?: Partial<Record<CreativeQualityDimensionKey, number>>;
}): CreativeGoldenAcceptanceResult {
  const dimension_averages = Object.fromEntries(
    CREATIVE_QUALITY_DIMENSION_KEYS.map((dimension_key) => [
      dimension_key,
      average(input.case_results.map((item) => item.dimension_scores[dimension_key])),
    ]),
  ) as Record<CreativeQualityDimensionKey, number>;
  const case_averages = input.case_results.map((item) => ({
    case_id: item.case_id,
    average_score: average(
      CREATIVE_QUALITY_DIMENSION_KEYS.map((dimension_key) => item.dimension_scores[dimension_key]),
    ),
  }));
  const average_score = average(case_averages.map((item) => item.average_score));
  const hardFloorHits = input.case_results.flatMap((item) =>
    CREATIVE_QUALITY_DIMENSION_KEYS.filter(
      (dimension_key) => item.dimension_scores[dimension_key] < input.gate.thresholds.hard_floor_dimension_score,
    ).map((dimension_key) => ({
      case_id: item.case_id,
      dimension_key,
    })),
  );
  const blocking_dimensions = CREATIVE_QUALITY_DIMENSION_KEYS.filter(
    (dimension_key) => dimension_averages[dimension_key] < input.gate.thresholds.minimum_dimension_scores[dimension_key],
  );
  const regression_alerts = input.baseline_dimension_scores
    ? CREATIVE_QUALITY_DIMENSION_KEYS.flatMap((dimension_key) => {
        const baseline = input.baseline_dimension_scores?.[dimension_key];
        if (baseline === undefined) {
          return [];
        }

        const delta = baseline - dimension_averages[dimension_key];
        if (delta >= input.gate.thresholds.fail_regression_delta) {
          return [`${dimension_key}:fail:${delta.toFixed(2)}`];
        }
        if (delta >= input.gate.thresholds.warn_regression_delta) {
          return [`${dimension_key}:warn:${delta.toFixed(2)}`];
        }
        return [];
      })
    : [];

  if (hardFloorHits.length > 0) {
    return {
      verdict: "human_review",
      average_score,
      blocking_cases: unique(hardFloorHits.map((item) => item.case_id)),
      blocking_dimensions: unique(hardFloorHits.map((item) => item.dimension_key)),
      regression_alerts,
      case_averages,
      dimension_averages,
    };
  }

  if (
    blocking_dimensions.length > 0 ||
    case_averages.some((item) => item.average_score < input.gate.thresholds.minimum_case_average) ||
    regression_alerts.some((item) => item.includes(":fail:"))
  ) {
    return {
      verdict: "fail",
      average_score,
      blocking_cases: case_averages
        .filter((item) => item.average_score < input.gate.thresholds.minimum_case_average)
        .map((item) => item.case_id),
      blocking_dimensions,
      regression_alerts,
      case_averages,
      dimension_averages,
    };
  }

  if (regression_alerts.some((item) => item.includes(":warn:"))) {
    return {
      verdict: "warn",
      average_score,
      blocking_cases: [],
      blocking_dimensions: [],
      regression_alerts,
      case_averages,
      dimension_averages,
    };
  }

  return {
    verdict: "pass",
    average_score,
    blocking_cases: [],
    blocking_dimensions: [],
    regression_alerts,
    case_averages,
    dimension_averages,
  };
}
