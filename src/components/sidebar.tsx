import { Scale } from "lucide-react";
import { SidebarHealth } from "@/components/sidebar-health";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/" as string | null },
  { label: "Invoices", href: null },
  { label: "Expenses", href: null },
  { label: "Clients", href: null },
  { label: "Year-end", href: null },
  { label: "Integrity", href: null },
] as const;

/**
 * Left-sidebar chrome: mark top-left, vertical nav, health pill at the bottom. Sections that are
 * not built yet are visibly disabled — present, labelled, and not links.
 */
export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-5">
        {/* TODO(mark): placeholder glyph. Themis has no god mark yet (the mark is the only logo —
            no wordmark). Replace with the keyed mark and use it as the favicon. */}
        <Scale aria-label="Themis" role="img" className="size-7 text-family-cyan" />
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) =>
          item.href ? (
            <a
              key={item.label}
              href={item.href}
              aria-current="page"
              className="rounded-md bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground"
            >
              {item.label}
            </a>
          ) : (
            <span
              key={item.label}
              aria-disabled="true"
              className={cn("flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground opacity-60")}
            >
              {item.label}
              <span className="text-xs">Soon</span>
            </span>
          ),
        )}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <SidebarHealth />
      </div>
    </aside>
  );
}
