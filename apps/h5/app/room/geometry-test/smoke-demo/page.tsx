"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import smokeStyles from "../geometry-test.module.css";
import styles from "./smoke-demo.module.css";

const SMOKE_DURATION_MS = 1600;
const ROUTE_DURATION_MS = 5200;
const ROUTE_EVENT_PROGRESS = 0.68;
const SMOKE_SRC = "/assets/ecology/effects/transitions/white-smoke-puff-v1.webp";

type TransitionStyle = CSSProperties & {
  "--editor-transition-total"?: string;
};

function SmokeCloud({
  runKey,
  className = "",
  style: positionStyle,
}: {
  runKey: number;
  className?: string | undefined;
  style?: CSSProperties;
}) {
  const style: TransitionStyle = {
    ...positionStyle,
    "--editor-transition-total": `${SMOKE_DURATION_MS}ms`,
  };

  return (
    <div
      key={runKey}
      className={`${smokeStyles.actorSmokeVeil} ${className}`}
      style={style}
      data-demo-smoke-run={runKey}
      aria-hidden="true"
    >
      <span className={smokeStyles.actorSmokeGlow} />
      <img className={`${smokeStyles.actorSmokePuff} ${smokeStyles.actorSmokePuffMain}`} src={SMOKE_SRC} alt="" draggable={false} />
    </div>
  );
}

function routePosition(progress: number): { left: string; top: string } {
  return {
    left: `${8 + progress * 84}%`,
    top: `${72 - Math.sin(progress * Math.PI) * 38}%`,
  };
}

export default function SmokeDemoPage() {
  const [smokeRunKey, setSmokeRunKey] = useState(0);
  const [routeProgress, setRouteProgress] = useState(0);
  const [routePlaying, setRoutePlaying] = useState(false);
  const [routeSmokeVisible, setRouteSmokeVisible] = useState(false);
  const [routeSmokeKey, setRouteSmokeKey] = useState(0);
  const routeSmokeTriggeredRef = useRef(false);

  useEffect(() => {
    if (!routePlaying) return undefined;
    let frame = 0;
    let startedAt: number | null = null;

    const animate = (time: number) => {
      if (startedAt === null) startedAt = time;
      const next = Math.min(1, (time - startedAt) / ROUTE_DURATION_MS);
      setRouteProgress(next);
      if (next >= ROUTE_EVENT_PROGRESS && !routeSmokeTriggeredRef.current) {
        routeSmokeTriggeredRef.current = true;
        setRouteSmokeKey((current) => current + 1);
        setRouteSmokeVisible(true);
      }
      if (next >= 1) {
        setRoutePlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [routePlaying]);

  const startRouteDemo = () => {
    routeSmokeTriggeredRef.current = false;
    setRouteSmokeVisible(false);
    setRouteProgress(0);
    setRoutePlaying(true);
  };

  const resetRouteDemo = () => {
    routeSmokeTriggeredRef.current = false;
    setRouteSmokeVisible(false);
    setRoutePlaying(false);
    setRouteProgress(0);
  };

  const markerStyle = routePosition(routeProgress);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>TRANSITION LAB / SMOKE MOTION</p>
        <h1>白烟转场独立演示</h1>
        <p>
          左侧只播放 CSS 烟雾；右侧让路线进度在事件点触发同一套烟雾。路径只负责“何时触发”，不负责逐帧绘制烟雾。
        </p>
      </header>

      <section className={styles.demoGrid}>
        <article className={styles.demoCard}>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.cardKicker}>A / PURE CSS</span>
              <h2>纯烟雾动画</h2>
            </div>
            <span className={styles.badge}>单云团连续时间轴</span>
          </div>
          <div className={`${styles.demoCanvas} ${styles.smokeCanvas}`}>
            <SmokeCloud runKey={smokeRunKey} />
            <span className={styles.canvasCaption}>不经过路径、不更新 React 进度</span>
          </div>
          <button type="button" className={styles.primaryButton} onClick={() => setSmokeRunKey((current) => current + 1)}>
            重播纯烟雾
          </button>
        </article>

        <article className={styles.demoCard}>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.cardKicker}>B / ROUTE TRIGGER</span>
              <h2>路线触发烟雾</h2>
            </div>
            <span className={styles.badge}>事件点：68%</span>
          </div>
          <div className={`${styles.demoCanvas} ${styles.routeCanvas}`}>
            <svg className={styles.routeSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points="8,72 28,56 50,36 68,34 86,72 92,72" className={styles.routeLine} />
              <line x1={ROUTE_EVENT_PROGRESS * 100} y1="8" x2={ROUTE_EVENT_PROGRESS * 100} y2="92" className={styles.eventLine} />
            </svg>
            <span className={styles.eventLabel} style={{ left: `${ROUTE_EVENT_PROGRESS * 100}%` }}>状态节点</span>
            <span className={styles.routeActor} style={markerStyle}>
              <span />
              <small>角色</small>
            </span>
            {routeSmokeVisible ? (
              <SmokeCloud
                runKey={routeSmokeKey}
                className={styles.routeSmoke}
                style={markerStyle}
              />
            ) : null}
            <span className={styles.canvasCaption}>路线进度：{Math.round(routeProgress * 100)}%</span>
          </div>
          <div className={styles.controls}>
            <button type="button" className={styles.primaryButton} onClick={startRouteDemo}>
              {routePlaying ? "重新自动播放" : "自动播放路线"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={resetRouteDemo}>重置</button>
          </div>
        </article>
      </section>

      <section className={styles.explanation}>
        <strong>观察重点</strong>
        <span>如果 A 顺滑而 B 卡顿，说明路线进度更新或主线程重绘在影响体验；如果 A、B 都卡，才需要继续精简烟雾本身。</span>
      </section>
    </main>
  );
}
