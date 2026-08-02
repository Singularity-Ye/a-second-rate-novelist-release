"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collapseParallelEdges } from "./edge-label-layout";
import { graphInputSignature } from "./graph-stability";
import type Graph from "graphology";
import type Sigma from "sigma";
import type { GraphColorMap, GraphEdgeInput, GraphNodeInput } from "./types";
import type { GraphQualityProfile } from "./adaptive-quality";

export interface ForceGraphSigmaProps<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>> {
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>;
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>;
  quality: GraphQualityProfile;
  ariaLabel: string;
  className?: string | undefined;
  colors?: GraphColorMap;
  selectedNodeId?: string | null;
  theme?: "light" | "dark";
  onNodeSelect?: (nodeId: string) => void;
}

const DEFAULT_COLORS: GraphColorMap = {
  character: "#a84f36",
  place: "#287469",
  faction: "#5d6589",
  object: "#d8ad42",
  event: "#a74f68",
};

export function ForceGraphSigma<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>({
  nodes,
  edges,
  quality,
  ariaLabel,
  className,
  colors = DEFAULT_COLORS,
  selectedNodeId = null,
  theme = "dark",
  onNodeSelect,
}: ForceGraphSigmaProps<NodeMetadata, EdgeMetadata>) {
  const visualEdges = useMemo(() => collapseParallelEdges(edges), [edges]);
  const visualSignature = useMemo(() => graphInputSignature(nodes, visualEdges), [nodes, visualEdges]);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const selectRef = useRef(onNodeSelect);
  const dragDepthRef = useRef(quality.propagationDepth);
  const [rendererRevision, setRendererRevision] = useState(0);

  useEffect(() => { selectRef.current = onNodeSelect; }, [onNodeSelect]);
  useEffect(() => { dragDepthRef.current = quality.propagationDepth; }, [quality.propagationDepth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import("graphology"), import("sigma"), import("@sigma/node-image")]).then(([graphologyModule, sigmaModule, imageModule]) => {
      if (disposed) return;
      const graph = new graphologyModule.default({ multi: true, type: "undirected" });
      const renderer = new sigmaModule.default(graph, container, {
        allowInvalidContainer: true,
        nodeProgramClasses: { image: imageModule.NodeImageProgram },
        hideEdgesOnMove: quality.hideEdgesOnMove,
        hideLabelsOnMove: quality.hideLabelsOnMove,
        renderEdgeLabels: quality.showEdgeLabels,
        labelDensity: quality.labelDensity,
        labelRenderedSizeThreshold: quality.labelRenderedSizeThreshold,
        labelColor: { color: theme === "dark" ? "#f3ebdd" : "#4e4741" },
        labelSize: 13,
        edgeLabelColor: { color: theme === "dark" ? "#c6bbb2" : "#786f68" },
        enableEdgeEvents: false,
        minCameraRatio: 0.08,
        maxCameraRatio: 8,
      });
      graphRef.current = graph;
      rendererRef.current = renderer;
      let draggedNode: string | null = null;
      let lastPosition: { x: number; y: number } | null = null;
      renderer.on("clickNode", ({ node }) => selectRef.current?.(node));
      renderer.on("downNode", ({ node }) => {
        draggedNode = node;
        lastPosition = graph.getNodeAttributes(node) as { x: number; y: number };
        graph.setNodeAttribute(node, "highlighted", true);
        if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox());
      });
      renderer.on("moveBody", ({ event }) => {
        if (!draggedNode || !lastPosition) return;
        const position = renderer.viewportToGraph(event);
        const deltaX = position.x - lastPosition.x;
        const deltaY = position.y - lastPosition.y;
        const visited = new Set([draggedNode]);
        let frontier = [draggedNode];
        for (let depth = 1; depth <= dragDepthRef.current; depth += 1) {
          const next: string[] = [];
          const influence = depth === 1 ? 0.42 : 0.16;
          for (const source of frontier) {
            for (const neighbor of graph.neighbors(source)) {
              if (visited.has(neighbor)) continue;
              visited.add(neighbor);
              next.push(neighbor);
              graph.updateNodeAttributes(neighbor, (attributes) => ({ ...attributes, x: Number(attributes.x) + deltaX * influence, y: Number(attributes.y) + deltaY * influence }));
            }
          }
          frontier = next;
        }
        graph.mergeNodeAttributes(draggedNode, position);
        lastPosition = position;
        event.preventSigmaDefault();
        event.original.preventDefault();
        event.original.stopPropagation();
      });
      const endDrag = () => {
        if (draggedNode && graph.hasNode(draggedNode)) graph.removeNodeAttribute(draggedNode, "highlighted");
        draggedNode = null;
        lastPosition = null;
      };
      renderer.on("upNode", endDrag);
      renderer.on("upStage", endDrag);
      cleanup = () => {
        renderer.kill();
        graph.clear();
        graphRef.current = null;
        rendererRef.current = null;
      };
      setRendererRevision((value) => value + 1);
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    const renderer = rendererRef.current;
    if (!graph || !renderer) return;
    const nextNodeIds = new Set(nodes.map((node) => node.id));
    graph.forEachNode((id) => { if (!nextNodeIds.has(id)) graph.dropNode(id); });
    for (const [index, node] of nodes.entries()) {
      const attributes = {
        label: node.label,
        x: node.x ?? Math.cos(index * 2.399963229728653) * 100,
        y: node.y ?? Math.sin(index * 2.399963229728653) * 100,
        size: Math.max(5, (node.radius ?? 28) / 1.85),
        color: node.color ?? colors[node.type] ?? "#8b8178",
        type: node.imageUrl ? "image" : "circle",
        ...(node.imageUrl ? { image: node.imageUrl } : {}),
      };
      if (graph.hasNode(node.id)) graph.mergeNodeAttributes(node.id, attributes);
      else graph.addNode(node.id, attributes);
    }
    const nextEdgeIds = new Set(visualEdges.map((edge) => edge.id));
    graph.forEachEdge((id) => { if (!nextEdgeIds.has(id)) graph.dropEdge(id); });
    for (const edge of visualEdges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      const attributes = { label: edge.label ?? "", size: Math.max(0.5, edge.weight ?? 1), color: theme === "dark" ? "#625b64" : "#9f948a" };
      if (graph.hasEdge(edge.id)) graph.mergeEdgeAttributes(edge.id, attributes);
      else graph.addEdgeWithKey(edge.id, edge.source, edge.target, attributes);
    }
    renderer.refresh();
  }, [colors, rendererRevision, theme, visualSignature]);

  useEffect(() => {
    const graph = graphRef.current;
    const renderer = rendererRef.current;
    if (!graph || !renderer) return;
    renderer.setSetting("hideEdgesOnMove", quality.hideEdgesOnMove);
    renderer.setSetting("hideLabelsOnMove", quality.hideLabelsOnMove);
    renderer.setSetting("renderEdgeLabels", quality.showEdgeLabels);
    renderer.setSetting("labelDensity", quality.labelDensity);
    renderer.setSetting("labelRenderedSizeThreshold", quality.labelRenderedSizeThreshold);
    renderer.refresh();
  }, [quality, rendererRevision]);

  useEffect(() => {
    const graph = graphRef.current;
    const renderer = rendererRef.current;
    if (!graph || !renderer) return;
    const selectedColor = theme === "dark" ? "#f2c66d" : "#c38620";
    const selectedEdge = theme === "dark" ? "#f2c66d" : "#b77918";
    const mutedEdge = theme === "dark" ? "#29252d" : "#d8d1c8";
    renderer.setSetting("nodeReducer", (node, data) => node === selectedNodeId ? { ...data, color: selectedColor, size: data.size * 1.35, highlighted: true, forceLabel: true } : data);
    renderer.setSetting("edgeReducer", (edge, data) => {
      if (!selectedNodeId) return data;
      const [source, target] = graph.extremities(edge);
      const active = source === selectedNodeId || target === selectedNodeId;
      return { ...data, color: active ? selectedEdge : mutedEdge, size: active ? Math.max(2.4, Number(data.size ?? 1) * 2) : Math.max(0.35, Number(data.size ?? 1) * 0.55) };
    });
    renderer.refresh();
  }, [rendererRevision, selectedNodeId, theme]);

  return <div ref={containerRef} aria-label={ariaLabel} className={className} data-quality={quality.level} data-renderer="sigma-webgl" role="img" />;
}
