import { applyPublishedRouteSnapshots } from "../route-publish/formal-route-runtime";
import type { RouteAnchorKind, RouteAnchorPort, RouteAnchorSource } from "../route-publish/route-anchor-semantics";
import { resolveLifeRouteAlias } from "./life-route-catalog";

export type NovelistActorMode = "seated" | "standing" | "walking";
export type NovelistZoneKey = "writing" | "eating" | "sleeping" | "away";

export type NovelistActorAsset = {
  mode: NovelistActorMode;
  assetId: string | null;
  src: string | null;
  width: number | null;
  height: number | null;
  alt: string;
  anchor: { x: number; y: number };
  zIndex: number;
};

export type NovelistConceptSheetAsset = {
  assetId: string;
  src: string;
  width: number;
  height: number;
  purpose: string;
  visualContract: {
    sameCharacterAcrossPoses: boolean;
    roundBottomBase: boolean;
    noFeet: boolean;
    limitedPalette: boolean;
    recognitionMark: string;
    noTextOrWatermark: boolean;
  };
};

export type NovelistSceneMasterAsset = {
  assetId: string;
  src: string;
  width: number;
  height: number;
  purpose: string;
  visualContract: {
    emptyCharacterStage: boolean;
    stableHotspotLayout: boolean;
    layerFriendly: boolean;
    noTextOrWatermark: boolean;
    roomZones: {
      bed: string;
      desk: string;
      meal: string;
      door: string;
    };
  };
};

export type NovelistSceneLayerAsset = {
  assetId: string;
  src: string;
  width: number;
  height: number;
  status: "approved" | "test";
  approvedForRuntime: boolean;
  purpose: string;
  visualContract: {
    sameCanvasAsSceneMaster: boolean;
    includesOriginalChairPixels: boolean;
    characterAndChairShareCoordinates: boolean;
    narrowRoundBase: boolean;
    noTextOrWatermark: boolean;
  };
};

export type NovelistSceneZone = {
  key: NovelistZoneKey;
  label: string;
  pinLabel: string;
  note: string;
  /**
   * 角色圆弧底座最低点的落脚坐标，采用场景画布归一化坐标，而不是图片透明像素坐标。
   * 前端应将它绑定到 actorAnchor 的 bottom/contact point。
   */
  landing: { x: number; y: number };
  /** 2.5D 景深缩放；业务层提供目标值，动效层负责插值。 */
  perspectiveScale: number;
  /** 独立于角色透明像素的业务交互框，坐标与尺寸均为 0~1 归一化值。 */
  hitbox: { x: number; y: number; width: number; height: number };
  depth: "foreground" | "midground" | "background";
};

export const novelistSceneManifest = {
  sceneId: "novelist-room-v1",
  canvas: { width: 1280, height: 720 },
  conceptSheet: {
    assetId: "novelist-paper-doll-concept-v1",
    src: "/assets/ecology/novelist-paper-doll-concept-v1.webp",
    width: 1672,
    height: 941,
    purpose: "锁定角色轮廓与三态视觉合同，供后续抠图和状态素材制作参考；不直接作为运行时角色图层渲染",
    visualContract: {
      sameCharacterAcrossPoses: true,
      roundBottomBase: true,
      noFeet: true,
      limitedPalette: true,
      recognitionMark: "耳后的褪色红色书签",
      noTextOrWatermark: true,
    },
  } satisfies NovelistConceptSheetAsset,
  sceneMaster: {
    assetId: "novelist-room-master-v1",
    src: "/assets/ecology/novelist-room-master-v1.webp",
    width: 1672,
    height: 941,
    purpose: "小说家房间的可复用底图；固定床、书桌、饭桌和门的位置，运行时只叠加角色与生活状态图层",
    visualContract: {
      emptyCharacterStage: true,
      stableHotspotLayout: true,
      layerFriendly: true,
      noTextOrWatermark: true,
      roomZones: {
        bed: "左侧床铺",
        desk: "中左书桌与写作区",
        meal: "右中饭桌",
        door: "最右侧房门与出门区",
      },
    },
  } satisfies NovelistSceneMasterAsset,
  sceneLayers: {
    chairlessBackplate: {
      assetId: "novelist-room-chairless-backplate-v2",
      src: "/assets/ecology/novelist-room-chairless-backplate-v2.webp",
      width: 1672,
      height: 941,
      status: "approved",
      approvedForRuntime: true,
      purpose: "同一母图坐标下移除写作椅的背板；只用于叠加角色与椅子前景组",
      visualContract: {
        sameCanvasAsSceneMaster: true,
        includesOriginalChairPixels: false,
        characterAndChairShareCoordinates: true,
        narrowRoundBase: true,
        noTextOrWatermark: true,
      },
    },
    seatedBackWithChair: {
      assetId: "novelist-room-seated-back-v3-chair-layer-v2",
      src: "/assets/ecology/novelist-room-seated-back-v3-chair-layer-v2.png",
      width: 1672,
      height: 941,
      status: "test",
      approvedForRuntime: false,
      purpose: "测试版写作前景组；椅背可见性仍不合格，禁止作为正式视觉资产，只用于验证淡入淡出和坐标链路",
      visualContract: {
        sameCanvasAsSceneMaster: true,
        includesOriginalChairPixels: true,
        characterAndChairShareCoordinates: true,
        narrowRoundBase: true,
        noTextOrWatermark: true,
      },
    },
  } satisfies Record<"chairlessBackplate" | "seatedBackWithChair", NovelistSceneLayerAsset>,
  actor: {
    seated: {
      mode: "seated",
      assetId: "novelist-paper-doll-seated-back-v3",
      src: "/assets/ecology/novelist-paper-doll-seated-back-v3.png",
      width: 1024,
      height: 1536,
      alt: "Cartoon paper-doll novelist seated at the desk, rear view, with a round cardboard base",
      anchor: { x: 0.5, y: 0.58 },
      zIndex: 3,
    },
    standing: {
      mode: "standing",
      assetId: "novelist-paper-doll-standing-v1",
      src: "/assets/ecology/novelist-paper-doll-standing-v1.png",
      width: 1024,
      height: 1536,
      alt: "小说家站立的圆底纸板人偶",
      anchor: { x: 0.5, y: 0.58 },
      zIndex: 3,
    },
    walking: {
      mode: "walking",
      assetId: "novelist-paper-doll-walking-v1",
      src: "/assets/ecology/novelist-paper-doll-walking-v1.png",
      width: 1254,
      height: 1254,
      alt: "小说家向门口摇摆移动的圆底纸板人偶",
      anchor: { x: 0.5, y: 0.58 },
      zIndex: 3,
    },
  } satisfies Record<NovelistActorMode, NovelistActorAsset>,
  /**
   * 生态侧业务坐标合同：
   * - landing 是圆弧底座接地点，不是角色图片中心；
   * - hitbox 是可交互业务范围，不从透明像素自动推断；
   * - perspectiveScale 只描述目标景深，具体过渡由反重力动效层实现。
   */
  zones: {
    writing: {
      key: "writing",
      label: "书桌 · 写作",
      pinLabel: "✍️ 书桌前",
      note: "小说家站在书桌前的木地板上。",
      landing: { x: 0.425, y: 0.795 },
      perspectiveScale: 1,
      hitbox: { x: 0.29, y: 0.45, width: 0.28, height: 0.28 },
      depth: "midground",
    },
    eating: {
      key: "eating",
      label: "饭桌 · 补充生活",
      pinLabel: "🍵 饭桌前",
      note: "站在饭桌草席地毯下边缘木地板上。",
      landing: { x: 0.62, y: 0.885 },
      perspectiveScale: 1.14,
      hitbox: { x: 0.55, y: 0.52, width: 0.24, height: 0.3 },
      depth: "foreground",
    },
    sleeping: {
      key: "sleeping",
      label: "床铺 · 休息时段",
      pinLabel: "☾ 床铺边",
      note: "移步到小床前红地毯中央。",
      landing: { x: 0.195, y: 0.805 },
      perspectiveScale: 1.02,
      hitbox: { x: 0.03, y: 0.4, width: 0.27, height: 0.3 },
      depth: "midground",
    },
    away: {
      key: "away",
      label: "门口 · 准备外出",
      pinLabel: "🚪 房门口",
      note: "踩在大门下方棕色脚踏垫地毯上。",
      landing: { x: 0.865, y: 0.72 },
      perspectiveScale: 0.88,
      hitbox: { x: 0.82, y: 0.37, width: 0.16, height: 0.32 },
      depth: "background",
    },
  } satisfies Record<NovelistZoneKey, NovelistSceneZone>,
  hotspots: {
    writer: { x: 0.43, y: 0.52 },
    desk: { x: 0.43, y: 0.61 },
    meal: { x: 0.65, y: 0.62 },
    bed: { x: 0.12, y: 0.58 },
    door: { x: 0.93, y: 0.52 },
  },
} as const;

export function getActorMode(activity: "writing" | "eating" | "sleeping" | "daydreaming" | "away"): NovelistActorMode {
  if (activity === "writing") return "seated";
  if (activity === "away") return "walking";
  return "standing";
}

/**
 * Formal ecology scene contract.
 *
 * The old `novelistSceneManifest` above remains the isolated Motion Lab
 * compatibility manifest. The live room consumes this graph instead: every
 * scene owns one mother image, one action at a time, and action-specific
 * masks. No mask is combined with another mask and no mother image is
 * overwritten at runtime.
 */
export type FormalSceneId =
  | "study"
  | "bedroom"
  | "dining-kitchen"
  | "entrance"
  | "terrace-greenery"
  | "attic"
  | "bathroom-private";

export type NovelistActivity = "writing" | "eating" | "sleeping" | "daydreaming" | "away";
export type FormalActorMode = "seated" | "standing" | "walking";
export type FormalFacingDirection = "right" | "left";
export type NovelistCharacterReferenceId = "back-three-quarter" | "strict-back";
export type NovelistForegroundOcclusionPolicy = "none" | "chair-foreground" | "desk-foreground" | "bedroom-foreground";

export type NovelistCharacterReference = {
  id: NovelistCharacterReferenceId;
  assetId: string;
  src: string;
  purpose: string;
  runtimeAsset: false;
  selectionRule: string;
};

export type NovelistFormalActorAsset = {
  mode: FormalActorMode;
  assetId: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Pending/preview PNGs remain addressable metadata, never runtime truth. */
  runtimeAsset: boolean;
  visualContractStatus: "pending-recut" | "approved";
  /** Source artwork direction; omitted assets use the legacy left-facing base. */
  nativeFacing?: FormalFacingDirection;
  /** Fractional y-position of the last opaque pixel in the source canvas. */
  alphaBottom?: number;
  /**
   * Asset-local size correction for transparent canvases with intentional
   * padding. This is multiplied with the route's perspective scale.
   */
  assetScale?: number;
};

export type FormalRuntimeGateStatus = "ready" | "interface-only" | "blocked" | "paused";

export type NovelistNormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NovelistNormalizedPoint = { x: number; y: number };

export type NovelistNormalizedPolygon = {
  id: string;
  points: readonly NovelistNormalizedPoint[];
};

export type NovelistSafeZoneRef = {
  ref: string;
  status: "pending" | "frozen";
};

export type NovelistAlphaLayerRef = {
  assetId: string;
  src: string;
  width: number;
  height: number;
  approvedForRuntime: boolean;
  status: "pending" | "preview-only" | "approved";
};

export type NovelistActionAssembly = {
  status: "ready" | "preview-only" | "blocked";
  reason: string;
  actorBodyAlpha: NovelistAlphaLayerRef | null;
  actionPropAlpha: NovelistAlphaLayerRef | null;
  actorShadowAlpha: NovelistAlphaLayerRef | null;
  bounds: NovelistNormalizedRect | null;
  contactPoint: NovelistNormalizedPoint | null;
  safeZone: NovelistSafeZoneRef | null;
  floorPlaneRef: string | null;
};

export type NovelistSceneAssetContract = {
  canvas: { width: number; height: number };
  sceneMasterRef: string | null;
  floorPlaneRef: string | null;
  geometryJsonSrc?: string;
  geometryStatus?: "proof-of-concept" | "frozen" | "blocked";
  safeZone: NovelistSafeZoneRef | null;
  actions: Record<string, NovelistActionAssembly>;
};

export type NovelistSceneRuntimeGate = {
  status: FormalRuntimeGateStatus;
  reason: string;
  allowSceneMaster: boolean;
  allowActor: boolean;
  allowPreviews: boolean;
  missing: readonly string[];
};

export type NovelistTransitionPreview = {
  id: "writing-seat-preview" | "stand-by-desk-transition";
  src: string;
  width: 1536;
  height: 1024;
  purpose: string;
  runtimeRole: "transition-preview";
  notSceneMaster: true;
  notTransparentActor: true;
  durationMs: number;
};

export type NovelistRoutePoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: "foreground" | "midground" | "background";
  /** Stable visual contract for this contact point; never infer from DOM size. */
  facing: FormalFacingDirection;
  stableScale: number;
  /** The floor plane that owns the round-base contact point. */
  floorPlaneRef?: string;
  /** The explicit round-base landing point; never inferred from image bounds. */
  contactPoint?: NovelistNormalizedPoint;
  /** The frozen actor-safe zone used by this waypoint. */
  safeZoneRef?: string;
  /** Pixel anchors are authoritative only when explicitly confirmed on the 2:1 master. */
  anchorStatus?: "confirmed-pixel" | "approximate" | "semantic";
  /** Shared semantic identity used to join cloned/reversed route endpoints. */
  anchorKind?: RouteAnchorKind;
  anchorKey?: string;
  /** Interaction family for distinct physical/state ports of one activity. */
  anchorGroupKey?: string;
  anchorPort?: RouteAnchorPort;
  anchorSource?: RouteAnchorSource;
  pixel?: { x: number; y: number };
  anchorNote?: string;
};

export type NovelistRoutePhase = {
  id: string;
  /** Normalized distance interval on the route, half-open except for final arrival. */
  startProgress: number;
  endProgress: number;
  actionId: string;
  /** Camera-facing is a visual contract and may differ from travel direction. */
  cameraFacing: FormalFacingDirection;
  /** Business travel intent is independent from the visual camera-facing contract. */
  travelDirection: "toward-counter" | "toward-table" | "toward-chair" | "toward-kitchen" | "toward-door" | "toward-desk" | "toward-stand" | "toward-lookout" | "toward-writing" | "toward-bed" | "toward-lounge" | "away-from-desk" | "toward-exit" | "toward-bathroom" | "toward-entry" | "stationary";
  actorMode: FormalActorMode;
  foregroundOcclusionPolicy: NovelistForegroundOcclusionPolicy;
  /** Per-obstacle depth modes published by the route editor. */
  layerModes?: Readonly<Record<string, "actor-front" | "obstacle-front">>;
  /** Editor state key retained for diagnostics and future interaction layers. */
  stateId?: string;
  /** Optional explicit path segment; stationary phases use holdAtPointId. */
  pathStartPointId?: string;
  pathEndPointId?: string;
  holdAtPointId?: string;
};

export type NovelistRouteContract = {
  canvas: { width: 1774; height: 887 };
  floorPlaneRef: string;
  safeZoneRef: string;
  /** Pixel geometry source used to audit floor occupancy and obstacle clearance. */
  geometryJsonSrc?: string;
  geometryStatus?: "proof-of-concept" | "frozen" | "blocked";
  maskCanvas: { width: 1774; height: 887 };
  maskRefs: Readonly<Record<string, string>>;
  foregroundOcclusionPolicy: "route-direction" | "chair-foreground-at-settle";
  /** Runtime depth is supplied by the matching transparent foreground layer. */
  foregroundLayerRef?: string;
  /** Split transparent layers used by scenes with more than one depth edge. */
  foregroundLayerRefs?: readonly string[];
  forbiddenRegions: readonly string[];
  /** Approximate normalized obstacle exclusions for route/layout auditing. */
  obstacleExclusionPolygons?: readonly NovelistNormalizedPolygon[];
  /** Approximate normalized floor anchors; final pixel masks remain the visual authority. */
  walkableFloorPolygon: readonly { x: number; y: number }[];
  perspectiveScale: {
    axis: "uniform";
    interpolation: "continuous-linear";
    min: number;
    max: number;
  };
  status: "design-locked" | "preview-only" | "blocked";
};

export type NovelistRoute = {
  id: string;
  label: string;
  waypointIds: readonly string[];
  durationMs: number;
  arriveActionId: string;
  phases?: readonly NovelistRoutePhase[];
  /** Scene-local handoffs at route origin/arrival; the room renders these as actor-local smoke. */
  transitions?: readonly NovelistRouteTransition[];
  /** Persistent scene-component state changes authored in 3001. */
  interactionEvents?: readonly NovelistRouteInteractionEvent[];
  /** True only for routes loaded from formal-route-snapshot.v1. */
  publishedFromSnapshot?: true;
  contract?: NovelistRouteContract;
  motion?: {
    profile: "grounded-walk" | "linear";
    settleMs: number;
  };
};

export type NovelistSceneInteractionAsset = {
  id: string;
  label: string;
  src: string;
  mode: "scene" | "actor";
  zIndex: number;
  scale: number;
  /** Optional normalized scene position for fixed scene props authored in 3001. */
  position?: { x: number; y: number };
  /** Normalized scene/actor-anchor offset. */
  offset: { x: number; y: number };
};

export type NovelistSceneInteractionState = {
  id: string;
  label: string;
  visibleAssetIds: readonly string[];
  actorAssetId?: string;
};

export type NovelistSceneInteraction = {
  id: string;
  label: string;
  kind: "pickup-prop" | "inspect" | "ambient" | "portal";
  anchorPointId: string;
  initialStateId: string;
  assets: readonly NovelistSceneInteractionAsset[];
  states: readonly NovelistSceneInteractionState[];
};

export type NovelistRouteInteractionEvent = {
  pointId: string;
  progress: number;
  interactionId: string;
  stateId: string;
};

export type NovelistRouteTransition = {
  pointId: string;
  phase: "depart" | "arrive";
  style: "smoke";
  durationMs: number;
  /** Editor settle phase; the publisher keeps it separate from fast-turn time. */
  settleMs?: number;
  /** Number of visual turns requested by the editor smoke transition. */
  turns?: number;
  fromFacing?: FormalFacingDirection;
  toFacing?: FormalFacingDirection;
  /** Explicit editor/runtime asset modes; do not infer these from action IDs. */
  fromMode?: "scene" | "actor" | "none";
  toMode?: "scene" | "actor" | "none";
  /** Action shown before the handoff; scene previews are full-stage composites. */
  fromActionId?: string;
  /** Action shown after the handoff; missing means the actor leaves the scene. */
  toActionId?: string;
  /** Keep the actor hidden after an external/door departure finishes. */
  hideAfter?: boolean;
};

export type NovelistResolvedRoute = NovelistRoute & {
  points: readonly NovelistRoutePoint[];
};

