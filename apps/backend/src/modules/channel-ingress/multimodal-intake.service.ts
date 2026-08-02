import { lookup } from "node:dns/promises";
import net from "node:net";
import type {
  ChannelAttachmentCapabilityPreflightView,
  ChannelAttachmentHandoffView,
  ChannelAttachmentKind,
  ChannelAttachmentMetadata,
  ChannelAttachmentSourceKind,
  ChannelMultimodalCapability,
} from "@erliu/shared-contracts";
import { createMultimodalIntakeRepository } from "../../common/repositories/multimodal-intake.repository.js";
import { ingestResolvedReferenceAsset } from "../asset-ingestion/asset-ingestion.service.js";
import {
  readAiRuntimeConfig,
  resolveAiCapabilityExecutionPlan,
  runAiCapabilityPlanePreflight,
  type AiCapabilityKey,
} from "../ai-runtime/ai-runtime.config.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const ATTACHMENT_LIMITS = {
  max_items_per_message: 4,
  max_item_bytes: 5 * 1024 * 1024,
  max_total_bytes: 12 * 1024 * 1024,
  max_derived_text_chars: 1_600,
  max_preview_chars: 120,
  remote_fetch_timeout_ms: 8_000,
} as const;

type ResolvedAttachmentStatus = "processed" | "blocked";
type FetchStatus = "resolved" | "blocked" | "skipped";

interface AttachmentResolutionInput {
  handoff_id: string;
  attachment: ChannelAttachmentMetadata;
}

interface ResolvedAttachment {
  handoff_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  attachment_kind: ChannelAttachmentKind;
  source_kind: ChannelAttachmentSourceKind;
  source_locator: string | null;
  status: ResolvedAttachmentStatus;
  blocked_reason: string | null;
  fetch_status: FetchStatus;
  fetch_size_bytes: number;
  capability: ChannelMultimodalCapability;
  capability_preflight: ChannelAttachmentCapabilityPreflightView;
  provider_id: string | null;
  model_id: string | null;
  structured_text: string | null;
  summary: string;
}

function trimText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeFileName(file_name: string) {
  const sanitized = file_name.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "");
  return sanitized || "attachment.bin";
}

function previewText(value: string | null) {
  return value ? value.slice(0, ATTACHMENT_LIMITS.max_preview_chars) : null;
}

function inferAttachmentKind(attachment: ChannelAttachmentMetadata): ChannelAttachmentKind {
  if (attachment.attachment_kind && attachment.attachment_kind !== "unknown") {
    return attachment.attachment_kind;
  }

  if (attachment.mime_type.startsWith("audio/")) {
    return "voice";
  }

  if (attachment.mime_type.startsWith("image/")) {
    return "image";
  }

  if (
    attachment.mime_type.startsWith("text/") ||
    attachment.mime_type === "application/pdf" ||
    attachment.mime_type.includes("wordprocessingml") ||
    attachment.mime_type.includes("msword")
  ) {
    return "document";
  }

  return "unknown";
}

function inferCapability(kind: ChannelAttachmentKind): ChannelMultimodalCapability {
  if (kind === "voice") {
    return "asr";
  }

  if (kind === "image") {
    return "vision_understanding";
  }

  return "ocr_document_extraction";
}

function buildCapabilityPreflight(capability: ChannelMultimodalCapability): ResolvedAttachment["capability_preflight"] {
  const runtime = readAiRuntimeConfig();
  const preflight = runAiCapabilityPlanePreflight();
  const entry = preflight.capabilities[capability];
  const definition = runtime.capability_plane.capability_registry[capability];

  return {
    capability,
    status: entry.status,
    backend_id: entry.backend_id,
    budget_max_cost_usd: definition.budget.max_cost_usd_per_request,
    timeout_ms: definition.timeout_ms,
    secret_scope: definition.secret_scope,
    fallback_capability: entry.fallback_capability,
  };
}

function isLoopbackIp(address: string) {
  return address === "127.0.0.1" || address === "::1";
}

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const segments = address.split(".").map((segment) => Number(segment));
    const first = segments[0] ?? 0;
    const second = segments[1] ?? 0;

    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.")
  );
}

function allowLoopbackFetch() {
  return process.env.NODE_ENV !== "production";
}

