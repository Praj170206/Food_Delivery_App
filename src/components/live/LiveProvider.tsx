"use client";

import { loginPathFor, portalForPath } from "@/lib/constants";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type LiveActivity = {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  message: string;
  entityType?: string;
  entityId?: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
};

type Status = "connecting" | "realtime" | "polling" | "offline";
type Listener = (e: LiveActivity) => void;

const LiveCtx = createContext<{ status: Status; recent: LiveActivity[]; subscribe: (fn: Listener) => () => void } | null>(null);

/**
 * One EventSource per tab, shared by every widget that wants live updates.
 * Admins use /api/admin/stream (everything); other roles use /api/stream (only events addressed to them).
 */
export function LiveProvider({ children, src = "/api/stream" }: { children: ReactNode; src?: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [recent, setRecent] = useState<LiveActivity[]>([]);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      es = new EventSource(`${src}${src.includes("?") ? "&" : "?"}portal=${portalForPath(window.location.pathname)}`);
      es.addEventListener("mode", (e) => {
        attempts = 0;
        setStatus(JSON.parse((e as MessageEvent).data).mode);
      });
      es.addEventListener("activity", (e) => {
        const doc = JSON.parse((e as MessageEvent).data) as LiveActivity;
        setRecent((r) => [doc, ...r].slice(0, 50));
        listeners.current.forEach((fn) => fn(doc));
      });
      es.addEventListener("session_ended", () => {
        es?.close();
        window.location.href = `/api/auth/session-expired?to=${encodeURIComponent(loginPathFor(window.location.pathname))}`;
      });
      es.onerror = () => {
        es?.close();
        setStatus("offline");
        // Exponential backoff, capped at 30s.
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [src]);

  const subscribe = (fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  };

  return <LiveCtx.Provider value={{ status, recent, subscribe }}>{children}</LiveCtx.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveCtx);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

/**
 * Calls `reload` (debounced) whenever a live event touches one of `entityTypes`
 * (or any event, if none given). Pages use this to stay in sync in real time.
 */
export function useLiveRefresh(reload: () => void, entityTypes?: string[], entityId?: string) {
  const { subscribe } = useLive();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = entityTypes?.join(",") ?? "";

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const types = key ? key.split(",") : null;
    const unsub = subscribe((e) => {
      if (types && !types.includes(e.entityType ?? "")) return;
      if (entityId && e.entityId !== entityId) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => reloadRef.current(), 600);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [subscribe, key, entityId]);
}
