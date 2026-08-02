import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, HttpException, Inject, Injectable, Logger, Param, Post, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ConfiguredWorldLabRuntimeAdapter, type GenerateWorldLabTurnInput } from "../infrastructure/configured-world-lab-runtime.adapter.js";
import { ConfiguredManuscriptImportRuntimeAdapter, type AnalyzeManuscriptInput } from "../infrastructure/configured-manuscript-import-runtime.adapter.js";
import { ConfiguredForecastSandboxRuntimeAdapter, type RunForecastSandboxInput } from "../infrastructure/configured-forecast-sandbox-runtime.adapter.js";
import { ConfiguredStoryDirectorRuntimeAdapter, type ProposeStoryDirectorInput } from "../infrastructure/configured-story-director-runtime.adapter.js";
import { ConfiguredStoryDirectorLibraryRuntimeAdapter, type DirectorJokeIntent, type DirectorLibraryKind, type DistillStoryDirectorLibraryInput } from "../infrastructure/configured-story-director-library-runtime.adapter.js";
import { ConfiguredPrologueRuntimeAdapter, type GeneratePrologueLifeInput, type PrologueIdentity } from "../infrastructure/configured-prologue-runtime.adapter.js";
import { ConfiguredPrologueSceneRuntimeAdapter, type GeneratePrologueSceneInput, type PrologueScenePhase, type PrologueSceneIdentity } from "../infrastructure/configured-prologue-scene-runtime.adapter.js";
import { ConfiguredImageGenerationRuntimeAdapter, type GenerateImageInput } from "../infrastructure/configured-image-generation-runtime.adapter.js";
import { ConfiguredImageGenerationJobService } from "../infrastructure/configured-image-generation-job.service.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";

interface StreamResponse {
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): boolean;
  end(): void;
  status(code: number): StreamResponse;
  json(body: unknown): void;
}

interface WorldLabResponseHeaders {
  setHeader(name: string, value: string): void;
}

const worldLabRuntimeLogger = new Logger("VnextWorldLabRuntime");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestIdFor(body: unknown) {
  if (isRecord(body) && typeof body.requestId === "string") {
    const requestId = body.requestId.trim();
    if (requestId.length > 0 && [...requestId].length <= 200) return requestId;
  }
  return `untracked-${randomUUID()}`;
}

function beginWorldLabRequest(body: unknown, response: WorldLabResponseHeaders) {
  const requestId = requestIdFor(body);
  response.setHeader("X-Request-Id", requestId);
  return requestId;
}

function errorCodeFor(error: unknown) {
  if (error instanceof HttpException) {
    const payload = error.getResponse();
    if (isRecord(payload) && typeof payload.code === "string") return payload.code;
    return `http_${error.getStatus()}`;
  }
  return error instanceof Error ? error.message : "provider_unavailable";
}

function normalizeRuntimeFailure(error: unknown) {
  const rawCode = errorCodeFor(error);
  const failure = rawCode === "invalid_request"
    ? { code: "invalid_request", status: 400 }
    : rawCode === "provider_rate_limited"
      ? { code: "provider_rate_limited", status: 429 }
      : rawCode === "provider_timeout"
        ? { code: "provider_timeout", status: 504 }
        : rawCode === "stream_unsupported"
          ? { code: "stream_unsupported", status: 501 }
          : rawCode === "provider_request_rejected"
            ? { code: "provider_request_rejected", status: 502 }
            : rawCode === "provider_auth_failed"
              ? { code: "provider_auth_failed", status: 502 }
              : rawCode.startsWith("invalid_runtime_output")
                ? { code: "invalid_runtime_output", status: 502 }
                : { code: "provider_unavailable", status: 503 };
  const reason = rawCode.startsWith("invalid_runtime_output:")
    ? rawCode.slice("invalid_runtime_output:".length).slice(0, 240)
    : undefined;
  return { ...failure, reason };
}

function runtimeFailurePayload(failure: ReturnType<typeof normalizeRuntimeFailure>, requestId: string) {
  return {
    code: failure.code,
    ...(failure.reason ? { reason: failure.reason } : {}),
    requestId,
  };
}

function logWorldLabFailure(workflow: string, requestId: string, error: unknown, status: number) {
  const failure = normalizeRuntimeFailure(error);
  worldLabRuntimeLogger.warn(JSON.stringify({
    event: "world_lab_runtime_failure",
    workflow,
    requestId,
    code: failure.code,
    ...(failure.reason ? { reason: failure.reason } : {}),
    status,
    errorClass: error instanceof Error ? error.name : "unknown",
  }));
}

function withRequestId(error: HttpException, requestId: string) {
  const payload = error.getResponse();
  return new HttpException(
    isRecord(payload) ? { ...payload, requestId } : { code: "invalid_request", requestId },
    error.getStatus(),
  );
}

