import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { User } from "@/models/User";
import { Restaurant } from "@/models/Restaurant";
import { Order } from "@/models/Order";
import { ACTIVE_ORDER_STATUSES } from "@/lib/constants";

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const toMap = (rows: { _id: string; count: number }[]) =>
  Object.fromEntries(rows.map((r) => [r._id, r.count])) as Record<string, number>;

export const GET = route(async () => {
  await requireRole("admin");

  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const [usersByRole, usersByStatus, pendingByRole, restaurantsByStatus, ordersByStatus, daily, activeOrders, partners, recentOrders, topRestaurants] =
    await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { status: "pending" } }, { $group: { _id: "$role", count: { $sum: 1 } } }]),
      Restaurant.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            orders: { $sum: 1 },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $not: [{ $in: ["$status", ["cancelled", "payment_pending"]] }] }, "$pricing.total", 0] } },
          },
        },
      ]),
      Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
      User.aggregate([
        { $match: { role: "delivery", status: "active" } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            online: { $sum: { $cond: ["$delivery.isOnline", 1, 0] } },
            available: { $sum: { $cond: ["$delivery.isAvailable", 1, 0] } },
          },
        },
      ]),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .select("orderNumber status pricing.total payment.method createdAt user restaurant deliveryPartner")
        .populate("user", "name")
        .populate("restaurant", "name")
        .populate("deliveryPartner", "name")
        .lean(),
      Order.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, status: { $nin: ["cancelled", "payment_pending"] } } },
        { $group: { _id: "$restaurant", orders: { $sum: 1 }, revenue: { $sum: "$pricing.total" } } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
        { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "r" } },
        { $project: { orders: 1, revenue: 1, name: { $arrayElemAt: ["$r.name", 0] } } },
      ]),
    ]);

  // Fill in the last 7 days, including days with no orders.
  const byDay = new Map(daily.map((d) => [d._id as string, d]));
  const series = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000));
    const d = byDay.get(key);
    return { date: key, orders: d?.orders ?? 0, revenue: d?.revenue ?? 0, cancelled: d?.cancelled ?? 0 };
  });
  const today = series[series.length - 1];
  const pending = toMap(pendingByRole);
  const restaurants = toMap(restaurantsByStatus);

  return NextResponse.json({
    users: { byRole: toMap(usersByRole), byStatus: toMap(usersByStatus) },
    restaurants,
    orders: { byStatus: toMap(ordersByStatus), active: activeOrders, today: today.orders, revenueToday: today.revenue },
    partners: partners[0] ?? { total: 0, online: 0, available: 0 },
    pendingApprovals: {
      managers: pending.manager ?? 0,
      delivery: pending.delivery ?? 0,
      restaurants: restaurants.pending ?? 0,
    },
    series,
    recentOrders,
    topRestaurants,
  });
});
