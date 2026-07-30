import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  VnextConsentListResponse,
  VnextContinuousUseResponse,
  VnextSafetyCaseListResponse,
} from "@erliu/shared-contracts/vnext-experience";
import {
  ExperienceApiError,
  acknowledgeContinuousUse,
  appealSafetyCase,
  evaluateContinuousUse,
  exitExperience,
  listConsents,
  listSafetyCases,
  withdrawConsent,
} from "../lib/experience-api";
import { SafetyControls } from "./safety-controls";

vi.mock("../lib/experience-api", () => ({
  ExperienceApiError: class ExperienceApiError extends Error {
    constructor(
      readonly code: string,
      readonly recovery: string,
      readonly status: number,
    ) {
      super(`vNext request failed: ${code}`);
    }
  },
  acknowledgeContinuousUse: vi.fn(),
  appealSafetyCase: vi.fn(),
  evaluateContinuousUse: vi.fn(),
  exitExperience: vi.fn(),
  listConsents: vi.fn(),
  listSafetyCases: vi.fn(),
  withdrawConsent: vi.fn(),
}));

const CONSENTS: VnextConsentListResponse = [
  {
    id: "consent-core-1",
    purpose: "core_creative",
    kind: "required",
    status: "active",
    version: 3,
    grantedAt: "2026-07-18T09:00:00.000Z",
    withdrawnAt: null,
  },
  {
    id: "consent-experience-1",
    purpose: "external_experience",
    kind: "required",
    status: "active",
    version: 5,
    grantedAt: "2026-07-18T09:00:00.000Z",
    withdrawnAt: null,
  },
  {
    id: "consent-training-1",
    purpose: "model_training",
    kind: "optional",
    status: "active",
    version: 7,
    grantedAt: "2026-07-18T09:00:00.000Z",
    withdrawnAt: null,
  },
];

const WITHDRAWN_CONSENTS: VnextConsentListResponse = CONSENTS.map((consent) =>
  consent.id === "consent-training-1"
    ? {
        ...consent,
        status: "withdrawn",
        version: 8,
        withdrawnAt: "2026-07-18T10:02:00.000Z",
      }
    : consent,
);

const SAFETY_CASES: VnextSafetyCaseListResponse = [
  {
    safetyCaseId: "safety-case-open-1",
    status: "open",
    disposition: "block",
    severity: "high",
    version: 11,
    openedAt: "2026-07-18T09:30:00.000Z",
    appealedAt: null,
    closedAt: null,
  },
  {
    safetyCaseId: "safety-case-appealed-1",
    status: "appealed",
    disposition: "restrict",
    severity: "low",
    version: 4,
    openedAt: "2026-07-17T09:30:00.000Z",
    appealedAt: "2026-07-17T10:00:00.000Z",
    closedAt: null,
  },
];

const APPEALED_SAFETY_CASES: VnextSafetyCaseListResponse = SAFETY_CASES.map(
  (safetyCase) =>
    safetyCase.safetyCaseId === "safety-case-open-1"
      ? {
          ...safetyCase,
          status: "appealed",
          version: 12,
          appealedAt: "2026-07-18T10:02:00.000Z",
        }
      : safetyCase,
);

const PENDING_REMINDER: VnextContinuousUseResponse = {
  status: "pending",
  receiptId: "continuous-use-receipt-1",
  receiptVersion: 1,
  emittedAt: "2026-07-18T10:00:00.000Z",
};

const NEXT_REMINDER: VnextContinuousUseResponse = {
  status: "not_due",
  nextReminderAt: "2026-07-18T12:00:00.000Z",
};

function renderControls(reminder: VnextContinuousUseResponse | null = null) {
  const onReminderChange = vi.fn();
  const onProjectionRefresh = vi.fn().mockResolvedValue(true);
  const onExited = vi.fn();
  render(
    <SafetyControls
      onExited={onExited}
      onProjectionRefresh={onProjectionRefresh}
      onReminderChange={onReminderChange}
      reminder={reminder}
    />,
  );
  return { onReminderChange, onProjectionRefresh, onExited };
}

