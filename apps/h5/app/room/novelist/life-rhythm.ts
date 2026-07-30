import type { FormalSceneId, NovelistActivity } from "./scene-manifest";
import type {
  ActivitySettlement,
  HostLifeState,
  LifeIntentReason,
  LifePropId,
  LifeRuntimePhase,
  LifeTraceSpec,
  VisualBeat,
} from "./life-runtime";

/**
 * The formal room exposes every scene whose route snapshot has been
 * published. Entrance and the private bathroom remain outside this planner
 * until their own route packages are published.
 */
export const formalLifeSceneIds = ["study", "dining-kitchen", "bedroom", "terrace-greenery", "attic"] as const satisfies readonly FormalSceneId[];
export type FormalLifeSceneId = (typeof formalLifeSceneIds)[number];

export type LifeCueKind = "thought" | "need" | "intent" | "moving" | "arrival" | "activity" | "feedback" | "transition" | "system";
export type LifeCueTone = "quiet" | "warm" | "playful" | "focused" | "tired" | "dreamy";
export type LifeCueAnchor = "actor" | "scene" | "screen";
export type LifeCueDismissReason = "acknowledge" | "depart" | "arrive" | "activity-complete" | "timeout";

/**
 * A life cue is deliberately richer than a one-line mood string.  The room
 * can present the same event as a character bubble, a recent-life entry, or a
 * future log without making the route runtime know anything about copy.
 */
export type LifeCue = {
  id: string;
  kind: LifeCueKind;
  tone: LifeCueTone;
  icon: string;
  title: string;
  text: string;
  sceneId?: FormalLifeSceneId;
  durationMs?: number;
  anchor?: LifeCueAnchor;
  priority?: number;
  visibleForMs?: number;
  cooldownMs?: number;
  dismissOn?: LifeCueDismissReason[];
  /** Optional second voice: a short system/老祖 aside, never a route command. */
  systemAside?: string;
  action?: {
    type: "confirm-intent" | "inspect" | "open-activity";
    intentId?: string | undefined;
  };
};

export type LifeMoment = LifeCue & {
  momentId: string;
  sequence: number;
};

export type LifeSignalLevel = "calm" | "notice" | "urgent";
export type LifeSignalKey = "hunger" | "fatigue" | "focus" | "inspiration" | "emotional-load";

/**
 * A compact, visual reading of the host's needs.  This is deliberately not a
 * second state machine: it is a projection of the runtime numbers for the
 * small HUD and the ambient stage language.
 */
export type LifeSignal = {
  key: LifeSignalKey;
  icon: string;
  label: string;
  value: number;
  level: LifeSignalLevel;
  tone: LifeCueTone;
  title: string;
  detail: string;
};

export type LifeSignalContext = Pick<HostLifeState, "hunger" | "fatigue" | "focus" | "inspiration" | "emotionalLoad"> & {
  traceIds?: readonly string[] | undefined;
  actionId?: string | undefined;
  index?: number | undefined;
};

export type LifeNeedKey = "hunger" | "fatigue" | "stuck" | "emotional-load";
export type LifeTendencyMinimum = "notice" | "urgent";

/**
 * A state-driven inclination is a proposal, not a forced teleport.  It names
 * the same published route contract the user can choose from the life panel;
 * the room decides later whether to show it or execute it.
 */
export type LifeTendency = {
  key: LifeNeedKey;
  reason: LifeIntentReason;
  signalKey: LifeSignalKey;
  level: LifeSignalLevel;
  sceneId: FormalLifeSceneId;
  state: NovelistActivity;
  actionId: string;
  activityId: string;
  routeId: string;
  targetAnchor: string;
  priority: number;
};

export type LifeTendencyContext = LifeSignalContext & {
  currentScene: FormalSceneId;
  currentActionId?: string | undefined;
  currentActivityId?: string | undefined;
  runtimePhase?: LifeRuntimePhase | undefined;
  carriedProps?: readonly LifePropId[] | undefined;
};

type LifeCueSeed = Omit<LifeCue, "sceneId">;
type LifeCueContext = {
  actionId?: string | undefined;
  routeId?: string | undefined;
  index?: number | undefined;
};

