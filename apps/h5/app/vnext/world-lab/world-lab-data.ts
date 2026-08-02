export type OpeningId = "immortal" | "martial" | "mystery" | "court";
export type ToneId = "rise" | "abyss" | "secret";
export type NodeKind = "character" | "place" | "faction" | "object" | "event";
export type GraphDisplayRole = "entity" | "context" | "evidence";
export type NarrativeLayer = "world" | "volume" | "arc" | "chapter" | "scene" | "entity" | "evidence";
export type GraphTruthStatus = "canon" | "candidate" | "sandbox" | "rejected";
export type GraphSalience = "active" | "supporting" | "latent" | "archive";
export type FactStatus = "candidate" | "accepted" | "rejected";
export type StoryDirectorProposalStatus = "pending" | "fulfilled" | "dismissed";
export type CharacterTruthStatus = "canon" | "candidate" | "unknown";
export type PortraitSource = "fixture" | "upload" | "generated";

export interface OpeningChoice {
  id: OpeningId;
  title: string;
  scene: string;
  genre: string;
}

export interface ToneChoice {
  id: ToneId;
  title: string;
  copy: string;
}

export interface StoryRecord {
  id: string;
  title: string;
  premise: string;
  continuationContext?: {
    chapterTitle: string;
    brief: string;
    excerpt: string;
  };
}

export interface WorldNode {
  id: string;
  label: string;
  kind: NodeKind;
  summary: string;
  x: number;
  y: number;
  storyIds: string[];
  /** Entity nodes render in narrative views; context nodes are folded by default. */
  displayRole?: GraphDisplayRole;
  narrativeLayer?: NarrativeLayer;
  truthStatus?: GraphTruthStatus;
  salience?: GraphSalience;
  parentNodeId?: string;
  volumeId?: string;
  arcId?: string;
  chapterIds?: string[];
  sourceChapterIds?: string[];
  sourceTurnId?: string;
  sourceStoryId?: string;
  character?: CharacterProfile | undefined;
}

export interface CharacterTruthField {
  id: string;
  label: string;
  value: string;
  status: CharacterTruthStatus;
  source: string;
}

export interface CharacterPortrait {
  url: string;
  alt: string;
  source: PortraitSource;
  filename?: string | undefined;
}

export interface CharacterProfile {
  role: string;
  tagline: string;
  fields: CharacterTruthField[];
  portrait?: CharacterPortrait | undefined;
}

export interface WorldEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  storyIds: string[];
  relationType?: string;
  truthStatus?: GraphTruthStatus;
  sourceChapterIds?: string[];
  eventNodeId?: string;
  sourceTurnId?: string;
  sourceStoryId?: string;
}

export interface WorldFact {
  id: string;
  statement: string;
  source: string;
  status: FactStatus;
  storyIds: string[];
  /** Entities this fact is about; absent means the fact is world-level. */
  targetNodeIds?: string[];
}

/**
 * A user-authored direction for the writing model. It is deliberately not a
 * fact or a branch: the model may choose a later, causally suitable moment,
 * while the user can still dismiss or mark the plan fulfilled.
 */
export interface StoryDirectorProposal {
  id: string;
  storyId: string;
  sourceBranchId: string;
  sourceTurnId: string;
  userRequest: string;
  title: string;
  proposal: string;
  timing: "next_scene" | "near_arc" | "later_arc" | "conditional";
  timingReason: string;
  setup: string;
  payoff: string;
  involvedNodeIds: string[];
  guardrails: string[];
  /** References used for this proposal only; they are not canon facts. */
  referenceMaterials?: string[];
  status: StoryDirectorProposalStatus;
  createdAt: string;
  trace: {
    traceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.story-director-proposal.v1";
    outputHash: string;
  };
}

export type DirectorLibraryCardStatus = "active" | "dismissed";
export type DirectorJokeIntent = "library_only" | "opportunistic" | "plot_seed";

/**
 * Materials created on the director desk are reusable creative aids. They are
 * intentionally a different data family from WorldFact and StoryRecord.
 */
export interface DirectorLibraryTrace {
  traceId: string;
  provider: string;
  model: string;
  workflowVersion: "vnext.story-director-library.v1";
  outputHash: string;
}

