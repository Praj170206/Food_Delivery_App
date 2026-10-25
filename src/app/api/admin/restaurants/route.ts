import { NextResponse } from "next/server";
import { route, parseBody, pagination, escapeRegex, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Restaurant } from "@/models/Restaurant";
import { MenuItem } from "@/models/MenuItem";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { adminCreateRestaurantSchema } from "@/lib/validators";
import { uniqueRestaurantSlug } from "@/lib/slug";
import { logActivity } from "@/lib/audit";
import { RESTAURANT_STATUSES } from "@/lib/constants";

export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(req);

  const filter: Record<string, unknown> = {};
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  if (status && (RESTAURANT_STATUSES as readonly string[]).includes(status)) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { "address.city": rx }, { cuisines: rx }];
  }

  const [items, total] = await Promise.all([
    Restaurant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("manager", "name email status").lean(),
    Restaurant.countDocuments(filter),
  ]);

  const ids = items.map((r) => r._id);
  const [menuCounts, orderCounts] = await Promise.all([
    MenuItem.aggregate([{ $match: { restaurant: { $in: ids } } }, { $group: { _id: "$restaurant", count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { restaurant: { $in: ids } } }, { $group: { _id: "$restaurant", count: { $sum: 1 } } }]),
  ]);
  const menuMap = new Map(menuCounts.map((m) => [String(m._id), m.count]));
  const orderMap = new Map(orderCounts.map((m) => [String(m._id), m.count]));

  return NextResponse.json({
    items: items.map((r) => ({ ...r, menuCount: menuMap.get(String(r._id)) ?? 0, orderCount: orderMap.get(String(r._id)) ?? 0 })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const POST = route(async (req) => {
  const admin = await requireRole("admin");
  const body = await parseBody(req, adminCreateRestaurantSchema);

  let manager = null;
  if (body.manager) {
    manager = await User.findById(body.manager);
    if (!manager || manager.role !== "manager") throw new ApiError(400, "Selected user is not a hotel manager");
    if (manager.restaurant) throw new ApiError(400, "This manager already runs a restaurant");
  }

  const restaurant = await Restaurant.create({
    name: body.name,
    slug: await uniqueRestaurantSlug(body.name),
    description: body.description,
    manager: manager?._id,
    phone: body.phone,
    email: body.email || undefined,
    address: { line1: body.line1, city: body.city, state: body.state, pincode: body.pincode },
    location: { type: "Point", coordinates: body.coordinates },
    locationConfirmed: true,
    cuisines: body.cuisines,
    fssaiLicense: body.fssaiLicense,
    commissionPercent: body.commissionPercent,
    status: body.status,
  });
  if (manager) {
    manager.restaurant = restaurant._id;
    await manager.save();
  }

  await logActivity({
    actor: admin,
    action: "restaurant.created",
    message: `${admin.name} added restaurant ${restaurant.name}${manager ? ` managed by ${manager.name}` : ""}`,
    entityType: "restaurant",
    entityId: restaurant._id,
    req,
  });
  return NextResponse.json({ restaurant }, { status: 201 });
});
