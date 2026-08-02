import { createHash } from "node:crypto";
import {
  SPOILER_SAFE_MECHANISM_CORE_PACK_V1,
  type SpoilerSafeMechanismCard,
} from "./spoiler-safe-mechanism-core-pack.v1.js";
import type { PreparedMechanismSelection } from "./spoiler-safe-mechanism-selector.js";

export interface SpoilerSafeConcreteBeat {
  readonly action: string;
  readonly evidence: string;
  readonly cost: string;
  readonly countermove: string;
  readonly relationshipAftermath: string;
}

export interface SpoilerSafeConcreteBeatPlan {
  readonly protocol: "spoiler-safe-concrete-beat-plan.v1";
  readonly beats: readonly SpoilerSafeConcreteBeat[];
}

export interface SpoilerSafeWriterContextInput {
  readonly premise: string;
  readonly emotionalPromise: string;
  readonly relationshipCore: string;
  readonly styleConstraints: readonly string[];
  readonly continuationIntent: string;
  readonly activeHardBoundaries: readonly string[];
  readonly beatPlan: SpoilerSafeConcreteBeatPlan;
}

export interface SpoilerSafeWriterContext {
  readonly premise: string;
  readonly emotionalPromise: string;
  readonly relationshipCore: string;
  readonly styleConstraints: readonly string[];
  readonly continuationIntent: string;
  readonly activeHardBoundaries: readonly string[];
  readonly sceneObligations: readonly SpoilerSafeConcreteBeat[];
}

export interface SpoilerSafeDraftQualityAlarm {
  readonly protocol: "spoiler-safe-draft-quality-alarm.v1";
  readonly sha256: string;
  readonly chars: number;
  readonly invalidUnicode: boolean;
  readonly forbiddenWriterLeakage: readonly string[];
  readonly templatePatternCount: number;
  readonly listMarkerCount: number;
  readonly shortSentenceRate: number;
  readonly regexOnly: true;
  readonly decision: "alarm_only_review_required";
}

const MAXIMUM_BEATS = 5;
const MAXIMUM_FIELD_CODE_POINTS = 220;
const MAXIMUM_STYLE_CONSTRAINTS = 12;
const MAXIMUM_HARD_BOUNDARIES = 40;
const BEAT_KEYS = new Set([
  "action",
  "evidence",
  "cost",
  "countermove",
  "relationshipAftermath",
]);

const FIXED_FORBIDDEN_WRITER_TERMS = [
  "candidate",
  "candidateId",
  "sourcePackSha256",
  "qualityGates",
  "truthStatus",
  "reviewStatus",
  "starter_candidate",
  "shadow_candidate",
  "runtimeTier",
  "independentScore",
  "selectionContract",
  "rubric",
  "score",
  "评分",
  "候选",
  "卡名",
  "门禁",
  "评分表",
  "质量门",
  "零剧透",
  "机制卡",
  "书源",
  "来源名",
  "分析术语",
  "模型腔",
  "反模型腔",
  "人物不蠢",
  "各有利益",
  "低成本验证",
  "修正判断",
  "制度激励",
  "可观察后果",
  "状态增量",
  "静默推演",
  "前置证据",
];

const FORBIDDEN_PATTERNS = [
  /\bK\d{2}\b/u,
  /低成本.{0,8}验证/u,
  /修正.{0,8}(判断|估值|想法)/u,
  /调整.{0,8}(手段|策略)/u,
  /可证伪/u,
  /制度.{0,8}因果/u,
  /人物.{0,4}不蠢/u,
  /各有.{0,6}利益/u,
  /prompt/i,
  /quality\s*gate/i,
];

