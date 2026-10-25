"use client";

import { Bike, IdCard, Mail, Phone, Star } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/brand";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { useRider } from "@/components/rider/RiderShell";

const VEHICLES: Record<string, string> = { bicycle: "Bicycle", scooter: "Scooter", motorbike: "Motorbike", ev: "Electric vehicle" };

export default function RiderProfile() {
  const { me } = useRider();
  if (!me) return <div className="skeleton h-64 rounded-3xl" />;
  const r = me.rider;

  return (
    <div className="space-y-4 animate-rise">
      <section className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200/70">
        <Avatar name={r.name} className="mx-auto h-16 w-16 text-xl" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{r.name}</h1>
        <p className="text-sm text-slate-500">Delivery partner since {formatDate(r.createdAt)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3"><p className="tabular-nums text-xl font-bold">{r.totalDeliveries}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Deliveries</p></div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="flex items-center justify-center gap-1 text-xl font-bold">{r.rating ? r.rating.toFixed(1) : "-"} <Star className="h-4 w-4 text-saffron-400" /></p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rating</p></div>
        </div>
      </section>

      <Card title="Details">
        <ul className="space-y-3 text-sm">
          <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-slate-400" /> {r.email}</li>
          <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" /> {r.phone || "-"}</li>
          <li className="flex items-center gap-3"><Bike className="h-4 w-4 text-slate-400" /> {VEHICLES[r.vehicleType ?? ""] ?? "-"} {r.vehicleNumber && <span className="font-semibold uppercase">· {r.vehicleNumber}</span>}</li>
          <li className="flex items-center gap-3"><IdCard className="h-4 w-4 text-slate-400" /> Licence {r.licenseNumber || "not provided"}</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">To update your vehicle or licence details, contact GreenBite support.</p>
      </Card>

      <Card title="Change password">
        <ChangePasswordForm />
        <p className="mt-3 text-xs text-slate-500">Changing your password signs you out on every other device.</p>
      </Card>
    </div>
  );
}
