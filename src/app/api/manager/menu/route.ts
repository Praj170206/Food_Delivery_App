import { NextResponse } from "next/server";
import { route, parseBody, ApiError, escapeRegex } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { MenuItem } from "@/models/MenuItem";
import { menuItemSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";

const MAX_ITEMS = 500;

export const GET = route(async () => {
  const { restaurant } = await requireManager();
  const items = await MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 }).lean();
  return NextResponse.json({ items });
});

export const POST = route(async (req) => {
  const { user, restaurant } = await requireManager();
  const body = await parseBody(req, menuItemSchema);

  if ((await MenuItem.countDocuments({ restaurant: restaurant._id })) >= MAX_ITEMS) {
    throw new ApiError(400, `A menu can have at most ${MAX_ITEMS} items`);
  }
  if (await MenuItem.exists({ restaurant: restaurant._id, name: new RegExp(`^${escapeRegex(body.name)}$`, "i") })) {
    throw new ApiError(409, `"${body.name}" is already on your menu`);
  }

  // isVeg is always true (the model rejects anything else); isBlocked stays admin-only.
  const item = await MenuItem.create({ ...body, image: body.image || undefined, restaurant: restaurant._id, isVeg: true });
  await logActivity({
    actor: user,
    action: "menuItem.created",
    message: `${user.name} added "${item.name}" (₹${item.price}) to ${restaurant.name}'s menu`,
    entityType: "menuItem",
    entityId: item._id,
    notify: [user._id],
    req,
  });
  return NextResponse.json({ item }, { status: 201 });
});
