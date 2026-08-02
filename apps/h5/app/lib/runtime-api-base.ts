import { resolveRuntimeApiBaseUrl } from "@erliu/shared-contracts/runtime-hosts";

declare global {
  interface Window {
    __ERLIU_RUNTIME_API_BASE_URL__?: string;
    __ERLIU_STRICT_RUNTIME_API_BASE__?: boolean;
  }
}

function readRuntimeApiBaseUrl() {
  if (typeof window !== "undefined" && typeof window.__ERLIU_RUNTIME_API_BASE_URL__ === "string") {
    return window.__ERLIU_RUNTIME_API_BASE_URL__;
  }

  return process.env.NEXT_PUBLIC_API_BASE_URL;
}

function isStrictRuntimeApiBaseRequired() {
  if (typeof window !== "undefined" && typeof window.__ERLIU_STRICT_RUNTIME_API_BASE__ === "boolean") {
    return window.__ERLIU_STRICT_RUNTIME_API_BASE__;
  }

  return process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE === "true";
}

export function resolveH5ApiBaseUrl() {
  return resolveRuntimeApiBaseUrl(readRuntimeApiBaseUrl(), {
    strict: isStrictRuntimeApiBaseRequired(),
    runtimeOrigin: typeof window !== "undefined" && window.location?.origin ? window.location.origin : null,
  });
}
