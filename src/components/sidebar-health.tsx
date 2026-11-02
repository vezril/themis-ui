"use client";

import { HealthPill, healthState } from "@/components/health-pill";
import { useResource } from "@/hooks/use-resource";
import type { Health } from "@/lib/dashboard";

/** Probes `GET /health` (service root) via the BFF. The only network call the shell makes. */
export function SidebarHealth() {
  const { loaded } = useResource<Health>({ path: "health" });
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">Service</span>
      <HealthPill state={healthState(loaded)} />
    </div>
  );
}
