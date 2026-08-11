import { worldLabRequestError } from "./world-lab-api";

export type StoryDirectorTiming = "next_scene" | "near_arc" | "later_arc" | "conditional";

export interface StoryDirectorRequest {
  storyId: string;
  storyTitle: string;
  genre: string;
  sourceBranchId: string;
  sourceTurnId: string;
  currentScene: string;
  userRequest: string;
  candidateNodes: Array<{ id: string; label: string; kind: string; summary: string }>;
  unresolvedThreads: string[];
  recentScenes: string[];
  activeProposals: string[];
  referenceMaterials?: string[];
}

export interface StoryDirectorResponse {
  title: string;
  proposal: string;
  timing: StoryDirectorTiming;
  timingReason: string;
  setup: string;
  payoff: string;
  involvedNodeIds: string[];
  guardrails: string[];
  trace: {
    traceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.story-director-proposal.v1";
    outputHash: string;
  };
  fallbackApplied: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim() && [...value].length <= maximum ? value.trim() : null;
}

function parseResponse(value: unknown): StoryDirectorResponse | null {
  if (!isRecord(value)) return null;
  const timing = text(value.timing, 30);
  if (!timing || !["next_scene", "near_arc", "later_arc", "conditional"].includes(timing)) return null;
  const trace = value.trace;
  if (!isRecord(trace) || trace.workflowVersion !== "vnext.story-director-proposal.v1" || trace.fallbackApplied === true) return null;
  const traceId = text(trace.traceId, 200);
  const provider = text(trace.provider, 100);
  const model = text(trace.model, 100);
  const workflowVersion = trace.workflowVersion;
  const outputHash = text(trace.outputHash, 200);
  if (!traceId || !provider || !model || workflowVersion !== "vnext.story-director-proposal.v1" || !outputHash || value.fallbackApplied !== false) return null;
  const involvedNodeIds = value.involvedNodeIds;
  const guardrails = value.guardrails;
  if (!Array.isArray(involvedNodeIds) || involvedNodeIds.length > 8 || involvedNodeIds.some((item) => !text(item, 100))) return null;
  if (!Array.isArray(guardrails) || guardrails.length > 8 || guardrails.some((item) => !text(item, 500))) return null;
  const title = text(value.title, 200);
  const proposal = text(value.proposal, 2_000);
  const timingReason = text(value.timingReason, 800);
  const setup = text(value.setup, 1_200);
  const payoff = text(value.payoff, 1_200);
  if (!title || !proposal || !timingReason || !setup || !payoff) return null;
  return {
    title,
    proposal,
    timing: timing as StoryDirectorTiming,
    timingReason,
    setup,
    payoff,
    involvedNodeIds: involvedNodeIds as string[],
    guardrails: guardrails as string[],
    trace: { traceId, provider, model, workflowVersion, outputHash },
    fallbackApplied: false,
  };
}

export async function proposeStoryDirector(input: StoryDirectorRequest): Promise<StoryDirectorResponse> {
  const response = await fetch("/api/vnext/world-lab/director/proposals", {
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
  if (!parsed) throw worldLabRequestError(null, "invalid_runtime_output", response);
  return parsed;
}
