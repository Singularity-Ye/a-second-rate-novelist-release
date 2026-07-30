export type PersonalityLetter = "A" | "B" | "C" | "D";
export type PersonalityCode = `${PersonalityLetter}${PersonalityLetter}${PersonalityLetter}`;
export const SYSTEM_BINDING_VERSION = 1 as const;
export const SYSTEM_BINDING_STORAGE_KEY = "novelist-system-binding-v1";

export type BindingStatus = "preview" | "bound";

export interface OriginProfile {
  identityId: string;
  identityName: string;
  identityIcon: string;
  /** Optional until Paper Mirror registers a formal pose asset for an identity. */
  poseAssetRef?: string;
  genreFamily: string;
  formerRole: string;
  originStoryRef: string;
  accidentBeatId: "accident-02";
  personalityCode: PersonalityCode;
  chosenAt: string;
  bindingStatus: BindingStatus;
}

export interface SubSystemProfile {
  subsystemId: "evidence-boundary-audit";
  role: "evidence-and-boundary-audit";
  eventType: "subsystem_notice";
  capabilities: readonly string[];
  forbiddenBehaviors: readonly string[];
}

export interface SystemPersonaProfile {
  personaSnapshotId: string;
  origin: OriginProfile;
  voice: {
    authority: number;
    warmth: number;
    pressure: number;
    humor: number;
    distance: number;
  };
  worldviewLabel: string;
  relationshipLabel: string;
  interventionLabel: string;
  lexicon: readonly string[];
  addressStyle: string;
  interventionStyle: "pressure" | "inspire" | "observe" | "reward";
  forbiddenBehaviors: readonly string[];
  subsystem: SubSystemProfile;
}

export type CreativeSupportTaskStatus = "offered" | "accepted" | "deferred" | "scoped";
export type EvidenceStatus = "awaiting" | "submitted" | "accepted" | "needs-revision";

export interface CreativeSupportTask {
  taskId: "first-writing-attempt";
  personaSnapshotId: string;
  title: string;
  status: CreativeSupportTaskStatus;
  whyNow: string;
  deliverable: string;
  acceptanceCriteria: readonly string[];
  userInstruction?: string;
  routeKey: "study-desk-stay";
  activityKey: "study-writing";
  evidence: {
    status: EvidenceStatus;
    artifactRef?: string;
    submittedAt?: string;
    note: string;
  };
}

export type CreativeSupportDecision =
  | "accept"
  | "defer"
  | "scope"
  | "request-revision";
export type CreativeEvidenceResolution = "accepted" | "needs-revision";

export interface CreativeSupportDecisionInput {
  decision: CreativeSupportDecision;
  userInstruction?: string;
  deliverable?: string;
}

export interface SystemLayerProjection {
  schema: "system-layer-projection-v1";
  bindingStatus: BindingStatus;
  identity: {
    identityId: string;
    identityName: string;
    identityIcon: string;
    poseAssetRef: string | null;
    genreFamily: string;
    formerRole: string;
    originStoryRef: string;
    accidentBeatId: OriginProfile["accidentBeatId"];
    personalityCode: PersonalityCode;
  };
  persona: {
    personaSnapshotId: string;
    voice: SystemPersonaProfile["voice"];
    worldviewLabel: string;
    relationshipLabel: string;
    interventionLabel: string;
    lexicon: readonly string[];
    addressStyle: string;
    interventionStyle: SystemPersonaProfile["interventionStyle"];
  };
  subsystem: SubSystemProfile;
  task: {
    taskId: CreativeSupportTask["taskId"];
    status: CreativeSupportTaskStatus;
    title: string;
    whyNow: string;
    deliverable: string;
    acceptanceCriteria: readonly string[];
    userInstruction: string | null;
    routeKey: CreativeSupportTask["routeKey"];
    activityKey: CreativeSupportTask["activityKey"];
    evidence: {
      status: EvidenceStatus;
      artifactRef: string | null;
      submittedAt: string | null;
      note: string;
    };
  };
  relationship: NovelistRelationshipSnapshot;
  memory: SystemMemoryLedger;
  channels: {
    novelist: readonly SystemConversationMessage[];
    subsystem: readonly SystemConversationMessage[];
  };
}

export interface SystemConversationMessage {
  id: string;
  role: "system" | "novelist";
  text: string;
  createdAt: string;
}

export interface SystemMemoryLedger {
  status: "pending" | "recorded";
  entries: readonly string[];
}

export interface NovelistRelationshipSnapshot {
  trust: number;
  turns: number;
}

export interface SystemBindingSnapshot {
  version: typeof SYSTEM_BINDING_VERSION;
  origin: OriginProfile;
  persona: SystemPersonaProfile;
  task: CreativeSupportTask;
  memory: SystemMemoryLedger;
  novelistRelationship?: NovelistRelationshipSnapshot;
  conversation?: readonly SystemConversationMessage[];
  subsystemConversation?: readonly SystemConversationMessage[];
}

export interface IdentitySeed {
  id: string;
  name: string;
  icon: string;
  tag: string;
  poseAssetRef?: string;
  monologue?: string;
  accidentQuote?: string;
}

export type OriginStoryBeatId =
  | "memory-one"
  | "memory-two"
  | "memory-climax"
  | "accident-01"
  | "accident-02"
  | "accident-03"
  | "blackout"
  | "awakening";

export interface OriginStoryBeat {
  beatId: OriginStoryBeatId;
  panelCount: number;
  title: string;
  visibleAction: string;
  emotionalDelta: string;
  assetRef: string;
  textSlots: readonly string[];
}

export interface OriginStorySpec {
  originStoryId: string;
  identityId: string;
  genreFamily: string;
  lifeArc: {
    startingGap: string;
    longPursuit: string;
    costPaid: string;
    hingeEvent: string;
    unfinishedThought: string;
  };
  beats: readonly OriginStoryBeat[];
  accident: {
    class: string;
    vehicleSkin: string;
    officialCause: string;
    finalReport: string;
  };
  awakening: {
    systemRole: "novelist-promotion-system";
    subsystemRef: "evidence-boundary-audit";
    firstConstraint: string;
  };
  scriptVersion: string;
}

