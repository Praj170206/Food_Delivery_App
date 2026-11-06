import "server-only";
import type { NextRequest } from "next/server";
import type { HydratedDocument } from "mongoose";
import { Order, type OrderFields } from "@/models/Order";
import { User } from "@/models/User";
import { haversineKm } from "@/lib/geo";
import { Restaurant } from "@/models/Restaurant";
import { getSettings } from "@/models/Setting";
import { logActivity } from "@/lib/audit";
import { orderAudience } from "@/lib/auth/access";
import { sendMail, mailTemplates } from "@/lib/mail";
import { expireStaleRiders, findNearbyPartners, releasePartner, reservePartner, timelineEntry, type PartnerCandidate } from "@/lib/orders";
import type { Role } from "@/lib/constants";

type Actor = { _id: unknown; name: string; role: Role } | null;
type OrderDoc = HydratedDocument<OrderFields>;

/** Emails the customer, the rider and the hotel manager that a rider has been assigned. */
export async function notifyAssignment(order: { orderNumber: string; user: unknown; restaurant: unknown }, partnerId: unknown) {
  // `order.user` may be populated or a bare id depending on the caller.
  const userId = (order.user as { _id?: unknown })?._id ?? order.user;
  const [customer, partner, restaurant] = await Promise.all([
    User.findById(userId).select("name email").lean(),
    User.findById(partnerId).select("name email phone").lean(),
    Restaurant.findById(order.restaurant).select("name address manager").populate<{ manager: { name: string; email: string } | null }>("manager", "name email").lean(),
  ]);
  if (!partner || !restaurant) return;
  if (customer) void sendMail({ to: customer.email, ...mailTemplates.deliveryAssigned(customer.name, order.orderNumber, partner.name) });
  void sendMail({ to: partner.email, ...mailTemplates.newDelivery(partner.name, order.orderNumber, restaurant.name, restaurant.address?.line1 ?? "") });
  if (restaurant.manager) {
    void sendMail({ to: restaurant.manager.email, ...mailTemplates.riderComing(restaurant.manager.name, order.orderNumber, partner.name, partner.phone ?? "") });
  }
}

/**
 * Assigns the nearest available, online rider (fresh GPS, within the admin-configured radius
 * of the hotel). Safe to call repeatedly: does nothing if the order already has a rider.
 * Returns the rider, or null if nobody is available right now.
 */
export async function tryAutoAssign(order: OrderDoc, actor: Actor, req?: NextRequest): Promise<PartnerCandidate | null> {
  if (order.deliveryPartner) return null;
  const restaurant = await Restaurant.findById(order.restaurant).select("location name");
  if (!restaurant?.location?.coordinates?.length) return null;

  const settings = await getSettings();
  const candidates = await findNearbyPartners(
    restaurant.location.coordinates as [number, number],
    settings.delivery?.assignmentRadiusKm ?? 5,
    { onlyAvailable: true, limit: 5 }
  );

  for (const c of candidates) {
    const claimed = await claimOrder(order, c, c.distanceKm, restaurant.name, { how: "auto", actor, statuses: ASSIGNABLE }, req);
    if (claimed) return c;
  }
  return null;
}

const OPEN_FOR_RIDERS = ["confirmed", "preparing", "ready"];
// An admin may also hand a rider an order the hotel hasn't accepted yet.
const ASSIGNABLE = ["placed", ...OPEN_FOR_RIDERS];
const unassigned = { $or: [{ deliveryPartner: null }, { deliveryPartner: { $exists: false } }] };

async function loadFreeRider(riderId: unknown) {
  const rider = await User.findById(riderId).select("name delivery status role");
  const coords = rider?.delivery?.currentLocation?.coordinates as [number, number] | undefined;
  if (!rider || rider.role !== "delivery" || rider.status !== "active" || coords?.length !== 2) return null;
  return { rider, coords };
}

