import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Restaurant } from "@/models/Restaurant";
import { MenuItem } from "@/models/MenuItem";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { adminUpdateRestaurantSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => {
  await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);

  const restaurant = await Restaurant.findById(id).populate("manager", "name email phone status").lean();
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  const [menu, stats, recentOrders] = await Promise.all([
    MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 }).lean(),
    Order.aggregate([
      { $match: { restaurant: restaurant._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, "$pricing.subtotal", 0] } },
        },
      },
    ]),
    Order.find({ restaurant: restaurant._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("orderNumber status pricing.total createdAt user")
      .populate("user", "name")
      .lean(),
  ]);

  return NextResponse.json({
    restaurant,
    menu,
    stats: stats[0] ?? { total: 0, delivered: 0, cancelled: 0, revenue: 0 },
    recentOrders,
  });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const admin = await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);
  const body = await parseBody(req, adminUpdateRestaurantSchema);

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  const changes: string[] = [];
  const prevStatus = restaurant.status;
  const prevManager = restaurant.manager;

  if (body.status && body.status !== restaurant.status) {
    changes.push(`status ${restaurant.status} → ${body.status}`);
    restaurant.status = body.status;
    restaurant.statusReason = body.reason;
    if (body.status !== "approved") restaurant.isOpen = false;
  }
  if (body.commissionPercent !== undefined && body.commissionPercent !== restaurant.commissionPercent) {
    changes.push(`commission ${restaurant.commissionPercent}% → ${body.commissionPercent}%`);
    restaurant.commissionPercent = body.commissionPercent;
  }
  if (body.isOpen !== undefined && body.isOpen !== restaurant.isOpen) {
    if (body.isOpen && restaurant.status !== "approved") throw new ApiError(400, "Only approved restaurants can open");
    changes.push(body.isOpen ? "opened" : "force-closed");
    restaurant.isOpen = body.isOpen;
  }
  if (body.manager !== undefined && String(body.manager) !== String(restaurant.manager ?? null)) {
    if (body.manager) {
      const next = await User.findById(body.manager);
      if (!next || next.role !== "manager") throw new ApiError(400, "Selected user is not a hotel manager");
      if (next.restaurant && String(next.restaurant) !== String(restaurant._id)) {
        throw new ApiError(400, "This manager already runs another restaurant");
      }
      next.restaurant = restaurant._id;
      await next.save();
      changes.push(`manager → ${next.name}`);
    } else {
      changes.push("manager removed");
    }
    if (restaurant.manager) await User.updateOne({ _id: restaurant.manager }, { $unset: { restaurant: 1 } });
    restaurant.manager = body.manager ? (body.manager as unknown as typeof restaurant.manager) : undefined;
  }

  if (!changes.length) return NextResponse.json({ restaurant });
  await restaurant.save();

  const statusChanged = prevStatus !== restaurant.status;
  await logActivity({
    actor: admin,
    action: statusChanged ? `restaurant.${restaurant.status}` : "restaurant.updated",
    message: `${admin.name} updated ${restaurant.name}: ${changes.join(", ")}${body.reason ? ` (reason: ${body.reason})` : ""}`,
    entityType: "restaurant",
    entityId: restaurant._id,
    severity: statusChanged && restaurant.status !== "approved" ? "warning" : "info",
    meta: { changes, reason: body.reason },
    notify: [restaurant.manager, prevManager],
    req,
  });

  if (statusChanged && restaurant.manager) {
    const manager = await User.findById(restaurant.manager);
    if (manager) {
      // Approving the restaurant also activates a manager who registered with it.
      if (restaurant.status === "approved" && manager.status === "pending") {
        manager.status = "active";
        await manager.save();
        await logActivity({
          actor: admin,
          action: "user.active",
          message: `${manager.name} was approved along with ${restaurant.name}`,
          entityType: "user",
          entityId: manager._id,
          notify: [manager._id],
          req,
        });
      }
      void sendMail({
        to: manager.email,
        ...mailTemplates.restaurantStatus(manager.name, restaurant.name, restaurant.status, body.reason),
      });
    }
  }

  return NextResponse.json({ restaurant });
});
