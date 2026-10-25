"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useMemo, useState } from "react";
import { VegMark } from "@/components/brand";
import { api, useApi } from "@/lib/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Select, StatCard, Table, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { RestaurantStatusActions } from "@/components/admin/RestaurantStatusActions";
import { ORDER_STATUS_LABELS, type OrderStatus, type RestaurantStatus } from "@/lib/constants";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type MenuItem = {
  _id: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  isAvailable: boolean;
  isBlocked: boolean;
  blockReason?: string;
  isJain?: boolean;
  isVegan?: boolean;
};
type Detail = {
  restaurant: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    status: RestaurantStatus;
    statusReason?: string;
    isOpen: boolean;
    phone?: string;
    email?: string;
    address: { line1: string; city: string; state?: string; pincode?: string };
    location: { coordinates: [number, number] };
    cuisines: string[];
    fssaiLicense?: string;
    commissionPercent: number;
    locationConfirmed?: boolean;
    avgPrepTimeMins: number;
    rating: number;
    ratingCount: number;
    createdAt: string;
    manager?: { _id: string; name: string; email: string; phone?: string; status: string };
  };
  menu: MenuItem[];
  stats: { total: number; delivered: number; cancelled: number; revenue: number };
  recentOrders: { _id: string; orderNumber: string; status: OrderStatus; pricing: { total: number }; createdAt: string; user?: { name: string } }[];
};

