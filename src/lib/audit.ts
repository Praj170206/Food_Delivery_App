import type { NextRequest } from "next/server";
import { ActivityLog, type Severity } from "@/models/ActivityLog";
import { clientInfo } from "@/lib/api";
import type { Role } from "@/lib/constants";

type Actor = { _id: unknown; name: string; role: Role } | null;

export type ActivityInput = {
  actor: Actor;
  action: string; // dotted verb, e.g. "user.suspended", "order.cancelled"
  message: string;
  entityType?: "user" | "restaurant" | "menuItem" | "order" | "settings" | "auth";
  entityId?: unknown;
  meta?: Record<string, unknown>;
  severity?: Severity;
  /** User ids (besides admins, who see everything) that get this event live. */
  notify?: unknown[];
  req?: NextRequest;
};

/** Every meaningful change in the system goes through here; the admin live feed streams this collection. */
export async function logActivity(input: ActivityInput) {
  try {
    const info = input.req ? clientInfo(input.req) : { ip: "", userAgent: "" };
    await ActivityLog.create({
      actor: input.actor?._id,
      actorName: input.actor?.name ?? "System",
      actorRole: input.actor?.role ?? "system",
      action: input.action,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      meta: input.meta,
      severity: input.severity ?? "info",
      notify: input.notify?.length ? [...new Set(input.notify.filter(Boolean).map(String))] : undefined,
      ip: info.ip,
      userAgent: info.userAgent,
    });
  } catch (err) {
    // Auditing must never break the request that triggered it.
    console.error("[audit] failed to write activity log", err);
  }
}