const BEAT_TEMPLATES: Readonly<Record<string, SpoilerSafeConcreteBeat>> = {
  K01: {
    action:
      "主角先按摊位顺序重新点灯，再把旧账里被雨洇开的两行拿到火边烘干。",
    evidence:
      "灯芯焦痕、账簿墨色和摊位空缺三样彼此对上，或在同一处露出矛盾。",
    cost:
      "这一查会误了头一壶茶的火候，也会让祭吏有理由先扣他的摊牌。",
    countermove:
      "祭吏可以催他照章认罚，相邻摊主可以趁人群围上来把账本换到自己手里。",
    relationshipAftermath:
      "主角若说错，要给供灯匠赔新灯；若说对，祭吏欠他一回却更不愿把账交给他。",
  },
  K03: {
    action:
      "主角让出一盏好灯给隔壁摊，嘴上说怕烟熏茶香，手却把灯座转向风口。",
    evidence:
      "被让出的灯确实照亮了对方摊位，也把风口吹来的灰线落在同一块砖上。",
    cost:
      "他少了一处照明，挑茶时要摸黑，旁人还会以为他临时讨好人。",
    countermove:
      "受惠的人可以当场谢绝，也可以收下好处后反问他为什么偏偏换这盏灯。",
    relationshipAftermath:
      "这份小便宜会留下人情，也会让两人下次谈价时多一层不痛快。",
  },
  K05: {
    action:
      "主角不急着指认人，先请供灯匠当众刮开两盏灯底的旧蜡，又重称灯芯。",
    evidence:
      "旧蜡厚薄、灯芯重量和登记时间三件小物能把其中一个说法推不动。",
    cost:
      "刮灯会毁一层供灯漆，若查错，赔钱的人先是他。",
    countermove:
      "祭吏可以要求先封灯再查，供灯匠也能说这两盏本来就修补过。",
    relationshipAftermath:
      "主角查出差错后仍得给匠人留台阶，否则下一回没人肯让他碰灯。",
  },
  K06: {
    action:
      "主角凭茶摊上熟客的脚程先找回一盏灯，却发现追回来的灯只能补上表账。",
    evidence:
      "灯号吻合，油线却短了一截，说明追回的东西和失去的资格不是同一层事。",
    cost:
      "他保住了一户人的当夜名额，却把自己牵进祭礼后账。",
    countermove:
      "被帮的人可以先道谢再推说不认油线，祭吏也可以把追回灯记成主角私查。",
    relationshipAftermath:
      "局部好处保留下来，但主角和祭吏都知道这事已经不只是两盏灯。",
  },
  K07: {
    action:
      "主角把早上被嫌弃的冷茶渣、雨前多出来的草绳和灯匠袖口的灰并排放在案上。",
    evidence:
      "三样旧痕迹在新发现出现后指向同一段搬灯路线，而不是三件闲事。",
    cost:
      "他要承认自己早先看轻了冷茶渣的用处，也可能误伤一个老熟人的面子。",
    countermove:
      "灯匠可以解释灰来自修炉，摊主也可以说草绳是他自己昨日留下的。",
    relationshipAftermath:
      "旧事被重新摆上桌后，熟人之间的玩笑会短一截，话也更难收回去。",
  },
  K08: {
    action:
      "祭吏先给主角添一枚临时摊牌，主角收下，却把摊牌压在账角没有立刻挂出。",
    evidence:
      "摊牌是真的，能让他今夜多卖茶；牌背的小印也把他绑到补灯名单上。",
    cost:
      "他若用这块牌，今晚有利，明早就得替祭署背一处缺口。",
    countermove:
      "祭吏可以说这是照顾旧识，也可以在众人面前逼他承认已经受了好处。",
    relationshipAftermath:
      "这份照顾既是人情也是绳结，主角以后再质问祭吏就少了一分干净。",
  },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DYNAMIC_FORBIDDEN_PATTERNS = [
  SPOILER_SAFE_MECHANISM_CORE_PACK_V1.sourcePackSha256,
  ...SPOILER_SAFE_MECHANISM_CORE_PACK_V1.cards.flatMap((card) => [
    card.candidateId,
    card.safeName,
    card.family,
  ]),
].map((term) => new RegExp(escapeRegExp(term), "iu"));

function containsInvalidUnicodeOrControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (
      unit === 0xfffd ||
      unit === 0x7f ||
      (unit < 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d)
    ) {
      return true;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function codePoints(value: string) {
  return Array.from(value).length;
}

function plainDataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("expected a plain object");
  }
  const record = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") throw new Error("symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("accessor values are forbidden");
    }
  }
  return record;
}

