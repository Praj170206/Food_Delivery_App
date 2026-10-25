"use client";

import Link from "next/link";
import { Circle, KeyRound, Receipt, Salad, Settings, Store, UserRound, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export type ActivityItem = {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  message: string;
  entityType?: string;
  entityId?: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  ip?: string;
  meta?: Record<string, unknown>;
};

const ICONS: Record<string, LucideIcon> = {
  auth: KeyRound,
  user: UserRound,
  restaurant: Store,
  menuItem: Salad,
  order: Receipt,
  settings: Settings,
};

const DOT = { info: "bg-sky-400", warning: "bg-amber-500", critical: "bg-red-500" };

export function entityHref(e: { entityType?: string; entityId?: string }) {
  if (!e.entityId) return null;
  if (e.entityType === "order") return `/admin/orders/${e.entityId}`;
  if (e.entityType === "user" || e.entityType === "auth") return `/admin/users/${e.entityId}`;
  if (e.entityType === "restaurant") return `/admin/restaurants/${e.entityId}`;
  return null;
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role as Role] ?? (role === "system" ? "System" : role);
}

export function ActivityFeed({ items, freshIds, compact }: { items: ActivityItem[]; freshIds?: Set<string>; compact?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => {
        const href = entityHref(a);
        return (
          <li key={a._id} className={cx("flex gap-3 px-1 py-2.5", freshIds?.has(a._id) && "animate-flash")}>
            {(() => {
              const Icon = ICONS[a.entityType ?? ""] ?? Circle;
              return (
                <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200">
                  <Icon className="h-4 w-4" />
                  <span className={cx("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", DOT[a.severity])} />
                </span>
              );
            })()}
            <div className="min-w-0 flex-1">
              <p className={cx("text-sm text-slate-800", compact && "line-clamp-2")}>
                {href ? (
                  <Link href={href} className="hover:text-brand-700 hover:underline">
                    {a.message}
                  </Link>
                ) : (
                  a.message
                )}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {roleLabel(a.actorRole)} · <code className="text-[11px]">{a.action}</code> · {timeAgo(a.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