// This is a per-turn validation budget, not a world or graph size limit. The
// client projects the most relevant nodes before sending a turn request.
const MAX_WORLD_LAB_NODES_PER_TURN = 100;
const TURN_NODE_KINDS = ["character", "place", "faction", "object", "event"] as const;
const TURN_NODE_KIND_ALIASES: Readonly<Record<string, typeof TURN_NODE_KINDS[number]>> = {
  person: "character",
  human: "character",
  protagonist: "character",
  actor: "character",
  location: "place",
  setting: "place",
  environment: "place",
  region: "place",
  area: "place",
  organization: "faction",
  group: "faction",
  institution: "faction",
  clan: "faction",
  sect: "faction",
  artifact: "object",
  item: "object",
  prop: "object",
  equipment: "object",
  incident: "event",
  occurrence: "event",
  action: "event",
  plot_event: "event",
  scene_event: "event",
};
const TURN_MEMORY_KINDS = ["character_state", "relationship", "timeline", "item", "foreshadowing", "promise"] as const;
const TURN_MEMORY_KIND_ALIASES: Readonly<Record<string, typeof TURN_MEMORY_KINDS[number]>> = {
  character: "character_state",
  character_status: "character_state",
  state: "character_state",
  status: "character_state",
  relation: "relationship",
  bond: "relationship",
  connection: "relationship",
  chronology: "timeline",
  temporal: "timeline",
  time: "timeline",
  object: "item",
  artifact: "item",
  possession: "item",
  foreshadow: "foreshadowing",
  hint: "foreshadowing",
  clue: "foreshadowing",
  setup: "foreshadowing",
  open_loop: "promise",
  plot_promise: "promise",
  payoff_promise: "promise",
  unresolved_promise: "promise",
};
const TURN_MEMORY_STATUS_ALIASES: Readonly<Record<string, "active" | "resolved">> = {
  ongoing: "active",
  open: "active",
  pending: "active",
  provisional: "active",
  candidate: "active",
  unresolved: "active",
  current: "active",
  closed: "resolved",
  complete: "resolved",
  completed: "resolved",
  done: "resolved",
};

@Injectable()
export class VnextWorldLabInternalTestGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.VNEXT_WORLD_LAB_INTERNAL_TEST_MODE !== "true"
    ) {
      return false;
    }
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const address = request.ip ?? request.socket?.remoteAddress ?? "";
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  }
}

function memoryText(value: unknown, max: number) {
  if (typeof value !== "string" || [...value].length > max) throw new HttpException({ code: "invalid_request" }, 400);
  return value;
}

function invalidTurnRequest(reason: string): never {
  throw new HttpException({ code: "invalid_request", reason }, 400);
}

function canonicalTurnNodeKind(value: unknown) {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  return (TURN_NODE_KINDS as readonly string[]).includes(token)
    ? token as typeof TURN_NODE_KINDS[number]
    : TURN_NODE_KIND_ALIASES[token];
}

function canonicalTurnMemoryKind(value: unknown) {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  return (TURN_MEMORY_KINDS as readonly string[]).includes(token)
    ? token as typeof TURN_MEMORY_KINDS[number]
    : TURN_MEMORY_KIND_ALIASES[token];
}

function canonicalTurnMemoryStatus(value: unknown) {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  if (token === "active" || token === "resolved") return token;
  return TURN_MEMORY_STATUS_ALIASES[token];
}

function memoryTextAllowEmpty(value: unknown, max: number) {
  if (value === undefined) return "";
  if (typeof value !== "string" || [...value].length > max) throw new HttpException({ code: "invalid_request" }, 400);
  return value;
}

