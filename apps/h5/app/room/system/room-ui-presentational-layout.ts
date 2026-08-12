import type { CSSProperties } from "react";

export type RoomUiVisualLayerId = "title" | "status" | "chat" | "suggestions" | "progress";
export type RoomUiNestedVisualLayerId =
  | "conversation"
  | "composer"
  | "status-copy"
  | "suggestions-copy";
export type RoomUiInternalVisualLayerId =
  | "status-avatar"
  | "status-identity"
  | "status-scene"
  | "status-needs-primary"
  | "status-needs-secondary"
  | "status-mood"
  | "suggestion-icon"
  | "suggestion-title"
  | "suggestion-detail"
  | "suggestion-guide-library"
  | "suggestion-card-life-now"
  | "suggestion-card-life-break"
  | "suggestion-card-creative-spark"
  | "suggestion-card-creative-writing"
  | "progress-observe-dot"
  | "progress-observe-text"
  | "progress-breakdown-dot"
  | "progress-breakdown-text"
  | "progress-draft-dot"
  | "progress-draft-text"
  | "progress-review-dot"
  | "progress-review-text";

export type RoomUiVisualGeometry = Readonly<{
  x: number;
  y: number;
  scale: number;
  tilt: number;
  width: number;
  height: number;
}>;

export type RoomUiSuggestionCardLayerId =
  | "suggestion-card-life-now"
  | "suggestion-card-life-break"
  | "suggestion-card-creative-spark"
  | "suggestion-card-creative-writing";

export type RoomUiSuggestionCardTypography = Readonly<{
  titleScale: number;
  detailScale: number;
  detailLineHeight: number;
  detailWidth: number;
}>;

type StageSlot = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type VisualLayoutStyle = CSSProperties & Record<`--${string}`, string | number>;

export type RoomUiPresentationalLayoutOverride = Readonly<{
  surface?: RoomUiVisualGeometry;
  backdrop?: RoomUiVisualGeometry;
  composition?: Partial<Readonly<Record<RoomUiVisualLayerId, RoomUiVisualGeometry>>>;
  nested?: Partial<Readonly<Record<RoomUiNestedVisualLayerId, RoomUiVisualGeometry>>>;
  internal?: Partial<Readonly<Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>>>;
  suggestionTypography?: Partial<Readonly<Record<RoomUiSuggestionCardLayerId, RoomUiSuggestionCardTypography>>>;
}>;

function percentage(value: number) {
  return `${Number(value.toFixed(6))}%`;
}

/**
 * Pure presentation geometry compiled from the user-approved 1536 x 1024
 * room composition. This object deliberately has no reference bitmap,
 * fixture state, storage key, route coordinate, or business truth.
 */
