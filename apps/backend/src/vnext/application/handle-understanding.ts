import {
  CreativeTaskCompletionNotConfiguredError,
  type CreativeTaskCompletionDisposition,
  type CreativeTaskCompletionPort,
  type CreativeTaskExecutionSuccess,
} from "../domain/creative-task.js";
import type {
  UnderstandingCompletionInput,
  VnextUnderstandingCompletionUow,
} from "../domain/understanding-completion.uow.js";
import { WriteOpening } from "./write-opening.js";

export class HandleUnderstanding {
  constructor(private readonly uow: VnextUnderstandingCompletionUow) {}

  execute(input: UnderstandingCompletionInput) {
    return this.uow.complete(input);
  }
}

export class VnextCreativeCompletionRouter implements CreativeTaskCompletionPort {
  constructor(
    private readonly handleUnderstanding: HandleUnderstanding,
    private readonly writeOpening: WriteOpening,
  ) {}

  complete(
    input: CreativeTaskExecutionSuccess,
  ): Promise<CreativeTaskCompletionDisposition> {
    if (input.kind === "understand") {
      return this.handleUnderstanding.execute(input);
    }
    if (input.kind === "write_opening") {
      return this.writeOpening.execute(input);
    }
    throw new CreativeTaskCompletionNotConfiguredError(input.kind);
  }
}
