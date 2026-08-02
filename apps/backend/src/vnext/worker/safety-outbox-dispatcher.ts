import type {
  CrisisEscalationPort,
  CrisisEscalationReceipt,
  SafetyOutboxRepository,
} from "../domain/crisis-escalation.port.js";

export interface SafetyOutboxDispatcherOptions {
  readonly workerInstanceId: string;
  readonly repository: SafetyOutboxRepository;
  readonly escalation: CrisisEscalationPort;
  readonly leaseDurationMs: number;
  readonly retryDelayMs: number;
}

export class SafetyOutboxDispatcher {
  constructor(private readonly options: SafetyOutboxDispatcherOptions) {
    if (
      options.workerInstanceId.trim().length === 0 ||
      options.workerInstanceId.length > 200 ||
      !Number.isSafeInteger(options.leaseDurationMs) ||
      options.leaseDurationMs < 1 ||
      !Number.isSafeInteger(options.retryDelayMs) ||
      options.retryDelayMs < 1
    ) {
      throw new Error("invalid safety dispatcher options");
    }
  }

  async runOnce() {
    const lease = await this.options.repository.claimNext({
      workerInstanceId: this.options.workerInstanceId,
      leaseDurationMs: this.options.leaseDurationMs,
    });
    if (lease === null) {
      return { status: "idle" as const };
    }
    try {
      await this.options.repository.refreshHeartbeat(
        this.options.workerInstanceId,
        "claimed",
      );
    } catch {
      // Heartbeat failure must not abandon an already claimed safety event.
    }
    let receipt: CrisisEscalationReceipt;
    try {
      receipt = await this.options.escalation.escalate({
        idempotencyKey: lease.idempotencyKey,
        safetyCaseId: lease.safetyCaseId,
        safetyContactRef: lease.safetyContactRef,
      });
    } catch {
      const disposition = await this.options.repository.markFailed(
        lease,
        this.options.retryDelayMs,
      );
      await this.options.repository
        .refreshHeartbeat(this.options.workerInstanceId, "failed")
        .catch(() => undefined);
      return { status: disposition, eventId: lease.eventId } as const;
    }

    // Once the adapter succeeds, never mark the event failed if the local ACK
    // write errors. The exact lease stays recoverable and the stable event key
    // makes a replay idempotent.
    try {
      const published = await this.options.repository.markPublished(
        lease,
        receipt.deliveryRef,
      );
      if (!published) {
        return {
          status: "delivery_ack_pending" as const,
          eventId: lease.eventId,
        };
      }
    } catch {
      return {
        status: "delivery_ack_pending" as const,
        eventId: lease.eventId,
      };
    }
    await this.options.repository
      .refreshHeartbeat(this.options.workerInstanceId, "succeeded")
      .catch(() => undefined);
    return { status: "published" as const, eventId: lease.eventId };
  }
}
