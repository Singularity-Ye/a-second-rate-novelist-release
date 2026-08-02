"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import {
  PolaroidBarbecueArt,
  PolaroidBookstoreArt,
  PolaroidConvenienceArt,
  AuthenticPublisherSeal,
} from "./card-assets";
import styles from "./card-deck.module.css";

export interface SnapshotCard {
  id: string;
  date: string;
  location: string;
  artKey: "barbecue" | "bookstore" | "convenience";
  tier1Text: string;
  backNotes: string;
}

export const SAMPLE_SNAPSHOTS: SnapshotCard[] = [
  {
    id: "snap-01",
    date: "2026-07-26",
    location: "街角老字号烧烤摊",
    artKey: "barbecue",
    tier1Text:
      "今天和小韩去街角烧烤摊吃了羊肉串，发现老板撒孜然的手势像极了天道施法...老祖非说那是‘三昧真味炼体’，当场把摊主捧成了仙尊。",
    backNotes: "老祖朱砂评语：此羊肉串孜然味极重，入口即化，胜过神州大地的九品炼体丸！允许小韩每周吃一次！",
  },
  {
    id: "snap-02",
    date: "2026-07-25",
    location: "旧书市场废纸堆",
    artKey: "bookstore",
    tier1Text:
      "在废书堆里翻到一本三十年前的修仙奇幻老书，扉页上居然有人写着‘写书救不了自己，但能救读者’。小韩看愣了半天。",
    backNotes: "老祖朱砂评语：修仙界万千大道，唯文字能跨越生死时空。这小子若能看懂这八个字，便算真正开窍了。",
  },
  {
    id: "snap-03",
    date: "2026-07-24",
    location: "深夜 24 小时便利店",
    artKey: "convenience",
    tier1Text:
      "凌晨两点坐在便利店窗前喝关东煮。隔壁桌是个戴黑框眼镜的加夜班程序员，正一边敲代码一边偷偷抹眼泪。",
    backNotes: "小韩随笔：这一幕被我写进了第三章。其实底层打工人与卡文作者没有区别，大家都在这万家灯火里熬着。",
  },
];

interface ButterflyParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  alpha: number;
  rotation: number;
  wingPhase: number;
  wingSpeed: number;
  primaryColor: string;
  accentColor: string;
  glowColor: string;
}

interface SparkleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export function SnapshotCardDeck() {
  const [activeTab, setActiveTab] = useState<"snapshots" | "mail" | "soul">("snapshots");
  const [activeFlippedId, setActiveFlippedId] = useState<string | null>(null);

  // 3D Tilt states for hover cards
  const [tiltStyles, setTiltStyles] = useState<Record<string, { rotateX: number; rotateY: number; sheenX: number; sheenY: number }>>({});

  // Mail tab & camera shake states
  const [stampStatus, setStampStatus] = useState<"none" | "read" | "rejected">("none");
  const [isTearing, setIsTearing] = useState<boolean>(false);
  const [showBonusText, setShowBonusText] = useState<boolean>(false);
  const [spiritEnergy, setSpiritEnergy] = useState<number>(300);
  const [energyBump, setEnergyBump] = useState<boolean>(false);
  const [shaking, setShaking] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const toggleFlip = (id: string) => {
    setActiveFlippedId((prev) => (prev === id ? null : id));
  };

  // Handle 3D Tilt Parallax on Mouse Move
  const handleMouseMoveCard = (id: string, e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = -((y - centerY) / centerY) * 12;
    const rotateY = ((x - centerX) / centerX) * 12;

    const sheenX = (x / rect.width) * 100;
    const sheenY = (y / rect.height) * 100;

    setTiltStyles((prev) => ({
      ...prev,
      [id]: { rotateX, rotateY, sheenX, sheenY },
    }));
  };

  const handleMouseLeaveCard = (id: string) => {
    setTiltStyles((prev) => ({
      ...prev,
      [id]: { rotateX: 0, rotateY: 0, sheenX: 50, sheenY: 50 },
    }));
  };

