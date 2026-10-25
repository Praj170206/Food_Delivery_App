import type { Types } from "mongoose";
import { Restaurant } from "@/models/Restaurant";
import type { Role } from "@/lib/constants";

type Viewer = { _id: Types.ObjectId | string; role: Role; restaurant?: Types.ObjectId | string | null };
type OrderRef = {
  user: unknown;
  restaurant: unknown;
  deliveryPartner?: unknown;
};

const idOf = (v: unknown) => (v && typeof v === "object" && "_id" in v ? String((v as { _id: unknown })._id) : v ? String(v) : "");

/**
 * Object-level authorization for orders, shared by every role's API:
 * admin -> all, customer -> own orders, manager -> their hotel's orders,
 * delivery partner -> orders assigned to them.
 */
export function canAccessOrder(viewer: Viewer, order: OrderRef) {
  switch (viewer.role) {
    case "admin":
      return true;
    case "user":
      return idOf(order.user) === String(viewer._id);
    case "manager":
      return !!viewer.restaurant && idOf(order.restaurant) === String(viewer.restaurant);
    case "delivery":
      return !!order.deliveryPartner && idOf(order.deliveryPartner) === String(viewer._id);
  }
}

/** Mongo filter limiting an order query to what the viewer may see. */
export function orderScope(viewer: Viewer): Record<string, unknown> {
  switch (viewer.role) {
    case "admin":
      return {};
    case "user":
      return { user: viewer._id };
    case "manager":
      return viewer.restaurant ? { restaurant: viewer.restaurant } : { _id: null };
    case "delivery":
      return { deliveryPartner: viewer._id };
  }
}

/** Everyone involved in an order who should hear about changes to it (customer, hotel manager, riders). */
export async function orderAudience(order: OrderRef, ...extra: unknown[]) {
  const restaurant = await Restaurant.findById(idOf(order.restaurant)).select("manager").lean();
  return [idOf(order.user), restaurant?.manager ? String(restaurant.manager) : "", idOf(order.deliveryPartner), ...extra.map(idOf)].filter(Boolean);
}
