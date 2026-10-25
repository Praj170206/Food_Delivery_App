import { decryptOtp } from "@/lib/deliveryOtp";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ACTIVE = ["placed", "confirmed", "preparing", "ready", "picked_up"];

/**
 * What a customer may see of their own order. The rider's live position and the
 * delivery OTP are only included while the order is still on its way.
 */
export function customerOrderView(o: Loose) {
  const active = ACTIVE.includes(o.status);
  const rider = o.deliveryPartner;
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
    items: o.items,
    pricing: o.pricing,
    payment: o.payment,
    notes: o.notes,
    distanceKm: o.distanceKm,
    createdAt: o.createdAt,
    assignedAt: o.assignedAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    deliveryAddress: { line1: o.deliveryAddress?.line1, city: o.deliveryAddress?.city, location: o.deliveryAddress?.location?.coordinates },
    restaurant: o.restaurant && {
      _id: o.restaurant._id,
      name: o.restaurant.name,
      slug: o.restaurant.slug,
      phone: o.restaurant.phone,
      address: o.restaurant.address,
      location: o.restaurant.location?.coordinates,
    },
    rider:
      rider && rider.name
        ? {
            name: rider.name,
            phone: active ? rider.phone : undefined,
            vehicleType: rider.delivery?.vehicleType,
            vehicleNumber: rider.delivery?.vehicleNumber,
            location: active ? rider.delivery?.currentLocation?.coordinates : undefined,
            lastLocationAt: active ? rider.delivery?.lastLocationAt : undefined,
          }
        : undefined,
    deliveryOtp: active ? decryptOtp(o.deliveryOtpEnc) : null,
    cancellation: o.cancellation ? { reason: o.cancellation.reason, byRole: o.cancellation.byRole, at: o.cancellation.at } : undefined,
    timeline: (o.timeline ?? []).map((t: Loose) => ({ status: t.status, note: t.note, byRole: t.byRole, at: t.at })),
    canCancel: o.status === "placed" || o.status === "payment_pending",
    awaitingPayment: o.status === "payment_pending",
  };
}
