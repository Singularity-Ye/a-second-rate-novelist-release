import type { ImportedManuscript, ManuscriptAnalysis, ManuscriptAnalysisBatch } from "../vnext/world-lab/manuscript-import";
import { buildManuscriptAnalysisWindow } from "../vnext/world-lab/manuscript-import";
import { worldLabRequestError } from "./world-lab-api";

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseAnalysis(value: unknown): ManuscriptAnalysis {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_runtime_output");
  const output = value as Record<string, unknown>;
  if (!text(output.genre) || !text(output.storyTitle) || !text(output.continuationBrief) || !Array.isArray(output.nodes) || output.nodes.length < 1 || !Array.isArray(output.edges) || !Array.isArray(output.facts) || !Array.isArray(output.memoryUpdates) || !Array.isArray(output.choices) || output.choices.length !== 3 || output.fallbackApplied !== false) {
    throw new Error("invalid_runtime_output");
  }
  const trace = output.trace as Record<string, unknown> | null;
  if (!trace || !text(trace.traceId) || !text(trace.provider) || !text(trace.model) || trace.workflowVersion !== "vnext.manuscript-import.v1" || !text(trace.outputHash)) throw new Error("invalid_runtime_output");
  return {
    ...(output as unknown as ManuscriptAnalysis),
    ...(output.distillationProtocol === "manuscript-distillation.v2" ? { distillationProtocol: "manuscript-distillation.v2" as const } : {}),
    // Older local drafts and older adapter responses may not contain craft
    // evidence yet; normalize them so the UI can render a stable shape.
    styleTechniques: Array.isArray(output.styleTechniques) ? output.styleTechniques as NonNullable<ManuscriptAnalysis["styleTechniques"]> : [],
    twistSeeds: Array.isArray(output.twistSeeds) ? output.twistSeeds as NonNullable<ManuscriptAnalysis["twistSeeds"]> : [],
  };
}

async function requestAnalysis(
  manuscript: ImportedManuscript,
  analysisText: string,
  selectedChapterTitle: string,
  selectedChapterIds: string[],
  analysisMode: "initial" | "enrichment",
  knownNodes: ManuscriptAnalysis["nodes"] = [],
) {
  const selected = manuscript.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId);
  if (!selected) throw new Error("invalid_continuation_chapter");
  const response = await fetch("/api/vnext/world-lab/imports/analyze", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      requestId: globalThis.crypto.randomUUID(),
      title: manuscript.title,
      filename: manuscript.filename,
      format: manuscript.format,
      sha256: manuscript.sha256,
      selectedChapterTitle,
      selectedChapterIds,
      analysisText,
      analysisMode,
      knownNodes: knownNodes.slice(0, 400).map(({ key, label, kind, isProtagonist }) => ({ key, label, kind, isProtagonist })),
      rightsAttested: manuscript.rightsAttested,
    }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw worldLabRequestError(null, "provider_unavailable", response);
  }
  if (!response.ok) {
    if (response.status === 413) throw worldLabRequestError(null, "manuscript_analysis_too_large", response);
    throw worldLabRequestError(payload, "provider_unavailable", response);
  }
  let parsed: ManuscriptAnalysis;
  try {
    parsed = parseAnalysis(payload);
  } catch {
    throw worldLabRequestError(null, "invalid_runtime_output", response);
  }
  return {
    ...parsed,
    nodes: parsed.nodes.map((node) => ({
      ...node,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    edges: parsed.edges.map((edge) => ({
      ...edge,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    styleTechniques: (parsed.styleTechniques ?? []).map((technique) => ({
      ...technique,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    twistSeeds: (parsed.twistSeeds ?? []).map((twist) => ({
      ...twist,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    knowledgeCards: (parsed.knowledgeCards ?? []).map((card) => ({
      ...card,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    expressionObservations: (parsed.expressionObservations ?? []).map((observation) => ({
      ...observation,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
    facts: parsed.facts.map((fact) => ({
      ...fact,
      ...(selectedChapterIds.length > 0 ? { sourceChapterIds: [...new Set(selectedChapterIds)] } : {}),
    })),
  };
}

export async function analyzeImportedManuscript(manuscript: ImportedManuscript) {
  const selected = manuscript.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId);
  if (!selected) throw new Error("invalid_continuation_chapter");
  return requestAnalysis(manuscript, buildManuscriptAnalysisWindow(manuscript), selected.title, [selected.id], "initial");
}

export async function analyzeImportedManuscriptBatch(
  manuscript: ImportedManuscript,
  batch: ManuscriptAnalysisBatch,
  knownAnalysis: ManuscriptAnalysis,
) {
  const range = batch.chapterTitles.length === 1 ? batch.chapterTitles[0]! : `${batch.chapterTitles[0]}—${batch.chapterTitles.at(-1)}`;
  return requestAnalysis(manuscript, batch.text, `分层分析：${range}`, batch.chapterIds, "enrichment", knownAnalysis.nodes);
}
