"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoomUiPresentationalSurfaceProps } from "./room-ui-adapter";
import {
  ROOM_UI_SURFACE_GEOMETRY_V6,
  ROOM_UI_VISUAL_LAYOUT_V6,
  type RoomUiInternalVisualLayerId,
  type RoomUiNestedVisualLayerId,
  type RoomUiPresentationalLayoutOverride,
  type RoomUiVisualGeometry,
  type RoomUiVisualLayerId,
} from "./room-ui-presentational-layout";
import RoomUiPresentationalSurface from "./room-ui-presentational-surface";
import styles from "./room-ui-presentational-editor.module.css";

export const ROOM_UI_PRESENTATIONAL_LAYOUT_STORAGE_KEY = "room-ui-formal-surface:v1";
const STORAGE_KEY = ROOM_UI_PRESENTATIONAL_LAYOUT_STORAGE_KEY;
const LEGACY_STORAGE_KEY = "room-ui-test-v6:calibration:v4";
const SIDE_TEXT_LAYOUT_REVISION = 2;
const MIN_SURFACE_SCALE = 0.3;
const MAX_SURFACE_SCALE = 1.8;

type EditableLayerId =
  | RoomUiVisualLayerId
  | RoomUiNestedVisualLayerId
  | RoomUiInternalVisualLayerId
  | "backdrop";
type EditableLayout = Readonly<{
  sideTextLayoutRevision: number;
  surface: RoomUiVisualGeometry;
  backdrop: RoomUiVisualGeometry;
  composition: Readonly<Record<RoomUiVisualLayerId, RoomUiVisualGeometry>>;
  nested: typeof ROOM_UI_VISUAL_LAYOUT_V6.nested;
  internal: Readonly<Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>>;
}>;

type SelectionRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type PointerGesture = Readonly<{
  pointerId: number;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  geometry: RoomUiVisualGeometry;
  rect: SelectionRect;
  layer: EditableLayerId | null;
}>;

type LegacySnapshot = Readonly<{
  version: 4;
  composition?: Partial<Record<RoomUiVisualLayerId, RoomUiVisualGeometry>>;
  backdrop?: RoomUiVisualGeometry;
  conversation?: RoomUiVisualGeometry;
  composer?: RoomUiVisualGeometry;
  internal?: Partial<Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>>;
}>;

const editableLayers = [
  { id: "backdrop", label: "背景容器", testId: "room-v6-stage-art" },
  { id: "title", label: "顶部书签", testId: "room-v6-title-bookmark" },
  { id: "status", label: "左侧状态卡", testId: "room-v6-status-card" },
  { id: "chat", label: "中央聊天纸", testId: "room-v6-chat-paper" },
  { id: "suggestions", label: "右侧建议栏", testId: "room-v6-suggestions" },
  { id: "progress", label: "底部进度条", testId: "room-v6-progress" },
  { id: "status-copy", label: "左卡文字区", testId: "room-v6-status-copy" },
  { id: "conversation", label: "聊天消息区", testId: "room-v6-conversation-panel" },
  { id: "composer", label: "聊天输入框", testId: "room-v6-composer-shell" },
  { id: "suggestions-copy", label: "右栏文字区", testId: "room-v6-suggestions-copy" },
  { id: "status-identity", label: "左卡身份文字", testId: "room-v6-status-identity" },
  { id: "status-scene", label: "左卡场景横线", testId: "room-v6-status-scene" },
  { id: "status-needs-primary", label: "左卡指标上排", testId: "room-v6-status-needs-primary" },
  { id: "status-needs-secondary", label: "左卡指标下排", testId: "room-v6-status-needs-secondary" },
  { id: "status-mood", label: "左卡心情文字", testId: "room-v6-status-mood" },
  { id: "suggestion-icon", label: "右卡图标槽", testId: "room-v6-suggestion-icon-slot" },
  { id: "suggestion-title", label: "右卡标题槽", testId: "room-v6-suggestion-title-slot" },
  { id: "suggestion-detail", label: "右卡说明槽", testId: "room-v6-suggestion-detail-slot" },
] as const satisfies readonly Readonly<{ id: EditableLayerId; label: string; testId: string }>[];

