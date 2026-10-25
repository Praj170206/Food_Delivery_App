import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { Order } from "@/models/Order";
import { MenuItem } from "@/models/MenuItem";

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const GET = route(async () => {
  const { restaurant } = await requireManager();
  const since = new Date(Date.now() - 8 * 86400000);

  const [byStatus, daily, menu] = await Promise.all([
    Order.aggregate([{ $match: { restaurant: restaurant._id, "timeline.status": "placed" } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { restaurant: restaurant._id, "timeline.status": "placed", createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          orders: { $sum: 1 },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          // Hotel earnings = food subtotal minus platform commission (delivery fee & tax aren't the hotel's).
          sales: { $sum: { $cond: [{ $not: [{ $in: ["$status", ["cancelled", "payment_pending"]] }] }, "$pricing.subtotal", 0] } },
        },
      },
    ]),
    MenuItem.aggregate([
      { $match: { restaurant: restaurant._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $and: ["$isAvailable", { $not: ["$isBlocked"] }] }, 1, 0] } },
          blocked: { $sum: { $cond: ["$isBlocked", 1, 0] } },
        },
      },
    ]),
  ]);

  const map = new Map(daily.map((d) => [d._id as string, d]));
  const series = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(new Date(Date.now() - (6 - i) * 86400000));
    const d = map.get(key);
    return { date: key, orders: d?.orders ?? 0, sales: d?.sales ?? 0, cancelled: d?.cancelled ?? 0 };
  });
  const today = series[series.length - 1];
  const statusCounts = Object.fromEntries(byStatus.map((s) => [s._id, s.count])) as Record<string, number>;
  const commission = (restaurant.commissionPercent ?? 0) / 100;

  return NextResponse.json({
    restaurant: { name: restaurant.name, status: restaurant.status, isOpen: restaurant.isOpen, rating: restaurant.rating, ratingCount: restaurant.ratingCount, commissionPercent: restaurant.commissionPercent },
    today: { orders: today.orders, sales: today.sales, earnings: Math.round(today.sales * (1 - commission)) },
    statusCounts,
    series,
    menu: menu[0] ?? { total: 0, available: 0, blocked: 0 },
  });
});
