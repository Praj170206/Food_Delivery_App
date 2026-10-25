"use client";

import Link from "next/link";
import { useState } from "react";
import { qs, useApi, useDebounced } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Pagination, Table } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import type { ManagerOrder } from "@/components/manager/orderParts";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

const TABS = [
  { value: "history", label: "All past" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrderHistoryPage() {
  const [tab, setTab] = useState("history");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = tab === "history" ? { view: "history" } : { status: tab };
  const { data, error, loading, reload } = useApi<{ items: ManagerOrder[]; total: number; page: number; pages: number }>(`/api/manager/orders${qs({ ...params, q: dq, page })}`);
  useLiveRefresh(reload, ["order"]);

  return (
    <>
      <PageHeader title="Order history" subtitle="Completed and cancelled orders." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => { setTab(t.value); setPage(1); }} className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === t.value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Card bodyClassName="p-3">
        <Input className="mb-3 max-w-xs" placeholder="Order number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No orders here yet" />
        ) : (
          <>
            <Table head={["Order", "Customer", "Items", "Food total", "Payment", "Status", "Placed"]}>
              {data.items.map((o) => (
                <tr key={o._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5"><Link href={`/manager/orders/${o._id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-2.5">{o.customer.name}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2.5 text-xs text-slate-600">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
                  <td className="px-3 py-2.5">{formatINR(o.pricing.subtotal)}</td>
                  <td className="px-3 py-2.5 text-xs uppercase">{o.payment.method}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} />
                    {o.cancellation?.reason && <p className="mt-0.5 max-w-[12rem] truncate text-[11px] text-slate-500">{o.cancellation.reason}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
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
