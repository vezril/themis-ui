import { apiBase } from "@/lib/config";
import { toLoaded, type Loaded } from "@/lib/dashboard";

type Query = Readonly<Record<string, string | number>>;

/** The browser's only door to the data: same-origin BFF routes, never themis-service itself. */
export async function getJson<T>(
  path: string,
  query: Query = {},
  fetchFn: typeof fetch = fetch,
): Promise<Loaded<T>> {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  try {
    const res = await fetchFn(`${apiBase()}/${path}${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    return await toLoaded<T>(res);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_PUBLIC_THEMIS_API_BASE")) throw e;
    return { state: "error", status: null, message: "Could not reach the server. Check your connection and retry." };
  }
}
