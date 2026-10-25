import { NextResponse } from "next/server";
import { route, ApiError, escapeRegex } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Restaurant } from "@/models/Restaurant";
import { MenuItem } from "@/models/MenuItem";
import { getSettings } from "@/models/Setting";
import { estimateMins } from "@/lib/pricing";

/** Approved hotels that deliver to the given point, closest first. */
export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!sp.get("lat") || !sp.get("lng") || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(400, "Set your delivery location to see hotels near you");
  }
  await connectDB();
  const settings = await getSettings();
  const radiusKm = settings.delivery?.maxDeliveryRadiusKm ?? 10;

  const query: Record<string, unknown> = { status: "approved" };
  const q = sp.get("q")?.trim();
  if (q) {
    // Match hotel name/cuisine, or any hotel that serves a dish with this name.
    const rx = new RegExp(escapeRegex(q), "i");
    const withDish = await MenuItem.distinct("restaurant", { name: rx, isBlocked: false });
    query.$or = [{ name: rx }, { cuisines: rx }, { _id: { $in: withDish } }];
  }
  if (sp.get("open") === "1") query.isOpen = true;

  const items = await Restaurant.aggregate([
    { $geoNear: { near: { type: "Point", coordinates: [lng, lat] }, distanceField: "distanceMeters", maxDistance: radiusKm * 1000, spherical: true, query, key: "location" } },
    { $sort: { isOpen: -1, distanceMeters: 1 } },
    { $limit: 60 },
    {
      $project: {
        name: 1, slug: 1, description: 1, cuisines: 1, coverImage: 1, isOpen: 1, rating: 1, ratingCount: 1, avgPrepTimeMins: 1,
        "address.line1": 1, "address.city": 1,
        distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 1] },
      },
    },
  ]);

  // Only list hotels that have something to order.
  const counts = await MenuItem.aggregate([
    { $match: { restaurant: { $in: items.map((r) => r._id) }, isBlocked: false, isAvailable: true } },
    { $group: { _id: "$restaurant", n: { $sum: 1 }, jain: { $sum: { $cond: ["$isJain", 1, 0] } }, minPrice: { $min: "$price" } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));

  return NextResponse.json({
    radiusKm,
    items: items
      .filter((r) => byId.has(String(r._id)))
      .filter((r) => sp.get("jain") !== "1" || (byId.get(String(r._id))?.jain ?? 0) > 0)
      .map((r) => ({
        ...r,
        menuCount: byId.get(String(r._id))?.n ?? 0,
        hasJain: (byId.get(String(r._id))?.jain ?? 0) > 0,
        startsFrom: byId.get(String(r._id))?.minPrice ?? 0,
        etaMins: estimateMins(r.avgPrepTimeMins ?? 20, r.distanceKm),
      })),
  });
});
