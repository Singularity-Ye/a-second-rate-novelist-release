import type {
  ChannelMessageRequest,
  ChatContextResolveRequest,
  ChatContextResolveResponse,
  ChatIntentType,
  ChatMessageResponse,
  ChatRouteMode,
  ChatRouteStatus,
  ChatRoutingView,
  ConfidenceBand,
  IntentCorrectionStateView,
  IntentEnvelopeSurface,
  IntentEnvelopeView,
  IntentPatchView,
  IntentRouteHint,
  IntentTargetObjectView,
  QuickActionView,
  StoryCandidateView,
} from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createChatIntentRepository } from "../../common/repositories/chat-intent.repository.js";
import { ensureSession, upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { recordIntentEnvelope, recordMessageIntent } from "../intent-audit/intent-audit.service.js";
import { captureRelationshipMemory } from "../relationship-memory/relationship-memory.service.js";
import {
  getStoryWorkspaceById,
  listStoryWorkspacesByAccount,
} from "./story-workspace-registry.js";
import { buildChatPersonaCopy } from "../persona-runtime/persona-runtime.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

function resolveH5BaseUrl() {
  return process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
}

function normalizeText(text?: string) {
  return text?.trim() ?? "";
}

function resolveIntentSurface(request: ChannelMessageRequest): IntentEnvelopeSurface {
  if (request.client_context?.source_surface === "room") {
    return "room";
  }

  if (request.client_context?.source_surface === "chat") {
    return "wechat_im";
  }

  if (request.channel === "wechat" || request.channel === "feishu") {
    return "wechat_im";
  }

  return "room";
}

function buildDeliveryConstraints() {
  return {
    reply_window: "active" as const,
    max_segment_chars: 1800,
    async_allowed: true,
  };
}

function toConfidenceBand(score: number): ConfidenceBand {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.45) {
    return "medium";
  }

  return "low";
}

function toConfidenceScore(score: number) {
  return Number(score.toFixed(3));
}

