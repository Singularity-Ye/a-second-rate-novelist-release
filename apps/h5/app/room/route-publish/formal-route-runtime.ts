import studySnapshotJson from "./published/study.formal-route-snapshot.v1.json";
import bedroomSnapshotJson from "./published/bedroom.formal-route-snapshot.v1.json";
import diningKitchenSnapshotJson from "./published/dining-kitchen.formal-route-snapshot.v1.json";
import entranceSnapshotJson from "./published/entrance.formal-route-snapshot.v1.json";
import terraceSnapshotJson from "./published/terrace-greenery.formal-route-snapshot.v1.json";
import atticSnapshotJson from "./published/attic.formal-route-snapshot.v1.json";

import type {
  FormalSceneId,
  NovelistFormalScene,
  NovelistRoute,
  NovelistRoutePhase,
  NovelistRoutePoint,
  NovelistRouteTransition,
  NovelistSceneAction,
  NovelistSceneActionPreview,
  NovelistFormalActorAsset,
  NovelistActivity,
  NovelistRouteInteractionEvent,
  NovelistSceneInteraction,
  FormalActorMode,
  FormalFacingDirection,
} from "../novelist/scene-manifest";
import type {
  FormalRouteSnapshot,
  FormalRouteSnapshotEvent,
  FormalRouteSnapshotInteractionEvent,
  FormalRouteSnapshotPhase,
  FormalRouteSnapshotRoute,
} from "./contract";
import { resolvePointAnchorSemantics } from "./route-anchor-semantics";

type PublishedSceneId = Exclude<FormalSceneId, "bathroom-private">;

type FormalManifestRuntimeTarget = {
  scenes: Record<FormalSceneId, NovelistFormalScene>;
  runtimeSceneIds: readonly FormalSceneId[];
  pausedSceneIds: readonly FormalSceneId[];
};

type EventBinding = {
  fromActionId?: string;
  toActionId?: string;
  fromMode?: "scene" | "actor" | "none";
  toMode?: "scene" | "actor" | "none";
  fromFacing?: FormalFacingDirection;
  toFacing?: FormalFacingDirection;
};

const snapshots: Readonly<Record<PublishedSceneId, FormalRouteSnapshot>> = {
  study: studySnapshotJson as unknown as FormalRouteSnapshot,
  bedroom: bedroomSnapshotJson as unknown as FormalRouteSnapshot,
  "dining-kitchen": diningKitchenSnapshotJson as unknown as FormalRouteSnapshot,
  entrance: entranceSnapshotJson as unknown as FormalRouteSnapshot,
  "terrace-greenery": terraceSnapshotJson as unknown as FormalRouteSnapshot,
  attic: atticSnapshotJson as unknown as FormalRouteSnapshot,
};

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "state";
}

function assetName(source: string): string {
  if (source.startsWith("data:")) return "embedded";
  return source.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? "asset";
}

type EmbeddedImageDimensions = { width: number; height: number };

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Published editor snapshots may contain small transparent WebP actors as
 * data URLs. Decode only the header: the full image stays in the browser and
 * this keeps the mode decision synchronous in both Node and the browser.
 */
function decodeBase64Prefix(value: string, maxBytes = 128): Uint8Array {
  const encoded = value.slice(0, Math.ceil(maxBytes * 4 / 3) + 8).replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;
  for (const character of encoded) {
    if (character === "=") break;
    const digit = BASE64_ALPHABET.indexOf(character);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((buffer >> bitCount) & 0xff);
      if (bytes.length >= maxBytes) break;
    }
  }
  return Uint8Array.from(bytes);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readEmbeddedWebpDimensions(source: string | undefined): EmbeddedImageDimensions | undefined {
  if (!source?.startsWith("data:image/webp")) return undefined;
  const comma = source.indexOf(",");
  if (comma < 0) return undefined;
  const bytes = decodeBase64Prefix(source.slice(comma + 1));
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return undefined;

  let chunkOffset = 12;
  while (chunkOffset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, chunkOffset, 4);
    const dataOffset = chunkOffset + 8;
    if (chunkType === "VP8X" && dataOffset + 10 <= bytes.length) {
      return {
        width: readUint24LittleEndian(bytes, dataOffset + 4) + 1,
        height: readUint24LittleEndian(bytes, dataOffset + 7) + 1,
      };
    }
    if (chunkType === "VP8L" && dataOffset + 5 <= bytes.length && bytes[dataOffset] === 0x2f) {
      return {
        width: 1 + (bytes[dataOffset + 1]! | ((bytes[dataOffset + 2]! & 0x3f) << 8)),
        height: 1 + ((bytes[dataOffset + 2]! >> 6) | (bytes[dataOffset + 3]! << 2) | ((bytes[dataOffset + 4]! & 0x0f) << 10)),
      };
    }
    if (chunkType === "VP8") {
      // Lossy WebP stores the canvas dimensions after the 0x9d 0x01 0x2a
      // frame signature. The small prefix is enough for the normal header.
      for (let index = dataOffset; index + 7 < bytes.length; index += 1) {
        if (bytes[index] === 0x9d && bytes[index + 1] === 0x01 && bytes[index + 2] === 0x2a) {
          return {
            width: (bytes[index + 3]! | (bytes[index + 4]! << 8)) & 0x3fff,
            height: (bytes[index + 5]! | (bytes[index + 6]! << 8)) & 0x3fff,
          };
        }
      }
      return undefined;
    }
    const chunkSize = bytes[chunkOffset + 4]!
      | (bytes[chunkOffset + 5]! << 8)
      | (bytes[chunkOffset + 6]! << 16)
      | (bytes[chunkOffset + 7]! << 24);
    chunkOffset = dataOffset + chunkSize + (chunkSize & 1);
  }
  return undefined;
}

