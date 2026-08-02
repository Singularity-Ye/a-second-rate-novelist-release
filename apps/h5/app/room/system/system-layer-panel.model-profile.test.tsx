import type {
  VnextModelProfileId,
  VnextModelProfileSettings,
  VnextModelPurpose,
} from "@erliu/shared-contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  acceptExperienceAdmission: vi.fn(),
  bootstrapExperienceSession: vi.fn(),
  readExperienceDraft: vi.fn(),
  readExperienceProjection: vi.fn(),
  readModelProfileSettings: vi.fn(),
  setModelPreference: vi.fn(),
}));

vi.mock("../../lib/experience-api", () => ({
  acceptExperienceAdmission: apiMocks.acceptExperienceAdmission,
  bootstrapExperienceSession: apiMocks.bootstrapExperienceSession,
  readExperienceDraft: apiMocks.readExperienceDraft,
  readExperienceProjection: apiMocks.readExperienceProjection,
}));

vi.mock("./model-profile-api", () => ({
  readModelProfileSettings: apiMocks.readModelProfileSettings,
  setModelPreference: apiMocks.setModelPreference,
}));

import { SystemLayerPanel } from "./system-layer-panel";

const projection = {
  versionId: "projection:model-profile-test",
  status: "available",
  headline: "小韩在这里",
  body: "把你想看的故事直接告诉他。",
  understanding: null,
  primaryAction: { code: "submit_intent", label: "说说想看的故事" },
  secondaryActions: [],
} as const;

