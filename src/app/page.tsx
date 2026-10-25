import Link from "next/link";
import { ArrowRight, Bike, ChefHat, Clock, KeyRound, Leaf, MapPin, ShieldCheck, Store } from "lucide-react";
import { Logo, VegMark, photoUrl } from "@/components/brand";

const DISHES = [
  { id: "1668236543090-82eba5ee5976", name: "Masala Dosa Platter", tag: "South Indian" },
  { id: "1606491956689-2ea866880c84", name: "Butter Pav Bhaji", tag: "Mumbai street" },
  { id: "1567188040759-fb8a883dc6d8", name: "Paneer Tikka Sizzler", tag: "Tandoor" },
  { id: "1601050690597-df0568f70950", name: "Punjabi Samosa", tag: "Snacks" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(35,151,95,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(249,125,7,0.18),transparent_50%)]" />
        <div className="grain absolute inset-0" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
          <Logo tone="light" />
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-xl px-4 py-2 font-semibold text-brand-100 transition hover:bg-white/10 hover:text-white">Sign in</Link>
            <Link href="/hotels" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-900 shadow-lg transition hover:bg-brand-50">Order now</Link>
          </nav>
        </header>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-16">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/15">
              <VegMark className="h-3.5 w-3.5" /> India&apos;s pure-vegetarian delivery network
            </p>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-[68px]">
              Pure veg.<br />
              <span className="bg-gradient-to-r from-saffron-200 via-saffron-300 to-saffron-400 bg-clip-text text-transparent">Purely delicious.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-brand-100/75">
              Every kitchen on GreenBite is 100% vegetarian - verified, licensed and loved. Track your rider live and receive your food with a secure OTP.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/hotels" className="group inline-flex h-14 items-center gap-2 rounded-2xl bg-gradient-to-b from-saffron-400 to-saffron-500 px-7 text-[15px] font-bold text-white shadow-xl shadow-saffron-900/20 ring-1 ring-inset ring-white/20 transition hover:to-saffron-600">
                Explore kitchens near you <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link href="/register" className="inline-flex h-14 items-center rounded-2xl px-6 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/10">
                Create free account
              </Link>
            </div>
            <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
              {[
                ["100%", "vegetarian kitchens"],
                ["Live", "rider tracking"],
                ["OTP", "secured handover"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="font-display text-3xl font-semibold text-white">{v}</dt>
                  <dd className="mt-0.5 text-sm text-brand-200/70">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Collage */}
          <div className="relative mx-auto hidden h-[520px] w-full max-w-[480px] lg:block">
            <div className="absolute right-0 top-0 h-[340px] w-[300px] overflow-hidden rounded-[32px] shadow-2xl ring-1 ring-white/10 animate-rise">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl("1668236543090-82eba5ee5976", 700, 800)} alt="Masala dosa platter" className="h-full w-full object-cover" />
            </div>
            <div className="absolute bottom-0 left-0 h-[300px] w-[250px] overflow-hidden rounded-[32px] shadow-2xl ring-1 ring-white/10 animate-rise [animation-delay:120ms]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl("1606491956689-2ea866880c84", 600, 700)} alt="Pav bhaji" className="h-full w-full object-cover" />
            </div>
            <div className="absolute bottom-16 right-2 w-60 rounded-2xl bg-white p-4 shadow-2xl animate-pop [animation-delay:300ms]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-200"><Bike className="h-5 w-5" /></span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Live tracking</p>
                  <p className="text-sm font-bold text-slate-900">Your rider is on the way</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-3/4 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" /></div>
            </div>
            <div className="absolute left-6 top-14 rounded-2xl bg-white/95 px-4 py-3 shadow-2xl backdrop-blur animate-pop [animation-delay:450ms]">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><VegMark className="h-3.5 w-3.5" /> Pure veg kitchen</p>
              <p className="text-[11px] font-medium text-slate-500">Freshly prepared to order</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dishes strip */}
      <section className="mx-auto -mt-14 max-w-6xl px-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {DISHES.map((d) => (
            <Link key={d.id} href="/hotels" className="group overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-900/5 transition hover:-translate-y-1 hover:shadow-xl">
              <div className="aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(d.id, 500, 375)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3">
                <VegMark className="h-3.5 w-3.5" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{d.name}</p>
                  <p className="text-xs text-slate-500">{d.tag}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-brand-700">How it works</p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-display text-4xl font-semibold text-slate-900">From a trusted veg kitchen to your door - tracked every step.</h2>
        <div className="mt-14 grid gap-6 md:grid-cols-4">
          {[
            { icon: MapPin, t: "Pick a kitchen", d: "Browse verified pure-veg hotels that deliver to your exact pin." },
            { icon: ChefHat, t: "Freshly prepared", d: "The kitchen accepts and starts cooking - you're notified instantly." },
            { icon: Bike, t: "Live tracking", d: "The nearest rider is assigned. Watch them on the map in real time." },
            { icon: KeyRound, t: "Secure handover", d: "Share your one-time code with the rider only when food is in hand." },
          ].map((s, i) => (
            <div key={s.t} className="relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
              <span className="absolute right-5 top-5 font-display text-4xl font-semibold text-slate-100">0{i + 1}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/70"><s.icon className="h-6 w-6" /></span>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-6 rounded-[32px] bg-white p-8 shadow-sm ring-1 ring-slate-200/70 md:grid-cols-3 md:p-12">
          {[
            { icon: Leaf, t: "Strictly vegetarian", d: "Non-veg items can't even be listed. Every dish carries the green veg mark." },
            { icon: ShieldCheck, t: "Verified kitchens", d: "FSSAI-licensed partners, reviewed and approved by our team before going live." },
            { icon: Clock, t: "Honest ETAs", d: "Times based on real prep times and the distance to your door." },
          ].map((f) => (
            <div key={f.t} className="flex gap-4">
              <f.icon className="h-6 w-6 shrink-0 text-brand-600" />
              <div>
                <h3 className="font-bold text-slate-900">{f.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Partners */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            { icon: Store, t: "Run a pure-veg kitchen?", d: "Reach hungry customers nearby, manage your menu and orders from one live dashboard.", cta: "List your hotel", href: "/manager/register", photo: "1630383249896-424e482df921" },
            { icon: Bike, t: "Ride with GreenBite", d: "Flexible hours, nearby orders only and weekly payouts. Bring your bike or EV.", cta: "Become a rider", href: "/delivery/register", photo: "1626132647523-66f5bf380027" },
          ].map((p) => (
            <Link key={p.t} href={p.href} className="group relative overflow-hidden rounded-[32px] p-8 text-white shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.photo, 900, 500)} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-brand-950/95 via-brand-950/80 to-brand-950/30" />
              <div className="relative max-w-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/20"><p.icon className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-3xl font-semibold">{p.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{p.d}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-saffron-300">{p.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500">
          <Logo size="sm" />
          <p>© {new Date().getFullYear()} GreenBite. 100% vegetarian. Always.</p>
          <div className="flex gap-5">
            <Link href="/hotels" className="hover:text-slate-900">Order</Link>
            <Link href="/manager/login" className="hover:text-slate-900">Hotel partners</Link>
            <Link href="/delivery/login" className="hover:text-slate-900">Riders</Link>
            <Link href="/login" className="hover:text-slate-900">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