function parseBranchMemory(value: unknown, nodeIds: Set<string>): GenerateWorldLabTurnInput["branchMemory"] {
  if (value === undefined) value = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const memory = value as Record<string, unknown>;
  const branchId = memoryText(memory.branchId ?? "active-branch", 200);
  const headTurnId = memoryText(memory.headTurnId ?? "unknown-head", 200);
  const boundedArray = (key: string, maximum: number) => {
    const candidate = memory[key];
    if (candidate === undefined) return [] as unknown[];
    if (!Array.isArray(candidate)) return [] as unknown[];
    return candidate.slice(-maximum);
  };
  const checkpointTrailInput = boundedArray("checkpointTrail", 12);
  const recentScenesInput = boundedArray("recentScenes", 3);
  const factsInput = boundedArray("facts", 24);
  const openThreadsInput = boundedArray("openThreads", 5);
  const retrievedLedgerInput = boundedArray("retrievedLedger", 12);
  const rawLedgerStatsInput = memory.ledgerStats;
  const checkpointTrail = checkpointTrailInput.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    try {
      const checkpoint = item as Record<string, unknown>;
      return [{
        checkpointId: memoryText(checkpoint.checkpointId, 200),
        title: memoryText(checkpoint.title, 200),
        turnId: memoryText(checkpoint.turnId, 200),
      }];
    } catch {
      return [];
    }
  });
  const recentScenes = recentScenesInput.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    try {
      const scene = item as Record<string, unknown>;
      return [{
        turnId: memoryText(scene.turnId, 200),
        action: memoryText(scene.action, 240),
        scene: memoryText(scene.scene, 1_200),
      }];
    } catch {
      return [];
    }
  });
  const facts = factsInput.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const fact = item as Record<string, unknown>;
    try {
      const targetNodeId = memoryText(fact.targetNodeId, 200);
      if (!nodeIds.has(targetNodeId)) return [];
      return [{
        targetNodeId,
        label: memoryText(fact.label, 120),
        value: memoryText(fact.value, 500),
        sourceTurnId: memoryText(fact.sourceTurnId, 200),
      }];
    } catch {
      return [];
    }
  });
  const openThreads = openThreadsInput.flatMap((item) => {
    try { return [memoryText(item, 240)]; } catch { return []; }
  });
  const rawLedgerStats = rawLedgerStatsInput && typeof rawLedgerStatsInput === "object" && !Array.isArray(rawLedgerStatsInput)
    ? rawLedgerStatsInput as Record<string, unknown>
    : {};
  const ledgerStats = Object.fromEntries(TURN_MEMORY_KINDS.map((kind) => {
    const value = rawLedgerStats[kind];
    if (value === undefined) return [kind, 0];
    return [kind, Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000 ? value as number : 0];
  })) as GenerateWorldLabTurnInput["branchMemory"]["ledgerStats"];
  const retrievedLedger = retrievedLedgerInput.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    try {
      const entry = item as Record<string, unknown>;
      const kind = canonicalTurnMemoryKind(entry.kind);
      const status = canonicalTurnMemoryStatus(entry.status);
      if (!kind || !status || !Array.isArray(entry.relevantNodeIds) || !Number.isSafeInteger(entry.updatedAtOrder) || (entry.updatedAtOrder as number) < 0) return [];
      const relevantNodeIds = entry.relevantNodeIds.slice(0, 5).flatMap((nodeId) => {
        try {
          const id = memoryText(nodeId, 200);
          return nodeIds.has(id) ? [id] : [];
        } catch {
          return [];
        }
      });
      return [{
        id: memoryText(entry.id, 200),
        kind,
        key: memoryText(entry.key, 160),
        value: memoryText(entry.value, 800),
        status,
        relevantNodeIds,
        sourceTurnId: memoryText(entry.sourceTurnId, 200),
        updatedAtOrder: entry.updatedAtOrder as number,
      }];
    } catch {
      return [];
    }
  });
  return {
    branchId,
    headTurnId,
    checkpointTrail,
    // The first interactive turn has no earlier path by design. An empty
    // summary is valid sparse memory, not a malformed request.
    earlierSummary: memoryTextAllowEmpty(memory.earlierSummary, 2_400),
    recentScenes,
    facts,
    openThreads,
    ledgerStats,
    retrievedLedger,
  };
}

function parseRequest(value: unknown): GenerateWorldLabTurnInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidTurnRequest("turn 请求体必须是对象");
  const input = value as Record<string, unknown>;
  const strings = ["requestId", "storyTitle", "genre", "currentScene", "selectedAction"] as const;
  for (const key of strings) {
    if (typeof input[key] !== "string" || !(input[key] as string).trim() || [...(input[key] as string)].length > 10_000) {
      invalidTurnRequest(`turn.${key} 必须是非空字符串，且不超过 10000 字符`);
    }
  }
  if (!Number.isSafeInteger(input.depth) || (input.depth as number) < 0 || (input.depth as number) > 1_000) {
    invalidTurnRequest("turn.depth 必须是 0 到 1000 之间的整数");
  }
  if (!Array.isArray(input.nodes) || input.nodes.length < 1) invalidTurnRequest("turn.nodes 至少需要一个世界节点");
  const nodes = input.nodes.slice(0, MAX_WORLD_LAB_NODES_PER_TURN).flatMap((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const node = item as Record<string, unknown>;
    const kind = canonicalTurnNodeKind(node.kind);
    if (typeof node.id !== "string" || typeof node.label !== "string" || !kind) return [];
    return [{ id: node.id, label: node.label, kind }];
  });
  if (nodes.length === 0) invalidTurnRequest("turn.nodes 中没有可识别的节点；节点类型应为 character/place/faction/object/event");
  if (!Array.isArray(input.accumulatedPreferences) || input.accumulatedPreferences.some((item) => typeof item !== "string")) {
    invalidTurnRequest("turn.accumulatedPreferences 必须是字符串数组");
  }
  const branchMemory = parseBranchMemory(input.branchMemory, new Set(nodes.map((node) => node.id)));
  return {
    requestId: input.requestId as string,
    storyTitle: input.storyTitle as string,
    genre: input.genre as string,
    currentScene: input.currentScene as string,
    selectedAction: input.selectedAction as string,
    depth: input.depth as number,
    nodes,
    accumulatedPreferences: input.accumulatedPreferences as string[],
    branchMemory,
  };
}