interface IdentityPortrait {
  genreFamily: string;
  formerRole: string;
  lexicon: readonly string[];
  addressStyle: string;
}

const IDENTITY_PORTRAITS: Readonly<Record<string, IdentityPortrait>> = {
  xianxia: {
    genreFamily: "玄幻 / 修仙喜剧",
    formerRole: "杀穿诸天、横剑问天的玄烛剑尊",
    lexicon: ["剑道", "天道", "诸天", "本座"],
    addressStyle: "称宿主为“道友”，以问剑、斩关和高处孤寂作比喻",
  },
  palace: {
    genreFamily: "古言 / 宫斗",
    formerRole: "在后宫里熬出头的贵人",
    lexicon: ["宫门", "封赏", "局面", "娘娘"],
    addressStyle: "称宿主为“这位小郎君”，把卡文说成宫门风波",
  },
  worker: {
    genreFamily: "都市 / 职场",
    formerRole: "熬夜改第十八版方案的社畜",
    lexicon: ["排期", "汇报", "工伤", "加班"],
    addressStyle: "称宿主为“同事”，偶尔发出工位警报",
  },
  coder: {
    genreFamily: "科幻 / 技术",
    formerRole: "不敢动最后一行代码的程序员",
    lexicon: ["堆栈", "回滚", "补丁", "上线"],
    addressStyle: "称宿主为“运行实例”，但不把他当成可重启进程",
  },
  mage: {
    genreFamily: "西幻 / 奇幻",
    formerRole: "被打断终极禁咒的魔导士",
    lexicon: ["禁咒", "法阵", "吟唱", "魔王"],
    addressStyle: "称宿主为“见习法师”，把卡文当成吟唱中断",
  },
  detective: {
    genreFamily: "悬疑 / 推理",
    formerRole: "追到最后一条线索的密室侦探",
    lexicon: ["线索", "证词", "密室", "真相"],
    addressStyle: "称宿主为“关键证人”，先问发生了什么再给建议",
  },
  idol: {
    genreFamily: "热血 / 娱乐",
    formerRole: "在地下舞台等一束灯的偶像",
    lexicon: ["舞台", "应援", "返场", "C 位"],
    addressStyle: "称宿主为“主唱”，把一个好句子当作返场灯光",
  },
  chef: {
    genreFamily: "美食 / 日常",
    formerRole: "用一口锅证明自己的烟火厨神",
    lexicon: ["火候", "锅气", "收汁", "出锅"],
    addressStyle: "称宿主为“掌勺的”，把段落当作需要收汁的菜",
  },
  gamer: {
    genreFamily: "电竞 / 游戏",
    formerRole: "在最后一局翻盘的电竞玩家",
    lexicon: ["开局", "补刀", "翻盘", "冷却"],
    addressStyle: "称宿主为“队友”，不把写作当成可以强制跳过的过场",
  },
  athlete: {
    genreFamily: "竞技 / 成长",
    formerRole: "在最后三秒起跳的热血体育生",
    lexicon: ["起跳", "节奏", "终点", "绝杀"],
    addressStyle: "称宿主为“选手”，提醒他保持节奏而非强行冲刺",
  },
  artist: {
    genreFamily: "艺术 / 荒诞",
    formerRole: "把灵魂涂在画布上的抽象派画师",
    lexicon: ["留白", "色块", "构图", "灵魂"],
    addressStyle: "称宿主为“画面合作者”，允许草稿暂时不漂亮",
  },
  archaeologist: {
    genreFamily: "历史 / 探险",
    formerRole: "破解三千年机关棺木的考古家",
    lexicon: ["遗迹", "年代", "机关", "考据"],
    addressStyle: "称宿主为“发掘者”，先保存线索再判断价值",
  },
  demon: {
    genreFamily: "修真 / 魔门喜剧",
    formerRole: "把亏本买卖包装成战略转进的魔门人材",
    lexicon: ["魔门", "账本", "战略转进", "利息"],
    addressStyle: "称宿主为“道友”，每次认真干预前先确认这笔账怎么算",
  },
};

type VoicePreset = Omit<SystemPersonaProfile["voice"], never> & {
  label: string;
  lexicon: readonly string[];
};

const WORLDVIEW_PRESETS: Readonly<Record<PersonalityLetter, VoicePreset>> = {
  A: { authority: 92, warmth: 28, pressure: 74, humor: 68, distance: 72, label: "规则压境", lexicon: ["本座", "天命"] },
  B: { authority: 68, warmth: 42, pressure: 48, humor: 58, distance: 64, label: "来路求证", lexicon: ["证据", "先核对"] },
  C: { authority: 38, warmth: 56, pressure: 28, humor: 88, distance: 36, label: "节能自嘲", lexicon: ["先躺会儿", "问题不大"] },
  D: { authority: 58, warmth: 72, pressure: 34, humor: 76, distance: 28, label: "从容共生", lexicon: ["慢一点", "顺势"] },
};

const RELATION_PRESETS: Readonly<Record<PersonalityLetter, VoicePreset>> = {
  A: { authority: 88, warmth: 22, pressure: 80, humor: 42, distance: 82, label: "严师督战", lexicon: ["限时", "不许逃课"] },
  B: { authority: 66, warmth: 78, pressure: 64, humor: 66, distance: 34, label: "热血护短", lexicon: ["本系统罩你", "记名弟子"] },
  C: { authority: 42, warmth: 92, pressure: 24, humor: 54, distance: 18, label: "共情陪伴", lexicon: ["我知道", "先缓一缓"] },
  D: { authority: 74, warmth: 48, pressure: 56, humor: 82, distance: 60, label: "算法解析", lexicon: ["检测到", "拆解一下"] },
};

