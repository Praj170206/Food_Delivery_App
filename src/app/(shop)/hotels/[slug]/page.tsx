"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bike, Clock, Flame, Info, MapPin, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { qs, useApi } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { ConfirmDialog, EmptyState, ErrorBlock, cx } from "@/components/ui";
import { VegMark, fallbackPhoto } from "@/components/brand";
import { useShop } from "@/components/shop/ShopProviders";
import { groupBySection } from "@/lib/menu";

type MenuItem = { _id: string; name: string; description?: string; category: string; price: number; image?: string; isJain: boolean; isVegan: boolean; spiceLevel: string; isAvailable: boolean };
type Data = {
  restaurant: { _id: string; name: string; slug: string; description?: string; cuisines: string[]; coverImage?: string; isOpen: boolean; rating: number; ratingCount: number; avgPrepTimeMins: number; address: { line1: string; city: string } };
  menu: MenuItem[];
  delivery: { distanceKm: number; deliverable: boolean; fee: number; freeAbove: number; etaMins: number } | null;
};

function QtyControl({ qty, onChange, disabled }: { qty: number; onChange: (n: number) => void; disabled?: boolean }) {
  if (qty === 0) {
    return (
      <button
        disabled={disabled}
        onClick={() => onChange(1)}
        className="h-9 w-24 rounded-xl bg-white text-sm font-extrabold tracking-wide text-brand-700 shadow-md ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-300 active:scale-95 disabled:text-slate-400 disabled:shadow-none"
      >
        ADD
      </button>
    );
  }
  return (
    <div className="flex h-9 w-24 items-center justify-between rounded-xl bg-brand-600 text-white shadow-md animate-pop">
      <button onClick={() => onChange(qty - 1)} className="flex h-full w-8 items-center justify-center rounded-l-xl hover:bg-brand-700" aria-label="Remove one"><Minus className="h-3.5 w-3.5" strokeWidth={3} /></button>
      <span className="tabular-nums text-sm font-bold">{qty}</span>
      <button onClick={() => onChange(qty + 1)} disabled={qty >= 20} className="flex h-full w-8 items-center justify-center rounded-r-xl hover:bg-brand-700" aria-label="Add one"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></button>
    </div>
  );
}

