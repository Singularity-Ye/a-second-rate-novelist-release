const INTERNAL_ORIGIN = "http://127.0.0.1:3000";

export const INTERNAL_SURFACE_QUERY_KEY = "internal_surface";

export type InternalSurfaceAccess = "acceptance" | "history" | "development";

export interface NonProductSurfaceDefinition {
  access: InternalSurfaceAccess;
  label: string;
  title: string;
  description: string;
  pathnamePrefixes: string[];
}

export type SearchParamRecord = Record<string, string | string[] | undefined>;

type SearchParamsLike = Pick<URLSearchParams, "get">;

const NON_PRODUCT_SURFACES: NonProductSurfaceDefinition[] = [
  {
    access: "acceptance",
    label: "内部验收",
    title: "这个入口只保留给内部验收",
    description:
      "它继续保留给 shared-dev 验收使用，但已经退出主产品信息架构，不再作为普通用户的正常入口。",
    pathnamePrefixes: ["/demo-flow"],
  },
  {
    access: "history",
    label: "历史回看",
    title: "这类历史页已经退出主产品主链",
    description:
      "archive 页面只保留给历史回看和纠错验证，不再作为普通用户在主产品里继续点击的下一步。",
    pathnamePrefixes: ["/archive/intents", "/archive/profile"],
  },
  {
    access: "development",
    label: "开发调试",
    title: "开发调试面不再对普通用户开放",
    description:
      "telemetry dev 面只保留给开发与受控验证，不再作为主产品 host 上的正常可达页面。",
    pathnamePrefixes: ["/dev/telemetry"],
  },
] as const;

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

function readSearchParamValue(input: SearchParamRecord, key: string): string | null {
  const value = input[key];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

export function toSearchParamsLike(input: SearchParamRecord): SearchParamsLike {
  return {
    get(key: string) {
      return readSearchParamValue(input, key);
    },
  };
}

export function classifyNonProductSurface(pathname: string): NonProductSurfaceDefinition | null {
  const normalizedPathname = normalizePathname(pathname);

  return (
    NON_PRODUCT_SURFACES.find((surface) =>
      surface.pathnamePrefixes.some((prefix) => {
        const normalizedPrefix = normalizePathname(prefix);
        return (
          normalizedPathname === normalizedPrefix ||
          normalizedPathname.startsWith(`${normalizedPrefix}/`)
        );
      }),
    ) ?? null
  );
}

export function shouldAllowNonProductSurface(
  pathname: string,
  searchParams: SearchParamsLike,
): boolean {
  const surface = classifyNonProductSurface(pathname);

  if (!surface) {
    return true;
  }

  return searchParams.get(INTERNAL_SURFACE_QUERY_KEY) === surface.access;
}

export function appendInternalSurfaceAccess(
  target: string,
  access: InternalSurfaceAccess,
): string {
  const url = new URL(target, INTERNAL_ORIGIN);
  url.searchParams.set(INTERNAL_SURFACE_QUERY_KEY, access);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withSurfaceBoundaryContext(
  target: string,
  searchParams: SearchParamRecord,
): string {
  const url = new URL(target, INTERNAL_ORIGIN);

  for (const key of ["token", "account_token"] as const) {
    const value = readSearchParamValue(searchParams, key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
