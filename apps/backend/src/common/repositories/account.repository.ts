import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type AccountRecord = AppState["accounts"][number];
export type SessionRecord = AppState["sessions"][number];

export interface UpsertShadowAccountInput {
  account_token: string;
  channel: string;
}

export interface EnsureSessionInput {
  account_id: string;
  device_id?: string;
  device_type?: string;
}

export interface AccountRepository {
  findAccountByToken(account_token: string): Promise<AccountRecord | null>;
  findAccountById(account_id: string): Promise<AccountRecord | null>;
  upsertShadowAccount(input: UpsertShadowAccountInput): Promise<AccountRecord>;
  saveAccount(account: AccountRecord): Promise<AccountRecord>;
  ensureSession(input: EnsureSessionInput): Promise<SessionRecord>;
  listActiveSessionsByAccount(account_id: string): Promise<SessionRecord[]>;
}

let accountRepositoryDriverOverride: AccountRepository | null = null;

export function __setAccountRepositoryDriverForTests(override: AccountRepository | null) {
  accountRepositoryDriverOverride = override;
}

export function createAccountRepository(): AccountRepository {
  if (accountRepositoryDriverOverride) {
    return accountRepositoryDriverOverride;
  }

  return {
    async findAccountByToken(account_token) {
      return (await readAppState()).accounts.find((item) => item.account_token === account_token) ?? null;
    },
    async findAccountById(account_id) {
      return (await readAppState()).accounts.find((item) => item.account_id === account_id) ?? null;
    },
    async upsertShadowAccount(input) {
      const state = await readAppState();
      const now = new Date().toISOString();
      const existing = state.accounts.find((item) => item.account_token === input.account_token);

      if (existing) {
        existing.updated_at = now;
        await writeAppState(state);
        return existing;
      }

      const created: AccountRecord = {
        account_id: randomUUID(),
        account_token: input.account_token,
        account_status: "guest",
        primary_channel: input.channel,
        created_at: now,
        updated_at: now,
      };

      state.accounts.push(created);
      await writeAppState(state);
      return created;
    },
    async saveAccount(account) {
      const state = await readAppState();
      const index = state.accounts.findIndex((item) => item.account_id === account.account_id);

      if (index >= 0) {
        state.accounts[index] = account;
      } else {
        state.accounts.push(account);
      }

      await writeAppState(state);
      return account;
    },
    async ensureSession(input) {
      const state = await readAppState();
      const now = new Date().toISOString();
      const existing = state.sessions.find((item) => {
        if (item.account_id !== input.account_id || item.revoked_at) {
          return false;
        }

        if (input.device_id !== undefined) {
          return item.device_id === input.device_id;
        }

        return true;
      });

      if (existing) {
        existing.last_seen_at = now;
        if (input.device_id !== undefined) {
          existing.device_id = input.device_id;
        } else {
          existing.device_id ??= existing.session_id;
        }
        if (input.device_type !== undefined) {
          existing.device_type = input.device_type;
        } else {
          existing.device_type ??= "h5";
        }
        await writeAppState(state);
        return existing;
      }

      const created: SessionRecord = {
        session_id: randomUUID(),
        account_id: input.account_id,
        device_id: input.device_id ?? randomUUID(),
        device_type: input.device_type ?? "h5",
        revoked_at: null,
        last_seen_at: now,
      };

      state.sessions.push(created);
      await writeAppState(state);
      return created;
    },
    async listActiveSessionsByAccount(account_id) {
      return (await readAppState()).sessions.filter((item) => item.account_id === account_id && !item.revoked_at);
    },
  };
}
