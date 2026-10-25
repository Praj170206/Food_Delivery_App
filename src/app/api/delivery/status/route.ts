import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { riderStatusSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { assignWaitingOrderTo } from "@/lib/assignment";

/** Go online (with a GPS fix) or offline. */
export const POST = route(async (req) => {
  const rider = await requireRole("delivery");
  const { online, coordinates } = await parseBody(req, riderStatusSchema);
  const d = rider.delivery ?? (rider.delivery = { vehicleType: "scooter", isOnline: false, isAvailable: false, totalDeliveries: 0, rating: 0 });

  if (online) {
    if (!coordinates) throw new ApiError(400, "Turn on location so we can send you nearby orders");
    d.currentLocation = { type: "Point", coordinates };
    d.lastLocationAt = new Date();
  } else if (d.activeOrder) {
    throw new ApiError(409, "Finish your current delivery before going offline. If you can't, contact support.");
  }
  const changed = !!d.isOnline !== online;
  d.isOnline = online;
  d.isAvailable = online && !d.activeOrder;
  await rider.save();

  if (changed) {
    await logActivity({
      actor: rider,
      action: online ? "delivery.online" : "delivery.offline",
      message: `${rider.name} went ${online ? "online" : "offline"}`,
      entityType: "user",
      entityId: rider._id,
      notify: [rider._id],
      req,
    });
  }

  // Coming online: pick up any order that's been waiting for a rider nearby.
  const assigned = online && d.isAvailable ? await assignWaitingOrderTo(rider._id, req) : null;
  return NextResponse.json({ isOnline: d.isOnline, isAvailable: !assigned && d.isAvailable, assignedOrder: assigned ? { _id: assigned._id, orderNumber: assigned.orderNumber } : null });
});
