type SearchParamsLike = Pick<URLSearchParams, "get">;
type NavigationOptions = {
  preserveSessionQuery?: boolean;
};

function stripSessionContext(url: URL) {
  url.searchParams.delete("token");
  url.searchParams.delete("account_token");
}

function applySessionContext(
  url: URL,
  input: {
    token?: string | null | undefined;
    accountToken?: string | null | undefined;
  },
  options?: NavigationOptions,
) {
  if (!options?.preserveSessionQuery) {
    stripSessionContext(url);
    return;
  }

  const token = input.token?.trim();
  const accountToken = input.accountToken?.trim();

  if (token) {
    url.searchParams.delete("account_token");
    if (!url.searchParams.has("token")) {
      url.searchParams.set("token", token);
    }
    return;
  }

  if (accountToken && !url.searchParams.has("account_token")) {
    url.searchParams.set("account_token", accountToken);
  }
}

export function withH5Context(target: string, searchParams: SearchParamsLike, options?: NavigationOptions): string {
  const url = new URL(target, "http://127.0.0.1:3000");
  applySessionContext(url, {
    token: searchParams.get("token"),
    accountToken: searchParams.get("account_token"),
  }, options);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeInternalHref(target: string): string {
  const url = new URL(target, "http://127.0.0.1:3000");
  stripSessionContext(url);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withSessionContext(
  target: string,
  input: {
    token?: string | null | undefined;
    accountToken?: string | null | undefined;
  },
  options?: NavigationOptions,
): string {
  const url = new URL(target, "http://127.0.0.1:3000");
  applySessionContext(url, input, options);

  return `${url.pathname}${url.search}${url.hash}`;
}
