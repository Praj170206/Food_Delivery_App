import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { canAccessOrder, orderAudience } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { customerCancelSchema } from "@/lib/validators";
import { customerOrderView } from "@/lib/customerView";
import { releasePartner, timelineEntry } from "@/lib/orders";
import { logActivity } from "@/lib/audit";
import { refundIfPaidOnline } from "@/lib/payments";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  const order = await Order.findById(id)
    .select("+deliveryOtpEnc")
    .populate("restaurant", "name slug phone address location")
    .populate("deliveryPartner", "name phone delivery.vehicleType delivery.vehicleNumber delivery.currentLocation delivery.lastLocationAt")
    .lean();
  // Someone else's order looks exactly like a missing one.
  if (!order || !canAccessOrder(user, order)) throw new ApiError(404, "Order not found");
  return NextResponse.json({ order: customerOrderView(order) });
});

/** PATCH = cancel. Only allowed before the hotel accepts; after that, support handles it. */
export const PATCH = route<Params>(async (req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  const { reason } = await parseBody(req, customerCancelSchema);

  const order = await Order.findById(id);
  if (!order || !canAccessOrder(user, order)) throw new ApiError(404, "Order not found");
  if (order.status !== "placed" && order.status !== "payment_pending") {
    throw new ApiError(409, "The hotel has already started on this order, so it can't be cancelled here. Please contact support.");
  }
  const text = reason || "Cancelled by customer";
  const wasUnpaid = order.status === "payment_pending"; // the hotel never saw it
  order.status = "cancelled";
  order.cancellation = { reason: text, by: user._id, byRole: "user", at: new Date() };
  order.timeline.push(timelineEntry("cancelled", user, text));
  await order.save();
  await releasePartner(order.deliveryPartner);
  await refundIfPaidOnline(order._id, user, "Cancelled by customer", req);

  await logActivity({
    actor: user,
    action: "order.cancelled",
    message: `${user.name} cancelled order ${order.orderNumber}: ${text}`,
    entityType: "order",
    entityId: order._id,
    severity: "warning",
    notify: wasUnpaid ? [user._id] : await orderAudience(order),
    req,
  });
  return NextResponse.json({ ok: true });
});
