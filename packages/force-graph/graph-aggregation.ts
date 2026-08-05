import type { GraphEdgeInput, GraphNodeInput } from "./types";

export interface GraphAggregateMetadata {
  aggregate: true;
  groupKey: string;
  memberCount: number;
  memberIds: string[];
  representativeId: string;
  internalEdgeCount: number;
}

export interface GraphAggregateEdgeMetadata {
  aggregate: true;
  sourceGroup: string;
  targetGroup: string;
  relationCount: number;
}

export interface GraphAggregationResult {
  nodes: Array<GraphNodeInput<GraphAggregateMetadata>>;
  edges: Array<GraphEdgeInput<GraphAggregateEdgeMetadata>>;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
  groupCount: number;
}

export interface GraphAggregationOptions<NodeMetadata = Record<string, unknown>> {
  /** Turns a source node into an overview/MOC group. */
  groupBy?: (node: GraphNodeInput<NodeMetadata>) => string;
  /** Human-facing group title. Defaults to the group key. */
  groupLabel?: (groupKey: string, members: ReadonlyArray<GraphNodeInput<NodeMetadata>>) => string;
  maxGroups?: number;
  maxEdges?: number;
  /** Optional score used when a group limit has to hide groups. */
  scoreNode?: (node: GraphNodeInput<NodeMetadata>) => number;
}

export interface FocusGraphOptions<NodeMetadata = Record<string, unknown>> {
  selectedNodeId?: string | null;
  neighborDepth?: number;
  maxNodes?: number;
  maxEdges?: number;
  scoreNode?: (node: GraphNodeInput<NodeMetadata>) => number;
}

export interface FocusGraphResult<NodeMetadata, EdgeMetadata> {
  nodes: Array<GraphNodeInput<NodeMetadata>>;
  edges: Array<GraphEdgeInput<EdgeMetadata>>;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
}

function defaultGroupBy<NodeMetadata>(node: GraphNodeInput<NodeMetadata>): string {
  const metadata = node.metadata as Record<string, unknown> | undefined;
  const candidate = metadata?.area ?? metadata?.groupKey ?? metadata?.group;
  return typeof candidate === "string" && candidate.trim() ? candidate : node.type || "other";
}

function defaultNodeScore<NodeMetadata>(node: GraphNodeInput<NodeMetadata>): number {
  return Math.max(0, node.weight ?? 1);
}

function groupId(groupKey: string): string {
  return `graph-group:${groupKey}`;
}

/**
 * Collapses note-level nodes into a small overview graph.
 *
 * This is intentionally a virtual projection: source note IDs remain in the
 * aggregate metadata, so selecting a group can open a MOC or expand it later
 * without moving or copying Vault files.
 */
export function aggregateGraph<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>(
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>,
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>,
  options: GraphAggregationOptions<NodeMetadata> = {},
): GraphAggregationResult {
  const groupBy = options.groupBy ?? defaultGroupBy;
  const scoreNode = options.scoreNode ?? defaultNodeScore;
  const groups = new Map<string, GraphNodeInput<NodeMetadata>[]>();
  const nodeGroup = new Map<string, string>();

  for (const node of nodes) {
    const key = groupBy(node).trim() || "other";
    const members = groups.get(key) ?? [];
    members.push(node);
    groups.set(key, members);
    nodeGroup.set(node.id, key);
  }

  const rankedGroups = [...groups.entries()].sort(([, a], [, b]) => {
    const sizeDelta = b.length - a.length;
    if (sizeDelta !== 0) return sizeDelta;
    const scoreDelta = Math.max(...b.map(scoreNode)) - Math.max(...a.map(scoreNode));
    return scoreDelta;
  });
  const maxGroups = Math.max(1, Math.floor(options.maxGroups ?? rankedGroups.length));
  const keptGroups = rankedGroups.slice(0, maxGroups);
  const keptGroupKeys = new Set(keptGroups.map(([key]) => key));

  const internalEdgeCounts = new Map<string, number>();
  const relationByPair = new Map<string, { source: string; target: string; weight: number; relationCount: number }>();
  for (const edge of edges) {
    const sourceGroup = nodeGroup.get(edge.source);
    const targetGroup = nodeGroup.get(edge.target);
    if (!sourceGroup || !targetGroup || !keptGroupKeys.has(sourceGroup) || !keptGroupKeys.has(targetGroup)) continue;
    if (sourceGroup === targetGroup) {
      internalEdgeCounts.set(sourceGroup, (internalEdgeCounts.get(sourceGroup) ?? 0) + 1);
      continue;
    }
    const [left, right] = sourceGroup < targetGroup ? [sourceGroup, targetGroup] : [targetGroup, sourceGroup];
    const key = `${left}\u0000${right}`;
    const existing = relationByPair.get(key);
    if (existing) {
      existing.weight += Math.max(0, edge.weight ?? 1);
      existing.relationCount += 1;
    } else {
      relationByPair.set(key, {
        source: left,
        target: right,
        weight: Math.max(0, edge.weight ?? 1),
        relationCount: 1,
      });
    }
  }

  const maxEdges = Math.max(0, Math.floor(options.maxEdges ?? relationByPair.size));
  const rankedRelations = [...relationByPair.values()].sort((a, b) => b.weight - a.weight).slice(0, maxEdges);
  const aggregateNodes = keptGroups.map(([key, members]) => {
    const representative = [...members].sort((a, b) => scoreNode(b) - scoreNode(a))[0]!;
    return {
      id: groupId(key),
      label: options.groupLabel?.(key, members) ?? key,
      type: "aggregate",
      radius: Math.min(54, 24 + Math.sqrt(members.length) * 4),
      weight: members.reduce((sum, member) => sum + Math.max(0, member.weight ?? 1), 0),
      ...(representative.color ? { color: representative.color } : {}),
      metadata: {
        aggregate: true as const,
        groupKey: key,
        memberCount: members.length,
        memberIds: members.map((member) => member.id),
        representativeId: representative.id,
        internalEdgeCount: internalEdgeCounts.get(key) ?? 0,
      },
    } satisfies GraphNodeInput<GraphAggregateMetadata>;
  });
  const aggregateEdges = rankedRelations.map((relation) => ({
    id: `graph-group-edge:${relation.source}:${relation.target}`,
    source: groupId(relation.source),
    target: groupId(relation.target),
    type: "aggregate",
    label: `${relation.relationCount} 条关系`,
    weight: relation.weight,
    metadata: {
      aggregate: true as const,
      sourceGroup: relation.source,
      targetGroup: relation.target,
      relationCount: relation.relationCount,
    },
  } satisfies GraphEdgeInput<GraphAggregateEdgeMetadata>));

  return {
    nodes: aggregateNodes,
    edges: aggregateEdges,
    hiddenNodeCount: nodes.length - keptGroups.reduce((sum, [, members]) => sum + members.length, 0),
    hiddenEdgeCount: edges.length - rankedRelations.reduce((sum, relation) => sum + relation.relationCount, 0),
    groupCount: groups.size,
  };
}

