import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PrologueView } from "./prologue-view";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("PrologueView", () => {
  it("uses fixed comic panels and does not call a model during the opening", () => {
    render(<PrologueView />);

    expect(screen.getByText("固定素材 · 选项分支 · 不调用模型")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /修士/ }));
    expect(screen.getByText("从连引气都做不到的凡人开始")).toBeTruthy();
    expect(screen.getByText("ASSET SLOT · cultivator-01")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "揭示下一格" }));
    expect(screen.getByText("护阵、法宝、丹药和退路，一件不少")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "揭示下一格" }));
    expect(screen.getByText("助我破鼎！")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "进入命运事故" }));

    expect(screen.getByText("裂缝图")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByText("大运撞击图")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByText("雷劫失败图")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "画面熄灭" }));

    expect(screen.getByText("……视线缓缓打开。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "启动转生内核" }));
    expect(screen.getByText(/当前长期人格模块尚未命名/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /本座主场/ }));
    fireEvent.click(screen.getByRole("button", { name: /回收站里的开头/ }));
    fireEvent.click(screen.getByRole("button", { name: /嘴贫接近/ }));

    expect(screen.getByText("控制权已移交 · 笔界跃迁系统上线")).toBeTruthy();
    expect(screen.getByText(/模型将在小说家进入书房/)).toBeTruthy();
    expect(screen.getByText(/固定开篇已完成/)).toBeTruthy();
  });

  it("keeps the opening branch choices deterministic for another identity", () => {
    render(<PrologueView />);
    fireEvent.click(screen.getByRole("button", { name: /上班族/ }));
    expect(screen.getByText("所有人都走了，方案还亮着")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "揭示下一格" }));
    expect(screen.getByText("那个被否定的项目通过了")).toBeTruthy();
  });
});
