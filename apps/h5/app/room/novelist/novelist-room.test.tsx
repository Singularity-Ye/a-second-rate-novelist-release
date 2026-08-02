import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NovelistRoom } from "./novelist-room";
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

  it("keeps life cues out of the stage and actor canvas", () => {
    render(<NovelistRoom />);

    expect(screen.queryByTestId("stage-life-cue")).toBeNull();
    expect(screen.queryByTestId("actor-mood")).toBeNull();
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

  it("uses the map to begin a published multi-leg journey instead of teleporting", () => {
    render(<NovelistRoom />);
    fireEvent.click(screen.getByRole("button", { name: /展开整屋地图/ }));

    const map = screen.getByTestId("room-map-popover");
    expect(map.querySelectorAll("[data-scene-id]")).toHaveLength(5);

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
    expect(sceneGroups).toHaveLength(5);
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
    (screen.getByTestId("system-message-input") as HTMLTextAreaElement).blur();
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