function forbiddenWriterLeakage(value: string) {
  const normalized = value.normalize("NFKC");
  const literalMatches = FIXED_FORBIDDEN_WRITER_TERMS.filter((term) =>
    normalized.toLocaleLowerCase("zh-CN").includes(
      term.normalize("NFKC").toLocaleLowerCase("zh-CN"),
    ),
  );
  const patternMatches = [...FORBIDDEN_PATTERNS, ...DYNAMIC_FORBIDDEN_PATTERNS]
    .filter((pattern) => pattern.test(normalized))
    .map((pattern) => pattern.source);
  return [...new Set([...literalMatches, ...patternMatches])];
}

export function assertNoWriterForbiddenLeakage(value: unknown) {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value);
  const matches = forbiddenWriterLeakage(serialized);
  if (matches.length > 0) {
    throw new Error(
      `writer-visible payload contains forbidden spoiler-safe analysis terms: ${matches.join(", ")}`,
    );
  }
  if (containsInvalidUnicodeOrControl(serialized)) {
    throw new Error("writer-visible payload contains invalid Unicode");
  }
}

function cleanTextField(value: unknown, fieldName: string) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    codePoints(value) > MAXIMUM_FIELD_CODE_POINTS ||
    containsInvalidUnicodeOrControl(value)
  ) {
    throw new Error(`${fieldName} is not safe text`);
  }
  assertNoWriterForbiddenLeakage(value);
  return value;
}

export function sanitizeConcreteBeatPlan(
  plan: SpoilerSafeConcreteBeatPlan,
): SpoilerSafeConcreteBeatPlan {
  const root = plainDataRecord(plan);
  if (
    root.protocol !== "spoiler-safe-concrete-beat-plan.v1" ||
    !Array.isArray(root.beats) ||
    root.beats.length < 1 ||
    root.beats.length > MAXIMUM_BEATS
  ) {
    throw new Error("invalid spoiler-safe concrete beat plan");
  }
  return {
    protocol: "spoiler-safe-concrete-beat-plan.v1",
    beats: root.beats.map((rawBeat, index) => {
      const beat = plainDataRecord(rawBeat);
      const keys = Object.keys(beat);
      if (
        keys.length !== BEAT_KEYS.size ||
        keys.some((key) => !BEAT_KEYS.has(key))
      ) {
        throw new Error(`beat ${index + 1} has invalid keys`);
      }
      return {
        action: cleanTextField(beat.action, `beat ${index + 1}.action`),
        evidence: cleanTextField(beat.evidence, `beat ${index + 1}.evidence`),
        cost: cleanTextField(beat.cost, `beat ${index + 1}.cost`),
        countermove: cleanTextField(
          beat.countermove,
          `beat ${index + 1}.countermove`,
        ),
        relationshipAftermath: cleanTextField(
          beat.relationshipAftermath,
          `beat ${index + 1}.relationshipAftermath`,
        ),
      };
    }),
  };
}

function cardById(candidateId: string) {
  return SPOILER_SAFE_MECHANISM_CORE_PACK_V1.cards.find(
    (card) => card.candidateId === candidateId,
  );
}

function fallbackBeatForCard(card: SpoilerSafeMechanismCard) {
  return {
    action: "让人物先做一件会留下痕迹的小事，再据此改变下一步。",
    evidence: "现场要有能被旁人看见、搬动或质疑的物件。",
    cost: "这件小事必须耽误时间、损失资源或伤到一层关系。",
    countermove: "被影响的人可以解释、阻拦、反问或换一种方式继续争取。",
    relationshipAftermath: `结果让双方下次说话多一层账，不把${card.safeName.slice(0, 1)}写成口头总结。`,
  };
}