const sceneLifeCueCatalog: Readonly<Record<FormalLifeSceneId, Readonly<Partial<Record<LifeCueKind, readonly LifeCueSeed[]>>>>> = {
  study: {
    thought: [
      { id: "study-thought-page", kind: "thought", tone: "quiet", icon: "✎", title: "纸页回声", text: "纸页翻了一下，像是在提醒我别把这一句忘掉。" },
      { id: "study-thought-second-draft", kind: "thought", tone: "focused", icon: "⌁", title: "先留下来", text: "先写下来，漂亮不漂亮等第二遍再说。" },
      { id: "study-thought-lamp", kind: "thought", tone: "quiet", icon: "☼", title: "灯还亮着", text: "灯还亮着，说明今天还没有真正结束。" },
    ],
    intent: [
      { id: "study-intent-desk", kind: "intent", tone: "focused", icon: "↗", title: "回到书桌", text: "先把那句没写完的话接回来，其他事情稍后再说。" },
      { id: "study-intent-leave", kind: "intent", tone: "quiet", icon: "⌂", title: "离开一会儿", text: "我只是离开书桌，不是离开这个故事。" },
    ],
    moving: [
      { id: "study-moving-corridor", kind: "moving", tone: "quiet", icon: "→", title: "走在生活里", text: "木地板一格一格向前，句子也可以慢慢走。" },
      { id: "study-moving-door", kind: "moving", tone: "dreamy", icon: "⋯", title: "还没到结尾", text: "先去看一眼别的房间，也许答案正躲在门后。" },
    ],
    arrival: [
      { id: "study-arrival-desk", kind: "arrival", tone: "focused", icon: "✎", title: "稿纸在等", text: "坐回原来的位置，刚才的念头还没有冷掉。" },
      { id: "study-arrival-away", kind: "arrival", tone: "quiet", icon: "⌂", title: "门边停一下", text: "到了。把外面的风放在门外，再带一条新线索回来。" },
    ],
    activity: [
      { id: "study-activity-writing", kind: "activity", tone: "focused", icon: "✎", title: "正在写作", text: "笔尖先替我走一步，人物会在下一行自己出现。" },
      { id: "study-activity-stuck", kind: "activity", tone: "playful", icon: "？", title: "卡在这里", text: "这不是失败，只是故事暂时把门关上了。" },
    ],
    transition: [
      { id: "study-transition-depart", kind: "transition", tone: "dreamy", icon: "◌", title: "把话藏好", text: "没写完的那半句先放在桌上，我很快回来。" },
      { id: "study-transition-smoke", kind: "transition", tone: "dreamy", icon: "☁", title: "白烟过门", text: "他把没说完的话藏进一团白烟里。" },
    ],
  },
  "dining-kitchen": {
    thought: [
      { id: "dining-thought-lid", kind: "thought", tone: "warm", icon: "♨", title: "锅盖响了", text: "锅盖响了一声，像是一个章节结尾。" },
      { id: "dining-thought-pause", kind: "thought", tone: "warm", icon: "◡", title: "不是暂停键", text: "吃饭也是生活的一部分，不是写作的暂停键。" },
      { id: "dining-thought-bowl", kind: "thought", tone: "quiet", icon: "○", title: "碗在这里", text: "碗放在这里，等会儿还要回来收拾。" },
    ],
    intent: [
      { id: "dining-intent-soup", kind: "intent", tone: "warm", icon: "♨", title: "去找热气", text: "先吃两口，灵感不会因为一碗汤跑掉。" },
      { id: "dining-intent-return", kind: "intent", tone: "quiet", icon: "○", title: "把碗送回去", text: "吃完了。空碗知道回料理台的路，我也知道。" },
    ],
    moving: [
      { id: "dining-moving-full-bowl", kind: "moving", tone: "warm", icon: "♨", title: "端稳这一碗", text: "慢一点，热汤和今天的心情都不适合洒出来。" },
      { id: "dining-moving-empty-bowl", kind: "moving", tone: "quiet", icon: "○", title: "带空碗回去", text: "汤喝完了，手里还留着一点温度。" },
    ],
    arrival: [
      { id: "dining-arrival-counter", kind: "arrival", tone: "warm", icon: "♨", title: "料理台到了", text: "热气先替我把屋子叫醒，今天也要好好吃饭。" },
      { id: "dining-arrival-table", kind: "arrival", tone: "warm", icon: "⌂", title: "坐到饭桌", text: "热汤到了，先让双手记住温度。" },
    ],
    activity: [
      { id: "dining-activity-serve", kind: "activity", tone: "warm", icon: "♨", title: "正在盛汤", text: "这一勺红豆汤，给下午留一点缓冲。" },
      { id: "dining-activity-meal", kind: "activity", tone: "warm", icon: "◡", title: "正在吃饭", text: "不用急着想下一段，热气会替人把时间放慢。" },
    ],
    transition: [
      { id: "dining-transition-depart", kind: "transition", tone: "warm", icon: "◌", title: "饭香起身", text: "他把笔放下，先去照顾一下会饿的自己。" },
      { id: "dining-transition-smoke", kind: "transition", tone: "warm", icon: "☁", title: "白烟里的饭香", text: "白烟散开时，热汤已经替他抵达了下一段生活。" },
    ],
  },
  bedroom: {
    thought: [
      { id: "bedroom-thought-record", kind: "thought", tone: "dreamy", icon: "♫", title: "唱片转起来", text: "唱片转起来以后，房间就没有那么空了。" },
      { id: "bedroom-thought-rest", kind: "thought", tone: "tired", icon: "☾", title: "先躺一会儿", text: "先躺一会儿，明天的开头也许会变得简单。" },
      { id: "bedroom-thought-quilt", kind: "thought", tone: "tired", icon: "⌁", title: "被子收好今天", text: "被子已经替我把今天收好了一半。" },
    ],
    intent: [
      { id: "bedroom-intent-record", kind: "intent", tone: "dreamy", icon: "♫", title: "去听一面旧唱片", text: "先让房间替我想一会儿，下一句会自己回来。" },
      { id: "bedroom-intent-bed", kind: "intent", tone: "tired", icon: "☾", title: "把今天放下", text: "今天先到这里，明天还可以接着写。" },
      { id: "bedroom-intent-leave", kind: "intent", tone: "quiet", icon: "↗", title: "回到生活通道", text: "唱片会继续转，等我把下一段日子过完。" },
    ],
    moving: [
      { id: "bedroom-moving-record", kind: "moving", tone: "dreamy", icon: "♫", title: "跟着节拍走", text: "从床边到唱片机，只需要一小段不着急的路。" },
      { id: "bedroom-moving-bed", kind: "moving", tone: "tired", icon: "☾", title: "向安静靠近", text: "脚步轻一点，今天的疲惫已经先到了。" },
    ],
    arrival: [
      { id: "bedroom-arrival-record", kind: "arrival", tone: "dreamy", icon: "♫", title: "唱片开始了", text: "让这一面旋律替我把房间填满。" },
      { id: "bedroom-arrival-lounge", kind: "arrival", tone: "dreamy", icon: "⌁", title: "坐进柔软里", text: "不用马上产出，发呆也是故事的一部分。" },
      { id: "bedroom-arrival-bed", kind: "arrival", tone: "tired", icon: "☾", title: "夜色接管", text: "今天暂时封存，明天从最容易的一句开始。" },
    ],
    activity: [
      { id: "bedroom-activity-record", kind: "activity", tone: "dreamy", icon: "♫", title: "唱片在转", text: "旋律替我照看沉默，沉默也没有催我。" },
      { id: "bedroom-activity-lounge", kind: "activity", tone: "quiet", icon: "⌁", title: "放空中", text: "什么都不做五分钟，脑子反而有地方呼吸。" },
      { id: "bedroom-activity-sleep", kind: "activity", tone: "tired", icon: "☾", title: "进入睡眠", text: "把今天折好放在床头，明天再打开。" },
    ],
    transition: [
      { id: "bedroom-transition-depart", kind: "transition", tone: "quiet", icon: "◌", title: "离开床边", text: "先把被角放平，再去处理下一件小事。" },
      { id: "bedroom-transition-smoke", kind: "transition", tone: "dreamy", icon: "☁", title: "梦的白烟", text: "他在一团白烟里换了个姿势，梦还没有醒。" },
    ],
  },
  "terrace-greenery": {
    thought: [
      { id: "terrace-thought-wind", kind: "thought", tone: "dreamy", icon: "〰", title: "风在改稿", text: "露台的风把新句子接到了树叶的影子里。" },
      { id: "terrace-thought-turtle", kind: "thought", tone: "playful", icon: "◉", title: "小龟不着急", text: "小龟没有急着，他也就不用急着回去。" },
      { id: "terrace-thought-pause", kind: "thought", tone: "quiet", icon: "✦", title: "留一会儿", text: "只是停一会儿，想法就会慢慢有了。" },
    ],
    intent: [
      { id: "terrace-intent-air", kind: "intent", tone: "dreamy", icon: "〰", title: "去露台透气", text: "让风把脑子里的结吹松一点，再带一条线索回来。" },
      { id: "terrace-intent-turtle", kind: "intent", tone: "playful", icon: "◉", title: "看看小龟", text: "去确认一下小龟今天有没有把自己的故事写完。" },
    ],
    moving: [
      { id: "terrace-moving-door", kind: "moving", tone: "dreamy", icon: "→", title: "向风里走", text: "门外没有答案，只有一段让答案变轻的路。" },
      { id: "terrace-moving-plant", kind: "moving", tone: "quiet", icon: "⌁", title: "绕过花盆", text: "脚下绕开花盆，心里的路也不必横冲直撞。" },
    ],
    arrival: [
      { id: "terrace-arrival-bench", kind: "arrival", tone: "quiet", icon: "⌁", title: "坐到长椅边", text: "这里的风不要求答案，只允许人停一会儿。" },
      { id: "terrace-arrival-turtle", kind: "arrival", tone: "playful", icon: "◉", title: "小龟的池边", text: "小龟抬头看了一眼，像是在催我别把生活删掉。" },
      { id: "terrace-arrival-telescope", kind: "arrival", tone: "dreamy", icon: "✦", title: "望远镜旁", text: "远处的灯火像一串还没决定标点的句子。" },
    ],
    activity: [
      { id: "terrace-activity-bench", kind: "activity", tone: "quiet", icon: "⌁", title: "看一会儿夜景", text: "风把纸页吹得乱七八糟，但这次不用立刻整理。" },
      { id: "terrace-activity-turtle", kind: "activity", tone: "playful", icon: "◉", title: "照看小龟", text: "它慢慢爬，我慢慢想，谁也不催谁。" },
      { id: "terrace-activity-telescope", kind: "activity", tone: "dreamy", icon: "✦", title: "寻找远处的灯", text: "那盏灯像一个伏笔，先记住，不急着解释。" },
    ],
    transition: [
      { id: "terrace-transition-depart", kind: "transition", tone: "dreamy", icon: "〰", title: "把风带回去", text: "风里捡到一个句子的开头，回书桌再把它写完。" },
      { id: "terrace-transition-smoke", kind: "transition", tone: "dreamy", icon: "☁", title: "白烟过门", text: "风从烟里穿过去，他也把一点松弛带回屋内。" },
    ],
  },
  attic: {
    thought: [
      { id: "attic-thought-shelf", kind: "thought", tone: "quiet", icon: "▤", title: "旧书架的记号", text: "旧书架上的记号，每一页都在等一个新的结尾。" },
      { id: "attic-thought-manuscript", kind: "thought", tone: "dreamy", icon: "⌁", title: "旧稿会回来", text: "旧稿不是素材库，是有一天会回来的时间。" },
      { id: "attic-thought-piece", kind: "thought", tone: "focused", icon: "✦", title: "找到一个零件", text: "找到一个组成句子的零件，用不着立刻拉回书桌。" },
    ],
    intent: [
      { id: "attic-intent-archive", kind: "intent", tone: "focused", icon: "▤", title: "去翻旧档案", text: "上楼找一页旧稿，不是为了怀旧，是为了给今天借一盏灯。" },
      { id: "attic-intent-return", kind: "intent", tone: "quiet", icon: "↘", title: "带线索下楼", text: "找到就回去，别让旧故事把今天也留在阁楼。" },
    ],
    moving: [
      { id: "attic-moving-stairs", kind: "moving", tone: "quiet", icon: "↗", title: "沿楼梯上去", text: "每一级楼梯都踩着过去的版本，但今天仍然是新的。" },
      { id: "attic-moving-return", kind: "moving", tone: "focused", icon: "↘", title: "带着一页回来", text: "手里没有答案，只有一页值得重新读的旧稿。" },
    ],
    arrival: [
      { id: "attic-arrival-archive", kind: "arrival", tone: "focused", icon: "▤", title: "档案架前", text: "旧纸的气味没有催促，刚好够我找回一个名字。" },
      { id: "attic-arrival-return", kind: "arrival", tone: "quiet", icon: "⌂", title: "回到书桌边", text: "把旧线索放在今天的纸上，它们终于可以见面了。" },
    ],
    activity: [
      { id: "attic-activity-archive", kind: "activity", tone: "focused", icon: "▤", title: "翻找旧档案", text: "这一页先不归档，它也许正好能救今天的结尾。" },
      { id: "attic-activity-think", kind: "activity", tone: "dreamy", icon: "⌁", title: "在旧稿里发呆", text: "过去没有消失，只是安静地等我换一个角度看它。" },
    ],
    transition: [
      { id: "attic-transition-depart", kind: "transition", tone: "quiet", icon: "◌", title: "旧纸翻页", text: "先去旧档案里找一个能和今天接上的词。" },
      { id: "attic-transition-smoke", kind: "transition", tone: "dreamy", icon: "☁", title: "从旧稿里出来", text: "白烟散开，过去没有跟着消失，只是换了个位置。" },
    ],
  },
};

