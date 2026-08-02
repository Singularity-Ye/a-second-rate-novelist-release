import { randomUUID } from "node:crypto";
import type { OnboardingStepKey } from "@erliu/shared-contracts";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type ReaderProfileRecord = AppState["profiles"][number];
export type OnboardingSessionRecord = AppState["onboardingSessions"][number];

export interface ReaderProfileState {
  profile: ReaderProfileRecord;
  session: OnboardingSessionRecord;
  created_profile: boolean;
  created_session: boolean;
}

export interface ReaderProfileRepository {
  ensureProfileState(account_id: string): Promise<ReaderProfileState>;
  saveProfileState(input: {
    profile: ReaderProfileRecord;
    session: OnboardingSessionRecord;
  }): Promise<ReaderProfileState>;
  findProfileByAccountId(account_id: string): Promise<ReaderProfileRecord | null>;
  findOnboardingSessionByAccountId(account_id: string): Promise<OnboardingSessionRecord | null>;
  findLatestActiveProfileByAccount(account_id: string): Promise<ReaderProfileRecord | null>;
}

function createDefaultOnboardingSession(account_id: string): OnboardingSessionRecord {
  return {
    session_id: randomUUID(),
    account_id,
    answers: {} as Partial<Record<OnboardingStepKey, string>>,
    status: "collecting",
    updated_at: new Date().toISOString(),
  };
}

function createDefaultReaderProfile(account_id: string): ReaderProfileRecord {
  return {
    id: randomUUID(),
    account_id,
    reading_archive: { favorite_books: [] },
    taste_archive: {
      relationship_preference: [],
      pace: "",
      emotion: "",
      ending: "",
    },
    boundaries: { red_lines: [] },
    collaboration_mode: "read_only",
    safety_mode: "default",
    profile_status: "draft",
    last_confirmed_at: null,
    version_no: 0,
  };
}

export function createReaderProfileRepository(): ReaderProfileRepository {
  return {
    async ensureProfileState(account_id) {
      const state = await readAppState();
      let created_profile = false;
      let created_session = false;

      const session =
        state.onboardingSessions.find((item) => item.account_id === account_id) ??
        (() => {
          created_session = true;
          const created = createDefaultOnboardingSession(account_id);
          state.onboardingSessions.push(created);
          return created;
        })();

      const profile =
        state.profiles.find((item) => item.account_id === account_id) ??
        (() => {
          created_profile = true;
          const created = createDefaultReaderProfile(account_id);
          state.profiles.push(created);
          return created;
        })();

      if (created_profile || created_session) {
        await writeAppState(state);
      }

      return {
        profile,
        session,
        created_profile,
        created_session,
      };
    },
    async saveProfileState(input) {
      const state = await readAppState();
      const sessionIndex = state.onboardingSessions.findIndex(
        (item) => item.session_id === input.session.session_id || item.account_id === input.session.account_id,
      );
      const profileIndex = state.profiles.findIndex(
        (item) => item.id === input.profile.id || item.account_id === input.profile.account_id,
      );

      if (sessionIndex >= 0) {
        state.onboardingSessions[sessionIndex] = input.session;
      } else {
        state.onboardingSessions.push(input.session);
      }

      if (profileIndex >= 0) {
        state.profiles[profileIndex] = input.profile;
      } else {
        state.profiles.push(input.profile);
      }

      await writeAppState(state);

      return {
        profile: input.profile,
        session: input.session,
        created_profile: profileIndex < 0,
        created_session: sessionIndex < 0,
      };
    },
    async findProfileByAccountId(account_id) {
      return (await readAppState()).profiles.find((item) => item.account_id === account_id) ?? null;
    },
    async findOnboardingSessionByAccountId(account_id) {
      return (await readAppState()).onboardingSessions.find((item) => item.account_id === account_id) ?? null;
    },
    async findLatestActiveProfileByAccount(account_id) {
      return (
        (await readAppState())
          .profiles.filter((item) => item.account_id === account_id && item.profile_status !== "archived")
          .sort((left, right) => right.version_no - left.version_no)[0] ?? null
      );
    },
  };
}
