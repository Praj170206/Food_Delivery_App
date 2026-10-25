"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Field, Input, cx } from "@/components/ui";
import { useShop, type SavedAddress } from "./ShopProviders";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

/** Add a delivery address with an exact map pin (riders navigate to the pin). */
export function AddressForm({ onSaved, onCancel }: { onSaved: (a: SavedAddress) => void; onCancel?: () => void }) {
  const { location, refreshMe } = useShop();
  const [label, setLabel] = useState("Home");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [pin, setPin] = useState<[number, number] | null>(location ? [location.lat, location.lng] : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const gps = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin([p.coords.latitude, p.coords.longitude]),
      () => setError("Couldn't get your location - tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 }
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return setError("Tap the map to pin your exact location");
    setBusy(true);
    setError("");
    try {
      const res = await api<{ address: SavedAddress }>("/api/customer/addresses", {
        method: "POST",
        body: { label, line1, city: city || undefined, pincode: pincode || undefined, coordinates: [pin[1], pin[0]] },
      });
      await refreshMe();
      onSaved(res.address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2">
        {["Home", "Work", "Other"].map((l) => (
          <button key={l} type="button" onClick={() => setLabel(l)} className={cx("rounded-full border px-3 py-1 text-sm", label === l ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : "border-slate-200 text-slate-600")}>
            {l}
          </button>
        ))}
      </div>
      <Field label="Full address" hint="House / flat no., building, street, landmark"><Input required value={line1} onChange={(e) => setLine1(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="Pincode"><Input value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" /></Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Pin your exact location</span>
          <button type="button" onClick={gps} className="text-xs font-medium text-brand-700 hover:underline"><LocateFixed className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Use current location</button>
        </div>
        <LeafletMap height={220} markers={pin ? [{ id: "p", position: pin, color: "#2563eb", label: "Deliver here", radius: 10 }] : []} fitKey={pin ? `${pin[0].toFixed(3)}` : "none"} onMapClick={setPin} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy}>Save address</Button>
      </div>
    </form>
  );
}
