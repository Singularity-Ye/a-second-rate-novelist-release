import { describe, expect, it } from "vitest";

import {
  createInitialEditorDraft,
  addSceneInteractionAsset,
  DEFAULT_INITIAL_NODE_STATE_TRANSITION_ANIMATION,
  BEDROOM_BED_SCENE_ASSET_SRC,
  BEDROOM_LOUNGE_SCENE_ASSET_SRC,
  BEDROOM_RECORD_SCENE_ASSET_SRC,
  BEDROOM_WALK_LEFT_ACTOR_ASSET_SRC,
  BEDROOM_WALK_RIGHT_ACTOR_ASSET_SRC,
  ATTIC_READING_ACTOR_ASSET_SRC,
  ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
  DEFAULT_EDITOR_TRANSITION_ANIMATION,
  editorRouteTransitions,
  editorForegroundLayersAtProgress,
  deserializeEditorDraft,
  diningKitchenEndpointContractKind,
  depthScaleAtY,
  editorRouteMeta,
  getEditorSceneProfile,
  isolateCustomRouteEndpoints,
  normalizeEditorDraft,
  normalizeEditorAssetSource,
  normalizeStudyEditorDraft,
  normalizeEditorRouteTransitions,
  routeProgressAtPoint,
  reverseRouteFacingContract,
  routeLengthPx,
  routePlaybackDurationMs,
  routeFacingAtProgress,
  routeForegroundVisibleAtProgress,
  routeLayerModeAtProgress,
  routeLayerModesAtProgress,
  routeSampleAtProgress,
  routeStateAtProgress,
  setSceneInteractionStateVisibility,
  serializeEditorDraft,
  studyEndpointContractKind,
  STUDY_WRITING_SCENE_STATE_SRC,
  type EditorDraft,
  type EditorSceneInteractionAsset,
  type EditorPoint,
} from "./route-editor.model";

