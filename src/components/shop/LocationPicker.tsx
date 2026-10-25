"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { Button, Field, Input, Modal, cx } from "@/components/ui";
import { useShop } from "./ShopProviders";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

/** Choose where to deliver: GPS, a saved address, or a pin on the map. */
export function LocationPicker() {
  const { pickerOpen, setPickerOpen, setLocation, location, me } = useShop();
  const [pin, setPin] = useState<[number, number] | null>(location ? [location.lat, location.lng] : null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);

  const close = () => setPickerOpen(false);
  const useGps = () => {
    setError("");
    if (!navigator.geolocation) return setError("Your browser doesn't support location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Current location" });
        close();
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Allow location access, or drop a pin on the map.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saved = me?.role === "user" ? me.addresses ?? [] : [];

  return (
    <Modal open={pickerOpen} onClose={close} title="Where should we deliver?" wide>
      <Button onClick={useGps} loading={locating} className="w-full" size="lg"><LocateFixed className="h-4 w-4" /> Use my current location</Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {saved.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved addresses</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {saved.map((a) => (
              <button
                key={a._id}
                onClick={() => {
                  const [lng, lat] = a.location.coordinates;
                  setLocation({ lat, lng, label: `${a.label}: ${a.line1}`, addressId: a._id });
                  close();
                }}
                className={cx("rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50", location?.addressId === a._id ? "border-brand-600 bg-brand-50" : "border-slate-200")}
              >
                <span className="font-medium">{a.label}</span>
                <span className="block truncate text-xs text-slate-500">{a.line1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Or tap the map to drop a pin</p>
        <LeafletMap
          height={260}
          markers={pin ? [{ id: "pin", position: pin, color: "#2563eb", label: "Deliver here", radius: 10 }] : []}
          fitKey={pin ? "pin" : "none"}
          onMapClick={(p) => setPin(p)}
        />
        {pin && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <Field label="Area name (optional)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Indiranagar" /></Field>
            </div>
            <Button
              onClick={() => {
                setLocation({ lat: pin[0], lng: pin[1], label: label.trim() || "Pinned location" });
                close();
              }}
            >
              Deliver here
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
