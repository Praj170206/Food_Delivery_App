import type { Types } from "mongoose";
import { User } from "@/models/User";

type Actor = { _id: unknown; role: string };

export function timelineEntry(status: string, actor: Actor | null, note?: string) {
  return { status, note, by: actor?._id, byRole: actor?.role ?? "system", at: new Date() };
}

/** Frees a delivery partner after their order is delivered, cancelled or reassigned. */
export async function releasePartner(partnerId: Types.ObjectId | string | null | undefined, delivered = false) {
  if (!partnerId) return;
  const partner = await User.findById(partnerId);
  if (!partner?.delivery) return;
  partner.delivery.activeOrder = undefined;
  partner.delivery.isAvailable = !!partner.delivery.isOnline && partner.status === "active";
  if (delivered) partner.delivery.totalDeliveries = (partner.delivery.totalDeliveries ?? 0) + 1;
  await partner.save();
}

export type PartnerCandidate = {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  distanceKm: number;
  isAvailable: boolean;
  vehicleType?: string;
  totalDeliveries: number;
  rating: number;
  lastLocationAt?: Date;
};

/**
 * Online, active delivery partners near a point, closest first.
 * Assignment picks the closest *available* one; admins see busy ones too.
 */
export async function findNearbyPartners(
  coords: [number, number],
  radiusKm: number,
  opts: { onlyAvailable?: boolean; limit?: number } = {}
): Promise<PartnerCandidate[]> {
  const query: Record<string, unknown> = { role: "delivery", status: "active", "delivery.isOnline": true };
  if (opts.onlyAvailable) query["delivery.isAvailable"] = true;

  return User.aggregate<PartnerCandidate>([
    {
      $geoNear: {
        near: { type: "Point", coordinates: coords },
        distanceField: "distanceMeters",
        key: "delivery.currentLocation",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query,
      },
    },
    // Ignore partners whose GPS hasn't reported in 15 minutes - their position is stale.
    { $match: { "delivery.lastLocationAt": { $gte: new Date(Date.now() - 15 * 60 * 1000) } } },
    { $sort: { "delivery.isAvailable": -1, distanceMeters: 1 } },
    { $limit: opts.limit ?? 20 },
    {
      $project: {
        name: 1,
        phone: 1,
        distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
        isAvailable: "$delivery.isAvailable",
        vehicleType: "$delivery.vehicleType",
        totalDeliveries: { $ifNull: ["$delivery.totalDeliveries", 0] },
        rating: { $ifNull: ["$delivery.rating", 0] },
        lastLocationAt: "$delivery.lastLocationAt",
      },
    },
  ]);
}

/**
 * Atomically reserves a partner for an order so two orders can't grab the same
 * person at once. Returns false if they were taken in the meantime.
 */
export async function reservePartner(partnerId: Types.ObjectId | string, orderId: Types.ObjectId | string) {
  const res = await User.updateOne(
    { _id: partnerId, role: "delivery", status: "active", "delivery.isAvailable": true },
    { $set: { "delivery.isAvailable": false, "delivery.activeOrder": orderId } }
  );
  return res.modifiedCount === 1;
}

export function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `GB${ymd}${rand}`;
}
