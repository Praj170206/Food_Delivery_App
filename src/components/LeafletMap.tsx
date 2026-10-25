"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  position: [number, number]; // [lat, lng]
  color: string;
  label: string;
  popup?: string; // plain text, escaped before rendering
  radius?: number;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * OpenStreetMap via Leaflet (no API key needed). Uses circle markers so no icon
 * assets are required. Re-renders markers in place without resetting the view
 * unless `fitKey` changes.
 */
export default function LeafletMap({
  markers,
  route,
  height = 360,
  fitKey,
  onMapClick,
}: {
  markers: MapMarker[];
  route?: [number, number][];
  height?: number;
  fitKey?: string;
  /** Lets the user drop a pin; receives [lat, lng]. */
  onMapClick?: (pos: [number, number]) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const lastFit = useRef<string | undefined>(undefined);
  const L = useRef<typeof import("leaflet") | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView([12.9716, 77.5946], 12);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        })
        .addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      map.current.on("click", (e) => clickRef.current?.([e.latlng.lat, e.latlng.lng]));
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    const leaflet = L.current;
    if (!leaflet || !map.current || !layer.current) return;
    layer.current.clearLayers();
    if (route && route.length > 1) {
      leaflet.polyline(route, { color: "#1f7a3a", weight: 3, dashArray: "6 6" }).addTo(layer.current);
    }
    for (const m of markers) {
      leaflet
        .circleMarker(m.position, { radius: m.radius ?? 9, color: "#fff", weight: 2, fillColor: m.color, fillOpacity: 1 })
        .bindTooltip(esc(m.label))
        .bindPopup(`<strong>${esc(m.label)}</strong>${m.popup ? `<br/>${esc(m.popup)}` : ""}`)
        .addTo(layer.current);
    }
    const key = fitKey ?? String(markers.length);
    if (markers.length && lastFit.current !== key) {
      lastFit.current = key;
      const bounds = leaflet.latLngBounds(markers.map((m) => m.position));
      map.current.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
    }
  };

  useEffect(draw); // redraw markers on every render (cheap for a few hundred markers)

  return <div ref={el} style={{ height }} className={`z-0 w-full rounded-xl border border-slate-200 ${onMapClick ? "cursor-crosshair" : ""}`} />;
}