const actionLifeCueOverrides: Readonly<Record<string, Partial<Record<LifeCueKind, readonly LifeCueSeed[]>>>> = {
  "study:writing-seat": {
    arrival: [{ id: "study-writing-seat-arrival", kind: "arrival", tone: "focused", icon: "✎", title: "坐回书桌", text: "椅子接住了他，下一句也该接住今天。" }],
    activity: [{ id: "study-writing-seat-activity", kind: "activity", tone: "focused", icon: "✎", title: "笔尖开始工作", text: "先让角色说一句，作者暂时只负责听。" }],
  },
  "dining-kitchen:serve-red-bean-soup": {
    arrival: [{ id: "dining-serve-arrival", kind: "arrival", tone: "warm", icon: "♨", title: "料理台前", text: "勺子碰到碗底，午后的故事先暂停在这里。" }],
    activity: [{ id: "dining-serve-activity", kind: "activity", tone: "warm", icon: "♨", title: "盛一碗红豆汤", text: "装满的不只是碗，还有继续写下去的力气。" }],
  },
  "dining-kitchen:meal-table": {
    arrival: [{ id: "dining-meal-arrival", kind: "arrival", tone: "warm", icon: "⌂", title: "饭桌到了", text: "先吃饭，结尾不会因为这一顿饭变差。" }],
    activity: [{ id: "dining-meal-activity", kind: "activity", tone: "warm", icon: "◡", title: "慢慢吃饭", text: "热汤冒着白气，时间终于不再追着他跑。" }],
  },
  "bedroom:record-place": {
    arrival: [{ id: "bedroom-record-arrival", kind: "arrival", tone: "dreamy", icon: "♫", title: "唱片机旁", text: "针尖落下，今晚的沉默有了节拍。" }],
    activity: [{ id: "bedroom-record-activity", kind: "activity", tone: "dreamy", icon: "♫", title: "听唱片", text: "这一面旋律不负责解决问题，只负责让问题变柔软。" }],
  },
  "bedroom:lounge-seat": {
    arrival: [{ id: "bedroom-lounge-arrival", kind: "arrival", tone: "quiet", icon: "⌁", title: "沙发接住他", text: "不用每一刻都像在赶稿，坐下来也是一种进度。" }],
    activity: [{ id: "bedroom-lounge-activity", kind: "activity", tone: "dreamy", icon: "⌁", title: "坐着发一会儿呆", text: "脑子暂时空出来，故事才有地方重新排队。" }],
  },
  "bedroom:bed-sleep": {
    arrival: [{ id: "bedroom-bed-arrival", kind: "arrival", tone: "tired", icon: "☾", title: "床边安静下来", text: "今天的最后一个标点，先落在枕边。" }],
    activity: [{ id: "bedroom-bed-activity", kind: "activity", tone: "tired", icon: "☾", title: "睡觉", text: "让身体替明天保存一点没有写完的东西。" }],
  },
  "terrace-greenery:bench": {
    arrival: [{ id: "terrace-bench-arrival", kind: "arrival", tone: "quiet", icon: "⌁", title: "长椅边", text: "风把衣角吹起来，也把脑中的结吹松了一点。" }],
    activity: [{ id: "terrace-bench-activity", kind: "activity", tone: "quiet", icon: "⌁", title: "看一会儿风", text: "这一刻不必产出什么，世界自己在缓慢更新。" }],
  },
  "terrace-greenery:turtle-pond": {
    arrival: [{ id: "terrace-turtle-arrival", kind: "arrival", tone: "playful", icon: "◉", title: "小龟池边", text: "它抬头看我一眼，像是在确认我还记得生活。" }],
    activity: [{ id: "terrace-turtle-activity", kind: "activity", tone: "playful", icon: "◉", title: "照看小龟", text: "慢慢来，连小龟都知道好故事不能催熟。" }],
  },
  "terrace-greenery:telescope": {
    arrival: [{ id: "terrace-telescope-arrival", kind: "arrival", tone: "dreamy", icon: "✦", title: "望远镜旁", text: "远处的灯火还没有名字，正好留给一段新故事。" }],
    activity: [{ id: "terrace-telescope-activity", kind: "activity", tone: "dreamy", icon: "✦", title: "寻找远处的灯", text: "看得越远，眼前这一句反而越清楚。" }],
  },
  "attic:archive-shelf": {
    arrival: [{ id: "attic-archive-arrival", kind: "arrival", tone: "focused", icon: "▤", title: "旧书架前", text: "找到它了——不是答案，是一个可以重新开始的角度。" }],
    activity: [{ id: "attic-archive-activity", kind: "activity", tone: "focused", icon: "▤", title: "翻找旧档案", text: "旧稿没有催我，只把一页恰好的线索递过来。" }],
  },
};

