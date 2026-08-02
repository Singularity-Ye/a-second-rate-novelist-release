import {
  studySceneGeometry,
  type SceneGeometryPoint,
} from "../novelist/scene-geometry";
import type { RouteAnchorKind, RouteAnchorPort } from "../route-publish/route-anchor-semantics";

export const STUDY_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
export const BEDROOM_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
export const DINING_KITCHEN_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
export const TERRACE_GREENERY_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
export const ATTIC_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
export const ENTRANCE_EDITOR_CANVAS = { width: 1774, height: 887 } as const;
/** Backwards-compatible alias used by the original study editor contract. */
export const ROUTE_EDITOR_CANVAS = STUDY_EDITOR_CANVAS;

export const EDITOR_SCENE_IDS = ["study", "bedroom", "dining-kitchen", "entrance", "terrace-greenery", "attic"] as const;
export type EditorSceneId = (typeof EDITOR_SCENE_IDS)[number];

export const CORE_BUILT_IN_ROUTE_KEYS = [
  "seat-to-door",
  "door-to-seat",
  "seat-to-kitchen",
  "kitchen-to-seat",
] as const;
export const LEGACY_BUILT_IN_ROUTE_KEYS = ["seat-to-door", "door-to-seat", "kitchen"] as const;
export const BUILT_IN_ROUTE_KEYS = [
  ...CORE_BUILT_IN_ROUTE_KEYS,
  "door-to-kitchen",
  "kitchen-to-door",
] as const;

export type EditorRouteKey = string;
export type EditorRouteKind = "walk" | "arrow";
export type EditorRouteAccent = "cyan" | "magenta" | "amber" | "violet";
export type EditorFacingDirection = "left" | "right";
export type EditorRouteForegroundPolicy = "none" | "before-turn" | "after-turn" | "always";
export type EditorForegroundLayerPolicy = "always" | "before-turn" | "after-turn";
export type EditorTransitionKind = "facing" | "state" | "layer";
export type EditorLayerMode = "actor-front" | "obstacle-front";
export type EditorLayerModes = Record<string, EditorLayerMode>;
export type EditorTransitionAnimationStyle = "mirror" | "spin" | "smoke" | "scene-switch";
export type EditorTransitionEasing = "smooth" | "elastic" | "linear";
/** How an event-local transition asset is positioned in the scene preview. */
export type EditorTransitionAssetMode = "actor" | "scene" | "none";

/** A scene-owned component is deliberately separate from route actor assets. */
export type EditorSceneInteractionKind = "pickup-prop" | "inspect" | "ambient" | "portal";
export type EditorSceneInteractionAssetMode = "scene" | "actor";

export type EditorSceneInteractionAsset = {
  id: string;
  label: string;
  src: string;
  mode: EditorSceneInteractionAssetMode;
  /** Scene-space stacking. Actor attachments are still rendered at the live actor anchor. */
  zIndex: number;
  scale?: number;
  /** Pixel offset from the interaction anchor or the live actor anchor. */
  offset?: readonly [number, number];
};

export type EditorSceneInteractionState = {
  id: string;
  label: string;
  /** Scene assets visible in this state. */
  visibleAssetIds: readonly string[];
  /** Optional actor attachment visible while the state is active. */
  actorAssetId?: string;
};

export type EditorSceneInteraction = {
  id: string;
  label: string;
  kind: EditorSceneInteractionKind;
  /** The point is also the editor/runtime placement anchor for scene assets. */
  anchorPointId: string;
  initialStateId: string;
  assets: readonly EditorSceneInteractionAsset[];
  states: readonly EditorSceneInteractionState[];
};

/**
 * Store browser-loadable project asset paths in every draft.
 *
 * The editor is often used with a copied Windows path from Explorer. Keeping
 * that absolute path in a draft makes the JSON machine-specific and breaks as
 * soon as the repository moves to another computer. Paths under h5/public
 * are therefore reduced to the public URL root while data URLs and other
 * deliberate values are left untouched.
 */
export function normalizeEditorAssetSource(value: string): string {
  let normalized = value.trim().replace(/\\/g, "/");
  if ((normalized.startsWith("\"") && normalized.endsWith("\"")) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  const lower = normalized.toLowerCase();
  const publicAssetsMarker = lower.indexOf("/public/assets/");
  if (publicAssetsMarker >= 0) {
    return normalized.slice(publicAssetsMarker + "/public".length);
  }
  if (lower.startsWith("public/assets/")) {
    return `/${normalized.slice("public/".length)}`;
  }
  if (lower.startsWith("assets/")) {
    return `/${normalized}`;
  }
  return normalized;
}

/**
 * Add a scene asset without making the editor author an invisible asset by
 * accident. New props belong to the component's initial scene state first;
 * later states can remove them one by one for pickup/return routes.
 */
export function addSceneInteractionAsset(
  interaction: EditorSceneInteraction,
  asset: EditorSceneInteractionAsset,
): EditorSceneInteraction {
  const initialStateId = interaction.states.some((state) => state.id === interaction.initialStateId)
    ? interaction.initialStateId
    : interaction.states[0]?.id;
  return {
    ...interaction,
    assets: [...interaction.assets, asset],
    states: interaction.states.map((state) => (
      state.id === initialStateId
        ? { ...state, visibleAssetIds: [...new Set([...state.visibleAssetIds, asset.id])] }
        : state
    )),
  };
}

/** Toggle one or all scene assets in one named component state. */
export function setSceneInteractionStateVisibility(
  interaction: EditorSceneInteraction,
  stateId: string,
  visible: boolean,
  assetId?: string,
): EditorSceneInteraction {
  const assetIds = assetId
    ? [assetId]
    : interaction.assets.map((asset) => asset.id);
  const assetIdSet = new Set(assetIds);
  return {
    ...interaction,
    states: interaction.states.map((state) => {
      if (state.id !== stateId) return state;
      const visibleAssetIds = visible
        ? [...new Set([...state.visibleAssetIds, ...assetIds])]
        : state.visibleAssetIds.filter((id) => !assetIdSet.has(id));
      return { ...state, visibleAssetIds };
    }),
  };
}

/** A route-local state mutation for a persistent scene component. */
export type EditorSceneInteractionEvent = {
  pointId: string;
  interactionId: string;
  stateId: string;
};

export type EditorTransitionAnimation = {
  style: EditorTransitionAnimationStyle;
  /** Number of visual turns for the spin style; mirror transitions use this as a visual intensity hint. */
  turns: number;
  /** Fast turn / squeeze phase in milliseconds. */
  durationMs: number;
  /** Elastic settle phase after the asset/state swap in milliseconds. */
  settleMs: number;
  easing: EditorTransitionEasing;
};

export type EditorRouteTransition = {
  /** The route point at which the event fires, including semantic anchors. */
  pointId: string;
  kind: EditorTransitionKind;
  /** Explicit destination facing. Omit to toggle from the current facing. */
  facing?: EditorFacingDirection;
  /** State key reserved for the next action/pose asset. */
  targetStateId?: string;
  /** Whether the actor or the registered foreground layers are visually on top. */
  layerMode?: EditorLayerMode;
  /** Per-obstacle layer modes. Keys are foreground layer IDs. */
  layerModes?: EditorLayerModes;
  /** Optional event-local asset shown before the transition. Empty means inherit the route state. */
  fromAssetSource?: string;
  /** Event-local source positioning; actor uses the walking anchor, scene covers the full stage. */
  fromAssetMode?: EditorTransitionAssetMode;
  /** Optional visual facing for a transparent actor asset before the transition. */
  fromAssetFacing?: EditorFacingDirection;
  /** Optional event-local display multiplier for the actor asset before the transition. */
  fromAssetScale?: number;
  /** Optional event-local asset shown after the transition. Empty means resolve targetStateId normally. */
  toAssetSource?: string;
  /** Event-local source positioning; actor uses the walking anchor, scene covers the full stage. */
  toAssetMode?: EditorTransitionAssetMode;
  /** Optional visual facing for a transparent actor asset after the transition. */
  toAssetFacing?: EditorFacingDirection;
  /** Optional event-local display multiplier for the actor asset after the transition. */
  toAssetScale?: number;
  animation: EditorTransitionAnimation;
};

export type EditorRouteAssetLibrary = {
  /** Base transparent walking assets used when no state override is active. */
  left?: string;
  right?: string;
  /** Optional state-specific transparent assets keyed by a transition targetStateId. */
  states?: Record<string, {
    left?: string;
    right?: string;
    /** Visual multiplier used to match a state asset's canvas framing to the walker. */
    scale?: number;
    /** Fraction of the source canvas where the last opaque pixel touches. */
    alphaBottom?: number;
    /** The unmirrored orientation baked into the source bitmap. */
    canonicalFacing?: EditorFacingDirection;
  }>;
};

export type EditorForegroundLayer = {
  id: string;
  src: string;
  label: string;
  policy: EditorForegroundLayerPolicy;
  zIndex: number;
};

export const DEFAULT_EDITOR_TRANSITION_ANIMATION: EditorTransitionAnimation = {
  style: "mirror",
  turns: 1,
  durationMs: 360,
  settleMs: 160,
  easing: "elastic",
};

/** Default animation for a newly-created event on a route's first node. */
export const DEFAULT_INITIAL_NODE_TRANSITION_ANIMATION: EditorTransitionAnimation = {
  ...DEFAULT_EDITOR_TRANSITION_ANIMATION,
  durationMs: 100,
  settleMs: 100,
};

/** Backwards-compatible name used by the first state-event implementation. */
export const DEFAULT_INITIAL_NODE_STATE_TRANSITION_ANIMATION: EditorTransitionAnimation = {
  ...DEFAULT_INITIAL_NODE_TRANSITION_ANIMATION,
};

export type EditorAnchorRole =
  | "door"
  | "seat-left"
  | "seat-right"
  | "bed-edge"
  | "lounge"
  | "scene-entry"
  | "waypoint";

export type EditorPoint = {
  id: string;
  label: string;
  role: EditorAnchorRole;
  /**
   * Custom routes clone semantic anchors into route-owned waypoints. Keep the
   * original meaning so arrival/departure state rules survive that isolation.
   */
  semanticRole?: EditorAnchorRole;
  /** Optional explicit semantic identity. Old drafts derive this at publish time. */
  anchorKind?: RouteAnchorKind;
  /** Stable identity shared by route-owned clones of the same physical endpoint. */
  anchorKey?: string;
  /** Optional interaction family for distinct ports of one scene-state point. */
  anchorGroupKey?: string;
  anchorPort?: RouteAnchorPort;
  point: SceneGeometryPoint;
  scaleOverride?: number;
};

export type EditorScaleSettings = {
  mode: "depth" | "manual";
  farY: number;
  nearY: number;
  farScale: number;
  nearScale: number;
};

export type EditorRouteMeta = {
  id: string;
  label: string;
  kind: EditorRouteKind;
  accent: EditorRouteAccent;
  startPointId?: string;
  endPointId?: string;
  /** The waypoint after which this route changes its walking-facing asset. */
  facingSwitchAfterPointId?: string;
  /** Direction before the optional turn. If omitted, the editor infers it from the first segment. */
  initialFacing?: EditorFacingDirection;
  /** Direction after `facingSwitchAfterPointId`; defaults to the opposite direction. */
  facingAfterSwitch?: EditorFacingDirection;
  /** Whether the configured foreground layer is rendered before/after the turn. */
  foregroundPolicy?: EditorRouteForegroundPolicy;
  /** Route-local facing/state events. The same shared point may have different events per route. */
  transitions?: EditorRouteTransition[];
  /** Route-local transparent character assets; paths/data URLs are intentionally exportable. */
  assetLibrary?: EditorRouteAssetLibrary;
  /** Route-local scene-component mutations; these do not create actor smoke by themselves. */
  interactionEvents?: EditorSceneInteractionEvent[];
};

export type EditorDraft = {
  version: 1 | 2;
  sceneId: EditorSceneId;
  canvas?: { width: number; height: number };
  pointsById: Record<string, EditorPoint>;
  routes: Record<EditorRouteKey, string[]>;
  /** Optional for backwards compatibility with drafts created before route management. */
  routeMeta?: Record<string, EditorRouteMeta>;
  /** Persistent scene components such as a coat on a rack or a letter in a mailbox. */
  sceneInteractions?: Record<string, EditorSceneInteraction>;
  scale: EditorScaleSettings;
};

export type EditorSceneProfile = {
  id: EditorSceneId;
  label: string;
  description: string;
  canvas: { width: number; height: number };
  masterSrc: string;
  masterAlt: string;
  foregroundSrc: string | null;
  foregroundLabel: string;
  foregroundLayers: readonly EditorForegroundLayer[];
  floorPolygon: readonly SceneGeometryPoint[] | null;
  floorStatus: "frozen" | "pending";
  protectedRouteKeys: readonly string[];
  initialPoints: readonly EditorPoint[];
  initialRoutes: Readonly<Record<string, readonly string[]>>;
  initialRouteMeta: Readonly<Record<string, EditorRouteMeta>>;
  initialSceneInteractions?: Readonly<Record<string, EditorSceneInteraction>>;
  defaultScale: EditorScaleSettings;
  anchorSemantics: Readonly<Record<string, string>>;
  actorAssets: {
    left: { src: string; facing: EditorFacingDirection };
    right: { src: string; facing: EditorFacingDirection };
  };
};

export type EditorRouteSample = {
  point: SceneGeometryPoint;
  pointId: string;
  scale: number;
};

/**
 * The return route crosses the desk's left edge at the waypoint rendered as
 * "7" in the editor.  Keep this semantic event next to the route model so
 * the preview and the exported business contract cannot drift apart.
 */
export const DOOR_TO_SEAT_TURN_POINT_ID = "in-6" as const;
export const DOOR_TO_SEAT_TURN_POINT_LABEL = "点位7" as const;

export const INITIAL_ROUTE_META: Record<string, EditorRouteMeta> = {
  "seat-to-door": {
    id: "seat-to-door",
    label: "座位 → 门（椅子右侧下椅）",
    kind: "walk",
    accent: "cyan",
    startPointId: "seat-right",
    endPointId: "door",
    initialFacing: "right",
  },
  "door-to-seat": {
    id: "door-to-seat",
    label: "门 → 座位（椅子左侧上椅）",
    kind: "walk",
    accent: "magenta",
    startPointId: "door",
    endPointId: "seat-left",
    facingSwitchAfterPointId: DOOR_TO_SEAT_TURN_POINT_ID,
    initialFacing: "left",
    facingAfterSwitch: "right",
    foregroundPolicy: "before-turn",
    transitions: [
      {
        pointId: DOOR_TO_SEAT_TURN_POINT_ID,
        kind: "facing",
        facing: "right",
        animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
      },
      {
        pointId: "seat-left",
        kind: "state",
        targetStateId: "writing-seat",
        toAssetSource: "/assets/ecology/formal-scenes/study/states/study-writing-seat-scene-v9-paper-base-mother-locked.webp",
        toAssetMode: "scene",
        animation: {
          style: "smoke",
          turns: 2,
          durationMs: 300,
          settleMs: 120,
          easing: "smooth",
        },
      },
    ],
  },
  "seat-to-kitchen": {
    id: "seat-to-kitchen",
    label: "座位 → 厨房（右侧通道）",
    kind: "walk",
    accent: "amber",
    startPointId: "seat-right",
    endPointId: "seat-kitchen-3",
    initialFacing: "right",
  },
  "kitchen-to-seat": {
    id: "kitchen-to-seat",
    label: "厨房 → 座位（回到座位）",
    kind: "walk",
    accent: "amber",
    startPointId: "kitchen-seat-1",
    endPointId: "seat-right",
    initialFacing: "left",
  },
  "door-to-kitchen": {
    id: "door-to-kitchen",
    label: "门 → 厨房（右侧通道）",
    kind: "walk",
    accent: "violet",
    startPointId: "door",
    endPointId: "door-kitchen-4",
    facingSwitchAfterPointId: "door-kitchen-2",
    initialFacing: "left",
    facingAfterSwitch: "right",
  },
  "kitchen-to-door": {
    id: "kitchen-to-door",
    label: "厨房 → 门（回到书房）",
    kind: "walk",
    accent: "cyan",
    startPointId: "kitchen-door-1",
    endPointId: "door",
    facingSwitchAfterPointId: "kitchen-door-4",
    initialFacing: "left",
    facingAfterSwitch: "right",
  },
};

const initialPoints: readonly EditorPoint[] = [
  {
    id: "door",
    label: "门固定点",
    role: "door",
    point: [1392, 419],
  },
  {
    id: "seat-left",
    label: "座位左侧上椅点",
    role: "seat-left",
    point: [804, 557],
  },
  {
    id: "seat-right",
    label: "座位右侧下椅点",
    role: "seat-right",
    point: [941, 658],
  },
  { id: "out-1", label: "去程节点 1", role: "waypoint", point: [1035, 694] },
  { id: "out-2", label: "去程节点 2", role: "waypoint", point: [1153, 672] },
  { id: "out-3", label: "去程节点 3", role: "waypoint", point: [1239, 651] },
  { id: "out-4", label: "去程节点 4", role: "waypoint", point: [1297, 594] },
  { id: "out-5", label: "去程节点 5", role: "waypoint", point: [1335, 520] },
  { id: "in-1", label: "回程节点 1", role: "waypoint", point: [1220, 396] },
  { id: "in-2", label: "回程节点 2", role: "waypoint", point: [1092, 408] },
  { id: "in-3", label: "回程节点 3", role: "waypoint", point: [1005, 402] },
  { id: "in-4", label: "回程节点 4", role: "waypoint", point: [890, 413] },
  { id: "in-5", label: "回程节点 5", role: "waypoint", point: [780, 424] },
  { id: "in-6", label: "回程节点 6", role: "waypoint", point: [747, 468] },
  { id: "in-7", label: "回程节点 7", role: "waypoint", point: [749, 523] },
  { id: "seat-kitchen-1", label: "座位→厨房节点 1", role: "waypoint", point: [998, 665] },
  { id: "seat-kitchen-2", label: "座位→厨房节点 2", role: "waypoint", point: [1346, 667] },
  { id: "seat-kitchen-3", label: "座位→厨房终点", role: "waypoint", point: [1672, 783] },
  { id: "kitchen-seat-1", label: "厨房→座位起点", role: "waypoint", point: [1672, 783] },
  { id: "kitchen-seat-2", label: "厨房→座位节点 1", role: "waypoint", point: [1346, 667] },
  { id: "kitchen-seat-3", label: "厨房→座位节点 2", role: "waypoint", point: [998, 665] },
  { id: "door-kitchen-1", label: "门→厨房节点 1", role: "waypoint", point: [1335, 456] },
  { id: "door-kitchen-2", label: "门→厨房节点 3 · 镜像翻转点", role: "waypoint", point: [1323, 538] },
  { id: "door-kitchen-3", label: "门→厨房节点 4", role: "waypoint", point: [1346, 667] },
  { id: "door-kitchen-4", label: "门→厨房终点", role: "waypoint", point: [1672, 783] },
  { id: "kitchen-door-1", label: "厨房→门起点", role: "waypoint", point: [1672, 783] },
  { id: "kitchen-door-2", label: "厨房→门节点 4", role: "waypoint", point: [1346, 667] },
  { id: "kitchen-door-3", label: "厨房→门节点 3", role: "waypoint", point: [1323, 538] },
  { id: "kitchen-door-4", label: "厨房→门节点 4 · 镜像翻转点", role: "waypoint", point: [1335, 456] },
];

const bedroomInitialPoints: readonly EditorPoint[] = [
  { id: "bedroom-door-to-lounge-2", label: "Door -> lounge node 3 / mirror switch", role: "waypoint", point: [1200, 650] },
  { id: "bedroom-door", label: "门固定交互点（红圈确认）", role: "door", point: [1182, 455] },
  { id: "bed-edge", label: "上床 / 唱片机交互点（红圈确认）", role: "bed-edge", point: [868, 357] },
  { id: "lounge-corner", label: "小沙发交互点（红圈确认）", role: "lounge", point: [1075, 579] },
  { id: "bedroom-door-to-bed-1", label: "门 → 床/唱片机参考节点 1", role: "waypoint", point: [1035, 575] },
  { id: "bedroom-bed-to-door-1", label: "床/唱片机 → 门参考节点 1", role: "waypoint", point: [900, 630] },
  { id: "bedroom-door-to-lounge-1", label: "门 → 小沙发参考节点 1", role: "waypoint", point: [1235, 665] },
  { id: "bedroom-lounge-to-door-1", label: "小沙发 → 门参考节点 1", role: "waypoint", point: [1330, 700] },
  { id: "bedroom-bed-to-lounge-1", label: "床/唱片机 → 小沙发参考节点 1", role: "waypoint", point: [980, 700] },
  { id: "bedroom-lounge-to-bed-1", label: "小沙发 → 床/唱片机参考节点 1", role: "waypoint", point: [1040, 690] },
];

const studyInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "seat-to-door": ["seat-right", "out-1", "out-2", "out-3", "out-4", "out-5", "door"],
  "door-to-seat": ["door", "in-1", "in-2", "in-3", "in-4", "in-5", "in-6", "in-7", "seat-left"],
  "seat-to-kitchen": ["seat-right", "seat-kitchen-1", "seat-kitchen-2", "seat-kitchen-3"],
  "kitchen-to-seat": ["kitchen-seat-1", "kitchen-seat-2", "kitchen-seat-3", "seat-right"],
  "door-to-kitchen": ["door", "door-kitchen-1", "door-kitchen-2", "door-kitchen-3", "door-kitchen-4"],
  "kitchen-to-door": ["kitchen-door-1", "kitchen-door-2", "kitchen-door-3", "kitchen-door-4", "door"],
};

const bedroomInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "door-to-bed": ["bedroom-door", "bedroom-door-to-bed-1", "bed-edge"],
  "bed-to-door": ["bed-edge", "bedroom-bed-to-door-1", "bedroom-door"],
  "door-to-lounge": ["bedroom-door", "bedroom-door-to-lounge-1", "bedroom-door-to-lounge-2", "lounge-corner"],
  "lounge-to-door": ["lounge-corner", "bedroom-lounge-to-door-1", "bedroom-door"],
  "bed-to-lounge": ["bed-edge", "bedroom-bed-to-lounge-1", "lounge-corner"],
  "lounge-to-bed": ["lounge-corner", "bedroom-lounge-to-bed-1", "bed-edge"],
};

const bedroomInitialRouteMeta: Readonly<Record<string, EditorRouteMeta>> = {
  "door-to-bed": { id: "door-to-bed", label: "门 → 床 / 唱片机", kind: "walk", accent: "magenta", initialFacing: "left", foregroundPolicy: "always" },
  "bed-to-door": { id: "bed-to-door", label: "床 / 唱片机 → 门", kind: "walk", accent: "cyan", initialFacing: "right", foregroundPolicy: "always" },
  "door-to-lounge": { id: "door-to-lounge", label: "门 → 小沙发", kind: "walk", accent: "amber", initialFacing: "left", facingAfterSwitch: "right", foregroundPolicy: "always" },
  "lounge-to-door": { id: "lounge-to-door", label: "小沙发 → 门", kind: "walk", accent: "violet", initialFacing: "left", facingAfterSwitch: "right", foregroundPolicy: "always" },
  "bed-to-lounge": { id: "bed-to-lounge", label: "床 / 唱片机 → 小沙发", kind: "walk", accent: "amber", initialFacing: "right", foregroundPolicy: "always" },
  "lounge-to-bed": { id: "lounge-to-bed", label: "小沙发 → 床 / 唱片机", kind: "walk", accent: "violet", initialFacing: "left", foregroundPolicy: "always" },
};

const BEDROOM_DOOR_ENTRY_SMOKE_ANIMATION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 1.5,
  durationMs: 480,
  settleMs: 120,
  easing: "smooth",
};

const BEDROOM_INITIAL_NODE_SMOKE_ANIMATION: EditorTransitionAnimation = {
  ...BEDROOM_DOOR_ENTRY_SMOKE_ANIMATION,
  durationMs: 100,
  settleMs: 100,
};

export const BEDROOM_BED_SCENE_ASSET_SRC =
  "/assets/ecology/formal-scenes/bedroom/states/bedroom-bed-sleep-scene-v1-paper-identity.webp";
export const BEDROOM_RECORD_SCENE_ASSET_SRC =
  "/assets/ecology/formal-scenes/bedroom/states/bedroom-record-place-scene-v1-paper-identity.webp";
export const BEDROOM_LOUNGE_SCENE_ASSET_SRC =
  "/assets/ecology/formal-scenes/bedroom/states/bedroom-lounge-seat-scene-v1-paper-identity.webp";
export const BEDROOM_WALK_LEFT_ACTOR_ASSET_SRC =
  "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp";
export const BEDROOM_WALK_RIGHT_ACTOR_ASSET_SRC =
  "/assets/ecology/characters/novelist/study-walk-right-v2.webp";

const BEDROOM_SCENE_HANDOFF_SMOKE_ANIMATION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 1.5,
  durationMs: 720,
  settleMs: 140,
  easing: "smooth",
};

type BedroomSceneStateId = "bed-sleep" | "record-place" | "lounge-seat";

const BEDROOM_SCENE_ASSETS: Readonly<Record<BedroomSceneStateId, string>> = {
  "bed-sleep": BEDROOM_BED_SCENE_ASSET_SRC,
  "record-place": BEDROOM_RECORD_SCENE_ASSET_SRC,
  "lounge-seat": BEDROOM_LOUNGE_SCENE_ASSET_SRC,
};

function bedroomRouteText(routeKey: string, meta: EditorRouteMeta): string {
  return `${routeKey} ${meta.label}`.replace(/\s/g, "").toLowerCase();
}

function bedroomHasRouteToken(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

type BedroomRouteEndpointPosition = "start" | "end";

function splitBedroomRouteDirection(value: string): [string, string] | null {
  const compact = value.replace(/\s/g, "").toLowerCase();
  const match = compact.match(/^(.+?)(?:→|->|-to-|_to_|到|至)(.+)$/);
  return match ? [match[1]!, match[2]!] : null;
}

function bedroomRouteSideText(
  routeKey: string,
  meta: EditorRouteMeta,
  position: BedroomRouteEndpointPosition,
): { labelSide?: string; keySide?: string } {
  const labelDirection = splitBedroomRouteDirection(meta.label);
  const keyDirection = splitBedroomRouteDirection(routeKey);
  const index = position === "start" ? 0 : 1;
  return {
    ...(labelDirection ? { labelSide: labelDirection[index] } : {}),
    ...(keyDirection ? { keySide: keyDirection[index] } : {}),
  };
}

function bedroomSceneStateForRouteSide(text: string | undefined): BedroomSceneStateId | undefined {
  if (!text) return undefined;
  const hasRecord = bedroomHasRouteToken(text, ["record", "vinyl", "唱片", "黑胶"]);
  const hasBed = bedroomHasRouteToken(text, ["bed", "sleep", "床", "睡"]);
  if (hasRecord && !hasBed) return "record-place";
  if (hasBed && !hasRecord) return "bed-sleep";
  return undefined;
}

function bedroomSemanticRoleForPoint(point: EditorPoint | undefined): EditorAnchorRole | undefined {
  if (!point) return undefined;
  if (point.role !== "waypoint") return point.role;
  if (point.semanticRole && point.semanticRole !== "waypoint") return point.semanticRole;
  return undefined;
}

function bedroomEndpointRoleForRoute(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: BedroomRouteEndpointPosition,
): EditorAnchorRole | undefined {
  const { labelSide, keySide } = bedroomRouteSideText(routeKey, meta, position);
  const sideText = labelSide ?? keySide;
  if (sideText && bedroomHasRouteToken(sideText, ["door", "entry", "门", "入口", "出口"])) return "door";
  if (sideText && bedroomHasRouteToken(sideText, ["lounge", "sofa", "沙发", "懒人椅"])) return "lounge";
  if (sideText && bedroomHasRouteToken(sideText, ["bed", "sleep", "record", "vinyl", "床", "睡", "唱片", "黑胶"])) {
    return "bed-edge";
  }
  return bedroomSemanticRoleForPoint(point);
}

function bedroomSceneStateForEndpoint(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: BedroomRouteEndpointPosition,
): BedroomSceneStateId | undefined {
  // Route-owned endpoint clones keep their pixel position but may retain the
  // semanticRole/label of the source anchor they were copied from. For
  // bedroom routes the directed route name is the authoritative contract:
  // `门→床` and `门→唱片机` can end at different physical points even when
  // an old clone still says `bed-edge` or `lounge`.
  const { labelSide, keySide } = bedroomRouteSideText(routeKey, meta, position);
  const routeSideText = labelSide ?? keySide;
  const routeSideState = bedroomSceneStateForRouteSide(labelSide)
    ?? bedroomSceneStateForRouteSide(keySide);
  if (routeSideState) return routeSideState;
  if (routeSideText && bedroomHasRouteToken(routeSideText, ["lounge", "sofa", "沙发", "懒人椅"])) {
    return "lounge-seat";
  }
  if (routeSideText && bedroomHasRouteToken(routeSideText, ["door", "entry", "门", "入口", "出口"])) {
    return undefined;
  }

  const semanticRole = point ? bedroomSemanticRoleForPoint(point) : undefined;
  if (semanticRole === "lounge") return "lounge-seat";
  if (semanticRole !== "bed-edge") return undefined;

  // Legacy drafts may still use the shared bed-edge anchor. Preserve the
  // old fallback only when the route does not expose a usable endpoint name.
  const text = bedroomRouteText(routeKey, meta);
  const explicitlyRecord = bedroomHasRouteToken(text, ["record", "vinyl", "唱片", "黑胶"]);
  const explicitlyBed = bedroomHasRouteToken(text, ["bed", "sleep", "床", "睡"]);
  return explicitlyRecord && !explicitlyBed ? "record-place" : "bed-sleep";
}

function bedroomWalkAssetForFacing(facing: EditorFacingDirection): string {
  return facing === "left"
    ? BEDROOM_WALK_LEFT_ACTOR_ASSET_SRC
    : BEDROOM_WALK_RIGHT_ACTOR_ASSET_SRC;
}

/**
 * The new 2:1 kitchen master is intentionally an editor-only starting point.
 * Semantic anchors are shared; every ordinary waypoint belongs to one
 * directed route so the user can reshape one path without moving another.
 */
const diningKitchenInitialPoints: readonly EditorPoint[] = [
  { id: "dining-entry", label: "门口 / 生活通道入口（可拖动）", role: "scene-entry", point: [177, 719] },
  { id: "bathroom-door", label: "浴室门口 / 隐私边界（可拖动）", role: "scene-entry", point: [166, 650] },
  { id: "kitchen-counter", label: "料理台交互点（可拖动）", role: "waypoint", point: [727, 525] },
  { id: "meal-table", label: "餐桌交互点（可拖动）", role: "waypoint", point: [1253, 704] },
  { id: "entry-counter-1", label: "门口 → 料理台节点 1", role: "waypoint", point: [360, 690] },
  { id: "entry-counter-2", label: "门口 → 料理台节点 2", role: "waypoint", point: [545, 605] },
  { id: "counter-entry-1", label: "料理台 → 门口节点 1", role: "waypoint", point: [560, 610] },
  { id: "counter-entry-2", label: "料理台 → 门口节点 2", role: "waypoint", point: [350, 705] },
  { id: "counter-table-1", label: "料理台 → 餐桌节点 1", role: "waypoint", point: [850, 575] },
  { id: "counter-table-2", label: "料理台 → 餐桌节点 2", role: "waypoint", point: [1050, 635] },
  { id: "table-counter-1", label: "餐桌 → 料理台节点 1", role: "waypoint", point: [1060, 630] },
  { id: "table-counter-2", label: "餐桌 → 料理台节点 2", role: "waypoint", point: [850, 570] },
  { id: "entry-table-1", label: "门口 → 餐桌节点 1", role: "waypoint", point: [430, 805] },
  { id: "entry-table-2", label: "门口 → 餐桌节点 2", role: "waypoint", point: [760, 820] },
  { id: "entry-table-3", label: "门口 → 餐桌节点 3", role: "waypoint", point: [1040, 780] },
  { id: "table-entry-1", label: "餐桌 → 门口节点 1", role: "waypoint", point: [1050, 815] },
  { id: "table-entry-2", label: "餐桌 → 门口节点 2", role: "waypoint", point: [750, 845] },
  { id: "table-entry-3", label: "餐桌 → 门口节点 3", role: "waypoint", point: [430, 815] },
  { id: "table-bathroom-1", label: "餐桌 → 浴室节点 1", role: "waypoint", point: [1040, 815] },
  { id: "table-bathroom-2", label: "餐桌 → 浴室节点 2", role: "waypoint", point: [760, 850] },
  { id: "table-bathroom-3", label: "餐桌 → 浴室节点 3", role: "waypoint", point: [430, 820] },
  { id: "table-bathroom-4", label: "餐桌 → 浴室节点 4", role: "waypoint", point: [245, 755] },
  { id: "entry-bathroom-1", label: "门口 → 浴室节点 1", role: "waypoint", point: [140, 685] },
  { id: "bathroom-entry-1", label: "浴室 → 门口节点 1", role: "waypoint", point: [125, 680] },
];

const diningKitchenInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "entry-to-counter": ["dining-entry", "entry-counter-1", "entry-counter-2", "kitchen-counter"],
  "counter-to-entry": ["kitchen-counter", "counter-entry-1", "counter-entry-2", "dining-entry"],
  "counter-to-table": ["kitchen-counter", "counter-table-1", "counter-table-2", "meal-table"],
  "table-to-counter": ["meal-table", "table-counter-1", "table-counter-2", "kitchen-counter"],
  "entry-to-table": ["dining-entry", "entry-table-1", "entry-table-2", "entry-table-3", "meal-table"],
  "table-to-entry": ["meal-table", "table-entry-1", "table-entry-2", "table-entry-3", "dining-entry"],
  "table-to-bathroom": ["meal-table", "table-bathroom-1", "table-bathroom-2", "table-bathroom-3", "table-bathroom-4", "bathroom-door"],
  "entry-to-bathroom": ["dining-entry", "entry-bathroom-1", "bathroom-door"],
  "bathroom-to-entry": ["bathroom-door", "bathroom-entry-1", "dining-entry"],
};

/**
 * The dining route is a deliberate three-state handoff:
 * serve-scene -> carry-bowl actor -> meal-scene.
 * Keep these URLs in the route editor contract so the editor and the formal
 * room cannot silently fall back to the generic study walking sprite.
 */
export const DINING_KITCHEN_SERVE_SCENE_ASSET_SRC =
  "/assets/ecology/formal-scenes/dining-kitchen/kitchen-counter/dining-kitchen-serve-red-bean-soup-scene-character-2x1-formal-v3.webp";
export const DINING_KITCHEN_CARRY_BOWL_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/dining-kitchen/kitchen-counter/carry-bowl-transparent-actor-v1.png";
export const DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/dining-kitchen/meal-table/carry-empty-bowl-transparent-actor-v2.webp";
export const DINING_KITCHEN_MEAL_SCENE_ASSET_SRC =
  "/assets/ecology/formal-scenes/dining-kitchen/meal-table/dining-kitchen-meal-table-scene-character-2x1-formal-v6.webp";
export const DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC =
  "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp";
export const DINING_KITCHEN_WALK_RIGHT_ACTOR_ASSET_SRC =
  "/assets/ecology/characters/novelist/study-walk-right-v2.webp";

const diningCounterToTableAssetLibrary: EditorRouteAssetLibrary = {
  states: {
    "carry-bowl": {
      left: DINING_KITCHEN_CARRY_BOWL_ACTOR_ASSET_SRC,
      right: DINING_KITCHEN_CARRY_BOWL_ACTOR_ASSET_SRC,
      scale: 1.5,
      canonicalFacing: "right",
    },
  },
};

const diningTableToCounterAssetLibrary: EditorRouteAssetLibrary = {
  states: {
    "carry-bowl-return": {
      left: DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC,
      right: DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC,
      scale: 1.5,
      canonicalFacing: "left",
    },
  },
};

const DINING_KITCHEN_SMOKE_TRANSITION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 1.5,
  durationMs: 720,
  settleMs: 140,
  easing: "smooth",
};

const DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION: EditorTransitionAnimation = {
  ...DINING_KITCHEN_SMOKE_TRANSITION,
  durationMs: 100,
  settleMs: 100,
};

function diningKitchenStateTransition(
  pointId: string,
  targetStateId: string,
  options: Pick<EditorRouteTransition, "fromAssetSource" | "fromAssetMode" | "toAssetSource" | "toAssetMode">,
  animation: EditorTransitionAnimation = DINING_KITCHEN_SMOKE_TRANSITION,
): EditorRouteTransition {
  return {
    pointId,
    kind: "state",
    targetStateId,
    ...options,
    animation: { ...animation },
  };
}

const diningCounterToTableTransitions: EditorRouteTransition[] = [
  {
    pointId: "kitchen-counter",
    kind: "state",
    targetStateId: "carry-bowl",
    fromAssetSource: DINING_KITCHEN_SERVE_SCENE_ASSET_SRC,
    fromAssetMode: "scene",
    toAssetSource: DINING_KITCHEN_CARRY_BOWL_ACTOR_ASSET_SRC,
    toAssetMode: "actor",
    animation: { ...DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION },
  },
  {
    pointId: "meal-table",
    kind: "state",
    targetStateId: "meal-table",
    fromAssetSource: DINING_KITCHEN_CARRY_BOWL_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetSource: DINING_KITCHEN_MEAL_SCENE_ASSET_SRC,
    toAssetMode: "scene",
    animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION, style: "smoke", easing: "smooth" },
  },
];

const diningEntryToCounterTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("kitchen-counter", "serve-red-bean-soup", {
    fromAssetSource: DINING_KITCHEN_WALK_RIGHT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetSource: DINING_KITCHEN_SERVE_SCENE_ASSET_SRC,
    toAssetMode: "scene",
  }),
];

const diningCounterToEntryTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("kitchen-counter", "leaving-kitchen", {
    fromAssetSource: DINING_KITCHEN_SERVE_SCENE_ASSET_SRC,
    fromAssetMode: "scene",
    toAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    toAssetMode: "actor",
  }, DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION),
  diningKitchenStateTransition("dining-entry", "gone", {
    fromAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetMode: "none",
  }),
];

const diningTableToCounterTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("meal-table", "carry-bowl-return", {
    fromAssetSource: DINING_KITCHEN_MEAL_SCENE_ASSET_SRC,
    fromAssetMode: "scene",
    toAssetSource: DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC,
    toAssetMode: "actor",
  }, DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION),
  diningKitchenStateTransition("kitchen-counter", "serve-red-bean-soup", {
    fromAssetSource: DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetSource: DINING_KITCHEN_SERVE_SCENE_ASSET_SRC,
    toAssetMode: "scene",
  }),
];

const diningEntryToTableTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("meal-table", "meal-table", {
    fromAssetSource: DINING_KITCHEN_WALK_RIGHT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetSource: DINING_KITCHEN_MEAL_SCENE_ASSET_SRC,
    toAssetMode: "scene",
  }),
];

const diningTableToEntryTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("meal-table", "leaving-kitchen", {
    fromAssetSource: DINING_KITCHEN_MEAL_SCENE_ASSET_SRC,
    fromAssetMode: "scene",
    toAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    toAssetMode: "actor",
  }, DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION),
  diningKitchenStateTransition("dining-entry", "gone", {
    fromAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetMode: "none",
  }),
];

const diningTableToBathroomTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("meal-table", "leaving-kitchen", {
    fromAssetSource: DINING_KITCHEN_MEAL_SCENE_ASSET_SRC,
    fromAssetMode: "scene",
    toAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    toAssetMode: "actor",
  }, DINING_KITCHEN_INITIAL_NODE_SMOKE_TRANSITION),
  diningKitchenStateTransition("bathroom-door", "gone", {
    fromAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetMode: "none",
  }),
];

const diningEntryToBathroomTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("bathroom-door", "gone", {
    fromAssetSource: DINING_KITCHEN_WALK_LEFT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetMode: "none",
  }),
];

const diningBathroomToEntryTransitions: EditorRouteTransition[] = [
  diningKitchenStateTransition("dining-entry", "gone", {
    fromAssetSource: DINING_KITCHEN_WALK_RIGHT_ACTOR_ASSET_SRC,
    fromAssetMode: "actor",
    toAssetMode: "none",
  }),
];

const diningKitchenInitialRouteMeta: Readonly<Record<string, EditorRouteMeta>> = {
  "entry-to-counter": {
    id: "entry-to-counter",
    label: "门口 → 料理台",
    kind: "walk",
    accent: "cyan",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: diningEntryToCounterTransitions,
  },
  "counter-to-entry": {
    id: "counter-to-entry",
    label: "料理台 → 门口",
    kind: "walk",
    accent: "magenta",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: diningCounterToEntryTransitions,
  },
  "counter-to-table": {
    id: "counter-to-table",
    label: "料理台 → 餐桌",
    kind: "walk",
    accent: "amber",
    initialFacing: "right",
    foregroundPolicy: "none",
    assetLibrary: diningCounterToTableAssetLibrary,
    transitions: diningCounterToTableTransitions,
  },
  "table-to-counter": {
    id: "table-to-counter",
    label: "餐桌 → 料理台",
    kind: "walk",
    accent: "violet",
    initialFacing: "left",
    foregroundPolicy: "none",
    assetLibrary: diningTableToCounterAssetLibrary,
    transitions: diningTableToCounterTransitions,
  },
  "entry-to-table": {
    id: "entry-to-table",
    label: "门口 → 餐桌",
    kind: "walk",
    accent: "cyan",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: diningEntryToTableTransitions,
  },
  "table-to-entry": {
    id: "table-to-entry",
    label: "餐桌 → 门口",
    kind: "walk",
    accent: "magenta",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: diningTableToEntryTransitions,
  },
  "table-to-bathroom": {
    id: "table-to-bathroom",
    label: "餐桌 → 浴室",
    kind: "walk",
    accent: "violet",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: diningTableToBathroomTransitions,
  },
  "entry-to-bathroom": {
    id: "entry-to-bathroom",
    label: "门口 → 浴室",
    kind: "walk",
    accent: "cyan",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: diningEntryToBathroomTransitions,
  },
  "bathroom-to-entry": {
    id: "bathroom-to-entry",
    label: "浴室 → 门口",
    kind: "walk",
    accent: "amber",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: diningBathroomToEntryTransitions,
  },
};

