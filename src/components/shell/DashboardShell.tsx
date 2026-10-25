"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { LiveProvider, useLive } from "@/components/live/LiveProvider";
import { ToastProvider, cx } from "@/components/ui";
import { Avatar, Logo } from "@/components/brand";
import { api } from "@/lib/client";
import { loginPathFor } from "@/lib/constants";

export type NavItem = { href: string; label: string; icon: LucideIcon };

function LiveIndicator() {
  const { status } = useLive();
  const map = {
    realtime: ["bg-brand-500", "Live"],
    polling: ["bg-saffron-500", "Live · polling"],
    connecting: ["bg-slate-400", "Connecting"],
    offline: ["bg-red-500", "Reconnecting"],
  } as const;
  const [dot, label] = map[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-xs ring-1 ring-slate-200">
      <span className="relative flex h-2 w-2">
        {status === "realtime" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />}
        <span className={cx("relative inline-flex h-2 w-2 rounded-full", dot)} />
      </span>
      {label}
    </span>
  );
}

/** Sidebar layout shared by the admin console and the hotel manager panel. */
export function DashboardShell({
  user,
  nav,
  home,
  subtitle,
  streamSrc,
  headerSlot,
  Inner,
  children,
}: {
  user: { name: string; email: string };
  nav: NavItem[];
  home: string;
  subtitle: string;
  streamSrc: string;
  headerSlot?: ReactNode;
  /** Optional role-specific provider, mounted inside the live connection and wrapping the whole layout. */
  Inner?: ComponentType<{ children: ReactNode }>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace(loginPathFor(home));
    router.refresh();
  };

  const isActive = (href: string) => (href === home ? pathname === home : pathname.startsWith(href));

  const sidebar = (
    <nav className="relative flex h-full flex-col bg-gradient-to-b from-brand-950 via-[#082c1e] to-[#04190f]">
      <div className="grain pointer-events-none absolute inset-0" />
      <Link href={home} className="relative px-5 pb-6 pt-6" onClick={() => setOpen(false)}>
        <Logo tone="light" subtitle={subtitle} />
      </Link>
      <p className="relative px-6 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand-300/50">Menu</p>
      <div className="scrollbar-none relative flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all",
                active ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-brand-100/65 hover:bg-white/[0.05] hover:text-white"
              )}
            >
              {active && <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
              <Icon className={cx("h-[18px] w-[18px] shrink-0 transition", active ? "text-brand-300" : "text-brand-200/50 group-hover:text-brand-200")} strokeWidth={2} />
              {n.label}
            </Link>
          );
        })}
      </div>
      <div className="relative m-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/[0.06]">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} className="h-9 w-9 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11.5px] text-brand-100/50">{user.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-brand-100/60 transition hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  const Wrap = Inner ?? Passthrough;
  return (
    <ToastProvider>
      <LiveProvider src={streamSrc}>
        <Wrap>
          <div className="min-h-screen lg:pl-[17rem]">
            <aside className="fixed inset-y-0 left-0 hidden w-[17rem] lg:block">{sidebar}</aside>
            {open && (
              <div className="fixed inset-0 z-[900] animate-fade-in lg:hidden" onClick={() => setOpen(false)}>
                <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
                <aside className="absolute inset-y-0 left-0 w-[17rem] shadow-xl animate-rise" onClick={(e) => e.stopPropagation()}>
                  {sidebar}
                  <button onClick={() => setOpen(false)} className="absolute right-3 top-6 rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </button>
                </aside>
              </div>
            )}
            <header className="sticky top-0 z-[500] flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-slate-50/80 px-4 backdrop-blur-xl lg:px-8">
              <button className="rounded-xl p-2 text-slate-600 ring-1 ring-slate-200 hover:bg-white lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden min-w-0 flex-1 sm:block">{headerSlot ?? <p className="text-sm text-slate-500">100% vegetarian delivery platform</p>}</div>
              <LiveIndicator />
            </header>
            <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">{children}</main>
          </div>
        </Wrap>
      </LiveProvider>
    </ToastProvider>
  );
}

function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
