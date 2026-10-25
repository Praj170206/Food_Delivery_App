import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Restaurant } from "@/models/Restaurant";
import { MenuItem } from "@/models/MenuItem";
import { getSettings } from "@/models/Setting";
import { haversineKm } from "@/lib/geo";
import { estimateMins } from "@/lib/pricing";

type Params = { slug: string };

export const GET = route<Params>(async (req, { params }) => {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new ApiError(404, "Hotel not found");
  await connectDB();
  const restaurant = await Restaurant.findOne({ slug, status: "approved" })
    .select("name slug description cuisines coverImage isOpen rating ratingCount avgPrepTimeMins address phone location")
    .lean();
  if (!restaurant) throw new ApiError(404, "Hotel not found");

  // Blocked items are never shown; sold-out ones are shown greyed out.
  const menu = await MenuItem.find({ restaurant: restaurant._id, isBlocked: false })
    .select("name description category price image isJain isVegan spiceLevel isAvailable")
    .sort({ category: 1, name: 1 })
    .lean();

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  let delivery = null;
  if (sp.get("lat") && sp.get("lng") && !isNaN(lat) && !isNaN(lng)) {
    const s = await getSettings();
    const km = Math.round(haversineKm(restaurant.location!.coordinates as [number, number], [lng, lat]) * 10) / 10;
    delivery = {
      distanceKm: km,
      deliverable: km <= (s.delivery?.maxDeliveryRadiusKm ?? 10),
      fee: Math.round((s.delivery?.baseFee ?? 0) + km * (s.delivery?.perKmFee ?? 0)),
      freeAbove: s.delivery?.freeDeliveryAbove ?? 0,
      etaMins: estimateMins(restaurant.avgPrepTimeMins, km),
    };
  }

  const { location, ...rest } = restaurant;
  return NextResponse.json({ restaurant: { ...rest, location: location?.coordinates }, menu, delivery });
});
