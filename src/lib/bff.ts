/**
 * The same-origin BFF's logic, kept free of Next so it is testable without a server.
 *
 * The browser only ever calls `/api/themis/*`; this module turns such a request into a server-side
 * call to themis-service. Three rules are load-bearing:
 *  - only allowlisted GET paths are reachable, and only `year`/`basis` are forwarded;
 *  - the upstream status is passed through untouched (a list 404 must stay a 404);
 *  - the gateway secret, if configured, is attached here and never shown to the browser.
 */

const ID = "[A-Za-z0-9_-]{1,128}";

/** Browser-facing path (below `/api/themis`) -> where it lives on themis-service. */
const ROUTES: ReadonlyArray<{ readonly pattern: RegExp; readonly prefix: "/api/v1" | "" }> = [
  // Health is mounted at the service root, outside /api/v1 and outside the gateway guard.
  { pattern: /^health$/, prefix: "" },
  { pattern: /^profile$/, prefix: "/api/v1" },
  { pattern: /^integrity$/, prefix: "/api/v1" },
  { pattern: new RegExp(`^(invoices|expenses|clients)(/${ID})?$`), prefix: "/api/v1" },
  { pattern: /^reports\/\d{4}$/, prefix: "/api/v1" },
  // Answers 503 by design while receipts are off; passed through so the UI can say so.
  { pattern: new RegExp(`^expenses/${ID}/receipts/[a-f0-9]{64}$`), prefix: "/api/v1" },
];

const FORWARDED_PARAMS = ["year", "basis"] as const;
const UPSTREAM_TIMEOUT_MS = 10_000;

export const GATEWAY_SECRET_HEADER = "X-Themis-Gateway-Secret";

export type BffConfig = {
  /** Server-side `THEMIS_SERVICE_URL`. */
  readonly serviceUrl: string | undefined;
  /** Server-side `THEMIS_GATEWAY_SECRET`; absent means the service runs with `mode: none`. */
  readonly gatewaySecret: string | undefined;
  readonly fetch: typeof fetch;
};

/** Calculation: the upstream path for a browser path, or null when it is not allowlisted. */
export function upstreamPath(segments: readonly string[]): string | null {
  const joined = segments.join("/");
  const route = ROUTES.find((r) => r.pattern.test(joined));
  return route ? `${route.prefix}/${joined}` : null;
}

/** Calculation: the query string to forward — `year` and `basis` only, in a fixed order. */
export function forwardedQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const name of FORWARDED_PARAMS) {
    const value = params.get(name);
    if (value !== null) kept.set(name, value);
  }
  const query = kept.toString();
  return query === "" ? "" : `?${query}`;
}

const json = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function proxyGet(
  segments: readonly string[],
  search: URLSearchParams,
  config: BffConfig,
): Promise<Response> {
  const path = upstreamPath(segments);
  if (path === null) return json(404, "not found");
  if (!config.serviceUrl) return json(500, "THEMIS_SERVICE_URL is not configured");

  const url = `${config.serviceUrl.replace(/\/+$/, "")}${path}${forwardedQuery(search)}`;
  const headers = new Headers({ accept: "application/json" });
  if (config.gatewaySecret) headers.set(GATEWAY_SECRET_HEADER, config.gatewaySecret);

  try {
    const upstream = await config.fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return json(502, "themis-service could not be reached");
  }
}