const CRAFT_PRESETS: Readonly<Record<PersonalityLetter, VoicePreset & { interventionStyle: SystemPersonaProfile["interventionStyle"] }>> = {
  A: { authority: 94, warmth: 24, pressure: 94, humor: 58, distance: 80, label: "雷霆施压", lexicon: ["现在就写", "雷劫预警"], interventionStyle: "pressure" },
  B: { authority: 62, warmth: 78, pressure: 54, humor: 76, distance: 30, label: "灵感点燃", lexicon: ["先写一小口", "火花"] , interventionStyle: "inspire" },
  C: { authority: 44, warmth: 64, pressure: 18, humor: 90, distance: 44, label: "傲娇观察", lexicon: ["本座先看", "不急着判"] , interventionStyle: "observe" },
  D: { authority: 70, warmth: 68, pressure: 42, humor: 70, distance: 40, label: "天道奖赏", lexicon: ["完成即结算", "小礼法宝"] , interventionStyle: "reward" },
};

const SUBSYSTEM_CAPABILITIES = [
  "检查 whyNow、最小交付物和验收标准",
  "核对已登记的 activityKey 与 routeKey",
  "记录 artifact ref、验收状态和次日记忆",
] as const;

const FORBIDDEN_BEHAVIORS = [
  "替小说家写正文",
  "替小说家接受或完成生活活动",
  "凭空创造路线、坐标或未经登记的活动",
  "把对白、气泡或动画表现伪装成作品证据",
] as const;

const SUBSYSTEM_FORBIDDEN_BEHAVIORS = [
  "替主系统做人格式表达",
  "替小说家接受任务",
  "改变路线与活动真值",
] as const;

let memoryBinding: SystemBindingSnapshot | null = null;

