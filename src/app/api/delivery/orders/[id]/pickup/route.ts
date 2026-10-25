import { NextResponse } from "next/server";
import { route, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { canAccessOrder, orderAudience } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { timelineEntry } from "@/lib/orders";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";

type Params = { id: string };

/** Rider has the food. Only possible once the hotel has marked it ready. */
export const POST = route<Params>(async (req, { params }) => {
  const rider = await requireRole("delivery");
  const { id } = await params;
  assertObjectId(id);
  const order = await Order.findById(id);
  if (!order || !canAccessOrder(rider, order)) throw new ApiError(404, "Order not found");
  if (order.status === "picked_up") return NextResponse.json({ ok: true, status: order.status });
  if (order.status !== "ready") {
    throw new ApiError(409, order.status === "cancelled" ? "This order was cancelled" : "The hotel hasn't marked this order ready yet. Please wait at the counter.");
  }

  order.status = "picked_up";
  order.pickedUpAt = new Date();
  order.timeline.push(timelineEntry("picked_up", rider, `Picked up by ${rider.name}`));
  await order.save();

  await logActivity({
    actor: rider,
    action: "order.picked_up",
    message: `${rider.name} picked up order ${order.orderNumber}`,
    entityType: "order",
    entityId: order._id,
    notify: await orderAudience(order),
    req,
  });
  const customer = await User.findById(order.user).select("name email").lean();
  if (customer) void sendMail({ to: customer.email, ...mailTemplates.orderOnTheWay(customer.name, order.orderNumber, rider.name) });
  return NextResponse.json({ ok: true, status: order.status });
});
