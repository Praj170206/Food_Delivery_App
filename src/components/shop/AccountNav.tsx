"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/account", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/profile", label: "Profile & security" },
];

export function AccountNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/account/orders/")) return null; // the tracking page has its own header
  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium", pathname === t.href ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
