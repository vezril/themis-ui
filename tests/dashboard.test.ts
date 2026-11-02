import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  currentYear,
  formatMoney,
  summariseInvoices,
  toLoaded,
  type InvoiceRow,
} from "@/lib/dashboard";

const row = (over: Partial<InvoiceRow>): InvoiceRow => ({
  id: "i1",
  number: "2026-0001",
  clientId: "c1",
  clientName: "Acme",
  issueDate: "2026-01-05",
  dueDate: "2026-02-04",
  currency: "CAD",
  subtotal: 100,
  taxTotal: 0,
  total: 100,
  status: "Issued",
  overdue: false,
  ...over,
});

describe("summariseInvoices", () => {
  it("is empty for no invoices", () => {
    expect(summariseInvoices([])).toEqual({ byCurrency: [], overdueCount: 0 });
  });

  it("counts Issued and Sent as outstanding and Paid as paid", () => {
    const s = summariseInvoices([
      row({ id: "a", status: "Issued", total: 100 }),
      row({ id: "b", status: "Sent", total: 50.25 }),
      row({ id: "c", status: "Paid", total: 200 }),
    ]);
    expect(s.byCurrency).toEqual([
      { currency: "CAD", outstanding: { count: 2, total: 150.25 }, paid: { count: 1, total: 200 } },
    ]);
  });

  it("leaves voided invoices out of every figure", () => {
    const s = summariseInvoices([row({ status: "Voided", total: 999, overdue: false })]);
    expect(s.byCurrency).toEqual([]);
  });

  it("groups per currency and never adds across them", () => {
    const s = summariseInvoices([
      row({ id: "a", currency: "CAD", total: 100 }),
      row({ id: "b", currency: "USD", total: 40 }),
    ]);
    expect(s.byCurrency.map((c) => [c.currency, c.outstanding.total])).toEqual([
      ["CAD", 100],
      ["USD", 40],
    ]);
  });

  it("counts overdue from the server flag and ignores the dates", () => {
    const s = summariseInvoices([
      row({ id: "a", dueDate: "1999-01-01", overdue: false }),
      row({ id: "b", dueDate: "2999-01-01", overdue: true }),
    ]);
    expect(s.overdueCount).toBe(1);
  });

  it("sums in cents so floating point drift cannot show", () => {
    const s = summariseInvoices([0.1, 0.2, 0.3].map((total, i) => row({ id: `i${i}`, total })));
    expect(s.byCurrency[0]?.outstanding.total).toBe(0.6);
  });
});

describe("currentYear", () => {
  it("uses the service's zone, not UTC", () => {
    // 2027-01-01T03:00Z is still 31 Dec 2026 at 22:00 in Toronto.
    expect(currentYear(new Date("2027-01-01T03:00:00Z"))).toBe(2026);
    expect(currentYear(new Date("2027-01-01T06:00:00Z"))).toBe(2027);
  });
});

describe("formatMoney", () => {
  it("shows the currency when one is known", () => {
    expect(formatMoney(1234.5, "CAD")).toContain("1,234.50");
    expect(formatMoney(1234.5, "CAD")).toMatch(/\$/);
  });

  it("omits any symbol when the currency is unknown", () => {
    expect(formatMoney(1234.5, undefined)).toBe("1,234.50");
  });
});

describe("categoryLabel", () => {
  it("spaces camel-cased categories", () => {
    expect(categoryLabel("HomeOffice")).toBe("Home office");
    expect(categoryLabel("Tools")).toBe("Tools");
  });
});

describe("toLoaded", () => {
  const res = (status: number, body: string) =>
    new Response(body, { status, headers: { "content-type": "application/json" } });

  it("returns the parsed body on 200", async () => {
    expect(await toLoaded<number[]>(res(200, "[1]"))).toEqual({ state: "ok", data: [1] });
  });

  it("treats a list 404 as an error, never as no items", async () => {
    const out = await toLoaded<unknown[]>(res(404, '{"error":"not found"}'));
    expect(out.state).toBe("error");
    expect(out).toMatchObject({ status: 404 });
  });

  it("reports 503 as not yet available", async () => {
    const out = await toLoaded(res(503, '{"error":"receipts are not available right now"}'));
    expect(out).toMatchObject({ state: "error", status: 503 });
    expect(out.state === "error" && out.message).toMatch(/not yet available/i);
  });

  it("carries the server's message for other failures", async () => {
    const out = await toLoaded(res(400, '{"error":"the year must be four digits, such as 2026"}'));
    expect(out.state === "error" && out.message).toContain("four digits");
  });

  it("still returns an error when the body is not JSON", async () => {
    const out = await toLoaded(res(500, "<html>boom</html>"));
    expect(out).toMatchObject({ state: "error", status: 500 });
  });

  it("treats a 200 with an unparseable body as an error", async () => {
    const out = await toLoaded(res(200, "<html>"));
    expect(out.state).toBe("error");
  });
});
