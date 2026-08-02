import { readAppState, writeAppState, type AppState } from "../store.js";
import { resolveActiveStoryChapter } from "../../modules/room-projection/active-story-chapter.js";
import { createStoryWorkspaceRepository } from "./story-workspace.repository.js";

export type PersonaSnapshotRecord = AppState["personaStateSnapshots"][number];
export type PersonaSourceState = Pick<
  AppState,
  "storyWorkspaces" | "notifications" | "chapters" | "chapterRevisions" | "personaStateSnapshots"
>;

export interface PersonaStateRepository {
  getSourceState(): Promise<PersonaSourceState>;
  createSnapshot(input: PersonaSnapshotRecord): Promise<PersonaSnapshotRecord>;
  listSnapshotsByAccount(account_id: string, story_workspace_id?: string | null): Promise<PersonaSnapshotRecord[]>;
  getChapterRoute(story_workspace_id: string): Promise<string | null>;
}

export function createPersonaStateRepository(): PersonaStateRepository {
  return {
    async getSourceState() {
      const state = await readAppState();
      return {
        storyWorkspaces: state.storyWorkspaces,
        notifications: state.notifications,
        chapters: state.chapters,
        chapterRevisions: state.chapterRevisions,
        personaStateSnapshots: state.personaStateSnapshots,
      };
    },
    async createSnapshot(input) {
      const state = await readAppState();
      state.personaStateSnapshots.push(input);
      await writeAppState(state);
      return input;
    },
    async listSnapshotsByAccount(account_id, story_workspace_id) {
      return (await readAppState())
        .personaStateSnapshots.filter((item) => item.account_id === account_id)
        .filter((item) => (story_workspace_id !== undefined ? item.story_workspace_id === story_workspace_id : true))
        .sort((left, right) => right.generated_at.localeCompare(left.generated_at));
    },
    async getChapterRoute(story_workspace_id) {
      const state = await readAppState();
      const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_workspace_id);

      if (!workspace) {
        return null;
      }

      return (
        resolveActiveStoryChapter({
          story_id: story_workspace_id,
          current_chapter_id: workspace.current_chapter_id ?? null,
          chapters: state.chapters,
        })?.route ?? null
      );
    },
  };
}
