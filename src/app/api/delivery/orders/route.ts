import { NextResponse } from "next/server";
import { route, pagination } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Order } from "@/models/Order";
import { riderOrderView } from "@/lib/riderView";

const POPULATE = [
  { path: "user", select: "name phone" },
  { path: "restaurant", select: "name phone address location" },
];

/** ?view=current -> the rider's active task (or null); otherwise their past tasks. */
export const GET = route(async (req) => {
  const rider = await requireRole("delivery");
  const here = rider.delivery?.currentLocation?.coordinates as [number, number] | undefined;

  if (req.nextUrl.searchParams.get("view") === "current") {
    const order = await Order.findOne({ deliveryPartner: rider._id, status: { $in: ["confirmed", "preparing", "ready", "picked_up"] } })
      .sort({ assignedAt: -1 })
      .populate(POPULATE)
      .lean();
    return NextResponse.json({ order: order ? riderOrderView(order, here) : null });
  }

  const { page, limit, skip } = pagination(req, 20);
  const filter = { deliveryPartner: rider._id, status: { $in: ["delivered", "cancelled"] } };
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
    Order.countDocuments(filter),
  ]);
  return NextResponse.json({ items: items.map((o) => riderOrderView(o)), total, page, pages: Math.ceil(total / limit) });
});
