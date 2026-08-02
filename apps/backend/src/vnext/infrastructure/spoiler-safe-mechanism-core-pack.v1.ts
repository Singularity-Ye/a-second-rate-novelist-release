export type SpoilerSafeMechanismRuntimeTier =
  | "starter_candidate"
  | "shadow_candidate";

export interface SpoilerSafeMechanismCard {
  readonly candidateId: string;
  readonly safeName: string;
  readonly runtimeTier: SpoilerSafeMechanismRuntimeTier;
  readonly independentScore: number;
  readonly family: string;
  readonly intentTags: readonly string[];
  readonly fitWhen: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly preserveAgency: string;
  readonly rejectWhen: readonly string[];
  readonly cooldownTurns: number;
  readonly signals: readonly string[];
}

export interface SpoilerSafeMechanismCorePack {
  readonly protocol: "spoiler-safe-mechanism-runtime-projection.v1";
  readonly sourcePackSha256: string;
  readonly truthStatus: "candidate";
  readonly reviewStatus: "pending";
  readonly runtimeEnabledByDefault: false;
  readonly selectionContract: {
    readonly defaultRetrieve: 3;
    readonly hardMaxRetrieve: 5;
    readonly maxPrimaryPerScene: 1;
    readonly maxSecondaryPerScene: 1;
    readonly promptBudgetTokensPerCard: 260;
    readonly highRiskCandidateIds: readonly string[];
    readonly wholePackInjectionForbidden: true;
  };
  readonly qualityGates: {
    readonly prose: readonly string[];
    readonly stateIncrement: readonly string[];
    readonly costAndAgency: readonly string[];
    readonly opponentIntelligence: readonly string[];
    readonly harmAndAdultContent: readonly string[];
    readonly cultureToCausality: readonly string[];
  };
  readonly cards: readonly SpoilerSafeMechanismCard[];
}

