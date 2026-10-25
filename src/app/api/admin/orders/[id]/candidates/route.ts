import { NextResponse } from "next/server";
import { route, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Order } from "@/models/Order";
import { Restaurant } from "@/models/Restaurant";
import { getSettings } from "@/models/Setting";
import { findNearbyPartners } from "@/lib/orders";

type Params = { id: string };

// Nearby online partners for manual assignment. Admins can look 3x wider than auto-assign.
export const GET = route<Params>(async (_req, { params }) => {
  await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);

  const order = await Order.findById(id).select("restaurant");
  if (!order) throw new ApiError(404, "Order not found");
  const restaurant = await Restaurant.findById(order.restaurant).select("location");
  if (!restaurant?.location) throw new ApiError(400, "Restaurant location missing");

  const settings = await getSettings();
  const radiusKm = (settings.delivery?.assignmentRadiusKm ?? 5) * 3;
  const candidates = await findNearbyPartners(restaurant.location.coordinates as [number, number], radiusKm, { limit: 25 });
  return NextResponse.json({ candidates, radiusKm });
});
