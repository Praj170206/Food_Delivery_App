"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, Leaf, MapPin, Search, SearchX, Sparkles, Star } from "lucide-react";
import { qs, useApi, useDebounced } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { Button, ErrorBlock, cx } from "@/components/ui";
import { VegMark, fallbackPhoto, photoUrl } from "@/components/brand";
import { useShop } from "@/components/shop/ShopProviders";

type Hotel = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  cuisines: string[];
  coverImage?: string;
  isOpen: boolean;
  rating: number;
  ratingCount: number;
  distanceKm: number;
  etaMins: number;
  startsFrom: number;
  hasJain: boolean;
  address: { city: string };
};

const CRAVINGS = [
  { label: "Dosa", photo: "1668236543090-82eba5ee5976" },
  { label: "Pav Bhaji", photo: "1606491956689-2ea866880c84" },
  { label: "Paneer", photo: "1567188040759-fb8a883dc6d8" },
  { label: "Samosa", photo: "1601050690597-df0568f70950" },
  { label: "Idli", photo: "1589301760014-d929f3979dbc" },
  { label: "Chaat", photo: "1610192244261-3f33de3f55e4" },
  { label: "Salad", photo: "1512621776951-a57141f2eefd" },
  { label: "Misal", photo: "1626132647523-66f5bf380027" },
];

