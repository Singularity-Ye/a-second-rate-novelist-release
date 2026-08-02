import { Body, Controller, Param, Post } from "@nestjs/common";
import type {
  StoryIntakeSessionRequest,
  StoryProposalAcceptRequest,
  StoryProposalGenerateRequest,
} from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "./story-intake.service.js";

@Controller()
export class StoryIntakeController {
  @Post("/stories/intake-sessions")
  async createSession(@Body() body: StoryIntakeSessionRequest) {
    return successEnvelope(await createStoryIntakeSession(body));
  }

  @Post("/stories/intake-sessions/:sessionId/proposals/generate")
  async generateProposals(
    @Param("sessionId") sessionId: string,
    @Body() body: StoryProposalGenerateRequest,
  ) {
    return successEnvelope(
      await generateStoryProposals({
        session_id: sessionId,
        ...body,
      }),
    );
  }

  @Post("/stories/proposals/:proposalId/accept")
  async acceptProposal(
    @Param("proposalId") proposalId: string,
    @Body() body: StoryProposalAcceptRequest,
  ) {
    return successEnvelope(
      await acceptStoryProposal({
        proposal_id: proposalId,
        ...body,
      }),
    );
  }
}