const novelistVoicePatches: Readonly<Record<string, Pick<LifeCueSeed, "title" | "text">>> = {
  "study-thought-page": { title: "句号以前", text: "光标停在句号前，像有人把门虚掩着。" },
  "study-thought-second-draft": { title: "先让它活着", text: "先别管好不好看。让这句活下来，第二遍再收拾它。" },
  "study-thought-lamp": { title: "灯还没有睡", text: "灯把纸边照得发白。夜还没催我，可我已经听见了。" },
  "study-intent-desk": { title: "把那半句接上", text: "那半句还挂在桌边。去把它接回来，别让它替我等太久。" },
  "study-intent-leave": { title: "出去晾一晾", text: "出去绕一圈。不是逃，脑子里这团线总得换个地方晾一晾。" },
  "study-moving-corridor": { title: "木地板在数格子", text: "木地板在脚下数着格子。走到哪儿，念头就跟到哪儿。" },
  "study-moving-door": { title: "门后有一点风", text: "门后未必有答案；有一点风，也够了。" },
  "study-arrival-desk": { title: "椅背还暖着", text: "椅背还留着刚才的温度。好，接着。" },
  "study-arrival-away": { title: "先把声音放下", text: "先把外面的声音放下。带回来的那一点风，等会儿再写。" },
  "study-activity-writing": { title: "让他先说", text: "让他先说。作者有时候只需要坐在旁边，别抢话。" },
  "study-activity-stuck": { title: "这句很有耐心", text: "这句卡得很有耐心。它不肯往前，也不肯让我假装没看见。" },
  "study-transition-depart": { title: "把半句话压好", text: "半句话压在纸角，回来时别忘了它。" },
  "study-transition-smoke": { title: "白烟之后", text: "白烟一散，刚才那点犹豫还在；它没有被带走。" },
  "dining-thought-lid": { title: "锅盖响了一声", text: "锅盖响了一声，像有人替这一页落了个不太圆满的句号。" },
  "dining-thought-pause": { title: "先别和故事较劲", text: "汤还热着，先别和故事较劲。它又不会趁我吃饭长出腿来。" },
  "dining-thought-bowl": { title: "碗还在原处", text: "碗安安静静地等着。比起我，它倒是更知道下一步该做什么。" },
  "dining-intent-soup": { title: "去找一点热气", text: "胃已经替我改了日程。先去盛汤，结尾可以晚一刻钟。" },
  "dining-intent-return": { title: "把空碗送回去", text: "吃完了。空碗得回料理台，我也顺便把脑子带回来。" },
  "dining-moving-full-bowl": { title: "端稳这一点热", text: "慢一点。汤面晃得厉害，今天的心也差不多。" },
  "dining-moving-empty-bowl": { title: "手里只剩温度", text: "汤喝完了，碗变轻，手里倒还留着一点温度。" },
  "dining-arrival-counter": { title: "热气在这里", text: "料理台先替屋子醒了。轮到我把自己也叫醒。" },
  "dining-arrival-table": { title: "坐下来再说", text: "先坐下来。今天的结尾，暂时没有资格催我。" },
  "dining-activity-serve": { title: "盛满一碗", text: "红豆汤落进碗里，声音很轻，像一句终于肯说出口的话。" },
  "dining-activity-meal": { title: "吃饭这件小事", text: "热气贴着鼻尖上来。把一顿饭吃完，也算把一天往前推了一点。" },
  "dining-transition-depart": { title: "先照顾会饿的自己", text: "笔先放一会儿。人要是空着，故事也跟着发冷。" },
  "dining-transition-smoke": { title: "饭香穿过白烟", text: "白烟散开，手里的热气还没有散。" },
  "bedroom-thought-record": { title: "唱针落下", text: "唱针落下，房间忽然有了一个不需要回答的问题。" },
  "bedroom-thought-rest": { title: "先躺一会儿", text: "先躺一会儿。明天的开头不会因为今晚少想半小时就消失。" },
  "bedroom-thought-quilt": { title: "把今天收好", text: "被子替我收好了一角。剩下那一角，明天再折。" },
  "bedroom-intent-record": { title: "让旧唱片说话", text: "去听一面旧唱片。今晚不想替沉默写旁白。" },
  "bedroom-intent-bed": { title: "把今天放下", text: "今天先放在这里。写不完的东西，睡醒还认得我。" },
  "bedroom-intent-leave": { title: "回到生活通道", text: "唱片会继续转。等我把下一段日子过完，再回来听它。" },
  "bedroom-moving-record": { title: "跟着节拍过去", text: "从床边到唱片机，不过几步。今晚的路不需要赶稿。" },
  "bedroom-moving-bed": { title: "向安静靠近", text: "脚步轻一点。疲惫已经先替我躺下了。" },
  "bedroom-arrival-record": { title: "今晚有了节拍", text: "唱针落下，沉默终于有了可以依靠的节拍。" },
  "bedroom-arrival-lounge": { title: "坐进柔软里", text: "沙发往下一陷，我就暂时不用解释自己为什么没写出来。" },
  "bedroom-arrival-bed": { title: "夜色接手", text: "今天先封存。明天从最容易的一句开始，别给它太大的仪式。" },
  "bedroom-activity-record": { title: "听一面旧唱片", text: "这面旋律不替我解决问题，只替沉默留了个位置。" },
  "bedroom-activity-lounge": { title: "让脑子空一会儿", text: "什么都不做几分钟，念头才有地方重新排队。" },
  "bedroom-activity-sleep": { title: "把灯交给夜里", text: "把今天折好放在床头。剩下的，交给一觉。" },
  "bedroom-transition-depart": { title: "把被角放平", text: "先把被角放平，再去处理下一件小事。生活总有这种小小的收尾。" },
  "bedroom-transition-smoke": { title: "梦还没有醒", text: "白烟里换了个姿势。梦没有醒，只是把话说得更轻。" },
  "terrace-thought-wind": { title: "风把句子吹开", text: "风把纸页吹乱了。也好，原先那种排法本来就不太像人。" },
  "terrace-thought-turtle": { title: "卡文不着急", text: "卡文缩在壳里，我也坐一会儿。谁先动，谁就算输。" },
  "terrace-thought-pause": { title: "留在这里", text: "先不想结论。天色这么大，容得下我空白一阵。" },
  "terrace-intent-air": { title: "去风里借一口气", text: "脑子里的结打得太紧，去露台让风替我松一圈。" },
  "terrace-intent-turtle": { title: "去找卡文", text: "去看看卡文。跟一只乌龟谈心，听起来丢脸，实际上挺省力。" },
  "terrace-moving-door": { title: "往风里走", text: "门外没有答案，倒有一段能让答案变轻的路。" },
  "terrace-moving-plant": { title: "绕过花盆", text: "花盆不让路，心里的结也不让。先一个一个绕过去。" },
  "terrace-arrival-bench": { title: "风不问结果", text: "这里的风不问我写了多少，只把肩膀往下按了一点。" },
  "terrace-arrival-turtle": { title: "卡文抬了抬头", text: "它抬头看我一眼，像是在说：你还没把生活删掉。" },
  "terrace-arrival-telescope": { title: "远处还亮着", text: "远处的灯火还没有名字。先记住，解释可以晚一点。" },
  "terrace-activity-bench": { title: "坐着看风", text: "风把纸页吹得乱七八糟。这次不用立刻把它们排成故事。" },
  "terrace-activity-turtle": { title: "和卡文并排发呆", text: "它慢慢爬，我慢慢想。今天谁也不催谁。" },
  "terrace-activity-telescope": { title: "替远处留一盏灯", text: "那盏灯像一个还没落笔的伏笔。先放在这里。" },
  "terrace-transition-depart": { title: "把风带回去", text: "风里捡到半句开头。回书桌以后，再决定它值不值得留下。" },
  "terrace-transition-smoke": { title: "白烟里有一点风", text: "白烟穿过门缝，风也跟着进来一点。够我再写一行。" },
  "attic-thought-shelf": { title: "旧书架的缺口", text: "旧书架留着一个缺口，像有人把某个结尾先拿走了。" },
  "attic-thought-manuscript": { title: "旧稿会回来", text: "旧稿没有死。它只是躺在那里，等我换一种眼光认它。" },
  "attic-thought-piece": { title: "捡到一个零件", text: "找到一个能接进句子里的零件。先别急着知道它属于哪一章。" },
  "attic-intent-archive": { title: "去旧纸里找路", text: "上楼翻一页旧稿。不是怀旧，今天只是缺一盏旧灯。" },
  "attic-intent-return": { title: "带一页回来", text: "找到就下楼。旧故事很好看，但今天还在桌上等我。" },
  "attic-moving-stairs": { title: "踩着旧版本上楼", text: "每一级都像过去的版本。踩过去，今天还是今天。" },
  "attic-moving-return": { title: "手里带着一页", text: "没有答案，只有一页值得重读的旧稿。暂时也够了。" },
  "attic-arrival-archive": { title: "旧纸的气味", text: "旧纸没有催我。它只把一个名字从灰尘下面递出来。" },
  "attic-arrival-return": { title: "让旧线索见见今天", text: "把这一页放到今天的纸上。两个时间，终于碰了面。" },
  "attic-activity-archive": { title: "翻一页，再翻一页", text: "这一页先不归档。它也许正好知道今天缺的是什么。" },
  "attic-activity-think": { title: "在旧稿里停一下", text: "过去没有消失，只是等我换个角度再看一遍。" },
  "attic-transition-depart": { title: "去旧稿里借个词", text: "先去旧档案里找一个能和今天接上的词。" },
  "attic-transition-smoke": { title: "旧纸没有消失", text: "白烟散开，过去没有跟着消失，只是换了个位置。" },
  "study-writing-seat-arrival": { title: "椅背还暖着", text: "椅子接住了我。先让这一句也站稳。" },
  "study-writing-seat-activity": { title: "让他先说", text: "让角色先说。作者坐在旁边，偶尔点一下头就够了。" },
  "dining-serve-arrival": { title: "料理台前", text: "勺子碰到碗底，声音很轻。午后暂时不用解释。" },
  "dining-serve-activity": { title: "盛一碗红豆汤", text: "红豆汤落进碗里，给手里这点力气找个去处。" },
  "dining-meal-arrival": { title: "饭桌到了", text: "坐下来。结尾再急，也得等我把这口热汤吃下去。" },
  "dining-meal-activity": { title: "慢慢吃饭", text: "热气贴着鼻尖上来，时间终于肯在这里停一停。" },
  "bedroom-record-arrival": { title: "唱片机旁", text: "针尖落下，今晚的沉默有了可以依靠的节拍。" },
  "bedroom-record-activity": { title: "听一面旧唱片", text: "这面旋律不解决问题，只替我把问题放软一点。" },
  "bedroom-lounge-arrival": { title: "沙发接住我", text: "沙发往下一陷。我暂时不解释自己为什么没写出来。" },
  "bedroom-lounge-activity": { title: "坐着发一会儿呆", text: "让脑子空几分钟，念头才有地方重新排队。" },
  "bedroom-bed-arrival": { title: "床边安静下来", text: "今天的最后一个标点，先落在枕边。" },
  "bedroom-bed-activity": { title: "把灯交给夜里", text: "把没写完的东西放在床头。睡醒以后，它还认得我。" },
  "terrace-bench-arrival": { title: "长椅边", text: "风不问我写了多少，只把肩膀往下按了一点。" },
  "terrace-bench-activity": { title: "坐着看风", text: "这会儿不必产出什么。世界自己在慢慢更新。" },
  "terrace-turtle-arrival": { title: "小龟池边", text: "它抬头看我一眼，像是在确认我还没把生活删掉。" },
  "terrace-turtle-activity": { title: "和卡文并排发呆", text: "它慢慢爬，我慢慢想。今天谁也不催谁。" },
  "terrace-telescope-arrival": { title: "望远镜旁", text: "远处的灯火还没有名字。先记住，解释可以晚一点。" },
  "terrace-telescope-activity": { title: "替远处留一盏灯", text: "那盏灯像个还没落笔的伏笔，先放在这里。" },
  "attic-archive-arrival": { title: "旧书架前", text: "旧纸没有催我，只把一个名字从灰尘下面递出来。" },
  "attic-archive-activity": { title: "翻一页，再翻一页", text: "这一页先不归档。它也许正好知道今天缺的是什么。" },
};

export type LifeBeat = {
  id: string;
  timeLabel: string;
  sceneId: FormalLifeSceneId;
  title: string;
  activity: NovelistActivity;
  routeId: string;
  cue: string;
  outcome: string;
  kind: "anchor" | "drift";
  activityId?: string | undefined;
  entryAnchor?: string | undefined;
  actorMode?: "standing" | "walking" | "seated" | "scene-state" | undefined;
  durationMs?: number | "until-user" | undefined;
  arrivalActionId?: string | undefined;
  visualBeats?: readonly VisualBeat[] | undefined;
  tracesOnComplete?: readonly LifeTraceSpec[] | undefined;
  settlement?: ActivitySettlement | undefined;
  nextIntentIds?: readonly string[] | undefined;
};

export type LifePlanMode =
  | "steady-draft"
  | "field-notes"
  | "old-pages"
  | "quiet-recovery"
  | "wind-walk"
  | "archive-echo"
  | "slow-sunday";

export type LifeDayPlan = {
  dayIndex: number;
  mode: LifePlanMode;
  label: string;
  intro: string;
  beats: readonly LifeBeat[];
};

/**
 * A small, repeatable daily rhythm for the production room.  It deliberately
 * names existing route IDs rather than inventing coordinates or routes.  The
 * planner is therefore a consumer of the route/editor contract, never its
 * replacement.
 */
