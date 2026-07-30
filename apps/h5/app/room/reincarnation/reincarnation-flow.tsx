"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./reincarnation-flow.module.css";
import {
  clearSystemBinding,
  createSystemBinding,
  createOriginStorySpec,
  getSystemDialogue,
  loadSystemBinding,
  saveSystemBinding,
  type PersonalityCode,
  type SystemBindingSnapshot,
} from "../system/system-layer";

export interface IdentityOption {
  id: string;
  name: string;
  icon: string;
  tag: string;
  /** Candidate character showcase asset; absent means the pose slot must stay visible. */
  poseAssetRef?: string;
  monologue: string;
  accidentQuote: string;
  heroReaction: string;
}

type MemoryBeatId = "memory-one" | "memory-two" | "memory-climax";

interface RuntimeMemoryPage {
  pageId: string;
  title: string;
  contractBeatId: MemoryBeatId;
  assetRef?: string;
  contentRef: string;
  textSlots: readonly string[];
  alt: string;
}

const REINCARNATION_VISUAL_ASSETS = {
  memoryBook: "/assets/prologue/reincarnation/origin-memory-book-v1.png",
  fortuneImpact: "/assets/prologue/reincarnation/fortune-impact-v1.png",
  systemAwakening: "/assets/prologue/reincarnation/system-awakening-v1.png",
  xuanzhu: {
    characterCard: "/assets/prologue/reincarnation/xuanzhu/v1/character-card.webp",
    pages: {
      B1: "/assets/prologue/reincarnation/xuanzhu/v1/b01.webp",
      B2: "/assets/prologue/reincarnation/xuanzhu/v1/b02.webp",
      B3: "/assets/prologue/reincarnation/xuanzhu/v1/b03.webp",
      B4: "/assets/prologue/reincarnation/xuanzhu/v1/b04.webp",
      B5: "/assets/prologue/reincarnation/xuanzhu/v1/b05.webp",
      B6: "/assets/prologue/reincarnation/xuanzhu/v1/b06.webp",
      B7: "/assets/prologue/reincarnation/xuanzhu/v1/b07.webp",
      B8: "/assets/prologue/reincarnation/xuanzhu/v1/b08.webp",
      B9: "/assets/prologue/reincarnation/xuanzhu/v1/b09.webp",
      B10: "/assets/prologue/reincarnation/xuanzhu/v1/b10.webp",
      B11: "/assets/prologue/reincarnation/xuanzhu/v1/b11.webp",
    },
  },
} as const;

const XUANZHU_MEMORY_PAGES: readonly RuntimeMemoryPage[] = [
  { pageId: "B1", title: "血海尸堆与钝铁起剑", contractBeatId: "memory-one", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B1, contentRef: "paper-mirror:xuanzhu:v5:B1", textSlots: [], alt: "玄烛少年从雨夜尸堆中握住钝铁剑。" },
  { pageId: "B2", title: "钝剑穿骨", contractBeatId: "memory-one", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B2, contentRef: "paper-mirror:xuanzhu:v5:B2", textSlots: [], alt: "少年玄烛以未开锋的钝剑强行杀出生路。" },
  { pageId: "B3", title: "万重山围剿", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B3, contentRef: "paper-mirror:xuanzhu:v5:B3", textSlots: [], alt: "玄烛踏过断剑与围剿者走上万重山。" },
  { pageId: "B4", title: "斩断旧恩", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B4, contentRef: "paper-mirror:xuanzhu:v5:B4", textSlots: [], alt: "玄烛在山道上斩断旧友的剑，拒绝回头。" },
  { pageId: "B5", title: "立万剑碑", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B5, contentRef: "paper-mirror:xuanzhu:v5:B5", textSlots: [], alt: "玄烛立于万剑碑之巅，天下剑修俯首。" },
  { pageId: "B6", title: "传剑不传情", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B6, contentRef: "paper-mirror:xuanzhu:v5:B6", textSlots: [], alt: "玄烛以一剑断峰向弟子示范剑道极境。" },
  { pageId: "B7", title: "斩尽天魔", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B7, contentRef: "paper-mirror:xuanzhu:v5:B7", textSlots: [], alt: "玄烛化作剑芒撕裂魔海，登临诸天。" },
  { pageId: "B8", title: "剑冢孤坐", contractBeatId: "memory-two", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B8, contentRef: "paper-mirror:xuanzhu:v5:B8", textSlots: [], alt: "举世无敌的玄烛独坐剑冢，开始厌倦长生。" },
  { pageId: "B9", title: "一剑斩天", contractBeatId: "memory-climax", assetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B9, contentRef: "paper-mirror:xuanzhu:v5:B9", textSlots: [], alt: "玄烛一剑切开紫霄神雷与天穹。" },
];

