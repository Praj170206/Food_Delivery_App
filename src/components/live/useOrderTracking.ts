"use client";

import { useEffect, useRef, useState } from "react";
import { portalForPath } from "@/lib/constants";
import { visibleEventSource } from "@/components/live/visibleEventSource";

export type LiveTracking = {
  location: [number, number] | null; // [lng, lat]
  lastLocationAt: string | null;
  status: string | null;
  connected: boolean;
};

/**
 * Subscribes to /api/track/:orderId and returns the rider's position as soon as it changes.
 * `onStatus` fires when the order's status (or rider) changes so the page can refetch details.
 */
export function useOrderTracking(orderId: string | null, active: boolean, onStatus?: () => void): LiveTracking {
  const [state, setState] = useState<LiveTracking>({ location: null, lastLocationAt: null, status: null, connected: false });
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!orderId || !active) return;
    let lastStatus: string | null = null;
    return visibleEventSource(
      `/api/track/${orderId}?portal=${portalForPath(window.location.pathname)}`,
      (es) => {
        es.addEventListener("mode", () => setState((s) => ({ ...s, connected: true })));
        es.addEventListener("location", (e) => {
          const d = JSON.parse((e as MessageEvent).data);
          setState((s) => ({ ...s, location: d.location, lastLocationAt: d.lastLocationAt }));
        });
        es.addEventListener("order", (e) => {
          const d = JSON.parse((e as MessageEvent).data);
          setState((s) => ({ ...s, status: d.status, ...(d.riderId ? {} : { location: null }) }));
          // Also fires after a reconnect if something changed while the tab was in the background.
          if (lastStatus !== null && lastStatus !== `${d.status}:${d.riderId}`) onStatusRef.current?.();
          lastStatus = `${d.status}:${d.riderId}`;
        });
      },
      { onDown: () => setState((s) => ({ ...s, connected: false })) }
    );
  }, [orderId, active]);

  return state;
}