export const ROOM_UI_VISUAL_LAYOUT_V6 = {
  stage: { width: 1536, height: 1024 },
  // The approved camera geometry is already compiled into the outer Surface.
  // Keep the inner stage at identity so it fills that Surface exactly instead
  // of applying the editor camera a second time.
  backdrop: { x: 10, y: -18.85, scale: 1, tilt: 0, width: 1, height: 0.84 },
  slots: {
    title: { x: 31.5, y: 2.5, width: 37, height: 16 },
    status: { x: 2.2, y: 20, width: 20, height: 57 },
    chat: { x: 22, y: 18, width: 54, height: 63 },
    suggestions: { x: 77, y: 18, width: 21, height: 75 },
    /* The ui-test progress slot is positioned by the padded room window,
       while the formal surface is the stage itself. These compiled values
       preserve the same measured 1440px stage rectangle without reading an
       editor snapshot at runtime. */
    progress: { x: 18.97, y: 74.18, width: 62.05, height: 23.12 },
  } satisfies Record<RoomUiVisualLayerId, StageSlot>,
  geometry: {
    title: { x: 74.86, y: -3.57, scale: 0.95, tilt: 0, width: 1, height: 1 },
    status: { x: -23.05, y: 35.52, scale: 1.43, tilt: -1.3, width: 1.52, height: 1.37 },
    chat: { x: -6.71, y: 25.86, scale: 1.65, tilt: 0.1, width: 0.69, height: 1.11 },
    suggestions: { x: 7.15, y: 43.53, scale: 1.6148, tilt: 2, width: 0.93, height: 0.78 },
    progress: { x: 34.28, y: -60.19, scale: 1, tilt: 0.2, width: 0.84, height: 0.49 },
  } satisfies Record<RoomUiVisualLayerId, RoomUiVisualGeometry>,
  nested: {
    conversation: { x: 1.29, y: 0.85, scale: 0.8084, tilt: 0, width: 0.97, height: 0.74 },
    composer: { x: 6, y: -15.29, scale: 0.81, tilt: 0, width: 0.98, height: 0.2 },
    "status-copy": { x: 0, y: 0, scale: 1, tilt: 0, width: 1, height: 1 },
    "suggestions-copy": { x: 0, y: 0, scale: 1, tilt: 0, width: 1, height: 1 },
  } satisfies Record<RoomUiNestedVisualLayerId, RoomUiVisualGeometry>,
  internal: {
    "status-avatar": { x: 25.6, y: 14.9, scale: 1, tilt: 0, width: 17.9, height: 14.6 },
    "status-identity": { x: 44.57, y: 16.64, scale: 1, tilt: 0, width: 32, height: 15 },
    "status-scene": { x: 25.14, y: 34.36, scale: 1, tilt: 0, width: 56, height: 7 },
    "status-needs-primary": { x: 25.14, y: 40.43, scale: 1, tilt: 0, width: 56, height: 13 },
    "status-needs-secondary": { x: 25.71, y: 50.22, scale: 1, tilt: 0, width: 56, height: 13 },
    "status-mood": { x: 25.14, y: 63.14, scale: 1, tilt: 0, width: 56, height: 8 },
    "suggestion-icon": { x: 25.09, y: 16.03, scale: 1.5747, tilt: 0, width: 21.5, height: 27 },
    "suggestion-title": { x: 12.23, y: -21.67, scale: 0.8201, tilt: -1.7, width: 82.3, height: 96.5 },
    "suggestion-detail": { x: 22.39, y: 44.82, scale: 0.79, tilt: 0, width: 57.7, height: 41.2 },
    "suggestion-guide-library": { x: 84.2, y: 8.5, scale: 1, tilt: 0, width: 7.8, height: 8.5 },
    "suggestion-card-life-now": { x: 4, y: 0, scale: 1, tilt: 0, width: 92, height: 100 },
    "suggestion-card-life-break": { x: 4, y: 0, scale: 1, tilt: 0, width: 92, height: 100 },
    "suggestion-card-creative-spark": { x: 4, y: 0, scale: 1, tilt: 0, width: 92, height: 100 },
    "suggestion-card-creative-writing": { x: 4, y: 0, scale: 1, tilt: 0, width: 92, height: 100 },
    "progress-observe-dot": { x: 30, y: 43.3, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-observe-text": { x: 26.6, y: 51.7, scale: 1.07, tilt: 0, width: 12.6, height: 9.4 },
    "progress-breakdown-dot": { x: 45.3, y: 43.6, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-breakdown-text": { x: 42.3, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.4 },
    "progress-draft-dot": { x: 60.3, y: 43.5, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-draft-text": { x: 57, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.5 },
    "progress-review-dot": { x: 75.4, y: 43.8, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-review-text": { x: 72.1, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.5 },
  } satisfies Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>,
  suggestionTypography: {
    "suggestion-card-life-now": { titleScale: 1, detailScale: 1, detailLineHeight: 1.18, detailWidth: 100 },
    "suggestion-card-life-break": { titleScale: 1, detailScale: 1, detailLineHeight: 1.18, detailWidth: 100 },
    "suggestion-card-creative-spark": { titleScale: 1, detailScale: 1, detailLineHeight: 1.18, detailWidth: 100 },
    "suggestion-card-creative-writing": { titleScale: 1, detailScale: 1, detailLineHeight: 1.18, detailWidth: 100 },
  } satisfies Record<RoomUiSuggestionCardLayerId, RoomUiSuggestionCardTypography>,
} as const;

/**
 * Final desktop Surface framing copied from the approved 3013 formal-live
 * camera. It is presentation geometry only: formal /room never reads the
 * calibration hash or localStorage at runtime.
 *
 * The approved editor snapshot stored in the user's 127.0.0.1:3000 browser
 * profile is shown at 180% overall scale with the same approved visible
 * frame and an offset of (-126.72px, -31.7px). Compile that final Surface
 * camera directly so formal /room preserves the approved overall size while
 * every child layer grows and moves as one.
 */
export const ROOM_UI_SURFACE_GEOMETRY_V6 = {
  x: -126.72,
  y: -31.7,
  scale: 1.8,
  tilt: 0,
  width: 0.87,
  height: 0.892857,
} satisfies RoomUiVisualGeometry;

function geometryVariables(geometry: RoomUiVisualGeometry): VisualLayoutStyle {
  return {
    "--layout-x": `${geometry.x}px`,
    "--layout-y": `${geometry.y}px`,
    "--layout-scale": String(geometry.scale),
    "--layout-tilt": `${geometry.tilt}deg`,
    "--layout-width-factor": String(geometry.width),
    "--layout-height-factor": String(geometry.height),
  };
}

export function roomUiVisualSlotStyle(
  layer: RoomUiVisualLayerId,
  override?: RoomUiPresentationalLayoutOverride,
): VisualLayoutStyle {
  const slot = ROOM_UI_VISUAL_LAYOUT_V6.slots[layer];
  const geometry = override?.composition?.[layer] ?? ROOM_UI_VISUAL_LAYOUT_V6.geometry[layer];
  return {
    ...geometryVariables(geometry),
    "--slot-x": percentage(slot.x),
    "--slot-y": percentage(slot.y),
    "--slot-width": percentage(slot.width * geometry.width),
    "--slot-height": percentage(slot.height * geometry.height),
  };
}

export function roomUiNestedVisualStyle(
  layer: RoomUiNestedVisualLayerId,
  override?: RoomUiPresentationalLayoutOverride,
): VisualLayoutStyle {
  return geometryVariables(override?.nested?.[layer] ?? ROOM_UI_VISUAL_LAYOUT_V6.nested[layer]);
}

export function roomUiBackdropStyle(override?: RoomUiPresentationalLayoutOverride): VisualLayoutStyle {
  return geometryVariables(override?.backdrop ?? ROOM_UI_VISUAL_LAYOUT_V6.backdrop);
}

export function roomUiSurfaceStyle(override?: RoomUiPresentationalLayoutOverride): VisualLayoutStyle {
  const geometry = override?.surface ?? ROOM_UI_SURFACE_GEOMETRY_V6;
  const stage = ROOM_UI_VISUAL_LAYOUT_V6.stage;
  const flowWidth = geometry.scale * geometry.width;
  const aspectWidth = stage.width * geometry.width;
  const aspectHeight = stage.height * geometry.height;

  return {
    "--surface-layout-x": `${geometry.x}px`,
    "--surface-layout-y": `${geometry.y}px`,
    "--surface-layout-scale": String(geometry.scale),
    "--surface-layout-flow-width": `${Number((flowWidth * 100).toFixed(6))}%`,
    "--surface-layout-aspect-ratio": `${Number(aspectWidth.toFixed(6))} / ${Number(aspectHeight.toFixed(6))}`,
    "--surface-layout-tilt": `${geometry.tilt}deg`,
  };
}

export function roomUiInternalVisualStyle(
  layer: RoomUiInternalVisualLayerId,
  override?: RoomUiPresentationalLayoutOverride,
): VisualLayoutStyle {
  const geometry = override?.internal?.[layer] ?? ROOM_UI_VISUAL_LAYOUT_V6.internal[layer];
  return {
    "--internal-x": percentage(geometry.x),
    "--internal-y": percentage(geometry.y),
    "--internal-width": percentage(geometry.width),
    "--internal-height": percentage(geometry.height),
    "--internal-scale": String(geometry.scale),
    "--internal-tilt": `${geometry.tilt}deg`,
  };
}

export function roomUiSuggestionTypographyStyle(
  layer: RoomUiSuggestionCardLayerId,
  override?: RoomUiPresentationalLayoutOverride,
): VisualLayoutStyle {
  const typography = override?.suggestionTypography?.[layer] ?? ROOM_UI_VISUAL_LAYOUT_V6.suggestionTypography[layer];
  return {
    "--suggestion-title-scale": String(typography.titleScale),
    "--suggestion-detail-scale": String(typography.detailScale),
    "--suggestion-detail-line-height": String(typography.detailLineHeight),
    "--suggestion-detail-width": percentage(typography.detailWidth),
  };
}
