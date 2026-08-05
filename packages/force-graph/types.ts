import type { SimulationNodeDatum } from "d3-force";

export interface GraphNodeInput<Metadata = Record<string, unknown>> {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
  radius?: number;
  color?: string;
  imageUrl?: string;
  weight?: number;
  pinned?: boolean;
  metadata?: Metadata;
}

export interface GraphEdgeInput<Metadata = Record<string, unknown>> {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  weight?: number;
  metadata?: Metadata;
}

export interface GraphNodeState<Metadata = Record<string, unknown>>
  extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  radius: number;
  color?: string;
  imageUrl?: string;
  weight: number;
  pinned?: boolean;
  metadata?: Metadata;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ResolvedGraphEdge<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>> {
  id: string;
  source: GraphNodeState<NodeMetadata>;
  target: GraphNodeState<NodeMetadata>;
  label?: string;
  type?: string;
  weight: number;
  metadata?: EdgeMetadata;
}

export interface GraphTuning {
  repelForce: number;
  manyBodyTheta: number;
  manyBodyDistanceMax: number;
  centerForce: number;
  linkDistance: number;
  linkStrength: number;
  collisionPadding: number;
  collisionIterations: number;
  velocityDecay: number;
  alphaDecay: number;
  dragAlpha: number;
  zoomMin: number;
  zoomMax: number;
  zoomSmoothingMs: number;
}

export const DEFAULT_GRAPH_TUNING: Readonly<GraphTuning> = Object.freeze({
  repelForce: 0.65,
  // A Barnes-Hut approximation is materially cheaper than exact long-range
  // repulsion once the map grows. Keep the value exposed for dense projects.
  manyBodyTheta: 0.9,
  // 0 means an adaptive bound based on the viewport diagonal.
  manyBodyDistanceMax: 0,
  centerForce: 0.08,
  linkDistance: 132,
  linkStrength: 0.18,
  collisionPadding: 14,
  collisionIterations: 3,
  velocityDecay: 0.3,
  alphaDecay: 0.035,
  dragAlpha: 0.82,
  zoomMin: 0.45,
  zoomMax: 2.8,
  zoomSmoothingMs: 72,
});

export interface GraphTransform {
  x: number;
  y: number;
  k: number;
}

export interface GraphViewportSnapshot {
  actual: GraphTransform;
  target: GraphTransform;
}

export interface GraphWheelInput {
  deltaY: number;
  deltaMode: number;
  mouseX: number;
  mouseY: number;
  pageHeight: number;
}

export type GraphColorMap = Readonly<Record<string, string>>;