const LOCAL_TERRACE_ACTOR_DIMENSIONS: Readonly<Record<string, EmbeddedImageDimensions>> = {
  "terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless.webp": { width: 186, height: 330 },
  "terrace-watering-character-asset-cropped-lossless.webp": { width: 208, height: 330 },
  "terrace-turtle-character-facing-right-asset-cropped-lossless.webp": { width: 177, height: 272 },
};

const LOCAL_ATTIC_ACTOR_DIMENSIONS: Readonly<Record<string, EmbeddedImageDimensions>> = {
  "attic-character-reading-transparent-v1.webp": { width: 1024, height: 1536 },
  "attic-character-retrieve-archive-transparent-v1.webp": { width: 1024, height: 1536 },
};

function readPublishedAssetDimensions(source: string | undefined): EmbeddedImageDimensions | undefined {
  if (!source) return undefined;
  const embedded = readEmbeddedWebpDimensions(source);
  if (embedded) return embedded;
  const normalized = (source.replace(/\\/g, "/").split("?")[0] ?? "").toLowerCase();
  const knownAsset = [
    ...Object.entries(LOCAL_TERRACE_ACTOR_DIMENSIONS),
    ...Object.entries(LOCAL_ATTIC_ACTOR_DIMENSIONS),
  ].find(([name]) => normalized.endsWith(name));
  return knownAsset?.[1];
}

function readPublishedAssetAlphaBottom(source: string | undefined): number | undefined {
  if (!source) return undefined;
  const normalized = (source.replace(/\\/g, "/").split("?")[0] ?? "").toLowerCase();
  if (
    normalized.endsWith("terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless.webp")
    || normalized.endsWith("terrace-watering-character-asset-cropped-lossless.webp")
    || normalized.endsWith("terrace-turtle-character-facing-right-asset-cropped-lossless.webp")
  ) return 1;
  if (normalized.endsWith("attic-character-reading-transparent-v1.webp")
    || normalized.endsWith("attic-character-retrieve-archive-transparent-v1.webp")) return 0.894;
  return undefined;
}

function isLikelyEmbeddedActor(source: string | undefined): boolean {
  const dimensions = readEmbeddedWebpDimensions(source);
  if (!dimensions) return false;
  // The formal room canvas is 2:1. Small, portrait-oriented WebPs are the
  // transparent action cards exported by the editor, not scene composites.
  return dimensions.width <= 800
    && dimensions.height <= 800
    && dimensions.height > dimensions.width
    && dimensions.height / Math.max(1, dimensions.width) > 1.15;
}

function isWalkingSource(source: string | undefined): boolean {
  return Boolean(source && (
    source.includes("/characters/novelist/")
    || source.includes("study-walk-")
    || source.includes("transparent-actor")
    || source.includes("carry-bowl")
  ));
}

function isSceneActionActorSource(source: string | undefined): boolean {
  return Boolean(source && (
    source.includes("terrace-seated-relaxed-hands-in-pockets-character-asset")
    || source.includes("terrace-watering-character-asset")
    || source.includes("terrace-turtle-character")
  ));
}

function inferAssetMode(
  source: string | undefined,
  explicitMode: "actor" | "scene" | "none" | undefined,
  route: FormalRouteSnapshotRoute,
  stateId: string | undefined,
): "actor" | "scene" | "none" | undefined {
  if (explicitMode) return explicitMode;
  if (!source) return undefined;
  if (isWalkingSource(source) || isSceneActionActorSource(source)) return "actor";
  if (stateId && Object.prototype.hasOwnProperty.call(route.assetLibrary?.states ?? {}, stateId)) return "actor";
  // The editor's legacy exports omitted `scene` for full-scene composites.
  // Older exports also omitted the asset mode for embedded transparent
  // actors. Use their real WebP header dimensions before falling back to a
  // full-scene card; otherwise `background-size: cover` makes the actor fill
  // the entire 2:1 room.
  if (isLikelyEmbeddedActor(source)) return "actor";
  // Data URLs are accepted as published scene cards only after the actor
  // check above; they never replace the scene master.
  if (source.startsWith("data:")) return "scene";
  return "scene";
}

