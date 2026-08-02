import { Body, Controller, Get, Param, Post, Put, Query, Res } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  createMembershipOrder,
  createPrivacyDataRequest,
  fetchAccountOverview,
  getMembershipInvoiceDownload,
  getNotifications,
  getSyncStatus,
  guestUpgradeAccount,
  listMembershipOrders,
  listPrivacyDataRequests,
  requestMembershipRefund,
  resolveSyncConflict,
  updateNotificationPreferences,
  verifyChannelBinding,
} from "./identity-membership.service.js";

@Controller()
export class IdentityMembershipController {
  @Get("/account/overview")
  async overview(@Query("account_token") accountToken: string) {
    return successEnvelope(await fetchAccountOverview(accountToken));
  }

  @Post("/account/guest-upgrade")
  async guestUpgrade(
    @Body() body: {
      account_token: string;
      upgrade_method: string;
      verification_payload: Record<string, unknown>;
      accepted_policy_version: string;
      client_request_id: string;
    },
  ) {
    return successEnvelope(await guestUpgradeAccount(body));
  }

  @Post("/account/channel-bindings")
  async bind(
    @Body() body: {
      account_token: string;
      channel: string;
      provider_user_id: string;
      set_as_primary: boolean;
    },
  ) {
    return successEnvelope(await verifyChannelBinding(body));
  }

  @Get("/account/sync-status")
  async syncStatus(@Query("account_token") accountToken: string) {
    return successEnvelope(
      await getSyncStatus({
        account_token: accountToken,
      }),
    );
  }

  @Post("/account/sync-conflicts/:conflictId/resolve")
  async resolveConflict(
    @Param("conflictId") conflictId: string,
    @Body() body: {
      account_token: string;
      resolution: "keep_server" | "keep_client" | "create_branch" | "merge_fields";
      selected_version_ids: string[];
      merge_patch: Record<string, unknown> | null;
    },
  ) {
    return successEnvelope(
      await resolveSyncConflict({
        account_token: body.account_token,
        conflict_id: conflictId,
        resolution: body.resolution,
        selected_version_ids: body.selected_version_ids,
        merge_patch: body.merge_patch,
      }),
    );
  }

  @Put("/account/notification-preferences")
  async preferences(
    @Body() body: {
      account_token: string;
      in_app_enabled: boolean;
      push_enabled: boolean;
      im_enabled: boolean;
      quiet_hours: {
        enabled: boolean;
        start_local: string;
        end_local: string;
        time_zone: string;
      };
      categories: {
        export: boolean;
        risk: boolean;
        membership: boolean;
        system: boolean;
      };
    },
  ) {
    return successEnvelope(await updateNotificationPreferences(body));
  }

  @Post("/membership/orders")
  async order(
    @Body() body: {
      account_token: string;
      target_plan_id: string;
      billing_cycle: string;
      payment_channel: string;
      trigger_reason?: string;
    },
  ) {
    return successEnvelope(await createMembershipOrder(body));
  }

  @Get("/membership/orders")
  async orders(@Query("account_token") accountToken: string) {
    return successEnvelope(await listMembershipOrders(accountToken));
  }

  @Post("/membership/orders/:orderId/refund")
  async refund(
    @Param("orderId") orderId: string,
    @Body() body: {
      account_token: string;
      reason: string;
    },
  ) {
    return successEnvelope(
      await requestMembershipRefund({
        account_token: body.account_token,
        order_id: orderId,
        reason: body.reason,
      }),
    );
  }

  @Get("/membership/orders/:orderId/invoice")
  async invoice(
    @Param("orderId") orderId: string,
    @Query("account_token") accountToken: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const invoice = await getMembershipInvoiceDownload({
      account_token: accountToken,
      order_id: orderId,
    });
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${invoice.file_name}"`);
    response.send(invoice.download_body);
  }

  @Post("/privacy/data-requests")
  async dataRequest(
    @Body() body: {
      account_token: string;
      request_type: "export" | "delete" | "revoke_consent";
      scope: "account" | "story" | "asset";
      story_id?: string;
      confirm_phrase: string;
    },
  ) {
    return successEnvelope(await createPrivacyDataRequest(body));
  }

  @Get("/privacy/data-requests")
  async dataRequestList(@Query("account_token") accountToken: string) {
    return successEnvelope(await listPrivacyDataRequests(accountToken));
  }

  @Get("/notifications")
  async notifications(
    @Query("account_token") accountToken: string,
    @Query("category") category?: "chapter_update" | "export" | "risk" | "membership" | "system",
    @Query("unread_only") unreadOnly?: string,
    @Query("story_id") storyId?: string,
  ) {
    return successEnvelope(
      await getNotifications({
        account_token: accountToken,
        category: category ?? null,
        unread_only: unreadOnly === "true",
        story_id: storyId ?? null,
      }),
    );
  }
}
