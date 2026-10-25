import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireManager } from "@/lib/auth/manager";
import { canAccessOrder, orderAudience } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { getSettings } from "@/models/Setting";
import { managerOrderActionSchema } from "@/lib/validators";
import { managerOrderView } from "@/lib/managerView";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { releasePartner, timelineEntry } from "@/lib/orders";
import { announceToNearbyRiders, tryAutoAssign } from "@/lib/assignment";
import { refundIfPaidOnline } from "@/lib/payments";
import type { OrderStatus } from "@/lib/constants";

type Params = { id: string };

/** The only moves a hotel can make. Pickup / delivery belong to the rider. */
const TRANSITIONS: Record<"accept" | "reject" | "preparing" | "ready", { from: OrderStatus; to: OrderStatus }> = {
  accept: { from: "placed", to: "confirmed" },
  reject: { from: "placed", to: "cancelled" },
  preparing: { from: "confirmed", to: "preparing" },
  ready: { from: "preparing", to: "ready" },
};

async function loadOwnOrder(id: string) {
  assertObjectId(id);
  const ctx = await requireManager();
  const order = await Order.findById(id);
  // Treat other hotels' orders as non-existent rather than "forbidden" so ids can't be probed.
  if (!order || !canAccessOrder(ctx.user, order)) throw new ApiError(404, "Order not found");
  return { ...ctx, order };
}

export const GET = route<Params>(async (_req, { params }) => {
  const { restaurant, order } = await loadOwnOrder((await params).id);
  await order.populate([
    { path: "user", select: "name" },
    { path: "deliveryPartner", select: "name phone delivery.vehicleType delivery.vehicleNumber delivery.currentLocation delivery.lastLocationAt" },
  ]);
  return NextResponse.json({
    order: managerOrderView(order.toObject(), restaurant.location?.coordinates as [number, number]),
    hotel: { name: restaurant.name, location: restaurant.location?.coordinates },
  });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const { user, restaurant, order } = await loadOwnOrder((await params).id);
  const body = await parseBody(req, managerOrderActionSchema);
  const t = TRANSITIONS[body.action];
  if (order.status !== t.from) {
    throw new ApiError(409, `This order is already ${order.status.replace("_", " ")}. Refresh to see the latest.`);
  }

  order.status = t.to;
  let note: string | undefined;
  if (body.action === "accept") {
    const prep = body.prepMins ?? restaurant.avgPrepTimeMins ?? 20;
    note = `Accepted - ready in about ${prep} min`;
    order.estimatedDeliveryAt = new Date(Date.now() + (prep + Math.ceil((order.distanceKm ?? 3) * 4)) * 60000);
  }
  if (body.action === "reject") {
    note = body.reason;
    order.cancellation = { reason: body.reason, by: user._id, byRole: "manager", at: new Date() };
  }
  order.timeline.push(timelineEntry(t.to, user, note));
  await order.save();

  const verbs = { accept: "accepted", reject: "rejected", preparing: "started preparing", ready: "marked ready for pickup" };
  await logActivity({
    actor: user,
    action: body.action === "reject" ? "order.rejected" : `order.${t.to}`,
    message: `${restaurant.name} ${verbs[body.action]} order ${order.orderNumber}${body.action === "reject" ? `: ${body.reason}` : ""}`,
    entityType: "order",
    entityId: order._id,
    severity: body.action === "reject" ? "warning" : "info",
    notify: await orderAudience(order),
    req,
  });

  const customer = await User.findById(order.user).select("name email").lean();
  if (body.action === "reject") {
    await releasePartner(order.deliveryPartner);
    await refundIfPaidOnline(order._id, user, `Rejected by ${restaurant.name}: ${body.reason}`, req);
    if (customer) void sendMail({ to: customer.email, ...mailTemplates.orderCancelled(customer.name, order.orderNumber, body.reason) });
  }
  if (body.action === "accept" && customer) {
    void sendMail({ to: customer.email, ...mailTemplates.orderConfirmed(customer.name, order.orderNumber, restaurant.name, body.prepMins ?? restaurant.avgPrepTimeMins ?? 20) });
  }

  // Find a rider as soon as the hotel commits to the order (and retry when food is ready).
  let assigned = null;
  if ((body.action === "accept" || body.action === "ready") && !order.deliveryPartner) {
    const settings = await getSettings();
    if (settings.delivery?.autoAssign) assigned = await tryAutoAssign(order, null, req);
    // Still no rider (auto-assign off, or nobody free right now): let nearby riders accept it.
    if (!assigned) await announceToNearbyRiders(order, req);
  }

  return NextResponse.json({ ok: true, status: order.status, riderAssigned: assigned ? { name: assigned.name, distanceKm: assigned.distanceKm } : null });
});