function inferSourceFacing(source: string | undefined): FormalFacingDirection | undefined {
  if (!source) return undefined;
  const normalized = source.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("carry-empty-bowl") || normalized.includes("empty-bowl")) return "left";
  if (normalized.includes("carry-bowl")) return "right";
  if (/(?:^|[-_/])left(?:[-_.]|$)|walk-left/.test(normalized)) return "left";
  if (/(?:^|[-_/])right(?:[-_.]|$)|walk-right/.test(normalized)) return "right";
  return undefined;
}

function stateAssetsForSource(
  route: FormalRouteSnapshotRoute,
  source: string | undefined,
  stateId?: string,
): NonNullable<NonNullable<FormalRouteSnapshotRoute["assetLibrary"]>["states"]>[string] | undefined {
  const states = route.assetLibrary?.states ?? {};
  const sourceState = source
    ? Object.values(states).find((state) => state.left === source || state.right === source)
    : undefined;
  return (stateId ? states[stateId] : undefined) ?? sourceState;
}

function canonicalFacingForAsset(
  route: FormalRouteSnapshotRoute,
  source: string | undefined,
  stateId?: string,
): FormalFacingDirection | undefined {
  return stateAssetsForSource(route, source, stateId)?.canonicalFacing
    ?? inferSourceFacing(source);
}

function routeFacingAtProgress(
  route: FormalRouteSnapshotRoute,
  progress: number,
): FormalFacingDirection {
  const clamped = Math.max(0, Math.min(1, progress));
  let selected: FormalRouteSnapshotPhase | undefined;
  for (const phase of route.phases) {
    if (phase.startProgress > clamped + 0.00001) continue;
    if (!selected || phase.startProgress >= selected.startProgress) selected = phase;
  }
  return selected?.cameraFacing ?? route.initialFacing;
}

function eventAssetFacing(
  route: FormalRouteSnapshotRoute,
  event: FormalRouteSnapshotEvent,
  side: "from" | "to",
  source: string | undefined,
): FormalFacingDirection | undefined {
  const explicit = side === "from" ? event.fromAssetFacing : event.toAssetFacing;
  const canonical = canonicalFacingForAsset(route, source, side === "to" ? event.targetStateId : undefined);
  if (explicit || canonical) return explicit ?? canonical;
  const mode = side === "from" ? event.fromAssetMode : event.toAssetMode;
  const inferredMode = inferAssetMode(
    source,
    mode,
    route,
    side === "to" ? event.targetStateId : undefined,
  );
  return inferredMode === "actor" ? routeFacingAtProgress(route, event.progress) : undefined;
}

function eventAssetScale(
  event: FormalRouteSnapshotEvent,
  side: "from" | "to",
): number | undefined {
  return side === "from" ? event.fromAssetScale : event.toAssetScale;
}

function stateActivity(sceneId: PublishedSceneId, stateId: string | undefined): NovelistActivity {
  const state = stateId?.toLowerCase() ?? "";
  if (/write|writing/.test(state)) return "writing";
  if (/sleep|bed/.test(state)) return "sleeping";
  if (/eat|meal|soup|bowl|carry/.test(state)) return "eating";
  if (/gone|leave|exit|away|walking|walk/.test(state)) return "away";
  return sceneId === "bedroom" ? "daydreaming" : sceneId === "study" ? "writing" : "daydreaming";
}

function stateActorMode(
  stateId: string | undefined,
  mode: "actor" | "scene" | "none" | undefined,
  source: string | undefined,
): FormalActorMode {
  if (mode === "scene") return "standing";
  const state = stateId?.toLowerCase() ?? "";
  if (/sleep|bed|write|seat/.test(state)) return "seated";
  // A transparent asset is not automatically a walking sprite. The editor
  // also publishes scene-local action cards (terrace watering, turtle,
  // attic archive/reading) as transparent actors. Those must remain mounted
  // after the smoke handoff; only the shared directional sprites and explicit
  // carry assets represent movement.
  return isWalkingSource(source) ? "walking" : "standing";
}

function effectiveSource(
  route: FormalRouteSnapshotRoute,
  event: FormalRouteSnapshotEvent,
  side: "from" | "to",
): string | undefined {
  const source = side === "from" ? event.fromAssetSource : event.toAssetSource;
  if (source) return source;
  if (side !== "to" || !event.targetStateId) return undefined;
  // The editor emits a progress-0 state event for the normal walking entry
  // even when no destination actor asset is explicitly mounted. A registered
  // state library must not turn that bookkeeping event into an action card at
  // the route origin; doing so would reuse the entry facing for the later
  // arrival handoff and skip the authored turn.
  if (event.progress === 0 && !event.toAssetMode) return undefined;
  const stateAssets = route.assetLibrary?.states?.[event.targetStateId];
  if (!stateAssets) return undefined;
  const facing = event.toAssetFacing ?? stateAssets.canonicalFacing ?? route.initialFacing;
  return stateAssets[facing] ?? stateAssets.left ?? stateAssets.right;
}

