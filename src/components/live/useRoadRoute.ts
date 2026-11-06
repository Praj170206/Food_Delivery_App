"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { haversineKm } from "@/lib/geo";

type LatLng = [number, number]; // [lat, lng]

export type RoadRoute = {
  /** Remaining road path from the rider's current position ([lat, lng] points), or null while unknown. */
  path: LatLng[] | null;
  /** Remaining road distance and drive time (minutes), or null if routing is unavailable. */
  km: number | null;
  mins: number | null;
};

// Free OpenStreetMap routing (OSRM). Public demo server: fine for development and low traffic;
// point NEXT_PUBLIC_OSRM_URL at your own OSRM instance in production.
const OSRM = process.env.NEXT_PUBLIC_OSRM_URL || "https://router.project-osrm.org";
const REFETCH_AFTER_M = 150; // re-route once the rider strays this far from the last route start
const MIN_GAP_MS = 20_000;

const ll2 = (p: [number, number]): [number, number] => [p[1], p[0]]; // [lat,lng] -> [lng,lat] for haversine
const km = (a: LatLng, b: LatLng) => haversineKm(ll2(a), ll2(b));

/**
 * Road route + ETA between two points that keeps up with a moving rider: the line shrinks as the
 * rider advances and is re-fetched only when they leave it (or the destination changes), so the
 * routing service is called rarely. Falls back to nulls (callers draw a straight line).
 */
export function useRoadRoute(from: LatLng | null, to: LatLng | null, enabled = true): RoadRoute {
  const [fetched, setFetched] = useState<{ path: LatLng[]; km: number; mins: number; toKey: string } | null>(null);
  const last = useRef<{ origin: LatLng; toKey: string; at: number } | null>(null);
  const toKey = to ? `${to[0].toFixed(5)},${to[1].toFixed(5)}` : "";

  useEffect(() => {
    if (!enabled || !from || !to) return;
    const prev = last.current;
    const destChanged = !prev || prev.toKey !== toKey;
    const strayed = prev ? km(prev.origin, from) * 1000 > REFETCH_AFTER_M : true;
    if (!destChanged && (!strayed || Date.now() - prev!.at < MIN_GAP_MS)) return;
    last.current = { origin: from, toKey, at: Date.now() };

    const ctl = new AbortController();
    fetch(`${OSRM}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }) => {
        const r = j.routes?.[0];
        if (!r) throw new Error("no route");
        setFetched({ path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng), km: r.distance / 1000, mins: r.duration / 60, toKey });
      })
      .catch(() => {
        if (!ctl.signal.aborted) last.current = prev && !destChanged ? prev : null; // allow a retry later
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, from?.[0], from?.[1], toKey]);

  return useMemo<RoadRoute>(() => {
    if (!enabled || !from || !to || !fetched || fetched.toKey !== toKey) return { path: null, km: null, mins: null };
    // Trim the part of the road the rider has already covered.
    const p = fetched.path;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < p.length; i++) {
      const d = Math.abs(p[i][0] - from[0]) + Math.abs(p[i][1] - from[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    const rest: LatLng[] = [from, ...p.slice(best + 1)];
    let remaining = 0;
    for (let i = 1; i < rest.length; i++) remaining += km(rest[i - 1], rest[i]);
    const share = fetched.km > 0 ? Math.min(1, remaining / fetched.km) : 1;
    return { path: rest, km: Math.round(remaining * 10) / 10, mins: Math.max(1, Math.round(fetched.mins * share)) };
  }, [enabled, from, to, fetched, toKey]);
}