export type DiningKitchenEndpointContractKind = "scene-interaction" | "scene-boundary" | "route-waypoint";

function splitDiningKitchenRouteDirection(value: string): [string, string] | null {
  const compact = value.replace(/\s/g, "").toLowerCase();
  const match = compact.match(/^(.+?)(?:→|->|-to-|_to_|到|至)(.+)$/);
  return match ? [match[1]!, match[2]!] : null;
}

/**
 * Describe the endpoint contract visible in the dining editor.
 *
 * The cooking counter and meal table are scene-state interactions even though
 * their movable points are stored as ordinary waypoints. Door/bathroom
 * endpoints are scene boundaries; all interior route points remain action
 * layer nodes. Route labels are used so cloned endpoint points retain the
 * same semantic meaning after a route is copied or reversed.
 */
export function diningKitchenEndpointContractKind(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: "start" | "middle" | "end",
): DiningKitchenEndpointContractKind {
  if (!point || position === "middle") return "route-waypoint";

  const labelDirection = splitDiningKitchenRouteDirection(meta.label);
  const keyDirection = splitDiningKitchenRouteDirection(routeKey);
  const sideIndex = position === "start" ? 0 : 1;
  const routeSide = labelDirection?.[sideIndex] ?? keyDirection?.[sideIndex] ?? "";
  const pointText = `${point.id} ${point.label}`.replace(/\s/g, "").toLowerCase();
  const contractText = `${routeSide} ${pointText}`;

  if (/(料理台|counter|kitchen)/.test(contractText) || /(餐桌|饭桌|table|meal)/.test(contractText)) {
    return "scene-interaction";
  }
  if (/(门口|入口|门|entry|door|浴室|bathroom)/.test(contractText)
    || point.role === "door"
    || point.role === "scene-entry") {
    return "scene-boundary";
  }
  return "route-waypoint";
}

export const TERRACE_GREENERY_MASTER_ASSET_SRC =
  "/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-paper-diorama-formal-v4-lossless.webp";
export const TERRACE_NIGHT_VIEW_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/terrace-greenery/terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless.webp";
const TERRACE_TURTLE_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/terrace-greenery/terrace-turtle-character-facing-right-asset-cropped-lossless.webp";
const TERRACE_WATERING_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/terrace-greenery/terrace-watering-character-asset-cropped-lossless.webp";

const terraceActionArrivalTransition = (pointId: string, source: string): EditorRouteTransition => ({
  pointId,
  kind: "state",
  targetStateId: "next-state",
  toAssetSource: source,
  toAssetMode: "actor",
  animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
});

const terraceActionDepartureTransition = (pointId: string, source: string): EditorRouteTransition => ({
  pointId,
  kind: "state",
  targetStateId: "next-state",
  fromAssetSource: source,
  fromAssetMode: "actor",
  animation: { ...DEFAULT_INITIAL_NODE_TRANSITION_ANIMATION },
});

/**
 * Initial terrace plan for the v4 lossless master. These are deliberately editable
 * semantic anchors; the user can refine the exact contact pixels in the
 * editor before the scene is promoted to the formal runtime.
 */
const terraceGreeneryInitialPoints: readonly EditorPoint[] = [
  {
    id: "terrace-entry",
    label: "露台梯口",
    role: "scene-entry",
    point: [284, 691],
  },
  {
    id: "terrace-bench",
    label: "长椅看夜景点",
    role: "lounge",
    point: [1259, 665],
  },
  {
    id: "turtle-pond",
    label: "小龟池照看点",
    role: "waypoint",
    point: [1242, 771],
  },
  {
    id: "terrace-telescope",
    label: "浇花点",
    role: "waypoint",
    point: [976, 603],
  },
];

const terraceGreeneryInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "entry-to-bench": ["terrace-entry", "terrace-bench"],
  "bench-to-entry": ["terrace-bench", "terrace-entry"],
  "entry-to-turtle-pond": ["terrace-entry", "turtle-pond"],
  "turtle-pond-to-entry": ["turtle-pond", "terrace-entry"],
  "entry-to-telescope": ["terrace-entry", "terrace-telescope"],
  "telescope-to-entry": ["terrace-telescope", "terrace-entry"],
};

const terraceGreeneryInitialRouteMeta: Readonly<Record<string, EditorRouteMeta>> = {
  "entry-to-bench": {
    id: "entry-to-bench",
    label: "梯口 → 长椅",
    kind: "walk",
    accent: "cyan",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: [terraceActionArrivalTransition("terrace-bench", TERRACE_NIGHT_VIEW_ACTOR_ASSET_SRC)],
  },
  "bench-to-entry": {
    id: "bench-to-entry",
    label: "长椅 → 梯口",
    kind: "walk",
    accent: "magenta",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: [terraceActionDepartureTransition("terrace-bench", TERRACE_NIGHT_VIEW_ACTOR_ASSET_SRC)],
  },
  "entry-to-turtle-pond": {
    id: "entry-to-turtle-pond",
    label: "梯口 → 小龟池",
    kind: "walk",
    accent: "amber",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: [terraceActionArrivalTransition("turtle-pond", TERRACE_TURTLE_ACTOR_ASSET_SRC)],
  },
  "turtle-pond-to-entry": {
    id: "turtle-pond-to-entry",
    label: "小龟池 → 梯口",
    kind: "walk",
    accent: "violet",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: [terraceActionDepartureTransition("turtle-pond", TERRACE_TURTLE_ACTOR_ASSET_SRC)],
  },
  "entry-to-telescope": {
    id: "entry-to-telescope",
    label: "梯口 → 浇花",
    kind: "walk",
    accent: "cyan",
    initialFacing: "right",
    foregroundPolicy: "none",
    transitions: [terraceActionArrivalTransition("terrace-telescope", TERRACE_WATERING_ACTOR_ASSET_SRC)],
  },
  "telescope-to-entry": {
    id: "telescope-to-entry",
    label: "浇花 → 梯口",
    kind: "walk",
    accent: "magenta",
    initialFacing: "left",
    foregroundPolicy: "none",
    transitions: [terraceActionDepartureTransition("terrace-telescope", TERRACE_WATERING_ACTOR_ASSET_SRC)],
  },
};

/** Initial editable plan for the new attic master. */
const atticInitialPoints: readonly EditorPoint[] = [
  {
    id: "attic-stair-entry",
    label: "阁楼梯口",
    role: "scene-entry",
    point: [1260, 700],
  },
  {
    id: "archive-shelf",
    label: "旧书架翻找点",
    role: "lounge",
    point: [960, 620],
  },
  {
    id: "attic-draft-desk",
    label: "旧稿桌整理点",
    role: "waypoint",
    point: [330, 650],
  },
];

const atticInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "stair-to-archive": ["attic-stair-entry", "archive-shelf"],
  "archive-to-stair": ["archive-shelf", "attic-stair-entry"],
  "stair-to-draft-desk": ["attic-stair-entry", "attic-draft-desk"],
  "draft-desk-to-stair": ["attic-draft-desk", "attic-stair-entry"],
};

/**
 * These two transparent action assets are normalized to the same 1024x1536
 * actor canvas as the ordinary walker.  Their source paths stay stable so
 * imported route drafts and the formal publisher do not need an attic-only
 * size correction.
 */
export const ATTIC_READING_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/attic/candidates/attic-character-reading-transparent-v1.webp";
export const ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC =
  "/assets/ecology/formal-scenes/attic/candidates/attic-character-retrieve-archive-transparent-v1.webp";

type AtticActionStateId = "attic-reading" | "attic-retrieve-archive";

const ATTIC_STATE_ASSET_LIBRARY: Readonly<Record<AtticActionStateId, NonNullable<EditorRouteAssetLibrary["states"]>[string]>> = {
  "attic-reading": {
    left: ATTIC_READING_ACTOR_ASSET_SRC,
    right: ATTIC_READING_ACTOR_ASSET_SRC,
    canonicalFacing: "right",
  },
  "attic-retrieve-archive": {
    left: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
    right: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
    canonicalFacing: "right",
  },
};

const ATTIC_ACTION_STATE_TRANSITION_ANIMATION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 1.5,
  durationMs: 720,
  settleMs: 140,
  easing: "smooth",
};

const ATTIC_INITIAL_NODE_SMOKE_ANIMATION: EditorTransitionAnimation = {
  ...ATTIC_ACTION_STATE_TRANSITION_ANIMATION,
  durationMs: 100,
  settleMs: 100,
};

const ATTIC_EXIT_SMOKE_ANIMATION: EditorTransitionAnimation = {
  ...ATTIC_ACTION_STATE_TRANSITION_ANIMATION,
  durationMs: 480,
  settleMs: 120,
};

const atticRouteAssetLibrary = (...stateIds: AtticActionStateId[]): EditorRouteAssetLibrary => ({
  states: Object.fromEntries(stateIds.map((stateId) => [stateId, { ...ATTIC_STATE_ASSET_LIBRARY[stateId] }])),
});

const atticInitialRouteMeta: Readonly<Record<string, EditorRouteMeta>> = {
  "stair-to-archive": {
    id: "stair-to-archive",
    label: "梯口 → 旧书架",
    kind: "walk",
    accent: "cyan",
    initialFacing: "left",
    foregroundPolicy: "none",
    assetLibrary: atticRouteAssetLibrary("attic-retrieve-archive"),
  },
  "archive-to-stair": {
    id: "archive-to-stair",
    label: "旧书架 → 梯口",
    kind: "walk",
    accent: "magenta",
    initialFacing: "right",
    foregroundPolicy: "none",
    assetLibrary: atticRouteAssetLibrary("attic-retrieve-archive"),
  },
  "stair-to-draft-desk": {
    id: "stair-to-draft-desk",
    label: "梯口 → 旧稿桌",
    kind: "walk",
    accent: "amber",
    initialFacing: "left",
    foregroundPolicy: "none",
    assetLibrary: atticRouteAssetLibrary("attic-reading"),
  },
  "draft-desk-to-stair": {
    id: "draft-desk-to-stair",
    label: "旧稿桌 → 梯口",
    kind: "walk",
    accent: "violet",
    initialFacing: "right",
    foregroundPolicy: "none",
    assetLibrary: atticRouteAssetLibrary("attic-reading"),
  },
};

/**
 * Starter anchors for the entrance transit hub. These are deliberately only
 * a planning scaffold: the user can drag them and publish a new route graph
 * without changing the mother image or inventing component pixels.
 */
const entranceInitialPoints: readonly EditorPoint[] = [
  {
    id: "entrance-home-door",
    label: "家门内侧入口",
    role: "scene-entry",
    anchorKind: "portal",
    anchorKey: "portal.entrance.home-door",
    point: [795, 600],
  },
  {
    id: "entrance-elevator",
    label: "电梯口",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.elevator",
    point: [236, 610],
  },
  {
    id: "entrance-mailbox",
    label: "信箱",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.mailbox",
    point: [356, 575],
  },
  {
    id: "entrance-postcard-rack",
    label: "明信片架",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.postcard-rack",
    point: [445, 575],
  },
  {
    id: "entrance-coat-rack",
    label: "衣帽架",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.coat-rack",
    point: [935, 585],
  },
  {
    id: "entrance-umbrella-rack",
    label: "雨伞位",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.umbrella-rack",
    point: [1002, 585],
  },
  {
    id: "entrance-outside-threshold",
    label: "外出楼梯口",
    role: "scene-entry",
    anchorKind: "portal",
    anchorKey: "portal.entrance.outside",
    point: [1215, 735],
  },
  {
    id: "entrance-night-view",
    label: "栏杆夜景",
    role: "waypoint",
    anchorKind: "interaction",
    anchorKey: "entrance.night-view",
    point: [1390, 620],
  },
];

const entranceInitialRoutes: Readonly<Record<string, readonly string[]>> = {
  "entrance-to-mailbox": ["entrance-home-door", "entrance-mailbox"],
  "mailbox-to-entrance": ["entrance-mailbox", "entrance-home-door"],
  "entrance-to-postcard-rack": ["entrance-home-door", "entrance-postcard-rack"],
  "postcard-rack-to-entrance": ["entrance-postcard-rack", "entrance-home-door"],
  "entrance-to-coat-rack": ["entrance-home-door", "entrance-coat-rack"],
  "coat-rack-to-entrance": ["entrance-coat-rack", "entrance-home-door"],
  "entrance-to-outside": ["entrance-home-door", "entrance-outside-threshold"],
  "outside-to-entrance": ["entrance-outside-threshold", "entrance-home-door"],
};

const entranceInitialRouteMeta: Readonly<Record<string, EditorRouteMeta>> = {
  "entrance-to-mailbox": { id: "entrance-to-mailbox", label: "家门 → 信箱", kind: "walk", accent: "cyan", initialFacing: "left" },
  "mailbox-to-entrance": {
    id: "mailbox-to-entrance",
    label: "信箱 → 家门",
    kind: "walk",
    accent: "magenta",
    initialFacing: "right",
    interactionEvents: [{ pointId: "entrance-mailbox", interactionId: "entrance-mailbox", stateId: "empty" }],
  },
  "entrance-to-postcard-rack": { id: "entrance-to-postcard-rack", label: "家门 → 明信片架", kind: "walk", accent: "amber", initialFacing: "left" },
  "postcard-rack-to-entrance": {
    id: "postcard-rack-to-entrance",
    label: "明信片架 → 家门",
    kind: "walk",
    accent: "violet",
    initialFacing: "right",
    interactionEvents: [{ pointId: "entrance-postcard-rack", interactionId: "entrance-postcard-rack", stateId: "empty" }],
  },
  "entrance-to-coat-rack": { id: "entrance-to-coat-rack", label: "家门 → 衣帽架", kind: "walk", accent: "cyan", initialFacing: "right" },
  "coat-rack-to-entrance": {
    id: "coat-rack-to-entrance",
    label: "衣帽架 → 家门",
    kind: "walk",
    accent: "magenta",
    initialFacing: "left",
    interactionEvents: [{ pointId: "entrance-coat-rack", interactionId: "entrance-coat-rack", stateId: "empty" }],
  },
  "entrance-to-outside": { id: "entrance-to-outside", label: "家门 → 外出楼梯口", kind: "walk", accent: "amber", initialFacing: "right" },
  "outside-to-entrance": {
    id: "outside-to-entrance",
    label: "外出楼梯口 → 家门",
    kind: "walk",
    accent: "violet",
    initialFacing: "left",
    interactionEvents: [{ pointId: "entrance-home-door", interactionId: "entrance-coat-rack", stateId: "on-rack" }],
  },
};

const entranceInitialSceneInteractions: Readonly<Record<string, EditorSceneInteraction>> = {
  "entrance-mailbox": {
    id: "entrance-mailbox",
    label: "信箱里的来信",
    kind: "pickup-prop",
    anchorPointId: "entrance-mailbox",
    initialStateId: "ready",
    assets: [{
      id: "entrance-mail-letter-asset",
      label: "母图提取·信件",
      src: "/assets/ecology/formal-scenes/entrance/interactions/entrance-mail-letter-extracted-v4.webp",
      mode: "scene",
      zIndex: 12,
      scale: 0.3,
      offset: [0, -36],
    }],
    states: [
      { id: "ready", label: "有信件", visibleAssetIds: ["entrance-mail-letter-asset"] },
      { id: "empty", label: "已取走", visibleAssetIds: [] },
    ],
  },
  "entrance-postcard-rack": {
    id: "entrance-postcard-rack",
    label: "明信片架",
    kind: "pickup-prop",
    anchorPointId: "entrance-postcard-rack",
    initialStateId: "ready",
    assets: [{
      id: "entrance-postcard-asset",
      label: "母图提取·明信片",
      src: "/assets/ecology/formal-scenes/entrance/interactions/entrance-postcard-extracted-v4.webp",
      mode: "scene",
      zIndex: 12,
      scale: 0.3,
      offset: [0, -32],
    }],
    states: [
      { id: "ready", label: "有可带走的明信片", visibleAssetIds: ["entrance-postcard-asset"] },
      { id: "empty", label: "已取走", visibleAssetIds: [] },
    ],
  },
  "entrance-coat-rack": {
    id: "entrance-coat-rack",
    label: "衣帽架上的外套",
    kind: "pickup-prop",
    anchorPointId: "entrance-coat-rack",
    initialStateId: "on-rack",
    assets: [{
      id: "entrance-coat-asset",
      label: "母图提取·外套",
      src: "/assets/ecology/formal-scenes/entrance/interactions/entrance-coat-extracted-v4.webp",
      mode: "scene",
      zIndex: 12,
      scale: 0.65,
      offset: [0, -8],
    }],
    states: [
      { id: "on-rack", label: "外套挂在架上", visibleAssetIds: ["entrance-coat-asset"] },
      { id: "empty", label: "外套已带走", visibleAssetIds: [] },
    ],
  },
  "entrance-umbrella-rack": {
    id: "entrance-umbrella-rack",
    label: "雨伞位",
    kind: "pickup-prop",
    anchorPointId: "entrance-umbrella-rack",
    initialStateId: "on-rack",
    assets: [{
      id: "entrance-umbrella-asset",
      label: "母图提取·雨伞",
      src: "/assets/ecology/formal-scenes/entrance/interactions/entrance-umbrella-extracted-v4.webp",
      mode: "scene",
      zIndex: 12,
      scale: 0.65,
      offset: [0, -8],
    }],
    states: [
      { id: "on-rack", label: "雨伞在架上", visibleAssetIds: ["entrance-umbrella-asset"] },
      { id: "carried", label: "雨伞已带走", visibleAssetIds: [] },
    ],
  },
};

const studyFloorPolygon = studySceneGeometry.floorPlanes.find((plane) => plane.id === "study-main-wood-floor")?.polygon ?? null;