export type NovelistSceneAction = {
  id: string;
  label: string;
  activity: NovelistActivity;
  actorMode: FormalActorMode;
  maskSrc: string | null;
  maskStatus?: "pending" | "preview-only" | "approved";
  cameraFacing?: FormalFacingDirection;
  foregroundOcclusionMaskSrc?: string;
  runtimeGate?: "preview-only" | "approved" | "blocked";
  /** Optional same-canvas transparent action output; used instead of a full-scene still. */
  actorAsset?: NovelistFormalActorAsset;
  /** One action may attach one small prop; masks remain one-per-action. */
  prop?: { icon: string; name: string; steam?: boolean };
  /** Optional full-scene arrival still. It replaces the transparent actor while stable. */
  preview?: NovelistSceneActionPreview;
  mood?: string;
};

export type NovelistSceneActionPreview = {
  assetId: string;
  src: string;
  width: number;
  height: number;
  purpose: string;
  runtimeRole: "action-preview";
  notSceneMaster: true;
  /** Full-scene composites stay flagged true; transparent overlays set false. */
  notTransparentActor: boolean;
  transparentOverlay?: boolean;
  /** Normalized point where a scene-state cue should meet the embedded actor. */
  actorAnchor?: { x: number; y: number };
};

export type NovelistSceneForegroundLayer = {
  assetId: string;
  src: string;
  width: 1774;
  height: 887;
  status: "approved" | "test";
  approvedForRuntime: boolean;
  /** The transparent asset itself is the source of the visible occlusion range. */
  sourceOfTruth: "transparent-alpha";
  layerRole: "desk-depth-occluder" | "chair-depth-occluder" | "bedroom-furniture-depth-occluder";
  /** `always` keeps a near-side furniture piece above the actor after a depth turn. */
  renderWhen: "scene-policy" | "always";
  stacking: "under-actor" | "over-actor";
  /** The layer is an inverse-alpha source only; the mother scene owns visible furniture. */
  renderMode: "occlusion-mask";
  purpose: string;
};

export type NovelistSceneHotspot = {
  id: string;
  label: string;
  caption: string;
  x: number | null;
  y: number | null;
  kind: "action" | "world-lab" | "scene-entry" | "privacy";
  activity?: NovelistActivity;
  actionId?: string;
  routeId?: string;
  targetSceneId?: FormalSceneId;
};

export type NovelistFormalScene = {
  sceneId: FormalSceneId;
  label: string;
  subtitle: string;
  masterAsset: {
    assetId: string;
    src: string;
    width: number;
    height: number;
    status: "approved" | "candidate";
    approvedForRuntime: boolean;
  } | null;
  runtimeGate: NovelistSceneRuntimeGate;
  assetContract: NovelistSceneAssetContract;
  foregroundLayers?: readonly NovelistSceneForegroundLayer[];
  /** Scene-owned component layer; absent means the scene has no detachable components. */
  interactions?: readonly NovelistSceneInteraction[];
  privacyBoundary: "public" | "private-door";
  playerStart: string;
  routePoints: readonly NovelistRoutePoint[];
  routes: Record<string, NovelistRoute>;
  actions: Record<string, NovelistSceneAction>;
  hotspots: readonly NovelistSceneHotspot[];
  defaultRouteByActivity: Partial<Record<NovelistActivity, string>>;
};

const formalSceneRoot = "/assets/ecology/formal-scenes";

const bedroomRouteFloorPlaneRef = "bedroom-floor-preview-v1";

/**
 * Runtime preview geometry copied from the route editor's confirmed bedroom
 * anchors. The editor remains the source of truth for future point edits; this
 * snapshot only makes the already-approved three-anchor preview observable in
 * the 3000 room without inventing new coordinates at render time.
 */
const bedroomRoutePoints: readonly NovelistRoutePoint[] = [
  { id: "bedroom-door-entry", label: "卧室门口", x: 1182 / 1774, y: 455 / 887, depth: "midground", facing: "left", stableScale: 0.89, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1182 / 1774, y: 455 / 887 }, anchorStatus: "confirmed-pixel", pixel: { x: 1182, y: 455 } },
  { id: "bedroom-door-to-bed-1", label: "门到床边节点", x: 1035 / 1774, y: 575 / 887, depth: "foreground", facing: "left", stableScale: 1.02, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1035 / 1774, y: 575 / 887 }, anchorStatus: "semantic" },
  { id: "bed-edge", label: "床 / 唱片机交互点", x: 868 / 1774, y: 357 / 887, depth: "midground", facing: "left", stableScale: 0.84, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 868 / 1774, y: 357 / 887 }, anchorStatus: "confirmed-pixel", pixel: { x: 868, y: 357 } },
  { id: "bedroom-bed-to-door-1", label: "床边到门节点", x: 900 / 1774, y: 630 / 887, depth: "foreground", facing: "right", stableScale: 1.09, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 900 / 1774, y: 630 / 887 }, anchorStatus: "semantic" },
  { id: "bedroom-door-to-lounge-1", label: "门到沙发节点 1", x: 1235 / 1774, y: 665 / 887, depth: "foreground", facing: "left", stableScale: 1.11, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1235 / 1774, y: 665 / 887 }, anchorStatus: "semantic" },
  { id: "bedroom-door-to-lounge-2", label: "门到沙发节点 2 / 镜像点", x: 1200 / 1774, y: 650 / 887, depth: "foreground", facing: "right", stableScale: 1.10, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1200 / 1774, y: 650 / 887 }, anchorStatus: "semantic" },
  { id: "lounge-corner", label: "小沙发交互点", x: 1075 / 1774, y: 579 / 887, depth: "foreground", facing: "left", stableScale: 1.02, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1075 / 1774, y: 579 / 887 }, anchorStatus: "confirmed-pixel", pixel: { x: 1075, y: 579 } },
  { id: "bedroom-lounge-to-door-1", label: "沙发到门节点", x: 1330 / 1774, y: 700 / 887, depth: "foreground", facing: "right", stableScale: 1.13, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1330 / 1774, y: 700 / 887 }, anchorStatus: "semantic" },
  { id: "bedroom-bed-to-lounge-1", label: "床边到沙发节点", x: 980 / 1774, y: 700 / 887, depth: "foreground", facing: "right", stableScale: 1.13, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 980 / 1774, y: 700 / 887 }, anchorStatus: "semantic" },
  { id: "bedroom-lounge-to-bed-1", label: "沙发到床边节点", x: 1040 / 1774, y: 690 / 887, depth: "foreground", facing: "left", stableScale: 1.12, floorPlaneRef: bedroomRouteFloorPlaneRef, contactPoint: { x: 1040 / 1774, y: 690 / 887 }, anchorStatus: "semantic" },
];

function bedroomRoutePhase(
  id: string,
  waypointIds: readonly string[],
  cameraFacing: FormalFacingDirection,
  travelDirection: NovelistRoutePhase["travelDirection"],
): NovelistRoutePhase {
  return {
    id,
    startProgress: 0,
    endProgress: 1,
    actionId: "door-stand",
    cameraFacing,
    travelDirection,
    actorMode: "walking",
    foregroundOcclusionPolicy: "bedroom-foreground",
    pathStartPointId: waypointIds[0]!,
    pathEndPointId: waypointIds.at(-1)!,
  };
}

function bedroomRoute(
  id: string,
  label: string,
  waypointIds: readonly string[],
  arriveActionId: string,
  startActionId: string,
  cameraFacing: FormalFacingDirection,
  travelDirection: NovelistRoutePhase["travelDirection"],
): NovelistRoute {
  const startPointId = waypointIds[0]!;
  const endPointId = waypointIds.at(-1)!;
  const arrivesAtDoor = endPointId === "bedroom-door-entry";
  return {
    id,
    label,
    waypointIds,
    durationMs: 1050,
    arriveActionId,
    phases: [bedroomRoutePhase(`${id}-walk`, waypointIds, cameraFacing, travelDirection)],
    transitions: [
      { pointId: startPointId, phase: "depart", style: "smoke", durationMs: 420, fromActionId: startActionId },
      {
        pointId: endPointId,
        phase: "arrive",
        style: "smoke",
        durationMs: 420,
        fromActionId: "door-stand",
        ...(arrivesAtDoor ? { hideAfter: true } : { toActionId: arriveActionId }),
      },
    ],
    motion: { profile: "grounded-walk", settleMs: 220 },
  };
}

const bedroomRoutes: Record<string, NovelistRoute> = {
  "bedroom-to-bed": bedroomRoute("bedroom-to-bed", "门口 → 床 / 唱片机", ["bedroom-door-entry", "bedroom-door-to-bed-1", "bed-edge"], "bed-sleep", "door-stand", "left", "toward-bed"),
  "bed-to-bedroom-door": bedroomRoute("bed-to-bedroom-door", "床 / 唱片机 → 门口", ["bed-edge", "bedroom-bed-to-door-1", "bedroom-door-entry"], "door-stand", "bed-sleep", "right", "toward-door"),
  "bedroom-to-record": bedroomRoute("bedroom-to-record", "门口 → 唱片机", ["bedroom-door-entry", "bedroom-door-to-bed-1", "bed-edge"], "record-place", "door-stand", "left", "toward-bed"),
  "record-to-bedroom-door": bedroomRoute("record-to-bedroom-door", "唱片机 → 门口", ["bed-edge", "bedroom-bed-to-door-1", "bedroom-door-entry"], "door-stand", "record-place", "right", "toward-door"),
  "bedroom-to-lounge": bedroomRoute("bedroom-to-lounge", "门口 → 小沙发", ["bedroom-door-entry", "bedroom-door-to-lounge-1", "bedroom-door-to-lounge-2", "lounge-corner"], "lounge-seat", "door-stand", "right", "toward-lounge"),
  "lounge-to-bedroom-door": bedroomRoute("lounge-to-bedroom-door", "小沙发 → 门口", ["lounge-corner", "bedroom-lounge-to-door-1", "bedroom-door-entry"], "door-stand", "lounge-seat", "right", "toward-door"),
  "bed-to-lounge": bedroomRoute("bed-to-lounge", "床 / 唱片机 → 小沙发", ["bed-edge", "bedroom-bed-to-lounge-1", "lounge-corner"], "lounge-seat", "bed-sleep", "right", "toward-lounge"),
  "lounge-to-bed": bedroomRoute("lounge-to-bed", "小沙发 → 床 / 唱片机", ["lounge-corner", "bedroom-lounge-to-bed-1", "bed-edge"], "bed-sleep", "lounge-seat", "left", "toward-bed"),
  "bedroom-door-stay": bedroomRoute("bedroom-door-stay", "卧室门口停留", ["bedroom-door-entry"], "door-stand", "door-stand", "left", "stationary"),
};

const bedroomStatePreview = (
  assetId: string,
  filename: string,
  purpose: string,
): NovelistSceneActionPreview => ({
  assetId,
  src: `${formalSceneRoot}/bedroom/states/${filename}`,
  width: 1774,
  height: 887,
  purpose,
  runtimeRole: "action-preview",
  notSceneMaster: true,
  notTransparentActor: true,
});

const studyFloorPlaneRef = "study.clean-2x1.main-wood-floor";
const studySafeZone: NovelistSafeZoneRef = {
  ref: "study.clean-2x1.walkable-floor-with-desk-and-ladder-exclusions",
  status: "frozen",
};

const studyActorAsset = (
  mode: FormalActorMode,
  assetId: string,
  src: string,
  alt: string,
  alphaBottom: number,
): NovelistFormalActorAsset => ({
  mode,
  assetId,
  src,
  width: 1024,
  height: 1536,
  alt,
  runtimeAsset: true,
  visualContractStatus: "approved",
  alphaBottom,
});

const studyActorAssets = {
  seated: studyActorAsset(
    "seated",
    "study-writing-seat-back-v1",
    "/assets/ecology/characters/novelist/study-writing-seat-back-v1.webp",
    "书房正式坐姿写作透明纸板人偶",
    0.852,
  ),
  standing: studyActorAsset(
    "standing",
    "study-stand-by-desk-left-v2",
    "/assets/ecology/characters/novelist/study-stand-by-desk-left-v2.webp",
    "书房正式站在书桌旁透明纸板人偶",
    0.919,
  ),
  walkingLeft: studyActorAsset(
    "walking",
    "study-walk-left-v2-mirrored",
    "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp",
    "书房正式右向移动图的水平镜像左向透明纸板人偶 v2",
    0.882,
  ),
  walkingRight: studyActorAsset(
    "walking",
    "study-walk-right-v2",
    "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
    "书房正式右向移动透明纸板人偶 v2",
    0.882,
  ),
};

const studyActionAssembly = (
  assetId: string,
  src: string,
  bounds: NovelistNormalizedRect,
  contactPoint: NovelistNormalizedPoint,
  safeZoneRef: string,
): NovelistActionAssembly => ({
  status: "ready",
  reason: "书房三态正式基线的单角色透明移动预览；整场景抵达图负责最终状态呈现，CSS shadow 仍不冒充独立 shadow alpha。",
  actorBodyAlpha: {
    assetId,
    src,
    width: 1024,
    height: 1536,
    approvedForRuntime: true,
    status: "approved",
  },
  actionPropAlpha: null,
  actorShadowAlpha: null,
  bounds,
  contactPoint,
  safeZone: { ref: safeZoneRef, status: "frozen" },
  floorPlaneRef: studyFloorPlaneRef,
});

const studyActionAssemblies: Record<string, NovelistActionAssembly> = {
  "writing-seat": studyActionAssembly(
    "study-writing-seat-back-v1",
    "/assets/ecology/characters/novelist/study-writing-seat-back-v1.webp",
    { x: 0.38, y: 0.37, width: 0.20, height: 0.43 },
    { x: 0.49, y: 0.84 },
    "study.writing-seat.chair-contact-safe-zone",
  ),
  "stand-by-desk": studyActionAssembly(
    "study-stand-by-desk-left-v2",
    "/assets/ecology/characters/novelist/study-stand-by-desk-left-v2.webp",
    { x: 0.24, y: 0.28, width: 0.17, height: 0.48 },
    { x: 0.34, y: 0.84 },
    "study.stand-by-desk.left-open-floor-safe-zone",
  ),
  "terrace-lookout": studyActionAssembly(
    "study-walk-right-v2",
    "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
    { x: 0.63, y: 0.28, width: 0.17, height: 0.48 },
    { x: 0.72, y: 0.80 },
    "study.terrace-lookout.door-side-floor-safe-zone",
  ),
};

const pendingActionAssembly = (
  status: NovelistActionAssembly["status"],
  reason: string,
): NovelistActionAssembly => ({
  status,
  reason,
  actorBodyAlpha: null,
  actionPropAlpha: null,
  actorShadowAlpha: null,
  bounds: null,
  contactPoint: null,
  safeZone: null,
  floorPlaneRef: null,
});

const pendingSceneAssetContract = (
  sceneMasterRef: string | null,
  actionIds: readonly string[],
  status: NovelistActionAssembly["status"],
  reason: string,
): NovelistSceneAssetContract => ({
  canvas: { width: 1774, height: 887 },
  sceneMasterRef,
  floorPlaneRef: null,
  safeZone: null,
  actions: Object.fromEntries(actionIds.map((actionId) => [actionId, pendingActionAssembly(status, reason)])),
});

const pausedSceneRuntimeGate = (reason: string): NovelistSceneRuntimeGate => ({
  status: "paused",
  reason,
  allowSceneMaster: false,
  allowActor: false,
  allowPreviews: false,
  missing: ["construction-scope"],
});

const terraceNightViewActorAsset: NovelistFormalActorAsset = {
  mode: "walking",
  assetId: "terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless",
  src: `${formalSceneRoot}/terrace-greenery/terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless.webp`,
  width: 186,
  height: 330,
  alt: "露台看夜景的透明纸板角色",
  runtimeAsset: true,
  visualContractStatus: "approved",
};