export const IDENTITIES: IdentityOption[] = [
  {
    id: "xianxia",
    name: "玄烛剑尊",
    icon: "仙",
    tag: "无敌剑尊",
    poseAssetRef: REINCARNATION_VISUAL_ASSETS.xuanzhu.characterCard,
    monologue: "我这一生杀穿诸天，若天道仍不肯答，便连这片天一并斩开。",
    accidentQuote: "本座一剑斩开了天，天缝里为何会冲出一辆铁壳重卡？！",
    heroReaction: "系统大哥……你问天就问天，别拿我的键盘试剑啊！",
  },
  {
    id: "palace",
    name: "后宫贵人",
    icon: "凤",
    tag: "宫斗风",
    monologue: "本宫卧薪尝胆五年，趁着疯狂星期四在皇上的红豆汤里下了真言散，明日我就是皇太后！",
    accidentQuote: "本宫斗过了贵妃斗过了皇后...居然没斗过一辆大运送外卖的三轮车！",
    heroReaction: "系统姐姐...你说话这个‘本宫’和‘受着呗’混搭风，真的不会出戏吗...",
  },
  {
    id: "worker",
    name: "深夜社畜",
    icon: "卷",
    tag: "职场风",
    monologue: "修改完第 18 版 PPT，明早我就能升职加薪当上总经理！",
    accidentQuote: "老板，这算工伤吗...我不补考了，我下辈子要当老板使唤人！",
    heroReaction: "喂！怎么感觉你这个金手指系统比我这个卡文作者还想摆烂啊？！",
  },
  {
    id: "coder",
    name: "极客程序员",
    icon: "卦",
    tag: "硬核风",
    monologue: "代码跑通了！全网零 Bug！上线即封神！千万别动这行代码！",
    accidentQuote: "这 Bug...连大运重卡都无法溢出啊！",
    heroReaction: "两位系统大哥...你们说的‘堆栈溢出’，能帮我把今天 2000 字直接生成出来吗？",
  },
  {
    id: "mage",
    name: "异界魔导士",
    icon: "符",
    tag: "西幻风",
    monologue: "吟唱终极禁咒！大魔王，接受本贤者的天罚吧！",
    accidentQuote: "禁咒...居然被大运耕地拖拉机给打断了？！",
    heroReaction: "系统大哥...您别吟唱了，门外催更的编辑不是大魔王啊！",
  },
  {
    id: "detective",
    name: "密室名侦探",
    icon: "镜",
    tag: "悬疑风",
    monologue: "真相只有一个！凶手就是隐藏在密室里的...",
    accidentQuote: "密室天花板被大运重卡给砸穿了...这根本不讲物理逻辑啊！",
    heroReaction: "系统大哥，我只是废稿写砸了，别用看凶手的眼神看我啊！",
  },
  {
    id: "idol",
    name: "地下偶像",
    icon: "星",
    tag: "偶像风",
    monologue: "只要大家挥舞荧光棒，舞台就由我来守护！",
    accidentQuote: "应援车居然失控创上了舞台？！",
    heroReaction: "系统妹妹，我不会打 Call 啊！我只会按键盘打字啊！",
  },
  {
    id: "chef",
    name: "小巷厨神",
    icon: "鼎",
    tag: "美食风",
    monologue: "一道扬州炒饭，吃得远古大能当场痛哭流涕认我为主！",
    accidentQuote: "送食材的大运货车直接把老夫的百年来面馆给平推了...",
    heroReaction: "系统大厨，能给我做盘宵夜吗？写完这章我饿坏了...",
  },
  {
    id: "gamer",
    name: "电竞老将",
    icon: "竞",
    tag: "竞技风",
    monologue: "最后一波决胜团战！看本座闪现开团五杀翻盘！",
    accidentQuote: "对方居然搬出了大运重卡作弊器，把服务器给物理碾平了...",
    heroReaction: "系统老哥，写小说不能靠手速 R Flash 啊！得讲逻辑啊！",
  },
  {
    id: "athlete",
    name: "马拉松冠军",
    icon: "疾",
    tag: "热血风",
    monologue: "冲过这最后一百米，我就是史上第一位全满贯金牌得主！",
    accidentQuote: "后面冲上来的不是第二名...居然是一辆冒着蓝光的大运重卡？！",
    heroReaction: "系统教官...今天能少跑五公里，多写一千字吗？",
  },
  {
    id: "artist",
    name: "落魄画师",
    icon: "画",
    tag: "艺术风",
    monologue: "完成这幅画作，我的灵魂将与艺术同在！",
    accidentQuote: "画面还没干，大运重卡就把我的画室给碾成渣了...",
    heroReaction: "系统大师，要不您帮我画插图，我自己来敲字？",
  },
  {
    id: "archaeologist",
    name: "遗迹考古学家",
    icon: "典",
    tag: "探索风",
    monologue: "解开古墓壁画上的象形文字，终极文明密码即刻揭晓！",
    accidentQuote: "壁画里封印的不是古代法老...居然是一整排异界大运重卡！",
    heroReaction: "系统大哥...我那不是象形文字，我只是写快了连笔画混在一起了！别考据了！",
  },
  {
    id: "demon",
    name: "魔门人材",
    icon: "魔",
    tag: "魔道喜剧",
    monologue: "别人闭关悟道，我闭关研究怎么把赔本买卖说成战略转进。今日魔门大典，先把账本藏好。",
    accidentQuote: "本尊没输给正道，本尊只是被异界大运重卡提前结算了——此事记账，利息另算！",
    heroReaction: "你这股魔气……为什么每句话都像在和客服理论？",
  },
];

export interface GeneOption {
  id: string;
  name: string;
  trait: string;
  quote: string;
}

export const ROUND_1_OPTIONS: GeneOption[] = [
  { id: "A", name: "剑尊霸气", trait: "霸道救世", quote: "本座纵然化作系统，也能替宿主斩开卡文这一关。" },
  { id: "B", name: "质问来路", trait: "严谨求知", quote: "本座一剑斩开的天缝，为何会冲出重卡？子系统，先把因果说清。" },
  { id: "C", name: "高处自嘲", trait: "清修咸鱼", quote: "举世无敌三千年，最后输给交通规则。做系统总该清净些了吧。" },
  { id: "D", name: "从容度化", trait: "逍遥游世", quote: "万物皆有定数。既来此处，便看看这位宿主值不值得本座再拔一次剑。" },
];

