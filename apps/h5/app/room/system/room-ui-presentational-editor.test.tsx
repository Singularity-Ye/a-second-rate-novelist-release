import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomUiPresentationalEditor, {
  clampEditorPanelPosition,
  getEditorGeometryDimensionControl,
  migrateRoomUiStoredLayout,
} from "./room-ui-presentational-editor";
import {
  ROOM_UI_SURFACE_GEOMETRY_V6,
  ROOM_UI_VISUAL_LAYOUT_V6,
} from "./room-ui-presentational-layout";

const savedSurface = { ...ROOM_UI_SURFACE_GEOMETRY_V6 };

vi.mock("./room-ui-presentational-surface", () => ({
  default: () => React.createElement(
    "div",
    { "data-testid": "room-v6-presentational-surface" },
    React.createElement("button", { "data-testid": "room-v6-composer-submit" }),
  ),
}));

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

describe("RoomUiPresentationalEditor stored layout migration", () => {
  it("repairs only the guide layer inherited from the oversized legacy geometry", () => {
    const migrated = migrateRoomUiStoredLayout({
      internalGeometryLayoutRevision: 1,
      guideLibraryGeometryRevision: 1,
      surface: savedSurface,
      composition: {},
      internal: {
        "suggestion-guide-library": {
          ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-guide-library"],
          scale: 1.8,
          width: 4.2,
          height: 8.5,
        },
        "suggestion-title": { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"], x: 19 },
      },
    });

    expect(migrated?.internal["suggestion-guide-library"]).toEqual(
      ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-guide-library"],
    );
    expect(migrated?.internal["suggestion-title"].x).toBe(19);
    expect(migrated?.internalGeometryLayoutRevision).toBe(1);
    expect(migrated?.guideLibraryGeometryRevision).toBe(2);
  });

  it("resets only the suggestions geometry when the right-rail revision is old or missing", () => {
    const migrated = migrateRoomUiStoredLayout({
      surface: savedSurface,
      composition: {
        chat: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.chat, x: 123 },
        suggestions: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.suggestions, x: -90 },
      },
    });

    expect(migrated?.composition.chat.x).toBe(123);
    expect(migrated?.composition.suggestions).toEqual(ROOM_UI_VISUAL_LAYOUT_V6.geometry.suggestions);
    expect(migrated?.rightRailLayoutRevision).toBe(1);
  });

  it("keeps a manually adjusted suggestions geometry at the current revision", () => {
    const migrated = migrateRoomUiStoredLayout({
      rightRailLayoutRevision: 1,
      surface: savedSurface,
      composition: {
        suggestions: { ...ROOM_UI_VISUAL_LAYOUT_V6.geometry.suggestions, x: 14.5 },
      },
    });

    expect(migrated?.composition.suggestions.x).toBe(14.5);
  });

  it("adds independent card typography without disturbing existing internal calibration", () => {
    const title = { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"], x: 19 };
    const migrated = migrateRoomUiStoredLayout({
      suggestionCardLayoutRevision: 1,
      internalGeometryLayoutRevision: 1,
      surface: savedSurface,
      composition: {},
      internal: { "suggestion-title": title },
      suggestionTypography: {
        "suggestion-card-life-now": {
          titleScale: 0.72,
          detailScale: 0.84,
          detailLineHeight: 1.32,
          detailWidth: 68,
        },
      },
    });

    expect(migrated?.internal["suggestion-title"]).toEqual(title);
    expect(migrated?.suggestionTypography["suggestion-card-life-now"]).toEqual({
      titleScale: 0.72,
      detailScale: 0.84,
      detailLineHeight: 1.32,
      detailWidth: 68,
    });
    expect(migrated?.suggestionTypography["suggestion-card-life-break"]).toEqual(
      ROOM_UI_VISUAL_LAYOUT_V6.suggestionTypography["suggestion-card-life-break"],
    );
  });

  it("drops retired shell fields while preserving user-tuned internal slots", () => {
    const title = { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"], x: 19 };
    const detail = { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"], x: 21 };
    const icon = { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-icon"], x: 23 };
    const migrated = migrateRoomUiStoredLayout({
      surface: savedSurface,
      composition: {},
      suggestionShell: { x: 1, y: 2, scale: 1, tilt: 0, width: 3, height: 4 },
      suggestionShellLayoutRevision: 1,
      internalGeometryLayoutRevision: 1,
      internal: { "suggestion-title": title, "suggestion-detail": detail, "suggestion-icon": icon },
    });

    expect(migrated).not.toHaveProperty("suggestionShell");
    expect(migrated).not.toHaveProperty("suggestionShellLayoutRevision");
    expect(migrated?.internal["suggestion-title"]).toEqual(title);
    expect(migrated?.internal["suggestion-detail"]).toEqual(detail);
    expect(migrated?.internal["suggestion-icon"]).toEqual(icon);
    expect(migrated?.internal).not.toHaveProperty("suggestion-group-life");
    expect(migrated?.internal).not.toHaveProperty("suggestion-group-creative");
    expect(migrated?.internal).not.toHaveProperty("suggestion-guide-story-spark");
    expect(migrated?.internal).not.toHaveProperty("suggestion-guide-writing-entry");
  });

  it("repairs old percentage sliders for title, detail, and icon without changing current-revision values", () => {
    const migrated = migrateRoomUiStoredLayout({
      surface: savedSurface,
      composition: {},
      internal: {
        "suggestion-title": { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"], width: 2.2, height: 2.2 },
        "suggestion-detail": { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"], width: 2.2, height: 2.2 },
        "suggestion-icon": { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-icon"], width: 2.2, height: 2.2 },
      },
    });

    expect(migrated?.internal["suggestion-title"]).toEqual(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"]);
    expect(migrated?.internal["suggestion-detail"]).toEqual(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"]);
    expect(migrated?.internal["suggestion-icon"]).toEqual(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-icon"]);

    const current = migrateRoomUiStoredLayout({
      internalGeometryLayoutRevision: 1,
      surface: savedSurface,
      composition: {},
      internal: {
        "suggestion-detail": { ...ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"], width: 2.2, height: 2.2 },
      },
    });
    expect(current?.internal["suggestion-detail"]).toMatchObject({ width: 2.2, height: 2.2 });
  });

});

describe("RoomUiPresentationalEditor panel drag", () => {
  it("clamps a dragged panel to safe viewport bounds", () => {
    expect(clampEditorPanelPosition({ left: -80, top: 900 }, 280, 320, 390, 844)).toEqual({
      left: 12,
      top: 512,
    });
  });

  it("uses the heading as the drag handle, ignores controls, and supports reset", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    const panel = await screen.findByTestId("room-v6-editor-panel");
    const handle = screen.getByTestId("room-v6-editor-panel-drag-handle");
    const reset = screen.getByTestId("room-v6-editor-reset-position");

    expect(handle.getAttribute("data-panel-drag-handle")).toBe("true");
    fireEvent.pointerDown(reset, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 40, clientY: 40 });
    expect(panel.style.left).toBe("");

    fireEvent.pointerDown(handle, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: -400, clientY: -400 });
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: -400, clientY: -400 });
    expect(panel.style.left).toBe("12px");
    expect(panel.style.top).toBe("12px");

    fireEvent.click(reset);
    await waitFor(() => {
      expect(panel.style.left).toBe("");
      expect(panel.style.top).toBe("");
    });
  });

  it("keeps internal dimensions in percentage units and does not clamp the default detail slot", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    await screen.findByTestId("room-v6-editor-panel");
    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-detail"));

    const width = screen.getByTestId("room-v6-editor-width") as HTMLInputElement;
    const height = screen.getByTestId("room-v6-editor-height") as HTMLInputElement;
    expect(screen.getByTestId("room-v6-editor-geometry-unit").textContent).toContain("百分比");
    expect(width.value).toBe(String(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"].width));
    expect(height.value).toBe(String(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-detail"].height));
    expect(width.min).toBe("1");
    expect(width.max).toBe("100");
    expect(width.step).toBe("0.1");
    expect(width.dataset.geometryUnit).toBe("%");

    fireEvent.change(width, { target: { value: "83.5" } });
    expect(width.value).toBe("83.5");
  });

  it("keeps composition and surface dimensions on the existing multiplier range", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    await screen.findByTestId("room-v6-editor-panel");

    for (const layerTestId of ["room-v6-editor-select-surface", "room-v6-editor-select-chat"]) {
      fireEvent.click(screen.getByTestId(layerTestId));
      const width = screen.getByTestId("room-v6-editor-width") as HTMLInputElement;
      expect(width.min).toBe("0.2");
      expect(width.max).toBe("2.2");
      expect(width.step).toBe("0.01");
      expect(width.dataset.geometryUnit).toBe("倍率");
    }

    expect(getEditorGeometryDimensionControl("suggestion-detail", 82)).toMatchObject({
      min: 1,
      max: 100,
      step: 0.1,
      unit: "%",
    });
  });

  it("lists the four right-rail prompts as independently selectable layers", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    await screen.findByTestId("room-v6-editor-panel");

    for (const layer of [
      "suggestion-card-life-now",
      "suggestion-card-life-break",
      "suggestion-card-creative-spark",
      "suggestion-card-creative-writing",
      "suggestion-guide-library",
      "composer-send",
    ]) {
      expect(screen.getByTestId(`room-v6-editor-select-${layer}`)).toBeTruthy();
    }

    expect(screen.getByTestId("room-v6-editor-select-suggestion-guide-library")).toBeTruthy();
    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-guide-library"));
    expect((screen.getByTestId("room-v6-editor-width") as HTMLInputElement).value).toBe("11.5");
    expect((screen.getByTestId("room-v6-editor-height") as HTMLInputElement).value).toBe("5.8");
    expect(screen.getByTestId("room-v6-editor-geometry-unit").textContent).toContain("百分比");
    fireEvent.click(screen.getByTestId("room-v6-editor-select-composer-send"));
    expect((screen.getByTestId("room-v6-editor-width") as HTMLInputElement).value).toBe("82.5");
    expect((screen.getByTestId("room-v6-editor-height") as HTMLInputElement).value).toBe("82.1");
    expect(screen.getByTestId("room-v6-composer-submit")).toBeTruthy();
  });

  it("keeps per-card typography controls independent and restores only the selected card", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    await screen.findByTestId("room-v6-editor-panel");
    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-card-life-now"));

    const titleScale = screen.getByTestId("room-v6-editor-title-scale") as HTMLInputElement;
    const detailWidth = screen.getByTestId("room-v6-editor-detail-width") as HTMLInputElement;
    expect(titleScale.value).toBe("1");
    expect(detailWidth.value).toBe("100");
    fireEvent.change(titleScale, { target: { value: "0.72" } });
    fireEvent.change(detailWidth, { target: { value: "68" } });
    expect(titleScale.value).toBe("0.72");
    expect(detailWidth.value).toBe("68");

    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-card-life-break"));
    expect((screen.getByTestId("room-v6-editor-title-scale") as HTMLInputElement).value).toBe("1");
    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-card-life-now"));
    fireEvent.click(screen.getByTestId("room-v6-editor-reset-selected-layer"));
    expect((screen.getByTestId("room-v6-editor-title-scale") as HTMLInputElement).value).toBe("1");
    expect((screen.getByTestId("room-v6-editor-detail-width") as HTMLInputElement).value).toBe("100");

    fireEvent.change(titleScale, { target: { value: "0.7" } });
    fireEvent.click(screen.getByTestId("room-v6-editor-reset-suggestion-cards"));
    expect((screen.getByTestId("room-v6-editor-title-scale") as HTMLInputElement).value).toBe("1");
  });

  it("restores the selected title layer without resetting the whole Surface", async () => {
    render(<RoomUiPresentationalEditor {...({} as React.ComponentProps<typeof RoomUiPresentationalEditor>)} />);
    await screen.findByTestId("room-v6-editor-panel");
    fireEvent.click(screen.getByTestId("room-v6-editor-select-suggestion-title"));
    const width = screen.getByTestId("room-v6-editor-width") as HTMLInputElement;
    fireEvent.change(width, { target: { value: "50" } });
    expect(width.value).toBe("50");

    fireEvent.click(screen.getByTestId("room-v6-editor-reset-selected-layer"));
    expect((screen.getByTestId("room-v6-editor-width") as HTMLInputElement).value).toBe(
      String(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"].width),
    );
    expect((screen.getByTestId("room-v6-editor-height") as HTMLInputElement).value).toBe(
      String(ROOM_UI_VISUAL_LAYOUT_V6.internal["suggestion-title"].height),
    );
  });
});
