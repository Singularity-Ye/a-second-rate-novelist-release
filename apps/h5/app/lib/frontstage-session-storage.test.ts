import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFrontstageSessionBootstrapScript,
  FRONTSTAGE_SESSION_STORAGE_KEY,
} from "./frontstage-session-storage";

function runBootstrapScript() {
  const script = buildFrontstageSessionBootstrapScript();
  const fn = new Function(script);
  fn();
}

describe("frontstage session bootstrap script", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preloads session query into sessionStorage and strips visible url before hydration", () => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/profile/account?token=issued-before-hydration&story_id=story-bootstrap-001");

    runBootstrapScript();

    expect(window.sessionStorage.getItem(FRONTSTAGE_SESSION_STORAGE_KEY)).toContain("issued-before-hydration");
    expect(window.location.search).toBe("?story_id=story-bootstrap-001");
  });

  it("skips beta landing so beta invite query context can hydrate normally", () => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/beta?account_token=beta-prehydrate-001&invite_code=PHASE0-XHS-001");

    runBootstrapScript();

    expect(window.location.search).toContain("account_token=beta-prehydrate-001");
    expect(window.sessionStorage.getItem(FRONTSTAGE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("scrubs legacy session query from vNext routes without touching browser storage", () => {
    window.sessionStorage.clear();
    const storageSpies = [window.sessionStorage].flatMap((storage) => [
      vi.spyOn(storage, "getItem"),
      vi.spyOn(storage, "setItem"),
      vi.spyOn(storage, "removeItem"),
      vi.spyOn(storage, "clear"),
    ]);

    for (const pathname of ["/vnext", "/vnext/room"] as const) {
      window.history.replaceState(
        {},
        "",
        `${pathname}?story_id=story-vnext-001&token=vnext-must-scrub&account_token=vnext-account-must-scrub&view=latest#draft-section`,
      );

      runBootstrapScript();

      expect(window.location.pathname).toBe(pathname);
      expect(window.location.search).toBe("?story_id=story-vnext-001&view=latest");
      expect(window.location.hash).toBe("#draft-section");
    }

    for (const storageSpy of storageSpies) {
      expect(storageSpy).not.toHaveBeenCalled();
    }
  });
});
