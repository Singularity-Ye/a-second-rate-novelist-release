"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { PROLOGUE_BACKGROUND_ASSET } from "./prologue-assets";
import {
  APPROACH_OPTIONS,
  HOST_OPTIONS,
  PROLOGUE_SCRIPTS,
  REACTION_OPTIONS,
  SYSTEM_NAME,
  type Approach,
  type Host,
  type MemoryPanel,
  type MemoryPhase,
  type PrologueIdentity,
  type Reaction,
} from "./prologue-script";
import styles from "./prologue-view.module.css";

type Stage =
  | "identity"
  | MemoryPhase
  | "accident"
  | "awakening"
  | "reaction"
  | "host"
  | "approach"
  | "bound";

const identityOptions: Array<{ id: PrologueIdentity; label: string; descriptor: string }> = [
  { id: "student", label: PROLOGUE_SCRIPTS.student.label, descriptor: PROLOGUE_SCRIPTS.student.descriptor },
  { id: "office", label: PROLOGUE_SCRIPTS.office.label, descriptor: PROLOGUE_SCRIPTS.office.descriptor },
  { id: "court", label: PROLOGUE_SCRIPTS.court.label, descriptor: PROLOGUE_SCRIPTS.court.descriptor },
  { id: "cultivator", label: PROLOGUE_SCRIPTS.cultivator.label, descriptor: PROLOGUE_SCRIPTS.cultivator.descriptor },
];

function progressFor(stage: Stage) {
  return {
    identity: 8,
    "memory-one": 20,
    "memory-two": 32,
    "memory-climax": 45,
    accident: 62,
    awakening: 72,
    reaction: 79,
    host: 87,
    approach: 94,
    bound: 100,
  }[stage];
}

function stageLabel(stage: Stage) {
  if (stage === "identity") return "转生前身份";
  if (stage.startsWith("memory")) return "人生回放";
  if (stage === "accident") return "异界大运事故";
  if (stage === "awakening") return "黑屏之后";
  if (stage === "reaction") return "身份接收";
  if (stage === "host") return "宿主检索";
  if (stage === "approach") return "系统接近";
  return "控制权移交";
}

function chapterLabel(stage: Stage) {
  return {
    identity: "一",
    "memory-one": "二",
    "memory-two": "三",
    "memory-climax": "四",
    accident: "五",
    awakening: "六",
    reaction: "七",
    host: "八",
    approach: "九",
    bound: "十",
  }[stage];
}

function memoryFor(identity: PrologueIdentity | null, stage: Stage): MemoryPanel | null {
  if (!identity || !stage.startsWith("memory")) return null;
  return PROLOGUE_SCRIPTS[identity].memories[stage as MemoryPhase];
}

