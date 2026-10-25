"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, IndianRupee, Receipt, Star, Wallet } from "lucide-react";
import { useApi } from "@/lib/client";
import { formatINR, timeAgo } from "@/lib/format";
import { Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard, cx } from "@/components/ui";
import { useLive, useLiveRefresh, type LiveActivity } from "@/components/live/LiveProvider";

type Stats = {
  restaurant: { name: string; status: string; isOpen: boolean; rating: number; ratingCount: number; commissionPercent: number };
  today: { orders: number; sales: number; earnings: number };
  statusCounts: Record<string, number>;
  series: { date: string; orders: number; sales: number; cancelled: number }[];
  menu: { total: number; available: number; blocked: number };
};

export default function ManagerDashboard() {
  const { data, error, loading, reload } = useApi<Stats>("/api/manager/stats");
  useLiveRefresh(reload, ["order", "menuItem", "restaurant"]);
  const { recent } = useLive();
  const { data: history } = useApi<{ items: LiveActivity[] }>("/api/me/activity?limit=12");
  const feed = useMemo(() => {
    const seen = new Set<string>();
    return [...recent, ...(history?.items ?? [])].filter((a) => (seen.has(a._id) ? false : (seen.add(a._id), true))).slice(0, 12);
  }, [recent, history]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const c = data.statusCounts;
  const waiting = c.placed ?? 0;
  const max = Math.max(1, ...data.series.map((s) => s.orders));

  return (
    <>
      <PageHeader title={`Hello, ${data.restaurant.name}`} subtitle="Today at a glance. Updates live as orders come in." />

      {waiting > 0 && (
        <Link href="/manager/orders" className="mb-6 flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900 hover:bg-brand-100">
          <span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> {waiting} new order{waiting > 1 ? "s" : ""} waiting for you to accept</span>
          <span>Open live orders →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders today" value={data.today.orders} tone="blue" icon={<Receipt />} />
        <StatCard label="Food sales today" value={formatINR(data.today.sales)} tone="green" icon={<IndianRupee />} />
        <StatCard label="Your earnings today" value={formatINR(data.today.earnings)} hint={`After ${data.restaurant.commissionPercent}% platform commission`} tone="green" icon={<Wallet />} />
        <StatCard label="Rating" value={data.restaurant.ratingCount ? `${data.restaurant.rating.toFixed(1)} / 5` : "-"} hint={data.restaurant.ratingCount ? `${data.restaurant.ratingCount} ratings` : "No ratings yet"} tone="amber" icon={<Star />} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="New" value={c.placed ?? 0} tone={waiting ? "red" : "slate"} />
        <StatCard label="Accepted" value={c.confirmed ?? 0} />
        <StatCard label="Preparing" value={c.preparing ?? 0} />
        <StatCard label="Ready for pickup" value={c.ready ?? 0} />
        <StatCard label="Out for delivery" value={c.picked_up ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Orders · last 7 days" className="lg:col-span-2">
          <div className="flex h-40 items-end gap-2">
            {data.series.map((s) => (
              <div key={s.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${s.orders} orders · ${formatINR(s.sales)}`}>
                <span className="text-[11px] text-slate-600">{s.orders || ""}</span>
                <div className={cx("w-full max-w-10 rounded-t-md", s.orders ? "bg-brand-500" : "bg-slate-200")} style={{ height: `${Math.max(3, (s.orders / max) * 100)}%` }} />
                <span className="text-[11px] text-slate-500">{new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Menu" action={<Link href="/manager/menu" className="text-xs font-medium text-brand-700 hover:underline">Manage</Link>}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Items on menu</dt><dd className="font-medium">{data.menu.total}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Available now</dt><dd className="font-medium text-brand-700">{data.menu.available}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Sold out / hidden</dt><dd className="font-medium">{data.menu.total - data.menu.available - data.menu.blocked}</dd></div>
            {data.menu.blocked > 0 && <div className="flex justify-between"><dt className="text-red-600">Blocked by admin</dt><dd className="font-medium text-red-600">{data.menu.blocked}</dd></div>}
          </dl>
          {data.menu.total === 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Add your first dishes so customers can order.</p>}
        </Card>
      </div>

      <Card title="Notifications" className="mt-6" bodyClassName="px-4 py-1">
        {feed.length === 0 ? <EmptyState title="Nothing yet" description="Order updates, rider assignments and admin messages show up here instantly." /> : (
          <ul className="divide-y divide-slate-100">
            {feed.map((a) => (
              <li key={a._id} className="flex gap-3 py-2.5">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.severity === "warning" ? "bg-amber-500" : a.severity === "critical" ? "bg-red-500" : "bg-brand-500")} />
                <div>
                  <p className="text-sm text-slate-800">{a.entityType === "order" && a.entityId ? <Link href={`/manager/orders/${a.entityId}`} className="hover:underline">{a.message}</Link> : a.message}</p>
                  <p className="text-xs text-slate-500">{timeAgo(a.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
