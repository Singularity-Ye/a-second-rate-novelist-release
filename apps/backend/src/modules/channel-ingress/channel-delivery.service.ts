import { randomUUID } from "node:crypto";
import type { ChannelAdapterKind, ChannelDeliveryView, ChannelKind } from "@erliu/shared-contracts";

const MAX_DELIVERY_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 250;
const faultOnceRegistry = new Set<string>();

interface DeliveryTransportInput {
  event_id: string;
  channel: ChannelKind;
  adapter_kind: ChannelAdapterKind;
  kind: "ack" | "reply";
  segment_index: number;
  text: string;
  attempt_no: number;
}

interface DeliveryTransportResult {
  provider_delivery_id: string;
}

async function deliverSegment(input: DeliveryTransportInput): Promise<DeliveryTransportResult> {
  const faultTarget = process.env.CHANNEL_INGRESS_FAULT_DELIVERY_ONCE?.trim();
  const faultKey = `${input.event_id}:${input.kind}`;

  if (faultTarget === input.kind && !faultOnceRegistry.has(faultKey)) {
    faultOnceRegistry.add(faultKey);
    throw new Error(`synthetic ${input.kind} delivery failure`);
  }

  return {
    provider_delivery_id: `${input.adapter_kind}:${input.kind}:${randomUUID()}`,
  };
}

function splitSegments(text: string, max_segment_chars: number) {
  if (!text) {
    return [];
  }

  if (text.length <= max_segment_chars) {
    return [text];
  }

  const segments: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    segments.push(text.slice(cursor, cursor + max_segment_chars));
    cursor += max_segment_chars;
  }

  return segments;
}

export async function createChannelDeliveryEvidence(input: {
  event_id: string;
  channel: ChannelKind;
  adapter_kind: ChannelAdapterKind;
  ack_copy: string;
  reply_text: string;
  max_segment_chars: number;
}): Promise<Omit<ChannelDeliveryView, "delivery_id" | "channel_event_id" | "created_at">> {
  const segments = [
    {
      kind: "ack" as const,
      parts: splitSegments(input.ack_copy, input.max_segment_chars),
    },
    {
      kind: "reply" as const,
      parts: splitSegments(input.reply_text, input.max_segment_chars),
    },
  ].flatMap((group) => group.parts.map((text) => ({ kind: group.kind, text })));

  const renderedSegments: ChannelDeliveryView["segments"] = [];
  let attempt_count = 0;
  let last_error: string | null = null;

  for (const [segment_index, segment] of segments.entries()) {
    const attempts: ChannelDeliveryView["segments"][number]["attempts"] = [];
    let provider_delivery_id: string | null = null;
    let status: "succeeded" | "failed" = "failed";

    for (let attempt_no = 1; attempt_no <= MAX_DELIVERY_ATTEMPTS; attempt_no += 1) {
      attempt_count += 1;
      const attempted_at = new Date().toISOString();

      try {
        const delivered = await deliverSegment({
          event_id: input.event_id,
          channel: input.channel,
          adapter_kind: input.adapter_kind,
          kind: segment.kind,
          segment_index,
          text: segment.text,
          attempt_no,
        });

        provider_delivery_id = delivered.provider_delivery_id;
        status = "succeeded";
        attempts.push({
          attempt_no,
          status: "succeeded",
          attempted_at,
          error_message: null,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        last_error = message;
        attempts.push({
          attempt_no,
          status: "failed",
          attempted_at,
          error_message: message,
        });

        if (attempt_no === MAX_DELIVERY_ATTEMPTS) {
          break;
        }
      }
    }

    renderedSegments.push({
      segment_id: randomUUID(),
      segment_index,
      kind: segment.kind,
      text: segment.text,
      status,
      provider_delivery_id,
      attempts,
    });
  }

  const failed_count = renderedSegments.filter((segment) => segment.status === "failed").length;

  return {
    channel: input.channel,
    adapter_kind: input.adapter_kind,
    status: failed_count === 0 ? "succeeded" : failed_count === renderedSegments.length ? "failed" : "partial_failed",
    attempt_count,
    max_attempts: MAX_DELIVERY_ATTEMPTS,
    retry_backoff_ms: RETRY_BACKOFF_MS,
    segments: renderedSegments,
    last_error,
  };
}
