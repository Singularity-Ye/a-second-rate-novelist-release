import type {
  ChannelAdapterKind,
  ChannelAttachmentHandoffView,
  ChannelDeliveryView,
  ChannelEventView,
  ChannelKind,
  ChannelMessageRequest,
  ChatMessageResponse,
} from "@erliu/shared-contracts";
import { createChannelIngressRepository, type ChannelDeliveryRecord, type ChannelEventRecord } from "../../common/repositories/channel-ingress.repository.js";
import { readAiRuntimeConfig, runAiCapabilityPlanePreflight } from "../ai-runtime/ai-runtime.config.js";
import { evaluateBetaChannelAccess } from "../beta-access/beta-access.service.js";
import { routeInboundChatMessage } from "../chat-router/chat-routing.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { buildPolicyGuardCopy, evaluatePolicyVerdict } from "../governance-compliance/policy-engine.service.js";
import { createChannelDeliveryEvidence } from "./channel-delivery.service.js";
import {
  buildMultimodalEffectiveText,
  persistResolvedAttachments,
  resolveInboundAttachments,
} from "./multimodal-intake.service.js";

function resolveAdapterKind(request: ChannelMessageRequest): ChannelAdapterKind {
  if (request.adapter_kind) {
    return request.adapter_kind;
  }

  if (request.client_context?.source_surface === "room") {
    return "room_session_bridge";
  }

  if (request.channel === "h5" || request.channel === "web_embed" || request.channel === "app") {
    return "h5_session_bridge";
  }

  if (request.channel === "feishu") {
    return "feishu_text_webhook";
  }

  if (request.channel === "wechat") {
    return "clawbot_text_webhook";
  }

  return "generic_channel_gateway";
}

function resolveProviderMessageId(request: ChannelMessageRequest) {
  return request.provider_message_id?.trim() || request.channel_message_id;
}

function buildIdempotencyKey(request: ChannelMessageRequest, adapter_kind: ChannelAdapterKind) {
  return [
    adapter_kind,
    request.channel,
    request.account_token,
    resolveProviderMessageId(request),
  ].join(":");
}

function buildAttachmentHandoff(
  provider_message_id: string,
  attachments: ChannelMessageRequest["attachments"],
): ChannelAttachmentHandoffView[] {
  return (attachments ?? []).map((attachment, index) => ({
    handoff_id: `${provider_message_id}:attachment:${index + 1}`,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    ...(attachment.attachment_kind ? { attachment_kind: attachment.attachment_kind } : {}),
    ...(attachment.source_url ? { source_url: attachment.source_url } : {}),
    ...(attachment.inline_text ? { inline_text: attachment.inline_text } : {}),
    ...(attachment.inline_bytes_base64 ? { inline_bytes_base64: attachment.inline_bytes_base64 } : {}),
    handoff_mode: "metadata_only",
    target: "multimodal_intake_queue",
    status: "deferred",
  }));
}

function buildCapabilityPreflight() {
  const runtime = readAiRuntimeConfig();
  const preflight = runAiCapabilityPlanePreflight();
  const entry = preflight.capabilities.text_generation;
  const definition = runtime.capability_plane.capability_registry.text_generation;

  return {
    capability: "text_generation" as const,
    status: entry.status,
    backend_id: entry.backend_id,
    budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
    timeout_ms: definition.timeout_ms,
    secret_scope: definition.secret_scope,
  };
}

function toChannelEventView(event: ChannelEventRecord, deduplicated: boolean): ChannelEventView {
  return {
    event_id: event.id,
    channel: event.channel as ChannelKind,
    adapter_kind: event.adapter_kind as ChannelAdapterKind,
    direction: event.direction,
    provider_message_id: event.provider_message_id,
    idempotency_key: event.idempotency_key,
    status: deduplicated ? "replayed" : "delivered",
    deduplicated,
    linked_message_id: event.linked_message_id,
    linked_intent_id: event.linked_intent_id,
    linked_route_decision_id: event.linked_route_decision_id,
    created_at: event.created_at,
    capability_preflight: event.capability_preflight,
    attachment_handoff: event.attachment_handoff,
  };
}

function toChannelDeliveryView(delivery: ChannelDeliveryRecord): ChannelDeliveryView {
  return {
    delivery_id: delivery.id,
    channel_event_id: delivery.channel_event_id,
    channel: delivery.channel as ChannelKind,
    adapter_kind: delivery.adapter_kind as ChannelAdapterKind,
    status: delivery.status,
    attempt_count: delivery.attempt_count,
    max_attempts: delivery.max_attempts,
    retry_backoff_ms: delivery.retry_backoff_ms,
    created_at: delivery.created_at,
    segments: delivery.segments,
    last_error: delivery.last_error,
  };
}

function hydrateStoredResponse(
  snapshot: Record<string, unknown>,
  event: ChannelEventRecord,
  delivery: ChannelDeliveryRecord | null,
  deduplicated: boolean,
): ChatMessageResponse {
  const base = snapshot as unknown as ChatMessageResponse;
  const hydrated: ChatMessageResponse = {
    ...base,
    channel_event: toChannelEventView(event, deduplicated),
  };

  if (delivery) {
    hydrated.delivery = toChannelDeliveryView(delivery);
  } else if (base.delivery) {
    hydrated.delivery = base.delivery;
  }

  return hydrated;
}

