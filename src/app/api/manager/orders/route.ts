import { NextResponse } from "next/server";
import { route, pagination, escapeRegex } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { orderScope } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { managerOrderView } from "@/lib/managerView";
import { ORDER_STATUSES } from "@/lib/constants";

// Board columns for live orders; everything else is history.
const VIEWS: Record<string, string[]> = {
  live: ["placed", "confirmed", "preparing", "ready", "picked_up"],
  history: ["delivered", "cancelled"],
};

export const GET = route(async (req) => {
  const { user, restaurant } = await requireManager();
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(req, sp.get("view") === "live" ? 100 : 20);

  // Only orders that were actually placed (unpaid online orders never reach the hotel).
  const filter: Record<string, unknown> = { ...orderScope(user), "timeline.status": "placed" };
  const view = sp.get("view");
  const status = sp.get("status");
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) filter.status = status;
  else if (view && VIEWS[view]) filter.status = { $in: VIEWS[view] };
  const q = sp.get("q")?.trim();
  if (q) filter.orderNumber = new RegExp(escapeRegex(q), "i");

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: view === "live" ? 1 : -1 }) // live board: oldest first, so nothing waits too long
      .skip(skip)
      .limit(limit)
      .populate("user", "name")
      .populate("deliveryPartner", "name phone delivery.vehicleType delivery.vehicleNumber delivery.currentLocation delivery.lastLocationAt")
      .lean(),
    Order.countDocuments(filter),
  ]);

  const hotel = restaurant.location?.coordinates as [number, number] | undefined;
  return NextResponse.json({ items: items.map((o) => managerOrderView(o, hotel)), total, page, pages: Math.ceil(total / limit) });
});