export default function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Detail>(`/api/admin/restaurants/${id}`);
  useLiveRefresh(reload, ["restaurant", "menuItem", "order"]);
  const [commission, setCommission] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<MenuItem | null>(null);
  const [closing, setClosing] = useState(false);
  const { data: managers } = useApi<{ items: { _id: string; name: string; email: string; restaurant?: { _id: string } }[] }>(
    "/api/admin/users?role=manager&status=active&limit=100"
  );

  const grouped = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    for (const m of data?.menu ?? []) g.set(m.category, [...(g.get(m.category) ?? []), m]);
    return [...g.entries()];
  }, [data]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;
  const { restaurant: r, stats, recentOrders, menu } = data;
  const [lng, lat] = r.location.coordinates;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/restaurants/${id}`, { method: "PATCH", body });
      toast(msg);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  const moderate = async (item: MenuItem, isBlocked: boolean, reason?: string) => {
    try {
      await api(`/api/admin/menu-items/${item._id}`, { method: "PATCH", body: { isBlocked, reason } });
      toast(`"${item.name}" ${isBlocked ? "blocked" : "unblocked"}`);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  const managerOptions = (managers?.items ?? []).filter((m) => !m.restaurant || m.restaurant._id === r._id || m._id === r.manager?._id);

  return (
    <>
      <Link href="/admin/restaurants" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← All hotels</Link>
      <PageHeader
        title={r.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={r.status} />
            {r.status === "approved" && <Badge value={r.isOpen ? "online" : "offline"} label={r.isOpen ? "Open now" : "Closed"} />}
            <span className="inline-flex items-center gap-1.5 font-medium text-green-800"><VegMark className="h-3.5 w-3.5" /> Pure veg</span>
            {r.statusReason && <span className="text-xs">({r.statusReason})</span>}
          </span>
        }
        actions={
          <>
            <RestaurantStatusActions restaurant={r} onDone={reload} />
            {r.isOpen && <Button variant="warning" onClick={() => setClosing(true)}>Force close</Button>}
          </>
        }
      />

      {!r.locationConfirmed && (
        <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          <strong>Map location not confirmed.</strong> This hotel was never pinned on a map, so its location is a placeholder. Customers, delivery radius and rider matching all depend on it - ask the manager to set it in Hotel profile before approving.
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total orders" value={stats.total} />
        <StatCard label="Delivered" value={stats.delivered} tone="green" />
        <StatCard label="Cancelled" value={stats.cancelled} tone="red" />
        <StatCard label="Food sales" value={formatINR(stats.revenue)} hint={`Platform earns ${r.commissionPercent}%: ${formatINR((stats.revenue * r.commissionPercent) / 100)}`} tone="blue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">Address</dt><dd>{r.address.line1}, {r.address.city}{r.address.state ? `, ${r.address.state}` : ""} {r.address.pincode}</dd></div>
              <div><dt className="text-xs text-slate-500">Contact</dt><dd>{r.phone || "-"} · {r.email || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Cuisines</dt><dd>{r.cuisines.join(", ") || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">FSSAI license</dt><dd>{r.fssaiLicense || <span className="text-amber-700">Not provided</span>}</dd></div>
              <div><dt className="text-xs text-slate-500">Avg prep time</dt><dd>{r.avgPrepTimeMins} min</dd></div>
              <div><dt className="text-xs text-slate-500">Rating</dt><dd>{r.ratingCount ? `${r.rating.toFixed(1)} / 5 (${r.ratingCount} ratings)` : "No ratings yet"}</dd></div>
              <div><dt className="text-xs text-slate-500">Joined</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
            </dl>
          </Card>

          <Card title="Manager">
            {r.manager ? (
              <p className="mb-3 text-sm">
                <Link href={`/admin/users/${r.manager._id}`} className="font-medium text-brand-700 hover:underline">{r.manager.name}</Link>{" "}
                <Badge value={r.manager.status} />
                <span className="block text-xs text-slate-500">{r.manager.email} {r.manager.phone && `· ${r.manager.phone}`}</span>
              </p>
            ) : <p className="mb-3 text-sm text-amber-700">No manager assigned.</p>}
            <div className="flex gap-2">
              <Select value={managerId ?? r.manager?._id ?? ""} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">No manager</option>
                {managerOptions.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </Select>
              <Button variant="secondary" disabled={managerId === null || managerId === (r.manager?._id ?? "")} onClick={() => patch({ manager: managerId || null }, "Manager updated").then(() => setManagerId(null)).catch(() => {})}>Save</Button>
            </div>
          </Card>

          <Card title="Commission">
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={100} value={commission ?? String(r.commissionPercent)} onChange={(e) => setCommission(e.target.value)} className="max-w-[7rem]" />
              <span className="text-sm text-slate-500">% of food subtotal</span>
              <Button variant="secondary" disabled={commission === null || Number(commission) === r.commissionPercent} onClick={() => patch({ commissionPercent: Number(commission) }, "Commission updated").then(() => setCommission(null)).catch(() => {})}>Save</Button>
            </div>
          </Card>

          <Card title="Location" bodyClassName="p-2">
            <LeafletMap height={220} markers={[{ id: r._id, position: [lat, lng], color: "#1f7a3a", label: r.name, popup: r.address.line1 }]} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title={`Menu (${menu.length} items)`} bodyClassName="p-2">
            {menu.length === 0 ? (
              <EmptyState title="No menu items yet" description="The hotel manager adds menu items from their dashboard." />
            ) : (
              grouped.map(([category, items]) => (
                <div key={category} className="mb-4">
                  <h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</h3>
                  <Table head={["Item", "Price", "Status", ""]}>
                    {items.map((m) => (
                      <tr key={m._id} className={m.isBlocked ? "bg-red-50/50" : ""}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2 font-medium"><VegMark className="h-3.5 w-3.5" /> {m.name}</span>
                          {(m.isJain || m.isVegan) && <span className="ml-2 text-[11px] text-brand-700">{[m.isJain && "Jain", m.isVegan && "Vegan"].filter(Boolean).join(" · ")}</span>}
                          {m.description && <p className="line-clamp-1 text-xs text-slate-500">{m.description}</p>}
                          {m.isBlocked && m.blockReason && <p className="text-xs text-red-600">Blocked: {m.blockReason}</p>}
                        </td>
                        <td className="px-3 py-2">{formatINR(m.price)}</td>
                        <td className="px-3 py-2">
                          {m.isBlocked ? <Badge value="suspended" label="Blocked" /> : <Badge value={m.isAvailable ? "active" : "offline"} label={m.isAvailable ? "Available" : "Sold out"} />}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {m.isBlocked ? (
                            <Button size="sm" variant="secondary" onClick={() => moderate(m, false).catch(() => {})}>Unblock</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setBlocking(m)}>Block</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))
            )}
          </Card>

          <Card title="Recent orders" action={<Link href={`/admin/orders?restaurant=${r._id}`} className="text-xs font-medium text-brand-700 hover:underline">All orders</Link>} bodyClassName="p-2">
            {recentOrders.length === 0 ? <EmptyState title="No orders yet" /> : (
              <Table head={["Order", "Customer", "Total", "Status", "Placed"]}>
                {recentOrders.map((o) => (
                  <tr key={o._id}>
                    <td className="px-3 py-2.5"><Link href={`/admin/orders/${o._id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                    <td className="px-3 py-2.5">{o.user?.name}</td>
                    <td className="px-3 py-2.5">{formatINR(o.pricing.total)}</td>
                    <td className="px-3 py-2.5"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /></td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!blocking}
        title="Block menu item"
        message={`"${blocking?.name}" will be hidden from customers until you unblock it. Use this for items that break platform rules (e.g. not vegetarian).`}
        confirmLabel="Block item"
        askReason
        reasonRequired
        onConfirm={(reason) => moderate(blocking!, true, reason)}
        onClose={() => setBlocking(null)}
      />
      <ConfirmDialog
        open={closing}
        title="Force close hotel"
        variant="warning"
        message={`${r.name} will stop accepting new orders right now. The manager can reopen it.`}
        confirmLabel="Close now"
        onConfirm={() => patch({ isOpen: false }, `${r.name} closed`)}
        onClose={() => setClosing(false)}
      />
    </>
  );
}
