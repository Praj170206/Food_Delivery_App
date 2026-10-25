import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Order } from "@/models/Order";

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** Rider profile, live status and today's numbers. */
export const GET = route(async () => {
  const rider = await requireRole("delivery");
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

  const [today] = await Order.aggregate([
    { $match: { deliveryPartner: rider._id, status: "delivered", deliveredAt: { $gte: new Date(Date.now() - 36 * 3600 * 1000) } } },
    { $match: { $expr: { $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt", timezone: TZ } }, todayKey] } } },
    {
      $group: {
        _id: null,
        deliveries: { $sum: 1 },
        cash: { $sum: { $cond: [{ $eq: ["$payment.method", "cod"] }, "$pricing.total", 0] } },
        km: { $sum: { $ifNull: ["$distanceKm", 0] } },
      },
    },
  ]);

  const d = rider.delivery;
  return NextResponse.json({
    rider: {
      name: rider.name,
      email: rider.email,
      phone: rider.phone,
      createdAt: rider.createdAt,
      vehicleType: d?.vehicleType,
      vehicleNumber: d?.vehicleNumber,
      licenseNumber: d?.licenseNumber,
      isOnline: !!d?.isOnline,
      isAvailable: !!d?.isAvailable,
      hasActiveOrder: !!d?.activeOrder,
      location: d?.currentLocation?.coordinates,
      lastLocationAt: d?.lastLocationAt,
      totalDeliveries: d?.totalDeliveries ?? 0,
      rating: d?.rating ?? 0,
    },
    today: { deliveries: today?.deliveries ?? 0, cash: today?.cash ?? 0, km: Math.round((today?.km ?? 0) * 10) / 10 },
  });
});
