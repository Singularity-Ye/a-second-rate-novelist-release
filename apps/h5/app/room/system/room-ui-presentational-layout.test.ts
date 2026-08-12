import { describe, expect, it } from "vitest";
import {
  ROOM_UI_VISUAL_LAYOUT_V6,
  ROOM_UI_SURFACE_GEOMETRY_V6,
  roomUiBackdropStyle,
  roomUiInternalVisualStyle,
  roomUiSuggestionTypographyStyle,
  roomUiNestedVisualStyle,
  roomUiSurfaceStyle,
  roomUiVisualSlotStyle,
} from "./room-ui-presentational-layout";

describe("room UI v6 formal visual layout", () => {
  it("contains presentation geometry only", () => {
    expect(ROOM_UI_VISUAL_LAYOUT_V6.stage).toEqual({ width: 1536, height: 1024 });
    expect(Object.keys(ROOM_UI_VISUAL_LAYOUT_V6.geometry)).toEqual([
      "title",
      "status",
      "chat",
      "suggestions",
      "progress",
    ]);

    const serialized = JSON.stringify(ROOM_UI_VISUAL_LAYOUT_V6);
    expect(serialized).not.toContain("reference");
    expect(serialized).not.toContain("fixture");
    expect(serialized).not.toContain("localStorage");
    expect(serialized).not.toContain("route");
  });

  it("compiles the approved outer composition into CSS variables", () => {
    expect(roomUiBackdropStyle()).toMatchObject({
      "--layout-x": "10px",
      "--layout-y": "-18.85px",
      "--layout-scale": "1",
      "--layout-width-factor": "1",
      "--layout-height-factor": "0.84",
    });
    expect(roomUiVisualSlotStyle("title")).toMatchObject({
      "--slot-x": "31.5%",
      "--slot-y": "2.5%",
      "--slot-width": "37%",
      "--slot-height": "16%",
      "--layout-x": "74.86px",
      "--layout-y": "-3.57px",
      "--layout-scale": "0.95",
    });
    expect(roomUiVisualSlotStyle("chat")).toMatchObject({
      "--slot-height": "69.93%",
      "--layout-x": "-6.71px",
      "--layout-y": "25.86px",
      "--layout-scale": "1.65",
      "--layout-width-factor": "0.69",
    });
    expect(roomUiVisualSlotStyle("suggestions")).toMatchObject({
      "--layout-x": "7.15px",
      "--layout-y": "43.53px",
      "--layout-scale": "1.6148",
      "--layout-tilt": "2deg",
      "--layout-width-factor": "0.93",
    });
    expect(roomUiVisualSlotStyle("progress")).toMatchObject({
      "--slot-x": "18.97%",
      "--slot-y": "74.18%",
      "--slot-width": "52.122%",
      "--slot-height": "11.3288%",
      "--layout-y": "-60.19px",
    });
  });

  it("compiles the approved formal-live Surface camera without runtime calibration", () => {
    expect(ROOM_UI_SURFACE_GEOMETRY_V6).toEqual({
      x: -126.72,
      y: -31.7,
      scale: 1.8,
      tilt: 0,
      width: 0.87,
      height: 0.892857,
    });
    expect(roomUiSurfaceStyle()).toMatchObject({
      "--surface-layout-x": "-126.72px",
      "--surface-layout-y": "-31.7px",
      "--surface-layout-scale": "1.8",
      "--surface-layout-flow-width": "156.6%",
      "--surface-layout-aspect-ratio": "1336.32 / 914.285568",
    });
  });

  it("keeps conversation, composer, avatar, and progress sublayers independently consumable", () => {
    expect(roomUiNestedVisualStyle("conversation")).toMatchObject({
      "--layout-x": "1.29px",
      "--layout-y": "0.85px",
      "--layout-scale": "0.8084",
      "--layout-height-factor": "0.74",
    });
    expect(roomUiNestedVisualStyle("composer")).toMatchObject({
      "--layout-x": "6px",
      "--layout-y": "-15.29px",
      "--layout-width-factor": "0.98",
      "--layout-height-factor": "0.2",
    });
    expect(roomUiNestedVisualStyle("status-copy")).toMatchObject({
      "--layout-scale": "1",
      "--layout-width-factor": "1",
      "--layout-height-factor": "1",
    });
    expect(roomUiNestedVisualStyle("suggestions-copy")).toMatchObject({
      "--layout-x": "0px",
      "--layout-y": "0px",
    });
    expect(roomUiInternalVisualStyle("status-avatar")).toMatchObject({
      "--internal-x": "25.6%",
      "--internal-y": "14.9%",
      "--internal-width": "17.9%",
      "--internal-height": "14.6%",
    });
    expect(roomUiInternalVisualStyle("status-scene")).toMatchObject({
      "--internal-x": "25.14%",
      "--internal-y": "34.36%",
      "--internal-width": "56%",
    });
    expect(roomUiInternalVisualStyle("suggestion-title")).toMatchObject({
      "--internal-x": "12.23%",
      "--internal-y": "-21.67%",
      "--internal-height": "96.5%",
    });
    expect(roomUiInternalVisualStyle("suggestion-guide-library")).toMatchObject({
      "--internal-x": "84.2%",
      "--internal-width": "7.8%",
      "--internal-height": "8.5%",
    });
    expect(roomUiInternalVisualStyle("suggestion-card-life-now")).toMatchObject({
      "--internal-x": "4%",
      "--internal-width": "92%",
      "--internal-height": "100%",
    });
    expect(roomUiSuggestionTypographyStyle("suggestion-card-creative-writing")).toMatchObject({
      "--suggestion-title-scale": "1",
      "--suggestion-detail-scale": "1",
      "--suggestion-detail-line-height": "1.18",
      "--suggestion-detail-width": "100%",
    });
    expect(roomUiInternalVisualStyle("progress-review-text")).toMatchObject({
      "--internal-x": "72.1%",
      "--internal-y": "51.6%",
      "--internal-scale": "1.07",
    });
  });
});
