"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, Marker, CircleMarker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  position: [number, number]; // [lat, lng]
  color: string;
  label: string;
  popup?: string; // plain text, escaped before rendering
  radius?: number;
  /** "rider" = moving scooter that turns with the direction of travel; "hotel"/"home" = pins. */
  kind?: "dot" | "rider" | "hotel" | "home";
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SVG = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON_PATHS = {
  rider: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  hotel: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};

function iconHtml(kind: "rider" | "hotel" | "home", color: string) {
  if (kind === "rider") {
    return `<div class="gb-rider" style="--c:${color}"><span class="gb-rider-pulse"></span><span class="gb-rider-heading"><i></i></span><span class="gb-rider-body">${SVG(ICON_PATHS.rider)}</span></div>`;
  }
  return `<div class="gb-pin" style="--c:${color}"><span class="gb-pin-head">${SVG(ICON_PATHS[kind])}</span></div>`;
}

/** Compass bearing in degrees from a to b ([lat, lng]). */
function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

type Live = {
  layer: Marker | CircleMarker;
  sig: string; // kind + colour: a change means the icon must be rebuilt
  pos: [number, number];
  movedAt: number;
  heading: number | null;
  frame?: number;
  tooltip: string;
  popup: string;
};

/**
 * OpenStreetMap via Leaflet (no API key needed). Markers are kept between renders and glide
 * smoothly to each new GPS fix (like a delivery app), the rider icon turns towards where it's
 * heading, and the map follows `followId` unless the viewer has dragged the map themselves.
 * The view only resets when `fitKey` changes.
 */
