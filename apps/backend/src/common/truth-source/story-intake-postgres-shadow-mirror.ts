import type { AccountRecord } from "../repositories/account.repository.js";
import type {
  StoryIntakeSessionRecord,
  StoryProposalRecord,
  StoryWorkspaceRecord,
} from "../repositories/story-workspace.repository.js";
import { createObservabilityRepository } from "../repositories/observability.repository.js";
import { Prisma } from "@prisma/client";
import { getPrismaClient, isPostgresTruthSourceConfigured } from "./prisma.client.js";

export interface StoryIntakePostgresShadowMirrorInput {
  account?: AccountRecord | null;
  intake_session?: StoryIntakeSessionRecord | null;
  proposals?: StoryProposalRecord[];
  workspace?: StoryWorkspaceRecord | null;
}

export interface StoryIntakePostgresShadowMirror {
  persistAggregate(input: StoryIntakePostgresShadowMirrorInput): Promise<void>;
}

let shadowMirrorOverride: StoryIntakePostgresShadowMirror | null = null;

function toDate(value: string) {
  return new Date(value);
}

function toInputJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function toNullableInputJson(value: Record<string, unknown> | null | undefined) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

const defaultStoryIntakePostgresShadowMirror: StoryIntakePostgresShadowMirror = {
  async persistAggregate(input) {
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      if (input.account) {
        await tx.account.upsert({
          where: {
            accountToken: input.account.account_token,
          },
          create: {
            id: input.account.account_id,
            accountToken: input.account.account_token,
            accountStatus: input.account.account_status,
            primaryChannel: input.account.primary_channel,
            acceptedPolicyVersion: input.account.accepted_policy_version ?? null,
            createdAt: toDate(input.account.created_at),
            updatedAt: toDate(input.account.updated_at),
          },
          update: {
            accountStatus: input.account.account_status,
            primaryChannel: input.account.primary_channel,
            acceptedPolicyVersion: input.account.accepted_policy_version ?? null,
            updatedAt: toDate(input.account.updated_at),
          },
        });
      }

      if (input.intake_session) {
        await tx.storyIntakeSession.upsert({
          where: {
            id: input.intake_session.id,
          },
          create: {
            id: input.intake_session.id,
            accountId: input.intake_session.account_id,
            entrySurface: input.intake_session.entry_surface,
            intakeMode: input.intake_session.intake_mode,
            briefPayload: toInputJson(input.intake_session.brief_payload),
            status: input.intake_session.status,
            selectedProposalId: input.intake_session.selected_proposal_id,
            clientRequestId: input.intake_session.client_request_id,
            createdAt: toDate(input.intake_session.created_at),
            updatedAt: toDate(input.intake_session.updated_at),
          },
          update: {
            entrySurface: input.intake_session.entry_surface,
            intakeMode: input.intake_session.intake_mode,
            briefPayload: toInputJson(input.intake_session.brief_payload),
            status: input.intake_session.status,
            selectedProposalId: input.intake_session.selected_proposal_id,
            clientRequestId: input.intake_session.client_request_id,
            updatedAt: toDate(input.intake_session.updated_at),
          },
        });
      }

      if (input.proposals && input.proposals.length > 0) {
        const [firstProposal] = input.proposals;

        if (!firstProposal) {
          return;
        }

        await tx.storyProposal.deleteMany({
          where: {
            sessionId: firstProposal.session_id,
          },
        });

        await tx.storyProposal.createMany({
          data: input.proposals.map((proposal) => ({
            id: proposal.id,
            sessionId: proposal.session_id,
            proposalNo: proposal.proposal_no,
            title: proposal.title,
            summary: proposal.summary,
            payload: toInputJson(proposal.payload),
            status: proposal.status,
            createdAt: toDate(proposal.created_at),
            updatedAt: toDate(proposal.updated_at),
          })),
        });
      }

      if (input.workspace) {
        await tx.storyWorkspace.upsert({
          where: {
            id: input.workspace.id,
          },
          create: {
            id: input.workspace.id,
            accountId: input.workspace.account_id,
            title: input.workspace.title,
            keywords: input.workspace.keywords,
            workspaceStatus: input.workspace.workspace_status,
            entrySurface: input.workspace.entry_surface ?? null,
            intakeMode: input.workspace.intake_mode ?? null,
            privacyScope: input.workspace.privacy_scope ?? null,
            commissionBrief: toNullableInputJson(input.workspace.commission_brief),
            currentChapterId: input.workspace.current_chapter_id ?? null,
            createdAt: toDate(input.workspace.created_at),
            updatedAt: toDate(input.workspace.updated_at),
            updatedBy: input.workspace.updated_by,
          },
          update: {
            title: input.workspace.title,
            keywords: input.workspace.keywords,
            workspaceStatus: input.workspace.workspace_status,
            entrySurface: input.workspace.entry_surface ?? null,
            intakeMode: input.workspace.intake_mode ?? null,
            privacyScope: input.workspace.privacy_scope ?? null,
            commissionBrief: toNullableInputJson(input.workspace.commission_brief),
            currentChapterId: input.workspace.current_chapter_id ?? null,
            updatedAt: toDate(input.workspace.updated_at),
            updatedBy: input.workspace.updated_by,
          },
        });
      }
    });
  },
};

function resolveAccountId(input: StoryIntakePostgresShadowMirrorInput) {
  return input.account?.account_id ?? input.intake_session?.account_id ?? input.workspace?.account_id ?? "system";
}

export function __setStoryIntakePostgresShadowMirrorForTests(
  override: StoryIntakePostgresShadowMirror | null,
) {
  shadowMirrorOverride = override;
}

export function scheduleStoryIntakePostgresShadowMirror(input: StoryIntakePostgresShadowMirrorInput) {
  if (!shadowMirrorOverride && !isPostgresTruthSourceConfigured()) {
    return;
  }

  const mirror = shadowMirrorOverride ?? defaultStoryIntakePostgresShadowMirror;

  void mirror.persistAggregate(input).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";

    createObservabilityRepository().appendDomainEvent({
      event_name: "truth_source_shadow_mirror_failed",
      account_id: resolveAccountId(input),
      mirror_to_audit: true,
      payload: {
        aggregate_key: "story_intake",
        target_driver: "postgres_prisma",
        error_name: name,
        error_message: message,
      },
    });
  });
}