async function assertRemoteUrlAllowed(source_url: string) {
  let parsed: URL;

  try {
    parsed = new URL(source_url);
  } catch {
    throw new Error("ATTACHMENT_SOURCE_URL_INVALID");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("ATTACHMENT_SOURCE_PROTOCOL_UNSUPPORTED");
  }

  const hostname = parsed.hostname.trim();

  if (!hostname) {
    throw new Error("ATTACHMENT_SOURCE_URL_INVALID");
  }

  const loopbackAllowed = allowLoopbackFetch();

  if (hostname === "localhost" && !loopbackAllowed) {
    throw new Error("SSRF_PRIVATE_ADDRESS_BLOCKED");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname) && !(loopbackAllowed && isLoopbackIp(hostname))) {
      throw new Error("SSRF_PRIVATE_ADDRESS_BLOCKED");
    }

    return parsed;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  for (const entry of addresses) {
    if (isPrivateIp(entry.address) && !(loopbackAllowed && isLoopbackIp(entry.address))) {
      throw new Error("SSRF_PRIVATE_ADDRESS_BLOCKED");
    }
  }

  return parsed;
}

async function fetchRemoteAttachment(source_url: string, timeout_ms: number, max_bytes: number) {
  const parsed = await assertRemoteUrlAllowed(source_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`ATTACHMENT_FETCH_FAILED_${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > max_bytes) {
      throw new Error("ATTACHMENT_SIZE_LIMIT_EXCEEDED");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > max_bytes) {
      throw new Error("ATTACHMENT_SIZE_LIMIT_EXCEEDED");
    }

    return buffer;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("ATTACHMENT_FETCH_TIMEOUT");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAttachmentPayload(input: AttachmentResolutionInput) {
  const inlineText = trimText(input.attachment.inline_text);
  if (inlineText) {
    return {
      source_kind: "inline_text" as const,
      source_locator: null,
      buffer: Buffer.from(inlineText, "utf8"),
    };
  }

  const inlineBytes = trimText(input.attachment.inline_bytes_base64);
  if (inlineBytes) {
    return {
      source_kind: "inline_base64" as const,
      source_locator: null,
      buffer: Buffer.from(inlineBytes, "base64"),
    };
  }

  const sourceUrl = trimText(input.attachment.source_url);
  if (sourceUrl) {
    return {
      source_kind: "remote_url" as const,
      source_locator: sourceUrl,
      buffer: await fetchRemoteAttachment(
        sourceUrl,
        ATTACHMENT_LIMITS.remote_fetch_timeout_ms,
        ATTACHMENT_LIMITS.max_item_bytes,
      ),
    };
  }

  throw new Error("ATTACHMENT_SOURCE_MISSING");
}

function toStructuredText(buffer: Buffer) {
  const raw = buffer.toString("utf8").replace(/\0/g, "");
  return trimText(raw);
}

function buildSummary(capability: ChannelMultimodalCapability, structured_text: string | null, file_name: string) {
  if (capability === "asr") {
    return structured_text ? `语音转写已完成：${previewText(structured_text)}` : `语音转写完成：${file_name}`;
  }

  if (capability === "vision_understanding") {
    return structured_text ? `图像理解已完成：${previewText(structured_text)}` : `图像理解完成：${file_name}`;
  }

  return structured_text ? `文档提取已完成：${previewText(structured_text)}` : `文档提取完成：${file_name}`;
}

function inferExtractModes(kind: ChannelAttachmentKind, structured_text: string | null) {
  const text = structured_text ?? "";
  const modes = new Set<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">();

  if (/角色|女主|男主|法医|警官|character/i.test(text)) {
    modes.add("character");
  }
  if (/关系|前任|暧昧|love|relationship/i.test(text)) {
    modes.add("relationship");
  }
  if (/地点|站台|城市|location|world/i.test(text)) {
    modes.add("location");
  }
  if (/风格|氛围|克制|文风|style/i.test(text) || kind === "image") {
    modes.add("style");
  }
  if (/主题|情绪|重逢|theme|emotion/i.test(text) || kind === "image") {
    modes.add("theme");
  }
  if (/冲突|拉扯|对抗|conflict/i.test(text)) {
    modes.add("conflict_pattern");
  }

  if (modes.size === 0) {
    modes.add(kind === "image" ? "style" : "character");
    modes.add(kind === "image" ? "theme" : "relationship");
  }

  return [...modes];
}

function toBlockedAttachment(input: {
  handoff_id: string;
  attachment: ChannelAttachmentMetadata;
  attachment_kind: ChannelAttachmentKind;
  capability: ChannelMultimodalCapability;
  capability_preflight: ChannelAttachmentCapabilityPreflightView;
  blocked_reason: string;
  source_kind?: ChannelAttachmentSourceKind;
  source_locator?: string | null;
}): ResolvedAttachment {
  return {
    handoff_id: input.handoff_id,
    file_name: sanitizeFileName(input.attachment.file_name),
    mime_type: input.attachment.mime_type,
    size_bytes: input.attachment.size_bytes,
    attachment_kind: input.attachment_kind,
    source_kind: input.source_kind ?? "metadata_only",
    source_locator: input.source_locator ?? null,
    status: "blocked",
    blocked_reason: input.blocked_reason,
    fetch_status: "blocked",
    fetch_size_bytes: 0,
    capability: input.capability,
    capability_preflight: input.capability_preflight,
    provider_id: null,
    model_id: null,
    structured_text: null,
    summary: `附件已被阻断：${input.blocked_reason}`,
  };
}

export async function resolveInboundAttachments(input: {
  provider_message_id: string;
  attachments?: ChannelAttachmentMetadata[];
}) {
  const attachments = (input.attachments ?? []).slice(0, ATTACHMENT_LIMITS.max_items_per_message);
  const runtime = readAiRuntimeConfig();
  let totalBytes = 0;
  const resolved: ResolvedAttachment[] = [];

  for (const [index, attachment] of attachments.entries()) {
    const handoff_id = `${input.provider_message_id}:attachment:${index + 1}`;
    const attachment_kind = inferAttachmentKind(attachment);
    const capability = inferCapability(attachment_kind);
    const capability_preflight = buildCapabilityPreflight(capability);
    totalBytes += attachment.size_bytes;

    if (attachment.size_bytes > ATTACHMENT_LIMITS.max_item_bytes) {
      resolved.push(
        toBlockedAttachment({
          handoff_id,
          attachment,
          attachment_kind,
          capability,
          capability_preflight,
          blocked_reason: "ATTACHMENT_SIZE_LIMIT_EXCEEDED",
        }),
      );
      continue;
    }

    if (totalBytes > ATTACHMENT_LIMITS.max_total_bytes) {
      resolved.push(
        toBlockedAttachment({
          handoff_id,
          attachment,
          attachment_kind,
          capability,
          capability_preflight,
          blocked_reason: "ATTACHMENT_MESSAGE_BUDGET_EXCEEDED",
        }),
      );
      continue;
    }

    if (capability_preflight.status === "blocked") {
      resolved.push(
        toBlockedAttachment({
          handoff_id,
          attachment,
          attachment_kind,
          capability,
          capability_preflight,
          blocked_reason: "AI_CAPABILITY_BLOCKED",
        }),
      );
      continue;
    }

    try {
      const payload = await resolveAttachmentPayload({
        handoff_id,
        attachment,
      });
      const plan = resolveAiCapabilityExecutionPlan(runtime, {
        capability: capability as AiCapabilityKey,
      });
      const structured_text = toStructuredText(payload.buffer);
      const summary = buildSummary(capability, structured_text, attachment.file_name);

      resolved.push({
        handoff_id,
        file_name: sanitizeFileName(attachment.file_name),
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
        attachment_kind,
        source_kind: payload.source_kind,
        source_locator: payload.source_locator,
        status: "processed",
        blocked_reason: null,
        fetch_status: payload.source_kind === "remote_url" ? "resolved" : "skipped",
        fetch_size_bytes: payload.buffer.byteLength,
        capability,
        capability_preflight,
        provider_id: plan.provider_id,
        model_id: plan.model_id,
        structured_text,
        summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolved.push(
        toBlockedAttachment({
          handoff_id,
          attachment,
          attachment_kind,
          capability,
          capability_preflight,
          blocked_reason: message,
          source_kind: trimText(attachment.source_url) ? "remote_url" : trimText(attachment.inline_text) ? "inline_text" : trimText(attachment.inline_bytes_base64) ? "inline_base64" : "metadata_only",
          source_locator: trimText(attachment.source_url),
        }),
      );
    }
  }

  const derived_text = resolved
    .filter((item) => item.status === "processed")
    .map((item) => item.structured_text ?? item.summary)
    .filter((item): item is string => Boolean(item))
    .join("\n")
    .slice(0, ATTACHMENT_LIMITS.max_derived_text_chars);

  return {
    resolved,
    derived_text,
  };
}

export function buildMultimodalEffectiveText(input: {
  text?: string;
  derived_text?: string;
}) {
  const base = trimText(input.text);
  if (base) {
    return base;
  }

  return trimText(input.derived_text) ?? "";
}

export async function persistResolvedAttachments(input: {
  channel_event_id: string;
  account_id: string;
  session_id: string;
  story_id: string | null;
  resolved: ResolvedAttachment[];
}) {
  const repository = createMultimodalIntakeRepository();
  const handoffs: ChannelAttachmentHandoffView[] = [];
  const reference_asset_ids: string[] = [];
  const multimodal_artifact_ids: string[] = [];

  for (const item of input.resolved) {
    let reference_asset_id: string | null = null;

    if (item.status === "processed" && item.capability !== "asr") {
      const ingested = await ingestResolvedReferenceAsset({
        account_id: input.account_id,
        story_id: input.story_id,
        scope: input.story_id ? "story" : "user_private_library",
        file_name: item.file_name,
        mime_type: item.mime_type,
        source_ref_id: item.handoff_id,
        source_locator: item.source_locator,
        summary: item.summary,
        structured_text: item.structured_text,
        capability: item.capability,
        extract_modes: inferExtractModes(item.attachment_kind, item.structured_text),
      });
      reference_asset_id = ingested.asset_id;
      reference_asset_ids.push(ingested.asset_id);
    }

    const artifact = await repository.createArtifact({
      channel_event_id: input.channel_event_id,
      handoff_id: item.handoff_id,
      account_id: input.account_id,
      session_id: input.session_id,
      story_id: input.story_id,
      file_name: item.file_name,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
      attachment_kind: item.attachment_kind,
      source_kind: item.source_kind,
      source_locator: item.source_locator,
      resolution_status: item.status,
      blocked_reason: item.blocked_reason,
      fetch_status: item.fetch_status,
      fetch_size_bytes: item.fetch_size_bytes,
      capability: item.capability,
      capability_status: item.capability_preflight.status,
      backend_id: item.capability_preflight.backend_id,
      provider_id: item.provider_id,
      model_id: item.model_id,
      timeout_ms: item.capability_preflight.timeout_ms,
      budget_max_cost_usd: item.capability_preflight.budget_max_cost_usd,
      structured_text: item.structured_text,
      summary: item.summary,
      reference_asset_id,
    });
    multimodal_artifact_ids.push(artifact.id);

    void recordDomainEvent({
      event_name: item.status === "processed" ? "multimodal_attachment_processed" : "multimodal_attachment_blocked",
      account_id: input.account_id,
      payload: {
        channel_event_id: input.channel_event_id,
        artifact_ref_id: artifact.id,
        capability: item.capability,
        reference_asset_id,
        blocked_reason: item.blocked_reason,
      },
    });

    handoffs.push({
      handoff_id: item.handoff_id,
      file_name: item.file_name,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
      attachment_kind: item.attachment_kind,
      handoff_mode: "resolved",
      target: "multimodal_intake_queue",
      status: item.status,
      source_kind: item.source_kind,
      capability_preflight: item.capability_preflight,
      artifact_ref_id: artifact.id,
      reference_asset_id,
      blocked_reason: item.blocked_reason,
      structured_result:
        item.status === "processed"
          ? {
              summary: item.summary,
              structured_text_preview: previewText(item.structured_text),
              source_excerpt: previewText(item.structured_text),
            }
          : null,
    });
  }

  return {
    handoffs,
    patch: {
      reference_asset_ids,
      multimodal_artifact_ids,
      multimodal_blocked_count: handoffs.filter((item) => item.status === "blocked").length,
    },
  };
}
