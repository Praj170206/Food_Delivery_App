import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Setting, getSettings } from "@/models/Setting";
import { settingsSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { gatewayStatus } from "@/lib/payments";

export const GET = route(async () => {
  await requireRole("admin");
  const settings = await getSettings();
  return NextResponse.json({ settings, gateway: gatewayStatus() });
});

export const PUT = route(async (req) => {
  const admin = await requireRole("admin");
  const body = await parseBody(req, settingsSchema);

  const before = (await getSettings()).toObject();
  const settings = await Setting.findOneAndUpdate({ key: "platform" }, { $set: body }, { new: true, runValidators: true });

  // Record exactly which fields changed so the audit log is useful.
  const changed: string[] = [];
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>, prefix = "") => {
    for (const k of Object.keys(b)) {
      const av = a?.[k];
      const bv = b[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv)) walk(av as Record<string, unknown>, bv as Record<string, unknown>, `${prefix}${k}.`);
      else if (av !== bv) changed.push(`${prefix}${k}: ${String(av)} → ${String(bv)}`);
    }
  };
  walk(before as Record<string, unknown>, body as Record<string, unknown>);

  if (changed.length) {
    await logActivity({
      actor: admin,
      action: "settings.updated",
      message: `${admin.name} updated platform settings (${changed.length} change${changed.length > 1 ? "s" : ""})`,
      entityType: "settings",
      severity: changed.some((c) => c.startsWith("maintenanceMode") || c.startsWith("payments")) ? "critical" : "info",
      meta: { changed },
      req,
    });
  }
  return NextResponse.json({ settings });
});
