import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { MenuItem } from "@/models/MenuItem";
import { adminMenuItemModerationSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params }) => {
  const admin = await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);
  const { isBlocked, reason } = await parseBody(req, adminMenuItemModerationSchema);

  const item = await MenuItem.findById(id).populate<{ restaurant: { name: string; manager?: unknown } }>("restaurant", "name manager");
  if (!item) throw new ApiError(404, "Menu item not found");

  item.isBlocked = isBlocked;
  item.blockReason = isBlocked ? reason : undefined;
  await item.save();

  await logActivity({
    actor: admin,
    action: isBlocked ? "menuItem.blocked" : "menuItem.unblocked",
    message: `${admin.name} ${isBlocked ? "blocked" : "unblocked"} "${item.name}" at ${item.restaurant?.name ?? "restaurant"}${reason ? ` (reason: ${reason})` : ""}`,
    entityType: "menuItem",
    entityId: item._id,
    severity: isBlocked ? "warning" : "info",
    notify: [item.restaurant?.manager],
    req,
  });
  return NextResponse.json({ item });
});
