import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomGuideLibrary } from "./room-guide-library";

const storageKey = "room-guide-library:v1";

describe("RoomGuideLibrary", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the three local-only tabs and previews built-in templates without external actions", () => {
    const onClose = vi.fn();
    render(<RoomGuideLibrary onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭指南库");
    expect(screen.getByRole("tab", { name: "文笔指南" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "剧情指南" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "我的模板" })).toBeTruthy();
    expect(screen.getByText("仅此浏览器 / 本机草稿，尚未进入作品；这里的内容不会发送给模型或创建写作任务。")).toBeTruthy();
    expect(screen.getAllByText("文笔基线｜贴近主角的克制叙述")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "复制到我的模板" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "关闭指南库" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("copies built-ins, creates/edits/deletes mine, and persists a schema-scoped draft", async () => {
    const { unmount } = render(<RoomGuideLibrary onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "复制到我的模板" }));

    expect(screen.getByRole("tab", { name: "我的模板" }).getAttribute("aria-selected")).toBe("true");
    const title = screen.getByLabelText("模板名称") as HTMLInputElement;
    const content = screen.getByLabelText("模板内容") as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "我的克制模板" } });
    fireEvent.change(content, { target: { value: "只写可观察的动作和代价。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存本机模板" }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as {
        schemaVersion: number;
        namespace: string;
        templates: Array<{ title: string; content: string }>;
      };
      expect(stored.schemaVersion).toBe(1);
      expect(stored.namespace).toBe("room-guide-library");
      expect(stored.templates).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: "我的克制模板", content: "只写可观察的动作和代价。" }),
      ]));
    });

    unmount();
    render(<RoomGuideLibrary onClose={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "文笔指南" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "我的模板" }));
    expect(screen.getByRole("button", { name: "我的克制模板" })).toBeTruthy();
    expect((screen.getByLabelText("模板内容") as HTMLTextAreaElement).value).toBe("只写可观察的动作和代价。");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.queryByRole("button", { name: "我的克制模板" })).toBeNull();
  });

  it("fails closed for malformed or old storage and keeps keyboard close available", () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 0, namespace: "wrong", templates: [{ title: "bad" }] }));
    const onClose = vi.fn();
    render(<RoomGuideLibrary onClose={onClose} />);

    fireEvent.click(screen.getByRole("tab", { name: "我的模板" }));
    expect(screen.getByText("还没有本机模板，先新建一个吧。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ 新建模板" }));
    expect(screen.getByLabelText("模板名称")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
