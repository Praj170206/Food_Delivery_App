"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Banknote, Check, ChefHat, CircleCheck, Clock, Home, KeyRound, LocateFixed, MapPin, Navigation, Package, PackageCheck, Phone, Power, Route, Store, TriangleAlert } from "lucide-react";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { Button, Modal, cx, useToast } from "@/components/ui";
import { VegMark } from "@/components/brand";
import { useRider, type RiderOrder } from "@/components/rider/RiderShell";
import { NearbyOrders } from "@/components/rider/NearbyOrders";
import type { MapMarker } from "@/components/LeafletMap";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

const navUrl = (c?: [number, number]) => (c ? `https://www.google.com/maps/dir/?api=1&destination=${c[1]},${c[0]}&travelmode=driving` : undefined);
const tel = (p?: string) => (p ? `tel:${p.replace(/\s/g, "")}` : undefined);

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200/70">
      <p className="tabular-nums text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function ActionLinks({ phone, coords }: { phone?: string; coords?: [number, number] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <a href={tel(phone)} aria-disabled={!phone} className={cx("flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ring-1 ring-inset transition", phone ? "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50" : "pointer-events-none bg-slate-50 text-slate-300 ring-slate-100")}>
        <Phone className="h-4 w-4" /> Call
      </a>
      <a href={navUrl(coords)} target="_blank" rel="noreferrer" className={cx("flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition", coords ? "bg-slate-900 text-white hover:bg-slate-800" : "pointer-events-none bg-slate-200 text-slate-400")}>
        <Navigation className="h-4 w-4" /> Navigate
      </a>
    </div>
  );
}

function Steps({ status }: { status: RiderOrder["status"] }) {
  const idx = status === "picked_up" ? 1 : status === "delivered" ? 2 : 0;
  const steps = [
    { label: "Pick up", icon: Store },
    { label: "Deliver", icon: Home },
    { label: "Done", icon: CircleCheck },
  ];
  return (
    <ol className="flex items-center">
      {steps.map((s, i) => (
        <li key={s.label} className="flex flex-1 items-center last:flex-none">
          <span className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", i < idx ? "bg-brand-600 text-white" : i === idx ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-300" : "bg-slate-100 text-slate-400")}>
            {i < idx ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <s.icon className="h-3.5 w-3.5" />} {s.label}
          </span>
          {i < steps.length - 1 && <span className={cx("mx-1.5 h-0.5 flex-1 rounded", i < idx ? "bg-brand-500" : "bg-slate-200")} />}
        </li>
      ))}
    </ol>
  );
}