export function buildSpoilerSafeConcreteBeatPlan(
  selection: PreparedMechanismSelection,
): SpoilerSafeConcreteBeatPlan {
  const beats = selection.selectedCandidateIds
    .map((candidateId) => {
      const card = cardById(candidateId);
      if (card === undefined) return null;
      return BEAT_TEMPLATES[candidateId] ?? fallbackBeatForCard(card);
    })
    .filter((beat): beat is SpoilerSafeConcreteBeat => beat !== null);
  if (beats.length === 0) {
    beats.push({
      action: "主角先做一件会让别人能立刻看见的小事，再据此改变下一步。",
      evidence: "被触碰的物件、旁人的反应和留下的损耗要同时在场。",
      cost: "这一步要消耗时间、钱或面子，不能只是顺手得到答案。",
      countermove: "对方可以阻拦、解释或把局面推向另一种不利结果。",
      relationshipAftermath: "事情过后两人还要在同一条街上见面，话不能说尽。",
    });
  }
  return sanitizeConcreteBeatPlan({
    protocol: "spoiler-safe-concrete-beat-plan.v1",
    beats: beats.slice(0, 2),
  });
}

function cleanTextList(
  values: readonly string[],
  maximumItems: number,
  fieldName: string,
) {
  if (values.length > maximumItems) {
    throw new Error(`${fieldName} has too many items`);
  }
  return values.map((value, index) =>
    cleanTextField(value, `${fieldName}[${index}]`),
  );
}

export function renderSpoilerSafeWriterContext(
  input: SpoilerSafeWriterContextInput,
): SpoilerSafeWriterContext {
  const context = {
    premise: cleanTextField(input.premise, "premise"),
    emotionalPromise: cleanTextField(
      input.emotionalPromise,
      "emotionalPromise",
    ),
    relationshipCore: cleanTextField(input.relationshipCore, "relationshipCore"),
    styleConstraints: cleanTextList(
      input.styleConstraints,
      MAXIMUM_STYLE_CONSTRAINTS,
      "styleConstraints",
    ),
    continuationIntent: cleanTextField(
      input.continuationIntent,
      "continuationIntent",
    ),
    activeHardBoundaries: cleanTextList(
      input.activeHardBoundaries,
      MAXIMUM_HARD_BOUNDARIES,
      "activeHardBoundaries",
    ),
    sceneObligations: sanitizeConcreteBeatPlan(input.beatPlan).beats,
  } satisfies SpoilerSafeWriterContext;
  assertNoWriterForbiddenLeakage(context);
  return context;
}

export function evaluateSpoilerSafeDraftQualityAlarm(
  text: string,
): SpoilerSafeDraftQualityAlarm {
  const sentences = text
    .split(/[。！？!?；;]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const shortSentences = sentences.filter((item) => codePoints(item) <= 8);
  return {
    protocol: "spoiler-safe-draft-quality-alarm.v1",
    sha256: createHash("sha256").update(text).digest("hex"),
    chars: codePoints(text),
    invalidUnicode: containsInvalidUnicodeOrControl(text),
    forbiddenWriterLeakage: forbiddenWriterLeakage(text),
    templatePatternCount:
      text.match(/不是.{0,24}而是|只要.{0,24}就|首先|其次|最后/gu)?.length ??
      0,
    listMarkerCount: text.match(/(?:^|\n)\s*(?:[-*•]|\d+[.、])/gu)?.length ?? 0,
    shortSentenceRate:
      sentences.length === 0
        ? 0
        : Number((shortSentences.length / sentences.length).toFixed(4)),
    regexOnly: true,
    decision: "alarm_only_review_required",
  };
}
