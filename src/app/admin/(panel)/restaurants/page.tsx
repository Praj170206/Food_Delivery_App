"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api, qs, useApi, useDebounced } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, Textarea, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { RestaurantStatusActions } from "@/components/admin/RestaurantStatusActions";
import { RESTAURANT_STATUSES, type RestaurantStatus } from "@/lib/constants";

type Row = {
  _id: string;
  name: string;
  status: RestaurantStatus;
  isOpen: boolean;
  address: { line1: string; city: string };
  cuisines: string[];
  manager?: { _id: string; name: string; email: string; status: string };
  menuCount: number;
  orderCount: number;
  commissionPercent: number;
  createdAt: string;
};
type ListRes = { items: Row[]; total: number; page: number; pages: number };
type ManagerOpt = { _id: string; name: string; email: string; restaurant?: { _id: string } };

const EMPTY = { name: "", description: "", manager: "", phone: "", email: "", line1: "", city: "", state: "", pincode: "", lat: "", lng: "", cuisines: "", fssaiLicense: "", commissionPercent: "15" };

function CreateRestaurantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: managers } = useApi<{ items: ManagerOpt[] }>(open ? "/api/admin/users?role=manager&status=active&limit=100" : null);
  const free = managers?.items.filter((m) => !m.restaurant) ?? [];
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fillMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setError("Couldn't read your location")
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const lat = Number(form.lat), lng = Number(form.lng);
    if (!form.lat || !form.lng || isNaN(lat) || isNaN(lng)) return setError("Enter valid latitude and longitude");
    setBusy(true);
    try {
      await api("/api/admin/restaurants", {
        method: "POST",
        body: {
          name: form.name,
          description: form.description || undefined,
          manager: form.manager || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          line1: form.line1,
          city: form.city,
          state: form.state || undefined,
          pincode: form.pincode || undefined,
          coordinates: [lng, lat],
          cuisines: form.cuisines.split(",").map((c) => c.trim()).filter(Boolean),
          fssaiLicense: form.fssaiLicense || undefined,
          commissionPercent: Number(form.commissionPercent) || 0,
          status: "approved",
        },
      });
      toast(`${form.name} added`);
      setForm(EMPTY);
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add hotel" wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Hotel name"><Input required value={form.name} onChange={set("name")} /></Field>
        <Field label="Hotel manager" hint="Only managers without a hotel are listed.">
          <Select value={form.manager} onChange={set("manager")}>
            <option value="">Assign later</option>
            {free.map((m) => <option key={m._id} value={m._id}>{m.name} ({m.email})</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} value={form.description} onChange={set("description")} /></Field></div>
        <Field label="Phone"><Input value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
        <div className="sm:col-span-2"><Field label="Address"><Input required value={form.line1} onChange={set("line1")} /></Field></div>
        <Field label="City"><Input required value={form.city} onChange={set("city")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State"><Input value={form.state} onChange={set("state")} /></Field>
          <Field label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></Field>
        </div>
        <Field label="Latitude"><Input required value={form.lat} onChange={set("lat")} placeholder="12.9716" /></Field>
        <Field label="Longitude">
          <div className="flex gap-2">
            <Input required value={form.lng} onChange={set("lng")} placeholder="77.5946" />
            <Button type="button" variant="secondary" onClick={fillMyLocation} title="Use my current location"><LocateFixed className="h-4 w-4" /></Button>
          </div>
        </Field>
        <Field label="Cuisines" hint="Comma separated, e.g. South Indian, Jain, Chinese"><Input value={form.cuisines} onChange={set("cuisines")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="FSSAI license"><Input value={form.fssaiLicense} onChange={set("fssaiLicense")} /></Field>
          <Field label="Commission %"><Input type="number" min={0} max={100} value={form.commissionPercent} onChange={set("commissionPercent")} /></Field>
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Add hotel</Button>
        </div>
      </form>
    </Modal>
  );
}

function RestaurantsInner() {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<ListRes>(`/api/admin/restaurants${qs({ q: dq, status, page })}`);
  useLiveRefresh(reload, ["restaurant", "menuItem"]);

  return (
    <>
      <PageHeader title="Hotels" subtitle="Pure-veg restaurants on the platform. Approve new hotels, suspend bad actors, moderate menus." actions={<Button onClick={() => setCreating(true)}>+ Add hotel</Button>} />
      <Card bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap gap-3">
          <Input className="max-w-xs" placeholder="Search name, city or cuisine…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select className="max-w-[12rem]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {RESTAURANT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No hotels found" />
        ) : (
          <>
            <Table head={["Hotel", "Manager", "Status", "Menu", "Orders", "Commission", "Added", "Actions"]}>
              {data.items.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/restaurants/${r._id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{r.name}</Link>
                    <p className="text-xs text-slate-500">{r.address.city}{r.cuisines.length ? ` · ${r.cuisines.slice(0, 3).join(", ")}` : ""}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.manager ? <Link href={`/admin/users/${r.manager._id}`} className="hover:underline">{r.manager.name}</Link> : <span className="text-amber-700">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <Badge value={r.status} />
                      {r.status === "approved" && <span className="text-[11px] text-slate-500">{r.isOpen ? "● Open now" : "○ Closed"}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{r.menuCount}</td>
                  <td className="px-3 py-2.5">{r.orderCount}</td>
                  <td className="px-3 py-2.5">{r.commissionPercent}%</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5"><RestaurantStatusActions restaurant={r} onDone={reload} compact /></td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <CreateRestaurantModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </>
  );
}

export default function RestaurantsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RestaurantsInner />
    </Suspense>
  );
}