export const formalEcologySceneManifest: {
  canvas: { width: 1536; height: 1024 };
  activeSceneIds: readonly FormalSceneId[];
  runtimeSceneIds: readonly FormalSceneId[];
  pausedSceneIds: readonly FormalSceneId[];
  edges: ReadonlyArray<{ from: FormalSceneId; to: FormalSceneId; kind: "door" | "ladder" | "life-channel" | "privacy" }>;
  characterReferences: Record<NovelistCharacterReferenceId, NovelistCharacterReference>;
  actorAssets: Record<FormalActorMode, NovelistFormalActorAsset>;
  walkingActorAssets: Record<FormalFacingDirection, NovelistFormalActorAsset>;
  transitionPreviews: Record<NovelistTransitionPreview["id"], NovelistTransitionPreview>;
  scenes: Record<FormalSceneId, NovelistFormalScene>;
} = {
  canvas: { width: 1536, height: 1024 },
  activeSceneIds: [
    "study",
    "bedroom",
    "dining-kitchen",
    "entrance",
    "terrace-greenery",
    "attic",
    "bathroom-private",
  ],
  /** Current construction/runtime exposure. The full list above remains topology metadata. */
  runtimeSceneIds: ["study", "dining-kitchen", "bedroom"],
  pausedSceneIds: ["entrance", "terrace-greenery", "attic", "bathroom-private"],
  edges: [
    { from: "study", to: "bedroom", kind: "door" },
    { from: "study", to: "dining-kitchen", kind: "life-channel" },
    { from: "dining-kitchen", to: "entrance", kind: "door" },
    { from: "study", to: "attic", kind: "ladder" },
    { from: "study", to: "terrace-greenery", kind: "door" },
    { from: "dining-kitchen", to: "bathroom-private", kind: "privacy" },
  ],
  characterReferences: {
    "back-three-quarter": {
      id: "back-three-quarter",
      assetId: "novelist-back-three-quarter-v1",
      src: "/assets/ecology/characters/novelist/novelist-back-three-quarter-v1.webp",
      purpose: "需要一点侧脸时的稳定角色身份参考；不作为透明运行时素材",
      runtimeAsset: false,
      selectionRule: "仅在动作需要三分之二侧脸时使用；不与 strict-back 或旧角色 sheet 混合",
    },
    "strict-back": {
      id: "strict-back",
      assetId: "novelist-back-v1",
      src: "/assets/ecology/characters/novelist/novelist-back-v1.webp",
      purpose: "写作背面、睡眠、离场远景与严格纯背面动作参考；不作为透明运行时素材",
      runtimeAsset: false,
      selectionRule: "写作、睡眠、离场远景只使用纯背面参考；母图永不覆盖",
    },
  },
  actorAssets: {
    seated: {
      mode: "seated",
      assetId: "novelist-paper-doll-seated-back-v3",
      src: "/assets/ecology/novelist-paper-doll-seated-back-v3.png",
      width: 1024,
      height: 1536,
      alt: "小说家纯背面坐姿透明人偶（待小圆弧底座重切）",
      runtimeAsset: false,
      visualContractStatus: "pending-recut",
    },
    standing: {
      mode: "standing",
      assetId: "study-stand-by-desk-left-v2",
      src: "/assets/ecology/characters/novelist/study-stand-by-desk-left-v2.webp",
      width: 1024,
      height: 1536,
      alt: "书房正式站姿透明纸板人偶",
      runtimeAsset: false,
      visualContractStatus: "pending-recut",
    },
    walking: {
      mode: "walking",
      assetId: "novelist-paper-doll-walking-v1",
      src: "/assets/ecology/novelist-paper-doll-walking-v1.png",
      width: 1254,
      height: 1254,
      alt: "小说家摇摆移动透明人偶（待小圆弧底座重切）",
      runtimeAsset: false,
      visualContractStatus: "pending-recut",
    },
  },
  walkingActorAssets: {
    left: {
      mode: "walking",
      assetId: "study-walk-left-v2-mirrored",
      src: "/assets/ecology/characters/novelist/study-walk-left-v2-mirrored.webp",
      width: 1024,
      height: 1536,
      alt: "书房正式右向行走图的水平镜像左向透明动作 v2",
      runtimeAsset: true,
      visualContractStatus: "approved",
    },
    right: {
      mode: "walking",
      assetId: "study-walk-right-v2",
      src: "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
      width: 1024,
      height: 1536,
      alt: "书房角色右向行走透明动作 v2",
      runtimeAsset: true,
      visualContractStatus: "approved",
    },
  },
  transitionPreviews: {
    "writing-seat-preview": {
      id: "writing-seat-preview",
      src: formalSceneRoot + "/study/previews/study-writing-seat-preview-v1.webp",
      width: 1536,
      height: 1024,
      purpose: "对齐写作坐姿、椅子接触点和站起前的角色比例；仅作短暂过渡预览",
      runtimeRole: "transition-preview",
      notSceneMaster: true,
      notTransparentActor: true,
      durationMs: 320,
    },
    "stand-by-desk-transition": {
      id: "stand-by-desk-transition",
      src: formalSceneRoot + "/study/previews/study-stand-by-desk-transition-v1.webp",
      width: 1536,
      height: 1024,
      purpose: "对齐写作离座后的站立比例、椅子接触点与短暂过渡；仅作短暂过渡预览",
      runtimeRole: "transition-preview",
      notSceneMaster: true,
      notTransparentActor: true,
      durationMs: 420,
    },
  },
  scenes: {
    study: {
      sceneId: "study",
      label: "纯粹书房",
      subtitle: "书桌、台灯与右侧生活通道；这里负责把日子写成稿子。",
      masterAsset: {
        assetId: "study-scene-master-2x1-formal-v2",
        src: `${formalSceneRoot}/study/study-scene-master-2x1-formal-v2.webp`,
        width: 1774,
        height: 887,
        status: "approved",
        approvedForRuntime: true,
      },
      runtimeGate: {
        status: "ready",
        reason: "书房母图可作为当前入口基线；角色动作仍只显示已登记的 transition/action preview，透明装配包待纸人交付后再开启。",
        allowSceneMaster: true,
        allowActor: false,
        allowPreviews: true,
        missing: ["actorBodyAlpha", "actionPropAlpha", "actorShadowAlpha", "bounds", "contactPoint", "safeZone"],
      },
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/study/study-scene-master-2x1-formal-v2.webp`,
        ["writing-seat", "stand-by-window", "exit-route"],
        "preview-only",
        "study 动作仍是预览/接口合同，尚未具备可批准的单动作透明装配字段。",
      ),
      privacyBoundary: "public",
      playerStart: "writing-seat",
      routePoints: [
        { id: "writing-seat", label: "书桌前", x: 0.48, y: 0.79, depth: "foreground", facing: "left", stableScale: 1.1, anchorKind: "interaction", anchorKey: "study.desk.state", anchorGroupKey: "study.desk", anchorPort: "state", anchorSource: "authored" },
        { id: "study-rug-edge", label: "书房地毯边", x: 0.63, y: 0.79, depth: "foreground", facing: "right", stableScale: 1.03 },
        { id: "right-life-corridor", label: "右侧生活通道", x: 0.82, y: 0.72, depth: "midground", facing: "right", stableScale: 0.94 },
        { id: "attic-ladder", label: "阁楼梯口", x: 0.62, y: 0.48, depth: "midground", facing: "left", stableScale: 0.91 },
        { id: "terrace-door", label: "屋顶/露台入口", x: 0.87, y: 0.56, depth: "background", facing: "right", stableScale: 0.82 },
      ],
      routes: {
        "study-desk-stay": {
          id: "study-desk-stay",
          label: "回到书桌",
          waypointIds: ["writing-seat"],
          durationMs: 320,
          arriveActionId: "writing-seat",
        },
        "study-writing-to-corridor": {
          id: "study-writing-to-corridor",
          label: "书桌到右侧生活通道",
          waypointIds: ["writing-seat", "study-rug-edge", "right-life-corridor"],
          durationMs: 1200,
          arriveActionId: "stand-by-window",
        },
        "study-writing-to-window": {
          id: "study-writing-to-window",
          label: "书桌到窗边",
          waypointIds: ["writing-seat", "study-rug-edge", "right-life-corridor"],
          durationMs: 1200,
          arriveActionId: "stand-by-window",
        },
        "study-to-attic-ladder": {
          id: "study-to-attic-ladder",
          label: "书房到阁楼梯口",
          waypointIds: ["writing-seat", "study-rug-edge", "attic-ladder"],
          durationMs: 1200,
          arriveActionId: "exit-route",
        },
        "study-to-terrace-door": {
          id: "study-to-terrace-door",
          label: "书房到屋顶入口",
          waypointIds: ["writing-seat", "study-rug-edge", "right-life-corridor", "terrace-door"],
          durationMs: 1500,
          arriveActionId: "exit-route",
        },
      },
      actions: {
        "writing-seat": {
          id: "writing-seat",
          label: "坐在书桌前写作",
          activity: "writing",
          actorMode: "seated",
          maskSrc: `${formalSceneRoot}/study/masks/writing-seat/mask-v2.webp`,
          preview: {
            assetId: "study-writing-seat-scene-v9-paper-base-mother-locked",
            src: `${formalSceneRoot}/study/states/study-writing-seat-scene-v9-paper-base-mother-locked.webp`,
            width: 1774,
            height: 887,
            purpose: "书房坐姿写作的到达静帧；保留椅子、角色比例与桌面关系",
            runtimeRole: "action-preview",
            notSceneMaster: true,
            notTransparentActor: true,
          },
          mood: "灵感上来了，先写两页。",
        },
        "stand-by-window": {
          id: "stand-by-window",
          label: "站在窗边停留",
          activity: "daydreaming",
          actorMode: "standing",
          maskSrc: `${formalSceneRoot}/study/masks/exit-route/mask-v2.webp`,
          preview: {
            assetId: "study-stand-by-window-transition-v1",
            src: `${formalSceneRoot}/study/previews/study-stand-by-window-transition-v1.webp`,
            width: 1536,
            height: 1024,
            purpose: "书房窗边/生活通道停留的到达静帧；只在动作稳定后显示",
            runtimeRole: "action-preview",
            notSceneMaster: true,
            notTransparentActor: true,
          },
          mood: "他把目光放到窗外，等下一句自己浮上来。",
        },
        "exit-route": {
          id: "exit-route",
          label: "沿生活通道离开书房",
          activity: "away",
          actorMode: "walking",
          maskSrc: `${formalSceneRoot}/study/masks/exit-route/mask-v2.webp`,
          mood: "先走两步，看看别的房间有没有灵感。",
        },
      },
      hotspots: [
        { id: "desk-world-lab", label: "书桌 · 进入 World Lab", caption: "从书房自然转入写作工作台", x: 0.49, y: 0.62, kind: "world-lab" },
        { id: "writer-observe", label: "小说家", caption: "观察他此刻的状态", x: 0.48, y: 0.45, kind: "action", activity: "writing", actionId: "writing-seat", routeId: "study-desk-stay" },
        { id: "life-corridor", label: "右侧生活通道", caption: "看他摇摇摆摆走过去", x: 0.82, y: 0.58, kind: "action", activity: "daydreaming", actionId: "stand-by-window", routeId: "study-writing-to-window" },
        { id: "attic-entry", label: "阁楼梯子", caption: "沿梯子进入星光阁楼", x: 0.62, y: 0.35, kind: "scene-entry", activity: "daydreaming", targetSceneId: "attic", routeId: "study-to-attic-ladder" },
        { id: "terrace-entry", label: "屋顶/露台入口", caption: "去露台照看绿植和小龟", x: 0.87, y: 0.49, kind: "scene-entry", activity: "daydreaming", targetSceneId: "terrace-greenery", routeId: "study-to-terrace-door" },
      ],
      defaultRouteByActivity: { writing: "study-desk-stay", daydreaming: "study-writing-to-window", away: "study-writing-to-corridor" },
    },
    bedroom: {
      sceneId: "bedroom",
      label: "纯粹卧室",
      subtitle: "床、唱片机与懒人沙发；不放写字台，让休息保持自己的节奏。",
      masterAsset: {
        assetId: "bedroom-scene-master-2x1-formal-v1",
        src: `${formalSceneRoot}/bedroom/bedroom-scene-master-2x1-formal-v1.webp`,
        width: 1774,
        height: 887,
        status: "candidate",
        approvedForRuntime: false,
      },
      runtimeGate: {
        status: "interface-only",
        reason: "卧室路线已接入 3000 预览；场景状态图与床/沙发 alpha 遮挡仍保持 preview-only，不伪装成最终 runtime 装配。",
        allowSceneMaster: true,
        allowActor: false,
        allowPreviews: true,
        missing: ["approved clean master", "floorPlaneRef", "safeZone", "actorBodyAlpha", "actionPropAlpha", "actorShadowAlpha", "bounds", "contactPoint"],
      },
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/bedroom/bedroom-scene-master-2x1-formal-v1.webp`,
        ["bed-sleep", "record-place", "lounge-seat", "door-stand"],
        "blocked",
        "卧室 2:1 参考母图与动作装配闸门未通过；卧室旧 1536×1024 资产全部降级为失败品，不消费其业务坐标。",
      ),
      foregroundLayers: [
        {
          assetId: "bedroom-bed-occluder-aligned-v1",
          src: `${formalSceneRoot}/bedroom/geometry/foreground/bedroom-bed-occluder-aligned-v1.webp`,
          width: 1774,
          height: 887,
          status: "test",
          approvedForRuntime: true,
          sourceOfTruth: "transparent-alpha",
          layerRole: "bedroom-furniture-depth-occluder",
          renderWhen: "scene-policy",
          stacking: "over-actor",
          renderMode: "occlusion-mask",
          purpose: "床与小沙发的全画布透明前景层；角色经过两者的视觉范围时由 alpha 决定遮挡，不转成碰撞几何。",
        },
      ],
      privacyBoundary: "public",
      playerStart: "bedroom-door-entry",
      // Coordinates stay empty until the reference image is converted into an approved clean master and floor plane.
      routePoints: bedroomRoutePoints,
      routes: bedroomRoutes,
      actions: {
        "bed-sleep": {
          id: "bed-sleep",
          label: "在床上睡觉",
          activity: "sleeping",
          actorMode: "standing",
          maskSrc: `${formalSceneRoot}/bedroom/masks/bed-sleep/mask-v1.webp`,
          runtimeGate: "preview-only",
          preview: bedroomStatePreview(
            "bedroom-bed-sleep-scene-v1-paper-identity",
            "bedroom-bed-sleep-scene-v1-paper-identity.webp",
            "卧室正式睡觉状态合成图；使用新版母图与纸质版小说家身份，不作为透明角色图层。",
          ),
          mood: "安心地睡一会儿，梦里也许有一段新旋律。",
        },
        "record-place": {
          id: "record-place",
          label: "在唱片机前放唱片",
          activity: "daydreaming",
          actorMode: "standing",
          maskSrc: null,
          maskStatus: "pending",
          runtimeGate: "preview-only",
          preview: bedroomStatePreview(
            "bedroom-record-place-scene-v1-paper-identity",
            "bedroom-record-place-scene-v1-paper-identity.webp",
            "卧室正式放唱片状态合成图；使用新版母图与纸质版小说家身份，不作为透明角色图层。",
          ),
          mood: "先把唱片放好，再让房间慢慢响起来。",
        },
        "lounge-seat": {
          id: "lounge-seat",
          label: "窝在懒人沙发听唱片",
          activity: "daydreaming",
          actorMode: "standing",
          maskSrc: `${formalSceneRoot}/bedroom/masks/lounge-seat/mask-v1.webp`,
          runtimeGate: "preview-only",
          preview: bedroomStatePreview(
            "bedroom-lounge-seat-scene-v1-paper-identity",
            "bedroom-lounge-seat-scene-v1-paper-identity.webp",
            "卧室正式坐沙发状态合成图；使用新版母图与纸质版小说家身份，不作为透明角色图层。",
          ),
          mood: "窝进沙发里，开心地听完这一面唱片。",
        },
        "door-stand": { id: "door-stand", label: "站在卧室门口", activity: "away", actorMode: "walking", maskSrc: `${formalSceneRoot}/bedroom/masks/door-stand/mask-v1.webp` },
      },
      hotspots: [
        { id: "bed-hotspot", label: "床铺 · 睡觉", caption: "让夜色接管这一小间卧室", x: null, y: null, kind: "action", activity: "sleeping", actionId: "bed-sleep", routeId: "bedroom-to-bed" },
        // The published bedroom snapshot has no independent record-place
        // route yet. Keep its action asset in the manifest for the next
        // editor publish, but do not expose a dead hotspot that points at a
        // retired route ID.
        { id: "lounge-hotspot", label: "唱片与懒人沙发", caption: "坐下发呆，听一面旧唱片", x: null, y: null, kind: "action", activity: "daydreaming", actionId: "lounge-seat", routeId: "door-to-lounge" },
        { id: "bedroom-door", label: "卧室门", caption: "回到生活通道", x: null, y: null, kind: "scene-entry", targetSceneId: "study", activity: "writing", routeId: "study-desk-stay" },
      ],
      defaultRouteByActivity: { sleeping: "bedroom-to-bed", daydreaming: "door-to-lounge", away: "bedroom-door-stay" },
    },
    "dining-kitchen": {
      sceneId: "dining-kitchen",
      label: "纯粹餐厨",
      subtitle: "吃饭、冲咖啡和续命；不把厨房重新变成第二书房。",
      masterAsset: {
        assetId: "dining-kitchen-scene-master-2x1-formal-v1",
        src: `${formalSceneRoot}/dining-kitchen/dining-kitchen-scene-master-2x1-formal-v1.webp`,
        width: 1774,
        height: 887,
        status: "approved",
        approvedForRuntime: true,
      },
      runtimeGate: {
        status: "interface-only",
        reason: "2:1 clean master 与两条固定餐厨生活路线已冻结；纸人透明层仍由独立资产门禁阻断，不能阻塞路线阶段消费。",
        allowSceneMaster: true,
        allowActor: false,
        allowPreviews: true,
        missing: ["actorBodyAlpha", "actionPropAlpha", "actorShadowAlpha", "bounds", "contactPoint"],
      },
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/dining-kitchen/dining-kitchen-scene-master-2x1-formal-v1.webp`,
        ["serve-red-bean-soup", "carry-bowl", "carry-bowl-return", "chair-approach", "sit-down", "meal-table", "leave-after-meal", "kitchen-counter", "exit-route"],
        "blocked",
        "餐厨 floorPlaneRef 与单动作透明装配未交付；禁止以旧 1536×1024 坐标或预览图进入 runtime。",
      ),
      privacyBoundary: "public",
      playerStart: "dining-entry",
      routePoints: [],
      routes: {},
      actions: {
        "meal-table": {
          id: "meal-table",
          label: "在饭桌旁吃饭",
          activity: "eating",
          actorMode: "standing",
          maskSrc: `${formalSceneRoot}/dining-kitchen/masks/meal-table/mask-v1.webp`,
          prop: { icon: "🍵", name: "热茶木碗", steam: true },
          preview: {
            assetId: "dining-kitchen-meal-table-clean-2x1-preview-v1",
            src: `${formalSceneRoot}/dining-kitchen/dining-kitchen-scene-master-2x1-formal-v1.webp`,
            width: 1774,
            height: 887,
            purpose: "餐厨饭桌到达静帧；保留桌椅、角色与热食的完整遮挡关系",
            runtimeRole: "action-preview",
            notSceneMaster: true,
            notTransparentActor: true,
          },
          mood: "红豆汤温度刚刚好……先喝两口。",
        },
        "kitchen-counter": { id: "kitchen-counter", label: "在料理台前发呆", activity: "daydreaming", actorMode: "standing", maskSrc: `${formalSceneRoot}/dining-kitchen/masks/kitchen-counter/mask-v1.webp`, mood: "锅盖响了一声，像是一个章节结尾。" },
        "exit-route": { id: "exit-route", label: "沿餐厨出口离开", activity: "away", actorMode: "walking", maskSrc: `${formalSceneRoot}/dining-kitchen/masks/exit-route/mask-v1.webp` },
      },
      hotspots: [
        { id: "meal-hotspot", label: "饭桌 · 吃饭", caption: "补充一点生活再回去写", x: null, y: null, kind: "action", activity: "eating", actionId: "meal-table", routeId: "dining-counter-to-table" },
        { id: "counter-hotspot", label: "料理台", caption: "先到料理台盛红豆汤，再端到饭桌", x: null, y: null, kind: "action", activity: "eating", actionId: "serve-red-bean-soup", routeId: "dining-entry-to-counter" },
        { id: "dining-exit-hotspot", label: "吃完饭 · 入口离场", caption: "沿独立木地板路线回到门口", x: 0.1, y: 0.7, kind: "action", activity: "away", actionId: "leave-after-meal", routeId: "dining-table-to-entry" },
        { id: "dining-door", label: "生活通道", caption: "回书房或去玄关", x: null, y: null, kind: "scene-entry", targetSceneId: "study", activity: "writing", routeId: "study-desk-stay" },
      ],
      defaultRouteByActivity: { eating: "dining-entry-to-counter", daydreaming: "dining-entry-to-counter", away: "dining-table-to-entry" },
    },
    entrance: {
      sceneId: "entrance",
      label: "玄关",
      subtitle: "家与外界的边界；采风、信箱与回家都从这里发生。",
      masterAsset: {
        assetId: "entrance-scene-master-transit-hub-v2-interaction-clean",
        src: `${formalSceneRoot}/entrance/entrance-scene-master-transit-hub-v2-interaction-clean.webp`,
        width: 1774,
        height: 887,
        status: "approved",
        approvedForRuntime: true,
      },
      runtimeGate: pausedSceneRuntimeGate("玄关暂停运行时接入；等待三场景施工批次完成后再恢复。"),
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/entrance/entrance-scene-master-transit-hub-v2-interaction-clean.webp`,
        ["outside-door", "return-home", "bathroom-door"],
        "blocked",
        "玄关属于暂停节点，不向正式 room 提供 runtime 动作装配。",
      ),
      privacyBoundary: "public",
      playerStart: "entrance-life-channel",
      routePoints: [
        { id: "entrance-life-channel", label: "生活通道", x: 0.2, y: 0.77, depth: "midground", facing: "right", stableScale: 0.95 },
        { id: "apartment-door", label: "公寓门", x: 0.12, y: 0.68, depth: "background", facing: "left", stableScale: 0.84 },
        { id: "outside-threshold", label: "外出门槛", x: 0.43, y: 0.76, depth: "foreground", facing: "right", stableScale: 1.08 },
        { id: "bathroom-door", label: "浴室门外", x: 0.58, y: 0.62, depth: "midground", facing: "left", stableScale: 0.94 },
      ],
      routes: {
        "entrance-to-outside": { id: "entrance-to-outside", label: "生活通道到外出门槛", waypointIds: ["entrance-life-channel", "outside-threshold"], durationMs: 1000, arriveActionId: "outside-door" },
        "entrance-to-bathroom-door": { id: "entrance-to-bathroom-door", label: "走到浴室门外", waypointIds: ["entrance-life-channel", "bathroom-door"], durationMs: 800, arriveActionId: "bathroom-door" },
        "entrance-return": { id: "entrance-return", label: "回到生活通道", waypointIds: ["outside-threshold", "entrance-life-channel"], durationMs: 1000, arriveActionId: "return-home" },
      },
      actions: {
        "outside-door": { id: "outside-door", label: "从玄关外出采风", activity: "away", actorMode: "walking", maskSrc: `${formalSceneRoot}/entrance/masks/outside-door/mask-v1.webp`, prop: { icon: "📋", name: "采风便签" }, mood: "看看夜景，找找小说灵感。" },
        "return-home": { id: "return-home", label: "带着线索回家", activity: "daydreaming", actorMode: "standing", maskSrc: `${formalSceneRoot}/entrance/masks/return-home/mask-v1.webp`, mood: "鞋底带回一点夜里的水汽。" },
        "bathroom-door": { id: "bathroom-door", label: "停在浴室门外", activity: "away", actorMode: "standing", maskSrc: `${formalSceneRoot}/entrance/masks/bathroom-door/mask-v1.webp`, mood: "门后是隐私区域，系统在门外等。" },
      },
      hotspots: [
        { id: "outside-hotspot", label: "房门 · 外出", caption: "带上便签去采风", x: 0.12, y: 0.46, kind: "action", activity: "away", actionId: "outside-door", routeId: "entrance-to-outside" },
        { id: "return-hotspot", label: "回家", caption: "把外面的夜色带回来", x: 0.44, y: 0.65, kind: "action", activity: "daydreaming", actionId: "return-home", routeId: "entrance-return" },
        { id: "bathroom-hotspot", label: "浴室门", caption: "隐私边界：只看门外状态", x: 0.59, y: 0.48, kind: "privacy", activity: "away", actionId: "bathroom-door", routeId: "entrance-to-bathroom-door", targetSceneId: "bathroom-private" },
        { id: "entrance-study", label: "回生活通道", caption: "回到书房或餐厨", x: 0.05, y: 0.7, kind: "scene-entry", targetSceneId: "study", activity: "writing", routeId: "study-desk-stay" },
      ],
      defaultRouteByActivity: { away: "entrance-to-outside", daydreaming: "entrance-return" },
    },
    "terrace-greenery": {
      sceneId: "terrace-greenery",
      label: "露台绿植角",
      subtitle: "绿植、小龟和夜风；这里是低成本但真实的陪伴区。",
      masterAsset: {
        assetId: "terrace-greenery-scene-master-paper-diorama-formal-v4-lossless",
        src: `${formalSceneRoot}/terrace-greenery/terrace-greenery-scene-master-paper-diorama-formal-v4-lossless.webp`,
        width: 1774,
        height: 887,
        status: "approved",
        approvedForRuntime: true,
      },
      runtimeGate: pausedSceneRuntimeGate("露台绿植角暂停运行时接入；阳台/屋顶场景另行冻结资产与路径。"),
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/terrace-greenery/terrace-greenery-scene-master-paper-diorama-formal-v4-lossless.webp`,
        ["bench", "turtle-pond", "telescope", "maintenance-ladder"],
        "blocked",
        "露台属于暂停节点，不向正式 room 提供 runtime 动作装配。",
      ),
      privacyBoundary: "public",
      playerStart: "terrace-entry",
      routePoints: [
        { id: "terrace-entry", label: "露台入口", x: 0.16, y: 0.78, depth: "midground", facing: "right", stableScale: 0.9 },
        { id: "terrace-bench", label: "露台长椅", x: 0.71, y: 0.75, depth: "foreground", facing: "right", stableScale: 1.05 },
        { id: "turtle-pond", label: "小龟角", x: 0.7, y: 0.87, depth: "foreground", facing: "left", stableScale: 1.12 },
        { id: "telescope", label: "浇花点", x: 0.55, y: 0.68, depth: "midground", facing: "left", stableScale: 0.98 },
      ],
      routes: {
        "terrace-to-bench": { id: "terrace-to-bench", label: "入口到长椅", waypointIds: ["terrace-entry", "terrace-bench"], durationMs: 1100, arriveActionId: "bench" },
        "terrace-to-turtle": { id: "terrace-to-turtle", label: "入口到小龟角", waypointIds: ["terrace-entry", "turtle-pond"], durationMs: 1050, arriveActionId: "turtle-pond" },
        "terrace-to-telescope": { id: "terrace-to-telescope", label: "入口到望远镜", waypointIds: ["terrace-entry", "telescope"], durationMs: 900, arriveActionId: "telescope" },
      },
      actions: {
        bench: { id: "bench", label: "在长椅边看夜景", activity: "daydreaming", actorMode: "standing", actorAsset: terraceNightViewActorAsset, cameraFacing: "right", maskSrc: `${formalSceneRoot}/terrace-greenery/masks/bench/mask-v1.webp`, mood: "夜风把一个句子的开头吹过来了。" },
        "turtle-pond": { id: "turtle-pond", label: "照看小龟", activity: "daydreaming", actorMode: "standing", maskSrc: `${formalSceneRoot}/terrace-greenery/masks/turtle-pond/mask-v1.webp`, mood: "小龟今天也没有写完它的故事。" },
        telescope: { id: "telescope", label: "浇花", activity: "daydreaming", actorMode: "standing", maskSrc: `${formalSceneRoot}/terrace-greenery/masks/telescope/mask-v1.webp`, mood: "给叶片一点水，也给脑海里干涸的句子留一口气。" },
        "maintenance-ladder": { id: "maintenance-ladder", label: "沿维护梯回屋", activity: "away", actorMode: "walking", maskSrc: `${formalSceneRoot}/terrace-greenery/masks/maintenance-ladder/mask-v1.webp` },
      },
      hotspots: [
        { id: "terrace-bench-hotspot", label: "长椅 · 看夜景", caption: "停一会儿，别急着写", x: 0.72, y: 0.65, kind: "action", activity: "daydreaming", actionId: "bench", routeId: "terrace-to-bench" },
        { id: "turtle-hotspot", label: "小龟与绿植", caption: "给生活留一点慢动作", x: 0.72, y: 0.82, kind: "action", activity: "daydreaming", actionId: "turtle-pond", routeId: "terrace-to-turtle" },
        { id: "telescope-hotspot", label: "花盆 · 浇花", caption: "先照料一小片绿色，再找下一句", x: 0.55, y: 0.59, kind: "action", activity: "daydreaming", actionId: "telescope", routeId: "terrace-to-telescope" },
        { id: "terrace-study", label: "回屋", caption: "把灵感带回书房", x: 0.14, y: 0.58, kind: "scene-entry", targetSceneId: "study", activity: "writing", routeId: "study-desk-stay" },
      ],
      defaultRouteByActivity: { daydreaming: "terrace-to-bench", away: "terrace-to-telescope" },
    },
    attic: {
      sceneId: "attic",
      label: "星光阁楼",
      subtitle: "旧书、旧作与暂未打开的记忆层；先用新版母图规划梯口与旧稿动线。",
      masterAsset: {
        assetId: "attic-scene-master-v2",
        src: `${formalSceneRoot}/attic/masters/attic-scene-master-v2.webp`,
        width: 1774,
        height: 887,
        status: "approved",
        approvedForRuntime: false,
      },
      runtimeGate: pausedSceneRuntimeGate("星光阁楼暂停运行时接入；候选母图不进入正式 room。"),
      assetContract: pendingSceneAssetContract(
        `${formalSceneRoot}/attic/masters/attic-scene-master-v2.webp`,
        ["archive-shelf", "stair-entry"],
        "blocked",
        "阁楼属于暂停节点，候选母图与环境 mask 不提供 runtime 动作。",
      ),
      privacyBoundary: "public",
      playerStart: "attic-stair-entry",
      routePoints: [
        { id: "attic-stair-entry", label: "阁楼梯口", x: 0.18, y: 0.78, depth: "midground", facing: "right", stableScale: 0.9 },
        { id: "archive-shelf", label: "旧书架", x: 0.68, y: 0.76, depth: "foreground", facing: "left", stableScale: 1.05 },
      ],
      routes: {
        "attic-to-archive": { id: "attic-to-archive", label: "梯口到旧书架", waypointIds: ["attic-stair-entry", "archive-shelf"], durationMs: 1100, arriveActionId: "archive-shelf" },
        "attic-stair-stay": { id: "attic-stair-stay", label: "阁楼梯口停留", waypointIds: ["attic-stair-entry"], durationMs: 320, arriveActionId: "stair-entry" },
      },
      actions: {
        "archive-shelf": { id: "archive-shelf", label: "在旧书架前翻找", activity: "daydreaming", actorMode: "standing", maskSrc: `${formalSceneRoot}/attic/masks/archive-shelf/mask-v1.webp`, mood: "这本旧稿的结尾，也许可以借给今天。" },
        "stair-entry": { id: "stair-entry", label: "站在阁楼梯口", activity: "away", actorMode: "walking", maskSrc: `${formalSceneRoot}/attic/masks/stair-entry/mask-v1.webp` },
      },
      hotspots: [
        { id: "archive-hotspot", label: "旧书架", caption: "翻一页旧作，不进入分支游戏", x: 0.68, y: 0.62, kind: "action", activity: "daydreaming", actionId: "archive-shelf", routeId: "attic-to-archive" },
        { id: "attic-study", label: "下楼回书房", caption: "把旧线索带回桌面", x: 0.17, y: 0.62, kind: "scene-entry", targetSceneId: "study", activity: "writing", routeId: "study-desk-stay" },
      ],
      defaultRouteByActivity: { daydreaming: "attic-to-archive", away: "attic-stair-stay" },
    },
    "bathroom-private": {
      sceneId: "bathroom-private",
      label: "浴室门外 · 隐私边界",
      subtitle: "只显示门外状态；小说家离场后才允许静态陈设/低敏感线索调查。",
      masterAsset: null,
      runtimeGate: pausedSceneRuntimeGate("浴室保留隐私边界，不作为当前施工批次的可观察房间。"),
      assetContract: pendingSceneAssetContract(
        null,
        ["closed-door-outside"],
        "blocked",
        "浴室只保留门外隐私协议，不生成内部角色层。",
      ),
      privacyBoundary: "private-door",
      playerStart: "bathroom-door",
      routePoints: [{ id: "bathroom-door", label: "浴室门外", x: 0.5, y: 0.72, depth: "midground", facing: "left", stableScale: 0.94 }],
      routes: {
        "bathroom-door-stay": { id: "bathroom-door-stay", label: "停在浴室门外", waypointIds: ["bathroom-door"], durationMs: 320, arriveActionId: "closed-door-outside" },
      },
      actions: {
        "closed-door-outside": { id: "closed-door-outside", label: "门外等待", activity: "away", actorMode: "standing", maskSrc: `${formalSceneRoot}/bathroom-private/masks/closed-door-outside/mask-v1.webp`, mood: "此区域暂不提供实时观测，本座在门外等着。" },
      },
      hotspots: [
        { id: "private-door", label: "浴室门（隐私）", caption: "只看门外提示，不进入实时画面", x: 0.5, y: 0.58, kind: "privacy", activity: "away", actionId: "closed-door-outside", routeId: "bathroom-door-stay" },
        { id: "private-return", label: "离开门外", caption: "回到玄关继续生活", x: 0.22, y: 0.72, kind: "scene-entry", targetSceneId: "entrance", activity: "away", routeId: "entrance-return" },
      ],
      defaultRouteByActivity: { away: "bathroom-door-stay" },
    },
  },
};

const studyScene = formalEcologySceneManifest.scenes.study;

const studyRouteContract: NovelistRouteContract = {
  canvas: { width: 1774, height: 887 },
  floorPlaneRef: studyFloorPlaneRef,
  safeZoneRef: studySafeZone.ref,
  maskCanvas: { width: 1774, height: 887 },
  maskRefs: {
    "writing-seat": `${formalSceneRoot}/study/masks/writing-seat/mask-v2.webp`,
    "stand-by-desk": `${formalSceneRoot}/study/masks/stand-by-desk/mask-v2.webp`,
    "terrace-lookout": `${formalSceneRoot}/study/masks/exit-route/mask-v2.webp`,
  },
  foregroundOcclusionPolicy: "route-direction",
  foregroundLayerRef: "study-desk-table-cutout-2x1-imagegen-v2",
  foregroundLayerRefs: [
    "study-desk-table-cutout-2x1-imagegen-v2",
    "study-chair-cutout-2x1-user-v1",
  ],
  forbiddenRegions: [
    "desk-top-and-drawers",
    "chair-seat-and-back",
    "rug-center",
    "ladder-and-ladder-foot",
    "bookcase-and-window-sill",
    "corridor-threshold-frame",
    "terrace-greenery-opening-and-furniture",
  ],
  walkableFloorPolygon: [
    { x: 0.07, y: 0.61 },
    { x: 0.27, y: 0.61 },
    // The writing-seat contact is a confirmed chair-side anchor. Keep this
    // small upper-floor bend inside the audit polygon; furniture occlusion is
    // still enforced separately by `forbiddenRegions` and the alpha layer.
    { x: 0.36, y: 0.62 },
    { x: 0.47, y: 0.60 },
    { x: 0.60, y: 0.70 },
    { x: 0.73, y: 0.63 },
    { x: 0.84, y: 0.58 },
    { x: 0.88, y: 0.61 },
    { x: 0.94, y: 0.78 },
    { x: 0.78, y: 0.91 },
    { x: 0.47, y: 0.96 },
    { x: 0.14, y: 0.94 },
    { x: 0.07, y: 0.82 },
  ],
  perspectiveScale: {
    axis: "uniform",
    interpolation: "continuous-linear",
    min: 0.82,
    max: 1.05,
  },
  status: "design-locked",
};

const studyEditorRouteContract: NovelistRouteContract = {
  ...studyRouteContract,
  perspectiveScale: {
    ...studyRouteContract.perspectiveScale,
    min: 0.87,
    max: 1.42,
  },
};

const studyRoutePoints: readonly NovelistRoutePoint[] = [
  { id: "writing-seat", label: "书桌前写作", x: 804 / 1774, y: 557 / 887, depth: "foreground", facing: "left", stableScale: 1.04, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", anchorKind: "interaction", anchorKey: "study.desk.state", anchorGroupKey: "study.desk", anchorPort: "state", anchorSource: "authored", anchorNote: "seated writing state; route arrivals use the independently authored left/right desk ports" },
  { id: "stand-by-desk", label: "书桌左前侧站立", x: 0.34, y: 0.84, depth: "foreground", facing: "right", stableScale: 1.00, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", anchorNote: "v2 stand-by-desk composite: left open-floor contact" },
  { id: "seat-to-door-curve-1", label: "seat-to-door curve 1", x: 950 / 1774, y: 760 / 887, depth: "foreground", facing: "right", stableScale: 1.05, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "south-side curve leaves the seat without crossing the desk alpha" },
  { id: "seat-to-door-curve-2", label: "seat-to-door curve 2", x: 1040 / 1774, y: 758 / 887, depth: "foreground", facing: "right", stableScale: 1.04, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "south-side curve keeps the actor in front of the desk" },
  { id: "seat-to-door-curve-3", label: "seat-to-door curve 3", x: 1120 / 1774, y: 730 / 887, depth: "foreground", facing: "right", stableScale: 1.00, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "curve turns toward the right life corridor" },
  { id: "seat-to-door-curve-4", label: "seat-to-door curve 4", x: 1180 / 1774, y: 690 / 887, depth: "midground", facing: "right", stableScale: 0.96, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "door approach remains on the clean wood floor" },
  { id: "door-to-seat-back-1", label: "door-to-seat back 1", x: 1240 / 1774, y: 600 / 887, depth: "midground", facing: "left", stableScale: 0.88, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "return route turns behind the desk from the door side" },
  { id: "door-to-seat-back-2", label: "door-to-seat back 2", x: 1160 / 1774, y: 540 / 887, depth: "midground", facing: "left", stableScale: 0.90, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "return route enters the desk alpha visual range" },
  { id: "door-to-seat-back-3", label: "door-to-seat back 3", x: 1060 / 1774, y: 500 / 887, depth: "midground", facing: "left", stableScale: 0.92, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "behind-desk lane" },
  { id: "door-to-seat-back-4", label: "door-to-seat back 4", x: 950 / 1774, y: 490 / 887, depth: "midground", facing: "left", stableScale: 0.94, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "behind-desk lane" },
  { id: "door-to-seat-back-5", label: "回程节点 5", x: 780 / 1774, y: 424 / 887, depth: "midground", facing: "left", stableScale: 0.96, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "return route exits the desk alpha range on the left" },
  { id: "door-to-seat-back-6", label: "回程节点 6 · 点位 6", x: 725 / 1774, y: 465 / 887, depth: "midground", facing: "left", stableScale: 0.98, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "last point behind the desk before the depth and facing switch" },
  { id: "door-to-seat-back-7", label: "回程节点 7 · 翻转点", x: 749 / 1774, y: 523 / 887, depth: "foreground", facing: "right", stableScale: 1.00, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", anchorNote: "at point 7 the actor turns right and becomes foreground to the desk" },
  { id: "desk-left-turn", label: "书桌左侧转入点", x: 760 / 1774, y: 520 / 887, depth: "foreground", facing: "left", stableScale: 1.00, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "direction-owned turn before the left-side desk approach" },
  { id: "desk-left-approach", label: "desk-left approach", x: 804 / 1774, y: 557 / 887, depth: "foreground", facing: "right", stableScale: 1.02, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", anchorNote: "left-side floor approach before the writing seat" },
  { id: "desk-front-clearance", label: "桌前方空地", x: 0.43, y: 0.88, depth: "foreground", facing: "right", stableScale: 0.98, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "clearance waypoint below desk/chair, never on rug" },
  { id: "rug-south-edge", label: "地毯南侧外沿", x: 0.60, y: 0.88, depth: "foreground", facing: "right", stableScale: 0.96, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "front-of-rug floor lane" },
  { id: "right-life-corridor", label: "右侧生活通道内侧", x: 1230 / 1774, y: 650 / 887, depth: "midground", facing: "right", stableScale: 0.93, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "left of door frame and cabinet" },
  { id: "terrace-lookout", label: "门内靠窗看向屋外", x: 1495 / 1774, y: 540 / 887, depth: "midground", facing: "right", stableScale: 0.82, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", anchorNote: "母图红圈门内接地点：透明角色脚底落在门槛内侧木地板" },
  { id: "attic-ladder", label: "阁楼梯口", x: 0.62, y: 0.48, depth: "midground", facing: "left", stableScale: 0.91, floorPlaneRef: studyFloorPlaneRef },
  { id: "terrace-door", label: "露台入口", x: 0.87, y: 0.56, depth: "background", facing: "right", stableScale: 0.82, floorPlaneRef: studyFloorPlaneRef },
  // Route-editor v1 anchors promoted into the formal study route graph.
  { id: "editor-door", label: "门固定点", x: 1392 / 1774, y: 419 / 887, depth: "midground", facing: "right", stableScale: 0.883, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1392, y: 419 }, anchorNote: "shared door anchor from study-route-editor-v1" },
  { id: "editor-seat-left", label: "座位左侧上椅点", x: 804 / 1774, y: 557 / 887, depth: "foreground", facing: "left", stableScale: 1.083, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 804, y: 557 }, anchorNote: "door-to-seat approach anchor from study-route-editor-v1" },
  { id: "editor-seat-right", label: "座位右侧下椅点", x: 941 / 1774, y: 658 / 887, depth: "foreground", facing: "right", stableScale: 1.229, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 941, y: 658 }, anchorNote: "seat-to-door departure anchor from study-route-editor-v1" },
  { id: "editor-out-1", label: "去程节点 1", x: 1035 / 1774, y: 694 / 887, depth: "foreground", facing: "right", stableScale: 1.281, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1035, y: 694 }, anchorNote: "seat-to-door route editor anchor" },
  { id: "editor-out-2", label: "去程节点 2", x: 1153 / 1774, y: 672 / 887, depth: "foreground", facing: "right", stableScale: 1.249, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1153, y: 672 }, anchorNote: "seat-to-door route editor anchor" },
  { id: "editor-out-3", label: "去程节点 3", x: 1239 / 1774, y: 651 / 887, depth: "foreground", facing: "right", stableScale: 1.219, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1239, y: 651 }, anchorNote: "seat-to-door route editor anchor" },
  { id: "editor-out-4", label: "去程节点 4", x: 1297 / 1774, y: 594 / 887, depth: "foreground", facing: "right", stableScale: 1.137, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1297, y: 594 }, anchorNote: "seat-to-door route editor anchor" },
  { id: "editor-out-5", label: "去程节点 5", x: 1335 / 1774, y: 520 / 887, depth: "midground", facing: "right", stableScale: 1.029, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1335, y: 520 }, anchorNote: "seat-to-door route editor anchor" },
  { id: "editor-in-1", label: "回程节点 1", x: 1220 / 1774, y: 396 / 887, depth: "midground", facing: "left", stableScale: 0.87, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1220, y: 396 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-2", label: "回程节点 2", x: 1092 / 1774, y: 408 / 887, depth: "midground", facing: "left", stableScale: 0.87, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1092, y: 408 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-3", label: "回程节点 3", x: 1005 / 1774, y: 402 / 887, depth: "midground", facing: "left", stableScale: 0.87, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1005, y: 402 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-4", label: "回程节点 4", x: 890 / 1774, y: 413 / 887, depth: "midground", facing: "left", stableScale: 0.874, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 890, y: 413 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-5", label: "回程节点 5", x: 780 / 1774, y: 424 / 887, depth: "midground", facing: "left", stableScale: 0.89, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 780, y: 424 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-6", label: "回程节点 6", x: 747 / 1774, y: 468 / 887, depth: "midground", facing: "left", stableScale: 0.954, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 747, y: 468 }, anchorNote: "door-to-seat route editor anchor" },
  { id: "editor-in-7", label: "回程节点 7 · 翻转点", x: 749 / 1774, y: 523 / 887, depth: "foreground", facing: "right", stableScale: 1.034, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 749, y: 523 }, anchorNote: "door-to-seat route editor facing/layer switch anchor" },
  // Seat↔kitchen has two direction-owned polylines. Only the seat anchor is
  // shared; even coincident kitchen-side coordinates receive distinct IDs.
  { id: "editor-seat-kitchen-1", label: "座位→厨房节点 1", x: 998 / 1774, y: 665 / 887, depth: "foreground", facing: "right", stableScale: 1.239, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 998, y: 665 }, anchorNote: "seat-to-kitchen route editor anchor" },
  { id: "editor-seat-kitchen-2", label: "座位→厨房节点 2", x: 1346 / 1774, y: 667 / 887, depth: "foreground", facing: "right", stableScale: 1.242, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1346, y: 667 }, anchorNote: "seat-to-kitchen route editor anchor" },
  { id: "editor-seat-kitchen-3", label: "座位→厨房终点", x: 1672 / 1774, y: 783 / 887, depth: "foreground", facing: "right", stableScale: 1.41, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1672, y: 783 }, anchorNote: "seat-to-kitchen route editor endpoint" },
  { id: "editor-kitchen-seat-1", label: "厨房→座位起点", x: 1672 / 1774, y: 783 / 887, depth: "foreground", facing: "left", stableScale: 1.41, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1672, y: 783 }, anchorNote: "kitchen-to-seat route editor endpoint" },
  { id: "editor-kitchen-seat-2", label: "厨房→座位节点 1", x: 1346 / 1774, y: 667 / 887, depth: "foreground", facing: "left", stableScale: 1.242, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1346, y: 667 }, anchorNote: "kitchen-to-seat route editor anchor" },
  { id: "editor-kitchen-seat-3", label: "厨房→座位节点 2", x: 998 / 1774, y: 665 / 887, depth: "foreground", facing: "left", stableScale: 1.239, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 998, y: 665 }, anchorNote: "kitchen-to-seat route editor anchor" },
  // Door↔kitchen also owns one polyline per direction. The forward route
  // turns after the screenshot's node 3; the return route turns after node 4.
  { id: "editor-door-kitchen-1", label: "门→厨房节点 2", x: 1335 / 1774, y: 456 / 887, depth: "midground", facing: "left", stableScale: 0.937, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "door-to-kitchen direction-owned bend" },
  { id: "editor-door-kitchen-2", label: "门→厨房节点 3 · 镜像翻转点", x: 1323 / 1774, y: 538 / 887, depth: "midground", facing: "left", stableScale: 1.055, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "door-to-kitchen turns from left to right here" },
  { id: "editor-door-kitchen-3", label: "门→厨房节点 4", x: 1346 / 1774, y: 667 / 887, depth: "foreground", facing: "right", stableScale: 1.242, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1346, y: 667 }, anchorNote: "door-to-kitchen direction-owned bend" },
  { id: "editor-door-kitchen-4", label: "门→厨房终点", x: 1672 / 1774, y: 783 / 887, depth: "foreground", facing: "right", stableScale: 1.41, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1672, y: 783 }, anchorNote: "door-to-kitchen route endpoint" },
  { id: "editor-kitchen-door-1", label: "厨房→门起点", x: 1672 / 1774, y: 783 / 887, depth: "foreground", facing: "left", stableScale: 1.41, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1672, y: 783 }, anchorNote: "kitchen-to-door direction-owned endpoint" },
  { id: "editor-kitchen-door-2", label: "厨房→门节点 2", x: 1346 / 1774, y: 667 / 887, depth: "foreground", facing: "left", stableScale: 1.242, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "confirmed-pixel", pixel: { x: 1346, y: 667 }, anchorNote: "kitchen-to-door direction-owned bend" },
  { id: "editor-kitchen-door-3", label: "厨房→门节点 3", x: 1323 / 1774, y: 538 / 887, depth: "midground", facing: "left", stableScale: 1.055, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "kitchen-to-door direction-owned bend" },
  { id: "editor-kitchen-door-4", label: "厨房→门节点 4 · 镜像翻转点", x: 1335 / 1774, y: 456 / 887, depth: "midground", facing: "right", stableScale: 0.937, floorPlaneRef: studyFloorPlaneRef, anchorStatus: "semantic", anchorNote: "kitchen-to-door turns from left to right here" },
];

const studyRoutePointsWithAnchors: readonly NovelistRoutePoint[] = studyRoutePoints.map((point) => ({
  ...point,
  contactPoint: { x: point.x, y: point.y },
  safeZoneRef: studySafeZone.ref,
}));

function studyRouteProgressAtPoint(pointIds: readonly string[], targetPointId: string): number {
  const points = pointIds
    .map((pointId) => studyRoutePoints.find((point) => point.id === pointId))
    .filter((point): point is NovelistRoutePoint => Boolean(point));
  const targetIndex = points.findIndex((point) => point.id === targetPointId);
  if (targetIndex <= 0 || points.length < 2) return targetIndex === 0 ? 0 : 1;
  const segmentLengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return targetIndex === points.length - 1 ? 1 : 0;
  const distanceToTarget = segmentLengths.slice(0, targetIndex).reduce((sum, length) => sum + length, 0);
  return distanceToTarget / totalLength;
}

function studyRouteSegmentPhase(
  id: string,
  pointIds: readonly string[],
  startPointId: string,
  endPointId: string,
  cameraFacing: FormalFacingDirection,
  travelDirection: NovelistRoutePhase["travelDirection"],
  foregroundOcclusionPolicy: NovelistRoutePhase["foregroundOcclusionPolicy"] = "none",
): NovelistRoutePhase {
  return {
    id,
    startProgress: studyRouteProgressAtPoint(pointIds, startPointId),
    endProgress: studyRouteProgressAtPoint(pointIds, endPointId),
    actionId: "terrace-lookout",
    cameraFacing,
    travelDirection,
    actorMode: "walking",
    foregroundOcclusionPolicy,
    pathStartPointId: startPointId,
    pathEndPointId: endPointId,
  };
}

const studySeatToDoorRoutePointIds = [
  "editor-seat-right",
  "editor-out-1",
  "editor-out-2",
  "editor-out-3",
  "editor-out-4",
  "editor-out-5",
  "editor-door",
] as const;

const studyDoorToSeatRoutePointIds = [
  "editor-door",
  "editor-in-1",
  "editor-in-2",
  "editor-in-3",
  "editor-in-4",
  "editor-in-5",
  "editor-in-6",
  "editor-in-7",
  "editor-seat-left",
] as const;

const studySeatToKitchenRoutePointIds = [
  "editor-seat-right",
  "editor-seat-kitchen-1",
  "editor-seat-kitchen-2",
  "editor-seat-kitchen-3",
] as const;

const studyKitchenToSeatRoutePointIds = [
  "editor-kitchen-seat-1",
  "editor-kitchen-seat-2",
  "editor-kitchen-seat-3",
  "editor-seat-right",
] as const;

const studyDoorToKitchenRoutePointIds = [
  "editor-door",
  "editor-door-kitchen-1",
  "editor-door-kitchen-2",
  "editor-door-kitchen-3",
  "editor-door-kitchen-4",
] as const;

const studyKitchenToDoorRoutePointIds = [
  "editor-kitchen-door-1",
  "editor-kitchen-door-2",
  "editor-kitchen-door-3",
  "editor-kitchen-door-4",
  "editor-door",
] as const;

const studyWritingStayPhases: readonly NovelistRoutePhase[] = [
  { id: "writing-seat-stay", startProgress: 0, endProgress: 1, actionId: "writing-seat", cameraFacing: "left", travelDirection: "stationary", actorMode: "seated", foregroundOcclusionPolicy: "none" },
];

const studyStandStayPhases: readonly NovelistRoutePhase[] = [
  { id: "stand-by-desk-stay", startProgress: 0, endProgress: 1, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "stationary", actorMode: "standing", foregroundOcclusionPolicy: "none" },
];

const studyLookoutStayPhases: readonly NovelistRoutePhase[] = [
  { id: "terrace-lookout-stay", startProgress: 0, endProgress: 1, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "stationary", actorMode: "standing", foregroundOcclusionPolicy: "none" },
];

const studyWritingToStandPhases: readonly NovelistRoutePhase[] = [
  { id: "writing-seat-release", startProgress: 0, endProgress: 0.84, actionId: "writing-seat", cameraFacing: "left", travelDirection: "away-from-desk", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "writing-seat", pathEndPointId: "stand-by-desk" },
  { id: "stand-by-desk-arrival", startProgress: 0.84, endProgress: 1, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "none", holdAtPointId: "stand-by-desk" },
];

const studyWritingToLookoutPhases: readonly NovelistRoutePhase[] = [
  { id: "writing-seat-release", startProgress: 0, endProgress: 0.10, actionId: "writing-seat", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "writing-seat", pathEndPointId: "seat-to-door-curve-1" },
  { id: "seat-front-curve-1", startProgress: 0.10, endProgress: 0.24, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-1", pathEndPointId: "seat-to-door-curve-2" },
  { id: "seat-front-curve-2", startProgress: 0.24, endProgress: 0.42, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-2", pathEndPointId: "seat-to-door-curve-3" },
  { id: "seat-front-curve-3", startProgress: 0.42, endProgress: 0.58, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-3", pathEndPointId: "seat-to-door-curve-4" },
  { id: "corridor-approach", startProgress: 0.58, endProgress: 0.78, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-4", pathEndPointId: "right-life-corridor" },
  { id: "lookout-approach", startProgress: 0.78, endProgress: 0.95, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "right-life-corridor", pathEndPointId: "terrace-lookout" },
  { id: "lookout-arrival", startProgress: 0.95, endProgress: 1, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "none", holdAtPointId: "terrace-lookout" },
];

const studyStandToLookoutPhases: readonly NovelistRoutePhase[] = [
  { id: "desk-release", startProgress: 0, endProgress: 0.14, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "stand-by-desk", pathEndPointId: "seat-to-door-curve-1" },
  { id: "seat-front-curve-1", startProgress: 0.14, endProgress: 0.29, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-1", pathEndPointId: "seat-to-door-curve-2" },
  { id: "seat-front-curve-2", startProgress: 0.29, endProgress: 0.48, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-2", pathEndPointId: "seat-to-door-curve-3" },
  { id: "seat-front-curve-3", startProgress: 0.48, endProgress: 0.65, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-3", pathEndPointId: "seat-to-door-curve-4" },
  { id: "corridor-approach", startProgress: 0.65, endProgress: 0.82, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "seat-to-door-curve-4", pathEndPointId: "right-life-corridor" },
  { id: "lookout-approach", startProgress: 0.82, endProgress: 0.94, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "toward-lookout", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "right-life-corridor", pathEndPointId: "terrace-lookout" },
  { id: "lookout-arrival", startProgress: 0.94, endProgress: 1, actionId: "terrace-lookout", cameraFacing: "right", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "none", holdAtPointId: "terrace-lookout" },
];

const studyLookoutToStandPhases: readonly NovelistRoutePhase[] = [
  { id: "lookout-release", startProgress: 0, endProgress: 0.08, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", holdAtPointId: "terrace-lookout" },
  { id: "return-back-1", startProgress: 0.08, endProgress: 0.18, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "terrace-lookout", pathEndPointId: "door-to-seat-back-1" },
  { id: "return-back-2", startProgress: 0.18, endProgress: 0.29, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-1", pathEndPointId: "door-to-seat-back-2" },
  { id: "return-back-3", startProgress: 0.29, endProgress: 0.41, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-2", pathEndPointId: "door-to-seat-back-3" },
  { id: "return-back-4", startProgress: 0.41, endProgress: 0.53, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-3", pathEndPointId: "door-to-seat-back-4" },
  { id: "return-back-5", startProgress: 0.53, endProgress: 0.65, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-4", pathEndPointId: "door-to-seat-back-5" },
  { id: "return-left-turn", startProgress: 0.65, endProgress: 0.77, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-5", pathEndPointId: "desk-left-turn" },
  { id: "return-left-approach", startProgress: 0.77, endProgress: 0.91, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "desk-left-turn", pathEndPointId: "desk-left-approach" },
  { id: "return-desk-approach", startProgress: 0.91, endProgress: 0.94, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "toward-stand", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "desk-left-approach", pathEndPointId: "stand-by-desk" },
  { id: "stand-by-desk-arrival", startProgress: 0.94, endProgress: 1, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", holdAtPointId: "stand-by-desk" },
];

const studyStandToWritingPhases: readonly NovelistRoutePhase[] = [
  { id: "return-from-desk-side", startProgress: 0, endProgress: 0.84, actionId: "stand-by-desk", cameraFacing: "right", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "stand-by-desk", pathEndPointId: "writing-seat" },
  { id: "writing-seat-approach", startProgress: 0.84, endProgress: 1, actionId: "writing-seat", cameraFacing: "left", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", holdAtPointId: "writing-seat" },
];

const studyLookoutToWritingPhases: readonly NovelistRoutePhase[] = [
  { id: "lookout-release", startProgress: 0, endProgress: 0.08, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", holdAtPointId: "terrace-lookout" },
  { id: "return-back-1", startProgress: 0.08, endProgress: 0.18, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "terrace-lookout", pathEndPointId: "door-to-seat-back-1" },
  { id: "return-back-2", startProgress: 0.18, endProgress: 0.29, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-1", pathEndPointId: "door-to-seat-back-2" },
  { id: "return-back-3", startProgress: 0.29, endProgress: 0.41, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-2", pathEndPointId: "door-to-seat-back-3" },
  { id: "return-back-4", startProgress: 0.41, endProgress: 0.53, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-3", pathEndPointId: "door-to-seat-back-4" },
  { id: "return-back-5", startProgress: 0.53, endProgress: 0.65, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-4", pathEndPointId: "door-to-seat-back-5" },
  { id: "return-left-turn", startProgress: 0.65, endProgress: 0.77, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "door-to-seat-back-5", pathEndPointId: "desk-left-turn" },
  { id: "return-left-approach", startProgress: 0.77, endProgress: 0.88, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "desk-left-turn", pathEndPointId: "desk-left-approach" },
  { id: "writing-seat-approach", startProgress: 0.88, endProgress: 0.96, actionId: "writing-seat", cameraFacing: "right", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", pathStartPointId: "desk-left-approach", pathEndPointId: "writing-seat" },
  { id: "writing-seat-arrival", startProgress: 0.96, endProgress: 1, actionId: "writing-seat", cameraFacing: "right", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground", holdAtPointId: "writing-seat" },
];

const studyLookoutToWritingViaStandPhases: readonly NovelistRoutePhase[] = [
  { id: "lookout-release", startProgress: 0, endProgress: 0.16, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground" },
  { id: "return-across-open-floor", startProgress: 0.16, endProgress: 0.64, actionId: "terrace-lookout", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground" },
  { id: "return-to-desk-side", startProgress: 0.64, endProgress: 0.84, actionId: "stand-by-desk", cameraFacing: "left", travelDirection: "toward-writing", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground" },
  { id: "writing-seat-approach", startProgress: 0.84, endProgress: 1, actionId: "writing-seat", cameraFacing: "left", travelDirection: "stationary", actorMode: "walking", foregroundOcclusionPolicy: "desk-foreground" },
];

const studyDoorToKitchenPhases: readonly NovelistRoutePhase[] = [
  studyRouteSegmentPhase("door-kitchen-segment-1", studyDoorToKitchenRoutePointIds, "editor-door", "editor-door-kitchen-1", "left", "toward-kitchen"),
  studyRouteSegmentPhase("door-kitchen-segment-2", studyDoorToKitchenRoutePointIds, "editor-door-kitchen-1", "editor-door-kitchen-2", "left", "toward-kitchen"),
  studyRouteSegmentPhase("door-kitchen-node-3-turn", studyDoorToKitchenRoutePointIds, "editor-door-kitchen-2", "editor-door-kitchen-3", "right", "toward-kitchen"),
  studyRouteSegmentPhase("door-kitchen-segment-4", studyDoorToKitchenRoutePointIds, "editor-door-kitchen-3", "editor-door-kitchen-4", "right", "toward-kitchen"),
];

const studyKitchenToDoorPhases: readonly NovelistRoutePhase[] = [
  studyRouteSegmentPhase("kitchen-door-segment-1", studyKitchenToDoorRoutePointIds, "editor-kitchen-door-1", "editor-kitchen-door-2", "left", "toward-door"),
  studyRouteSegmentPhase("kitchen-door-segment-2", studyKitchenToDoorRoutePointIds, "editor-kitchen-door-2", "editor-kitchen-door-3", "left", "toward-door"),
  studyRouteSegmentPhase("kitchen-door-segment-3", studyKitchenToDoorRoutePointIds, "editor-kitchen-door-3", "editor-kitchen-door-4", "left", "toward-door"),
  studyRouteSegmentPhase("kitchen-door-node-4-turn", studyKitchenToDoorRoutePointIds, "editor-kitchen-door-4", "editor-door", "right", "toward-door"),
];

const studySeatToKitchenPhases: readonly NovelistRoutePhase[] = [
  studyRouteSegmentPhase("seat-kitchen-segment-1", studySeatToKitchenRoutePointIds, "editor-seat-right", "editor-seat-kitchen-1", "right", "toward-kitchen"),
  studyRouteSegmentPhase("seat-kitchen-segment-2", studySeatToKitchenRoutePointIds, "editor-seat-kitchen-1", "editor-seat-kitchen-2", "right", "toward-kitchen"),
  studyRouteSegmentPhase("seat-kitchen-segment-3", studySeatToKitchenRoutePointIds, "editor-seat-kitchen-2", "editor-seat-kitchen-3", "right", "toward-kitchen"),
];

const studyKitchenToSeatPhases: readonly NovelistRoutePhase[] = [
  studyRouteSegmentPhase("kitchen-seat-segment-1", studyKitchenToSeatRoutePointIds, "editor-kitchen-seat-1", "editor-kitchen-seat-2", "left", "toward-writing"),
  studyRouteSegmentPhase("kitchen-seat-segment-2", studyKitchenToSeatRoutePointIds, "editor-kitchen-seat-2", "editor-kitchen-seat-3", "left", "toward-writing"),
  studyRouteSegmentPhase("kitchen-seat-segment-3", studyKitchenToSeatRoutePointIds, "editor-kitchen-seat-3", "editor-seat-right", "left", "toward-writing"),
];

const studySeatToDoorPhases: readonly NovelistRoutePhase[] = [
  studyRouteSegmentPhase("seat-door-segment-1", studySeatToDoorRoutePointIds, "editor-seat-right", "editor-out-1", "right", "toward-door"),
  studyRouteSegmentPhase("seat-door-segment-2", studySeatToDoorRoutePointIds, "editor-out-1", "editor-out-2", "right", "toward-door"),
  studyRouteSegmentPhase("seat-door-segment-3", studySeatToDoorRoutePointIds, "editor-out-2", "editor-out-3", "right", "toward-door"),
  studyRouteSegmentPhase("seat-door-segment-4", studySeatToDoorRoutePointIds, "editor-out-3", "editor-out-4", "right", "toward-door"),
  studyRouteSegmentPhase("seat-door-segment-5", studySeatToDoorRoutePointIds, "editor-out-4", "editor-out-5", "right", "toward-door"),
  studyRouteSegmentPhase("seat-door-segment-6", studySeatToDoorRoutePointIds, "editor-out-5", "editor-door", "right", "toward-door"),
];

const studyDoorToSeatPhases: readonly NovelistRoutePhase[] = [
  // Point 7 is the depth crossover: before it the desk occludes the actor;
  // from it onward only the near-side chair occludes the actor, leaving the
  // desk under the actor.
  studyRouteSegmentPhase("door-seat-segment-1", studyDoorToSeatRoutePointIds, "editor-door", "editor-in-1", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-segment-2", studyDoorToSeatRoutePointIds, "editor-in-1", "editor-in-2", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-segment-3", studyDoorToSeatRoutePointIds, "editor-in-2", "editor-in-3", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-segment-4", studyDoorToSeatRoutePointIds, "editor-in-3", "editor-in-4", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-segment-5", studyDoorToSeatRoutePointIds, "editor-in-4", "editor-in-5", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-segment-6", studyDoorToSeatRoutePointIds, "editor-in-5", "editor-in-6", "left", "toward-writing", "desk-foreground"),
  studyRouteSegmentPhase("door-seat-point-7-turn", studyDoorToSeatRoutePointIds, "editor-in-6", "editor-in-7", "right", "toward-writing"),
  studyRouteSegmentPhase("door-seat-segment-8", studyDoorToSeatRoutePointIds, "editor-in-7", "editor-seat-left", "right", "toward-writing"),
];

const studyFormalPreviews = {
  "writing-seat": {
    assetId: "study-writing-seat-scene-v9-paper-base-mother-locked",
    src: `${formalSceneRoot}/study/states/study-writing-seat-scene-v9-paper-base-mother-locked.webp`,
    width: 1774,
    height: 887,
    purpose: "用户确认的书房 2:1 写作正式场景基线；只作为抵达状态整场景图，不作为透明 actor。",
    runtimeRole: "action-preview" as const,
    notSceneMaster: true as const,
    notTransparentActor: true as const,
  },
  "terrace-lookout": {
    assetId: "study-terrace-lookout-formal-v1",
    src: `${formalSceneRoot}/study/previews/study-exit-route-formal-v1.webp`,
    width: 1774,
    height: 887,
    purpose: "用户确认的书房 2:1 右侧 terrace-greenery 门槛内侧离场正式场景基线；不生成 balcony。",
    runtimeRole: "action-preview" as const,
    notSceneMaster: true as const,
    notTransparentActor: true as const,
  },
};

Object.assign(studyScene, {
  masterAsset: {
    assetId: "study-scene-master-2x1-formal-v2",
    src: `${formalSceneRoot}/study/study-scene-master-2x1-formal-v2.webp`,
    width: 1774,
    height: 887,
    status: "approved",
    approvedForRuntime: true,
  },
  runtimeGate: {
    status: "interface-only",
    reason: "书房 2:1 母图与三张正式抵达状态已归档；motion preview 使用已核验的专属透明角色，独立 actorShadowAlpha 仍保留为后续 runtime gate 项。",
    allowSceneMaster: true,
    allowActor: false,
    allowPreviews: true,
    missing: ["actorShadowAlpha"],
  },
  foregroundLayers: [
    {
      assetId: "study-desk-table-cutout-2x1-imagegen-v2",
      src: `${formalSceneRoot}/study/geometry/foreground/study-desk-table-cutout-2x1-imagegen-v2.webp`,
      width: 1774,
      height: 887,
      status: "approved",
      approvedForRuntime: true,
      sourceOfTruth: "transparent-alpha",
      layerRole: "desk-depth-occluder",
      renderWhen: "scene-policy",
      stacking: "under-actor",
      renderMode: "occlusion-mask",
      purpose: "Invisible desk alpha source; the desk visible in the mother scene is the only rendered desk.",
    },
    {
      assetId: "study-chair-cutout-2x1-user-v1",
      src: `${formalSceneRoot}/study/geometry/foreground/study-chair-cutout-2x1-user-v1.webp`,
      width: 1774,
      height: 887,
      status: "approved",
      approvedForRuntime: true,
      sourceOfTruth: "transparent-alpha",
      layerRole: "chair-depth-occluder",
      renderWhen: "always",
      stacking: "over-actor",
      renderMode: "occlusion-mask",
      purpose: "User-provided final chair alpha source; the chair visible in the mother scene is the only rendered chair.",
    },
  ] satisfies readonly NovelistSceneForegroundLayer[],
  playerStart: "writing-seat",
  routePoints: studyRoutePointsWithAnchors,
  routes: {
    ...studyScene.routes,
    "study-desk-stay": {
      id: "study-desk-stay",
      label: "回到书桌写作",
      waypointIds: ["writing-seat"],
      durationMs: 320,
      arriveActionId: "writing-seat",
      phases: studyWritingStayPhases,
      contract: studyRouteContract,
      motion: { profile: "linear", settleMs: 220 },
    },
    "study-stand-by-desk-stay": {
      id: "study-stand-by-desk-stay",
      label: "涔︽鏃佺珯绔嬪仠鐣欍€?",
      waypointIds: ["stand-by-desk"],
      durationMs: 320,
      arriveActionId: "stand-by-desk",
      phases: studyStandStayPhases,
      contract: studyRouteContract,
      motion: { profile: "linear", settleMs: 220 },
    },
    "study-terrace-lookout-stay": {
      id: "study-terrace-lookout-stay",
      label: "门内看向屋外停留",
      waypointIds: ["terrace-lookout"],
      durationMs: 320,
      arriveActionId: "terrace-lookout",
      phases: studyLookoutStayPhases,
      contract: studyRouteContract,
      motion: { profile: "linear", settleMs: 220 },
    },
    "study-writing-to-stand-by-desk": {
      id: "study-writing-to-stand-by-desk",
      label: "写作位到书桌旁",
      waypointIds: ["writing-seat", "stand-by-desk"],
      durationMs: 1280,
      arriveActionId: "stand-by-desk",
      phases: studyWritingToStandPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 240 },
    },
    "study-writing-to-terrace-lookout": {
      id: "study-writing-to-terrace-lookout",
      label: "写作位沿地面走到露台门内",
      waypointIds: ["writing-seat", "seat-to-door-curve-1", "seat-to-door-curve-2", "seat-to-door-curve-3", "seat-to-door-curve-4", "right-life-corridor", "terrace-lookout"],
      durationMs: 4280,
      arriveActionId: "terrace-lookout",
      phases: studyWritingToLookoutPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 300 },
    },
    "study-stand-by-desk-to-terrace-lookout": {
      id: "study-stand-by-desk-to-terrace-lookout",
      label: "书桌旁走到门内看景",
      waypointIds: ["stand-by-desk", "seat-to-door-curve-1", "seat-to-door-curve-2", "seat-to-door-curve-3", "seat-to-door-curve-4", "right-life-corridor", "terrace-lookout"],
      durationMs: 3000,
      arriveActionId: "terrace-lookout",
      phases: studyStandToLookoutPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-stand-by-desk-to-writing": {
      id: "study-stand-by-desk-to-writing",
      label: "涔︽鏃佽繑鍥炲啓浣嶅潗涓嬨€?",
      waypointIds: ["stand-by-desk", "writing-seat"],
      durationMs: 1280,
      arriveActionId: "writing-seat",
      phases: studyStandToWritingPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 240 },
    },
    "study-terrace-lookout-to-writing": {
      id: "study-terrace-lookout-to-writing",
      label: "门内看景回到书桌",
      waypointIds: ["terrace-lookout", "door-to-seat-back-1", "door-to-seat-back-2", "door-to-seat-back-3", "door-to-seat-back-4", "door-to-seat-back-5", "desk-left-turn", "desk-left-approach", "writing-seat"],
      durationMs: 3900,
      arriveActionId: "writing-seat",
      phases: studyLookoutToWritingPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-terrace-lookout-to-stand-by-desk": {
      id: "study-terrace-lookout-to-stand-by-desk",
      label: "门内看景回到书桌旁",
      waypointIds: ["terrace-lookout", "door-to-seat-back-1", "door-to-seat-back-2", "door-to-seat-back-3", "door-to-seat-back-4", "door-to-seat-back-5", "desk-left-turn", "desk-left-approach", "stand-by-desk"],
      durationMs: 3000,
      arriveActionId: "stand-by-desk",
      phases: studyLookoutToStandPhases,
      contract: studyRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-seat-to-door": {
      id: "study-seat-to-door",
      label: "座位到门（编辑器正式路线）",
      waypointIds: [...studySeatToDoorRoutePointIds],
      durationMs: 2600,
      arriveActionId: "terrace-lookout",
      phases: studySeatToDoorPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-door-to-seat": {
      id: "study-door-to-seat",
      label: "门到座位（点位 7 后翻转）",
      waypointIds: [...studyDoorToSeatRoutePointIds],
      durationMs: 3000,
      arriveActionId: "writing-seat",
      phases: studyDoorToSeatPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-seat-to-kitchen": {
      id: "study-seat-to-kitchen",
      label: "座位 → 厨房（右侧通道）",
      waypointIds: [...studySeatToKitchenRoutePointIds],
      durationMs: 2600,
      arriveActionId: "terrace-lookout",
      phases: studySeatToKitchenPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-kitchen-to-seat": {
      id: "study-kitchen-to-seat",
      label: "厨房 → 座位（回到座位）",
      waypointIds: [...studyKitchenToSeatRoutePointIds],
      durationMs: 2600,
      arriveActionId: "terrace-lookout",
      phases: studyKitchenToSeatPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-door-to-kitchen": {
      id: "study-door-to-kitchen",
      label: "门 → 厨房（右侧通道）",
      waypointIds: [...studyDoorToKitchenRoutePointIds],
      durationMs: 2600,
      arriveActionId: "terrace-lookout",
      phases: studyDoorToKitchenPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
    "study-kitchen-to-door": {
      id: "study-kitchen-to-door",
      label: "厨房 → 门（回到书房）",
      waypointIds: [...studyKitchenToDoorRoutePointIds],
      durationMs: 2600,
      arriveActionId: "terrace-lookout",
      phases: studyKitchenToDoorPhases,
      contract: studyEditorRouteContract,
      motion: { profile: "grounded-walk", settleMs: 280 },
    },
  },
  actions: {
    ...studyScene.actions,
    "writing-seat": {
      ...studyScene.actions["writing-seat"],
      actorAsset: studyActorAssets.seated,
      preview: studyFormalPreviews["writing-seat"],
      maskStatus: "preview-only",
      runtimeGate: "preview-only",
      cameraFacing: "left",
    },
    "stand-by-desk": {
      id: "stand-by-desk",
      label: "站在书桌旁",
      activity: "daydreaming",
      actorMode: "standing",
      actorAsset: studyActorAssets.standing,
      maskSrc: `${formalSceneRoot}/study/masks/stand-by-desk/mask-v2.webp`,
      maskStatus: "preview-only",
      runtimeGate: "preview-only",
      cameraFacing: "right",
      mood: "离开椅子，先站到书桌旁想一会儿。",
    },
    "terrace-lookout": {
      ...studyScene.actions["terrace-lookout"],
      id: "terrace-lookout",
      label: "靠近露台门看屋外景色",
      activity: "daydreaming",
      actorMode: "standing",
      actorAsset: studyActorAssets.walkingRight,
      maskSrc: `${formalSceneRoot}/study/masks/exit-route/mask-v2.webp`,
      maskStatus: "preview-only",
      runtimeGate: "preview-only",
      cameraFacing: "right",
      preview: studyFormalPreviews["terrace-lookout"],
      mood: "走到露台门内侧，看一会儿屋外的夜色。",
    },
    "stand-by-window": {
      ...studyScene.actions["stand-by-window"],
      id: "stand-by-window",
      label: "站在书桌旁（兼容旧入口）",
      actorAsset: studyActorAssets.standing,
      maskSrc: `${formalSceneRoot}/study/masks/stand-by-desk/mask-v2.webp`,
      maskStatus: "preview-only",
      runtimeGate: "preview-only",
    },
  },
  assetContract: {
    canvas: { width: 1774, height: 887 },
    sceneMasterRef: `${formalSceneRoot}/study/study-scene-master-2x1-formal-v2.webp`,
    floorPlaneRef: studyFloorPlaneRef,
    geometryJsonSrc: `${formalSceneRoot}/study/geometry/study-floor-obstacle-hotspot-2x1-v1.json`,
    geometryStatus: "proof-of-concept",
    safeZone: studySafeZone,
    actions: {
      ...studyScene.assetContract.actions,
      ...studyActionAssemblies,
      "stand-by-window": studyActionAssemblies["stand-by-desk"],
    },
  },
  hotspots: [
    { id: "desk-world-lab", label: "书桌 · 进入 World Lab", caption: "从书房自然转入写作工作台", x: 0.49, y: 0.62, kind: "world-lab" },
    { id: "writer-observe", label: "小说家", caption: "观察他此刻的坐姿写作", x: 0.48, y: 0.45, kind: "action", activity: "writing", actionId: "writing-seat", routeId: "study-desk-stay" },
    { id: "desk-side", label: "书桌旁站立", caption: "离座后先在书桌左前侧停留", x: 0.34, y: 0.68, kind: "action", activity: "daydreaming", actionId: "stand-by-desk", routeId: "study-writing-to-stand-by-desk" },
    { id: "life-corridor", label: "右侧露台门内侧", caption: "沿真实木地板走到门内，看一会儿屋外景色", x: 0.72, y: 0.58, kind: "action", activity: "daydreaming", actionId: "terrace-lookout", routeId: "study-writing-to-terrace-lookout" },
    { id: "attic-entry", label: "阁楼梯子", caption: "沿梯子进入星光阁楼", x: 0.62, y: 0.35, kind: "scene-entry", activity: "daydreaming", targetSceneId: "attic", routeId: "study-to-attic-ladder" },
        { id: "dining-kitchen-entry", label: "通往餐厨的开放通道", caption: "这里没有门，直接进入餐厨", x: 0.82, y: 0.72, kind: "scene-entry", activity: "eating", targetSceneId: "dining-kitchen", routeId: "dining-entry-to-meal" },
        { id: "terrace-entry", label: "屋顶/露台入口", caption: "去 terrace-greenery 照看绿植和小龟", x: 0.87, y: 0.49, kind: "scene-entry", activity: "daydreaming", targetSceneId: "terrace-greenery", routeId: "study-to-terrace-door" },
  ],
  defaultRouteByActivity: {
    writing: "study-desk-stay",
    daydreaming: "study-writing-to-terrace-lookout",
    away: "study-writing-to-terrace-lookout",
  },
});

formalEcologySceneManifest.walkingActorAssets.left = studyActorAssets.walkingLeft;
formalEcologySceneManifest.walkingActorAssets.right = studyActorAssets.walkingRight;

/**
 * The editor's state events are part of the route contract, not editor-only
 * decoration. Keep the formal room on the same handoff protocol: a scene
 * state leaves through smoke on the first movement frame, and a destination
 * scene state owns the final leg beginning at the penultimate waypoint.
 * Geometry is intentionally untouched here; this only restores the events
 * that 3001 already previews.
 */
const studyRouteHandoffActions: Record<string, {
  fromActionId?: string;
  toActionId?: string;
  hideAfter?: boolean;
}> = {
  "study-writing-to-stand-by-desk": { fromActionId: "writing-seat", toActionId: "stand-by-desk" },
  "study-writing-to-terrace-lookout": { fromActionId: "writing-seat", toActionId: "terrace-lookout" },
  "study-stand-by-desk-to-terrace-lookout": { fromActionId: "stand-by-desk", toActionId: "terrace-lookout" },
  "study-stand-by-desk-to-writing": { fromActionId: "stand-by-desk", toActionId: "writing-seat" },
  "study-terrace-lookout-to-writing": { fromActionId: "terrace-lookout", toActionId: "writing-seat" },
  "study-terrace-lookout-to-stand-by-desk": { fromActionId: "terrace-lookout", toActionId: "stand-by-desk" },
  "study-seat-to-door": { fromActionId: "writing-seat", hideAfter: true },
  "study-door-to-seat": { toActionId: "writing-seat" },
  "study-seat-to-kitchen": { fromActionId: "writing-seat", hideAfter: true },
  "study-kitchen-to-seat": { toActionId: "writing-seat" },
  "study-door-to-kitchen": { hideAfter: true },
  "study-kitchen-to-door": { hideAfter: true },
  "study-to-attic-ladder": { fromActionId: "writing-seat", hideAfter: true },
  "study-to-terrace-door": { fromActionId: "writing-seat", hideAfter: true },
};

Object.assign(studyScene, {
  routes: Object.fromEntries(Object.entries(studyScene.routes).map(([routeId, route]) => {
    const handoff = studyRouteHandoffActions[routeId];
    if (!handoff) return [routeId, route];
    const startPointId = route.waypointIds[0]!;
    const endPointId = route.waypointIds.at(-1)!;
    return [routeId, {
      ...route,
      transitions: [
        {
          pointId: startPointId,
          phase: "depart" as const,
          style: "smoke" as const,
          durationMs: 720,
          ...(handoff.fromActionId ? { fromActionId: handoff.fromActionId } : {}),
          ...(handoff.toActionId ? { toActionId: handoff.toActionId } : {}),
        },
        ...(handoff.toActionId || handoff.hideAfter
          ? [{
              pointId: endPointId,
              phase: "arrive" as const,
              style: "smoke" as const,
              durationMs: 1100,
              fromActionId: "exit-route",
              ...(handoff.toActionId ? { toActionId: handoff.toActionId } : {}),
              ...(handoff.hideAfter ? { hideAfter: true } : {}),
            }]
          : []),
      ],
    }];
  })),
});

const diningKitchenFloorPlaneRef = "dining-kitchen.mainWoodFloor";

const diningKitchenRouteContract: NovelistRouteContract = {
  canvas: { width: 1774, height: 887 },
  floorPlaneRef: diningKitchenFloorPlaneRef,
  safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
  maskCanvas: { width: 1774, height: 887 },
  maskRefs: {
    "serve-red-bean-soup": `${formalSceneRoot}/dining-kitchen/masks/kitchen-counter/placement-mask-2x1-v1.webp`,
    "carry-bowl": `${formalSceneRoot}/dining-kitchen/masks/counter-to-table/placement-mask-2x1-v1.webp`,
    "chair-approach": `${formalSceneRoot}/dining-kitchen/masks/counter-to-table/chair-approach-placement-mask-2x1-v1.webp`,
    "sit-down": `${formalSceneRoot}/dining-kitchen/masks/meal-table/chair-foreground-occlusion-mask-2x1-v1.webp`,
    "meal-table": `${formalSceneRoot}/dining-kitchen/masks/meal-table/placement-mask-2x1-v1.webp`,
    "leave-after-meal": `${formalSceneRoot}/dining-kitchen/masks/exit-route/placement-mask-2x1-v1.webp`,
  },
  foregroundOcclusionPolicy: "chair-foreground-at-settle",
  forbiddenRegions: [
    "counter-top",
    "stove",
    "refrigerator-base",
    "table-top",
    "table-legs",
    "chair-seat",
    "chair-back",
    "wall",
    "door-threshold",
    "mat-center",
    "furniture-behind",
  ],
  // Approximate safe floor corridor from the 1774x887 clean master. Final
  // placement masks remain the visual authority for asset production.
  walkableFloorPolygon: [
    { x: 90 / 1774, y: 690 / 887 },
    { x: 430 / 1774, y: 505 / 887 },
    { x: 820 / 1774, y: 545 / 887 },
    { x: 1500 / 1774, y: 625 / 887 },
    { x: 1660 / 1774, y: 820 / 887 },
    { x: 1450 / 1774, y: 875 / 887 },
    { x: 260 / 1774, y: 875 / 887 },
    { x: 90 / 1774, y: 820 / 887 },
  ],
  perspectiveScale: {
    axis: "uniform",
    interpolation: "continuous-linear",
    min: 0.98,
    max: 1.12,
  },
  status: "design-locked",
};

const diningEntryToCounterPhases: readonly NovelistRoutePhase[] = [
  { id: "entry-to-counter-1", startProgress: 0, endProgress: 0.34, actionId: "exit-route", cameraFacing: "right", travelDirection: "toward-counter", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "dining-entry", pathEndPointId: "entry-counter-1" },
  { id: "entry-to-counter-2", startProgress: 0.34, endProgress: 0.68, actionId: "exit-route", cameraFacing: "right", travelDirection: "toward-counter", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "entry-counter-1", pathEndPointId: "entry-counter-2" },
  { id: "entry-to-counter-3", startProgress: 0.68, endProgress: 0.82, actionId: "exit-route", cameraFacing: "right", travelDirection: "toward-counter", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "entry-counter-2", pathEndPointId: "kitchen-counter" },
  { id: "serve-red-bean-soup", startProgress: 0.82, endProgress: 1, actionId: "serve-red-bean-soup", cameraFacing: "left", travelDirection: "stationary", actorMode: "standing", foregroundOcclusionPolicy: "none", holdAtPointId: "kitchen-counter" },
];

const diningCounterToTablePhases: readonly NovelistRoutePhase[] = [
  { id: "counter-to-carry-mid", startProgress: 0, endProgress: 0.34, actionId: "carry-bowl", cameraFacing: "right", travelDirection: "toward-table", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "kitchen-counter", pathEndPointId: "carry-mid" },
  { id: "carry-mid-to-chair", startProgress: 0.34, endProgress: 0.68, actionId: "carry-bowl", cameraFacing: "right", travelDirection: "toward-chair", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "carry-mid", pathEndPointId: "chair-approach" },
  { id: "chair-to-meal", startProgress: 0.68, endProgress: 0.88, actionId: "carry-bowl", cameraFacing: "right", travelDirection: "toward-chair", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "chair-approach", pathEndPointId: "meal-table" },
  { id: "meal-table", startProgress: 0.88, endProgress: 1, actionId: "meal-table", cameraFacing: "right", travelDirection: "stationary", actorMode: "seated", foregroundOcclusionPolicy: "chair-foreground", holdAtPointId: "meal-table" },
];

const diningMealDeparturePhases = (
  travelDirection: "toward-counter" | "toward-entry" | "toward-bathroom",
  pathEndPointId: string,
  pathStartPointId = "meal-table",
  departureActionId = "leave-after-meal",
): readonly NovelistRoutePhase[] => [
  { id: "departure", startProgress: 0, endProgress: 1, actionId: departureActionId, cameraFacing: "left", travelDirection, actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId, pathEndPointId },
];

const diningEntryToBathroomPhases: readonly NovelistRoutePhase[] = [
  { id: "entry-to-bathroom", startProgress: 0, endProgress: 1, actionId: "exit-route", cameraFacing: "left", travelDirection: "toward-bathroom", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "dining-entry", pathEndPointId: "bathroom-door" },
];

const diningBathroomToEntryPhases: readonly NovelistRoutePhase[] = [
  { id: "bathroom-to-entry", startProgress: 0, endProgress: 1, actionId: "exit-route", cameraFacing: "right", travelDirection: "toward-entry", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "bathroom-door", pathEndPointId: "dining-entry" },
];

const diningCounterToEntryPhases: readonly NovelistRoutePhase[] = [
  { id: "counter-to-entry-1", startProgress: 0, endProgress: 0.34, actionId: "exit-route", cameraFacing: "left", travelDirection: "toward-entry", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "kitchen-counter", pathEndPointId: "counter-entry-1" },
  { id: "counter-to-entry-2", startProgress: 0.34, endProgress: 0.68, actionId: "exit-route", cameraFacing: "left", travelDirection: "toward-entry", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "counter-entry-1", pathEndPointId: "counter-entry-2" },
  { id: "counter-to-entry-3", startProgress: 0.68, endProgress: 1, actionId: "exit-route", cameraFacing: "left", travelDirection: "toward-entry", actorMode: "walking", foregroundOcclusionPolicy: "none", pathStartPointId: "counter-entry-2", pathEndPointId: "dining-entry" },
];

const DINING_KITCHEN_SMOKE_DURATION_MS = 720;

const diningEntryToCounterTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "kitchen-counter", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", toActionId: "serve-red-bean-soup" },
];

const diningCounterToTableTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "kitchen-counter", phase: "depart", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "serve-red-bean-soup", toActionId: "carry-bowl" },
  { pointId: "meal-table", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "carry-bowl", toActionId: "meal-table" },
];

const diningCounterToEntryTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "kitchen-counter", phase: "depart", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "serve-red-bean-soup", toActionId: "exit-route" },
  { pointId: "dining-entry", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", hideAfter: true },
];

const diningTableToCounterTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "meal-table", phase: "depart", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "meal-table", toActionId: "carry-bowl-return" },
  { pointId: "kitchen-counter", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "carry-bowl-return", toActionId: "serve-red-bean-soup" },
];

const diningTableToEntryTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "meal-table", phase: "depart", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "meal-table", toActionId: "exit-route" },
  { pointId: "dining-entry", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", hideAfter: true },
];

const diningTableToBathroomTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "meal-table", phase: "depart", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "meal-table", toActionId: "exit-route" },
  { pointId: "bathroom-door", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", hideAfter: true },
];

const diningEntryToBathroomTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "bathroom-door", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", hideAfter: true },
];

const diningBathroomToEntryTransitions: readonly NovelistRouteTransition[] = [
  { pointId: "dining-entry", phase: "arrive", style: "smoke", durationMs: DINING_KITCHEN_SMOKE_DURATION_MS, fromActionId: "exit-route", hideAfter: true },
];

const diningKitchenScene = formalEcologySceneManifest.scenes["dining-kitchen"];

const diningCarryBowlActorAsset: NovelistFormalActorAsset = {
  mode: "walking",
  assetId: "dining-kitchen-carry-bowl-transparent-actor-v1",
  src: `${formalSceneRoot}/dining-kitchen/kitchen-counter/carry-bowl-transparent-actor-v1.png`,
  width: 1254,
  height: 1254,
  alt: "端着红豆汤走向餐桌的透明纸板角色",
  runtimeAsset: true,
  visualContractStatus: "approved",
  nativeFacing: "right",
  alphaBottom: 0.82,
  assetScale: 1.5,
};

const diningCarryEmptyBowlActorAsset: NovelistFormalActorAsset = {
  mode: "walking",
  assetId: "dining-kitchen-carry-empty-bowl-transparent-actor-v2",
  src: `${formalSceneRoot}/dining-kitchen/meal-table/carry-empty-bowl-transparent-actor-v2.webp`,
  width: 1254,
  height: 1254,
  alt: "绔潃绌虹浠庨妗岃蛋鍥炴枡鐞嗗彴鐨勯€忔槑绾告澘瑙掕壊",
  runtimeAsset: true,
  visualContractStatus: "approved",
  nativeFacing: "left",
  alphaBottom: 0.89,
  assetScale: 1.5,
};

const diningKitchenStatePreview = (
  assetId: string,
  relativeSrc: string,
  purpose: string,
  options?: { transparentActor?: boolean; actorAnchor?: { x: number; y: number } },
): NovelistSceneActionPreview => {
  const actorAnchor = options?.actorAnchor
    ?? (assetId.includes("serve-red-bean-soup") ? { x: 0.49, y: 0.28 } : undefined)
    ?? (assetId.includes("meal-table") ? { x: 0.74, y: 0.45 } : undefined);
  return {
    assetId,
    src: `${formalSceneRoot}/dining-kitchen/${relativeSrc}`,
    width: 1774,
    height: 887,
    purpose,
    runtimeRole: "action-preview",
    notSceneMaster: true,
    notTransparentActor: !options?.transparentActor,
    ...(options?.transparentActor ? { transparentOverlay: true } : {}),
    ...(actorAnchor ? { actorAnchor } : {}),
  };
};

const diningKitchenStatePreviews = {
  "serve-red-bean-soup": diningKitchenStatePreview(
    "dining-kitchen-serve-red-bean-soup-scene-character-2x1-formal-v3",
    "kitchen-counter/dining-kitchen-serve-red-bean-soup-scene-character-2x1-formal-v3.webp",
    "餐厨状态一：料理台前正在从锅中舀红豆汤；保留母图背景，只加入正式角色与打汤动作",
  ),
  "chair-approach": diningKitchenStatePreview(
    "dining-kitchen-carry-bowl-actor-v1",
    "kitchen-counter/carry-bowl-transparent-actor-v1.png",
    "餐厨状态三：端汤角色继续移动到椅前；复用同一透明行动素材，不增加过渡静帧",
    { transparentActor: true },
  ),
  "meal-table": diningKitchenStatePreview(
    "dining-kitchen-meal-table-scene-character-2x1-formal-v6",
    "meal-table/dining-kitchen-meal-table-scene-character-2x1-formal-v6.webp",
    "餐厨状态五：坐下吃红豆汤；采用已确认的独立 2:1 正式场景图，不再叠加其它坐姿资产",
  ),
} satisfies Record<string, NovelistSceneActionPreview>;

const diningKitchenRoutePoints: readonly NovelistRoutePoint[] = [
  {
    id: "dining-entry",
    label: "dining-entry",
    x: 0.1,
    y: 0.81,
    depth: "foreground",
    facing: "right",
    stableScale: 0.94,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 0.1, y: 0.81 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "semantic",
    anchorNote: "door-side entry landing is semantic only; no final pixel truth approved on the 1774x887 master",
  },
  {
    id: "kitchen-counter",
    label: "kitchen-counter",
    x: 727 / 1774,
    y: 525 / 887,
    depth: "midground",
    facing: "left",
    stableScale: 0.98,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 727 / 1774, y: 525 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "confirmed-pixel",
    pixel: { x: 727, y: 525 },
    anchorNote: "confirmed counterLanding on the 1774x887 clean master",
  },
  {
    id: "bathroom-door",
    label: "浴室磨砂门",
    x: 166 / 1774,
    y: 650 / 887,
    depth: "midground",
    facing: "left",
    stableScale: 0.94,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 166 / 1774, y: 650 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "confirmed-pixel",
    pixel: { x: 166, y: 650 },
    anchorNote: "left frosted door is the direct bathroom threshold; no hallway detour",
  },
  {
    id: "entry-counter-1",
    label: "entry-counter-1",
    x: 360 / 1774,
    y: 690 / 887,
    depth: "foreground",
    facing: "right",
    stableScale: 1.02,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 360 / 1774, y: 690 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 360, y: 690 },
    anchorNote: "route-owned entry-to-counter waypoint; preserved from the editor contract",
  },
  {
    id: "entry-counter-2",
    label: "entry-counter-2",
    x: 545 / 1774,
    y: 605 / 887,
    depth: "midground",
    facing: "right",
    stableScale: 0.99,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 545 / 1774, y: 605 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 545, y: 605 },
    anchorNote: "route-owned entry-to-counter waypoint; preserved from the editor contract",
  },
  {
    id: "counter-entry-1",
    label: "counter-entry-1",
    x: 560 / 1774,
    y: 610 / 887,
    depth: "midground",
    facing: "left",
    stableScale: 0.99,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 560 / 1774, y: 610 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 560, y: 610 },
    anchorNote: "route-owned counter-to-entry waypoint; preserved from the editor contract",
  },
  {
    id: "counter-entry-2",
    label: "counter-entry-2",
    x: 350 / 1774,
    y: 705 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.02,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 350 / 1774, y: 705 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 350, y: 705 },
    anchorNote: "route-owned counter-to-entry waypoint; preserved from the editor contract",
  },
  {
    id: "carry-mid",
    label: "carry-mid",
    x: 1032 / 1774,
    y: 634 / 887,
    depth: "foreground",
    facing: "right",
    stableScale: 1.04,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1032 / 1774, y: 634 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "semantic midpoint on the continuous central wood floor; no final pixel truth approved",
  },
  {
    id: "chair-approach",
    label: "chair-approach",
    x: 1128 / 1774,
    y: 684 / 887,
    depth: "foreground",
    facing: "right",
    stableScale: 1.08,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1128 / 1774, y: 684 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "confirmed-pixel",
    pixel: { x: 1128, y: 684 },
    anchorNote: "confirmed chair-approach contactPoint on the 1774x887 clean master",
  },
  {
    id: "meal-table",
    label: "meal-table",
    x: 1253 / 1774,
    y: 704 / 887,
    depth: "foreground",
    facing: "right",
    stableScale: 1.12,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1253 / 1774, y: 704 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "confirmed-pixel",
    pixel: { x: 1253, y: 704 },
    anchorNote: "confirmed mealLanding on the 1774x887 clean master",
  },
  {
    id: "table-counter-1",
    label: "table-counter-1",
    x: 1060 / 1774,
    y: 630 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.1,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1060 / 1774, y: 630 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 1060, y: 630 },
    anchorNote: "route-owned table-to-counter waypoint; refine in the editor",
  },
  {
    id: "table-counter-2",
    label: "table-counter-2",
    x: 850 / 1774,
    y: 570 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.04,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 850 / 1774, y: 570 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 850, y: 570 },
    anchorNote: "route-owned table-to-counter waypoint; refine in the editor",
  },
  {
    id: "table-entry-1",
    label: "table-entry-1",
    x: 1050 / 1774,
    y: 815 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.1,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1050 / 1774, y: 815 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 1050, y: 815 },
    anchorNote: "route-owned table-to-entry waypoint; refine in the editor",
  },
  {
    id: "table-entry-2",
    label: "table-entry-2",
    x: 750 / 1774,
    y: 845 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.12,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 750 / 1774, y: 845 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 750, y: 845 },
    anchorNote: "route-owned table-to-entry waypoint; refine in the editor",
  },
  {
    id: "table-entry-3",
    label: "table-entry-3",
    x: 430 / 1774,
    y: 815 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.1,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 430 / 1774, y: 815 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    pixel: { x: 430, y: 815 },
    anchorNote: "route-owned table-to-entry waypoint; refine in the editor",
  },
  {
    id: "table-bathroom-1",
    label: "餐桌 → 浴室节点 1",
    x: 1040 / 1774,
    y: 815 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.1,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 1040 / 1774, y: 815 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned floor waypoint; refine in the editor",
  },
  {
    id: "table-bathroom-2",
    label: "餐桌 → 浴室节点 2",
    x: 760 / 1774,
    y: 850 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.12,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 760 / 1774, y: 850 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned floor waypoint; refine in the editor",
  },
  {
    id: "table-bathroom-3",
    label: "餐桌 → 浴室节点 3",
    x: 430 / 1774,
    y: 820 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.1,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 430 / 1774, y: 820 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned floor waypoint; refine in the editor",
  },
  {
    id: "table-bathroom-4",
    label: "餐桌 → 浴室节点 4",
    x: 245 / 1774,
    y: 755 / 887,
    depth: "foreground",
    facing: "left",
    stableScale: 1.02,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 245 / 1774, y: 755 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned floor waypoint; refine in the editor",
  },
  {
    id: "entry-bathroom-1",
    label: "门口 → 浴室节点 1",
    x: 140 / 1774,
    y: 685 / 887,
    depth: "midground",
    facing: "left",
    stableScale: 0.95,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 140 / 1774, y: 685 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned privacy-corridor waypoint; refine in the editor",
  },
  {
    id: "bathroom-entry-1",
    label: "浴室 → 门口节点 1",
    x: 125 / 1774,
    y: 680 / 887,
    depth: "midground",
    facing: "right",
    stableScale: 0.95,
    floorPlaneRef: diningKitchenFloorPlaneRef,
    contactPoint: { x: 125 / 1774, y: 680 / 887 },
    safeZoneRef: "dining-kitchen.counter-to-meal.actorSafeZone",
    anchorStatus: "approximate",
    anchorNote: "route-owned privacy-corridor waypoint; refine in the editor",
  },
];

const diningKitchenActionOverrides: Record<string, NovelistSceneAction> = {
  "serve-red-bean-soup": {
    id: "serve-red-bean-soup",
    label: "料理台前盛红豆汤",
    activity: "eating",
    actorMode: "standing",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/kitchen-counter/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "left",
    runtimeGate: "preview-only",
    preview: diningKitchenStatePreviews["serve-red-bean-soup"],
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
  },
  "carry-bowl": {
    id: "carry-bowl",
    label: "端碗走向餐桌",
    activity: "eating",
    actorMode: "walking",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/counter-to-table/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "right",
    runtimeGate: "preview-only",
    actorAsset: diningCarryBowlActorAsset,
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
  },
  "carry-bowl-return": {
    id: "carry-bowl-return",
    label: "返程复用端碗角色图（水平镜像）",
    activity: "eating",
    actorMode: "walking",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/counter-to-table/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "left",
    runtimeGate: "preview-only",
    // Reuse the approved forward asset. The route phase owns the left-facing
    // visual contract; runtime mirrors this image instead of adding a second
    // reverse asset.
    actorAsset: diningCarryEmptyBowlActorAsset,
    prop: { icon: "🥣", name: "空碗", steam: false },
  },
  "chair-approach": {
    id: "chair-approach",
    label: "椅前停步准备落座",
    activity: "eating",
    actorMode: "walking",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/counter-to-table/chair-approach-placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "right",
    foregroundOcclusionMaskSrc: `${formalSceneRoot}/dining-kitchen/masks/meal-table/chair-foreground-occlusion-mask-2x1-v1.webp`,
    runtimeGate: "preview-only",
    actorAsset: diningCarryBowlActorAsset,
    preview: diningKitchenStatePreviews["chair-approach"],
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
  },
  "sit-down": {
    id: "sit-down",
    label: "减速、转身、落座",
    activity: "eating",
    actorMode: "walking",
    // The strict binary preview remains in .tmp until colored actor, prop,
    // shadow and floor-plane verification are promoted to public assets.
    maskSrc: null,
    maskStatus: "pending",
    cameraFacing: "right",
    foregroundOcclusionMaskSrc: `${formalSceneRoot}/dining-kitchen/masks/meal-table/chair-foreground-occlusion-mask-2x1-v1.webp`,
    runtimeGate: "blocked",
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
  },
  "meal-table": {
    id: "meal-table",
    label: "坐在餐桌边吃红豆汤",
    activity: "eating",
    actorMode: "seated",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/meal-table/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "right",
    foregroundOcclusionMaskSrc: `${formalSceneRoot}/dining-kitchen/masks/meal-table/chair-foreground-occlusion-mask-2x1-v1.webp`,
    runtimeGate: "preview-only",
    preview: diningKitchenStatePreviews["meal-table"],
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
    // The old 1536x1024 full-scene preview is deliberately not used on the
    // 1774x887 master; final seated actor/occlusion layers are still pending.
  },
  "leave-after-meal": {
    id: "leave-after-meal",
    label: "吃完饭起身回到入口",
    activity: "away",
    actorMode: "walking",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/exit-route/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "left",
    runtimeGate: "preview-only",
  },
  "kitchen-counter": {
    id: "kitchen-counter",
    label: "在料理台前发呆",
    activity: "daydreaming",
    actorMode: "standing",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/kitchen-counter/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "left",
    runtimeGate: "preview-only",
    prop: { icon: "🍲", name: "红豆汤碗", steam: true },
  },
  "exit-route": {
    id: "exit-route",
    label: "沿餐厨出口离开",
    activity: "away",
    actorMode: "walking",
    maskSrc: `${formalSceneRoot}/dining-kitchen/masks/exit-route/placement-mask-2x1-v1.webp`,
    maskStatus: "preview-only",
    cameraFacing: "left",
    runtimeGate: "preview-only",
  },
};

const diningKitchenRoutes: Record<string, NovelistRoute> = {
  "dining-entry-to-counter": {
    id: "dining-entry-to-counter",
    label: "门口 → 料理台",
    waypointIds: ["dining-entry", "kitchen-counter"],
    durationMs: 2100,
    arriveActionId: "serve-red-bean-soup",
    phases: diningEntryToCounterPhases,
    transitions: diningEntryToCounterTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 220 },
  },
  "dining-counter-to-table": {
    id: "dining-counter-to-table",
    label: "料理台 → 餐桌（端热汤）",
    waypointIds: ["kitchen-counter", "carry-mid", "chair-approach", "meal-table"],
    durationMs: 3200,
    arriveActionId: "meal-table",
    phases: diningCounterToTablePhases,
    transitions: diningCounterToTableTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 300 },
  },
  "dining-table-to-counter": {
    id: "dining-table-to-counter",
    label: "餐桌 → 料理台（饭后回收空碗）",
    waypointIds: ["meal-table", "table-counter-1", "table-counter-2", "kitchen-counter"],
    durationMs: 3000,
    arriveActionId: "serve-red-bean-soup",
    phases: diningMealDeparturePhases("toward-counter", "kitchen-counter", "meal-table", "carry-bowl-return"),
    transitions: diningTableToCounterTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 220 },
  },
  "dining-table-to-entry": {
    id: "dining-table-to-entry",
    label: "餐桌 → 门口",
    waypointIds: ["meal-table", "table-entry-1", "table-entry-2", "table-entry-3", "dining-entry"],
    durationMs: 3200,
    arriveActionId: "leave-after-meal",
    phases: diningMealDeparturePhases("toward-entry", "dining-entry"),
    transitions: diningTableToEntryTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 220 },
  },
  "dining-table-to-bathroom": {
    id: "dining-table-to-bathroom",
    label: "餐桌 → 浴室",
    waypointIds: ["meal-table", "table-bathroom-1", "table-bathroom-2", "table-bathroom-3", "table-bathroom-4", "bathroom-door"],
    durationMs: 3600,
    arriveActionId: "exit-route",
    phases: diningMealDeparturePhases("toward-bathroom", "bathroom-door"),
    transitions: diningTableToBathroomTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 220 },
  },
  "dining-entry-to-bathroom": {
    id: "dining-entry-to-bathroom",
    label: "门口 → 浴室",
    waypointIds: ["dining-entry", "entry-bathroom-1", "bathroom-door"],
    durationMs: 900,
    arriveActionId: "exit-route",
    phases: diningEntryToBathroomPhases,
    transitions: diningEntryToBathroomTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 180 },
  },
  "dining-bathroom-to-entry": {
    id: "dining-bathroom-to-entry",
    label: "浴室 → 门口",
    waypointIds: ["bathroom-door", "bathroom-entry-1", "dining-entry"],
    durationMs: 900,
    arriveActionId: "exit-route",
    phases: diningBathroomToEntryPhases,
    transitions: diningBathroomToEntryTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 180 },
  },
  "dining-counter-to-entry": {
    id: "dining-counter-to-entry",
    label: "料理台 → 门口",
    waypointIds: ["kitchen-counter", "counter-entry-1", "counter-entry-2", "dining-entry"],
    durationMs: 2100,
    arriveActionId: "exit-route",
    phases: diningCounterToEntryPhases,
    transitions: diningCounterToEntryTransitions,
    contract: diningKitchenRouteContract,
    motion: { profile: "grounded-walk", settleMs: 220 },
  },
};

Object.assign(diningKitchenScene, {
  routePoints: diningKitchenRoutePoints,
  hotspots: [
    ...diningKitchenScene.hotspots,
    { id: "bathroom-door", label: "浴室磨砂门", caption: "餐厨左侧直通浴室；只显示门外隐私状态", x: 0.1, y: 0.73, kind: "privacy", activity: "away", actionId: "exit-route", routeId: "dining-table-to-bathroom", targetSceneId: "bathroom-private" },
  ],
  routes: diningKitchenRoutes,
  actions: {
    ...diningKitchenScene.actions,
    ...diningKitchenActionOverrides,
    "serve-red-bean-soup": {
      ...diningKitchenActionOverrides["serve-red-bean-soup"],
      label: "料理台前正在打红豆汤",
    },
    "kitchen-counter": {
      ...diningKitchenActionOverrides["kitchen-counter"],
      label: "打汤完成，端碗前停留",
      activity: "eating",
    },
  },
  assetContract: {
    ...diningKitchenScene.assetContract,
    canvas: { width: 1774, height: 887 },
    floorPlaneRef: diningKitchenFloorPlaneRef,
    safeZone: { ref: "dining-kitchen.counter-to-meal.actorSafeZone", status: "frozen" },
    actions: {
      ...diningKitchenScene.assetContract.actions,
      "serve-red-bean-soup": pendingActionAssembly("blocked", "2:1 colored actor, prop, shadow and floor-plane verification pending"),
      "leave-after-meal": pendingActionAssembly("blocked", "exit-route actor, shadow and floor-plane verification pending"),
    },
  },
  defaultRouteByActivity: {
    ...diningKitchenScene.defaultRouteByActivity,
    eating: "dining-entry-to-counter",
    daydreaming: "dining-entry-to-counter",
    away: "dining-table-to-entry",
  },
});

// 3001 is the route source of truth. Apply the versioned publish boundary
// only after every legacy/static scene patch above has been assembled, so the
// adapter can retain scene assets while replacing stale route geometry.
applyPublishedRouteSnapshots(formalEcologySceneManifest);

/**
 * A cross-scene connector needs a concrete target leg so the room can switch
 * from the connector's source canvas to the destination canvas. That leg is
 * not a user-authored route: it is a one-point arrival handoff backed by the
 * destination scene's already-published portal point.
 *
 * Keep this adapter explicit and namespaced. It must never be confused with a
 * route-editor draft or with a new piece of route geometry.
 */
export const FORMAL_SCENE_PORTAL_ARRIVAL_ROUTE_PREFIX = "__formal-portal-arrival__:";

const formalScenePortalAliases: Partial<Record<FormalSceneId, readonly string[]>> = {
  entrance: ["portal.entrance.home-door", "portal.entrance"],
};

export function getFormalScenePortalPointId(
  sceneId: FormalSceneId,
  preferredAnchorKey?: string,
): string | undefined {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const preferredKeys = preferredAnchorKey
    ? [preferredAnchorKey, ...(formalScenePortalAliases[sceneId] ?? [])]
    : [
      `portal.${sceneId}`,
      ...(formalScenePortalAliases[sceneId] ?? []),
    ];
  return preferredKeys
    .map((anchorKey) => scene.routePoints.find((point) => (
      point.anchorKind === "portal" && point.anchorKey === anchorKey
    )))
    .find((point): point is NonNullable<typeof point> => Boolean(point))?.id;
}

function existingPortalArrivalRoute(sceneId: FormalSceneId, pointId: string): string | undefined {
  return Object.values(formalEcologySceneManifest.scenes[sceneId].routes).find((route) => (
    route.waypointIds.length === 1 && route.waypointIds[0] === pointId
  ))?.id;
}

export function getFormalScenePortalArrivalRouteId(
  sceneId: FormalSceneId,
  preferredAnchorKey?: string,
): string | undefined {
  const pointId = getFormalScenePortalPointId(sceneId, preferredAnchorKey);
  if (!pointId) return undefined;
  return existingPortalArrivalRoute(sceneId, pointId)
    ?? `${FORMAL_SCENE_PORTAL_ARRIVAL_ROUTE_PREFIX}${sceneId}:${pointId}`;
}

function syntheticPortalArrivalRoute(
  sceneId: FormalSceneId,
  routeId: string,
): NovelistResolvedRoute | null {
  const prefix = `${FORMAL_SCENE_PORTAL_ARRIVAL_ROUTE_PREFIX}${sceneId}:`;
  if (!routeId.startsWith(prefix)) return null;
  const pointId = routeId.slice(prefix.length);
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const point = scene.routePoints.find((candidate) => (
    candidate.id === pointId && candidate.anchorKind === "portal"
  ));
  if (!point) return null;
  const arriveActionId = scene.actions.walking
    ? "walking"
    : scene.actions["stair-entry"]
      ? "stair-entry"
      : "gone";
  return {
    id: routeId,
    label: `${scene.label}入口停留（跨场景到达）`,
    waypointIds: [point.id],
    durationMs: 0,
    arriveActionId,
    motion: { profile: "grounded-walk", settleMs: 0 },
    points: [point],
  };
}

export function getFormalSceneRoute(sceneId: FormalSceneId, routeId?: string): NovelistResolvedRoute | null {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const routes = scene.routes;
  // An explicitly requested route is a contract, not a suggestion. Falling
  // back to the first route turns a typo or stale alias into a silent
  // teleport—often to an unrelated scene portal. Only an omitted route ID
  // may use the scene's first route as its default.
  const portalArrivalRoute = routeId ? syntheticPortalArrivalRoute(sceneId, routeId) : null;
  if (portalArrivalRoute) return portalArrivalRoute;
  const selectedRoute = routeId !== undefined
    ? routes[routeId] ?? routes[resolveLifeRouteAlias(sceneId, routeId) ?? ""]
    : routes[Object.keys(routes)[0] ?? ""];
  if (!selectedRoute) return null;
  const pointById = new Map(scene.routePoints.map((point) => [point.id, point]));
  const points = selectedRoute.waypointIds.flatMap((pointId) => {
    const point = pointById.get(pointId);
    return point ? [point] : [];
  });
  return points.length > 0
    ? { ...selectedRoute, ...(routeId !== undefined ? { id: routeId } : {}), points }
    : null;
}

/**
 * Resolve the action/camera contract for a point along a multi-stage route.
 * The final arrival is intentionally left to `arriveActionId`, so a settle
 * phase never gets mistaken for the stable seated/standing state.
 */
export function getFormalSceneRoutePhase(route: NovelistRoute, progress: number): NovelistRoutePhase | null {
  const phases = route.phases ?? [];
  const clamped = Math.min(1, Math.max(0, progress));
  return phases.find((phase) => clamped >= phase.startProgress && clamped < phase.endProgress) ?? null;
}

export function getFormalSceneRouteTransition(
  route: NovelistRoute | null | undefined,
  pointId: string,
  phase: NovelistRouteTransition["phase"],
): NovelistRouteTransition | null {
  return route?.transitions?.find((transition) => (
    transition.pointId === pointId && transition.phase === phase
  )) ?? null;
}

/**
 * Keep same-scene actions continuous when a destination has an alternate
 * route whose first waypoint is the actor's current arrival point.
 */
export function resolveFormalSceneRouteId(
  sceneId: FormalSceneId,
  requestedRouteId?: string,
  fromPointId?: string,
): string | undefined {
  if (!requestedRouteId) return undefined;
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const requestedRoute = getFormalSceneRoute(sceneId, requestedRouteId);
  if (!requestedRoute || !fromPointId || requestedRoute.waypointIds[0] === fromPointId) {
    return requestedRouteId;
  }

  const routes = Object.values(scene.routes).filter((route) => (
    route.id !== requestedRouteId
    && route.arriveActionId === requestedRoute.arriveActionId
  ));
  const alternate = routes.find((route) => route.waypointIds[0] === fromPointId);
  if (alternate) return alternate.id;

  // During an interrupted preview the actor may already be between two
  // formal waypoints. Prefer a registered route that passes through the
  // actor's last grounded waypoint instead of sending it back to the route's
  // canonical first point. The motion actor trims that route at this point
  // and preserves the live coordinate as the first segment endpoint.
  const continuingRoute = [requestedRoute, ...routes].find((route) => route.waypointIds.includes(fromPointId));
  return continuingRoute?.id ?? requestedRouteId;
}

export function getFormalSceneAction(sceneId: FormalSceneId, activity: NovelistActivity, actionId?: string): NovelistSceneAction | null {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const defaultRouteId = scene.defaultRouteByActivity[activity];
  const defaultRoute = defaultRouteId ? getFormalSceneRoute(sceneId, defaultRouteId) : null;
  const selectedId = actionId ?? defaultRoute?.arriveActionId;
  // An explicit action ID is a published route contract. Falling back to an
  // unrelated first action makes a stale/malformed route look valid and can
  // display the wrong scene state at the destination. Omitted action IDs may
  // still resolve through the activity's default route, but an unresolved
  // contract must remain visible as null for the caller to handle safely.
  return selectedId ? scene.actions[selectedId] ?? null : null;
}

export function getCharacterReferenceForAction(
  activity: NovelistActivity,
  facing: "left" | "right",
): NovelistCharacterReferenceId {
  if (activity === "writing" || activity === "sleeping" || activity === "away") return "strict-back";
  return facing === "left" || facing === "right" ? "back-three-quarter" : "strict-back";
}

export function getFormalSceneRuntimeGate(sceneId: FormalSceneId): NovelistSceneRuntimeGate {
  return formalEcologySceneManifest.scenes[sceneId].runtimeGate;
}

export function isFormalRuntimeScene(sceneId: FormalSceneId): boolean {
  return formalEcologySceneManifest.runtimeSceneIds.includes(sceneId);
}

export function getFormalSceneActionAssembly(
  sceneId: FormalSceneId,
  actionId?: string,
): NovelistActionAssembly | null {
  if (!actionId) return null;
  return formalEcologySceneManifest.scenes[sceneId].assetContract.actions[actionId] ?? null;
}

export function canRenderFormalSceneMaster(sceneId: FormalSceneId): boolean {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  return Boolean(scene.masterAsset?.approvedForRuntime && scene.runtimeGate.allowSceneMaster);
}

export function canRenderFormalActor(sceneId: FormalSceneId, actionId?: string): boolean {
  const gate = getFormalSceneRuntimeGate(sceneId);
  const assembly = getFormalSceneActionAssembly(sceneId, actionId);
  const body = assembly?.actorBodyAlpha;
  return Boolean(
    gate.allowActor
    && assembly?.status === "ready"
    && body?.approvedForRuntime
    && body.status === "approved",
  );
}
