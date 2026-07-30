import type { TelemetryPayload } from "@erliu/telemetry";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchTelemetryFunnel(account_token: string) {
  const response = await fetch(
    `${apiBaseUrl()}/telemetry/funnel?account_token=${encodeURIComponent(account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch telemetry funnel");
  }

  const payload = (await response.json()) as {
    data: {
      steps: Array<{
        step_key: string;
        label: string;
        event_name: string;
        count: number;
        completed: boolean;
        audit_required: boolean;
        audit_count: number;
      }>;
      totals: {
        event_count: number;
        audit_log_count: number;
        completed_step_count: number;
      };
    };
  };

  return payload.data;
}

export async function fetchTelemetryFeed(account_token: string) {
  const response = await fetch(
    `${apiBaseUrl()}/telemetry/events?account_token=${encodeURIComponent(account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch telemetry feed");
  }

  const payload = (await response.json()) as {
    data: {
      events: Array<{
        event_name: string;
        payload: TelemetryPayload;
        created_at: string;
      }>;
      audit_logs: Array<{
        event_name: string;
        payload: TelemetryPayload;
        created_at: string;
      }>;
    };
  };

  return payload.data;
}
