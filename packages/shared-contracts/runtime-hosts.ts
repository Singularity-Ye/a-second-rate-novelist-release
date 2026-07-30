const DEFAULT_API_BASE_URL = "http://127.0.0.1:4000";

type ResolveRuntimeApiBaseUrlOptions = {
  fallbackBaseUrl?: string;
  runtimeOrigin?: string | null;
  strict?: boolean;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalHost(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function resolveRuntimeApiBaseUrl(
  explicitBaseUrl?: string | null,
  optionsOrFallback: ResolveRuntimeApiBaseUrlOptions | string = DEFAULT_API_BASE_URL,
): string {
  const options =
    typeof optionsOrFallback === "string" ? { fallbackBaseUrl: optionsOrFallback } : optionsOrFallback;
  const normalizedExplicit = explicitBaseUrl?.trim() ? trimTrailingSlash(explicitBaseUrl.trim()) : null;
  const fallbackBaseUrl = options.fallbackBaseUrl ?? DEFAULT_API_BASE_URL;
  const runtimeOrigin =
    options.runtimeOrigin ??
    (typeof window !== "undefined" && window.location?.origin
      ? trimTrailingSlash(window.location.origin)
      : null);

  if (!normalizedExplicit && options.strict) {
    throw new Error("Missing explicit runtime API base URL in strict mode.");
  }

  if (runtimeOrigin && !isLocalHost(runtimeOrigin) && normalizedExplicit && isLocalHost(normalizedExplicit)) {
    return `${runtimeOrigin}/api`;
  }

  return normalizedExplicit ?? fallbackBaseUrl;
}
