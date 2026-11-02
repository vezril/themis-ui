"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/lib/api";
import type { Loaded } from "@/lib/dashboard";

export type Request = { readonly path: string; readonly query?: Readonly<Record<string, string | number>> };

/**
 * Loads one BFF resource. `undefined` means "loading" (first paint, or a new request replacing the
 * old one), so callers show a skeleton and never a stale answer for the wrong year/basis.
 * Pass `null` to wait (e.g. until the year is known).
 */
export function useResource<T>(request: Request | null): {
  loaded: Loaded<T> | undefined;
  reload: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; loaded: Loaded<T> }>();
  const key = request ? `${attempt}|${request.path}|${JSON.stringify(request.query ?? {})}` : null;

  useEffect(() => {
    if (request === null || key === null) return;
    let cancelled = false;
    void getJson<T>(request.path, request.query).then((loaded) => {
      if (!cancelled) setResult({ key, loaded });
    });
    return () => {
      cancelled = true;
    };
    // `key` is the request's identity; `request` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { loaded: result !== undefined && result.key === key ? result.loaded : undefined, reload };
}
