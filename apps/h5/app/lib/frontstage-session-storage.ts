export const FRONTSTAGE_SESSION_STORAGE_KEY = "erliu.frontstage.session";

export function buildFrontstageSessionBootstrapScript() {
  const storageKey = JSON.stringify(FRONTSTAGE_SESSION_STORAGE_KEY);

  return `
(() => {
  try {
    var pathname = window.location.pathname || "";
    var isVnextRoute = pathname === "/vnext" || pathname.indexOf("/vnext/") === 0;

    if (isVnextRoute) {
      var vnextParams = new URLSearchParams(window.location.search);
      var hasLegacySessionQuery = vnextParams.has("token") || vnextParams.has("account_token");

      if (!hasLegacySessionQuery) {
        return;
      }

      vnextParams.delete("token");
      vnextParams.delete("account_token");

      var vnextSearch = vnextParams.toString();
      var vnextHref = window.location.pathname + (vnextSearch ? "?" + vnextSearch : "") + window.location.hash;
      var vnextCurrentHref = window.location.pathname + window.location.search + window.location.hash;

      if (vnextHref !== vnextCurrentHref) {
        window.history.replaceState(window.history.state, "", vnextHref);
      }

      return;
    }

    if (pathname === "/beta" || pathname.indexOf("/beta/") === 0) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var token = (params.get("token") || "").trim();
    var accountToken = (params.get("account_token") || "").trim();

    if (!token && !accountToken) {
      return;
    }

    var stored = { token: null, accountToken: null };
    var rawValue = window.sessionStorage.getItem(${storageKey});

    if (rawValue) {
      try {
        var parsed = JSON.parse(rawValue);
        stored.token = typeof parsed.token === "string" && parsed.token.trim() ? parsed.token.trim() : null;
        stored.accountToken =
          typeof parsed.accountToken === "string" && parsed.accountToken.trim() ? parsed.accountToken.trim() : null;
      } catch (_error) {
        stored = { token: null, accountToken: null };
      }
    }

    var nextValue = {
      token: token || stored.token || null,
      accountToken: accountToken || stored.accountToken || null,
    };

    if (nextValue.token || nextValue.accountToken) {
      window.sessionStorage.setItem(${storageKey}, JSON.stringify(nextValue));
    } else {
      window.sessionStorage.removeItem(${storageKey});
    }

    params.delete("token");
    params.delete("account_token");

    var nextSearch = params.toString();
    var nextHref = window.location.pathname + (nextSearch ? "?" + nextSearch : "") + window.location.hash;
    var currentHref = window.location.pathname + window.location.search + window.location.hash;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  } catch (_error) {
    // Ignore pre-hydration storage failures and let client recovery continue.
  }
})();
`.trim();
}
