"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./room-guide-library.module.css";

const STORAGE_KEY = "room-guide-library:v1";
const STORAGE_NAMESPACE = "room-guide-library";
const STORAGE_SCHEMA_VERSION = 1;

type GuideCategory = "style" | "story";
type GuideTab = GuideCategory | "mine";

type GuideTemplate = Readonly<{
  id: string;
  category: GuideCategory;
  title: string;
  content: string;
}>;

type StoredGuideLibrary = Readonly<{
  schemaVersion: number;
  namespace: string;
  templates: readonly GuideTemplate[];
}>;

const builtInTemplates = [
  {
    id: "builtin-style-baseline-v1",
    category: "style",
    title: "文笔基线｜贴近主角的克制叙述",
    content: "叙述视角：第三人称，贴近主角的观察和判断。\n叙述距离：让判断通过动作、细节和选择表现，不直接解释主角聪明。\n语言质地：简洁、利落、克制；冲突时短句增多，异象与反转时适当抬升。\n对白方式：短对白、少量打断和留白；配角各有说话习惯，不替作者讲设定。\n描写重点：动作、身体反应、环境变化、人物关系和规则代价。\n避免：连续华丽比喻、解释性旁白、模型腔对白、重复口头禅和空泛的情绪判断。",
  },
  {
    id: "builtin-style-light-cultivation-v1",
    category: "style",
    title: "文笔基线｜轻喜剧修仙",
    content: "叙述保持清楚、轻快和有动作感；笑点来自人物认真处理荒谬处境的反差。\n不要把危险、受伤或人物困境本身当作笑话。\n对白短而有目的，吐槽少而准，不让所有角色共享同一种口头禅。\n关键规则和代价必须写清楚，幽默不能替代冲突、选择或局面变化。\n收束时保留人物关系或目标的真实变化，不用连续玩笑冲淡余波。",
  },
  {
    id: "builtin-story-director-v1",
    category: "story",
    title: "剧情指南｜当前剧情导演单",
    content: "本次写作：开篇 / 续写 / 改写 / 扩写\n承接位置：接哪一章、哪一段或哪个已接受正文\n这一段的核心事件：\n主角此刻想要：\n阻力与阻力现在出现的原因：\n开场切口：从哪个动作、异常、危险或对白开始\n必须发生：1.  2.  3.\n局面如何升级：\n主角如何改变局面：\n爽点 / 情绪兑现：\n代价：谁或什么必须付出代价\n结尾留下：具体物件、名字、期限、承诺、反转或失去的退路\n不要出现：\n本场节奏与篇幅：",
  },
  {
    id: "builtin-story-outline-v1",
    category: "story",
    title: "剧情指南｜作品长期方向",
    content: "作品类型：\n一句话故事：\n读者持续期待的感受：\n主角长期想要什么：\n主角的矛盾或缺陷：\n长期主线冲突：\n重要关系：\n不能轻易违反的世界规则与代价：\n暂时不能揭开的秘密：\n希望作品最终留下的核心变化：\n这份长期方向只提供创作参考，不是正文 Canon。",
  },
] as const satisfies readonly GuideTemplate[];

type BuiltInTemplateId = (typeof builtInTemplates)[number]["id"];

function isGuideCategory(value: unknown): value is GuideCategory {
  return value === "style" || value === "story";
}

function isGuideTemplate(value: unknown): value is GuideTemplate {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<GuideTemplate>;
  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && isGuideCategory(candidate.category)
    && typeof candidate.title === "string"
    && typeof candidate.content === "string";
}

function readUserTemplates(): GuideTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as Partial<StoredGuideLibrary>;
    if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION
      || parsed.namespace !== STORAGE_NAMESPACE
      || !Array.isArray(parsed.templates)
      || !parsed.templates.every(isGuideTemplate)) {
      return [];
    }
    return parsed.templates.map((template) => ({ ...template }));
  } catch {
    return [];
  }
}

