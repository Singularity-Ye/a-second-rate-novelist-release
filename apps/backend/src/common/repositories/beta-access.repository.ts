import { readAppState, writeAppState, type AppState } from "../store.js";

export type BetaProgramRecord = AppState["betaPrograms"][number];
export type BetaInviteRecord = AppState["betaInvites"][number];
export type BetaAccessGrantRecord = AppState["betaAccessGrants"][number];

export interface BetaAccessRepository {
  listPrograms(): Promise<BetaProgramRecord[]>;
  saveProgram(program: BetaProgramRecord): Promise<BetaProgramRecord>;
  listInvites(): Promise<BetaInviteRecord[]>;
  findInviteByCode(invite_code: string): Promise<BetaInviteRecord | null>;
  saveInvite(invite: BetaInviteRecord): Promise<BetaInviteRecord>;
  listInvitesByInviter(account_id: string): Promise<BetaInviteRecord[]>;
  listGrants(): Promise<BetaAccessGrantRecord[]>;
  findGrantByAccountId(account_id: string): Promise<BetaAccessGrantRecord | null>;
  saveGrant(grant: BetaAccessGrantRecord): Promise<BetaAccessGrantRecord>;
}

export function createBetaAccessRepository(): BetaAccessRepository {
  return {
    async listPrograms() {
      return (await readAppState()).betaPrograms;
    },
    async saveProgram(program) {
      const state = await readAppState();
      const index = state.betaPrograms.findIndex((item) => item.program_key === program.program_key);

      if (index >= 0) {
        state.betaPrograms[index] = program;
      } else {
        state.betaPrograms.push(program);
      }

      await writeAppState(state);
      return program;
    },
    async listInvites() {
      return (await readAppState()).betaInvites;
    },
    async findInviteByCode(invite_code) {
      return (await readAppState()).betaInvites.find((item) => item.invite_code === invite_code) ?? null;
    },
    async saveInvite(invite) {
      const state = await readAppState();
      const index = state.betaInvites.findIndex((item) => item.invite_code === invite.invite_code);

      if (index >= 0) {
        state.betaInvites[index] = invite;
      } else {
        state.betaInvites.push(invite);
      }

      await writeAppState(state);
      return invite;
    },
    async listInvitesByInviter(account_id) {
      return (await readAppState()).betaInvites
        .filter((item) => item.inviter_account_id === account_id)
        .sort((left, right) => right.issued_at.localeCompare(left.issued_at));
    },
    async listGrants() {
      return (await readAppState()).betaAccessGrants;
    },
    async findGrantByAccountId(account_id) {
      return (await readAppState()).betaAccessGrants.find((item) => item.account_id === account_id) ?? null;
    },
    async saveGrant(grant) {
      const state = await readAppState();
      const index = state.betaAccessGrants.findIndex((item) => item.account_id === grant.account_id);

      if (index >= 0) {
        state.betaAccessGrants[index] = grant;
      } else {
        state.betaAccessGrants.push(grant);
      }

      await writeAppState(state);
      return grant;
    },
  };
}
