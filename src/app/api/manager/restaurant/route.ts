import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { managerOpenSchema, managerRestaurantSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { haversineKm } from "@/lib/geo";

export const GET = route(async () => {
  const { restaurant } = await requireManager();
  return NextResponse.json({ restaurant });
});

/** Profile details. Status and commission stay admin-only. */
export const PUT = route(async (req) => {
  const { user, restaurant } = await requireManager();
  const body = await parseBody(req, managerRestaurantSchema);

  const prevCoords = restaurant.location?.coordinates as [number, number] | undefined;
  const movedKm = prevCoords?.length === 2 ? haversineKm(prevCoords, body.coordinates) : 0;

  restaurant.description = body.description;
  restaurant.phone = body.phone;
  restaurant.email = body.email || undefined;
  restaurant.address = { line1: body.line1, city: body.city, state: body.state, pincode: body.pincode };
  restaurant.location = { type: "Point", coordinates: body.coordinates };
  restaurant.locationConfirmed = true;
  restaurant.cuisines = body.cuisines;
  restaurant.avgPrepTimeMins = body.avgPrepTimeMins;
  restaurant.fssaiLicense = body.fssaiLicense;
  restaurant.coverImage = body.coverImage || undefined;
  await restaurant.save();

  await logActivity({
    actor: user,
    action: "restaurant.profile_updated",
    message: `${user.name} updated ${restaurant.name}'s profile${movedKm > 0.5 ? ` and moved its location by ${movedKm.toFixed(1)} km` : ""}`,
    entityType: "restaurant",
    entityId: restaurant._id,
    // A big location change affects delivery radius and rider assignment, so make it stand out for admins.
    severity: movedKm > 0.5 ? "warning" : "info",
    notify: [user._id],
    req,
  });
  return NextResponse.json({ restaurant });
});

/** Open / close for orders. */
export const PATCH = route(async (req) => {
  const { user, restaurant } = await requireManager();
  const { isOpen } = await parseBody(req, managerOpenSchema);
  if (isOpen && restaurant.status !== "approved") {
    throw new ApiError(403, `Your hotel is ${restaurant.status}. You can open once an admin approves it.`);
  }
  if (restaurant.isOpen === isOpen) return NextResponse.json({ restaurant });

  restaurant.isOpen = isOpen;
  await restaurant.save();
  await logActivity({
    actor: user,
    action: isOpen ? "restaurant.opened" : "restaurant.closed",
    message: `${restaurant.name} is now ${isOpen ? "open" : "closed"} for orders`,
    entityType: "restaurant",
    entityId: restaurant._id,
    notify: [user._id],
    req,
  });
  return NextResponse.json({ restaurant });
});