function effectiveMode(
  route: FormalRouteSnapshotRoute,
  event: FormalRouteSnapshotEvent,
  side: "from" | "to",
): "actor" | "scene" | "none" | undefined {
  const source = effectiveSource(route, event, side);
  const explicitMode = side === "from" ? event.fromAssetMode : event.toAssetMode;
  return inferAssetMode(source, explicitMode, route, event.targetStateId);
}

function existingActionForAsset(
  actions: Record<string, NovelistSceneAction>,
  source: string | undefined,
  mode: "actor" | "scene" | "none" | undefined,
): string | undefined {
  if (!source || mode === "none" || !mode) return undefined;
  for (const [actionId, action] of Object.entries(actions)) {
    if (mode === "scene" && action.preview?.src === source) return actionId;
    if (mode === "actor" && action.actorAsset?.src === source
      && (!action.preview || action.preview.transparentOverlay)) return actionId;
  }
  if (mode === "actor" && isWalkingSource(source)) return "walking";
  return undefined;
}

function sceneActionPreview(
  sceneId: PublishedSceneId,
  actionId: string,
  source: string,
  canvas: { width: number; height: number },
): NovelistSceneActionPreview {
  return {
    assetId: `published-${sceneId}-${slug(actionId)}-${assetName(source)}`,
    src: source,
    width: canvas.width,
    height: canvas.height,
    purpose: `3001 已发布路线状态图：${actionId}`,
    runtimeRole: "action-preview",
    notSceneMaster: true,
    notTransparentActor: true,
  };
}

function actorAsset(
  sceneId: PublishedSceneId,
  actionId: string,
  source: string,
  route: FormalRouteSnapshotRoute,
  event: FormalRouteSnapshotEvent,
  facing: FormalFacingDirection | undefined,
  assetScaleOverride?: number,
): NovelistFormalActorAsset {
  const stateAssets = stateAssetsForSource(route, source, event.targetStateId);
  const embeddedDimensions = readPublishedAssetDimensions(source);
  const nativeFacing = (stateAssets?.canonicalFacing as FormalFacingDirection | undefined)
    ?? inferSourceFacing(source)
    ?? facing
    ?? route.initialFacing;
  const assetScale = assetScaleOverride ?? stateAssets?.scale;
  const alphaBottom = stateAssets?.alphaBottom ?? readPublishedAssetAlphaBottom(source);
  return {
    mode: "walking",
    assetId: `published-${sceneId}-${slug(actionId)}-${assetName(source)}`,
    src: source,
    width: embeddedDimensions?.width ?? 1254,
    height: embeddedDimensions?.height ?? 1254,
    alt: `3001 已发布透明角色资产：${actionId}`,
    runtimeAsset: true,
    visualContractStatus: "approved",
    nativeFacing,
    ...(typeof alphaBottom === "number" ? { alphaBottom } : {}),
    ...(typeof assetScale === "number" ? { assetScale } : {}),
  };
}