function modelSettings(input?: {
  readonly conversationProfileId?: VnextModelProfileId;
  readonly conversationRevision?: number;
  readonly analysisProfileId?: VnextModelProfileId;
  readonly analysisRevision?: number;
}): VnextModelProfileSettings {
  return {
    catalogVersion: "v1",
    profiles: [
      {
        id: "deepseek",
        label: "DeepSeek",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
      {
        id: "gpt",
        label: "GPT",
        provider: null,
        model: null,
        purposes: ["conversation", "analysis"],
        status: "not_configured",
        streaming: true,
      },
      {
        id: "gemini",
        label: "Gemini",
        provider: "google",
        model: "gemini-flash",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
      {
        id: "grok",
        label: "Grok",
        provider: "xai",
        model: "grok-fast",
        purposes: ["conversation", "analysis"],
        status: "available",
        streaming: true,
      },
    ],
    preferences: {
      conversation: {
        purpose: "conversation",
        profileId: input?.conversationProfileId ?? "deepseek",
        revision: input?.conversationRevision ?? 2,
        source: "stored",
        available: true,
      },
      analysis: {
        purpose: "analysis",
        profileId: input?.analysisProfileId ?? "grok",
        revision: input?.analysisRevision ?? 9,
        source: "stored",
        available: true,
      },
    },
  };
}

function selectPreference(
  settings: VnextModelProfileSettings,
  input: {
    readonly purpose: VnextModelPurpose;
    readonly profileId: VnextModelProfileId;
    readonly expectedRevision: number;
  },
): VnextModelProfileSettings {
  const current = settings.preferences[input.purpose];
  if (current.revision !== input.expectedRevision) {
    throw new Error("model_preference_conflict");
  }
  if (input.purpose === "conversation") {
    return {
      ...settings,
      preferences: {
        conversation: {
          purpose: "conversation",
          profileId: input.profileId,
          revision: current.revision + 1,
          source: "stored",
          available: true,
        },
        analysis: settings.preferences.analysis,
      },
    };
  }
  return {
    ...settings,
    preferences: {
      conversation: settings.preferences.conversation,
      analysis: {
        purpose: "analysis",
        profileId: input.profileId,
        revision: current.revision + 1,
        source: "stored",
        available: true,
      },
    },
  };
}

function renderPanel() {
  return render(
    <SystemLayerPanel
      observation={{
        sceneLabel: "书房",
        activityLabel: "study-writing",
        focus: 72,
        fatigue: 20,
        inspiration: 48,
        emotionalLoad: 18,
      }}
    />,
  );
}

async function openModelPicker() {
  renderPanel();
  const toggle = await screen.findByTestId("system-model-picker-toggle");
  await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(toggle);
  return screen.findByTestId("system-model-picker");
}

function purposeSection(label: "对话与轻写作" | "书源与长文分析") {
  const heading = screen.getByText(label);
  const section = heading.closest("div");
  if (section === null) throw new Error(`missing purpose section: ${label}`);
  return section;
}

function profileButton(
  purposeLabel: "对话与轻写作" | "书源与长文分析",
  profileLabel: "DeepSeek" | "GPT" | "Gemini" | "Grok",
) {
  return within(purposeSection(purposeLabel)).getByRole("button", {
    name: new RegExp(profileLabel, "u"),
  }) as HTMLButtonElement;
}

describe("SystemLayerPanel model profile picker", () => {
  let serverSettings: VnextModelProfileSettings;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    serverSettings = modelSettings();
    apiMocks.bootstrapExperienceSession.mockResolvedValue({
      status: "active",
      projection,
    });
    apiMocks.readExperienceProjection.mockResolvedValue(projection);
    apiMocks.readModelProfileSettings.mockImplementation(async () => serverSettings);
    apiMocks.setModelPreference.mockImplementation(async (input: {
      purpose: VnextModelPurpose;
      profileId: VnextModelProfileId;
      expectedRevision: number;
    }) => {
      serverSettings = selectPreference(serverSettings, input);
      return serverSettings;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps an unconfigured provider visible but disabled for both purposes", async () => {
    await openModelPicker();

    expect(apiMocks.readModelProfileSettings).toHaveBeenCalledTimes(1);
    const gptButtons = screen.getAllByRole("button", { name: /GPT/u }) as HTMLButtonElement[];
    expect(gptButtons).toHaveLength(2);
    for (const button of gptButtons) {
      expect(button.textContent).toContain("未配置");
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(apiMocks.setModelPreference).not.toHaveBeenCalled();
  });

  it("does not display a successful switch or change selection when saving fails", async () => {
    apiMocks.setModelPreference.mockRejectedValueOnce(new Error("model_preference_conflict"));
    await openModelPicker();

    fireEvent.click(profileButton("对话与轻写作", "Gemini"));

    await screen.findByText(/模型选择没有保存，目录已重新核对/u);
    expect(apiMocks.setModelPreference).toHaveBeenCalledWith({
      purpose: "conversation",
      profileId: "gemini",
      expectedRevision: 2,
    });
    expect(apiMocks.readModelProfileSettings).toHaveBeenCalledTimes(2);
    expect(profileButton("对话与轻写作", "DeepSeek").getAttribute("data-selected")).toBe("true");
    expect(profileButton("对话与轻写作", "Gemini").getAttribute("data-selected")).toBe("false");
    expect(screen.queryByText(/对话模型已切换/u)).toBeNull();
  });

  it("updates conversation and analysis independently with their own purpose and revision", async () => {
    await openModelPicker();

    fireEvent.click(profileButton("对话与轻写作", "Gemini"));
    await waitFor(() => {
      expect(profileButton("对话与轻写作", "Gemini").getAttribute("data-selected")).toBe("true");
    });
    expect(apiMocks.setModelPreference).toHaveBeenNthCalledWith(1, {
      purpose: "conversation",
      profileId: "gemini",
      expectedRevision: 2,
    });
    expect(profileButton("书源与长文分析", "Grok").getAttribute("data-selected")).toBe("true");

    fireEvent.click(profileButton("书源与长文分析", "DeepSeek"));
    await waitFor(() => {
      expect(profileButton("书源与长文分析", "DeepSeek").getAttribute("data-selected")).toBe("true");
    });
    expect(apiMocks.setModelPreference).toHaveBeenNthCalledWith(2, {
      purpose: "analysis",
      profileId: "deepseek",
      expectedRevision: 9,
    });
    expect(profileButton("对话与轻写作", "Gemini").getAttribute("data-selected")).toBe("true");

    const submittedInputs = apiMocks.setModelPreference.mock.calls.map(([input]) => input);
    expect(submittedInputs).toEqual([
      { purpose: "conversation", profileId: "gemini", expectedRevision: 2 },
      { purpose: "analysis", profileId: "deepseek", expectedRevision: 9 },
    ]);
    expect(submittedInputs.every((input) => {
      const keys = Object.keys(input as Record<string, unknown>).sort();
      return keys.join(",") === "expectedRevision,profileId,purpose";
    })).toBe(true);
  });
});
