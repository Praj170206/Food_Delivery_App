"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useEffect } from "react";
import { VegMark } from "@/components/brand";
import { useApi } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { useOrderTracking } from "@/components/live/useOrderTracking";
import { useRoadRoute } from "@/components/live/useRoadRoute";
import { useHotel } from "@/components/manager/ManagerShell";
import { EVENT_LABELS, OrderActions, RiderInfo, type ManagerOrder } from "@/components/manager/orderParts";
import type { MapMarker } from "@/components/LeafletMap";
import { ORDER_STATUS_LABELS, ROLE_LABELS, type Role } from "@/lib/constants";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

export default function ManagerOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { restaurant } = useHotel();
  const { data, error, loading, reload } = useApi<{ order: ManagerOrder; hotel: { name: string; location?: [number, number] } }>(`/api/manager/orders/${id}`);
  useLiveRefresh(reload, ["order"], id);

  const active = !!data && !["delivered", "cancelled"].includes(data.order.status);
  const track = useOrderTracking(id, active, reload);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, 30000); // safety net; the rider's position arrives live over the tracking stream
    return () => clearInterval(t);
  }, [active, reload]);

  // Rider heading to the hotel: show the road route and when they'll arrive.
  const od = data?.order;
  const hotelLL = data?.hotel.location ? ([data.hotel.location[1], data.hotel.location[0]] as [number, number]) : null;
  const riderRaw = track.location ?? od?.rider?.location;
  const riderLL = riderRaw && od?.rider && active ? ([riderRaw[1], riderRaw[0]] as [number, number]) : null;
  const comingToHotel = !!riderLL && od?.status !== "picked_up";
  const road = useRoadRoute(riderLL, hotelLL, comingToHotel);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;
  const { order: o, hotel } = data;

  const markers: MapMarker[] = [];
  if (hotelLL) markers.push({ id: "h", kind: "hotel", position: hotelLL, color: "#1f7a3a", label: hotel.name });
  if (riderLL && o.rider) markers.push({ id: "r", kind: "rider", position: riderLL, color: "#ea580c", label: `Rider: ${o.rider.name}`, popup: o.status === "picked_up" ? "On the way to the customer" : "Coming to your hotel" });
  const route = comingToHotel && hotelLL ? road.path ?? [riderLL!, hotelLL] : undefined;

  return (
    <>
      <Link href="/manager/orders" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← Live orders</Link>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        subtitle={<span className="flex items-center gap-2"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /> placed {formatDateTime(o.createdAt)}</span>}
        actions={<OrderActions order={o} onDone={reload} defaultPrep={restaurant?.avgPrepTimeMins ?? 20} size="md" />}
      />
      {o.status === "cancelled" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Cancelled by {ROLE_LABELS[o.cancellation?.byRole as Role] ?? "the system"}{o.cancellation?.reason && <> - &ldquo;{o.cancellation.reason}&rdquo;</>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items to prepare" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><VegMark className="h-3.5 w-3.5" /> <span className="font-semibold">{it.quantity}×</span> {it.name}</span>
                  <span>{formatINR(it.price * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-slate-100 px-4 py-3 text-sm font-semibold">
              <span>Food total</span>
              <span>{formatINR(o.pricing.subtotal)}</span>
            </div>
            {o.notes && <p className="border-t border-slate-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">Customer note: {o.notes}</p>}
          </Card>
          {markers.length > 0 && (
            <Card title={riderLL ? "Rider live location" : "Hotel"} bodyClassName="p-2">
              <div className="relative">
                <LeafletMap markers={markers} route={route} routeStyle={road.path ? "road" : "straight"} height={300} fitKey={`${o._id}-${markers.length}-${o.status}`} followId={riderLL ? "r" : undefined} />
                {riderLL && (
                  <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-xl bg-white/95 px-3 py-2 shadow-md ring-1 ring-slate-200">
                    <p className="text-sm font-bold text-slate-900">
                      {o.status === "picked_up" ? "Out for delivery" : road.mins != null ? `Rider reaches you in ~${road.mins} min` : "Rider is on the way"}
                    </p>
                    {comingToHotel && road.km != null && <p className="text-[11px] text-slate-500">{road.km} km by road</p>}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Delivery partner">
            <RiderInfo order={o} />
            {o.assignedAt && <p className="mt-2 text-xs text-slate-500">Assigned {formatDateTime(o.assignedAt)}</p>}
            {o.status === "ready" && o.rider && <p className="mt-2 text-xs text-slate-600">Hand the packed order to {o.rider.name}. They&apos;ll mark it picked up in their app.</p>}
          </Card>
          <Card title="Customer">
            <p className="text-sm font-medium">{o.customer.name}</p>
            {o.customer.area && <p className="text-xs text-slate-500">Delivering to {o.customer.area}</p>}
            <p className="mt-2 text-xs text-slate-500">Payment: <span className="uppercase">{o.payment.method}</span> <Badge value={o.payment.status} /></p>
          </Card>
          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...o.timeline].reverse().map((t, i) => (
                <li key={i} className="relative">
                  <span className={cx("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white", t.status === "cancelled" ? "bg-red-500" : "bg-brand-500")} />
                  <p className="text-sm font-medium text-slate-800">{EVENT_LABELS[t.status] ?? t.status}</p>
                  {t.note && <p className="text-xs text-slate-600">{t.note}</p>}
                  <p className="text-[11px] text-slate-400">{formatDateTime(t.at)} · {ROLE_LABELS[t.byRole as Role] ?? "System"}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