function ensureAction(
  sceneId: PublishedSceneId,
  scene: NovelistFormalScene,
  route: FormalRouteSnapshotRoute,
  event: FormalRouteSnapshotEvent,
  source: string | undefined,
  mode: "actor" | "scene" | "none" | undefined,
  side: "from" | "to",
  actionIdHint: string | undefined,
  actionIds: Map<string, string>,
  assetFacing?: FormalFacingDirection,
): string | undefined {
  if (!source || mode === "none" || !mode) return undefined;
  const assetScaleOverride = mode === "actor" ? eventAssetScale(event, side) : undefined;
  // An event-local multiplier must not mutate a shared canonical action such
  // as `walking`; give that transition its own action card instead.
  const canonical = assetScaleOverride === undefined
    ? existingActionForAsset(scene.actions, source, mode)
    : undefined;
  if (canonical) {
    if (mode === "actor") {
      const canonicalAction = scene.actions[canonical];
      const existing = canonicalAction?.actorAsset;
      const stateAssets = stateAssetsForSource(route, source, event.targetStateId);
      const knownAlphaBottom = readPublishedAssetAlphaBottom(source);
      if (canonicalAction && existing && (
        stateAssets?.canonicalFacing
        || stateAssets?.scale !== undefined
        || stateAssets?.alphaBottom !== undefined
        || knownAlphaBottom !== undefined
      )) {
        canonicalAction.actorAsset = {
          ...existing,
          ...(stateAssets?.canonicalFacing ? { nativeFacing: stateAssets.canonicalFacing as FormalFacingDirection } : {}),
          ...(!stateAssets?.canonicalFacing && !existing.nativeFacing && assetFacing
            ? { nativeFacing: assetFacing }
            : {}),
          ...(typeof stateAssets?.scale === "number" ? { assetScale: stateAssets.scale } : {}),
          ...(typeof stateAssets?.alphaBottom === "number"
            ? { alphaBottom: stateAssets.alphaBottom }
            : typeof knownAlphaBottom === "number" ? { alphaBottom: knownAlphaBottom } : {}),
        };
      }
    }
    return canonical;
  }
  const sourceKey = `${route.id}:${side}:${source}:${assetScaleOverride ?? "default"}`;
  const known = actionIds.get(sourceKey);
  if (known) return known;
  const actionId = `published-${slug(route.id)}-${side}-${slug(actionIdHint ?? event.targetStateId ?? "state")}`;
  const uniqueActionId = scene.actions[actionId] ? `${actionId}-${actionIds.size + 1}` : actionId;
  const resolvedActorAsset = mode === "actor"
    ? actorAsset(
        sceneId,
        uniqueActionId,
        source,
        route,
        event,
        assetFacing ?? (side === "from" ? event.fromAssetFacing : event.toAssetFacing),
        assetScaleOverride,
      )
    : null;
  const action: NovelistSceneAction = {
    id: uniqueActionId,
    label: actionIdHint ?? event.targetStateId ?? "published-state",
    activity: stateActivity(sceneId, event.targetStateId),
    actorMode: stateActorMode(event.targetStateId, mode, source),
    maskSrc: null,
    runtimeGate: "approved",
    ...(mode === "scene"
      ? { preview: sceneActionPreview(sceneId, uniqueActionId, source, { width: routeCanvasWidth(sceneId), height: routeCanvasHeight(sceneId) }) }
      : {
        actorAsset: resolvedActorAsset!,
        ...(resolvedActorAsset?.nativeFacing ? { cameraFacing: resolvedActorAsset.nativeFacing } : {}),
      }),
  };
  scene.actions[uniqueActionId] = action;
  actionIds.set(sourceKey, uniqueActionId);
  return uniqueActionId;
}

// All published editor scenes use the shared 2:1 formal canvas. Keeping this
// helper explicit makes the generated action cards independent of the legacy
// 1536x1024 Motion Lab manifest.
function routeCanvasWidth(_sceneId: PublishedSceneId): number { return 1774; }
function routeCanvasHeight(_sceneId: PublishedSceneId): number { return 887; }

function mapForegroundPolicy(
  sceneId: PublishedSceneId,
  policy: FormalRouteSnapshotPhase["foregroundPolicy"],
): "none" | "chair-foreground" | "desk-foreground" | "bedroom-foreground" {
  if (policy === "none") return "none";
  if (sceneId === "bedroom") return "bedroom-foreground";
  if (sceneId === "study") return "desk-foreground";
  if (sceneId === "dining-kitchen") return "chair-foreground";
  return "none";
}

function actionAtPhaseStart(
  route: FormalRouteSnapshotRoute,
  phase: FormalRouteSnapshotPhase,
  bindings: ReadonlyMap<number, EventBinding>,
  events: readonly FormalRouteSnapshotEvent[],
): string | undefined {
  const eventIndex = events.findIndex((event) => event.kind === "state" && Math.abs(event.progress - phase.startProgress) < 0.00001);
  if (eventIndex < 0) return undefined;
  return bindings.get(eventIndex)?.toActionId;
}

const STUDY_LEFT_DESK_LAYER_MODES = {
  chair: "obstacle-front",
  "desk-table": "actor-front",
} as const;

function studyDeskLayerModesForPhase(
  sceneId: PublishedSceneId,
  snapshot: FormalRouteSnapshot,
  snapshotRoute: FormalRouteSnapshotRoute,
  phase: FormalRouteSnapshotPhase,
): FormalRouteSnapshotPhase["layerModes"] | undefined {
  if (sceneId !== "study") return undefined;

  const terminalPoint = snapshot.points.find((point) => point.id === snapshotRoute.endPointId);
  if (terminalPoint?.anchorGroupKey !== "study.desk" || terminalPoint.anchorPort !== "left") return undefined;

  // The left port is the sit-down side. Its route normally contains a
  // mid-route facing event immediately before the final phase (the actor
  // turns toward the desk there). Only the post-turn segment should be
  // rendered as chair > actor > desk. Keeping the earlier phase untouched
  // preserves the authored approach depth.
  const turnProgress = snapshotRoute.events
    .filter((event) => event.kind === "facing" && event.progress > 0 && event.progress < 1)
    .map((event) => event.progress)
    .at(-1);
  if (turnProgress === undefined || phase.startProgress + 0.00001 < turnProgress) return undefined;

  // Explicit editor choices always win. The defaults only fill the two
  // semantic furniture keys that are required for the left desk port.
  return {
    ...STUDY_LEFT_DESK_LAYER_MODES,
    ...phase.layerModes,
  };
}

