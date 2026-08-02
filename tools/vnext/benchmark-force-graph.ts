import { performance } from "node:perf_hooks";
import { ForceGraphEngine } from "../../packages/force-graph/force-engine.js";
import type { GraphEdgeInput, GraphNodeInput } from "../../packages/force-graph/types.js";

interface BenchmarkResult {
  nodes: number;
  edges: number;
  constructionMs: number;
  measuredTicks: number;
  medianTickMs: number;
  p95TickMs: number;
  totalTickMs: number;
  heapDeltaMiB: number;
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function fixture(size: number) {
  const nodes: GraphNodeInput[] = Array.from({ length: size }, (_, index) => ({
    id: `node-${index}`,
    label: `节点 ${index}`,
    type: index % 5 === 0 ? "character" : index % 5 === 1 ? "place" : index % 5 === 2 ? "faction" : index % 5 === 3 ? "object" : "event",
    radius: index % 5 === 0 ? 30 : 24,
  }));
  const edges: GraphEdgeInput[] = [];
  for (let index = 1; index < size; index += 1) {
    edges.push({ id: `tree-${index}`, source: `node-${Math.floor((index - 1) / 2)}`, target: `node-${index}` });
    if (index > 7 && index % 3 === 0) edges.push({ id: `cross-${index}`, source: `node-${index}`, target: `node-${(index * 17) % index}` });
  }
  return { nodes, edges };
}

function benchmark(size: number): BenchmarkResult {
  const graph = fixture(size);
  const heapBefore = process.memoryUsage().heapUsed;
  const constructionStarted = performance.now();
  const engine = new ForceGraphEngine({ nodes: graph.nodes, edges: graph.edges, width: 1_400, height: 800 });
  const constructionMs = performance.now() - constructionStarted;
  const measuredTicks = size <= 300 ? 80 : size <= 1_000 ? 40 : 12;
  const tickTimes: number[] = [];
  for (let index = 0; index < measuredTicks; index += 1) {
    const started = performance.now();
    engine.tick();
    tickTimes.push(performance.now() - started);
  }
  const heapAfter = process.memoryUsage().heapUsed;
  engine.dispose();
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    constructionMs: Number(constructionMs.toFixed(3)),
    measuredTicks,
    medianTickMs: Number(percentile(tickTimes, 0.5).toFixed(3)),
    p95TickMs: Number(percentile(tickTimes, 0.95).toFixed(3)),
    totalTickMs: Number(tickTimes.reduce((total, value) => total + value, 0).toFixed(3)),
    heapDeltaMiB: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(3)),
  };
}

const sizes = [100, 300, 1_000, 5_000];
const report = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  scope: "layout-only; excludes React, SVG, GPU, image decoding and browser event cost",
  results: sizes.map(benchmark),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
