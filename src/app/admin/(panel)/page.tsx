"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bike, IndianRupee, Receipt, Store } from "lucide-react";
import { useApi } from "@/lib/client";
import { formatINR, formatNumber, timeAgo } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard, Table } from "@/components/ui";
import { useLive, useLiveRefresh } from "@/components/live/LiveProvider";
import { ActivityFeed, type ActivityItem } from "@/components/admin/ActivityFeed";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";

type Stats = {
  users: { byRole: Record<string, number>; byStatus: Record<string, number> };
  restaurants: Record<string, number>;
  orders: { byStatus: Record<string, number>; active: number; today: number; revenueToday: number };
  partners: { total: number; online: number; available: number };
  pendingApprovals: { managers: number; delivery: number; restaurants: number };
  series: { date: string; orders: number; revenue: number; cancelled: number }[];
  recentOrders: {
    _id: string;
    orderNumber: string;
    status: OrderStatus;
    pricing: { total: number };
    createdAt: string;
    user?: { name: string };
    restaurant?: { name: string };
    deliveryPartner?: { name: string };
  }[];
  topRestaurants: { _id: string; name: string; orders: number; revenue: number }[];
};

function OrdersChart({ series }: { series: Stats["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.orders));
  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {series.map((s) => {
          const day = new Date(s.date + "T00:00:00");
          return (
            <div key={s.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-medium text-slate-600 opacity-0 transition group-hover:opacity-100">{s.orders}</span>
              <div className="flex w-full max-w-10 flex-col overflow-hidden rounded-t-md" style={{ height: `${Math.max(3, (s.orders / max) * 100)}%` }} title={`${s.orders} orders · ${formatINR(s.revenue)}`}>
                {s.cancelled > 0 && <div className="bg-red-300" style={{ height: `${(s.cancelled / s.orders) * 100}%` }} />}
                <div className={s.orders ? "flex-1 bg-brand-500" : "flex-1 bg-slate-200"} />
              </div>
              <span className="text-[11px] text-slate-500">{day.toLocaleDateString("en-IN", { weekday: "short" })}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Completed / in progress</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-300" /> Cancelled</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, error, loading, reload } = useApi<Stats>("/api/admin/stats");
  const { recent } = useLive();
  const { data: initialActivity } = useApi<{ items: ActivityItem[] }>("/api/admin/activity?limit=15");

  // Every live event can move a number on this page, so refresh on all of them (debounced).
  useLiveRefresh(reload);

  const feed = useMemo(() => {
    const seen = new Set<string>();
    return [...(recent as ActivityItem[]), ...(initialActivity?.items ?? [])]
      .filter((a) => (seen.has(a._id) ? false : (seen.add(a._id), true)))
      .slice(0, 15);
  }, [recent, initialActivity]);
  const freshIds = useMemo(() => new Set(recent.map((r) => r._id)), [recent]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const pendingTotal = data.pendingApprovals.managers + data.pendingApprovals.delivery + data.pendingApprovals.restaurants;
  const totalUsers = Object.values(data.users.byRole).reduce((a, b) => a + b, 0);
  const statusTotal = Math.max(1, Object.values(data.orders.byStatus).reduce((a, b) => a + b, 0));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Everything happening across GreenBite, updated live." />

      {pendingTotal > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <strong>{pendingTotal} approval{pendingTotal > 1 ? "s" : ""} waiting:</strong>{" "}
            {data.pendingApprovals.restaurants} hotel{data.pendingApprovals.restaurants === 1 ? "" : "s"}, {data.pendingApprovals.managers} manager
            {data.pendingApprovals.managers === 1 ? "" : "s"}, {data.pendingApprovals.delivery} delivery partner{data.pendingApprovals.delivery === 1 ? "" : "s"}
          </span>
          <span className="flex gap-3 font-medium">
            <Link href="/admin/restaurants?status=pending" className="underline">Review hotels</Link>
            <Link href="/admin/users?status=pending" className="underline">Review people</Link>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders today" value={formatNumber(data.orders.today)} hint={`${data.orders.active} active right now`} tone="blue" icon={<Receipt />} />
        <StatCard label="Revenue today" value={formatINR(data.orders.revenueToday)} hint="Excludes cancelled orders" tone="green" icon={<IndianRupee />} />
        <StatCard label="Riders online" value={`${data.partners.online}/${data.partners.total}`} hint={`${data.partners.available} available for orders`} tone="amber" icon={<Bike />} />
        <StatCard label="Live hotels" value={formatNumber(data.restaurants.approved ?? 0)} hint={`${data.restaurants.pending ?? 0} pending · ${data.restaurants.suspended ?? 0} suspended`} tone="green" icon={<Store />} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customers" value={formatNumber(data.users.byRole.user ?? 0)} />
        <StatCard label="Hotel managers" value={formatNumber(data.users.byRole.manager ?? 0)} />
        <StatCard label="Delivery partners" value={formatNumber(data.users.byRole.delivery ?? 0)} />
        <StatCard label="Total accounts" value={formatNumber(totalUsers)} hint={`${data.users.byStatus.suspended ?? 0} suspended`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Orders · last 7 days" className="lg:col-span-2">
          <OrdersChart series={data.series} />
        </Card>
        <Card title="Order status (all time)">
          <div className="space-y-2.5">
            {ORDER_STATUSES.map((s) => {
              const n = data.orders.byStatus[s] ?? 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">{ORDER_STATUS_LABELS[s]}</span>
                    <span className="font-medium text-slate-800">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className={s === "cancelled" ? "h-full rounded-full bg-red-400" : "h-full rounded-full bg-brand-500"} style={{ width: `${(n / statusTotal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Recent orders" className="lg:col-span-2" action={<Link href="/admin/orders" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} bodyClassName="p-2">
          {data.recentOrders.length === 0 ? (
            <EmptyState title="No orders yet" description="Orders will show up here the moment customers place them." />
          ) : (
            <Table head={["Order", "Customer", "Hotel", "Rider", "Total", "Status", ""]}>
              {data.recentOrders.map((o) => (
                <tr key={o._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/admin/orders/${o._id}`} className="text-brand-700 hover:underline">{o.orderNumber}</Link>
                  </td>
                  <td className="px-3 py-2.5">{o.user?.name ?? "-"}</td>
                  <td className="px-3 py-2.5">{o.restaurant?.name ?? "-"}</td>
                  <td className="px-3 py-2.5 text-slate-500">{o.deliveryPartner?.name ?? "Unassigned"}</td>
                  <td className="px-3 py-2.5">{formatINR(o.pricing.total)}</td>
                  <td className="px-3 py-2.5"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Live activity" action={<Link href="/admin/activity" className="text-xs font-medium text-brand-700 hover:underline">Full log</Link>} bodyClassName="max-h-[28rem] overflow-y-auto scrollbar-thin px-3 py-1">
          {feed.length === 0 ? <EmptyState title="No activity yet" /> : <ActivityFeed items={feed} freshIds={freshIds} compact />}
        </Card>
      </div>

      <Card title="Top hotels · last 30 days" className="mt-6" bodyClassName="p-2">
        {data.topRestaurants.length === 0 ? (
          <EmptyState title="No sales yet" />
        ) : (
          <Table head={["#", "Hotel", "Orders", "Revenue"]}>
            {data.topRestaurants.map((r, i) => (
              <tr key={r._id}>
                <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium">
                  <Link href={`/admin/restaurants/${r._id}`} className="hover:text-brand-700 hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.orders}</td>
                <td className="px-3 py-2.5">{formatINR(r.revenue)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
