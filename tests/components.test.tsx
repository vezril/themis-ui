import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HealthPill, healthState } from "@/components/health-pill";
import { EmptyState, ErrorState } from "@/components/states";

describe("healthState", () => {
  it("is checking before any answer", () => {
    expect(healthState(undefined)).toBe("checking");
  });
  it("is live only for an UP body", () => {
    expect(healthState({ state: "ok", data: { status: "UP", service: "themis", version: "1" } })).toBe("live");
  });
  it("is down for DOWN, for a 503 and for an unreachable service", () => {
    expect(healthState({ state: "ok", data: { status: "DOWN", service: "themis", version: "1" } })).toBe("down");
    expect(healthState({ state: "error", status: 503, message: "x" })).toBe("down");
    expect(healthState({ state: "error", status: null, message: "x" })).toBe("down");
  });
});

describe("HealthPill", () => {
  it("says Live in words, not only colour", () => {
    render(<HealthPill state="live" />);
    expect(screen.getByRole("status")).toHaveTextContent("Live");
  });
  it("says Down in words", () => {
    render(<HealthPill state="down" />);
    expect(screen.getByRole("status")).toHaveTextContent("Down");
  });
  it("says Checking while waiting", () => {
    render(<HealthPill state="checking" />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking");
  });
});

describe("ErrorState", () => {
  it("names what failed, shows the message and keeps Retry visible", () => {
    const onRetry = vi.fn();
    render(<ErrorState what="invoices" message="The service has no such route (404)." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load invoices");
    expect(screen.getByRole("alert")).toHaveTextContent("no such route (404)");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState", () => {
  it("says what is empty and what creates data", () => {
    render(<EmptyState title="No invoices in 2026" hint="Issue an invoice to see it here." />);
    expect(screen.getByText("No invoices in 2026")).toBeInTheDocument();
    expect(screen.getByText(/Issue an invoice/)).toBeInTheDocument();
  });
});