describe("study mother-image route editor model", () => {
  it("converts Windows public asset paths to portable project URLs", () => {
    expect(normalizeEditorAssetSource(
      "D:\\Yhx06\\Documents\\仙术工坊——项目集\\a-second-rate-novelist\\apps\\h5\\public\\assets\\ecology\\formal-scenes\\entrance\\interactions\\entrance-umbrella-extracted-v4.webp",
    )).toBe("/assets/ecology/formal-scenes/entrance/interactions/entrance-umbrella-extracted-v4.webp");
    expect(normalizeEditorAssetSource("/assets/ecology/characters/novelist/walk.webp")).toBe(
      "/assets/ecology/characters/novelist/walk.webp",
    );
  });

  it("uses 100ms fast-turn and settle defaults for a new initial-node state event", () => {
    expect(DEFAULT_INITIAL_NODE_STATE_TRANSITION_ANIMATION.durationMs).toBe(100);
    expect(DEFAULT_INITIAL_NODE_STATE_TRANSITION_ANIMATION.settleMs).toBe(100);
  });

  it("puts a newly-added scene asset into the initial on-scene state", () => {
    const draft = createInitialEditorDraft("entrance");
    const interaction = Object.values(draft.sceneInteractions ?? {})[0]!;
    const asset: EditorSceneInteractionAsset = {
      id: "new-umbrella",
      label: "雨伞",
      src: "",
      mode: "scene",
      zIndex: 10,
      scale: 1,
      offset: [0, 0],
    };

    const withAsset = addSceneInteractionAsset(interaction, asset);
    const initialState = withAsset.states.find((state) => state.id === withAsset.initialStateId)!;
    const emptyState = withAsset.states.find((state) => state.id !== withAsset.initialStateId)!;

    expect(initialState.visibleAssetIds).toContain(asset.id);
    expect(emptyState.visibleAssetIds).not.toContain(asset.id);

    const carried = setSceneInteractionStateVisibility(withAsset, emptyState.id, true, asset.id);
    expect(carried.states.find((state) => state.id === emptyState.id)?.visibleAssetIds).toContain(asset.id);

    const returned = setSceneInteractionStateVisibility(carried, emptyState.id, false, asset.id);
    expect(returned.states.find((state) => state.id === emptyState.id)?.visibleAssetIds).not.toContain(asset.id);
  });

  it("keeps a newly-added asset with an empty path as an editable pending asset", () => {
    const draft = createInitialEditorDraft("entrance");
    const interaction = Object.values(draft.sceneInteractions ?? {})[0]!;
    const pendingAsset: EditorSceneInteractionAsset = {
      id: "pending-prop",
      label: "待配置物件",
      src: "",
      mode: "scene",
      zIndex: 10,
      scale: 1,
      offset: [0, 0],
    };
    const pendingInteraction = addSceneInteractionAsset(interaction, pendingAsset);
    const normalized = normalizeEditorDraft({
      ...draft,
      sceneInteractions: {
        ...draft.sceneInteractions,
        [interaction.id]: pendingInteraction,
      },
    });

    expect(normalized?.sceneInteractions?.[interaction.id]?.assets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pendingAsset.id, src: "" })]),
    );
  });

  it("uses the remastered study mother image while preserving the desk foreground contract", () => {
    const profile = getEditorSceneProfile("study");

    expect(profile.masterSrc).toBe("/assets/ecology/formal-scenes/study/study-scene-master-2x1-formal-v2.webp");
    expect(profile.canvas).toEqual({ width: 1774, height: 887 });
    expect(profile.foregroundSrc).toContain("study-chair-cutout-2x1-user-v1.webp");
    expect(profile.foregroundLayers).toEqual([
      expect.objectContaining({
        id: "desk-table",
        src: expect.stringContaining("study-desk-table-cutout-2x1-imagegen-v2.webp"),
        policy: "before-turn",
        zIndex: 5,
      }),
      expect.objectContaining({
        id: "chair",
        src: expect.stringContaining("study-chair-cutout-2x1-user-v1.webp"),
        policy: "always",
        zIndex: 6,
      }),
    ]);
  });

  it("uses the locked v9 writing composite for terminal scene transitions", () => {
    expect(STUDY_WRITING_SCENE_STATE_SRC).toBe(
      "/assets/ecology/formal-scenes/study/states/study-writing-seat-scene-v9-paper-base-mother-locked.webp",
    );
    const draft = createInitialEditorDraft();
    const transition = editorRouteTransitions(
      draft.routes["door-to-seat"]!,
      draft.pointsById,
      draft.routeMeta!["door-to-seat"]!,
    ).find((candidate) => candidate.kind === "state" && candidate.targetStateId === "writing-seat");
    expect(transition?.toAssetSource).toBe(STUDY_WRITING_SCENE_STATE_SRC);
  });

  it("uses normalized transparent actor states for attic action endpoints", () => {
    const draft = createInitialEditorDraft("attic");
    const forwardRoute = draft.routes["stair-to-archive"]!;
    const forwardMeta = draft.routeMeta!["stair-to-archive"]!;
    const forwardTransitions = editorRouteTransitions(forwardRoute, draft.pointsById, forwardMeta);
    const archiveState = forwardMeta.assetLibrary?.states?.["attic-retrieve-archive"];

    expect(archiveState).toMatchObject({
      left: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
      right: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
      canonicalFacing: "right",
    });
    expect(archiveState).not.toHaveProperty("scale");
    expect(archiveState).not.toHaveProperty("alphaBottom");
    expect(forwardTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pointId: forwardRoute[0],
        targetStateId: "walking",
        fromAssetMode: "none",
        toAssetMode: "actor",
        animation: expect.objectContaining({ durationMs: 100, settleMs: 100 }),
      }),
      expect.objectContaining({
        pointId: forwardRoute.at(-1),
        targetStateId: "attic-retrieve-archive",
        toAssetSource: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
        toAssetMode: "actor",
        toAssetFacing: "right",
      }),
    ]));
    expect(routeStateAtProgress(forwardRoute, draft.pointsById, forwardMeta, 0.5)).toBe("walking");
    expect(routeStateAtProgress(forwardRoute, draft.pointsById, forwardMeta, 1)).toBe("attic-retrieve-archive");

    const reverseRoute = draft.routes["archive-to-stair"]!;
    const reverseMeta = draft.routeMeta!["archive-to-stair"]!;
    const reverseTransitions = editorRouteTransitions(reverseRoute, draft.pointsById, reverseMeta);
    expect(reverseTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pointId: reverseRoute[0],
        targetStateId: "walking",
        fromAssetSource: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
        fromAssetMode: "actor",
        fromAssetFacing: "right",
        toAssetMode: "actor",
        animation: expect.objectContaining({ durationMs: 100, settleMs: 100 }),
      }),
      expect.objectContaining({
        pointId: reverseRoute.at(-1),
        targetStateId: "gone",
        toAssetMode: "none",
      }),
    ]));

    const readingState = draft.routeMeta!["stair-to-draft-desk"]!.assetLibrary?.states?.["attic-reading"];
    expect(readingState).toMatchObject({
      left: ATTIC_READING_ACTOR_ASSET_SRC,
      right: ATTIC_READING_ACTOR_ASSET_SRC,
    });
    expect(readingState).not.toHaveProperty("scale");
    expect(readingState).not.toHaveProperty("alphaBottom");
  });

  it("round-trips event-local transparent actor facing overrides", () => {
    const draft = createInitialEditorDraft("attic");
    const routeKey = "stair-to-archive";
    const route = draft.routes[routeKey]!;
    const transition = {
      pointId: route.at(-1)!,
      kind: "state" as const,
      targetStateId: "attic-retrieve-archive",
      toAssetSource: ATTIC_RETRIEVE_ARCHIVE_ACTOR_ASSET_SRC,
      toAssetMode: "actor" as const,
      toAssetFacing: "right" as const,
      animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
    };
    const imported = deserializeEditorDraft(serializeEditorDraft({
      ...draft,
      routeMeta: {
        ...draft.routeMeta,
        [routeKey]: {
          ...draft.routeMeta![routeKey]!,
          transitions: [transition],
        },
      },
    }));

    expect(imported?.routeMeta?.[routeKey]?.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ pointId: route.at(-1), toAssetFacing: "right" }),
    ]));
  });

  it("removes legacy attic image corrections when an old draft is imported", () => {
    const draft = createInitialEditorDraft("attic");
    const routeMeta = draft.routeMeta!;
    const route = routeMeta["stair-to-archive"]!;
    const legacyState = route.assetLibrary!.states!["attic-retrieve-archive"]!;
    const imported = normalizeEditorDraft({
      ...draft,
      routeMeta: {
        ...routeMeta,
        "stair-to-archive": {
          ...route,
          assetLibrary: {
            ...route.assetLibrary,
            states: {
              ...route.assetLibrary!.states,
              "attic-retrieve-archive": {
                ...legacyState,
                scale: 2.79,
                alphaBottom: 0.949,
              },
            },
          },
        },
      },
    });

    const normalizedState = imported?.routeMeta?.["stair-to-archive"]?.assetLibrary?.states?.["attic-retrieve-archive"];
    expect(normalizedState).toMatchObject({ canonicalFacing: "right" });
    expect(normalizedState).not.toHaveProperty("scale");
    expect(normalizedState).not.toHaveProperty("alphaBottom");
  });

  it("classifies dining endpoints as scene interactions, boundaries, or action-layer nodes", () => {
    const draft = createInitialEditorDraft("dining-kitchen");
    const routeKey = "counter-to-table";
    const route = draft.routes[routeKey]!;
    const meta = editorRouteMeta(draft, routeKey);

    expect(diningKitchenEndpointContractKind(
      routeKey,
      meta,
      draft.pointsById[route[0]!],
      "start",
    )).toBe("scene-interaction");
    expect(diningKitchenEndpointContractKind(
      routeKey,
      meta,
      draft.pointsById[route[1]!],
      "middle",
    )).toBe("route-waypoint");
    expect(diningKitchenEndpointContractKind(
      routeKey,
      meta,
      draft.pointsById[route.at(-1)!],
      "end",
    )).toBe("scene-interaction");

    const entryRoute = draft.routes["entry-to-table"]!;
    expect(diningKitchenEndpointContractKind(
      "entry-to-table",
      editorRouteMeta(draft, "entry-to-table"),
      draft.pointsById[entryRoute[0]!],
      "start",
    )).toBe("scene-boundary");
    expect(diningKitchenEndpointContractKind(
      "table-to-entry",
      editorRouteMeta(draft, "table-to-entry"),
      draft.pointsById[draft.routes["table-to-entry"]!.at(-1)!],
      "end",
    )).toBe("scene-boundary");
  });

  it("exposes the new kitchen master as an independent editable scene", () => {
    const draft = createInitialEditorDraft("dining-kitchen");
    const profile = getEditorSceneProfile("dining-kitchen");

    expect(profile.masterSrc).toBe("/assets/ecology/formal-scenes/dining-kitchen/dining-kitchen-scene-master-2x1-formal-v1.webp");
    expect(profile.canvas).toEqual({ width: 1774, height: 887 });
    expect(profile.foregroundSrc).toBeNull();
    expect(draft.routes).toMatchObject({
      "entry-to-counter": ["dining-entry", "entry-counter-1", "entry-counter-2", "kitchen-counter"],
      "counter-to-entry": ["kitchen-counter", "counter-entry-1", "counter-entry-2", "dining-entry"],
      "counter-to-table": ["kitchen-counter", "counter-table-1", "counter-table-2", "meal-table"],
      "table-to-entry": ["meal-table", "table-entry-1", "table-entry-2", "table-entry-3", "dining-entry"],
    });

    const counterToTableTransitions = editorRouteTransitions(
      draft.routes["counter-to-table"]!,
      draft.pointsById,
      draft.routeMeta!["counter-to-table"]!,
    );
    expect(counterToTableTransitions).toMatchObject([
      {
        pointId: "kitchen-counter",
        kind: "state",
        targetStateId: "carry-bowl",
        fromAssetMode: "scene",
        toAssetMode: "actor",
        fromAssetSource: expect.stringContaining("dining-kitchen-serve-red-bean-soup-scene-character-2x1-formal-v3.webp"),
        toAssetSource: expect.stringContaining("carry-bowl-transparent-actor-v1.png"),
      },
      {
        pointId: "meal-table",
        kind: "state",
        targetStateId: "meal-table",
        fromAssetMode: "actor",
        toAssetMode: "scene",
        fromAssetSource: expect.stringContaining("carry-bowl-transparent-actor-v1.png"),
        toAssetSource: expect.stringContaining("dining-kitchen-meal-table-scene-character-2x1-formal-v6.webp"),
      },
    ]);

    const tableToCounterTransitions = editorRouteTransitions(
      draft.routes["table-to-counter"]!,
      draft.pointsById,
      draft.routeMeta!["table-to-counter"]!,
    );
    expect(tableToCounterTransitions).toMatchObject([
      {
        pointId: "meal-table",
        targetStateId: "carry-bowl-return",
        fromAssetMode: "scene",
        toAssetMode: "actor",
        toAssetSource: expect.stringContaining("carry-empty-bowl-transparent-actor-v2.webp"),
      },
      {
        pointId: "kitchen-counter",
        targetStateId: "serve-red-bean-soup",
        fromAssetMode: "actor",
        toAssetMode: "scene",
      },
    ]);
    expect(routeStateAtProgress(
      draft.routes["table-to-counter"]!,
      draft.pointsById,
      draft.routeMeta!["table-to-counter"]!,
      0.01,
    )).toBe("carry-bowl-return");

    const counterToEntryTransitions = editorRouteTransitions(
      draft.routes["counter-to-entry"]!,
      draft.pointsById,
      draft.routeMeta!["counter-to-entry"]!,
    );
    expect(counterToEntryTransitions.at(-1)).toMatchObject({
      pointId: "dining-entry",
      targetStateId: "gone",
      toAssetMode: "none",
      animation: { style: "smoke" },
    });
    expect(routeStateAtProgress(
      draft.routes["counter-to-table"]!,
      draft.pointsById,
      draft.routeMeta!["counter-to-table"]!,
      0.01,
    )).toBe("carry-bowl");
    expect(routeStateAtProgress(
      draft.routes["counter-to-table"]!,
      draft.pointsById,
      draft.routeMeta!["counter-to-table"]!,
      0.99,
    )).toBe("carry-bowl");
    expect(routeStateAtProgress(
      draft.routes["counter-to-table"]!,
      draft.pointsById,
      draft.routeMeta!["counter-to-table"]!,
      1,
    )).toBe("meal-table");
    expect(draft.routeMeta!["counter-to-table"]?.assetLibrary?.states?.["carry-bowl"]).toMatchObject({
      scale: 1.5,
      canonicalFacing: "right",
    });
    expect(draft.routeMeta!["table-to-counter"]?.assetLibrary?.states?.["carry-bowl-return"]).toMatchObject({
      scale: 1.5,
      canonicalFacing: "left",
    });

    const reshapedKitchenRoute = [...draft.routes["counter-to-entry"]!];
    const reshapedPoints = { ...draft.pointsById };
    const reshapedStart = reshapedPoints[reshapedKitchenRoute[0]!]!;
    const reshapedNext = reshapedPoints[reshapedKitchenRoute[1]!]!;
    reshapedPoints[reshapedNext.id] = {
      ...reshapedNext,
      point: [reshapedStart.point[0] + 10, reshapedStart.point[1] + 10],
    };
    expect(routeFacingAtProgress(
      reshapedKitchenRoute,
      reshapedPoints,
      draft.routeMeta!["counter-to-entry"]!,
      0,
    )).toBe("right");

    const routeKeys = Object.keys(draft.routes);
    const sharedSemanticAnchorIds = new Set(["dining-entry", "kitchen-counter", "meal-table"]);
    for (let leftIndex = 0; leftIndex < routeKeys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < routeKeys.length; rightIndex += 1) {
        const left = routeKeys[leftIndex]!;
        const right = routeKeys[rightIndex]!;
        expect((draft.routes[left] ?? []).filter((pointId) => (
          draft.pointsById[pointId]?.role === "waypoint"
          && !sharedSemanticAnchorIds.has(pointId)
          && (draft.routes[right] ?? []).includes(pointId)
        ))).toEqual([]);
      }
    }

    const exported = serializeEditorDraft(draft);
    expect(exported.scene).toMatchObject({
      master: profile.masterSrc,
      foreground: null,
      floorStatus: "pending",
    });
    expect(deserializeEditorDraft(exported)?.sceneId).toBe("dining-kitchen");
  });

  it("registers the terrace v4 master with its own editable interaction routes", () => {
    const draft = createInitialEditorDraft("terrace-greenery");
    const profile = getEditorSceneProfile("terrace-greenery");

    expect(profile.masterSrc).toBe(
      "/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-paper-diorama-formal-v4-lossless.webp",
    );
    expect(profile.canvas).toEqual({ width: 1774, height: 887 });
    expect(profile.foregroundLayers).toEqual([]);
    expect(Object.keys(draft.routes)).toEqual([
      "entry-to-bench",
      "bench-to-entry",
      "entry-to-turtle-pond",
      "turtle-pond-to-entry",
      "entry-to-telescope",
      "telescope-to-entry",
    ]);
    expect(draft.pointsById).toHaveProperty("terrace-bench");
    expect(draft.pointsById).toHaveProperty("turtle-pond");
    expect(draft.pointsById).toHaveProperty("terrace-telescope");
    expect(draft.routes).not.toHaveProperty("entry-to-counter");
    expect(draft.routes).not.toHaveProperty("seat-to-door");
  });

  it("registers the new attic v2 master with independent editable routes", () => {
    const draft = createInitialEditorDraft("attic");
    const profile = getEditorSceneProfile("attic");

    expect(profile.masterSrc).toBe("/assets/ecology/formal-scenes/attic/masters/attic-scene-master-v2.webp");
    expect(profile.canvas).toEqual({ width: 1774, height: 887 });
    expect(draft.routes).toEqual({
      "stair-to-archive": ["attic-stair-entry", "archive-shelf"],
      "archive-to-stair": ["archive-shelf", "attic-stair-entry"],
      "stair-to-draft-desk": ["attic-stair-entry", "attic-draft-desk"],
      "draft-desk-to-stair": ["attic-draft-desk", "attic-stair-entry"],
    });
    expect(profile.description).toContain("阁楼");
  });

  it("migrates an older dining draft into the explicit counter-to-table asset handoff", () => {
    const initial = createInitialEditorDraft("dining-kitchen");
    const legacyRouteMeta = { ...initial.routeMeta!["counter-to-table"]! };
    delete legacyRouteMeta.transitions;
    delete legacyRouteMeta.assetLibrary;
    const legacyDraft: EditorDraft = {
      ...initial,
      routeMeta: {
        ...initial.routeMeta,
        "counter-to-table": legacyRouteMeta,
      },
    };
    const normalized = normalizeEditorDraft(legacyDraft);
    expect(normalized?.routeMeta?.["counter-to-table"]?.assetLibrary?.states?.["carry-bowl"]?.right).toContain(
      "carry-bowl-transparent-actor-v1.png",
    );
    expect(normalized?.routeMeta?.["counter-to-table"]?.transitions).toHaveLength(2);
  });

  it("repairs a stale cached empty-bowl asset without touching route geometry or custom events", () => {
    const initial = createInitialEditorDraft("dining-kitchen");
    const initialRoute = initial.routeMeta!["table-to-counter"]!;
    const v2Source = initialRoute.transitions?.find((transition) => transition.pointId === "meal-table")?.toAssetSource;
    expect(v2Source).toContain("carry-empty-bowl-transparent-actor-v2.webp");
    const staleSource = v2Source!.replace("-v2.webp", "-v1.webp");
    const customFacing = {
      pointId: "table-counter-1",
      kind: "facing" as const,
      facing: "right" as const,
      animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
    };
    const staleMeta = {
      ...initialRoute,
      assetLibrary: {
        ...initialRoute.assetLibrary,
        states: {
          "carry-bowl-return": { left: staleSource, right: staleSource },
        },
      },
      transitions: [
        ...(initialRoute.transitions ?? []).map((transition) => transition.pointId === "meal-table"
          ? { ...transition, toAssetSource: staleSource }
          : transition),
        customFacing,
      ],
    };
    const legacyDraft: EditorDraft = {
      ...initial,
      routeMeta: {
        ...initial.routeMeta,
        "table-to-counter": staleMeta,
      },
    };

    const normalized = normalizeEditorDraft(legacyDraft);
    const normalizedMeta = normalized?.routeMeta?.["table-to-counter"];
    expect(normalizedMeta?.assetLibrary?.states?.["carry-bowl-return"]?.left).toContain(
      "carry-empty-bowl-transparent-actor-v2.webp",
    );
    expect(normalizedMeta?.transitions?.find((transition) => (
      transition.kind === "state" && transition.targetStateId === "carry-bowl-return"
    ))?.toAssetSource).toContain(
      "carry-empty-bowl-transparent-actor-v2.webp",
    );
    expect(normalizedMeta?.transitions).toEqual(expect.arrayContaining([expect.objectContaining(customFacing)]));
    expect(normalized?.routes["table-to-counter"]?.map((pointId) => normalized.pointsById[pointId]?.point)).toEqual(
      initial.routes["table-to-counter"]?.map((pointId) => initial.pointsById[pointId]?.point),
    );
    const normalizedCustomFacing = normalizedMeta?.transitions?.find((transition) => (
      transition.kind === "facing" && transition.facing === "right"
    ));
    expect(normalizedCustomFacing && normalized?.pointsById[normalizedCustomFacing.pointId]?.point).toEqual(
      initial.pointsById["table-counter-1"]?.point,
    );
  });

  it("rebuilds dining start/end state events after route-local endpoint cloning", () => {
    const initial = createInitialEditorDraft("dining-kitchen");
    const alreadyNormalized = normalizeEditorDraft(initial)!;
    const formalRouteKeys = new Set([
      "entry-to-counter",
      "counter-to-entry",
      "counter-to-table",
      "table-to-counter",
      "entry-to-table",
      "table-to-entry",
    ]);
    const staleDraft: EditorDraft = {
      ...alreadyNormalized,
      routeMeta: Object.fromEntries(Object.entries(alreadyNormalized.routeMeta ?? {}).map(([routeKey, meta]) => [
        routeKey,
        formalRouteKeys.has(routeKey) ? { ...meta, transitions: [] } : meta,
      ])),
    };
    const repaired = normalizeEditorDraft(staleDraft)!;
    const expectedStates: Record<string, string[]> = {
      "entry-to-counter": ["serve-red-bean-soup"],
      "counter-to-entry": ["leaving-kitchen", "gone"],
      "counter-to-table": ["carry-bowl", "meal-table"],
      "table-to-counter": ["carry-bowl-return", "serve-red-bean-soup"],
      "entry-to-table": ["meal-table"],
      "table-to-entry": ["leaving-kitchen", "gone"],
    };

    for (const [routeKey, stateIds] of Object.entries(expectedStates)) {
      const routeIds = repaired.routes[routeKey]!;
      const stateEvents = (repaired.routeMeta?.[routeKey]?.transitions ?? [])
        .filter((transition) => transition.kind === "state");
      expect(stateEvents.map((transition) => transition.targetStateId), routeKey).toEqual(stateIds);
      expect(stateEvents.map((transition) => transition.pointId)).toEqual(
        stateIds.length === 1 ? [routeIds.at(-1)] : [routeIds[0], routeIds.at(-1)],
      );
    }
  });

  it("shares only semantic anchors and gives every route its own waypoint geometry", () => {
    const draft = createInitialEditorDraft();
    const routeKeys = [
      "seat-to-door",
      "door-to-seat",
      "seat-to-kitchen",
      "kitchen-to-seat",
      "door-to-kitchen",
      "kitchen-to-door",
    ] as const;

    expect(draft.routes["seat-to-kitchen"]).toEqual([
      "seat-right",
      "seat-kitchen-1",
      "seat-kitchen-2",
      "seat-kitchen-3",
    ]);
    expect(draft.routes["kitchen-to-seat"]).toEqual([
      "kitchen-seat-1",
      "kitchen-seat-2",
      "kitchen-seat-3",
      "seat-right",
    ]);
    expect(draft.routes["seat-to-door"]![0]).toBe("seat-right");
    expect(draft.routes["seat-to-door"]!.at(-1)).toBe("door");
    expect(draft.routes["door-to-seat"]![0]).toBe("door");
    expect(draft.routes["door-to-seat"]!.at(-1)).toBe("seat-left");

    for (let leftIndex = 0; leftIndex < routeKeys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < routeKeys.length; rightIndex += 1) {
        const left = routeKeys[leftIndex]!;
        const right = routeKeys[rightIndex]!;
        const sharedWaypointIds = (draft.routes[left] ?? []).filter((pointId) => (
          draft.pointsById[pointId]?.role === "waypoint" && (draft.routes[right] ?? []).includes(pointId)
        ));
        expect(sharedWaypointIds).toEqual([]);
      }
    }

    expect(Object.values(draft.pointsById).filter((point) => point.role === "door").map((point) => point.id)).toEqual(["door"]);
    expect(editorRouteMeta(draft, "door-to-kitchen").facingSwitchAfterPointId).toBe("door-kitchen-2");
    expect(editorRouteMeta(draft, "kitchen-to-door").facingSwitchAfterPointId).toBe("kitchen-door-4");
  });

  it("uses the same depth curve for every fixed-view route", () => {
    const draft = createInitialEditorDraft();
    expect(depthScaleAtY(draft.scale.farY, draft.scale)).toBeCloseTo(draft.scale.farScale);
    expect(depthScaleAtY(draft.scale.nearY, draft.scale)).toBeCloseTo(draft.scale.nearScale);
    expect(depthScaleAtY((draft.scale.farY + draft.scale.nearY) / 2, draft.scale)).toBeCloseTo(1.145);
  });

  it("interpolates actor position and scale along a route", () => {
    const draft = createInitialEditorDraft();
    const start = routeSampleAtProgress(draft.routes["seat-to-door"]!, draft.pointsById, draft.scale, 0);
    const end = routeSampleAtProgress(draft.routes["seat-to-door"]!, draft.pointsById, draft.scale, 1);

    expect(start.pointId).toBe("seat-right");
    expect(end.pointId).toBe("door");
    expect(start.point[1]).toBeGreaterThan(end.point[1]);
    expect(start.scale).toBeGreaterThan(end.scale);
  });

  it("assigns terminal smoke states from study route endpoint semantics", () => {
    const draft = createInitialEditorDraft();
    const arrival = editorRouteTransitions(
      draft.routes["door-to-seat"]!,
      draft.pointsById,
      draft.routeMeta!["door-to-seat"]!,
    );
    const departure = editorRouteTransitions(
      draft.routes["seat-to-door"]!,
      draft.pointsById,
      draft.routeMeta!["seat-to-door"]!,
    );

    expect(arrival.at(-1)).toMatchObject({
      pointId: "seat-left",
      kind: "state",
      targetStateId: "writing-seat",
      toAssetMode: "scene",
      animation: { style: "smoke", turns: 2 },
    });
    expect(arrival[0]).toMatchObject({
      pointId: "door",
      kind: "state",
      targetStateId: "walking",
      fromAssetMode: "none",
      toAssetMode: "actor",
      animation: { style: "smoke", durationMs: 100, settleMs: 100 },
    });
    expect(departure.at(-1)).toMatchObject({
      pointId: "door",
      kind: "state",
      targetStateId: "gone",
      fromAssetMode: "actor",
      toAssetMode: "none",
      animation: { style: "smoke", turns: 2 },
    });
  });

  it("applies the terminal contract to every built-in study route", () => {
    const draft = createInitialEditorDraft();

    for (const [routeKey, routeIds] of Object.entries(draft.routes)) {
      const endPointId = routeIds.at(-1)!;
      const endPoint = draft.pointsById[endPointId]!;
      const terminal = editorRouteTransitions(
        routeIds,
        draft.pointsById,
        editorRouteMeta(draft, routeKey),
      ).find((transition) => transition.kind === "state" && transition.pointId === endPointId);

      expect(terminal, `${routeKey} must define a terminal state`).toBeDefined();
      expect(terminal).toMatchObject({
        animation: { style: "smoke", turns: 2 },
      });
      if (endPoint.role === "seat-left" || endPoint.role === "seat-right") {
        expect(terminal).toMatchObject({
          targetStateId: "writing-seat",
          toAssetMode: "scene",
        });
      } else {
        expect(terminal).toMatchObject({
          targetStateId: "gone",
          fromAssetMode: "actor",
          toAssetMode: "none",
        });
      }
    }

    const doorArrivalTransitions = editorRouteTransitions(
      draft.routes["door-to-seat"]!,
      draft.pointsById,
      draft.routeMeta!["door-to-seat"]!,
    );
    expect(doorArrivalTransitions.some((transition) => (
      transition.kind === "state" && transition.pointId === draft.routes["door-to-seat"]![0]
    ))).toBe(true);
  });

  it("classifies study points as scene interactions, scene boundaries, or movement nodes", () => {
    const draft = createInitialEditorDraft();
    const doorToSeat = draft.routes["door-to-seat"]!;
    const doorToSeatMeta = editorRouteMeta(draft, "door-to-seat");
    expect(studyEndpointContractKind(
      "door-to-seat",
      doorToSeatMeta,
      draft.pointsById[doorToSeat[0]!],
      "start",
    )).toBe("scene-boundary");
    expect(studyEndpointContractKind(
      "door-to-seat",
      doorToSeatMeta,
      draft.pointsById[doorToSeat[1]!],
      "middle",
    )).toBe("route-waypoint");
    expect(studyEndpointContractKind(
      "door-to-seat",
      doorToSeatMeta,
      draft.pointsById[doorToSeat.at(-1)!],
      "end",
    )).toBe("scene-interaction");

    const seatToKitchen = draft.routes["seat-to-kitchen"]!;
    expect(studyEndpointContractKind(
      "seat-to-kitchen",
      editorRouteMeta(draft, "seat-to-kitchen"),
      draft.pointsById[seatToKitchen.at(-1)!],
      "end",
    )).toBe("scene-boundary");
  });

  it("repairs the terminal departure while preserving an authored midpoint state", () => {
    const draft = createInitialEditorDraft();
    const legacyDraft: EditorDraft = {
      ...draft,
      routeMeta: {
        ...draft.routeMeta,
        "seat-to-door": {
          ...draft.routeMeta!["seat-to-door"]!,
          transitions: [{
            pointId: "out-5",
            kind: "state",
            targetStateId: "leaving-study",
            toAssetMode: "none",
            animation: {
              style: "spin",
              turns: 1,
              durationMs: 360,
              settleMs: 160,
              easing: "elastic",
            },
          }],
        },
      },
    };

    const repaired = normalizeStudyEditorDraft(legacyDraft)!;
    const transitions = editorRouteTransitions(
      repaired.routes["seat-to-door"]!,
      repaired.pointsById,
      repaired.routeMeta!["seat-to-door"]!,
    );
    expect(transitions.filter((transition) => transition.kind === "state")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pointId: "out-5",
        targetStateId: "leaving-study",
        toAssetMode: "none",
      }),
      expect.objectContaining({
        pointId: "door",
        targetStateId: "gone",
        fromAssetMode: "actor",
        toAssetMode: "none",
        animation: expect.objectContaining({ style: "smoke" }),
      }),
    ]));
  });

  it("exports pixel and normalized coordinates with explicit anchor and turn semantics", () => {
    const exported = serializeEditorDraft(createInitialEditorDraft());

    expect(exported.anchorSemantics).toMatchObject({
      door: "one shared door node used by both directions",
      seatLeft: "seat-left is the door-to-seat approach / sit-down point",
      seatRight: "seat-right is the seat-to-door release / departure point",
    });
    expect(exported.points.find((point) => point.id === "door")).toMatchObject({ pixel: [1392, 419] });
    expect(exported.points.find((point) => point.id === "seat-left")).toMatchObject({ pixel: [804, 557] });
    expect(exported.routeMeta["door-to-kitchen"]).toMatchObject({ facingSwitchAfterPointId: "door-kitchen-2" });
    expect(exported.routeMeta["kitchen-to-door"]).toMatchObject({ facingSwitchAfterPointId: "kitchen-door-4" });
  });

  it("keeps movable shared anchors shared while route events remain route-local", () => {
    const initial = createInitialEditorDraft();
    const moved = {
      ...initial,
      pointsById: {
        ...initial.pointsById,
        door: { ...initial.pointsById.door!, point: [1408, 431] as [number, number] },
      },
      routeMeta: {
        ...initial.routeMeta,
        "door-to-seat": {
          ...initial.routeMeta!["door-to-seat"]!,
          transitions: [{
            pointId: "in-6",
            kind: "facing" as const,
            facing: "right" as const,
            animation: { style: "mirror" as const, turns: 1, durationMs: 360, settleMs: 180, easing: "elastic" as const },
          }],
        },
        "seat-to-door": {
          ...initial.routeMeta!["seat-to-door"]!,
          transitions: [{
            pointId: "seat-right",
            kind: "state" as const,
            targetStateId: "sit-down",
            animation: { style: "spin" as const, turns: 3, durationMs: 540, settleMs: 640, easing: "elastic" as const },
          }],
        },
      },
    };

    expect(moved.pointsById.door?.point).toEqual([1408, 431]);
    expect(moved.routes["seat-to-door"]?.at(-1)).toBe("door");
    expect(moved.routes["door-to-seat"]?.[0]).toBe("door");
    expect(editorRouteTransitions(moved.routes["door-to-seat"]!, moved.pointsById, moved.routeMeta!["door-to-seat"]!)).toMatchObject([
      { pointId: "in-6", kind: "facing", animation: { style: "mirror", settleMs: 180 } },
    ]);
    expect(editorRouteTransitions(moved.routes["seat-to-door"]!, moved.pointsById, moved.routeMeta!["seat-to-door"]!)).toMatchObject([
      { pointId: "seat-right", kind: "state", targetStateId: "sit-down", animation: { turns: 3 } },
    ]);
    expect(editorRouteTransitions(moved.routes["seat-to-door"]!, moved.pointsById, moved.routeMeta!["seat-to-door"]!)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ pointId: "in-6" })]),
    );

    const exported = serializeEditorDraft(moved);
    expect(exported.points.find((point) => point.id === "door")).toMatchObject({ pixel: [1408, 431] });
    expect(exported.routeMeta["seat-to-door"]?.transitions).toMatchObject([
      { pointId: "seat-right", kind: "state", targetStateId: "sit-down", animation: { style: "spin", turns: 3 } },
    ]);
  });

  it("round-trips multi-turn animation parameters and drops events outside their route", () => {
    const initial = createInitialEditorDraft();
    const multiTurn: EditorDraft = {
      ...initial,
      routeMeta: {
        ...initial.routeMeta!,
        "seat-to-door": {
          ...initial.routeMeta!["seat-to-door"]!,
          transitions: [{
            pointId: "out-2",
            kind: "state" as const,
            targetStateId: "writing",
            animation: { style: "spin" as const, turns: 3, durationMs: 720, settleMs: 880, easing: "elastic" as const },
          }],
          assetLibrary: {
            left: "/assets/ecology/characters/novelist/custom-left.webp",
            states: { writing: { right: "/assets/ecology/characters/novelist/custom-writing-right.webp" } },
          },
        },
      },
    };
    const imported = deserializeEditorDraft(serializeEditorDraft(multiTurn));

    expect(imported?.routeMeta?.["seat-to-door"]?.transitions?.find((transition) => (
      transition.pointId === "out-2"
    ))).toMatchObject(
      { pointId: "out-2", targetStateId: "writing", animation: { turns: 3, durationMs: 720, settleMs: 880 } },
    );
    expect(imported?.routeMeta?.["seat-to-door"]?.assetLibrary).toMatchObject({
      left: "/assets/ecology/characters/novelist/custom-left.webp",
      states: { writing: { right: "/assets/ecology/characters/novelist/custom-writing-right.webp" } },
    });
    expect(routeStateAtProgress(
      imported!.routes["seat-to-door"]!,
      imported!.pointsById,
      imported!.routeMeta!["seat-to-door"]!,
      routeProgressAtPoint(imported!.routes["seat-to-door"]!, imported!.pointsById, "out-2"),
    )).toBe("writing");

    const invalidRouteEventPayload = serializeEditorDraft(multiTurn);
    const invalidRouteMeta = invalidRouteEventPayload.routeMeta["seat-to-door"]!;
    invalidRouteEventPayload.routeMeta["seat-to-door"] = {
      ...invalidRouteMeta,
      id: invalidRouteMeta.id,
      label: invalidRouteMeta.label,
      kind: invalidRouteMeta.kind,
      accent: invalidRouteMeta.accent,
      transitions: [{
        pointId: "not-in-seat-to-door",
        kind: "state",
        targetStateId: "invalid",
        animation: { style: "spin", turns: 99, durationMs: 720, settleMs: 880, easing: "elastic" },
      }],
    };
    const normalized = deserializeEditorDraft(invalidRouteEventPayload);
    expect(normalized?.routeMeta?.["seat-to-door"]?.transitions?.filter((transition) => (
      transition.pointId !== "door"
    ))).toEqual([]);

    expect(normalizeEditorRouteTransitions(
      ["seat-right", "out-1"],
      initial.pointsById,
      [{ pointId: "out-2", kind: "state", animation: { style: "spin", turns: 2, durationMs: 400, settleMs: 200, easing: "smooth" } }],
    )).toEqual([]);
  });

  it("replaces the legacy kitchen arrow with two independent seat↔kitchen walks", () => {
    const base = createInitialEditorDraft();
    const legacy = {
      ...base,
      pointsById: {
        ...base.pointsById,
        "legacy-kitchen-start": { id: "legacy-kitchen-start", label: "厨房箭头起点", role: "waypoint" as const, point: [998, 665] as [number, number] },
        "legacy-kitchen-node": { id: "legacy-kitchen-node", label: "厨房箭头中间节点", role: "waypoint" as const, point: [1346, 667] as [number, number] },
        "legacy-kitchen-end": { id: "legacy-kitchen-end", label: "厨房箭头终点", role: "waypoint" as const, point: [1672, 783] as [number, number] },
      },
      routes: {
        "seat-to-door": base.routes["seat-to-door"]!,
        "door-to-seat": base.routes["door-to-seat"]!,
        kitchen: ["legacy-kitchen-start", "legacy-kitchen-node", "legacy-kitchen-end"],
      },
      routeMeta: {
        "seat-to-door": base.routeMeta?.["seat-to-door"],
        "door-to-seat": base.routeMeta?.["door-to-seat"],
        kitchen: { id: "kitchen", label: "厨房方向箭头", kind: "arrow" as const, accent: "amber" as const },
      },
    };
    const imported = deserializeEditorDraft(serializeEditorDraft(legacy as typeof base));

    expect(imported).not.toBeNull();
    expect(Object.keys(imported!.routes)).toEqual([
      "seat-to-door",
      "door-to-seat",
      "seat-to-kitchen",
      "kitchen-to-seat",
      "door-to-kitchen",
      "kitchen-to-door",
    ]);
    expect(imported!.routes.kitchen).toBeUndefined();
    expect(imported!.routes["seat-to-kitchen"]![0]).toBe("seat-right");
    expect(imported!.pointsById[imported!.routes["seat-to-kitchen"]!.at(-1)!]?.point).toEqual([1672, 783]);
    expect(imported!.routes["kitchen-to-seat"]!.at(-1)).toBe("seat-right");
    expect(imported!.pointsById[imported!.routes["door-to-kitchen"]![1]!]?.point).toEqual([1335, 456]);
    expect(imported!.pointsById[imported!.routeMeta!["door-to-kitchen"]!.facingSwitchAfterPointId!]?.point).toEqual([1323, 538]);

    const routeKeys = Object.keys(imported!.routes);
    for (let leftIndex = 0; leftIndex < routeKeys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < routeKeys.length; rightIndex += 1) {
        const left = routeKeys[leftIndex]!;
        const right = routeKeys[rightIndex]!;
        expect((imported!.routes[left] ?? []).filter((pointId) => (
          imported!.pointsById[pointId]?.role === "waypoint" && (imported!.routes[right] ?? []).includes(pointId)
        ))).toEqual([]);
      }
    }
  });

  it("isolates a shared waypoint before any route can mutate it", () => {
    const base = createInitialEditorDraft();
    const shared = {
      ...base,
      pointsById: {
        ...base.pointsById,
        "shared-node": { id: "shared-node", label: "共享测试节点", role: "waypoint" as const, point: [1200, 650] as [number, number] },
      },
      routes: {
        ...base.routes,
        "custom-a": ["seat-right", "shared-node", "door"],
        "custom-b": ["door", "shared-node", "seat-left"],
      },
      routeMeta: {
        ...base.routeMeta,
        "custom-a": { id: "custom-a", label: "自定义 A", kind: "walk" as const, accent: "violet" as const },
        "custom-b": { id: "custom-b", label: "自定义 B", kind: "walk" as const, accent: "violet" as const },
      },
    };
    const normalized = normalizeStudyEditorDraft(shared)!;
    const firstId = normalized.routes["custom-a"]![1]!;
    const secondId = normalized.routes["custom-b"]![1]!;

    expect(firstId).not.toBe(secondId);
    expect(normalized.pointsById[firstId]?.point).toEqual([1200, 650]);
    expect(normalized.pointsById[secondId]?.point).toEqual([1200, 650]);
  });

  it("supports custom routes and import/export round trips without reviving the arrow route", () => {
    const draft = createInitialEditorDraft();
    const custom = {
      ...draft,
      routes: { ...draft.routes, "custom-1": ["seat-right", "out-1", "door"] },
      routeMeta: {
        ...draft.routeMeta,
        "custom-1": { id: "custom-1", label: "测试折线路线", kind: "walk" as const, accent: "violet" as const },
      },
    };
    const imported = deserializeEditorDraft(serializeEditorDraft(custom));

    expect(imported).not.toBeNull();
    expect(imported!.routes["custom-1"]!).toHaveLength(3);
    expect(imported!.routes.kitchen).toBeUndefined();
    expect(routeProgressAtPoint(draft.routes["door-to-seat"]!, draft.pointsById, "in-6")).toBeGreaterThan(0);
  });

  it("keeps route playback time proportional to geometric length", () => {
    const draft = createInitialEditorDraft();
    const shortRoute = ["seat-right", "out-1"];
    const longRoute = ["seat-right", "out-1", "out-2", "out-3", "out-4"];

    expect(routeLengthPx(shortRoute, draft.pointsById)).toBeGreaterThan(0);
    expect(routeLengthPx(longRoute, draft.pointsById)).toBeGreaterThan(routeLengthPx(shortRoute, draft.pointsById));
    expect(routePlaybackDurationMs(longRoute, draft.pointsById, 2))
      .toBeGreaterThan(routePlaybackDurationMs(shortRoute, draft.pointsById, 2));
    expect(Math.abs(
      routePlaybackDurationMs(shortRoute, draft.pointsById, 2)
        - routePlaybackDurationMs(shortRoute, draft.pointsById, 1) / 2,
    )).toBeLessThanOrEqual(1);
  });

  it("turns a misplaced desk arrival into attic-entry smoke plus terminal writing state", () => {
    const base = createInitialEditorDraft();
    const route = ["attic-entry", "attic-desk"];
    const draft: EditorDraft = {
      ...base,
      pointsById: {
        ...base.pointsById,
        "attic-entry": { id: "attic-entry", label: "阁楼入口", role: "waypoint", point: [1120, 380] },
        // Old drafts stored copied semantic endpoints as ordinary waypoints.
        "attic-desk": { id: "attic-desk", label: "阁楼 → 书桌 · 座位右侧", role: "waypoint", point: [...base.pointsById["seat-right"]!.point] },
      },
      routes: { ...base.routes, "attic-to-desk": route },
      routeMeta: {
        ...base.routeMeta,
        "attic-to-desk": {
          id: "attic-to-desk",
          label: "阁楼 → 书桌",
          kind: "walk",
          accent: "violet",
          transitions: [{
            pointId: "attic-entry",
            kind: "state",
            targetStateId: "writing-seat",
            toAssetSource: STUDY_WRITING_SCENE_STATE_SRC,
            toAssetMode: "scene",
            animation: { style: "smoke", turns: 2, durationMs: 300, settleMs: 120, easing: "smooth" },
          }],
        },
      },
    };

    const normalized = normalizeStudyEditorDraft(draft)!;
    const transitions = normalized.routeMeta?.["attic-to-desk"]?.transitions ?? [];
    const entry = transitions.find((transition) => transition.pointId === "attic-entry");
    const arrival = transitions.find((transition) => transition.pointId === "attic-desk");

    expect(normalized.pointsById["attic-desk"]?.semanticRole).toBe("seat-right");
    expect(entry).toMatchObject({
      kind: "state",
      targetStateId: "walking",
      fromAssetMode: "none",
      toAssetMode: "actor",
      animation: { style: "smoke", turns: 1, durationMs: 100, settleMs: 100 },
    });
    expect(transitions.filter((transition) => transition.kind === "state" && transition.pointId === "attic-entry")).toHaveLength(1);
    expect(arrival).toMatchObject({
      kind: "state",
      targetStateId: "writing-seat",
      toAssetSource: STUDY_WRITING_SCENE_STATE_SRC,
      toAssetMode: "scene",
    });
    expect(routeStateAtProgress(route, normalized.pointsById, normalized.routeMeta!["attic-to-desk"]!, 0.1)).not.toBe("writing-seat");
    expect(routeStateAtProgress(route, normalized.pointsById, normalized.routeMeta!["attic-to-desk"]!, 1)).toBe("writing-seat");
  });

  it("recognizes an attic-to-study route by its route key when an old draft has no semantic endpoint", () => {
    const base = createInitialEditorDraft();
    const route = ["attic-entry-2", "attic-study-2"];
    const draft: EditorDraft = {
      ...base,
      pointsById: {
        ...base.pointsById,
        "attic-entry-2": { id: "attic-entry-2", label: "入口", role: "waypoint", point: [1120, 380] },
        "attic-study-2": { id: "attic-study-2", label: "终点", role: "waypoint", point: [850, 580] },
      },
      routes: { ...base.routes, "attic-to-study": route },
      routeMeta: {
        ...base.routeMeta,
        "attic-to-study": {
          id: "attic-to-study",
          label: "新路线",
          kind: "walk",
          accent: "violet",
          transitions: [{
            pointId: "attic-entry-2",
            kind: "state",
            targetStateId: "writing-seat",
            toAssetSource: STUDY_WRITING_SCENE_STATE_SRC,
            toAssetMode: "scene",
            animation: { style: "smoke", turns: 2, durationMs: 300, settleMs: 120, easing: "smooth" },
          }],
        },
      },
    };

    const normalized = normalizeStudyEditorDraft(draft)!;
    const transitions = normalized.routeMeta!["attic-to-study"]!.transitions ?? [];
    expect(transitions.find((transition) => transition.pointId === "attic-entry-2" && transition.kind === "state")).toMatchObject({
      targetStateId: "walking",
      toAssetMode: "actor",
      fromAssetMode: "none",
      animation: { style: "smoke", turns: 1, durationMs: 100, settleMs: 100 },
    });
    expect(transitions.find((transition) => transition.pointId === "attic-study-2" && transition.kind === "state")).toMatchObject({
      targetStateId: "writing-seat",
      toAssetMode: "scene",
    });
  });

  it("does not treat the reverse study-to-attic route as a desk arrival", () => {
    const base = createInitialEditorDraft();
    const route = ["study-entry-2", "attic-exit-2"];
    const draft: EditorDraft = {
      ...base,
      pointsById: {
        ...base.pointsById,
        "study-entry-2": { id: "study-entry-2", label: "书桌出口", role: "waypoint", point: [850, 580] },
        "attic-exit-2": { id: "attic-exit-2", label: "阁楼入口", role: "waypoint", point: [1120, 380] },
      },
      routes: { ...base.routes, "study-to-attic": route },
      routeMeta: {
        ...base.routeMeta,
        "study-to-attic": {
          id: "study-to-attic",
          label: "书房 → 阁楼",
          kind: "walk",
          accent: "violet",
          transitions: [{
            pointId: "study-entry-2",
            kind: "state",
            targetStateId: "writing-seat",
            toAssetSource: STUDY_WRITING_SCENE_STATE_SRC,
            toAssetMode: "scene",
            animation: { style: "smoke", turns: 2, durationMs: 300, settleMs: 120, easing: "smooth" },
          }],
        },
      },
    };

    const normalized = normalizeStudyEditorDraft(draft)!;
    const transitions = normalized.routeMeta!["study-to-attic"]!.transitions ?? [];

    expect(transitions.find((transition) => transition.pointId === "study-entry-2" && transition.kind === "state")).toMatchObject({
      targetStateId: "walking",
      fromAssetMode: "none",
      toAssetMode: "actor",
    });
    expect(transitions.find((transition) => transition.pointId === "attic-exit-2" && transition.kind === "state")).toMatchObject({
      targetStateId: "gone",
      fromAssetMode: "actor",
      toAssetMode: "none",
    });
    expect(transitions.find((transition) => transition.targetStateId === "writing-seat")).toBeUndefined();
  });

  it("removes legacy per-image sizing from every attic state", () => {
    const base = createInitialEditorDraft("attic");
    const routeKey = "stair-to-archive";
    const routeMeta = base.routeMeta?.[routeKey]!;
    const draft: EditorDraft = {
      ...base,
      routeMeta: {
        ...base.routeMeta,
        [routeKey]: {
          ...routeMeta,
          assetLibrary: {
            ...routeMeta.assetLibrary,
            states: {
              ...(routeMeta.assetLibrary?.states ?? {}),
              "legacy-reading-card": {
                left: ATTIC_READING_ACTOR_ASSET_SRC,
                right: ATTIC_READING_ACTOR_ASSET_SRC,
                scale: 2.79,
                alphaBottom: 0.41,
              },
              "attic-retrieve-archive": {
                ...routeMeta.assetLibrary?.states?.["attic-retrieve-archive"],
                scale: 2.73,
                alphaBottom: 0.36,
              },
            },
          },
        },
      },
    };

    const normalized = normalizeEditorDraft(draft)!;
    const states = Object.values(normalized.routeMeta?.[routeKey]?.assetLibrary?.states ?? {});

    expect(states).not.toHaveLength(0);
    expect(states.every((state) => state.scale === undefined && state.alphaBottom === undefined)).toBe(true);
    expect(normalized.routeMeta?.[routeKey]?.assetLibrary?.states?.["legacy-reading-card"]?.left)
      .toBe(ATTIC_READING_ACTOR_ASSET_SRC);
  });

  it("detaches legacy custom route endpoints without changing built-in shared anchors", () => {
    const base = createInitialEditorDraft();
    const legacyCustom: EditorDraft = {
      ...base,
      routes: {
        ...base.routes,
        "custom-4": ["seat-right", "out-2", "door"],
      },
      routeMeta: {
        ...base.routeMeta,
        "custom-4": { id: "custom-4", label: "阁楼 → 书桌", kind: "walk", accent: "violet" },
      },
    };

    const normalized = isolateCustomRouteEndpoints(legacyCustom);
    const customRoute = normalized.routes["custom-4"]!;

    expect(customRoute[0]).not.toBe("seat-right");
    expect(customRoute.at(-1)).not.toBe("door");
    expect(normalized.pointsById[customRoute[0]!]?.role).toBe("waypoint");
    expect(normalized.pointsById[customRoute.at(-1)!]?.role).toBe("waypoint");
    expect(normalized.pointsById[customRoute[0]!]?.point).toEqual(base.pointsById["seat-right"]?.point);
    expect(normalized.pointsById[customRoute.at(-1)!]?.point).toEqual(base.pointsById.door?.point);
    expect(normalized.routes["seat-to-door"]?.[0]).toBe("seat-right");
    expect(normalized.routes["seat-to-door"]?.at(-1)).toBe("door");
    expect(normalized.routeMeta?.["custom-4"]?.label).toBe("阁楼 → 书桌");
  });

  it("keeps bedroom editing on its own 2:1 reference canvas and storage-ready schema", () => {
    const draft = createInitialEditorDraft("bedroom");
    const profile = getEditorSceneProfile("bedroom");
    const exported = serializeEditorDraft(draft);

    expect(draft.sceneId).toBe("bedroom");
    expect(draft.canvas).toEqual({ width: 1774, height: 887 });
    expect(profile.masterSrc).toContain("bedroom-scene-master-2x1-formal-v1.webp");
    expect(profile.floorStatus).toBe("pending");
    expect(profile.foregroundSrc).toContain("bedroom-bed-occluder-aligned-v1.webp");
    expect(Object.keys(draft.routes)).toEqual([
      "door-to-bed",
      "bed-to-door",
      "door-to-lounge",
      "lounge-to-door",
      "bed-to-lounge",
      "lounge-to-bed",
    ]);
    expect(draft.routes["door-to-bed"]?.at(-1)).toBe("bed-edge");
    expect(draft.routes["bed-to-door"]?.at(-1)).toBe("bedroom-door");
    expect(draft.routes["door-to-lounge"]?.at(-1)).toBe("lounge-corner");
    expect(draft.routes["door-to-lounge"]).toEqual([
      "bedroom-door",
      "bedroom-door-to-lounge-1",
      "bedroom-door-to-lounge-2",
      "lounge-corner",
    ]);
    expect(draft.routeMeta?.["door-to-lounge"]?.facingSwitchAfterPointId).toBe("bedroom-door-to-lounge-2");
    const doorToLounge = draft.routes["door-to-lounge"]!;
    const doorToLoungeMeta = editorRouteMeta(draft, "door-to-lounge");
    const doorToLoungeTurn = routeProgressAtPoint(doorToLounge, draft.pointsById, "bedroom-door-to-lounge-2");
    expect(routeFacingAtProgress(doorToLounge, draft.pointsById, doorToLoungeMeta, Math.max(0, doorToLoungeTurn - 0.001))).toBe("left");
    expect(routeFacingAtProgress(doorToLounge, draft.pointsById, doorToLoungeMeta, doorToLoungeTurn)).toBe("right");
    expect(draft.routes["lounge-to-door"]?.at(-1)).toBe("bedroom-door");
    expect(draft.routes["bed-to-lounge"]?.at(-1)).toBe("lounge-corner");
    expect(draft.routes["lounge-to-bed"]?.at(-1)).toBe("bed-edge");
    expect(draft.pointsById["bedroom-door"]?.point).toEqual([1182, 455]);
    expect(draft.pointsById["bed-edge"]?.point).toEqual([868, 357]);
    expect(draft.pointsById["lounge-corner"]?.point).toEqual([1075, 579]);
    expect(draft.routeMeta?.["door-to-bed"]?.foregroundPolicy).toBe("always");
    expect(draft.routeMeta?.["lounge-to-bed"]?.foregroundPolicy).toBe("always");
    expect(Object.values(draft.pointsById).filter((point) => point.role !== "waypoint").map((point) => point.id)).toEqual([
      "bedroom-door",
      "bed-edge",
      "lounge-corner",
    ]);
    const bedroomRouteKeys = Object.keys(draft.routes);
    for (let leftIndex = 0; leftIndex < bedroomRouteKeys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bedroomRouteKeys.length; rightIndex += 1) {
        const left = bedroomRouteKeys[leftIndex]!;
        const right = bedroomRouteKeys[rightIndex]!;
        expect((draft.routes[left] ?? []).filter((pointId) => (
          draft.pointsById[pointId]?.role === "waypoint" && (draft.routes[right] ?? []).includes(pointId)
        ))).toEqual([]);
      }
    }
    expect(exported.schemaVersion).toBe("route-editor.v2");
    expect(exported.sceneId).toBe("bedroom");
    expect(exported.canvas).toEqual({ width: 1774, height: 887 });
    expect(exported.anchorSemantics.door).toContain("[1182, 455]");
    expect(exported.anchorSemantics.bedEdge).toContain("[868, 357]");
    expect(exported.anchorSemantics.lounge).toContain("[1075, 579]");
    expect(exported.foreground.source).toContain("bedroom-bed-occluder-aligned-v1.webp");
    expect(exported.foreground.sourceOfTruth).toBe("transparent-alpha");
    expect(exported.foreground.transition).toBeNull();
  });

  it("configures bedroom scene handoffs at route endpoints without changing route geometry", () => {
    const draft = createInitialEditorDraft("bedroom");
    const originalRoutes = JSON.parse(JSON.stringify(draft.routes));
    const originalPoints = JSON.parse(JSON.stringify(draft.pointsById));
    const transitionsFor = (routeKey: string) => editorRouteTransitions(
      draft.routes[routeKey]!,
      draft.pointsById,
      editorRouteMeta(draft, routeKey),
    );
    const stateTransitionsFor = (routeKey: string) => transitionsFor(routeKey)
      .filter((transition) => transition.kind === "state");

    expect(stateTransitionsFor("door-to-bed")).toEqual([
      expect.objectContaining({
        pointId: "bedroom-door",
        targetStateId: "walking",
        fromAssetMode: "none",
        toAssetSource: BEDROOM_WALK_LEFT_ACTOR_ASSET_SRC,
        toAssetMode: "actor",
        animation: expect.objectContaining({ style: "smoke" }),
      }),
      expect.objectContaining({
        pointId: "bed-edge",
        targetStateId: "bed-sleep",
        fromAssetSource: BEDROOM_WALK_LEFT_ACTOR_ASSET_SRC,
        fromAssetMode: "actor",
        toAssetSource: BEDROOM_BED_SCENE_ASSET_SRC,
        toAssetMode: "scene",
        animation: expect.objectContaining({ style: "smoke" }),
      }),
    ]);
    expect(stateTransitionsFor("bed-to-door")).toEqual([
      expect.objectContaining({
        pointId: "bed-edge",
        targetStateId: "walking",
        fromAssetSource: BEDROOM_BED_SCENE_ASSET_SRC,
        fromAssetMode: "scene",
        toAssetSource: BEDROOM_WALK_RIGHT_ACTOR_ASSET_SRC,
        toAssetMode: "actor",
      }),
      expect.objectContaining({
        pointId: "bedroom-door",
        targetStateId: "gone",
        fromAssetSource: BEDROOM_WALK_RIGHT_ACTOR_ASSET_SRC,
        fromAssetMode: "actor",
        toAssetMode: "none",
        animation: expect.objectContaining({ style: "smoke" }),
      }),
    ]);
    expect(stateTransitionsFor("door-to-lounge")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pointId: "lounge-corner",
        targetStateId: "lounge-seat",
        toAssetSource: BEDROOM_LOUNGE_SCENE_ASSET_SRC,
        toAssetMode: "scene",
      }),
    ]));
    expect(transitionsFor("door-to-lounge").some((transition) => (
      transition.kind === "facing" && transition.pointId === "bedroom-door-to-lounge-2"
    ))).toBe(true);

    expect(draft.routes).toEqual(originalRoutes);
    expect(draft.pointsById).toEqual(originalPoints);
    expect(Object.values(draft.routeMeta ?? {}).every((meta) => (
      (meta.transitions ?? []).filter((transition) => transition.kind === "state").length === 2
    ))).toBe(true);
  });

  it("selects the record-player state for an explicitly named bedroom route", () => {
    const initial = createInitialEditorDraft("bedroom");
    const routeKey = "door-to-record";
    const routeIds = ["bedroom-door", "bedroom-door-to-bed-1", "bed-edge"];
    const draft = normalizeEditorDraft({
      ...initial,
      routes: { ...initial.routes, [routeKey]: routeIds },
      routeMeta: {
        ...initial.routeMeta,
        [routeKey]: {
          id: routeKey,
          label: "door -> record player",
          kind: "walk",
          accent: "cyan",
          initialFacing: "left",
        },
      },
    })!;
    const terminal = editorRouteTransitions(
      draft.routes[routeKey]!,
      draft.pointsById,
      editorRouteMeta(draft, routeKey),
    ).find((transition) => transition.kind === "state" && transition.pointId === draft.routes[routeKey]!.at(-1));

    expect(terminal).toMatchObject({
      targetStateId: "record-place",
      toAssetSource: BEDROOM_RECORD_SCENE_ASSET_SRC,
      toAssetMode: "scene",
    });
    expect(draft.routes[routeKey]).toHaveLength(3);
  });

  it("matches the shared bed-edge anchor by the directed bedroom endpoint name", () => {
    const initial = createInitialEditorDraft("bedroom");
    const draft = normalizeEditorDraft({
      ...initial,
      routes: {
        ...initial.routes,
        "record-to-door": ["bed-edge", "bedroom-bed-to-door-1", "bedroom-door"],
        "door-to-record": ["bedroom-door", "bedroom-door-to-bed-1", "bed-edge"],
      },
      routeMeta: {
        ...initial.routeMeta,
        "record-to-door": {
          id: "record-to-door",
          label: "唱片机 → 门",
          kind: "walk",
          accent: "cyan",
          initialFacing: "right",
        },
        "door-to-record": {
          id: "door-to-record",
          label: "门 → 唱片机",
          kind: "walk",
          accent: "magenta",
          initialFacing: "left",
        },
      },
    })!;
    const stateTransitionsFor = (routeKey: string) => editorRouteTransitions(
      draft.routes[routeKey]!,
      draft.pointsById,
      editorRouteMeta(draft, routeKey),
    ).filter((transition) => transition.kind === "state");

    expect(stateTransitionsFor("record-to-door")[0]).toMatchObject({
      pointId: "bed-edge",
      fromAssetSource: BEDROOM_RECORD_SCENE_ASSET_SRC,
      toAssetMode: "actor",
    });
    expect(stateTransitionsFor("door-to-record").at(-1)).toMatchObject({
      pointId: "bed-edge",
      targetStateId: "record-place",
      toAssetSource: BEDROOM_RECORD_SCENE_ASSET_SRC,
      toAssetMode: "scene",
    });
  });

  it("migrates only the old provisional bedroom bed anchor in a saved draft", () => {
    const draft = createInitialEditorDraft("bedroom");
    const legacy = {
      ...draft,
      pointsById: {
        ...draft.pointsById,
        "bedroom-door": { ...draft.pointsById["bedroom-door"]!, point: [1220, 570] as [number, number] },
        "bed-edge": { ...draft.pointsById["bed-edge"]!, point: [735, 620] as [number, number] },
        "lounge-corner": { ...draft.pointsById["lounge-corner"]!, point: [1260, 760] as [number, number] },
      },
    };
    const normalized = normalizeStudyEditorDraft(legacy)!;

    expect(normalized.pointsById["bedroom-door"]?.point).toEqual([1182, 455]);
    expect(normalized.pointsById["bed-edge"]?.point).toEqual([868, 357]);
    expect(normalized.pointsById["bed-edge"]?.label).toContain("红圈确认");
    expect(normalized.pointsById["lounge-corner"]?.point).toEqual([1075, 579]);
  });

  it("uses node 3 and node 2 as the bedroom door/lounge turn markers", () => {
    const initial = createInitialEditorDraft("bedroom");
    const doorToLoungeNode2: EditorPoint = {
      id: "door-to-lounge-node-2",
      label: "门 → 小沙发节点 2",
      role: "waypoint",
      point: [1200, 650],
    };
    const draft = normalizeStudyEditorDraft({
      ...initial,
      pointsById: { ...initial.pointsById, [doorToLoungeNode2.id]: doorToLoungeNode2 },
      routes: {
        ...initial.routes,
        "door-to-lounge": ["bedroom-door", "bedroom-door-to-lounge-1", doorToLoungeNode2.id, "lounge-corner"],
      },
    })!;
    const doorToLounge = draft.routes["door-to-lounge"]!;
    const loungeToDoor = draft.routes["lounge-to-door"]!;
    const doorToLoungeMeta = editorRouteMeta(draft, "door-to-lounge");
    const loungeToDoorMeta = editorRouteMeta(draft, "lounge-to-door");
    const doorToLoungeTurn = routeProgressAtPoint(draft.routes["door-to-lounge"]!, draft.pointsById, doorToLounge[2]!);
    const loungeToDoorTurn = routeProgressAtPoint(draft.routes["lounge-to-door"]!, draft.pointsById, loungeToDoor[1]!);

    expect(doorToLoungeMeta.initialFacing).toBe("left");
    expect(doorToLoungeMeta.facingSwitchAfterPointId).toBe(doorToLounge[2]);
    expect(routeFacingAtProgress(doorToLounge, draft.pointsById, doorToLoungeMeta, Math.max(0, doorToLoungeTurn - 0.001))).toBe("left");
    expect(routeFacingAtProgress(doorToLounge, draft.pointsById, doorToLoungeMeta, doorToLoungeTurn)).toBe("right");

    expect(loungeToDoorMeta.initialFacing).toBe("left");
    expect(loungeToDoorMeta.facingSwitchAfterPointId).toBe(loungeToDoor[1]);
    expect(routeFacingAtProgress(loungeToDoor, draft.pointsById, loungeToDoorMeta, Math.max(0, loungeToDoorTurn - 0.001))).toBe("left");
    expect(routeFacingAtProgress(loungeToDoor, draft.pointsById, loungeToDoorMeta, loungeToDoorTurn)).toBe("right");
  });

  it("rebinds bedroom turn markers to inserted route nodes in a saved draft", () => {
    const initial = createInitialEditorDraft("bedroom");
    const insertedPoint: EditorPoint = {
      id: "door-to-lounge-node-2",
      label: "门 → 小沙发节点 2",
      role: "waypoint",
      point: [1200, 650],
    };
    const saved = {
      ...initial,
      pointsById: { ...initial.pointsById, [insertedPoint.id]: insertedPoint },
      routes: {
        ...initial.routes,
        "door-to-lounge": ["bedroom-door", "bedroom-door-to-lounge-1", insertedPoint.id, "lounge-corner"],
        "lounge-to-door": ["lounge-corner", "bedroom-lounge-to-door-1", "bedroom-door"],
      },
      routeMeta: {
        ...initial.routeMeta,
        "door-to-lounge": { ...initial.routeMeta!["door-to-lounge"], facingSwitchAfterPointId: "bedroom-door-to-lounge-1" },
        "lounge-to-door": { ...initial.routeMeta!["lounge-to-door"], facingSwitchAfterPointId: "bedroom-lounge-to-door-1" },
      },
    };

    const normalized = normalizeStudyEditorDraft(saved)!;
    expect(normalized.routeMeta!["door-to-lounge"]?.facingSwitchAfterPointId).toBe(insertedPoint.id);
    expect(normalized.routeMeta!["lounge-to-door"]?.facingSwitchAfterPointId).toBe("bedroom-lounge-to-door-1");
  });

  it("derives facing turns and foreground visibility from route metadata", () => {
    const draft = createInitialEditorDraft();
    const meta = editorRouteMeta(draft, "door-to-seat");
    const turnProgress = routeProgressAtPoint(draft.routes["door-to-seat"]!, draft.pointsById, "in-6");

    expect(routeFacingAtProgress(draft.routes["door-to-seat"]!, draft.pointsById, meta, 0)).toBe("left");
    expect(routeFacingAtProgress(draft.routes["door-to-seat"]!, draft.pointsById, meta, turnProgress)).toBe("right");
    expect(routeForegroundVisibleAtProgress(meta, Math.max(0, turnProgress - 0.01), turnProgress, true)).toBe(true);
    expect(routeForegroundVisibleAtProgress(meta, turnProgress, turnProgress, true)).toBe(false);
    expect(routeForegroundVisibleAtProgress(meta, 0, turnProgress, false)).toBe(false);

    const beforeTurnLayers = editorForegroundLayersAtProgress(
      meta,
      Math.max(0, turnProgress - 0.01),
      turnProgress,
      true,
      getEditorSceneProfile("study").foregroundLayers,
    );
    const afterTurnLayers = editorForegroundLayersAtProgress(
      meta,
      turnProgress,
      turnProgress,
      true,
      getEditorSceneProfile("study").foregroundLayers,
    );
    expect(beforeTurnLayers.map((layer) => layer.id)).toEqual(["desk-table", "chair"]);
    expect(afterTurnLayers.map((layer) => layer.id)).toEqual(["chair"]);

    const afterTurnWithGuideHidden = editorForegroundLayersAtProgress(
      meta,
      turnProgress,
      turnProgress,
      false,
      getEditorSceneProfile("study").foregroundLayers,
    );
    expect(afterTurnWithGuideHidden).toEqual([]);
  });

  it("does not let an accidental start mirror cancel the real middle mirror", () => {
    const initial = createInitialEditorDraft();
    const route = ["door", "door-kitchen-1", "door-kitchen-2"];
    const meta = {
      id: "custom-route",
      label: "桌子→阁楼",
      kind: "walk" as const,
      accent: "violet" as const,
      initialFacing: "left" as const,
      transitions: [
        {
          pointId: route[0]!,
          kind: "facing" as const,
          facing: "left" as const,
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
        {
          pointId: route[2]!,
          kind: "facing" as const,
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
      ],
    };
    const turnProgress = routeProgressAtPoint(route, initial.pointsById, route[2]!);

    expect(routeFacingAtProgress(route, initial.pointsById, meta, 0)).toBe("left");
    expect(routeFacingAtProgress(route, initial.pointsById, meta, Math.max(0, turnProgress - 0.001))).toBe("left");
    expect(routeFacingAtProgress(route, initial.pointsById, meta, turnProgress)).toBe("right");
  });

  it("reverses a route from its final facing and preserves the middle mirror", () => {
    const initial = createInitialEditorDraft();
    const route = ["door", "door-kitchen-1", "door-kitchen-2", "door-kitchen-3", "door-kitchen-4"];
    const meta = {
      id: "custom-forward",
      label: "forward",
      kind: "walk" as const,
      accent: "violet" as const,
      initialFacing: "left" as const,
      transitions: [{
        pointId: route[2]!,
        kind: "facing" as const,
        facing: "right" as const,
        animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
      }],
    };
    const reverseContract = reverseRouteFacingContract(route, initial.pointsById, meta);
    const reversedRoute = [...route].reverse();
    const reversedFacing = reverseContract.facingBySourcePointId.get(route[2]!) ?? "right";
    const reversedMeta = {
      ...meta,
      id: "custom-reverse",
      initialFacing: reverseContract.initialFacing,
      transitions: [{
        pointId: route[2]!,
        kind: "facing" as const,
        facing: reversedFacing,
        animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
      }],
    };
    const turnProgress = routeProgressAtPoint(reversedRoute, initial.pointsById, route[2]!);

    expect(reverseContract.initialFacing).toBe("left");
    expect(reversedFacing).toBe("right");
    expect(routeFacingAtProgress(reversedRoute, initial.pointsById, reversedMeta, 0)).toBe("left");
    expect(routeFacingAtProgress(
      reversedRoute,
      initial.pointsById,
      reversedMeta,
      Math.max(0, turnProgress - 0.001),
    )).toBe("left");
    expect(routeFacingAtProgress(reversedRoute, initial.pointsById, reversedMeta, turnProgress)).toBe("right");
  });

  it("treats a start state as the state being left, not a persistent route overlay", () => {
    const initial = createInitialEditorDraft();
    const route = ["door", "door-kitchen-1", "door-kitchen-2"];
    const meta = {
      id: "custom-route",
      label: "桌子→阁楼",
      kind: "walk" as const,
      accent: "violet" as const,
      transitions: [
        {
          pointId: route[0]!,
          kind: "state" as const,
          targetStateId: "leaving-scene",
          toAssetMode: "none" as const,
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
      ],
    };

    expect(routeStateAtProgress(route, initial.pointsById, meta, 0)).toBe("leaving-scene");
    expect(routeStateAtProgress(route, initial.pointsById, meta, 0.001)).toBeNull();
  });

  it("round-trips the smoke reveal style for scene-integrated state assets", () => {
    const draft = createInitialEditorDraft();
    const smokeDraft: EditorDraft = {
      ...draft,
      routeMeta: {
        ...draft.routeMeta,
        "seat-to-door": {
          ...draft.routeMeta!["seat-to-door"]!,
          transitions: [{
            pointId: "out-2",
            kind: "state" as const,
            targetStateId: "watering-plant-scene",
            fromAssetSource: "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
            fromAssetMode: "actor" as const,
            toAssetSource: "/assets/ecology/formal-scenes/terrace-greenery/states/watering-plant-scene-v1.webp",
            toAssetMode: "scene" as const,
            animation: {
              style: "smoke" as const,
              turns: 1,
              durationMs: 520,
              settleMs: 420,
              easing: "elastic" as const,
            },
          }],
        },
      },
    };
    const imported = deserializeEditorDraft(serializeEditorDraft(smokeDraft));
    expect(imported?.routeMeta?.["seat-to-door"]?.transitions?.find((transition) => (
      transition.pointId === "out-2"
    ))).toMatchObject(
      {
        kind: "state",
        targetStateId: "watering-plant-scene",
        fromAssetSource: "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
        fromAssetMode: "actor",
        toAssetSource: "/assets/ecology/formal-scenes/terrace-greenery/states/watering-plant-scene-v1.webp",
        toAssetMode: "scene",
        animation: { style: "smoke" },
      },
    );
  });

  it("round-trips the dedicated scene-switch style for a moving-to-scene handoff", () => {
    const draft = createInitialEditorDraft();
    const sceneSwitchDraft: EditorDraft = {
      ...draft,
      routeMeta: {
        ...draft.routeMeta,
        "seat-to-door": {
          ...draft.routeMeta!["seat-to-door"]!,
          transitions: [{
            pointId: "out-2",
            kind: "state" as const,
            targetStateId: "entrance-scene",
            fromAssetMode: "actor" as const,
            fromAssetSource: "/assets/ecology/characters/novelist/study-walk-right-v2.webp",
            toAssetMode: "scene" as const,
            toAssetSource: "/assets/ecology/formal-scenes/entrance/entrance-scene-v1.webp",
            animation: {
              style: "scene-switch" as const,
              turns: 2,
              durationMs: 760,
              settleMs: 260,
              easing: "elastic" as const,
            },
          }],
        },
      },
    };

    const imported = deserializeEditorDraft(serializeEditorDraft(sceneSwitchDraft));
    expect(imported?.routeMeta?.["seat-to-door"]?.transitions?.find((transition) => (
      transition.pointId === "out-2"
    ))).toMatchObject({
      kind: "state",
      targetStateId: "entrance-scene",
      toAssetMode: "scene",
      animation: { style: "scene-switch", turns: 2, durationMs: 760, settleMs: 260 },
    });
  });

  it("supports route-local layer events without changing the shared scene policy", () => {
    const draft = createInitialEditorDraft();
    const routeIds = draft.routes["door-to-seat"]!;
    const actorFrontPointId = routeIds[0]!;
    const obstacleFrontPointId = "in-6";
    const laterOverridePointId = "in-7";
    const baseMeta = editorRouteMeta(draft, "door-to-seat");
    const meta = {
      ...baseMeta,
      transitions: [
        {
          pointId: actorFrontPointId,
          kind: "layer" as const,
          layerModes: { "*": "actor-front" as const },
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
        {
          pointId: obstacleFrontPointId,
          kind: "layer" as const,
          layerModes: { "desk-table": "actor-front" as const, chair: "obstacle-front" as const },
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
        {
          pointId: laterOverridePointId,
          kind: "layer" as const,
          layerModes: { "desk-table": "obstacle-front" as const },
          animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
        },
      ],
    };
    const turnProgress = routeProgressAtPoint(routeIds, draft.pointsById, obstacleFrontPointId);

    expect(routeLayerModeAtProgress(routeIds, draft.pointsById, meta, 0)).toBe("actor-front");
    expect(routeLayerModesAtProgress(routeIds, draft.pointsById, meta, 0)).toMatchObject({ "*": "actor-front" });
    expect(routeLayerModeAtProgress(routeIds, draft.pointsById, meta, Math.max(0, turnProgress - 0.001))).toBe("actor-front");
    expect(routeLayerModeAtProgress(routeIds, draft.pointsById, meta, turnProgress)).toBe("actor-front");
    expect(routeLayerModesAtProgress(routeIds, draft.pointsById, meta, turnProgress)).toMatchObject({
      "*": "actor-front",
      "desk-table": "actor-front",
      chair: "obstacle-front",
    });
    expect(editorForegroundLayersAtProgress(
      meta,
      0,
      null,
      true,
      getEditorSceneProfile("study").foregroundLayers,
      routeIds,
      draft.pointsById,
    )).toEqual([]);
    expect(editorForegroundLayersAtProgress(
      meta,
      turnProgress,
      null,
      true,
      getEditorSceneProfile("study").foregroundLayers,
      routeIds,
      draft.pointsById,
    ).map((layer) => layer.id)).toEqual(["chair"]);
    const laterProgress = routeProgressAtPoint(routeIds, draft.pointsById, laterOverridePointId);
    expect(routeLayerModesAtProgress(routeIds, draft.pointsById, meta, laterProgress)).toMatchObject({
      "desk-table": "obstacle-front",
      chair: "obstacle-front",
    });
    expect(editorForegroundLayersAtProgress(
      meta,
      laterProgress,
      null,
      true,
      getEditorSceneProfile("study").foregroundLayers,
      routeIds,
      draft.pointsById,
    ).map((layer) => layer.id)).toEqual(["desk-table", "chair"]);

    const roundTripped = deserializeEditorDraft(serializeEditorDraft({
      ...draft,
      routeMeta: { ...draft.routeMeta, "door-to-seat": meta },
    }));
    expect(roundTripped?.routeMeta?.["door-to-seat"]?.transitions?.filter((transition) => transition.kind === "layer")).toMatchObject([
      { pointId: actorFrontPointId, kind: "layer", layerModes: { "*": "actor-front" } },
      { pointId: obstacleFrontPointId, kind: "layer", layerModes: { "desk-table": "actor-front", chair: "obstacle-front" } },
      { pointId: laterOverridePointId, kind: "layer", layerModes: { "desk-table": "obstacle-front" } },
    ]);
  });
});
