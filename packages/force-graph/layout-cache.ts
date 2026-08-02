import type { GraphNodeInput, GraphTransform, GraphTuning } from "./types";

export const GRAPH_LAYOUT_CACHE_VERSION = 2;

export interface GraphLayoutCacheIdentity {
  worldRevision: string;
  graphScope: string;
  tuning: Readonly<GraphTuning>;
  nodes: ReadonlyArray<Pick<GraphNodeInput, "id">>;
  edges: ReadonlyArray<{ source: string; target: string }>;
}

export interface GraphLayoutNodeSnapshot {
  id: string;
  x: number;
  y: number;
  pinned?: boolean;
}

export interface GraphLayoutSnapshot {
  version: typeof GRAPH_LAYOUT_CACHE_VERSION;
  identity: string;
  savedAt: string;
  nodes: GraphLayoutNodeSnapshot[];
  camera?: GraphTransform;
}

export interface GraphLayoutCacheStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function stableNumber(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function graphLayoutIdentity(input: GraphLayoutCacheIdentity) {
  const topology = {
    nodes: input.nodes.map((node) => node.id).sort(),
    edges: input.edges
      .map((edge) => `${edge.source}>${edge.target}`)
      .sort(),
  };
  const tuning = Object.fromEntries(
    Object.entries(input.tuning)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableNumber(value)]),
  );
  return fnv1a(JSON.stringify({
    version: GRAPH_LAYOUT_CACHE_VERSION,
    worldRevision: input.worldRevision,
    graphScope: input.graphScope,
    topology,
    tuning,
  }));
}

export function graphLayoutCacheKey(identity: GraphLayoutCacheIdentity) {
  return `erliu:force-graph:layout:v${GRAPH_LAYOUT_CACHE_VERSION}:${graphLayoutIdentity(identity)}`;
}

export class GraphLayoutCache {
  constructor(private readonly store: GraphLayoutCacheStore) {}

  load(identity: GraphLayoutCacheIdentity): GraphLayoutSnapshot | undefined {
    const key = graphLayoutCacheKey(identity);
    const raw = this.store.getItem(key);
    if (!raw) return undefined;
    try {
      const snapshot = JSON.parse(raw) as GraphLayoutSnapshot;
      if (snapshot.version !== GRAPH_LAYOUT_CACHE_VERSION || snapshot.identity !== graphLayoutIdentity(identity)) {
        this.store.removeItem(key);
        return undefined;
      }
      if (!Array.isArray(snapshot.nodes) || snapshot.nodes.some((node) => !node.id || !Number.isFinite(node.x) || !Number.isFinite(node.y))) {
        this.store.removeItem(key);
        return undefined;
      }
      return snapshot;
    } catch {
      this.store.removeItem(key);
      return undefined;
    }
  }

  save(
    identity: GraphLayoutCacheIdentity,
    nodes: ReadonlyArray<GraphLayoutNodeSnapshot>,
    camera?: GraphTransform,
  ) {
    const cacheIdentity = graphLayoutIdentity(identity);
    const snapshot: GraphLayoutSnapshot = {
      version: GRAPH_LAYOUT_CACHE_VERSION,
      identity: cacheIdentity,
      savedAt: new Date().toISOString(),
      nodes: nodes.map((node) => ({
        id: node.id,
        x: stableNumber(node.x),
        y: stableNumber(node.y),
        ...(node.pinned ? { pinned: true } : {}),
      })),
      ...(camera ? { camera: {
        x: stableNumber(camera.x),
        y: stableNumber(camera.y),
        k: stableNumber(camera.k),
      } } : {}),
    };
    this.store.setItem(graphLayoutCacheKey(identity), JSON.stringify(snapshot));
    return snapshot;
  }
}

export function hydrateGraphNodesFromLayout<NodeMetadata>(
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>,
  snapshot: GraphLayoutSnapshot | undefined,
) {
  if (!snapshot) return nodes;
  const positions = new Map(snapshot.nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) return node;
    return {
      ...node,
      x: position.x,
      y: position.y,
      ...(position.pinned ? { pinned: true } : {}),
    };
  });
}
