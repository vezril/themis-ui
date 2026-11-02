import { afterEach, describe, expect, it, vi } from "vitest";
import { apiBase } from "@/lib/config";
import { getJson } from "@/lib/api";

afterEach(() => vi.unstubAllEnvs());

describe("apiBase", () => {
  it("fails loudly when NEXT_PUBLIC_THEMIS_API_BASE was not baked in", () => {
    vi.stubEnv("NEXT_PUBLIC_THEMIS_API_BASE", "");
    expect(() => apiBase()).toThrow(/NEXT_PUBLIC_THEMIS_API_BASE/);
  });

  it("returns the baked value without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_THEMIS_API_BASE", "/api/themis/");
    expect(apiBase()).toBe("/api/themis");
  });
});

describe("getJson", () => {
  it("calls the same-origin BFF, never the service", async () => {
    vi.stubEnv("NEXT_PUBLIC_THEMIS_API_BASE", "/api/themis");
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("[]", { status: 200 }));
    const out = await getJson<unknown[]>("invoices", { year: 2026 }, fetchFn);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/themis/invoices?year=2026");
    expect(out).toEqual({ state: "ok", data: [] });
  });

  it("surfaces a network failure as an error with retryable wording", async () => {
    vi.stubEnv("NEXT_PUBLIC_THEMIS_API_BASE", "/api/themis");
    const fetchFn = async () => {
      throw new TypeError("Failed to fetch");
    };
    const out = await getJson("health", {}, fetchFn as unknown as typeof fetch);
    expect(out).toMatchObject({ state: "error", status: null });
  });
});
