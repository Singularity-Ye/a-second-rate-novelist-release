"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef } from "react";
import styles from "./motion-demo-room.module.css";

export type MotionMode = "seated" | "standing";
export type RoomZoneKey = "writing" | "eating" | "sleeping" | "away";
export type WobbleIntensity = "light" | "normal" | "heavy";
export type MoveSpeed = "fast" | "normal" | "slow";
export type FacingDirection = "right" | "left";

interface ZoneConfig {
  key: RoomZoneKey;
  label: string;
  pinLabel: string;
  note: string;
  pos: { left: number; top: number };
  perspectiveScale: number;
  prop?: { icon: string; name: string; steam?: boolean };
}

const zoneProps: Record<"eating" | "away", NonNullable<ZoneConfig["prop"]>> = {
  eating: { icon: "🍵", name: "热茶木碗", steam: true },
  away: { icon: "📋", name: "采风便签" },
};

// Motion Demo is an independent Antigravity experiment. Its local test points
// intentionally stay here so ecology changes cannot mutate the live playground.
const ZONES: Record<RoomZoneKey, ZoneConfig> = {
  writing: {
    key: "writing",
    label: "涔︽ 路 鍐欎綔",
    pinLabel: "鉁嶏笍 涔︽鍓?",
    note: "灏忚瀹剁珯鍦ㄤ功妗屽墠鐨勬湪鍦版澘涓娿?",
    pos: { left: 42.5, top: 79.5 },
    perspectiveScale: 1,
  },
  eating: {
    key: "eating",
    label: "楗 路 琛ュ厖鐢熸椿",
    pinLabel: "馃嵉 楗鍓?",
    note: "绔欏湪楗鑽夊腑鍦版涓嬭竟缂樻湪鍦版澘涓娿?",
    pos: { left: 62, top: 88.5 },
    perspectiveScale: 1.14,
    prop: zoneProps.eating,
  },
  sleeping: {
    key: "sleeping",
    label: "搴婇摵 路 浼戞伅鏃舵",
    pinLabel: "鈽?搴婇摵杈?",
    note: "绉绘鍒板皬搴婂墠绾㈠湴姣腑澶?",
    pos: { left: 19.5, top: 80.5 },
    perspectiveScale: 1.02,
  },
  away: {
    key: "away",
    label: "闂ㄥ彛 路 鍑嗗澶栧嚭",
    pinLabel: "馃毆 鎴块棬鍙?",
    note: "韪╁湪澶ч棬涓嬫柟妫曡壊鑴氳笍鍨湴姣笂銆?",
    pos: { left: 86.5, top: 72 },
    perspectiveScale: 0.88,
    prop: zoneProps.away,
  },
};

const SPEED_MS: Record<MoveSpeed, number> = {
  fast: 700,
  normal: 1200,
  slow: 2000,
};

const SYSTEM_FORCE_SPOKEN = [
  { sys: "⚡「系统警告：检测到严重摆烂，开启强制写作程序！」", hero: "😱“系统大哥放开我！我这就写还不行吗！”" },
  { sys: "⚡「系统判定：发呆/摸鱼超时！强制拎回书桌椅！」", hero: "💦“等等！我这杯茶还没喝完啊！！”" },
  { sys: "⚡「金手指干预：触发宿主救星特权，抓回桌前打稿！」", hero: "⚡“呜哇！不要直接把我扔回椅子上啊！”" },
];

const AUTONOMOUS_RHYTHM_STEPS: Array<{ zone: RoomZoneKey; mood: string; duration: number }> = [
  { zone: "eating", mood: "🍵 “红豆汤温度刚刚好...先喝两口。”", duration: 5500 },
  { zone: "away", mood: "🌙 “看看夜景找找小说灵感。”", duration: 6000 },
  { zone: "sleeping", mood: "💤 “卡文卡得头疼...躺会会儿。”", duration: 5000 },
  { zone: "writing", mood: "✍️ “灵感上来了！写个两千字！”", duration: 7000 },
];