function parseManuscriptImportRequest(value: unknown): AnalyzeManuscriptInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const title = memoryText(input.title, 200);
  const filename = memoryText(input.filename, 255);
  const selectedChapterTitle = memoryText(input.selectedChapterTitle, 200);
  const rawSelectedChapterIds = input.selectedChapterIds;
  const selectedChapterIds = rawSelectedChapterIds === undefined ? [] : rawSelectedChapterIds;
  const analysisText = memoryText(input.analysisText, 48_000);
  const analysisMode = input.analysisMode === undefined ? "initial" : memoryText(input.analysisMode, 20);
  const format = memoryText(input.format, 20);
  const sha256 = memoryText(input.sha256, 64);
  if (!requestId || !title || !filename || !selectedChapterTitle || !analysisText || !["initial", "enrichment"].includes(analysisMode) || !["txt", "markdown"].includes(format) || !/^[a-f0-9]{64}$/u.test(sha256) || input.rightsAttested !== true || !Array.isArray(selectedChapterIds) || selectedChapterIds.length > 64 || selectedChapterIds.some((id) => typeof id !== "string" || !id.trim() || [...id].length > 200)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  if (input.knownNodes !== undefined && (!Array.isArray(input.knownNodes) || input.knownNodes.length > 400)) throw new HttpException({ code: "invalid_request" }, 400);
  const knownNodes = (Array.isArray(input.knownNodes) ? input.knownNodes : []).map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
    const node = value as Record<string, unknown>;
    const key = memoryText(node.key, 80);
    const label = memoryText(node.label, 100);
    const kind = memoryText(node.kind, 20);
    if (!key || !label || !["character", "place", "faction", "object", "event"].includes(kind) || typeof node.isProtagonist !== "boolean") throw new HttpException({ code: "invalid_request" }, 400);
    return { key, label, kind: kind as AnalyzeManuscriptInput["knownNodes"][number]["kind"], isProtagonist: node.isProtagonist };
  });
  return {
    requestId,
    title,
    filename,
    selectedChapterTitle,
    selectedChapterIds: selectedChapterIds as string[],
    analysisText,
    analysisMode: analysisMode as AnalyzeManuscriptInput["analysisMode"],
    knownNodes,
    format: format as AnalyzeManuscriptInput["format"],
    sha256,
    rightsAttested: true,
  };
}

function parseForecastSandboxRequest(value: unknown): RunForecastSandboxInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const storyId = memoryText(input.storyId, 200);
  const storyTitle = memoryText(input.storyTitle, 200);
  const genre = memoryText(input.genre, 100);
  const sourceBranchId = memoryText(input.sourceBranchId, 200);
  const sourceTurnId = memoryText(input.sourceTurnId, 200);
  const sourceScene = memoryText(input.sourceScene, 6_000);
  const event = memoryText(input.event, 1_000);
  if (![requestId, storyId, storyTitle, genre, sourceBranchId, sourceTurnId, sourceScene, event].every((item) => item.trim())) throw new HttpException({ code: "invalid_request" }, 400);
  if (!Array.isArray(input.publicFacts) || input.publicFacts.length > 20) throw new HttpException({ code: "invalid_request" }, 400);
  const publicFacts = input.publicFacts.map((fact) => memoryText(fact, 600));
  if (!Array.isArray(input.worldNodes) || input.worldNodes.length < 3 || input.worldNodes.length > 100) throw new HttpException({ code: "invalid_request" }, 400);
  const worldNodes = input.worldNodes.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new HttpException({ code: "invalid_request" }, 400);
    const node = item as Record<string, unknown>;
    const id = memoryText(node.id, 100);
    const label = memoryText(node.label, 100);
    const kind = memoryText(node.kind, 20);
    if (!id || !label || !["character", "place", "faction", "object", "event"].includes(kind)) throw new HttpException({ code: "invalid_request" }, 400);
    return { id, label, kind };
  });
  const nodeById = new Map(worldNodes.map((node) => [node.id, node]));
  if (nodeById.size !== worldNodes.length || !Array.isArray(input.actors) || input.actors.length !== 3) throw new HttpException({ code: "invalid_request" }, 400);
  const actors = input.actors.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new HttpException({ code: "invalid_request" }, 400);
    const actor = item as Record<string, unknown>;
    const nodeId = memoryText(actor.nodeId, 100);
    const name = memoryText(actor.name, 100);
    const role = memoryText(actor.role, 120);
    const profileSummary = memoryText(actor.profileSummary, 2_400);
    const node = nodeById.get(nodeId);
    if (!nodeId || !name || !role || !profileSummary || node?.kind !== "character") throw new HttpException({ code: "invalid_request" }, 400);
    if (!Array.isArray(actor.visibleRelations) || actor.visibleRelations.length > 12 || !Array.isArray(actor.knownMemories) || actor.knownMemories.length > 12) throw new HttpException({ code: "invalid_request" }, 400);
    return {
      nodeId,
      name,
      role,
      profileSummary,
      visibleRelations: actor.visibleRelations.map((relation) => memoryText(relation, 300)),
      knownMemories: actor.knownMemories.map((memory) => memoryText(memory, 800)),
    };
  });
  if (new Set(actors.map((actor) => actor.nodeId)).size !== 3) throw new HttpException({ code: "invalid_request" }, 400);
  return {
    requestId,
    storyId,
    storyTitle,
    genre,
    sourceBranchId,
    sourceTurnId,
    sourceScene,
    event,
    publicFacts,
    worldNodes,
    actors: actors as unknown as RunForecastSandboxInput["actors"],
  };
}

