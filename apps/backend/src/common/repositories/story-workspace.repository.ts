import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";
import { scheduleStoryIntakePostgresShadowMirror } from "../truth-source/story-intake-postgres-shadow-mirror.js";

export type StoryWorkspaceRecord = AppState["storyWorkspaces"][number];
export type StoryIntakeSessionRecord = AppState["storyIntakeSessions"][number];
export type StoryProposalRecord = AppState["storyProposals"][number];

export interface CreateStoryIntakeSessionInput {
  account_id: string;
  entry_surface: StoryIntakeSessionRecord["entry_surface"];
  intake_mode: StoryIntakeSessionRecord["intake_mode"];
  brief_payload: StoryIntakeSessionRecord["brief_payload"];
  client_request_id: string;
}

export interface SaveGeneratedStoryProposalsInput {
  session_id: string;
  proposals: Array<{
    proposal_no: number;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
    status?: StoryProposalRecord["status"];
  }>;
}

export interface ConvertProposalToWorkspaceInput {
  proposal_id: string;
  workspace: Omit<StoryWorkspaceRecord, "id" | "created_at" | "updated_at" | "workspace_status"> & {
    workspace_status?: StoryWorkspaceRecord["workspace_status"];
  };
}

export interface UpsertStoryWorkspaceInput {
  account_id: string;
  title: string;
  keywords?: string[];
  workspace_status?: StoryWorkspaceRecord["workspace_status"];
  entry_surface?: StoryWorkspaceRecord["entry_surface"];
  intake_mode?: StoryWorkspaceRecord["intake_mode"];
  privacy_scope?: StoryWorkspaceRecord["privacy_scope"];
  commission_brief?: StoryWorkspaceRecord["commission_brief"];
  current_chapter_id?: string | null;
  updated_by?: string;
}

export interface StoryWorkspaceRepository {
  createIntakeSession(input: CreateStoryIntakeSessionInput): Promise<StoryIntakeSessionRecord>;
  findIntakeSessionById(session_id: string): Promise<StoryIntakeSessionRecord | null>;
  findProposalById(proposal_id: string): Promise<StoryProposalRecord | null>;
  listProposalsBySession(session_id: string): Promise<StoryProposalRecord[]>;
  saveGeneratedProposals(input: SaveGeneratedStoryProposalsInput): Promise<StoryProposalRecord[]>;
  convertProposalToWorkspace(input: ConvertProposalToWorkspaceInput): Promise<{
    proposal: StoryProposalRecord;
    session: StoryIntakeSessionRecord;
    workspace: StoryWorkspaceRecord;
  }>;
  upsertWorkspace(input: UpsertStoryWorkspaceInput): Promise<StoryWorkspaceRecord>;
  saveWorkspace(workspace: StoryWorkspaceRecord): Promise<StoryWorkspaceRecord>;
  listWorkspacesByAccount(account_id: string): Promise<StoryWorkspaceRecord[]>;
  findWorkspaceById(story_workspace_id: string): Promise<StoryWorkspaceRecord | null>;
}

let storyWorkspaceRepositoryDriverOverride: StoryWorkspaceRepository | null = null;

export function __setStoryWorkspaceRepositoryDriverForTests(override: StoryWorkspaceRepository | null) {
  storyWorkspaceRepositoryDriverOverride = override;
}

