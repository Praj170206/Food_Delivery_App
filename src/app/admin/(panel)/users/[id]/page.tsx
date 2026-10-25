"use client";

import Link from "next/link";
import { use, useState } from "react";
import { api, useApi } from "@/lib/client";
import { formatDateTime, formatINR, timeAgo } from "@/lib/format";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Select, StatCard, Table, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { UserStatusActions } from "@/components/admin/UserStatusActions";
import { ActivityFeed, type ActivityItem } from "@/components/admin/ActivityFeed";
import { ORDER_STATUS_LABELS, ROLES, ROLE_LABELS, type OrderStatus, type Role, type UserStatus } from "@/lib/constants";

type Detail = {
  user: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    role: Role;
    status: UserStatus;
    statusReason?: string;
    emailVerified?: boolean;
    createdAt: string;
    lastLoginAt?: string;
    lastLoginIp?: string;
    failedLoginAttempts?: number;
    lockUntil?: string;
    restaurant?: { _id: string; name: string; status: string; isOpen: boolean; address?: { city?: string } };
    delivery?: {
      vehicleType?: string;
      vehicleNumber?: string;
      licenseNumber?: string;
      isOnline?: boolean;
      isAvailable?: boolean;
      lastLocationAt?: string;
      totalDeliveries?: number;
      rating?: number;
      activeOrder?: { _id: string; orderNumber: string; status: OrderStatus };
    };
    addresses?: { _id: string; label: string; line1: string; city?: string }[];
  };
  orderStats: { total: number; delivered: number; cancelled: number; value: number };
  recentOrders: { _id: string; orderNumber: string; status: OrderStatus; pricing: { total: number }; createdAt: string; restaurant?: { name: string } }[];
  activity: ActivityItem[];
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Detail>(`/api/admin/users/${id}`);
  useLiveRefresh(reload, ["user", "auth", "order"], undefined);
  const [newRole, setNewRole] = useState<Role | "">("");
  const [confirm, setConfirm] = useState<"role" | "logout" | null>(null);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;
  const { user, orderStats, recentOrders, activity } = data;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      toast(msg);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  const showOrders = user.role === "user" || user.role === "delivery";

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← All users</Link>
      <PageHeader
        title={user.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {ROLE_LABELS[user.role]} <Badge value={user.status} /> {user.statusReason && <span className="text-xs">({user.statusReason})</span>}
          </span>
        }
        actions={
          <>
            <UserStatusActions user={user} onDone={reload} />
            <Button variant="secondary" onClick={() => setConfirm("logout")}>Sign out everywhere</Button>
          </>
        }
      />

      {showOrders && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={user.role === "delivery" ? "Deliveries assigned" : "Orders placed"} value={orderStats.total} />
          <StatCard label="Delivered" value={orderStats.delivered} tone="green" />
          <StatCard label="Cancelled" value={orderStats.cancelled} tone="red" />
          <StatCard label={user.role === "delivery" ? "Order value handled" : "Total spent"} value={formatINR(orderStats.value)} tone="blue" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card title="Account">
            <dl className="divide-y divide-slate-100">
              <Row label="Email">{user.email}</Row>
              <Row label="Email verified">
                {user.emailVerified === false ? (
                  <span className="flex items-center justify-end gap-2">
                    <Badge value="pending" label="Not verified" />
                    <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => patch({ verifyEmail: true }, "Email marked as verified").catch(() => {})}>Mark verified</button>
                  </span>
                ) : <Badge value="active" label="Verified" />}
              </Row>
              <Row label="Phone">{user.phone || "-"}</Row>
              <Row label="Joined">{formatDateTime(user.createdAt)}</Row>
              <Row label="Last sign-in">{user.lastLoginAt ? `${timeAgo(user.lastLoginAt)}${user.lastLoginIp ? ` · ${user.lastLoginIp}` : ""}` : "Never"}</Row>
              {user.lockUntil && new Date(user.lockUntil) > new Date() && <Row label="Locked until">{formatDateTime(user.lockUntil)}</Row>}
            </dl>
          </Card>

          {user.role === "manager" && (
            <Card title="Hotel">
              {user.restaurant ? (
                <div className="text-sm">
                  <Link href={`/admin/restaurants/${user.restaurant._id}`} className="font-medium text-brand-700 hover:underline">{user.restaurant.name}</Link>
                  <p className="mt-1 flex gap-2 text-slate-500">
                    {user.restaurant.address?.city} <Badge value={user.restaurant.status} /> <Badge value={user.restaurant.isOpen ? "online" : "offline"} label={user.restaurant.isOpen ? "Open" : "Closed"} />
                  </p>
                </div>
              ) : (
                <EmptyState title="No hotel linked" description="Link one from the Hotels page." />
              )}
            </Card>
          )}

          {user.role === "delivery" && user.delivery && (
            <Card title="Delivery profile">
              <dl className="divide-y divide-slate-100">
                <Row label="Presence"><Badge value={user.delivery.isOnline ? "online" : "offline"} /></Row>
                <Row label="Available">{user.delivery.isAvailable ? "Yes" : "No"}</Row>
                <Row label="Vehicle"><span className="capitalize">{user.delivery.vehicleType}</span> {user.delivery.vehicleNumber}</Row>
                <Row label="License">{user.delivery.licenseNumber || "-"}</Row>
                <Row label="Total deliveries">{user.delivery.totalDeliveries ?? 0}</Row>
                <Row label="Last GPS ping">{timeAgo(user.delivery.lastLocationAt)}</Row>
                <Row label="Active order">
                  {user.delivery.activeOrder ? (
                    <Link href={`/admin/orders/${user.delivery.activeOrder._id}`} className="text-brand-700 hover:underline">{user.delivery.activeOrder.orderNumber}</Link>
                  ) : "None"}
                </Row>
              </dl>
            </Card>
          )}

          {user.role === "user" && (
            <Card title="Saved addresses">
              {user.addresses?.length ? (
                <ul className="space-y-2 text-sm">
                  {user.addresses.map((a) => <li key={a._id}><strong>{a.label}:</strong> {a.line1}{a.city ? `, ${a.city}` : ""}</li>)}
                </ul>
              ) : <p className="text-sm text-slate-500">No saved addresses.</p>}
            </Card>
          )}

          <Card title="Change role">
            <div className="flex gap-2">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                <option value="">Select new role…</option>
                {ROLES.filter((r) => r !== user.role).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
              <Button variant="warning" disabled={!newRole} onClick={() => setConfirm("role")}>Change</Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">They'll be signed out and must sign in again with the new role.</p>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {showOrders && (
            <Card title="Recent orders" bodyClassName="p-2">
              {recentOrders.length === 0 ? <EmptyState title="No orders yet" /> : (
                <Table head={["Order", "Hotel", "Total", "Status", "Placed"]}>
                  {recentOrders.map((o) => (
                    <tr key={o._id}>
                      <td className="px-3 py-2.5"><Link href={`/admin/orders/${o._id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                      <td className="px-3 py-2.5">{o.restaurant?.name}</td>
                      <td className="px-3 py-2.5">{formatINR(o.pricing.total)}</td>
                      <td className="px-3 py-2.5"><Badge value={o.status} label={ORDER_STATUS_LABELS[o.status]} /></td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}
          <Card title="Activity by / about this user" action={<Link href={`/admin/activity?actor=${user._id}`} className="text-xs font-medium text-brand-700 hover:underline">Full history</Link>} bodyClassName="px-3 py-1">
            {activity.length === 0 ? <EmptyState title="No activity recorded" /> : <ActivityFeed items={activity} />}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "role"}
        title="Change role"
        variant="warning"
        message={<>Change {user.name} from <strong>{ROLE_LABELS[user.role]}</strong> to <strong>{newRole ? ROLE_LABELS[newRole] : ""}</strong>?{newRole === "admin" && " They will get full admin access."}</>}
        confirmLabel="Change role"
        onConfirm={() => patch({ role: newRole }, "Role updated")}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "logout"}
        title="Sign out everywhere"
        variant="warning"
        message={`${user.name} will be signed out of every device immediately.`}
        confirmLabel="Sign out"
        onConfirm={() => patch({ forceLogout: true }, "All sessions ended")}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