export function MotionDemoRoom() {
  const [mode, setMode] = useState<MotionMode>("seated");
  const [currentZone, setCurrentZone] = useState<RoomZoneKey>("writing");
  const [actorPos, setActorPos] = useState(ZONES.writing.pos);
  const [actorScale, setActorScale] = useState(ZONES.writing.perspectiveScale);
  const [facing, setFacing] = useState<FacingDirection>("right");
  const [isFlipping, setIsFlipping] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // 1. 小说家自主生活情调状态机 (Autonomous Life Rhythm Engine)
  const [autoRhythm, setAutoRhythm] = useState(false);
  const [idleMood, setIdleMood] = useState<string | null>(null);

  // 2. 提案 5: 视错觉窗景视差偏移 (Parallax Shift)
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });

  // 3. 提案 4: 写作稿纸飞花粒子 (Floating Manuscript Particles)
  const [showManuscriptParticles, setShowManuscriptParticles] = useState(false);

  // 系统大手捏起与撕纸气泡
  const [isPickedUp, setIsPickedUp] = useState(false);
  const [systemBubble, setSystemBubble] = useState<{ sys: string; hero: string } | null>(null);

  // 杂项控制
  const [wobbleIntensity, setWobbleIntensity] = useState<WobbleIntensity>("normal");
  const [moveSpeed, setMoveSpeed] = useState<MoveSpeed>("normal");
  const [showOverlay, setShowOverlay] = useState(false);

  // 日志记录
  const [logs, setLogs] = useState<Array<{ id: number; text: string; time: string }>>([
    {
      id: 1,
      text: "初始化完成：全套 6 大动画提案与【小说家自主生活情调状态机】全部解禁！",
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    },
  ]);

  const moveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stopWobbleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const godHandTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rhythmStepRef = useRef<number>(0);

  const addLog = (text: string) => {
    setLogs((prev) => [
      {
        id: Date.now() + Math.random(),
        text,
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      },
      ...prev.slice(0, 9),
    ]);
  };

  useEffect(() => {
    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      if (stopWobbleTimerRef.current) clearTimeout(stopWobbleTimerRef.current);
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
      if (godHandTimerRef.current) clearTimeout(godHandTimerRef.current);
    };
  }, []);

  // 自主生活情调 Timer 调度
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (autoRhythm && !isPickedUp && !isMoving) {
      const currentStep = AUTONOMOUS_RHYTHM_STEPS[rhythmStepRef.current % AUTONOMOUS_RHYTHM_STEPS.length]!;
      timer = setTimeout(() => {
        setIdleMood(currentStep.mood);
        triggerMoveTo(currentStep.zone, () => {
          if (currentStep.zone === "writing") {
            setMode("seated");
            triggerManuscriptParticles();
          }
        });
        rhythmStepRef.current += 1;
      }, currentStep.duration);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [autoRhythm, isPickedUp, isMoving, currentZone]);

  // 触发稿纸飞花粒子
  const triggerManuscriptParticles = () => {
    setShowManuscriptParticles(true);
    setTimeout(() => setShowManuscriptParticles(false), 1700);
  };

  // 捕获鼠标视错觉窗景视差
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width - 0.5;
    const yRatio = (e.clientY - rect.top) / rect.height - 0.5;
    setParallaxOffset({
      x: Math.round(xRatio * 14),
      y: Math.round(yRatio * 10),
    });
  };

  // 切换到坐姿写作
  const handleSitDown = () => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    if (stopWobbleTimerRef.current) clearTimeout(stopWobbleTimerRef.current);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    if (godHandTimerRef.current) clearTimeout(godHandTimerRef.current);

    if (currentZone !== "writing") {
      addLog("移动回书桌旁准备坐下...");
      triggerMoveTo("writing", () => {
        setMode("seated");
        triggerManuscriptParticles();
        addLog("淡出站立人偶与接地阴影，淡入带椅子背影图层：恢复坐姿写作。");
      });
    } else {
      setMode("seated");
      setIsMoving(false);
      setIsSettling(false);
      setIsPickedUp(false);
      setSystemBubble(null);
      triggerManuscriptParticles();
      addLog("直接从原位切回【坐姿写作】状态，触发稿纸飞花。");
    }
  };

  // 离座 / 站立
  const handleStandUp = () => {
    if (mode === "seated") {
      setMode("standing");
      setActorPos(ZONES.writing.pos);
      setActorScale(ZONES.writing.perspectiveScale);
      setCurrentZone("writing");
      setIdleMood("✍️ “离座伸个懒腰，去房间里转转...”");
      addLog("触发【离座过渡】：背影淡出，v2无椅子背景 + 站立人偶与接地阴影淡入。");
    }
  };

  // 核心特色：【🖐️ 系统金手指·捏起摆烂小说家强行抓回书桌】
  const handleGodHandForceWriting = () => {
    if (godHandTimerRef.current) clearTimeout(godHandTimerRef.current);

    const item = SYSTEM_FORCE_SPOKEN[Math.floor(Math.random() * SYSTEM_FORCE_SPOKEN.length)]!;
    setSystemBubble(item);
    setIdleMood(null);

    if (mode === "seated") {
      setMode("standing");
    }

    setIsPickedUp(true);
    setIsMoving(false);
    setFacing("left");
    addLog(`🖐️ 用户(系统)触发【金手指干预】：捏住脱线小说家，从(${actorPos.left}%, ${actorPos.top}%)强制抓悬回书桌！`);

    setActorPos(ZONES.writing.pos);
    setActorScale(ZONES.writing.perspectiveScale);
    setCurrentZone("writing");

    godHandTimerRef.current = setTimeout(() => {
      setIsPickedUp(false);
      setIsSettling(true);
      addLog("🖐️ 系统大手将小说家重重丢回书桌椅前：【强行开启写作模式】！");

      setTimeout(() => {
        setIsSettling(false);
        setMode("seated");
        setSystemBubble(null);
        triggerManuscriptParticles();
      }, 500);
    }, 850);
  };

  // 触发移动到特定区域
  const triggerMoveTo = (targetZone: RoomZoneKey, onComplete?: () => void) => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    if (stopWobbleTimerRef.current) clearTimeout(stopWobbleTimerRef.current);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    if (godHandTimerRef.current) clearTimeout(godHandTimerRef.current);

    setIsPickedUp(false);
    setSystemBubble(null);

    const dest = ZONES[targetZone];
    const duration = SPEED_MS[moveSpeed];

    const newFacing: FacingDirection = dest.pos.left < actorPos.left ? "left" : "right";
    const directionChanged = newFacing !== facing;

    if (directionChanged) {
      setFacing(newFacing);
      setIsFlipping(true);
      flipTimerRef.current = setTimeout(() => {
        setIsFlipping(false);
      }, 320);
    }

    if (mode === "seated") {
      setMode("standing");
      setActorPos(ZONES.writing.pos);
      setActorScale(ZONES.writing.perspectiveScale);
      addLog(`自动触发离座过渡，准备前往【${dest.label}】...`);
    }

    setCurrentZone(targetZone);
    setIsMoving(true);
    setIsSettling(false);
    setActorPos(dest.pos);
    setActorScale(dest.perspectiveScale);

    addLog(
      `启动移动: 前往【${dest.label}】(${newFacing === "left" ? "面向左" : "面向右"}), ` +
      `透视缩放: ${dest.perspectiveScale}x, 摇晃滑行 ${Math.round(duration * 0.65)}ms 后弹性沉降`
    );

    const wobbleDuration = Math.round(duration * 0.65);
    stopWobbleTimerRef.current = setTimeout(() => {
      setIsMoving(false);
      setIsSettling(true);
    }, wobbleDuration);

    moveTimerRef.current = setTimeout(() => {
      setIsSettling(false);
      addLog(`到达【${dest.label}】，近大远透视平稳就位。`);

      if (onComplete) onComplete();
    }, duration);
  };

  // 点击画框区域，自动判断最近的交互目标并移动
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode === "seated") {
      handleStandUp();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;

    let target: RoomZoneKey = "writing";
    if (clickXPercent < 32) target = "sleeping";
    else if (clickXPercent < 52) target = "writing";
    else if (clickXPercent < 76) target = "eating";
    else target = "away";

    triggerMoveTo(target);
  };

  const activeZoneConfig = ZONES[currentZone];

  return (
    <main className={styles.demoRoom} data-testid="motion-demo-room">
      {/* 顶栏 */}
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <p className={styles.eyebrow}>小说家离座与摇晃移动演示 · Motion Lab (🤖 机关墨偶 全提案打磨版)</p>
          <h1>小说家自主生活情调与 6 大交互动效 Lab</h1>
          <p>整合不倒翁摇摆、2.5D 近大远小透视、视错觉窗景视差、色温漫射、手持道具与系统金手指干预。</p>
        </div>
        <Link href="/room/novelist" className={styles.backLink}>
          ← 返回小说家房间
        </Link>
      </header>

      <div className={styles.grid}>
        {/* 核心演示画布区 */}
        <section
          className={styles.stageCard}
          aria-label="动态演示画布"
          onMouseMove={handleMouseMove}
          onClick={handleStageClick}
        >
          {/* 1. 提案 5: 基础背板（带有 mouse 视错觉窗景视差 offset） */}
          <div
            className={styles.bgLayer}
            style={{
              backgroundImage: "url(/assets/ecology/novelist-room-chairless-backplate-v2.webp)",
              "--parallax-x": `${parallaxOffset.x}px`,
              "--parallax-y": `${parallaxOffset.y}px`,
            } as React.CSSProperties}
            aria-hidden="true"
          />

          {/* 2. 写作前景层：包含原椅子 + 背影角色 */}
          <div
            className={styles.writingForegroundLayer}
            data-visible={mode === "seated"}
            style={{
              backgroundImage: "url(/assets/ecology/novelist-room-seated-back-v3-chair-layer-v2.png)",
              "--parallax-x": `${parallaxOffset.x}px`,
              "--parallax-y": `${parallaxOffset.y}px`,
            } as React.CSSProperties}
            aria-hidden="true"
          />

          {/* 提案 4: 写作稿纸飞花粒子 (Floating Manuscript Particles) */}
          {showManuscriptParticles && (
            <div className={styles.manuscriptContainer} aria-hidden="true">
              <span className={styles.paperParticle}>📄</span>
              <span className={styles.paperParticle}>📜</span>
              <span className={styles.paperParticle}>📄</span>
            </div>
          )}

          {/* 3. 站立人偶 (支持系统金手指捏起 isPickedUp & 2.5D 近大远小透视) */}
          <div
            className={styles.actorAnchor}
            data-visible={mode === "standing"}
            data-picked-up={isPickedUp}
            style={{
              left: `${actorPos.left}%`,
              top: `${actorPos.top}%`,
              "--move-duration": `${SPEED_MS[moveSpeed]}ms`,
              "--perspective-scale": actorScale,
            } as React.CSSProperties}
          >
            {/* 系统大手悬浮 Icon 提示 */}
            {isPickedUp && <span className={styles.systemGodHandCue} aria-hidden="true">🖐️</span>}

            {/* 系统强制警告与吐槽撕纸气泡 */}
            {systemBubble && (
              <div className={styles.systemForcedBubble}>
                <small>{systemBubble.sys}</small>
                <span>{systemBubble.hero}</span>
              </div>
            )}

            {/* 提案 3: 挂机自主内心独白撕纸气泡 */}
            {!systemBubble && idleMood && (
              <div className={styles.idleMoodBubble}>
                <span>{idleMood}</span>
              </div>
            )}

            {/* 紧贴底座下沿的柔和阴影 */}
            <div
              className={styles.actorShadow}
              data-moving={isMoving}
              data-picked-up={isPickedUp}
            />

            {/* 朝向与 3D 纸板翻转包裹层 */}
            <div
              className={styles.actorFlipWrapper}
              data-facing={facing}
              data-flipping={isFlipping}
            >
              {/* 提案 2: 区域环境色温漫射 & 物理摇晃包裹层 */}
              <div
                className={styles.actorWobbleWrapper}
                data-zone={currentZone}
                data-moving={isMoving}
                data-settling={isSettling}
                data-picked-up={isPickedUp}
                data-wobble-intensity={wobbleIntensity}
              >
                <img
                  className={styles.paperActorImage}
                  src="/assets/ecology/novelist-paper-doll-standing-v1.png"
                  alt="站立姿态小说家圆底人偶"
                />

                {/* 提案 6: 手持生活道具图层 (Handheld Props: 茶杯/便签) */}
                {activeZoneConfig.prop && (
                  <div className={styles.handheldPropBadge} title={activeZoneConfig.prop.name}>
                    {activeZoneConfig.prop.steam && <span className={styles.steamEffect}>♨️</span>}
                    <span>{activeZoneConfig.prop.icon}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 极简状态徽章 */}
          <div className={styles.stageStatusBadge}>
            <strong>
              {mode === "seated"
                ? "✍️ 坐姿写作中"
                : isPickedUp
                ? "🖐️ 系统大手捏起强制中!"
                : autoRhythm
                ? "🤖 自主生活情调漫步中"
                : isMoving
                ? `🚶 摇晃滑行中 (${facing === "left" ? "面向左" : "面向右"})`
                : isSettling
                ? "⚓ 沉降平稳中..."
                : "🚶 站立就位"}
            </strong>
            <p>
              {mode === "seated"
                ? "背景: v2 无椅子背板"
                : `透视: ${actorScale}x | 视差: (${parallaxOffset.x}px, ${parallaxOffset.y}px)`}
            </p>
          </div>

          {/* 仅在打开开关时显示的可选高亮标注 */}
          {(Object.keys(ZONES) as RoomZoneKey[]).map((key) => {
            const z = ZONES[key];
            const isActive = currentZone === key;
            return (
              <button
                key={key}
                className={styles.subtleHotspotPin}
                data-show-overlay={showOverlay}
                data-active={isActive}
                style={{ left: `${z.pos.left}%`, top: `${z.pos.top}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerMoveTo(key);
                }}
              >
                <span>{z.pinLabel}</span>
              </button>
            );
          })}
        </section>

        {/* 右侧交互控制面板 */}
        <aside className={styles.controlSide}>
          <section className={styles.panelCard}>
            <h2>🎮 动作控制面板</h2>
            <div className={styles.actionGrid}>
              {/* 黄金强抓按钮：系统大手抓回书桌 */}
              <button
                className={`${styles.actionBtn} ${styles.systemSpecialBtn}`}
                onClick={handleGodHandForceWriting}
              >
                <span>🖐️ 系统大手 · 强抓回书桌</span>
                <small>捏起摆烂小说家，强制开启写作！</small>
              </button>

              {/* 小说家自主生活情调开关 */}
              <button
                className={`${styles.actionBtn} ${styles.rhythmBtn}`}
                data-active={autoRhythm}
                onClick={() => {
                  const next = !autoRhythm;
                  setAutoRhythm(next);
                  addLog(next ? "🤖 开启【小说家自主生活情调】：角色将自发发呆、喝茶、看夜景与打稿。" : "⏹️ 关闭自主生活情调。");
                }}
              >
                <span>{autoRhythm ? "🤖 自主生活情调: 已开启" : "🤖 开启小说家自主生活情调"}</span>
                <small>{autoRhythm ? "小说家在自发漫步喝茶发呆..." : "让小说家按性格习惯自由决定去留"}</small>
              </button>

              <button
                className={styles.actionBtn}
                data-active={mode === "seated"}
                onClick={handleSitDown}
              >
                <span>✍️ 坐姿写作</span>
                <small>淡入带椅子写作图 + 稿纸飞花</small>
              </button>

              <button
                className={styles.actionBtn}
                data-active={mode === "standing" && currentZone === "writing" && !isMoving && !isPickedUp}
                onClick={handleStandUp}
              >
                <span>🚶 站立离座</span>
                <small>淡出椅子，显现人偶</small>
              </button>

              <button
                className={styles.actionBtn}
                data-active={currentZone === "eating" && (isMoving || isSettling)}
                onClick={() => triggerMoveTo("eating")}
              >
                <span>🍵 前往饭桌</span>
                <small>前景放大 (挂载热茶道具 🍵)</small>
              </button>

              <button
                className={styles.actionBtn}
                data-active={currentZone === "sleeping" && (isMoving || isSettling)}
                onClick={() => triggerMoveTo("sleeping")}
              >
                <span>☾ 前往床铺</span>
                <small>中景微调 (1.02x 床边)</small>
              </button>

              <button
                className={styles.actionBtn}
                data-active={currentZone === "away" && (isMoving || isSettling)}
                onClick={() => triggerMoveTo("away")}
              >
                <span>🚪 前往大门</span>
                <small>后景收窄 (挂载采风便签 📋)</small>
              </button>
            </div>

            {/* 参数调优 */}
            <div className={styles.settingGroup}>
              <div className={styles.settingRow}>
                <label htmlFor="wobble-select">摇晃强度 (底座摆动幅度):</label>
                <select
                  id="wobble-select"
                  className={styles.optionSelect}
                  value={wobbleIntensity}
                  onChange={(e) => setWobbleIntensity(e.target.value as WobbleIntensity)}
                >
                  <option value="light">轻微 (±6deg)</option>
                  <option value="normal">标准 (±10deg)</option>
                  <option value="heavy">强烈 (±15deg)</option>
                </select>
              </div>

              <div className={styles.settingRow}>
                <label htmlFor="speed-select">移动平滑度/速度:</label>
                <select
                  id="speed-select"
                  className={styles.optionSelect}
                  value={moveSpeed}
                  onChange={(e) => setMoveSpeed(e.target.value as MoveSpeed)}
                >
                  <option value="fast">快速 (0.7秒)</option>
                  <option value="normal">标准 (1.2秒)</option>
                  <option value="slow">悠闲 (2.0秒)</option>
                </select>
              </div>

              <div className={styles.settingRow}>
                <span>画框标注显隐:</span>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                  />
                  <small>{showOverlay ? "已显示辅助标注" : "已隐藏 (画质纯净)"}</small>
                </label>
              </div>
            </div>
          </section>

          {/* 状态演进日志 */}
          <section className={styles.panelCard}>
            <h2>📜 状态演进日志</h2>
            <ul className={styles.logList}>
              {logs.map((log) => (
                <li key={log.id} className={styles.logItem}>
                  <time>{log.time}</time>
                  <span>{log.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
