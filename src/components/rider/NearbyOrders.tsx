"use client";

import { useState } from "react";
import { Banknote, ChefHat, CircleCheck, MapPin, PackageCheck, Route, Store } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { formatINR, timeAgo } from "@/lib/format";
import { Button, cx, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { useRider } from "./RiderShell";

type OpenOrder = {
  _id: string;
  orderNumber: string;
  status: string;
  hotel: { name: string; address?: string };
  customerArea?: string;
  pickupKm: number;
  tripKm?: number;
  items: number;
  total: number;
  cod: boolean;
  createdAt: string;
};

/** Orders waiting for a rider near this rider's current position; first to accept gets it. */
export function NearbyOrders() {
  const toast = useToast();
  const { refresh } = useRider();
  const { data, reload } = useApi<{ online: boolean; radiusKm: number; within: OpenOrder[]; beyond: OpenOrder[] }>("/api/delivery/orders/open", { refreshMs: 10000 });
  useLiveRefresh(reload);
  const [busy, setBusy] = useState<string | null>(null);

  const accept = async (o: OpenOrder) => {
    setBusy(o._id);
    try {
      await api(`/api/delivery/orders/${o._id}/accept`, { method: "POST" });
      toast(`Order ${o.orderNumber} is yours - head to ${o.hotel.name}`);
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (!data?.online) return null;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Orders near you</p>
        <p className="text-[11px] font-semibold text-slate-400">within {data.radiusKm} km</p>
      </div>

      {data.within.length === 0 ? (
        <div className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200/70">
          <p className="text-sm font-semibold text-slate-700">No orders waiting nearby right now</p>
          <p className="mt-1 text-xs text-slate-500">New orders appear here instantly with a sound alert.</p>
          {data.beyond.length > 0 && (
            <p className="mt-3 rounded-xl bg-saffron-50 px-3 py-2 text-left text-xs leading-relaxed text-saffron-800 ring-1 ring-inset ring-saffron-200">
              {data.beyond.length} order{data.beyond.length > 1 ? "s are" : " is"} waiting outside your {data.radiusKm} km area - the nearest is at <strong>{data.beyond[0].hotel.name}</strong>, {data.beyond[0].pickupKm} km away. Move closer to accept it.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {data.within.map((o) => (
            <li key={o._id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 animate-rise">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-bold text-slate-900"><Store className="h-4 w-4 shrink-0 text-brand-600" /> {o.hotel.name}</p>
                  {o.hotel.address && <p className="mt-0.5 truncate text-xs text-slate-500">{o.hotel.address}</p>}
                </div>
                <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset", o.status === "ready" ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-saffron-50 text-saffron-700 ring-saffron-200")}>
                  {o.status === "ready" ? <PackageCheck className="h-3.5 w-3.5" /> : <ChefHat className="h-3.5 w-3.5" />} {o.status === "ready" ? "Ready" : "Preparing"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-50 px-2 py-2"><p className="tabular-nums text-sm font-bold text-slate-900">{o.pickupKm} km</p><p className="text-[10.5px] font-semibold uppercase text-slate-400"><MapPin className="mr-0.5 inline h-3 w-3" />to hotel</p></div>
                <div className="rounded-2xl bg-slate-50 px-2 py-2"><p className="tabular-nums text-sm font-bold text-slate-900">{o.tripKm ?? "-"} km</p><p className="text-[10.5px] font-semibold uppercase text-slate-400"><Route className="mr-0.5 inline h-3 w-3" />delivery</p></div>
                <div className="rounded-2xl bg-slate-50 px-2 py-2"><p className="tabular-nums text-sm font-bold text-slate-900">{o.items}</p><p className="text-[10.5px] font-semibold uppercase text-slate-400">items</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{o.orderNumber}{o.customerArea ? ` · to ${o.customerArea}` : ""} · {timeAgo(o.createdAt)}</span>
                {o.cod ? <span className="inline-flex items-center gap-1 font-bold text-saffron-700"><Banknote className="h-3.5 w-3.5" /> Collect {formatINR(o.total)}</span> : <span className="inline-flex items-center gap-1 font-bold text-brand-700"><CircleCheck className="h-3.5 w-3.5" /> Prepaid</span>}
              </div>
              <Button className="mt-3 w-full" size="lg" loading={busy === o._id} disabled={!!busy} onClick={() => accept(o)}>Accept order</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
