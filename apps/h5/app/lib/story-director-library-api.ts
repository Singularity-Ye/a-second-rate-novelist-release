import type { DirectorJokeIntent } from "../vnext/world-lab/world-lab-data";
import { worldLabRequestError } from "./world-lab-api";

export type DirectorLibraryKind = "knowledge" | "craft" | "joke";

interface DirectorLibraryNode {
  id: string;
  label: string;
  kind: string;
  summary: string;
}

export interface DirectorLibraryRequest {
  storyId: string;
  storyTitle: string;
  genre: string;
  sourceBranchId: string;
  sourceTurnId: string;
  currentScene: string;
  userInput: string;
  selectedNodeIds: string[];
  candidateNodes: DirectorLibraryNode[];
  recentScenes: string[];
  jokeIntent?: DirectorJokeIntent;
}

interface DirectorLibraryTrace {
  traceId: string;
  provider: string;
  model: string;
  workflowVersion: "vnext.story-director-library.v1";
  outputHash: string;
}

interface DirectorLibraryResponseBase {
  kind: DirectorLibraryKind;
  trace: DirectorLibraryTrace;
  notCanon: true;
  notManuscript: true;
  fallbackApplied: false;
}

export interface DirectorKnowledgeResponse extends DirectorLibraryResponseBase {
  kind: "knowledge";
  topic: string;
  summary: string;
  concepts: string[];
  culturalContext: string;
  applicationToStory: string;
  sourceNote: string;
  caveats: string[];
}

export interface DirectorCraftResponse extends DirectorLibraryResponseBase {
  kind: "craft";
  title: string;
  pattern: string;
  relatedPatterns: string[];
  useWhen: string;
  cadence: string;
  risk: string;
  exampleStructure: string;
}

export interface DirectorJokeResponse extends DirectorLibraryResponseBase {
  kind: "joke";
  phrase: string;
  meaning: string;
  category: string;
  suitableWhen: string;
  avoidWhen: string;
  frequencyBudget: string;
  characterFit: string;
  plotSeed: string;
  insertionMode: DirectorJokeIntent;
}

export type DirectorLibraryResponse = DirectorKnowledgeResponse | DirectorCraftResponse | DirectorJokeResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim() && [...value].length <= maximum ? value.trim() : null;
}

function list(value: unknown, maximumItems: number, maximumText: number) {
  return Array.isArray(value) && value.length <= maximumItems && value.every((item) => text(item, maximumText))
    ? value.map((item) => (item as string).trim())
    : null;
}

function parseTrace(value: unknown): DirectorLibraryTrace | null {
  if (!isRecord(value) || value.workflowVersion !== "vnext.story-director-library.v1") return null;
  const traceId = text(value.traceId, 200);
  const provider = text(value.provider, 100);
  const model = text(value.model, 100);
  const outputHash = text(value.outputHash, 200);
  return traceId && provider && model && outputHash
    ? { traceId, provider, model, workflowVersion: "vnext.story-director-library.v1", outputHash }
    : null;
}

function base(value: Record<string, unknown>) {
  const trace = parseTrace(value.trace);
  if (!trace || value.notCanon !== true || value.notManuscript !== true || value.fallbackApplied !== false) return null;
  const kind = text(value.kind, 20);
  if (!kind || !["knowledge", "craft", "joke"].includes(kind)) return null;
  return { kind: kind as DirectorLibraryKind, trace, notCanon: true as const, notManuscript: true as const, fallbackApplied: false as const };
}

function parseResponse(value: unknown): DirectorLibraryResponse | null {
  if (!isRecord(value)) return null;
  const common = base(value);
  if (!common) return null;
  if (common.kind === "knowledge") {
    const topic = text(value.topic, 200);
    const summary = text(value.summary, 2_000);
    const concepts = list(value.concepts, 12, 300);
    const culturalContext = text(value.culturalContext, 2_000);
    const applicationToStory = text(value.applicationToStory, 2_000);
    const sourceNote = text(value.sourceNote, 1_000);
    const caveats = list(value.caveats, 8, 500);
    if (!topic || !summary || !concepts || !culturalContext || !applicationToStory || !sourceNote || !caveats) return null;
    return { ...common, kind: "knowledge", topic, summary, concepts, culturalContext, applicationToStory, sourceNote, caveats };
  }
  if (common.kind === "craft") {
    const title = text(value.title, 200);
    const pattern = text(value.pattern, 2_000);
    const relatedPatterns = list(value.relatedPatterns, 12, 300);
    const useWhen = text(value.useWhen, 800);
    const cadence = text(value.cadence, 800);
    const risk = text(value.risk, 800);
    const exampleStructure = text(value.exampleStructure, 2_000);
    if (!title || !pattern || !relatedPatterns || !useWhen || !cadence || !risk || !exampleStructure) return null;
    return { ...common, kind: "craft", title, pattern, relatedPatterns, useWhen, cadence, risk, exampleStructure };
  }
  const phrase = text(value.phrase, 500);
  const meaning = text(value.meaning, 1_200);
  const category = text(value.category, 200);
  const suitableWhen = text(value.suitableWhen, 1_200);
  const avoidWhen = text(value.avoidWhen, 1_200);
  const frequencyBudget = text(value.frequencyBudget, 500);
  const characterFit = text(value.characterFit, 1_000);
  const plotSeed = text(value.plotSeed, 1_500);
  const insertionMode = text(value.insertionMode, 30);
  if (!phrase || !meaning || !category || !suitableWhen || !avoidWhen || !frequencyBudget || !characterFit || !plotSeed || !insertionMode || !["library_only", "opportunistic", "plot_seed"].includes(insertionMode)) return null;
  return {
    ...common,
    kind: "joke",
    phrase,
    meaning,
    category,
    suitableWhen,
    avoidWhen,
    frequencyBudget,
    characterFit,
    plotSeed,
    insertionMode: insertionMode as DirectorJokeIntent,
  };
}

export async function distillDirectorLibrary(input: DirectorLibraryRequest & { kind: DirectorLibraryKind }): Promise<DirectorLibraryResponse> {
  const response = await fetch("/api/vnext/world-lab/director/library", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...input, requestId: globalThis.crypto.randomUUID() }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw worldLabRequestError(null, "provider_unavailable", response);
  }
  if (!response.ok) {
    throw worldLabRequestError(payload, "provider_unavailable", response);
  }
  const parsed = parseResponse(payload);
  if (!parsed || parsed.kind !== input.kind) throw worldLabRequestError(null, "invalid_runtime_output", response);
  return parsed;
}
