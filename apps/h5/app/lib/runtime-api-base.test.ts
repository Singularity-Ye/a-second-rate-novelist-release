import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

describe("resolve runtime api base url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE;
  });

  it("uses same-origin /api when the page is hosted publicly but the configured api base is local", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://shared-dev-preview.loca.lt",
      },
    });

    window.__ERLIU_RUNTIME_API_BASE_URL__ = "http://127.0.0.1:4100";

    expect(resolveH5ApiBaseUrl()).toBe("https://shared-dev-preview.loca.lt/api");
  });

  it("still uses same-origin /api in strict mode when a local api base is explicitly configured", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://shared-dev-preview.loca.lt",
      },
    });

    process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE = "true";
    window.__ERLIU_RUNTIME_API_BASE_URL__ = "http://127.0.0.1:4100";

    expect(resolveH5ApiBaseUrl()).toBe("https://shared-dev-preview.loca.lt/api");
  });

  it("keeps an explicit public api base in the browser", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://shared-dev-preview.loca.lt",
      },
    });

    window.__ERLIU_RUNTIME_API_BASE_URL__ = "https://api.example.com/";

    expect(resolveH5ApiBaseUrl()).toBe("https://api.example.com");
  });

  it("still falls back to localhost on the server outside strict verification", () => {
    expect(resolveH5ApiBaseUrl()).toBe("http://127.0.0.1:4000");
  });

  it("fails fast in strict mode when no explicit local api base exists", () => {
    process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE = "true";

    expect(() => resolveH5ApiBaseUrl()).toThrow(/Missing explicit runtime API base URL/);
  });

  it("fails fast in browser strict mode when no explicit api base exists", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://shared-dev-preview.loca.lt",
      },
    });

    process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE = "true";

    expect(() => resolveH5ApiBaseUrl()).toThrow(/Missing explicit runtime API base URL/);
  });
});
