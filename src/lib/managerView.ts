import { haversineKm } from "@/lib/geo";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * What a hotel manager may see of an order: the customer's first name only (no email,
 * phone or exact address), plus the assigned rider's contact and live distance from the hotel.
 */
export function managerOrderView(o: Loose, hotelCoords?: [number, number]) {
  const rider = o.deliveryPartner;
  const riderCoords = rider?.delivery?.currentLocation?.coordinates as [number, number] | undefined;
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
    items: o.items,
    pricing: { subtotal: o.pricing?.subtotal, total: o.pricing?.total },
    payment: { method: o.payment?.method, status: o.payment?.status },
    notes: o.notes,
    createdAt: o.createdAt,
    assignedAt: o.assignedAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    cancellation: o.cancellation ? { reason: o.cancellation.reason, byRole: o.cancellation.byRole, at: o.cancellation.at } : undefined,
    customer: { name: String(o.user?.name ?? "Customer").split(" ")[0], area: o.deliveryAddress?.city ?? "" },
    timeline: (o.timeline ?? []).map((t: Loose) => ({ status: t.status, note: t.note, byRole: t.byRole, at: t.at })),
    rider: rider
      ? {
          name: rider.name,
          phone: rider.phone,
          vehicleType: rider.delivery?.vehicleType,
          vehicleNumber: rider.delivery?.vehicleNumber,
          location: riderCoords,
          lastLocationAt: rider.delivery?.lastLocationAt,
          distanceKm: riderCoords && hotelCoords ? Math.round(haversineKm(riderCoords, hotelCoords) * 10) / 10 : undefined,
        }
      : undefined,
  };
}
