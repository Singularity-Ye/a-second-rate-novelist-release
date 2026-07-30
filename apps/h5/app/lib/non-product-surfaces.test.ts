import { describe, expect, it } from "vitest";
import {
  appendInternalSurfaceAccess,
  classifyNonProductSurface,
  shouldAllowNonProductSurface,
} from "./non-product-surfaces";

describe("non-product surfaces", () => {
  it("classifies acceptance, history, and development-only routes", () => {
    expect(classifyNonProductSurface("/demo-flow")?.access).toBe("acceptance");
    expect(classifyNonProductSurface("/archive/profile")?.access).toBe("history");
    expect(classifyNonProductSurface("/archive/intents")?.access).toBe("history");
    expect(classifyNonProductSurface("/dev/telemetry")?.access).toBe("development");
    expect(classifyNonProductSurface("/room")).toBeNull();
  });

  it("requires an explicit internal surface flag before allowing the real page", () => {
    expect(shouldAllowNonProductSurface("/archive/profile", new URLSearchParams(""))).toBe(false);
    expect(
      shouldAllowNonProductSurface("/archive/profile", new URLSearchParams("internal_surface=history")),
    ).toBe(true);
    expect(
      shouldAllowNonProductSurface("/dev/telemetry", new URLSearchParams("internal_surface=history")),
    ).toBe(false);
  });

  it("preserves existing query params when appending internal access", () => {
    expect(appendInternalSurfaceAccess("/demo-flow?token=fake-token", "acceptance")).toBe(
      "/demo-flow?token=fake-token&internal_surface=acceptance",
    );
  });
});
