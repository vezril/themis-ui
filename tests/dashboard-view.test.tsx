import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard";

type Reply = { status?: number; body: unknown };
type Replies = Record<string, Reply>;

const NOW = new Date("2026-06-15T12:00:00Z");

const REPORT = {
  year: 2026,
  basis: "issued",
  income: { subtotal: 5000, gst: 0, qst: 0, total: 5000 },
  expenses: {
    total: 1200.5,
    gstPaid: 0,
    qstPaid: 0,
    byCategory: [
      { category: "Tools", total: 1000.5, gstPaid: 0, qstPaid: 0 },
      { category: "HomeOffice", total: 200, gstPaid: 0, qstPaid: 0 },
      { category: "Other", total: 0, gstPaid: 0, qstPaid: 0 },
    ],
  },
  net: 3799.5,
};

const invoice = (over: Record<string, unknown>) => ({
  id: "i", number: "2026-0001", clientId: "c", clientName: "Acme", issueDate: "2026-01-05",
  dueDate: "2026-02-04", currency: "CAD", subtotal: 100, taxTotal: 0, total: 100,
  status: "Issued", overdue: false, ...over,
});

function stubFetch(replies: Replies) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const key = Object.keys(replies).find((k) => url.startsWith(`/api/themis/${k}`));
      const reply = key ? replies[key] : undefined;
      if (!reply) return new Response('{"error":"unstubbed"}', { status: 599 });
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }),
  );
  return calls;
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_THEMIS_API_BASE", "/api/themis"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const healthy: Replies = {
  profile: { body: { businessName: "Calvin", currency: "CAD" } },
  reports: { body: REPORT },
};

describe("Dashboard", () => {
  it("shows outstanding, paid and the server's overdue count", async () => {
    stubFetch({
      ...healthy,
      invoices: {
        body: [
          invoice({ id: "a", status: "Issued", total: 100, overdue: true }),
          invoice({ id: "b", status: "Sent", total: 50 }),
          invoice({ id: "c", status: "Paid", total: 400 }),
        ],
      },
    });
    render(<Dashboard now={NOW} />);
    const outstanding = await screen.findByRole("region", { name: /outstanding/i });
    expect(outstanding).toHaveTextContent("$150.00");
    expect(outstanding).toHaveTextContent("2 invoices");
    expect(screen.getByRole("region", { name: /paid/i })).toHaveTextContent("$400.00");
    expect(screen.getByRole("region", { name: /overdue/i })).toHaveTextContent("1 overdue");
  });

  it("requests the invoice list for the service-zone year", async () => {
    const calls = stubFetch({ ...healthy, invoices: { body: [] } });
    render(<Dashboard now={new Date("2027-01-01T03:00:00Z")} />);
    await screen.findByText(/No invoices in 2026/);
    expect(calls).toContain("/api/themis/invoices?year=2026");
  });

  it("shows a designed empty state for a successful empty list", async () => {
    stubFetch({ ...healthy, invoices: { body: [] } });
    render(<Dashboard now={NOW} />);
    expect(await screen.findByText("No invoices in 2026")).toBeInTheDocument();
  });

  it("renders a list 404 as an error with Retry, never as no invoices", async () => {
    stubFetch({ ...healthy, invoices: { status: 404, body: { error: "not found" } } });
    render(<Dashboard now={NOW} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load invoices");
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/No invoices/)).not.toBeInTheDocument();
  });

  it("shows expense totals by category and the net from the report", async () => {
    stubFetch({ ...healthy, invoices: { body: [] } });
    render(<Dashboard now={NOW} />);
    const expenses = await screen.findByRole("region", { name: /expenses by category/i });
    expect(within(expenses).getByText("Home office")).toBeInTheDocument();
    expect(within(expenses).getByText("$1,000.50")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /net/i })).toHaveTextContent("$3,799.50");
  });

  it("leaves the currency symbol off when there is no profile", async () => {
    stubFetch({
      ...healthy,
      profile: { status: 404, body: { error: "business profile not configured" } },
      invoices: { body: [] },
    });
    render(<Dashboard now={NOW} />);
    const net = await screen.findByRole("region", { name: /net/i });
    await waitFor(() => expect(net).toHaveTextContent("3,799.50"));
    expect(net).not.toHaveTextContent("$");
  });

  it("shows a report failure as its own error and keeps the invoices", async () => {
    stubFetch({
      ...healthy,
      reports: { status: 503, body: { error: "reports are not available right now" } },
      invoices: { body: [invoice({ status: "Issued" })] },
    });
    render(<Dashboard now={NOW} />);
    expect(await screen.findByRole("region", { name: /outstanding/i })).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the year report");
    expect(alert).toHaveTextContent(/not yet available/i);
  });
});