function HotelCard({ h }: { h: Hotel }) {
  return (
    <Link href={`/hotels/${h.slug}`} className="group block animate-rise">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={h.coverImage || fallbackPhoto(h._id, 640, 400, h.cuisines)} alt="" loading="lazy" className={cx("h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]", !h.isOpen && "grayscale-[60%]")} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold tracking-wide text-green-800 shadow-sm backdrop-blur">
          <VegMark className="h-3.5 w-3.5" /> PURE VEG
        </span>
        {!h.isOpen && <span className="absolute right-3 top-3 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">Closed now</span>}
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm">
          <Clock className="h-3.5 w-3.5 text-brand-600" /> {h.etaMins} min
        </span>
      </div>
      <div className="px-1 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="truncate text-[17px] font-bold tracking-tight text-slate-900 transition group-hover:text-brand-700">{h.name}</h2>
          {h.ratingCount > 0 ? (
            <span className="tabular-nums inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white">
              {h.rating.toFixed(1)} <Star className="h-3 w-3 fill-current" />
            </span>
          ) : (
            <span className="shrink-0 rounded-lg bg-saffron-50 px-1.5 py-0.5 text-[11px] font-bold text-saffron-700 ring-1 ring-inset ring-saffron-200">NEW</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-500">{h.cuisines.join(" · ") || "Pure vegetarian"}</p>
        <p className="mt-1.5 flex items-center gap-3 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {h.distanceKm} km</span>
          {h.startsFrom > 0 && <span>From {formatINR(h.startsFrom)}</span>}
          {h.hasJain && <span className="font-medium text-brand-700">Jain options</span>}
        </p>
      </div>
    </Link>
  );
}

export default function HotelsPage() {
  const { location, setPickerOpen, setLocation } = useShop();
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [jain, setJain] = useState(false);
  const dq = useDebounced(q);

  useEffect(() => {
    // First visit: use the device's GPS; if that's blocked or fails, ask where to deliver.
    if (location) return;
    let cancelled = false;
    const ask = () => !cancelled && setPickerOpen(true);
    if (!navigator.geolocation) {
      const t = setTimeout(ask, 400);
      return () => clearTimeout(t);
    }
    navigator.geolocation.getCurrentPosition(
      (p) => !cancelled && setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Current location" }),
      ask,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    return () => {
      cancelled = true;
    };
  }, [location, setPickerOpen, setLocation]);

  const url = location ? `/api/public/restaurants${qs({ lat: location.lat, lng: location.lng, q: dq, open: openOnly ? 1 : undefined, jain: jain ? 1 : undefined })}` : null;
  const { data, error, loading, reload } = useApi<{ items: Hotel[]; radiusKm: number }>(url, { refreshMs: 15000 });

  return (
    <>
      {/* Hero */}
      <section className="relative -mx-4 mb-10 overflow-hidden px-4 sm:mx-0 sm:rounded-[28px]">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950" />
        <div className="grain absolute inset-0" />
        <div className="absolute -right-10 top-0 hidden h-full w-1/2 md:block">
          <div className="absolute right-6 top-8 h-56 w-56 overflow-hidden rounded-full shadow-xl ring-8 ring-white/10 lg:right-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl("1668236543090-82eba5ee5976", 500, 500)} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="absolute bottom-6 right-56 h-36 w-36 overflow-hidden rounded-full shadow-xl ring-8 ring-white/10 lg:right-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl("1606491956689-2ea866880c84", 300, 300)} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="relative max-w-xl px-2 py-12 sm:px-10 sm:py-14">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/15">
            <Leaf className="h-3.5 w-3.5" /> 100% vegetarian · always
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-[44px]">
            Pure-veg comfort,<br /><span className="text-saffron-300">delivered hot.</span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-brand-100/80">From crispy dosas to buttery pav bhaji - from kitchens that have never cooked anything else.</p>
          <div className="relative mt-7">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for a dish, cuisine or hotel"
              className="h-14 w-full rounded-2xl border-0 bg-white pl-12 pr-4 text-[15px] text-slate-900 shadow-xl outline-none ring-4 ring-white/10 placeholder:text-slate-400 focus:ring-saffron-300/40"
            />
          </div>
        </div>
      </section>

      {!location ? (
        <div className="py-12 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"><MapPin className="h-7 w-7" /></span>
          <h2 className="mt-5 text-xl font-bold text-slate-900">Where should we deliver?</h2>
          <p className="mt-1 text-slate-500">Set your location to see pure-veg kitchens near you.</p>
          <Button className="mt-6" size="lg" onClick={() => setPickerOpen(true)}>Set delivery location</Button>
        </div>
      ) : (
        <>
          {/* Cravings */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold tracking-tight text-slate-900">What are you craving?</h2>
            <div className="scrollbar-none -mx-4 flex gap-5 overflow-x-auto px-4 pb-1">
              {CRAVINGS.map((c) => {
                const on = dq.toLowerCase() === c.label.toLowerCase();
                return (
                  <button key={c.label} onClick={() => setQ(on ? "" : c.label)} className="group flex w-20 shrink-0 flex-col items-center gap-2">
                    <span className={cx("h-20 w-20 overflow-hidden rounded-full shadow-md ring-2 ring-offset-2 ring-offset-slate-50 transition", on ? "ring-brand-500" : "ring-transparent group-hover:ring-slate-200")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(c.photo, 200, 200)} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-110" />
                    </span>
                    <span className={cx("text-[13px] font-semibold", on ? "text-brand-700" : "text-slate-700")}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{dq ? `Results for “${dq}”` : "Pure-veg kitchens near you"}</h2>
              {data && <p className="mt-0.5 text-sm text-slate-500">{data.items.length} {data.items.length === 1 ? "place" : "places"} delivering to {location.label}</p>}
            </div>
            <div className="flex gap-2">
              {[
                { on: openOnly, set: setOpenOnly, label: "Open now", icon: Clock },
                { on: jain, set: setJain, label: "Jain options", icon: Sparkles },
              ].map((f) => (
                <button
                  key={f.label}
                  onClick={() => f.set(!f.on)}
                  className={cx(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow-xs ring-1 ring-inset transition",
                    f.on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300"
                  )}
                >
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading && !data ? (
            <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i}>
                  <div className="skeleton aspect-[16/10] rounded-2xl" />
                  <div className="skeleton mt-3 h-5 w-2/3 rounded" />
                  <div className="skeleton mt-2 h-4 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorBlock message={error} onRetry={reload} />
          ) : !data?.items.length ? (
            <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200/70">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><SearchX className="h-6 w-6" /></span>
              <p className="mt-4 font-semibold text-slate-800">{dq ? `Nothing matches “${dq}” nearby` : "No kitchens deliver here yet"}</p>
              <p className="mt-1 text-sm text-slate-500">We looked within {data?.radiusKm ?? 10} km of {location.label}. Try a different search or location.</p>
            </div>
          ) : (
            <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((h) => <HotelCard key={h._id} h={h} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