export function createStoryWorkspaceRepository(): StoryWorkspaceRepository {
  if (storyWorkspaceRepositoryDriverOverride) {
    return storyWorkspaceRepositoryDriverOverride;
  }

  return {
    async createIntakeSession(input) {
      const state = await readAppState();
      const now = new Date().toISOString();
      const created: StoryIntakeSessionRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        entry_surface: input.entry_surface,
        intake_mode: input.intake_mode,
        brief_payload: input.brief_payload,
        status: "draft",
        selected_proposal_id: null,
        client_request_id: input.client_request_id,
        created_at: now,
        updated_at: now,
      };

      state.storyIntakeSessions.push(created);
      await writeAppState(state);
      return created;
    },
    async findIntakeSessionById(session_id) {
      return (await readAppState()).storyIntakeSessions.find((item) => item.id === session_id) ?? null;
    },
    async findProposalById(proposal_id) {
      return (await readAppState()).storyProposals.find((item) => item.id === proposal_id) ?? null;
    },
    async listProposalsBySession(session_id) {
      return (await readAppState()).storyProposals.filter((item) => item.session_id === session_id);
    },
    async saveGeneratedProposals(input) {
      const state = await readAppState();
      const session = state.storyIntakeSessions.find((item) => item.id === input.session_id);

      if (!session) {
        throw new Error(`Story intake session not found for id ${input.session_id}`);
      }

      const now = new Date().toISOString();
      const proposals = input.proposals.map<StoryProposalRecord>((proposal) => ({
        id: randomUUID(),
        session_id: session.id,
        proposal_no: proposal.proposal_no,
        title: proposal.title,
        summary: proposal.summary,
        payload: proposal.payload,
        status: proposal.status ?? "generated",
        created_at: now,
        updated_at: now,
      }));

      state.storyProposals.push(...proposals);
      session.status = "proposals_ready";
      session.updated_at = now;
      await writeAppState(state);
      return proposals;
    },
    async convertProposalToWorkspace(input) {
      const state = await readAppState();
      const proposal = state.storyProposals.find((item) => item.id === input.proposal_id);

      if (!proposal) {
        throw new Error(`Story proposal not found for id ${input.proposal_id}`);
      }

      const session = state.storyIntakeSessions.find((item) => item.id === proposal.session_id);

      if (!session) {
        throw new Error(`Story intake session not found for proposal ${input.proposal_id}`);
      }

      const now = new Date().toISOString();

      proposal.status = "selected";
      proposal.updated_at = now;

      state.storyProposals.forEach((item) => {
        if (item.session_id === proposal.session_id && item.id !== proposal.id) {
          item.status = "discarded";
          item.updated_at = now;
        }
      });

      session.selected_proposal_id = proposal.id;
      session.status = "converted";
      session.updated_at = now;

      const workspace: StoryWorkspaceRecord = {
        id: randomUUID(),
        account_id: input.workspace.account_id,
        title: input.workspace.title,
        keywords: input.workspace.keywords,
        workspace_status: input.workspace.workspace_status ?? "active",
        ...(input.workspace.entry_surface !== undefined ? { entry_surface: input.workspace.entry_surface } : {}),
        ...(input.workspace.intake_mode !== undefined ? { intake_mode: input.workspace.intake_mode } : {}),
        ...(input.workspace.privacy_scope !== undefined ? { privacy_scope: input.workspace.privacy_scope } : {}),
        ...(input.workspace.commission_brief !== undefined
          ? { commission_brief: input.workspace.commission_brief }
          : {}),
        ...(input.workspace.current_chapter_id !== undefined
          ? { current_chapter_id: input.workspace.current_chapter_id }
          : {}),
        created_at: now,
        updated_at: now,
        updated_by: input.workspace.updated_by,
      };

      state.storyWorkspaces.push(workspace);
      await writeAppState(state);

      return {
        proposal,
        session,
        workspace,
      };
    },
    async upsertWorkspace(input) {
      const state = await readAppState();
      const now = new Date().toISOString();
      const existing = state.storyWorkspaces.find(
        (item) => item.account_id === input.account_id && item.title === input.title,
      );

      if (existing) {
        if (input.keywords !== undefined) {
          existing.keywords = input.keywords;
        }
        if (input.workspace_status !== undefined) {
          existing.workspace_status = input.workspace_status;
        }
        if (input.entry_surface !== undefined) {
          existing.entry_surface = input.entry_surface;
        }
        if (input.intake_mode !== undefined) {
          existing.intake_mode = input.intake_mode;
        }
        if (input.privacy_scope !== undefined) {
          existing.privacy_scope = input.privacy_scope;
        }
        if (input.commission_brief !== undefined) {
          existing.commission_brief = input.commission_brief;
        }
        if (input.current_chapter_id !== undefined) {
          existing.current_chapter_id = input.current_chapter_id;
        }
        existing.updated_at = now;
        existing.updated_by = input.updated_by ?? existing.updated_by;
        await writeAppState(state);
        scheduleStoryIntakePostgresShadowMirror({
          workspace: existing,
        });
        return existing;
      }

      const created: StoryWorkspaceRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        title: input.title,
        keywords: input.keywords ?? [],
        workspace_status: input.workspace_status ?? "draft",
        ...(input.entry_surface !== undefined ? { entry_surface: input.entry_surface } : {}),
        ...(input.intake_mode !== undefined ? { intake_mode: input.intake_mode } : {}),
        ...(input.privacy_scope !== undefined ? { privacy_scope: input.privacy_scope } : {}),
        ...(input.commission_brief !== undefined ? { commission_brief: input.commission_brief } : {}),
        ...(input.current_chapter_id !== undefined ? { current_chapter_id: input.current_chapter_id } : {}),
        created_at: now,
        updated_at: now,
        updated_by: input.updated_by ?? "system",
      };

      state.storyWorkspaces.push(created);
      await writeAppState(state);
      scheduleStoryIntakePostgresShadowMirror({
        workspace: created,
      });
      return created;
    },
    async saveWorkspace(workspace) {
      const state = await readAppState();
      const index = state.storyWorkspaces.findIndex((item) => item.id === workspace.id);

      if (index >= 0) {
        state.storyWorkspaces[index] = workspace;
      } else {
        state.storyWorkspaces.push(workspace);
      }

      await writeAppState(state);
      scheduleStoryIntakePostgresShadowMirror({
        workspace,
      });
      return workspace;
    },
    async listWorkspacesByAccount(account_id) {
      return (await readAppState()).storyWorkspaces.filter((item) => item.account_id === account_id);
    },
    async findWorkspaceById(story_workspace_id) {
      return (await readAppState()).storyWorkspaces.find((item) => item.id === story_workspace_id) ?? null;
    },
  };
}