export interface DirectorKnowledgeCard {
  id: string;
  storyId: string;
  topic: string;
  summary: string;
  concepts: string[];
  culturalContext: string;
  applicationToStory: string;
  sourceNote: string;
  caveats: string[];
  status: DirectorLibraryCardStatus;
  createdAt: string;
  notCanon: true;
  notManuscript: true;
  trace: DirectorLibraryTrace;
}

export interface DirectorCraftCard {
  id: string;
  storyId: string;
  title: string;
  pattern: string;
  relatedPatterns: string[];
  useWhen: string;
  cadence: string;
  risk: string;
  exampleStructure: string;
  status: DirectorLibraryCardStatus;
  createdAt: string;
  notCanon: true;
  notManuscript: true;
  trace: DirectorLibraryTrace;
}

export interface DirectorJokeCard {
  id: string;
  storyId: string;
  phrase: string;
  meaning: string;
  category: string;
  suitableWhen: string;
  avoidWhen: string;
  frequencyBudget: string;
  characterFit: string;
  plotSeed: string;
  insertionMode: DirectorJokeIntent;
  status: DirectorLibraryCardStatus;
  createdAt: string;
  notCanon: true;
  notManuscript: true;
  trace: DirectorLibraryTrace;
}

export interface WorldRecord {
  id: string;
  title: string;
  genre: string;
  sourceManuscriptId?: string;
  stories: StoryRecord[];
  nodes: WorldNode[];
  edges: WorldEdge[];
  facts: WorldFact[];
  directorProposals?: StoryDirectorProposal[];
}

export interface QuartzNote {
  path: string;
  content: string;
}

export const OPENING_CHOICES: OpeningChoice[] = [
  {
    id: "immortal",
    title: "破庙残剑",
    scene: "雨漏进香案，一柄断剑却在叫你的名字。",
    genre: "修仙",
  },
  {
    id: "martial",
    title: "擂台倒计时",
    scene: "你只剩三十息，而台下没有一个人押你能活。",
    genre: "高武",
  },
  {
    id: "mystery",
    title: "封锁线内",
    scene: "死者口袋里，是一张写着你明天死期的车票。",
    genre: "悬疑",
  },
  {
    id: "court",
    title: "空白密诏",
    scene: "长公主把空白圣旨推来，只问你敢不敢写第一个名字。",
    genre: "古言权谋",
  },
];

export const TONE_CHOICES: ToneChoice[] = [
  { id: "rise", title: "先赢一口气", copy: "开局就让命运知道你不是来认输的。" },
  { id: "abyss", title: "先输到谷底", copy: "退路烧光以后，人物才开始露出真心。" },
  { id: "secret", title: "先藏一个秘密", copy: "表面平静，第一章末尾再把门推开。" },
];

const OPENING_COPY: Record<OpeningId, Record<ToneId, string>> = {
  immortal: {
    rise: "断剑第三次震响时，你握住了它。庙外那位追了你七百里的仙师忽然停步，因为供桌上的泥像，全都转过脸来看他。",
    abyss: "你把最后一块干粮留给了神像，神像却在夜里倒下，露出墙后那具和你长着同一张脸的白骨。",
    secret: "断剑只说了一句话：别让山上的人知道，你已经死过一次。随后，庙门被人从外面轻轻叩响。",
  },
  martial: {
    rise: "铜锣还没落下，你先折断了自己的护腕。台下笑声骤停，因为那不是护具，而是城主亲手加给你的三十斤锁。",
    abyss: "第九次倒下时，裁判已经不再数数。你听见骨头里有人叹气：借我十息，我替你把这场命赢回来。",
    secret: "所有人都知道你今天必输，只有盘口不知道，昨夜死去的拳王把最后一招留在了你的影子里。",
  },
  mystery: {
    rise: "你把车票翻过来，当众写下凶手的名字。封锁线外立刻有人转身，而死者那只停了十二年的手表，重新走了一秒。",
    abyss: "车票上的日期没有印错。真正出错的是你的记忆：你明明从未见过死者，却记得他临终前叫过你的小名。",
    secret: "你把车票藏进袖口，没有告诉任何人，背面那行字正是你的笔迹。监控画面里，昨夜的你已经走进了站台。",
  },
  court: {
    rise: "你提笔写下摄政王的名字。殿外三千禁军同时拔刀，长公主却笑了：很好，现在他们都知道你站在哪边。",
    abyss: "你还没碰到笔，宫门外便传来满门抄斩的旨意。长公主看着你说：现在这张纸，能救的只剩一个人。",
    secret: "你没有写名字，只在圣旨末尾画了一朵旧梅。长公主脸上的笑意消失了，因为那是先帝从未传世的私印。",
  },
};

