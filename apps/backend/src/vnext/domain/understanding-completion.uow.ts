import type {
  CreativeTaskCompletionDisposition,
  CreativeTaskExecutionSuccess,
} from "./creative-task.js";

export type UnderstandingCompletionInput = Extract<
  CreativeTaskExecutionSuccess,
  { kind: "understand" }
>;

export type VnextUnderstandingCompletionWritePoint =
  | "after_task_fence"
  | "after_trace"
  | "after_reader_memory"
  | "after_workspace"
  | "after_workspace_cas"
  | "after_boundary_revoke"
  | "after_boundary_add"
  | "after_understanding"
  | "after_commission"
  | "after_opening_task"
  | "after_outbox"
  | "after_projection_version"
  | "before_commit";

export interface VnextUnderstandingCompletionProbe {
  afterWrite(point: VnextUnderstandingCompletionWritePoint): void | Promise<void>;
}

export interface VnextUnderstandingCompletionUow {
  complete(
    input: UnderstandingCompletionInput,
  ): Promise<CreativeTaskCompletionDisposition>;
}

export const VNEXT_UNDERSTANDING_COMPLETION_UOW = Symbol(
  "VNEXT_UNDERSTANDING_COMPLETION_UOW",
);