function isPersonalityLetter(value: unknown): value is PersonalityLetter {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

export function isPersonalityCode(value: unknown): value is PersonalityCode {
  return typeof value === "string" && value.length === 3 && [...value].every(isPersonalityLetter);
}

function personalityParts(code: PersonalityCode): [PersonalityLetter, PersonalityLetter, PersonalityLetter] {
  return [code[0] as PersonalityLetter, code[1] as PersonalityLetter, code[2] as PersonalityLetter];
}

function mergeVoice(parts: VoicePreset[]): SystemPersonaProfile["voice"] {
  return {
    authority: Math.round(parts.reduce((sum, part) => sum + part.authority, 0) / parts.length),
    warmth: Math.round(parts.reduce((sum, part) => sum + part.warmth, 0) / parts.length),
    pressure: Math.round(parts.reduce((sum, part) => sum + part.pressure, 0) / parts.length),
    humor: Math.round(parts.reduce((sum, part) => sum + part.humor, 0) / parts.length),
    distance: Math.round(parts.reduce((sum, part) => sum + part.distance, 0) / parts.length),
  };
}

export function createOriginProfile(input: {
  identity: IdentitySeed;
  personalityCode: PersonalityCode;
  chosenAt?: string;
  bindingStatus?: BindingStatus;
}): OriginProfile {
  const portrait = IDENTITY_PORTRAITS[input.identity.id] ?? {
    genreFamily: input.identity.tag,
    formerRole: input.identity.name,
    lexicon: [input.identity.name],
    addressStyle: "以宿主为独立的人，不把他当成待操纵的道具",
  } satisfies IdentityPortrait;

  return {
    identityId: input.identity.id,
    identityName: input.identity.name,
    identityIcon: input.identity.icon,
    ...(input.identity.poseAssetRef ? { poseAssetRef: input.identity.poseAssetRef } : {}),
    genreFamily: portrait.genreFamily,
    formerRole: portrait.formerRole,
    originStoryRef: `paper-mirror:${input.identity.id}:origin-story-v1`,
    accidentBeatId: "accident-02",
    personalityCode: input.personalityCode,
    chosenAt: input.chosenAt ?? new Date().toISOString(),
    bindingStatus: input.bindingStatus ?? "bound",
  };
}

export function createSystemPersonaProfile(origin: OriginProfile): SystemPersonaProfile {
  const [worldviewLetter, relationshipLetter, craftLetter] = personalityParts(origin.personalityCode);
  const portrait = IDENTITY_PORTRAITS[origin.identityId] ?? {
    genreFamily: origin.genreFamily,
    formerRole: origin.formerRole,
    lexicon: [origin.identityName],
    addressStyle: "以宿主为独立的人，不把他当成待操纵的道具",
  } satisfies IdentityPortrait;
  const worldview = WORLDVIEW_PRESETS[worldviewLetter];
  const relationship = RELATION_PRESETS[relationshipLetter];
  const craft = CRAFT_PRESETS[craftLetter];
  const lexicon = [...new Set([
    ...portrait.lexicon,
    ...worldview.lexicon,
    ...relationship.lexicon,
    ...craft.lexicon,
  ])];

  return {
    personaSnapshotId: `persona:${origin.identityId}:${origin.personalityCode}`,
    origin,
    voice: mergeVoice([worldview, relationship, craft]),
    worldviewLabel: worldview.label,
    relationshipLabel: relationship.label,
    interventionLabel: craft.label,
    lexicon,
    addressStyle: portrait.addressStyle,
    interventionStyle: craft.interventionStyle,
    forbiddenBehaviors: FORBIDDEN_BEHAVIORS,
    subsystem: {
      subsystemId: "evidence-boundary-audit",
      role: "evidence-and-boundary-audit",
      eventType: "subsystem_notice",
      capabilities: SUBSYSTEM_CAPABILITIES,
      forbiddenBehaviors: SUBSYSTEM_FORBIDDEN_BEHAVIORS,
    },
  };
}

export function createInitialCreativeSupportTask(personaSnapshotId: string): CreativeSupportTask {
  return {
    taskId: "first-writing-attempt",
    personaSnapshotId,
    title: "先写一小段，不必立刻封神",
    status: "offered",
    whyNow: "系统观察到宿主已经在书桌附近，专注仍可用，但卡文正在把第一句拦在门外。",
    deliverable: "完成一段 120—200 字的草稿，只要求让一个具体动作发生。",
    acceptanceCriteria: [
      "至少出现一个可观察的动作或变化",
      "能看出这段文字属于正在写的故事",
      "保留原稿引用或草稿位置，便于之后验收",
    ],
    routeKey: "study-desk-stay",
    activityKey: "study-writing",
    evidence: {
      status: "awaiting",
      note: "尚未提交作品证据；系统不会把生活动画或一句对白算作稿件。",
    },
  };
}

export function createSystemBinding(input: {
  identity: IdentitySeed;
  personalityCode: PersonalityCode;
  chosenAt?: string;
  bindingStatus?: BindingStatus;
}): SystemBindingSnapshot {
  const origin = createOriginProfile(input);
  const persona = createSystemPersonaProfile(origin);
  return {
    version: 1,
    origin,
    persona,
    task: createInitialCreativeSupportTask(persona.personaSnapshotId),
    memory: {
      status: "pending",
      entries: [],
    },
    novelistRelationship: {
      trust: 22,
      turns: 0,
    },
  };
}

export function createPreviewSystemBinding(): SystemBindingSnapshot {
  return createSystemBinding({
    identity: {
      id: "xianxia",
      name: "玄烛剑尊",
      icon: "⚡",
      tag: "无敌剑尊",
      poseAssetRef: "/assets/prologue/reincarnation/xuanzhu/v1/character-card.webp",
    },
    personalityCode: "ABC",
    chosenAt: "2026-07-29T00:00:00.000Z",
    bindingStatus: "preview",
  });
}

function originBeat(
  identity: IdentitySeed,
  beatId: OriginStoryBeatId,
  title: string,
  visibleAction: string,
  emotionalDelta: string,
  textSlots: readonly string[],
  panelCount = 2,
): OriginStoryBeat {
  return {
    beatId,
    panelCount,
    title,
    visibleAction,
    emotionalDelta,
    assetRef: `paper-mirror:${identity.id}:origin-story-v1:${beatId}`,
    textSlots,
  };
}

export function createOriginStorySpec(identity: IdentitySeed): OriginStorySpec {
  const portrait = IDENTITY_PORTRAITS[identity.id] ?? {
    genreFamily: identity.tag,
    formerRole: identity.name,
    lexicon: [identity.name],
    addressStyle: "以宿主为独立的人，不把他当成待操纵的道具",
  } satisfies IdentityPortrait;
  const isXianxia = identity.id === "xianxia";
  const isDemon = identity.id === "demon";
  const beats: OriginStoryBeat[] = isXianxia
    ? [
      originBeat(identity, "memory-one", "钝铁起剑", "少年玄烛从暴雨尸堆中爬出，以一柄未开锋的钝铁剑杀出第一条生路。", "从死寂到拔剑", ["天道没有留路，他便自己杀出一条路。"]),
      originBeat(identity, "memory-two", "杀穿诸天", "他踏过围剿、旧恩、万剑碑、弟子与天魔，最终登临剑冢之巅，也把自己推到举世无敌的孤处。", "从锋芒到高处空寂", ["剑仍在手，天下却再无人值得他出剑。"]),
      originBeat(identity, "memory-climax", "一剑斩天", "九十九道紫霄神雷落下，玄烛身剑合一，将神雷与天穹一并切开。", "从无敌到向天问剑", ["若天道不答，本座便亲自斩开它。"]),
      originBeat(identity, "accident-01", "傲视天门", "玄烛横剑立于天缝之前，叫阵尚未结束，裂缝深处先亮起两盏不属于此界的远光灯。", "从狂傲到一瞬疑惑", ["滚出来吧，天帝——"]),
      originBeat(identity, "accident-02", "大运重卡降维撞击", "绿色大运重卡伴着柴油轰鸣冲出天缝，剑罡、雷光与玄烛的表情在同一页里全部失效。", "从向天问剑到荒诞中断", ["这铁壳神兽为何不遵五行？！"], 1),
      originBeat(identity, "accident-03", "白闪里的未完问句", "白光吞没重卡、天缝和人物，只保留一个尚未问完的停顿；撞击后果不在这一拍展示。", "从失控到硬切停顿", ["这到底是什么法宝——"]),
      originBeat(identity, "blackout", "事故报告", "画面黑屏，只剩一张格式极其正规的事故报告浮在虚空。", "从人生史诗到行政冷笑话", ["主要原因：非修为问题。", "责任归属：时空裂缝。", "申诉窗口：未找到。"], 1),
      originBeat(identity, "awakening", "主系统启动", "黑屏中央亮起一枚系统光标，旁边弹出权限很低但语气很冷的子系统窗口。", "从被撞飞到重新上线", ["主系统角色：小说家晋升系统。", "子系统：证据与边界审计模块。"], 1),
    ]
    : isDemon
      ? [
      originBeat(identity, "memory-one", "魔门账房的第一笔亏损", "他从正道不收、魔门嫌穷的外门账房学徒做起，先学会把亏损藏在账本最不显眼的一页。", "从拮据到机灵", ["修炼可以慢，账不能对不上。", "魔门讲究弱肉强食，账房讲究别让自己先被吃。"]),
      originBeat(identity, "memory-two", "把赔本买卖说成战略转进", "他替师兄弟收拾烂摊子，把三张欠条、半箱废丹和一场失败试炼包装成下一轮扩张的筹码。", "从狼狈到话术成形", ["这不是亏。", "这是暂时把胜利寄存在别人手里。"]),
      originBeat(identity, "memory-climax", "魔门大典的年度汇报", "众长老等着听他解释赤字，他抱着账本站上大殿，准备宣布本门今年的亏损属于战略转进。", "从紧张到荒诞自信", ["诸位长老，坏消息是我们没赚到钱。", "好消息是——"]),
      originBeat(identity, "accident-01", "天外来了未登记的催收", "大殿上方先传来不属于此界的引擎声，天空裂开一道缝，所有长老同时抬头，没人来得及翻下一页账。", "从自信到怀疑", ["警告：检测到跨界交通事故变量。"]),
      originBeat(identity, "accident-02", "大运提前结算", "异界大运重卡冲进魔门大典，车灯、账本和他尚未说完的汇报一起冲向另一重世界。", "从怀疑到魔性飞升", ["本尊没有亏！", "本尊只是被异界大运提前结算了！"], 1),
      originBeat(identity, "accident-03", "白光里的最后一笔账", "撞击后的白光迅速吞没大殿与账本，只留下一个还没来得及核对的念头；撞击后果不在这一拍展示。", "从魔性自信到失语停顿", ["这笔账……先记着。"]),
      originBeat(identity, "blackout", "事故报告", "画面黑屏，只剩一张格式严谨、责任模糊的跨界事故报告浮在虚空。", "从魔门史诗到行政冷笑话", ["主要原因：非经营问题。", "责任归属：时空裂缝。", "申诉窗口：需先缴纳手续费。"], 1),
      originBeat(identity, "awakening", "主系统启动", "黑屏中央亮起系统光标，旁边弹出权限很低但坚持要核账的子系统窗口。", "从被撞飞到重新上线", ["主系统角色：小说家晋升系统。", "子系统：证据与边界审计模块。"], 1),
    ]
    : [
      originBeat(identity, "memory-one", "原来的生活并不顺手", `${identity.name}从${portrait.formerRole}的日常里出发，先学会了如何在不够好的处境里继续做事。`, "从缺口到执念", [identity.name + "的故事还没有写到最顺利的地方。"]),
      originBeat(identity, "memory-two", "把失败攒成一条路", `他把一次次失败、加班、练习或等待攒成经验，相信下一次就能把人生推回正轨。`, "从受挫到积累", [identity.monologue ?? "下一次一定能翻盘。"]),
      originBeat(identity, "memory-climax", "最认真或最狼狈的一刻", `就在${identity.name}终于准备迎来高光的那一刻，命运把场面推到了无法撤回的位置。`, "从高光预备到命运停顿", ["这一次，应该轮到我了——"]),
      originBeat(identity, "accident-01", "裂缝先于解释出现", "空气里出现不属于原世界的声音，规则没有说明，旁观者也来不及鼓掌。", "从笃定到怀疑", ["检测到未登记的异界变量。"]),
      originBeat(identity, "accident-02", "大运负责把人撞走", "一辆异界大运从裂缝中冲出，把人生高光连同庄严姿势一起撞向另一重世界。", "从怀疑到荒诞飞升", [identity.accidentQuote ?? "这不在我的人生计划里！"], 1),
      originBeat(identity, "accident-03", "白光里的最后一句", `撞击后的白光吞没了${identity.name}与原世界，只留下一个没有来得及解释的念头；撞击后果不在这一拍展示。`, "从失控到失语停顿", ["等一下——"]),
      originBeat(identity, "blackout", "事故报告", "黑屏后只留下格式严谨、责任模糊、无法申诉的事故报告。", "从人生叙事到行政冷笑话", ["主要原因：命运临时改道。", "责任归属：异界大运。"], 1),
      originBeat(identity, "awakening", "主系统启动", "系统光标亮起，低权限子系统在旁边冷静报到。", "从被撞飞到重新上线", ["主系统角色：小说家晋升系统。", "子系统：证据与边界审计模块。"], 1),
    ];

  return {
    originStoryId: `origin-story:${identity.id}:v1`,
    identityId: identity.id,
    genreFamily: portrait.genreFamily,
    lifeArc: {
      startingGap: isXianxia ? "十二岁从宗门尸堆中活下来，只剩一柄未开锋的钝铁剑。" : isDemon ? "正道不收、魔门嫌穷，只能从外门账房和烂摊子里活下来。" : `从${identity.name}原本的缺口出发。`,
      longPursuit: isXianxia ? "以剑杀穿围剿、旧恩、天魔与诸天，直至举世无敌。" : isDemon ? "把亏损、欠条和失败试炼攒成一套能让魔门继续运转的话术。" : "把努力、受挫和代价攒成一次翻身幻觉。",
      costPaid: isXianxia ? "站上无人可敌的最高处，也失去了值得拔剑的人。" : isDemon ? "替所有人收拾烂账，却始终没来得及给自己留一条退路。" : "把人生里最认真、最狼狈的一段时间交给了目标。",
      hingeEvent: isXianxia ? "一剑斩开天穹、横剑问天时，天缝里冲出了异界大运重卡。" : isDemon ? "魔门年度汇报还没讲完，异界大运先替他完成了结算。" : "人生关键时刻被异界大运从原世界撞离。",
      unfinishedThought: isXianxia ? "这铁壳神兽到底是什么法宝。" : isDemon ? "这笔账，先记着。" : "这件事，应该还可以申诉。",
    },
    beats,
    accident: {
      class: "cross-world-fortune-impact",
      vehicleSkin: `异界大运重卡 · ${identity.tag}事故皮肤`,
      officialCause: "时空裂缝与异界大运路线临时重叠。",
      finalReport: isDemon ? "主要原因：年度账目尚未结清；责任归属：时空裂缝；申诉窗口：需先缴纳手续费。" : "主要原因：人生写得太满；责任归属：时空裂缝；申诉窗口：未找到。",
    },
    awakening: {
      systemRole: "novelist-promotion-system",
      subsystemRef: "evidence-boundary-audit",
      firstConstraint: "可以观察、对话、扶持和验收，但不能替小说家生活或写正文。",
    },
    scriptVersion: isXianxia ? "xuanzhu-origin-comic-v5" : "origin-story-v1",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && [...value].length <= maxLength
    && (allowEmpty || value.trim().length > 0);
}

function isTimestamp(value: unknown): value is string {
  return isBoundedString(value, 120) && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown, maxItems: number, maxItemLength: number): value is readonly string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= maxItems
    && value.every((item) => isBoundedString(item, maxItemLength));
}

function hasExactStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function isScore(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 100;
}

function isValidOrigin(value: unknown): value is OriginProfile {
  if (!isRecord(value)) return false;
  const identityId = value.identityId;
  if (!isBoundedString(identityId, 120)) return false;
  return isBoundedString(value.identityName, 160)
    && isBoundedString(value.identityIcon, 32)
    && (value.poseAssetRef === undefined || isBoundedString(value.poseAssetRef, 400))
    && isBoundedString(value.genreFamily, 160)
    && isBoundedString(value.formerRole, 240)
    && value.originStoryRef === `paper-mirror:${identityId}:origin-story-v1`
    && value.accidentBeatId === "accident-02"
    && isPersonalityCode(value.personalityCode)
    && isTimestamp(value.chosenAt)
    && (value.bindingStatus === "preview" || value.bindingStatus === "bound");
}

const ORIGIN_PROFILE_KEYS: readonly (keyof OriginProfile)[] = [
  "identityId",
  "identityName",
  "identityIcon",
  "poseAssetRef",
  "genreFamily",
  "formerRole",
  "originStoryRef",
  "accidentBeatId",
  "personalityCode",
  "chosenAt",
  "bindingStatus",
];

function sameOriginProfile(left: unknown, right: unknown): boolean {
  if (!isValidOrigin(left) || !isValidOrigin(right)) return false;
  return ORIGIN_PROFILE_KEYS.every((key) => left[key] === right[key]);
}

function isValidVoice(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isScore(value.authority)
    && isScore(value.warmth)
    && isScore(value.pressure)
    && isScore(value.humor)
    && isScore(value.distance);
}

function hasExactVoice(value: unknown, expected: SystemPersonaProfile["voice"]): boolean {
  return isRecord(value)
    && value.authority === expected.authority
    && value.warmth === expected.warmth
    && value.pressure === expected.pressure
    && value.humor === expected.humor
    && value.distance === expected.distance;
}

function isValidSubsystem(value: unknown): value is SubSystemProfile {
  return isRecord(value)
    && value.subsystemId === "evidence-boundary-audit"
    && value.role === "evidence-and-boundary-audit"
    && value.eventType === "subsystem_notice"
    && hasExactStringArray(value.capabilities, SUBSYSTEM_CAPABILITIES)
    && hasExactStringArray(value.forbiddenBehaviors, SUBSYSTEM_FORBIDDEN_BEHAVIORS);
}

function isValidPersona(value: unknown, origin: OriginProfile): value is SystemPersonaProfile {
  if (!isRecord(value)) return false;
  const expected = createSystemPersonaProfile(origin);
  return value.personaSnapshotId === expected.personaSnapshotId
    && sameOriginProfile(value.origin, origin)
    && isValidVoice(value.voice)
    && hasExactVoice(value.voice, expected.voice)
    && value.worldviewLabel === expected.worldviewLabel
    && value.relationshipLabel === expected.relationshipLabel
    && value.interventionLabel === expected.interventionLabel
    && isStringArray(value.lexicon, 64, 160)
    && hasExactStringArray(value.lexicon, expected.lexicon)
    && value.addressStyle === expected.addressStyle
    && value.interventionStyle === expected.interventionStyle
    && hasExactStringArray(value.forbiddenBehaviors, expected.forbiddenBehaviors)
    && isValidSubsystem(value.subsystem);
}

function isValidEvidence(value: unknown): value is CreativeSupportTask["evidence"] {
  if (!isRecord(value)
    || (value.status !== "awaiting"
      && value.status !== "submitted"
      && value.status !== "accepted"
      && value.status !== "needs-revision")
    || !isBoundedString(value.note, 600)) {
    return false;
  }
  const hasArtifact = isBoundedString(value.artifactRef, 400);
  const hasSubmittedAt = isTimestamp(value.submittedAt);
  const hasNoArtifact = value.artifactRef === undefined && value.submittedAt === undefined;
  if (value.status === "awaiting") return hasNoArtifact;
  if (value.status === "submitted" || value.status === "accepted") {
    return hasArtifact && hasSubmittedAt;
  }
  return hasNoArtifact || (hasArtifact && hasSubmittedAt);
}

function isValidTask(value: unknown, personaSnapshotId: string): value is CreativeSupportTask {
  if (!isRecord(value)) return false;
  const valid = value.taskId === "first-writing-attempt"
    && value.personaSnapshotId === personaSnapshotId
    && isBoundedString(value.title, 200)
    && (value.status === "offered" || value.status === "accepted" || value.status === "deferred" || value.status === "scoped")
    && isBoundedString(value.whyNow, 600)
    && isBoundedString(value.deliverable, 600)
    && isStringArray(value.acceptanceCriteria, 16, 400)
    && (value.userInstruction === undefined || isBoundedString(value.userInstruction, 600))
    && value.routeKey === "study-desk-stay"
    && value.activityKey === "study-writing"
    && isValidEvidence(value.evidence);
  return valid && (
    value.status !== "offered"
    || (isRecord(value.evidence) && value.evidence.status === "awaiting")
  );
}

function isValidMemoryLedger(value: unknown): value is SystemMemoryLedger {
  return isRecord(value)
    && (value.status === "pending" || value.status === "recorded")
    && Array.isArray(value.entries)
    && value.entries.length <= 64
    && value.entries.every((entry) => isBoundedString(entry, 600));
}

function isValidConversation(value: unknown): boolean {
  return value === undefined || (
    Array.isArray(value)
    && value.length <= 24
    && value.every((message) => isRecord(message)
      && isBoundedString(message.id, 200)
      && (message.role === "system" || message.role === "novelist")
      && isBoundedString(message.text, 600, true)
      && isTimestamp(message.createdAt))
  );
}

function isValidRelationship(value: unknown): value is NovelistRelationshipSnapshot {
  return isRecord(value)
    && isScore(value.trust)
    && typeof value.turns === "number"
    && Number.isInteger(value.turns)
    && value.turns >= 0;
}

export function isValidSystemBinding(value: unknown): value is SystemBindingSnapshot {
  if (!isRecord(value) || value.version !== SYSTEM_BINDING_VERSION) return false;
  const origin = value.origin;
  if (!isValidOrigin(origin)) return false;
  const persona = value.persona;
  if (!isValidPersona(persona, origin)) return false;
  return isValidTask(value.task, persona.personaSnapshotId)
    && isValidMemoryLedger(value.memory)
    && (value.novelistRelationship === undefined || isValidRelationship(value.novelistRelationship))
    && isValidConversation(value.conversation)
    && isValidConversation(value.subsystemConversation);
}

export class InvalidSystemBindingError extends Error {
  constructor() {
    super("Refusing to persist an invalid system binding snapshot");
    this.name = "InvalidSystemBindingError";
  }
}

export class InvalidCreativeTaskTransitionError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "InvalidCreativeTaskTransitionError";
  }
}