function node(
  id: string,
  label: string,
  kind: NodeKind,
  summary: string,
  x: number,
  y: number,
  storyId: string,
  character?: CharacterProfile,
): WorldNode {
  return { id, label, kind, summary, x, y, storyIds: [storyId], ...(character ? { character } : {}) };
}

function protagonistProfile(name: string, opening: OpeningChoice, tone: ToneChoice, object: string): CharacterProfile {
  return {
    role: "本书主角",
    tagline: "刚被命运叫到名字，还没有把底牌交出去。",
    fields: [
      { id: "identity", label: "身份", value: `${opening.genre}故事的主角`, status: "canon", source: "创作空间" },
      { id: "temperament", label: "性格", value: tone.id === "rise" ? "迎着压力先赢一口气" : tone.id === "abyss" ? "跌到谷底才肯露出真心" : "克制，习惯先藏住秘密", status: "candidate", source: "开篇选择推断" },
      { id: "desire", label: "当前目标", value: `弄清${object}为什么选中了自己`, status: "candidate", source: "开篇关系推断" },
      { id: "secret", label: "隐秘", value: opening.id === "immortal" ? "可能已经死过一次" : "过去存在一段尚未解释的断层", status: "candidate", source: "开篇钩子" },
      { id: "state", label: "当前状态", value: opening.scene, status: "canon", source: "已选择的开篇" },
    ],
  };
}

function writerProfile(): CharacterProfile {
  return {
    role: "世界记录者",
    tagline: "嘴上说一般，实际会替你记住每一条正史。",
    fields: [
      { id: "identity", label: "身份", value: "创作空间中的叙事协作者", status: "canon", source: "系统角色" },
      { id: "temperament", label: "性格", value: "谨慎、嘴硬、对故事细节异常认真", status: "candidate", source: "交互语气提炼" },
      { id: "desire", label: "当前目标", value: "帮助用户把选择长成一整个世界", status: "canon", source: "产品设定" },
      { id: "secret", label: "隐秘", value: "尚未写下", status: "unknown", source: "等待正文" },
    ],
  };
}

