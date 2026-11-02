import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_* is frozen into the browser bundle at build time. Refuse to produce an image
  // that would silently ignore it (zeus-ui shipped that bug). No default on purpose.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_THEMIS_API_BASE) {
    throw new Error("NEXT_PUBLIC_THEMIS_API_BASE must be set for `next build` (the image bakes the relative BFF path).");
  }
  return {
    // Self-contained server for the Docker image: listens on :3000, writes nothing at runtime.
    output: "standalone",
    poweredByHeader: false,
  };
}
