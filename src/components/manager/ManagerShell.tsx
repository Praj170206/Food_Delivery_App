"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Badge, Toggle, useToast } from "@/components/ui";
import { BellRing, History, LayoutDashboard, Salad, Store, UserRound } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/shell/DashboardShell";
import { useLive, useLiveRefresh } from "@/components/live/LiveProvider";
import type { RestaurantStatus } from "@/lib/constants";

const NAV: NavItem[] = [
  { href: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { href: "/manager/orders", label: "Live orders", icon: BellRing },
  { href: "/manager/history", label: "Order history", icon: History },
  { href: "/manager/menu", label: "Menu", icon: Salad },
  { href: "/manager/profile", label: "Hotel profile", icon: Store },
  { href: "/manager/account", label: "My account", icon: UserRound },
];

export type ManagerRestaurant = {
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
  avgPrepTimeMins: number;
  fssaiLicense?: string;
  coverImage?: string;
  commissionPercent: number;
  locationConfirmed?: boolean;
  rating: number;
  ratingCount: number;
};

const Ctx = createContext<{ restaurant: ManagerRestaurant | null; reload: () => void; setOpen: (v: boolean) => Promise<void> } | null>(null);
export const useHotel = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHotel must be used inside the manager panel");
  return c;
};

/** Short two-tone chime via Web Audio, so no sound file is needed. */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {}
}

function HotelProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { data, reload } = useApi<{ restaurant: ManagerRestaurant }>("/api/manager/restaurant");
  const { subscribe } = useLive();
  useLiveRefresh(reload, ["restaurant"]);

  // Ring + toast for every new order, wherever the manager is in the panel.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.action === "order.placed") {
          chime();
          toast("New order received - check Live orders");
        }
      }),
    [subscribe, toast]
  );

  const setOpen = async (isOpen: boolean) => {
    try {
      await api("/api/manager/restaurant", { method: "PATCH", body: { isOpen } });
      toast(isOpen ? "Your hotel is now open for orders" : "Your hotel is now closed");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return <Ctx.Provider value={{ restaurant: data?.restaurant ?? null, reload, setOpen }}>{children}</Ctx.Provider>;
}

function HotelHeader() {
  const { restaurant, setOpen } = useHotel();
  const [busy, setBusy] = useState(false);
  if (!restaurant) return <p className="text-sm text-slate-500">Loading hotel…</p>;
  return (
    <div className="flex items-center gap-4">
      <span className="truncate text-sm font-semibold text-slate-800">{restaurant.name}</span>
      {restaurant.status !== "approved" ? (
        <Badge value={restaurant.status} label={restaurant.status === "pending" ? "Awaiting approval" : restaurant.status} />
      ) : (
        <div className="w-52 whitespace-nowrap">
          <Toggle
            checked={restaurant.isOpen}
            label={busy ? "Updating…" : restaurant.isOpen ? "Open for orders" : "Closed"}
            onChange={async (v) => {
              setBusy(true);
              await setOpen(v);
              setBusy(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBanner() {
  const { restaurant } = useHotel();
  if (!restaurant) return null;
  if (restaurant.status === "approved") {
    if (restaurant.locationConfirmed) return null;
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
        <span><strong>Your hotel&apos;s map location isn&apos;t confirmed.</strong> Customers and riders are matched by distance, so nearby people may not find you and riders can&apos;t accept your orders.</span>
        <Link href="/manager/profile" className="shrink-0 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700">Set location now</Link>
      </div>
    );
  }
  const text: Record<string, string> = {
    pending: "Your hotel is awaiting admin approval. You can set up your menu and profile now - you'll be able to open once approved.",
    suspended: "Your hotel has been suspended by the admin team and is hidden from customers.",
    rejected: "Your hotel application was not approved.",
  };
  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${restaurant.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>
      {text[restaurant.status]}
      {restaurant.statusReason && <span className="mt-1 block text-xs">Reason: {restaurant.statusReason}</span>}
    </div>
  );
}

export function ManagerShell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  return (
    <DashboardShell user={user} nav={NAV} home="/manager" subtitle="Hotel partner" streamSrc="/api/stream" Inner={HotelProvider} headerSlot={<HotelHeader />}>
      <StatusBanner />
      {children}
    </DashboardShell>
  );
}