function parseStoryDirectorRequest(value: unknown): ProposeStoryDirectorInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const storyId = memoryText(input.storyId, 200);
  const storyTitle = memoryText(input.storyTitle, 200);
  const genre = memoryText(input.genre, 100);
  const sourceBranchId = memoryText(input.sourceBranchId, 200);
  const sourceTurnId = memoryText(input.sourceTurnId, 200);
  const currentScene = memoryText(input.currentScene, 8_000);
  const userRequest = memoryText(input.userRequest, 2_000);
  if (![requestId, storyId, storyTitle, genre, sourceBranchId, sourceTurnId, currentScene, userRequest].every((item) => item.trim())) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  if (!Array.isArray(input.candidateNodes) || input.candidateNodes.length < 1 || input.candidateNodes.length > 12) throw new HttpException({ code: "invalid_request" }, 400);
  const candidateNodes = input.candidateNodes.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new HttpException({ code: "invalid_request" }, 400);
    const node = item as Record<string, unknown>;
    const id = memoryText(node.id, 200);
    const label = memoryText(node.label, 160);
    const kind = memoryText(node.kind, 20);
    const summary = memoryText(node.summary, 800);
    if (!id || !label || !summary || !["character", "place", "faction", "object", "event"].includes(kind)) throw new HttpException({ code: "invalid_request" }, 400);
    return { id, label, kind, summary };
  });
  if (new Set(candidateNodes.map((node) => node.id)).size !== candidateNodes.length) throw new HttpException({ code: "invalid_request" }, 400);
  const list = (key: string, maxItems: number, maxText: number) => {
    if (!Array.isArray(input[key]) || input[key].length > maxItems) throw new HttpException({ code: "invalid_request" }, 400);
    return (input[key] as unknown[]).map((item) => memoryText(item, maxText));
  };
  return {
    requestId,
    storyId,
    storyTitle,
    genre,
    sourceBranchId,
    sourceTurnId,
    currentScene,
    userRequest,
    candidateNodes,
    unresolvedThreads: list("unresolvedThreads", 12, 500),
    recentScenes: list("recentScenes", 4, 1_500),
    activeProposals: list("activeProposals", 8, 600),
    referenceMaterials: input.referenceMaterials === undefined ? [] : list("referenceMaterials", 8, 800),
  };
}

