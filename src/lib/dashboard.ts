/**
 * Types mirroring themis-service's JSON (JsonFormats / ReportRoute / HealthRoutes) and the pure
 * calculations the dashboard is drawn from. No I/O here.
 */

// ---------------------------------------------------------------- wire types

export type InvoiceStatus = "Issued" | "Sent" | "Paid" | "Voided";

/** `JsonFormats.invoiceRow`: absent optionals are omitted, not null. */
export type InvoiceRow = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  status: InvoiceStatus;
  /** Decided by the service against its own "today" (America/Toronto). Never recompute. */
  overdue: boolean;
  sentOn?: string;
  paidOn?: string;
  voidedOn?: string;
};

export type ExpenseCategory = "Tools" | "Materials" | "Software" | "Travel" | "HomeOffice" | "Other";
export type IncomeBasis = "issued" | "paid";

export type CategoryTotal = {
  category: ExpenseCategory;
  total: number;
  gstPaid: number;
  qstPaid: number;
};

/** `ReportRoute.totals`. There is deliberately no currency field on it. */
export type YearReport = {
  year: number;
  basis: IncomeBasis;
  income: { subtotal: number; gst: number; qst: number; total: number };
  expenses: { total: number; gstPaid: number; qstPaid: number; byCategory: CategoryTotal[] };
  net: number;
};

/** `GET /profile` (ProfileDetails); only what the dashboard reads. */
export type Profile = { businessName: string; currency: string };

/** `GET /health` at the service root. */
export type Health = { status: "UP" | "DOWN"; service: string; version: string };

// ---------------------------------------------------------------- invoices

type Bucket = { count: number; total: number };
export type CurrencySummary = { currency: string; outstanding: Bucket; paid: Bucket };
export type InvoiceSummary = { byCurrency: CurrencySummary[]; overdueCount: number };

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;

const add = (bucket: Bucket, amount: number): Bucket => ({
  count: bucket.count + 1,
  total: fromCents(toCents(bucket.total) + toCents(amount)),
});

const EMPTY: Bucket = { count: 0, total: 0 };

/** Outstanding = Issued or Sent; Voided counts for nothing. Totals never mix currencies. */
export function summariseInvoices(rows: readonly InvoiceRow[]): InvoiceSummary {
  const live = rows.filter((r) => r.status !== "Voided");
  const byCurrency = live.reduce<CurrencySummary[]>((acc, r) => {
    const existing = acc.find((c) => c.currency === r.currency);
    const base = existing ?? { currency: r.currency, outstanding: EMPTY, paid: EMPTY };
    const next: CurrencySummary =
      r.status === "Paid"
        ? { ...base, paid: add(base.paid, r.total) }
        : { ...base, outstanding: add(base.outstanding, r.total) };
    return existing ? acc.map((c) => (c === existing ? next : c)) : [...acc, next];
  }, []);
  return { byCurrency, overdueCount: live.filter((r) => r.overdue).length };
}

// ---------------------------------------------------------------- presentation helpers

/** The service's zone — "this year" is decided there, not in the visitor's. */
const SERVICE_ZONE = "America/Toronto";

export function currentYear(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: SERVICE_ZONE, year: "numeric" }).format(now));
}

/** With no known currency the figure carries no symbol: better bare than a made-up currency. */
export function formatMoney(amount: number, currency: string | undefined): string {
  return new Intl.NumberFormat(
    "en-CA",
    currency
      ? { style: "currency", currency }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(amount);
}

export function categoryLabel(category: string): string {
  const spaced = category.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------- reading a BFF response

export type Loaded<T> =
  | { state: "ok"; data: T }
  | { state: "error"; status: number | null; message: string };

const failure = (status: number | null, message: string): Loaded<never> => ({
  state: "error",
  status,
  message,
});

const errorField = (body: unknown): string | undefined =>
  typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : undefined;

function explain(status: number, serverMessage: string | undefined): string {
  if (status === 404) {
    return "The service has no such route (404). This is a failure, not an empty list.";
  }
  if (status === 503) return `Not yet available. ${serverMessage ?? ""}`.trim();
  if (status === 502) return serverMessage ?? "themis-service could not be reached.";
  return serverMessage ?? `Request failed (${status}).`;
}

/**
 * Any non-2xx is an error — a 404 from a list route above all: it means the route is gone, never
 * that there is nothing to list. Empty is only ever a successful `[]`.
 */
export async function toLoaded<T>(res: Response): Promise<Loaded<T>> {
  const parsed: unknown = await res.json().catch(() => undefined);
  if (!res.ok) return failure(res.status, explain(res.status, errorField(parsed)));
  if (parsed === undefined) return failure(res.status, "The service sent a response that could not be read.");
  return { state: "ok", data: parsed as T };
}
