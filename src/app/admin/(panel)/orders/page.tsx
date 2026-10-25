"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { qs, useApi, useDebounced } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Pagination, Select, Table } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_METHODS, type OrderStatus } from "@/lib/constants";

type Row = {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  pricing: { total: number };
  payment: { method: string; status: string };
  createdAt: string;
  items: { name: string; quantity: number }[];
  user?: { _id: string; name: string };
  restaurant?: { _id: string; name: string };
  deliveryPartner?: { _id: string; name: string };
};
type ListRes = { items: Row[]; total: number; page: number; pages: number };

const TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] })),
];

function OrdersInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const [payment, setPayment] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const restaurant = sp.get("restaurant") ?? undefined;
  const user = sp.get("user") ?? undefined;
  const deliveryPartner = sp.get("deliveryPartner") ?? undefined;

  const { data, error, loading, reload } = useApi<ListRes>(
    `/api/admin/orders${qs({ status, q: dq, payment, from, to, page, restaurant, user, deliveryPartner })}`
  );
  useLiveRefresh(reload, ["order"]);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Orders" subtitle="Every order on the platform, updated live." />
      <div className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.value || "all"}
            onClick={() => reset(setStatus)(t.value)}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${status === t.value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Card bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap gap-3">
          <Input className="max-w-[14rem]" placeholder="Order number…" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          <Select className="max-w-[10rem]" value={payment} onChange={(e) => reset(setPayment)(e.target.value)}>
            <option value="">Any payment</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </Select>
          <Input type="date" className="max-w-[10rem]" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" />
          <Input type="date" className="max-w-[10rem]" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" />
          {(restaurant || user || deliveryPartner) && (
            <Link href="/admin/orders" className="self-center text-xs font-medium text-brand-700 hover:underline">Clear hotel/user filter</Link>
          )}
        </div>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No orders match these filters" />
        ) : (
          <>
            <Table head={["Order", "Customer", "Hotel", "Rider", "Items", "Total", "Payment", "Status", "Placed"]}>
              {data.items.map((o) => (
                <tr key={o._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5"><Link href={`/admin/orders/${o._id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-2.5">{o.user?.name ?? "-"}</td>
                  <td className="px-3 py-2.5">{o.restaurant?.name ?? "-"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{o.deliveryPartner?.name ?? <span className="text-amber-700">Unassigned</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{o.items.reduce((n, i) => n + i.quantity, 0)} items</td>
                  <td className="px-3 py-2.5 font-medium">{formatINR(o.pricing.total)}</td>
                  <td className="px-3 py-2.5 text-xs"><span className="uppercase">{o.payment.method}</span> <Badge value={o.payment.status} /></td>
                  <td className="px-3 py-2.5"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OrdersInner />
    </Suspense>
  );
}