function parseStoryDirectorLibraryRequest(value: unknown): DistillStoryDirectorLibraryInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const kind = memoryText(input.kind, 20);
  const storyId = memoryText(input.storyId, 200);
  const storyTitle = memoryText(input.storyTitle, 200);
  const genre = memoryText(input.genre, 100);
  const sourceBranchId = memoryText(input.sourceBranchId, 200);
  const sourceTurnId = memoryText(input.sourceTurnId, 200);
  const currentScene = memoryText(input.currentScene, 8_000);
  const userInput = memoryText(input.userInput, 2_000);
  if (![requestId, storyId, storyTitle, genre, sourceBranchId, sourceTurnId, currentScene, userInput].every((item) => item.trim()) || !["knowledge", "craft", "joke"].includes(kind)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  const selectedNodeIds = input.selectedNodeIds === undefined ? [] : input.selectedNodeIds;
  if (!Array.isArray(selectedNodeIds) || selectedNodeIds.length > 8) throw new HttpException({ code: "invalid_request" }, 400);
  const parsedSelectedNodeIds = selectedNodeIds.map((item) => memoryText(item, 200));
  if (new Set(parsedSelectedNodeIds).size !== parsedSelectedNodeIds.length) throw new HttpException({ code: "invalid_request" }, 400);
  const candidateNodes = input.candidateNodes === undefined ? [] : input.candidateNodes;
  if (!Array.isArray(candidateNodes) || candidateNodes.length > 12) throw new HttpException({ code: "invalid_request" }, 400);
  const parsedCandidateNodes = candidateNodes.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new HttpException({ code: "invalid_request" }, 400);
    const node = item as Record<string, unknown>;
    const id = memoryText(node.id, 200);
    const label = memoryText(node.label, 160);
    const nodeKind = memoryText(node.kind, 20);
    const summary = memoryText(node.summary, 800);
    if (!id || !label || !summary || !["character", "place", "faction", "object", "event"].includes(nodeKind)) throw new HttpException({ code: "invalid_request" }, 400);
    return { id, label, kind: nodeKind, summary };
  });
  if (new Set(parsedCandidateNodes.map((node) => node.id)).size !== parsedCandidateNodes.length || parsedSelectedNodeIds.some((id) => !parsedCandidateNodes.some((node) => node.id === id))) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  if (!Array.isArray(input.recentScenes) || input.recentScenes.length > 4) throw new HttpException({ code: "invalid_request" }, 400);
  const recentScenes = input.recentScenes.map((item) => memoryText(item, 1_500));
  const jokeIntent = input.jokeIntent === undefined ? undefined : memoryText(input.jokeIntent, 30);
  if (kind === "joke" && jokeIntent !== undefined && !["library_only", "opportunistic", "plot_seed"].includes(jokeIntent)) throw new HttpException({ code: "invalid_request" }, 400);
  return {
    requestId,
    kind: kind as DirectorLibraryKind,
    storyId,
    storyTitle,
    genre,
    sourceBranchId,
    sourceTurnId,
    currentScene,
    userInput,
    selectedNodeIds: parsedSelectedNodeIds,
    candidateNodes: parsedCandidateNodes,
    recentScenes,
    ...(kind === "joke" && jokeIntent ? { jokeIntent: jokeIntent as DirectorJokeIntent } : {}),
  };
}

function parsePrologueLifeRequest(value: unknown): GeneratePrologueLifeInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const sessionSeed = memoryText(input.sessionSeed, 200);
  const originArchetype = memoryText(input.originArchetype, 20);
  if (!requestId || !sessionSeed || !["student", "office", "court", "cultivator"].includes(originArchetype)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  return {
    requestId,
    sessionSeed,
    originArchetype: originArchetype as PrologueIdentity,
  };
}

function parsePrologueSceneRequest(value: unknown): GeneratePrologueSceneInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const sessionSeed = memoryText(input.sessionSeed, 200);
  const originArchetype = memoryText(input.originArchetype, 20);
  const phase = memoryText(input.phase, 20);
  if (!requestId || !sessionSeed || !["student", "office", "court", "cultivator"].includes(originArchetype) || !["one", "two", "climax"].includes(phase)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  if (!Array.isArray(input.previousScenes) || input.previousScenes.length > 2) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  const previousScenes = input.previousScenes.map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
    const scene = value as Record<string, unknown>;
    const previousPhase = memoryText(scene.phase, 20);
    if (!["one", "two", "climax"].includes(previousPhase)) throw new HttpException({ code: "invalid_request" }, 400);
    return { phase: previousPhase as PrologueScenePhase, text: memoryText(scene.text, 1_600) };
  });
  const assetContext = input.assetContext === undefined ? undefined : memoryText(input.assetContext, 1_200);
  return {
    requestId,
    sessionSeed,
    originArchetype: originArchetype as PrologueSceneIdentity,
    phase: phase as PrologueScenePhase,
    previousScenes,
    ...(assetContext === undefined ? {} : { assetContext }),
  };
}

const MAX_REFERENCE_IMAGE_DATA_URL_CODE_POINTS = 24_000_000;
const MAX_REFERENCE_IMAGE_BYTES = 18_000_000;

