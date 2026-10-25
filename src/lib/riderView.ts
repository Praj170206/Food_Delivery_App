import { haversineKm } from "@/lib/geo";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * What the assigned rider sees of an order. Customer contact and exact address are only
 * included while the order is active - once delivered/cancelled they're hidden again.
 */
export function riderOrderView(o: Loose, riderCoords?: [number, number]) {
  const active = ["confirmed", "preparing", "ready", "picked_up"].includes(o.status);
  const hotel = o.restaurant ?? {};
  const hotelCoords = hotel.location?.coordinates as [number, number] | undefined;
  const homeCoords = o.deliveryAddress?.location?.coordinates as [number, number] | undefined;
  const km = (a?: [number, number], b?: [number, number]) => (a && b ? Math.round(haversineKm(a, b) * 10) / 10 : undefined);
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
    items: (o.items ?? []).map((i: Loose) => ({ name: i.name, quantity: i.quantity })),
    total: o.pricing?.total,
    payment: { method: o.payment?.method, status: o.payment?.status },
    // Cash the rider must collect at the door.
    collectCash: o.payment?.method === "cod" && o.payment?.status !== "paid" ? o.pricing?.total : 0,
    notes: o.notes,
    createdAt: o.createdAt,
    assignedAt: o.assignedAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    otpAttempts: o.otpAttempts ?? 0,
    hotel: { name: hotel.name, phone: active ? hotel.phone : undefined, address: hotel.address, location: hotelCoords, distanceKm: km(riderCoords, hotelCoords) },
    customer: active
      ? {
          name: o.user?.name,
          phone: o.user?.phone,
          address: o.deliveryAddress?.line1,
          city: o.deliveryAddress?.city,
          location: homeCoords,
          distanceKm: km(riderCoords, homeCoords),
        }
      : { name: String(o.user?.name ?? "Customer").split(" ")[0], address: o.deliveryAddress?.city },
    tripKm: km(hotelCoords, homeCoords),
  };
}