function cloneDefaultLayout(): EditableLayout {
  return {
    sideTextLayoutRevision: SIDE_TEXT_LAYOUT_REVISION,
    surface: { ...ROOM_UI_SURFACE_GEOMETRY_V6 },
    backdrop: { ...ROOM_UI_VISUAL_LAYOUT_V6.backdrop },
    composition: {
      title: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.title },
      status: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.status },
      chat: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.chat },
      suggestions: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.suggestions },
      progress: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.progress },
    },
    nested: {
      conversation: { ...ROOM_UI_VISUAL_LAYOUT_V6.nested.conversation },
      composer: { ...ROOM_UI_VISUAL_LAYOUT_V6.nested.composer },
      "status-copy": { ...ROOM_UI_VISUAL_LAYOUT_V6.nested["status-copy"] },
      "suggestions-copy": { ...ROOM_UI_VISUAL_LAYOUT_V6.nested["suggestions-copy"] },
    },
    internal: Object.fromEntries(
      Object.entries(ROOM_UI_VISUAL_LAYOUT_V6.internal).map(([key, value]) => [key, { ...value }]),
    ) as unknown as Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validGeometry(value: unknown): value is RoomUiVisualGeometry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["x", "y", "scale", "tilt", "width", "height"].every(
    (key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]),
  );
}

function readSavedLayout(): EditableLayout | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as EditableLayout | null;
    if (!parsed || !validGeometry(parsed.surface) || !parsed.composition) return null;
    const defaults = cloneDefaultLayout();
    const keepSavedSideText = parsed.sideTextLayoutRevision === SIDE_TEXT_LAYOUT_REVISION;
    return {
      ...defaults,
      ...parsed,
      sideTextLayoutRevision: SIDE_TEXT_LAYOUT_REVISION,
      backdrop: validGeometry(parsed.backdrop) ? parsed.backdrop : defaults.backdrop,
      composition: { ...defaults.composition, ...parsed.composition },
      nested: {
        ...defaults.nested,
        ...parsed.nested,
        "status-copy": keepSavedSideText
          ? parsed.nested?.["status-copy"] ?? defaults.nested["status-copy"]
          : defaults.nested["status-copy"],
        "suggestions-copy": keepSavedSideText
          ? parsed.nested?.["suggestions-copy"] ?? defaults.nested["suggestions-copy"]
          : defaults.nested["suggestions-copy"],
      },
      internal: { ...defaults.internal, ...parsed.internal },
    };
  } catch {
    return null;
  }
}

function readLegacyLayout(): EditableLayout | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null") as LegacySnapshot | null;
    if (!parsed || parsed.version !== 4) return null;
    const defaults = cloneDefaultLayout();
    return {
      ...defaults,
      surface: parsed.backdrop && validGeometry(parsed.backdrop)
        ? { ...parsed.backdrop, scale: Number((parsed.backdrop.scale * 1.1).toFixed(6)) }
        : defaults.surface,
      composition: { ...defaults.composition, ...parsed.composition },
      nested: {
        conversation: parsed.conversation ?? defaults.nested.conversation,
        composer: parsed.composer ?? defaults.nested.composer,
        "status-copy": defaults.nested["status-copy"],
        "suggestions-copy": defaults.nested["suggestions-copy"],
      },
      internal: { ...defaults.internal, ...parsed.internal },
    };
  } catch {
    return null;
  }
}

export type RoomUiPresentationalEditorProps = RoomUiPresentationalSurfaceProps & Readonly<{
  fixtureLabel?: string;
}>;

/**
 * Temporary formal-preview bridge used while the user is still calibrating the
 * Surface. It consumes the same-origin saved layout without mounting any editor
 * chrome. The saved values will be compiled into the formal constants when the
 * visual checkpoint is frozen, then this bridge can be removed.
 */