const editorSceneProfiles: Record<EditorSceneId, EditorSceneProfile> = {
  study: {
    id: "study",
    label: "书房",
    description: "1774×887 重制版书房母图；书桌透明 alpha 是当前唯一遮挡层，路线点位可重新校准。",
    canvas: STUDY_EDITOR_CANVAS,
    masterSrc: "/assets/ecology/formal-scenes/study/study-scene-master-2x1-formal-v2.webp",
    masterAlt: "Study 2:1 formal mother image",
    foregroundSrc: "/assets/ecology/formal-scenes/study/geometry/foreground/study-chair-cutout-2x1-user-v1.webp",
    foregroundLabel: "用户确认椅子 Alpha（角色遮挡参考）",
    foregroundLayers: [
      {
        id: "desk-table",
        src: "/assets/ecology/formal-scenes/study/geometry/foreground/study-desk-table-cutout-2x1-imagegen-v2.webp",
        label: "桌子／桌面遮挡层",
        policy: "before-turn",
        zIndex: 5,
      },
      {
        id: "chair",
        src: "/assets/ecology/formal-scenes/study/geometry/foreground/study-chair-cutout-2x1-user-v1.webp",
        label: "用户确认椅子 Alpha（编辑辅助）",
        policy: "always",
        zIndex: 6,
      },
    ],
    floorPolygon: studyFloorPolygon,
    floorStatus: "frozen",
    protectedRouteKeys: Object.keys(studyInitialRoutes),
    initialPoints,
    initialRoutes: studyInitialRoutes,
    initialRouteMeta: INITIAL_ROUTE_META,
    defaultScale: { mode: "depth", farY: 410, nearY: 790, farScale: 0.87, nearScale: 1.42 },
    anchorSemantics: {
      door: "one shared door node used by both directions",
      seatLeft: "seat-left is the door-to-seat approach / sit-down point",
      seatRight: "seat-right is the seat-to-door release / departure point",
      fixedRightSideSeat: "study and dining chair actions may reuse one fixed right-side point",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
  bedroom: {
    id: "bedroom",
    label: "卧室",
    description: "1774×887 参考母图；床、唱片角和门口节点都可按图重新拖定。",
    canvas: BEDROOM_EDITOR_CANVAS,
    masterSrc: "/assets/ecology/formal-scenes/bedroom/bedroom-scene-master-2x1-formal-v1.webp",
    masterAlt: "Bedroom 2:1 reference mother image",
    foregroundSrc: "/assets/ecology/formal-scenes/bedroom/geometry/foreground/bedroom-bed-occluder-aligned-v1.webp",
    foregroundLabel: "床＋小沙发透明 alpha 遮挡层",
    foregroundLayers: [
      {
        id: "bedroom-furniture",
        src: "/assets/ecology/formal-scenes/bedroom/geometry/foreground/bedroom-bed-occluder-aligned-v1.webp",
        label: "床＋小沙发透明 alpha 遮挡层",
        policy: "always",
        zIndex: 5,
      },
    ],
    floorPolygon: null,
    floorStatus: "pending",
    protectedRouteKeys: Object.keys(bedroomInitialRoutes),
    initialPoints: bedroomInitialPoints,
    initialRoutes: bedroomInitialRoutes,
    initialRouteMeta: bedroomInitialRouteMeta,
    defaultScale: { mode: "depth", farY: 410, nearY: 820, farScale: 0.84, nearScale: 1.28 },
    anchorSemantics: {
      door: "bedroom door is one shared semantic anchor at pixel [1182, 455]",
      bedEdge: "bed-edge is the red-ring confirmed bed / record-player contact point at pixel [868, 357]",
      lounge: "lounge is the fixed contact area for the beanbag corner at pixel [1075, 579]",
      routeOwnedWaypoints: "ordinary waypoints belong to one route and are never shared implicitly",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
  "dining-kitchen": {
    id: "dining-kitchen",
    label: "餐厨",
    description: "1774×887 新版餐厨母图；先用三处共享锚点和独立方向节点规划路线。",
    canvas: DINING_KITCHEN_EDITOR_CANVAS,
    masterSrc: "/assets/ecology/formal-scenes/dining-kitchen/dining-kitchen-scene-master-2x1-formal-v1.webp",
    masterAlt: "Dining kitchen 2:1 formal mother image",
    foregroundSrc: null,
    foregroundLabel: "餐厨暂未配置透明遮挡层（当前只规划路线）",
    foregroundLayers: [],
    floorPolygon: [
      [90, 690],
      [430, 505],
      [820, 545],
      [1500, 625],
      [1660, 820],
      [1450, 875],
      [260, 875],
      [90, 820],
    ],
    floorStatus: "pending",
    protectedRouteKeys: Object.keys(diningKitchenInitialRoutes),
    initialPoints: diningKitchenInitialPoints,
    initialRoutes: diningKitchenInitialRoutes,
    initialRouteMeta: diningKitchenInitialRouteMeta,
    defaultScale: { mode: "depth", farY: 505, nearY: 820, farScale: 0.92, nearScale: 1.16 },
    anchorSemantics: {
      diningEntry: "dining-entry is the shared movable entry anchor at the left door / life corridor",
      kitchenCounter: "kitchen-counter is the shared movable cooking-counter interaction anchor",
      mealTable: "meal-table is the shared movable dining-table interaction anchor",
      routeOwnedWaypoints: "ordinary waypoints belong to one directed route and are never shared implicitly",
      foreground: "no full-scene transparent foreground is registered yet; do not use placement masks as a substitute",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
  entrance: {
    id: "entrance",
    label: "玄关",
    description: "1774×887 门外生活中转台；家门、信箱、衣帽架、电梯与外出楼梯都以显式语义锚点管理。",
    canvas: ENTRANCE_EDITOR_CANVAS,
    masterSrc: "/assets/ecology/formal-scenes/entrance/entrance-scene-master-transit-hub-v2-interaction-clean.webp",
    masterAlt: "玄关门外生活中转台纸板场景母图",
    foregroundSrc: null,
    foregroundLabel: "玄关暂未配置透明遮挡层；场景组件不等于遮挡层",
    foregroundLayers: [],
    floorPolygon: [
      [65, 520],
      [1080, 500],
      [1540, 575],
      [1650, 830],
      [1210, 875],
      [330, 875],
      [80, 760],
    ],
    floorStatus: "pending",
    protectedRouteKeys: Object.keys(entranceInitialRoutes),
    initialPoints: entranceInitialPoints,
    initialRoutes: entranceInitialRoutes,
    initialRouteMeta: entranceInitialRouteMeta,
    initialSceneInteractions: entranceInitialSceneInteractions,
    defaultScale: { mode: "depth", farY: 420, nearY: 820, farScale: 0.82, nearScale: 1.2 },
    anchorSemantics: {
      homeDoor: "portal.entrance.home-door 是室内与门外中转台的共享入口",
      elevator: "entrance.elevator 是左侧电梯交互点，不是场景出口",
      mailbox: "entrance.mailbox 是可取信件的持久场景组件锚点",
      postcardRack: "entrance.postcard-rack 是明信片架组件锚点",
      coatRack: "entrance.coat-rack 是外套在架上/被带走的组件锚点",
      umbrellaRack: "entrance.umbrella-rack 是雨伞在架上/被带走的组件锚点",
      outside: "portal.entrance.outside 是通往门外采风/场景旅程的出口",
      nightView: "entrance.night-view 是栏杆夜景观察点，不会瞬移到其它场景",
      componentContract: "场景组件独立于角色动作资产；路线只通过 interactionEvents 改变组件状态",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
  "terrace-greenery": {
    id: "terrace-greenery",
    label: "露台",
    description: "1774×887 露台母图；梯口、长椅、小龟池和望远镜四个交互锚点可直接拖动校准。",
    canvas: TERRACE_GREENERY_EDITOR_CANVAS,
    masterSrc: TERRACE_GREENERY_MASTER_ASSET_SRC,
    masterAlt: "露台纸板场景母图",
    foregroundSrc: null,
    foregroundLabel: "露台暂未配置透明遮挡层（当前只规划路线）",
    foregroundLayers: [],
    floorPolygon: null,
    floorStatus: "pending",
    protectedRouteKeys: Object.keys(terraceGreeneryInitialRoutes),
    initialPoints: terraceGreeneryInitialPoints,
    initialRoutes: terraceGreeneryInitialRoutes,
    initialRouteMeta: terraceGreeneryInitialRouteMeta,
    defaultScale: { mode: "depth", farY: 330, nearY: 760, farScale: 0.88, nearScale: 1.18 },
    anchorSemantics: {
      terraceEntry: "terrace-entry 是左下角维护梯的共享入口锚点",
      terraceBench: "terrace-bench 是长椅前方的看夜景交互点",
      turtlePond: "turtle-pond 是小龟池前方的照看交互点",
      telescope: "terrace-telescope 是花盆前方的浇花交互点（保留旧 ID 以兼容既有路线）",
      routeOwnedWaypoints: "普通 waypoint 只属于当前方向路线，不会隐式复用",
      foreground: "露台暂未注册透明遮挡层，不用摆放蒙版冒充正式遮挡物",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
  attic: {
    id: "attic",
    label: "阁楼",
    description: "1774×887 阁楼母图；梯口、旧书架和旧稿桌是第一轮可编辑交互锚点。",
    canvas: ATTIC_EDITOR_CANVAS,
    masterSrc: "/assets/ecology/formal-scenes/attic/masters/attic-scene-master-v2.webp",
    masterAlt: "阁楼纸板场景母图",
    foregroundSrc: null,
    foregroundLabel: "阁楼暂未配置透明遮挡层（当前只规划路线）",
    foregroundLayers: [],
    floorPolygon: null,
    floorStatus: "pending",
    protectedRouteKeys: Object.keys(atticInitialRoutes),
    initialPoints: atticInitialPoints,
    initialRoutes: atticInitialRoutes,
    initialRouteMeta: atticInitialRouteMeta,
    defaultScale: { mode: "depth", farY: 330, nearY: 760, farScale: 0.88, nearScale: 1.18 },
    anchorSemantics: {
      stairEntry: "attic-stair-entry 是下方中央梯口的共享入口锚点",
      archiveShelf: "archive-shelf 是中部书架前的旧稿翻找点",
      draftDesk: "attic-draft-desk 是左侧旧稿桌前的整理点",
      routeOwnedWaypoints: "普通 waypoint 只属于当前方向路线，不会隐式复用",
      foreground: "阁楼暂未注册透明遮挡层，不用摆放蒙版冒充正式遮挡物",
    },
    actorAssets: {
      left: { src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp", facing: "left" },
      right: { src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp", facing: "right" },
    },
  },
};

export function getEditorSceneProfile(sceneId: EditorSceneId): EditorSceneProfile {
  return editorSceneProfiles[sceneId];
}

export function createInitialEditorDraft(sceneId: EditorSceneId = "study"): EditorDraft {
  const profile = getEditorSceneProfile(sceneId);
  const initialDraft: EditorDraft = {
    version: 2,
    sceneId,
    canvas: { ...profile.canvas },
    pointsById: Object.fromEntries(profile.initialPoints.map((point) => [point.id, { ...point, point: [...point.point] as SceneGeometryPoint }])),
    routes: Object.fromEntries(Object.entries(profile.initialRoutes).map(([id, route]) => [id, [...route]])),
    routeMeta: Object.fromEntries(Object.entries(profile.initialRouteMeta).map(([id, meta]) => [id, { ...meta }])),
    ...(profile.initialSceneInteractions
      ? {
          sceneInteractions: Object.fromEntries(Object.entries(profile.initialSceneInteractions).map(([id, interaction]) => [
            id,
            {
              ...interaction,
              assets: interaction.assets.map((asset) => ({
                ...asset,
                ...(asset.offset ? { offset: [...asset.offset] as [number, number] } : {}),
              })),
              states: interaction.states.map((state) => ({ ...state, visibleAssetIds: [...state.visibleAssetIds] })),
            },
          ])),
        }
      : {}),
    scale: { ...profile.defaultScale },
  };
  if (sceneId === "bedroom") {
    return ensureBedroomFormalStateTransitions(ensureBedroomFacingRoutes(initialDraft));
  }
  if (sceneId === "attic") {
    return ensureAtticFormalStateTransitions(initialDraft);
  }
  return ensureStudyTerminalStateTransitions(initialDraft);
}

export const STUDY_WRITING_SCENE_STATE_SRC = "/assets/ecology/formal-scenes/study/states/study-writing-seat-scene-v9-paper-base-mother-locked.webp";
export const STUDY_WALK_LEFT_ACTOR_ASSET_SRC = "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp";
export const STUDY_WALK_RIGHT_ACTOR_ASSET_SRC = "/assets/ecology/characters/novelist/study-walk-right-v2.webp";
/**
 * Kept for backwards compatibility with old drafts and the editor preview.
 * New cross-scene exits use `toAssetMode: "none"` and do not use this image
 * as a hidden placeholder anymore.
 */
export const STUDY_EXIT_TRANSPARENT_ACTOR_SRC = "/assets/ecology/characters/novelist/study-exit-transparent-v1.webp";

function semanticRoleForStudyPoint(point: EditorPoint): EditorAnchorRole | undefined {
  if (point.role !== "waypoint") return point.role;
  if (point.semanticRole && point.semanticRole !== "waypoint") return point.semanticRole;

  // Older saved drafts cloned seat/door endpoints into plain waypoints before
  // semanticRole existed. Recover only exact/near-exact semantic anchors; an
  // ordinary waypoint that the user moved elsewhere remains route-owned.
  const match = initialPoints.find((candidate) => (
    candidate.role !== "waypoint"
      && Math.hypot(candidate.point[0] - point.point[0], candidate.point[1] - point.point[1]) <= 8
  ));
  return match?.role;
}

function normalizeStudyPointSemantics(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "study") return draft;
  const pointsById = { ...draft.pointsById };
  let changed = false;
  for (const [pointId, point] of Object.entries(pointsById)) {
    if (point.role !== "waypoint" || point.semanticRole) continue;
    const semanticRole = semanticRoleForStudyPoint(point);
    if (!semanticRole || semanticRole === "waypoint") continue;
    pointsById[pointId] = { ...point, semanticRole };
    changed = true;
  }
  return changed ? { ...draft, pointsById } : draft;
}

function routeLabelIndicatesDeskArrival(label: string): boolean {
  const compact = label.replace(/\s/g, "");
  const arrowIndex = compact.search(/[→>-]/);
  if (arrowIndex < 0) return false;
  const from = compact.slice(0, arrowIndex);
  const to = compact.slice(arrowIndex + 1);
  return /阁楼|閣樓/.test(from) && /桌|书房|書房/.test(to);
}

function routeKeyIndicatesDeskArrival(routeKey: string): boolean {
  // Route keys are directed. Checking only whether both "attic" and
  // "study" occur makes `study-to-attic` look like an arrival at the desk,
  // which incorrectly installs the writing scene at an external exit.
  const normalized = routeKey
    .trim()
    .toLowerCase()
    .replace(/[→>]/g, "-to-")
    .replace(/_/g, "-");
  const separator = normalized.indexOf("-to-");
  if (separator < 0) return false;
  const from = normalized.slice(0, separator);
  const to = normalized.slice(separator + 4);
  return /(attic|阁楼)/.test(from) && /(desk|study|书桌|书房)/.test(to);
}

const DEFAULT_TERMINAL_SMOKE_ANIMATION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 2,
  durationMs: 300,
  settleMs: 120,
  easing: "smooth",
};

const DEFAULT_EXTERNAL_ENTRY_SMOKE_ANIMATION: EditorTransitionAnimation = {
  style: "smoke",
  turns: 1,
  durationMs: 100,
  settleMs: 100,
  easing: "smooth",
};

export type StudyEndpointContractKind = "scene-interaction" | "scene-boundary" | "route-waypoint";

function studyWalkAssetForFacing(facing: EditorFacingDirection): string {
  return facing === "left"
    ? STUDY_WALK_LEFT_ACTOR_ASSET_SRC
    : STUDY_WALK_RIGHT_ACTOR_ASSET_SRC;
}

function studyRouteIsDeskArrival(routeKey: string, meta: EditorRouteMeta): boolean {
  return routeLabelIndicatesDeskArrival(meta.label) || routeKeyIndicatesDeskArrival(routeKey);
}

/**
 * Describe the visual contract of a study route point for the editor.
 *
 * The study only has one local scene-state interaction: the writing chair
 * (including a route-owned clone carrying `semanticRole`). Every other route
 * endpoint is a scene boundary unless it is an explicitly named arrival at
 * the writing desk from another scene. Ordinary points in the middle remain
 * movement/action-layer points.
 */
export function studyEndpointContractKind(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: "start" | "middle" | "end",
): StudyEndpointContractKind {
  if (!point) return "route-waypoint";
  const semanticRole = semanticRoleForStudyPoint(point);
  if (semanticRole === "seat-left" || semanticRole === "seat-right") return "scene-interaction";
  if (position === "end" && studyRouteIsDeskArrival(routeKey, meta)) return "scene-interaction";
  if (position !== "middle") return "scene-boundary";
  return "route-waypoint";
}

function studyStateTransitionAtPoint(
  transitions: readonly EditorRouteTransition[] | undefined,
  pointId: string,
): EditorRouteTransition | undefined {
  return transitions?.find((transition) => (
    transition.kind === "state" && transition.pointId === pointId
  ));
}

/**
 * Give every study route an explicit endpoint visual contract.
 *
 * - scene interaction endpoint: actor -> the writing scene composite;
 * - scene boundary at route start: none -> the transparent walking actor;
 * - scene boundary at route end: transparent walking actor -> none.
 *
 * Only endpoint state events are replaced. Geometry, route order, mirror
 * events, layer events, and every midpoint state/action event remain authored
 * data. This also repairs reversed/copied routes that carried a scene state
 * onto their first external node.
 */
export function ensureStudyTerminalStateTransitions(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "study") return draft;

  const semanticDraft = normalizeStudyPointSemantics(draft);
  const routeMeta = { ...(semanticDraft.routeMeta ?? {}) };
  let changed = semanticDraft !== draft;

  for (const [routeKey, routeIds] of Object.entries(semanticDraft.routes)) {
    const meta = routeMeta[routeKey] ?? INITIAL_ROUTE_META[routeKey];
    const endPointId = routeIds.at(-1);
    const endPoint = endPointId ? semanticDraft.pointsById[endPointId] : undefined;
    if (!meta || meta.kind !== "walk" || !endPointId || !endPoint) continue;

    const startPointId = routeIds[0];
    const startPoint = startPointId ? semanticDraft.pointsById[startPointId] : undefined;
    const endSemanticRole = semanticRoleForStudyPoint(endPoint);
    const isExternalDeskArrival = studyRouteIsDeskArrival(routeKey, meta);
    const reachesChair = endSemanticRole === "seat-left"
      || endSemanticRole === "seat-right"
      || isExternalDeskArrival;
    const startContract = studyEndpointContractKind(
      routeKey,
      meta,
      startPoint,
      "start",
    );
    const endContract = studyEndpointContractKind(
      routeKey,
      meta,
      endPoint,
      "end",
    );
    const previousTransitions = meta.transitions ?? [];
    const existingEnd = studyStateTransitionAtPoint(previousTransitions, endPointId);
    const startIsExternal = startContract === "scene-boundary";
    const endIsExternal = endContract === "scene-boundary";
    const startFacing = startPointId
      ? routeFacingAtProgress(routeIds, semanticDraft.pointsById, meta, 0)
      : "right";
    const endFacing = routeFacingAtProgress(routeIds, semanticDraft.pointsById, meta, 1);

    const required: EditorRouteTransition[] = [];
    if (startIsExternal && startPointId) {
      required.push({
        pointId: startPointId,
        kind: "state",
        targetStateId: "walking",
        fromAssetMode: "none",
        toAssetSource: studyWalkAssetForFacing(startFacing),
        toAssetMode: "actor",
        animation: { ...DEFAULT_EXTERNAL_ENTRY_SMOKE_ANIMATION },
      });
    }

    if (reachesChair) {
      required.push({
        ...(existingEnd ?? {}),
        pointId: endPointId,
        kind: "state",
        targetStateId: "writing-seat",
        toAssetSource: existingEnd?.toAssetSource ?? STUDY_WRITING_SCENE_STATE_SRC,
        toAssetMode: "scene",
        animation: {
          ...DEFAULT_TERMINAL_SMOKE_ANIMATION,
          turns: Math.max(2, existingEnd?.animation.turns ?? DEFAULT_TERMINAL_SMOKE_ANIMATION.turns),
        },
      });
    } else if (endIsExternal) {
      const { toAssetSource: _toAssetSource, ...withoutToAssetSource } = existingEnd ?? {};
      required.push({
        ...withoutToAssetSource,
        pointId: endPointId,
        kind: "state",
        targetStateId: "gone",
        fromAssetSource: existingEnd?.fromAssetSource ?? studyWalkAssetForFacing(endFacing),
        fromAssetMode: "actor",
        toAssetMode: "none",
        animation: {
          ...DEFAULT_TERMINAL_SMOKE_ANIMATION,
          turns: Math.max(2, existingEnd?.animation.turns ?? DEFAULT_TERMINAL_SMOKE_ANIMATION.turns),
        },
      });
    }

    if (required.length === 0) continue;
    const endpointIds = new Set([startPointId, endPointId].filter((pointId): pointId is string => Boolean(pointId)));
    const nextTransitions = [
      ...previousTransitions.filter((transition) => (
        transition.kind !== "state" || !endpointIds.has(transition.pointId)
      )),
      ...required,
    ];
    const nextMeta: EditorRouteMeta = { ...meta, transitions: nextTransitions };
    const previousSignature = JSON.stringify(meta.transitions ?? []);
    const nextSignature = JSON.stringify(nextTransitions);
    if (previousSignature !== nextSignature || !routeMeta[routeKey]) changed = true;
    routeMeta[routeKey] = nextMeta;
  }

  return changed ? { ...semanticDraft, routeMeta } : semanticDraft;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function depthScaleAtY(y: number, settings: EditorScaleSettings): number {
  const span = Math.max(1, settings.nearY - settings.farY);
  const progress = clamp((y - settings.farY) / span, 0, 1);
  return settings.farScale + (settings.nearScale - settings.farScale) * progress;
}

/** Return the distance-normalized progress at an explicit route waypoint. */
export function routeProgressAtPoint(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  pointId: string,
): number {
  const points = routeIds
    .map((id) => pointsById[id])
    .filter((point): point is EditorPoint => Boolean(point));
  const targetIndex = points.findIndex((point) => point.id === pointId);
  if (targetIndex === -1) return 0;
  if (targetIndex === 0 || points.length < 2) return 0;

  const totalLength = points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]!;
    return sum + Math.hypot(point.point[0] - previous.point[0], point.point[1] - previous.point[1]);
  }, 0);
  if (totalLength === 0) return targetIndex === points.length - 1 ? 1 : 0;

  const distanceToTarget = points.slice(1, targetIndex + 1).reduce((sum, point, index) => {
    const previous = points[index]!;
    return sum + Math.hypot(point.point[0] - previous.point[0], point.point[1] - previous.point[1]);
  }, 0);
  return distanceToTarget / totalLength;
}

/** Return the geometric length of a route in editor-canvas pixels. */
export function routeLengthPx(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
): number {
  const points = routeIds
    .map((id) => pointsById[id])
    .filter((point): point is EditorPoint => Boolean(point));
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]!;
    return sum + Math.hypot(point.point[0] - previous.point[0], point.point[1] - previous.point[1]);
  }, 0);
}

/**
 * Convert a route length into playback time. The editor's speed selector is a
 * multiplier over one constant canvas-space walking speed, so changing the
 * number of waypoints or the route shape cannot change the character's speed.
 */
export function routePlaybackDurationMs(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  speedMultiplier: number,
  pixelsPerSecondAtOneX = 114,
): number {
  const safeMultiplier = Math.max(0.1, Number.isFinite(speedMultiplier) ? speedMultiplier : 1);
  const length = routeLengthPx(routeIds, pointsById);
  if (length <= 0) return 600;
  return Math.max(300, Math.round((length / (pixelsPerSecondAtOneX * safeMultiplier)) * 1000));
}

export function pointScale(point: EditorPoint, settings: EditorScaleSettings): number {
  if (typeof point.scaleOverride === "number") return point.scaleOverride;
  if (settings.mode === "manual") return 1;
  return depthScaleAtY(point.point[1], settings);
}

export function routeSampleAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  settings: EditorScaleSettings,
  progress: number,
): EditorRouteSample {
  const points = routeIds
    .map((id) => pointsById[id])
    .filter((point): point is EditorPoint => Boolean(point));
  if (points.length === 0) return { point: [0, 0], pointId: "", scale: 1 };
  if (points.length === 1) {
    const only = points[0]!;
    return { point: only.point, pointId: only.id, scale: pointScale(only, settings) };
  }

  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.point[0] - previous.point[0], point.point[1] - previous.point[1]);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) {
    const last = points.at(-1)!;
    return { point: last.point, pointId: last.id, scale: pointScale(last, settings) };
  }

  let remaining = clamp(progress, 0, 1) * totalLength;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index]!;
    if (remaining <= segmentLength || index === lengths.length - 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      const local = segmentLength === 0 ? 1 : remaining / segmentLength;
      return {
        point: [
          start.point[0] + (end.point[0] - start.point[0]) * local,
          start.point[1] + (end.point[1] - start.point[1]) * local,
        ],
        pointId: local < 0.5 ? start.id : end.id,
        scale: pointScale(start, settings) + (pointScale(end, settings) - pointScale(start, settings)) * local,
      };
    }
    remaining -= segmentLength;
  }

  const last = points.at(-1)!;
  return { point: last.point, pointId: last.id, scale: pointScale(last, settings) };
}

