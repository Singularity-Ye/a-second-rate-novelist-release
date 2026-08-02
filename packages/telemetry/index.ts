import { resolveRuntimeApiBaseUrl } from "@erliu/shared-contracts";

export type TelemetryPayload = Record<string, string | number | boolean | null>;

export const M1_FUNNEL_STEPS = [
  {
    step_key: "onboarding_complete",
    label: "首访完成",
    event_name: "onboarding_complete",
    audit_required: true,
  },
  {
    step_key: "proposal_selected",
    label: "提案被选中",
    event_name: "proposal_selected",
    audit_required: true,
  },
  {
    step_key: "chapter_generation_completed",
    label: "章节生成完成",
    event_name: "chapter_generation_completed",
    audit_required: false,
  },
  {
    step_key: "chapter_accepted",
    label: "章节被接受",
    event_name: "chapter_accepted",
    audit_required: true,
  },
  {
    step_key: "intent_corrected",
    label: "最近记下纠错",
    event_name: "intent_corrected",
    audit_required: true,
  },
  {
    step_key: "room_hotspot_clicked",
    label: "房间热点点击",
    event_name: "room_hotspot_clicked",
    audit_required: false,
  },
  {
    step_key: "deep_link_opened",
    label: "深链打开",
    event_name: "deep_link_opened",
    audit_required: false,
  },
] as const;

export const AUDIT_REQUIRED_EVENTS: ReadonlySet<string> = new Set(
  [
    ...M1_FUNNEL_STEPS.filter((item) => item.audit_required).map((item) => item.event_name),
    "export_risk_check_complete",
    "export_start",
    "export_complete",
    "rights_pack_generate",
    "rights_label_waiver_submit",
  ],
);

function readRuntimeApiBaseUrl() {
  const maybeGlobal = globalThis as {
    window?: {
      __ERLIU_RUNTIME_API_BASE_URL__?: string;
    };
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  if (typeof maybeGlobal.window?.__ERLIU_RUNTIME_API_BASE_URL__ === "string") {
    return maybeGlobal.window.__ERLIU_RUNTIME_API_BASE_URL__;
  }

  return maybeGlobal.process?.env?.NEXT_PUBLIC_API_BASE_URL;
}

export function resolveTelemetryApiBaseUrl() {
  return resolveRuntimeApiBaseUrl(readRuntimeApiBaseUrl());
}

export async function emitTelemetryEvent(input: {
  account_token: string;
  event_name: string;
  payload: TelemetryPayload;
  apiBaseUrl?: string;
}) {
  const apiBaseUrl = input.apiBaseUrl ?? resolveTelemetryApiBaseUrl();

  await fetch(`${apiBaseUrl}/telemetry/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      event_name: input.event_name,
      payload: input.payload,
    }),
    keepalive: true,
  });
}
