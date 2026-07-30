import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExperienceProjection,
  ExperienceState,
  VnextSessionAdmissionManifest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  ExperienceApiError,
  acceptExperienceAdmission,
  bootstrapExperienceSession,
  evaluateContinuousUse,
  readExperienceDraft,
  readExperienceProjection,
  submitExperienceAction,
} from "../lib/experience-api";
import { EXPERIENCE_STATE_COPY } from "./experience-copy";
import { ExperienceView } from "./experience-view";

const safetyControlsProps = vi.hoisted(() => vi.fn());

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
  acceptExperienceAdmission: vi.fn(),
  acknowledgeContinuousUse: vi.fn(),
  appealSafetyCase: vi.fn(),
  bootstrapExperienceSession: vi.fn(),
  evaluateContinuousUse: vi.fn(),
  exitExperience: vi.fn(),
  listConsents: vi.fn(),
  listSafetyCases: vi.fn(),
  readExperienceDraft: vi.fn(),
  readExperienceProjection: vi.fn(),
  subscribeContinuousUseOffer: vi.fn(() => () => undefined),
  submitExperienceAction: vi.fn(),
  withdrawConsent: vi.fn(),
}));

vi.mock("./safety-controls", () => ({
  SafetyControls: (props: { onProjectionRefresh(): Promise<boolean> }) => {
    safetyControlsProps(props);
    return <aside aria-label="边界与退出" />;
  },
}));

const ADMISSION_MANIFEST: VnextSessionAdmissionManifest = {
  audienceMode: "internal",
  inputPolicy: "synthetic_only",
  admissionPolicyVersion: "admission-2026-07-18",
  aiIdentityNoticeVersion: "ai-identity-2026-07-18",
  serviceTermsVersion: "terms-2026-07-18",
  privacyNoticeVersion: "privacy-2026-07-18",
};

const UNDERSTANDING_VERSION_ID = "11111111-1111-4111-8111-111111111111";

function projection(
  status: ExperienceState,
  overrides: Partial<ExperienceProjection> = {},
): ExperienceProjection {
  return {
    versionId: `projection-${status}`,
    status,
    headline: `${status} 的真实服务端标题`,
    body: `${status} 的真实服务端说明`,
    understanding: null,
    primaryAction:
      status === "available"
        ? { code: "submit_intent", label: "说说想看的故事" }
        : null,
    secondaryActions: [],
    ...overrides,
  };
}

function activeBootstrap(nextProjection: ExperienceProjection) {
  vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
    status: "active",
    projection: nextProjection,
  });
}

async function renderActive(nextProjection: ExperienceProjection) {
  activeBootstrap(nextProjection);
  render(<ExperienceView />);
  await screen.findByRole("heading", { name: nextProjection.headline });
}