function inferFacing(points: readonly EditorPoint[], fallback: EditorFacingDirection = "right"): EditorFacingDirection {
  const start = points[0];
  const end = points[1];
  if (!start || !end || Math.abs(end.point[0] - start.point[0]) < 0.01) return fallback;
  return end.point[0] > start.point[0] ? "right" : "left";
}

export function routeFacingAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
  progress: number,
): EditorFacingDirection {
  const points = routeIds
    .map((id) => pointsById[id])
    .filter((point): point is EditorPoint => Boolean(point));
  const transitions = editorRouteTransitions(routeIds, pointsById, meta);
  const startPointId = routeIds[0];
  // A facing event on the first node is an old/accidental way of encoding the
  // initial direction. Treat an explicit target as the baseline, rather than
  // toggling once at progress 0 and potentially toggling back at the real
  // mid-route mirror event.
  const startFacing = transitions.find((transition) => (
    transition.kind === "facing" && transition.pointId === startPointId
  ));
  // The kitchen editor lets the user reshape its first segment freely. Saved
  // metadata may predate that dragging, so those routes must derive departure
  // facing from the current geometry. Other scenes retain their explicit
  // authored initial-facing contract (some of them intentionally begin on a
  // near-vertical segment).
  const pathDrivenInitialFacing = new Set([
    "entry-to-counter",
    "counter-to-entry",
    "counter-to-table",
    "table-to-counter",
    "entry-to-table",
    "table-to-entry",
    "table-to-bathroom",
    "entry-to-bathroom",
    "bathroom-to-entry",
  ]).has(meta.id);
  const inferredFacing = inferFacing(points, meta.initialFacing ?? "right");
  const initialFacing = startFacing?.facing
    ?? (pathDrivenInitialFacing ? inferredFacing : meta.initialFacing ?? inferredFacing);
  let facing = initialFacing;
  for (const transition of transitions) {
    if (transition.kind !== "facing") continue;
    if (transition.pointId === startPointId) continue;
    const transitionProgress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
    if (clamp(progress, 0, 1) < transitionProgress) break;
    facing = transition.facing ?? (facing === "left" ? "right" : "left");
  }
  return facing;
}

function oppositeEditorFacing(facing: EditorFacingDirection): EditorFacingDirection {
  return facing === "left" ? "right" : "left";
}

/**
 * Build the facing contract for a route copied in reverse order.
 *
 * A reverse route is not obtained by independently negating the source
 * metadata. If the forward route is L -> R at a midpoint, the reverse route
 * starts at the opposite of the forward final direction and changes to the
 * opposite of the forward pre-turn direction at that same physical point.
 */
export function reverseRouteFacingContract(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
): {
  initialFacing: EditorFacingDirection;
  facingBySourcePointId: ReadonlyMap<string, EditorFacingDirection>;
} {
  const facingTransitions = editorRouteTransitions(routeIds, pointsById, meta)
    .filter((transition) => transition.kind === "facing")
    .sort((left, right) => routeIds.indexOf(left.pointId) - routeIds.indexOf(right.pointId));
  const sourceInitialFacing = routeFacingAtProgress(routeIds, pointsById, meta, 0);
  let sourceCurrentFacing = sourceInitialFacing;
  const facingBySourcePointId = new Map<string, EditorFacingDirection>();
  const finalPointId = routeIds.at(-1);

  for (const transition of facingTransitions) {
    const sourceIndex = routeIds.indexOf(transition.pointId);
    if (sourceIndex < 0) continue;

    // A first-node facing event is the departure baseline, not a second turn.
    // It becomes the explicit final baseline after reversing the route.
    if (sourceIndex === 0) {
      facingBySourcePointId.set(transition.pointId, oppositeEditorFacing(sourceInitialFacing));
      continue;
    }

    const sourceBeforeFacing = sourceCurrentFacing;
    const sourceAfterFacing = transition.facing
      ?? oppositeEditorFacing(sourceBeforeFacing);
    sourceCurrentFacing = sourceAfterFacing;

    // An event on the source endpoint becomes the reversed route's departure
    // baseline. Middle events reverse the state that existed before the
    // forward event. Both are explicit to avoid toggle-order ambiguity.
    const reversedFacing = transition.pointId === finalPointId
      ? oppositeEditorFacing(sourceAfterFacing)
      : oppositeEditorFacing(sourceBeforeFacing);
    facingBySourcePointId.set(transition.pointId, reversedFacing);
  }

  return {
    initialFacing: oppositeEditorFacing(sourceCurrentFacing),
    facingBySourcePointId,
  };
}

export function routeForegroundVisibleAtProgress(
  meta: EditorRouteMeta,
  progress: number,
  turnProgress: number | null,
  obstacleLayerVisible: boolean,
): boolean {
  if (!obstacleLayerVisible || meta.foregroundPolicy === "none") return false;
  if (meta.foregroundPolicy === "always") return true;
  if (turnProgress === null) return meta.foregroundPolicy === "before-turn";
  return meta.foregroundPolicy === "before-turn"
    ? clamp(progress, 0, 1) < turnProgress
    : clamp(progress, 0, 1) >= turnProgress;
}

/**
 * Return the inherited per-obstacle layer state at this point in a route.
 * Each layer event is a partial update: keys omitted by a later event keep
 * the state from the previous event.
 */
export function routeLayerModesAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
  progress: number,
): Readonly<EditorLayerModes> {
  const clampedProgress = clamp(progress, 0, 1);
  const layerModes: EditorLayerModes = {};
  for (const transition of editorRouteTransitions(routeIds, pointsById, meta)) {
    if (transition.kind !== "layer") continue;
    const transitionProgress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
    if (clampedProgress < transitionProgress) break;
    if (transition.layerModes) Object.assign(layerModes, transition.layerModes);
    if (transition.layerMode) layerModes["*"] = transition.layerMode;
  }
  return layerModes;
}

/** Backwards-compatible summary for old callers that only understand a global layer mode. */
export function routeLayerModeAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
  progress: number,
): EditorLayerMode | null {
  const layerModes = routeLayerModesAtProgress(routeIds, pointsById, meta, progress);
  return layerModes["*"] ?? null;
}

function foregroundLayerVisibleAtProgress(
  policy: EditorForegroundLayerPolicy,
  meta: EditorRouteMeta,
  progress: number,
  turnProgress: number | null,
): boolean {
  if (policy === "always") return true;
  if (!meta.foregroundPolicy || meta.foregroundPolicy === "none") return false;
  if (policy === "before-turn") {
    if (meta.foregroundPolicy === "always") return true;
    if (meta.foregroundPolicy === "before-turn") {
      return turnProgress === null || clamp(progress, 0, 1) < turnProgress;
    }
    return false;
  }
  if (meta.foregroundPolicy === "always") return turnProgress !== null && clamp(progress, 0, 1) >= turnProgress;
  if (meta.foregroundPolicy === "after-turn") {
    return turnProgress === null || clamp(progress, 0, 1) >= turnProgress;
  }
  return false;
}

export function editorForegroundLayersAtProgress(
  meta: EditorRouteMeta,
  progress: number,
  turnProgress: number | null,
  obstacleLayerVisible: boolean,
  layers: readonly EditorForegroundLayer[],
  routeIds?: readonly string[],
  pointsById?: Readonly<Record<string, EditorPoint>>,
): readonly EditorForegroundLayer[] {
  if (!obstacleLayerVisible) return [];
  const layerModes = routeIds && pointsById
    ? routeLayerModesAtProgress(routeIds, pointsById, meta, progress)
    : {};
  return layers.filter((layer) => {
    const explicitMode = layerModes[layer.id] ?? layerModes["*"];
    if (explicitMode === "actor-front") return false;
    if (explicitMode === "obstacle-front") return true;
    return foregroundLayerVisibleAtProgress(layer.policy, meta, progress, turnProgress);
  });
}

function isEditorFacingDirection(value: unknown): value is EditorFacingDirection {
  return value === "left" || value === "right";
}

function isEditorLayerMode(value: unknown): value is EditorLayerMode {
  return value === "actor-front" || value === "obstacle-front";
}

function isEditorLayerModes(value: unknown): value is EditorLayerModes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([layerId, mode]) => (
    layerId.trim().length > 0 && isEditorLayerMode(mode)
  ));
}

function normalizeEditorLayerModes(value: unknown): EditorLayerModes | undefined {
  if (!isEditorLayerModes(value)) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(value).map(([layerId, mode]) => [layerId.trim(), mode]),
  ) as EditorLayerModes;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isEditorTransitionAnimation(value: unknown): value is EditorTransitionAnimation {
  if (!value || typeof value !== "object") return false;
  const animation = value as Partial<EditorTransitionAnimation>;
  return (animation.style === "mirror"
      || animation.style === "spin"
      || animation.style === "smoke"
      || animation.style === "scene-switch")
    && typeof animation.turns === "number"
    && Number.isFinite(animation.turns)
    && animation.turns > 0
    && animation.turns <= 8
    && typeof animation.durationMs === "number"
    && Number.isFinite(animation.durationMs)
    && animation.durationMs >= 80
    && animation.durationMs <= 5000
    && typeof animation.settleMs === "number"
    && Number.isFinite(animation.settleMs)
    && animation.settleMs >= 0
    && animation.settleMs <= 3000
    && (animation.easing === "smooth" || animation.easing === "elastic" || animation.easing === "linear");
}

function isEditorTransitionAssetMode(value: unknown): value is EditorTransitionAssetMode {
  return value === "actor" || value === "scene" || value === "none";
}

export function isEditorRouteTransition(value: unknown): value is EditorRouteTransition {
  if (!value || typeof value !== "object") return false;
  const transition = value as Partial<EditorRouteTransition>;
  return typeof transition.pointId === "string"
    && transition.pointId.length > 0
    && (transition.kind === "facing" || transition.kind === "state" || transition.kind === "layer")
    && (transition.facing === undefined || isEditorFacingDirection(transition.facing))
    && (transition.targetStateId === undefined || typeof transition.targetStateId === "string")
    && (transition.layerMode === undefined || isEditorLayerMode(transition.layerMode))
    && (transition.layerModes === undefined || isEditorLayerModes(transition.layerModes))
    && (transition.fromAssetSource === undefined || typeof transition.fromAssetSource === "string")
    && (transition.fromAssetMode === undefined || isEditorTransitionAssetMode(transition.fromAssetMode))
    && (transition.fromAssetFacing === undefined || isEditorFacingDirection(transition.fromAssetFacing))
    && (transition.fromAssetScale === undefined || isEditorTransitionAssetScale(transition.fromAssetScale))
    && (transition.toAssetSource === undefined || typeof transition.toAssetSource === "string")
    && (transition.toAssetMode === undefined || isEditorTransitionAssetMode(transition.toAssetMode))
    && (transition.toAssetFacing === undefined || isEditorFacingDirection(transition.toAssetFacing))
    && (transition.toAssetScale === undefined || isEditorTransitionAssetScale(transition.toAssetScale))
    && isEditorTransitionAnimation(transition.animation);
}

function isEditorTransitionAssetScale(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 8;
}

function normalizeEditorTransition(value: unknown): EditorRouteTransition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    pointId?: unknown;
    kind?: unknown;
    facing?: unknown;
    targetStateId?: unknown;
    layerMode?: unknown;
    layerModes?: unknown;
    fromAssetSource?: unknown;
    fromAssetMode?: unknown;
    fromAssetFacing?: unknown;
    fromAssetScale?: unknown;
    toAssetSource?: unknown;
    toAssetMode?: unknown;
    toAssetFacing?: unknown;
    toAssetScale?: unknown;
    animation?: Partial<EditorTransitionAnimation>;
  };
  if (typeof raw.pointId !== "string" || raw.pointId.length === 0) return null;
  if (raw.kind !== "facing" && raw.kind !== "state" && raw.kind !== "layer") return null;
  const rawAnimation = raw.animation && typeof raw.animation === "object" ? raw.animation : {};
  const style = rawAnimation.style === "scene-switch"
    ? "scene-switch"
    : rawAnimation.style === "spin"
    ? "spin"
    : rawAnimation.style === "smoke"
      ? "smoke"
      : "mirror";
  const turns = typeof rawAnimation.turns === "number" && Number.isFinite(rawAnimation.turns)
    ? clamp(rawAnimation.turns, 0.5, 8)
    : DEFAULT_EDITOR_TRANSITION_ANIMATION.turns;
  const durationMs = typeof rawAnimation.durationMs === "number" && Number.isFinite(rawAnimation.durationMs)
    ? clamp(Math.round(rawAnimation.durationMs), 80, 5000)
    : DEFAULT_EDITOR_TRANSITION_ANIMATION.durationMs;
  const settleMs = typeof rawAnimation.settleMs === "number" && Number.isFinite(rawAnimation.settleMs)
    ? clamp(Math.round(rawAnimation.settleMs), 0, 3000)
    : DEFAULT_EDITOR_TRANSITION_ANIMATION.settleMs;
  const easing = rawAnimation.easing === "linear" || rawAnimation.easing === "smooth"
    ? rawAnimation.easing
    : "elastic";
  const normalizedLayerModes = normalizeEditorLayerModes(raw.layerModes);
  const fromAssetScale = typeof raw.fromAssetScale === "number" && Number.isFinite(raw.fromAssetScale) && raw.fromAssetScale > 0
    ? clamp(raw.fromAssetScale, 0.01, 8)
    : undefined;
  const toAssetScale = typeof raw.toAssetScale === "number" && Number.isFinite(raw.toAssetScale) && raw.toAssetScale > 0
    ? clamp(raw.toAssetScale, 0.01, 8)
    : undefined;
  return {
    pointId: raw.pointId,
    kind: raw.kind,
    ...(isEditorFacingDirection(raw.facing) ? { facing: raw.facing } : {}),
    ...(typeof raw.targetStateId === "string" && raw.targetStateId.trim().length > 0
      ? { targetStateId: raw.targetStateId.trim() }
      : {}),
    ...(typeof raw.fromAssetSource === "string" && raw.fromAssetSource.trim().length > 0
      ? { fromAssetSource: raw.fromAssetSource.trim() }
      : {}),
    ...(isEditorTransitionAssetMode(raw.fromAssetMode) ? { fromAssetMode: raw.fromAssetMode } : {}),
    ...(isEditorFacingDirection(raw.fromAssetFacing) ? { fromAssetFacing: raw.fromAssetFacing } : {}),
    ...(fromAssetScale !== undefined ? { fromAssetScale } : {}),
    ...(typeof raw.toAssetSource === "string" && raw.toAssetSource.trim().length > 0
      ? { toAssetSource: raw.toAssetSource.trim() }
      : {}),
    ...(isEditorTransitionAssetMode(raw.toAssetMode) ? { toAssetMode: raw.toAssetMode } : {}),
    ...(isEditorFacingDirection(raw.toAssetFacing) ? { toAssetFacing: raw.toAssetFacing } : {}),
    ...(toAssetScale !== undefined ? { toAssetScale } : {}),
    ...(raw.kind === "layer"
      ? {
          ...(isEditorLayerMode(raw.layerMode) ? { layerMode: raw.layerMode } : {}),
          ...(normalizedLayerModes
            ? { layerModes: normalizedLayerModes }
            : !isEditorLayerMode(raw.layerMode) ? { layerMode: "obstacle-front" as const } : {}),
        }
      : {}),
    animation: { style, turns, durationMs, settleMs, easing },
  };
}

/** Keep only route-local events, deduplicate same-kind events at one point, and clamp imported animation values. */
export function normalizeEditorRouteTransitions(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  transitions: readonly unknown[],
): EditorRouteTransition[] {
  const seen = new Set<string>();
  return transitions
    .map(normalizeEditorTransition)
    .filter((transition): transition is EditorRouteTransition => Boolean(transition))
    .filter((transition) => routeIds.includes(transition.pointId) && Boolean(pointsById[transition.pointId]))
    .filter((transition) => {
      const key = `${transition.kind}:${transition.pointId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Keep the first-node transition responsive in the three active scene editors.
 * This is intentionally limited to the two timing fields: event kind, asset
 * contract, route geometry, route order, and all midpoint/terminal settings
 * remain authored data. Loading an older local draft therefore upgrades only
 * the start-event timing to the current 100/100 default.
 */
export function ensureInitialNodeTransitionAnimationDefaults(draft: EditorDraft): EditorDraft {
  if (!(["study", "dining-kitchen", "bedroom", "entrance", "terrace-greenery", "attic"] as EditorSceneId[]).includes(draft.sceneId)) return draft;

  const routeMeta = { ...(draft.routeMeta ?? {}) };
  let changed = false;
  for (const [routeKey, routeIds] of Object.entries(draft.routes)) {
    const startPointId = routeIds[0];
    const meta = routeMeta[routeKey];
    if (!startPointId || !meta?.transitions?.length) continue;
    const transitions = meta.transitions.map((transition) => {
      if (transition.pointId !== startPointId) return transition;
      if (transition.animation.durationMs === 100 && transition.animation.settleMs === 100) return transition;
      changed = true;
      return {
        ...transition,
        animation: {
          ...transition.animation,
          durationMs: 100,
          settleMs: 100,
        },
      };
    });
    if (transitions !== meta.transitions) routeMeta[routeKey] = { ...meta, transitions };
  }

  return changed ? { ...draft, routeMeta } : draft;
}

/**
 * Return explicit route events and, for old drafts, synthesize the previous single facing event.
 * `transitions: []` is intentional: it means the editor user explicitly disabled legacy events.
 */
export function editorRouteTransitions(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
): EditorRouteTransition[] {
  const explicit = normalizeEditorRouteTransitions(routeIds, pointsById, meta.transitions ?? []);
  const hasExplicitFacing = explicit.some((transition) => transition.kind === "facing");
  // State/layer events added by the formal scene contract must not disable a
  // legacy `facingSwitchAfterPointId`. Only an explicitly empty transition
  // array opts out of that legacy mirror event.
  const legacyFacing = meta.transitions?.length !== 0
    && !hasExplicitFacing
    && typeof meta.facingSwitchAfterPointId === "string"
    && routeIds.includes(meta.facingSwitchAfterPointId)
    ? [{
        pointId: meta.facingSwitchAfterPointId,
        kind: "facing" as const,
        ...(isEditorFacingDirection(meta.facingAfterSwitch) ? { facing: meta.facingAfterSwitch } : {}),
        animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
      }]
    : [];
  const events = [...explicit, ...legacyFacing];
  return events.sort((left, right) => routeIds.indexOf(left.pointId) - routeIds.indexOf(right.pointId));
}

function normalizeAssetSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const source = value.trim();
  return source.length > 0 ? source : undefined;
}

export function normalizeEditorRouteAssetLibrary(value: unknown): EditorRouteAssetLibrary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as {
    left?: unknown;
    right?: unknown;
    states?: unknown;
  };
  const left = normalizeAssetSource(raw.left);
  const right = normalizeAssetSource(raw.right);
  const states: NonNullable<EditorRouteAssetLibrary["states"]> = {};
  if (raw.states && typeof raw.states === "object" && !Array.isArray(raw.states)) {
    for (const [stateId, rawState] of Object.entries(raw.states)) {
      if (!rawState || typeof rawState !== "object") continue;
      const state = rawState as {
        left?: unknown;
        right?: unknown;
        scale?: unknown;
        alphaBottom?: unknown;
        canonicalFacing?: unknown;
      };
      const stateLeft = normalizeAssetSource(state.left);
      const stateRight = normalizeAssetSource(state.right);
      const stateScale = typeof state.scale === "number"
        && Number.isFinite(state.scale)
        && state.scale > 0
        ? state.scale
        : undefined;
      const alphaBottom = typeof state.alphaBottom === "number"
        && Number.isFinite(state.alphaBottom)
        && state.alphaBottom > 0
        && state.alphaBottom <= 1
        ? state.alphaBottom
        : undefined;
      const canonicalFacing = isEditorFacingDirection(state.canonicalFacing)
        ? state.canonicalFacing
        : undefined;
      if (stateLeft || stateRight || stateScale || alphaBottom || canonicalFacing) {
        states[stateId] = {
          ...(stateLeft ? { left: stateLeft } : {}),
          ...(stateRight ? { right: stateRight } : {}),
          ...(stateScale ? { scale: stateScale } : {}),
          ...(alphaBottom ? { alphaBottom } : {}),
          ...(canonicalFacing ? { canonicalFacing } : {}),
        };
      }
    }
  }
  if (!left && !right && Object.keys(states).length === 0) return undefined;
  return {
    ...(left ? { left } : {}),
    ...(right ? { right } : {}),
    ...(Object.keys(states).length > 0 ? { states } : {}),
  };
}

function isEditorSceneInteractionKind(value: unknown): value is EditorSceneInteractionKind {
  return value === "pickup-prop" || value === "inspect" || value === "ambient" || value === "portal";
}

function isEditorSceneInteractionAssetMode(value: unknown): value is EditorSceneInteractionAssetMode {
  return value === "scene" || value === "actor";
}

function normalizeEditorSceneInteraction(value: unknown, pointsById: Readonly<Record<string, EditorPoint>>): EditorSceneInteraction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    id?: unknown;
    label?: unknown;
    kind?: unknown;
    anchorPointId?: unknown;
    initialStateId?: unknown;
    assets?: unknown;
    states?: unknown;
  };
  if (
    typeof raw.id !== "string"
    || !raw.id.trim()
    || typeof raw.label !== "string"
    || !isEditorSceneInteractionKind(raw.kind)
    || typeof raw.anchorPointId !== "string"
    || !pointsById[raw.anchorPointId]
    || !Array.isArray(raw.assets)
    || !Array.isArray(raw.states)
  ) return null;

  const assets: EditorSceneInteractionAsset[] = raw.assets.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const asset = candidate as {
      id?: unknown;
      label?: unknown;
      src?: unknown;
      mode?: unknown;
      zIndex?: unknown;
      scale?: unknown;
      offset?: unknown;
    };
    if (
      typeof asset.id !== "string"
      || !asset.id.trim()
      || typeof asset.src !== "string"
      || !isEditorSceneInteractionAssetMode(asset.mode)
    ) return [];
    const scale = typeof asset.scale === "number" && Number.isFinite(asset.scale) && asset.scale > 0 && asset.scale <= 8
      ? asset.scale
      : undefined;
    const offset = Array.isArray(asset.offset)
      && typeof asset.offset[0] === "number"
      && typeof asset.offset[1] === "number"
      && Number.isFinite(asset.offset[0])
      && Number.isFinite(asset.offset[1])
      ? [asset.offset[0], asset.offset[1]] as [number, number]
      : undefined;
    return [{
      id: asset.id.trim(),
      label: typeof asset.label === "string" && asset.label.trim() ? asset.label.trim() : asset.id.trim(),
      src: normalizeEditorAssetSource(asset.src),
      mode: asset.mode,
      zIndex: typeof asset.zIndex === "number" && Number.isFinite(asset.zIndex) ? Math.round(asset.zIndex) : 10,
      ...(scale ? { scale } : {}),
      ...(offset ? { offset } : {}),
    }];
  });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const states: EditorSceneInteractionState[] = raw.states.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const state = candidate as { id?: unknown; label?: unknown; visibleAssetIds?: unknown; actorAssetId?: unknown };
    if (typeof state.id !== "string" || !state.id.trim()) return [];
    const visibleAssetIds = Array.isArray(state.visibleAssetIds)
      ? state.visibleAssetIds.filter((assetId): assetId is string => typeof assetId === "string" && assetIds.has(assetId))
      : [];
    const actorAssetId = typeof state.actorAssetId === "string" && assetIds.has(state.actorAssetId)
      && assets.find((asset) => asset.id === state.actorAssetId)?.mode === "actor"
      ? state.actorAssetId
      : undefined;
    return [{
      id: state.id.trim(),
      label: typeof state.label === "string" && state.label.trim() ? state.label.trim() : state.id.trim(),
      visibleAssetIds: [...new Set(visibleAssetIds)],
      ...(actorAssetId ? { actorAssetId } : {}),
    }];
  });
  if (states.length === 0) return null;
  const initialStateId = typeof raw.initialStateId === "string" && states.some((state) => state.id === raw.initialStateId)
    ? raw.initialStateId
    : states[0]!.id;
  return {
    id: raw.id.trim(),
    label: raw.label.trim(),
    kind: raw.kind,
    anchorPointId: raw.anchorPointId,
    initialStateId,
    assets,
    states,
  };
}

export function normalizeEditorSceneInteractions(
  value: unknown,
  pointsById: Readonly<Record<string, EditorPoint>>,
): Record<string, EditorSceneInteraction> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const interactions: Record<string, EditorSceneInteraction> = {};
  for (const [key, candidate] of Object.entries(value)) {
    const interaction = normalizeEditorSceneInteraction({
      ...(candidate && typeof candidate === "object" ? candidate : {}),
      id: key,
    }, pointsById);
    if (interaction) interactions[interaction.id] = interaction;
  }
  return interactions;
}

export function normalizeEditorSceneInteractionEvents(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  interactions: Readonly<Record<string, EditorSceneInteraction>> | undefined,
  value: unknown,
): EditorSceneInteractionEvent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const event = candidate as { pointId?: unknown; interactionId?: unknown; stateId?: unknown };
    if (
      typeof event.pointId !== "string"
      || !routeIds.includes(event.pointId)
      || !pointsById[event.pointId]
      || typeof event.interactionId !== "string"
      || !interactions?.[event.interactionId]
      || typeof event.stateId !== "string"
      || !interactions[event.interactionId]!.states.some((state) => state.id === event.stateId)
    ) return [];
    const key = `${event.pointId}:${event.interactionId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ pointId: event.pointId, interactionId: event.interactionId, stateId: event.stateId }];
  });
}