function mapInteractionEvents(
  events: readonly FormalRouteSnapshotInteractionEvent[] | undefined,
): readonly NovelistRouteInteractionEvent[] | undefined {
  if (!events?.length) return undefined;
  return events.map((event) => ({
    pointId: event.pointId,
    progress: event.progress,
    interactionId: event.interactionId,
    stateId: event.stateId,
  }));
}

function buildPublishedRoute(
  sceneId: PublishedSceneId,
  scene: NovelistFormalScene,
  snapshotRoute: FormalRouteSnapshotRoute,
): NovelistRoute {
  const actionIds = new Map<string, string>();
  const bindings = new Map<number, EventBinding>();
  const stateEvents = snapshotRoute.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === "state");

  for (const { event, index } of stateEvents) {
    const fromSource = effectiveSource(snapshotRoute, event, "from");
    const toSource = effectiveSource(snapshotRoute, event, "to");
    const fromMode = effectiveMode(snapshotRoute, event, "from");
    const toMode = effectiveMode(snapshotRoute, event, "to");
    const fromFacing = eventAssetFacing(snapshotRoute, event, "from", fromSource);
    const toFacing = eventAssetFacing(snapshotRoute, event, "to", toSource);
    const fromActionId = ensureAction(
      sceneId,
      scene,
      snapshotRoute,
      event,
      fromSource,
      fromMode,
      "from",
      event.targetStateId,
      actionIds,
      fromFacing,
    );
    let toActionId = ensureAction(
      sceneId,
      scene,
      snapshotRoute,
      event,
      toSource,
      toMode,
      "to",
      event.targetStateId,
      actionIds,
      toFacing,
    );
    // An initial state event without an explicit asset still means “enter as
    // the normal walking actor”. This is how old terrace exports represented
    // their entry handoff.
    if (!toActionId && event.progress === 0 && snapshotRoute.waypointIds.length > 1 && toMode !== "none") {
      toActionId = "walking";
    }
    bindings.set(index, {
      ...(fromActionId ? { fromActionId } : {}),
      ...(toActionId ? { toActionId } : {}),
      ...(fromMode ? { fromMode } : {}),
      ...(toMode ? { toMode } : {}),
      ...(fromFacing ? { fromFacing } : {}),
      ...(toFacing ? { toFacing } : {}),
    });
  }

  const transitions: NovelistRouteTransition[] = stateEvents.flatMap(({ event, index }) => {
    const binding = bindings.get(index);
    if (!binding) return [];
    const phase = event.progress <= 0 ? "depart" : event.progress >= 1 ? "arrive" : "arrive";
    const isTerminal = event.pointId === snapshotRoute.endPointId && phase === "arrive";
    return [{
      pointId: event.pointId,
      phase,
      style: "smoke" as const,
      durationMs: Math.max(1, event.animation.durationMs),
      settleMs: Math.max(0, event.animation.settleMs),
      turns: event.animation.turns,
      ...(binding.fromActionId ? { fromActionId: binding.fromActionId } : {}),
      ...(binding.toActionId ? { toActionId: binding.toActionId } : {}),
      ...(binding.fromMode ? { fromMode: binding.fromMode } : {}),
      ...(binding.toMode ? { toMode: binding.toMode } : {}),
      ...(binding.fromFacing ? { fromFacing: binding.fromFacing } : {}),
      ...(binding.toFacing ? { toFacing: binding.toFacing } : {}),
      ...(isTerminal && snapshotRoute.terminal.hideAfter ? { hideAfter: true } : {}),
    }];
  });

  const phases: NovelistRoutePhase[] = snapshotRoute.phases.map((phase) => {
    const startActionId = actionAtPhaseStart(snapshotRoute, phase, bindings, snapshotRoute.events);
    const hasActorAction = startActionId ? Boolean(scene.actions[startActionId]?.actorAsset) : false;
    const actionId = phase.actionId === "walking"
      ? "walking"
      : hasActorAction
        ? startActionId!
        : phase.pathStartPointId || phase.pathEndPointId ? "walking" : phase.actionId;
    const layerModes = studyDeskLayerModesForPhase(sceneId, snapshots[sceneId], snapshotRoute, phase);
    return {
      id: phase.id,
      startProgress: phase.startProgress,
      endProgress: phase.endProgress,
      actionId,
      cameraFacing: phase.cameraFacing,
      travelDirection: phase.travelDirection,
      actorMode: actionId === "walking" ? "walking" : phase.actorMode,
      foregroundOcclusionPolicy: mapForegroundPolicy(sceneId, phase.foregroundPolicy),
      ...(layerModes || Object.keys(phase.layerModes).length > 0
        ? { layerModes: layerModes ?? phase.layerModes }
        : {}),
      ...(phase.pathStartPointId ? { pathStartPointId: phase.pathStartPointId } : {}),
      ...(phase.pathEndPointId ? { pathEndPointId: phase.pathEndPointId } : {}),
      ...(phase.holdAtPointId ? { holdAtPointId: phase.holdAtPointId } : {}),
      ...(phase.stateId ? { stateId: phase.stateId } : {}),
    };
  });

  const finalStateEvent = [...stateEvents].reverse()[0];
  const terminalActionId = finalStateEvent
    ? bindings.get(finalStateEvent.index)?.toActionId
      ?? (snapshotRoute.terminal.hideAfter ? "gone" : snapshotRoute.terminal.stateId)
    : snapshotRoute.terminal.stateId;
  const arriveActionId = terminalActionId ?? "walking";
  if (!scene.actions[arriveActionId]) {
    scene.actions[arriveActionId] = {
      id: arriveActionId,
      label: arriveActionId,
      activity: stateActivity(sceneId, snapshotRoute.terminal.stateId),
      actorMode: snapshotRoute.terminal.hideAfter ? "walking" : "standing",
      maskSrc: null,
      runtimeGate: "approved",
    };
  }

  const settleMs = snapshotRoute.events.reduce((max, event) => Math.max(max, event.animation.settleMs), 220);
  const interactionEvents = mapInteractionEvents(snapshotRoute.interactionEvents);
  return {
    id: snapshotRoute.id,
    label: snapshotRoute.label,
    waypointIds: [...snapshotRoute.waypointIds],
    durationMs: snapshotRoute.durationMs,
    arriveActionId,
    phases,
    transitions,
    ...(interactionEvents ? { interactionEvents } : {}),
    publishedFromSnapshot: true,
    motion: { profile: "grounded-walk", settleMs },
  };
}

