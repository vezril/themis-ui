import { describe, expect, it, vi } from "vitest";
import { proxyGet, type BffConfig } from "@/lib/bff";

const SERVICE = "http://themis-service.themis.svc.cluster.local:8080";

type Upstream = { status?: number; body?: string; contentType?: string };

function setup(upstream: Upstream = {}, over: Partial<BffConfig> = {}) {
  const fetchFn = vi.fn<typeof fetch>(
    async () =>
      new Response(upstream.body ?? "[]", {
        status: upstream.status ?? 200,
        headers: { "content-type": upstream.contentType ?? "application/json" },
      }),
  );
  const config: BffConfig = {
    serviceUrl: SERVICE,
    gatewaySecret: undefined,
    fetch: fetchFn as unknown as typeof fetch,
    ...over,
  };
  const call = (path: string, query = "") => proxyGet(path.split("/"), new URLSearchParams(query), config);
  return { fetchFn, call };
}

const urlOf = (fetchFn: ReturnType<typeof setup>["fetchFn"]) => String(fetchFn.mock.calls[0]?.[0]);
const headersOf = (fetchFn: ReturnType<typeof setup>["fetchFn"]) =>
  new Headers(fetchFn.mock.calls[0]?.[1]?.headers);

describe("proxyGet path mapping", () => {
  it("maps an allowlisted path under /api/v1 and forwards year", async () => {
    const { fetchFn, call } = setup();
    await call("invoices", "year=2026");
    expect(urlOf(fetchFn)).toBe(`${SERVICE}/api/v1/invoices?year=2026`);
  });

  it("forwards year and basis on reports", async () => {
    const { fetchFn, call } = setup();
    await call("reports/2026", "basis=paid");
    expect(urlOf(fetchFn)).toBe(`${SERVICE}/api/v1/reports/2026?basis=paid`);
  });

  it("maps health to the service root, not /api/v1", async () => {
    const { fetchFn, call } = setup({ body: '{"status":"UP"}' });
    await call("health");
    expect(urlOf(fetchFn)).toBe(`${SERVICE}/health`);
  });

  it("drops every query parameter except year and basis", async () => {
    const { fetchFn, call } = setup();
    await call("invoices", "year=2026&stage=paid&evil=1&basis=issued");
    expect(urlOf(fetchFn)).toBe(`${SERVICE}/api/v1/invoices?year=2026&basis=issued`);
  });

  it("tolerates a trailing slash on the service URL", async () => {
    const { fetchFn, call } = setup({}, { serviceUrl: `${SERVICE}/` });
    await call("profile");
    expect(urlOf(fetchFn)).toBe(`${SERVICE}/api/v1/profile`);
  });
});

describe("proxyGet allowlist", () => {
  it.each([
    "admin",
    "invoices/abc/void",
    "invoices/abc/pdf",
    "exports/2026/workbook",
    "invoices/..%2Fprofile",
    "invoices/../profile",
    "reports/20x6",
    "health/extra",
    "",
  ])("refuses %j with 404 and never calls the service", async (path) => {
    const { fetchFn, call } = setup();
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["invoices", "invoices/abc-123", "expenses", "expenses/e1", "clients", "clients/c1", "profile", "integrity", "reports/2026", "health"])(
    "allows %s",
    async (path) => {
      const { fetchFn, call } = setup();
      await call(path);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    },
  );
});

describe("proxyGet status pass-through", () => {
  it.each([200, 400, 404, 409, 500, 503])("passes %i through untouched", async (status) => {
    const { call } = setup({ status, body: `{"error":"x${status}"}` });
    const res = await call("invoices", "year=2026");
    expect(res.status).toBe(status);
    expect(await res.text()).toBe(`{"error":"x${status}"}`);
  });

  it("surfaces a list 404 as a 404, never an empty list", async () => {
    const { call } = setup({ status: 404, body: '{"error":"no route"}' });
    const res = await call("expenses", "year=2026");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toBe("[]");
  });

  it("passes a receipt 503 through so the UI can say not yet available", async () => {
    const { call } = setup({ status: 503, body: '{"error":"receipts are not available right now"}' });
    const res = await call("expenses/e1/receipts/" + "a".repeat(64));
    expect(res.status).toBe(503);
  });

  it("keeps the upstream content type and forbids caching", async () => {
    const { call } = setup({ body: "{}", contentType: "application/json; charset=utf-8" });
    const res = await call("profile");
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("proxyGet gateway secret", () => {
  it("sends X-Themis-Gateway-Secret when configured", async () => {
    const { fetchFn, call } = setup({}, { gatewaySecret: "s3cret" });
    await call("invoices");
    expect(headersOf(fetchFn).get("X-Themis-Gateway-Secret")).toBe("s3cret");
  });

  it("sends no header when the secret is absent", async () => {
    const { fetchFn, call } = setup();
    await call("invoices");
    expect(headersOf(fetchFn).has("X-Themis-Gateway-Secret")).toBe(false);
  });

  it("treats an empty secret as absent", async () => {
    const { fetchFn, call } = setup({}, { gatewaySecret: "" });
    await call("invoices");
    expect(headersOf(fetchFn).has("X-Themis-Gateway-Secret")).toBe(false);
  });

  it("never echoes the secret back to the browser", async () => {
    const { call } = setup({}, { gatewaySecret: "s3cret" });
    const res = await call("invoices");
    expect([...res.headers.values()].join("|")).not.toContain("s3cret");
  });
});

describe("proxyGet failures", () => {
  it("answers 500 naming the missing setting when THEMIS_SERVICE_URL is unset", async () => {
    const { fetchFn, call } = setup({}, { serviceUrl: undefined });
    const res = await call("invoices");
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("THEMIS_SERVICE_URL");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("answers 502 when the service cannot be reached", async () => {
    const { call } = setup({}, {
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    const res = await call("invoices");
    expect(res.status).toBe(502);
    expect(JSON.parse(await res.text()).error).toMatch(/themis-service/i);
  });
});
