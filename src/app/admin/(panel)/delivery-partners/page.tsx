"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { qs, useApi, useDebounced } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Select, StatCard, Table } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { UserStatusActions } from "@/components/admin/UserStatusActions";
import { ORDER_STATUS_LABELS, USER_STATUSES, type OrderStatus, type UserStatus } from "@/lib/constants";
import type { MapMarker } from "@/components/LeafletMap";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Partner = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  delivery?: {
    vehicleType?: string;
    vehicleNumber?: string;
    isOnline?: boolean;
    isAvailable?: boolean;
    currentLocation?: { coordinates: [number, number] };
    lastLocationAt?: string;
    totalDeliveries?: number;
    rating?: number;
    activeOrder?: { _id: string; orderNumber: string; status: OrderStatus };
  };
};

const STALE_MS = 15 * 60 * 1000;

function presence(p: Partner) {
  if (!p.delivery?.isOnline) return { key: "offline", label: "Offline", color: "#94a3b8" };
  if (p.delivery.activeOrder) return { key: "busy", label: "On delivery", color: "#ea580c" };
  if (p.delivery.isAvailable) return { key: "online", label: "Available", color: "#16a34a" };
  return { key: "pending", label: "Online", color: "#d97706" };
}

export default function DeliveryPartnersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [presenceFilter, setPresence] = useState("");
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<{ items: Partner[] }>(`/api/admin/delivery-partners${qs({ q: dq, status, presence: presenceFilter })}`);
  useLiveRefresh(reload, ["user", "auth", "order"]);

  // GPS pings don't create activity-log entries, so refresh positions on a timer as well.
  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => {
    const c = { total: items.length, online: 0, available: 0, busy: 0, pending: 0 };
    for (const p of items) {
      if (p.status === "pending") c.pending++;
      if (p.delivery?.isOnline) c.online++;
      if (p.delivery?.isAvailable) c.available++;
      if (p.delivery?.activeOrder) c.busy++;
    }
    return c;
  }, [items]);

  const markers: MapMarker[] = items
    .filter((p) => p.delivery?.currentLocation?.coordinates?.length === 2 && p.delivery.isOnline)
    .map((p) => {
      const [lng, lat] = p.delivery!.currentLocation!.coordinates;
      const pr = presence(p);
      const stale = !p.delivery?.lastLocationAt || Date.now() - new Date(p.delivery.lastLocationAt).getTime() > STALE_MS;
      return {
        id: p._id,
        position: [lat, lng],
        color: stale ? "#94a3b8" : pr.color,
        label: p.name,
        popup: `${pr.label}${p.delivery?.activeOrder ? ` · ${p.delivery.activeOrder.orderNumber}` : ""} · GPS ${timeAgo(p.delivery?.lastLocationAt)}`,
      };
    });

  return (
    <>
      <PageHeader title="Delivery partners" subtitle="Fleet status, live positions and onboarding approvals." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Partners" value={counts.total} />
        <StatCard label="Online" value={counts.online} tone="green" />
        <StatCard label="Available" value={counts.available} tone="green" />
        <StatCard label="On delivery" value={counts.busy} tone="amber" />
        <StatCard label="Awaiting approval" value={counts.pending} tone={counts.pending ? "red" : "slate"} />
      </div>

      <Card
        title="Live fleet map"
        className="mb-6"
        bodyClassName="p-2"
        action={
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Available</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-600" /> On delivery</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Stale GPS</span>
          </div>
        }
      >
        {markers.length ? (
          <LeafletMap markers={markers} height={380} fitKey={`${presenceFilter}|${status}|${dq}`} />
        ) : (
          <EmptyState title="No partners online right now" description="Partners appear here as soon as they go online in the delivery app." />
        )}
      </Card>

      <Card bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap gap-3">
          <Input className="max-w-xs" placeholder="Search name, phone, vehicle no…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="max-w-[11rem]" value={presenceFilter} onChange={(e) => setPresence(e.target.value)}>
            <option value="">Any presence</option>
            <option value="online">Online</option>
            <option value="available">Available</option>
            <option value="busy">On delivery</option>
            <option value="offline">Offline</option>
          </Select>
          <Select className="max-w-[11rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any account status</option>
            {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !items.length ? (
          <EmptyState title="No delivery partners found" />
        ) : (
          <Table head={["Partner", "Account", "Presence", "Vehicle", "Current order", "Deliveries", "Last GPS", "Actions"]}>
            {items.map((p) => {
              const pr = presence(p);
              return (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/users/${p._id}`} className="font-medium hover:text-brand-700 hover:underline">{p.name}</Link>
                    <p className="text-xs text-slate-500">{p.phone || p.email}</p>
                  </td>
                  <td className="px-3 py-2.5"><Badge value={p.status} /></td>
                  <td className="px-3 py-2.5"><Badge value={pr.key} label={pr.label} /></td>
                  <td className="px-3 py-2.5 text-xs capitalize">{p.delivery?.vehicleType ?? "-"}<span className="block uppercase text-slate-500">{p.delivery?.vehicleNumber}</span></td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.delivery?.activeOrder ? (
                      <Link href={`/admin/orders/${p.delivery.activeOrder._id}`} className="text-brand-700 hover:underline">
                        {p.delivery.activeOrder.orderNumber}
                        <span className="block text-slate-500">{ORDER_STATUS_LABELS[p.delivery.activeOrder.status]}</span>
                      </Link>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-2.5">{p.delivery?.totalDeliveries ?? 0}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{timeAgo(p.delivery?.lastLocationAt)}</td>
                  <td className="px-3 py-2.5"><UserStatusActions user={p} onDone={reload} compact /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