function snapshotPoint(
  point: FormalRouteSnapshot["points"][number],
  snapshot: FormalRouteSnapshot,
): NovelistRoutePoint {
  const anchor = resolvePointAnchorSemantics({
    sceneId: snapshot.scene.sceneId,
    point,
    routes: Object.entries(snapshot.routes).map(([routeKey, route]) => ({
      routeKey,
      routeLabel: route.label,
      pointIds: route.waypointIds,
    })),
  });
  return {
    id: point.id,
    label: point.label,
    x: point.normalized.x,
    y: point.normalized.y,
    depth: point.depth,
    facing: point.facing,
    stableScale: point.scaleOverride ?? point.stableScale,
    anchorKind: anchor.anchorKind,
    ...(anchor.anchorKey ? { anchorKey: anchor.anchorKey } : {}),
    ...(anchor.anchorGroupKey ? { anchorGroupKey: anchor.anchorGroupKey } : {}),
    ...(anchor.anchorPort ? { anchorPort: anchor.anchorPort } : {}),
    anchorSource: anchor.anchorSource,
    ...(point.pixel ? { pixel: { x: point.pixel[0], y: point.pixel[1] } } : {}),
    anchorStatus: point.pixel ? "confirmed-pixel" : "semantic",
  };
}

function addSnapshotForegroundLayers(scene: NovelistFormalScene, snapshot: FormalRouteSnapshot): void {
  if (snapshot.scene.foregroundLayers.length === 0) return;
  const snapshotSources = new Set(snapshot.scene.foregroundLayers.map((layer) => layer.src));
  const snapshotRoles = new Set(
    snapshot.scene.foregroundLayers.map((layer) => (
      /chair/i.test(layer.id) ? "chair-depth-occluder" : /bed/i.test(layer.id)
        ? "bedroom-furniture-depth-occluder"
        : "desk-depth-occluder"
    )),
  );

  // The legacy manifest and the published snapshot use different asset IDs
  // for the same semantic layer (for example, `chair` vs.
  // `study-chair-cutout-2x1-user-v1`).  Keying only by asset ID therefore
  // mounts the same alpha mask twice.  Remove the old semantic/source entry
  // first, then let the published snapshot become the sole source of truth.
  const current = new Map(
    (scene.foregroundLayers ?? [])
      .filter((layer) => !snapshotSources.has(layer.src) && !snapshotRoles.has(layer.layerRole))
      .map((layer) => [layer.assetId, layer]),
  );
  for (const layer of snapshot.scene.foregroundLayers) {
    const role = /chair/i.test(layer.id) ? "chair-depth-occluder" : /bed/i.test(layer.id)
      ? "bedroom-furniture-depth-occluder"
      : "desk-depth-occluder";
    current.set(layer.id, {
      assetId: layer.id,
      src: layer.src,
      width: 1774,
      height: 887,
      status: "approved",
      approvedForRuntime: true,
      sourceOfTruth: "transparent-alpha",
      layerRole: role,
      // Bedroom's single alpha combines bed and lounge furniture and must
      // remain gated by the bedroom route policy.  Study's chair alpha is a
      // near-side occluder and intentionally remains active even when the
      // desk policy is not selected.
      renderWhen: role === "bedroom-furniture-depth-occluder"
        ? "scene-policy"
        : layer.policy === "always" ? "always" : "scene-policy",
      stacking: "over-actor",
      renderMode: "occlusion-mask",
      purpose: `3001 已发布遮挡层：${layer.label}`,
    });
  }
  scene.foregroundLayers = [...current.values()];
}

