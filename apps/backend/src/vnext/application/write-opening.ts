import type {
  CreativeTaskCompletionPort,
  CreativeTaskExecutionSuccess,
} from "../domain/creative-task.js";

type WriteOpeningCompletionInput = Extract<
  CreativeTaskExecutionSuccess,
  { kind: "write_opening" }
>;

export class WriteOpening {
  constructor(private readonly completionPort: CreativeTaskCompletionPort) {}

  execute(input: WriteOpeningCompletionInput) {
    return this.completionPort.complete(input);
  }
}