function isEditorSceneInteractionsRecord(value: unknown, pointsById: Readonly<Record<string, EditorPoint>>): boolean {
  if (value === undefined) return true;
  const normalized = normalizeEditorSceneInteractions(value, pointsById);
  return normalized !== undefined && Object.keys(normalized).length === Object.keys(value as object).length;
}

export function routeStateAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
  progress: number,
): string | null {
  const clampedProgress = clamp(progress, 0, 1);
  const startPointId = routeIds[0];
  let state: string | null = null;
  for (const transition of editorRouteTransitions(routeIds, pointsById, meta)) {
    if (transition.kind !== "state" || !transition.targetStateId) continue;
    const transitionProgress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
    // A first-node state transition can describe either a departure into a
    // transparent actor (the state persists after the handoff) or a scene
    // exit (toAssetMode === "none", so the state is only visible at t=0).
    // Keep the latter compatibility rule while allowing routes such as
    // dining counter -> table to stay on their carry-bowl asset for the walk.
    if (transition.pointId === startPointId && clampedProgress > transitionProgress) {
      if (transition.toAssetMode === "none") continue;
      state = transition.targetStateId;
      continue;
    }
    if (clampedProgress < transitionProgress) break;
    state = transition.targetStateId;
  }
  return state;
}

export function isEditorDraft(value: unknown): value is EditorDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EditorDraft>;
  if (candidate.version !== 1 && candidate.version !== 2) return false;
  if (!EDITOR_SCENE_IDS.includes(candidate.sceneId as EditorSceneId)) return false;
  const profile = getEditorSceneProfile(candidate.sceneId as EditorSceneId);
  if (candidate.version === 2 && (
    candidate.canvas?.width !== profile.canvas.width
    || candidate.canvas?.height !== profile.canvas.height
  )) return false;
  if (!candidate.pointsById || typeof candidate.pointsById !== "object") return false;
  if (!candidate.routes || typeof candidate.routes !== "object") return false;
  if (!candidate.scale || typeof candidate.scale !== "object") return false;
  const hasRoutes = Object.keys(candidate.routes).length > 0;
  return hasRoutes && Object.values(candidate.routes).every((route) => (
    Array.isArray(route)
    && route.every((id) => typeof id === "string" && Boolean(candidate.pointsById?.[id]))
  )) && (!candidate.routeMeta || (
    typeof candidate.routeMeta === "object"
    && Object.entries(candidate.routeMeta).every(([id, meta]) => (
      meta?.id === id
       && typeof meta.label === "string"
       && (meta.kind === "walk" || meta.kind === "arrow")
       && (meta.accent === "cyan" || meta.accent === "magenta" || meta.accent === "amber" || meta.accent === "violet")
       && (meta.facingSwitchAfterPointId === undefined || typeof meta.facingSwitchAfterPointId === "string")
       && (meta.initialFacing === undefined || meta.initialFacing === "left" || meta.initialFacing === "right")
       && (meta.facingAfterSwitch === undefined || meta.facingAfterSwitch === "left" || meta.facingAfterSwitch === "right")
       && (meta.foregroundPolicy === undefined || ["none", "before-turn", "after-turn", "always"].includes(meta.foregroundPolicy))
       && (meta.transitions === undefined || (Array.isArray(meta.transitions) && meta.transitions.every(isEditorRouteTransition)))
       && (meta.interactionEvents === undefined || Array.isArray(meta.interactionEvents))
       && (meta.assetLibrary === undefined || normalizeEditorRouteAssetLibrary(meta.assetLibrary) !== undefined)
     ))
  )) && isEditorSceneInteractionsRecord(candidate.sceneInteractions, candidate.pointsById);
}

export function editorRouteMeta(draft: EditorDraft, routeKey: EditorRouteKey): EditorRouteMeta {
  const profile = getEditorSceneProfile(draft.sceneId);
  const meta = {
    ...(profile.initialRouteMeta[routeKey] ?? INITIAL_ROUTE_META[routeKey] ?? {
      id: routeKey,
      label: routeKey,
      kind: "walk" as const,
      accent: "violet" as const,
    }),
    ...(draft.routeMeta?.[routeKey] ?? {}),
  };
  const routeIds = draft.routes[routeKey] ?? [];
  const { startPointId: _storedStartPointId, endPointId: _storedEndPointId, ...metaWithoutEndpoints } = meta;
  const startPointId = routeIds[0];
  const endPointId = routeIds.at(-1);
  return {
    ...metaWithoutEndpoints,
    ...(startPointId !== undefined ? { startPointId } : {}),
    ...(endPointId !== undefined ? { endPointId } : {}),
  };
}

function cloneRouteWaypointIds(
  pointsById: Record<string, EditorPoint>,
  sourceIds: readonly string[],
  routeKey: string,
  label: string,
  sourcePoints: Readonly<Record<string, EditorPoint>> = pointsById,
): string[] {
  let serial = 1;
  return sourceIds.map((sourceId, index) => {
    const source = sourcePoints[sourceId];
    if (!source || source.role !== "waypoint") return sourceId;
    let nextId = `${routeKey}-node-${serial}`;
    while (pointsById[nextId]) {
      serial += 1;
      nextId = `${routeKey}-node-${serial}`;
    }
    serial += 1;
    pointsById[nextId] = {
      ...source,
      id: nextId,
      label: `${label} ${index + 1}`,
      point: [...source.point] as SceneGeometryPoint,
    };
    return nextId;
  });
}

function waypointIdsForRoute(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
): string[] {
  return routeIds.filter((pointId) => pointsById[pointId]?.role === "waypoint");
}

function fallbackFacingSwitchPointId(
  routeKey: string,
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
): string | undefined {
  const waypointIds = waypointIdsForRoute(routeIds, pointsById);
  const preferredIndex = routeKey === "door-to-seat"
    ? 5
    : routeKey === "door-to-kitchen"
      ? 1
      : routeKey === "kitchen-to-door"
        ? 3
        : -1;
  return waypointIds[preferredIndex] ?? (preferredIndex >= 0 ? waypointIds.at(-1) : undefined);
}

/**
 * Keep every route's waypoint private. Door and seat anchors are intentionally
 * shared semantic points; ordinary waypoints are geometry owned by one route.
 */
export function isolateRouteWaypoints(draft: EditorDraft): EditorDraft {
  const pointsById = { ...draft.pointsById };
  const routes: Record<string, string[]> = {};
  const routeMeta = draft.routeMeta ? { ...draft.routeMeta } : undefined;
  const firstOwner = new Map<string, string>();
  const clonedPointIdsByRoute: Record<string, Record<string, string>> = {};
  let changed = false;

  for (const [routeKey, routeIds] of Object.entries(draft.routes)) {
    routes[routeKey] = routeIds.map((pointId, index) => {
      const point = pointsById[pointId];
      if (!point || point.role !== "waypoint") return pointId;
      const owner = firstOwner.get(pointId);
      if (!owner || owner === routeKey) {
        firstOwner.set(pointId, routeKey);
        return pointId;
      }

      let serial = index + 1;
      let nextId = `${routeKey}-node-${serial}`;
      while (pointsById[nextId]) {
        serial += 1;
        nextId = `${routeKey}-node-${serial}`;
      }
      pointsById[nextId] = {
        ...point,
        id: nextId,
        label: `${editorRouteMeta(draft, routeKey).label} · ${point.label}`,
        point: [...point.point] as SceneGeometryPoint,
      };
      clonedPointIdsByRoute[routeKey] = {
        ...(clonedPointIdsByRoute[routeKey] ?? {}),
        [pointId]: nextId,
      };
      changed = true;
      return nextId;
    });
  }

  const referenced = new Set(Object.values(routes).flat());
  for (const pointId of Object.keys(pointsById)) {
    const point = pointsById[pointId];
    // Semantic anchors are scene-owned resources, not disposable route
    // waypoints. Keep them even before the user has drawn the first route
    // to a mailbox, coat rack, portal, etc.; otherwise importing a starter
    // draft silently deletes the component anchor and its scene interaction.
    const isSceneAnchor = point?.anchorKind === "portal" || point?.anchorKind === "interaction";
    if (!referenced.has(pointId) && !isSceneAnchor) {
      delete pointsById[pointId];
      changed = true;
    }
  }

  if (!changed) return draft;

  if (routeMeta) {
    for (const [routeKey, pointMap] of Object.entries(clonedPointIdsByRoute)) {
      const currentMeta = routeMeta[routeKey];
      const originalTurnPointId = currentMeta?.facingSwitchAfterPointId;
      const clonedTurnPointId = originalTurnPointId ? pointMap[originalTurnPointId] : undefined;
      if (currentMeta && clonedTurnPointId) {
        routeMeta[routeKey] = {
          ...currentMeta,
          facingSwitchAfterPointId: clonedTurnPointId,
        };
      }
      if (currentMeta?.transitions?.length) {
        const remappedTransitions = currentMeta.transitions.map((transition) => ({
          ...transition,
          ...(transition.layerModes ? { layerModes: { ...transition.layerModes } } : {}),
          ...(pointMap[transition.pointId] ? { pointId: pointMap[transition.pointId]! } : {}),
        }));
        routeMeta[routeKey] = {
          ...(routeMeta[routeKey] ?? currentMeta),
          transitions: remappedTransitions,
        };
      }
    }
  }

  return {
    ...draft,
    pointsById,
    routes,
    ...(routeMeta ? { routeMeta } : {}),
  };
}

/**
 * Detach semantic endpoints used by older custom routes. Built-in routes keep
 * their shared door/seat anchors, while a user-created route owns its own
 * endpoint so moving it cannot reshape another route.
 */
export function isolateCustomRouteEndpoints(draft: EditorDraft): EditorDraft {
  const protectedRouteKeys = new Set(getEditorSceneProfile(draft.sceneId).protectedRouteKeys);
  const pointsById = { ...draft.pointsById };
  const routes: Record<string, string[]> = Object.fromEntries(
    Object.entries(draft.routes).map(([routeKey, pointIds]) => [routeKey, [...pointIds]]),
  );
  const routeMeta = draft.routeMeta ? { ...draft.routeMeta } : undefined;
  let changed = false;

  for (const [routeKey, routeIds] of Object.entries(routes)) {
    if (protectedRouteKeys.has(routeKey) || routeIds.length === 0) continue;
    const endpointIndexes = routeIds.length === 1 ? [0] : [0, routeIds.length - 1];
    const remappedPointIds = new Map<string, string>();
    let routeChanged = false;
    let serial = 1;

    for (const index of endpointIndexes) {
      const sourceId = routeIds[index];
      const source = sourceId ? pointsById[sourceId] : undefined;
      if (!source || source.role === "waypoint") continue;

      let nextId = `${routeKey}-node-${serial}`;
      while (pointsById[nextId]) {
        serial += 1;
        nextId = `${routeKey}-node-${serial}`;
      }
      serial += 1;
      pointsById[nextId] = {
        ...source,
        id: nextId,
        role: "waypoint",
        semanticRole: source.semanticRole ?? source.role,
        label: `${editorRouteMeta(draft, routeKey).label} · ${source.label}`,
        point: [...source.point] as SceneGeometryPoint,
      };
      routeIds[index] = nextId;
      if (sourceId) remappedPointIds.set(sourceId, nextId);
      routeChanged = true;
    }

    if (!routeChanged) continue;
    changed = true;
    const currentMeta = routeMeta?.[routeKey];
    if (currentMeta && routeMeta) {
      const remap = (pointId: string | undefined) => (
        pointId && remappedPointIds.get(pointId) ? remappedPointIds.get(pointId) : pointId
      );
      routeMeta[routeKey] = {
        ...currentMeta,
        ...(routeIds[0] ? { startPointId: routeIds[0]! } : {}),
        ...(routeIds.at(-1) ? { endPointId: routeIds.at(-1)! } : {}),
        ...(currentMeta.facingSwitchAfterPointId
          ? { facingSwitchAfterPointId: remap(currentMeta.facingSwitchAfterPointId) ?? currentMeta.facingSwitchAfterPointId }
          : {}),
        ...(currentMeta.transitions
          ? {
              transitions: currentMeta.transitions.map((transition) => ({
                ...transition,
                ...(transition.layerModes ? { layerModes: { ...transition.layerModes } } : {}),
                pointId: remap(transition.pointId) ?? transition.pointId,
              })),
            }
          : {}),
      };
    }
  }

  return changed
    ? {
        ...draft,
        pointsById,
        routes,
        ...(routeMeta ? { routeMeta } : {}),
      }
    : draft;
}

/**
 * The first bedroom draft used provisional interaction points. Migrate only
 * those exact provisional coordinates so a saved browser draft receives the
 * red-ring corrections without overwriting any point the user has tuned.
 */
export function ensureBedroomBedAnchor(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "bedroom") return draft;
  const corrections = [
    { id: "bedroom-door", legacy: [1220, 570], point: [1182, 455], label: "门固定交互点（红圈确认）" },
    { id: "bed-edge", legacy: [735, 620], point: [868, 357], label: "上床 / 唱片机交互点（红圈确认）" },
    { id: "lounge-corner", legacy: [1260, 760], point: [1075, 579], label: "小沙发交互点（红圈确认）" },
  ] as const;
  const pointsById = { ...draft.pointsById };
  let changed = false;
  for (const correction of corrections) {
    const anchor = pointsById[correction.id];
    if (!anchor || anchor.point[0] !== correction.legacy[0] || anchor.point[1] !== correction.legacy[1]) continue;
    pointsById[correction.id] = {
      ...anchor,
      label: correction.label,
      point: [...correction.point] as SceneGeometryPoint,
    };
    changed = true;
  }
  if (!changed) return draft;
  return {
    ...draft,
    pointsById,
  };
}

/**
 * The bedroom turn markers are semantic positions in each directed route,
 * not stable point IDs. The editor can create a fresh ID every time a
 * waypoint is inserted, so bind the approved turn to the visible route
 * position when restoring a saved draft.
 */
export function ensureBedroomFacingRoutes(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "bedroom") return draft;

  const turnIndexByRoute: Record<string, number> = {
    // The screenshot-approved turn is at the visible node 3 (route index 2;
    // index 0 is the door anchor and index 1 is node 2).
    "door-to-lounge": 2,
    // The return path turns at its visible node 2 (route index 1).
    "lounge-to-door": 1,
  };
  const routeMeta = { ...(draft.routeMeta ?? {}) };
  let changed = false;

  for (const [routeKey, turnIndex] of Object.entries(turnIndexByRoute)) {
    const routeIds = draft.routes[routeKey];
    if (!routeIds) continue;

    const fallback = bedroomInitialRouteMeta[routeKey];
    const current = routeMeta[routeKey] ?? fallback;
    if (!current || !fallback) continue;

    const targetPointId = routeIds[turnIndex];
    const targetPoint = targetPointId ? draft.pointsById[targetPointId] : undefined;
    const turnPointId = targetPoint?.role === "waypoint" ? targetPoint.id : undefined;
    const hasExplicitFacingConfig = current.transitions?.some((transition) => transition.kind === "facing") ?? false;
    const explicitFacing = hasExplicitFacingConfig
      ? normalizeEditorRouteTransitions(routeIds, draft.pointsById, current.transitions ?? [])
        .find((transition) => transition.kind === "facing")
      : undefined;
    const { facingSwitchAfterPointId: _oldTurnPointId, ...currentWithoutTurn } = current;
    const nextMeta: EditorRouteMeta = hasExplicitFacingConfig
      ? {
          ...currentWithoutTurn,
          ...(explicitFacing ? { facingSwitchAfterPointId: explicitFacing.pointId } : {}),
        }
      : {
          ...currentWithoutTurn,
          initialFacing: current.initialFacing ?? "left",
          facingAfterSwitch: current.facingAfterSwitch ?? "right",
          ...(turnPointId ? { facingSwitchAfterPointId: turnPointId } : {}),
        };

    if (JSON.stringify(routeMeta[routeKey]) !== JSON.stringify(nextMeta)) {
      routeMeta[routeKey] = nextMeta;
      changed = true;
    }
  }

  return changed ? { ...draft, routeMeta } : draft;
}

/**
 * Entering the bedroom is a scene handoff, not a walker teleport. Add the
 * entry smoke only to directed routes whose first point is the bedroom door;
 * reverse routes and all user-authored geometry remain untouched. A route
 * that already has a state event at its door owns that decision and is left
 * unchanged.
 */