function parseImageAsset(value: unknown, defaultFileName: string): GenerateImageInput["referenceImage"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  const input = value as Record<string, unknown>;
  const dataUrl = memoryText(input.dataUrl, MAX_REFERENCE_IMAGE_DATA_URL_CODE_POINTS);
  const fileName = memoryText(input.fileName ?? defaultFileName, 160).replace(/[^a-zA-Z0-9._-]/g, "_") || defaultFileName;
  const match = /^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl);
  if (!match) throw new HttpException({ code: "invalid_request" }, 400);
  const mimeType = match[1];
  const encoded = match[2];
  if (!mimeType || !encoded) throw new HttpException({ code: "invalid_request" }, 400);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_REFERENCE_IMAGE_BYTES) throw new HttpException({ code: "invalid_request" }, 400);
  return {
    fileName,
    mimeType: mimeType as NonNullable<GenerateImageInput["referenceImage"]>["mimeType"],
    bytes,
  };
}

function parseReferenceImage(value: unknown) {
  return parseImageAsset(value, "reference.png");
}

function parseMaskImage(value: unknown) {
  return parseImageAsset(value, "mask.png");
}

function parseImageGenerationRequest(value: unknown): GenerateImageInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpException({ code: "invalid_request" }, 400);
  const input = value as Record<string, unknown>;
  const requestId = memoryText(input.requestId, 200);
  const prompt = memoryText(input.prompt, 32_000);
  const size = input.size === undefined ? "1536x1024" : memoryText(input.size, 20);
  const quality = input.quality === undefined ? "medium" : memoryText(input.quality, 10);
  const referenceImage = input.referenceImage === undefined ? undefined : parseReferenceImage(input.referenceImage);
  const mask = input.mask === undefined ? undefined : parseMaskImage(input.mask);
  if (mask && !referenceImage) throw new HttpException({ code: "invalid_request" }, 400);
  if (!requestId || !prompt || !["1024x1024", "1536x1024", "1024x1536"].includes(size) || !["low", "medium", "high"].includes(quality)) {
    throw new HttpException({ code: "invalid_request" }, 400);
  }
  return {
    requestId,
    prompt,
    size: size as GenerateImageInput["size"],
    quality: quality as GenerateImageInput["quality"],
    ...(referenceImage ? { referenceImage } : {}),
    ...(mask ? { mask } : {}),
  };
}

@Controller("vnext")
export class VnextWorldLabController {
  constructor(@Inject(ConfiguredImageGenerationJobService) private readonly imageGenerationJobs: ConfiguredImageGenerationJobService) {}

  @Post("world-lab/images/jobs")
  @HttpCode(202)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async queueImage(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const input = parseImageGenerationRequest(body);
    const job = await this.imageGenerationJobs.submit(input);
    response.setHeader("Location", job.statusUrl);
    return job;
  }

  @Get("world-lab/images/jobs/:jobId/asset")
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async readImageAsset(@Param("jobId") jobId: string, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const asset = await this.imageGenerationJobs.readAsset(jobId);
    if (asset === null) {
      const job = await this.imageGenerationJobs.get(jobId);
      if (job === null) throw new HttpException({ code: "image_job_not_found" }, 404);
      throw new HttpException({ code: "image_not_ready", status: job.status }, 409);
    }
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Content-Length", String(asset.byteLength));
    return new StreamableFile(asset, { type: "image/png", length: asset.byteLength });
  }

  @Get("world-lab/images/jobs/:jobId")
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async readImageJob(@Param("jobId") jobId: string, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const job = await this.imageGenerationJobs.get(jobId);
    if (job === null) throw new HttpException({ code: "image_job_not_found" }, 404);
    return job;
  }

