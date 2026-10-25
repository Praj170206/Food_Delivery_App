import Link from "next/link";
import type { ReactNode } from "react";
import { Bike, Lock, ShieldCheck, Store } from "lucide-react";
import { Logo, VegMark, photoUrl } from "@/components/brand";
import type { Role } from "@/lib/constants";

type PortalLook = { label: string; photo?: string; quote: string; points: string; badge: ReactNode };

const LOOK: Record<Role, PortalLook> = {
  user: {
    label: "",
    photo: "1668236543090-82eba5ee5976",
    quote: "Food that's pure in every way - from the kitchen to your doorstep.",
    points: "Verified kitchens · Live tracking · OTP-secured delivery",
    badge: <><VegMark className="h-3.5 w-3.5" /> 100% vegetarian. Always.</>,
  },
  manager: {
    label: "Hotel partner",
    photo: "1630383249896-424e482df921",
    quote: "Your kitchen, our riders. Grow with customers who only want pure veg.",
    points: "Live order board · Menu control · Automatic rider assignment",
    badge: <><Store className="h-3.5 w-3.5" /> Hotel partner portal</>,
  },
  delivery: {
    label: "Delivery partner",
    photo: "1626132647523-66f5bf380027",
    quote: "Nearby orders, fair pay and the flexibility to ride when you want.",
    points: "Orders near you · Turn-by-turn pickup · OTP handover",
    badge: <><Bike className="h-3.5 w-3.5" /> Delivery partner portal</>,
  },
  admin: {
    label: "Admin console",
    quote: "Restricted area. Every sign-in and action here is recorded.",
    points: "Authorised GreenBite staff only",
    badge: <><Lock className="h-3.5 w-3.5" /> Restricted access</>,
  },
};

/** Split-screen frame for every sign-in / sign-up page; each portal has its own look. */
export function AuthShell({ portal, children }: { portal: Role; children: ReactNode }) {
  const look = LOOK[portal];
  const admin = portal === "admin";
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.05fr]">
      <aside className={`relative hidden overflow-hidden lg:block ${admin ? "bg-slate-950" : ""}`}>
        {look.photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(look.photo, 1200, 1600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-brand-950/70 via-brand-950/40 to-brand-950/95" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(35,151,95,0.25),transparent_55%)]" />
            <div className="grain absolute inset-0" />
            <ShieldCheck className="absolute -right-16 top-1/2 h-[420px] w-[420px] -translate-y-1/2 text-white/[0.03]" strokeWidth={1} />
          </>
        )}
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href={admin ? "/admin/login" : "/"}><Logo tone="light" size="lg" subtitle={look.label || undefined} /></Link>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur">{look.badge}</p>
            <blockquote className="mt-6 max-w-md font-display text-4xl font-semibold leading-tight text-white">&ldquo;{look.quote}&rdquo;</blockquote>
            <p className="mt-6 flex items-center gap-2 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4 text-brand-300" /> {look.points}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col bg-slate-50 px-5 py-8 sm:px-10 lg:bg-white">
        <div className="lg:hidden"><Logo subtitle={look.label || undefined} /></div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </div>
        <p className="text-center text-xs text-slate-400">© {new Date().getFullYear()} GreenBite{admin ? " · Restricted system" : " · Pure-veg food delivery"}</p>
      </main>
    </div>
  );
}