export function ensureBedroomDoorEntrySmokeTransitions(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "bedroom") return draft;

  const routeMeta = { ...(draft.routeMeta ?? {}) };
  let changed = false;
  for (const [routeKey, routeIds] of Object.entries(draft.routes)) {
    if (routeIds.length < 2) continue;
    const startPointId = routeIds[0];
    if (!startPointId) continue;
    const startPoint = startPointId ? draft.pointsById[startPointId] : undefined;
    const startsAtDoor = startPoint?.role === "door" || startPoint?.semanticRole === "door";
    if (!startsAtDoor) continue;

    const current = routeMeta[routeKey] ?? bedroomInitialRouteMeta[routeKey];
    if (!current) continue;
    const transitions = current.transitions ?? [];
    const hasDoorState = transitions.some((transition) => (
      transition.kind === "state" && transition.pointId === startPointId
    ));
    if (hasDoorState) continue;

    routeMeta[routeKey] = {
      ...current,
      id: routeKey,
      startPointId,
      ...(routeIds.at(-1) ? { endPointId: routeIds.at(-1)! } : {}),
      transitions: [
        {
          pointId: startPointId,
          kind: "state",
          targetStateId: "walking",
          fromAssetMode: "none",
          toAssetMode: "actor",
          animation: { ...BEDROOM_INITIAL_NODE_SMOKE_ANIMATION },
        },
        ...transitions,
      ],
    };
    changed = true;
  }

  return changed ? { ...draft, routeMeta } : draft;
}

function bedroomStateTransition(
  pointId: string,
  targetStateId: string,
  options: Pick<EditorRouteTransition, "fromAssetSource" | "fromAssetMode" | "toAssetSource" | "toAssetMode">,
  animation: EditorTransitionAnimation = BEDROOM_SCENE_HANDOFF_SMOKE_ANIMATION,
): EditorRouteTransition {
  return {
    pointId,
    kind: "state",
    targetStateId,
    ...options,
    animation: { ...animation },
  };
}

function mergeBedroomFormalTransitions(
  routeIds: readonly string[],
  current: readonly EditorRouteTransition[] | undefined,
  required: readonly EditorRouteTransition[],
): EditorRouteTransition[] {
  const endpointIds = new Set(routeIds.length > 1 ? [routeIds[0], routeIds.at(-1)] : []);
  return [
    ...(current ?? []).filter((transition) => (
      transition.kind !== "state" || !endpointIds.has(transition.pointId)
    )),
    ...required,
  ];
}

/**
 * Apply the bedroom's scene handoff contract without touching route geometry.
 *
 * The three semantic anchors are door, bed/record-player, and lounge. A
 * bedroom route starts in either a scene composite or a door-entry smoke,
 * travels with the normal walking actor, and ends in a scene composite or an
 * exit smoke. Only state events at the current route endpoints are replaced;
 * facing, layer, midpoint state events, points, and route order are retained.
 */
export function ensureBedroomFormalStateTransitions(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "bedroom") return draft;

  const withDoorEntrySmoke = ensureBedroomDoorEntrySmokeTransitions(draft);
  const routeMeta = { ...(withDoorEntrySmoke.routeMeta ?? {}) };
  let changed = withDoorEntrySmoke !== draft;

  for (const [routeKey, routeIds] of Object.entries(withDoorEntrySmoke.routes)) {
    if (routeIds.length < 2) continue;
    const currentMeta = routeMeta[routeKey] ?? bedroomInitialRouteMeta[routeKey];
    if (!currentMeta || currentMeta.kind !== "walk") continue;

    const startPointId = routeIds[0];
    const endPointId = routeIds.at(-1);
    if (!startPointId || !endPointId) continue;
    const startPoint = withDoorEntrySmoke.pointsById[startPointId];
    const endPoint = withDoorEntrySmoke.pointsById[endPointId];
    const startRole = bedroomEndpointRoleForRoute(routeKey, currentMeta, startPoint, "start");
    const endRole = bedroomEndpointRoleForRoute(routeKey, currentMeta, endPoint, "end");
    const startStateId = bedroomSceneStateForEndpoint(routeKey, currentMeta, startPoint, "start");
    const endStateId = bedroomSceneStateForEndpoint(routeKey, currentMeta, endPoint, "end");
    const startFacing = routeFacingAtProgress(routeIds, withDoorEntrySmoke.pointsById, currentMeta, 0);
    const endFacing = routeFacingAtProgress(routeIds, withDoorEntrySmoke.pointsById, currentMeta, 1);
    const required: EditorRouteTransition[] = [];

    if (startRole === "door") {
      required.push(bedroomStateTransition(
        startPointId,
        "walking",
        {
          fromAssetMode: "none",
          toAssetSource: bedroomWalkAssetForFacing(startFacing),
          toAssetMode: "actor",
        },
        BEDROOM_INITIAL_NODE_SMOKE_ANIMATION,
      ));
    } else if (startStateId) {
      required.push(bedroomStateTransition(
        startPointId,
        "walking",
        {
          fromAssetSource: BEDROOM_SCENE_ASSETS[startStateId],
          fromAssetMode: "scene",
          toAssetSource: bedroomWalkAssetForFacing(startFacing),
          toAssetMode: "actor",
        },
        BEDROOM_INITIAL_NODE_SMOKE_ANIMATION,
      ));
    }

    if (endRole === "door") {
      required.push(bedroomStateTransition(
        endPointId,
        "gone",
        {
          fromAssetSource: bedroomWalkAssetForFacing(endFacing),
          fromAssetMode: "actor",
          toAssetMode: "none",
        },
        BEDROOM_DOOR_ENTRY_SMOKE_ANIMATION,
      ));
    } else if (endStateId) {
      required.push(bedroomStateTransition(
        endPointId,
        endStateId,
        {
          fromAssetSource: bedroomWalkAssetForFacing(endFacing),
          fromAssetMode: "actor",
          toAssetSource: BEDROOM_SCENE_ASSETS[endStateId],
          toAssetMode: "scene",
        },
      ));
    }

    if (required.length === 0) continue;
    const nextTransitions = mergeBedroomFormalTransitions(routeIds, currentMeta.transitions, required);
    const nextMeta: EditorRouteMeta = {
      ...currentMeta,
      id: routeKey,
      startPointId,
      endPointId,
      transitions: nextTransitions,
    };
    if (JSON.stringify(currentMeta) !== JSON.stringify(nextMeta)) changed = true;
    routeMeta[routeKey] = nextMeta;
  }

  return changed ? { ...withDoorEntrySmoke, routeMeta } : withDoorEntrySmoke;
}

function splitAtticRouteDirection(value: string): [string, string] | null {
  const compact = value.replace(/\s/g, "").toLowerCase();
  const match = compact.match(/^(.+?)(?:→|->|-to-|_to_|到|至)(.+)$/);
  return match ? [match[1]!, match[2]!] : null;
}

function atticEndpointText(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: "start" | "end",
): string {
  const labelDirection = splitAtticRouteDirection(meta.label);
  const keyDirection = splitAtticRouteDirection(routeKey);
  const side = (position === "start" ? 0 : 1);
  return `${labelDirection?.[side] ?? keyDirection?.[side] ?? ""} ${point?.id ?? ""} ${point?.label ?? ""}`
    .replace(/\s/g, "")
    .toLowerCase();
}

function atticActionStateForEndpoint(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: "start" | "end",
): AtticActionStateId | undefined {
  const text = atticEndpointText(routeKey, meta, point, position);
  if (/(archive|shelf|书架|翻找)/.test(text)) return "attic-retrieve-archive";
  if (/(draft|desk|书桌|稿桌|旧稿|整理)/.test(text)) return "attic-reading";
  return undefined;
}

function isAtticBoundaryPoint(
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint | undefined,
  position: "start" | "end",
): boolean {
  if (!point) return false;
  const text = atticEndpointText(routeKey, meta, point, position);
  return point.role === "scene-entry"
    || point.semanticRole === "scene-entry"
    || /(stair|entry|梯口|入口)/.test(text);
}

function atticActionAssetSource(stateId: AtticActionStateId): string {
  return ATTIC_STATE_ASSET_LIBRARY[stateId].right!;
}

function mergeAtticStateAssetLibrary(
  current: EditorRouteAssetLibrary | undefined,
  stateIds: readonly AtticActionStateId[],
): EditorRouteAssetLibrary | undefined {
  if (stateIds.length === 0 && !current) return undefined;
  const states: NonNullable<EditorRouteAssetLibrary["states"]> = Object.fromEntries(
    Object.entries(current?.states ?? {}).map(([stateId, state]) => {
      // The attic action cards now use the same 1024×1536 transparent canvas
      // as the ordinary walker. Never carry the old padded-canvas correction
      // into a newly normalized route, even when the state ID is user-defined.
      const { scale: _legacyScale, alphaBottom: _legacyAlphaBottom, ...withoutLegacySizing } = state;
      return [stateId, withoutLegacySizing];
    }),
  );
  for (const stateId of stateIds) {
    const fallback = ATTIC_STATE_ASSET_LIBRARY[stateId];
    const existing = states[stateId];
    const existingWithoutLegacySizing = existing ?? {};
    states[stateId] = {
      ...existingWithoutLegacySizing,
      // These two state IDs are the attic's canonical action assets. Keep the
      // source deterministic even when an old draft used a copied local file.
      ...(fallback.left ? { left: fallback.left } : {}),
      ...(fallback.right ? { right: fallback.right } : {}),
      ...(existing?.canonicalFacing ?? fallback.canonicalFacing
        ? { canonicalFacing: existing?.canonicalFacing ?? fallback.canonicalFacing }
        : {}),
    };
  }
  return {
    ...(current ?? {}),
    ...(Object.keys(states).length > 0 ? { states } : {}),
  };
}

/**
 * Remove the obsolete per-image framing fields from every attic state.
 *
 * This is deliberately scene-local. Dining still has approved 1254×1254
 * carry assets that require their own multiplier and alpha-bottom correction.
 * The attic images are now normalized at the source, so route perspective is
 * their only scale/position authority.
 */
function stripAtticLegacyAssetSizing(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "attic" || !draft.routeMeta) return draft;

  let changed = false;
  const routeMeta = Object.fromEntries(
    Object.entries(draft.routeMeta).map(([routeKey, meta]) => {
      const states = meta.assetLibrary?.states;
      if (!states) return [routeKey, meta];

      const nextStates = Object.fromEntries(
        Object.entries(states).map(([stateId, state]) => {
          if (!("scale" in state) && !("alphaBottom" in state)) return [stateId, state];
          changed = true;
          const nextState = { ...state };
          delete nextState.scale;
          delete nextState.alphaBottom;
          return [stateId, nextState];
        }),
      );
      return [routeKey, {
        ...meta,
        assetLibrary: {
          ...meta.assetLibrary,
          states: nextStates,
        },
      }];
    }),
  ) as Record<string, EditorRouteMeta>;

  return changed ? { ...draft, routeMeta } : draft;
}

function atticStateTransition(
  pointId: string,
  targetStateId: string,
  options: Pick<EditorRouteTransition, "fromAssetSource" | "fromAssetMode" | "fromAssetFacing" | "toAssetSource" | "toAssetMode" | "toAssetFacing">,
  animation: EditorTransitionAnimation,
): EditorRouteTransition {
  return {
    pointId,
    kind: "state",
    targetStateId,
    ...options,
    animation: { ...animation },
  };
}

/**
 * Apply the attic's actor-only endpoint contract.
 *
 * Unlike bedroom/study, attic actions are not 2:1 scene composites. The
 * walker therefore hands off to a normalized transparent actor at archive/draft
 * endpoints, and hands back to the walker before leaving through the stair.
 * Geometry, route order, mirror/layer events, and midpoint events are kept.
 */
export function ensureAtticFormalStateTransitions(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "attic") return draft;

  const isolated = draft;
  const routeMeta = { ...(isolated.routeMeta ?? {}) };
  let changed = isolated !== draft;

  for (const [routeKey, routeIds] of Object.entries(isolated.routes)) {
    if (routeIds.length < 2) continue;
    const fallback = atticInitialRouteMeta[routeKey];
    const currentMeta = routeMeta[routeKey] ?? fallback ?? {
      id: routeKey,
      label: routeKey,
      kind: "walk" as const,
      accent: "violet" as const,
      foregroundPolicy: "none" as const,
    };
    if (currentMeta.kind !== "walk") continue;

    const startPointId = routeIds[0];
    const endPointId = routeIds.at(-1);
    if (!startPointId || !endPointId) continue;
    const startPoint = isolated.pointsById[startPointId];
    const endPoint = isolated.pointsById[endPointId];
    const startStateId = atticActionStateForEndpoint(routeKey, currentMeta, startPoint, "start");
    const endStateId = atticActionStateForEndpoint(routeKey, currentMeta, endPoint, "end");
    const startIsBoundary = !startStateId && isAtticBoundaryPoint(routeKey, currentMeta, startPoint, "start");
    const endIsBoundary = !endStateId && isAtticBoundaryPoint(routeKey, currentMeta, endPoint, "end");
    const startFacing = routeFacingAtProgress(routeIds, isolated.pointsById, currentMeta, 0);
    const endFacing = routeFacingAtProgress(routeIds, isolated.pointsById, currentMeta, 1);
    const required: EditorRouteTransition[] = [];

    if (startIsBoundary) {
      required.push(atticStateTransition(
        startPointId,
        "walking",
        {
          fromAssetMode: "none",
          toAssetSource: studyWalkAssetForFacing(startFacing),
          toAssetMode: "actor",
        },
        ATTIC_INITIAL_NODE_SMOKE_ANIMATION,
      ));
    } else if (startStateId) {
      required.push(atticStateTransition(
        startPointId,
        "walking",
        {
          fromAssetSource: atticActionAssetSource(startStateId),
          fromAssetMode: "actor",
          fromAssetFacing: "right",
          toAssetSource: studyWalkAssetForFacing(startFacing),
          toAssetMode: "actor",
        },
        ATTIC_INITIAL_NODE_SMOKE_ANIMATION,
      ));
    }

    if (endIsBoundary) {
      required.push(atticStateTransition(
        endPointId,
        "gone",
        {
          fromAssetSource: studyWalkAssetForFacing(endFacing),
          fromAssetMode: "actor",
          toAssetMode: "none",
        },
        ATTIC_EXIT_SMOKE_ANIMATION,
      ));
    } else if (endStateId) {
      required.push(atticStateTransition(
        endPointId,
        endStateId,
        {
          fromAssetSource: studyWalkAssetForFacing(endFacing),
          fromAssetMode: "actor",
          toAssetSource: atticActionAssetSource(endStateId),
          toAssetMode: "actor",
          toAssetFacing: "right",
        },
        ATTIC_ACTION_STATE_TRANSITION_ANIMATION,
      ));
    }

    if (required.length === 0) continue;
    const endpointIds = new Set([startPointId, endPointId]);
    const nextTransitions = [
      ...(currentMeta.transitions ?? []).filter((transition) => (
        transition.kind !== "state" || !endpointIds.has(transition.pointId)
      )),
      ...required,
    ];
    const stateIds = [startStateId, endStateId].filter(
      (stateId): stateId is AtticActionStateId => Boolean(stateId),
    );
    const assetLibrary = mergeAtticStateAssetLibrary(currentMeta.assetLibrary, stateIds);
    const nextMeta: EditorRouteMeta = {
      ...currentMeta,
      id: routeKey,
      startPointId,
      endPointId,
      transitions: nextTransitions,
      ...(assetLibrary ? { assetLibrary } : {}),
    };
    if (JSON.stringify(currentMeta) !== JSON.stringify(nextMeta)) changed = true;
    routeMeta[routeKey] = nextMeta;
  }

  return changed ? { ...isolated, routeMeta } : isolated;
}

const LEGACY_DINING_KITCHEN_EMPTY_BOWL_ACTOR_ASSET_FILENAME =
  "carry-empty-bowl-transparent-actor-v1.webp";

function migrateDiningKitchenAssetSource(source: string | undefined): string | undefined {
  if (!source) return source;
  const normalized = source.replace(/\\/g, "/");
  const filename = normalized.split("/").at(-1);
  return filename === LEGACY_DINING_KITCHEN_EMPTY_BOWL_ACTOR_ASSET_FILENAME
    ? DINING_KITCHEN_CARRY_EMPTY_BOWL_ACTOR_ASSET_SRC
    : source;
}

function migrateDiningKitchenAssetLibrary(
  assetLibrary: EditorRouteAssetLibrary | undefined,
): EditorRouteAssetLibrary | undefined {
  if (!assetLibrary) return assetLibrary;
  let changed = false;
  const migrate = (source: string | undefined) => {
    const next = migrateDiningKitchenAssetSource(source);
    if (next !== source) changed = true;
    return next;
  };
  const migrateRequired = (source: string) => migrate(source) ?? source;
  const states = assetLibrary.states
    ? Object.fromEntries(Object.entries(assetLibrary.states).map(([stateId, state]) => [stateId, {
        ...(state.left ? { left: migrateRequired(state.left) } : {}),
        ...(state.right ? { right: migrateRequired(state.right) } : {}),
        ...(typeof state.scale === "number" ? { scale: state.scale } : {}),
        ...(typeof state.alphaBottom === "number" ? { alphaBottom: state.alphaBottom } : {}),
        ...(state.canonicalFacing ? { canonicalFacing: state.canonicalFacing } : {}),
      }]))
    : undefined;
  const next: EditorRouteAssetLibrary = {
    ...(assetLibrary.left ? { left: migrateRequired(assetLibrary.left) } : {}),
    ...(assetLibrary.right ? { right: migrateRequired(assetLibrary.right) } : {}),
    ...(states ? { states } : {}),
  };
  return changed ? next : assetLibrary;
}

function migrateDiningKitchenTransitions(
  transitions: readonly EditorRouteTransition[] | undefined,
): EditorRouteTransition[] | undefined {
  if (!transitions) return transitions;
  let changed = false;
  const next = transitions.map((transition) => {
    const fromAssetSource = migrateDiningKitchenAssetSource(transition.fromAssetSource);
    const toAssetSource = migrateDiningKitchenAssetSource(transition.toAssetSource);
    if (fromAssetSource !== transition.fromAssetSource || toAssetSource !== transition.toAssetSource) {
      changed = true;
      return {
        ...transition,
        ...(fromAssetSource ? { fromAssetSource } : {}),
        ...(toAssetSource ? { toAssetSource } : {}),
        animation: { ...transition.animation },
      };
    }
    return transition;
  });
  return changed ? next : transitions as EditorRouteTransition[];
}

/**
 * These are semantic endpoints in the source contract. A normalized local
 * draft may have cloned route-owned copies of them, so formal events must be
 * rebound to the current route's first/last point rather than retaining the
 * original shared id.
 */
const diningKitchenFormalRouteEndpoints: Readonly<Record<string, readonly [string, string]>> = {
  "entry-to-counter": ["dining-entry", "kitchen-counter"],
  "counter-to-entry": ["kitchen-counter", "dining-entry"],
  "counter-to-table": ["kitchen-counter", "meal-table"],
  "table-to-counter": ["meal-table", "kitchen-counter"],
  "entry-to-table": ["dining-entry", "meal-table"],
  "table-to-entry": ["meal-table", "dining-entry"],
};

function diningKitchenFormalTransitionsForRoute(
  routeKey: string,
  routeIds: readonly string[],
  transitions: readonly EditorRouteTransition[] | undefined,
): EditorRouteTransition[] {
  if (!transitions) return [];
  const endpoints = diningKitchenFormalRouteEndpoints[routeKey];
  const startPointId = routeIds[0];
  const endPointId = routeIds.at(-1);
  return transitions.map((transition) => ({
    ...transition,
    pointId: transition.pointId === endpoints?.[0] && startPointId
      ? startPointId
      : transition.pointId === endpoints?.[1] && endPointId
        ? endPointId
        : transition.pointId,
    animation: { ...transition.animation },
  }));
}

function mergeDiningKitchenFormalTransitions(
  current: readonly EditorRouteTransition[] | undefined,
  required: readonly EditorRouteTransition[],
): EditorRouteTransition[] {
  const requiredStatePointIds = new Set(
    required.filter((transition) => transition.kind === "state").map((transition) => transition.pointId),
  );
  const migratedCurrent = migrateDiningKitchenTransitions(current) ?? [];
  return [
    ...migratedCurrent.filter((transition) => !(
      transition.kind === "state" && requiredStatePointIds.has(transition.pointId)
    )),
    ...required,
  ];
}

function mergeDiningKitchenAssetLibrary(
  current: EditorRouteAssetLibrary | undefined,
  fallback: EditorRouteAssetLibrary | undefined,
): EditorRouteAssetLibrary | undefined {
  const migratedCurrent = migrateDiningKitchenAssetLibrary(current);
  if (!migratedCurrent && !fallback) return undefined;
  const stateIds = new Set([
    ...Object.keys(fallback?.states ?? {}),
    ...Object.keys(migratedCurrent?.states ?? {}),
  ]);
  const states = Object.fromEntries([...stateIds].map((stateId) => [stateId, {
    ...(fallback?.states?.[stateId] ?? {}),
    ...(migratedCurrent?.states?.[stateId] ?? {}),
  }]));
  return {
    ...(fallback ?? {}),
    ...(migratedCurrent ?? {}),
    ...(Object.keys(states).length > 0 ? { states } : {}),
  };
}