function applySnapshotInteractions(scene: NovelistFormalScene, snapshot: FormalRouteSnapshot): void {
  const interactions = snapshot.scene.interactions;
  if (!interactions) return;
  scene.interactions = interactions.map((interaction): NovelistSceneInteraction => ({
    id: interaction.id,
    label: interaction.label,
    kind: interaction.kind,
    anchorPointId: interaction.anchorPointId,
    initialStateId: interaction.initialStateId,
    assets: interaction.assets.map((asset) => ({ ...asset })),
    states: interaction.states.map((state) => ({ ...state, visibleAssetIds: [...state.visibleAssetIds] })),
  }));
}

function applySceneSnapshot(sceneId: PublishedSceneId, scene: NovelistFormalScene, snapshot: FormalRouteSnapshot): void {
  if (scene.masterAsset) {
    scene.masterAsset = {
      ...scene.masterAsset,
      assetId: `published-${sceneId}-master`,
      src: snapshot.scene.masterSrc,
      width: snapshot.scene.canvas.width,
      height: snapshot.scene.canvas.height,
      status: "approved",
      approvedForRuntime: true,
    };
  }
  addSnapshotForegroundLayers(scene, snapshot);
  applySnapshotInteractions(scene, snapshot);
  scene.runtimeGate = {
    ...scene.runtimeGate,
    status: "ready",
    reason: "3001 formal-route-snapshot.v1 已通过发布校验并接入 3000。",
    allowSceneMaster: Boolean(scene.masterAsset),
    allowActor: true,
    allowPreviews: true,
    missing: [],
  };
  if (!scene.actions.walking) {
    scene.actions.walking = {
      id: "walking",
      label: "发布路线移动中",
      activity: "away",
      actorMode: "walking",
      maskSrc: null,
      runtimeGate: "approved",
    };
  }

  const staticRoutes = scene.routes;
  const legacyStaticKeepIds = new Set([
    "study-desk-stay",
    // These are compatibility sources retained by the manifest, but they are
    // deliberately not published routes.  3001's snapshot is the only source
    // for the formal route directory; keeping these unmarked lets old callers
    // fail safely without advertising stale geometry as current truth.
    "study-writing-to-stand-by-desk",
    "study-writing-to-terrace-lookout",
    "study-stand-by-desk-to-terrace-lookout",
    "study-stand-by-desk-to-writing",
    "study-terrace-lookout-to-writing",
    "study-terrace-lookout-to-stand-by-desk",
    "bedroom-door-stay",
    "attic-stair-stay",
  ]);
  const routes: Record<string, NovelistRoute> = Object.fromEntries(
    Object.entries(staticRoutes)
      .filter(([routeId]) => legacyStaticKeepIds.has(routeId))
      .map(([routeId, route]) => [routeId, route] as const),
  );
  for (const snapshotRoute of Object.values(snapshot.routes)) {
    routes[snapshotRoute.id] = buildPublishedRoute(sceneId, scene, snapshotRoute);
  }
  scene.routePoints = [
    ...scene.routePoints.filter((point) => !snapshot.points.some((publishedPoint) => publishedPoint.id === point.id)),
    ...snapshot.points.map((point) => snapshotPoint(point, snapshot)),
  ];
  scene.routes = routes;

}

/**
 * Replace only the route/runtime portion of the formal manifest. Source JSON
 * drafts remain untouched; 3000 consumes this generated, versioned boundary.
 */
export function applyPublishedRouteSnapshots(manifest: FormalManifestRuntimeTarget): void {
  for (const sceneId of Object.keys(snapshots) as PublishedSceneId[]) {
    const scene = manifest.scenes[sceneId];
    if (!scene) continue;
    applySceneSnapshot(sceneId, scene, snapshots[sceneId]);
  }
  const publishedIds = Object.keys(snapshots) as PublishedSceneId[];
  Object.assign(manifest, {
    runtimeSceneIds: [...new Set([...manifest.runtimeSceneIds, ...publishedIds])],
    pausedSceneIds: manifest.pausedSceneIds.filter((sceneId) => !publishedIds.includes(sceneId as PublishedSceneId)),
  });
}

export function getPublishedRouteSnapshot(sceneId: PublishedSceneId): FormalRouteSnapshot {
  return snapshots[sceneId];
}