/** A readable name for the first, low-cost view of the AOS map. */
export function buildOverviewGraph<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>(
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>,
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>,
  options: Omit<GraphAggregationOptions<NodeMetadata>, "maxGroups"> & { maxGroups?: number } = {},
): GraphAggregationResult {
  return aggregateGraph(nodes, edges, { ...options, maxGroups: options.maxGroups ?? 12 });
}

/** A MOC-level projection with a slightly wider group budget. */
export function buildMocGraph<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>(
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>,
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>,
  options: GraphAggregationOptions<NodeMetadata> = {},
): GraphAggregationResult {
  return aggregateGraph(nodes, edges, { ...options, maxGroups: options.maxGroups ?? 48 });
}

/**
 * Keeps one or two hops around a selected node. This is the detail view after
 * a user clicks an overview/MOC node; it never expands the whole Vault at
 * once.
 */
export function buildFocusGraph<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>(
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>,
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>,
  options: FocusGraphOptions<NodeMetadata> = {},
): FocusGraphResult<NodeMetadata, EdgeMetadata> {
  const maxNodes = Math.max(1, Math.floor(options.maxNodes ?? 120));
  const maxEdges = Math.max(0, Math.floor(options.maxEdges ?? 240));
  const depthLimit = Math.max(0, Math.floor(options.neighborDepth ?? 1));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    const sourceNeighbors = adjacency.get(edge.source) ?? new Set<string>();
    sourceNeighbors.add(edge.target);
    adjacency.set(edge.source, sourceNeighbors);
    const targetNeighbors = adjacency.get(edge.target) ?? new Set<string>();
    targetNeighbors.add(edge.source);
    adjacency.set(edge.target, targetNeighbors);
  }

  const selected = options.selectedNodeId && nodeById.has(options.selectedNodeId) ? options.selectedNodeId : null;
  const distances = new Map<string, number>();
  const queue: string[] = [];
  if (selected) {
    distances.set(selected, 0);
    queue.push(selected);
  }
  while (queue.length) {
    const current = queue.shift()!;
    const distance = distances.get(current)!;
    if (distance >= depthLimit) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      queue.push(neighbor);
    }
  }

  const scoreNode = options.scoreNode ?? defaultNodeScore;
  const candidates = [...nodeById.values()]
    .filter((node) => !selected || distances.has(node.id))
    .sort((a, b) => {
      if (selected) {
        const distanceDelta = (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity);
        if (distanceDelta !== 0) return distanceDelta;
      }
      const degreeDelta = (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0);
      return degreeDelta || scoreNode(b) - scoreNode(a);
    });
  const keptNodes = candidates.slice(0, maxNodes);
  const keptIds = new Set(keptNodes.map((node) => node.id));
  if (selected && !keptIds.has(selected)) {
    keptNodes.pop();
    keptNodes.unshift(nodeById.get(selected)!);
    keptIds.add(selected);
  }
  const keptEdges = edges
    .filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
    .slice(0, maxEdges);
  return {
    nodes: keptNodes,
    edges: keptEdges,
    hiddenNodeCount: nodes.length - keptNodes.length,
    hiddenEdgeCount: edges.length - keptEdges.length,
  };
}