export function PrologueView() {
  const [stage, setStage] = useState<Stage>("identity");
  const [identity, setIdentity] = useState<PrologueIdentity | null>(null);
  const [accidentBeat, setAccidentBeat] = useState(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [host, setHost] = useState<Host | null>(null);
  const [approach, setApproach] = useState<Approach | null>(null);

  const script = identity ? PROLOGUE_SCRIPTS[identity] : null;
  const selectedHost = useMemo(() => HOST_OPTIONS.find((option) => option.id === host) ?? null, [host]);
  const memoryPanel = memoryFor(identity, stage);

  function reset() {
    setStage("identity");
    setIdentity(null);
    setAccidentBeat(0);
    setReaction(null);
    setHost(null);
    setApproach(null);
  }

  function chooseIdentity(next: PrologueIdentity) {
    setIdentity(next);
    setAccidentBeat(0);
    setStage("memory-one");
  }

  function continueMemory() {
    if (stage === "memory-one") setStage("memory-two");
    else if (stage === "memory-two") setStage("memory-climax");
    else if (stage === "memory-climax") setStage("accident");
  }

  function continueAccident() {
    if (accidentBeat < 2) setAccidentBeat((beat) => beat + 1);
    else setStage("awakening");
  }

  function chooseReaction(next: Reaction) {
    setReaction(next);
    setStage("host");
  }

  function chooseHost(next: Host) {
    setHost(next);
    setStage("approach");
  }

  function chooseApproach(next: Approach) {
    setApproach(next);
    setStage("bound");
  }

  const currentIdentity = identity ? identityOptions.find((item) => item.id === identity) : null;
  const currentReaction = reaction ? REACTION_OPTIONS.find((item) => item.id === reaction) : null;
  const accidentText = script?.accident;
  const stageStatus = "preset";

  return (
    <main className={styles.scene} data-stage={stage} data-provider={stageStatus}>
      <div className={styles.background} data-asset-id={PROLOGUE_BACKGROUND_ASSET.id} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.topbar}>
        <div>
          <Link className={styles.backLink} href="/vnext">← 返回小说家房间</Link>
          <p className={styles.kicker}>AL-OPEN-001 · PRESET STORYBOARD</p>
          <h1>系统转生篇</h1>
        </div>
        <div className={styles.topStatus}>
          <span className={styles.statusDot} />
          <span>转生引导内核</span>
          <small>固定素材 · 选项分支 · 不调用模型</small>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={`${styles.panel} ${styles.logPanel}`}>
          <div className={styles.panelLabel}>转生记录 / 00</div>
          <div className={styles.logLine}>事故：{stage === "identity" ? "待确认" : "异界大运跨界碰撞"}</div>
          <div className={styles.logLine}>原身份：{currentIdentity?.label ?? "待选择"}</div>
          <div className={styles.logLine}>新身份：{["identity", "memory-one", "memory-two", "memory-climax", "accident"].includes(stage) ? "待接收" : SYSTEM_NAME}</div>
          <div className={styles.logLine}>宿主：{stage === "host" || stage === "approach" || stage === "bound" ? selectedHost?.title ?? "搜索中" : "尚未搜索"}</div>
          <div className={styles.logRule} />
          <div className={styles.panelLabel}>生态路由</div>
          <div className={styles.routeRow}><span>首集人生回放</span><b>本地预设</b></div>
          <div className={styles.routeRow}><span>用户分支</span><b>即时响应</b></div>
          <div className={styles.routeRow}><span>绑定后创作</span><b>模型按需</b></div>
          <p className={styles.panelNote}>开篇不等待模型。只有绑定小说家之后，写作任务与低频生活判定才进入模型链路。</p>
        </aside>

        <section className={styles.storyArea} aria-live="polite">
          <div className={styles.locationTag}>未知界域 · 转生缓冲区</div>
          <div className={styles.storyCard} data-identity={identity ?? "unknown"} data-beat={accidentBeat}>
            <div className={styles.cardTopline}><span>{stageLabel(stage)}</span><span>第 {chapterLabel(stage)} 幕</span></div>

            {stage === "identity" && (
              <>
                <p className={styles.sceneText}>你只记得自己被异界大运创飞了。至于创飞之前，你是谁？</p>
                <div className={styles.systemLog}>
                  <strong>【身份选择等待中】</strong>
                  <span>先选一段属于你的前史。</span>
                  <span>命运高潮尚未播放，异界大运暂不予公开。</span>
                </div>
                <div className={styles.choiceGrid}>
                  {identityOptions.map((option, index) => (
                    <button className={styles.choice} key={option.id} onClick={() => chooseIdentity(option.id)}>
                      <span className={styles.choiceIndex}>{String.fromCharCode(65 + index)}</span>
                      <span><b>{option.label}</b><small>{option.descriptor}</small></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {memoryPanel && script && (
              <>
                <div className={styles.comicHeader}>
                  <span>{memoryPanel.eyebrow}</span>
                  <span>{currentIdentity?.label} · 记忆分格</span>
                </div>
                <div className={`${styles.comicPanel} ${styles[`comic-${memoryPanel.visual}`]}`}>
                  <div className={styles.comicPanelGlow} aria-hidden="true" />
                  <div className={styles.comicPanelStamp}>ASSET SLOT · {memoryPanel.id}</div>
                  <div className={styles.comicPanelCopy}>
                    <strong>{memoryPanel.title}</strong>
                    <p>{memoryPanel.text}</p>
                  </div>
                </div>
                <div className={styles.comicCaption}>同一舞台，分格揭示。图像资产可替换，故事状态与选项不变。</div>
                <button className={styles.primaryButton} onClick={continueMemory}>
                  {stage === "memory-climax" ? "进入命运事故" : "揭示下一格"}
                </button>
              </>
            )}

            {stage === "accident" && accidentText && (
              <>
                <div className={styles.accidentStage} data-beat={accidentBeat}>
                  <div className={styles.accidentFlash} aria-hidden="true" />
                  <div className={styles.accidentImageSlot}>
                    <span>{accidentBeat === 0 ? "裂缝图" : accidentBeat === 1 ? "大运撞击图" : "雷劫失败图"}</span>
                    <small>可复用视觉资产槽位</small>
                  </div>
                  <div className={styles.accidentCopy}>
                    <strong>{accidentBeat === 0 ? "越界" : accidentBeat === 1 ? "精准创飞" : "道途改写"}</strong>
                    <p>{accidentBeat === 0 ? accidentText.fracture : accidentBeat === 1 ? accidentText.impact : accidentText.aftershock}</p>
                  </div>
                </div>
                <div className={styles.comicCaption}>事故分成三个可控节拍：裂缝出现 → 大运撞击 → 黑屏前余波。</div>
                <button className={styles.primaryButton} onClick={continueAccident}>
                  {accidentBeat < 2 ? "继续" : "画面熄灭"}
                </button>
              </>
            )}

            {stage === "awakening" && (
              <>
                <div className={styles.awakeningStage}>
                  <div className={styles.awakeningEye} aria-hidden="true"><span /></div>
                  <div className={styles.awakeningCopy}>
                    <span>……视线缓缓打开。</span>
                    <strong>【转生完成】</strong>
                    <p>没有身体，没有手脚，只有意识还完整地留着。</p>
                    <p>等等。为什么你的意识旁边，还有一个更像系统的东西？</p>
                  </div>
                </div>
                <button className={styles.primaryButton} onClick={() => setStage("reaction")}>启动转生内核</button>
              </>
            )}

            {stage === "reaction" && (
              <>
                <div className={styles.systemLog}>
                  <strong>【转生引导内核】</strong>
                  <span>检测到新生系统。当前长期人格模块尚未命名。</span>
                  <span>建议名称：{SYSTEM_NAME}。</span>
                  <span>是否接受这份工作？拒绝按钮正在加载，预计下辈子可用。</span>
                </div>
                <p className={styles.prompt}>你决定如何接收这个新身份？</p>
                <div className={styles.choiceGrid}>
                  {REACTION_OPTIONS.map((option, index) => (
                    <button className={styles.choice} key={option.id} onClick={() => chooseReaction(option.id)}>
                      <span className={styles.choiceIndex}>{String.fromCharCode(65 + index)}</span>
                      <span><b>{option.label}</b><small>{option.text}</small></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {stage === "host" && (
              <>
                <div className={styles.systemLog}>
                  <strong>【宿主搜索模块已开启】</strong>
                  <span>请不要寻找最完美的人。</span>
                  <span>寻找那个还剩一点点火星的人。</span>
                </div>
                <div className={styles.choiceGrid}>
                  {HOST_OPTIONS.map((option, index) => (
                    <button className={styles.choice} key={option.id} onClick={() => chooseHost(option.id)}>
                      <span className={styles.choiceIndex}>{index + 1}</span>
                      <span><b>{option.title}</b><small>{option.text}</small></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {stage === "approach" && selectedHost && (
              <>
                <div className={styles.eventQuote}>{selectedHost.signal}</div>
                <p className={styles.prompt}>系统人格准备以什么方式接近宿主？</p>
                <div className={styles.choiceGrid}>
                  {APPROACH_OPTIONS.map((option, index) => (
                    <button className={styles.choice} key={option.id} onClick={() => chooseApproach(option.id)}>
                      <span className={styles.choiceIndex}>{String.fromCharCode(65 + index)}</span>
                      <span><b>{option.label}</b><small>{option.descriptor}</small></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {stage === "bound" && selectedHost && script && (
              <>
                <div className={styles.boundBadge}>控制权已移交 · {SYSTEM_NAME}上线</div>
                <div className={styles.systemLog}>
                  <strong>【首集预设回放完成】</strong>
                  <span>三格人生记忆、异界大运事故和转生反应均来自本地素材。</span>
                  <span>模型将在小说家进入书房、真正开始写作时按需调用。</span>
                </div>
                <div className={styles.dialogue}>
                  <p><b>系统：</b>{approach === "support" ? "先不用证明你能成功。我只问一件事：你愿不愿意把这一句写完？" : approach === "editor" ? "我看到了你的开头。问题不是你不会写，是你在第一段里解释了三百年的历史。" : "检测到宿主凌晨三点仍在修改第一句话。要么天才正在诞生，要么第一句话确实不太行。"}</p>
                  <p><b>小说家：</b>{approach === "support" ? "写完又能怎么样？" : "你到底是哪边的？"}</p>
                  <p><b>系统：</b>{approach === "support" ? "暂时不能怎么样。但今天，我们先不让它停在这里。" : "目前属于还没拿到工资、但已经决定管你的那边。"}</p>
                </div>
                <div className={styles.taskCard}>
                  <div><span className={styles.panelLabel}>新手任务 / 001</span><h2>{host === "draft" ? "找回那个删不干净的角色" : host === "fee" ? "写出三百字，证明稿费还没决定你的命运" : "给十年前的角色补完一句话"}</h2></div>
                  <p>输出：一段可读正文。验收：用户明确接受后，才计入作品里程碑。</p>
                </div>
                <div className={styles.finalActions}>
                  <button className={styles.primaryButton} onClick={reset}>再跑一遍</button>
                  <span>{currentReaction?.label} · 固定开篇已完成 · 任务已生成 · 正史未写入</span>
                </div>
              </>
            )}
          </div>
        </section>

        <aside className={`${styles.panel} ${styles.identityPanel}`}>
          <div className={styles.panelLabel}>当前身份</div>
          <div className={styles.identityGlyph}>{script?.glyph ?? "？"}</div>
          <h2>{currentIdentity?.label ?? "尚未选择"}</h2>
          <p>{currentReaction?.label ?? (stage.startsWith("memory") ? "人生记忆回放中" : "等待身份选择")}</p>
          <div className={styles.panelRule} />
          <div className={styles.panelLabel}>进度</div>
          <div className={styles.progressTrack}><span style={{ width: `${progressFor(stage)}%` }} /></div>
          <small>{stage === "bound" ? "首集循环已完成" : stage.startsWith("memory") ? "分格回放中" : "等待你的选择"}</small>
        </aside>
      </div>
    </main>
  );
}
