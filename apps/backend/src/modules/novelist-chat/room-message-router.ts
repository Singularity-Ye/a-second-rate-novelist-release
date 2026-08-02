import { Inject, Injectable } from "@nestjs/common";
import type {
  ExperienceProjection,
  RoomMessageHandling,
  RoomMessageIntent,
} from "@erliu/shared-contracts/vnext-experience";
import {
  CorrectUnderstanding,
  correctUnderstandingErrorResponse,
} from "../../vnext/application/correct-understanding.js";
import {
  ReadExperienceProjection,
  readExperienceProjectionErrorResponse,
} from "../../vnext/application/read-experience-projection.js";
import {
  SubmitSourceMessage,
  submitSourceMessageErrorResponse,
} from "../../vnext/application/submit-source-message.js";
import type { NovelistChatChannel } from "./novelist-chat.service.js";

const SMALL_TALK_PATTERN =
  /^(?:你好|嗨|在吗|谢谢|辛苦了|早安|晚安|你是谁|你在干嘛|聊聊天)[！!。.?？~～\s]*$/u;
const REJECT_PATTERN =
  /(?:完全不是|推倒重来|不要这版|这版不要|整版不要|打回(?:去)?重写|全部作废)/u;
const CONTINUE_PATTERN =
  /(?:^|[，。！？!\s])(?:继续|接着|往下)(?:写|更|来)|(?:下一章|下一段|续写|继续这本|沿这条继续)/u;
const REVISION_PATTERN =
  /(?:(?:这|那|当前)?(?:一版|版|段|章|篇|稿|开篇).{0,16}(?:改|重写|删|换|慢一点|快一点|视角|不对|不行)|^(?:把|请把).{1,80}(?:改成|删掉|换成)|(?:改一下|重写一下|润色一下))/u;
const CREATIVE_INTENT_PATTERNS = [
  /^(?:我想看|我想要|想看|给我来|来一个|来一段|帮我|替我|请你).{0,48}(?:故事|小说|开篇|一章|一段|一部|写|创作|构思)/u,
  /(?:从零|重新开始).{0,16}(?:写|创作|构思).{0,16}(?:小说|故事|开篇)/u,
  /(?:帮我|给我|替我|请你).{0,10}(?:写|创作|构思)(?:一|个|篇|部|段|章|本|场)/u,
  /(?:写|创作)(?:一|个|篇|部|段|章|本|场)(?:小说|故事|开篇|正文|场景)/u,
] as const;

export interface ClassifyRoomMessageInput {
  readonly channel: NovelistChatChannel;
  readonly text: string;
  readonly projection: ExperienceProjection;
}

export interface RouteRoomMessageInput extends ClassifyRoomMessageInput {
  readonly clientRequestId: string;
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
}

export interface RoomMessageRouteResult {
  readonly intent: RoomMessageIntent;
  readonly handling: RoomMessageHandling;
  readonly projection: ExperienceProjection;
}

export class RoomMessageRoutePublicError extends Error {
  override readonly name = "RoomMessageRoutePublicError";

  constructor(
    readonly status: number,
    readonly body: { readonly code: string; readonly recovery: string },
  ) {
    super(body.code);
  }
}

function normalizedMessage(text: string) {
  return text.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

function hasProjectionAction(
  projection: ExperienceProjection,
  code: "correct_understanding" | "retry_current_task",
) {
  return [projection.primaryAction, ...projection.secondaryActions].some(
    (action) => action?.code === code,
  );
}

export function classifyRoomMessageIntent(
  input: ClassifyRoomMessageInput,
): RoomMessageIntent {
  if (input.channel === "subsystem") {
    return "conversation";
  }
  const text = normalizedMessage(input.text);
  if (REJECT_PATTERN.test(text)) {
    return "reject";
  }
  if (CONTINUE_PATTERN.test(text)) {
    return "continue";
  }
  if (REVISION_PATTERN.test(text)) {
    return "revise";
  }
  if (
    input.projection.understanding?.clarificationQuestion !== null &&
    input.projection.understanding?.clarificationQuestion !== undefined &&
    !SMALL_TALK_PATTERN.test(text)
  ) {
    return "creative_intent";
  }
  if (CREATIVE_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return "creative_intent";
  }
  return "conversation";
}

@Injectable()
export class RoomMessageRouter {
  constructor(
    @Inject(ReadExperienceProjection)
    private readonly readProjection: ReadExperienceProjection,
    @Inject(SubmitSourceMessage)
    private readonly submitSourceMessage: SubmitSourceMessage,
    @Inject(CorrectUnderstanding)
    private readonly correctUnderstanding: CorrectUnderstanding,
  ) {}

  async route(
    input: Omit<RouteRoomMessageInput, "projection">,
  ): Promise<RoomMessageRouteResult> {
    let projection: ExperienceProjection;
    try {
      projection = await this.readProjection.execute(
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
    } catch (error) {
      const mapped = readExperienceProjectionErrorResponse(error);
      throw new RoomMessageRoutePublicError(mapped.status, mapped.body);
    }
    const intent = classifyRoomMessageIntent({
      channel: input.channel,
      text: input.text,
      projection,
    });
    if (intent === "conversation") {
      return { intent, handling: "conversation", projection };
    }

    const canCorrect =
      intent === "creative_intent" &&
      projection.understanding !== null &&
      hasProjectionAction(projection, "correct_understanding");
    if (canCorrect) {
      let corrected;
      try {
        corrected = await this.correctUnderstanding.execute({
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          request: {
            action: "correct_understanding",
            clientRequestId: input.clientRequestId,
            basedOnVersionId: projection.understanding!.versionId,
            text: input.text,
          },
        });
      } catch (error) {
        const mapped = correctUnderstandingErrorResponse(error);
        throw new RoomMessageRoutePublicError(mapped.status, mapped.body);
      }
      return {
        intent,
        handling: "submitted",
        projection: corrected.projection,
      };
    }

    const canStartCommission =
      intent === "creative_intent" &&
      (projection.status === "available" ||
        (projection.status === "unavailable" &&
          projection.understanding === null &&
          !hasProjectionAction(projection, "retry_current_task")));
    if (canStartCommission) {
      let submitted;
      try {
        submitted = await this.submitSourceMessage.execute({
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          request: {
            action: "submit_intent",
            clientRequestId: input.clientRequestId,
            text: input.text,
          },
        });
      } catch (error) {
        const mapped = submitSourceMessageErrorResponse(error);
        throw new RoomMessageRoutePublicError(mapped.status, mapped.body);
      }
      return {
        intent,
        handling: "submitted",
        projection: submitted.projection,
      };
    }

    if (intent === "continue" || intent === "revise" || intent === "reject") {
      // Keep the semantic intent, but let the appropriate runtime character
      // explain the unavailable capability through the real streamed model.
      // The controller supplies a server-owned boundary that forbids claiming
      // the formal action ran.
      return { intent, handling: "conversation", projection };
    }

    return { intent, handling: "not_available", projection };
  }
}