export default function LeafletMap({
  markers,
  route,
  routeStyle = "straight",
  height = 360,
  fitKey,
  followId,
  onMapClick,
}: {
  markers: MapMarker[];
  route?: [number, number][];
  /** "road" = solid line following real roads; "straight" = dashed as-the-crow-flies hint. */
  routeStyle?: "road" | "straight";
  height?: number;
  fitKey?: string;
  /** Keep this marker in view as it moves. */
  followId?: string;
  /** Lets the user drop a pin; receives [lat, lng]. */
  onMapClick?: (pos: [number, number]) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const live = useRef(new Map<string, Live>());
  const lines = useRef<{ casing: Polyline; line: Polyline } | null>(null);
  const lastFit = useRef<string | undefined>(undefined);
  const userMovedAt = useRef(0);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const props = useRef({ markers, route, routeStyle, fitKey, followId });
  props.current = { markers, route, routeStyle, fitKey, followId };

  useEffect(() => {
    let cancelled = false;
    const store = live.current;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView([18.5204, 73.8567], 12);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map.current);
      map.current.on("click", (e) => clickRef.current?.([e.latlng.lat, e.latlng.lng]));
      // The viewer is exploring the map: stop auto-following for a while.
      map.current.on("dragstart", () => (userMovedAt.current = Date.now()));
      draw();
    })();
    return () => {
      cancelled = true;
      store.forEach((m) => m.frame && cancelAnimationFrame(m.frame));
      store.clear();
      lines.current = null;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function makeLayer(m: MapMarker) {
    const leaflet = L.current!;
    const kind = m.kind ?? "dot";
    if (kind === "dot") {
      return leaflet.circleMarker(m.position, { radius: m.radius ?? 9, color: "#fff", weight: 2, fillColor: m.color, fillOpacity: 1 });
    }
    const icon = leaflet.divIcon({
      html: iconHtml(kind, m.color),
      className: "gb-marker",
      iconSize: kind === "rider" ? [46, 46] : [36, 44],
      iconAnchor: kind === "rider" ? [23, 23] : [18, 42],
      tooltipAnchor: kind === "rider" ? [14, -10] : [12, -30],
      popupAnchor: kind === "rider" ? [0, -18] : [0, -38],
    });
    return leaflet.marker(m.position, { icon, zIndexOffset: kind === "rider" ? 1000 : 0, keyboard: false });
  }

  function applyHeading(lv: Live) {
    if (lv.heading == null || !("getElement" in lv.layer)) return;
    const node = (lv.layer as Marker).getElement()?.querySelector<HTMLElement>(".gb-rider-heading");
    if (node) {
      node.style.transform = `rotate(${lv.heading}deg)`;
      node.style.opacity = "1";
    }
  }

  /** Glide from the current position to `to` over roughly the time between GPS fixes. */
  function glide(lv: Live, to: [number, number]) {
    const from = (lv.layer.getLatLng() as { lat: number; lng: number });
    const start: [number, number] = [from.lat, from.lng];
    const now = performance.now();
    const duration = Math.min(4500, Math.max(600, now - lv.movedAt));
    lv.movedAt = now;
    if (Math.abs(start[0] - to[0]) + Math.abs(start[1] - to[1]) > 1e-6) {
      if (Math.abs(start[0] - to[0]) + Math.abs(start[1] - to[1]) > 2e-5) lv.heading = bearing(start, to); // ignore GPS jitter
      applyHeading(lv);
    }
    if (lv.frame) cancelAnimationFrame(lv.frame);
    // A jump of more than ~3 km (first fix, reconnect) is placed directly instead of animated.
    if (Math.abs(start[0] - to[0]) + Math.abs(start[1] - to[1]) > 0.03) {
      lv.layer.setLatLng(to);
      return;
    }
    const step = (t: number) => {
      const k = Math.min(1, (t - now) / duration);
      lv.layer.setLatLng([start[0] + (to[0] - start[0]) * k, start[1] + (to[1] - start[1]) * k]);
      lv.frame = k < 1 ? requestAnimationFrame(step) : undefined;
    };
    lv.frame = requestAnimationFrame(step);
  }

  function draw() {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    const { markers, route, routeStyle, fitKey, followId } = props.current;

    // Route line, updated in place.
    if (route && route.length > 1) {
      const road = routeStyle === "road";
      if (!lines.current) {
        lines.current = { casing: leaflet.polyline(route).addTo(m), line: leaflet.polyline(route).addTo(m) };
      }
      lines.current.casing.setLatLngs(route).setStyle({ color: "#ffffff", weight: road ? 8 : 0, opacity: road ? 0.9 : 0 });
      lines.current.line.setLatLngs(route).setStyle({ color: road ? "#157a4a" : "#1f7a3a", weight: road ? 5 : 3, opacity: 0.9, dashArray: road ? undefined : "6 6", lineCap: "round", lineJoin: "round" });
    } else if (lines.current) {
      lines.current.casing.remove();
      lines.current.line.remove();
      lines.current = null;
    }

    // Markers: add new, move existing, drop missing.
    const seen = new Set<string>();
    for (const mk of markers) {
      seen.add(mk.id);
      const sig = `${mk.kind ?? "dot"}|${mk.color}|${mk.radius ?? ""}`;
      const tooltip = esc(mk.label);
      const popup = `<strong>${esc(mk.label)}</strong>${mk.popup ? `<br/>${esc(mk.popup)}` : ""}`;
      let lv = live.current.get(mk.id);
      if (lv && lv.sig !== sig) {
        if (lv.frame) cancelAnimationFrame(lv.frame);
        const at = lv.layer.getLatLng();
        lv.layer.remove();
        const layer = makeLayer({ ...mk, position: [at.lat, at.lng] }).bindTooltip(tooltip).bindPopup(popup).addTo(m);
        lv = { ...lv, layer, sig, tooltip, popup, frame: undefined };
        live.current.set(mk.id, lv);
        applyHeading(lv);
      }
      if (!lv) {
        const layer = makeLayer(mk).bindTooltip(tooltip).bindPopup(popup).addTo(m);
        live.current.set(mk.id, { layer, sig, pos: mk.position, movedAt: performance.now(), heading: null, tooltip, popup });
        continue;
      }
      if (lv.tooltip !== tooltip) lv.layer.setTooltipContent(tooltip);
      if (lv.popup !== popup) lv.layer.setPopupContent(popup);
      lv.tooltip = tooltip;
      lv.popup = popup;
      if (lv.pos[0] !== mk.position[0] || lv.pos[1] !== mk.position[1]) {
        lv.pos = mk.position;
        glide(lv, mk.position);
        // Follow the rider, unless the viewer dragged the map in the last 20 s.
        if (followId === mk.id && Date.now() - userMovedAt.current > 20000 && !m.getBounds().pad(-0.2).contains(mk.position)) {
          m.panTo(mk.position, { animate: true, duration: 1 });
        }
      }
    }
    for (const [id, lv] of live.current) {
      if (seen.has(id)) continue;
      if (lv.frame) cancelAnimationFrame(lv.frame);
      lv.layer.remove();
      live.current.delete(id);
    }

    const key = fitKey ?? String(markers.length);
    if (markers.length && lastFit.current !== key) {
      lastFit.current = key;
      const pts = [...markers.map((x) => x.position), ...(route ?? [])];
      m.fitBounds(leaflet.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
    }
  }

  useEffect(draw); // cheap: markers are diffed, not rebuilt

  const recenter = () => {
    const leaflet = L.current;
    if (!leaflet || !map.current || !markers.length) return;
    userMovedAt.current = 0;
    map.current.fitBounds(leaflet.latLngBounds([...markers.map((x) => x.position), ...(route ?? [])]).pad(0.2), { maxZoom: 16 });
  };

  return (
    <div className="relative">
      <div ref={el} style={{ height }} className={`z-0 w-full rounded-xl border border-slate-200 ${onMapClick ? "cursor-crosshair" : ""}`} />
      {followId && markers.length > 1 && (
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-3 right-3 z-[400] rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Recenter
        </button>
      )}
    </div>
  );
}