function emitEvent(event_name: string, account_id: string, payload: Record<string, string | number | boolean | null>) {
  void recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

function inferIntentType(text: string, selected_story_id: string | null): ChatIntentType {
  if (/(开新坑|新书|新故事|立项|想开一本|想看一本|开一本|想看)/.test(text)) {
    return "new_story_intake";
  }

  if (selected_story_id && /(重写|改稿|微调|润一下|再写|续稿|继续|暧昧一点|浓一点|收一点)/.test(text)) {
    return "revision_request";
  }

  if (/(抱抱|想你|陪我|暧昧|晚安|别走)/.test(text)) {
    return "relationship_dialogue";
  }

  if (selected_story_id) {
    return "story_context";
  }

  return "recent_note";
}

function toRouteHint(intent_type: ChatIntentType): IntentRouteHint {
  switch (intent_type) {
    case "new_story_intake":
      return "interviewer";
    case "revision_request":
    case "story_context":
      return "scene_writer";
    default:
      return "coordinator_only";
  }
}

function toIntentEnvelopeView(input: {
  envelope_id: string;
  message_id: string;
  request: ChannelMessageRequest;
  account_id: string;
  session_id: string;
  story_id: string | null;
  chapter_id?: string | null;
  normalized_text: string;
}): IntentEnvelopeView {
  return {
    envelope_id: input.envelope_id,
    surface: resolveIntentSurface(input.request),
    message: {
      message_id: input.message_id,
      channel_message_id: input.request.channel_message_id,
      channel: input.request.channel,
      text: input.normalized_text,
      attachments: input.request.attachments ?? [],
    },
    actor_context: {
      account_id: input.account_id,
      session_id: input.session_id,
      story_id: input.story_id,
      chapter_id: input.chapter_id ?? null,
    },
    intent_seed: {
      raw_text: input.normalized_text,
      source_surface: input.request.client_context?.source_surface ?? "chat",
    },
    delivery_constraints: buildDeliveryConstraints(),
  };
}

function buildIntentPatch(input: {
  routing: ChatRoutingView;
  deep_link: string;
  text: string;
  intent_type: ChatIntentType;
}): Omit<IntentPatchView, "intent_id" | "envelope_id" | "ack_copy"> {
  const confidence = {
    score: toConfidenceScore(input.routing.confidence_score),
    band: input.routing.confidence_band,
  };
  const pendingCorrection: IntentCorrectionStateView = {
    status: input.routing.status === "ambiguous" ? "needs_clarification" : "recorded",
    entry_deep_link: input.deep_link,
    last_corrected_at: null,
  };

  if (input.routing.status === "ambiguous") {
    return {
      intent_type: input.intent_type,
      target_object: {
        object_type: "route_decision",
        object_id: input.routing.route_decision_id,
        object_label: "待你确认的故事线",
      },
      proposed_patch: {
        pending_confirmation: true,
        candidate_story_ids: input.routing.candidates.map((item) => item.story_id),
        note_text: input.text,
      },
      confidence,
      route_hint: "coordinator_only",
      correction_state: pendingCorrection,
    };
  }

  switch (input.intent_type) {
    case "new_story_intake":
      return {
        intent_type: input.intent_type,
        target_object: {
          object_type: "workspace",
          object_id: null,
          object_label: "待立项故事",
        },
        proposed_patch: {
          seed_text: input.text,
          source_surface: "chat",
        },
        confidence,
        route_hint: toRouteHint(input.intent_type),
        correction_state: pendingCorrection,
      };
    case "revision_request":
      return {
        intent_type: input.intent_type,
        target_object: {
          object_type: "workspace",
          object_id: input.routing.selected_story_id,
          object_label: input.routing.selected_story_title ?? "当前故事线",
        },
        proposed_patch: {
          request_text: input.text,
          revision_mode: /重写/.test(input.text) ? "rewrite" : "tweak",
          story_id: input.routing.selected_story_id,
          source_surface: "chat",
        },
        confidence,
        route_hint: toRouteHint(input.intent_type),
        correction_state: pendingCorrection,
      };
    case "relationship_dialogue":
      return {
        intent_type: input.intent_type,
        target_object: {
          object_type: "relationship_memory",
          object_id: null,
          object_label: input.routing.selected_story_title ?? "关系记忆",
        },
        proposed_patch: {
          source_message_text: input.text,
          source_surface: "chat",
        },
        confidence,
        route_hint: "coordinator_only",
        correction_state: pendingCorrection,
      };
    case "story_context":
      return {
        intent_type: input.intent_type,
        target_object: {
          object_type: "workspace",
          object_id: input.routing.selected_story_id,
          object_label: input.routing.selected_story_title ?? "当前故事线",
        },
        proposed_patch: {
          note_text: input.text,
          story_id: input.routing.selected_story_id,
          source_surface: "chat",
        },
        confidence,
        route_hint: toRouteHint(input.intent_type),
        correction_state: pendingCorrection,
      };
    default:
      return {
        intent_type: input.intent_type,
        target_object: {
          object_type: "recent_note",
          object_id: null,
          object_label: "最近记下",
        },
        proposed_patch: {
          note_text: input.text,
          archive_bucket: "recent_notes",
        },
        confidence,
        route_hint: toRouteHint(input.intent_type),
        correction_state: pendingCorrection,
      };
  }
}

async function scoreStoryCandidates(input: {
  account_id: string;
  text: string;
  active_story_id?: string | null;
}) {
  const stories = (await listStoryWorkspacesByAccount(input.account_id)).filter(
    (item) => item.workspace_status !== "archived",
  );
  const ranked = stories.map((story, index) => {
    let score = 0.1;
    const reason_labels: string[] = [];

    if (input.active_story_id && story.story_workspace_id === input.active_story_id) {
      score += 0.55;
      reason_labels.push("active_story");
    }

    if (input.text.includes(story.title)) {
      score += 0.35;
      reason_labels.push("title_hit");
    }

    const keywordHits = story.keywords.filter((keyword) => input.text.includes(keyword));

    if (keywordHits.length > 0) {
      score += Math.min(0.3, keywordHits.length * 0.15);
      reason_labels.push(`keyword:${keywordHits.join("|")}`);
    }

    if (index === stories.length - 1) {
      score += 0.1;
      reason_labels.push("recent_active");
    }

    return {
      story_id: story.story_workspace_id,
      story_title: story.title,
      confidence_score: Number(Math.min(0.98, score).toFixed(3)),
      reason_labels,
    };
  });

  return ranked.sort((left, right) => right.confidence_score - left.confidence_score);
}

async function buildRouting(input: {
  account_id: string;
  message_id: string;
  text: string;
  active_story_id?: string | null;
}) {
  const repository = createChatIntentRepository();
  const candidates = await scoreStoryCandidates(input);
  const top = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const hasClearWinner =
    Boolean(top) &&
    (candidates.length === 1 ||
      Boolean(input.active_story_id && top?.story_id === input.active_story_id && top.confidence_score >= 0.65) ||
      Boolean(top && second && top.confidence_score - second.confidence_score >= 0.2 && top.confidence_score >= 0.45) ||
      Boolean(top && top.reason_labels.some((item) => item.startsWith("title_hit"))));

  let status: ChatRouteStatus;
  let route_mode: ChatRouteMode;
  let selected_story_id: string | null = null;
  let confidence_score = top?.confidence_score ?? 0.12;
  const fallback_mode =
    (top && hasClearWinner) || (candidates.length > 1 && top)
      ? ("none" as const)
      : ("recent_notes" as const);

  if (top && hasClearWinner) {
    status = "auto_resolved";
    route_mode = "auto";
    selected_story_id = top.story_id;
  } else if (candidates.length > 1 && top) {
    status = "ambiguous";
    route_mode = "parked";
  } else {
    status = "parked_to_recent";
    route_mode = "parked";
    confidence_score = top?.confidence_score ?? 0.12;
  }

  const decision = await repository.recordRouteDecision({
    message_id: input.message_id,
    account_id: input.account_id,
    candidate_story_ids: candidates.map((item) => item.story_id),
    selected_story_id,
    confidence_score,
    route_mode,
    status,
    reason_summary: {
      matched_story_ids: candidates
        .filter((item) => item.reason_labels.some((label) => label.startsWith("keyword:") || label === "title_hit"))
        .map((item) => item.story_id),
      active_story_id: input.active_story_id ?? null,
      recent_story_id: candidates[0]?.story_id ?? null,
      fallback_mode,
    },
  });

  return {
    decision,
    candidates,
  };
}

function buildDeepLink(input: {
  deep_link_token: string;
  routing: ChatRoutingView;
}) {
  const params = new URLSearchParams({
    token: input.deep_link_token,
  });

  if (input.routing.route_decision_id) {
    params.set("routeDecisionId", input.routing.route_decision_id);
  }

  if (input.routing.status === "ambiguous") {
    params.set(
      "candidates",
      encodeURIComponent(
        JSON.stringify(
          input.routing.candidates.map((item) => ({
            story_id: item.story_id,
            story_title: item.story_title,
          })),
        ),
      ),
    );
  }

  if (input.routing.selected_story_id) {
    params.set("storyId", input.routing.selected_story_id);
  }

  return `${resolveH5BaseUrl()}/chat?${params.toString()}`;
}

async function toRoutingView(input: {
  route_decision_id: string;
  status: ChatRouteStatus;
  route_mode: ChatRouteMode;
  confidence_score: number;
  selected_story_id: string | null;
  candidates: StoryCandidateView[];
}) {
  const selected = input.selected_story_id ? await getStoryWorkspaceById(input.selected_story_id) : null;

  return {
    route_decision_id: input.route_decision_id,
    status: input.status,
    route_mode: input.route_mode,
    confidence_score: input.confidence_score,
    confidence_band: toConfidenceBand(input.confidence_score),
    selected_story_id: input.selected_story_id,
    selected_story_title: selected?.title ?? null,
    candidates: input.candidates,
  };
}

async function buildAck(input: {
  envelope_id: string;
  account_id: string;
  message_id: string;
  routing: ChatRoutingView;
  deep_link: string;
  intent_patch: Omit<IntentPatchView, "intent_id" | "envelope_id" | "ack_copy">;
  persona_copy: {
    ack_copy: string;
  };
}) {
  const confidence_band = input.routing.confidence_band;
  const ackPayload =
    input.intent_patch.target_object.object_type === "route_decision"
      ? {
          target_type: "route_decision" as const,
          target_id: input.intent_patch.target_object.object_id,
          target_label: input.intent_patch.target_object.object_label,
          ack_copy: input.persona_copy.ack_copy,
        }
      : input.intent_patch.target_object.object_type === "relationship_memory" &&
          input.routing.selected_story_id
        ? {
            target_type: "story_workspace" as const,
            target_id: input.routing.selected_story_id,
            target_label: input.routing.selected_story_title ?? "当前故事线",
            ack_copy: input.persona_copy.ack_copy,
          }
      : input.intent_patch.target_object.object_type === "workspace"
        ? {
            target_type: "story_workspace" as const,
            target_id: input.intent_patch.target_object.object_id,
            target_label: input.intent_patch.target_object.object_label,
            ack_copy: input.persona_copy.ack_copy,
          }
        : input.intent_patch.target_object.object_type === "reader_profile"
          ? {
              target_type: "reader_profile" as const,
              target_id: input.intent_patch.target_object.object_id,
              target_label: input.intent_patch.target_object.object_label,
              ack_copy: input.persona_copy.ack_copy,
            }
          : {
              target_type: "recent_notes" as const,
              target_id: input.intent_patch.target_object.object_id,
              target_label: input.intent_patch.target_object.object_label,
              ack_copy: input.persona_copy.ack_copy,
            };

  const message = await createChatIntentRepository().findMessageById(input.message_id);
  const intent = await recordMessageIntent({
    envelope_id: input.envelope_id,
    message_id: input.message_id,
    account_id: input.account_id,
    channel_message_id: message?.channel_message_id ?? null,
    intent_type: input.intent_patch.intent_type,
    target_type: ackPayload.target_type,
    target_id: ackPayload.target_id,
    target_label: ackPayload.target_label,
    target_object: input.intent_patch.target_object,
    proposed_patch: input.intent_patch.proposed_patch,
    ack_copy: ackPayload.ack_copy,
    deep_link: input.deep_link,
    confidence_band,
    confidence_score: input.intent_patch.confidence.score,
    route_hint: input.intent_patch.route_hint,
    correction_state: input.intent_patch.correction_state,
  });

  emitEvent("chat_ack_rendered", input.account_id, {
    intent_id: intent.id,
    intent_type: input.intent_patch.intent_type,
    target_type: ackPayload.target_type,
    deep_link_present: Boolean(input.deep_link),
  });

  const ack = {
    intent_id: intent.id,
    intent_type: input.intent_patch.intent_type,
    target_type: ackPayload.target_type,
    target_id: ackPayload.target_id,
    target_label: ackPayload.target_label,
    deep_link: input.deep_link,
    confidence_band,
    ack_copy: ackPayload.ack_copy,
  };

  return {
    ack,
    intent_patch: {
      intent_type: intent.intent_type as ChatIntentType,
      target_object: intent.target_object,
      proposed_patch: intent.proposed_patch ?? {},
      confidence: {
        score: intent.confidence_score,
        band: intent.confidence_band,
      },
      intent_id: intent.id,
      envelope_id: input.envelope_id,
      ack_copy: ack.ack_copy,
      route_hint: intent.route_hint,
      correction_state: intent.correction_state,
    } satisfies IntentPatchView,
  };
}

function buildReply(persona_copy: {
  reply_text: string;
}) {
  return { text: persona_copy.reply_text };
}

function buildPersonaState(persona_copy: {
  state_label: string;
  room_presence_state: "welcoming" | "waiting_for_user" | "writing" | "revising" | "stuck" | "resting" | "asset_processing";
}) {
  return {
    label: persona_copy.state_label,
    state: persona_copy.room_presence_state,
  };
}

export function listQuickActions(input: {
  story_id?: string | null;
  chapter_id?: string | null;
  surface: "chat" | "room";
}): QuickActionView[] {
  const actions: QuickActionView[] = [];

  if (input.story_id) {
    actions.push({
      action_key: "continue_story",
      label: "继续这条故事线",
      intent_type: "story_context",
      requires_story: true,
      requires_chapter: false,
      tracking_payload: {
        surface: input.surface,
        story_id: input.story_id,
        chapter_id: input.chapter_id ?? null,
      },
    });
  }

  actions.push({
    action_key: "recent_notes",
    label: "去最近记下",
    intent_type: "recent_note",
    requires_story: false,
    requires_chapter: false,
    tracking_payload: {
      surface: input.surface,
      story_id: input.story_id ?? null,
    },
  });
  actions.push({
    action_key: "new_story",
    label: "开新坑",
    intent_type: "quick_action",
    requires_story: false,
    requires_chapter: false,
    tracking_payload: {
      surface: input.surface,
      story_id: null,
    },
  });

  return actions;
}

export async function routeInboundChatMessage(request: ChannelMessageRequest): Promise<ChatMessageResponse> {
  const account = await upsertShadowAccount({
    account_token: request.account_token,
    channel: request.channel,
    target_route: "/chat",
  });
  const session = await ensureSession(account.account_id);
  const normalized_message = await createChatIntentRepository().appendNormalizedMessage({
    account_id: account.account_id,
    channel_message_id: request.channel_message_id,
    channel: request.channel,
    text: normalizeText(request.text),
  });
  const intentEnvelopeRecord = await recordIntentEnvelope({
    message_id: normalized_message.id,
    account_id: account.account_id,
    session_id: session.session_id,
    surface: resolveIntentSurface(request),
    channel: request.channel,
    channel_message_id: request.channel_message_id,
    story_id: request.client_context?.active_story_id ?? null,
    chapter_id: null,
    message_text: normalized_message.text,
    attachments: request.attachments ?? [],
    delivery_constraints: buildDeliveryConstraints(),
    intent_seed: {
      raw_text: normalized_message.text,
      source_surface: request.client_context?.source_surface ?? "chat",
    },
  });

  emitEvent("chat_message_submitted", account.account_id, {
    message_id: normalized_message.id,
    channel: request.channel,
    has_attachment: Boolean(request.attachments?.length),
    active_story_id: request.client_context?.active_story_id ?? null,
    surface: request.client_context?.source_surface ?? "chat",
  });

  const routed = await buildRouting({
    account_id: account.account_id,
    message_id: normalized_message.id,
    text: normalized_message.text,
    active_story_id: request.client_context?.active_story_id ?? null,
  });
  const routing = await toRoutingView({
    route_decision_id: routed.decision.id,
    status: routed.decision.status as ChatRouteStatus,
    route_mode: routed.decision.route_mode,
    confidence_score: routed.decision.confidence_score,
    selected_story_id: routed.decision.selected_story_id,
    candidates: routed.candidates,
  });
  const deep_link = buildDeepLink({
    deep_link_token: account.deep_link_token,
    routing,
  });
  const intentEnvelope = toIntentEnvelopeView({
    envelope_id: intentEnvelopeRecord.id,
    message_id: normalized_message.id,
    request,
    account_id: account.account_id,
    session_id: session.session_id,
    story_id: routing.selected_story_id,
    normalized_text: normalized_message.text,
  });
  const personaCopy = await buildChatPersonaCopy({
    account_id: account.account_id,
    story_id: routing.selected_story_id,
    story_title: routing.selected_story_title,
    routing_status:
      routing.status === "ambiguous" ? "ambiguous" : routing.selected_story_id ? "selected_story" : "recent_notes",
    user_text: normalized_message.text,
  });
  let intentPatch = buildIntentPatch({
    routing,
    deep_link,
    text: normalized_message.text,
    intent_type: inferIntentType(normalized_message.text, routing.selected_story_id),
  });
  const memory = await captureRelationshipMemory({
    account_id: account.account_id,
    story_workspace_id: routing.selected_story_id,
    message_id: normalized_message.id,
    text: normalized_message.text,
  });

  if (memory && intentPatch.intent_type === "relationship_dialogue") {
    intentPatch = {
      ...intentPatch,
      target_object: {
        object_type: "relationship_memory",
        object_id: memory.id,
        object_label: routing.selected_story_title ?? "关系记忆",
      },
      proposed_patch: {
        ...intentPatch.proposed_patch,
        memory_type: memory.memory_type,
        source_message_id: normalized_message.id,
      },
    };
  }

  if (intentPatch.intent_type === "recent_note") {
    intentPatch = {
      ...intentPatch,
      target_object: {
        ...intentPatch.target_object,
        object_id: null,
      },
      proposed_patch: {
        ...intentPatch.proposed_patch,
        source_message_id: normalized_message.id,
      },
    };
  }

  const acknowledged = await buildAck({
    envelope_id: intentEnvelope.envelope_id,
    account_id: account.account_id,
    message_id: normalized_message.id,
    routing,
    deep_link,
    intent_patch: intentPatch,
    persona_copy: personaCopy,
  });
  const follow_up_actions = listQuickActions({
    story_id: routing.selected_story_id,
    chapter_id: null,
    surface: "chat",
  });

  emitEvent("chat_story_routed", account.account_id, {
    route_decision_id: routing.route_decision_id,
    story_id: routing.selected_story_id,
    confidence_score: routing.confidence_score,
    route_mode: routing.route_mode,
  });

  if (routing.status === "ambiguous") {
    emitEvent("chat_story_disambiguation_shown", account.account_id, {
      route_decision_id: routing.route_decision_id,
      candidate_count: routing.candidates.length,
      top_confidence: routing.candidates[0]?.confidence_score ?? 0,
    });
  }

  if (memory) {
    emitEvent("chat_relationship_memory_written", account.account_id, {
      memory_id: memory.id,
      memory_type: memory.memory_type,
      story_workspace_id: memory.story_workspace_id,
      ttl_hours:
        Math.round((Date.parse(memory.expires_at) - Date.parse(memory.created_at)) / (60 * 60 * 1000)),
    });
  }

  return {
    account_id: account.account_id,
    account_token: account.account_token,
    account_status: account.account_status,
    session_id: session.session_id,
    normalized_message: {
      id: normalized_message.id,
      channel_message_id: normalized_message.channel_message_id,
      channel: request.channel,
      text: normalized_message.text,
    },
    deep_link,
    persona_state: buildPersonaState(personaCopy),
    intent_envelope: intentEnvelope,
    intent_patch: acknowledged.intent_patch,
    reply: buildReply(personaCopy),
    ack: acknowledged.ack,
    routing,
    follow_up_actions,
  };
}

export async function resolveChatContextDecision(
  input: ChatContextResolveRequest,
): Promise<ChatContextResolveResponse> {
  const repository = createChatIntentRepository();
  const accountRepository = createAccountRepository();
  const decision = await repository.findRouteDecisionById(input.route_decision_id);

  if (!decision) {
    throw new Error(`Route decision not found for id ${input.route_decision_id}`);
  }

  const message = await repository.findMessageById(decision.message_id);
  const accountRecord = await accountRepository.findAccountById(decision.account_id);

  if (!message) {
    throw new Error(`Message not found for route decision ${input.route_decision_id}`);
  }

  if (!accountRecord) {
    throw new Error(`Account not found for route decision ${input.route_decision_id}`);
  }

  let selected_story_id: string | null = null;
  let selected_story_title = "最近记下";
  const existingIntent = await repository.findMessageIntentByMessageId(decision.message_id);

  if (input.selected_story_id) {
    const story = await getStoryWorkspaceById(input.selected_story_id);

    if (!story) {
      throw new Error(`Story workspace not found for id ${input.selected_story_id}`);
    }

    selected_story_id = story.story_workspace_id;
    selected_story_title = story.title;
    decision.selected_story_id = story.story_workspace_id;
    decision.route_mode = "clarified";
    decision.status = "user_confirmed";
    decision.updated_at = new Date().toISOString();
  } else {
    decision.selected_story_id = null;
    decision.route_mode = "parked";
    decision.status = "parked_to_recent";
    decision.reason_summary.fallback_mode = input.fallback_mode ?? "recent_notes";
    decision.updated_at = new Date().toISOString();
  }

  await repository.saveRouteDecision(decision);

  const candidateStories = [];
  for (const story_id of decision.candidate_story_ids) {
    const story = await getStoryWorkspaceById(story_id);
    if (story) {
      candidateStories.push({
        story_id: story.story_workspace_id,
        story_title: story.title,
        confidence_score: decision.selected_story_id === story.story_workspace_id ? 0.9 : 0.4,
        reason_labels: ["candidate_story"],
      });
    }
  }
  const routing = await toRoutingView({
    route_decision_id: decision.id,
    status: decision.status as ChatRouteStatus,
    route_mode: decision.route_mode,
    confidence_score: decision.confidence_score,
    selected_story_id: decision.selected_story_id,
    candidates: candidateStories,
  });
  const account = await upsertShadowAccount({
    account_token: accountRecord.account_token,
    channel: message.channel,
    target_route: "/chat",
  });
  const deep_link = buildDeepLink({
    deep_link_token: account.deep_link_token,
    routing,
  });
  const personaCopy = await buildChatPersonaCopy({
    account_id: decision.account_id,
    story_id: routing.selected_story_id,
    story_title: routing.selected_story_title,
    routing_status: routing.selected_story_id ? "selected_story" : "recent_notes",
    user_text: message.text,
  });
  const intentPatch = buildIntentPatch({
    routing,
    deep_link,
    text: message.text,
    intent_type: inferIntentType(message.text, routing.selected_story_id),
  });
  const acknowledged = await buildAck({
    envelope_id: existingIntent?.envelope_id ?? decision.message_id,
    account_id: decision.account_id,
    message_id: decision.message_id,
    routing,
    deep_link,
    intent_patch: intentPatch,
    persona_copy: personaCopy,
  });
  const follow_up_actions = listQuickActions({
    story_id: routing.selected_story_id,
    chapter_id: null,
    surface: "chat",
  });

  emitEvent("chat_story_disambiguation_confirmed", decision.account_id, {
    route_decision_id: decision.id,
    selected_story_id: routing.selected_story_id,
    fallback_mode: input.fallback_mode ?? null,
  });

  return {
    resolved_story: {
      story_id: selected_story_id,
      story_title: selected_story_title,
    },
    ack: acknowledged.ack,
    replayed_reply: buildReply(personaCopy),
    routing,
    follow_up_actions,
  };
}
