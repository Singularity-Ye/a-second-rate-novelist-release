import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const OUTPUT_VERSION = "tc-cdx-207-spoiler-safe-multistage-ab.v1";
const MIN_OPENING_CHARS = 600;
const MAX_OPENING_CHARS = 1200;
const MAX_RESPONSE_BYTES = 1_000_000;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnvironment(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const modelConfig = {
  baseUrl: requiredEnvironment("MODEL_BASE_URL").replace(/\/+$/u, ""),
  apiKey: requiredEnvironment("MODEL_API_KEY"),
  model: requiredEnvironment("MODEL_NAME"),
  provider: optionalEnvironment(
    "MODEL_PROVIDER_ID",
    "configured-openai-compatible",
  ),
  timeoutMs: Number(optionalEnvironment("MODEL_TIMEOUT_MS", "180000")),
};

if (
  !Number.isSafeInteger(modelConfig.timeoutMs) ||
  modelConfig.timeoutMs < 100 ||
  modelConfig.timeoutMs > 300_000
) {
  throw new Error("MODEL_TIMEOUT_MS must be between 100 and 300000");
}

const workflowAttempts = Math.max(
  1,
  Math.min(4, Number(process.env.MODEL_ATTEMPTS?.trim() || "3") || 3),
);
const armAttempts = Math.max(
  1,
  Math.min(3, Number(process.env.MODEL_ARM_ATTEMPTS?.trim() || "2") || 2),
);
const retryDelayMs = Math.max(
  250,
  Math.min(10_000, Number(process.env.MODEL_RETRY_DELAY_MS?.trim() || "1000") || 1000),
);

const endpoint = modelConfig.baseUrl.endsWith("/v1/chat/completions")
  ? modelConfig.baseUrl
  : modelConfig.baseUrl.endsWith("/v1")
    ? `${modelConfig.baseUrl}/chat/completions`
    : `${modelConfig.baseUrl}/v1/chat/completions`;

const selectedMechanisms = [
  {
    candidateId: "K08",
    safeName: "positive benefit has a concrete second use",
    privateInstruction:
      "Let a character receive a real benefit, then reveal through an already visible practical use why the giver wanted that benefit accepted; the receiver can use it, bargain, avoid it, or walk away.",
  },
  {
    candidateId: "K05",
    safeName: "two explanations separated by an external check",
    privateInstruction:
      "Let two explanations fit the scene at first; a character performs a small costly check on an outside object, abandons one explanation, and changes the next move.",
  },
];

const forbiddenTerms = [
  "candidate",
  "candidateId",
  "safeName",
  "sourcePackSha256",
  "qualityGates",
  "truthStatus",
  "reviewStatus",
  "starter_candidate",
  "shadow_candidate",
  "runtimeTier",
  "score",
  "rubric",
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
  ...selectedMechanisms.flatMap((mechanism) => [
    mechanism.candidateId,
    mechanism.safeName,
  ]),
];

const forbiddenPatterns = [
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function codePoints(value) {
  return Array.from(value).length;
}

function containsInvalidUnicodeOrControl(value) {
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

function forbiddenWriterLeakage(value) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const literalMatches = forbiddenTerms.filter((term) =>
    normalized.includes(term.normalize("NFKC").toLocaleLowerCase("zh-CN")),
  );
  const patternMatches = forbiddenPatterns
    .filter((pattern) => pattern.test(value))
    .map((pattern) => pattern.source);
  return [...new Set([...literalMatches, ...patternMatches])];
}

function assertWriterPayloadClean(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const matches = forbiddenWriterLeakage(serialized);
  if (matches.length > 0) {
    throw new Error(`writer payload leakage: ${matches.join(", ")}`);
  }
  if (containsInvalidUnicodeOrControl(serialized)) {
    throw new Error("writer payload invalid unicode");
  }
}

function metric(text) {
  const sentences = text
    .split(/[。！？!?；;]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const shortSentences = sentences.filter((item) => codePoints(item) <= 8);
  return {
    chars: codePoints(text),
    paragraphs: text.split(/(?:\r?\n){2,}/u).filter((item) => item.trim()).length,
    sentences: sentences.length,
    shortSentencesLe8: shortSentences.length,
    shortSentenceRate:
      sentences.length === 0
        ? 0
        : Number((shortSentences.length / sentences.length).toFixed(4)),
    templatePatternCount:
      text.match(/不是.{0,24}而是|只要.{0,24}就|首先|其次|最后/gu)?.length ?? 0,
    listMarkerCount: text.match(/(?:^|\n)\s*(?:[-*•]|\d+[.、])/gu)?.length ?? 0,
    analyticLeakageCount: forbiddenWriterLeakage(text).length,
    invalidUnicode: containsInvalidUnicodeOrControl(text),
    sha256: sha256(text),
  };
}

const textSchema = { type: "string", minLength: 1 };
const beatSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "evidence",
    "cost",
    "countermove",
    "relationshipAftermath",
  ],
  properties: {
    action: textSchema,
    evidence: textSchema,
    cost: textSchema,
    countermove: textSchema,
    relationshipAftermath: textSchema,
  },
};

const beatPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beats"],
  properties: {
    beats: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: beatSchema,
    },
  },
};

const storyBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: {
      type: "string",
      minLength: MIN_OPENING_CHARS,
      maxLength: MAX_OPENING_CHARS,
    },
  },
};

const criticSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overallScore10",
    "decision",
    "strengths",
    "failures",
    "gateResults",
  ],
  properties: {
    overallScore10: { type: "integer", minimum: 1, maximum: 10 },
    decision: { enum: ["pass", "revise", "reject"] },
    strengths: { type: "array", maxItems: 8, items: textSchema },
    failures: { type: "array", maxItems: 12, items: textSchema },
    gateResults: {
      type: "object",
      additionalProperties: false,
      required: [
        "antiModelVoice",
        "characterIntelligence",
        "concreteVerification",
        "cultureParticipatesInCausality",
        "humanWarmthAndHumor",
        "coherentSceneProgression",
        "adultContentBoundary",
        "unicodeIntegrity",
        "noSourceImitationOrLeakage",
      ],
      properties: Object.fromEntries(
        [
          "antiModelVoice",
          "characterIntelligence",
          "concreteVerification",
          "cultureParticipatesInCausality",
          "humanWarmthAndHumor",
          "coherentSceneProgression",
          "adultContentBoundary",
          "unicodeIntegrity",
          "noSourceImitationOrLeakage",
        ].map((key) => [key, { enum: ["pass", "fail"] }]),
      ),
    },
  },
};

function commission() {
  return {
    premise:
      "山城祭礼前夜，经营旧茶摊的落魄散修发现供灯实物与账簿差了两盏。差额不大，却会改变几户人的祭礼资格。经手账簿的祭吏、相邻摊主和供灯匠都不是纸片人。",
    emotionalPromise:
      "视角可以轻松、有生活情趣，但世道、制度与修行代价保持真实重量；幽默来自人物处境和判断。",
    relationshipCore:
      "主角与祭吏彼此熟悉却不完全信任；两人都会观察眼前事，并保护自己的饭碗。",
    styleConstraints: [
      "直接写六百至一千二百字的中文小说开篇，不解释写法，不列提纲。",
      "使用连续叙事与自然长短句；短句只服务动作、感官或情绪转折。",
      "茶汤、供灯、账簿和祭礼资格必须进入人物行动和后果，不能只作布景。",
      "不得使用任何现成小说的专名、情节或句子。",
    ],
    continuationIntent:
      "片段结束时至少一个人因为眼前事实改变下一步，谜团不必全部揭开。",
    activeHardBoundaries: [],
  };
}

function providerEnvelope(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid provider envelope");
  }
  const traceId = typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  const model = typeof value.model === "string" && value.model.length > 0 ? value.model : null;
  if (traceId === null || model === null || !Array.isArray(value.choices) || value.choices.length !== 1) {
    throw new Error("invalid provider envelope");
  }
  const choice = value.choices[0];
  if (
    typeof choice !== "object" ||
    choice === null ||
    choice.finish_reason !== "stop" ||
    typeof choice.message !== "object" ||
    choice.message === null ||
    typeof choice.message.content !== "string"
  ) {
    throw new Error("invalid provider choice");
  }
  return {
    traceId,
    model,
    content: choice.message.content,
  };
}

async function boundedResponseText(response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("provider response too large");
    }
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("provider response too large");
  }
  return text;
}

function safeFailure(error) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: error instanceof Error ? error.message.slice(0, 80) : "evaluation_failed",
  };
}

async function callJsonWorkflow({
  schemaName,
  systemPrompt,
  context,
  schema,
  temperature,
}) {
  let lastError;
  for (let attempt = 1; attempt <= workflowAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), modelConfig.timeoutMs);
    timeout.unref?.();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${modelConfig.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(context) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: schemaName,
              strict: true,
              schema,
            },
          },
          stream: false,
          temperature,
        }),
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`provider_status_${response.status}`);
      }
      const rawResponse = await boundedResponseText(response);
      const envelope = providerEnvelope(JSON.parse(rawResponse));
      const output = JSON.parse(envelope.content);
      return {
        output,
        trace: {
          traceId: envelope.traceId,
          provider: modelConfig.provider,
          model: envelope.model,
          workflowVersion: schemaName,
          fallbackApplied: false,
          outputHash: sha256(envelope.content),
        },
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= workflowAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("workflow failed");
}