  @Post("world-lab/images/generate")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async generateImage(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    try {
      const input = parseImageGenerationRequest(body);
      return await new ConfiguredImageGenerationRuntimeAdapter().generate(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = error instanceof Error ? error.message : "provider_unavailable";
      throw new HttpException(
        { code: ["provider_timeout", "invalid_runtime_output"].includes(code) ? code : "provider_unavailable" },
        code === "provider_timeout" ? 504 : code === "invalid_runtime_output" ? 502 : 503,
      );
    }
  }

  @Post("prologue/scene")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async generatePrologueScene(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    try {
      const input = parsePrologueSceneRequest(body);
      return await new ConfiguredPrologueSceneRuntimeAdapter().generateScene(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = error instanceof Error ? error.message : "provider_unavailable";
      throw new HttpException(
        { code: ["provider_timeout", "invalid_runtime_output"].includes(code) ? code : "provider_unavailable" },
        code === "provider_timeout" ? 504 : code === "invalid_runtime_output" ? 502 : 503,
      );
    }
  }

  @Post("prologue/life")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async generatePrologueLife(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    try {
      const input = parsePrologueLifeRequest(body);
      return await new ConfiguredPrologueRuntimeAdapter().generateLife(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = error instanceof Error ? error.message : "provider_unavailable";
      throw new HttpException(
        { code: ["provider_timeout", "invalid_runtime_output"].includes(code) ? code : "provider_unavailable" },
        code === "provider_timeout" ? 504 : code === "invalid_runtime_output" ? 502 : 503,
      );
    }
  }

  @Post("world-lab/forecasts/run")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async runForecast(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const requestId = beginWorldLabRequest(body, response);
    try {
      const input = parseForecastSandboxRequest(body);
      return await new ConfiguredForecastSandboxRuntimeAdapter().run(input);
    } catch (error) {
      if (error instanceof HttpException) {
        logWorldLabFailure("world-lab.forecast", requestId, error, error.getStatus());
        throw withRequestId(error, requestId);
      }
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.forecast", requestId, error, failure.status);
      throw new HttpException(runtimeFailurePayload(failure, requestId), failure.status);
    }
  }

  @Post("world-lab/director/proposals")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async proposeStoryDirector(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const requestId = beginWorldLabRequest(body, response);
    try {
      const input = parseStoryDirectorRequest(body);
      return await new ConfiguredStoryDirectorRuntimeAdapter().propose(input);
    } catch (error) {
      if (error instanceof HttpException) {
        logWorldLabFailure("world-lab.director.proposal", requestId, error, error.getStatus());
        throw withRequestId(error, requestId);
      }
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.director.proposal", requestId, error, failure.status);
      throw new HttpException(runtimeFailurePayload(failure, requestId), failure.status);
    }
  }

  @Post("world-lab/imports/analyze")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async analyzeImport(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const requestId = beginWorldLabRequest(body, response);
    try {
      const input = parseManuscriptImportRequest(body);
      return await new ConfiguredManuscriptImportRuntimeAdapter().analyze(input);
    } catch (error) {
      if (error instanceof HttpException) {
        logWorldLabFailure("world-lab.manuscript-import", requestId, error, error.getStatus());
        throw withRequestId(error, requestId);
      }
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.manuscript-import", requestId, error, failure.status);
      throw new HttpException(runtimeFailurePayload(failure, requestId), failure.status);
    }
  }

  @Post("world-lab/turns")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async generateTurn(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const requestId = beginWorldLabRequest(body, response);
    try {
      const input = parseRequest(body);
      return await new ConfiguredWorldLabRuntimeAdapter().generateTurn(input);
    } catch (error) {
      if (error instanceof HttpException) {
        logWorldLabFailure("world-lab.turn", requestId, error, error.getStatus());
        throw withRequestId(error, requestId);
      }
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.turn", requestId, error, failure.status);
      throw new HttpException(runtimeFailurePayload(failure, requestId), failure.status);
    }
  }

  @Post("world-lab/turns/stream")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async streamTurn(@Body() body: unknown, @Res() response: StreamResponse) {
    const requestId = beginWorldLabRequest(body, response);
    let input: GenerateWorldLabTurnInput;
    try {
      input = parseRequest(body);
    } catch (error) {
      logWorldLabFailure("world-lab.turn.stream", requestId, error, 400);
      const errorPayload = error instanceof HttpException ? error.getResponse() : null;
      const payload = isRecord(errorPayload)
        ? { ...errorPayload, requestId }
        : { code: "invalid_request", requestId };
      response.status(400).json(payload);
      return;
    }
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    try {
      for await (const event of new ConfiguredWorldLabRuntimeAdapter().streamTurn(input)) {
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.turn.stream", requestId, error, failure.status);
      if (!response.headersSent) {
        response.status(failure.status).json(runtimeFailurePayload(failure, requestId));
        return;
      }
      response.write(`event: error\ndata: ${JSON.stringify({ type: "error", ...runtimeFailurePayload(failure, requestId) })}\n\n`);
    } finally {
      response.end();
    }
  }

  @Post("world-lab/director/library")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextWorldLabInternalTestGuard)
  async distillStoryDirectorLibrary(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    response.setHeader("Cache-Control", "no-store");
    const requestId = beginWorldLabRequest(body, response);
    try {
      const input = parseStoryDirectorLibraryRequest(body);
      const result = await new ConfiguredStoryDirectorLibraryRuntimeAdapter().distill(input);
      return { ...result.output, kind: result.kind, notCanon: result.notCanon, notManuscript: result.notManuscript, trace: result.trace, fallbackApplied: result.fallbackApplied };
    } catch (error) {
      if (error instanceof HttpException) {
        logWorldLabFailure("world-lab.director.library", requestId, error, error.getStatus());
        throw withRequestId(error, requestId);
      }
      const failure = normalizeRuntimeFailure(error);
      logWorldLabFailure("world-lab.director.library", requestId, error, failure.status);
      throw new HttpException(runtimeFailurePayload(failure, requestId), failure.status);
    }
  }
}