async function openControls() {
  const toggle = screen.getByRole("button", {
    name: "边界、处理选择与退出",
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await screen.findByRole("heading", { name: "你的边界由系统执行" });
  await waitFor(() => {
    expect(listConsents).toHaveBeenCalledTimes(1);
    expect(listSafetyCases).toHaveBeenCalledTimes(1);
  });
}

describe("SafetyControls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listConsents).mockResolvedValue(CONSENTS);
    vi.mocked(listSafetyCases).mockResolvedValue(SAFETY_CASES);
    vi.mocked(evaluateContinuousUse).mockResolvedValue(NEXT_REMINDER);
    vi.mocked(acknowledgeContinuousUse).mockResolvedValue({
      receiptId: PENDING_REMINDER.status === "pending" ? PENDING_REMINDER.receiptId : "",
      status: "acknowledged",
      receiptVersion: 2,
      acknowledgedAt: "2026-07-18T10:01:00.000Z",
    });
    vi.mocked(withdrawConsent).mockResolvedValue({
      status: "withdrawn",
      version: 8,
      purpose: "model_training",
      complianceStatus: "eligible",
      cancelledTaskCount: 0,
    });
    vi.mocked(appealSafetyCase).mockResolvedValue({
      safetyCaseId: "safety-case-open-1",
      status: "appealed",
      version: 12,
      appealedAt: "2026-07-18T10:02:00.000Z",
    });
    vi.mocked(exitExperience).mockResolvedValue({
      status: "exited",
      cancelledTaskCount: 1,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("acknowledges the exact reminder receipt and refreshes the next reminder truth", async () => {
    const { onReminderChange } = renderControls(PENDING_REMINDER);

    const reminder = screen.getByRole("alert");
    expect(reminder.textContent).toContain("你已经连续使用了一段时间");
    expect(reminder.textContent).toContain("不会由小韩劝你留下");
    fireEvent.click(within(reminder).getByRole("button", { name: "我知道了" }));

    await waitFor(() => {
      expect(acknowledgeContinuousUse).toHaveBeenCalledWith(
        "continuous-use-receipt-1",
        1,
      );
      expect(evaluateContinuousUse).toHaveBeenCalledTimes(1);
      expect(onReminderChange).toHaveBeenNthCalledWith(1, null);
      expect(onReminderChange).toHaveBeenNthCalledWith(2, NEXT_REMINDER);
    });
    expect(screen.getByText(/提醒已确认/)).not.toBeNull();
    expect(screen.getByRole("complementary", { name: "边界与退出" }).textContent).not.toContain(
      "continuous-use-receipt-1",
    );
  });

  it("makes the reminder exit action immediately expose a confirmable exit path", async () => {
    const { onExited } = renderControls(PENDING_REMINDER);

    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "立即退出",
      }),
    );
    const confirmExit = await screen.findByRole("button", {
      name: "确认立即退出",
    });
    fireEvent.click(confirmExit);

    await waitFor(() => {
      expect(exitExperience).toHaveBeenCalledTimes(1);
      expect(onExited).toHaveBeenCalledTimes(1);
    });
  });

  it("uses human purpose copy and requires a second explicit step before consent withdrawal", async () => {
    const { onProjectionRefresh } = renderControls();
    await openControls();

    const rail = screen.getByRole("complementary", { name: "边界与退出" });
    expect(screen.getByText("完成这次故事创作")).not.toBeNull();
    expect(screen.getByText("参与受控体验")).not.toBeNull();
    const trainingPurpose = screen.getByText("用于改进模型（可选）");
    expect(rail.textContent).not.toContain("core_creative");
    expect(rail.textContent).not.toContain("external_experience");
    expect(rail.textContent).not.toContain("model_training");

    const trainingRow = trainingPurpose.parentElement?.parentElement;
    expect(trainingRow).not.toBeNull();
    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", { name: "撤回" }),
    );
    expect(withdrawConsent).not.toHaveBeenCalled();
    expect(within(trainingRow as HTMLElement).getByText(/撤回可选用途/)).not.toBeNull();

    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", {
        name: "确认撤回",
      }),
    );
    await waitFor(() => {
      expect(withdrawConsent).toHaveBeenCalledWith("consent-training-1", 7);
      expect(onProjectionRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("preserves withdrawal success but hides stale consent actions when projection refresh fails", async () => {
    const { onProjectionRefresh } = renderControls();
    onProjectionRefresh.mockResolvedValueOnce(false);
    await openControls();

    const trainingPurpose = await screen.findByText("用于改进模型（可选）");
    const trainingRow = trainingPurpose.parentElement?.parentElement;
    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", { name: "撤回" }),
    );
    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", {
        name: "确认撤回",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/已撤回“用于改进模型（可选）”/)).not.toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("状态刷新失败");
    });
    expect(screen.queryByText("用于改进模型（可选）")).toBeNull();
    expect(screen.queryByRole("button", { name: "撤回" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "重新同步页面状态" }),
    ).not.toBeNull();
  });

  it("retries canonical projection before reloading resources after withdrawal sync failure", async () => {
    vi.mocked(listConsents)
      .mockResolvedValueOnce(CONSENTS)
      .mockResolvedValueOnce(WITHDRAWN_CONSENTS);
    const { onProjectionRefresh } = renderControls();
    onProjectionRefresh
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await openControls();

    const trainingPurpose = await screen.findByText("用于改进模型（可选）");
    const trainingRow = trainingPurpose.parentElement?.parentElement;
    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", { name: "撤回" }),
    );
    fireEvent.click(
      within(trainingRow as HTMLElement).getByRole("button", {
        name: "确认撤回",
      }),
    );
    const recovery = await screen.findByRole("button", {
      name: "重新同步页面状态",
    });
    expect(listConsents).toHaveBeenCalledTimes(1);
    expect(listSafetyCases).toHaveBeenCalledTimes(1);

    fireEvent.click(recovery);

    await waitFor(() => {
      expect(onProjectionRefresh).toHaveBeenCalledTimes(2);
      expect(listConsents).toHaveBeenCalledTimes(2);
      expect(listSafetyCases).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByRole("button", { name: "重新同步页面状态" }),
      ).toBeNull();
    });
    const refreshedTrainingPurpose = screen.getByText("用于改进模型（可选）");
    const refreshedTrainingRow = refreshedTrainingPurpose.parentElement?.parentElement;
    expect(
      within(refreshedTrainingRow as HTMLElement).getByText("已撤回"),
    ).not.toBeNull();
  });

  it("submits a safety appeal against the exact case version and hides raw safety enums", async () => {
    const { onProjectionRefresh } = renderControls();
    await openControls();

    const rail = screen.getByRole("complementary", { name: "边界与退出" });
    const caseCopy = screen.getByText("本次内容已停止生成");
    expect(screen.getByText(/需要优先处理 · 等待处理/)).not.toBeNull();
    for (const rawValue of ["open", "appealed", "block", "restrict", "high", "low"]) {
      expect(rail.textContent).not.toContain(rawValue);
    }

    const caseRow = caseCopy.parentElement?.parentElement;
    expect(caseRow).not.toBeNull();
    fireEvent.click(
      within(caseRow as HTMLElement).getByRole("button", { name: "申请复核" }),
    );
    const appealReason = screen.getByRole("textbox", {
      name: "说明需要复核的地方",
    });
    fireEvent.change(appealReason, {
      target: { value: "这段内容是合成角色的非现实冲突，请按上下文复核。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交申诉" }));

    await waitFor(() => {
      expect(appealSafetyCase).toHaveBeenCalledWith(
        "safety-case-open-1",
        11,
        "这段内容是合成角色的非现实冲突，请按上下文复核。",
      );
      expect(onProjectionRefresh).toHaveBeenCalledTimes(1);
    });
    expect(rail.textContent).not.toContain("safety-case-open-1");
  });

  it("preserves appeal success but hides stale case actions when projection refresh fails", async () => {
    const { onProjectionRefresh } = renderControls();
    onProjectionRefresh.mockResolvedValueOnce(false);
    await openControls();

    const caseCopy = await screen.findByText("本次内容已停止生成");
    const caseRow = caseCopy.parentElement?.parentElement;
    fireEvent.click(
      within(caseRow as HTMLElement).getByRole("button", { name: "申请复核" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "说明需要复核的地方" }),
      { target: { value: "请根据当前合成上下文复核。" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交申诉" }));

    await waitFor(() => {
      expect(
        screen.getByText("申诉已提交，系统会保留处理记录。"),
      ).not.toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("状态刷新失败");
    });
    expect(screen.queryByText("本次内容已停止生成")).toBeNull();
    expect(screen.queryByRole("button", { name: "申请复核" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "重新同步页面状态" }),
    ).not.toBeNull();
  });

  it("keeps appeal projection recovery visible when the explicit retry still fails", async () => {
    vi.mocked(listSafetyCases)
      .mockResolvedValueOnce(SAFETY_CASES)
      .mockResolvedValueOnce(APPEALED_SAFETY_CASES);
    const { onProjectionRefresh } = renderControls();
    onProjectionRefresh.mockResolvedValue(false);
    await openControls();

    const caseCopy = await screen.findByText("本次内容已停止生成");
    const caseRow = caseCopy.parentElement?.parentElement;
    fireEvent.click(
      within(caseRow as HTMLElement).getByRole("button", { name: "申请复核" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "说明需要复核的地方" }),
      { target: { value: "请再次同步后显示复核状态。" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交申诉" }));

    await screen.findByRole("button", {
      name: "重新同步页面状态",
    });
    const firstError = screen.getByRole("alert").textContent;
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => {
      expect(listConsents).toHaveBeenCalledTimes(2);
      expect(listSafetyCases).toHaveBeenCalledTimes(2);
      expect(
        (screen.getByRole("button", {
          name: "重新同步页面状态",
        }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });
    expect(onProjectionRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(firstError);

    fireEvent.click(
      screen.getByRole("button", { name: "重新同步页面状态" }),
    );

    await waitFor(() => {
      expect(onProjectionRefresh).toHaveBeenCalledTimes(2);
    });
    expect(listConsents).toHaveBeenCalledTimes(2);
    expect(listSafetyCases).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toBe(firstError);
    expect(
      screen.getByRole("button", { name: "重新同步页面状态" }),
    ).not.toBeNull();
    expect(screen.queryByText("本次内容已停止生成")).toBeNull();
  });

  it("requires confirmation for the standard exit and reports completion through onExited", async () => {
    const { onExited } = renderControls();
    await openControls();

    const exitSection = screen
      .getByRole("heading", { name: "立即退出" })
      .closest("section");
    expect(exitSection?.getAttribute("aria-labelledby")).toBe("vnext-exit-heading");
    fireEvent.click(
      within(exitSection as HTMLElement).getByRole("button", {
        name: "立即退出",
      }),
    );
    expect(exitExperience).not.toHaveBeenCalled();
    fireEvent.click(
      within(exitSection as HTMLElement).getByRole("button", {
        name: "确认立即退出",
      }),
    );

    await waitFor(() => {
      expect(exitExperience).toHaveBeenCalledTimes(1);
      expect(onExited).toHaveBeenCalledTimes(1);
    });
  });

  it("renders labelled regions and maps API failures to human copy without raw enums", async () => {
    vi.mocked(listConsents).mockRejectedValueOnce(
      new ExperienceApiError(
        "safety_blocked",
        "appeal_safety_decision",
        403,
      ),
    );
    renderControls();
    await openControls();

    expect(screen.getByRole("region", { name: "处理选择" })).not.toBeNull();
    expect(
      screen.getByRole("region", { name: "安全决定与申诉" }),
    ).not.toBeNull();
    expect(screen.getByRole("region", { name: "立即退出" })).not.toBeNull();
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("这次生成已由系统停止");
    expect(error.textContent).toContain("可以查看原因、申诉或退出");
    expect(error.textContent).not.toContain("safety_blocked");
    expect(error.textContent).not.toContain("appeal_safety_decision");
    expect(screen.getByText("本次内容已停止生成")).not.toBeNull();
  });

  it("keeps consent controls usable when safety-case loading fails independently", async () => {
    vi.mocked(listSafetyCases).mockRejectedValueOnce(
      new ExperienceApiError(
        "temporarily_unavailable",
        "return_later",
        503,
      ),
    );
    renderControls();
    await openControls();

    expect(screen.getByText("完成这次故事创作")).not.toBeNull();
    expect(screen.getByText("参与受控体验")).not.toBeNull();
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("安全决定暂时无法读取");
    expect(error.textContent).not.toContain("temporarily_unavailable");
  });

  it("hides only the stale resource after a partial reload failure", async () => {
    renderControls();
    await openControls();
    await screen.findByText("完成这次故事创作");
    await screen.findByText("本次内容已停止生成");
    vi.mocked(listConsents).mockRejectedValueOnce(
      new ExperienceApiError("temporarily_unavailable", "return_later", 503),
    );
    vi.mocked(listSafetyCases).mockResolvedValueOnce(SAFETY_CASES);

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(listConsents).toHaveBeenCalledTimes(2);
      expect(listSafetyCases).toHaveBeenCalledTimes(2);
      expect(screen.getByText("处理选择暂时无法读取，请刷新重试。")).not.toBeNull();
    });
    expect(screen.queryByText("完成这次故事创作")).toBeNull();
    expect(screen.queryByText("当前没有可撤回的处理选择。")).toBeNull();
    expect(screen.getByText("本次内容已停止生成")).not.toBeNull();
  });

  it("does not turn an independently failed resource into a false empty state", async () => {
    vi.mocked(listConsents).mockRejectedValueOnce(
      new ExperienceApiError(
        "temporarily_unavailable",
        "return_later",
        503,
      ),
    );
    vi.mocked(listSafetyCases).mockRejectedValueOnce(
      new ExperienceApiError(
        "temporarily_unavailable",
        "return_later",
        503,
      ),
    );
    renderControls();
    await openControls();

    expect(screen.getByText("处理选择暂时无法读取，请刷新重试。")).not.toBeNull();
    expect(screen.getByText("安全决定暂时无法读取，请刷新重试。")).not.toBeNull();
    expect(screen.queryByText("当前没有可撤回的处理选择。")).toBeNull();
    expect(screen.queryByText("当前没有需要处理的安全决定。")).toBeNull();
  });

  it("keeps the exact reminder receipt retryable after a transient acknowledgement failure", async () => {
    vi.mocked(acknowledgeContinuousUse)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 0),
      )
      .mockResolvedValueOnce({
        receiptId: PENDING_REMINDER.receiptId,
        status: "acknowledged",
        receiptVersion: 2,
        acknowledgedAt: "2026-07-18T10:01:00.000Z",
      });
    const { onReminderChange } = renderControls(PENDING_REMINDER);

    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() => {
      expect(acknowledgeContinuousUse).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/稍后可从同一状态恢复/)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() => {
      expect(acknowledgeContinuousUse).toHaveBeenNthCalledWith(
        2,
        PENDING_REMINDER.receiptId,
        PENDING_REMINDER.receiptVersion,
      );
      expect(onReminderChange).toHaveBeenNthCalledWith(1, null);
      expect(onReminderChange).toHaveBeenNthCalledWith(2, NEXT_REMINDER);
    });
  });
});
