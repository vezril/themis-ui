import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), "deploy/charts/themis-ui", p), "utf8");

// Helm itself is not assumed to be installed; these pin the textual invariants that have each
// cost a sibling a deleted ingress or a rebuild.
describe("chart: ingress", () => {
  const ingress = read("templates/ingress.yaml");

  it("is wrapped in the enabled switch", () => {
    expect(ingress.trimStart().startsWith("{{- if .Values.ingress.enabled }}")).toBe(true);
  });

  it("omits ingressClassName when className is empty", () => {
    expect(ingress).toMatch(/\{\{-\s*if \.Values\.ingress\.className\s*\}\}\s*\n\s*ingressClassName:/);
  });

  it("only emits tls when a secret name is given", () => {
    expect(ingress).toMatch(/\{\{-\s*if \.Values\.ingress\.tlsSecretName\s*\}\}\s*\n\s*tls:/);
  });
});

describe("chart: safe defaults", () => {
  const values = read("values.yaml");

  it.each([
    [/^replicaCount: 1$/m, "replicaCount 1"],
    [/^ingress:\n(?:.*\n)*?\s+enabled: false$/m, "ingress disabled"],
    [/^\s+className: ""$/m, "empty className"],
    [/^\s+clusterIssuer: ""$/m, "empty clusterIssuer"],
    [/^\s+tlsSecretName: ""$/m, "empty tlsSecretName"],
  ])("has %s", (pattern) => {
    expect(values).toMatch(pattern);
  });
});

describe("chart: deployment", () => {
  const deployment = read("templates/deployment.yaml");

  it("probes GET /", () => {
    expect(deployment).toMatch(/livenessProbe:\s*\n\s*httpGet:\s*\n\s*path: \/\n/);
    expect(deployment).toMatch(/readinessProbe:\s*\n\s*httpGet:\s*\n\s*path: \/\n/);
  });

  it("sets the upstream from server-side env, not a NEXT_PUBLIC_ one", () => {
    expect(deployment).toContain("THEMIS_SERVICE_URL");
    expect(deployment).not.toMatch(/name:\s*NEXT_PUBLIC_/);
  });

  it("wires the gateway secret from an optional secretKeyRef", () => {
    expect(deployment).toMatch(/THEMIS_GATEWAY_SECRET[\s\S]*secretKeyRef/);
    expect(deployment).toMatch(/\{\{-\s*if \.Values\.themis\.gatewaySecret\.secretName\s*\}\}/);
  });

  it("runs as non-root uid 1001", () => {
    expect(deployment).toContain("runAsUser: 1001");
    expect(deployment).toContain("runAsNonRoot: true");
  });
});
