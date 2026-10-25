"use client";

import { useState } from "react";
import { Banknote, CircleCheck, PackageX, Store } from "lucide-react";
import { qs, useApi } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Button, EmptyState, ErrorBlock, cx } from "@/components/ui";
import type { RiderOrder } from "@/components/rider/RiderShell";

export default function RiderHistory() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ items: RiderOrder[]; total: number; page: number; pages: number }>(`/api/delivery/orders${qs({ page })}`);

  if (loading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-3xl" />)}</div>;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  return (
    <div className="space-y-4 animate-rise">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Completed tasks</h1>
        <p className="text-sm text-slate-500">{data.total} task{data.total === 1 ? "" : "s"} so far</p>
      </div>
      {data.items.length === 0 ? (
        <div className="rounded-3xl bg-white ring-1 ring-slate-200/70"><EmptyState title="No deliveries yet" description="Your completed deliveries will appear here." /></div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((o) => {
            const delivered = o.status === "delivered";
            return (
              <li key={o._id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-bold text-slate-900"><Store className="h-4 w-4 shrink-0 text-slate-400" /> {o.hotel.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{o.orderNumber} · to {o.customer.name}{o.customer.address ? `, ${o.customer.address}` : ""}</p>
                  </div>
                  <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset", delivered ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-red-50 text-red-700 ring-red-200")}>
                    {delivered ? <CircleCheck className="h-3.5 w-3.5" /> : <PackageX className="h-3.5 w-3.5" />} {delivered ? "Delivered" : "Cancelled"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>{formatDateTime(o.deliveredAt ?? o.createdAt)}{o.tripKm != null ? ` · ${o.tripKm} km` : ""}</span>
                  {delivered && o.payment.method === "cod" ? (
                    <span className="inline-flex items-center gap-1 font-bold text-saffron-700"><Banknote className="h-3.5 w-3.5" /> {formatINR(o.total)} cash</span>
                  ) : (
                    <span className="tabular-nums font-semibold text-slate-700">{formatINR(o.total)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.pages > 1 && (
        <div className="flex justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
          <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </div>
  );
}
