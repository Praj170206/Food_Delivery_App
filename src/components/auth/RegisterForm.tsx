"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Hourglass, LocateFixed } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Field, Input, Select } from "@/components/ui";
import { VerifyEmailForm } from "@/components/VerifyEmailForm";
import { ROLE_LOGIN } from "@/lib/constants";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Portal = "user" | "manager" | "delivery";

const COPY: Record<Portal, { title: string; subtitle: string; cta: string }> = {
  user: { title: "Create your account", subtitle: "Order from verified pure-veg kitchens and track every delivery live.", cta: "Create account" },
  manager: { title: "Register your hotel", subtitle: "List your pure-veg kitchen on GreenBite. Our team reviews every application.", cta: "Submit application" },
  delivery: { title: "Become a delivery partner", subtitle: "Ride with GreenBite on your own schedule. We review every application.", cta: "Submit application" },
};

/** Sign-up for one portal; the role is fixed by the page, never chosen by the visitor. */
export function RegisterForm({ portal }: { portal: Portal }) {
  const [f, setF] = useState({
    name: "", email: "", phone: "", password: "",
    restaurantName: "", line1: "", city: "", pincode: "", fssaiLicense: "",
    vehicleType: "scooter", vehicleNumber: "", licenseNumber: "",
  });
  const [error, setError] = useState("");
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(null); // [lat, lng] of the hotel
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin([p.coords.latitude, p.coords.longitude]),
      () => setError("Couldn't read your location - tap your hotel on the map instead."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const copy = COPY[portal];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portal === "manager" && !pin) return setError("Pin your hotel's exact location on the map - customers and riders are matched to it.");
    setBusy(true);
    setError("");
    const base = { role: portal, name: f.name, email: f.email, phone: f.phone, password: f.password };
    const body =
      portal === "manager"
        ? { ...base, restaurant: { name: f.restaurantName, line1: f.line1, city: f.city, pincode: f.pincode || undefined, fssaiLicense: f.fssaiLicense || undefined, coordinates: pin ? [pin[1], pin[0]] : undefined } }
        : portal === "delivery"
          ? { ...base, vehicleType: f.vehicleType, vehicleNumber: f.vehicleNumber || undefined, licenseNumber: f.licenseNumber || undefined }
          : base;
    try {
      const res = await api<{ verifyEmail: boolean; email: string }>("/api/auth/register", { method: "POST", body });
      setVerifyEmail(res.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (verifyEmail) return <VerifyEmailForm email={verifyEmail} loginHref={ROLE_LOGIN[portal]} />;

  return (
    <>
      <h1 className="font-display text-[32px] font-semibold leading-tight text-slate-900">{copy.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{copy.subtitle}</p>
      {portal !== "user" && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-saffron-50 px-3.5 py-2.5 text-xs leading-relaxed text-saffron-700 ring-1 ring-inset ring-saffron-200">
          <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          After you verify your email, an admin reviews your application. You&apos;ll get an email as soon as it&apos;s approved.
        </p>
      )}

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Full name"><Input required value={f.name} onChange={set("name")} autoComplete="name" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email"><Input type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></Field>
          <Field label="Phone"><Input required value={f.phone} onChange={set("phone")} placeholder="+91 98765 43210" autoComplete="tel" /></Field>
        </div>
        <Field label="Password" hint="8+ characters with upper & lower case letters and a number.">
          <Input type="password" required value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>

        {portal === "manager" && (
          <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Your hotel</p>
            <Field label="Hotel / restaurant name"><Input required value={f.restaurantName} onChange={set("restaurantName")} /></Field>
            <Field label="Address"><Input required value={f.line1} onChange={set("line1")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input required value={f.city} onChange={set("city")} /></Field>
              <Field label="Pincode"><Input value={f.pincode} onChange={set("pincode")} /></Field>
            </div>
            <Field label="FSSAI license no." hint="Speeds up approval."><Input value={f.fssaiLicense} onChange={set("fssaiLicense")} /></Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-700">Hotel location on map</span>
                <button type="button" onClick={locate} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><LocateFixed className="h-3.5 w-3.5" /> Use my current location</button>
              </div>
              <LeafletMap height={200} markers={pin ? [{ id: "h", position: pin, color: "#1f7a3a", label: "Your hotel", radius: 10 }] : []} fitKey={pin ? `${pin[0].toFixed(4)}` : "none"} onMapClick={setPin} />
              <p className={`mt-1.5 text-xs ${pin ? "text-brand-700" : "text-slate-500"}`}>{pin ? "Pinned. Tap the map to adjust." : "Tap your hotel's entrance on the map (required)."}</p>
            </div>
          </div>
        )}

        {portal === "delivery" && (
          <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Your vehicle</p>
            <Field label="Vehicle type">
              <Select value={f.vehicleType} onChange={set("vehicleType")}>
                <option value="bicycle">Bicycle</option>
                <option value="scooter">Scooter</option>
                <option value="motorbike">Motorbike</option>
                <option value="ev">Electric vehicle</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vehicle number"><Input value={f.vehicleNumber} onChange={set("vehicleNumber")} placeholder="KA01AB1234" /></Field>
              <Field label="Driving license"><Input value={f.licenseNumber} onChange={set("licenseNumber")} /></Field>
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
        <Button type="submit" loading={busy} className="w-full" size="lg">{copy.cta}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        Already registered? <Link href={ROLE_LOGIN[portal]} className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </>
  );
}
