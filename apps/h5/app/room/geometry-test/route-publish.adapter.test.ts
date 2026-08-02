import { describe, expect, it } from "vitest";
import { createInitialEditorDraft, type EditorDraft } from "./route-editor.model";
import { adaptEditorDraftToFormalSnapshot } from "./route-publish.adapter";

describe("route publish adapter", () => {
  it("normalizes editor pixels without mutating the source draft", () => {
    const draft = createInitialEditorDraft("study");
    const before = JSON.stringify(draft);
    const result = adaptEditorDraftToFormalSnapshot(draft, { sourceId: "study-v2" });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.schema).toBe("erliu.formal-route-snapshot");
    expect(result.snapshot?.source.sourceId).toBe("study-v2");
    expect(result.snapshot?.points.door).toMatchObject({
      x: 1392 / 1774,
      y: 419 / 887,
      pixel: { x: 1392, y: 419 },
    });
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("preserves route order, endpoint identity, transitions, and derived scale", () => {
    const draft = createInitialEditorDraft("study");
    const result = adaptEditorDraftToFormalSnapshot(draft);
    const route = result.snapshot?.routes["seat-to-door"];

    expect(route).toBeDefined();
    expect(route?.pointIds[0]).toBe("seat-right");
    expect(route?.pointIds.at(-1)).toBe("door");
    expect(route?.transitions.some((transition) => transition.pointId === "door")).toBe(true);
    expect(route?.transitions.find((transition) => transition.pointId === "door")?.progress).toBe(1);
    expect(route?.durationMs).toBeGreaterThan(0);
    expect(result.snapshot?.points["seat-right"]?.scale).toBeGreaterThan(0);
  });

  it("fails closed when a route references a missing point", () => {
    const original = createInitialEditorDraft("study");
    const draft: EditorDraft = {
      ...original,
      routes: { ...original.routes, "broken-route": ["missing-point"] },
    };
    const result = adaptEditorDraftToFormalSnapshot(draft);

    expect(result.ok).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-editor-draft", severity: "error" }),
    ]));
  });
});
