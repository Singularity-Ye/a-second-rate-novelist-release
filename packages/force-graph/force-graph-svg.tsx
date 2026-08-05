"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ForceGraphEngine } from "./force-engine";
import { SmoothGraphViewport } from "./viewport";
import { collapseParallelEdges, layoutEdgeLabels } from "./edge-label-layout";
import { graphInputSignature } from "./graph-stability";
import {
  DEFAULT_GRAPH_TUNING,
  type GraphColorMap,
  type GraphEdgeInput,
  type GraphNodeInput,
  type GraphNodeState,
  type GraphTuning,
  type GraphTransform,
} from "./types";

export interface ForceGraphSvgProps<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>> {
  nodes: ReadonlyArray<GraphNodeInput<NodeMetadata>>;
  edges: ReadonlyArray<GraphEdgeInput<EdgeMetadata>>;
  width?: number;
  height?: number;
  tuning?: Partial<GraphTuning>;
  colors?: GraphColorMap;
  typeLabels?: Readonly<Record<string, string>>;
  selectedNodeId?: string | null;
  resetToken?: number;
  initialAlpha?: number;
  theme?: "light" | "dark";
  ariaLabel: string;
  className?: string | undefined;
  onNodeSelect?: (nodeId: string) => void;
  onLayoutSnapshot?: (nodes: ReadonlyArray<GraphNodeState<NodeMetadata>>, camera: GraphTransform) => void;
  onLayoutFrame?: (nodes: ReadonlyArray<GraphNodeState<NodeMetadata>>) => void;
}

