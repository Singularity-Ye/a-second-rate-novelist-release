import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { RoomUiPresentationalSurface } from "./room-ui-presentational-surface";
import type { RoomUiPresentationModel } from "./room-ui-adapter";

function model(overrides: Partial<RoomUiPresentationModel> = {}): RoomUiPresentationModel {
  return {
    chat: {
      messages: [
        {
          id: "user-1",
          role: "user",
          kind: "conversation",
          text: "我想把这一句雨声写进来。",
          createdAt: "2026-08-09T00:00:00.000Z",
        },
        {
          id: "ack-1",
          role: "assistant",
          kind: "submitted_ack",
          text: "fixture text must never be rendered as正文",
          createdAt: "2026-08-09T00:00:01.000Z",
        },
      ],
      composer: { placeholder: "直接和小说家说点什么…", enabled: true },
      streamState: { phase: "submitted_ack", requestId: "request-1" },
    },
    life: {
      sceneLabel: "书房",
      activityLabel: "正在写作",
      avatar: { src: "/assets/ecology/characters/novelist/avatars/novelist-avatar-writing-v1-normalized.webp", state: "writing", label: "小说家：写作中" },
      needs: { focus: 72, fatigue: 20, inspiration: 48, emotionalLoad: 18 },
      mood: { label: "平稳", text: "先按当前节奏继续。", source: "life_runtime" },
    },
    task: {
      projection: {
        versionId: "projection-1",
        status: "listening",
        headline: "先把意图说清楚",
        body: "正式任务会在这里给出下一步动作。",
        understanding: null,
        primaryAction: { code: "correct_understanding", label: "观察", basedOnVersionId: "projection-1" },
        secondaryActions: [{ code: "return_later", label: "暂存", basedOnVersionId: "projection-1" }],
      },
    },
    progress: {
      roomContextProgress: "writing",
      creativeJob: null,
      source: "persisted_story_truth",
    },
    draftReady: null,
    modelRuntime: { conversation: null, creativeJob: null },
    workspacePointer: null,
    recovery: null,
    ...overrides,
  };
}

const callbacks = () => ({
  draftReader: null,
  onClose: vi.fn(),
  onCloseDraftReader: vi.fn(),
  onSendMessage: vi.fn(),
  onStopStreaming: vi.fn(),
  onRetry: vi.fn(),
  onAdmissionAcknowledge: null,
  onGatewayReconnect: null,
  onFillComposer: vi.fn(),
  onProjectionAction: vi.fn(),
  onRequestDraftFeedback: vi.fn(),
  onOpenDraft: vi.fn(),
  onOpenVariantCandidate: vi.fn(),
  onCloseVariantPreview: vi.fn(),
  onSelectVariantCandidate: vi.fn(),
});

