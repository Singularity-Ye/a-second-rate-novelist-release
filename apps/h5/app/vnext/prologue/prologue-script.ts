export type PrologueIdentity = "student" | "office" | "court" | "cultivator";
export type MemoryPhase = "memory-one" | "memory-two" | "memory-climax";

export interface MemoryPanel {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  visual: string;
}

export interface PrologueIdentityScript {
  label: string;
  descriptor: string;
  glyph: string;
  memories: Record<MemoryPhase, MemoryPanel>;
  accident: {
    fracture: string;
    impact: string;
    aftershock: string;
  };
}

/**
 * 首集的叙事素材是产品资产，不是模型临场发挥的结果。
 * 这里的每个 panel 都可以在未来绑定一张缓存图片；当前先用同一固定舞台
 * + 分格 CSS 完成可玩的流程，避免图片尚未齐全时把动态体验卡死。
 */
export const PROLOGUE_SCRIPTS: Record<PrologueIdentity, PrologueIdentityScript> = {
  student: {
    label: "学生",
    descriptor: "刚交完卷，连人带答题卡一起飞了",
    glyph: "卷",
    memories: {
      "memory-one": { id: "student-01", eyebrow: "记忆一 · 不起眼", title: "你把不会的题，一道道啃完", text: "你曾经是班里最不起眼的人。别人背答案的时候，你在草稿纸上反复画同一道题，直到终于看懂它为什么错。", visual: "paper" },
      "memory-two": { id: "student-02", eyebrow: "记忆二 · 终于轮到", title: "那张答卷第一次让人改口", text: "后来你写出了一份让老师停笔的答卷。有人第一次问你：你是不是其实很厉害？你没有回答，只把名字写得更用力。", visual: "ink" },
      "memory-climax": { id: "student-03", eyebrow: "高潮 · 录取通知", title: "你正要把人生举过头顶", text: "毕业那天，录取通知书终于落进手里。你刚准备把它举过头顶，天空外侧忽然亮起一道不属于这个世界的车灯。", visual: "white" },
    },
    accident: { fracture: "时空裂缝在校园上空撕开，仿佛有人把世界的画布划了一道口子。", impact: "一辆异界大运从裂缝里冲出，精准撞上了你刚刚起步的人生。", aftershock: "你没输给考试，输给了异界交通运输业。" },
  },
  office: {
    label: "上班族",
    descriptor: "刚加完班，转生后继续无薪上岗",
    glyph: "工",
    memories: {
      "memory-one": { id: "office-01", eyebrow: "记忆一 · 留下的人", title: "所有人都走了，方案还亮着", text: "你从新人熬成了项目里最能扛事的人。凌晨的办公室里，所有人都走了，只有你的方案和那杯凉掉的咖啡还在坚持。", visual: "screen" },
      "memory-two": { id: "office-02", eyebrow: "记忆二 · 终于签字", title: "那个被否定的项目通过了", text: "终于有一天，那个被所有人否定的项目被签了下来。你端起咖啡，准备迎接人生第一次真正的翻身。", visual: "blue" },
      "memory-climax": { id: "office-03", eyebrow: "高潮 · 辞职信", title: "你终于准备拿回自己的生活", text: "你把辞职信放到桌上，手指刚刚离开键盘，墙外忽然传来一声巨响。", visual: "white" },
    },
    accident: { fracture: "加班楼层的灯一盏盏熄灭，墙外的夜色却被一道裂缝照亮。", impact: "一辆不属于此界的异界大运撞进来，顺便替你完成了离职手续。", aftershock: "恭喜你，终于不用加班了。代价是换了个世界。" },
  },
  court: {
    label: "宫廷人物",
    descriptor: "宫门未出，异界銮驾先撞进来了",
    glyph: "宫",
    memories: {
      "memory-one": { id: "court-01", eyebrow: "记忆一 · 偏殿", title: "你在每一句请安里听刀锋", text: "你从无人问津的偏殿走到众人注目的席位，学会了在每一句请安里听出真正的刀锋。", visual: "curtain" },
      "memory-two": { id: "court-02", eyebrow: "记忆二 · 收网", title: "多年布局终于到了最后一枚棋", text: "宫门内外都在等你落下最后一枚棋子。你已经准备好成为这座城真正的主人，连笑意都排练得恰到好处。", visual: "gold" },
      "memory-climax": { id: "court-03", eyebrow: "高潮 · 下令", title: "你抬起手，准备改写局势", text: "你抬起下令的手，正要说出那句改变局势的话。殿顶忽然传来车轮碾过琉璃瓦的声音。", visual: "white" },
    },
    accident: { fracture: "宫门未开，殿顶先被时空裂缝顶穿，仿佛天外有人强行递来一张请帖。", impact: "一辆异界大运撞破屋顶，把你和满殿的权谋一起送出了本世界。", aftershock: "你精心布局多年，最后败给了没有编制的车夫。" },
  },
  cultivator: {
    label: "修士",
    descriptor: "雷劫最后一刻，被异界大运插队",
    glyph: "劫",
    memories: {
      "memory-one": { id: "cultivator-01", eyebrow: "记忆一 · 引气", title: "从连引气都做不到的凡人开始", text: "你曾经连引气都做不到。别人说你资质平庸，你就把每一次失败都记下来，再把它炼成下一次的台阶。", visual: "stone" },
      "memory-two": { id: "cultivator-02", eyebrow: "记忆二 · 三百年", title: "护阵、法宝、丹药和退路，一件不少", text: "你准备了数百年。每一道护阵都亲自验过，每一枚丹药都留了备份，甚至连渡劫失败后的遗言都想好了。你对未来的意淫，已经写到了飞升之后。", visual: "thunder" },
      "memory-climax": { id: "cultivator-03", eyebrow: "高潮 · 破鼎", title: "助我破鼎！", text: "第九道天雷落下，飞升之门在云端打开。你抬头望向那道门，终于喊出：‘助我破鼎！’", visual: "summit" },
    },
    accident: { fracture: "远方忽然传来一句不属于此界的低语：‘根深蒂固。’天穹像被谁从外面捅了一下。", impact: "一道时空裂缝骤然张开，一辆大巴车从里面冲出，精准创在你即将飞升的关键节点。", aftershock: "你不是没渡过雷劫。你只是被异界大运创出了新的道途。" },
  },
};