function makeUserId() {
  return `user-guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type RoomGuideLibraryProps = Readonly<{
  onClose: () => void;
}>;

export function RoomGuideLibrary({ onClose }: RoomGuideLibraryProps) {
  const [tab, setTab] = useState<GuideTab>("style");
  const [userTemplates, setUserTemplates] = useState<GuideTemplate[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedBuiltInId, setSelectedBuiltInId] = useState<BuiltInTemplateId>(
    builtInTemplates[0].id,
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUserTemplates(readUserTemplates());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!storageReady || typeof window === "undefined") return;
    const payload: StoredGuideLibrary = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      namespace: STORAGE_NAMESPACE,
      templates: userTemplates,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // A private browsing quota failure must not block room input or closing the library.
    }
  }, [storageReady, userTemplates]);

  useEffect(() => {
    if (tab !== "mine") return;
    const template = selectedUserId === null
      ? userTemplates[0]
      : userTemplates.find((candidate) => candidate.id === selectedUserId);
    if (template === undefined) return;
    if (selectedUserId !== template.id) setSelectedUserId(template.id);
    if (selectedUserId === null) {
      setDraftTitle(template.title);
      setDraftContent(template.content);
    }
  }, [selectedUserId, tab, userTemplates]);

  const visibleBuiltIns = useMemo(
    () => builtInTemplates.filter((template) => template.category === tab),
    [tab],
  );
  const selectedBuiltIn = builtInTemplates.find((template) => template.id === selectedBuiltInId)
    ?? visibleBuiltIns[0]
    ?? builtInTemplates[0];
  const selectedUser = userTemplates.find((template) => template.id === selectedUserId)
    ?? userTemplates[0]
    ?? null;

  const selectUserTemplate = (template: GuideTemplate) => {
    setSelectedUserId(template.id);
    setDraftTitle(template.title);
    setDraftContent(template.content);
  };

  const selectTab = (nextTab: GuideTab) => {
    setTab(nextTab);
    if (nextTab === "mine" && selectedUser === null) {
      setSelectedUserId(null);
      setDraftTitle("");
      setDraftContent("");
    }
  };

  const copyBuiltIn = (template: GuideTemplate) => {
    const copy: GuideTemplate = {
      ...template,
      id: makeUserId(),
      title: `${template.title}（我的副本）`,
    };
    setUserTemplates((current) => [...current, copy]);
    selectUserTemplate(copy);
    setTab("mine");
  };

  const createTemplate = () => {
    const template: GuideTemplate = {
      id: makeUserId(),
      category: "style",
      title: "未命名指南",
      content: "",
    };
    setUserTemplates((current) => [...current, template]);
    selectUserTemplate(template);
    setTab("mine");
  };

  const saveTemplate = () => {
    if (selectedUser === null) return;
    const nextTemplate: GuideTemplate = {
      ...selectedUser,
      title: draftTitle.trim() || "未命名指南",
      content: draftContent,
    };
    setUserTemplates((current) => current.map((template) => (
      template.id === nextTemplate.id ? nextTemplate : template
    )));
    setDraftTitle(nextTemplate.title);
  };

  const deleteTemplate = () => {
    if (selectedUser === null) return;
    const remaining = userTemplates.filter((template) => template.id !== selectedUser.id);
    setUserTemplates(remaining);
    const next = remaining[0] ?? null;
    setSelectedUserId(next?.id ?? null);
    setDraftTitle(next?.title ?? "");
    setDraftContent(next?.content ?? "");
  };

  return (
    <div className={styles.backdrop} data-testid="room-v6-guide-library-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className={styles.dialog}
        id="room-v6-guide-library"
        data-testid="room-v6-guide-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-v6-guide-library-title"
      >
        <header className={styles.header}>
          <div>
            <strong id="room-v6-guide-library-title">指南库</strong>
            <p>先决定怎么写，再决定这一段发生什么。</p>
          </div>
          <button ref={closeButtonRef} type="button" className={styles.close} onClick={onClose} aria-label="关闭指南库">
            ×
          </button>
        </header>

        <p className={styles.localOnlyNotice} role="note">
          仅此浏览器 / 本机草稿，尚未进入作品；这里的内容不会发送给模型或创建写作任务。
        </p>

        <div className={styles.tabs} data-testid="room-v6-guide-library-tabs" role="tablist" aria-label="指南类型">
          {(["style", "story", "mine"] as const).map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={styles.tab}
              role="tab"
              aria-selected={tab === tabId}
              aria-controls={`room-v6-guide-library-panel-${tabId}`}
              id={`room-v6-guide-library-tab-${tabId}`}
              onClick={() => selectTab(tabId)}
            >
              {tabId === "style" ? "文笔指南" : tabId === "story" ? "剧情指南" : "我的模板"}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab !== "mine" ? (
            <div
              className={styles.templatePanel}
              id={`room-v6-guide-library-panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`room-v6-guide-library-tab-${tab}`}
            >
              <div className={styles.templateList} data-testid="room-v6-guide-library-template-list" aria-label="内置指南模板">
                {visibleBuiltIns.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.templateListItem}
                    data-selected={template.id === selectedBuiltIn.id}
                    onClick={() => setSelectedBuiltInId(template.id)}
                  >
                    {template.title}
                  </button>
                ))}
              </div>
              <article className={styles.preview} data-testid="room-v6-guide-library-preview">
                <h2>{selectedBuiltIn.title}</h2>
                <pre>{selectedBuiltIn.content}</pre>
                <button type="button" className={styles.primaryAction} onClick={() => copyBuiltIn(selectedBuiltIn)}>
                  复制到我的模板
                </button>
              </article>
            </div>
          ) : (
            <div
              className={styles.templatePanel}
              id="room-v6-guide-library-panel-mine"
              role="tabpanel"
              aria-labelledby="room-v6-guide-library-tab-mine"
            >
              <div className={styles.templateList} data-testid="room-v6-guide-library-template-list" aria-label="我的模板列表">
                <button type="button" className={styles.newTemplate} onClick={createTemplate}>
                  + 新建模板
                </button>
                {userTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.templateListItem}
                    data-selected={template.id === selectedUser?.id}
                    onClick={() => selectUserTemplate(template)}
                  >
                    {template.title}
                  </button>
                ))}
                {userTemplates.length === 0 && <p className={styles.empty}>还没有本机模板，先新建一个吧。</p>}
              </div>
              <article className={styles.editor} data-testid="room-v6-guide-library-editor">
                <label>
                  模板名称
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="例如：克制悬疑文风"
                    disabled={selectedUser === null}
                  />
                </label>
                <label>
                  模板内容
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder="写下可观察、可执行的写法……"
                    rows={10}
                    disabled={selectedUser === null}
                  />
                </label>
                <div className={styles.editorActions} data-testid="room-v6-guide-library-actions">
                  <button type="button" className={styles.primaryAction} onClick={saveTemplate} disabled={selectedUser === null}>
                    保存本机模板
                  </button>
                  <button type="button" className={styles.dangerAction} onClick={deleteTemplate} disabled={selectedUser === null}>
                    删除
                  </button>
                </div>
              </article>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default RoomGuideLibrary;