export function createOpeningWorld(openingId: OpeningId, toneId: ToneId): WorldRecord {
  const opening = OPENING_CHOICES.find((item) => item.id === openingId) ?? OPENING_CHOICES[0]!;
  const tone = TONE_CHOICES.find((item) => item.id === toneId) ?? TONE_CHOICES[0]!;
  const storyId = `story-${opening.id}-01`;
  const worldId = `world-${opening.id}`;
  const protagonist = opening.id === "court" ? "沈照微" : opening.id === "mystery" ? "周既明" : "陆停舟";
  const anchorPlace = opening.id === "mystery" ? "北岸旧站" : opening.id === "court" ? "含章殿" : opening.id === "martial" ? "赤鲸擂台" : "听雨破庙";
  const faction = opening.id === "court" ? "司夜台" : opening.id === "mystery" ? "第七码头分局" : opening.id === "martial" ? "临海武馆" : "照骨山";
  const object = opening.id === "mystery" ? "明日车票" : opening.id === "court" ? "空白密诏" : opening.id === "martial" ? "三十斤锁" : "无名断剑";

  const nodes = [
    node("protagonist", protagonist, "character", "刚刚被故事选中的主角。", 340, 190, storyId, protagonistProfile(protagonist, opening, tone, object)),
    node("writer", "二流小说家", "character", "嘴上说一般，实际已经开始替你记正史。", 118, 88, storyId, writerProfile()),
    node("place", anchorPlace, "place", opening.scene, 564, 88, storyId),
    node("faction", faction, "faction", "第一股尚未看清立场的力量。", 588, 310, storyId),
    node("object", object, "object", "开篇中改变命运走向的关键物。", 112, 318, storyId),
    node("event", tone.title, "event", tone.copy, 342, 352, storyId),
  ];

  return {
    id: worldId,
    title: `${opening.title}世界`,
    genre: opening.genre,
    stories: [
      {
        id: storyId,
        title: `${opening.title}：第一夜`,
        premise: OPENING_COPY[opening.id][tone.id],
      },
    ],
    nodes,
    edges: [
      { id: "e1", source: "writer", target: "protagonist", label: "记得", storyIds: [storyId] },
      { id: "e2", source: "protagonist", target: "place", label: "醒于", storyIds: [storyId] },
      { id: "e3", source: "object", target: "protagonist", label: "选中", storyIds: [storyId] },
      { id: "e4", source: "faction", target: "place", label: "控制", storyIds: [storyId] },
      { id: "e5", source: "event", target: "protagonist", label: "改变", storyIds: [storyId] },
    ],
    facts: [
      {
        id: "fact-1",
        statement: `${protagonist}第一次听见${object}说话。`,
        source: "开篇第 1 段",
        status: "candidate",
        storyIds: [storyId],
      },
      {
        id: "fact-2",
        statement: `${faction}与${anchorPlace}存在尚未公开的控制关系。`,
        source: "场景推断，等待确认",
        status: "candidate",
        storyIds: [storyId],
      },
      {
        id: "fact-3",
        statement: `${object}知道主角过去的一段隐秘。`,
        source: "开篇钩子",
        status: "candidate",
        storyIds: [storyId],
      },
    ],
  };
}

function slug(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export function buildQuartzNotes(world: WorldRecord): QuartzNote[] {
  const acceptedFacts = world.facts.filter((fact) => fact.status === "accepted");
  const nodeLinks = world.nodes.map((item) => `- [[${item.label}]]`).join("\n");
  const storyLinks = world.stories.map((story) => `- [[${story.title}]]`).join("\n");
  const index = `---\ntitle: ${world.title}\ntags: [二流小说家, 世界观]\n---\n\n# ${world.title}\n\n## 小说\n\n${storyLinks}\n\n## 世界节点\n\n${nodeLinks}\n\n## 已确认正史\n\n${acceptedFacts.length > 0 ? acceptedFacts.map((fact) => `- ${fact.statement}`).join("\n") : "- 暂无，候选事实仍等待确认。"}\n`;

  const nodeNotes = world.nodes.map((item) => {
    const relations = world.edges
      .filter((edge) => edge.source === item.id || edge.target === item.id)
      .map((edge) => {
        const targetId = edge.source === item.id ? edge.target : edge.source;
        const target = world.nodes.find((candidate) => candidate.id === targetId);
        return target ? `- ${edge.label} [[${target.label}]]` : null;
      })
      .filter((line): line is string => line !== null)
      .join("\n");
    const characterFields = item.character?.fields
      .map((field) => `- **${field.label}**：${field.value}（${field.status === "canon" ? "正史" : field.status === "candidate" ? "候选" : "待补充"}；来源：${field.source}）`)
      .join("\n");
    return {
      path: `content/nodes/${slug(item.label)}.md`,
      content: `---\ntitle: ${item.label}\ntags: [${item.kind}, ${world.genre}]\n---\n\n# ${item.label}\n\n${item.summary}\n${item.character ? `\n## 角色档案\n\n> ${item.character.tagline}\n\n${characterFields || "- 暂无角色字段。"}\n` : ""}\n## 关系\n\n${relations || "- 暂无已确认关系。"}\n\n返回 [[${world.title}]]。\n`,
    };
  });

  const storyNotes = world.stories.map((story) => ({
    path: `content/stories/${slug(story.title)}.md`,
    content: `---\ntitle: ${story.title}\ntags: [小说, ${world.genre}]\n---\n\n# ${story.title}\n\n${story.premise}\n\n所属世界：[[${world.title}]]\n`,
  }));

  return [{ path: `content/${slug(world.title)}.md`, content: index }, ...nodeNotes, ...storyNotes];
}