export function RoomUiPresentationalStoredSurface(props: RoomUiPresentationalSurfaceProps) {
  const [visualLayout, setVisualLayout] = useState<EditableLayout | null>(null);

  useEffect(() => {
    const refresh = () => setVisualLayout(readSavedLayout() ?? cloneDefaultLayout());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
    };

    refresh();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Do not flash the older compiled geometry before the same-origin saved
  // calibration has been read on the client.
  if (visualLayout === null) return null;

  return (
    <RoomUiPresentationalSurface
      {...props}
      visualLayout={visualLayout}
      calibrationCamera="desktop"
    />
  );
}

export function RoomUiPresentationalEditor({ fixtureLabel, ...surfaceProps }: RoomUiPresentationalEditorProps) {
  const [layout, setLayout] = useState<EditableLayout>(() => cloneDefaultLayout());
  const [hydrated, setHydrated] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<EditableLayerId | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [saveRevision, setSaveRevision] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef(layout);
  const gestureRef = useRef<PointerGesture | null>(null);
  layoutRef.current = layout;

  useEffect(() => {
    const saved = readSavedLayout();
    if (saved) {
      layoutRef.current = saved;
      setLayout(saved);
    }
    setHydrated(true);
  }, []);

  const visualLayout = useMemo<RoomUiPresentationalLayoutOverride>(() => ({
    surface: layout.surface,
    backdrop: layout.backdrop,
    composition: layout.composition,
    nested: layout.nested,
    internal: layout.internal,
  }), [layout]);

  const saveLayout = useCallback((next = layoutRef.current) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaveRevision((value) => value + 1);
  }, []);

  const targetElement = useCallback(() => {
    if (!hostRef.current) return null;
    if (selectedLayer === null) {
      return hostRef.current.querySelector<HTMLElement>('[data-testid="room-v6-presentational-surface"]');
    }
    const entry = editableLayers.find((candidate) => candidate.id === selectedLayer);
    return entry
      ? hostRef.current.querySelector<HTMLElement>(`[data-testid="${entry.testId}"]`)
      : null;
  }, [selectedLayer]);

  const refreshSelection = useCallback(() => {
    const rect = targetElement()?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      setSelectionRect(null);
      return;
    }
    setSelectionRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }, [targetElement]);

  useEffect(() => {
    if (!hydrated || !editorOpen) return undefined;
    const frame = window.requestAnimationFrame(refreshSelection);
    const element = targetElement();
    const observer = element && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(refreshSelection)
      : null;
    if (element) observer?.observe(element);
    window.addEventListener("resize", refreshSelection);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", refreshSelection);
    };
  }, [editorOpen, hydrated, layout, refreshSelection, selectedLayer, targetElement]);

  const updateSurface = (geometry: RoomUiVisualGeometry) => {
    setLayout((current) => ({ ...current, surface: geometry }));
  };

  const updateComponent = (layer: EditableLayerId, geometry: RoomUiVisualGeometry) => {
    if (layer === "backdrop") {
      setLayout((current) => ({ ...current, backdrop: geometry }));
      return;
    }
    if (layer in layoutRef.current.nested) {
      setLayout((current) => ({
        ...current,
        nested: { ...current.nested, [layer]: geometry },
      }));
      return;
    }
    if (layer in layoutRef.current.internal) {
      setLayout((current) => ({
        ...current,
        internal: { ...current.internal, [layer]: geometry },
      }));
      return;
    }
    setLayout((current) => ({
      ...current,
      composition: { ...current.composition, [layer]: geometry },
    }));
  };

  const selectedGeometry = selectedLayer === null
    ? layout.surface
    : selectedLayer === "backdrop"
      ? layout.backdrop
      : selectedLayer in layout.nested
        ? layout.nested[selectedLayer as RoomUiNestedVisualLayerId]
        : selectedLayer in layout.internal
          ? layout.internal[selectedLayer as RoomUiInternalVisualLayerId]
          : layout.composition[selectedLayer as RoomUiVisualLayerId];

  const beginGesture = (kind: PointerGesture["kind"], event: React.PointerEvent<HTMLElement>) => {
    if (!selectionRect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const geometry = selectedLayer === null
      ? layoutRef.current.surface
      : selectedLayer === "backdrop"
        ? layoutRef.current.backdrop
        : selectedLayer in layoutRef.current.nested
          ? layoutRef.current.nested[selectedLayer as RoomUiNestedVisualLayerId]
          : selectedLayer in layoutRef.current.internal
            ? layoutRef.current.internal[selectedLayer as RoomUiInternalVisualLayerId]
            : layoutRef.current.composition[selectedLayer as RoomUiVisualLayerId];
    gestureRef.current = {
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
      rect: selectionRect,
      layer: selectedLayer,
    };
  };

  const moveGesture = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (gesture.kind === "resize") {
      const factor = Math.max(
        (gesture.rect.width + dx) / Math.max(1, gesture.rect.width),
        (gesture.rect.height + dy) / Math.max(1, gesture.rect.height),
      );
      const next = {
        ...gesture.geometry,
        scale: Number(clamp(gesture.geometry.scale * factor, MIN_SURFACE_SCALE, MAX_SURFACE_SCALE).toFixed(4)),
      };
      if (gesture.layer === null) updateSurface(next);
      else updateComponent(gesture.layer, next);
      return;
    }

    const visualScale = Math.max(0.01, layoutRef.current.surface.scale);
    const next = {
      ...gesture.geometry,
      x: Number((gesture.geometry.x + dx / visualScale).toFixed(2)),
      y: Number((gesture.geometry.y + dy / visualScale).toFixed(2)),
    };
    if (gesture.layer === null) updateSurface(next);
    else updateComponent(gesture.layer, next);
  };

  const endGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    saveLayout();
  };

  const resetToFormal = () => {
    const next = cloneDefaultLayout();
    layoutRef.current = next;
    setLayout(next);
    saveLayout(next);
  };

  const importLegacy = () => {
    const next = readLegacyLayout();
    if (!next) return;
    layoutRef.current = next;
    setLayout(next);
    saveLayout(next);
  };

  const updateSelectedGeometry = (patch: Partial<RoomUiVisualGeometry>) => {
    const next = { ...selectedGeometry, ...patch };
    if (selectedLayer === null) updateSurface(next);
    else updateComponent(selectedLayer, next);
  };

  return (
    <div
      ref={hostRef}
      className={styles.editorHost}
      data-testid="room-v6-presentational-editor"
      data-editor-source="RoomUiPresentationalSurface"
      data-editor-hydrated={hydrated}
      data-editor-panel-collapsed={panelCollapsed}
    >
      <RoomUiPresentationalSurface
        {...surfaceProps}
        visualLayout={visualLayout}
        calibrationCamera="desktop"
        {...(fixtureLabel === undefined ? {} : { visualFixture: fixtureLabel })}
      />

      {hydrated && createPortal(
        <>
      {editorOpen && !panelCollapsed ? (
        <aside className={styles.editorPanel} data-testid="room-v6-editor-panel">
          <div className={styles.editorHeading}>
            <span><strong>正式 Surface 临时编辑器</strong><small>当前直接编辑正式组件，不是复制版</small></span>
            <div className={styles.headingActions}>
              <button
                type="button"
                data-testid="room-v6-editor-collapse"
                onClick={() => setPanelCollapsed(true)}
              >收起</button>
              <button
                type="button"
                onClick={() => {
                  setPanelCollapsed(false);
                  setEditorOpen(false);
                }}
              >完成</button>
            </div>
          </div>
          <div className={styles.layerPicker} data-testid="room-v6-editor-layer-picker">
            <button
              type="button"
              data-testid="room-v6-editor-select-surface"
              data-selected={selectedLayer === null}
              onClick={() => setSelectedLayer(null)}
            >整体 Surface</button>
            {editableLayers.map((entry) => (
              <button
                type="button"
                key={entry.id}
                data-testid={`room-v6-editor-select-${entry.id}`}
                data-selected={selectedLayer === entry.id}
                onClick={() => setSelectedLayer(entry.id)}
              >{entry.label}</button>
            ))}
          </div>
          <div className={styles.readout}>
            <span>{selectedLayer ? editableLayers.find((entry) => entry.id === selectedLayer)?.label : "整体 Surface"}</span>
            <span>缩放 {Math.round(selectedGeometry.scale * 100)}%</span>
            <span>保存 #{saveRevision}</span>
          </div>
          <div className={styles.geometryControls}>
            <label className={styles.scaleControl}>
              <span>整体缩放</span>
              <input
                type="range"
                min={MIN_SURFACE_SCALE}
                max={MAX_SURFACE_SCALE}
                step="0.01"
                value={selectedGeometry.scale}
                onChange={(event) => updateSelectedGeometry({ scale: Number(event.target.value) })}
                onPointerUp={() => saveLayout()}
              />
            </label>
            <label className={styles.scaleControl}>
              <span>横向宽度</span>
              <input
                type="range"
                min="0.2"
                max="2.2"
                step="0.01"
                value={selectedGeometry.width}
                onChange={(event) => updateSelectedGeometry({ width: Number(event.target.value) })}
                onPointerUp={() => saveLayout()}
              />
            </label>
            <label className={styles.scaleControl}>
              <span>纵向高度</span>
              <input
                type="range"
                min="0.2"
                max="2.2"
                step="0.01"
                value={selectedGeometry.height}
                onChange={(event) => updateSelectedGeometry({ height: Number(event.target.value) })}
                onPointerUp={() => saveLayout()}
              />
            </label>
            <label className={styles.scaleControl}>
              <span>旋转角度</span>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.1"
                value={selectedGeometry.tilt}
                onChange={(event) => updateSelectedGeometry({ tilt: Number(event.target.value) })}
                onPointerUp={() => saveLayout()}
              />
            </label>
          </div>
          <div className={styles.quickActions}>
            <button type="button" onClick={() => updateSelectedGeometry({ x: 0, y: 0 })}>位置归零</button>
            <button type="button" onClick={() => updateSelectedGeometry({ scale: Number(clamp(selectedGeometry.scale / 1.05, MIN_SURFACE_SCALE, MAX_SURFACE_SCALE).toFixed(4)) })}>缩小</button>
            <button type="button" onClick={() => updateSelectedGeometry({ scale: Number(clamp(selectedGeometry.scale * 1.05, MIN_SURFACE_SCALE, MAX_SURFACE_SCALE).toFixed(4)) })}>放大</button>
          </div>
          <div className={styles.footerActions}>
            <button type="button" onClick={() => saveLayout()}>立即保存</button>
            <button type="button" onClick={resetToFormal}>恢复正式基线</button>
            <button type="button" onClick={importLegacy}>导入旧 3013 校准</button>
          </div>
        </aside>
      ) : editorOpen ? (
        <button
          type="button"
          className={styles.collapsedButton}
          data-testid="room-v6-editor-expand"
          aria-label="展开编辑器栏目"
          title="展开编辑器栏目"
          onClick={() => setPanelCollapsed(false)}
        >‹</button>
      ) : (
        <button type="button" className={styles.reopenButton} onClick={() => setEditorOpen(true)}>打开正式编辑器</button>
      )}

      {editorOpen && selectionRect && (
        <div
          className={styles.selectionOutline}
          data-testid="room-v6-editor-selection"
          data-selected-layer={selectedLayer ?? "surface"}
          style={selectionRect}
          onPointerDown={(event) => beginGesture("move", event)}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <span>{selectedLayer ? editableLayers.find((entry) => entry.id === selectedLayer)?.label : "整体 Surface"} · 拖动移动</span>
          <button
            type="button"
            className={styles.resizeHandle}
            aria-label="等比缩放当前选择"
            onPointerDown={(event) => beginGesture("resize", event)}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          />
        </div>
      )}
        </>,
        document.body,
      )}
    </div>
  );
}

export default RoomUiPresentationalEditor;