// This is a spoiler-free runtime projection of the candidate pack. It contains
// no source prose, proper nouns, plot events, reveal order, or setting answers.
export const SPOILER_SAFE_MECHANISM_CORE_PACK_V1 = {
  protocol: "spoiler-safe-mechanism-runtime-projection.v1",
  sourcePackSha256:
    "7eaeb3158342d3fefa85a9557f5fa0a10eeb60ff2fdafe99f95e09ec46506b6d",
  truthStatus: "candidate",
  reviewStatus: "pending",
  runtimeEnabledByDefault: false,
  selectionContract: {
    defaultRetrieve: 3,
    hardMaxRetrieve: 5,
    maxPrimaryPerScene: 1,
    maxSecondaryPerScene: 1,
    promptBudgetTokensPerCard: 260,
    highRiskCandidateIds: ["K01", "K02", "K04", "K06", "K08"],
    wholePackInjectionForbidden: true,
  },
  qualityGates: {
    prose: [
      "用连续叙事承载判断，不把正文拆成标签、口号、说明书式排比或连续碎短句。",
      "避免模板化的‘不是……而是……’‘只要……就……’和先下结论再换词复述。",
      "允许短句，但只在真实动作、感官、情绪转折或已铺垫的决定需要节拍时使用。",
    ],
    stateIncrement: [
      "每个独立短段至少改变 belief、confidence、option、risk、emotion 或 action 之一；没有增量就删。",
    ],
    costAndAgency: [
      "重开、复活、分身、即时复原和隐藏退路先折价；重要失败仍须留下不可恢复残留。",
      "借来的全知、前世信息、外挂提示或专业盟友不自动证明主角更聪明、更正确或更高尚。",
    ],
    opponentIntelligence: [
      "强对手至少完成一次观察结果、修正估值并改变手段或胜利条件的闭环。",
    ],
    harmAndAdultContent: [
      "伤亡、羞辱、胁迫或人格剥夺附近的幽默不得取消受害者重量。",
      "成人内容同时判断镜头强度与叙事功能；事后反转不能倒推消除当时的胁迫。",
    ],
    cultureToCausality: [
      "文化意象必须转成操作属性、组合或禁忌、制度激励、角色选择、对手反制、可观察后果与判断修正。",
    ],
  },
  cards: [
    {
      candidateId: "K01",
      safeName: "可信方案的关键前提失效",
      runtimeTier: "starter_candidate",
      independentScore: 92,
      family: "premise_reversal",
      intentTags: ["反转", "危机升级", "计划破局", "认知更新"],
      fitWhen: [
        "角色已有可信方案并据此投入资源",
        "方案依赖此前可被指出的关键前提",
        "前提失效后角色仍能作出新选择",
      ],
      requiredEvidence: ["明确前提", "两条前置线索", "真实投入", "可见代价"],
      preserveAgency: "角色主动止损、改路或坚持，不能只站着接受作者翻桌。",
      rejectWhen: ["需要空降新能力", "前提从未出现", "此前努力会被全部清零"],
      cooldownTurns: 1,
      signals: [
        "计划",
        "方案",
        "前提",
        "止损",
        "危机",
        "反转",
        "plan",
        "premise",
        "failure",
        "crisis",
      ],
    },
    {
      candidateId: "K02",
      safeName: "读者先知、角色后知的延迟碰撞",
      runtimeTier: "shadow_candidate",
      independentScore: 84,
      family: "dramatic_irony",
      intentTags: ["戏剧反讽", "悬念", "喜剧", "延迟碰撞"],
      fitWhen: [
        "读者已看见条件变化",
        "角色有合理原因尚未得知",
        "旧判断会改变具体行动",
      ],
      requiredEvidence: ["读者领先信息", "合理盲区", "行动变化", "真实后果"],
      preserveAgency: "角色得知真相后应迅速更新，不能继续装傻。",
      rejectWhen: ["只靠没听见一句话", "信息可轻易获得", "只为嘲笑角色"],
      cooldownTurns: 2,
      signals: [
        "信息差",
        "读者先知",
        "延迟",
        "误会",
        "戏剧反讽",
        "dramatic irony",
        "reader knows",
        "delay",
      ],
    },
    {
      candidateId: "K03",
      safeName: "表层真实、里层另有用途",
      runtimeTier: "starter_candidate",
      independentScore: 89,
      family: "dual_purpose_action",
      intentTags: ["关系张力", "隐藏目的", "交易", "长线回收"],
      fitWhen: [
        "行动的表层收益本身真实",
        "同一行动还服务第二层用途",
        "隐藏用途会支付成本或改变关系",
      ],
      requiredEvidence: ["真实表层收益", "先行痕迹", "关系或资源成本", "行为后果"],
      preserveAgency: "受影响者保留获益、怀疑、反索或退出能力。",
      rejectWhen: ["表层完全是假", "所有善意再次揭成骗局", "隐藏目的不付成本"],
      cooldownTurns: 1,
      signals: [
        "隐藏目的",
        "交易",
        "善意",
        "双重用途",
        "关系",
        "secret motive",
        "deal",
        "trust",
        "relationship",
      ],
    },
    {
      candidateId: "K04",
      safeName: "角色一致性约束塑造必选行动",
      runtimeTier: "shadow_candidate",
      independentScore: 88,
      family: "constraint_driven_choice",
      intentTags: ["阳谋", "人物一致性", "艰难选择", "对手预判"],
      fitWhen: [
        "角色已有稳定价值、历史、身份或关系约束",
        "至少两个选项都带代价",
        "布置者利用约束而非控制心智",
      ],
      requiredEvidence: ["提前成立的约束", "两个真实选项", "各自代价", "不可逆后果"],
      preserveAgency: "角色以自己的理由选择，不能写成按钮触发。",
      rejectWhen: ["约束临时新增", "只有一个名义选项", "选择没有余波"],
      cooldownTurns: 1,
      signals: [
        "选择",
        "价值",
        "身份",
        "阳谋",
        "两难",
        "constraint",
        "choice",
        "dilemma",
        "identity",
      ],
    },
    {
      candidateId: "K05",
      safeName: "可证伪推理与外部节点验真",
      runtimeTier: "starter_candidate",
      independentScore: 86,
      family: "falsifiable_reasoning",
      intentTags: ["调查", "智斗", "谜题", "证据链"],
      fitWhen: [
        "现场存在两个以上解释",
        "角色能设计低成本外部验证",
        "验证结果会改变下一步",
      ],
      requiredEvidence: ["两项事实", "两个假设", "外部验证", "明确舍弃失败假设"],
      preserveAgency: "验证对象与对手可干扰结果，角色必须考虑污染和误差。",
      rejectWhen: ["只有唯一解释", "本人自说自话验真", "结果不能推翻假设"],
      cooldownTurns: 0,
      signals: [
        "调查",
        "证据",
        "推理",
        "验证",
        "假设",
        "谜题",
        "investigation",
        "evidence",
        "reasoning",
        "test",
        "mystery",
      ],
    },
    {
      candidateId: "K06",
      safeName: "局部自主胜果的尺度重定",
      runtimeTier: "starter_candidate",
      independentScore: 82,
      family: "scale_recontextualization",
      intentTags: ["格局升级", "胜后余波", "多尺度因果", "世界扩展"],
      fitWhen: [
        "角色已凭自身完成真实局部目标",
        "更大尺度能解释额外后果",
        "尺度变化不取消局部贡献",
      ],
      requiredEvidence: ["局部目标与成果", "独立外部尺度", "可追溯连接", "成果保留清单"],
      preserveAgency: "角色的努力、判断和牺牲必须继续有效。",
      rejectWhen: ["只为泼冷水", "局部胜果被清零", "高层此前不存在"],
      cooldownTurns: 1,
      signals: [
        "胜利",
        "格局",
        "余波",
        "世界",
        "尺度",
        "scale",
        "victory",
        "aftermath",
        "world",
      ],
    },
    {
      candidateId: "K07",
      safeName: "新证据链重写旧因果",
      runtimeTier: "starter_candidate",
      independentScore: 88,
      family: "evidence_reconstruction",
      intentTags: ["前史重释", "谜底", "历史", "证据回收"],
      fitWhen: [
        "前文已有至少两条可重释证据",
        "新证据提供解释钥匙",
        "重释会改变当前行动",
      ],
      requiredEvidence: ["两条旧证据", "一条新证据", "模型预测差异", "当下行动更新"],
      preserveAgency: "人物和记录可有偏差，但不能全部是作者故意撒谎。",
      rejectWhen: ["只有一条模糊伏笔", "新证据凭空出现", "重释不影响现在"],
      cooldownTurns: 1,
      signals: [
        "前史",
        "旧证据",
        "重释",
        "谜底",
        "历史",
        "past",
        "history",
        "reveal",
        "evidence",
      ],
    },
    {
      candidateId: "K08",
      safeName: "正面收益的具体用途重释",
      runtimeTier: "starter_candidate",
      independentScore: 85,
      family: "benefit_reinterpretation",
      intentTags: ["制度", "交易", "代价", "世界观"],
      fitWhen: [
        "角色确实获得正面收益",
        "设计者另有具体用途",
        "两层用途可以同时为真",
      ],
      requiredEvidence: ["真实收益", "用途痕迹", "具体制度目标", "接受或拒绝的后果"],
      preserveAgency: "角色保留利用、谈判、规避或退出空间。",
      rejectWhen: ["所有福利都是骗局", "用途只写成控制", "没有选择成本"],
      cooldownTurns: 1,
      signals: [
        "制度",
        "福利",
        "收益",
        "绑定",
        "控制",
        "system",
        "institution",
        "benefit",
        "cost",
      ],
    },
    {
      candidateId: "K09",
      safeName: "可见焦点掩护偏轴兑现",
      runtimeTier: "shadow_candidate",
      independentScore: 80,
      family: "attention_redirection",
      intentTags: ["多线", "掩护", "目标错位", "调度"],
      fitWhen: [
        "公开主冲突有真实胜负和后果",
        "第二目标已提前留下痕迹",
        "两线共享时间或资源",
      ],
      requiredEvidence: ["真实主冲突", "偏轴目标前置", "共享约束", "双线后果"],
      preserveAgency: "主冲突参与者的努力不能只是烟幕消耗品。",
      rejectWhen: ["主线完全无意义", "偏轴目标从未出现", "靠剪辑隐瞒可见信息"],
      cooldownTurns: 2,
      signals: [
        "多线",
        "掩护",
        "目标错位",
        "调度",
        "distraction",
        "parallel",
        "misdirection",
      ],
    },
    {
      candidateId: "K10",
      safeName: "对抗兼作体系知识采集",
      runtimeTier: "shadow_candidate",
      independentScore: 76,
      family: "combat_learning",
      intentTags: ["战斗", "学习", "体系", "后续回收"],
      fitWhen: [
        "能力有可观察结构",
        "角色能冒风险设计探针",
        "所学内容会在后续独立应用",
      ],
      requiredEvidence: ["观察对象", "测试动作", "付出代价", "不完整结论", "后续应用"],
      preserveAgency: "对手可察觉并改变表现，知识不能自动复制成同等掌握。",
      rejectWhen: ["看一眼就学会", "战斗暂停讲课", "无后续回收"],
      cooldownTurns: 2,
      signals: [
        "战斗",
        "能力",
        "学习",
        "试探",
        "边界",
        "combat",
        "learn",
        "probe",
        "ability",
      ],
    },
    {
      candidateId: "K11",
      safeName: "分散行动的延迟因果复盘",
      runtimeTier: "shadow_candidate",
      independentScore: 77,
      family: "distributed_causality",
      intentTags: ["群像", "多线后果", "延迟回收", "喜剧"],
      fitWhen: [
        "多个角色在不同地点独立行动",
        "行动共享资源或规则",
        "外部后果能把它们重新连接",
      ],
      requiredEvidence: ["两项分散行动", "共同媒介", "延迟原因", "可追溯外部后果"],
      preserveAgency: "主角不能预知并导演全部效果，配角选择必须真实贡献。",
      rejectWhen: ["只有剪辑蒙太奇", "后果不可追溯", "所有人只是主角棋子"],
      cooldownTurns: 2,
      signals: [
        "群像",
        "多线",
        "连锁",
        "延迟因果",
        "后果",
        "ensemble",
        "distributed",
        "chain reaction",
      ],
    },
    {
      candidateId: "K12",
      safeName: "刚性约束推出荒诞唯一解",
      runtimeTier: "shadow_candidate",
      independentScore: 74,
      family: "constraint_comedy",
      intentTags: ["喜剧", "破局", "规则", "荒诞"],
      fitWhen: [
        "至少三项约束已在场景中生效",
        "常规解法分别被约束封死",
        "荒诞解法仍严格遵守规则",
      ],
      requiredEvidence: ["三项刚性约束", "常规方案失败", "唯一解推导", "执行成本"],
      preserveAgency: "执行者主动接受荒诞代价，对手也可利用同一规则。",
      rejectWhen: ["靠随机巧合", "约束临时补充", "只是说怪话"],
      cooldownTurns: 2,
      signals: [
        "喜剧",
        "荒诞",
        "规则",
        "困局",
        "唯一解",
        "comedy",
        "absurd",
        "constraint",
        "rule",
      ],
    },
  ],
} as const satisfies SpoilerSafeMechanismCorePack;
