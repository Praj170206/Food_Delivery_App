import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { User } from "@/models/User";
import { riderLocationSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rateLimit";
import { assignWaitingOrderTo } from "@/lib/assignment";

// Free riders re-check for waiting orders at most this often while moving around.
const ASSIGN_CHECK_MS = 30_000;
const lastCheck = new Map<string, number>();

/** GPS ping from the rider app (feeds every live map: customer, hotel, admin). */
export const POST = route(async (req) => {
  const rider = await requireRole("delivery");
  if (!rateLimit(`gps:${rider._id}`, 30, 60_000).ok) throw new ApiError(429, "Too many location updates");
  const { coordinates } = await parseBody(req, riderLocationSchema);
  if (!rider.delivery?.isOnline) throw new ApiError(409, "You're offline");

  await User.updateOne(
    { _id: rider._id },
    { $set: { "delivery.currentLocation": { type: "Point", coordinates }, "delivery.lastLocationAt": new Date() } }
  );

  let assigned = null;
  const key = String(rider._id);
  if (rider.delivery.isAvailable && Date.now() - (lastCheck.get(key) ?? 0) > ASSIGN_CHECK_MS) {
    lastCheck.set(key, Date.now());
    assigned = await assignWaitingOrderTo(rider._id, req);
  }
  return NextResponse.json({ ok: true, assignedOrder: assigned ? { _id: assigned._id, orderNumber: assigned.orderNumber } : null });
});
