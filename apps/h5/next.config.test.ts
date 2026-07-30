import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("vNext referrer policy", () => {
  it("applies no-referrer only to the vNext route family", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const policyRules = rules.filter((rule) =>
      rule.headers?.some(
        (header) =>
          header.key.toLowerCase() === "referrer-policy" &&
          header.value === "no-referrer",
      ),
    );

    expect(policyRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/vnext" }),
        expect.objectContaining({ source: "/vnext/:path*" }),
      ]),
    );
    expect(policyRules.every((rule) => rule.source.startsWith("/vnext"))).toBe(true);
  });
});