export const SYSTEM_NAME = "笔界跃迁系统";

export const REACTION_OPTIONS = [
  { id: "buffer", label: "先缓缓", text: "卧槽，我这是给异界大运带过来了？但重生成系统又是什么鬼啊！" },
  { id: "hero", label: "我要起飞", text: "那太棒了！终于转生异世界了！我要让宿主登上人生巅峰！" },
  { id: "theatrical", label: "本座主场", text: "哦？有意思。哼哼哼哼，终于到我的主场了吗？" },
] as const;

export const HOST_OPTIONS = [
  { id: "draft", title: "回收站里的开头", text: "凌晨三点，一个人把开头删掉，又从回收站里捡了回来。", signal: "他不是不想写，只是不想再承认自己还想写。" },
  { id: "fee", title: "未拆的稿费通知", text: "出租屋里的人盯着未拆的稿费通知，先算了一遍房租。", signal: "他已经开始计算放弃写作能换来多少喘息。" },
  { id: "character", title: "十年前的角色", text: "办公室厕所隔间里，有人用手机修改十年前角色的名字。", signal: "他嘴上说早就不写了，手却记得那个角色的生日。" },
] as const;

export const APPROACH_OPTIONS = [
  { id: "banter", label: "嘴贫接近", descriptor: "先用一个不太靠谱的玩笑试探宿主" },
  { id: "editor", label: "编辑接近", descriptor: "直接指出问题，证明系统确实有用" },
  { id: "support", label: "托底接近", descriptor: "先不谈成功，只帮助宿主完成一句话" },
] as const;

export type Reaction = (typeof REACTION_OPTIONS)[number]["id"];
export type Host = (typeof HOST_OPTIONS)[number]["id"];
export type Approach = (typeof APPROACH_OPTIONS)[number]["id"];
