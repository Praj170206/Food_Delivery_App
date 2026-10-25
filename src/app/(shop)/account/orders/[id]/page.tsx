"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Bike, Check, ChefHat, Clock, CreditCard, Hourglass, KeyRound, PackageCheck, Phone, ShieldCheck, Sparkles, XCircle, type LucideIcon } from "lucide-react";
import { payWithRazorpay, type RazorpayOptions } from "@/components/shop/razorpay";
import { api, useApi } from "@/lib/client";
import { Avatar, VegMark } from "@/components/brand";
import { formatDateTime, formatINR, timeAgo } from "@/lib/format";
import { Badge, Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock, cx, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { useOrderTracking } from "@/components/live/useOrderTracking";
import type { MapMarker } from "@/components/LeafletMap";
import { ORDER_STATUS_LABELS, ROLE_LABELS, type OrderStatus, type Role } from "@/lib/constants";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Order = {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  items: { name: string; price: number; quantity: number }[];
  pricing: { subtotal: number; deliveryFee: number; tax: number; discount: number; total: number };
  payment: { method: string; status: string };
  notes?: string;
  distanceKm?: number;
  createdAt: string;
  deliveredAt?: string;
  estimatedDeliveryAt?: string;
  deliveryAddress: { line1: string; city?: string; location?: [number, number] };
  restaurant: { _id: string; name: string; slug: string; phone?: string; address: { line1: string; city: string }; location?: [number, number] };
  rider?: { name: string; phone?: string; vehicleType?: string; vehicleNumber?: string; location?: [number, number]; lastLocationAt?: string };
  deliveryOtp: string | null;
  cancellation?: { reason?: string; byRole?: string; at?: string };
  timeline: { status: string; note?: string; byRole?: string; at: string }[];
  canCancel: boolean;
  awaitingPayment: boolean;
};

const STEPS: { status: OrderStatus; title: string; text: string }[] = [
  { status: "placed", title: "Order placed", text: "Waiting for the hotel to accept" },
  { status: "confirmed", title: "Accepted", text: "The hotel accepted your order" },
  { status: "preparing", title: "Preparing", text: "Your food is being cooked" },
  { status: "ready", title: "Ready", text: "Packed and waiting for the rider" },
  { status: "picked_up", title: "On the way", text: "Your rider is heading to you" },
  { status: "delivered", title: "Delivered", text: "Enjoy your meal!" },
];

const HEADLINE: Record<OrderStatus, [string, LucideIcon]> = {
  payment_pending: ["Complete your payment", CreditCard],
  placed: ["Waiting for the kitchen to accept", Hourglass],
  confirmed: ["Order accepted", BadgeCheck],
  preparing: ["Your food is being prepared", ChefHat],
  ready: ["Packed and ready for pickup", PackageCheck],
  picked_up: ["Your order is on the way", Bike],
  delivered: ["Delivered. Enjoy your meal!", Sparkles],
  cancelled: ["This order was cancelled", XCircle],
};

const EVENT_LABELS: Record<string, string> = { ...ORDER_STATUS_LABELS, partner_assigned: "Delivery partner assigned", partner_unassigned: "Delivery partner changed", refunded: "Refunded", otp_failed: "Wrong delivery code entered" };

export default function TrackOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/customer/orders/${id}`);
  useLiveRefresh(reload, ["order"], id);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [, tick] = useState(0);

  const active = !!data && !["delivered", "cancelled"].includes(data.order.status);
  // Rider position pushed live (moves on the map the moment the rider's phone reports it).
  const live = useOrderTracking(id, active, reload);
  // Status changes arrive instantly over the live stream; the rider's GPS position is refreshed every 10s.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      reload();
      tick((n) => n + 1);
    }, 30000); // safety net; live updates arrive through the tracking stream
    return () => clearInterval(t);
  }, [active, reload]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Order not found"} onRetry={reload} />;
  const o = data.order;
  const stepIdx = STEPS.findIndex((s) => s.status === o.status);
  const ll = (c?: [number, number]) => (c ? ([c[1], c[0]] as [number, number]) : null);
  const hotel = ll(o.restaurant.location), home = ll(o.deliveryAddress.location), rider = ll(live.location ?? o.rider?.location);
  const riderSeenAt = live.lastLocationAt ?? o.rider?.lastLocationAt;

  const markers: MapMarker[] = [];
  if (hotel) markers.push({ id: "h", position: hotel, color: "#1f7a3a", label: o.restaurant.name });
  if (home) markers.push({ id: "c", position: home, color: "#2563eb", label: "You", popup: o.deliveryAddress.line1 });
  if (rider && active) markers.push({ id: "r", position: rider, color: "#ea580c", label: `${o.rider!.name} (rider)`, popup: `Updated ${timeAgo(riderSeenAt)}`, radius: 12 });
  const routeLine = hotel && home ? (rider && active ? (o.status === "picked_up" ? [rider, home] : [rider, hotel, home]) : [hotel, home]) : undefined;

  const [headline, HeadIcon] = HEADLINE[o.status];
  const minsLeft = o.estimatedDeliveryAt ? Math.max(0, Math.round((new Date(o.estimatedDeliveryAt).getTime() - Date.now()) / 60000)) : null;

  const payNow = async () => {
    setPaying(true);
    try {
      const res = await api<{ razorpay: RazorpayOptions | null }>(`/api/customer/orders/${o._id}/pay`, { method: "POST" });
      if (!res.razorpay) return reload();
      const r = await payWithRazorpay(o._id, res.razorpay);
      if (r.status === "paid") toast(`Payment successful! Order ${o.orderNumber} is placed.`);
      else if (r.status === "failed") toast(r.message, "error");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      reload();
    } finally {
      setPaying(false);
    }
  };

  const cancel = async (reason: string) => {
    try {
      await api(`/api/customer/orders/${o._id}`, { method: "PATCH", body: { reason: reason || undefined } });
      toast("Order cancelled");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      reload();
      throw e;
    }
  };

  return (
    <>
      <Link href="/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> My orders</Link>

      <section className={cx("relative mb-7 overflow-hidden rounded-[28px] p-6 text-white shadow-lg sm:p-8", o.status === "cancelled" ? "bg-gradient-to-br from-slate-700 to-slate-900" : "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950")}>
        <div className="grain absolute inset-0" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-inset ring-white/20">
              <HeadIcon className={cx("h-7 w-7", active && "animate-pulse")} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-200/80">Order {o.orderNumber} · {o.restaurant.name}</p>
              <h1 className="mt-1.5 font-display text-3xl font-semibold leading-tight sm:text-[34px]">{headline}</h1>
              {active && minsLeft !== null && (
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-brand-100/90">
                  <Clock className="h-4 w-4" /> Arriving in <strong className="text-white">{minsLeft} min</strong> · by {new Date(o.estimatedDeliveryAt!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {o.status === "delivered" && o.deliveredAt && <p className="mt-2 text-sm text-brand-100/90">Delivered at {formatDateTime(o.deliveredAt)}</p>}
              {o.status === "cancelled" && <p className="mt-2 text-sm text-white/80">{o.cancellation?.reason} {o.cancellation?.byRole && `· by ${ROLE_LABELS[o.cancellation.byRole as Role] ?? o.cancellation.byRole}`}</p>}
            </div>
          </div>
          {o.deliveryOtp && (
            <div className="rounded-2xl bg-white px-5 py-3 text-center text-slate-900 shadow-xl">
              <p className="flex items-center justify-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500"><KeyRound className="h-3 w-3" /> Delivery OTP</p>
              <p className="tabular-nums mt-1 text-[32px] font-extrabold leading-none tracking-[0.25em] text-brand-700">{o.deliveryOtp}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">Share only when food is in hand</p>
            </div>
          )}
        </div>
      </section>

      {o.awaitingPayment && (
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-saffron-300 animate-rise">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-saffron-50 text-saffron-600 ring-1 ring-inset ring-saffron-200"><CreditCard className="h-5 w-5" /></span>
            <div>
              <p className="font-bold text-slate-900">Payment pending - {formatINR(o.pricing.total)}</p>
              <p className="mt-0.5 text-sm text-slate-500">Your order goes to the kitchen as soon as payment succeeds. Unpaid orders are cancelled after 30 minutes.</p>
            </div>
          </div>
          <Button size="lg" loading={paying} onClick={payNow}><ShieldCheck className="h-5 w-5" /> Pay {formatINR(o.pricing.total)} now</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {o.status !== "cancelled" && (
            <Card>
              <ol className="space-y-0">
                {STEPS.map((s, i) => {
                  const done = i < stepIdx || o.status === "delivered";
                  const current = i === stepIdx && o.status !== "delivered";
                  const at = o.timeline.find((t) => t.status === s.status)?.at;
                  return (
                    <li key={s.status} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={cx("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition", done ? "bg-brand-600 text-white shadow-sm" : current ? "bg-brand-50 text-brand-800 ring-4 ring-brand-100" : "bg-slate-100 text-slate-400")}>
                          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : current ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-600" /> : i + 1}
                        </span>
                        {i < STEPS.length - 1 && <span className={cx("my-1 w-0.5 flex-1", done ? "bg-brand-500" : "bg-slate-200")} style={{ minHeight: 18 }} />}
                      </div>
                      <div className="pb-4">
                        <p className={cx("text-sm font-semibold", done || current ? "text-slate-900" : "text-slate-400")}>{s.title}</p>
                        <p className="text-xs text-slate-500">{current || done ? s.text : ""}{at ? ` · ${new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {markers.length > 0 && (
            <Card title={active ? "Live tracking" : "Route"} bodyClassName="p-2">
              <LeafletMap markers={markers} route={routeLine} height={340} fitKey={`${o._id}-${markers.length}`} />
              <div className="flex flex-wrap gap-4 px-2 pt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1f7a3a]" /> Kitchen</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> You</span>
                {rider && active && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-600" /> Rider · updated {timeAgo(riderSeenAt)}{live.connected && <span className="ml-1 inline-flex items-center gap-1 font-semibold text-brand-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" /> LIVE</span>}</span>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Delivery partner">
            {o.rider ? (
              <div className="flex items-center gap-3">
                <span className="relative"><Avatar name={o.rider.name} className="h-12 w-12 text-base" /><span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white ring-2 ring-white"><Bike className="h-3 w-3" /></span></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{o.rider.name}</p>
                  <p className="text-xs capitalize text-slate-500">{o.rider.vehicleType} {o.rider.vehicleNumber}</p>
                </div>
                {o.rider.phone && active && <a href={`tel:${o.rider.phone.replace(/\s/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100"><Phone className="h-4 w-4" /> Call</a>}
              </div>
            ) : o.status === "cancelled" ? <p className="text-sm text-slate-500">-</p> : (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"><Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-saffron-500" /> We&apos;ll assign the nearest available rider as soon as the hotel accepts your order.</p>
            )}
          </Card>

          <Card title="Bill details" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="flex items-center gap-2"><VegMark className="h-3.5 w-3.5" /> {it.quantity}× {it.name}</span><span>{formatINR(it.price * it.quantity)}</span></li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Item total</dt><dd>{formatINR(o.pricing.subtotal)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Delivery fee</dt><dd>{o.pricing.deliveryFee ? formatINR(o.pricing.deliveryFee) : "FREE"}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Taxes</dt><dd>{formatINR(o.pricing.tax)}</dd></div>
              <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatINR(o.pricing.total)}</dd></div>
              <div className="flex items-center justify-between pt-1 text-xs text-slate-500"><dt className="uppercase">{o.payment.method === "cod" ? "Cash on delivery" : o.payment.method}</dt><dd><Badge value={o.payment.status} /></dd></div>
            </dl>
          </Card>

          <Card title="Delivering to">
            <p className="text-sm text-slate-700">{o.deliveryAddress.line1}{o.deliveryAddress.city ? `, ${o.deliveryAddress.city}` : ""}</p>
            {o.notes && <p className="mt-2 text-xs text-slate-500">Your note: {o.notes}</p>}
          </Card>

          <Card title="Updates">
            <ol className="space-y-3">
              {[...o.timeline].reverse().map((t, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium text-slate-800">{EVENT_LABELS[t.status] ?? t.status}</p>
                  {t.note && <p className="text-xs text-slate-600">{t.note}</p>}
                  <p className="text-[11px] text-slate-400">{formatDateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          </Card>

          {o.canCancel && (
            <Button variant="secondary" className="w-full" onClick={() => setCancelling(true)}>Cancel order</Button>
          )}
          {!o.canCancel && active && <p className="text-center text-xs text-slate-500">Need help? Contact support - the hotel has already started on your order.</p>}
          {!active && <Link href={`/hotels/${o.restaurant.slug}`} className="block rounded-lg border border-slate-200 bg-white py-2 text-center text-sm font-medium text-brand-700 hover:bg-slate-50">Order again from {o.restaurant.name}</Link>}
        </div>
      </div>

      <ConfirmDialog
        open={cancelling}
        title="Cancel this order?"
        message="You can cancel free of charge until the hotel accepts your order."
        confirmLabel="Yes, cancel"
        askReason
        onConfirm={cancel}
        onClose={() => setCancelling(false)}
      />
    </>
  );
}
