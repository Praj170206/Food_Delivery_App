"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { VegMark } from "@/components/brand";
import { api, useApi } from "@/lib/client";
import { formatDateTime, formatINR, timeAgo } from "@/lib/format";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, LoadingBlock, Modal, PageHeader, Select, Textarea, cx, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { useOrderTracking } from "@/components/live/useOrderTracking";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUSES, ORDER_STATUS_LABELS, ROLE_LABELS, type OrderStatus, type Role } from "@/lib/constants";
import type { MapMarker } from "@/components/LeafletMap";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Order = {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  items: { name: string; price: number; quantity: number }[];
  pricing: { subtotal: number; deliveryFee: number; tax: number; discount: number; total: number };
  payment: { method: string; status: string; transactionId?: string };
  deliveryAddress: { line1: string; city?: string; pincode?: string; location: { coordinates: [number, number] } };
  distanceKm?: number;
  notes?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  otpAttempts?: number;
  user: { _id: string; name: string; email: string; phone?: string };
  restaurant: { _id: string; name: string; phone?: string; address: { line1: string; city: string }; location: { coordinates: [number, number] } };
  deliveryPartner?: {
    _id: string;
    name: string;
    phone?: string;
    delivery?: { vehicleType?: string; vehicleNumber?: string; currentLocation?: { coordinates: [number, number] }; lastLocationAt?: string };
  };
  cancellation?: { reason?: string; byRole?: string; at?: string; by?: { name: string } };
  timeline: { status: string; note?: string; byRole?: string; at: string; by?: { name: string } }[];
};

type Candidate = { _id: string; name: string; phone?: string; distanceKm: number; isAvailable: boolean; vehicleType?: string; totalDeliveries: number; lastLocationAt?: string };

// The happy-path steps shown in the progress bar.
const STEPS: OrderStatus[] = ["placed", "confirmed", "preparing", "ready", "picked_up", "delivered"];

const EVENT_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  partner_assigned: "Delivery partner assigned",
  partner_unassigned: "Delivery partner removed",
  refunded: "Refunded",
  otp_failed: "Wrong delivery OTP entered",
};