/**
 * Atomically gives one unassigned order to one free rider. Both sides are guarded, so two riders
 * accepting the same order (or one rider grabbing two orders, or auto-assign racing a rider's
 * Accept) can never both succeed. Returns the updated order, or null if it was taken.
 */
async function claimOrder(
  order: OrderDoc,
  rider: { _id: unknown; name: string },
  km: number,
  hotelName: string,
  opts: { how: "auto" | "accepted"; actor?: Actor; statuses?: string[] },
  req?: NextRequest
) {
  // Rider first: only a free rider can be reserved, and only for one order at a time.
  if (!(await reservePartner(rider._id as string, order._id))) return null;
  const actor = opts.how === "auto" ? (opts.actor ?? null) : (rider as Actor);
  const note = opts.how === "auto" ? `Auto-assigned to ${rider.name} (${km} km from hotel)` : `Accepted by ${rider.name} (${km} km from hotel)`;
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: opts.statuses ?? OPEN_FOR_RIDERS }, ...unassigned },
    {
      $set: { deliveryPartner: rider._id, assignedAt: new Date() },
      $push: { timeline: timelineEntry("partner_assigned", actor, note) },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!updated) {
    await releasePartner(rider._id as string); // someone else got the order: free the rider again
    return null;
  }
  await logActivity({
    actor,
    action: "order.partner_assigned",
    message: `Order ${updated.orderNumber} ${opts.how === "auto" ? "auto-assigned to" : "accepted by"} ${rider.name} (${km} km from ${hotelName})`,
    entityType: "order",
    entityId: updated._id,
    meta: { partnerId: rider._id, distanceKm: km, how: opts.how },
    notify: await orderAudience(updated),
    req,
  });
  await notifyAssignment(updated, rider._id);
  return updated;
}

export type OpenOrder = {
  _id: string;
  orderNumber: string;
  status: string;
  hotel: { name: string; address?: string; location: [number, number] };
  customerArea?: string;
  pickupKm: number; // rider -> hotel
  tripKm?: number; // hotel -> customer
  items: number;
  total: number;
  cod: boolean;
  createdAt: Date;
};

/**
 * Unassigned orders a rider could take, nearest hotel first. `withinKm` is the rider's search
 * radius; `beyond` reports the closest waiting orders outside it so the rider knows why the list is empty.
 */
export async function openOrdersFor(riderId: unknown) {
  const free = await loadFreeRider(riderId);
  if (!free) return { radiusKm: 0, within: [] as OpenOrder[], beyond: [] as OpenOrder[] };
  const settings = await getSettings();
  const radiusKm = settings.delivery?.assignmentRadiusKm ?? 5;

  const waiting = await Order.find({ status: { $in: OPEN_FOR_RIDERS }, ...unassigned })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate<{ restaurant: { _id: unknown; name: string; address?: { line1?: string; city?: string }; location?: { coordinates: [number, number] } } }>("restaurant", "name address location")
    .lean();

  const rows: OpenOrder[] = waiting
    .filter((o) => o.restaurant?.location?.coordinates?.length === 2)
    .map((o) => {
      const hotel = o.restaurant.location!.coordinates;
      const home = o.deliveryAddress?.location?.coordinates as [number, number] | undefined;
      return {
        _id: String(o._id),
        orderNumber: o.orderNumber,
        status: o.status,
        hotel: { name: o.restaurant.name, address: [o.restaurant.address?.line1, o.restaurant.address?.city].filter(Boolean).join(", "), location: hotel },
        customerArea: o.deliveryAddress?.city ?? undefined,
        pickupKm: Math.round(haversineKm(free.coords, hotel) * 10) / 10,
        tripKm: home ? Math.round(haversineKm(hotel, home) * 10) / 10 : undefined,
        items: o.items.reduce((n, i) => n + i.quantity, 0),
        total: o.pricing?.total ?? 0,
        cod: o.payment?.method === "cod",
        createdAt: o.createdAt,
      };
    })
    .sort((a, b) => a.pickupKm - b.pickupKm);

  return { radiusKm, within: rows.filter((r) => r.pickupKm <= radiusKm), beyond: rows.filter((r) => r.pickupKm > radiusKm).slice(0, 3) };
}

