import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type AccountIdentityRecord = AppState["accountIdentities"][number];
export type SyncConflictRecord = AppState["syncConflicts"][number];
export type NotificationPreferenceRecord = AppState["notificationPreferences"][number];
export type MembershipPlanRecord = AppState["membershipPlans"][number];
export type MembershipEntitlementRecord = AppState["membershipEntitlements"][number];
export type MembershipOrderRecord = AppState["membershipOrders"][number];
export type PrivacyDataRequestRecord = AppState["privacyDataRequests"][number];
export type NotificationRecord = AppState["notifications"][number];

const DEFAULT_MEMBERSHIP_PLANS: MembershipPlanRecord[] = [
  {
    plan_id: "plan_guest",
    tier: "guest",
    story_slots: 2,
    export_quota: 1,
    branch_quota: 2,
    asset_storage_mb: 128,
    price: 0,
    is_active: true,
  },
  {
    plan_id: "plan_plus",
    tier: "plus",
    story_slots: 6,
    export_quota: 8,
    branch_quota: 12,
    asset_storage_mb: 1024,
    price: 2900,
    is_active: true,
  },
];

function sortNewestFirst<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export interface AccountMembershipRepository {
  listMembershipPlans(): Promise<MembershipPlanRecord[]>;
  ensureDefaultMembershipPlans(): Promise<MembershipPlanRecord[]>;
  findMembershipPlanById(plan_id: string): Promise<MembershipPlanRecord | null>;
  findEntitlementByAccountId(account_id: string): Promise<MembershipEntitlementRecord | null>;
  ensureDefaultEntitlement(account_id: string): Promise<MembershipEntitlementRecord>;
  upsertEntitlement(input: {
    account_id: string;
    current_plan_id: string;
    story_slots: number;
    export_quota: number;
    branch_quota: number;
    asset_storage_mb: number;
  }): Promise<MembershipEntitlementRecord>;
  findBindingByChannelAndProvider(channel: string, provider_user_id: string): Promise<AccountIdentityRecord | null>;
  listBindingsByAccount(account_id: string): Promise<AccountIdentityRecord[]>;
  saveChannelBinding(binding: AccountIdentityRecord): Promise<AccountIdentityRecord>;
  findSyncConflictById(conflict_id: string): Promise<SyncConflictRecord | null>;
  listOpenSyncConflictsByAccount(account_id: string): Promise<SyncConflictRecord[]>;
  createSyncConflict(input: Omit<SyncConflictRecord, "id">): Promise<SyncConflictRecord>;
  saveSyncConflict(conflict: SyncConflictRecord): Promise<SyncConflictRecord>;
  findNotificationPreferenceByAccount(account_id: string): Promise<NotificationPreferenceRecord | null>;
  upsertNotificationPreference(input: Omit<NotificationPreferenceRecord, "version_no" | "updated_at"> & {
    version_no?: number;
    updated_at?: string;
  }): Promise<NotificationPreferenceRecord>;
  listNotificationsByAccount(account_id: string): Promise<NotificationRecord[]>;
  createNotification(input: Omit<NotificationRecord, "id">): Promise<NotificationRecord>;
  createMembershipOrder(input: Omit<MembershipOrderRecord, "id">): Promise<MembershipOrderRecord>;
  listOrdersByAccount(account_id: string): Promise<MembershipOrderRecord[]>;
  createPrivacyDataRequest(input: Omit<PrivacyDataRequestRecord, "id">): Promise<PrivacyDataRequestRecord>;
  listPrivacyDataRequestsByAccount(account_id: string): Promise<PrivacyDataRequestRecord[]>;
}

function buildDefaultEntitlement(account_id: string): MembershipEntitlementRecord {
  return {
    account_id,
    current_plan_id: "plan_guest",
    story_slots: 2,
    export_quota: 1,
    branch_quota: 2,
    asset_storage_mb: 128,
    updated_at: new Date().toISOString(),
  };
}