/**
 * Repair the dining scene's formal start/end state contracts in old local
 * drafts. A previous draft could contain route-private endpoint ids while its
 * events still pointed at the old shared semantic id; normalization then
 * discarded those events and rendered the generic walker.
 *
 * Required state events are replaced only at the formal route endpoints. Any
 * user-authored midpoint events, mirror events, layer events, route geometry,
 * and route order remain untouched.
 */
export function ensureDiningKitchenRouteAssets(draft: EditorDraft): EditorDraft {
  if (draft.sceneId !== "dining-kitchen") return draft;

  const routeMeta = { ...(draft.routeMeta ?? {}) };
  let changed = false;

  for (const routeKey of Object.keys(diningKitchenFormalRouteEndpoints)) {
    const routeIds = draft.routes[routeKey];
    const fallback = diningKitchenInitialRouteMeta[routeKey];
    if (!routeIds || !fallback) continue;

    const currentMeta = routeMeta[routeKey];
    const requiredTransitions = diningKitchenFormalTransitionsForRoute(
      routeKey,
      routeIds,
      fallback.transitions,
    );
    const nextMeta: EditorRouteMeta = {
      ...fallback,
      ...(currentMeta ?? {}),
      id: routeKey,
      ...(routeIds[0] ? { startPointId: routeIds[0] } : {}),
      ...(routeIds.at(-1) ? { endPointId: routeIds.at(-1)! } : {}),
      transitions: mergeDiningKitchenFormalTransitions(currentMeta?.transitions, requiredTransitions),
    };

    if (routeKey === "counter-to-table" || routeKey === "table-to-counter") {
      const mergedAssetLibrary = mergeDiningKitchenAssetLibrary(
        currentMeta?.assetLibrary,
        fallback.assetLibrary,
      );
      if (mergedAssetLibrary) nextMeta.assetLibrary = mergedAssetLibrary;
    }

    if (JSON.stringify(currentMeta) !== JSON.stringify(nextMeta)) {
      routeMeta[routeKey] = nextMeta;
      changed = true;
    }
  }

  return changed ? { ...draft, routeMeta } : draft;
}

/**
 * Migrate the original three-route JSON. The old kitchen arrow becomes two
 * seat↔kitchen walk routes, and each direction receives its own waypoint
 * copies so later edits cannot leak across routes.
 */
export function ensureStudyDoorKitchenRoutes(draft: EditorDraft): EditorDraft {
  const pointsById = { ...draft.pointsById };
  const routes = { ...draft.routes };
  const routeMeta = { ...(draft.routeMeta ?? {}) };
  const initialDraft = createInitialEditorDraft();
  const legacyKitchen = routes.kitchen;
  const existingSeatToKitchen = routes["seat-to-kitchen"] ?? [];
  const kitchenSourceIds = legacyKitchen?.length
    ? legacyKitchen
    : (existingSeatToKitchen.length
      ? waypointIdsForRoute(existingSeatToKitchen, pointsById)
      : waypointIdsForRoute(initialDraft.routes["seat-to-kitchen"] ?? [], initialDraft.pointsById));
  const kitchenSourcePoints = legacyKitchen?.length || existingSeatToKitchen.length
    ? pointsById
    : initialDraft.pointsById;
  let changed = false;

  if (!routes["seat-to-kitchen"] && kitchenSourceIds.length && pointsById["seat-right"]) {
    const privateIds = cloneRouteWaypointIds(pointsById, kitchenSourceIds, "seat-to-kitchen", "座位→厨房节点", kitchenSourcePoints);
    routes["seat-to-kitchen"] = ["seat-right", ...privateIds];
    changed = true;
  }
  if (!routes["kitchen-to-seat"] && kitchenSourceIds.length && pointsById["seat-right"]) {
    const privateIds = cloneRouteWaypointIds(pointsById, [...kitchenSourceIds].reverse(), "kitchen-to-seat", "厨房→座位节点", kitchenSourcePoints);
    routes["kitchen-to-seat"] = [...privateIds, "seat-right"];
    changed = true;
  }
  if (!routes["door-to-kitchen"] && pointsById.door) {
    const initialDoorToKitchenRoute = initialDraft.routes["door-to-kitchen"] ?? [];
    const privateIds = cloneRouteWaypointIds(
      pointsById,
      initialDoorToKitchenRoute,
      "door-to-kitchen",
      "门→厨房节点",
      initialDraft.pointsById,
    );
    routes["door-to-kitchen"] = privateIds;
    changed = true;
  }
  if (!routes["kitchen-to-door"] && pointsById.door) {
    const initialKitchenToDoorRoute = initialDraft.routes["kitchen-to-door"] ?? [];
    const privateIds = cloneRouteWaypointIds(
      pointsById,
      initialKitchenToDoorRoute,
      "kitchen-to-door",
      "厨房→门节点",
      initialDraft.pointsById,
    );
    routes["kitchen-to-door"] = privateIds;
    changed = true;
  }
  if (legacyKitchen) {
    delete routes.kitchen;
    delete routeMeta.kitchen;
    changed = true;
  }

  for (const routeKey of [
    "door-to-seat",
    "seat-to-kitchen",
    "kitchen-to-seat",
    "door-to-kitchen",
    "kitchen-to-door",
  ] as const) {
    const routeIds = routes[routeKey];
    if (routeIds) {
      const currentMeta = routeMeta[routeKey];
      const fallback = INITIAL_ROUTE_META[routeKey];
      const hasExplicitTransitionConfig = currentMeta?.transitions !== undefined;
      const explicitFacing = hasExplicitTransitionConfig
        ? normalizeEditorRouteTransitions(routeIds, pointsById, currentMeta?.transitions ?? [])
          .find((transition) => transition.kind === "facing")
        : undefined;
      const configuredTurnPointId = hasExplicitTransitionConfig
        ? explicitFacing?.pointId
        : currentMeta?.facingSwitchAfterPointId ?? fallback?.facingSwitchAfterPointId;
      const turnPointId = configuredTurnPointId && routeIds.includes(configuredTurnPointId)
        ? configuredTurnPointId
        : fallbackFacingSwitchPointId(routeKey, routeIds, pointsById);
      const startPointId = routeIds[0];
      const endPointId = routeIds.at(-1);
      const baseMeta = {
        ...(fallback ?? {
          id: routeKey,
          label: routeKey,
          kind: "walk" as const,
          accent: "violet" as const,
        }),
        ...(currentMeta ?? {}),
        id: routeKey,
        ...(startPointId !== undefined ? { startPointId } : {}),
        ...(endPointId !== undefined ? { endPointId } : {}),
      } satisfies EditorRouteMeta;
      const nextMeta: EditorRouteMeta = hasExplicitTransitionConfig
        ? (() => {
            const { facingSwitchAfterPointId: _legacyTurnPointId, ...withoutLegacyTurn } = baseMeta;
            return {
              ...withoutLegacyTurn,
              ...(explicitFacing ? { facingSwitchAfterPointId: explicitFacing.pointId } : {}),
            };
          })()
        : {
            ...baseMeta,
            ...(turnPointId ? { facingSwitchAfterPointId: turnPointId } : {}),
          };
      if (JSON.stringify(routeMeta[routeKey]) !== JSON.stringify(nextMeta)) {
        routeMeta[routeKey] = nextMeta;
        changed = true;
      }
      if (!currentMeta) {
        changed = true;
      }
    }
  }

  const migrated = changed ? { ...draft, pointsById, routes, routeMeta } : draft;
  return isolateRouteWaypoints(migrated);
}

export function normalizeEditorDraft(value: unknown): EditorDraft | null {
  if (!isEditorDraft(value)) return null;
  const sceneId = value.sceneId;
  const profile = getEditorSceneProfile(sceneId);
  const sceneNormalized = sceneId === "study"
    ? isolateCustomRouteEndpoints(ensureStudyDoorKitchenRoutes(value))
    : sceneId === "dining-kitchen"
      ? isolateRouteWaypoints(ensureDiningKitchenRouteAssets(value))
      : sceneId === "bedroom"
        ? ensureBedroomFormalStateTransitions(
            ensureBedroomFacingRoutes(ensureBedroomBedAnchor(isolateRouteWaypoints(value))),
        )
        : sceneId === "attic"
          ? ensureAtticFormalStateTransitions(value)
          : isolateRouteWaypoints(value);
  const normalizedSceneInteractions = normalizeEditorSceneInteractions(
    sceneNormalized.sceneInteractions,
    sceneNormalized.pointsById,
  );
  const normalizedRouteMeta = sceneNormalized.routeMeta
    ? Object.fromEntries(Object.entries(sceneNormalized.routeMeta).map(([routeKey, meta]) => {
        const nextMeta: EditorRouteMeta = { ...meta };
        if (meta.transitions !== undefined) {
          nextMeta.transitions = normalizeEditorRouteTransitions(
            sceneNormalized.routes[routeKey] ?? [],
            sceneNormalized.pointsById,
            meta.transitions,
          );
        }
        if (meta.interactionEvents !== undefined) {
          nextMeta.interactionEvents = normalizeEditorSceneInteractionEvents(
            sceneNormalized.routes[routeKey] ?? [],
            sceneNormalized.pointsById,
            normalizedSceneInteractions,
            meta.interactionEvents,
          ) ?? [];
        }
        if (meta.assetLibrary !== undefined) {
          const assetLibrary = normalizeEditorRouteAssetLibrary(meta.assetLibrary);
          if (assetLibrary) nextMeta.assetLibrary = assetLibrary;
          else delete nextMeta.assetLibrary;
        }
        return [routeKey, nextMeta];
      }))
    : undefined;
  const withSceneContracts = ensureStudyTerminalStateTransitions({
    ...sceneNormalized,
    version: 2,
    sceneId,
    canvas: { ...profile.canvas },
    ...(normalizedSceneInteractions ? { sceneInteractions: normalizedSceneInteractions } : {}),
    ...(normalizedRouteMeta ? { routeMeta: normalizedRouteMeta } : {}),
  });
  return ensureInitialNodeTransitionAnimationDefaults(
    sceneId === "attic"
      ? stripAtticLegacyAssetSizing(withSceneContracts)
      : withSceneContracts,
  );
}

/** Backwards-compatible name used by the first study-only editor. */
export function normalizeStudyEditorDraft(value: unknown): EditorDraft | null {
  return normalizeEditorDraft(value);
}

export function deserializeEditorDraft(value: unknown): EditorDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    schemaVersion?: unknown;
    sceneId?: unknown;
    canvas?: { width?: unknown; height?: unknown };
    scale?: Partial<EditorScaleSettings>;
    points?: Array<{
      id?: unknown;
      label?: unknown;
      role?: unknown;
      semanticRole?: unknown;
      anchorKind?: unknown;
      anchorKey?: unknown;
      anchorGroupKey?: unknown;
      anchorPort?: unknown;
      pixel?: unknown;
      scaleOverride?: unknown;
    }>;
    routes?: Record<string, unknown>;
    routeMeta?: Record<string, unknown>;
    sceneInteractions?: unknown;
  };
  const isLegacyStudyExport = candidate.schemaVersion === "study-route-editor.v1";
  const isGenericExport = candidate.schemaVersion === "route-editor.v2";
  if (!isLegacyStudyExport && !isGenericExport) return null;
  if (!EDITOR_SCENE_IDS.includes(candidate.sceneId as EditorSceneId)) return null;
  const sceneId = candidate.sceneId as EditorSceneId;
  const profile = getEditorSceneProfile(sceneId);
  if (
    (isLegacyStudyExport && sceneId !== "study")
    || candidate.canvas?.width !== profile.canvas.width
    || candidate.canvas?.height !== profile.canvas.height
    || !Array.isArray(candidate.points)
    || !candidate.routes
    || typeof candidate.routes !== "object"
  ) return null;

  const pointsById: Record<string, EditorPoint> = {};
  for (const rawPoint of candidate.points) {
    const pixel = rawPoint.pixel;
    if (
      typeof rawPoint.id !== "string"
      || typeof rawPoint.label !== "string"
      || !(["door", "seat-left", "seat-right", "bed-edge", "lounge", "scene-entry", "waypoint"] as const).includes(rawPoint.role as EditorAnchorRole)
      || !Array.isArray(pixel)
      || typeof pixel[0] !== "number"
      || typeof pixel[1] !== "number"
    ) return null;
    pointsById[rawPoint.id] = {
      id: rawPoint.id,
      label: rawPoint.label,
      role: rawPoint.role as EditorAnchorRole,
      ...(typeof rawPoint.semanticRole === "string"
        && (["door", "seat-left", "seat-right", "bed-edge", "lounge", "scene-entry"] as const).includes(rawPoint.semanticRole as Exclude<EditorAnchorRole, "waypoint">)
        ? { semanticRole: rawPoint.semanticRole as Exclude<EditorAnchorRole, "waypoint"> }
        : {}),
      ...(typeof rawPoint.anchorKind === "string"
        && (["portal", "interaction", "waypoint"] as const).includes(rawPoint.anchorKind as RouteAnchorKind)
        ? { anchorKind: rawPoint.anchorKind as RouteAnchorKind }
        : {}),
      ...(typeof rawPoint.anchorKey === "string" && rawPoint.anchorKey.trim()
        ? { anchorKey: rawPoint.anchorKey.trim() }
        : {}),
      ...(typeof rawPoint.anchorGroupKey === "string" && rawPoint.anchorGroupKey.trim()
        ? { anchorGroupKey: rawPoint.anchorGroupKey.trim() }
        : {}),
      ...(typeof rawPoint.anchorPort === "string"
        && (["left", "right", "state"] as const).includes(rawPoint.anchorPort as RouteAnchorPort)
        ? { anchorPort: rawPoint.anchorPort as RouteAnchorPort }
        : {}),
      point: [pixel[0], pixel[1]],
      ...(typeof rawPoint.scaleOverride === "number" ? { scaleOverride: rawPoint.scaleOverride } : {}),
    };
  }

  const routes: Record<string, string[]> = {};
  for (const [routeKey, rawRoute] of Object.entries(candidate.routes)) {
    if (!Array.isArray(rawRoute) || rawRoute.some((id) => typeof id !== "string" || !pointsById[id])) return null;
    routes[routeKey] = [...rawRoute] as string[];
  }
  if (Object.keys(routes).length === 0) return null;

  const routeMeta: Record<string, EditorRouteMeta> = {};
  for (const routeKey of Object.keys(routes)) {
    const rawMeta = candidate.routeMeta?.[routeKey];
    const parsedMeta = rawMeta && typeof rawMeta === "object"
        ? rawMeta as {
          label?: unknown;
          kind?: unknown;
          accent?: unknown;
          facingSwitchAfterPointId?: unknown;
          initialFacing?: unknown;
          facingAfterSwitch?: unknown;
          foregroundPolicy?: unknown;
          transitions?: unknown;
          interactionEvents?: unknown;
          assetLibrary?: unknown;
        }
        : {};
    const fallback = profile.initialRouteMeta[routeKey] ?? INITIAL_ROUTE_META[routeKey] ?? {
      id: routeKey,
      label: routeKey,
      kind: "walk" as const,
      accent: "violet" as const,
    };
    const importedRouteIds = routes[routeKey]!;
    const importedStartPointId = importedRouteIds[0];
    const importedEndPointId = importedRouteIds.at(-1);
    routeMeta[routeKey] = {
      ...fallback,
      ...(typeof parsedMeta.label === "string" ? { label: parsedMeta.label } : {}),
      ...(parsedMeta.kind === "walk" || parsedMeta.kind === "arrow" ? { kind: parsedMeta.kind } : {}),
      ...(parsedMeta.accent === "cyan" || parsedMeta.accent === "magenta" || parsedMeta.accent === "amber" || parsedMeta.accent === "violet"
        ? { accent: parsedMeta.accent }
        : {}),
      ...(typeof parsedMeta.facingSwitchAfterPointId === "string"
        ? { facingSwitchAfterPointId: parsedMeta.facingSwitchAfterPointId }
        : {}),
      ...(parsedMeta.initialFacing === "left" || parsedMeta.initialFacing === "right"
        ? { initialFacing: parsedMeta.initialFacing }
        : {}),
      ...(parsedMeta.facingAfterSwitch === "left" || parsedMeta.facingAfterSwitch === "right"
        ? { facingAfterSwitch: parsedMeta.facingAfterSwitch }
        : {}),
      ...(parsedMeta.foregroundPolicy === "none"
        || parsedMeta.foregroundPolicy === "before-turn"
        || parsedMeta.foregroundPolicy === "after-turn"
        || parsedMeta.foregroundPolicy === "always"
        ? { foregroundPolicy: parsedMeta.foregroundPolicy }
        : {}),
      ...(Array.isArray(parsedMeta.transitions)
        ? {
            transitions: parsedMeta.transitions
              .map(normalizeEditorTransition)
              .filter((transition): transition is EditorRouteTransition => Boolean(transition)),
          }
        : {}),
      ...(parsedMeta.interactionEvents !== undefined
        ? { interactionEvents: Array.isArray(parsedMeta.interactionEvents) ? parsedMeta.interactionEvents as EditorSceneInteractionEvent[] : [] }
        : {}),
      ...(parsedMeta.assetLibrary !== undefined
        ? (() => {
            const assetLibrary = normalizeEditorRouteAssetLibrary(parsedMeta.assetLibrary);
            return assetLibrary ? { assetLibrary } : {};
          })()
        : {}),
      id: routeKey,
      ...(importedStartPointId !== undefined ? { startPointId: importedStartPointId } : {}),
      ...(importedEndPointId !== undefined ? { endPointId: importedEndPointId } : {}),
    };
  }

  const scale: EditorScaleSettings = {
    mode: candidate.scale?.mode === "manual" ? "manual" : profile.defaultScale.mode,
    farY: typeof candidate.scale?.farY === "number" ? candidate.scale.farY : profile.defaultScale.farY,
    nearY: typeof candidate.scale?.nearY === "number" ? candidate.scale.nearY : profile.defaultScale.nearY,
    farScale: typeof candidate.scale?.farScale === "number" ? candidate.scale.farScale : profile.defaultScale.farScale,
    nearScale: typeof candidate.scale?.nearScale === "number" ? candidate.scale.nearScale : profile.defaultScale.nearScale,
  };
  const sceneInteractions = normalizeEditorSceneInteractions(candidate.sceneInteractions, pointsById);
  return normalizeEditorDraft({
    version: 2,
    sceneId,
    canvas: { ...profile.canvas },
    pointsById,
    routes,
    routeMeta,
    ...(sceneInteractions ? { sceneInteractions } : {}),
    scale,
  });
}

export function serializeEditorDraft(draft: EditorDraft) {
  const profile = getEditorSceneProfile(draft.sceneId);
  const canvas = draft.canvas ?? profile.canvas;
  const routeMeta = Object.fromEntries(
    Object.keys(draft.routes).map((routeKey) => [routeKey, editorRouteMeta(draft, routeKey)]),
  );
  return {
    schemaVersion: "route-editor.v2",
    sceneId: draft.sceneId,
    coordinateSpace: "pixel-top-left-origin",
    canvas,
    scene: {
      master: profile.masterSrc,
      foreground: profile.foregroundSrc,
      foregroundLayers: profile.foregroundLayers.map((layer) => ({
        id: layer.id,
        source: layer.src,
        label: layer.label,
        policy: layer.policy,
        zIndex: layer.zIndex,
      })),
      floorStatus: profile.floorStatus,
    },
    anchorSemantics: profile.anchorSemantics,
    scale: draft.scale,
    points: Object.values(draft.pointsById).map((point) => ({
      id: point.id,
      label: point.label,
      role: point.role,
      ...(point.semanticRole ? { semanticRole: point.semanticRole } : {}),
      ...(point.anchorKind ? { anchorKind: point.anchorKind } : {}),
      ...(point.anchorKey ? { anchorKey: point.anchorKey } : {}),
      ...(point.anchorGroupKey ? { anchorGroupKey: point.anchorGroupKey } : {}),
      ...(point.anchorPort ? { anchorPort: point.anchorPort } : {}),
      pixel: [Math.round(point.point[0]), Math.round(point.point[1])],
      normalized: [
        Number((point.point[0] / canvas.width).toFixed(6)),
        Number((point.point[1] / canvas.height).toFixed(6)),
      ],
      scaleOverride: point.scaleOverride ?? null,
    })),
    routes: draft.routes,
    routeMeta,
    ...(draft.sceneInteractions ? { sceneInteractions: draft.sceneInteractions } : {}),
    foreground: {
      source: profile.foregroundSrc,
      layers: profile.foregroundLayers.map((layer) => ({
        id: layer.id,
        source: layer.src,
        label: layer.label,
        policy: layer.policy,
        zIndex: layer.zIndex,
      })),
      sourceOfTruth: "transparent-alpha",
      directionPolicy: profile.foregroundLayers.length > 0
        ? "route metadata controls inverse-alpha actor clipping; transparent furniture is never painted"
        : "no transparent foreground layer has been registered for this scene",
      transition: draft.sceneId === "study"
        ? {
            route: "door-to-seat",
            afterPointId: DOOR_TO_SEAT_TURN_POINT_ID,
            afterPointLabel: DOOR_TO_SEAT_TURN_POINT_LABEL,
            beforeFacing: "left",
            afterFacing: "right",
            beforeLayer: "desk-foreground",
            afterLayer: "actor-foreground-with-chair-foreground",
            afterVisibleLayers: ["chair"],
          }
        : null,
    },
  };
}