function readStorage(): unknown {
  if (typeof window === "undefined") return memoryBinding;
  // v1 deliberately fails closed: unknown versions are not silently migrated.
  // A future schema must provide an explicit migration before it is accepted.
  try {
    const raw = window.localStorage.getItem(SYSTEM_BINDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadSystemBinding(): SystemBindingSnapshot | null {
  const raw = readStorage();
  return isValidSystemBinding(raw) ? raw : null;
}

export function saveSystemBinding(binding: SystemBindingSnapshot): SystemBindingSnapshot {
  if (!isValidSystemBinding(binding)) throw new InvalidSystemBindingError();
  memoryBinding = binding;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SYSTEM_BINDING_STORAGE_KEY, JSON.stringify(binding));
    } catch {
      // A storage failure should never prevent the room from rendering.
    }
  }
  return binding;
}

export function clearSystemBinding(): void {
  memoryBinding = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYSTEM_BINDING_STORAGE_KEY);
  } catch {
    // Clearing a best-effort snapshot remains non-fatal.
  }
}

const TASK_STATUS_TRANSITIONS: Readonly<Record<CreativeSupportTaskStatus, readonly CreativeSupportTaskStatus[]>> = {
  offered: ["offered", "accepted", "deferred", "scoped"],
  accepted: ["accepted", "deferred", "scoped"],
  deferred: ["deferred", "accepted", "scoped"],
  scoped: ["scoped", "accepted", "deferred"],
};

