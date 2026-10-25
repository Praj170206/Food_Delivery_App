"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Field, Input, LoadingBlock, PageHeader, Textarea, useToast } from "@/components/ui";
import { useHotel } from "@/components/manager/ManagerShell";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Form = {
  description: string;
  phone: string;
  email: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
  cuisines: string;
  avgPrepTimeMins: string;
  fssaiLicense: string;
  coverImage: string;
};

export default function HotelProfilePage() {
  const toast = useToast();
  const { restaurant: r, reload } = useHotel();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!r || f) return;
    setF({
      description: r.description ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      line1: r.address.line1,
      city: r.address.city,
      state: r.address.state ?? "",
      pincode: r.address.pincode ?? "",
      lat: String(r.location.coordinates[1]),
      lng: String(r.location.coordinates[0]),
      cuisines: r.cuisines.join(", "),
      avgPrepTimeMins: String(r.avgPrepTimeMins),
      fssaiLicense: r.fssaiLicense ?? "",
      coverImage: r.coverImage ?? "",
    });
  }, [r, f]);

  if (!r || !f) return <LoadingBlock />;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const lat = Number(f.lat), lng = Number(f.lng);
  const validPos = !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setF({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => toast("Couldn't read your location. Allow location access or click on the map.", "error")
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validPos) return setError("Set your hotel's location on the map");
    setBusy(true);
    setError("");
    try {
      await api("/api/manager/restaurant", {
        method: "PUT",
        body: {
          description: f.description || undefined,
          phone: f.phone || undefined,
          email: f.email,
          line1: f.line1,
          city: f.city,
          state: f.state || undefined,
          pincode: f.pincode || undefined,
          coordinates: [lng, lat],
          cuisines: f.cuisines.split(",").map((c) => c.trim()).filter(Boolean),
          avgPrepTimeMins: Number(f.avgPrepTimeMins),
          fssaiLicense: f.fssaiLicense || undefined,
          coverImage: f.coverImage,
        },
      });
      toast("Hotel profile saved");
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <PageHeader title="Hotel profile" subtitle={`${r.name} · listed as pure veg`} actions={<Button type="submit" loading={busy}>Save profile</Button>} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="About">
          <div className="space-y-4">
            <Field label="Hotel name" hint="Contact the admin team to change your hotel's name."><Input value={r.name} disabled /></Field>
            <Field label="Description"><Textarea rows={3} maxLength={1000} value={f.description} onChange={set("description")} placeholder="Family-run pure veg kitchen since 1985…" /></Field>
            <Field label="Cuisines" hint="Comma separated"><Input value={f.cuisines} onChange={set("cuisines")} placeholder="North Indian, Jain, Thali" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Average prep time (min)" hint="Default for new orders."><Input type="number" min={5} max={120} required value={f.avgPrepTimeMins} onChange={set("avgPrepTimeMins")} /></Field>
              <Field label="FSSAI license no."><Input value={f.fssaiLicense} onChange={set("fssaiLicense")} /></Field>
            </div>
            <Field label="Cover image URL" hint="A https:// link to a photo of your hotel or signature dish."><Input type="url" value={f.coverImage} onChange={set("coverImage")} placeholder="https://…" /></Field>
          </div>
        </Card>
        <Card title="Contact">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
            </div>
            <Field label="Address"><Input required value={f.line1} onChange={set("line1")} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City"><Input required value={f.city} onChange={set("city")} /></Field>
              <Field label="State"><Input value={f.state} onChange={set("state")} /></Field>
              <Field label="Pincode"><Input value={f.pincode} onChange={set("pincode")} /></Field>
            </div>
          </div>
        </Card>
        <Card title="Location on map" className="lg:col-span-2" action={<Button type="button" size="sm" variant="secondary" onClick={locate}><LocateFixed className="h-3.5 w-3.5" /> Use my current location</Button>}>
          <p className="mb-3 text-xs text-slate-500">Click on the map to move the pin to your hotel&apos;s entrance. This decides which customers can order from you and which riders are assigned.</p>
          {validPos && (
            <LeafletMap
              height={340}
              markers={[{ id: "h", position: [lat, lng], color: "#1f7a3a", label: r.name, radius: 11 }]}
              fitKey={`${r._id}`}
              onMapClick={([la, ln]) => setF({ ...f, lat: la.toFixed(6), lng: ln.toFixed(6) })}
            />
          )}
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <Field label="Latitude"><Input value={f.lat} onChange={set("lat")} /></Field>
            <Field label="Longitude"><Input value={f.lng} onChange={set("lng")} /></Field>
          </div>
        </Card>
      </div>
    </form>
  );
}
