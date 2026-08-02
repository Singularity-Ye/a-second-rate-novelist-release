import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SystemReincarnationFlow, IDENTITIES } from "./reincarnation-flow";
import { createSystemBinding, clearSystemBinding, loadSystemBinding, saveSystemBinding } from "../system/system-layer";

describe("SystemReincarnationFlow Component", () => {
  beforeEach(() => {
    clearSystemBinding();
  });

  it("renders step 1 with the current identity pool and truck accident story", () => {
    render(<SystemReincarnationFlow />);
    expect(IDENTITIES).toHaveLength(13);
    expect(screen.getByText("先选一段人生，再让命运负责撞击")).toBeDefined();
    expect(screen.getAllByText("玄烛剑尊").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("identity-pose-image").getAttribute("src")).toContain("xuanzhu/v1/character-card.webp");
    expect(screen.getByTestId("identity-option-palace")).toBeDefined();
    expect(screen.getByTestId("identity-option-worker")).toBeDefined();
    expect(screen.getByTestId("identity-option-demon")).toBeDefined();

    fireEvent.click(screen.getByTestId("identity-option-demon"));
    expect(screen.getByTestId("identity-pose-placeholder")).toBeDefined();
    expect(screen.getByTestId("identity-option-demon").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("identity-option-xianxia").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("identity-option-xianxia"));
    expect(screen.getByTestId("identity-pose-image")).toBeDefined();
    expect(screen.getByTestId("identity-option-xianxia").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a broken pose reference as a visible empty slot instead of borrowing another identity", () => {
    render(<SystemReincarnationFlow />);

    const poseImage = screen.getByTestId("identity-pose-image");
    fireEvent.error(poseImage);

    expect(screen.queryByTestId("identity-pose-image")).toBeNull();
    expect(screen.getByTestId("identity-pose-placeholder").textContent).toContain("姿态图暂不可用");
  });

  it("keeps the outer order: manga, accident, awakening, personality, host, encounter", () => {
    render(<SystemReincarnationFlow />);

    const gotoStep2Btn = screen.getByTestId("goto-step-2-btn");
    fireEvent.click(gotoStep2Btn);
    expect(screen.getByText(/前身记忆册/)).toBeDefined();
    expect(screen.getByTestId("origin-manga-stage").getAttribute("data-beat-id")).toBe("memory-one");
    expect(screen.getByTestId("origin-manga-stage").getAttribute("data-page-id")).toBe("B1");
    expect(screen.getByTestId("manga-beat-counter").textContent).toBe("1 / 9");

    for (let page = 1; page < 9; page += 1) {
      fireEvent.click(screen.getByTestId("manga-next-btn"));
    }
    expect(screen.getByTestId("origin-manga-stage").getAttribute("data-page-id")).toBe("B9");
    fireEvent.click(screen.getByTestId("manga-next-btn"));
    expect(screen.getByTestId("accident-stage")).toBeDefined();
    expect(screen.getByTestId("accident-stage").getAttribute("data-page-id")).toBe("B10");

    fireEvent.click(screen.getByTestId("accident-next-btn"));
    expect(screen.getByTestId("accident-stage").getAttribute("data-page-id")).toBe("B11");
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    expect(screen.getByTestId("system-awakening")).toBeDefined();

    fireEvent.click(screen.getByTestId("goto-step-5-btn"));
    expect(screen.getByText("三轮人格对话 · 64 型系统口吻矩阵")).toBeDefined();

    fireEvent.click(screen.getByTestId("round1-opt-A"));
    fireEvent.click(screen.getByTestId("round2-opt-B"));
    fireEvent.click(screen.getByTestId("round3-opt-C"));

    expect(screen.getByText("代码 [ABC]")).toBeDefined();

    fireEvent.click(screen.getByTestId("goto-step-6-btn"));
    expect(screen.getByText("搜罗良材璞玉 · 子系统强制锁定")).toBeDefined();

    fireEvent.click(screen.getByTestId("goto-step-7-btn"));
    expect(screen.getByText("空降小说家小屋 · “系统上线”初见")).toBeDefined();
    expect(screen.getByTestId("enter-room-btn")).toBeDefined();
  });

  it("binds the selected identity and personality before entering the formal room", () => {
    render(<SystemReincarnationFlow />);

    fireEvent.click(screen.getByTestId("identity-option-coder"));
    fireEvent.click(screen.getByTestId("goto-step-2-btn"));
    fireEvent.click(screen.getByTestId("manga-next-btn"));
    fireEvent.click(screen.getByTestId("manga-next-btn"));
    fireEvent.click(screen.getByTestId("manga-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("accident-next-btn"));
    fireEvent.click(screen.getByTestId("goto-step-5-btn"));
    fireEvent.click(screen.getByTestId("round1-opt-D"));
    fireEvent.click(screen.getByTestId("round2-opt-C"));
    fireEvent.click(screen.getByTestId("round3-opt-B"));
    fireEvent.click(screen.getByTestId("goto-step-6-btn"));
    fireEvent.click(screen.getByTestId("goto-step-7-btn"));
    fireEvent.click(screen.getByTestId("enter-room-btn"));

    const binding = loadSystemBinding();
    expect(binding?.origin.identityId).toBe("coder");
    expect(binding?.origin.personalityCode).toBe("DCB");
    expect(binding?.origin.bindingStatus).toBe("bound");
    expect(binding?.persona.personaSnapshotId).toBe("persona:coder:DCB");
  });

  it("offers resume or an explicit local reset when a bound snapshot already exists", async () => {
    saveSystemBinding(createSystemBinding({ identity: IDENTITIES[2]!, personalityCode: "DCA", chosenAt: "2026-07-30T00:00:00.000Z" }));

    render(<SystemReincarnationFlow />);

    await waitFor(() => expect(screen.getByTestId("existing-binding-card")).toBeDefined());
    expect(screen.getByTestId("resume-binding-btn")).toBeDefined();
    expect(screen.getByTestId("restart-reincarnation-btn")).toBeDefined();
    expect(screen.getByTestId("existing-binding-card").textContent).toContain("深夜社畜");

    fireEvent.click(screen.getByTestId("restart-reincarnation-btn"));
    expect(screen.queryByTestId("existing-binding-card")).toBeNull();
    expect(loadSystemBinding()).toBeNull();
    expect(screen.getByTestId("identity-option-xianxia")).toBeDefined();
  });
});
