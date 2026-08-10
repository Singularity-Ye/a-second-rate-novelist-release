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
  backdrop: { x: 0, y: 0, scale: 1, tilt: 0, width: 1, height: 1 },
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
    title: { x: 86, y: -31, scale: 0.95, tilt: 0, width: 1, height: 1 },
    status: { x: -19.34, y: 35.23, scale: 1.43, tilt: -1.3, width: 1.41, height: 1.37 },
    chat: { x: -7, y: 31, scale: 1.65, tilt: 0.1, width: 0.69, height: 1.11 },
    suggestions: { x: -1, y: 37.52, scale: 1.63, tilt: 4.3, width: 0.93, height: 0.78 },
    progress: { x: 46, y: -83.62, scale: 1, tilt: 0.2, width: 0.84, height: 0.49 },
  } satisfies Record<RoomUiVisualLayerId, RoomUiVisualGeometry>,
  nested: {
    conversation: { x: 9, y: -24, scale: 0.81, tilt: 0, width: 1, height: 0.8 },
    composer: { x: 0, y: -45, scale: 0.81, tilt: 0, width: 0.98, height: 0.2 },
    "status-copy": { x: 0, y: 0, scale: 1, tilt: 0, width: 1, height: 1 },
    "suggestions-copy": { x: 0, y: 0, scale: 1, tilt: 0, width: 1, height: 1 },
  } satisfies Record<RoomUiNestedVisualLayerId, RoomUiVisualGeometry>,
  internal: {
    "status-avatar": { x: 25.6, y: 14.9, scale: 1, tilt: 0, width: 17.9, height: 14.6 },
    "status-identity": { x: 48, y: 19.5, scale: 1, tilt: 0, width: 32, height: 15 },
    "status-scene": { x: 24, y: 35.5, scale: 1, tilt: 0, width: 56, height: 7 },
    "status-needs-primary": { x: 24, y: 43, scale: 1, tilt: 0, width: 56, height: 13 },
    "status-needs-secondary": { x: 24, y: 56.5, scale: 1, tilt: 0, width: 56, height: 13 },
    "status-mood": { x: 24, y: 76, scale: 1, tilt: 0, width: 56, height: 8 },
    "suggestion-icon": { x: 10.5, y: 12, scale: 1, tilt: 0, width: 21.5, height: 27 },
    "suggestion-title": { x: 9, y: 12, scale: 1, tilt: 0, width: 83, height: 27 },
    "suggestion-detail": { x: 9, y: 49, scale: 1, tilt: 0, width: 82, height: 29 },
    "progress-observe-dot": { x: 30, y: 43.3, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-observe-text": { x: 26.6, y: 51.7, scale: 1.07, tilt: 0, width: 12.6, height: 9.4 },
    "progress-breakdown-dot": { x: 45.3, y: 43.6, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-breakdown-text": { x: 42.3, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.4 },
    "progress-draft-dot": { x: 60.3, y: 43.5, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-draft-text": { x: 57, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.5 },
    "progress-review-dot": { x: 75.4, y: 43.8, scale: 0.75, tilt: 0, width: 5.5, height: 9.2 },
    "progress-review-text": { x: 72.1, y: 51.6, scale: 1.07, tilt: 0, width: 11.5, height: 9.5 },
  } satisfies Record<RoomUiInternalVisualLayerId, RoomUiVisualGeometry>,
} as const;

/**
 * Final desktop Surface framing copied from the approved 3013 formal-live
 * camera. It is presentation geometry only: formal /room never reads the
 * calibration hash or localStorage at runtime.
 *
 * The approved 3013 formal-live Surface is shown at 150% overall scale
 * with a 117% x 125% visible frame and an offset of (-57.21px, -13.69px).
 * Compile that final Surface camera directly so formal /room preserves the
 * approved overall size while every child layer grows and moves as one.
 */
export const ROOM_UI_SURFACE_GEOMETRY_V6 = {
  x: -57.21,
  y: -13.69,
  scale: 1.5,
  tilt: 0,
  width: 0.835714,
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
