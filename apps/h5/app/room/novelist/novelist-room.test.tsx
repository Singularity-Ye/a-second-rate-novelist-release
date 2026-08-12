import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NovelistRoom } from "./novelist-room";
import { createInitialLifeRuntimeState } from "./life-runtime";
import { clearLifeRuntimeSnapshot, saveLifeRuntimeSnapshot } from "./life-runtime-store";
import { clearNextDayPlanDraft, loadNextDayPlanDraft } from "./next-day-plan-store";
import { clearSceneInteractionStates, saveSceneInteractionStates } from "./scene-interaction-store";
import {
  formalEcologySceneManifest,
  getActorMode,
  getFormalSceneRoute,
  getFormalSceneRouteTransition,
} from "./scene-manifest";
import { NovelistMotionActor } from "./novelist-motion-actor";

describe("NovelistRoom", () => {
  afterEach(() => {
    cleanup();
    clearLifeRuntimeSnapshot();
    clearNextDayPlanDraft();
    clearSceneInteractionStates();
    window.localStorage.removeItem("room-ui-formal-surface:v1");
    window.history.replaceState({}, "", "/room/novelist");
  });

  it("renders the formal room without retired control panels or hotspot overlays", () => {
    render(<NovelistRoom />);
    const room = screen.getByTestId("novelist-room");

    expect(room.getAttribute("data-immersive")).toBe("true");
    expect(room.getAttribute("data-life-autoplay")).toBe("true");
    expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("study");
    expect(screen.getByTestId("room-map-popover")).toBeTruthy();
    expect(screen.getByTestId("life-plan")).toBeTruthy();
    expect(screen.queryByTestId("room-controls-toggle")).toBeNull();
    expect(screen.queryByTestId("room-controls")).toBeNull();
    expect(room.querySelector("[data-hotspot-id]")).toBeNull();
  });

  it("opens directly in the stable writing state without an entry smoke transition", () => {
    render(<NovelistRoom />);

    expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("study");
    expect(screen.queryByTestId("formal-route-smoke")).toBeNull();
  });

  it("opens the local room settings below the map and closes them from Escape", () => {
    render(<NovelistRoom />);

    const settingsToggle = screen.getByTestId("room-settings-toggle");
    expect(settingsToggle.textContent).toContain("设置");
    fireEvent.click(settingsToggle);

    const settings = screen.getByTestId("room-settings");
    expect(settings.getAttribute("role")).toBe("dialog");
    expect(screen.getByTestId("room-settings-volume")).toBeTruthy();
    expect(screen.getByTestId("room-settings-motion")).toBeTruthy();
    expect(screen.getByTestId("room-settings-reduced-motion")).toBeTruthy();
    expect(screen.getByTestId("room-settings-auto-scroll")).toBeTruthy();
    expect((screen.getByLabelText("发送快捷键") as HTMLInputElement).value).toBe("Enter");
    expect(screen.getByText("Shift+Enter")).toBeTruthy();
    expect((screen.getByLabelText("任务台快捷键") as HTMLInputElement).value).toBe("B");
    expect((screen.getByLabelText("关闭快捷键") as HTMLInputElement).value).toBe("Escape");
    expect((screen.getByLabelText("地图快捷键") as HTMLInputElement).value).toBe("M");
    expect((screen.getByLabelText("设置快捷键") as HTMLInputElement).value).toBe("S");

    fireEvent.click(screen.getByTestId("room-settings-reduced-motion"));
    expect(screen.getByTestId("novelist-room").getAttribute("data-room-reduced-motion")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("room-settings")).toBeNull();
  });

  it("keeps one settings toggle inside the map dock after map content", () => {
    render(<NovelistRoom />);
    const map = screen.getByTestId("room-map");
    expect(map.querySelectorAll('[data-testid="room-settings-toggle"]')).toHaveLength(1);
    const content = screen.getByTestId("room-map-popover");
    expect(content.compareDocumentPosition(screen.getByTestId("room-settings-toggle")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps life cues out of the stage and actor canvas", () => {
    render(<NovelistRoom />);

    expect(screen.queryByTestId("stage-life-cue")).toBeNull();
    expect(screen.queryByTestId("actor-mood")).toBeNull();
    const lifeSignal = screen.getByTestId("stage-life-signal");
    expect(lifeSignal.getAttribute("data-activity")).toBe("writing");
    expect(lifeSignal.getAttribute("role")).toBe("status");
    expect(lifeSignal.getAttribute("aria-live")).toBe("polite");
    expect(lifeSignal.textContent).toContain("写作中");
  });

  it("shows a quiet activity progress cue while the novelist is actually living", async () => {
    render(<NovelistRoom />);

    await waitFor(() => expect(screen.getByTestId("stage-life-signal").getAttribute("data-activity-running")).toBe("true"));
    expect(screen.getByTestId("stage-life-signal").textContent).toMatch(/还会停留|随时可以打断|这一段快结束了/);
  });

  it("restores a stable non-writing life stage into the room and observation panel", async () => {
    saveLifeRuntimeSnapshot(createInitialLifeRuntimeState("study"), 1234, {
      sceneId: "bedroom",
      routeId: "bedroom-to-bed",
      activity: "sleeping",
      actionId: "bed-sleep",
    });

    render(<NovelistRoom />);

    await waitFor(() => expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("bedroom"));
    expect(screen.getByTestId("stage-life-signal").getAttribute("data-activity")).toBe("sleeping");
    expect(screen.getByTestId("stage-life-signal").textContent).toContain("睡觉中");
    fireEvent.click(within(screen.getByTestId("system-layer-panel")).getByRole("button"));
    const statusCard = screen.getByTestId("room-v6-status-card");
    expect(statusCard.textContent).toContain("睡觉中");
    expect(statusCard.querySelector('[data-avatar-state="sleeping"]')).toBeTruthy();
  });

  it("restores formal scene-owned gear state after the room is reloaded", async () => {
    saveSceneInteractionStates({
      "entrance:entrance-umbrella-rack": "carried",
      "entrance:entrance-coat-rack": "empty",
    });
    saveLifeRuntimeSnapshot(createInitialLifeRuntimeState("study"), 1234, {
      sceneId: "entrance",
      routeId: "outside-to-entrance",
      activity: "away",
      actionId: "walking",
    });

    render(<NovelistRoom />);

    await waitFor(() => expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("entrance"));
    const interactionLayer = screen.getByTestId("scene-interactions-layer");
    expect(interactionLayer.querySelector('[data-interaction-id="entrance-umbrella-rack"]')).toBeNull();
    expect(interactionLayer.querySelector('[data-interaction-id="entrance-coat-rack"]')).toBeNull();
    expect(interactionLayer.querySelectorAll('[data-interaction-id="entrance-mailbox"]')).toHaveLength(4);
  });

  it("does not add a floating stage card during a dining route", () => {
    render(<NovelistRoom />);

    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    const routeButton = screen.getByTestId("life-route-catalog").querySelector('[data-route-id="counter-to-table"]');
    expect(routeButton).toBeTruthy();
    fireEvent.click(routeButton!);

    expect(screen.queryByTestId("stage-life-cue")).toBeNull();
    expect(screen.queryByTestId("actor-mood")).toBeNull();
  });

  it("keeps life notices in the expandable life plan instead of the stage chrome", () => {
    render(<NovelistRoom />);

    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    fireEvent.click(within(lifePlan).getByRole("button", { name: "暂停" }));

    expect(screen.queryByTestId("stage-life-cue")).toBeNull();
    expect(screen.getByTestId("life-current-cue")).toBeTruthy();
  });

  it("previews another daily rhythm without changing the current route or saved life state", () => {
    render(<NovelistRoom />);

    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    const daySwitcher = screen.getByTestId("life-day-switcher");
    expect(daySwitcher.textContent).toContain("今日");

    fireEvent.click(within(daySwitcher).getByRole("button", { name: "预览后一日" }));

    expect(daySwitcher.textContent).toContain("预览");
    expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("study");
    expect(screen.getByTestId("novelist-motion-actor").getAttribute("data-route-id")).toBe("study-desk-stay");

    fireEvent.click(within(daySwitcher).getByRole("button", { name: "今天" }));
    expect(daySwitcher.textContent).toContain("今日");
  });

  it("keeps the daily-life panel close control visibly attached to the paper", () => {
    render(<NovelistRoom />);
    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    const panel = screen.getByRole("dialog", { name: "小说家今日生活规划" });
    const close = within(panel).getByRole("button", { name: "收起今日生活规划" });
    expect(close.textContent).toBe("×");
    expect(close.className).toContain("lifePlanClose");
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "小说家今日生活规划" })).toBeNull();
  });

  it("shows a bounded next-day tendency and commits it only after the life runtime reaches night", async () => {
    const nightState = createInitialLifeRuntimeState("study");
    nightState.host = { ...nightState.host, dayPhase: "night", fatigue: 88 };
    saveLifeRuntimeSnapshot(nightState, 1234);

    render(<NovelistRoom />);
    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));

    const nextDay = screen.getByTestId("next-day-plan");
    expect(nextDay.getAttribute("data-plan-provenance")).toBe("rules_only");
    expect(nextDay.textContent).toContain("明日倾向");
    await waitFor(() => expect(nextDay.getAttribute("data-plan-status")).toBe("committed"));
    expect(loadNextDayPlanDraft()).toMatchObject({
      status: "committed",
      source: "life_runtime",
    });
  });

  it("uses the map to begin a published multi-leg journey instead of teleporting", () => {
    render(<NovelistRoom />);
    fireEvent.click(screen.getByRole("button", { name: /展开整屋地图/ }));

    const map = screen.getByTestId("room-map-popover");
    expect(map.querySelectorAll("[data-scene-id]")).toHaveLength(6);
    expect(map.querySelector('[data-scene-id="entrance"]')).toBeTruthy();

    const bedroomMarker = map.querySelector('[data-scene-id="bedroom"]');
    expect(bedroomMarker).toBeTruthy();
    fireEvent.click(bedroomMarker!);

    expect(screen.getByTestId("formal-scene-stage").getAttribute("data-scene-id")).toBe("study");
    expect(screen.getByTestId("scene-journey").textContent).toContain("书房");
    expect(screen.getByTestId("scene-journey").textContent).toContain("卧室");
    expect(screen.getByTestId("novelist-motion-actor").getAttribute("data-route-id")).toBe("custom-12");
  });

  it("exposes every published route through the life-plan catalog", () => {
    render(<NovelistRoom />);
    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));

    expect(screen.getByTestId("life-current-cue")).toBeTruthy();
    expect(screen.getByTestId("life-moments")).toBeTruthy();

    const catalog = screen.getByTestId("life-route-catalog");
    const routeButtons = catalog.querySelectorAll("button[data-route-id]");
    const sceneGroups = catalog.querySelectorAll("[data-scene-id]");

    expect(catalog.textContent).toContain("已发布路线");
    expect(routeButtons.length).toBeGreaterThan(20);
    expect(sceneGroups).toHaveLength(6);
    const entranceGroup = catalog.querySelector('section[data-scene-id="entrance"]');
    expect(entranceGroup).toBeTruthy();
    expect(entranceGroup?.querySelectorAll('button[data-route-id]')).toHaveLength(7);
    expect(entranceGroup?.querySelector('[data-route-id="entrance-to-outside-umbrella"]')).toBeTruthy();
    expect(entranceGroup?.querySelector('[data-route-id="outside-to-entrance-return-gear"]')).toBeTruthy();
    expect(catalog.querySelector('[data-route-id="study-writing-to-stand-by-desk"]')).toBeNull();
    expect(catalog.querySelector('[data-route-id="study-writing-to-terrace-lookout"]')).toBeNull();

    const firstRouteButton = routeButtons[0]!;
    const routeId = firstRouteButton.getAttribute("data-route-id");
    expect(routeId).toBeTruthy();
    fireEvent.click(firstRouteButton);
    expect(screen.getByTestId("novelist-motion-actor").getAttribute("data-route-id")).toBe(routeId);
  });

  it("sends a cross-scene route catalog option to the graph destination", () => {
    render(<NovelistRoom />);

    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    fireEvent.click(screen.getByTestId("life-route-catalog").querySelector('section[data-scene-id="study"] button[data-route-id="custom-1"]')!);

    const journey = screen.getByTestId("scene-journey");
    expect(journey.getAttribute("data-from-scene-id")).toBe("study");
    expect(journey.getAttribute("data-target-scene-id")).toBe("attic");
  });

  it("exposes the life runtime, need prompts, postcards, and actor interaction surface", () => {
    render(<NovelistRoom />);
    const actor = screen.getByTestId("novelist-motion-actor");
    expect(actor.getAttribute("data-interactive")).toBe("true");

    fireEvent.click(screen.getByTestId("life-plan").querySelector("button")!);
    expect(screen.getByTestId("life-runtime")).toBeTruthy();
    expect(screen.getByTestId("postcard-shelf")).toBeTruthy();
    expect(screen.queryByText("回應这个念头，让他真的出发")).toBeNull();

    fireEvent.click(screen.getByTestId("life-plan").querySelector('[data-need="hunger"]')!);
    expect(screen.getByTestId("life-current-cue").getAttribute("data-mood-kind")).toBe("need");
    expect(screen.getByText("回应这个念头，让他真的出发")).toBeTruthy();
  });

  it("opens the desk entry from the writing novelist and bridges to the existing room destinations", async () => {
    render(<NovelistRoom />);

    const actor = screen.getByTestId("novelist-motion-actor");
    fireEvent.pointerDown(actor, { pointerId: 1 });
    fireEvent.pointerUp(actor, { pointerId: 1 });

    const entry = await waitFor(() => screen.getByTestId("desk-entry-overlay"));
    expect(entry).toBeTruthy();
    expect(within(entry).getByTestId("desk-entry-backdrop")).toBeTruthy();
    expect(entry.querySelector('img[src$="desk-entry-paper-frame-v1.webp"]')).toBeTruthy();
    expect(within(entry).getByRole("button", { name: /和小说家说话/ })).toBeTruthy();
    expect(within(entry).getByRole("link", { name: /打开正文工作台/ }).getAttribute("href")).toBe("/vnext/world-lab");
    expect(within(entry).getByRole("button", { name: /看看今日生活/ })).toBeTruthy();

    fireEvent.click(within(entry).getByRole("button", { name: /和小说家说话/ }));
    await waitFor(() => expect(screen.getByTestId("system-layer-panel").getAttribute("data-chat-mode")).toBe("novelist"));
    expect(screen.queryByTestId("desk-entry-overlay")).toBeNull();
  });

  it("keeps the life cue available in the plan when a full-scene action hides the actor", () => {
    render(<NovelistRoom />);

    expect(screen.queryByTestId("stage-life-cue")).toBeNull();

    const lifePlan = screen.getByTestId("life-plan");
    fireEvent.click(within(lifePlan).getByRole("button", { name: /今日生活/ }));
    fireEvent.click(lifePlan.querySelector('[data-need="hunger"]')!);
    expect(screen.getByTestId("life-current-cue").getAttribute("data-mood-kind")).toBe("need");
  });

  it("does not mount the retired title, status, or chrome toggle cards", () => {
    render(<NovelistRoom />);

    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByTestId("scene-status")).toBeNull();
    expect(screen.queryByTestId("room-chrome-toggle")).toBeNull();
  });

  it("renders six distinct time-of-day icon markers without changing the day contract", () => {
    render(<NovelistRoom />);

    const timeline = screen.getByTestId("day-timeline");
    const markers = [...timeline.querySelectorAll<HTMLElement>("[data-day-phase-marker]")];

    expect(markers.map((marker) => marker.dataset.phase)).toEqual([
      "dawn",
      "morning",
      "noon",
      "afternoon",
      "evening",
      "night",
    ]);
    expect(markers.every((marker) => marker.querySelector("svg"))).toBe(true);
  });

  it("starts in the world state and toggles novelist and subsystem panels from room shortcuts", async () => {
    render(<NovelistRoom />);
    const panel = screen.getByTestId("system-layer-panel");

    expect(panel.getAttribute("data-expanded")).toBe("false");

    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => {
      expect(panel.getAttribute("data-chat-mode")).toBe("novelist");
      expect(panel.getAttribute("data-expanded")).toBe("true");
    });
    expect(screen.getByTestId("room-v6-presentational-surface")).toBeTruthy();
    (screen.getByTestId("room-v6-composer") as HTMLTextAreaElement).blur();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(panel.getAttribute("data-expanded")).toBe("false");

    fireEvent.keyDown(window, { key: "b" });
    await waitFor(() => {
      expect(panel.getAttribute("data-chat-mode")).toBe("subsystem");
      expect(panel.getAttribute("data-expanded")).toBe("true");
    });
    fireEvent.keyDown(window, { key: "b" });
    expect(panel.getAttribute("data-expanded")).toBe("false");
  });

  it("does not let the room-level Escape shortcut close a system-panel portal", async () => {
    render(<NovelistRoom />);
    const panel = screen.getByTestId("system-layer-panel");
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(panel.getAttribute("data-expanded")).toBe("true"));

    const portal = document.createElement("div");
    portal.dataset.roomShortcutScope = "system-panel";
    portal.tabIndex = -1;
    document.body.append(portal);
    portal.focus();
    fireEvent.keyDown(portal, { key: "Escape" });

    expect(panel.getAttribute("data-expanded")).toBe("true");
    portal.remove();
  });

  it("uses the same-origin saved layout in ordinary v6 room mode", async () => {
    window.localStorage.setItem("room-ui-formal-surface:v1", JSON.stringify({
      surface: { x: 10, y: 11, scale: 1.25, tilt: 0, width: 90, height: 80 },
      composition: {
        suggestions: { x: 13.5, y: 14.5, scale: 1.1, tilt: 0, width: 30, height: 80 },
      },
      rightRailLayoutRevision: 1,
    }));
    render(<NovelistRoom />);

    fireEvent.keyDown(window, { key: "Enter" });
    const surface = await screen.findByTestId("room-v6-presentational-surface");
    const suggestions = screen.getByTestId("room-v6-suggestions");

    expect(surface.getAttribute("data-surface-scale")).toBe("1.25");
    expect(surface.getAttribute("data-calibration-camera")).toBe("desktop");
    expect(suggestions.style.getPropertyValue("--layout-x")).toBe("13.5px");
    expect(suggestions.style.getPropertyValue("--layout-scale")).toBe("1.1");
  });

  it("keeps the explicit roomUiEditor route on the editor surface", async () => {
    window.history.replaceState({}, "", "/room/novelist?roomUi=v6&roomUiEditor=1");
    render(<NovelistRoom />);

    fireEvent.keyDown(window, { key: "Enter" });
    const editor = await screen.findByTestId("room-v6-presentational-editor");

    expect(editor.getAttribute("data-editor-source")).toBe("RoomUiPresentationalSurface");
    expect(screen.getByTestId("room-v6-editor-panel")).toBeTruthy();
  });

  it("keeps the legacy novelist console available only through the explicit roomUi fallback", async () => {
    window.history.replaceState({}, "", "/room/novelist?roomUi=legacy");
    render(<NovelistRoom />);
    const panel = screen.getByTestId("system-layer-panel");

    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => {
      expect(panel.getAttribute("data-chat-mode")).toBe("novelist");
      expect(panel.getAttribute("data-expanded")).toBe("true");
      expect(screen.queryByTestId("room-v6-presentational-surface")).toBeNull();
      expect(screen.getByTestId("system-message-input")).toBeTruthy();
    });
  });

  it("keeps formal bedroom routes and depth assets in the manifest", () => {
    const bedroom = formalEcologySceneManifest.scenes.bedroom;
    const publishedRoutes = Object.values(bedroom.routes).filter((route) => route.publishedFromSnapshot);

    expect(publishedRoutes.length).toBeGreaterThan(0);
    expect(bedroom.foregroundLayers?.[0]).toMatchObject({
      sourceOfTruth: "transparent-alpha",
      layerRole: "bedroom-furniture-depth-occluder",
    });
    expect(bedroom.foregroundLayers?.[0]?.assetId).toBeTruthy();
    expect(["ready", "interface-only", "candidate"]).toContain(bedroom.runtimeGate.status);
  });

  it("routes bedroom sleep intent through the current editor alias", () => {
    const bedroom = formalEcologySceneManifest.scenes.bedroom;
    expect(bedroom.defaultRouteByActivity.sleeping).toBe("bedroom-to-bed");
    expect(getFormalSceneRoute("bedroom", bedroom.defaultRouteByActivity.sleeping)).toMatchObject({
      id: "bedroom-to-bed",
      arriveActionId: "bed-sleep",
      waypointIds: expect.arrayContaining(["custom-1-node-1", "custom-1-node-2"]),
    });
  });

  it("keeps walking actors available for state-anchor routes", () => {
    render(
      <NovelistMotionActor
        sceneId="bedroom"
        routeId="door-to-bed"
        activity="sleeping"
        visible
        paused
      />,
    );

    const actor = screen.getByTestId("novelist-motion-actor");
    expect(actor.getAttribute("data-mode")).toBe("walking");
    expect(actor.getAttribute("data-preview-actor-ready")).toBe("true");
    expect(actor.querySelector("img")).toBeTruthy();
  });

  it("does not carry manuscript particles into the dining carry-bowl route", () => {
    render(
      <NovelistMotionActor
        sceneId="dining-kitchen"
        routeId="dining-counter-to-table"
        activity="eating"
        showManuscriptParticles
        visible
        paused
      />,
    );

    expect(screen.queryByTestId("manuscript-particles")).toBeNull();
  });

  it("validates published route point, phase, and transition references", () => {
    const sceneIds = ["study", "dining-kitchen", "bedroom", "entrance", "terrace-greenery", "attic"] as const;

    for (const sceneId of sceneIds) {
      const scene = formalEcologySceneManifest.scenes[sceneId];
      const publishedRoutes = Object.values(scene.routes).filter((route) => route.publishedFromSnapshot);
      expect(publishedRoutes.length).toBeGreaterThan(0);

      for (const route of publishedRoutes) {
        const resolvedRoute = getFormalSceneRoute(sceneId, route.id);
        expect(resolvedRoute).toBeTruthy();
        const pointIds = resolvedRoute!.points.map((point) => point.id);
        expect(pointIds.length).toBe(resolvedRoute!.waypointIds.length);
        expect(new Set(pointIds).size).toBe(pointIds.length);

        for (const transition of resolvedRoute!.transitions ?? []) {
          expect(pointIds).toContain(transition.pointId);
          expect(getFormalSceneRouteTransition(resolvedRoute, transition.pointId, transition.phase)).toMatchObject({
            pointId: transition.pointId,
            phase: transition.phase,
          });
          if (transition.fromActionId) expect(scene.actions[transition.fromActionId]).toBeTruthy();
          if (transition.toActionId) expect(scene.actions[transition.toActionId]).toBeTruthy();
        }
      }
    }
  });

  it("keeps route direction and activity owned by the published manifest", () => {
    const studyRoute = getFormalSceneRoute("study", "door-to-seat");
    expect(studyRoute?.publishedFromSnapshot).toBe(true);
    expect(studyRoute?.points.length).toBeGreaterThan(1);
    expect(studyRoute?.phases?.every((phase) => phase.pathStartPointId && phase.pathEndPointId)).toBe(true);

    expect(getActorMode("writing")).toBe("seated");
    expect(getActorMode("away")).toBe("walking");
  });
});