/** A rider taps "Accept" on a nearby order. */
export async function acceptOrder(riderId: unknown, orderId: string, req?: NextRequest) {
  const free = await loadFreeRider(riderId);
  if (!free) return { ok: false as const, error: "Go online with location turned on to accept orders" };
  if (!free.rider.delivery?.isOnline) return { ok: false as const, error: "Go online to accept orders" };
  if (free.rider.delivery?.activeOrder) return { ok: false as const, error: "Finish your current delivery first" };

  const order = await Order.findById(orderId);
  if (!order || !OPEN_FOR_RIDERS.includes(order.status) || order.deliveryPartner) return { ok: false as const, error: "Sorry, this order was just taken by another rider or is no longer available" };
  const hotel = await Restaurant.findById(order.restaurant).select("name location");
  const settings = await getSettings();
  const radiusKm = settings.delivery?.assignmentRadiusKm ?? 5;
  const km = hotel?.location?.coordinates ? Math.round(haversineKm(free.coords, hotel.location.coordinates as [number, number]) * 10) / 10 : Infinity;
  if (km > radiusKm) return { ok: false as const, error: `This hotel is ${km} km away - you can accept orders within ${radiusKm} km` };

  const claimed = await claimOrder(order, free.rider, km, hotel?.name ?? "hotel", { how: "accepted" }, req);
  return claimed ? { ok: true as const, order: claimed } : { ok: false as const, error: "Sorry, this order was just taken by another rider" };
}

/**
 * Auto-assignment from the rider's side: a free rider came online (or moved), so hand them the
 * nearest waiting order. Only when the admin has auto-assignment switched on.
 */
export async function assignWaitingOrderTo(riderId: unknown, req?: NextRequest) {
  const settings = await getSettings();
  if (!settings.delivery?.autoAssign) return null;
  const free = await loadFreeRider(riderId);
  if (!free?.rider.delivery?.isAvailable) return null;
  const { within } = await openOrdersFor(riderId);
  // "ready" food first, then nearest.
  const ranked = [...within].sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready") || a.pickupKm - b.pickupKm);
  for (const row of ranked) {
    const order = await Order.findById(row._id);
    const claimed = order ? await claimOrder(order, free.rider, row.pickupKm, row.hotel.name, { how: "auto" }, req) : null;
    if (claimed) return claimed;
  }
  return null;
}

/** Switches off riders whose app went silent, logging it so the admin and the rider's app hear about it live. */
export async function switchOffStaleRiders(req?: NextRequest) {
  const stale = await expireStaleRiders();
  for (const r of stale) {
    await logActivity({
      actor: null,
      action: "delivery.offline",
      message: `${r.name} was set offline automatically (no GPS for 15 minutes)`,
      entityType: "user",
      entityId: r._id,
      notify: [r._id],
      req,
    });
  }
  return stale.length;
}

/**
 * An order is waiting for a rider: ring every online, free rider within range so they can accept it.
 */
export async function announceToNearbyRiders(order: OrderDoc, req?: NextRequest) {
  if (order.deliveryPartner || !OPEN_FOR_RIDERS.includes(order.status)) return 0;
  const hotel = await Restaurant.findById(order.restaurant).select("name location");
  if (!hotel?.location?.coordinates?.length) return 0;
  const settings = await getSettings();
  const riders = await findNearbyPartners(hotel.location.coordinates as [number, number], settings.delivery?.assignmentRadiusKm ?? 5, { onlyAvailable: true, limit: 30 });
  if (!riders.length) return 0;
  await logActivity({
    actor: null,
    action: "order.available",
    message: `New delivery near you: ${hotel.name} - order ${order.orderNumber} (₹${order.pricing?.total ?? 0})`,
    entityType: "order",
    entityId: order._id,
    meta: { riders: riders.length },
    notify: riders.map((r) => r._id),
    req,
  });
  return riders.length;
}
