import type { TelemetryPayload } from "@erliu/telemetry";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type EventLogRecord = AppState["eventLogs"][number];
export type AuditLogRecord = AppState["auditLogs"][number];
export type MetricSnapshotRecord = AppState["metricSnapshots"][number];

export interface AppendDomainEventInput {
  event_name: string;
  account_id: string;
  payload: TelemetryPayload;
  mirror_to_audit?: boolean;
  created_at?: string;
}

export interface ListObservabilityLogInput {
  account_id?: string | null;
  limit?: number;
}

export interface UpsertMetricSnapshotInput {
  metric_key: string;
  value: number;
  segment_key: string;
  freshness_status?: "fresh" | "stale" | "delayed";
  now?: string;
}

export interface ListMetricSnapshotsInput {
  metric_key?: string;
  segment_key?: string;
}

export interface ObservabilityRepository {
  appendDomainEvent(input: AppendDomainEventInput): {
    event_log: EventLogRecord;
    audit_log: AuditLogRecord | null;
  } | Promise<{
    event_log: EventLogRecord;
    audit_log: AuditLogRecord | null;
  }>;
  listDomainEvents(input?: ListObservabilityLogInput): Promise<EventLogRecord[]>;
  listAuditLogs(input?: ListObservabilityLogInput): Promise<AuditLogRecord[]>;
  upsertMetricSnapshot(input: UpsertMetricSnapshotInput): Promise<MetricSnapshotRecord>;
  upsertMetricSnapshots(input: UpsertMetricSnapshotInput[]): Promise<MetricSnapshotRecord[]>;
  listMetricSnapshots(input?: ListMetricSnapshotsInput): Promise<MetricSnapshotRecord[]>;
}

function todayBucketStart(now: string) {
  return `${now.slice(0, 10)}T00:00:00.000Z`;
}

function sortNewestFirst<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function matchesAccount<T extends { account_id: string }>(
  items: T[],
  account_id?: string | null,
) {
  if (!account_id) {
    return items;
  }

  return items.filter((item) => item.account_id === account_id);
}

function upsertMetricSnapshotInState(
  state: AppState,
  input: UpsertMetricSnapshotInput,
): MetricSnapshotRecord {
  const now = input.now ?? new Date().toISOString();
  const bucket_start = todayBucketStart(now);
  const existing = state.metricSnapshots.find(
    (item) =>
      item.metric_key === input.metric_key &&
      item.bucket_start === bucket_start &&
      item.segment_key === input.segment_key,
  );

  if (existing) {
    existing.value = input.value;
    existing.bucket_end = now;
    existing.freshness_status = input.freshness_status ?? "fresh";
    existing.created_at = now;
    return existing;
  }

  const created: MetricSnapshotRecord = {
    metric_key: input.metric_key,
    bucket_start,
    bucket_end: now,
    value: input.value,
    segment_key: input.segment_key,
    freshness_status: input.freshness_status ?? "fresh",
    created_at: now,
  };

  state.metricSnapshots.push(created);
  return created;
}

export function createObservabilityRepository(): ObservabilityRepository {
  return {
    async appendDomainEvent(input) {
      const state = await readAppState();
      const created_at = input.created_at ?? new Date().toISOString();
      const event_log: EventLogRecord = {
        event_name: input.event_name,
        account_id: input.account_id,
        payload: input.payload,
        created_at,
      };
      let audit_log: AuditLogRecord | null = null;

      state.eventLogs.push(event_log);

      if (input.mirror_to_audit) {
        audit_log = {
          event_name: input.event_name,
          account_id: input.account_id,
          payload: input.payload,
          created_at,
        };
        state.auditLogs.push(audit_log);
      }

      await writeAppState(state);

      return {
        event_log,
        audit_log,
      };
    },
    async listDomainEvents(input = {}) {
      return sortNewestFirst(matchesAccount((await readAppState()).eventLogs, input.account_id)).slice(0, input.limit ?? 50);
    },
    async listAuditLogs(input = {}) {
      return sortNewestFirst(matchesAccount((await readAppState()).auditLogs, input.account_id)).slice(0, input.limit ?? 20);
    },
    async upsertMetricSnapshot(input) {
      const state = await readAppState();
      const snapshot = upsertMetricSnapshotInState(state, input);

      await writeAppState(state);
      return snapshot;
    },
    async upsertMetricSnapshots(input) {
      const state = await readAppState();
      const snapshots = input.map((item) => upsertMetricSnapshotInState(state, item));

      await writeAppState(state);
      return snapshots;
    },
    async listMetricSnapshots(input = {}) {
      return sortNewestFirst(
        (await readAppState()).metricSnapshots.filter((item) => {
          if (input.metric_key && item.metric_key !== input.metric_key) {
            return false;
          }

          if (input.segment_key && item.segment_key !== input.segment_key) {
            return false;
          }

          return true;
        }),
      );
    },
  };
}
