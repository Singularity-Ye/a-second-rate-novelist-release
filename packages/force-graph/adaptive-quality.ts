export type GraphQualityLevel = "cinematic" | "balanced" | "dense" | "atlas";
export type GraphRendererKind = "svg" | "sigma";

export interface GraphPerformanceSignals {
  nodeCount: number;
  edgeCount: number;
  visibleAvatarCount: number;
  devicePixelRatio?: number;
  deviceMemoryGiB?: number;
  p95FrameMs?: number;
  preference?: "auto" | "quality" | "performance";
}

export interface GraphQualityProfile {
  level: GraphQualityLevel;
  renderer: GraphRendererKind;
  showEdgeLabels: boolean;
  hideEdgesOnMove: boolean;
  hideLabelsOnMove: boolean;
  labelDensity: number;
  labelRenderedSizeThreshold: number;
  avatarMode: "all" | "visible" | "important" | "selected";
  avatarResolution: 48 | 64 | 96;
  pixelRatioCap: 1 | 1.5 | 2;
  simulationFps: 30 | 45 | 60;
  propagationDepth: 0 | 1 | 2;
}

const LEVELS: GraphQualityLevel[] = ["cinematic", "balanced", "dense", "atlas"];

const PROFILES: Record<GraphQualityLevel, GraphQualityProfile> = {
  cinematic: { level: "cinematic", renderer: "svg", showEdgeLabels: true, hideEdgesOnMove: false, hideLabelsOnMove: false, labelDensity: 1, labelRenderedSizeThreshold: 0, avatarMode: "all", avatarResolution: 96, pixelRatioCap: 2, simulationFps: 60, propagationDepth: 2 },
  balanced: { level: "balanced", renderer: "sigma", showEdgeLabels: false, hideEdgesOnMove: true, hideLabelsOnMove: true, labelDensity: 0.8, labelRenderedSizeThreshold: 5, avatarMode: "visible", avatarResolution: 64, pixelRatioCap: 1.5, simulationFps: 45, propagationDepth: 2 },
  dense: { level: "dense", renderer: "sigma", showEdgeLabels: false, hideEdgesOnMove: true, hideLabelsOnMove: true, labelDensity: 0.42, labelRenderedSizeThreshold: 8, avatarMode: "important", avatarResolution: 48, pixelRatioCap: 1, simulationFps: 30, propagationDepth: 1 },
  atlas: { level: "atlas", renderer: "sigma", showEdgeLabels: false, hideEdgesOnMove: true, hideLabelsOnMove: true, labelDensity: 0.16, labelRenderedSizeThreshold: 12, avatarMode: "selected", avatarResolution: 48, pixelRatioCap: 1, simulationFps: 30, propagationDepth: 0 },
};

function degrade(level: GraphQualityLevel, steps: number) {
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + steps)]!;
}

function improve(level: GraphQualityLevel, steps: number) {
  return LEVELS[Math.max(0, LEVELS.indexOf(level) - steps)]!;
}

export function chooseGraphQuality(signals: GraphPerformanceSignals): GraphQualityProfile {
  const weightedLoad = signals.nodeCount + signals.edgeCount * 0.42 + signals.visibleAvatarCount * 1.8;
  let level: GraphQualityLevel = weightedLoad <= 180 ? "cinematic" : weightedLoad <= 720 ? "balanced" : weightedLoad <= 2_800 ? "dense" : "atlas";
  if ((signals.deviceMemoryGiB ?? 8) <= 4 || (signals.devicePixelRatio ?? 1) > 2) level = degrade(level, 1);
  if ((signals.p95FrameMs ?? 0) > 33) level = degrade(level, 2);
  else if ((signals.p95FrameMs ?? 0) > 22) level = degrade(level, 1);
  if (signals.preference === "performance") level = degrade(level, 1);
  if (signals.preference === "quality" && (signals.p95FrameMs ?? 0) <= 18) level = improve(level, 1);
  return PROFILES[level];
}

export function graphQualityProfile(level: GraphQualityLevel) {
  return PROFILES[level];
}

export interface GraphQualityControllerOptions {
  /** Consecutive healthy samples required before restoring a more expensive tier. */
  recoverySamples?: number;
}

/**
 * Keeps automatic quality from oscillating when frame time hovers around a
 * threshold. Pressure is applied immediately; recovery is deliberately slow.
 */
export class GraphQualityController {
  private level: GraphQualityLevel | undefined;
  private recoveryCandidate: GraphQualityLevel | undefined;
  private recoveryCount = 0;
  private readonly recoverySamples: number;

  constructor(options: GraphQualityControllerOptions = {}) {
    this.recoverySamples = Math.max(1, Math.floor(options.recoverySamples ?? 3));
  }

  sample(signals: GraphPerformanceSignals): GraphQualityProfile {
    const proposed = chooseGraphQuality(signals).level;
    if (!this.level) {
      this.level = proposed;
      return PROFILES[this.level];
    }

    const currentIndex = LEVELS.indexOf(this.level);
    const proposedIndex = LEVELS.indexOf(proposed);
    if (proposedIndex >= currentIndex) {
      this.level = proposed;
      this.recoveryCandidate = undefined;
      this.recoveryCount = 0;
      return PROFILES[this.level];
    }

    if (this.recoveryCandidate !== proposed) {
      this.recoveryCandidate = proposed;
      this.recoveryCount = 1;
    } else {
      this.recoveryCount += 1;
    }
    if (this.recoveryCount >= this.recoverySamples) {
      this.level = proposed;
      this.recoveryCandidate = undefined;
      this.recoveryCount = 0;
    }
    return PROFILES[this.level];
  }

  reset() {
    this.level = undefined;
    this.recoveryCandidate = undefined;
    this.recoveryCount = 0;
  }
}
