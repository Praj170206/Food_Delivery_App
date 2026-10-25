"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/client";
import { ErrorBlock, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { useHotel } from "@/components/manager/ManagerShell";
import { OrderCard, type ManagerOrder } from "@/components/manager/orderParts";
import type { OrderStatus } from "@/lib/constants";

const COLUMNS: { status: OrderStatus; title: string; hint: string; tone: string }[] = [
  { status: "placed", title: "New", hint: "Accept or reject", tone: "bg-sky-500" },
  { status: "confirmed", title: "Accepted", hint: "Start cooking", tone: "bg-indigo-500" },
  { status: "preparing", title: "Preparing", hint: "Mark ready when packed", tone: "bg-violet-500" },
  { status: "ready", title: "Ready for pickup", hint: "Hand over to the rider", tone: "bg-fuchsia-500" },
  { status: "picked_up", title: "Out for delivery", hint: "On the way to customer", tone: "bg-orange-500" },
];

export default function LiveOrdersPage() {
  const { restaurant } = useHotel();
  const { data, error, loading, reload } = useApi<{ items: ManagerOrder[] }>("/api/manager/orders?view=live");
  useLiveRefresh(reload, ["order"]);
  const [, tick] = useState(0);

  // Refresh rider distances and the "waiting for X min" timers.
  useEffect(() => {
    const t = setInterval(() => {
      reload();
      tick((n) => n + 1);
    }, 20000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;
  const prep = restaurant?.avgPrepTimeMins ?? 20;

  return (
    <>
      <PageHeader
        title="Live orders"
        subtitle={restaurant?.isOpen ? "New orders appear here instantly, with a sound alert." : "Your hotel is closed - switch to Open at the top to start receiving orders."}
      />
      <div className="scrollbar-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {COLUMNS.map((col) => {
          const orders = data.items.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/70 p-2.5 lg:w-auto">
              <header className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className={cx("h-2.5 w-2.5 rounded-full", col.tone)} />
                  {col.title}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{orders.length}</span>
              </header>
              <p className="mb-2 px-1 text-[11px] text-slate-500">{col.hint}</p>
              <div className="space-y-2.5">
                {orders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">No orders</p>
                ) : (
                  orders.map((o) => <OrderCard key={o._id} order={o} onDone={reload} defaultPrep={prep} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
