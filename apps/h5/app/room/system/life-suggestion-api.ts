import {
  LIFE_SUGGESTION_INTENTS,
  type ContextualSuggestionModelResponse,
  type ContextualSuggestionSet,
  type LifeSuggestionIntent,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "../../lib/runtime-api-base";

export class LifeSuggestionApiError extends Error {
  override readonly name = "LifeSuggestionApiError";

  constructor(readonly code: string) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseCode(response: Response, payload: unknown) {
  if (isRecord(payload) && typeof payload.code === "string") return payload.code;
  if (response.status === 401) return "authentication_required";
  if (response.status === 429) return "model_capacity_exceeded";
  return "temporarily_unavailable";
}

function parseResponse(
  value: unknown,
  base: ContextualSuggestionSet,
): ContextualSuggestionModelResponse {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== "life_runtime"
    || value.basisVersionId !== base.basisVersionId
    || value.lifeStateVersion !== base.lifeStateVersion
    || value.provenance !== "rules_plus_model"
    || !Array.isArray(value.suggestions)
    || value.suggestions.length !== LIFE_SUGGESTION_INTENTS.length
    || !isRecord(value.modelAttestation)
    || typeof value.modelAttestation.provider !== "string"
    || !value.modelAttestation.provider.trim()
    || typeof value.modelAttestation.model !== "string"
    || !value.modelAttestation.model.trim()
    || value.modelAttestation.profile !== "deepseek"
    || value.modelAttestation.fallbackApplied !== false) {
    throw new LifeSuggestionApiError("invalid_runtime_output");
  }
  const copy = new Map<LifeSuggestionIntent, { reasonText: string; editablePrefill: string }>();
  for (const item of value.suggestions) {
    if (!isRecord(item)
      || typeof item.intentId !== "string"
      || !LIFE_SUGGESTION_INTENTS.includes(item.intentId as LifeSuggestionIntent)
      || typeof item.reasonText !== "string"
      || !item.reasonText.trim()
      || [...item.reasonText.trim()].length > 80
      || typeof item.editablePrefill !== "string"
      || !item.editablePrefill.trim()
      || [...item.editablePrefill.trim()].length > 300
      || copy.has(item.intentId as LifeSuggestionIntent)) {
      throw new LifeSuggestionApiError("invalid_runtime_output");
    }
    const source = base.suggestions.find((suggestion) => suggestion.intentId === item.intentId);
    if (source === undefined
      || item.score !== source.score
      || JSON.stringify(item.reasonCodes) !== JSON.stringify(source.reasonCodes)) {
      throw new LifeSuggestionApiError("invalid_runtime_output");
    }
    copy.set(item.intentId as LifeSuggestionIntent, {
      reasonText: item.reasonText.trim(),
      editablePrefill: item.editablePrefill.trim(),
    });
  }
  if (copy.size !== LIFE_SUGGESTION_INTENTS.length) {
    throw new LifeSuggestionApiError("invalid_runtime_output");
  }
  return {
    ...base,
    provenance: "rules_plus_model",
    suggestions: base.suggestions.map((suggestion) => ({
      ...suggestion,
      ...copy.get(suggestion.intentId)!,
    })),
    modelAttestation: {
      provider: value.modelAttestation.provider,
      model: value.modelAttestation.model,
      profile: "deepseek",
      fallbackApplied: false,
    },
  };
}

export async function requestLifeSuggestionCopy(
  suggestionSet: ContextualSuggestionSet,
  signal?: AbortSignal,
): Promise<ContextualSuggestionModelResponse> {
  const clientRequestId = crypto.randomUUID();
  const response = await fetch(`${resolveH5ApiBaseUrl()}/vnext/room/life-suggestions`, {
    method: "POST",
    credentials: process.env.NEXT_PUBLIC_PUBLIC_ROOM_DEMO === "true" ? "omit" : "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ clientRequestId, suggestionSet }),
    ...(signal === undefined ? {} : { signal }),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The stable HTTP-derived error remains available below.
  }
  if (!response.ok) throw new LifeSuggestionApiError(responseCode(response, payload));
  return parseResponse(payload, suggestionSet);
}