interface PointerSession {
  mode: "node" | "pan";
  nodeId?: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const DEFAULT_COLORS: GraphColorMap = {
  character: "#a84f36",
  place: "#287469",
  faction: "#5d6589",
  object: "#d8ad42",
  event: "#a74f68",
};

export function ForceGraphSvg<NodeMetadata = Record<string, unknown>, EdgeMetadata = Record<string, unknown>>({
  nodes,
  edges,
  width = 700,
  height = 430,
  tuning,
  colors = DEFAULT_COLORS,
  typeLabels,
  selectedNodeId = null,
  resetToken = 0,
  initialAlpha = 1,
  theme = "light",
  ariaLabel,
  className,
  onNodeSelect,
  onLayoutSnapshot,
  onLayoutFrame,
}: ForceGraphSvgProps<NodeMetadata, EdgeMetadata>) {
  const visualEdges = useMemo(() => collapseParallelEdges(edges), [edges]);
  const visualSignature = useMemo(() => graphInputSignature(nodes, visualEdges), [nodes, visualEdges]);
  const svgRef = useRef<SVGSVGElement>(null);
  const engineRef = useRef<ForceGraphEngine<NodeMetadata, EdgeMetadata> | null>(null);
  const viewportRef = useRef(
    new SmoothGraphViewport({
      zoomMin: tuning?.zoomMin ?? DEFAULT_GRAPH_TUNING.zoomMin,
      zoomMax: tuning?.zoomMax ?? DEFAULT_GRAPH_TUNING.zoomMax,
      zoomSmoothingMs: tuning?.zoomSmoothingMs ?? DEFAULT_GRAPH_TUNING.zoomSmoothingMs,
    }),
  );
  const pointerRef = useRef<PointerSession | null>(null);
  const previousNodeIdsRef = useRef(new Set(nodes.map((node) => node.id)));
  const previousEdgeIdsRef = useRef(new Set(visualEdges.map((edge) => edge.id)));
  const nodeBornAtRef = useRef(new Map<string, number>());
  const edgeBornAtRef = useRef(new Map<string, number>());
  const onLayoutSnapshotRef = useRef(onLayoutSnapshot);
  const onLayoutFrameRef = useRef(onLayoutFrame);
  const snapshotTimerRef = useRef<number | undefined>(undefined);
  const [frame, setFrame] = useState(0);

  useEffect(() => { onLayoutSnapshotRef.current = onLayoutSnapshot; }, [onLayoutSnapshot]);
  useEffect(() => { onLayoutFrameRef.current = onLayoutFrame; }, [onLayoutFrame]);

  const emitLayoutSnapshot = () => {
    const engine = engineRef.current;
    if (!engine || !onLayoutSnapshotRef.current) return;
    onLayoutSnapshotRef.current(engine.getNodes(), viewportRef.current.snapshot().actual);
  };

  const scheduleLayoutSnapshot = () => {
    if (snapshotTimerRef.current !== undefined) window.clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(emitLayoutSnapshot, 180);
  };

  useEffect(() => {
    const engine = new ForceGraphEngine<NodeMetadata, EdgeMetadata>({
      nodes,
      edges: visualEdges,
      width,
      height,
      ...(tuning ? { tuning } : {}),
    });
    engineRef.current = engine;
    let lastLayoutFrameAt = 0;
    let frameScheduled = false;
    let frameHandle: number | undefined;
    let frameHandleKind: "raf" | "timeout" | undefined;
    const scheduleFrame = () => {
      if (frameScheduled) return;
      frameScheduled = true;
      const flush = () => {
        frameScheduled = false;
        frameHandle = undefined;
        const now = performance.now();
        setFrame((value) => value + 1);
        if (now - lastLayoutFrameAt >= 80) {
          lastLayoutFrameAt = now;
          onLayoutFrameRef.current?.(engine.getNodes());
        }
      };
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        frameHandleKind = "raf";
        frameHandle = window.requestAnimationFrame(flush);
      } else if (typeof window !== "undefined") {
        frameHandleKind = "timeout";
        frameHandle = window.setTimeout(flush, 16);
      } else {
        flush();
      }
    };
    const unsubscribe = engine.subscribe(() => {
      scheduleFrame();
    });
    const unsubscribeSettled = engine.subscribeSettled(emitLayoutSnapshot);
    engine.restart(Math.max(0.02, Math.min(1, initialAlpha)));
    setFrame((value) => value + 1);
    return () => {
      unsubscribe();
      unsubscribeSettled();
      if (frameHandle !== undefined) {
        if (frameHandleKind === "raf") window.cancelAnimationFrame(frameHandle);
        else window.clearTimeout(frameHandle);
      }
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [height, initialAlpha, visualSignature, width]);

  useEffect(() => {
    const now = performance.now();
    const nextNodeIds = new Set(nodes.map((node) => node.id));
    const nextEdgeIds = new Set(visualEdges.map((edge) => edge.id));
    for (const id of nextNodeIds) {
      if (!previousNodeIdsRef.current.has(id)) nodeBornAtRef.current.set(id, now);
    }
    for (const id of nextEdgeIds) {
      if (!previousEdgeIdsRef.current.has(id)) edgeBornAtRef.current.set(id, now);
    }
    previousNodeIdsRef.current = nextNodeIds;
    previousEdgeIdsRef.current = nextEdgeIds;
  }, [nodes, visualEdges]);

  useEffect(() => {
    engineRef.current?.setTuning(tuning ?? {});
  }, [tuning]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (now: number) => {
      const viewport = viewportRef.current;
      const wasAnimating = viewport.isAnimating();
      viewport.step(now - last, reducedMotion);
      last = now;
      if (wasAnimating || viewport.isAnimating()) setFrame((value) => value + 1);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    viewportRef.current.reset(true);
    engineRef.current?.restart(0.6);
    setFrame((value) => value + 1);
  }, [resetToken]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const scaleX = width / Math.max(1, rect.width);
      const scaleY = height / Math.max(1, rect.height);
      viewportRef.current.applyWheel({
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        mouseX: (event.clientX - rect.left) * scaleX,
        mouseY: (event.clientY - rect.top) * scaleY,
        pageHeight: height,
      });
      setFrame((value) => value + 1);
      scheduleLayoutSnapshot();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [height, width]);

  const engine = engineRef.current;
  const renderedNodes = engine?.getNodes() ?? [];
  const renderedEdges = engine?.getEdges() ?? [];
  const viewport = viewportRef.current.snapshot().actual;
  const connected = useMemo(() => {
    if (!selectedNodeId) return null;
    const result = new Set([selectedNodeId]);
    for (const edge of edges) {
      if (edge.source === selectedNodeId) result.add(edge.target);
      if (edge.target === selectedNodeId) result.add(edge.source);
    }
    return result;
  }, [edges, selectedNodeId]);
  const selectionColors = theme === "dark"
    ? { edge: "#f2c66d", edgeDefault: "#625b64", edgeMuted: "#29252d", label: "#f7dfaa", labelMuted: "#716974", ring: "#f2c66d", type: "#d8cec5", glow: "rgba(242,198,109,.52)" }
    : { edge: "#b77918", edgeDefault: "#9f948a", edgeMuted: "#d8d1c8", label: "#8a5a10", labelMuted: "#aaa198", ring: "#d49a2e", type: "#655d56", glow: "rgba(212,154,46,.42)" };
  // Edge labels are useful in a small narrative graph but become the most
  // expensive SVG layout pass in a dense graph. A selection re-enables the
  // connected labels so the large graph remains inspectable on demand.
  const showEdgeLabels = renderedEdges.length <= 220 || Boolean(selectedNodeId);
  const edgeLabelPlacements = showEdgeLabels ? layoutEdgeLabels(renderedEdges, selectedNodeId) : new Map();

  const toGraphPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) * width) / Math.max(1, rect.width);
    const y = ((clientY - rect.top) * height) / Math.max(1, rect.height);
    return { x: (x - viewport.x) / viewport.k, y: (y - viewport.y) / viewport.k };
  };

  const beginNodeDrag = (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges();
    const node = renderedNodes.find((item) => item.id === nodeId);
    if (!node || !engineRef.current?.beginDrag(nodeId)) return;
    pointerRef.current = {
      mode: "node",
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      moved: false,
    };
    if (typeof svgRef.current?.setPointerCapture === "function") svgRef.current.setPointerCapture(event.pointerId);
  };

  const beginPan = (event: React.PointerEvent<SVGRectElement>) => {
    event.preventDefault();
    globalThis.getSelection?.()?.removeAllRanges();
    const current = viewportRef.current.snapshot().actual;
    pointerRef.current = {
      mode: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: current.x,
      startY: current.y,
      moved: false,
    };
    if (typeof svgRef.current?.setPointerCapture === "function") svgRef.current.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const session = pointerRef.current;
    if (!session) return;
    const distance = Math.hypot(event.clientX - session.startClientX, event.clientY - session.startClientY);
    if (distance > 4) session.moved = true;
    if (session.mode === "node" && session.nodeId) {
      const point = toGraphPoint(event.clientX, event.clientY);
      engineRef.current?.dragTo(session.nodeId, point.x, point.y);
      setFrame((value) => value + 1);
      return;
    }
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    viewportRef.current.panTo(
      session.startX + ((event.clientX - session.startClientX) * width) / Math.max(1, rect.width),
      session.startY + ((event.clientY - session.startClientY) * height) / Math.max(1, rect.height),
    );
    setFrame((value) => value + 1);
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const session = pointerRef.current;
    if (!session) return;
    if (session.mode === "node" && session.nodeId) {
      engineRef.current?.endDrag(session.nodeId);
      if (!session.moved) onNodeSelect?.(session.nodeId);
    }
    pointerRef.current = null;
    scheduleLayoutSnapshot();
    if (typeof svgRef.current?.hasPointerCapture === "function" && svgRef.current.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => () => {
    if (snapshotTimerRef.current !== undefined) window.clearTimeout(snapshotTimerRef.current);
  }, []);

  return (
    <svg
      ref={svgRef}
      aria-label={ariaLabel}
      className={className}
      data-graph-frame={frame}
      data-graph-theme={theme}
      data-initial-alpha={initialAlpha.toFixed(3)}
      data-graph-scale={viewport.k.toFixed(4)}
      onPointerCancel={endPointer}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onContextMenu={(event) => event.preventDefault()}
      role="img"
      style={{
        display: "block",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        width: "100%",
      }}
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect fill="transparent" height={height} onPointerDown={beginPan} width={width} x="0" y="0" />
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
        {renderedEdges.map((edge) => {
          const active = !selectedNodeId || edge.source.id === selectedNodeId || edge.target.id === selectedNodeId;
          const bornAt = edgeBornAtRef.current.get(edge.id);
          const progress = bornAt === undefined ? 1 : Math.min(1, Math.max(0.04, (performance.now() - bornAt) / 520));
          return (
            <g key={edge.id} data-edge-id={edge.id} data-entering={progress < 1} opacity={active ? 1 : theme === "dark" ? 0.2 : 0.14}>
              <line pathLength={1} stroke={selectedNodeId ? (active ? selectionColors.edge : selectionColors.edgeMuted) : selectionColors.edgeDefault} strokeDasharray={1} strokeDashoffset={1 - progress} strokeWidth={selectedNodeId && active ? 3 : active ? 1.5 : 1} x1={edge.source.x} x2={edge.target.x} y1={edge.source.y} y2={edge.target.y} />
              {edgeLabelPlacements.get(edge.id)?.visible ? (() => {
                const placement = edgeLabelPlacements.get(edge.id)!;
                return (
                  <text
                    data-edge-label-id={edge.id}
                    fill={selectedNodeId ? (active ? selectionColors.label : selectionColors.labelMuted) : theme === "dark" ? "#c0b5bd" : "#786f68"}
                    fontSize="10"
                    paintOrder="stroke"
                    pointerEvents="none"
                    stroke={theme === "dark" ? "#17131a" : "#fffaf0"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                    textAnchor="middle"
                    x={placement.x}
                    y={placement.y}
                  >
                    <title>{placement.fullLabel}</title>
                    {placement.label}
                  </text>
                );
              })() : null}
            </g>
          );
        })}
        {renderedNodes.map((node) => {
          const active = !connected || connected.has(node.id);
          const selected = node.id === selectedNodeId;
          const bornAt = nodeBornAtRef.current.get(node.id);
          const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
          const progress = reducedMotion || bornAt === undefined ? 1 : Math.min(1, Math.max(0.12, (performance.now() - bornAt) / 520));
          return (
            <g
              key={node.id}
              aria-label={`${node.label}，${typeLabels?.[node.type] ?? node.type}`}
              data-node-id={node.id}
              data-node-x={node.x.toFixed(2)}
              data-node-y={node.y.toFixed(2)}
              data-selected={selected}
              data-entering={progress < 1}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onNodeSelect?.(node.id);
              }}
              onPointerDown={(event) => beginNodeDrag(event, node.id)}
              opacity={active ? 1 : theme === "dark" ? 0.28 : 0.2}
              role="button"
              tabIndex={0}
              transform={`translate(${node.x} ${node.y})`}
            >
              <g opacity={progress} transform={`scale(${progress})`}>
                <circle
                  fill={node.color ?? colors[node.type] ?? "#7c756f"}
                  r={node.radius}
                  stroke={selected ? selectionColors.ring : theme === "dark" ? "#b6ada8" : "#fffaf0"}
                  strokeWidth={selected ? 7 : 4}
                  style={{ cursor: "grab", filter: selected ? `drop-shadow(0 0 12px ${selectionColors.glow})` : undefined }}
                />
                <text fill="white" fontSize="11" fontWeight="700" pointerEvents="none" textAnchor="middle" y="4">{node.label.slice(0, 5)}</text>
                <text fill={selectionColors.type} fontSize="10" pointerEvents="none" textAnchor="middle" y={node.radius + 20}>{typeLabels?.[node.type] ?? node.type}</text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