export default function HotelMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { location, cart, add, setQty, cartCount, cartTotal } = useShop();
  const { data, error, loading, reload } = useApi<Data>(`/api/public/restaurants/${slug}${qs({ lat: location?.lat, lng: location?.lng })}`, { refreshMs: 15000 });
  const [conflict, setConflict] = useState<MenuItem | null>(null);
  const [vegFilter, setVegFilter] = useState<"" | "jain" | "vegan">("");
  const { data: config } = useApi<{ minOrderValue: number }>("/api/public/config");

  // Sections in serving order: Starters -> Main Course -> Breads -> ... -> Beverages.
  const grouped = useMemo(
    () => groupBySection((data?.menu ?? []).filter((m) => (vegFilter === "jain" ? m.isJain : vegFilter === "vegan" ? m.isVegan : true))),
    [data, vegFilter]
  );
  const [active, setActive] = useState(0);
  const sectionKey = grouped.map(([c]) => c).join("|");

  // Highlight the section currently being read (scroll-spy).
  useEffect(() => {
    if (!sectionKey) return;
    const els = sectionKey.split("|").map((_, i) => document.getElementById(`sec-${i}`)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(Number(visible.target.id.slice(4)));
      },
      { rootMargin: "-150px 0px -55% 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionKey]);

  // Keep the active mobile tab visible in the horizontal strip.
  useEffect(() => {
    const tab = document.getElementById(`tab-${active}`);
    if (tab && tab.offsetParent) tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  const jumpTo = (i: number) => {
    setActive(i);
    document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-72 rounded-[28px]" />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
      </div>
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Hotel not found"} onRetry={reload} />;
  const { restaurant: r, delivery } = data;
  const canOrder = r.isOpen && (delivery?.deliverable ?? true);
  const qtyOf = (id: string) => (cart?.restaurantId === r._id ? cart.items.find((i) => i.menuItemId === id)?.quantity ?? 0 : 0);
  const hotel = { _id: r._id, slug: r.slug, name: r.name };

  const change = (m: MenuItem, n: number) => {
    if (qtyOf(m._id) === 0 && n > 0) {
      if (!add(hotel, { menuItemId: m._id, name: m.name, price: m.price })) setConflict(m);
    } else setQty(m._id, n);
  };

  return (
    <div className="pb-28">
      {/* Header */}
      <section className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-[28px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.coverImage || fallbackPhoto(r._id, 1400, 600, r.cuisines)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
        <div className="relative px-5 pb-7 pt-5 sm:px-9">
          <Link href="/hotels" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur hover:bg-white/25">
            <ArrowLeft className="h-3.5 w-3.5" /> All kitchens
          </Link>
          <div className="mt-24 flex flex-wrap items-end justify-between gap-4 sm:mt-32">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[11px] font-bold tracking-wide text-green-800"><VegMark className="h-3.5 w-3.5" /> PURE VEG KITCHEN</span>
              <h1 className="mt-3 font-display text-4xl font-semibold text-white sm:text-5xl">{r.name}</h1>
              <p className="mt-2 text-sm text-white/80">{r.cuisines.join(" · ")} · {r.address.line1}, {r.address.city}</p>
            </div>
            {r.ratingCount > 0 && (
              <div className="rounded-2xl bg-white/95 px-4 py-2.5 text-center shadow-lg">
                <p className="tabular-nums flex items-center justify-center gap-1 text-xl font-bold text-brand-700">{r.rating.toFixed(1)} <Star className="h-4 w-4 fill-current" /></p>
                <p className="text-[11px] font-medium text-slate-500">{r.ratingCount} ratings</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Facts bar */}
      <div className="relative z-10 mx-auto -mt-0 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-white shadow-md ring-1 ring-slate-200/70 sm:mx-8 sm:-mt-6">
        {[
          { icon: Clock, label: "Delivery in", value: delivery ? `${delivery.etaMins} min` : `${r.avgPrepTimeMins + 10} min` },
          { icon: MapPin, label: "Distance", value: delivery ? `${delivery.distanceKm} km` : "-" },
          { icon: Bike, label: "Delivery fee", value: delivery ? (delivery.freeAbove > 0 ? `${formatINR(delivery.fee)} · free over ${formatINR(delivery.freeAbove)}` : formatINR(delivery.fee)) : "-" },
        ].map((f) => (
          <div key={f.label} className="flex items-center gap-3 px-4 py-3.5">
            <f.icon className="hidden h-5 w-5 shrink-0 text-brand-600 sm:block" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</p>
              <p className="truncate text-sm font-bold text-slate-800">{f.value}</p>
            </div>
          </div>
        ))}
      </div>

      {(!r.isOpen || (delivery && !delivery.deliverable)) && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-saffron-50 px-4 py-3 text-sm text-saffron-700 ring-1 ring-inset ring-saffron-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {!r.isOpen ? "This kitchen is closed right now. Browse the menu - ordering opens when they do." : `This kitchen doesn't deliver to your current location (${delivery?.distanceKm} km away).`}
        </div>
      )}
      {r.description && <p className="mx-auto mt-6 max-w-3xl text-center text-[15px] leading-relaxed text-slate-600">{r.description}</p>}

      {/* Filters + section tabs (tabs on mobile; desktop uses the sidebar) */}
      <div className="sticky top-[68px] z-20 -mx-4 mt-8 border-b border-slate-200/70 bg-slate-50/90 px-4 py-3 backdrop-blur-xl">
        <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
          {([["", "Full menu"], ["jain", "Jain"], ["vegan", "Vegan"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setVegFilter(v)} className={cx("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-inset transition", vegFilter === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300")}>
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-slate-200 lg:hidden" />
          {grouped.map(([category], i) => (
            <button
              key={category}
              id={`tab-${i}`}
              onClick={() => jumpTo(i)}
              className={cx("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition lg:hidden", active === i ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-white")}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? <EmptyState title={vegFilter ? `No ${vegFilter === "jain" ? "Jain" : "vegan"} dishes here yet` : "No dishes here yet"} /> : (
        <div className="mt-6 lg:grid lg:grid-cols-[230px_1fr] lg:gap-8">
          {/* Desktop section sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-[150px] rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Menu</p>
              {grouped.map(([category, items], i) => (
                <button
                  key={category}
                  onClick={() => jumpTo(i)}
                  className={cx(
                    "relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                    active === i ? "bg-brand-50 font-bold text-brand-800" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {active === i && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
                  <span className="truncate">{category}</span>
                  <span className={cx("tabular-nums ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", active === i ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>{items.length}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-10">
            {grouped.map(([category, items], i) => (
              <section key={category} id={`sec-${i}`} className="scroll-mt-[150px]">
                <div className="mb-4 flex items-end gap-3">
                  <h2 className="text-[22px] font-bold tracking-tight text-slate-900">{category}</h2>
                  <span className="mb-1 text-sm font-medium text-slate-400">{items.length} item{items.length > 1 ? "s" : ""}</span>
                  <span className="mb-2.5 h-px flex-1 bg-slate-200" />
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70">
                  {items.map((m) => (
                    <li key={m._id} className={cx("flex gap-5 p-5 transition hover:bg-slate-50/50", !m.isAvailable && "opacity-55")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <VegMark />
                          {m.isJain && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-brand-800 ring-1 ring-inset ring-brand-200">JAIN</span>}
                          {m.isVegan && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-brand-800 ring-1 ring-inset ring-brand-200">VEGAN</span>}
                          {m.spiceLevel === "hot" && <span className="inline-flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-red-700 ring-1 ring-inset ring-red-200"><Flame className="h-3 w-3" /> SPICY</span>}
                        </div>
                        <h3 className="mt-2 text-[16.5px] font-bold text-slate-900">{m.name}</h3>
                        <p className="tabular-nums mt-0.5 font-semibold text-slate-800">{formatINR(m.price)}</p>
                        {m.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{m.description}</p>}
                      </div>
                      {/* Only the dish's own photo - a stock picture could misrepresent what's served. */}
                      <div className={cx("relative flex shrink-0 flex-col items-center", m.image ? "w-32 sm:w-36" : "w-24 justify-center")}>
                        {m.image && (
                          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div className={m.image ? "-mt-5" : ""}>
                          {m.isAvailable ? (
                            <QtyControl qty={qtyOf(m._id)} onChange={(n) => change(m, n)} disabled={!canOrder} />
                          ) : (
                            <span className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-bold text-slate-500 shadow-md ring-1 ring-slate-200">SOLD OUT</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {cartCount > 0 && cart?.restaurantId === r._id && (
        <div className="fixed inset-x-0 bottom-5 z-[400] px-4 animate-rise">
          <Link href="/checkout" className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-brand-700 px-5 py-3.5 text-white shadow-xl ring-1 ring-brand-900/40 transition hover:bg-brand-800">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><ShoppingBag className="h-4 w-4" /></span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-brand-200">{cartCount} item{cartCount > 1 ? "s" : ""} added</span>
                <span className="tabular-nums block font-bold">{formatINR(cartTotal)} <span className="text-xs font-medium text-brand-200">plus taxes</span></span>
                {config && cartTotal < config.minOrderValue && <span className="block text-[11px] font-semibold text-saffron-200">Add {formatINR(config.minOrderValue - cartTotal)} more to order (min {formatINR(config.minOrderValue)})</span>}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold">View cart <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={!!conflict}
        title="Start a new cart?"
        variant="primary"
        message={`Your cart has dishes from ${cart?.restaurantName}. Adding this will clear it and start a fresh cart from ${r.name}.`}
        confirmLabel="Start new cart"
        onConfirm={() => {
          if (conflict) add(hotel, { menuItemId: conflict._id, name: conflict.name, price: conflict.price }, true);
        }}
        onClose={() => setConflict(null)}
      />
    </div>
  );
}