export const novelistDailyRhythm: readonly LifeBeat[] = [
  {
    id: "study-warm-up",
    timeLabel: "清晨",
    sceneId: "study",
    title: "先写一小段，不求漂亮",
    activity: "writing",
    routeId: "study-desk-stay",
    cue: "先写三百字。今天不和开头争输赢，能留下来就算赢了一点。",
    outcome: "书桌先亮起来，故事不必一早就交出答案。",
    kind: "drift",
  },
  {
    id: "study-first-draft",
    timeLabel: "上午",
    sceneId: "study",
    title: "把这一句写完",
    activity: "writing",
    routeId: "study-desk-stay",
    cue: "先让这一句活下来。好不好看，第二遍再收拾。",
    outcome: "书桌留下新稿页，专注重新接上。",
    kind: "anchor",
  },
  {
    id: "dining-serve-soup",
    timeLabel: "中午",
    sceneId: "dining-kitchen",
    title: "去料理台盛红豆汤",
    activity: "eating",
    routeId: "dining-entry-to-counter",
    cue: "胃已经替我改了日程。先去盛汤，结尾可以晚一刻钟。",
    outcome: "料理台留下刚用过的碗，下一段路线从这里接起。",
    kind: "anchor",
  },
  {
    id: "dining-eat-soup",
    timeLabel: "中午稍后",
    sceneId: "dining-kitchen",
    title: "端着热汤坐到餐桌",
    activity: "eating",
    routeId: "dining-counter-to-table",
    cue: "先坐下来。今天的结尾，暂时没有资格催我。",
    outcome: "热气散开，空碗成为下一次回到餐厨的生活痕迹。",
    kind: "anchor",
  },
  {
    id: "bedroom-vinyl-break",
    timeLabel: "傍晚",
    sceneId: "bedroom",
    title: "听一面旧唱片",
    activity: "daydreaming",
    routeId: "door-to-lounge",
    cue: "去听一面旧唱片。今晚不想替沉默写旁白。",
    outcome: "情绪降下来，耳边留下一点可以写进稿子的节奏。",
    kind: "drift",
  },
  {
    id: "bedroom-rest",
    timeLabel: "夜间",
    sceneId: "bedroom",
    title: "把今天停在床边",
    activity: "sleeping",
    routeId: "bedroom-to-bed",
    cue: "今天先放在这里。写不完的东西，睡醒还认得我。",
    outcome: "疲劳退潮，明天保留一条未完成但可继续的线索。",
    kind: "anchor",
  },
  {
    id: "terrace-night-fieldwork",
    timeLabel: "夜深一点",
    sceneId: "terrace-greenery",
    title: "去露台采风",
    activity: "daydreaming",
    routeId: "terrace-to-telescope",
    cue: "去风里借一口气。那盏灯的名字，晚一点再取。",
    outcome: "带回一张夜色明信片，和一句不急着用掉的素材。",
    kind: "drift",
    activityId: "terrace-city-look",
  },
  {
    id: "terrace-turtle-talk",
    timeLabel: "卡文时",
    sceneId: "terrace-greenery",
    title: "和卡文谈一会儿",
    activity: "daydreaming",
    routeId: "terrace-to-turtle",
    cue: "去看看卡文。它不催我，我也暂时不催它。",
    outcome: "不强行产出，只把心里的结松开一点。",
    kind: "drift",
    activityId: "terrace-turtle-corner",
  },
  {
    id: "terrace-bench-pause",
    timeLabel: "风起时",
    sceneId: "terrace-greenery",
    title: "在长椅上把脑子放平",
    activity: "daydreaming",
    routeId: "terrace-to-bench",
    cue: "先坐下。风会替我把那些互相踩脚的念头分开。",
    outcome: "疲惫退后一点，灵感不必靠逼迫才肯出现。",
    kind: "drift",
    activityId: "terrace-bench-rest",
  },
  {
    id: "attic-archive-hunt",
    timeLabel: "想起旧事时",
    sceneId: "attic",
    title: "去阁楼翻一页旧稿",
    activity: "daydreaming",
    routeId: "attic-to-archive",
    cue: "上楼翻一页旧稿。今天只是缺一盏旧灯。",
    outcome: "带回一块记忆碎片，让今天的结尾多一条可能。",
    kind: "drift",
    activityId: "attic-archive",
  },
  {
    id: "study-return",
    timeLabel: "次日",
    sceneId: "study",
    title: "回书桌接上未完的一句",
    activity: "writing",
    routeId: "study-desk-stay",
    cue: "把昨天没说完的那句话接回来。它还在。",
    outcome: "生活循环闭合，但稿子不被重置。",
    kind: "anchor",
  },
] as const;

type LifeDayPlanRecipe = Omit<LifeDayPlan, "dayIndex" | "beats"> & {
  beatIds: readonly string[];
};

/**
 * A day is not a playlist.  These recipes keep the bodily anchors stable,
 * then change the order and texture of the voluntary windows.  The seven-day
 * orbit is intentionally legible: the user can preview a day, while the
 * calendar keeps choosing one deterministically in the background. Every id
 * still resolves through `novelistDailyRhythm`, so this layer cannot invent
 * route geometry.
 */
const lifeDayPlanRecipes: readonly LifeDayPlanRecipe[] = [
  {
    mode: "steady-draft",
    label: "稳稳写一天",
    intro: "上午把主线写起来，吃过饭以后，才决定要不要把心事带去风里。",
    beatIds: [
      "study-first-draft",
      "dining-serve-soup",
      "dining-eat-soup",
      "terrace-night-fieldwork",
      "bedroom-vinyl-break",
      "bedroom-rest",
    ],
  },
  {
    mode: "field-notes",
    label: "先去外面捡一句",
    intro: "今天不逼自己把答案写出来；先去露台看一眼，再带一句观察回来。",
    beatIds: [
      "study-first-draft",
      "dining-serve-soup",
      "dining-eat-soup",
      "terrace-turtle-talk",
      "study-return",
      "bedroom-rest",
    ],
  },
  {
    mode: "old-pages",
    label: "从旧稿里借一盏灯",
    intro: "旧稿今天有话要说。翻它一页，不等于回到过去，只是借个角度。",
    beatIds: [
      "study-first-draft",
      "dining-serve-soup",
      "dining-eat-soup",
      "attic-archive-hunt",
      "bedroom-vinyl-break",
      "bedroom-rest",
    ],
  },
  {
    mode: "quiet-recovery",
    label: "把今天过得轻一点",
    intro: "今天只守住几个必要的停靠点，其余时间留给沉默，不急着给它命名。",
    beatIds: [
      "study-first-draft",
      "dining-serve-soup",
      "dining-eat-soup",
      "bedroom-vinyl-break",
      "bedroom-rest",
    ],
  },
  {
    mode: "wind-walk",
    label: "让风先替我排版",
    intro: "今天不急着把生活排成直线；先在长椅坐一会儿，再回到热汤和稿纸。",
    beatIds: [
      "study-warm-up",
      "terrace-bench-pause",
      "dining-serve-soup",
      "dining-eat-soup",
      "study-return",
      "bedroom-rest",
    ],
  },
  {
    mode: "archive-echo",
    label: "旧稿和今天碰个面",
    intro: "阁楼不是逃生门，是一盏旧灯。今天让它照过一页，再把线索带回桌边。",
    beatIds: [
      "study-first-draft",
      "dining-serve-soup",
      "dining-eat-soup",
      "attic-archive-hunt",
      "study-return",
      "terrace-turtle-talk",
      "bedroom-rest",
    ],
  },
  {
    mode: "slow-sunday",
    label: "慢一点也算前进",
    intro: "今天允许开头迟到一会儿。卡文、唱片和夜风各占一段，睡前再把一天收拢。",
    beatIds: [
      "dining-serve-soup",
      "dining-eat-soup",
      "bedroom-vinyl-break",
      "terrace-night-fieldwork",
      "bedroom-rest",
    ],
  },
] as const;

function normalizeLifeDayIndex(dayIndex: number): number {
  return Number.isFinite(dayIndex) ? Math.max(1, Math.floor(dayIndex)) : 1;
}

