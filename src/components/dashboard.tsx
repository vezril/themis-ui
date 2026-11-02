"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { useResource } from "@/hooks/use-resource";
import {
  categoryLabel,
  currentYear,
  formatMoney,
  summariseInvoices,
  type IncomeBasis,
  type InvoiceRow,
  type Loaded,
  type Profile,
  type YearReport,
} from "@/lib/dashboard";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card role="region" aria-label={label}>
      <CardTitle>{label}</CardTitle>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Figure({ value, caption }: { value: string; caption?: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {caption ? <p className="text-sm text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <Card aria-busy="true" aria-label={`${label} (loading)`}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-4 w-20" />
    </Card>
  );
}

function InvoicePanels({ rows, year }: { rows: InvoiceRow[]; year: number }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={`No invoices in ${year}`}
        hint="Invoices issued in this year appear here once they exist."
      />
    );
  }
  const summary = summariseInvoices(rows);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel label="Outstanding">
        {summary.byCurrency.map((c) => (
          <Figure key={c.currency} value={formatMoney(c.outstanding.total, c.currency)} caption={plural(c.outstanding.count, "invoice", "invoices")} />
        ))}
      </Panel>
      <Panel label="Paid">
        {summary.byCurrency.map((c) => (
          <Figure key={c.currency} value={formatMoney(c.paid.total, c.currency)} caption={plural(c.paid.count, "invoice", "invoices")} />
        ))}
      </Panel>
      <Panel label="Overdue">
        <p className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums">
          {summary.overdueCount > 0 ? <TriangleAlert aria-hidden="true" className="size-5 text-warning" /> : null}
          {summary.overdueCount} overdue
        </p>
        <p className="text-sm text-muted-foreground">Judged by the service, in its own time zone.</p>
      </Panel>
    </div>
  );
}

function ReportPanels({ report, currency }: { report: YearReport; currency: string | undefined }) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel label="Income">
          <Figure value={money(report.income.subtotal)} caption="Before tax" />
        </Panel>
        <Panel label="Expenses">
          <Figure value={money(report.expenses.total)} />
        </Panel>
        <Panel label={`Net for ${report.year}`}>
          <Figure value={money(report.net)} caption="Income before tax, less expenses" />
        </Panel>
      </div>
      <Panel label="Expenses by category">
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Category</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {report.expenses.byCategory.map((c) => (
              <tr key={c.category} className="border-t first:border-t-0">
                <td className="py-1.5">{categoryLabel(c.category)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function Section<T>({
  what,
  loaded,
  reload,
  skeleton,
  children,
}: {
  what: string;
  loaded: Loaded<T> | undefined;
  reload: () => void;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (loaded === undefined) return <>{skeleton}</>;
  if (loaded.state === "error") return <ErrorState what={what} message={loaded.message} onRetry={reload} />;
  return <>{children(loaded.data)}</>;
}

const subscribeNever = () => () => {};

export function Dashboard({ now }: { now?: Date }) {
  // Unknown until mounted: the page is prerendered, and "this year" must come from the service's
  // zone at view time, not from whenever the build ran.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [yearOffset, setYearOffset] = useState(0);
  const year = mounted ? currentYear(now ?? new Date()) + yearOffset : null;
  const [basis, setBasis] = useState<IncomeBasis>("issued");

  const invoices = useResource<InvoiceRow[]>(year === null ? null : { path: "invoices", query: { year } });
  const report = useResource<YearReport>(year === null ? null : { path: `reports/${year}`, query: { basis } });
  // The report carries no currency; the profile is the only honest source for it.
  const profile = useResource<Profile>({ path: "profile" });
  const currency = profile.loaded?.state === "ok" ? profile.loaded.data.currency : undefined;
  const currencyKnown = profile.loaded !== undefined;

  const panelSkeletons = (
    <div className="grid gap-4 md:grid-cols-3">
      <PanelSkeleton label="Outstanding" />
      <PanelSkeleton label="Paid" />
      <PanelSkeleton label="Overdue" />
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Read-only view of the ledger.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous year" disabled={year === null} onClick={() => setYearOffset((n) => n - 1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-14 text-center font-mono tabular-nums" aria-live="polite">
              {year ?? "----"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Next year" disabled={year === null} onClick={() => setYearOffset((n) => n + 1)}>
              <ChevronRight />
            </Button>
          </div>
          <ToggleGroup
            type="single"
            value={basis}
            onValueChange={(v) => (v === "issued" || v === "paid") && setBasis(v)}
            aria-label="Income basis for the year report"
          >
            <ToggleGroupItem value="issued">Issued</ToggleGroupItem>
            <ToggleGroupItem value="paid">Paid</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-label="Invoices">
        <h2 className="text-lg font-medium">Invoices</h2>
        <Section what="invoices" loaded={year === null ? undefined : invoices.loaded} reload={invoices.reload} skeleton={panelSkeletons}>
          {(rows) => <InvoicePanels rows={rows} year={year ?? 0} />}
        </Section>
      </section>

      <section className="flex flex-col gap-3" aria-label="Year report">
        <h2 className="text-lg font-medium">Year report</h2>
        <p className="text-sm text-muted-foreground">
          {currency ? `Amounts in ${currency}.` : currencyKnown ? "Currency not configured; amounts shown without a symbol." : null}
        </p>
        <Section
          what="the year report"
          loaded={year === null || !currencyKnown ? undefined : report.loaded}
          reload={report.reload}
          skeleton={panelSkeletons}
        >
          {(data) => <ReportPanels report={data} currency={currency} />}
        </Section>
      </section>
    </div>
  );
}
