import {
  branchPath,
  composeBranchSparseMemory,
  forkInteractiveBranch,
  type BranchSparseMemory,
  type InteractiveStoryState,
} from "./interactive-branch";

export interface ForecastActorSimulation {
  nodeId: string;
  name: string;
  objective: string;
  moves: Array<{ round: 1 | 2 | 3; action: string; publicReason: string; expectedEffect: string }>;
  interviewAnswer: string;
}

export interface ForecastSandboxResult {
  id: string;
  sourceStoryId: string;
  sourceBranchId: string;
  sourceTurnId: string;
  event: string;
  createdAt: string;
  actors: ForecastActorSimulation[];
  rounds: Array<{
    round: 1 | 2 | 3;
    publicEvent: string;
    actions: Array<{ actorNodeId: string; action: string; outcome: string }>;
    resolution: string;
    stateChanges: Array<{ targetNodeId: string; label: string; before: string; after: string }>;
  }>;
  trajectories: Array<{
    id: string;
    title: string;
    summary: string;
    causalChain: string[];
    participatingActorNodeIds: string[];
    risk: "low" | "medium" | "high";
    branchIntent: string;
  }>;
  trace: {
    actorTraceIds: string[];
    adjudicatorTraceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.forecast-sandbox.v1";
    outputHash: string;
  };
  fallbackApplied: false;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= maximum;
}

function stringArray(value: unknown, maximumItems: number, maximumText: number) {
  return Array.isArray(value) && value.length <= maximumItems && value.every((item) => nonEmpty(item, maximumText));
}

export function validateForecastSandboxResult(value: unknown): ForecastSandboxResult | null {
  const output = record(value);
  if (!output || !nonEmpty(output.id, 100) || !nonEmpty(output.sourceStoryId, 200) || !nonEmpty(output.sourceBranchId, 200) || !nonEmpty(output.sourceTurnId, 200) || !nonEmpty(output.event, 1_000) || !nonEmpty(output.createdAt, 100) || !Number.isFinite(Date.parse(String(output.createdAt))) || output.fallbackApplied !== false) return null;
  if (!Array.isArray(output.actors) || output.actors.length !== 3 || !Array.isArray(output.rounds) || output.rounds.length !== 3 || !Array.isArray(output.trajectories) || output.trajectories.length !== 3) return null;
  const actors = output.actors as unknown[];
  if (!actors.every((item) => {
    const actor = record(item);
    if (!actor || !nonEmpty(actor.nodeId, 100) || !nonEmpty(actor.name, 100) || !nonEmpty(actor.objective, 500) || !nonEmpty(actor.interviewAnswer, 1_200) || !Array.isArray(actor.moves) || actor.moves.length !== 3) return false;
    return actor.moves.every((moveValue, index) => {
      const move = record(moveValue);
      return Boolean(move && move.round === index + 1 && nonEmpty(move.action, 500) && nonEmpty(move.publicReason, 500) && nonEmpty(move.expectedEffect, 500));
    });
  })) return null;
  const actorIds = new Set(actors.map((item) => String((item as Record<string, unknown>).nodeId)));
  if (actorIds.size !== 3) return null;
  if (!(output.rounds as unknown[]).every((item, index) => {
    const round = record(item);
    if (!round || round.round !== index + 1 || !nonEmpty(round.publicEvent, 1_000) || !nonEmpty(round.resolution, 1_500) || !Array.isArray(round.actions) || round.actions.length !== 3 || !Array.isArray(round.stateChanges) || round.stateChanges.length > 8) return false;
    const actionIds = new Set<string>();
    if (!round.actions.every((actionValue) => {
      const action = record(actionValue);
      if (!action || !nonEmpty(action.actorNodeId, 100) || !actorIds.has(String(action.actorNodeId)) || !nonEmpty(action.action, 500) || !nonEmpty(action.outcome, 700)) return false;
      actionIds.add(String(action.actorNodeId));
      return true;
    }) || actionIds.size !== 3) return false;
    return round.stateChanges.every((changeValue) => {
      const change = record(changeValue);
      return Boolean(change && nonEmpty(change.targetNodeId, 100) && nonEmpty(change.label, 160) && nonEmpty(change.before, 500) && nonEmpty(change.after, 500));
    });
  })) return null;
  if (!(output.trajectories as unknown[]).every((item) => {
    const trajectory = record(item);
    return Boolean(trajectory && nonEmpty(trajectory.id, 100) && nonEmpty(trajectory.title, 200) && nonEmpty(trajectory.summary, 1_500) && stringArray(trajectory.causalChain, 6, 500) && (trajectory.causalChain as unknown[]).length >= 3 && stringArray(trajectory.participatingActorNodeIds, 3, 100) && (trajectory.participatingActorNodeIds as unknown[]).length >= 1 && (trajectory.participatingActorNodeIds as string[]).every((id) => actorIds.has(id)) && ["low", "medium", "high"].includes(String(trajectory.risk)) && nonEmpty(trajectory.branchIntent, 1_000));
  })) return null;
  const trace = record(output.trace);
  if (!trace || !stringArray(trace.actorTraceIds, 3, 200) || (trace.actorTraceIds as unknown[]).length !== 3 || !nonEmpty(trace.adjudicatorTraceId, 200) || !nonEmpty(trace.provider, 100) || !nonEmpty(trace.model, 100) || trace.workflowVersion !== "vnext.forecast-sandbox.v1" || !/^[a-f0-9]{64}$/u.test(String(trace.outputHash))) return null;
  return output as unknown as ForecastSandboxResult;
}

export function composeForecastMemoryAtTurn(
  state: InteractiveStoryState,
  sourceBranchId: string,
  sourceTurnId: string,
  query: string,
  relevantNodeIds: readonly string[],
): BranchSparseMemory {
  const sourceBranch = state.branches.find((branch) => branch.id === sourceBranchId);
  if (!sourceBranch || !branchPath(state, sourceBranchId).some((turn) => turn.id === sourceTurnId)) throw new Error("forecast source is outside branch lineage");
  const truncated: InteractiveStoryState = {
    ...state,
    activeBranchId: sourceBranchId,
    branches: state.branches.map((branch) => branch.id === sourceBranchId ? { ...branch, headTurnId: sourceTurnId } : branch),
  };
  return composeBranchSparseMemory(truncated, sourceBranchId, query, relevantNodeIds);
}

export function convertForecastTrajectoryToBranch(
  state: InteractiveStoryState,
  sandbox: ForecastSandboxResult,
  trajectoryId: string,
): InteractiveStoryState {
  if (state.storyId !== sandbox.sourceStoryId) throw new Error("forecast story mismatch");
  const trajectory = sandbox.trajectories.find((item) => item.id === trajectoryId);
  if (!trajectory) throw new Error("forecast trajectory is missing");
  const sourceBranch = state.branches.find((branch) => branch.id === sandbox.sourceBranchId);
  if (!sourceBranch || !branchPath(state, sourceBranch.id).some((turn) => turn.id === sandbox.sourceTurnId)) throw new Error("forecast source is outside branch lineage");
  const switched = { ...state, activeBranchId: sourceBranch.id };
  const forked = forkInteractiveBranch(switched, sandbox.sourceTurnId, `推演 · ${trajectory.title}`);
  return {
    ...forked,
    branches: forked.branches.map((branch) => branch.id === forked.activeBranchId ? {
      ...branch,
      forecastSource: { sandboxId: sandbox.id, trajectoryId },
      forecastIntent: trajectory.branchIntent,
    } : branch),
  };
}
