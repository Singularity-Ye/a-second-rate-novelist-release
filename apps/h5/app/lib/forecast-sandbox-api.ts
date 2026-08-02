import { validateForecastSandboxResult } from "../vnext/world-lab/forecast-sandbox";
import { worldLabRequestError } from "./world-lab-api";

export interface RunForecastSandboxRequest {
  storyId: string;
  storyTitle: string;
  genre: string;
  sourceBranchId: string;
  sourceTurnId: string;
  sourceScene: string;
  event: string;
  publicFacts: string[];
  worldNodes: Array<{ id: string; label: string; kind: string }>;
  actors: Array<{
    nodeId: string;
    name: string;
    role: string;
    profileSummary: string;
    visibleRelations: string[];
    knownMemories: string[];
  }>;
}

export async function runForecastSandbox(input: RunForecastSandboxRequest) {
  const response = await fetch("/api/vnext/world-lab/forecasts/run", {
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
  const result = validateForecastSandboxResult(payload);
  if (!result) throw worldLabRequestError(null, "invalid_runtime_output", response);
  return result;
}
