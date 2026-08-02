import { randomUUID } from "node:crypto";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";

export interface StoryWorkspaceView {
  story_workspace_id: string;
  account_id: string;
  title: string;
  keywords: string[];
  workspace_status: "draft" | "active" | "paused" | "archived";
  updated_at: string;
}

export async function upsertStoryWorkspace(input: {
  account_id: string;
  title: string;
  keywords?: string[];
  workspace_status?: "draft" | "active" | "paused" | "archived";
  updated_by?: string;
}) {
  const repository = createStoryWorkspaceRepository();
  return toStoryWorkspaceView(
    await repository.upsertWorkspace({
      account_id: input.account_id,
      title: input.title,
      ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
      ...(input.workspace_status !== undefined ? { workspace_status: input.workspace_status } : {}),
      ...(input.updated_by !== undefined ? { updated_by: input.updated_by } : {}),
    }),
  );
}

export async function listStoryWorkspacesByAccount(account_id: string) {
  const repository = createStoryWorkspaceRepository();
  return (await repository.listWorkspacesByAccount(account_id)).map(toStoryWorkspaceView);
}

export async function getStoryWorkspaceById(story_workspace_id: string) {
  const repository = createStoryWorkspaceRepository();
  const story = await repository.findWorkspaceById(story_workspace_id);
  return story ? toStoryWorkspaceView(story) : null;
}

function toStoryWorkspaceView(story: {
  id: string;
  account_id: string;
  title: string;
  keywords: string[];
  workspace_status: "draft" | "active" | "paused" | "archived";
  updated_at: string;
}) {
  return {
    story_workspace_id: story.id,
    account_id: story.account_id,
    title: story.title,
    keywords: story.keywords,
    workspace_status: story.workspace_status,
    updated_at: story.updated_at,
  };
}