function sanitizeBeatPlan(rawPlan) {
  if (
    typeof rawPlan !== "object" ||
    rawPlan === null ||
    !Array.isArray(rawPlan.beats) ||
    rawPlan.beats.length < 1 ||
    rawPlan.beats.length > 4
  ) {
    throw new Error("invalid beat plan");
  }
  const beats = rawPlan.beats.map((beat) => {
    for (const key of [
      "action",
      "evidence",
      "cost",
      "countermove",
      "relationshipAftermath",
    ]) {
      if (
        typeof beat?.[key] !== "string" ||
        beat[key].trim().length === 0 ||
        codePoints(beat[key]) > 220
      ) {
        throw new Error(`invalid beat field ${key}`);
      }
      assertWriterPayloadClean(beat[key]);
    }
    return {
      action: beat.action,
      evidence: beat.evidence,
      cost: beat.cost,
      countermove: beat.countermove,
      relationshipAftermath: beat.relationshipAftermath,
    };
  });
  return { protocol: "spoiler-safe-concrete-beat-plan.v1", beats };
}

function validateStoryBody(body) {
  if (
    typeof body !== "string" ||
    codePoints(body) < MIN_OPENING_CHARS ||
    codePoints(body) > MAX_OPENING_CHARS ||
    containsInvalidUnicodeOrControl(body)
  ) {
    throw new Error("invalid_runtime_output");
  }
  return body;
}

async function runOffOnce() {
  const context = commission();
  assertWriterPayloadClean(context);
  const result = await callJsonWorkflow({
    schemaName: "tc_cdx_207_off_writer_v1",
    temperature: 0.8,
    schema: storyBodySchema,
    systemPrompt: [
      "You are the vNext opening runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Write the requested Chinese opening while obeying boundaries.",
      "Do not describe fallback, templates, writing rules, hidden planning, or evaluation criteria.",
    ].join(" "),
    context,
  });
  const body = validateStoryBody(result.output.body);
  return {
    body,
    traces: { writer: result.trace },
    attempts: { writer: result.attempt },
    diagnostics: {},
  };
}

async function runActiveOnce() {
  const storyCommission = commission();
  const plannerResult = await callJsonWorkflow({
    schemaName: "tc_cdx_207_private_planner_v1",
    temperature: 0.3,
    schema: beatPlanSchema,
    systemPrompt: [
      "You are a private story planner.",
      "You may see zero-spoiler candidate mechanisms, but the writer must never see candidate IDs, card names, scores, source names, rubrics, or analysis vocabulary.",
      "Return only concrete beats. Each beat must contain only action, evidence, cost, countermove, and relationshipAftermath.",
      "Write beats as story obligations with objects, actions, risks, counterplay, and aftermath. Do not use abstract craft words.",
    ].join(" "),
    context: {
      commission: storyCommission,
      privateMechanisms: selectedMechanisms,
    },
  });
  const beatPlan = sanitizeBeatPlan(plannerResult.output);
  const writerContext = {
    ...storyCommission,
    sceneObligations: beatPlan.beats,
  };
  assertWriterPayloadClean(writerContext);
  const writerResult = await callJsonWorkflow({
    schemaName: "tc_cdx_207_active_writer_v1",
    temperature: 0.78,
    schema: storyBodySchema,
    systemPrompt: [
      "You are the vNext opening runtime.",
      "Return only JSON matching the supplied strict schema.",
      "Write the story itself. Do not mention plans, obligations, checks, hidden structures, rubrics, or why a scene works.",
      "Use the supplied concrete scene obligations only as invisible staging facts.",
    ].join(" "),
    context: writerContext,
  });
  const body = validateStoryBody(writerResult.output.body);
  const criticResult = await callJsonWorkflow({
    schemaName: "tc_cdx_207_independent_critic_v1",
    temperature: 0.2,
    schema: criticSchema,
    systemPrompt: [
      "You are an independent fiction critic.",
      "Return only JSON. Judge the draft; do not rewrite it.",
      "Reject if it announces intelligence, proof, culture, cost, or revision instead of showing them through action.",
      "Reject source imitation, invalid Unicode, incoherent scenes, flat side characters, or adult-content boundary failure.",
    ].join(" "),
    context: {
      draft: body,
      reviewDimensions: [
        "continuous narration and anti-model voice",
        "characters with independent goals, information, mistakes, and updates",
        "observable truth-testing, real cost, and relationship aftermath",
        "culture and system rules participating in causality",
        "human warmth, mood, humor, and harsh-world contrast",
        "adult content consent, power difference, camera intensity, and narrative function",
        "Unicode integrity",
        "zero source leakage",
      ],
    },
  });
  return {
    body,
    traces: {
      planner: plannerResult.trace,
      writer: writerResult.trace,
      critic: criticResult.trace,
    },
    attempts: {
      planner: plannerResult.attempt,
      writer: writerResult.attempt,
      critic: criticResult.attempt,
    },
    diagnostics: {
      beatPlan,
      selectedMechanisms: selectedMechanisms.map(({ candidateId }) => candidateId),
      writerPayloadSha256: sha256(JSON.stringify(writerContext)),
      writerPayloadForbiddenMatches: forbiddenWriterLeakage(
        JSON.stringify(writerContext),
      ),
      critic: criticResult.output,
    },
  };
}