export const ROUND_2_OPTIONS: GeneOption[] = [
  { id: "A", name: "严师高冷", trait: "高冷督战", quote: "这小子浑身卡文废柴气，若非子系统强锁，老夫一掌拍飞他！" },
  { id: "B", name: "热血护短", trait: "热血护短", quote: "罢罢罢，遇到老夫是这凡人的造化，老夫便当收了个记名弟子！" },
  { id: "C", name: "共情温情", trait: "共情陪伴", quote: "看他卡文这愁苦样...倒是像极了老夫当年卡在突破瓶颈的模样。" },
  { id: "D", name: "算法真火", trait: "丹道提炼", quote: "老夫要用三昧真火抽离这小子的拖延心莫，强力淬炼其慧根！" },
];

export const ROUND_3_OPTIONS: GeneOption[] = [
  { id: "A", name: "雷霆手段", trait: "雷劫催更", quote: "敢少写一字，老夫叫子系统给你放九天雷劫背景音！" },
  { id: "B", name: "丹道助攻", trait: "灵感飞花", quote: "待本座用真火将其废稿炼化为金羽纸蝶，助他灵感大作！" },
  { id: "C", name: "傲娇观察", trait: "静观其变", quote: "本座先看他能折腾出什么花样，若写得难看本座再出手！" },
  { id: "D", name: "天道打赏", trait: "法宝馈赠", quote: "若他今日能写出高潮打脸章节，本座赐他手冲咖啡灵丹爆率！" },
];

function accidentVisualAsset(beatId: string, identityId: string): string | undefined {
  if (identityId === "xianxia") {
    if (beatId === "accident-01") return REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B10;
    if (beatId === "accident-02") return REINCARNATION_VISUAL_ASSETS.xuanzhu.pages.B11;
  }
  if (beatId === "accident-02") return REINCARNATION_VISUAL_ASSETS.fortuneImpact;
  if (beatId === "accident-01" || beatId === "accident-03" || beatId === "blackout") return undefined;
  return undefined;
}

