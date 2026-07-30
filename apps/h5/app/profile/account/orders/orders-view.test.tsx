import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersView } from "./orders-view";
import { fetchMembershipOrders, requestMembershipRefund } from "../../../lib/account-membership-api";
import { issueSessionToken } from "../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("account_token=wx-openid-orders-ui"),
}));

vi.mock("../../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-orders-ui-token",
    expires_at: "2026-04-18T00:30:00.000Z",
    target_route: "/profile/account/orders",
  }),
}));

vi.mock("../../../lib/account-membership-api", () => ({
  fetchMembershipOrders: vi.fn().mockResolvedValue({
    orders: [
      {
        order_id: "order-ui-001",
        target_plan_id: "plan_plus",
        billing_cycle: "monthly",
        status: "paid",
        payable_amount: 2900,
        created_at: "2026-04-07T00:00:00.000Z",
        invoice_download_url: "http://127.0.0.1:4000/membership/orders/order-ui-001/invoice?account_token=wx-openid-orders-ui",
        refund_status: "not_requested",
        refund_case_id: null,
      },
    ],
  }),
  requestMembershipRefund: vi.fn().mockResolvedValue({
    case_id: "ops-case-order-ui-001",
    order_id: "order-ui-001",
    refund_status: "pending_review",
  }),
}));

describe("orders view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders order history with invoice download and refund request actions", async () => {
    render(<OrdersView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-orders-ui",
        target_route: "/profile/account/orders",
      });
      expect(fetchMembershipOrders).toHaveBeenCalledWith("wx-openid-orders-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("orders-page").textContent).toContain("订单与发票");
      expect(screen.getByTestId("orders-page").textContent).toContain("order-ui-001");
      expect(screen.getByRole("link", { name: "下载发票" }).getAttribute("href")).toContain("/membership/orders/order-ui-001/invoice");
    });

    fireEvent.click(screen.getByRole("button", { name: "申请退款" }));

    await waitFor(() => {
      expect(requestMembershipRefund).toHaveBeenCalledWith({
        account_token: "wx-openid-orders-ui",
        order_id: "order-ui-001",
        reason: "希望停止当前会员并保留退款处理记录。",
      });
      expect(screen.getByTestId("refund-state-order-ui-001").textContent).toContain("审核中");
    });
  });
});
