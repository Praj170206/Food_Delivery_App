"use client";

import Link from "next/link";
import { useState } from "react";
import { qs, useApi } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, Pagination } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";

type Row = {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  isActive: boolean;
  items: { name: string; quantity: number }[];
  pricing: { total: number };
  payment: { method: string };
  createdAt: string;
  estimatedDeliveryAt?: string;
  restaurant?: { name: string; slug: string };
};

export default function MyOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ items: Row[]; total: number; page: number; pages: number }>(`/api/customer/orders${qs({ page })}`);
  useLiveRefresh(reload, ["order"]);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;
  const active = data.items.filter((o) => o.isActive);
  const past = data.items.filter((o) => !o.isActive);

  if (!data.items.length) {
    return (
      <Card>
        <EmptyState title="No orders yet" description="Your orders and live tracking will appear here." />
        <div className="flex justify-center pb-4"><Link href="/hotels" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Order food</Link></div>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">On the way</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((o) => (
              <Link key={o._id} href={`/account/orders/${o._id}`} className="rounded-2xl border-2 border-brand-300 bg-brand-50 p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{o.restaurant?.name}</p>
                    <p className="text-xs text-slate-500">{o.orderNumber}</p>
                  </div>
                  <Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} />
                </div>
                <p className="mt-2 line-clamp-1 text-sm text-slate-600">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                <p className="mt-3 flex items-center justify-between text-sm font-medium text-brand-800">
                  <span>{o.estimatedDeliveryAt ? `Arriving ~${new Date(o.estimatedDeliveryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                  <span>Track live →</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Past orders</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {past.map((o) => (
              <li key={o._id}>
                <Link href={`/account/orders/${o._id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{o.restaurant?.name} <span className="text-xs font-normal text-slate-400">· {o.orderNumber}</span></p>
                    <p className="line-clamp-1 text-sm text-slate-500">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(o.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatINR(o.pricing.total)}</p>
                    <Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
    </div>
  );
}
