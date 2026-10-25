"use client";

import Link from "next/link";
import { useState } from "react";
import { Bike } from "lucide-react";
import { api } from "@/lib/client";
import { formatINR, timeAgo } from "@/lib/format";
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Spinner, cx, useToast } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";

export type ManagerOrder = {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  items: { name: string; price: number; quantity: number }[];
  pricing: { subtotal: number; total: number };
  payment: { method: string; status: string };
  notes?: string;
  createdAt: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  estimatedDeliveryAt?: string;
  cancellation?: { reason?: string; byRole?: string; at?: string };
  customer: { name: string; area: string };
  timeline: { status: string; note?: string; byRole?: string; at: string }[];
  rider?: {
    name: string;
    phone?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    location?: [number, number];
    lastLocationAt?: string;
    distanceKm?: number;
  };
};

export const EVENT_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  partner_assigned: "Rider assigned",
  partner_unassigned: "Rider removed",
  refunded: "Refunded",
  otp_failed: "Wrong delivery code entered",
};

/** The next step a hotel can take on an order, rendered as buttons. */
export function OrderActions({ order, onDone, defaultPrep, size = "sm" }: { order: ManagerOrder; onDone: () => void; defaultPrep: number; size?: "sm" | "md" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [prep, setPrep] = useState(String(defaultPrep));

  const act = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const res = await api<{ riderAssigned: { name: string; distanceKm: number } | null }>(`/api/manager/orders/${order._id}`, { method: "PATCH", body });
      toast(res.riderAssigned ? `${msg} · Rider ${res.riderAssigned.name} assigned (${res.riderAssigned.distanceKm} km away)` : msg);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      onDone(); // refresh: someone else may have moved the order
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {order.status === "placed" && (
        <div className="flex gap-2">
          <Button size={size} onClick={() => setAccepting(true)} loading={busy}>Accept</Button>
          <Button size={size} variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
        </div>
      )}
      {order.status === "confirmed" && <Button size={size} loading={busy} onClick={() => act({ action: "preparing" }, "Started preparing").catch(() => {})}>Start preparing</Button>}
      {order.status === "preparing" && <Button size={size} loading={busy} onClick={() => act({ action: "ready" }, "Marked ready for pickup").catch(() => {})}>Mark ready for pickup</Button>}

      <Modal
        open={accepting}
        onClose={() => setAccepting(false)}
        title={`Accept ${order.orderNumber}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccepting(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => act({ action: "accept", prepMins: Number(prep) || defaultPrep }, "Order accepted").then(() => setAccepting(false)).catch(() => {})}>Accept order</Button>
          </>
        }
      >
        <Field label="Preparation time (minutes)" hint="The customer sees this as their estimated time. A rider is assigned automatically.">
          <Input type="number" min={5} max={120} value={prep} onChange={(e) => setPrep(e.target.value)} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {[10, 15, 20, 30, 45].map((m) => (
            <button key={m} type="button" onClick={() => setPrep(String(m))} className={cx("rounded-full border px-3 py-1 text-xs", String(m) === prep ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600")}>
              {m} min
            </button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={rejecting}
        title={`Reject ${order.orderNumber}`}
        message="The customer is notified immediately with your reason. Use this only if you really can't fulfil the order (e.g. an item ran out)."
        confirmLabel="Reject order"
        askReason
        reasonRequired
        onConfirm={(reason) => act({ action: "reject", reason }, "Order rejected")}
        onClose={() => setRejecting(false)}
      />
    </>
  );
}

export function RiderInfo({ order }: { order: ManagerOrder }) {
  const r = order.rider;
  if (!r) {
    if (order.status === "cancelled" || order.status === "delivered") return null;
    return <p className="flex items-center gap-1.5 text-xs font-medium text-saffron-600"><Spinner className="h-3 w-3" /> Finding a delivery partner…</p>;
  }
  return (
    <div className="rounded-lg bg-orange-50 px-2.5 py-2 text-xs text-orange-900">
      <p className="font-medium">
        <Bike className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {r.name} {r.phone && <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="font-normal underline">{r.phone}</a>}
      </p>
      <p className="text-orange-800">
        <span className="capitalize">{r.vehicleType}</span> {r.vehicleNumber}
        {order.status === "picked_up" ? " · picked up" : r.distanceKm != null ? ` · ${r.distanceKm} km away` : ""}
        {r.lastLocationAt && ` · GPS ${timeAgo(r.lastLocationAt)}`}
      </p>
    </div>
  );
}

/** Minutes an order has been waiting; new orders turn amber/red to make delays obvious. */
function ageTone(order: ManagerOrder) {
  if (order.status !== "placed") return "text-slate-500";
  const mins = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  return mins > 5 ? "font-semibold text-red-600" : mins > 2 ? "font-medium text-amber-600" : "text-slate-500";
}

export function OrderCard({ order, onDone, defaultPrep }: { order: ManagerOrder; onDone: () => void; defaultPrep: number }) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <div className={cx("rounded-xl border bg-white p-3 shadow-sm", order.status === "placed" ? "border-brand-300 ring-2 ring-brand-100" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/manager/orders/${order._id}`} className="text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline">{order.orderNumber}</Link>
        <span className={cx("whitespace-nowrap text-xs", ageTone(order))}>{timeAgo(order.createdAt)}</span>
      </div>
      <p className="text-xs text-slate-500">
        {order.customer.name}{order.customer.area ? ` · ${order.customer.area}` : ""} · {count} item{count > 1 ? "s" : ""}
      </p>
      <ul className="mt-2 space-y-0.5 text-sm">
        {order.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span><span className="font-semibold">{it.quantity}×</span> {it.name}</span>
          </li>
        ))}
      </ul>
      {order.notes && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">Note: {order.notes}</p>}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-800">{formatINR(order.pricing.total)}</span>
        <span className="uppercase text-slate-500">{order.payment.method} <Badge value={order.payment.status} /></span>
      </div>
      {order.status !== "placed" && <div className="mt-2"><RiderInfo order={order} /></div>}
      <div className="mt-3"><OrderActions order={order} onDone={onDone} defaultPrep={defaultPrep} /></div>
    </div>
  );
}
