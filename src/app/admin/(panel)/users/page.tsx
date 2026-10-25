"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, qs, useApi, useDebounced } from "@/lib/client";
import { formatDate, timeAgo } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { UserStatusActions } from "@/components/admin/UserStatusActions";
import { ROLES, ROLE_LABELS, USER_STATUSES, type Role, type UserStatus } from "@/lib/constants";

type UserRow = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  emailVerified?: boolean;
  createdAt: string;
  lastLoginAt?: string;
  restaurant?: { _id: string; name: string; status: string };
  delivery?: { isOnline?: boolean; isAvailable?: boolean; vehicleType?: string };
};
type ListRes = { items: UserRow[]; total: number; page: number; pages: number };

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "user" as Role, password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/users", { method: "POST", body: form });
      toast(`${ROLE_LABELS[form.role]} account created for ${form.name}`);
      setForm({ name: "", email: "", phone: "", role: "user", password: "" });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Role">
          <Select value={form.role} onChange={set("role")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>
        {form.role === "admin" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Admins have full access to every part of the platform. Only create admin accounts for trusted staff.</p>
        )}
        <Field label="Full name"><Input required value={form.name} onChange={set("name")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email"><Input required type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" /></Field>
        </div>
        <Field label="Temporary password" hint="8+ characters with upper & lower case letters and a number. Ask them to change it after first sign-in.">
          <Input required type="text" value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create account</Button>
        </div>
      </form>
    </Modal>
  );
}

function UsersInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [role, setRole] = useState(sp.get("role") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);

  const url = `/api/admin/users${qs({ q: dq, role, status, page })}`;
  const { data, error, loading, reload } = useApi<ListRes>(url);
  useLiveRefresh(reload, ["user", "auth"]);

  const setFilter = (k: "role" | "status", v: string) => {
    (k === "role" ? setRole : setStatus)(v);
    setPage(1);
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`/admin/users${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Customers, hotel managers, delivery partners and admins."
        actions={<Button onClick={() => setCreating(true)}>+ Create account</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["", ...ROLES].map((r) => (
          <button
            key={r || "all"}
            onClick={() => setFilter("role", r)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${role === r ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {r ? ROLE_LABELS[r as Role] : "All roles"}
          </button>
        ))}
      </div>

      <Card bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap gap-3">
          <Input className="max-w-xs" placeholder="Search name, email or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select className="max-w-[12rem]" value={status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {USER_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </Select>
        </div>

        {loading && !data ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState title="No users found" description="Try changing the filters." />
        ) : (
          <>
            <Table head={["Name", "Role", "Status", "Details", "Joined", "Last sign-in", "Actions"]}>
              {data.items.map((u) => (
                <tr key={u._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/users/${u._id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{u.name}</Link>
                    <p className="text-xs text-slate-500">
                      {u.email}{u.phone ? ` · ${u.phone}` : ""}
                      {u.emailVerified === false && <span className="ml-1.5 text-amber-700">· email unverified</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{ROLE_LABELS[u.role]}</td>
                  <td className="px-3 py-2.5"><Badge value={u.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {u.role === "manager" && (u.restaurant ? (
                      <Link href={`/admin/restaurants/${u.restaurant._id}`} className="hover:underline">{u.restaurant.name} <Badge value={u.restaurant.status} /></Link>
                    ) : "No hotel linked")}
                    {u.role === "delivery" && (
                      <span className="capitalize">{u.delivery?.vehicleType ?? "-"} · <Badge value={u.delivery?.isOnline ? "online" : "offline"} /></span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{timeAgo(u.lastLoginAt)}</td>
                  <td className="px-3 py-2.5"><UserStatusActions user={u} onDone={reload} compact /></td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <UsersInner />
    </Suspense>
  );
}