/** Stable local-calendar seed used after hydration; SSR stays deterministic. */
export function getCalendarLifeDay(date = new Date()): number {
  const start = new Date(2026, 0, 1);
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((current.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function getDailyLifePlan(dayIndex = 1): LifeDayPlan {
  const normalizedDayIndex = normalizeLifeDayIndex(dayIndex);
  const recipe = lifeDayPlanRecipes[(normalizedDayIndex - 1) % lifeDayPlanRecipes.length]!;
  const beats = recipe.beatIds
    .map((beatId) => novelistDailyRhythm.find((beat) => beat.id === beatId))
    .filter((beat): beat is LifeBeat => Boolean(beat));
  return {
    dayIndex: normalizedDayIndex,
    mode: recipe.mode,
    label: recipe.label,
    intro: recipe.intro,
    beats,
  };
}

const autoplayBeatIdsByPhase: Readonly<Record<HostLifeState["dayPhase"], readonly string[]>> = {
  dawn: ["bedroom-rest", "study-warm-up", "study-first-draft"],
  morning: ["study-warm-up", "study-first-draft", "dining-serve-soup"],
  noon: ["dining-serve-soup", "dining-eat-soup"],
  afternoon: ["dining-eat-soup", "terrace-bench-pause", "terrace-turtle-talk", "attic-archive-hunt", "study-return"],
  evening: ["terrace-night-fieldwork", "terrace-bench-pause", "bedroom-vinyl-break"],
  night: ["bedroom-rest", "terrace-night-fieldwork"],
};

/** Pick a scheduled beat without inventing a route or coordinate. */
export function getAutoplayLifeBeat(
  dayPhase: HostLifeState["dayPhase"],
  currentBeatId?: string,
  fallbackIndex = 0,
  dayIndex = 1,
): LifeBeat | null {
  const dailyPlan = getDailyLifePlan(dayIndex);
  const preferred = autoplayBeatIdsByPhase[dayPhase]
    .map((id) => dailyPlan.beats.find((beat) => beat.id === id))
    .find((beat) => beat && beat.id !== currentBeatId);
  if (preferred) return preferred;
  const available = dailyPlan.beats.filter((beat) => beat.id !== currentBeatId);
  return available.length > 0 ? available[((fallbackIndex % available.length) + available.length) % available.length]! : null;
}

/**
 * Compatibility export for callers that still need plain ambient strings.
 * The room uses getSceneLifeCue below, so the visible language keeps its
 * icon/title/tone metadata instead of collapsing back to a bare sentence.
 */
export const sceneAmbientThoughts: Readonly<Record<FormalLifeSceneId, readonly string[]>> = {
  study: (sceneLifeCueCatalog.study.thought ?? []).map((cue) => cue.text),
  "dining-kitchen": (sceneLifeCueCatalog["dining-kitchen"].thought ?? []).map((cue) => cue.text),
  bedroom: (sceneLifeCueCatalog.bedroom.thought ?? []).map((cue) => cue.text),
  "terrace-greenery": (sceneLifeCueCatalog["terrace-greenery"].thought ?? []).map((cue) => cue.text),
  attic: (sceneLifeCueCatalog.attic.thought ?? []).map((cue) => cue.text),
};

function cueCandidates(sceneId: FormalLifeSceneId, kind: LifeCueKind, actionId?: string): readonly LifeCueSeed[] {
  const actionCandidates = actionId
    ? actionLifeCueOverrides[`${sceneId}:${actionId}`]?.[kind]
    : undefined;
  const candidates = actionCandidates?.length
    ? actionCandidates
    : sceneLifeCueCatalog[sceneId][kind] ?? sceneLifeCueCatalog[sceneId].thought ?? [];
  return candidates.map((seed) => {
    const voicePatch = novelistVoicePatches[seed.id];
    return voicePatch ? { ...seed, ...voicePatch } : seed;
  });
}

function defaultCueAnchor(kind: LifeCueKind): LifeCueAnchor {
  if (kind === "activity" || kind === "arrival") return "scene";
  if (kind === "system") return "screen";
  return "actor";
}

function defaultCueDuration(kind: LifeCueKind): number {
  if (kind === "need") return 3200;
  if (kind === "feedback") return 2200;
  if (kind === "transition") return 1200;
  return 2400;
}

function defaultCueDismissOn(kind: LifeCueKind): LifeCueDismissReason[] {
  if (kind === "need") return ["acknowledge", "depart", "timeout"];
  if (kind === "activity") return ["activity-complete", "depart"];
  if (kind === "transition" || kind === "moving") return ["arrive", "timeout"];
  return ["timeout"];
}

const systemAsideCatalog: Readonly<Record<string, string>> = {
  "study:activity:writing-seat": "老祖批注：此刻灵台尚可，先让笔尖替你过一关。",
  "study:arrival:writing-seat": "老祖批注：书桌已接管现场，禁止宿主把这一句删掉。",
  "study:feedback:draft-shred": "老祖批注：废稿入火，留下的才是可用的灵根。",
  "dining-kitchen:intent:dining-entry-to-counter": "老祖批注：准许宿主暂离书桌，先炼一碗低阶暖胃汤。",
  "dining-kitchen:arrival:meal-table": "老祖批注：检测到凡俗红豆汤，勉强算一枚回灵丹。",
  "dining-kitchen:feedback:meal-feedback": "老祖批注：气血已回，今日尚可再与结尾斗法。",
  "dining-kitchen:feedback:serve-feedback": "老祖批注：锅中灵气已成，端稳，不可洒在半路。",
  "bedroom:activity:bed-sleep": "老祖批注：宿主进入低功耗修行，今日暂不追究更新量。",
  "bedroom:activity:lounge-seat": "老祖批注：沙发并非逃避，是一种短暂的护心阵。",
  "bedroom:feedback:rest-feedback": "老祖批注：精力回升一缕，足够把明天的开头写出来。",
  "terrace-greenery:activity:telescope": "老祖批注：远方灯火并非天道，但可暂借为灵感。",
  "terrace-greenery:activity:turtle-pond": "老祖批注：卡文道友今日仍在闭关，宿主不妨效仿片刻。",
  "terrace-greenery:feedback:night-note-feedback": "老祖批注：采风所得一枚，暂存于识海，不得立即挥霍。",
  "attic:activity:archive-shelf": "老祖批注：历史素材已出土，切莫把旧坑挖成新坑。",
  "attic:feedback:archive-feedback": "老祖批注：旧稿递来一盏灯，能否照到结尾还看宿主。",
};

function getSystemAside(sceneId: FormalLifeSceneId, kind: LifeCueKind, actionId?: string): string | undefined {
  return systemAsideCatalog[`${sceneId}:${kind}:${actionId ?? "scene"}`];
}

export function getSceneLifeCue(
  sceneId: FormalSceneId,
  kind: LifeCueKind,
  context: LifeCueContext = {},
): LifeCue {
  const lifeSceneId = formalLifeSceneIds.includes(sceneId as FormalLifeSceneId)
    ? sceneId as FormalLifeSceneId
    : "study";
  const index = context.index ?? 0;
  const candidates = cueCandidates(lifeSceneId, kind, context.actionId);
  const fallbackSeed: LifeCueSeed = {
    id: `${lifeSceneId}-thought-fallback`,
    kind: "thought",
    tone: "quiet",
    icon: "…",
    title: "生活还在继续",
    text: "他没有急着解释，只是先把这一刻过完。",
  };
  const seed = candidates.length > 0
    ? candidates[((index % candidates.length) + candidates.length) % candidates.length]!
    : sceneLifeCueCatalog[lifeSceneId].thought?.[0] ?? fallbackSeed;
  const systemAside = seed.systemAside ?? (kind !== "thought" ? getSystemAside(lifeSceneId, kind, context.actionId) : undefined);
  return {
    ...seed,
    id: `${seed.id}:${lifeSceneId}:${context.actionId ?? "scene"}:${index}`,
    sceneId: lifeSceneId,
    anchor: seed.anchor ?? defaultCueAnchor(kind),
    priority: seed.priority ?? (kind === "need" ? 40 : kind === "system" ? 80 : 15),
    visibleForMs: seed.visibleForMs ?? defaultCueDuration(kind),
    cooldownMs: seed.cooldownMs ?? (kind === "thought" ? 8500 : 120000),
    dismissOn: seed.dismissOn ?? defaultCueDismissOn(kind),
    ...(systemAside ? { systemAside } : {}),
  };
}

function highSignalLevel(value: number, noticeAt: number, urgentAt: number): LifeSignalLevel {
  if (value >= urgentAt) return "urgent";
  if (value >= noticeAt) return "notice";
  return "calm";
}

function lowSignalLevel(value: number, noticeAt: number, urgentAt: number): LifeSignalLevel {
  if (value <= urgentAt) return "urgent";
  if (value <= noticeAt) return "notice";
  return "calm";
}

/**
 * Convert the numeric needs into a small set of human-readable signals. The
 * order is intentional: appetite and fatigue are the body's first language;
 * focus and inspiration are the writer's second language.
 */
export function getLifeSignals(context: LifeSignalContext): readonly LifeSignal[] {
  return [
    {
      key: "hunger" as const,
      icon: "♨",
      label: "饥饿",
      value: context.hunger,
      level: highSignalLevel(context.hunger, 55, 78),
      tone: "warm" as const,
      title: context.hunger >= 78 ? "胃在认真催稿" : context.hunger >= 55 ? "有点饿了" : "胃口安静",
      detail: context.hunger >= 78 ? "红豆汤已经进入今日行动计划" : context.hunger >= 55 ? "热气会让下一句更容易回来" : "暂时不用为一顿饭改写今天",
    },
    {
      key: "fatigue" as const,
      icon: "☾",
      label: "疲劳",
      value: context.fatigue,
      level: highSignalLevel(context.fatigue, 55, 78),
      tone: "tired" as const,
      title: context.fatigue >= 78 ? "眼皮正在关机" : context.fatigue >= 55 ? "肩膀有点沉" : "还撑得住",
      detail: context.fatigue >= 78 ? "该把今天交给卧室了" : context.fatigue >= 55 ? "黑胶或床铺都在等一个缓冲" : "身体还没有发出休息警报",
    },
    {
      key: "inspiration" as const,
      icon: "✦",
      label: "灵感",
      value: context.inspiration,
      level: lowSignalLevel(context.inspiration, 42, 24),
      tone: "dreamy" as const,
      title: context.inspiration <= 24 ? "灵感躲到门外" : context.inspiration <= 42 ? "有一束小火" : "纸页会发光",
      detail: context.inspiration <= 24 ? "去露台吹风，或让卡文替你沉默一会儿" : context.inspiration <= 42 ? "一句话正在远处成形" : "现在适合把念头留下来",
    },
    {
      key: "focus" as const,
      icon: "⌁",
      label: "专注",
      value: context.focus,
      level: lowSignalLevel(context.focus, 38, 20),
      tone: "focused" as const,
      title: context.focus <= 20 ? "光标在等人" : context.focus <= 38 ? "专注正在回温" : "句子接得住",
      detail: context.focus <= 20 ? "先收束一件小事，再回书桌" : context.focus <= 38 ? "不必急着完成，只要别把它删掉" : "书桌现在是一个很好的停靠点",
    },
    {
      key: "emotional-load" as const,
      icon: "⌁",
      label: "心绪",
      value: context.emotionalLoad,
      level: highSignalLevel(context.emotionalLoad, 48, 70),
      tone: "quiet" as const,
      title: context.emotionalLoad >= 70 ? "心里有点重" : context.emotionalLoad >= 48 ? "情绪有重量" : "心绪平稳",
      detail: context.emotionalLoad >= 70 ? "先去沙发或露台，不要逼自己立刻解释" : context.emotionalLoad >= 48 ? "让房间替你保管几分钟" : "今天的沉默是柔软的",
    },
  ];
}

export function getDominantLifeSignal(context: LifeSignalContext): LifeSignal {
  const signals = getLifeSignals(context);
  return [...signals].sort((left, right) => {
    const levelWeight: Record<LifeSignalLevel, number> = { urgent: 3, notice: 2, calm: 1 };
    const levelDelta = levelWeight[right.level] - levelWeight[left.level];
    if (levelDelta !== 0) return levelDelta;
    const leftDistance = left.key === "inspiration" || left.key === "focus"
      ? 50 - left.value
      : left.value - 50;
    const rightDistance = right.key === "inspiration" || right.key === "focus"
      ? 50 - right.value
      : right.value - 50;
    return rightDistance - leftDistance;
  })[0]!;
}

type LifeTendencySpec = Omit<LifeTendency, "level" | "signalKey"> & {
  signalKeys: readonly LifeSignalKey[];
};

/**
 * These are the only state-to-life mappings currently allowed in the formal
 * room.  They intentionally point at existing activities/routes; this table
 * is not allowed to invent a new route or a new coordinate.
 */
const lifeTendencySpecs: readonly LifeTendencySpec[] = [
  {
    key: "hunger",
    reason: "hunger",
    signalKeys: ["hunger"],
    sceneId: "dining-kitchen",
    state: "eating",
    actionId: "serve-red-bean-soup",
    activityId: "dining-serve-red-bean-soup",
    routeId: "dining-entry-to-counter",
    targetAnchor: "kitchen-counter",
    priority: 100,
  },
  {
    key: "fatigue",
    reason: "fatigue",
    signalKeys: ["fatigue"],
    sceneId: "bedroom",
    state: "sleeping",
    actionId: "bed-sleep",
    activityId: "bedroom-rest",
    routeId: "bedroom-to-bed",
    targetAnchor: "bed-edge",
    priority: 94,
  },
  {
    key: "stuck",
    reason: "stuck",
    signalKeys: ["inspiration", "focus"],
    sceneId: "terrace-greenery",
    state: "daydreaming",
    actionId: "telescope",
    activityId: "terrace-city-look",
    routeId: "terrace-to-telescope",
    targetAnchor: "telescope",
    priority: 78,
  },
  {
    key: "emotional-load",
    reason: "emotional-load",
    signalKeys: ["emotional-load"],
    sceneId: "bedroom",
    state: "daydreaming",
    actionId: "lounge-seat",
    activityId: "bedroom-vinyl",
    routeId: "door-to-lounge",
    targetAnchor: "lounge-corner",
    priority: 72,
  },
] as const;

const lifeSignalLevelWeight: Readonly<Record<LifeSignalLevel, number>> = {
  calm: 1,
  notice: 2,
  urgent: 3,
};

function tendencyIsBlockedByCurrentLocation(spec: LifeTendencySpec, context: LifeTendencyContext): boolean {
  if (context.runtimePhase && context.runtimePhase !== "idle") return true;
  if (context.currentActivityId) return true;

  if (spec.key === "hunger") {
    // The dining loop owns its own handoff. Never ask it to restart while the
    // character is already inside the dining scene or carrying hot soup.
    return context.currentScene === "dining-kitchen"
      || context.carriedProps?.includes("bowl-full") === true;
  }
  if (spec.key === "fatigue") {
    return context.currentScene === "bedroom" && context.currentActionId === "bed-sleep";
  }
  if (spec.key === "stuck") {
    return context.currentScene === "terrace-greenery"
      && (context.currentActionId === "telescope" || context.currentActionId === "turtle-pond");
  }
  return context.currentScene === "bedroom" && context.currentActionId === "lounge-seat";
}

/**
 * Choose the next meaningful life direction from the numeric host state.
 * `notice` powers the passive prompt; `urgent` is the threshold at which
 * autoplay may actually depart.  A non-idle runtime is always left alone so
 * a route, smoke transition, activity, or user interruption cannot be
 * overwritten by a second intention.
 */
export function getStateDrivenLifeTendency(
  context: LifeTendencyContext,
  minimum: LifeTendencyMinimum = "urgent",
): LifeTendency | null {
  const minimumWeight = lifeSignalLevelWeight[minimum];
  const signals = getLifeSignals(context);
  const candidates: LifeTendency[] = [];

  for (const spec of lifeTendencySpecs) {
    if (tendencyIsBlockedByCurrentLocation(spec, context)) continue;
    const signal = signals
      .filter((candidate) => spec.signalKeys.includes(candidate.key))
      .sort((left, right) => lifeSignalLevelWeight[right.level] - lifeSignalLevelWeight[left.level])[0];
    if (!signal || lifeSignalLevelWeight[signal.level] < minimumWeight) continue;
    candidates.push({ ...spec, signalKey: signal.key, level: signal.level });
  }

  return candidates.sort((left, right) => {
    const levelDelta = lifeSignalLevelWeight[right.level] - lifeSignalLevelWeight[left.level];
    return levelDelta !== 0 ? levelDelta : right.priority - left.priority;
  })[0] ?? null;
}

export type LifeTraceEcho = {
  traceId: string;
  icon: string;
  title: string;
  text: string;
  tone: LifeCueTone;
};

const sceneTraceEchoes: readonly (LifeTraceEcho & { sceneId: FormalLifeSceneId })[] = [
  { traceId: "draft-shred", sceneId: "study", icon: "🦋", title: "纸屑还没落完", text: "废稿没有消失，它在书桌边留下了一点可以重写的亮光。", tone: "dreamy" },
  { traceId: "study-page-progress", sceneId: "study", icon: "✎", title: "多了一页", text: "这不是完成，只是今天又有一页愿意留下来。", tone: "focused" },
  { traceId: "warmth", sceneId: "dining-kitchen", icon: "♨", title: "暖意还在", text: "红豆汤的热气已经散了，胃里那点安定还没有。", tone: "warm" },
  { traceId: "bowl-empty", sceneId: "dining-kitchen", icon: "○", title: "空碗等着回程", text: "饭桌边空出一个位置，下一段生活知道该往哪里走。", tone: "quiet" },
  { traceId: "coffee-pot-warm", sceneId: "dining-kitchen", icon: "☕", title: "咖啡壶还温着", text: "提神不是答案，但它把答案推近了一点。", tone: "focused" },
  { traceId: "vinyl-side", sceneId: "bedroom", icon: "♫", title: "唱片停在这一面", text: "旋律没有替他解决问题，只替沉默留了个位置。", tone: "dreamy" },
  { traceId: "rested", sceneId: "bedroom", icon: "☾", title: "睡醒后轻了一点", text: "今天还没有结束，但身体已经愿意再试一次。", tone: "tired" },
  { traceId: "night-note-created", sceneId: "terrace-greenery", icon: "✦", title: "夜景里带回一句", text: "远处的灯火还没有名字，正好把它留给故事。", tone: "dreamy" },
  { traceId: "turtle-last-seen", sceneId: "terrace-greenery", icon: "◉", title: "卡文在池边", text: "小龟没有催他，连卡文也懂得给故事留白。", tone: "playful" },
  { traceId: "bench-rested", sceneId: "terrace-greenery", icon: "〰", title: "长椅替他保管过风", text: "坐过的地方不会催问结果，只把肩膀放松一点。", tone: "quiet" },
  { traceId: "archive-book-open", sceneId: "attic", icon: "▤", title: "旧书翻到那一页", text: "过去没有替今天写完，但递来一个可以借用的角度。", tone: "focused" },
  { traceId: "memory-fragment", sceneId: "attic", icon: "⌁", title: "记忆碎片还亮着", text: "它暂时不需要归档，只要先被看见。", tone: "dreamy" },
];

export function getSceneTraceEcho(sceneId: FormalSceneId, traceIds: readonly string[]): LifeTraceEcho | null {
  const traceSet = new Set(traceIds);
  for (const traceId of [...traceIds].reverse()) {
    const echo = sceneTraceEchoes.find((candidate) => candidate.traceId === traceId && candidate.sceneId === sceneId);
    if (echo && traceSet.has(echo.traceId)) return echo;
  }
  return null;
}

/**
 * The panel should not fall back to one identical sentence after a cue times
 * out. Prefer a meaningful need or the most recent trace from this room, while
 * keeping the result a non-actionable thought so it cannot accidentally start
 * a route.
 */
export function getStateLifeCue(sceneId: FormalSceneId, context: LifeSignalContext): LifeCue {
  const base = getSceneLifeCue(sceneId, "thought", { actionId: context.actionId, index: context.index });
  const dominant = getDominantLifeSignal(context);
  if (dominant.level !== "calm") {
    return {
      ...base,
      id: `state-whisper:${dominant.key}:${dominant.level}:${Math.round(dominant.value)}`,
      kind: "thought",
      tone: dominant.tone,
      icon: dominant.icon,
      title: dominant.title,
      text: dominant.detail,
      anchor: "actor",
    };
  }
  const traceEcho = getSceneTraceEcho(sceneId, context.traceIds ?? []);
  if (traceEcho) {
    return {
      ...base,
      id: `trace-whisper:${traceEcho.traceId}`,
      kind: "thought",
      tone: traceEcho.tone,
      icon: traceEcho.icon,
      title: traceEcho.title,
      text: traceEcho.text,
      anchor: "actor",
    };
  }
  return base;
}

export function getLifeBeatCue(beat: LifeBeat): LifeCue {
  const base = getSceneLifeCue(beat.sceneId, "intent", {
    actionId: beat.routeId,
  });
  return {
    ...base,
    id: `beat:${beat.id}`,
    title: beat.title,
    text: beat.cue,
    tone: beat.kind === "anchor" ? "focused" : "dreamy",
    icon: beat.kind === "anchor" ? "✦" : "〰",
  };
}

export type LifeContinuationCue = Pick<LifeCue, "icon" | "title" | "text" | "tone">;

const lifeContinuationCueCatalog: Readonly<Record<string, LifeContinuationCue>> = {
  "dining-eat-red-bean-soup": {
    icon: "♨",
    title: "端着热汤去饭桌",
    text: "热气还在，他沿着下一段已经规划好的路走过去。",
    tone: "warm",
  },
  "dining-serve-red-bean-soup": {
    icon: "○",
    title: "带空碗回料理台",
    text: "汤喝完了，空碗沿着熟悉的路线回到料理台，下一勺再从这里开始。",
    tone: "quiet",
  },
};

export function getLifeContinuationCue(activityId: string): LifeContinuationCue {
  return lifeContinuationCueCatalog[activityId] ?? {
    icon: "→",
    title: "沿下一段生活走",
    text: "他没有瞬移，只沿着已经规划好的下一段路继续生活。",
    tone: "quiet",
  };
}

export function getNeedLifeCue(need: LifeNeedKey, sceneId: FormalSceneId = "study"): LifeCue {
  const copy: Record<LifeNeedKey, { icon: string; title: string; text: string; intentId: string }> = {
    hunger: { icon: "♨", title: "胃先替我说话", text: "红豆汤应该还热着。去盛一碗，故事不会趁机逃走。", intentId: "intent.eat-red-bean-soup" },
    fatigue: { icon: "☾", title: "眼皮在关门", text: "今天先把灯交出去一会儿。醒来再和这一句算账。", intentId: "intent.rest" },
    stuck: { icon: "？", title: "这句不肯动", text: "去露台借一口风。答案不一定回来，至少我可以先回来。", intentId: "intent.look-at-night" },
    "emotional-load": { icon: "⌁", title: "心里压着一页纸", text: "先去沙发坐一会儿。等这页不再硌手，再决定要不要写它。", intentId: "intent.emotional-buffer" },
  };
  const selected = copy[need];
  return {
    ...getSceneLifeCue(sceneId, "need", { actionId: `need:${need}` }),
    id: `need:${need}`,
    kind: "need",
    icon: selected.icon,
    title: selected.title,
    text: selected.text,
    anchor: "actor",
    priority: 40,
    visibleForMs: 3200,
    cooldownMs: 120000,
    dismissOn: ["acknowledge", "depart", "timeout"],
    action: { type: "confirm-intent", intentId: selected.intentId },
  };
}

export function getLifeFeedbackCue(feedbackId: string, sceneId: FormalSceneId = "study"): LifeCue {
  const feedback: Record<string, { icon: string; title: string; text: string }> = {
    "serve-feedback": { icon: "♨", title: "热汤盛好了", text: "碗口的热气往上走。端稳，先别让下午从手里洒掉。" },
    "meal-feedback": { icon: "◡", title: "胃里安静了", text: "热汤落下去，心里的催促也低了一点。回书房不用急着证明什么。" },
    "rest-feedback": { icon: "☾", title: "肩膀松了一点", text: "先改最容易的那一段。今天不必一口气赢回来。" },
    "night-note-feedback": { icon: "✦", title: "捡到半句", text: "灵感没有爆发，只在风里留下半句。带回去，别急着用掉。" },
    "archive-feedback": { icon: "▤", title: "旧纸递来一条线", text: "旧稿没有替我写完，只把门缝又推开了一点。" },
  };
  const selected = feedback[feedbackId] ?? { icon: "✦", title: "生活留下痕迹", text: "这一段结束了，下一段不必从零开始。" };
  return {
    ...getSceneLifeCue(sceneId, "feedback", { actionId: feedbackId }),
    id: `feedback:${feedbackId}`,
    kind: "feedback",
    icon: selected.icon,
    title: selected.title,
    text: selected.text,
    anchor: "scene",
    priority: 20,
    visibleForMs: 2200,
    cooldownMs: 120000,
    dismissOn: ["activity-complete", "timeout"],
  };
}

/**
 * A tap is an observation, not a route command.  These little responses give
 * each room its own personality while keeping the route/life boundary intact.
 */
export function getSceneInteractionCue(sceneId: FormalSceneId, actionId?: string): LifeCue {
  const interactionCopy: Readonly<Record<string, { icon: string; title: string; text: string; tone: LifeCueTone }>> = {
    "study:writing-seat": { icon: "⌨", title: "键盘轻响", text: "他抬头看了一眼，又把这一句放回光标后面。", tone: "focused" },
    "dining-kitchen:serve-red-bean-soup": { icon: "♨", title: "热气回应了", text: "锅盖又响了一声：这一碗马上就好。", tone: "warm" },
    "dining-kitchen:meal-table": { icon: "◡", title: "先吃一口", text: "他没有放下勺子，只用眼神说：这次真的会慢一点。", tone: "warm" },
    "bedroom:record-place": { icon: "♫", title: "针尖跳了一格", text: "旋律没有停，房间替他把这次打扰轻轻收下了。", tone: "dreamy" },
    "bedroom:lounge-seat": { icon: "⌁", title: "沙发陷下去", text: "他往柔软里缩了一点，暂时不打算解释自己的沉默。", tone: "quiet" },
    "bedroom:bed-sleep": { icon: "☾", title: "梦没有醒", text: "被角动了一下，今天剩下的事先留到明天。", tone: "tired" },
    "terrace-greenery:bench": { icon: "〰", title: "风经过了", text: "衣角晃了一下，远处的灯火也像跟着眨了眨眼。", tone: "dreamy" },
    "terrace-greenery:turtle-pond": { icon: "◉", title: "卡文缩了缩壳", text: "小龟看了他一眼：别急，慢慢想也算在写。", tone: "playful" },
    "terrace-greenery:telescope": { icon: "✦", title: "远处亮了一盏", text: "他把那盏灯记在心里，没有急着给它安排结局。", tone: "dreamy" },
    "attic:archive-shelf": { icon: "▤", title: "旧纸翻面", text: "灰尘落下来，某个被忘掉的名字露出了半截。", tone: "focused" },
  };
  const selected = interactionCopy[`${sceneId}:${actionId ?? ""}`] ?? {
    icon: "✦",
    title: "他知道你在看",
    text: "这一刻没有被打断，只是多了一位安静的旁观者。",
    tone: "quiet" as const,
  };
  return {
    id: `interaction:${sceneId}:${actionId ?? "scene"}`,
    kind: "system",
    tone: selected.tone,
    icon: selected.icon,
    title: selected.title,
    text: selected.text,
    sceneId: formalLifeSceneIds.includes(sceneId as FormalLifeSceneId) ? sceneId as FormalLifeSceneId : "study",
    anchor: "actor",
    priority: 25,
    visibleForMs: 1800,
    cooldownMs: 900,
    dismissOn: ["timeout"],
  };
}

export function getLifeBeat(beatId: string | null | undefined): LifeBeat | null {
  return novelistDailyRhythm.find((beat) => beat.id === beatId) ?? null;
}

export function getNextLifeBeat(beatId: string | null | undefined): LifeBeat {
  const index = novelistDailyRhythm.findIndex((beat) => beat.id === beatId);
  return novelistDailyRhythm[(index + 1 + novelistDailyRhythm.length) % novelistDailyRhythm.length]!;
}