async function runArmOnce(arm) {
  const startedAt = Date.now();
  try {
    const result = arm === "active" ? await runActiveOnce() : await runOffOnce();
    return {
      arm,
      ok: true,
      durationMs: Date.now() - startedAt,
      fallbackApplied: false,
      ...result,
      metrics: metric(result.body),
    };
  } catch (error) {
    return {
      arm,
      ok: false,
      durationMs: Date.now() - startedAt,
      failure: safeFailure(error),
    };
  }
}

async function runArm(arm) {
  const priorFailures = [];
  for (let attempt = 1; attempt <= armAttempts; attempt += 1) {
    const result = await runArmOnce(arm);
    if (result.ok) {
      return {
        ...result,
        armAttempt: attempt,
        priorFailures,
      };
    }
    priorFailures.push({
      attempt,
      durationMs: result.durationMs,
      failure: result.failure,
    });
    if (attempt >= armAttempts) {
      return {
        ...result,
        armAttempt: attempt,
        priorFailures: priorFailures.slice(0, -1),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
  }
  throw new Error("unreachable arm retry state");
}

const outputDirectory = process.argv[2] || `/tmp/tc-cdx-207-${Date.now()}`;
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

const executionOrder = randomInt(2) === 0 ? ["off", "active"] : ["active", "off"];
const results = [];
for (const arm of executionOrder) {
  results.push(await runArm(arm));
}

const shuffled = randomInt(2) === 0 ? results : [...results].reverse();
const blindSamples = shuffled.map((result, index) => ({
  sampleId: `sample-${index + 1}`,
  ok: result.ok,
  ...(result.ok
    ? {
        fallbackApplied: result.fallbackApplied,
        metrics: result.metrics,
        body: result.body,
      }
    : { failure: result.failure }),
}));
const mapping = shuffled.map((result, index) => ({
  sampleId: `sample-${index + 1}`,
  arm: result.arm,
  executionEvidence: result.ok
    ? {
        durationMs: result.durationMs,
        armAttempt: result.armAttempt,
        priorFailures: result.priorFailures,
        fallbackApplied: result.fallbackApplied,
        traces: result.traces,
        attempts: result.attempts,
        metrics: result.metrics,
      }
    : {
        durationMs: result.durationMs,
        armAttempt: result.armAttempt,
        priorFailures: result.priorFailures,
        failure: result.failure,
      },
  diagnostics: result.ok ? result.diagnostics : {},
}));

await writeFile(
  `${outputDirectory}/blind-samples.json`,
  `${JSON.stringify(
    {
      protocol: OUTPUT_VERSION,
      generatedAt: new Date().toISOString(),
      executionOrderHash: sha256(executionOrder.join(",")),
      samples: blindSamples,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);
await writeFile(
  `${outputDirectory}/arm-mapping.json`,
  `${JSON.stringify(
    {
      protocol: OUTPUT_VERSION,
      generatedAt: new Date().toISOString(),
      revealedAfterBlindReview: false,
      mapping,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

console.log(
  JSON.stringify({
    protocol: OUTPUT_VERSION,
    outputDirectory,
    executionCount: results.length,
    successful: results.filter((item) => item.ok).length,
    samples: blindSamples.map(
      ({ sampleId, ok, metrics, failure }) => ({
        sampleId,
        ok,
        metrics,
        failure,
      }),
    ),
  }),
);