  const cycleStamp = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 300);
    setStampStatus((prev) => (prev === "none" ? "read" : prev === "read" ? "rejected" : "none"));
  };

  // Masterpiece Canvas Butterfly & Sparkle Trail Renderer
  const spawnButterflyParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = canvas.parentElement?.clientWidth || 600;
      canvas.height = 420;

      const butterflies: ButterflyParticle[] = [];
      const sparkles: SparkleParticle[] = [];

      const palettes = [
        { primary: "#f59e0b", accent: "#fbbf24", glow: "#fef08a" }, // Gold
        { primary: "#a855f7", accent: "#c084fc", glow: "#f3e8ff" }, // Purple
        { primary: "#38bdf8", accent: "#7dd3fc", glow: "#e0f2fe" }, // Cyan
        { primary: "#ec4899", accent: "#f472b6", glow: "#fce7f3" }, // Pink
      ];

      for (let i = 0; i < 18; i++) {
        const pal = palettes[i % palettes.length]!;
        butterflies.push({
          x: canvas.width * 0.5 + (Math.random() - 0.5) * 180,
          y: canvas.height * 0.75 + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 3.5,
          vy: -2.5 - Math.random() * 3,
          scale: 0.7 + Math.random() * 0.5,
          alpha: 1,
          rotation: (Math.random() - 0.5) * 0.4,
          wingPhase: Math.random() * Math.PI * 2,
          wingSpeed: 0.18 + Math.random() * 0.12,
          primaryColor: pal.primary,
          accentColor: pal.accent,
          glowColor: pal.glow,
        });
      }

      let animationFrameId: number;

      const drawWing = (side: 1 | -1, fold: number, primary: string, accent: string) => {
        ctx.save();
        ctx.scale(side * fold, 1);

        // Forewing (前翅)
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.bezierCurveTo(15, -22, 28, -18, 25, 2);
        ctx.bezierCurveTo(20, 10, 8, 8, 0, 0);
        ctx.fillStyle = primary;
        ctx.fill();

        // Forewing Inner Glow & Vein
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.bezierCurveTo(10, -14, 18, -10, 14, 0);
        ctx.fillStyle = accent;
        ctx.fill();

        // Hindwing (后翅)
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.bezierCurveTo(16, 8, 18, 22, 10, 24);
        ctx.bezierCurveTo(2, 24, 0, 14, 0, 2);
        ctx.fillStyle = primary;
        ctx.fill();

        // Swallowtail (后翅尾突)
        ctx.beginPath();
        ctx.moveTo(10, 24);
        ctx.lineTo(14, 30);
        ctx.lineTo(8, 26);
        ctx.fillStyle = accent;
        ctx.fill();

        ctx.restore();
      };

      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update & Render Sparkles Trail
        for (let i = sparkles.length - 1; i >= 0; i--) {
          const s = sparkles[i]!;
          s.x += s.vx;
          s.y += s.vy;
          s.alpha -= 0.025;

          if (s.alpha <= 0) {
            sparkles.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.globalAlpha = Math.max(0, s.alpha);
          ctx.fillStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        let alive = false;
        butterflies.forEach((b) => {
          if (b.alpha <= 0) return;
          alive = true;

          b.x += b.vx + Math.sin(b.wingPhase) * 1.2;
          b.y += b.vy;
          b.alpha -= 0.012;
          b.wingPhase += b.wingSpeed;

          // Spawn sparkle dust trail
          if (Math.random() < 0.4) {
            sparkles.push({
              x: b.x + (Math.random() - 0.5) * 10,
              y: b.y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 0.8,
              vy: Math.random() * 0.8,
              size: 1 + Math.random() * 2,
              alpha: 0.9,
              color: b.glowColor,
            });
          }

          const fold = Math.abs(Math.sin(b.wingPhase));

          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(b.scale, b.scale);
          ctx.rotate(b.rotation);
          ctx.globalAlpha = Math.max(0, b.alpha);

          // Glow shadow
          ctx.shadowColor = b.glowColor;
          ctx.shadowBlur = 15;

          // Left and Right Wings
          drawWing(1, fold, b.primaryColor, b.accentColor);
          drawWing(-1, fold, b.primaryColor, b.accentColor);

          // Body & Head (蝶身与触角)
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.ellipse(0, 2, 2, 9, 0, 0, Math.PI * 2);
          ctx.fill();

          // Antennae (触角)
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-1, -6);
          ctx.quadraticCurveTo(-5, -14, -8, -15);
          ctx.moveTo(1, -6);
          ctx.quadraticCurveTo(5, -14, 8, -15);
          ctx.stroke();

          ctx.restore();
        });

        if (alive || sparkles.length > 0) {
          animationFrameId = requestAnimationFrame(render);
        }
      };

      render();
    } catch {
      // Ignore JSDOM missing context
    }
  };

  const handleShred = () => {
    if (isTearing) return;
    setIsTearing(true);
    setShowBonusText(true);
    setShaking(true);
    setTimeout(() => setShaking(false), 300);

    spawnButterflyParticles();

    setTimeout(() => {
      setSpiritEnergy((prev) => prev + 50);
      setEnergyBump(true);
      setTimeout(() => setEnergyBump(false), 300);
    }, 600);

    setTimeout(() => {
      setIsTearing(false);
      setShowBonusText(false);
    }, 1800);
  };

  return (
    <div className={`${styles.container} ${shaking ? styles.screenShake : ""}`}>
      <div className={styles.topBar}>
        <Link href="/room/motion-demo" className={styles.backBtn}>
          ← 返回房间
        </Link>

        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === "snapshots" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("snapshots")}
            data-testid="tab-snapshots"
          >
            📸 3D 视差明信片
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "mail" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("mail")}
            data-testid="tab-mail"
          >
            ✉️ 退稿信与物理撕纸
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "soul" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("soul")}
            data-testid="tab-soul"
          >
            👑 64 树老祖灵符
          </button>
        </div>
      </div>

      <div className={styles.contentWrapper}>
        {/* Tab 1: 3D Parallax Snapshots */}
        {activeTab === "snapshots" && (
          <div className={styles.snapshotGrid}>
            {SAMPLE_SNAPSHOTS.map((item) => {
              const tilt = tiltStyles[item.id] || { rotateX: 0, rotateY: 0, sheenX: 50, sheenY: 50 };
              const cardTransform = `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${
                tilt.rotateX || tilt.rotateY ? 1.04 : 1
              })`;

              return (
                <div key={item.id} className={styles.polaroidWrapper}>
                  <div
                    className={styles.polaroidCard}
                    style={{ transform: cardTransform }}
                    onMouseMove={(e) => handleMouseMoveCard(item.id, e)}
                    onMouseLeave={() => handleMouseLeaveCard(item.id)}
                    onClick={() => toggleFlip(item.id)}
                    data-testid={`snapshot-card-${item.id}`}
                  >
                    {/* Photo Corners Clips */}
                    <div className={styles.cornerTopLeft} />
                    <div className={styles.cornerTopRight} />

                    {/* Sheen Highlight Tracking Mouse */}
                    <div
                      className={styles.sheenOverlay}
                      style={{
                        background: `radial-gradient(circle at ${tilt.sheenX}% ${tilt.sheenY}%, rgba(255, 255, 255, 0.25) 0%, transparent 60%)`,
                      }}
                    />

                    <div className={styles.polaroidPhoto}>
                      {item.artKey === "barbecue" && <PolaroidBarbecueArt />}
                      {item.artKey === "bookstore" && <PolaroidBookstoreArt />}
                      {item.artKey === "convenience" && <PolaroidConvenienceArt />}
                      <span className={styles.photoTag}>📍 {item.location}</span>
                    </div>

                    <div className={styles.tier1Badge}>✨ Tier 1 必选灵感断章 · {item.date}</div>

                    <p className={styles.polaroidCaption}>
                      {activeFlippedId === item.id ? (
                        <span style={{ color: "#7c3aed", fontWeight: "bold" }}>💌 背面朱砂评语：“{item.backNotes}”</span>
                      ) : (
                        item.tier1Text
                      )}
                    </p>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "right" }}>
                      {activeFlippedId === item.id ? "(点击翻回正面)" : "(3D 光标视差 · 点击看背面字迹 ↩️)"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Mail & Camera Shake Tearing Shredder */}
        {activeTab === "mail" && (
          <div className={styles.mailStage}>
            {/* Top Energy Counter Bar */}
            <div className={styles.energyHeader}>
              <div className={styles.energyLabel}>
                <span>写作工作台灵气：</span>
                <span className={`${styles.energyValue} ${energyBump ? styles.energyValueBump : ""}`}>
                  {spiritEnergy} ✨
                </span>
              </div>
              {showBonusText && (
                <span className={styles.energyBonusText} data-testid="bonus-text">
                  🦋✨ 废稿破碎 · 变化为金羽纸蝶！灵气 +50！
                </span>
              )}
            </div>

            {/* Canvas Particle Overlay for Butterfly Wings */}
            <canvas ref={canvasRef} className={styles.particleCanvas} />

            {/* Envelope & Shredder Visuals */}
            <div className={styles.envelopeWrapper}>
              {!isTearing ? (
                <div className={styles.envelopeIntact}>
                  {/* Coffee Stain Layer */}
                  <div className={styles.coffeeStain} />

                  <div className={styles.envelopeHeader}>
                    <div className={styles.publisherTitle}>
                      <span>📰 第一文坛出版社 · 退稿通知件</span>
                    </div>
                    <div className={styles.airmailStamp}>AIR MAIL · 航空邮戳</div>
                  </div>

                  <div className={styles.letterBody}>
                    <p style={{ margin: 0, fontWeight: 700, color: "#991b1b" }}>致 二流小说家小韩：</p>
                    <p style={{ margin: "0.5rem 0 0 0" }}>
                      “您提交的最新章节《闭关三千载被大运撞飞》已被审阅。编辑部一致认为：前三章伏笔太慢，男主不够霸气！建议重新修改！”
                    </p>

                    {stampStatus !== "none" && (
                      <div style={{ position: "absolute", bottom: "0.5rem", right: "1rem" }}>
                        <AuthenticPublisherSeal status={stampStatus} />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.envelopeSplitting}>
                  <div className={styles.pieceLeft}>
                    📰 第一文坛出版社 · 退稿件
                    <br />
                    致 小韩... 伏笔太慢...
                  </div>
                  <div className={styles.pieceRight}>
                    AIR MAIL 航空邮戳
                    <br />
                    男主不够霸气！重新修改！
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className={styles.actionRow}>
              <button className={styles.stampBtn} onClick={cycleStamp} data-testid="stamp-btn">
                🏷️ 盖物理朱砂印章 ({stampStatus === "none" ? "未盖章" : stampStatus === "read" ? "已阅" : "退稿"})
              </button>
              <button
                className={styles.shredBtn}
                onClick={handleShred}
                disabled={isTearing}
                data-testid="shred-btn"
              >
                🖐️ 系统大手物理撕纸化蝶 🦋✨
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: System Soul Codex */}
        {activeTab === "soul" && (
          <div className={styles.soulCard}>
            <div className={styles.soulHeader}>
              <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#f8fafc" }}>
                ⚡ 修仙老祖 · 主系统灵魂姿态
              </h2>
              <span className={styles.geneBadge}>代码 [BBB]</span>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "#94a3b8" }}>
              当前激活性格基因：<strong>[质问来路 · 智谋护短 · 灵感飞花]</strong>
            </p>

            <div className={styles.quoteList}>
              <div className={styles.quoteItem}>
                1. <strong>开篇质问子系统</strong>：“老夫重生成为主系统...那你这自称子系统的物件又系何方神圣？！老夫被大运重卡撞飞是否尔等幕后操控？！”
              </div>
              <div className={styles.quoteItem}>
                2. <strong>智谋护短连贯</strong>：“强锁二流小说家？老夫明白了...尔等是想借老夫之手，将这小子培养成改写天道秩序的棋子！”
              </div>
              <div className={styles.quoteItem}>
                3. <strong>灵感飞花终局</strong>：“既然这小子是破局关键，本座便倾力相助！万千纸蝶飞舞，将天机融入你的章节！”
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
