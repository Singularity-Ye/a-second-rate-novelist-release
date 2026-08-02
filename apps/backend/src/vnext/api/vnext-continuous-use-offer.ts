import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import {
  VNEXT_CONTINUOUS_USE_EMITTED_AT_HEADER,
  VNEXT_CONTINUOUS_USE_NEXT_AT_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
  VNEXT_CONTINUOUS_USE_REMINDER_HEADER,
} from "@erliu/shared-contracts/vnext-experience";
import type { ContinuousUseEvaluation } from "../domain/compliance-readiness.js";

export const VNEXT_SKIP_CONTINUOUS_USE_OFFER = "vnext.skipContinuousUseOffer";

export const SkipContinuousUseOffer = () =>
  SetMetadata(VNEXT_SKIP_CONTINUOUS_USE_OFFER, true);

export function shouldSkipContinuousUseOffer(context: ExecutionContext) {
  return (
    Reflect.getMetadata(VNEXT_SKIP_CONTINUOUS_USE_OFFER, context.getHandler()) ===
      true ||
    Reflect.getMetadata(VNEXT_SKIP_CONTINUOUS_USE_OFFER, context.getClass()) ===
      true
  );
}

interface ContinuousUseOfferResponse {
  setHeader(name: string, value: string): void;
}

export function writeContinuousUseOfferHeaders(
  response: ContinuousUseOfferResponse,
  evaluation: ContinuousUseEvaluation,
) {
  response.setHeader(VNEXT_CONTINUOUS_USE_REMINDER_HEADER, evaluation.status);
  if (evaluation.status === "not_due") {
    response.setHeader(
      VNEXT_CONTINUOUS_USE_NEXT_AT_HEADER,
      evaluation.nextReminderAt.toISOString(),
    );
    return;
  }
  response.setHeader(VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER, evaluation.receiptId);
  response.setHeader(
    VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
    String(evaluation.receiptVersion),
  );
  response.setHeader(
    VNEXT_CONTINUOUS_USE_EMITTED_AT_HEADER,
    evaluation.emittedAt.toISOString(),
  );
}
