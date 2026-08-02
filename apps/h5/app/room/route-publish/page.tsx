"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  createInitialEditorDraft,
  deserializeEditorDraft,
  EDITOR_SCENE_IDS,
  normalizeEditorDraft,
  type EditorDraft,
  type EditorSceneId,
} from "../geometry-test/route-editor.model";
import { publishEditorDraft } from "./route-draft.adapter";
import type { RoutePublishIssue } from "./contract";

const DRAFT_STORAGE_KEYS: Record<EditorSceneId, string> = {
  study: "route-editor-draft-v2-study",
  bedroom: "route-editor-draft-v2-bedroom",
  "dining-kitchen": "route-editor-draft-v2-dining-kitchen",
  entrance: "route-editor-draft-v2-entrance",
  "terrace-greenery": "route-editor-draft-v3-terrace-greenery",
  attic: "route-editor-draft-v2-attic",
};

function loadDraft(sceneId: EditorSceneId): EditorDraft {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEYS[sceneId]);
    const restored = raw ? normalizeEditorDraft(JSON.parse(raw)) : null;
    return restored?.sceneId === sceneId ? restored : createInitialEditorDraft(sceneId);
  } catch {
    return createInitialEditorDraft(sceneId);
  }
}

function downloadSnapshot(sceneId: string, snapshot: unknown): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `formal-route-snapshot-v1-${sceneId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function issueColor(issue: RoutePublishIssue): string {
  return issue.severity === "error" ? "#b42318" : "#8a5a00";
}

export default function RoutePublishPage() {
  const [sceneId, setSceneId] = useState<EditorSceneId>("terrace-greenery");
  const [draft, setDraft] = useState<EditorDraft>(() => createInitialEditorDraft("terrace-greenery"));
  const [issues, setIssues] = useState<readonly RoutePublishIssue[]>([]);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [notice, setNotice] = useState("这是编辑器草稿 → 正式快照的单向出口；不会自动修改 3000。\n");

  useEffect(() => {
    setDraft(loadDraft(sceneId));
    setIssues([]);
    setSnapshot(null);
    setNotice(`已读取 ${sceneId} 草稿；点击“校验并生成快照”后才会生成导出内容。`);
  }, [sceneId]);

  const routeCount = Object.keys(draft.routes).length;
  const pointCount = Object.keys(draft.pointsById).length;
  const errorCount = useMemo(() => issues.filter((issue) => issue.severity === "error").length, [issues]);

  const publish = () => {
    const result = publishEditorDraft(draft, { publishedAt: new Date().toISOString() });
    setIssues(result.issues);
    if (!result.ok) {
      setSnapshot(null);
      setNotice(`校验未通过：${result.issues.filter((issue) => issue.severity === "error").length} 个阻断问题。`);
      return;
    }
    setSnapshot(result.snapshot);
    setNotice(`校验通过：${Object.keys(result.snapshot.routes).length} 条路线已生成正式快照；尚未写入 3000。`);
  };

  const importDraft = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const imported = deserializeEditorDraft(JSON.parse(await file.text()));
      if (!imported) {
        setNotice("导入失败：文件不是受支持的 route-editor.v2 草稿。 ");
        return;
      }
      setSceneId(imported.sceneId);
      setDraft(imported);
      setIssues([]);
      setSnapshot(null);
      setNotice(`已导入 ${imported.sceneId} 草稿；不会自动保存回浏览器。`);
    } catch {
      setNotice("导入失败：无法解析 JSON 草稿。 ");
    }
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: 28, fontFamily: "system-ui, sans-serif", color: "#1e293b" }}>
      <h1 style={{ marginBottom: 8 }}>路线发布适配器</h1>
      <p style={{ marginTop: 0, color: "#64748b" }}>
        3001 编辑器草稿 → 校验 → formal-route-snapshot.v1。本页只做预检与下载；主编辑器的“发布到正式版”会显式覆盖 3000 消费的唯一当前快照。
      </p>

      <section style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: 16, border: "1px solid #cbd5e1", borderRadius: 12 }}>
        <label>
          场景：{" "}
          <select value={sceneId} onChange={(event) => setSceneId(event.currentTarget.value as EditorSceneId)}>
            {EDITOR_SCENE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          导入编辑器 JSON：{" "}
          <input type="file" accept="application/json,.json" onChange={importDraft} />
        </label>
        <span style={{ color: "#475569" }}>{routeCount} 条路线 · {pointCount} 个点位 · 草稿 v{draft.version}</span>
      </section>

      <section style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={publish}>校验并生成快照</button>
        {snapshot && errorCount === 0
          ? <button type="button" onClick={() => downloadSnapshot(sceneId, snapshot)}>下载正式快照 JSON</button>
          : null}
      </section>

      <p style={{ whiteSpace: "pre-wrap", padding: 12, background: "#f8fafc", borderRadius: 8 }}>{notice}</p>

      {issues.length > 0 ? (
        <section>
          <h2>校验结果</h2>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.path}-${index}`} style={{ color: issueColor(issue), marginBottom: 6 }}>
                [{issue.severity}] {issue.code} · {issue.path}：{issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snapshot ? (
        <section>
          <h2>快照预览</h2>
          <pre style={{ maxHeight: 520, overflow: "auto", padding: 16, background: "#0f172a", color: "#e2e8f0", borderRadius: 10, fontSize: 12 }}>
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
