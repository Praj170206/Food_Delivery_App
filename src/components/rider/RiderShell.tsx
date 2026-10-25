"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bike, History, LogOut, UserRound } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { haversineKm } from "@/lib/geo";
import { ToastProvider, cx, useToast } from "@/components/ui";
import { LiveProvider, useLive } from "@/components/live/LiveProvider";
import { Logo } from "@/components/brand";

export type RiderMe = {
  rider: {
    name: string;
    email: string;
    phone?: string;
    createdAt: string;
    vehicleType?: string;
    vehicleNumber?: string;
    licenseNumber?: string;
    isOnline: boolean;
    isAvailable: boolean;
    hasActiveOrder: boolean;
    location?: [number, number];
    lastLocationAt?: string;
    totalDeliveries: number;
    rating: number;
  };
  today: { deliveries: number; cash: number; km: number };
};

export type RiderOrder = {
  _id: string;
  orderNumber: string;
  status: "confirmed" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled";
  items: { name: string; quantity: number }[];
  total: number;
  payment: { method: string; status: string };
  collectCash: number;
  notes?: string;
  createdAt: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  otpAttempts: number;
  hotel: { name: string; phone?: string; address?: { line1: string; city: string }; location?: [number, number]; distanceKm?: number };
  customer: { name: string; phone?: string; address?: string; city?: string; location?: [number, number]; distanceKm?: number };
  tripKm?: number;
};

type Ctx = {
  me: RiderMe | null;
  order: RiderOrder | null;
  orderLoaded: boolean;
  position: [number, number] | null; // [lng, lat]
  gpsError: string;
  busy: boolean;
  setOnline: (online: boolean) => Promise<void>;
  refresh: () => void;
};
const RiderCtx = createContext<Ctx | null>(null);
export const useRider = () => {
  const c = useContext(RiderCtx);
  if (!c) throw new Error("useRider must be used inside the rider app");
  return c;
};

function alertSound() {
  try {
    const ctx = new AudioContext();
    [660, 880, 1100].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t);
      o.stop(t + 0.32);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
}

const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device doesn't support location"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  });

const gpsMessage = (e: unknown) =>
  (e as GeolocationPositionError)?.code === 1
    ? "Location permission is blocked. Allow location for this site in your browser settings to go online."
    : "Couldn't get your location. Move to an open area and try again.";

function RiderProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { subscribe } = useLive();
  const { data: me, reload: reloadMe } = useApi<RiderMe>("/api/delivery/me");
  const { data: cur, reload: reloadOrder, loading: orderLoading } = useApi<{ order: RiderOrder | null }>("/api/delivery/orders?view=current", { refreshMs: 15000 });
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastSent = useRef<{ at: number; pos: [number, number] } | null>(null);
  const prevOrderId = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(() => {
    reloadMe();
    reloadOrder();
  }, [reloadMe, reloadOrder]);

  // Any event about this rider's orders/account -> refresh (events are addressed to them only).
  useEffect(
    () =>
      subscribe((e) => {
        // A hotel near this rider has an order waiting for someone to accept it.
        if (e.action === "order.available") {
          alertSound();
          toast("New order near you - tap Accept to take it");
        }
        refresh();
      }),
    [subscribe, refresh, toast]
  );

  // New task assigned -> sound + vibration + toast.
  const orderId = cur?.order?._id ?? null;
  useEffect(() => {
    if (cur === null) return;
    if (prevOrderId.current !== undefined && orderId && orderId !== prevOrderId.current) {
      alertSound();
      toast(`New delivery assigned: ${cur.order!.orderNumber}`);
    }
    prevOrderId.current = orderId;
  }, [orderId, cur, toast]);

  // Live GPS while online: send every 4s, or sooner after moving 15 m.
  const online = !!me?.rider.isOnline;
  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      async (p) => {
        const pos: [number, number] = [p.coords.longitude, p.coords.latitude];
        setPosition(pos);
        setGpsError("");
        const last = lastSent.current;
        const moved = last ? haversineKm(last.pos, pos) * 1000 : Infinity;
        if (last && Date.now() - last.at < 4000 && moved < 15) return;
        lastSent.current = { at: Date.now(), pos };
        try {
          const res = await api<{ assignedOrder: { orderNumber: string } | null }>("/api/delivery/location", { method: "POST", body: { coordinates: pos, accuracy: p.coords.accuracy } });
          if (res.assignedOrder) refresh();
        } catch {}
      },
      (e) => setGpsError(gpsMessage(e)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online, refresh]);

  const setOnline = async (next: boolean) => {
    setBusy(true);
    setGpsError("");
    try {
      let coordinates: [number, number] | undefined;
      if (next) {
        try {
          const p = await getPosition();
          coordinates = [p.coords.longitude, p.coords.latitude];
          setPosition(coordinates);
        } catch (e) {
          setGpsError(gpsMessage(e));
          return;
        }
      }
      const res = await api<{ assignedOrder: { orderNumber: string } | null }>("/api/delivery/status", { method: "POST", body: { online: next, coordinates } });
      toast(next ? (res.assignedOrder ? `You're online - order ${res.assignedOrder.orderNumber} assigned!` : "You're online. We'll send you nearby orders.") : "You're offline");
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RiderCtx.Provider value={{ me, order: cur?.order ?? null, orderLoaded: !orderLoading || !!cur, position, gpsError, busy, setOnline, refresh }}>
      {children}
    </RiderCtx.Provider>
  );
}

const TABS = [
  { href: "/delivery", label: "Tasks", icon: Bike },
  { href: "/delivery/history", label: "History", icon: History },
  { href: "/delivery/profile", label: "Profile", icon: UserRound },
];

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useRider();
  const { status } = useLive();
  const online = me?.rider.isOnline;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/delivery/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-100/60">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-slate-50 shadow-sm sm:my-0 sm:border-x sm:border-slate-200">
        <header className="sticky top-0 z-[500] flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-xl">
          <Logo size="sm" subtitle="Delivery partner" />
          <div className="flex items-center gap-2">
            <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset", online ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-slate-100 text-slate-500 ring-slate-200")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", online ? "animate-pulse bg-brand-500" : "bg-slate-400")} />
              {online ? "ONLINE" : "OFFLINE"}
            </span>
            {status !== "realtime" && status !== "polling" && <span className="h-2 w-2 rounded-full bg-saffron-500" title="Reconnecting live updates" />}
            <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-5">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-[500] mx-auto max-w-lg border-t border-slate-200 bg-white/95 backdrop-blur-xl">
          <div className="grid grid-cols-3">
            {TABS.map((t) => {
              const active = t.href === "/delivery" ? pathname === "/delivery" : pathname.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} className={cx("flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition", active ? "text-brand-700" : "text-slate-400 hover:text-slate-700")}>
                  <t.icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function RiderShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <LiveProvider src="/api/stream">
        <RiderProvider>
          <Frame>{children}</Frame>
        </RiderProvider>
      </LiveProvider>
    </ToastProvider>
  );
}