export async function buildChatSessionResponse(request: ChannelMessageRequest): Promise<ChatMessageResponse> {
  const adapter_kind = resolveAdapterKind(request);
  const provider_message_id = resolveProviderMessageId(request);
  const betaGate = await evaluateBetaChannelAccess({
    channel: request.channel,
    presented_account_token: request.account_token,
  });
  const idempotency_key = buildIdempotencyKey(request, adapter_kind);
  const repository = createChannelIngressRepository();
  const existing = await repository.findEventByIdempotencyKey(idempotency_key);

  if (existing?.response_snapshot) {
    existing.replay_count += 1;
    existing.last_replayed_at = new Date().toISOString();
    existing.updated_at = existing.last_replayed_at;
    await repository.saveEvent(existing);

    return hydrateStoredResponse(
      existing.response_snapshot,
      existing,
      await repository.findDeliveryByEventId(existing.id),
      true,
    );
  }

  const resolvedAttachments = await resolveInboundAttachments(
    request.attachments
      ? {
          provider_message_id,
          attachments: request.attachments,
        }
      : {
          provider_message_id,
        },
  );
  const effectiveText = buildMultimodalEffectiveText(
    request.text
      ? {
          text: request.text,
          derived_text: resolvedAttachments.derived_text,
        }
      : {
          derived_text: resolvedAttachments.derived_text,
        },
  );
  const requestForRouting = betaGate.allowed
    ? {
        ...request,
        account_token: betaGate.account_token,
      }
    : {
        ...request,
        account_token: betaGate.account_token,
        text: request.text?.trim() ? `beta-access-request: ${request.text.trim()}` : "beta-access-request",
      };
  const account = await upsertShadowAccount({
    account_token: requestForRouting.account_token,
    channel: request.channel,
    target_route: "/chat",
  });
  const blockedAttachment = resolvedAttachments.resolved.find((item) => item.status === "blocked");
  const policy_verdict = blockedAttachment
    ? await evaluatePolicyVerdict({
        scope: "attachment",
        account_id: account.account_id,
        source_ref: {
          ref_type: "channel_attachment",
          ref_id: blockedAttachment.handoff_id,
        },
        input_text: effectiveText,
        attachment_context: {
          blocked_reason: blockedAttachment.blocked_reason,
        },
      })
    : await evaluatePolicyVerdict({
        scope: "private_chat",
        account_id: account.account_id,
        source_ref: {
          ref_type: "channel_message",
          ref_id: provider_message_id,
        },
        input_text: effectiveText,
      });
  const guardCopy = buildPolicyGuardCopy(policy_verdict);
  const baseResponse = await routeInboundChatMessage({
    ...requestForRouting,
    text: guardCopy.sanitized_text ?? effectiveText,
    adapter_kind,
    provider_message_id,
    channel_message_id: provider_message_id,
  });
  const channelEvent = await repository.createEvent({
    account_id: baseResponse.account_id,
    session_id: baseResponse.session_id,
    channel: request.channel,
    adapter_kind,
    direction: "inbound",
    provider_message_id,
    idempotency_key,
    status: "accepted",
    message_text: baseResponse.normalized_message.text,
    attachment_handoff: buildAttachmentHandoff(provider_message_id, request.attachments),
    capability_preflight: buildCapabilityPreflight(),
    linked_message_id: null,
    linked_intent_id: null,
    linked_route_decision_id: null,
    response_snapshot: null,
  });
  const persistedAttachments = await persistResolvedAttachments({
    channel_event_id: channelEvent.id,
    account_id: baseResponse.account_id,
    session_id: baseResponse.session_id,
    story_id: baseResponse.routing.selected_story_id,
    resolved: resolvedAttachments.resolved,
  });
  const enrichedResponse: ChatMessageResponse = {
    ...baseResponse,
    policy_verdict,
    intent_patch: {
      ...baseResponse.intent_patch,
      ...(guardCopy.ack_copy ? { ack_copy: guardCopy.ack_copy } : {}),
      proposed_patch: {
        ...baseResponse.intent_patch.proposed_patch,
        ...persistedAttachments.patch,
      },
    },
    ...(guardCopy.ack_copy
      ? {
          ack: {
            ...baseResponse.ack,
            ack_copy: guardCopy.ack_copy,
          },
        }
      : {}),
    ...(guardCopy.reply_text
      ? {
          reply: {
            text: guardCopy.reply_text,
          },
        }
      : {}),
  };
  if (!betaGate.allowed) {
    enrichedResponse.ack = {
      ...enrichedResponse.ack,
      ack_copy: betaGate.ack_copy,
      deep_link: betaGate.deep_link,
    };
    enrichedResponse.intent_patch = {
      ...enrichedResponse.intent_patch,
      ack_copy: betaGate.ack_copy,
    };
    enrichedResponse.reply = {
      text: betaGate.reply_text,
    };
    enrichedResponse.follow_up_actions = [];
  }
  const delivery = await createChannelDeliveryEvidence({
    event_id: channelEvent.id,
    channel: request.channel,
    adapter_kind,
    ack_copy: enrichedResponse.ack.ack_copy,
    reply_text: enrichedResponse.reply.text,
    max_segment_chars: enrichedResponse.intent_envelope.delivery_constraints.max_segment_chars,
  });
  const deliveryRecord = await repository.saveDelivery({
    channel_event_id: channelEvent.id,
    ...delivery,
  });

  channelEvent.status = "delivered";
  channelEvent.attachment_handoff = persistedAttachments.handoffs;
  channelEvent.linked_message_id = enrichedResponse.normalized_message.id;
  channelEvent.linked_intent_id = enrichedResponse.intent_patch.intent_id;
  channelEvent.linked_route_decision_id = enrichedResponse.routing.route_decision_id;
  channelEvent.response_snapshot = {
    ...enrichedResponse,
  } as unknown as Record<string, unknown>;
  channelEvent.updated_at = new Date().toISOString();
  await repository.saveEvent(channelEvent);

  return {
    ...enrichedResponse,
    channel_event: toChannelEventView(channelEvent, false),
    delivery: toChannelDeliveryView(deliveryRecord),
  };
}
