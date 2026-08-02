import { describe, expect, it } from "vitest";
import { createFieldworkPostcard } from "./life-postcards";

describe("life postcards", () => {
  it("uses the legacy entrance master as a graceful fieldwork visual", () => {
    const postcard = createFieldworkPostcard("terrace-greenery", "terrace-city-look", 1_752_000_000_000);

    expect(postcard.imageSrc).toBe("/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp");
    expect(postcard.routeNote).toContain("露台");
    expect(postcard.message.length).toBeGreaterThan(20);
    expect(postcard.sticker).toBeTruthy();
  });
});
