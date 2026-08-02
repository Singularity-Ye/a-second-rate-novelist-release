import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next output isolation", () => {
  it("keeps production output on .next unless an explicit isolated directory is configured", () => {
    expect(nextConfig.distDir).toBe(".next");
  });
});

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

describe("local backend rewrite", () => {
  it("strips the browser-only /api prefix only in development", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await expect(nextConfig.rewrites?.()).resolves.toContainEqual({
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/:path*",
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
