"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, MapPin, Receipt, ShoppingBag } from "lucide-react";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/constants";
import { Avatar, Logo } from "@/components/brand";
import { useShop } from "./ShopProviders";

export function ShopNavbar() {
  const router = useRouter();
  const { me, meLoaded, location, setPickerOpen, cartCount, cartTotal, refreshMe } = useShop();

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await refreshMe();
    router.replace("/hotels");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-[500] border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-3 px-4">
        <Link href="/hotels" className="shrink-0">
          <span className="sm:hidden"><Logo withText={false} /></span>
          <span className="hidden sm:inline"><Logo /></span>
        </Link>
        <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
        <button onClick={() => setPickerOpen(true)} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-slate-100/70 sm:max-w-sm sm:flex-none">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60">
            <MapPin className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">Deliver to</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-slate-800">
              <span className="truncate">{location?.label ?? "Set your location"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-slate-600" />
            </span>
          </span>
        </button>
        <nav className="ml-auto flex shrink-0 items-center gap-1.5 text-sm">
          {meLoaded && me?.role === "user" && (
            <Link href="/account" className="hidden items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-100 sm:flex">
              <Receipt className="h-4 w-4 text-slate-500" /> Orders
            </Link>
          )}
          {meLoaded && me && me.role !== "user" && (
            <Link href={ROLE_HOME[me.role]} className="hidden rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 sm:block">{ROLE_LABELS[me.role]} panel</Link>
          )}
          {meLoaded && !me && (
            <Link href="/login?next=/hotels" className="rounded-xl px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-100">Sign in</Link>
          )}
          <Link href="/checkout" className="relative flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3.5 font-semibold text-white shadow-md transition hover:bg-slate-800">
            <ShoppingBag className="h-4 w-4" />
            <span className="tabular-nums hidden sm:inline">{cartCount ? formatINR(cartTotal) : "Cart"}</span>
            {cartCount > 0 && (
              <span className="tabular-nums absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-saffron-500 px-1 text-[11px] font-bold ring-2 ring-white">{cartCount}</span>
            )}
          </Link>
          {me && (
            <div className="ml-1 hidden items-center gap-1 md:flex">
              <Link href={me.role === "user" ? "/account/profile" : ROLE_HOME[me.role]} title={me.name}><Avatar name={me.name} /></Link>
              <button onClick={logout} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Sign out" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