const EVIDENCE_STATUS_TRANSITIONS: Readonly<Record<EvidenceStatus, readonly EvidenceStatus[]>> = {
  awaiting: ["awaiting", "submitted", "needs-revision"],
  submitted: ["submitted", "accepted", "needs-revision"],
  accepted: ["accepted", "needs-revision"],
  "needs-revision": ["needs-revision", "submitted", "accepted"],
};

function assertTaskStatusTransition(
  current: CreativeSupportTaskStatus,
  next: CreativeSupportTaskStatus,
) {
  if (!TASK_STATUS_TRANSITIONS[current].includes(next)) {
    throw new InvalidCreativeTaskTransitionError(
      `task status cannot move from ${current} to ${next}`,
    );
  }
}

function assertEvidenceStatusTransition(current: EvidenceStatus, next: EvidenceStatus) {
  if (!EVIDENCE_STATUS_TRANSITIONS[current].includes(next)) {
    throw new InvalidCreativeTaskTransitionError(
      `evidence status cannot move from ${current} to ${next}`,
    );
  }
}

export function updateCreativeSupportTask(
  binding: SystemBindingSnapshot,
  patch: Partial<Pick<CreativeSupportTask, "status" | "deliverable" | "evidence" | "userInstruction">>,
): SystemBindingSnapshot {
  if (patch.status !== undefined) {
    assertTaskStatusTransition(binding.task.status, patch.status);
  }
  if (patch.evidence?.status !== undefined) {
    assertEvidenceStatusTransition(binding.task.evidence.status, patch.evidence.status);
  }
  const next: SystemBindingSnapshot = {
    ...binding,
    task: {
      ...binding.task,
      ...patch,
      ...(patch.evidence ? { evidence: { ...binding.task.evidence, ...patch.evidence } } : {}),
    },
  };
  if (!isValidSystemBinding(next)) throw new InvalidSystemBindingError();
  return binding.origin.bindingStatus === "bound" ? saveSystemBinding(next) : next;
}