export function createAccountMembershipRepository(): AccountMembershipRepository {
  return {
    async listMembershipPlans() {
      const plans = (await readAppState()).membershipPlans;
      return plans.length > 0 ? plans : DEFAULT_MEMBERSHIP_PLANS;
    },
    async ensureDefaultMembershipPlans() {
      const state = await readAppState();

      if (state.membershipPlans.length === 0) {
        state.membershipPlans.push(...DEFAULT_MEMBERSHIP_PLANS);
        await writeAppState(state);
      }

      return state.membershipPlans;
    },
    async findMembershipPlanById(plan_id) {
      return (await this.listMembershipPlans()).find((item) => item.plan_id === plan_id) ?? null;
    },
    async findEntitlementByAccountId(account_id) {
      return (await readAppState()).membershipEntitlements.find((item) => item.account_id === account_id) ?? null;
    },
    async ensureDefaultEntitlement(account_id) {
      return (await this.findEntitlementByAccountId(account_id)) ?? this.upsertEntitlement(buildDefaultEntitlement(account_id));
    },
    async upsertEntitlement(input) {
      const state = await readAppState();
      const existing = state.membershipEntitlements.find((item) => item.account_id === input.account_id);
      const updated_at = new Date().toISOString();

      if (existing) {
        existing.current_plan_id = input.current_plan_id;
        existing.story_slots = input.story_slots;
        existing.export_quota = input.export_quota;
        existing.branch_quota = input.branch_quota;
        existing.asset_storage_mb = input.asset_storage_mb;
        existing.updated_at = updated_at;
        await writeAppState(state);
        return existing;
      }

      const created: MembershipEntitlementRecord = {
        ...input,
        updated_at,
      };

      state.membershipEntitlements.push(created);
      await writeAppState(state);
      return created;
    },
    async findBindingByChannelAndProvider(channel, provider_user_id) {
      return (
        (await readAppState()).accountIdentities.find(
          (item) => item.channel === channel && item.provider_user_id === provider_user_id,
        ) ?? null
      );
    },
    async listBindingsByAccount(account_id) {
      return (await readAppState()).accountIdentities.filter((item) => item.account_id === account_id);
    },
    async saveChannelBinding(binding) {
      const state = await readAppState();
      const index = state.accountIdentities.findIndex((item) => item.id === binding.id);

      if (index >= 0) {
        state.accountIdentities[index] = binding;
      } else {
        state.accountIdentities.push(binding);
      }

      await writeAppState(state);
      return binding;
    },
    async findSyncConflictById(conflict_id) {
      return (await readAppState()).syncConflicts.find((item) => item.id === conflict_id) ?? null;
    },
    async listOpenSyncConflictsByAccount(account_id) {
      return (await readAppState()).syncConflicts.filter((item) => item.account_id === account_id && item.status !== "resolved");
    },
    async createSyncConflict(input) {
      const state = await readAppState();
      const created: SyncConflictRecord = {
        id: randomUUID(),
        ...input,
      };

      state.syncConflicts.push(created);
      await writeAppState(state);
      return created;
    },
    async saveSyncConflict(conflict) {
      const state = await readAppState();
      const index = state.syncConflicts.findIndex((item) => item.id === conflict.id);

      if (index >= 0) {
        state.syncConflicts[index] = conflict;
      } else {
        state.syncConflicts.push(conflict);
      }

      await writeAppState(state);
      return conflict;
    },
    async findNotificationPreferenceByAccount(account_id) {
      return (await readAppState()).notificationPreferences.find((item) => item.account_id === account_id) ?? null;
    },
    async upsertNotificationPreference(input) {
      const state = await readAppState();
      const existing = state.notificationPreferences.find((item) => item.account_id === input.account_id);
      const updated_at = input.updated_at ?? new Date().toISOString();

      if (existing) {
        existing.in_app_enabled = input.in_app_enabled;
        existing.push_enabled = input.push_enabled;
        existing.im_enabled = input.im_enabled;
        existing.quiet_hours = input.quiet_hours;
        existing.categories = input.categories;
        existing.version_no = input.version_no ?? existing.version_no + 1;
        existing.updated_at = updated_at;
        await writeAppState(state);
        return existing;
      }

      const created: NotificationPreferenceRecord = {
        account_id: input.account_id,
        in_app_enabled: input.in_app_enabled,
        push_enabled: input.push_enabled,
        im_enabled: input.im_enabled,
        quiet_hours: input.quiet_hours,
        categories: input.categories,
        version_no: input.version_no ?? 1,
        updated_at,
      };

      state.notificationPreferences.push(created);
      await writeAppState(state);
      return created;
    },
    async listNotificationsByAccount(account_id) {
      return sortNewestFirst((await readAppState()).notifications.filter((item) => item.account_id === account_id));
    },
    async createNotification(input) {
      const state = await readAppState();
      const created: NotificationRecord = {
        id: randomUUID(),
        ...input,
      };

      state.notifications.push(created);
      await writeAppState(state);
      return created;
    },
    async createMembershipOrder(input) {
      const state = await readAppState();
      const created: MembershipOrderRecord = {
        id: `order-${randomUUID()}`,
        ...input,
      };

      state.membershipOrders.push(created);
      await writeAppState(state);
      return created;
    },
    async listOrdersByAccount(account_id) {
      return sortNewestFirst((await readAppState()).membershipOrders.filter((item) => item.account_id === account_id));
    },
    async createPrivacyDataRequest(input) {
      const state = await readAppState();
      const created: PrivacyDataRequestRecord = {
        id: randomUUID(),
        ...input,
      };

      state.privacyDataRequests.push(created);
      await writeAppState(state);
      return created;
    },
    async listPrivacyDataRequestsByAccount(account_id) {
      return sortNewestFirst((await readAppState()).privacyDataRequests.filter((item) => item.account_id === account_id));
    },
  };
}
