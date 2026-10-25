"use client";

import type { ReactNode } from "react";
import { Activity, Bike, LayoutDashboard, Receipt, Settings, Store, UserRound, Users } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/shell/DashboardShell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/restaurants", label: "Hotels", icon: Store },
  { href: "/admin/delivery-partners", label: "Delivery Partners", icon: Bike },
  { href: "/admin/activity", label: "Activity Log", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/profile", label: "My Profile", icon: UserRound },
];

export function AdminShell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  return (
    <DashboardShell user={user} nav={NAV} home="/admin" subtitle="Admin console" streamSrc="/api/admin/stream">
      {children}
    </DashboardShell>
  );
}