export function applyCreativeSupportDecision(
  binding: SystemBindingSnapshot,
  input: CreativeSupportDecisionInput,
): SystemBindingSnapshot {
  const userInstruction = input.userInstruction?.trim();
  const instructionPatch = userInstruction ? { userInstruction } : {};
  if (input.decision === "accept") {
    return updateCreativeSupportTask(binding, { status: "accepted", ...instructionPatch });
  }
  if (input.decision === "defer") {
    return updateCreativeSupportTask(binding, { status: "deferred", ...instructionPatch });
  }
  if (input.decision === "scope") {
    const deliverable = input.deliverable?.trim() || "完成一段 60—100 字的草稿，只要求让一个具体动作发生。";
    return updateCreativeSupportTask(binding, {
      status: "scoped",
      deliverable,
      ...instructionPatch,
    });
  }
  return updateCreativeSupportTask(binding, {
    status: "accepted",
    ...instructionPatch,
    evidence: {
      status: "needs-revision",
      note: "用户明确要求返修；既有引用保留，等待新稿替换，不能把旧稿当成新稿。",
    },
  });
}

export function submitCreativeEvidence(
  binding: SystemBindingSnapshot,
  input: { artifactRef: string; submittedAt?: string; note?: string },
): SystemBindingSnapshot {
  if (binding.task.status !== "accepted" && binding.task.status !== "scoped") {
    throw new InvalidCreativeTaskTransitionError(
      "creative evidence cannot be submitted before the task is accepted or scoped",
    );
  }
  const artifactRef = input.artifactRef.trim();
  if (!artifactRef) throw new InvalidCreativeTaskTransitionError("artifactRef must be non-empty");
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  if (!isTimestamp(submittedAt)) {
    throw new InvalidCreativeTaskTransitionError("submittedAt must be a valid timestamp");
  }
  return updateCreativeSupportTask(binding, {
    evidence: {
      status: "submitted",
      artifactRef,
      submittedAt,
      note: input.note?.trim() || "已登记引用，等待验收；提交本身不等于作品已被正式接收。",
    },
  });
}

export function resolveCreativeEvidence(
  binding: SystemBindingSnapshot,
  input: { status: CreativeEvidenceResolution; note: string },
): SystemBindingSnapshot {
  if (binding.task.evidence.status !== "submitted" && binding.task.evidence.status !== "needs-revision") {
    throw new InvalidCreativeTaskTransitionError(
      "only submitted or needs-revision evidence can be resolved",
    );
  }
  const note = input.note.trim();
  if (!note) throw new InvalidCreativeTaskTransitionError("evidence resolution note must be non-empty");
  return updateCreativeSupportTask(binding, {
    evidence: { status: input.status, note },
  });
}

