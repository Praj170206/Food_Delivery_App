"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PORTAL_HEADER, loginPathFor, portalForPath } from "@/lib/constants";

export class ClientApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      // Tells shared endpoints (me, logout, change password...) which portal's session to use.
      ...(typeof window !== "undefined" ? { [PORTAL_HEADER]: portalForPath(window.location.pathname) } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  // Session expired mid-use (not a failed sign-in attempt) - bounce to the login page.
  if (res.status === 401 && !url.startsWith("/api/auth/") && typeof window !== "undefined") {
    window.location.href = `/api/auth/session-expired?to=${encodeURIComponent(loginPathFor(window.location.pathname))}`;
  }
  if (!res.ok) throw new ClientApiError(res.status, data.error || `Request failed (${res.status})`, data.details);
  return data as T;
}

/**
 * Fetches `url` (re-fetches when it changes). `reload()` refreshes silently, keeping current data on screen.
 * `refreshMs` keeps public pages (which have no live stream) fresh: it polls while the tab is visible
 * and refetches as soon as the user returns to the tab.
 */
export function useApi<T>(url: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!url) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<T>(url);
        if (id === seq.current) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        // A failed background refresh keeps the last good data on screen instead of an error.
        if (id === seq.current && !silent) setError((e as Error).message);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [url]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  const { refreshMs } = opts;
  useEffect(() => {
    if (!refreshMs || !url) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const t = setInterval(tick, refreshMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refreshMs, url, load]);

  return { data, error, loading, reload, setData };
}

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