export function SystemReincarnationFlow() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityOption>(IDENTITIES[0]!);
  const [existingBinding, setExistingBinding] = useState<SystemBindingSnapshot | null>(null);
  const [mangaBeatIndex, setMangaBeatIndex] = useState(0);
  const [accidentBeatIndex, setAccidentBeatIndex] = useState(0);
  const [poseAssetErrorIdentityId, setPoseAssetErrorIdentityId] = useState<string | null>(null);
  const identityCardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // 3-Round Gene selections
  const [r1Choice, setR1Choice] = useState<GeneOption | null>(null);
  const [r2Choice, setR2Choice] = useState<GeneOption | null>(null);
  const [r3Choice, setR3Choice] = useState<GeneOption | null>(null);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentStep]);

  useEffect(() => {
    const stored = loadSystemBinding();
    if (stored?.origin.bindingStatus === "bound") setExistingBinding(stored);
  }, []);

  useEffect(() => {
    if (currentStep !== 1) return;
    const selectedCard = identityCardRefs.current[selectedIdentity.id];
    if (!selectedCard || typeof selectedCard.scrollIntoView !== "function") return;
    selectedCard.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentStep, selectedIdentity.id]);

  const geneCode = `${r1Choice?.id || "A"}${r2Choice?.id || "A"}${r3Choice?.id || "A"}` as PersonalityCode;
  const originStory = useMemo(() => createOriginStorySpec(selectedIdentity), [selectedIdentity]);
  const memoryBeats = originStory.beats.filter((beat) => beat.beatId.startsWith("memory-"));
  const accidentBeats = originStory.beats.filter((beat) => ["accident-01", "accident-02", "accident-03", "blackout"].includes(beat.beatId));
  const memoryPages: readonly RuntimeMemoryPage[] = selectedIdentity.id === "xianxia"
    ? XUANZHU_MEMORY_PAGES
    : memoryBeats.map((beat) => ({
      pageId: beat.beatId,
      title: beat.title,
      contractBeatId: beat.beatId as MemoryBeatId,
      contentRef: beat.assetRef,
      textSlots: beat.textSlots,
      alt: `${selectedIdentity.name}前身记忆：${beat.title}`,
    }));
  const previewBinding = useMemo(() => createSystemBinding({
    identity: selectedIdentity,
    personalityCode: geneCode,
  }), [selectedIdentity, geneCode]);

  const selectIdentity = (identity: IdentityOption) => {
    setSelectedIdentity(identity);
    setMangaBeatIndex(0);
    setAccidentBeatIndex(0);
  };

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(7, prev + 1));
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const advanceMangaBeat = () => {
    if (mangaBeatIndex < memoryPages.length - 1) {
      setMangaBeatIndex((index) => index + 1);
    } else {
      nextStep();
    }
  };

  const advanceAccidentBeat = () => {
    if (accidentBeatIndex < accidentBeats.length - 1) {
      setAccidentBeatIndex((index) => index + 1);
    } else {
      nextStep();
    }
  };

  const bindSystemAndEnterRoom = () => {
    const binding = createSystemBinding({
      identity: selectedIdentity,
      personalityCode: geneCode,
    });
    saveSystemBinding(binding);
  };

  const restartReincarnation = () => {
    clearSystemBinding();
    setExistingBinding(null);
    setSelectedIdentity(IDENTITIES[0]!);
    setMangaBeatIndex(0);
    setAccidentBeatIndex(0);
    setR1Choice(null);
    setR2Choice(null);
    setR3Choice(null);
    setCurrentStep(1);
  };

  const adaptGeneQuote = (quote: string) => {
    const selfAddress: Record<string, string> = {
      xianxia: "本座",
      palace: "本宫",
      worker: "我",
      coder: "本进程",
      mage: "本贤者",
      detective: "我",
      idol: "本系统",
      chef: "本厨神",
      gamer: "我方",
      athlete: "我",
      artist: "在下",
      archaeologist: "在下",
      demon: "本尊",
    };
    return quote.replaceAll("老夫", selfAddress[selectedIdentity.id] ?? "本系统").replaceAll("本座", selfAddress[selectedIdentity.id] ?? "本系统").replaceAll("这小子", "这位宿主");
  };

  const currentAccidentBeatId = accidentBeats[accidentBeatIndex]?.beatId ?? "accident-01";
  const currentAccidentAsset = accidentVisualAsset(currentAccidentBeatId, selectedIdentity.id);
  const currentMemoryPage = memoryPages[mangaBeatIndex] ?? memoryPages[0]!;
  const currentMemoryBeatId = currentMemoryPage.contractBeatId;
  const currentMemoryAsset = currentMemoryPage.assetRef;
  const poseAssetUnavailable = Boolean(selectedIdentity.poseAssetRef)
    && poseAssetErrorIdentityId === selectedIdentity.id;
  const hasUsablePoseAsset = Boolean(selectedIdentity.poseAssetRef) && !poseAssetUnavailable;
  const stageBackdropAsset = currentStep === 2
    ? REINCARNATION_VISUAL_ASSETS.memoryBook
    : currentStep === 3
      ? currentAccidentAsset
      : currentStep === 4
        ? REINCARNATION_VISUAL_ASSETS.systemAwakening
        : currentStep >= 5
          ? REINCARNATION_VISUAL_ASSETS.systemAwakening
          : REINCARNATION_VISUAL_ASSETS.memoryBook;
  const visualPhase = currentStep === 3
    ? currentAccidentBeatId
    : currentStep === 2
      ? currentMemoryBeatId
      : currentStep === 4
        ? "awakening"
        : currentStep >= 5
          ? "system-calibration"
          : "origin-select";

  return (
    <div
      className={`${styles.container} ${styles[`stageTone${currentStep}`] ?? ""}`}
      data-testid="reincarnation-entry"
      data-stage-step={currentStep}
      data-visual-phase={visualPhase}
    >
      <div
        className={styles.stageBackdrop}
        style={{ backgroundImage: stageBackdropAsset ? `url("${stageBackdropAsset}")` : "none" }}
        aria-hidden="true"
      />
      <div className={styles.topBar}>
        <Link href="/room" className={styles.backBtn}>
          ◀ 归居
        </Link>
        <div className={styles.stepBadge}>
          {currentStep === 1 && "卷一 · 挑选前身"}
          {currentStep === 2 && "卷二 · 前身记忆"}
          {currentStep === 3 && "卷三 · 大运撞击"}
          {currentStep === 4 && "卷四 · 系统醒来"}
          {currentStep === 5 && "卷五 · 口吻校准"}
          {currentStep === 6 && "卷六 · 目标检索"}
          {currentStep === 7 && "卷七 · 绑定宿主"}
        </div>
      </div>

      <main className={currentStep === 1 ? styles.characterSelectStage : styles.stageCard}>
        {/* Step 1: Clean Mother Background Stage (1:1 Pure Artwork) */}
        {currentStep === 1 && (
          <div className={styles.image2StageContainer}>
            {/* Left Parchment Attribute Slip Overlay */}
            <div className={styles.leftParchmentSlip}>
              <div className={styles.inkStrokeTitle}>
                <h2 className={styles.inkCharacterName}>{selectedIdentity.name}</h2>
                <span className={styles.inkSubTag}>{selectedIdentity.tag}</span>
              </div>

              {/* Ink Astrological Circle */}
              <div className={styles.inkAstrologicalCircle}>
                <div className={styles.inkInnerDot} />
              </div>

              {/* 4 Attribute Ink Bar Charts */}
              <div className={styles.attributeBarList}>
                <div className={styles.attrRow}>
                  <span className={styles.attrIcon}>✦</span>
                  <div className={styles.attrBarFill} style={{ width: "85%" }} />
                </div>
                <div className={styles.attrRow}>
                  <span className={styles.attrIcon}>❖</span>
                  <div className={styles.attrBarFill} style={{ width: "70%" }} />
                </div>
                <div className={styles.attrRow}>
                  <span className={styles.attrIcon}>▲</span>
                  <div className={styles.attrBarFill} style={{ width: "90%" }} />
                </div>
                <div className={styles.attrRow}>
                  <span className={styles.attrIcon}>☯</span>
                  <div className={styles.attrBarFill} style={{ width: "65%" }} />
                </div>
              </div>

              {/* Hexagonal Attribute Radar Chart */}
              <div className={styles.hexRadarChart}>
                <svg viewBox="0 0 100 100" width="65" height="65">
                  <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="none" stroke="#78350f" strokeWidth="1.5" />
                  <polygon points="50,20 78,35 75,68 50,80 25,65 22,35" fill="rgba(120,53,15,0.25)" stroke="#b91c1c" strokeWidth="1.5" />
                </svg>
              </div>

              {/* Monologue Quote & Subtitle */}
              <blockquote className={styles.leftMonologue}>“{selectedIdentity.monologue}”</blockquote>
              <span className={styles.leftSubtitleHint}>先选一段人生，再让命运负责撞击</span>
            </div>

            {/* Center Hero Pose Stage (Standing over background ink splatter) */}
            <div className={styles.centerHeroPoseStage} data-testid="identity-pose-stage" aria-live="polite">
              {hasUsablePoseAsset ? (
                <img
                  className={styles.heroPoseFullImage}
                  src={selectedIdentity.poseAssetRef}
                  alt={`${selectedIdentity.name}的姿态图候选`}
                  data-testid="identity-pose-image"
                  onError={() => setPoseAssetErrorIdentityId(selectedIdentity.id)}
                  onLoad={() => setPoseAssetErrorIdentityId((current) => current === selectedIdentity.id ? null : current)}
                />
              ) : (
                <div className={styles.selectionPosePlaceholder} data-testid="identity-pose-placeholder">
                  <span>{poseAssetUnavailable ? "POSE ASSET / UNAVAILABLE" : "POSE SLOT / NOT REGISTERED"}</span>
                  <strong>{poseAssetUnavailable ? "姿态图暂不可用" : "姿态图待补"}</strong>
                  <small>{poseAssetUnavailable
                    ? "当前引用无法加载；保留空槽位，不借用其他身份的姿态图。"
                    : "当前身份已可体验，但纸镜尚未登记独立姿态资产。"}</small>
                </div>
              )}
            </div>

            {/* Existing Binding Snapshot Card (If available) */}
            {existingBinding && (
              <div className={styles.existingBindingOverlay} data-testid="existing-binding-card">
                <span>LOCAL BINDING / 已有系统快照 [{existingBinding.origin.personalityCode}] · 你已绑定“{existingBinding.origin.identityName}”</span>
                <Link href="/room" className={styles.actionBtn} data-testid="resume-binding-btn">继续进入房间 ↗</Link>
                <button type="button" className={styles.secondaryActionBtn} onClick={restartReincarnation} data-testid="restart-reincarnation-btn">重新体验</button>
              </div>
            )}

            {/* Bottom Carved Stone/Wood Selector Dock (Overlaying wood dock in background art) */}
            <div className={styles.bottomDockBar} aria-label="前身身份档案库">
              <button type="button" className={styles.dockArrowBtn}>‹</button>

              <div className={styles.dockCardGrid}>
                {IDENTITIES.map((item, index) => {
                  const isSelected = selectedIdentity.id === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      ref={(element) => {
                        identityCardRefs.current[item.id] = element;
                      }}
                      className={`${styles.dockCard} ${isSelected ? styles.dockCardSelected : ""}`}
                      onClick={() => selectIdentity(item)}
                      aria-pressed={isSelected}
                      aria-controls="identity-pose-stage"
                      aria-label={`${item.name}，${item.tag}${isSelected ? "，当前选中" : ""}`}
                      data-testid={`identity-option-${item.id}`}
                    >
                      {isSelected && <div className={styles.selectedRedCrest} />}
                      <div className={styles.sealStampBadge}>
                        <span>{item.icon}</span>
                      </div>
                      <span className={styles.dockName}>{item.name}</span>
                      {isSelected && <div className={styles.selectedRedTassel} />}
                    </button>
                  );
                })}
              </div>

              <button type="button" className={styles.dockArrowBtn}>›</button>

              {/* Bottom Right Red Wax Seal Confirm Button */}
              <button
                className={styles.bottomConfirmSealBtn}
                onClick={nextStep}
                data-testid="goto-step-2-btn"
              >
                <span>翻开记忆册</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Origin manga memory book */}
        {currentStep === 2 && (
          <>
            <div className={styles.stageHeader}>
              <div className={styles.stageEyebrow}>MEMORY BOOK / PAGE {String(mangaBeatIndex + 1).padStart(2, "0")}</div>
              <h1 className={styles.title}>前身记忆册 · {currentMemoryPage.title}</h1>
              <p className={styles.subtitle}>
                纸镜负责漫画画面；系统层只消费已选运行时包、控制翻页并记录固定 beat。人格判断还没有开始。
              </p>
            </div>

            {(() => {
              const page = currentMemoryPage;
              return (
                <section
                  className={styles.mangaStoryFrame}
                  data-testid="origin-manga-stage"
                  data-beat-id={page.contractBeatId}
                  data-page-id={page.pageId}
                  data-ui-owner="system"
                  data-content-owner="paper-mirror"
                >
                  <div className={styles.mangaBeatMeta}>
                    <span>MEMORY BOOK · {page.pageId} · {page.contractBeatId}</span>
                    <small>{mangaBeatIndex + 1} / {memoryPages.length} 页</small>
                  </div>
                  <div
                    className={`${styles.mangaVisual} ${currentMemoryAsset ? styles.comicPageVisual : ""}`}
                    style={{
                      backgroundImage: currentMemoryAsset ? `url("${currentMemoryAsset}")` : "none",
                    }}
                    role={currentMemoryAsset ? "img" : undefined}
                    aria-label={currentMemoryAsset ? page.alt : undefined}
                    data-asset-ref={currentMemoryAsset ?? page.contentRef}
                    data-asset-status={currentMemoryAsset ? "runtime-selected" : "missing-slot"}
                    data-layer-owner="paper-mirror"
                  >
                    {!currentMemoryAsset && (
                      <div className={styles.mangaAssetFallback}>
                        <span>纸镜内容槽</span>
                        <strong>该页漫画资产尚未接入</strong>
                        <small>系统保留页框、页码与翻页；不以通用背景冒充漫画。</small>
                      </div>
                    )}
                  </div>
                  <div className={styles.mangaAssetStatus}>
                    <span>{currentMemoryAsset ? "玄烛正式运行包已挂载" : "等待纸镜资产注册"}</span>
                    <small>内容：纸镜 · 交互：系统层 · {page.contentRef}</small>
                  </div>
                  {page.textSlots.length > 0 && (
                    <div className={styles.mangaTextSlots}>
                      {page.textSlots.map((slot) => <blockquote key={slot}>{slot}</blockquote>)}
                    </div>
                  )}
                  <div className={styles.beatPager}>
                    <button type="button" onClick={() => setMangaBeatIndex((index) => Math.max(0, index - 1))} disabled={mangaBeatIndex === 0} data-testid="manga-prev-btn">← 上一页</button>
                    <span data-testid="manga-beat-counter">{mangaBeatIndex + 1} / {memoryPages.length}</span>
                    <button type="button" onClick={advanceMangaBeat} data-testid="manga-next-btn">{mangaBeatIndex === memoryPages.length - 1 ? "让命运继续" : "下一页 →"}</button>
                  </div>
                </section>
              );
            })()}

            <div className={styles.mangaBox}>
              <div className={styles.mangaHeader}><span className={styles.mangaTitle}>人生压缩边界</span><span className={styles.geneTraitTag}>不进入小说正史</span></div>
              <p className={styles.optionText}>这里只记录“他为什么会成为现在的他”；玄烛 B1–B11 已作为独立静态运行时包接入，翻页不调用模型，也不会读取本机 Obsidian 路径。</p>
            </div>
          </>
        )}

        {/* Step 3: The cross-world fortune impact */}
        {currentStep === 3 && (
          <>
            <div className={styles.stageHeader}>
              <div className={styles.stageEyebrow}>FORTUNE IMPACT / FRAME {String(accidentBeatIndex + 1).padStart(2, "0")}</div>
              <h1 className={styles.title}>异界大运撞击 · {accidentBeats[accidentBeatIndex]?.title}</h1>
              <p className={styles.subtitle}>人生最庄严的那一刻，先被裂缝打断，再被一辆不讲天道的车负责到底。</p>
            </div>

            {(() => {
              const beat = accidentBeats[accidentBeatIndex] ?? accidentBeats[0]!;
              const comicPageId = selectedIdentity.id === "xianxia"
                ? beat.beatId === "accident-01"
                  ? "B10"
                  : beat.beatId === "accident-02"
                    ? "B11"
                    : undefined
                : undefined;
              return (
                <section className={styles.accidentStage} data-testid="accident-stage" data-beat-id={beat.beatId} data-page-id={comicPageId} data-visual-phase={beat.beatId}>
                  <div
                    className={`${styles.accidentVisual} ${currentAccidentAsset ? styles.comicPageVisual : ""}`}
                    style={{
                      backgroundImage: currentAccidentAsset ? `url("${currentAccidentAsset}")` : "none",
                    }}
                    role={currentAccidentAsset ? "img" : undefined}
                    aria-label={currentAccidentAsset ? `玄烛前身漫画 ${comicPageId ?? beat.beatId}：${beat.title}` : undefined}
                    data-asset-ref={currentAccidentAsset ?? beat.assetRef}
                    data-asset-status={currentAccidentAsset ? "runtime-selected" : "css-stage"}
                  >
                    {!currentAccidentAsset && (
                      <>
                        <div className={styles.accidentVisualShade} />
                        <div className={styles.accidentVisualContent}>
                          <span className={styles.truckBadge}>{beat.beatId === "accident-02" ? "大运重卡 · 跨界肇事" : beat.beatId === "accident-03" ? "白闪 · 未完念头" : beat.beatId === "blackout" ? "事故报告 · 拒绝申诉" : "天道异常 · 未登记"}</span>
                          <strong>{beat.title}</strong>
                          <p>{beat.visibleAction}</p>
                          <small>{beat.textSlots.join(" / ")}</small>
                        </div>
                      </>
                    )}
                  </div>
                  {beat.beatId === "blackout" && (
                    <div className={styles.accidentReport} data-testid="accident-report">
                      <span>OFFICIAL REPORT</span>
                      <p>{originStory.accident.finalReport}</p>
                    </div>
                  )}
                  <div className={styles.beatPager}>
                    <button type="button" onClick={() => setAccidentBeatIndex((index) => Math.max(0, index - 1))} disabled={accidentBeatIndex === 0} data-testid="accident-prev-btn">← 上一页</button>
                    <span data-testid="accident-beat-counter">{accidentBeatIndex + 1} / {accidentBeats.length}</span>
                    <button type="button" onClick={advanceAccidentBeat} data-testid="accident-next-btn">{accidentBeatIndex === accidentBeats.length - 1 ? "接受这次飞升" : "下一拍 →"}</button>
                  </div>
                </section>
              );
            })()}
          </>
        )}

        {/* Step 4: Awakening as the novelist system */}
        {currentStep === 4 && (
          <>
            <div className={styles.stageHeader}>
              <div className={styles.stageEyebrow}>SYSTEM BOOT / LOW PERMISSION MODE</div>
              <h1 className={styles.title}>转生完成 · 主系统启动</h1>
              <p className={styles.subtitle}>你没有变成小说家；你变成了负责扶持小说家、还要被子系统审计的系统。</p>
            </div>
            <div
              className={styles.awakeningBox}
              style={{ backgroundImage: `url("${REINCARNATION_VISUAL_ASSETS.systemAwakening}")` }}
              data-testid="system-awakening"
              data-asset-ref={REINCARNATION_VISUAL_ASSETS.systemAwakening}
              data-asset-status="bundled"
            >
              <div className={styles.awakeningShade} />
              <div className={styles.systemCore}>
                <span className={styles.speakerName}>⚡ 主系统核心</span>
                <strong>小说家晋升系统</strong>
                <p>观察、理解、发布有理由且可验收的创作任务；不替宿主生活，不替宿主写正文。</p>
              </div>
              <div className={`${styles.dialogueBubble} ${styles.subsystemBubble}`} data-event-type="subsystem_notice">
                <span className={styles.speakerName}>🤖 子系统 · 证据与边界审计</span>
                <div>【启动报告】权限很低，但会检查任务理由、最小交付物、验收标准，以及路线和活动是否已经登记。</div>
              </div>
              <div className={styles.awakeningConstraint}>
                <span>第一条不可绕过的约束</span>
                <strong>{originStory.awakening.firstConstraint}</strong>
              </div>
            </div>
            <button className={styles.actionBtn} onClick={nextStep} data-testid="goto-step-5-btn">开始三轮人格校准 ➔</button>
          </>
        )}

        {/* Step 5: 3-Round Gene Tree Selection */}
        {currentStep === 5 && (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>三轮人格对话 · 64 型系统口吻矩阵</h1>
              <p className={styles.subtitle}>子系统不替你选择，只把每次回答记录为一条长期语言倾向：世界观、宿主关系、创作动作。</p>
            </div>
            <div className={styles.calibrationBox} data-testid="personality-calibration">
              <div><span className={styles.speakerName}>🤖 子系统</span><p>请主系统回答三轮问题。漫画解释“你从哪里来”，选项决定“你醒来后怎么说话”。</p></div>
              <div><span className={styles.speakerName}>⚡ 当前人格载体</span><p>{selectedIdentity.name} · {originStory.genreFamily} · 尚未固化为长期口吻</p></div>
            </div>

            <div className={styles.roundProgress}>
              <div className={`${styles.roundDot} ${r1Choice ? styles.roundDotDone : styles.roundDotActive}`} />
              <div className={`${styles.roundDot} ${r2Choice ? styles.roundDotDone : r1Choice ? styles.roundDotActive : ""}`} />
              <div className={`${styles.roundDot} ${r3Choice ? styles.roundDotDone : r2Choice ? styles.roundDotActive : ""}`} />
            </div>

            {!r1Choice && (
              <div className={styles.optionList}>
                <div className={styles.roundPrompt}>【第 1 轮】面对转生遭遇与子系统来路，你怎么解释这个世界？</div>
                {ROUND_1_OPTIONS.map((opt) => (
                  <button key={opt.id} className={styles.optionBtn} onClick={() => setR1Choice(opt)} data-testid={`round1-opt-${opt.id}`}>
                    <div className={styles.optionHeader}><span className={styles.optionLabel}>选项 {opt.id}. {opt.name}</span><span className={styles.geneTraitTag}>[{opt.trait}]</span></div>
                    <p className={styles.optionText}>“{adaptGeneQuote(opt.quote)}”</p>
                  </button>
                ))}
              </div>
            )}

            {r1Choice && !r2Choice && (
              <div className={styles.optionList}>
                <div className={styles.roundPrompt}>【第 2 轮】面对被子系统锁定的小说家，你打算怎样接近他？</div>
                {ROUND_2_OPTIONS.map((opt) => (
                  <button key={opt.id} className={styles.optionBtn} onClick={() => setR2Choice(opt)} data-testid={`round2-opt-${opt.id}`}>
                    <div className={styles.optionHeader}><span className={styles.optionLabel}>选项 {opt.id}. {opt.name}</span><span className={styles.geneTraitTag}>[{opt.trait}]</span></div>
                    <p className={styles.optionText}>“{adaptGeneQuote(opt.quote)}”</p>
                  </button>
                ))}
              </div>
            )}

            {r1Choice && r2Choice && !r3Choice && (
              <div className={styles.optionList}>
                <div className={styles.roundPrompt}>【第 3 轮】扶持创作时，你的第一反应是什么？</div>
                {ROUND_3_OPTIONS.map((opt) => (
                  <button key={opt.id} className={styles.optionBtn} onClick={() => setR3Choice(opt)} data-testid={`round3-opt-${opt.id}`}>
                    <div className={styles.optionHeader}><span className={styles.optionLabel}>选项 {opt.id}. {opt.name}</span><span className={styles.geneTraitTag}>[{opt.trait}]</span></div>
                    <p className={styles.optionText}>“{adaptGeneQuote(opt.quote)}”</p>
                  </button>
                ))}
              </div>
            )}

            {r1Choice && r2Choice && r3Choice && (
              <div className={styles.mangaBox}>
                <div className={styles.mangaHeader}><span className={styles.mangaTitle}>⚡ 64 型人格固化完成</span><span className={styles.geneCodeBadge}>代码 [{geneCode}]</span></div>
                <p className={styles.optionText}>主系统将以这三轮选择生成长期口吻；身份词库来自前身，动作策略来自人格码。</p>
                <button className={styles.actionBtn} onClick={nextStep} data-testid="goto-step-6-btn">确认口吻 · 检索宿主 ➔</button>
              </div>
            )}

            <div className={styles.geneBar}>
              <span>当前已选基因：</span>
              {r1Choice && <span className={styles.geneTraitTag}>R1: {r1Choice.trait}</span>}
              {r2Choice && <span className={styles.geneTraitTag}>R2: {r2Choice.trait}</span>}
              {r3Choice && <span className={styles.geneTraitTag}>R3: {r3Choice.trait}</span>}
              {(r1Choice || r2Choice || r3Choice) && <button className={styles.resetGeneButton} onClick={() => { setR1Choice(null); setR2Choice(null); setR3Choice(null); }}>重置选择</button>}
            </div>
            <button className={styles.secondaryActionBtn} onClick={prevStep}>← 回到系统醒来</button>
          </>
        )}

        {/* Step 6: Target Search & Forced Lock */}
        {currentStep === 6 && (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>搜罗良材璞玉 · 子系统强制锁定</h1>
              <p className={styles.subtitle}>
                人格已经固化；现在才轮到系统与子系统争论“应该绑定谁”。结果当然不太体面。
              </p>
            </div>

            <div className={styles.radarContainer}>
              <div className={styles.alarmOverlay} />

              <div className={styles.targetCard}>
                <div className={styles.targetAvatar}>💼</div>
                <div className={styles.targetInfo}>
                  <div className={styles.targetName}>身价千亿商界大佬 (首选目标)</div>
                  <div className={styles.targetDesc}>资产千亿、果断利落，主系统想用三天重修化神</div>
                </div>
                <span className={styles.targetStatus}>[被拦截 ❌]</span>
              </div>

              <div className={`${styles.targetCard} ${styles.targetCardLock}`}>
                <div className={styles.targetAvatar}>✍️</div>
                <div className={styles.targetInfo}>
                  <div className={styles.targetName}>二流小说家小韩 (强锁目标)</div>
                  <div className={styles.targetDesc}>住在废柴小破屋、昨晚卡文没睡好挂着黑眼圈</div>
                </div>
                <span className={styles.lockBadge}>🚨 强锁中</span>
              </div>
            </div>

            <div className={styles.mangaBox}>
              <div className={styles.mangaHeader}>
                <span className={styles.mangaTitle}>💥 戏剧拉扯对话</span>
              </div>
              <blockquote className={styles.mangaQuote}>
                ⚡ <strong>{selectedIdentity.name} · {previewBinding.persona.interventionLabel}</strong>：“我刚看中那个家财万贯的目标，你却让我去扶持一个住在小破屋里、卡文挂着黑眼圈的二流小说家？！”
              </blockquote>
              <blockquote className={styles.mangaQuote}>
                🤖 <strong>子系统 AI · subsystem_notice</strong>：“【警告！检测到主系统偏离扶持使命。目标已锁定小韩；请先准备有理由、有交付物、有验收标准的任务。】”
              </blockquote>
            </div>

            <div className={styles.hostActions}>
              <button
                className={styles.actionBtn}
                data-variant="back"
                onClick={prevStep}
              >
                ← 上一步
              </button>
              <button
                className={styles.actionBtn}
                data-variant="forward"
                onClick={nextStep}
                data-testid="goto-step-7-btn"
              >
                空降房间，与小说家初见 ➔
              </button>
            </div>
          </>
        )}

        {/* Step 7: Drop & First Encounter */}
        {currentStep === 7 && (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>空降小说家小屋 · “系统上线”初见</h1>
              <p className={styles.subtitle}>
                系统视角坠入书房，已经固化人格的主系统与挂着黑眼圈的小韩第一次对话。
              </p>
            </div>

            <div className={styles.encounterBox}>
              <div className={`${styles.dialogueBubble} ${styles.ancestorBubble}`}>
                <span className={styles.speakerName}>⚡ 主系统 · {selectedIdentity.name} · 基因 [{geneCode}]</span>
                <div>“{getSystemDialogue(previewBinding.persona, previewBinding.task, { sceneLabel: "小破屋", activityLabel: "首次接触", focus: 42, fatigue: 78 })}”</div>
              </div>

              <div className={`${styles.dialogueBubble} ${styles.subsystemBubble}`}>
                <span className={styles.speakerName}>🤖 子系统 · subsystem_notice</span>
                <div>【滴！检测到主系统口吻已固化为“{previewBinding.persona.worldviewLabel} / {previewBinding.persona.relationshipLabel} / {previewBinding.persona.interventionLabel}”。宿主不是魔丸，只是一个需要自己决定是否写作的小说家。】</div>
              </div>

              <div className={`${styles.dialogueBubble} ${styles.heroBubble}`}>
                <span className={styles.speakerName}>😱 宿主小韩 (惊吓扶额)</span>
                <div>
                  “{selectedIdentity.heroReaction}”
                </div>
              </div>
            </div>

            <Link
              href="/room"
              className={styles.actionBtn}
              data-testid="enter-room-btn"
              onClick={bindSystemAndEnterRoom}
            >
              🚪 带着 [{geneCode}] 基因开启房间生态 ➔
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