export function recordNextDayMemory(binding: SystemBindingSnapshot, entry: string): SystemBindingSnapshot {
  const normalized = entry.trim();
  if (!normalized) throw new InvalidCreativeTaskTransitionError("next-day memory entry must be non-empty");
  if (binding.memory.entries.includes(normalized)) return binding;
  const next: SystemBindingSnapshot = {
    ...binding,
    memory: {
      status: "recorded",
      entries: [...binding.memory.entries, normalized].slice(-64),
    },
  };
  if (!isValidSystemBinding(next)) throw new InvalidSystemBindingError();
  return binding.origin.bindingStatus === "bound" ? saveSystemBinding(next) : next;
}

export function projectSystemLayer(binding: SystemBindingSnapshot): SystemLayerProjection {
  if (!isValidSystemBinding(binding)) throw new InvalidSystemBindingError();
  const relationship = binding.novelistRelationship ?? { trust: 22, turns: 0 };
  return {
    schema: "system-layer-projection-v1",
    bindingStatus: binding.origin.bindingStatus,
    identity: {
      identityId: binding.origin.identityId,
      identityName: binding.origin.identityName,
      identityIcon: binding.origin.identityIcon,
      poseAssetRef: binding.origin.poseAssetRef ?? null,
      genreFamily: binding.origin.genreFamily,
      formerRole: binding.origin.formerRole,
      originStoryRef: binding.origin.originStoryRef,
      accidentBeatId: binding.origin.accidentBeatId,
      personalityCode: binding.origin.personalityCode,
    },
    persona: {
      personaSnapshotId: binding.persona.personaSnapshotId,
      voice: { ...binding.persona.voice },
      worldviewLabel: binding.persona.worldviewLabel,
      relationshipLabel: binding.persona.relationshipLabel,
      interventionLabel: binding.persona.interventionLabel,
      lexicon: [...binding.persona.lexicon],
      addressStyle: binding.persona.addressStyle,
      interventionStyle: binding.persona.interventionStyle,
    },
    subsystem: {
      ...binding.persona.subsystem,
      capabilities: [...binding.persona.subsystem.capabilities],
      forbiddenBehaviors: [...binding.persona.subsystem.forbiddenBehaviors],
    },
    task: {
      taskId: binding.task.taskId,
      status: binding.task.status,
      title: binding.task.title,
      whyNow: binding.task.whyNow,
      deliverable: binding.task.deliverable,
      acceptanceCriteria: [...binding.task.acceptanceCriteria],
      userInstruction: binding.task.userInstruction ?? null,
      routeKey: binding.task.routeKey,
      activityKey: binding.task.activityKey,
      evidence: {
        status: binding.task.evidence.status,
        artifactRef: binding.task.evidence.artifactRef ?? null,
        submittedAt: binding.task.evidence.submittedAt ?? null,
        note: binding.task.evidence.note,
      },
    },
    relationship: { ...relationship },
    memory: { status: binding.memory.status, entries: [...binding.memory.entries] },
    channels: {
      novelist: [...(binding.conversation ?? [])],
      subsystem: [...(binding.subsystemConversation ?? [])],
    },
  };
}

export function updateSystemConversation(
  binding: SystemBindingSnapshot,
  messages: readonly SystemConversationMessage[],
): SystemBindingSnapshot {
  const next: SystemBindingSnapshot = {
    ...binding,
    conversation: messages.slice(-24),
  };
  return binding.origin.bindingStatus === "bound" ? saveSystemBinding(next) : next;
}

export function updateSubsystemConversation(
  binding: SystemBindingSnapshot,
  messages: readonly SystemConversationMessage[],
): SystemBindingSnapshot {
  const next: SystemBindingSnapshot = {
    ...binding,
    subsystemConversation: messages.slice(-24),
  };
  return binding.origin.bindingStatus === "bound" ? saveSystemBinding(next) : next;
}

export function updateNovelistRelationship(
  binding: SystemBindingSnapshot,
  relationshipDelta: number,
): SystemBindingSnapshot {
  const current = binding.novelistRelationship ?? {
    trust: Math.min(52, 22 + Math.floor((binding.conversation?.length ?? 0) / 2) * 2),
    turns: Math.floor((binding.conversation?.length ?? 0) / 2),
  };
  const next: SystemBindingSnapshot = {
    ...binding,
    novelistRelationship: {
      trust: Math.max(0, Math.min(100, Math.round(current.trust + relationshipDelta))),
      turns: current.turns + 1,
    },
  };
  return binding.origin.bindingStatus === "bound" ? saveSystemBinding(next) : next;
}

export function getSystemDialogue(
  persona: SystemPersonaProfile,
  task: CreativeSupportTask,
  observation: { sceneLabel: string; activityLabel: string; focus: number; fatigue: number },
): string {
  if (task.status === "accepted") {
    return `${persona.origin.identityIcon} ${observation.sceneLabel}已纳入扶持范围。${persona.addressStyle}——先完成这一小段，写完再谈封神。`;
  }
  if (task.status === "deferred") {
    return `本座暂不追着你跑。任务已挂起，等${observation.activityLabel}真正适合时再叫醒它。`;
  }
  if (task.status === "scoped") {
    return `检测到今日余力有限，任务已缩小。只让一个动作发生，别把一段话修成三百年闭关。`;
  }
  if (observation.fatigue >= 75) {
    return `先别逞强。系统可以催稿，但不能把疲劳伪装成灵感；这次只发布一个可随时暂停的小任务。`;
  }
  if (observation.focus >= 55) {
    return `检测到宿主还有一缕专注。${persona.origin.identityName}建议：趁它没逃，先把这一小段写出来。`;
  }
  return `当前不要求奇迹。先把${observation.sceneLabel}里的一个具体动作交给纸面，剩下的等宿主自己决定。`;
}

export const SYSTEM_BINDING_STORAGE_KEY_FOR_TESTS = SYSTEM_BINDING_STORAGE_KEY;
