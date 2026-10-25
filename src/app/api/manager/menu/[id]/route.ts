import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { MenuItem } from "@/models/MenuItem";
import { menuItemUpdateSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";

type Params = { id: string };

async function loadOwnItem(id: string) {
  assertObjectId(id);
  const ctx = await requireManager();
  // Scoped to the manager's own hotel: another hotel's item id is simply "not found".
  const item = await MenuItem.findOne({ _id: id, restaurant: ctx.restaurant._id });
  if (!item) throw new ApiError(404, "Menu item not found");
  return { ...ctx, item };
}

export const PATCH = route<Params>(async (req, { params }) => {
  const { user, restaurant, item } = await loadOwnItem((await params).id);
  const body = await parseBody(req, menuItemUpdateSchema);

  const changes: string[] = [];
  if (body.price !== undefined && body.price !== item.price) changes.push(`price ₹${item.price} → ₹${body.price}`);
  if (body.isAvailable !== undefined && body.isAvailable !== item.isAvailable) changes.push(body.isAvailable ? "back in stock" : "marked sold out");
  if (body.name && body.name !== item.name) changes.push(`renamed to "${body.name}"`);

  item.set({ ...body, ...(body.image !== undefined ? { image: body.image || undefined } : {}) });
  await item.save();

  await logActivity({
    actor: user,
    action: "menuItem.updated",
    message: `${user.name} updated "${item.name}" at ${restaurant.name}${changes.length ? `: ${changes.join(", ")}` : ""}`,
    entityType: "menuItem",
    entityId: item._id,
    notify: [user._id],
    req,
  });
  return NextResponse.json({ item });
});

export const DELETE = route<Params>(async (req, { params }) => {
  const { user, restaurant, item } = await loadOwnItem((await params).id);
  if (item.isBlocked) throw new ApiError(400, "Blocked items can't be deleted. Contact the admin team.");
  // Past orders keep their own copy of name and price, so deleting is safe.
  await item.deleteOne();
  await logActivity({
    actor: user,
    action: "menuItem.deleted",
    message: `${user.name} removed "${item.name}" from ${restaurant.name}'s menu`,
    entityType: "menuItem",
    entityId: item._id,
    notify: [user._id],
    req,
  });
  return NextResponse.json({ ok: true });
});