function AssignModal({ order, open, onClose, onDone }: { order: Order; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ candidates: Candidate[]; radiusKm: number }>(open ? `/api/admin/orders/${order._id}/candidates` : null);
  const [busy, setBusy] = useState<string | null>(null);

  const assign = async (c: Candidate) => {
    setBusy(c._id);
    try {
      await api(`/api/admin/orders/${order._id}`, { method: "PATCH", body: { action: "assign", partnerId: c._id } });
      toast(`${c.name} assigned to ${order.orderNumber}`);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const auto = async () => {
    setBusy("auto");
    try {
      const res = await api<{ assigned: Candidate }>(`/api/admin/orders/${order._id}`, { method: "POST" });
      toast(`Auto-assigned to ${res.assigned.name} (${res.assigned.distanceKm} km)`);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={order.deliveryPartner ? "Reassign delivery partner" : "Assign delivery partner"} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <span>Auto-assign picks the closest <strong>available</strong> partner to {order.restaurant.name}.</span>
        {!order.deliveryPartner && <Button size="sm" loading={busy === "auto"} onClick={auto}>Auto-assign nearest</Button>}
      </div>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.candidates.length ? (
        <EmptyState title="No online partners nearby" description={`Nobody with a fresh GPS location within ${data?.radiusKm ?? "-"} km of the hotel.`} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.candidates.map((c) => (
            <li key={c._id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{c.name} <span className="text-xs font-normal capitalize text-slate-500">· {c.vehicleType}</span></p>
                <p className="text-xs text-slate-500">{c.distanceKm} km from hotel · {c.totalDeliveries} deliveries · GPS {timeAgo(c.lastLocationAt)}</p>
              </div>
              {c.isAvailable ? (
                <Button size="sm" variant="secondary" loading={busy === c._id} disabled={c._id === order.deliveryPartner?._id} onClick={() => assign(c)}>
                  {c._id === order.deliveryPartner?._id ? "Current" : "Assign"}
                </Button>
              ) : <Badge value="busy" label="On another order" />}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function StatusOverrideModal({ order, open, onClose, onDone }: { order: Order; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/orders/${order._id}`, { method: "PATCH", body: { action: "status", status, note: note || undefined } });
      toast(`Order moved to ${ORDER_STATUS_LABELS[status as OrderStatus]}`);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Override order status"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="warning" loading={busy} disabled={!status || note.trim().length < 3} onClick={submit}>Override</Button></>}
    >
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Normally the hotel and delivery partner move the order forward, and &quot;Delivered&quot; needs the customer&apos;s OTP. Overrides skip those checks and are flagged in the activity log.
      </p>
      <div className="space-y-4">
        <Field label="New status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            <option value="">Select…</option>
            {ORDER_STATUSES.filter((s) => s !== "cancelled" && s !== order.status).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
          </Select>
        </Field>
        <Field label="Reason (required)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/admin/orders/${id}`);
  useLiveRefresh(reload, ["order"], id);
  const [modal, setModal] = useState<"assign" | "status" | "cancel" | "unassign" | "refund" | null>(null);

  // Keep the rider's position fresh while the order is moving.
  const live = !!data && ACTIVE_ORDER_STATUSES.includes(data.order.status);
  const track = useOrderTracking(id, live, reload);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [live, reload]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;
  const o = data.order;

  const act = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/orders/${o._id}`, { method: "PATCH", body });
      toast(msg);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  const toLatLng = (c?: [number, number]) => (c ? ([c[1], c[0]] as [number, number]) : null);
  const rest = toLatLng(o.restaurant.location?.coordinates);
  const cust = toLatLng(o.deliveryAddress.location?.coordinates);
  const rider = toLatLng(track.location ?? o.deliveryPartner?.delivery?.currentLocation?.coordinates);
  const markers: MapMarker[] = [
    rest && { id: "r", position: rest, color: "#1f7a3a", label: `Hotel: ${o.restaurant.name}`, popup: o.restaurant.address.line1 },
    cust && { id: "c", position: cust, color: "#2563eb", label: `Customer: ${o.user.name}`, popup: o.deliveryAddress.line1 },
    rider && live && { id: "d", position: rider, color: "#ea580c", label: `Rider: ${o.deliveryPartner!.name}`, popup: `GPS ${timeAgo(track.lastLocationAt ?? o.deliveryPartner?.delivery?.lastLocationAt)}`, radius: 11 },
  ].filter(Boolean) as MapMarker[];

  const stepIndex = STEPS.indexOf(o.status);
  const canChangePartner = live && o.status !== "picked_up";

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← All orders</Link>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        subtitle={<span className="flex items-center gap-2"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /> placed {formatDateTime(o.createdAt)}</span>}
        actions={
          <>
            {canChangePartner && <Button variant="secondary" onClick={() => setModal("assign")}>{o.deliveryPartner ? "Reassign rider" : "Assign rider"}</Button>}
            {canChangePartner && o.deliveryPartner && <Button variant="ghost" onClick={() => setModal("unassign")}>Remove rider</Button>}
            {live && <Button variant="secondary" onClick={() => setModal("status")}>Override status</Button>}
            {o.payment.status === "paid" && <Button variant="secondary" onClick={() => setModal("refund")}>Mark refunded</Button>}
            {live && <Button variant="danger" onClick={() => setModal("cancel")}>Cancel order</Button>}
          </>
        }
      />

      {o.status !== "cancelled" ? (
        <Card className="mb-6">
          <ol className="flex items-start">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span className={cx("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= stepIndex ? "bg-brand-500" : "bg-slate-200")} />
                  <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i < stepIndex ? "bg-brand-500 text-white" : i === stepIndex ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-500")}>
                    {i < stepIndex ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cx("h-0.5 flex-1", i === STEPS.length - 1 ? "bg-transparent" : i < stepIndex ? "bg-brand-500" : "bg-slate-200")} />
                </div>
                <span className={cx("mt-2 text-[11px] sm:text-xs", i <= stepIndex ? "font-medium text-slate-800" : "text-slate-400")}>{ORDER_STATUS_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Cancelled {o.cancellation?.at && formatDateTime(o.cancellation.at)} by {o.cancellation?.by?.name ?? ROLE_LABELS[o.cancellation?.byRole as Role] ?? "system"}
          {o.cancellation?.reason && <> - &ldquo;{o.cancellation.reason}&rdquo;</>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={live ? "Live tracking" : "Route"} bodyClassName="p-2">
            {markers.length ? <LeafletMap markers={markers} route={rest && cust ? [rest, ...(rider && live ? [rider] : []), cust] : undefined} height={340} fitKey={o._id} /> : <EmptyState title="No location data" />}
            <div className="flex flex-wrap gap-4 px-2 pt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1f7a3a]" /> Hotel</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Customer</span>
              {live && o.deliveryPartner && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-600" /> Rider</span>}
              {o.distanceKm != null && <span>Distance: {o.distanceKm} km</span>}
            </div>
          </Card>

          <Card title="Items" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><VegMark className="h-3.5 w-3.5" /> {it.name} <span className="text-slate-500">× {it.quantity}</span></span>
                  <span>{formatINR(it.price * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{formatINR(o.pricing.subtotal)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Delivery fee</dt><dd>{formatINR(o.pricing.deliveryFee)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Taxes</dt><dd>{formatINR(o.pricing.tax)}</dd></div>
              {o.pricing.discount > 0 && <div className="flex justify-between text-brand-700"><dt>Discount</dt><dd>-{formatINR(o.pricing.discount)}</dd></div>}
              <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total</dt><dd>{formatINR(o.pricing.total)}</dd></div>
            </dl>
            {o.notes && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600"><strong>Customer note:</strong> {o.notes}</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <Link href={`/admin/users/${o.user._id}`} className="text-sm font-medium text-brand-700 hover:underline">{o.user.name}</Link>
            <p className="text-xs text-slate-500">{o.user.email} {o.user.phone && `· ${o.user.phone}`}</p>
            <p className="mt-2 text-sm">{o.deliveryAddress.line1}{o.deliveryAddress.city ? `, ${o.deliveryAddress.city}` : ""} {o.deliveryAddress.pincode}</p>
          </Card>
          <Card title="Hotel">
            <Link href={`/admin/restaurants/${o.restaurant._id}`} className="text-sm font-medium text-brand-700 hover:underline">{o.restaurant.name}</Link>
            <p className="text-xs text-slate-500">{o.restaurant.address.line1}, {o.restaurant.address.city}</p>
            {o.restaurant.phone && <p className="text-xs text-slate-500">{o.restaurant.phone}</p>}
          </Card>
          <Card title="Delivery partner">
            {o.deliveryPartner ? (
              <>
                <Link href={`/admin/users/${o.deliveryPartner._id}`} className="text-sm font-medium text-brand-700 hover:underline">{o.deliveryPartner.name}</Link>
                <p className="text-xs capitalize text-slate-500">{o.deliveryPartner.phone} · {o.deliveryPartner.delivery?.vehicleType} {o.deliveryPartner.delivery?.vehicleNumber}</p>
                <p className="mt-1 text-xs text-slate-500">Assigned {timeAgo(o.assignedAt)}</p>
              </>
            ) : <p className="text-sm text-amber-700">Not assigned yet</p>}
            {!!o.otpAttempts && <p className="mt-2 text-xs text-red-600">{o.otpAttempts} wrong OTP attempt{o.otpAttempts > 1 ? "s" : ""}</p>}
          </Card>
          <Card title="Payment">
            <div className="flex items-center justify-between text-sm">
              <span className="uppercase">{o.payment.method}</span>
              <Badge value={o.payment.status} />
            </div>
            {o.payment.transactionId && <p className="mt-1 text-xs text-slate-500">Txn: {o.payment.transactionId}</p>}
          </Card>
          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...o.timeline].reverse().map((t, i) => (
                <li key={i} className="relative">
                  <span className={cx("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white", t.status === "cancelled" || t.status === "otp_failed" ? "bg-red-500" : "bg-brand-500")} />
                  <p className="text-sm font-medium text-slate-800">{EVENT_LABELS[t.status] ?? t.status}</p>
                  {t.note && <p className="text-xs text-slate-600">{t.note}</p>}
                  <p className="text-[11px] text-slate-400">
                    {formatDateTime(t.at)} · {t.by?.name ?? ROLE_LABELS[t.byRole as Role] ?? "System"}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <AssignModal order={o} open={modal === "assign"} onClose={() => setModal(null)} onDone={reload} />
      <StatusOverrideModal order={o} open={modal === "status"} onClose={() => setModal(null)} onDone={reload} />
      <ConfirmDialog
        open={modal === "cancel"}
        title={`Cancel ${o.orderNumber}`}
        message="The customer, hotel and rider will be notified. If the order was prepaid, mark it refunded afterwards."
        confirmLabel="Cancel order"
        askReason
        reasonRequired
        onConfirm={(reason) => act({ action: "cancel", reason }, "Order cancelled")}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal === "unassign"}
        title="Remove delivery partner"
        variant="warning"
        message={`${o.deliveryPartner?.name} will be freed up and the order will have no rider until you assign one.`}
        confirmLabel="Remove"
        askReason
        onConfirm={(reason) => act({ action: "unassign", reason: reason || undefined }, "Rider removed")}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal === "refund"}
        title="Mark as refunded"
        variant="warning"
        message={`Record that ${formatINR(o.pricing.total)} was refunded to ${o.user.name}. (Gateway refunds will be automatic once online payments are live.)`}
        confirmLabel="Mark refunded"
        askReason
        onConfirm={(note) => act({ action: "refund", note: note || undefined }, "Marked as refunded")}
        onClose={() => setModal(null)}
      />
    </>
  );
}
