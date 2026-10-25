"use client";

import { useMemo, useState } from "react";
import { Salad } from "lucide-react";
import { VegMark } from "@/components/brand";
import { api, useApi } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea, Toggle, cx, useToast } from "@/components/ui";
import { useLiveRefresh } from "@/components/live/LiveProvider";
import { MENU_SECTIONS, groupBySection } from "@/lib/menu";

type Item = {
  _id: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  image?: string;
  isJain: boolean;
  isVegan: boolean;
  spiceLevel: "mild" | "medium" | "hot";
  isAvailable: boolean;
  isBlocked: boolean;
  blockReason?: string;
};
type Form = Omit<Item, "_id" | "isBlocked" | "blockReason" | "price"> & { price: string };

const EMPTY: Form = { name: "", description: "", category: "", price: "", image: "", isJain: false, isVegan: false, spiceLevel: "medium", isAvailable: true };

function ItemModal({ item, categories, open, onClose, onSaved }: { item: Item | null; categories: string[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(EMPTY);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset the form whenever a different item (or "new") is opened.
  const k = open ? item?._id ?? "new" : null;
  if (k !== key) {
    setKey(k);
    setError("");
    setF(item ? { ...item, description: item.description ?? "", image: item.image ?? "", price: String(item.price) } : EMPTY);
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...f, price: Number(f.price) };
      if (item) await api(`/api/manager/menu/${item._id}`, { method: "PATCH", body });
      else await api("/api/manager/menu", { method: "POST", body });
      toast(item ? `"${f.name}" updated` : `"${f.name}" added to your menu`);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const allCats = [...new Set([...MENU_SECTIONS, ...categories])];
  return (
    <Modal open={open} onClose={onClose} title={item ? `Edit ${item.name}` : "Add menu item"} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900 sm:col-span-2"><VegMark className="h-3.5 w-3.5" /> GreenBite is 100% vegetarian - every item you add is listed as pure veg. Non-veg items are removed by the admin team.</p>
        <Field label="Item name"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Paneer Butter Masala" /></Field>
        <Field label="Menu section" hint="Customers see your menu grouped by these sections. Pick one or type your own.">
          <Input required list="menu-categories" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Starters" />
          <datalist id="menu-categories">{allCats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="-mt-1 flex flex-wrap gap-1.5 sm:col-span-2">
          {allCats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("category", c)}
              className={cx("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition", f.category === c ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300")}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Creamy tomato gravy with soft paneer cubes" /></Field></div>
        <Field label="Price (₹)"><Input required type="number" min={1} step="1" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Spice level">
          <Select value={f.spiceLevel} onChange={(e) => set("spiceLevel", e.target.value as Form["spiceLevel"])}>
            <option value="mild">Mild</option>
            <option value="medium">Medium</option>
            <option value="hot">Hot</option>
          </Select>
        </Field>
        <div className="sm:col-span-2"><Field label="Image URL (optional)" hint="A https:// link to a photo of the dish."><Input type="url" value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…" /></Field></div>
        <div className="divide-y divide-slate-100 sm:col-span-2">
          <Toggle checked={f.isJain} onChange={(v) => set("isJain", v)} label="Jain" description="No onion, garlic or root vegetables." />
          <Toggle checked={f.isVegan} onChange={(v) => set("isVegan", v)} label="Vegan" description="No dairy, honey or other animal products." />
          <Toggle checked={f.isAvailable} onChange={(v) => set("isAvailable", v)} label="Available now" description="Turn off when the dish is sold out." />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{item ? "Save changes" : "Add item"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MenuPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ items: Item[] }>("/api/manager/menu");
  useLiveRefresh(reload, ["menuItem"]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Same section order customers see.
    return groupBySection(items.filter((i) => !needle || i.name.toLowerCase().includes(needle)));
  }, [items, q]);

  const toggle = async (item: Item) => {
    setBusyId(item._id);
    try {
      await api(`/api/manager/menu/${item._id}`, { method: "PATCH", body: { isAvailable: !item.isAvailable } });
      toast(item.isAvailable ? `"${item.name}" marked sold out` : `"${item.name}" is back in stock`);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };
  const remove = async () => {
    try {
      await api(`/api/manager/menu/${deleting!._id}`, { method: "DELETE" });
      toast(`"${deleting!.name}" removed`);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Menu" subtitle={`${items.length} items · ${items.filter((i) => i.isAvailable && !i.isBlocked).length} available now`} actions={<Button onClick={() => setAdding(true)}>+ Add item</Button>} />
      {items.length === 0 ? (
        <Card>
          <EmptyState title="Your menu is empty" description="Add your dishes so customers can start ordering." />
          <div className="flex justify-center pb-4"><Button onClick={() => setAdding(true)}>Add your first item</Button></div>
        </Card>
      ) : (
        <>
          <Input className="mb-4 max-w-xs" placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="space-y-6">
            {grouped.map(([category, list]) => (
              <Card key={category} title={`${category} (${list.length})`} bodyClassName="p-0">
                <ul className="divide-y divide-slate-100">
                  {list.map((i) => (
                    <li key={i._id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3", i.isBlocked && "bg-red-50/60")}>
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100"><Salad className="h-6 w-6" /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">
                          <VegMark className="mr-1.5 inline-flex h-3.5 w-3.5 align-[-2px]" />{i.name}
                          {i.isJain && <span className="ml-2 text-[11px] font-medium text-brand-700">JAIN</span>}
                          {i.isVegan && <span className="ml-2 text-[11px] font-medium text-brand-700">VEGAN</span>}
                        </p>
                        {i.description && <p className="line-clamp-1 text-xs text-slate-500">{i.description}</p>}
                        <p className="mt-0.5 text-sm font-semibold text-slate-800">{formatINR(i.price)} <span className="text-xs font-normal capitalize text-slate-500">· {i.spiceLevel}</span></p>
                        {i.isBlocked && <p className="mt-1 text-xs font-medium text-red-700">Blocked by admin{i.blockReason ? `: ${i.blockReason}` : ""} - hidden from customers.</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {i.isBlocked ? <Badge value="suspended" label="Blocked" /> : (
                          <button
                            onClick={() => toggle(i)}
                            disabled={busyId === i._id}
                            className={cx("rounded-full px-3 py-1 text-xs font-medium transition", i.isAvailable ? "bg-brand-100 text-brand-800 hover:bg-brand-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                          >
                            {i.isAvailable ? "In stock" : "Sold out"}
                          </button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setEditing(i)}>Edit</Button>
                        {!i.isBlocked && <Button size="sm" variant="ghost" onClick={() => setDeleting(i)}>Delete</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
      <ItemModal open={adding || !!editing} item={editing} categories={categories} onClose={() => { setAdding(false); setEditing(null); }} onSaved={reload} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete menu item"
        message={`Remove "${deleting?.name}" from your menu? Past orders are not affected. To hide it temporarily, mark it sold out instead.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