describe("RoomUiPresentationalSurface", () => {
  it("shows variant review as a real candidate-selection progress state", () => {
    render(<RoomUiPresentationalSurface {...callbacks()} model={model({
      progress: { roomContextProgress: "variant_review", creativeJob: null, source: "persisted_story_truth" },
    })} />);
    expect(screen.getByTestId("room-v6-progress").textContent).toContain("候选待选");
    expect(screen.getByTestId("room-v6-progress").querySelector('[data-progress-step="draft_ready"]')?.textContent).toContain("候选待选");
  });
  it("connects the server-backed three-card review and explicit selection callbacks", () => {
    const handlers = callbacks();
    const candidates = [1, 2, 3].map((ordinal) => ({
      candidateId: `candidate-${ordinal}`,
      candidateSetId: "candidate-set-1",
      candidateSetVersion: 1,
      ordinal: ordinal as 1 | 2 | 3,
      techniqueLabels: [`技法${ordinal}`],
      techniqueSummary: `第${ordinal}版技法说明`,
      body: `第${ordinal}版正文`.repeat(120),
      bodyHash: String(ordinal).repeat(64),
      status: "pending" as const,
    }));
    const review = {
      state: "ready" as const,
      candidateSetId: "candidate-set-1",
      candidateSetVersion: 1,
      candidates,
      selectedPreviewId: null,
      selectingCandidateId: null,
      errorCode: null,
      attestation: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        route: "creative_large",
        workflowVersion: "vnext.write_opening_variants.v1",
        providerTraceId: "trace-1",
        source: "variant_attestation" as const,
      },
    };
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model({ variantReview: review })}
        variantReview={review}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-variant-review-overlay").getAttribute("data-room-shortcut-scope"))
      .toBe("system-panel");
    expect(screen.getAllByTestId(/room-v6-variant-card-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId("room-v6-variant-card-2"));
    expect(handlers.onOpenVariantCandidate).toHaveBeenCalledWith("candidate-2");
    expect(handlers.onSelectVariantCandidate).not.toHaveBeenCalled();

    const previewReview = { ...review, selectedPreviewId: "candidate-2" };
    rerender(
      <RoomUiPresentationalSurface
        model={model({ variantReview: previewReview })}
        variantReview={previewReview}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("room-v6-variant-preview").getAttribute("data-candidate-id"))
      .toBe("candidate-2");
    fireEvent.click(screen.getByTestId("room-v6-variant-preview-select"));
    expect(handlers.onSelectVariantCandidate).toHaveBeenCalledWith("candidate-2");
    expect(handlers.onCloseVariantPreview).not.toHaveBeenCalled();
  });

  it("keeps the five visual containers and action hit areas in the DOM", () => {
    const handlers = callbacks();
    render(<RoomUiPresentationalSurface model={model()} {...handlers} />);

    expect(screen.getByTestId("room-v6-title-bookmark")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "关闭小说家房间" })).toBeNull();
    expect(screen.getByTestId("room-v6-status-card")).toBeTruthy();
    expect(screen.getByTestId("room-v6-chat-paper")).toBeTruthy();
    expect(screen.getByTestId("room-v6-suggestions")).toBeTruthy();
    expect(screen.getByTestId("room-v6-progress")).toBeTruthy();
    const stageArt = screen.getByTestId("room-v6-stage-art");
    expect(stageArt.hidden).toBe(true);
    expect(stageArt.getAttribute("style")).toContain("--layout-x: 10px");
    expect(stageArt.getAttribute("style")).toContain("--layout-scale: 1");
    expect(stageArt.getAttribute("style")).toContain("--layout-width-factor: 1");
    expect(stageArt.getAttribute("style")).toContain("--layout-height-factor: 0.84");
    expect(stageArt.getAttribute("data-art-layer")).toBe("room-backdrop-dom");
    expect(stageArt.getAttribute("data-background-container")).toBe("formal-independent");
    expect(stageArt.querySelector('[data-art-layer="room-composition-stage-v6"]')).toBeNull();
    expect(stageArt.querySelector("[data-visual-fixture]")).toBeNull();
    expect(screen.getByTestId("room-v6-suggestion-1").getAttribute("data-suggestion-kind")).toBe("composer_preset");
    expect(screen.getByTestId("room-v6-suggestion-1").getAttribute("data-based-on-version-id")).toBeNull();
    expect(screen.getByTestId("room-v6-suggestion-1").querySelector('[data-art-layer="suggestion-card-1"]')?.getAttribute("src")).toBe(
      "/assets/ui/room-presentational-v6/suggestion-card-master-v8-opaque.webp",
    );
    expect(screen.getByTestId("room-v6-suggestion-1").querySelector('[data-card-art="complete-master"]')).toBeTruthy();
    expect(screen.getByTestId("room-v6-suggestion-2").querySelector('[data-art-layer="suggestion-illustration-2"]')?.getAttribute("src")).toBe(
      "/assets/ui/room-presentational-v6/suggestion-illustration-moon-tea-v6-alpha.webp",
    );
    expect(screen.getByTestId("room-v6-chat-paper").querySelector('[data-art-layer="central-chat-template-stack-v10-alpha"]')?.getAttribute("src")).toBe(
      "/assets/ui/room-presentational-v6/central-chat-template-stack-v10-alpha.webp",
    );
    const surface = screen.getByTestId("room-v6-presentational-surface");
    expect(surface.getAttribute("data-visual-layout")).toBe("room-ui-v6-1536x1024");
    expect(surface.getAttribute("data-surface-scale")).toBe("1.8");
    expect(surface.getAttribute("style")).toContain("--surface-layout-x: -126.72px");
    expect(screen.getByTestId("room-v6-title-bookmark").getAttribute("style")).toContain("--layout-x: 74.86px");
    expect(screen.getByTestId("room-v6-chat-paper").getAttribute("style")).toContain("--layout-scale: 1.65");
    expect(screen.getByTestId("room-v6-status-card").getAttribute("style")).toContain("--layout-x: -23.05px");
    expect(screen.getByTestId("room-v6-status-card").getAttribute("style")).toContain("--layout-y: 35.52px");
    expect(screen.getByTestId("room-v6-suggestions").getAttribute("style")).toContain("--layout-x: 7.15px");
    expect(screen.getByTestId("room-v6-suggestions").getAttribute("style")).toContain("--layout-y: 43.53px");
    expect(screen.getByTestId("room-v6-suggestions").getAttribute("style")).toContain("--layout-scale: 1.6148");
    expect(screen.getByTestId("room-v6-progress").getAttribute("style")).toContain("--layout-x: 34.28px");
    expect(screen.getByTestId("room-v6-progress").getAttribute("style")).toContain("--layout-y: -60.19px");
    expect(screen.getByTestId("room-v6-status-card").querySelector('[data-visual-layer="status-avatar"]')).toBeTruthy();
    expect(screen.getByTestId("room-v6-progress").querySelector('[data-visual-layer="progress-review-text"]')).toBeTruthy();
    expect(screen.getByTestId("room-v6-progress").querySelector('[data-progress-verified="true"]')).toBeTruthy();
    expect(screen.getByTestId("room-v6-progress").querySelector('[data-progress-step="writing"]')?.getAttribute("data-active")).toBe("true");
  });

  it("keeps the server-confirmed workspace pointer visible without inventing identifiers", () => {
    render(
      <RoomUiPresentationalSurface
        model={model({
          workspacePointer: {
            workspaceId: "workspace:1",
            storyId: "story:1",
            currentChapter: { contentId: "chapter:1", version: 3 },
          },
        })}
        {...callbacks()}
      />,
    );

    const surface = screen.getByTestId("room-v6-presentational-surface");
    expect(surface.getAttribute("data-workspace-id")).toBe("workspace:1");
    expect(surface.getAttribute("data-story-id")).toBe("story:1");
    expect(surface.getAttribute("data-current-chapter-content-id")).toBe("chapter:1");
    expect(surface.getAttribute("data-current-chapter-version")).toBe("3");
  });

  it("exposes dialogue rules and only links to the verified story hub", () => {
    const handlers = callbacks();
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model({ workspacePointer: { workspaceId: "workspace:1", storyId: "story/1", currentChapter: { contentId: "chapter:1", version: 3 } } })}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-story-hub-link").getAttribute("href")).toBe("/stories/story%2F1");
    fireEvent.click(screen.getByTestId("room-v6-dialogue-rules"));
    expect(screen.getByTestId("room-v6-dialogue-rules-panel").getAttribute("role")).toBe("dialog");
    expect(screen.getByTestId("room-v6-dialogue-rules-panel").textContent).toContain("不是正文");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("room-v6-dialogue-rules-panel")).toBeNull();

    rerender(<RoomUiPresentationalSurface model={model()} {...handlers} />);
    const unavailableStoryLink = screen.getByTestId("room-v6-story-hub-link") as HTMLButtonElement;
    expect(unavailableStoryLink.tagName).toBe("BUTTON");
    expect(unavailableStoryLink.disabled).toBe(true);
  });

  it("renders the complete conversation by default and follows new messages only while near the latest one", () => {
    const base = model();
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: `history-${index + 1}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      kind: "conversation" as const,
      text: `历史消息 ${index + 1}`,
      createdAt: `2026-08-09T00:00:0${index}.000Z`,
    }));
    const withMessages = (nextMessages: typeof messages) => model({
      chat: { ...base.chat, messages: nextMessages },
    });
    const { rerender } = render(
      <RoomUiPresentationalSurface model={withMessages(messages)} {...callbacks()} />,
    );

    const list = screen.getByTestId("room-v6-messages");
    expect(list.querySelectorAll("[data-message-id]")).toHaveLength(6);
    expect(screen.getByText("历史消息 1")).toBeTruthy();
    expect(screen.getByText("历史消息 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /上下文/ })).toBeNull();

    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.scrollTop = 0;
    rerender(
      <RoomUiPresentationalSurface
        model={withMessages([...messages, { ...messages[0], id: "history-7", text: "历史消息 7" }])}
        {...callbacks()}
      />,
    );
    expect(list.scrollTop).toBe(600);

    list.scrollTop = 0;
    fireEvent.scroll(list);
    rerender(
      <RoomUiPresentationalSurface
        model={withMessages([
          ...messages,
          { ...messages[0], id: "history-7", text: "历史消息 7" },
          { ...messages[1], id: "history-8", text: "历史消息 8" },
        ])}
        {...callbacks()}
      />,
    );
    expect(list.scrollTop).toBe(0);
  });

  it("shows only server-verified conversation and creative-job runtimes", () => {
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model({
          progress: {
            roomContextProgress: "writing",
            creativeJob: {
              taskId: "task-1",
              requestId: "request-1",
              kind: "chapter_draft",
              status: "running",
              progress: 42,
              stateVersion: 2,
              route: {
                provider: "deepseek",
                model: "deepseek-v4-flash",
                profileId: "profile-creative",
                fallbackApplied: false,
              },
            },
            source: "persisted_story_truth",
          },
          modelRuntime: {
            conversation: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              profileId: "profile-chat",
              source: "chat_attestation",
            },
            creativeJob: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              source: "story_truth",
            },
          },
        })}
        {...callbacks()}
      />,
    );

    expect(screen.getByTestId("room-v6-conversation-runtime").textContent).toContain("deepseek-v4-flash");
    expect(screen.getByTestId("room-v6-conversation-runtime").getAttribute("data-runtime-source")).toBe("chat_attestation");
    expect(screen.getByTestId("room-v6-creative-job-runtime").textContent).toContain("deepseek-v4-flash");
    expect(screen.getByTestId("room-v6-creative-job-runtime").getAttribute("data-runtime-source")).toBe("story_truth");

    rerender(<RoomUiPresentationalSurface model={model()} {...callbacks()} />);
    expect(screen.queryByTestId("room-v6-conversation-runtime")).toBeNull();
    expect(screen.queryByTestId("room-v6-creative-job-runtime")).toBeNull();
  });

  it("grows the composer shell with multiline input instead of spilling text outside it", () => {
    render(<RoomUiPresentationalSurface model={model()} {...callbacks()} />);

    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    const shell = screen.getByTestId("room-v6-composer-shell");
    expect(shell.getAttribute("data-composer-expanded")).toBe("false");
    Object.defineProperty(composer, "scrollHeight", { configurable: true, get: () => 180 });

    fireEvent.change(composer, {
      target: { value: "是".repeat(180) },
    });

    expect(shell.getAttribute("data-composer-expanded")).toBe("true");
    expect(shell.getAttribute("data-composer-overflow")).toBe("true");
    expect(shell.style.getPropertyValue("--composer-content-height")).toBe(composer.style.height);
    expect(Number.parseFloat(composer.style.height)).toBeGreaterThan(0);
    expect(Number.parseFloat(composer.style.height)).toBeLessThan(180);
  });

  it("renders submitted acknowledgement as status, never as正文", () => {
    const handlers = callbacks();
    render(<RoomUiPresentationalSurface model={model()} {...handlers} />);

    expect(screen.queryByText("fixture text must never be rendered as正文")).toBeNull();
    expect(screen.getByText("已接单，后台处理中；这不是正文。")).toBeTruthy();
  });

  it("keeps composer DOM controlled and grows it without a visible scrollbar", () => {
    const handlers = callbacks();
    render(<RoomUiPresentationalSurface model={model()} {...handlers} />);
    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    const initialHeight = composer.getAttribute("style") ?? "";
    Object.defineProperty(composer, "scrollHeight", { configurable: true, get: () => 180 });
    fireEvent.change(composer, { target: { value: "a".repeat(240) } });

    expect(composer.getAttribute("style")).not.toBe(initialHeight);
    expect(screen.getByTestId("room-v6-composer-shell").getAttribute("data-composer-overflow")).toBe("true");
    expect(composer.disabled).toBe(false);
    fireEvent.click(screen.getByTestId("room-v6-suggestion-1"));
    expect(handlers.onFillComposer).toHaveBeenCalledWith("聊聊你现在的状态，以及最想继续做的事。");
    expect(handlers.onProjectionAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("room-v6-suggestion-2"));
    expect(handlers.onFillComposer).toHaveBeenCalledWith("我想先歇一会儿，喝杯咖啡，再决定接下来做什么。");
    fireEvent.click(screen.getByTestId("room-v6-suggestion-3"));
    expect(handlers.onFillComposer).toHaveBeenCalledWith("我有一个故事灵感，想先和你聊聊。");
    expect(handlers.onFillComposer).toHaveBeenCalledTimes(3);
    expect(handlers.onProjectionAction).not.toHaveBeenCalled();
  });

  it("splits the right rail into life and creative groups with fail-closed writing action", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({ task: { projection: null } })}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-suggestion-group-life").textContent).toBe("生活");
    expect(screen.getByTestId("room-v6-suggestion-group-creative").textContent).toBe("创作");
    expect(screen.getByTestId("room-v6-suggestion-group-life").style.getPropertyValue("--internal-width")).toBe("15%");
    expect(screen.getByTestId("room-v6-suggestion-group-creative").style.getPropertyValue("--internal-y")).toBe("51.2%");
    const cards = screen.getAllByTestId(/^room-v6-suggestion-\d+$/);
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.getAttribute("data-card-group"))).toEqual([
      "life", "life", "creative", "creative",
    ]);
    expect(cards.map((card) => card.getAttribute("data-card-layout-layer"))).toEqual([
      "suggestion-card-life-now",
      "suggestion-card-life-break",
      "suggestion-card-creative-spark",
      "suggestion-card-creative-writing",
    ]);
    expect(cards[0].style.getPropertyValue("--internal-width")).toBe("92%");
    expect(cards[0].style.getPropertyValue("--suggestion-title-scale")).toBe("1");
    expect(cards[0].style.getPropertyValue("--suggestion-detail-line-height")).toBe("1.18");
    expect(cards.slice(0, 3).map((card) => card.getAttribute("data-suggestion-kind"))).toEqual([
      "composer_preset", "composer_preset", "composer_preset",
    ]);
    expect(cards[1].querySelector("strong")?.textContent).toBe("歇一会儿");
    expect(cards[1].querySelector("small")?.textContent).toBe("把休息意图填入聊天框，不进入正式写作");
    expect(cards[3].getAttribute("data-suggestion-kind")).toBe("projection_action");
    expect((cards[3] as HTMLButtonElement).disabled).toBe(true);
    expect(cards[3].getAttribute("data-action-code")).toBeNull();
    const guideLibraryTrigger = screen.getByTestId("room-v6-suggestion-guide-library");
    expect(guideLibraryTrigger).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "打开指南库" })).toHaveLength(1);
    expect(guideLibraryTrigger.style.getPropertyValue("--internal-width")).toBe("7.8%");
    expect(guideLibraryTrigger.style.getPropertyValue("--internal-height")).toBe("8.5%");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    fireEvent.click(cards[2]);
    expect(handlers.onFillComposer).toHaveBeenNthCalledWith(1, "聊聊你现在的状态，以及最想继续做的事。");
    expect(handlers.onFillComposer).toHaveBeenNthCalledWith(2, "我想先歇一会儿，喝杯咖啡，再决定接下来做什么。");
    expect(handlers.onFillComposer).toHaveBeenNthCalledWith(3, "我有一个故事灵感，想先和你聊聊。");
    expect(handlers.onProjectionAction).not.toHaveBeenCalled();
  });

  it("opens one local-only guide library without sending or creating a task", () => {
    const handlers = callbacks();
    render(<RoomUiPresentationalSurface model={model({ task: { projection: null } })} {...handlers} />);

    fireEvent.click(screen.getByTestId("room-v6-suggestion-guide-library"));
    expect(screen.getByTestId("room-v6-guide-library").getAttribute("role")).toBe("dialog");
    expect(screen.getByRole("tab", { name: "文笔指南" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "剧情指南" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "我的模板" })).toBeTruthy();
    expect(screen.getByTestId("room-v6-guide-library").textContent).toContain("仅此浏览器 / 本机草稿");
    expect(screen.getByTestId("room-v6-guide-library").textContent).toContain("复制到我的模板");
    expect(handlers.onSendMessage).not.toHaveBeenCalled();
    expect(handlers.onProjectionAction).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("room-v6-guide-library")).toBeNull();
  });

  it("changes the writing card from start to continue only with a verified draft", () => {
    const handlers = callbacks();
    const { rerender } = render(<RoomUiPresentationalSurface model={model()} {...handlers} />);
    expect(screen.getByTestId("room-v6-suggestion-4").textContent).toContain("开始写作");
    expect(screen.getByTestId("room-v6-suggestion-4").getAttribute("data-action-code")).toBe("correct_understanding");
    fireEvent.click(screen.getByTestId("room-v6-suggestion-4"));
    expect(handlers.onProjectionAction).toHaveBeenCalledWith(expect.objectContaining({ code: "correct_understanding" }));

    const draftReady = {
      contentId: "draft:1",
      kind: "opening" as const,
      status: "draft" as const,
      version: 2,
      characterCount: 100,
      preview: "一段已核验的草稿。",
      feedback: null,
      feedbackState: "idle" as const,
    };
    const continueAction = { code: "open_draft" as const, label: "打开草稿", basedOnVersionId: null };
    rerender(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady,
          task: {
            projection: {
              versionId: "projection-draft",
              status: "draft_ready",
              headline: "草稿已准备好",
              body: "可以继续创作。",
              understanding: null,
              primaryAction: continueAction,
              secondaryActions: [],
            },
          },
        })}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("room-v6-suggestion-4").textContent).toContain("继续创作");
    expect(screen.getByTestId("room-v6-suggestion-4").getAttribute("data-action-code")).toBe("open_draft");
    fireEvent.click(screen.getByTestId("room-v6-suggestion-4"));
    expect(handlers.onProjectionAction).toHaveBeenLastCalledWith(continueAction);
  });

  it("fills a healthy one-action projection rail without leaving a dead card", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({
          task: {
            projection: {
              versionId: "projection-one",
              status: "unavailable",
              headline: "当前先放慢一点",
              body: "正式投影暂时只有一个动作。",
              understanding: null,
              primaryAction: null,
              secondaryActions: [{ code: "return_later", label: "稍后再看", basedOnVersionId: "projection-one" }],
            },
          },
        })}
        {...handlers}
      />,
    );

    expect(screen.getAllByTestId(/^room-v6-suggestion-\d+$/)).toHaveLength(4);
    const projectionCards = screen.getAllByTestId(/^room-v6-suggestion-\d+$/);
    for (const card of projectionCards.slice(0, 3)) {
      expect(card.getAttribute("data-navigation-href")).toBeNull();
      expect((card as HTMLButtonElement).disabled).toBe(false);
    }
    expect(projectionCards.slice(0, 3).map((card) => card.getAttribute("data-suggestion-kind"))).toEqual([
      "composer_preset", "composer_preset", "composer_preset",
    ]);
    expect(projectionCards[3].getAttribute("data-suggestion-kind")).toBe("projection_action");
    expect((projectionCards[3] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId(/^room-v6-suggestion-placeholder-\d+$/)).toBeNull();
    const returnLater = screen.getByTestId("room-v6-projection-action-return_later");
    expect(returnLater.getAttribute("data-action-code")).toBe("return_later");
    fireEvent.click(returnLater);
    expect(handlers.onProjectionAction).toHaveBeenCalledWith(expect.objectContaining({ code: "return_later" }));
    expect(handlers.onFillComposer).not.toHaveBeenCalled();
  });

  it("does not override the compiled desktop camera with a fixed render offset", () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), "app/room/system/room-ui-presentational-surface.module.css"),
      "utf8",
    );

    expect(stylesheet).not.toContain("--surface-render-x");
    expect(stylesheet).not.toContain("translate(4px");
    expect(stylesheet).toContain(".chatContainer");
    expect(stylesheet).toContain("z-index: 40");
    const suggestionsStyle = stylesheet.match(/\.suggestionsContainer \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(suggestionsStyle).toContain("z-index: 50");
    const suggestionCardStyle = stylesheet.match(/\.suggestionCard \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(suggestionCardStyle).toContain("position: absolute");
    expect(suggestionCardStyle).toContain("width: var(--internal-width)");
    expect(suggestionCardStyle).toContain("height: var(--internal-height)");
    expect(suggestionCardStyle).toContain("transform: scale(var(--internal-scale)) rotate(var(--internal-tilt))");
    expect(stylesheet).toContain("pointer-events: none");
    expect(stylesheet).toContain("pointer-events: auto");
    expect(stylesheet).not.toContain("suggestionCardArtStage::before");
    expect(stylesheet).not.toContain("suggestion-shell");
    expect(stylesheet).toContain("text-rendering: geometricPrecision");
    expect(stylesheet).toContain("composer-send-token-olive-brass-v1.webp");
    expect(stylesheet).not.toContain("background: #79502d");
    const draftReaderOverlayStyle = stylesheet.match(/\.draftReaderOverlay \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(draftReaderOverlayStyle).toContain("position: fixed");
    expect(draftReaderOverlayStyle).toContain("rgba(4, 14, 14, .38)");
    const draftReaderPanelStyle = stylesheet.match(/\.draftReaderPanel \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(draftReaderPanelStyle).toContain("width: min(92vw, 88rem)");
    expect(draftReaderPanelStyle).toContain("height: min(88dvh, 60rem)");
    const guideStyle = stylesheet.match(/\.suggestionGuideTrigger \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(guideStyle).toContain("left: var(--internal-x)");
    expect(guideStyle).toContain("width: var(--internal-width)");
    expect(guideStyle).toContain("height: var(--internal-height)");
    expect(guideStyle).toContain("overflow: hidden");
    expect(guideStyle).toContain("white-space: nowrap");
    const groupStyle = stylesheet.match(/\.suggestionGroupLabels span \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(groupStyle).toContain("left: var(--internal-x)");
    expect(groupStyle).toContain("width: var(--internal-width)");
    expect(groupStyle).toContain("height: var(--internal-height)");
  });

  it("makes the send button a real composer submit control only after text is present", () => {
    const handlers = callbacks();
    render(<RoomUiPresentationalSurface model={model()} {...handlers} />);

    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    const sendButton = screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    fireEvent.change(composer, { target: { value: "收到爱吃" } });
    expect(sendButton.disabled).toBe(false);
    fireEvent.click(sendButton);

    expect(handlers.onSendMessage).toHaveBeenCalledWith("收到爱吃");
    expect(composer.value).toBe("");
  });

  it("keeps non-preset projection actions in a separate formal action row", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({
          task: {
            projection: {
              versionId: "projection-actions",
              status: "writing",
              headline: "Formal actions",
              body: "These actions must not be converted into composer presets.",
              understanding: null,
              primaryAction: {
                code: "retry_current_task",
                label: "Retry",
                basedOnVersionId: "projection-actions",
              },
              secondaryActions: [
                { code: "open_draft", label: "Open draft", basedOnVersionId: null },
                { code: "return_later", label: "Return later", basedOnVersionId: null },
              ],
            },
          },
        })}
        {...handlers}
      />,
    );

    for (const code of ["retry_current_task", "open_draft", "return_later"] as const) {
      fireEvent.click(screen.getByTestId(`room-v6-projection-action-${code}`));
    }

    expect(handlers.onProjectionAction).toHaveBeenNthCalledWith(1, expect.objectContaining({
      code: "retry_current_task",
      basedOnVersionId: "projection-actions",
    }));
    expect(handlers.onProjectionAction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      code: "open_draft",
      basedOnVersionId: null,
    }));
    expect(handlers.onProjectionAction).toHaveBeenNthCalledWith(3, expect.objectContaining({
      code: "return_later",
      basedOnVersionId: null,
    }));
    expect(handlers.onFillComposer).not.toHaveBeenCalled();
  });

  it("fails closed for projection actions that are not in the formal writing slice", () => {
    const handlers = callbacks();
    const codes = ["request_revision", "accept_current", "accept_and_continue", "reject_and_rebrief"] as const;
    render(
      <RoomUiPresentationalSurface
        model={model({
          task: {
            projection: {
              versionId: "projection-unwired",
              status: "writing",
              headline: "Formal actions",
              body: "These actions remain visible but unavailable until their worker route exists.",
              understanding: null,
              primaryAction: { code: codes[0], label: codes[0], basedOnVersionId: "projection-unwired" },
              secondaryActions: codes.slice(1).map((code) => ({ code, label: code, basedOnVersionId: "projection-unwired" })),
            },
          },
        })}
        {...handlers}
      />,
    );

    for (const code of codes) {
      const action = screen.getByTestId(`room-v6-projection-action-${code}`) as HTMLButtonElement;
      expect(action.disabled).toBe(true);
      expect(action.getAttribute("aria-disabled")).toBe("true");
      expect(action.getAttribute("data-action-availability")).toBe("unwired");
      expect(action.textContent).toContain("尚未接入正式写作动作");
      fireEvent.click(action);
    }
    expect(handlers.onProjectionAction).not.toHaveBeenCalled();
  });

  it("keeps the right-card icon independent from title text and omits the redundant action footer", () => {
    render(<RoomUiPresentationalSurface model={model()} {...callbacks()} />);

    expect(screen.getByTestId("room-v6-status-copy").style.getPropertyValue("--layout-scale")).toBe("1");
    expect(screen.getByTestId("room-v6-conversation-panel").style.getPropertyValue("--layout-height-factor")).toBe("0.74");
    expect(screen.getByTestId("room-v6-composer-shell").style.getPropertyValue("--layout-height-factor")).toBe("0.2");
    expect(screen.getByTestId("room-v6-suggestions-copy").style.getPropertyValue("--layout-width-factor")).toBe("1");
    expect(screen.getByTestId("room-v6-status-scene").style.getPropertyValue("--internal-y")).toBe("34.36%");
    expect(screen.getByTestId("room-v6-status-needs-primary").children).toHaveLength(2);
    expect(screen.getByTestId("room-v6-status-needs-secondary").children).toHaveLength(2);
    expect(screen.getByTestId("room-v6-suggestion-icon-slot").style.getPropertyValue("--internal-width")).toBe("21.5%");
    expect(screen.getByTestId("room-v6-suggestion-title-slot").style.getPropertyValue("--internal-width")).toBe("82.3%");
    expect(screen.getByTestId("room-v6-suggestion-detail-slot").style.getPropertyValue("--internal-height")).toBe("41.2%");
    expect(screen.queryByTestId("room-v6-suggestion-action-slot")).toBeNull();
    expect(screen.queryByText("装填到聊天框")).toBeNull();
    expect(screen.queryByText("暂不可用")).toBeNull();
  });

  it("renders verified draft feedback when the adapter has matched draft and projection identities", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: {
            contentId: "draft:1",
            kind: "opening",
            status: "draft",
            version: 2,
            characterCount: 168,
            preview: "门外的雨先停了一秒。",
            feedback: {
              summary: "这一稿已经完成一个具体动作。",
              nextStep: "先让小说家汇报这稿。",
              revisionSuggestion: "保留雨声的停顿感。",
            },
            feedbackState: "ready",
          },
        })}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-draft-ready")).toBeTruthy();
    expect(screen.getByTestId("room-v6-draft-feedback-result").textContent).toContain("这一稿已经完成一个具体动作。");
  });

  it("does not render feedback when the adapter has suppressed a stale identity or version", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: {
            contentId: "draft:1",
            kind: "opening",
            status: "draft",
            version: 2,
            characterCount: 168,
            preview: "门外的雨先停了一秒。",
            feedback: null,
            feedbackState: "idle",
          },
        })}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-draft-ready")).toBeTruthy();
    expect(screen.queryByTestId("room-v6-draft-feedback-result")).toBeNull();
  });

  it("renders the verified draft reader as DOM and closes it from the button or Escape", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model()}
        {...handlers}
        draftReader={{
          contentId: "draft:1",
          versionId: "draft:1:2",
          kind: "opening",
          body: "雨声从窗沿落下来。\n\n他没有立刻动笔。",
        }}
      />,
    );

    const reader = screen.getByTestId("room-v6-draft-reader");
    expect(screen.getByTestId("room-v6-presentational-surface").getAttribute("data-draft-reader-open")).toBe("true");
    expect(reader.getAttribute("role")).toBe("dialog");
    expect(reader.getAttribute("aria-modal")).toBe("true");
    expect(reader.getAttribute("data-content-id")).toBe("draft:1");
    expect(reader.getAttribute("data-version-id")).toBe("draft:1:2");
    expect(reader.getAttribute("data-draft-kind")).toBe("opening");
    expect(screen.getByTestId("room-v6-draft-reader-overlay").parentElement).toBe(document.body);
    expect(reader.textContent).toContain("雨声从窗沿落下来。\n\n他没有立刻动笔。");

    fireEvent.click(screen.getByTestId("room-v6-draft-reader-close"));
    expect(handlers.onCloseDraftReader).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handlers.onCloseDraftReader).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("room-v6-draft-reader-return"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps draft feedback status visible for loading, ready, and error", () => {
    const handlers = callbacks();
    const feedback = {
      summary: "summary",
      nextStep: "next",
      revisionSuggestion: null,
    };
    const draft = {
      contentId: "draft:feedback",
      kind: "opening" as const,
      status: "draft" as const,
      version: 2,
      characterCount: 100,
      preview: "preview",
      feedback: null,
      feedbackState: "loading" as const,
    };
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: draft,
        })}
        {...handlers}
      />,
    );

    const status = () => screen.getByTestId("room-v6-draft-feedback-status");
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().getAttribute("data-feedback-state")).toBe("loading");
    expect(status().textContent).toContain("正在获取汇报");

    rerender(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: { ...draft, feedback, feedbackState: "ready" },
        })}
        {...handlers}
      />,
    );
    expect(status().getAttribute("data-feedback-state")).toBe("ready");
    expect(status().textContent).toContain("汇报已收到");

    rerender(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: { ...draft, feedback: null, feedbackState: "error" },
        })}
        {...handlers}
      />,
    );
    expect(status().getAttribute("data-feedback-state")).toBe("error");
    expect(status().textContent).toContain("这次未拿到汇报，草稿状态未改变");
  });

  it("collapses only the current draft result and reopens for a new draft", () => {
    const handlers = callbacks();
    const draft = {
      contentId: "draft:exit",
      kind: "opening" as const,
      status: "draft" as const,
      version: 2,
      characterCount: 80,
      preview: "preview",
      feedback: null,
      feedbackState: "error" as const,
    };
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: draft,
        })}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByTestId("room-v6-draft-card-close"));
    expect(screen.queryByTestId("room-v6-draft-ready")).toBeNull();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("room-v6-presentational-surface")).toBeTruthy();
    expect(screen.getByTestId("room-v6-messages").textContent).toContain("我想把这一句雨声写进来");
    expect(screen.getByTestId("room-v6-messages").textContent).not.toContain("还没有对话，输入一句话开始聊");
    expect(screen.getByTestId("room-v6-composer-submit").getAttribute("type")).toBe("submit");

    rerender(
      <RoomUiPresentationalSurface
        model={model({
          progress: { roomContextProgress: "draft_ready", creativeJob: null, source: "persisted_story_truth" },
          draftReady: { ...draft, contentId: "draft:new", version: 3 },
        })}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("room-v6-draft-ready").textContent).toContain("draft:new");
  });

  it("does not mount a draft reader when no verified draft was supplied", () => {
    render(<RoomUiPresentationalSurface model={model()} {...callbacks()} />);
    expect(screen.queryByTestId("room-v6-draft-reader")).toBeNull();
    expect(screen.getByTestId("room-v6-presentational-surface").getAttribute("data-draft-reader-open")).toBe("false");
  });

  it("keeps the local composer editable during recovery while failing closed for chat actions", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model({
          recovery: { kind: "blocked", message: "当前链路受限。", retryable: false, code: "compliance_blocked" },
          progress: { roomContextProgress: null, creativeJob: null, source: "blocked" },
        })}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("room-v6-recovery")).toBeTruthy();
    expect(screen.queryByTestId("room-v6-draft-ready")).toBeNull();
    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    expect(composer.disabled).toBe(false);
    expect(composer.placeholder).toContain("可先输入，恢复后发送");
    fireEvent.change(composer, { target: { value: "恢复后请继续这一句" } });
    expect(composer.value).toBe("恢复后请继续这一句");
    expect((screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "重试上一句" })).toBeNull();
    const recoveryCards = screen.getAllByTestId(/^room-v6-suggestion-\d+$/) as HTMLButtonElement[];
    expect(recoveryCards).toHaveLength(4);
    for (const card of recoveryCards) {
      expect(card.disabled).toBe(true);
      expect(card.getAttribute("aria-disabled")).toBe("true");
    }
    expect(recoveryCards.slice(0, 3).map((card) => card.getAttribute("data-suggestion-kind"))).toEqual([
      "composer_preset", "composer_preset", "composer_preset",
    ]);
    expect(recoveryCards[3].getAttribute("data-suggestion-kind")).toBe("projection_action");
    expect(screen.queryByTestId(/^room-v6-suggestion-placeholder-\d+$/)).toBeNull();
    const progress = screen.getByTestId("room-v6-progress");
    expect(progress.querySelector('[data-progress-verified="false"]')).toBeTruthy();
    expect(progress.querySelectorAll('[data-progress-step]')).toHaveLength(4);
    expect(progress.querySelectorAll('[data-progress-step][data-active="true"]')).toHaveLength(0);
  });

  it("keeps chat actions disabled until the formal gateway is active", () => {
    const handlers = callbacks();
    render(
      <RoomUiPresentationalSurface
        model={model()}
        gatewayReady={false}
        {...handlers}
      />,
    );

    const surface = screen.getByTestId("room-v6-presentational-surface");
    expect(surface.getAttribute("data-gateway-ready")).toBe("false");
    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    expect(composer.disabled).toBe(false);
    expect(composer.placeholder).toContain("可先输入，连接后发送");
    fireEvent.change(composer, { target: { value: "连接后再发这句" } });
    expect(composer.value).toBe("连接后再发这句");
    expect((screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement).disabled).toBe(true);
    const cards = screen.getAllByTestId(/^room-v6-suggestion-\d+$/) as HTMLButtonElement[];
    expect(cards).toHaveLength(4);
    expect(cards.every((card) => card.disabled)).toBe(true);
    expect(handlers.onSendMessage).not.toHaveBeenCalled();
  });

  it("uses the formal gateway reconnect callback instead of retrying a chat message", () => {
    const handlers = callbacks();
    const onGatewayReconnect = vi.fn();
    render(
      <RoomUiPresentationalSurface
        model={model({
          recovery: {
            kind: "unavailable",
            message: "房间网关暂时没连上。",
            retryable: true,
            code: "provider_unavailable",
          },
          progress: { roomContextProgress: null, creativeJob: null, source: "none" },
        })}
        {...handlers}
        onGatewayReconnect={onGatewayReconnect}
      />,
    );

    expect(screen.getByTestId("room-v6-presentational-surface").getAttribute("data-gateway-action"))
      .toBe("reconnect");
    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    expect(composer.disabled).toBe(false);
    expect(composer.placeholder).toContain("可先输入，恢复后发送");
    fireEvent.change(composer, { target: { value: "重连后仍保留的草稿" } });
    expect(composer.value).toBe("重连后仍保留的草稿");
    expect((screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "重试上一句" })).toBeNull();
    fireEvent.click(screen.getByTestId("room-v6-gateway-reconnect"));
    expect(onGatewayReconnect).toHaveBeenCalledTimes(1);
    expect(handlers.onRetry).not.toHaveBeenCalled();
  });

  it("requires the formal admission acknowledgement before enabling chat actions", () => {
    const handlers = callbacks();
    const onAdmissionAcknowledge = vi.fn();
    render(
      <RoomUiPresentationalSurface
        model={model()}
        {...handlers}
        onAdmissionAcknowledge={onAdmissionAcknowledge}
      />,
    );

    const surface = screen.getByTestId("room-v6-presentational-surface");
    expect(surface.getAttribute("data-gateway-action")).toBe("accept_admission");
    expect(screen.getByTestId("room-v6-admission").getAttribute("role")).toBe("dialog");
    expect(screen.getByText("开始前确认一下")).toBeTruthy();
    const composer = screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    expect(composer.disabled).toBe(false);
    expect(composer.placeholder).toContain("可先输入，确认连接后发送");
    fireEvent.change(composer, { target: { value: "确认后仍保留的草稿" } });
    expect(composer.value).toBe("确认后仍保留的草稿");
    expect((screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("聊聊近况")).toBeTruthy();
    expect(screen.getByText("说个灵感")).toBeTruthy();
    const admissionCards = screen.getAllByTestId(/^room-v6-suggestion-\d+$/) as HTMLButtonElement[];
    expect(admissionCards).toHaveLength(4);
    expect(admissionCards.every((card) => card.disabled)).toBe(true);
    expect(screen.queryByTestId(/^room-v6-suggestion-placeholder-\d+$/)).toBeNull();

    fireEvent.click(screen.getByTestId("room-v6-admission-acknowledge"));
    expect(onAdmissionAcknowledge).toHaveBeenCalledTimes(1);
    expect(handlers.onRetry).not.toHaveBeenCalled();
    expect(handlers.onSendMessage).not.toHaveBeenCalled();
  });

  it("preserves one draft across gateway gates and submits it once after recovery", () => {
    const handlers = callbacks();
    const onAdmissionAcknowledge = vi.fn();
    const onGatewayReconnect = vi.fn();
    const { rerender } = render(
      <RoomUiPresentationalSurface
        model={model()}
        gatewayReady={false}
        {...handlers}
      />,
    );

    const composer = () => screen.getByTestId("room-v6-composer") as HTMLTextAreaElement;
    const send = () => screen.getByTestId("room-v6-composer-submit") as HTMLButtonElement;
    fireEvent.change(composer(), { target: { value: "这段草稿要跨过连接恢复" } });
    expect(composer().disabled).toBe(false);
    expect(send().disabled).toBe(true);

    rerender(
      <RoomUiPresentationalSurface
        model={model()}
        gatewayReady={false}
        {...handlers}
        onAdmissionAcknowledge={onAdmissionAcknowledge}
      />,
    );
    expect(composer().value).toBe("这段草稿要跨过连接恢复");
    expect(composer().disabled).toBe(false);
    expect(send().disabled).toBe(true);

    rerender(
      <RoomUiPresentationalSurface
        model={model({
          recovery: { kind: "unavailable", message: "房间网关暂时没连上。", retryable: true, code: "provider_unavailable" },
          progress: { roomContextProgress: null, creativeJob: null, source: "none" },
        })}
        gatewayReady={false}
        {...handlers}
        onGatewayReconnect={onGatewayReconnect}
      />,
    );
    expect(composer().value).toBe("这段草稿要跨过连接恢复");
    expect(composer().disabled).toBe(false);
    expect(send().disabled).toBe(true);
    fireEvent.click(send());
    expect(handlers.onSendMessage).not.toHaveBeenCalled();

    rerender(
      <RoomUiPresentationalSurface
        model={model()}
        gatewayReady
        {...handlers}
      />,
    );
    expect(composer().value).toBe("这段草稿要跨过连接恢复");
    expect(send().disabled).toBe(false);
    fireEvent.click(send());
    expect(handlers.onSendMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onSendMessage).toHaveBeenCalledWith("这段草稿要跨过连接恢复");
    expect(composer().value).toBe("");
  });
});