describe("ExperienceView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    vi.mocked(evaluateContinuousUse).mockResolvedValue({
      status: "not_due",
      nextReminderAt: "2026-07-18T12:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("requires all three explicit admission acknowledgements and submits the server manifest unchanged", async () => {
    vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
      status: "admission_required",
      manifest: ADMISSION_MANIFEST,
    });
    vi.mocked(acceptExperienceAdmission).mockResolvedValueOnce({
      status: "active",
      projection: projection("available"),
    });

    render(<ExperienceView />);

    const admissionHeading = await screen.findByRole("heading", {
      name: "先把身份与边界说清楚",
    });
    const admissionSection = admissionHeading.closest("section");
    const aiIdentity = screen.getByRole("checkbox", {
      name: /我知道小韩是 AI 服务，而不是真人/,
    });
    const termsAndPrivacy = screen.getByRole("checkbox", {
      name: /我已阅读并同意/,
    });
    const syntheticOnly = screen.getByRole("checkbox", {
      name: /我只提交虚构、合成内容/,
    });
    const enterButton = screen.getByRole("button", { name: "进入书房" });

    expect(admissionSection?.getAttribute("aria-labelledby")).toBe(
      "vnext-admission-title",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect((enterButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "服务说明" }).getAttribute("href")).toBe(
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: "隐私说明" }).getAttribute("href")).toBe(
      "/legal/privacy",
    );

    fireEvent.click(aiIdentity);
    fireEvent.click(termsAndPrivacy);
    expect((enterButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(syntheticOnly);
    expect((enterButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(enterButton);

    await waitFor(() => {
      expect(acceptExperienceAdmission).toHaveBeenCalledTimes(1);
      expect(acceptExperienceAdmission).toHaveBeenCalledWith(
        ADMISSION_MANIFEST,
      );
    });
  });

  it("refreshes a stale admission manifest before exposing the entry action again", async () => {
    const rotatedManifest = {
      ...ADMISSION_MANIFEST,
      admissionPolicyVersion: "admission-2026-07-19",
    } as const;
    vi.mocked(bootstrapExperienceSession)
      .mockResolvedValueOnce({
        status: "admission_required",
        manifest: ADMISSION_MANIFEST,
      })
      .mockResolvedValueOnce({
        status: "admission_required",
        manifest: rotatedManifest,
    });
    vi.mocked(acceptExperienceAdmission).mockRejectedValueOnce(
      new ExperienceApiError("compliance_blocked", "refresh_admission", 403),
    );

    render(<ExperienceView />);
    await screen.findByRole("heading", { name: "先把身份与边界说清楚" });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    fireEvent.click(screen.getByRole("button", { name: "进入书房" }));

    await waitFor(() => {
      expect(acceptExperienceAdmission).toHaveBeenCalledWith(ADMISSION_MANIFEST);
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "进入书房" })).toBeDefined();
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("reloads a rotated manifest and resets acknowledgements after correct_request", async () => {
    const rotatedManifest = {
      ...ADMISSION_MANIFEST,
      admissionPolicyVersion: "admission-2026-07-20",
    } as const;
    vi.mocked(bootstrapExperienceSession)
      .mockResolvedValueOnce({
        status: "admission_required",
        manifest: ADMISSION_MANIFEST,
      })
      .mockResolvedValueOnce({
        status: "admission_required",
        manifest: rotatedManifest,
      });
    vi.mocked(acceptExperienceAdmission)
      .mockRejectedValueOnce(
        new ExperienceApiError("invalid_request", "correct_request", 400),
      )
      .mockResolvedValueOnce({
        status: "active",
        projection: projection("available"),
      });

    render(<ExperienceView />);
    await screen.findByRole("heading", { name: "先把身份与边界说清楚" });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    fireEvent.click(screen.getByRole("button", { name: "进入书房" }));

    await waitFor(() => {
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
      expect(
        (screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked,
      ).toBe(false);
    });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    fireEvent.click(screen.getByRole("button", { name: "进入书房" }));

    await waitFor(() => {
      expect(acceptExperienceAdmission).toHaveBeenNthCalledWith(
        2,
        rotatedManifest,
      );
    });
  });

  it("submits a trimmed intent only from available and renders the returned projection", async () => {
    const available = projection("available", {
      headline: "灯亮着，可以开始",
      body: "说出你脑中的第一幕。",
    });
    const listening = projection("listening", {
      headline: "委托已经收好",
      body: "系统正在理解这一句。",
    });
    vi.mocked(submitExperienceAction).mockResolvedValueOnce(listening);
    await renderActive(available);

    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    const submitButton = screen.getByRole("button", {
      name: "把这一句交给小韩",
    });
    expect((storyInput as HTMLTextAreaElement).disabled).toBe(false);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(storyInput, {
      target: { value: "  世界结束前七天，他们才承认彼此。  " },
    });
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitExperienceAction).toHaveBeenCalledWith({
        action: "submit_intent",
        text: "世界结束前七天，他们才承认彼此。",
      }, available);
    });
    expect(
      await screen.findByRole("heading", { name: "委托已经收好" }),
    ).not.toBeNull();
  });

  it.each<{
    status: ExperienceState;
    headline: string;
    body: string;
  }>([
    { status: "available", headline: "现在可以落笔", body: "写作台已经开放。" },
    { status: "listening", headline: "正在理解委托", body: "只确认决定故事的内容。" },
    { status: "writing", headline: "正在真实写作", body: "稿件保存后才会交付。" },
    { status: "revising", headline: "正在保留旧稿改写", body: "新版本尚未交付。" },
    { status: "draft_ready", headline: "真实草稿已经保存", body: "可以打开阅读。" },
    { status: "unavailable", headline: "写作依赖尚未就绪", body: "系统不会用假稿代替。" },
  ])("renders the $status server projection and its honest local scene copy", async ({
    status,
    headline,
    body,
  }) => {
    await renderActive(projection(status, { headline, body }));

    const main = screen.getByRole("main");
    const storyInput = screen.queryByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    expect(main.getAttribute("data-state")).toBe(status);
    expect(screen.getByRole("heading", { name: headline })).not.toBeNull();
    expect(screen.getByText(body)).not.toBeNull();
    expect(screen.getByText(EXPERIENCE_STATE_COPY[status].scene)).not.toBeNull();
    if (status === "available") {
      expect(storyInput).not.toBeNull();
      expect((storyInput as HTMLTextAreaElement).disabled).toBe(false);
    } else {
      expect(storyInput).toBeNull();
    }
  });

  it("labels local understanding collapse without pretending to persist confirmation", async () => {
    await renderActive(
      projection("writing", {
        headline: "理解已确认，正在起笔",
        understanding: {
          versionId: UNDERSTANDING_VERSION_ID,
          statement: "两个克制的人在末日前相爱。",
          clarificationQuestion: null,
        },
        secondaryActions: [
          {
            code: "correct_understanding",
            label: "纠正理解",
            basedOnVersionId: UNDERSTANDING_VERSION_ID,
          },
        ],
      }),
    );

    expect(
      screen.getByRole("heading", { name: "我听懂的是……" }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "收起理解说明" }));

    expect(
      screen.queryByRole("heading", { name: "我听懂的是……" }),
    ).toBeNull();
    expect(submitExperienceAction).not.toHaveBeenCalled();
    expect(readExperienceProjection).not.toHaveBeenCalled();
    expect(readExperienceDraft).not.toHaveBeenCalled();
    expect(acceptExperienceAdmission).not.toHaveBeenCalled();
  });

  it("submits a correction against the exact version carried by the server action", async () => {
    const corrected = projection("revising", {
      headline: "已按最新理解重新处理",
    });
    vi.mocked(submitExperienceAction).mockResolvedValueOnce(corrected);
    const current = projection("writing", {
      headline: "先确认系统理解",
      understanding: {
        versionId: "22222222-2222-4222-8222-222222222222",
        statement: "他们会在第一章重逢。",
        clarificationQuestion: null,
      },
      secondaryActions: [
        {
          code: "correct_understanding",
          label: "纠正理解",
          basedOnVersionId: UNDERSTANDING_VERSION_ID,
        },
      ],
    });
    await renderActive(current);

    fireEvent.click(screen.getByRole("button", { name: "不是这个意思" }));
    const correctionInput = screen.getByRole("textbox", {
      name: "重新说清你真正想看的方向",
    });
    fireEvent.change(correctionInput, {
      target: { value: "  他们从未分开，只是在末日前第一次坦白。  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "提交给系统重新理解" }),
    );

    await waitFor(() => {
      expect(submitExperienceAction).toHaveBeenCalledWith({
        action: "correct_understanding",
        text: "他们从未分开，只是在末日前第一次坦白。",
        basedOnVersionId: UNDERSTANDING_VERSION_ID,
      }, current);
    });
  });

  it("invalidates an open correction form when polling changes its understanding basis", async () => {
    const current = projection("writing", {
      headline: "先确认第一版理解",
      understanding: {
        versionId: UNDERSTANDING_VERSION_ID,
        statement: "他们会在第一章重逢。",
        clarificationQuestion: null,
      },
      secondaryActions: [
        {
          code: "correct_understanding",
          label: "纠正理解",
          basedOnVersionId: UNDERSTANDING_VERSION_ID,
        },
        { code: "return_later", label: "稍后再来" },
      ],
    });
    const nextUnderstandingVersionId = "33333333-3333-4333-8333-333333333333";
    const updated = projection("writing", {
      headline: "系统已经形成第二版理解",
      understanding: {
        versionId: nextUnderstandingVersionId,
        statement: "他们其实从未分开。",
        clarificationQuestion: null,
      },
      secondaryActions: [
        {
          code: "correct_understanding",
          label: "纠正理解",
          basedOnVersionId: nextUnderstandingVersionId,
        },
        { code: "return_later", label: "稍后再来" },
      ],
    });
    await renderActive(current);

    fireEvent.click(screen.getByRole("button", { name: "不是这个意思" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重新说清你真正想看的方向" }), {
      target: { value: "旧理解对应的补充文字。" },
    });
    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    vi.mocked(readExperienceProjection).mockResolvedValueOnce(updated);

    await act(async () => {
      await wiredProps?.onProjectionRefresh();
    });

    expect(screen.queryByRole("textbox", { name: "重新说清你真正想看的方向" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("刷新");
    expect(submitExperienceAction).not.toHaveBeenCalled();
  });

  it("does not let a passive refresh overwrite a newer action result", async () => {
    let resolveRefresh: ((nextProjection: ExperienceProjection) => void) | undefined;
    let resolveAction: ((nextProjection: ExperienceProjection) => void) | undefined;
    const current = projection("writing", {
      secondaryActions: [
        {
          code: "retry_current_task",
          label: "重试当前委托",
          basedOnVersionId: "writing-version-1",
        },
        { code: "return_later", label: "稍后再来" },
      ],
    });
    const actionResult = projection("writing", {
      headline: "新的动作结果",
    });
    const staleRefresh = projection("writing", {
      headline: "不应覆盖的旧刷新",
    });
    vi.mocked(readExperienceProjection).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    vi.mocked(submitExperienceAction).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    await renderActive(current);

    fireEvent.click(screen.getByRole("button", { name: "停止自动刷新" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复自动刷新" }));
    fireEvent.click(screen.getByRole("button", { name: "重试当前委托" }));

    resolveAction?.(actionResult);
    await screen.findByRole("heading", { name: actionResult.headline });
    resolveRefresh?.(staleRefresh);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: actionResult.headline })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: staleRefresh.headline })).toBeNull();
  });

  it("locks primary mutations after Safety recovery loses canonical projection", async () => {
    const current = projection("available", {
      understanding: {
        versionId: UNDERSTANDING_VERSION_ID,
        statement: "两个克制的人在末日前相爱。",
        clarificationQuestion: null,
      },
      secondaryActions: [
        {
          code: "correct_understanding",
          label: "纠正理解",
          basedOnVersionId: UNDERSTANDING_VERSION_ID,
        },
        {
          code: "retry_current_task",
          label: "重试当前委托",
          basedOnVersionId: "retry-version-1",
        },
      ],
    });
    await renderActive(current);

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    vi.mocked(readExperienceProjection).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "restore_session", 401),
    );

    await act(async () => {
      await expect(wiredProps?.onProjectionRefresh()).resolves.toBe(false);
    });

    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "重试当前委托" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "不是这个意思" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    vi.mocked(readExperienceProjection).mockResolvedValueOnce(current);
    const freshProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    await act(async () => {
      await expect(freshProps?.onProjectionRefresh()).resolves.toBe(true);
    });

    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "重试当前委托" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "不是这个意思" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("queues a SafetyControls refresh during mutation and lets the final canonical GET win", async () => {
    let resolveAction: ((nextProjection: ExperienceProjection) => void) | undefined;
    let resolveRefresh: ((nextProjection: ExperienceProjection) => void) | undefined;
    const current = projection("writing", {
      headline: "当前正在写作",
      secondaryActions: [{ code: "retry_current_task", label: "重试当前委托", basedOnVersionId: "writing-version-1" }],
    });
    const staleMutationResponse = projection("writing", {
      headline: "旧 mutation response",
      secondaryActions: [
        {
          code: "retry_current_task",
          label: "重试当前委托",
          basedOnVersionId: "stale-mutation-version-1",
        },
      ],
    });
    const canonicalAfterRefresh = projection("writing", {
      headline: "最终 canonical projection",
      secondaryActions: [
        {
          code: "retry_current_task",
          label: "重试当前委托",
          basedOnVersionId: "canonical-version-1",
        },
      ],
    });
    vi.mocked(submitExperienceAction).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    vi.mocked(readExperienceProjection).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    await renderActive(current);

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    const mutation = screen.getByRole("button", { name: "重试当前委托" });
    fireEvent.click(mutation);
    expect(
      (screen.getByRole("button", { name: "重试当前委托" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    let refreshResult: boolean | undefined;
    let queuedRefresh: Promise<void> | undefined;
    await act(async () => {
      queuedRefresh = wiredProps?.onProjectionRefresh().then((result) => {
        refreshResult = result;
      });
      await Promise.resolve();
    });

    await act(async () => {
      resolveAction?.(staleMutationResponse);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(readExperienceProjection).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "重试当前委托" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => {
      resolveRefresh?.(canonicalAfterRefresh);
      await queuedRefresh;
    });

    expect(refreshResult).toBe(true);
    expect(readExperienceProjection).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: canonicalAfterRefresh.headline })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: staleMutationResponse.headline })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "重试当前委托" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("resolves and clears a queued refresh on unmount without issuing a later GET", async () => {
    let resolveAction: ((nextProjection: ExperienceProjection) => void) | undefined;
    const current = projection("writing", {
      secondaryActions: [
        {
          code: "retry_current_task",
          label: "重试当前委托",
          basedOnVersionId: "writing-version-1",
        },
      ],
    });
    vi.mocked(submitExperienceAction).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    await renderActive(current);

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    fireEvent.click(screen.getByRole("button", { name: "重试当前委托" }));
    let queuedRefresh: Promise<boolean> | undefined;
    await act(async () => {
      queuedRefresh = wiredProps?.onProjectionRefresh();
      await Promise.resolve();
    });

    cleanup();

    await expect(queuedRefresh).resolves.toBe(false);
    resolveAction?.(projection("writing", { headline: "不应触发后续刷新" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readExperienceProjection).not.toHaveBeenCalled();
  });

  it("renders persisted draft bytes as text and never interprets embedded HTML", async () => {
    const hostileDraft =
      '<img src="/tracking-pixel" onerror="window.__draftExecuted=true"><script>window.__draftExecuted=true</script>\n真正的正文';
    vi.mocked(readExperienceDraft).mockResolvedValueOnce({
      contentId: "content-draft-1",
      versionId: "draft-version-1",
      kind: "opening",
      body: hostileDraft,
    });
    await renderActive(
      projection("draft_ready", {
        headline: "草稿已经持久化",
        primaryAction: { code: "open_draft", label: "阅读真实草稿" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "阅读真实草稿" }));
    const manuscript = await screen.findByRole("article", {
      name: "小韩交来的第一页",
    });

    expect(readExperienceDraft).toHaveBeenCalledTimes(1);
    expect(manuscript.textContent).toContain(hostileDraft);
    expect(manuscript.querySelector("img")).toBeNull();
    expect(manuscript.querySelector("script")).toBeNull();
  });

  it("labels return_later as a local polling control rather than server progress", async () => {
    const writing = projection("writing", {
      headline: "真实写作仍在进行",
      body: "稿件尚未完成持久化。",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    await renderActive(writing);

    expect(screen.getByRole("button", { name: "停止自动刷新" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "停止自动刷新" }));
    expect(screen.getByRole("button", { name: "恢复自动刷新" })).not.toBeNull();
    expect(screen.queryByText("这次写作比目标时间更久")).toBeNull();
  });

  it("uses return_later as a one-shot canonical refresh when the projection is not polling", async () => {
    const unavailable = projection("unavailable", {
      headline: "写作依赖尚未就绪",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const refreshed = projection("unavailable", {
      headline: "重新检查后仍未就绪",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    vi.mocked(readExperienceProjection).mockResolvedValueOnce(refreshed);
    await renderActive(unavailable);

    expect(screen.queryByRole("button", { name: "停止自动刷新" })).toBeNull();
    expect(screen.queryByRole("button", { name: "恢复自动刷新" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新检查" }));

    await waitFor(() => {
      expect(readExperienceProjection).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("heading", { name: refreshed.headline }),
      ).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "恢复自动刷新" })).toBeNull();
  });

  it("returns canonical refresh truth to the wired SafetyControls callback", async () => {
    const initial = projection("unavailable", {
      headline: "当前依赖尚未就绪",
    });
    const recovered = projection("available", {
      headline: "最新投影已经就绪",
    });
    await renderActive(initial);
    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    expect(wiredProps).toBeDefined();
    vi.mocked(readExperienceProjection)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce(recovered);

    let failedResult: boolean | undefined;
    await act(async () => {
      failedResult = await wiredProps?.onProjectionRefresh();
    });
    expect(failedResult).toBe(false);
    expect(screen.getByRole("alert")).not.toBeNull();

    let recoveredResult: boolean | undefined;
    await act(async () => {
      recoveredResult = await wiredProps?.onProjectionRefresh();
    });
    expect(recoveredResult).toBe(true);
    expect(
      screen.getByRole("heading", { name: recovered.headline }),
    ).not.toBeNull();
  });

  it("retries a draft return_later through the draft read and not reminder evaluation", async () => {
    const ready = projection("draft_ready", {
      primaryAction: { code: "open_draft", label: "阅读真实草稿" },
    });
    vi.mocked(readExperienceDraft)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce({
        contentId: "draft-content-1",
        versionId: "draft-version-1",
        kind: "opening",
        body: "重试后读取到的真实草稿。",
      });

    await renderActive(ready);
    fireEvent.click(screen.getByRole("button", { name: "阅读真实草稿" }));

    const retryButton = await screen.findByRole("button", {
      name: "重新打开草稿",
    });
    expect(screen.queryByRole("button", { name: "重新检查提醒" })).toBeNull();
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(readExperienceDraft).toHaveBeenCalledTimes(2);
      expect(screen.getByText("重试后读取到的真实草稿。")).not.toBeNull();
    });
  });

  it("retries a projection return_later through projection refresh and not reminder evaluation", async () => {
    const initial = projection("unavailable", {
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const recovered = projection("available", {
      headline: "刷新后服务已经就绪",
    });
    vi.mocked(readExperienceProjection)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce(recovered);

    await renderActive(initial);
    fireEvent.click(screen.getByRole("button", { name: "重新检查" }));

    const retryButton = await screen.findByRole("button", {
      name: "刷新最新状态",
    });
    expect(screen.queryByRole("button", { name: "重新检查提醒" })).toBeNull();
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(readExperienceProjection).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("heading", { name: recovered.headline }),
      ).not.toBeNull();
    });
  });

  it("does not let a projection success clear an unrelated submit recovery error", async () => {
    const initial = projection("available", {
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const refreshed = projection("available", {
      headline: "刷新后的服务端状态",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    vi.mocked(submitExperienceAction).mockRejectedValueOnce(
      new ExperienceApiError("temporarily_unavailable", "return_later", 503),
    );
    vi.mocked(readExperienceProjection).mockResolvedValueOnce(refreshed);

    await renderActive(initial);
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    fireEvent.change(storyInput, { target: { value: "合成角色在雪夜重逢。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    await screen.findByRole("button", { name: "先重试上一提交" });

    fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: refreshed.headline }),
      ).not.toBeNull();
    });
    expect(screen.getByRole("button", { name: "先重试上一提交" })).not.toBeNull();
  });

  it("re-evaluates continuous-use truth when a not-due reminder reaches nextReminderAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:00:00.000Z"));
    activeBootstrap(projection("available", { headline: "房间已经就绪" }));
    vi.mocked(evaluateContinuousUse)
      .mockResolvedValueOnce({
        status: "not_due",
        nextReminderAt: "2026-07-18T10:00:01.000Z",
      })
      .mockResolvedValueOnce({
        status: "pending",
        receiptId: "continuous-use-receipt-2",
        receiptVersion: 1,
        emittedAt: "2026-07-18T10:00:01.000Z",
      });

    render(<ExperienceView />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(evaluateContinuousUse).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(evaluateContinuousUse).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(evaluateContinuousUse).toHaveBeenCalledTimes(2);
  });

  it("retries a transient continuous-use evaluation before showing a recoverable error", async () => {
    vi.useFakeTimers();
    activeBootstrap(projection("available", { headline: "房间已经就绪" }));
    vi.mocked(evaluateContinuousUse)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 0),
      )
      .mockResolvedValueOnce({
        status: "pending",
        receiptId: "continuous-use-receipt-retry",
        receiptVersion: 1,
        emittedAt: "2026-07-18T10:00:01.000Z",
      });

    render(<ExperienceView />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(evaluateContinuousUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("重新检查提醒")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(evaluateContinuousUse).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("scopes a reminder return_later retry and clears its alert without reusing an old submit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:00:00.000Z"));
    const available = projection("available", {
      headline: "房间已经就绪",
    });
    activeBootstrap(available);
    vi.mocked(evaluateContinuousUse)
      .mockResolvedValueOnce({
        status: "not_due",
        nextReminderAt: "2026-07-18T10:00:01.000Z",
      })
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce({
        status: "not_due",
        nextReminderAt: "2026-07-18T10:01:00.000Z",
      });
    vi.mocked(submitExperienceAction)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce(available);

    render(<ExperienceView />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    fireEvent.change(storyInput, { target: { value: "合成角色在雪夜重逢。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "先重试上一提交" })).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "先重试上一提交" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "重新检查提醒" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "先重试上一提交" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(submitExperienceAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "重新检查提醒" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重新检查提醒" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "重新检查提醒" })).toBeNull();
    expect(screen.queryByRole("button", { name: "先重试上一提交" })).toBeNull();
  });

  it.each(["reminder", "projection", "draft"] as const)(
    "keeps the unknown submit recovery primary for a %s error",
    async (secondaryFailure) => {
      const available = projection("available", {
        secondaryActions:
          secondaryFailure === "projection"
            ? [{ code: "return_later", label: "稍后再来" }]
            : secondaryFailure === "draft"
              ? [{ code: "open_draft", label: "阅读真实草稿" }]
              : [],
      });
      const submitted = projection("listening", { headline: "提交重试后的真实状态" });
      activeBootstrap(available);
      vi.mocked(submitExperienceAction)
        .mockRejectedValueOnce(
          new ExperienceApiError("temporarily_unavailable", "return_later", 503),
        )
        .mockResolvedValueOnce(submitted);

      if (secondaryFailure === "projection") {
        vi.mocked(readExperienceProjection)
          .mockRejectedValueOnce(
            new ExperienceApiError("temporarily_unavailable", "return_later", 503),
          )
          .mockResolvedValueOnce(available);
      }
      if (secondaryFailure === "draft") {
        vi.mocked(readExperienceDraft)
          .mockRejectedValueOnce(
            new ExperienceApiError("temporarily_unavailable", "return_later", 503),
          )
          .mockResolvedValueOnce({
            contentId: "draft-content-recovered",
            versionId: "draft-version-recovered",
            kind: "opening",
            body: "次要读取恢复后的真实草稿。",
          });
      }
      if (secondaryFailure === "reminder") {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-18T10:00:00.000Z"));
        vi.mocked(evaluateContinuousUse)
          .mockResolvedValueOnce({
            status: "not_due",
            nextReminderAt: "2026-07-18T10:00:01.000Z",
          })
          .mockRejectedValueOnce(
            new ExperienceApiError("temporarily_unavailable", "return_later", 503),
          )
          .mockRejectedValueOnce(
            new ExperienceApiError("temporarily_unavailable", "return_later", 503),
          )
          .mockRejectedValueOnce(
            new ExperienceApiError("temporarily_unavailable", "return_later", 503),
          )
          .mockResolvedValueOnce({
            status: "not_due",
            nextReminderAt: "2026-07-18T10:01:00.000Z",
          });
      }

      render(<ExperienceView />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole("heading", { name: available.headline })).not.toBeNull();
      const storyInput = screen.getByRole("textbox", {
        name: "你脑中现在最想看的那一幕",
      });
      fireEvent.change(storyInput, { target: { value: "同一个请求不能被重复创建。" } });
      fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      if (secondaryFailure === "projection") {
        fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
      }
      if (secondaryFailure === "draft") {
        fireEvent.click(screen.getByRole("button", { name: "阅读真实草稿" }));
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
      }
      if (secondaryFailure === "reminder") {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
          await vi.advanceTimersByTimeAsync(500);
          await vi.advanceTimersByTimeAsync(1_000);
          await Promise.resolve();
          await Promise.resolve();
        });
      }

      expect(screen.getByRole("button", { name: "先重试上一提交" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "先重试上一提交" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(submitExperienceAction).toHaveBeenCalledTimes(2);

      const secondaryRecovery = {
        reminder: "重新检查提醒",
        projection: "刷新最新状态",
        draft: "重新打开草稿",
      }[secondaryFailure];
      expect(screen.getByRole("button", { name: secondaryRecovery })).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: secondaryRecovery }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(submitExperienceAction).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: secondaryRecovery })).toBeNull();
    },
  );

  it("offers an explicit replay for a submit that returned later", async () => {
    const available = projection("available", {
      headline: "灯亮着，可以开始",
    });
    const listening = projection("listening", {
      headline: "委托已经收好",
    });
    vi.mocked(submitExperienceAction)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 0),
      )
      .mockResolvedValueOnce(listening);
    await renderActive(available);

    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    fireEvent.change(storyInput, { target: { value: "合成角色在雪夜重逢。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));

    expect(submitExperienceAction).toHaveBeenNthCalledWith(
      1,
      { action: "submit_intent", text: "合成角色在雪夜重逢。" },
      available,
    );
    const retryButton = await screen.findByRole("button", {
      name: "先重试上一提交",
    });
    expect(
      (screen.getByRole("button", { name: "把这一句交给小韩" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(retryButton);
    await waitFor(() => {
      expect(submitExperienceAction).toHaveBeenCalledTimes(2);
      expect(submitExperienceAction).toHaveBeenNthCalledWith(
        2,
        { action: "submit_intent", text: "合成角色在雪夜重逢。" },
        available,
      );
      expect(screen.getByRole("heading", { name: listening.headline })).not.toBeNull();
    });
  });

  it("keeps the unknown-submit retry visible after a canonical refresh cannot prove the outcome", async () => {
    const initial = projection("available", {
      headline: "灯亮着，可以开始",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const refreshed = projection("available", {
      headline: "刷新后的服务端状态",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    vi.mocked(submitExperienceAction).mockRejectedValueOnce(
      new ExperienceApiError("temporarily_unavailable", "return_later", 0),
    );
    vi.mocked(readExperienceProjection).mockResolvedValueOnce(refreshed);

    await renderActive(initial);
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    fireEvent.change(storyInput, { target: { value: "合成角色在雪夜重逢。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    await screen.findByRole("button", { name: "先重试上一提交" });

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    await act(async () => {
      await wiredProps?.onProjectionRefresh();
    });

    expect(screen.getByRole("heading", { name: refreshed.headline })).not.toBeNull();
    expect(screen.getByRole("button", { name: "先重试上一提交" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "把这一句交给小韩" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the unknown retry at a new session boundary without auto-posting or losing text", async () => {
    const initial = projection("available", {
      headline: "旧会话仍在页面上",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const fresh = projection("available", {
      headline: "新会话已经确认",
    });
    activeBootstrap(initial);
    vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
      status: "active",
      projection: fresh,
    });
    vi.mocked(submitExperienceAction).mockRejectedValueOnce(
      new ExperienceApiError("temporarily_unavailable", "return_later", 0),
    );
    vi.mocked(readExperienceProjection).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "restore_session", 401),
    );

    render(<ExperienceView />);
    await screen.findByRole("heading", { name: initial.headline });
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    }) as HTMLTextAreaElement;
    fireEvent.change(storyInput, { target: { value: "旧会话的原始文字。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    await screen.findByRole("button", { name: "先重试上一提交" });

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    await act(async () => {
      await wiredProps?.onProjectionRefresh();
    });
    fireEvent.click(screen.getByRole("button", { name: "重新确认服务" }));

    await waitFor(() => {
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("heading", { name: fresh.headline })).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "先重试上一提交" })).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .value,
    ).toBe("旧会话的原始文字。");
    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
    expect(submitExperienceAction).toHaveBeenCalledTimes(1);
  });

  it("clears the unknown retry before a manifest recovery failure and keeps the text", async () => {
    const initial = projection("available", {
      headline: "旧会话仍在页面上",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    });
    const fresh = projection("available", { headline: "重新进入后的状态" });
    activeBootstrap(initial);
    vi.mocked(bootstrapExperienceSession)
      .mockRejectedValueOnce(
        new ExperienceApiError("temporarily_unavailable", "return_later", 503),
      )
      .mockResolvedValueOnce({ status: "active", projection: fresh });
    vi.mocked(submitExperienceAction).mockRejectedValueOnce(
      new ExperienceApiError("temporarily_unavailable", "return_later", 0),
    );
    vi.mocked(readExperienceProjection).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "restore_session", 401),
    );

    render(<ExperienceView />);
    await screen.findByRole("heading", { name: initial.headline });
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    fireEvent.change(storyInput, { target: { value: "旧会话的原始文字。" } });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    await screen.findByRole("button", { name: "先重试上一提交" });

    const wiredProps = safetyControlsProps.mock.calls.at(-1)?.[0] as
      | { onProjectionRefresh(): Promise<boolean> }
      | undefined;
    await act(async () => {
      await wiredProps?.onProjectionRefresh();
    });
    fireEvent.click(screen.getByRole("button", { name: "重新确认服务" }));

    await screen.findByRole("button", { name: "重新确认服务" });
    expect(screen.queryByRole("button", { name: "先重试上一提交" })).toBeNull();
    expect(submitExperienceAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新确认服务" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: fresh.headline })).not.toBeNull();
    });
    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .value,
    ).toBe("旧会话的原始文字。");
    expect(
      (screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
    expect(submitExperienceAction).toHaveBeenCalledTimes(1);
  });

  it("routes an active submit restore_session error through loadSession", async () => {
    const fresh = projection("available", { headline: "submit 恢复后的状态" });
    activeBootstrap(projection("available", { headline: "submit 初始状态" }));
    vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
      status: "active",
      projection: fresh,
    });
    vi.mocked(submitExperienceAction).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "restore_session", 401),
    );
    render(<ExperienceView />);
    await screen.findByRole("heading", { name: "submit 初始状态" });
    fireEvent.change(screen.getByRole("textbox", { name: "你脑中现在最想看的那一幕" }), {
      target: { value: "需要恢复的委托。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "把这一句交给小韩" }));
    const recoveryButton = await screen.findByRole("button", { name: "重新确认服务" });
    fireEvent.click(recoveryButton);
    await waitFor(() => {
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("heading", { name: fresh.headline })).not.toBeNull();
    });
  });

  it("routes an active projection refresh_admission error through loadSession", async () => {
    const fresh = projection("available", { headline: "projection 恢复后的状态" });
    activeBootstrap(projection("unavailable", {
      headline: "projection 初始状态",
      secondaryActions: [{ code: "return_later", label: "稍后再来" }],
    }));
    vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
      status: "active",
      projection: fresh,
    });
    vi.mocked(readExperienceProjection).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "refresh_admission", 409),
    );
    render(<ExperienceView />);
    await screen.findByRole("heading", { name: "projection 初始状态" });
    fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
    const recoveryButton = await screen.findByRole("button", { name: "重新确认服务" });
    fireEvent.click(recoveryButton);
    await waitFor(() => {
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("heading", { name: fresh.headline })).not.toBeNull();
    });
  });

  it("routes an active draft restore_session error through loadSession", async () => {
    const fresh = projection("available", { headline: "draft 恢复后的状态" });
    activeBootstrap(projection("draft_ready", {
      headline: "draft 初始状态",
      primaryAction: { code: "open_draft", label: "阅读真实草稿" },
    }));
    vi.mocked(bootstrapExperienceSession).mockResolvedValueOnce({
      status: "active",
      projection: fresh,
    });
    vi.mocked(readExperienceDraft).mockRejectedValueOnce(
      new ExperienceApiError("session_expired", "restore_session", 401),
    );
    render(<ExperienceView />);
    await screen.findByRole("heading", { name: "draft 初始状态" });
    fireEvent.click(screen.getByRole("button", { name: "阅读真实草稿" }));
    const recoveryButton = await screen.findByRole("button", { name: "重新确认服务" });
    fireEvent.click(recoveryButton);
    await waitFor(() => {
      expect(bootstrapExperienceSession).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("heading", { name: fresh.headline })).not.toBeNull();
    });
  });

  it("renders unavailable without an input surface, fabricated progress, or fake draft", async () => {
    await renderActive(
      projection("unavailable", {
        headline: "创作服务还没有准备好",
        body: "委托尚未开始，系统不会展示模板正文。",
      }),
    );

    const storyInput = screen.queryByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    const submitButton = screen.queryByRole("button", {
      name: "把这一句交给小韩",
    });
    expect(storyInput).toBeNull();
    expect(submitButton).toBeNull();
    expect(screen.getByText("写作台暂未开放")).not.toBeNull();
    expect(screen.getByText(/不会用模板正文假装创作成功/)).not.toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText(/已完成 100%|马上交稿|这是你的故事正文/)).toBeNull();
  });

  it("does not invent a submit control when an available projection omits the server action", async () => {
    await renderActive(
      projection("available", {
        headline: "服务端暂未开放提交动作",
        primaryAction: null,
      }),
    );

    expect(
      screen.queryByRole("textbox", { name: "你脑中现在最想看的那一幕" }),
    ).toBeNull();
    expect(submitExperienceAction).not.toHaveBeenCalled();
  });

  it("keeps system boundaries and exit reachable when bootstrap truth cannot be read", async () => {
    vi.mocked(bootstrapExperienceSession).mockRejectedValueOnce(
      new ExperienceApiError(
        "temporarily_unavailable",
        "return_later",
        503,
      ),
    );

    render(<ExperienceView />);

    expect(
      await screen.findByRole("complementary", { name: "边界与退出" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "重新确认服务" })).not.toBeNull();
  });

  it("exposes the active projection, story input, and safety rail with accessible names", async () => {
    await renderActive(
      projection("available", {
        headline: "请告诉我第一幕",
        body: "系统已经可以接收虚构委托。",
      }),
    );

    const statusHeading = screen.getByRole("heading", {
      name: "请告诉我第一幕",
    });
    const statusRegion = statusHeading.closest("section");
    const storyInput = screen.getByRole("textbox", {
      name: "你脑中现在最想看的那一幕",
    });
    expect(statusRegion?.getAttribute("aria-labelledby")).toBe(
      "vnext-status-heading",
    );
    expect(statusRegion?.getAttribute("aria-live")).toBe("polite");
    expect(storyInput.getAttribute("id")).toBe("vnext-story-input");
    expect(screen.getByRole("complementary", { name: "边界与退出" })).not.toBeNull();
    expect(document.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