function ActiveTask({ order }: { order: RiderOrder }) {
  const toast = useToast();
  const { position, refresh } = useRider();
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [done, setDone] = useState<{ collected: number; next: string | null } | null>(null);
  const pickedUp = order.status === "picked_up";

  const ll = (c?: [number, number]) => (c ? ([c[1], c[0]] as [number, number]) : null);
  const me = ll(position ?? undefined), hotel = ll(order.hotel.location), home = ll(order.customer.location);
  const markers: MapMarker[] = [];
  if (hotel) markers.push({ id: "h", position: hotel, color: "#1f7a3a", label: order.hotel.name });
  if (home && pickedUp) markers.push({ id: "c", position: home, color: "#2563eb", label: `Customer: ${order.customer.name}` });
  if (me) markers.push({ id: "me", position: me, color: "#ea580c", label: "You", radius: 11 });
  const target = pickedUp ? home : hotel;

  const pickup = async () => {
    setBusy(true);
    try {
      await api(`/api/delivery/orders/${order._id}/pickup`, { method: "POST" });
      toast("Picked up! Head to the customer.");
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const deliver = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setOtpError("");
    try {
      const res = await api<{ collected: number; nextOrder: { orderNumber: string } | null }>(`/api/delivery/orders/${order._id}/deliver`, { method: "POST", body: { otp } });
      setDone({ collected: res.collected, next: res.nextOrder?.orderNumber ?? null });
      setOtp("");
    } catch (err) {
      setOtpError((err as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-rise">
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Current task</p>
            <p className="font-bold text-slate-900">{order.orderNumber}</p>
          </div>
          {order.tripKm != null && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><Route className="h-3.5 w-3.5" /> {order.tripKm} km trip</span>}
        </div>
        <Steps status={order.status} />
      </section>

      {markers.length > 0 && (
        <div className="overflow-hidden rounded-3xl shadow-sm ring-1 ring-slate-200/70">
          <LeafletMap markers={markers} route={me && target ? [me, target] : undefined} height={230} fitKey={`${order._id}-${order.status}-${me ? 1 : 0}`} />
        </div>
      )}

      {!pickedUp ? (
        <>
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700"><Store className="h-3.5 w-3.5" /> Step 1 · Pick up from</p>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900">{order.hotel.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{order.hotel.address?.line1}, {order.hotel.address?.city}</p>
            {order.hotel.distanceKm != null && <p className="mt-1 text-sm font-semibold text-slate-700">{order.hotel.distanceKm} km from you</p>}
            <ActionLinks phone={order.hotel.phone} coords={order.hotel.location} />
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Order items</p>
              {order.status === "ready" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200"><PackageCheck className="h-3.5 w-3.5" /> Ready</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-saffron-50 px-2.5 py-1 text-xs font-bold text-saffron-700 ring-1 ring-inset ring-saffron-200"><ChefHat className="h-3.5 w-3.5" /> Preparing</span>
              )}
            </div>
            <ul className="mt-3 space-y-1.5">
              {order.items.map((i, k) => <li key={k} className="flex items-center gap-2 text-sm"><VegMark className="h-3.5 w-3.5" /><span className="font-bold">{i.quantity}×</span> {i.name}</li>)}
            </ul>
            {order.notes && <p className="mt-3 rounded-xl bg-saffron-50 px-3 py-2 text-xs text-saffron-800">Customer note: {order.notes}</p>}
          </section>

          <Button size="lg" className="w-full" disabled={order.status !== "ready"} loading={busy} onClick={pickup}>
            {order.status === "ready" ? <><Package className="h-5 w-5" /> I&apos;ve picked up the order</> : <><Clock className="h-5 w-5" /> Waiting for hotel to mark ready</>}
          </Button>
        </>
      ) : (
        <>
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700"><Home className="h-3.5 w-3.5" /> Step 2 · Deliver to</p>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900">{order.customer.name}</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{order.customer.address}{order.customer.city ? `, ${order.customer.city}` : ""}</p>
            {order.customer.distanceKm != null && <p className="mt-1 text-sm font-semibold text-slate-700">{order.customer.distanceKm} km from you</p>}
            {order.notes && <p className="mt-3 rounded-xl bg-saffron-50 px-3 py-2 text-xs text-saffron-800">Note: {order.notes}</p>}
            <ActionLinks phone={order.customer.phone} coords={order.customer.location} />
          </section>

          {order.collectCash > 0 ? (
            <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-saffron-400 to-saffron-500 p-4 text-white shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><Banknote className="h-6 w-6" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/85">Collect cash</p>
                <p className="tabular-nums text-2xl font-extrabold">{formatINR(order.collectCash)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-3xl bg-brand-50 p-4 text-brand-800 ring-1 ring-inset ring-brand-200">
              <CircleCheck className="h-6 w-6" /> <p className="text-sm font-bold">Already paid online - don&apos;t collect cash</p>
            </div>
          )}

          <form onSubmit={deliver} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound className="h-4 w-4 text-brand-600" /> Customer&apos;s delivery code</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Hand over the food, then ask the customer for the code shown in their GreenBite app or email.</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="• • • •"
              className="tabular-nums mt-4 h-16 w-full rounded-2xl border-0 bg-slate-50 text-center text-3xl font-extrabold tracking-[0.5em] text-slate-900 ring-1 ring-inset ring-slate-200 outline-none focus:ring-2 focus:ring-brand-500"
            />
            {otpError && <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {otpError}</p>}
            <Button type="submit" size="lg" className="mt-4 w-full" disabled={otp.length < 4} loading={busy}><CircleCheck className="h-5 w-5" /> Complete delivery</Button>
          </form>
        </>
      )}

      <Modal open={!!done} onClose={() => { setDone(null); refresh(); }} title="Delivery complete">
        <div className="py-2 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50 animate-pop"><CircleCheck className="h-9 w-9" /></span>
          <h3 className="mt-4 font-display text-2xl font-semibold text-slate-900">Delivered!</h3>
          <p className="mt-1 text-sm text-slate-500">Order {order.orderNumber} is complete. Great job.</p>
          {!!done?.collected && <p className="mt-4 rounded-2xl bg-saffron-50 px-4 py-3 text-sm font-bold text-saffron-700 ring-1 ring-inset ring-saffron-200">Cash collected: {formatINR(done.collected)}</p>}
          {done?.next && <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800 ring-1 ring-inset ring-brand-200">Next order assigned: {done.next}</p>}
          <Button className="mt-6 w-full" size="lg" onClick={() => { setDone(null); refresh(); }}>{done?.next ? "Start next delivery" : "Back to tasks"}</Button>
        </div>
      </Modal>
    </div>
  );
}

export default function RiderHome() {
  const { me, order, orderLoaded, setOnline, busy, gpsError } = useRider();

  if (!me || !orderLoaded) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-40 rounded-3xl" />
        <div className="skeleton h-64 rounded-3xl" />
      </div>
    );
  }
  if (order) return <ActiveTask order={order} />;

  const online = me.rider.isOnline;
  return (
    <div className="space-y-4 animate-rise">
      <section className={cx("relative overflow-hidden rounded-[28px] p-6 text-center shadow-sm", online ? "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white" : "bg-white ring-1 ring-slate-200/70")}>
        {online && <div className="grain absolute inset-0" />}
        <div className="relative">
          <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
            {online && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/25" />
                <span className="absolute inset-3 animate-pulse rounded-full bg-brand-400/20" />
              </>
            )}
            <span className={cx("relative flex h-20 w-20 items-center justify-center rounded-full", online ? "bg-white/15 ring-1 ring-inset ring-white/25" : "bg-slate-100 text-slate-400")}>
              {online ? <LocateFixed className="h-9 w-9" /> : <Power className="h-9 w-9" />}
            </span>
          </div>
          <h1 className={cx("mt-4 font-display text-[28px] font-semibold", online ? "text-white" : "text-slate-900")}>{online ? "You're online" : "You're offline"}</h1>
          <p className={cx("mx-auto mt-1.5 max-w-xs text-sm leading-relaxed", online ? "text-brand-100/80" : "text-slate-500")}>
            {online ? "Accept any order below. You'll hear an alert when a new one comes in nearby." : "Go online to see and accept delivery requests from hotels nearby."}
          </p>
          {gpsError && <p className="mx-auto mt-4 max-w-sm rounded-xl bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">{gpsError}</p>}
          <Button size="lg" variant={online ? "secondary" : "primary"} className="mt-6 w-full max-w-xs" loading={busy} onClick={() => setOnline(!online)}>
            <Power className="h-5 w-5" /> {online ? "Go offline" : "Go online"}
          </Button>
        </div>
      </section>

      {online && <NearbyOrders />}

      <div>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Today</p>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Deliveries" value={me.today.deliveries} />
          <Stat label="Cash" value={formatINR(me.today.cash)} />
          <Stat label="Km" value={me.today.km} />
        </div>
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-bold text-slate-900">How it works</p>
        <ol className="mt-3 space-y-3 text-sm text-slate-600">
          {[
            [MapPin, "Go online - accept an order near you, or get one assigned automatically."],
            [Store, "Reach the hotel and pick up once the food is ready."],
            [KeyRound, "Deliver and enter the customer's code to finish."],
          ].map(([Icon, text], i) => {
            const I = Icon as typeof MapPin;
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><I className="h-4 w-4" /></span>
                <span className="pt-1.5">{text as string}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
