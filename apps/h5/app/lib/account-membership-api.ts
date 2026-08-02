import type {
  AccountOverviewResponse,
  ChannelBindingResponse,
  GuestUpgradeResponse,
  MembershipOrderListResponse,
  MembershipOrderResponse,
  MembershipRefundResponse,
  NotificationListResponse,
  NotificationPreferenceResponse,
  PrivacyDataRequestResponse,
  SyncConflictResolveResponse,
  SyncStatusResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchAccountOverview(account_token: string): Promise<AccountOverviewResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/overview?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch account overview");
  }

  const payload = (await response.json()) as { data: AccountOverviewResponse };
  return payload.data;
}

export async function guestUpgradeAccount(account_token: string): Promise<GuestUpgradeResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/guest-upgrade`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token,
      upgrade_method: "wechat_bind",
      verification_payload: {
        provider_user_id: `wechat-${account_token}`,
      },
      accepted_policy_version: "policy-v1",
      client_request_id: `guest-upgrade-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to upgrade guest account");
  }

  const payload = (await response.json()) as { data: GuestUpgradeResponse };
  return payload.data;
}

export async function fetchSyncStatus(account_token: string): Promise<SyncStatusResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/sync-status?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch sync status");
  }

  const payload = (await response.json()) as { data: SyncStatusResponse };
  return payload.data;
}

export async function createChannelBinding(input: {
  account_token: string;
  channel: string;
  provider_user_id: string;
  set_as_primary?: boolean;
}): Promise<ChannelBindingResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/channel-bindings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      channel: input.channel,
      provider_user_id: input.provider_user_id,
      set_as_primary: input.set_as_primary ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to bind channel");
  }

  const payload = (await response.json()) as { data: ChannelBindingResponse };
  return payload.data;
}

export async function resolveSyncConflict(input: {
  account_token: string;
  conflict_id: string;
  resolution: "keep_server" | "keep_client" | "create_branch" | "merge_fields";
}): Promise<SyncConflictResolveResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/sync-conflicts/${input.conflict_id}/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      resolution: input.resolution,
      selected_version_ids: [],
      merge_patch: null,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to resolve sync conflict");
  }

  const payload = (await response.json()) as { data: SyncConflictResolveResponse };
  return payload.data;
}

export async function fetchNotifications(input: {
  account_token: string;
  category: "chapter_update" | "export" | "risk" | "membership" | "system" | null;
  unread_only: boolean;
  story_id?: string | null;
}): Promise<NotificationListResponse> {
  const params = new URLSearchParams();
  params.set("account_token", input.account_token);
  if (input.category) {
    params.set("category", input.category);
  }
  if (input.unread_only) {
    params.set("unread_only", "true");
  }
  if (input.story_id) {
    params.set("story_id", input.story_id);
  }

  const response = await fetch(`${apiBaseUrl()}/notifications?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch notifications");
  }

  const payload = (await response.json()) as { data: NotificationListResponse };
  return payload.data;
}

export async function updateNotificationPreferences(input: {
  account_token: string;
  in_app_enabled: boolean;
  push_enabled: boolean;
  im_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
  time_zone: string;
  export_enabled: boolean;
  risk_enabled: boolean;
  membership_enabled: boolean;
  system_enabled: boolean;
}): Promise<NotificationPreferenceResponse> {
  const response = await fetch(`${apiBaseUrl()}/account/notification-preferences`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      in_app_enabled: input.in_app_enabled,
      push_enabled: input.push_enabled,
      im_enabled: input.im_enabled,
      quiet_hours: {
        enabled: input.quiet_hours_enabled,
        start_local: input.quiet_hours_start_local,
        end_local: input.quiet_hours_end_local,
        time_zone: input.time_zone,
      },
      categories: {
        export: input.export_enabled,
        risk: input.risk_enabled,
        membership: input.membership_enabled,
        system: input.system_enabled,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to update notification preferences");
  }

  const payload = (await response.json()) as { data: NotificationPreferenceResponse };
  return payload.data;
}

export async function createMembershipOrder(account_token: string): Promise<MembershipOrderResponse> {
  const response = await fetch(`${apiBaseUrl()}/membership/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token,
      target_plan_id: "plan_plus",
      billing_cycle: "monthly",
      payment_channel: "mock_pay",
      trigger_reason: "uat_readiness",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create membership order");
  }

  const payload = (await response.json()) as { data: MembershipOrderResponse };
  return payload.data;
}

export async function fetchMembershipOrders(account_token: string): Promise<MembershipOrderListResponse> {
  const response = await fetch(`${apiBaseUrl()}/membership/orders?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch membership orders");
  }

  const payload = (await response.json()) as { data: MembershipOrderListResponse };
  return payload.data;
}

export async function requestMembershipRefund(input: {
  account_token: string;
  order_id: string;
  reason: string;
}): Promise<MembershipRefundResponse> {
  const response = await fetch(`${apiBaseUrl()}/membership/orders/${encodeURIComponent(input.order_id)}/refund`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      reason: input.reason,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to request membership refund");
  }

  const payload = (await response.json()) as { data: MembershipRefundResponse };
  return payload.data;
}

export async function createPrivacyDataRequest(input: {
  account_token: string;
  request_type: "export" | "delete" | "revoke_consent";
  scope: "account" | "story" | "asset";
  story_id?: string;
}): Promise<PrivacyDataRequestResponse> {
  const confirmPhrase = input.request_type === "delete" ? "DELETE MY ACCOUNT" : "CONFIRM";
  const response = await fetch(`${apiBaseUrl()}/privacy/data-requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      request_type: input.request_type,
      scope: input.scope,
      story_id: input.story_id,
      confirm_phrase: confirmPhrase,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create privacy data request");
  }

  const payload = (await response.json()) as { data: PrivacyDataRequestResponse };
  return payload.data;
}

export async function fetchPrivacyDataRequests(account_token: string) {
  const response = await fetch(
    `${apiBaseUrl()}/privacy/data-requests?account_token=${encodeURIComponent(account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch privacy data requests");
  }

  const payload = (await response.json()) as {
    data: {
      items: Array<{
        id: string;
        request_type: string;
        status: string;
        scope: string;
        story_id: string | null;
        cooling_off_until: string | null;
      }>;
    };
  };
  return payload.data;
}
