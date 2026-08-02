import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  acceptMergeProposal,
  createBranch,
  createMergeProposal,
  getBranchDetail,
} from "./branch-service.service.js";

@Controller()
export class BranchServiceController {
  @Post("/stories/:storyId/branches")
  create(
    @Param("storyId") storyId: string,
    @Body() body: {
      anchor_ref: { chapter_id: string };
      branch_type: string;
      goal: string;
      rights_mode: "private_sandbox" | "original_adaptation" | "export_blocked";
      client_request_id: string;
    },
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    return this.createAsync(storyId, body, response);
  }

  private async createAsync(
    storyId: string,
    body: {
      anchor_ref: { chapter_id: string };
      branch_type: string;
      goal: string;
      rights_mode: "private_sandbox" | "original_adaptation" | "export_blocked";
      client_request_id: string;
    },
    response: { status: (code: number) => void },
  ) {
    const result = await createBranch({
      story_id: storyId,
      ...body,
    });

    if (result.status === "invalid_anchor" || result.status === "blocked") {
      response.status(409);
    }

    return successEnvelope(result);
  }

  @Get("/stories/:storyId/branches/:branchId")
  async detail(@Param("storyId") storyId: string, @Param("branchId") branchId: string) {
    return successEnvelope(
      await getBranchDetail({
        story_id: storyId,
        branch_id: branchId,
      }),
    );
  }

  @Post("/branches/:branchId/merge-proposals")
  proposal(
    @Param("branchId") branchId: string,
    @Body() body: {
      target_story_version_id: string;
      merge_mode: "replace" | "selective_patch" | "keep_parallel";
      selected_sections?: Array<{ label: string }>;
      client_request_id: string;
    },
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    return this.proposalAsync(branchId, body, response);
  }

  private async proposalAsync(
    branchId: string,
    body: {
      target_story_version_id: string;
      merge_mode: "replace" | "selective_patch" | "keep_parallel";
      selected_sections?: Array<{ label: string }>;
      client_request_id: string;
    },
    response: { status: (code: number) => void },
  ) {
    const result = await createMergeProposal({
      branch_id: branchId,
      ...body,
    });

    if (result.status === "conflicted") {
      response.status(409);
    }

    return successEnvelope(result);
  }

  @Post("/branches/:branchId/merge-proposals/:proposalId/accept")
  accept(
    @Param("branchId") branchId: string,
    @Param("proposalId") proposalId: string,
    @Body() body: {
      target_story_version_id: string;
      client_request_id: string;
    },
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    return this.acceptAsync(branchId, proposalId, body, response);
  }

  private async acceptAsync(
    branchId: string,
    proposalId: string,
    body: {
      target_story_version_id: string;
      client_request_id: string;
    },
    response: { status: (code: number) => void },
  ) {
    const result = await acceptMergeProposal({
      branch_id: branchId,
      proposal_id: proposalId,
      ...body,
    });

    if (result.status === "conflicted") {
      response.status(409);
    }

    return successEnvelope(result);
  }
}
