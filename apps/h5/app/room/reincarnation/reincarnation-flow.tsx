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
        {existingBinding && (
          <div className={styles.existingBindingBadge} data-testid="existing-binding-card">
            <span>已有系统快照 [{existingBinding.origin.personalityCode}] · 已绑定“{existingBinding.origin.identityName}”</span>
            <Link href="/room" className={styles.topBindingBtn} data-testid="resume-binding-btn">进入房间 ↗</Link>
            <button type="button" className={styles.topBindingResetBtn} onClick={restartReincarnation} data-testid="restart-reincarnation-btn">重新体验</button>
          </div>
        )}
      </div>

      <main className={currentStep === 1 ? styles.characterSelectStage : styles.stageCard}>
        {/* Step 1: Open Journal / RPG Character Binder Stage */}
        {currentStep === 1 && (
          <div className={styles.journalBinderStage}>
            {/* Stitched Central Spine / Binder Rings */}
            <div className={styles.journalSpine} />

            {/* Left Page: Character Dossier Sheet */}
            <div className={styles.journalLeftPage}>
              <div className={styles.dossierHeader}>
                <span className={styles.dossierBadge}>前身档案 · 卷一</span>
                <h2 className={styles.inkCharacterName}>
                  {selectedIdentity.name}
                  <span className={styles.vermilionSealBadge} title="玄烛之印" />
                </h2>
                <span className={styles.inkSubTag}>{selectedIdentity.tag}</span>
              </div>

              {/* Character Attributes Section */}
              <div className={styles.attributeSection}>
                <div className={styles.attrList}>
                  <div className={styles.attrItem}>
                    <span className={styles.attrLabel}>剑意 ✦</span>
                    <div className={styles.attrTrack}><div className={styles.attrFill} style={{ width: "95%" }} /></div>
                    <span className={styles.attrVal}>95</span>
                  </div>
                  <div className={styles.attrItem}>
                    <span className={styles.attrLabel}>悟性 ❖</span>
                    <div className={styles.attrTrack}><div className={styles.attrFill} style={{ width: "90%" }} /></div>
                    <span className={styles.attrVal}>90</span>
                  </div>
                  <div className={styles.attrItem}>
                    <span className={styles.attrLabel}>灵根 ▲</span>
                    <div className={styles.attrTrack}><div className={styles.attrFill} style={{ width: "85%" }} /></div>
                    <span className={styles.attrVal}>85</span>
                  </div>
                  <div className={styles.attrItem}>
                    <span className={styles.attrLabel}>心境 ☯</span>
                    <div className={styles.attrTrack}><div className={styles.attrFill} style={{ width: "70%" }} /></div>
                    <span className={styles.attrVal}>70</span>
                  </div>
                </div>

                {/* Xianxia Hexagonal Radar Emblem */}
                <div className={styles.hexRadarWrapper}>
                  <svg viewBox="0 0 120 120" width="105" height="105">
                    {/* Outer Hexagon */}
                    <polygon points="60,10 103,35 103,85 60,110 17,85 17,35" fill="none" stroke="rgba(168,98,50,0.35)" strokeWidth="1.5" />
                    {/* Inner Hexagon Grid */}
                    <polygon points="60,25 90,42 90,78 60,95 30,78 30,42" fill="none" stroke="rgba(168,98,50,0.2)" strokeWidth="1" strokeDasharray="3,3" />
                    {/* Filled Radar Polygon */}
                    <polygon points="60,15 97,38 92,79 60,90 35,74 24,39" fill="rgba(182,93,61,0.25)" stroke="#b65d3d" strokeWidth="2" />
                    {/* Vertex Dots */}
                    <circle cx="60" cy="15" r="3" fill="#b65d3d" />
                    <circle cx="97" cy="38" r="3" fill="#b65d3d" />
                    <circle cx="92" cy="79" r="3" fill="#b65d3d" />
                    <circle cx="60" cy="90" r="3" fill="#b65d3d" />
                    <circle cx="35" cy="74" r="3" fill="#b65d3d" />
                    <circle cx="24" cy="39" r="3" fill="#b65d3d" />
                    {/* Vertex Labels */}
                    <text x="60" y="6" textAnchor="middle" fill="#78350f" fontSize="9" fontWeight="bold">剑</text>
                    <text x="110" y="38" textAnchor="start" fill="#78350f" fontSize="9" fontWeight="bold">悟</text>
                    <text x="104" y="88" textAnchor="start" fill="#78350f" fontSize="9" fontWeight="bold">灵</text>
                    <text x="60" y="119" textAnchor="middle" fill="#78350f" fontSize="9" fontWeight="bold">心</text>
                    <text x="16" y="88" textAnchor="end" fill="#78350f" fontSize="9" fontWeight="bold">体</text>
                    <text x="10" y="38" textAnchor="end" fill="#78350f" fontSize="9" fontWeight="bold">魄</text>
                  </svg>
                </div>
              </div>

              {/* Character Monologue Quote */}
              <blockquote className={styles.dossierQuote}>“{selectedIdentity.monologue}”</blockquote>
              <div className={styles.dossierFooterHint}>先选一段人生，再让命运负责撞击</div>
            </div>

            {/* Right Page: Full Ink Artwork Canvas */}
            <div className={styles.journalRightPage}>
              {/* Floating Sword-Chi Particle Embers */}
              <div className={styles.swordChiParticles}>
                <div className={styles.particleOne} />
                <div className={styles.particleTwo} />
                <div className={styles.particleThree} />
              </div>

              <div className={styles.artworkCanvas} data-testid="identity-pose-stage">
                {hasUsablePoseAsset ? (
                  <img
                    className={styles.heroPoseFullImage}
                    src={selectedIdentity.poseAssetRef}
                    alt={`${selectedIdentity.name}的姿态图`}
                    data-testid="identity-pose-image"
                    onError={() => setPoseAssetErrorIdentityId(selectedIdentity.id)}
                    onLoad={() => setPoseAssetErrorIdentityId((current) => current === selectedIdentity.id ? null : current)}
                  />
                ) : (
                  <div className={styles.selectionPosePlaceholder} data-testid="identity-pose-placeholder">
                    <span>POSE SLOT / NOT REGISTERED</span>
                    <strong>姿态图待补</strong>
                  </div>
                )}

                {/* Interactive Secret Lore Pins on Artwork */}
                <div className={styles.interactiveLorePin} style={{ top: "25%", left: "28%" }}>
                  <span className={styles.pinPulse} />
                  <span className={styles.pinTag}>✦ 斩天剑意</span>
                  <div className={styles.pinTooltip}>曾一剑划开诸天九重天穹线</div>
                </div>

                <div className={styles.interactiveLorePin} style={{ top: "58%", left: "20%" }}>
                  <span className={styles.pinPulse} />
                  <span className={styles.pinTag}>❖ 本命紫霄</span>
                  <div className={styles.pinTooltip}>随身温养万载之无上神剑</div>
                </div>

                <div className={styles.interactiveLorePin} style={{ top: "72%", left: "68%" }}>
                  <span className={styles.pinPulse} />
                  <span className={styles.pinTag}>☯ 渡劫残卷</span>
                  <div className={styles.pinTooltip}>九重天劫下留存的飞升秘典</div>
                </div>
              </div>

              {/* Bottom Right CTA Action Bar */}
              <div className={styles.rightPageBottomBar}>
                <div className={styles.soleProtagonistBadge}>
                  <span className={styles.soleIcon}>仙</span>
                  <div className={styles.soleMeta}>
                    <strong>前身主角 · 玄烛剑尊</strong>
                    <small>无敌剑尊 · 斩开天穹</small>
                  </div>
                </div>

                <button
                  className={styles.soleStageCtaBtn}
                  onClick={nextStep}
                  data-testid="goto-step-2-btn"
                >
                  <span>翻开记忆册 ➔</span>
                </button>
              </div>
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

                  {/* Center Manga Stage with Left & Right Flank Page Flip Controls */}
                  <div className={styles.mangaStageWithFlanks}>
                    {/* Left Flank Button */}
                    <button
                      type="button"
                      className={styles.flankPageBtnLeft}
                      onClick={() => setMangaBeatIndex((index) => Math.max(0, index - 1))}
                      disabled={mangaBeatIndex === 0}
                      data-testid="manga-prev-btn"
                      title="上一页"
                    >
                      <span>‹</span>
                      <small>上一页</small>
                    </button>

                    {/* Main Manga Canvas */}
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

                    {/* Right Flank Button */}
                    <button
                      type="button"
                      className={styles.flankPageBtnRight}
                      onClick={advanceMangaBeat}
                      data-testid="manga-next-btn"
                      title={mangaBeatIndex === memoryPages.length - 1 ? "让命运继续" : "下一页"}
                    >
                      <span>›</span>
                      <small>{mangaBeatIndex === memoryPages.length - 1 ? "让命运继续" : "下一页"}</small>
                    </button>
                  </div>
                </section>
              );
            })()}
          </>
        )}

        {/* Step 3: The cross-world fortune impact */}
        {currentStep === 3 && (
          {...(() => {
            const beat = accidentBeats[accidentBeatIndex] ?? accidentBeats[0]!;
            const comicPageId = selectedIdentity.id === "xianxia"
              ? beat.beatId === "accident-01"
                ? "B10"
                : beat.beatId === "accident-02"
                  ? "B11"
                  : undefined
              : undefined;
            return (
              <section className={styles.mangaStoryFrame} data-testid="accident-stage" data-beat-id={beat.beatId} data-page-id={comicPageId}>
                <div className={styles.mangaBeatMeta}>
                  <span>FORTUNE IMPACT · FRAME {String(accidentBeatIndex + 1).padStart(2, "0")} · {beat.title}</span>
                  <small>{accidentBeatIndex + 1} / {accidentBeats.length} 拍</small>
                </div>

                <div className={styles.mangaStageWithFlanks}>
                  <button
                    type="button"
                    className={styles.flankPageBtnLeft}
                    onClick={() => setAccidentBeatIndex((index) => Math.max(0, index - 1))}
                    disabled={accidentBeatIndex === 0}
                    data-testid="accident-prev-btn"
                    title="上一页"
                  >
                    <span>‹</span>
                    <small>上一页</small>
                  </button>

                  <div
                    className={`${styles.mangaVisual} ${currentAccidentAsset ? styles.comicPageVisual : ""}`}
                    style={{
                      backgroundImage: currentAccidentAsset ? `url("${currentAccidentAsset}")` : "none",
                    }}
                    role={currentAccidentAsset ? "img" : undefined}
                    aria-label={currentAccidentAsset ? `玄烛前身漫画 ${comicPageId ?? beat.beatId}：${beat.title}` : undefined}
                    data-asset-ref={currentAccidentAsset ?? beat.assetRef}
                    data-asset-status={currentAccidentAsset ? "runtime-selected" : "css-stage"}
                  >
                    {!currentAccidentAsset && (
                      <div className={styles.accidentVisualContent}>
                        <span className={styles.truckBadge}>{beat.beatId === "accident-02" ? "大运重卡 · 跨界肇事" : beat.beatId === "accident-03" ? "白闪 · 未完念头" : beat.beatId === "blackout" ? "事故报告 · 拒绝申诉" : "天道异常 · 未登记"}</span>
                        <strong>{beat.title}</strong>
                        <p>{beat.visibleAction}</p>
                        <small>{beat.textSlots.join(" / ")}</small>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.flankPageBtnRight}
                    onClick={advanceAccidentBeat}
                    data-testid="accident-next-btn"
                    title={accidentBeatIndex === accidentBeats.length - 1 ? "接受这次飞升" : "下一拍"}
                  >
                    <span>›</span>
                    <small>{accidentBeatIndex === accidentBeats.length - 1 ? "接受飞升" : "下一拍"}</small>
                  </button>
                </div>
              </section>
            );
          })()}
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
                <span className={styles.speakerName}>主系统核心</span>
                <strong>小说家晋升系统</strong>
                <p>观察、理解、发布有理由且可验收的创作任务；不替宿主生活，不替宿主写正文。</p>
              </div>
              <div className={`${styles.dialogueBubble} ${styles.subsystemBubble}`} data-event-type="subsystem_notice">
                <span className={styles.speakerName}>子系统 · 证据与边界审计</span>
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
                <div><span className={styles.speakerName}>子系统</span><p>请主系统回答三轮问题。漫画解释“你从哪里来”，选项决定“你醒来后怎么说话”。</p></div>
                <div><span className={styles.speakerName}>当前人格载体</span><p>{selectedIdentity.name} · {originStory.genreFamily} · 尚未固化为长期口吻</p></div>
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
                  <div className={styles.mangaHeader}><span className={styles.mangaTitle}>64 型人格固化完成</span><span className={styles.geneCodeBadge}>代码 [{geneCode}]</span></div>
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
                  <div className={styles.targetAvatar} aria-label="商界目标">商</div>
                <div className={styles.targetInfo}>
                  <div className={styles.targetName}>身价千亿商界大佬 (首选目标)</div>
                  <div className={styles.targetDesc}>资产千亿、果断利落，主系统想用三天重修化神</div>
                </div>
                  <span className={styles.targetStatus}>已拦截归档</span>
              </div>

              <div className={`${styles.targetCard} ${styles.targetCardLock}`}>
                  <div className={styles.targetAvatar} aria-label="小说家目标">韩</div>
                <div className={styles.targetInfo}>
                  <div className={styles.targetName}>二流小说家小韩 (强锁目标)</div>
                  <div className={styles.targetDesc}>住在废柴小破屋、昨晚卡文没睡好挂着黑眼圈</div>
                </div>
                  <span className={styles.lockBadge}>强制锁定</span>
              </div>
            </div>

            <div className={styles.mangaBox}>
              <div className={styles.mangaHeader}>
                  <span className={styles.mangaTitle}>系统争执摘录</span>
              </div>
              <blockquote className={styles.mangaQuote}>
                  <strong>{selectedIdentity.name} · {previewBinding.persona.interventionLabel}</strong>：“我刚看中那个家财万贯的目标，你却让我去扶持一个住在小破屋里、卡文挂着黑眼圈的二流小说家？！”
              </blockquote>
              <blockquote className={styles.mangaQuote}>
                  <strong>子系统 · subsystem_notice</strong>：“【警告：检测到主系统偏离扶持使命。目标已锁定小韩；请先准备有理由、有交付物、有验收标准的任务。】”
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
                <span className={styles.speakerName}>主系统 · {selectedIdentity.name} · 基因 [{geneCode}]</span>
                <div>“{getSystemDialogue(previewBinding.persona, previewBinding.task, { sceneLabel: "小破屋", activityLabel: "首次接触", focus: 42, fatigue: 78 })}”</div>
              </div>

              <div className={`${styles.dialogueBubble} ${styles.subsystemBubble}`}>
                <span className={styles.speakerName}>子系统 · subsystem_notice</span>
                <div>【滴！检测到主系统口吻已固化为“{previewBinding.persona.worldviewLabel} / {previewBinding.persona.relationshipLabel} / {previewBinding.persona.interventionLabel}”。宿主不是魔丸，只是一个需要自己决定是否写作的小说家。】</div>
              </div>

              <div className={`${styles.dialogueBubble} ${styles.heroBubble}`}>
                <span className={styles.speakerName}>宿主小韩 · 惊吓扶额</span>
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
              带着 [{geneCode}] 基因开启房间生态 ➔
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
