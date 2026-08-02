import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { SnapshotCardDeck, SAMPLE_SNAPSHOTS } from "./card-deck";

describe("SnapshotCardDeck Component", () => {
  it("renders Tab 1 snapshots gallery by default", () => {
    render(<SnapshotCardDeck />);
    expect(screen.getByText(/街角老字号烧烤摊/)).toBeDefined();
    expect(screen.getByText(/旧书市场废纸堆/)).toBeDefined();
  });

  it("flips snapshot card to view back notes", () => {
    render(<SnapshotCardDeck />);
    const card1 = screen.getByTestId(`snapshot-card-${SAMPLE_SNAPSHOTS[0].id}`);
    fireEvent.click(card1);
    expect(screen.getByText(/老祖朱砂评语：此羊肉串/)).toBeDefined();
  });

  it("switches to Tab 2 mail & interacts with stamp and shredder", () => {
    render(<SnapshotCardDeck />);
    const mailTab = screen.getByTestId("tab-mail");
    fireEvent.click(mailTab);

    expect(screen.getByText(/第一文坛出版社 · 退稿通知/)).toBeDefined();

    // Stamp interaction
    const stampBtn = screen.getByTestId("stamp-btn");
    fireEvent.click(stampBtn);
    expect(screen.getByText(/已 阅/)).toBeDefined();

    // Shredder interaction
    const shredBtn = screen.getByTestId("shred-btn");
    fireEvent.click(shredBtn);
    expect(screen.getByText(/灵气 \+50/)).toBeDefined();
  });

  it("switches to Tab 3 system soul stance deck", () => {
    render(<SnapshotCardDeck />);
    const soulTab = screen.getByTestId("tab-soul");
    fireEvent.click(soulTab);

    expect(screen.getByText("⚡ 修仙老祖 · 主系统灵魂姿态")).toBeDefined();
    expect(screen.getByText("代码 [BBB]")).toBeDefined();
  });
});
