import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { canAccessOrder, orderAudience } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { Restaurant } from "@/models/Restaurant";
import { getSettings } from "@/models/Setting";
import { deliverSchema } from "@/lib/validators";
import { otpMatches } from "@/lib/deliveryOtp";
import { releasePartner, timelineEntry } from "@/lib/orders";
import { logActivity } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { assignWaitingOrderTo } from "@/lib/assignment";

type Params = { id: string };

/**
 * Completes a delivery. The rider must enter the OTP the customer holds - this is the only
 * way an order becomes "delivered" (apart from a logged admin override).
 */
export const POST = route<Params>(async (req, { params }) => {
  const rider = await requireRole("delivery");
  const { id } = await params;
  assertObjectId(id);
  if (!rateLimit(`otp:${rider._id}`, 10, 60_000).ok) throw new ApiError(429, "Too many attempts. Wait a minute.");
  const { otp } = await parseBody(req, deliverSchema);

  const order = await Order.findById(id).select("+deliveryOtpHash");
  if (!order || !canAccessOrder(rider, order)) throw new ApiError(404, "Order not found");
  if (order.status === "delivered") return NextResponse.json({ ok: true, status: "delivered" });
  if (order.status !== "picked_up") throw new ApiError(409, "Mark the order as picked up first");

  const settings = await getSettings();
  const maxAttempts = settings.maxOtpAttempts ?? 5;
  if ((order.otpAttempts ?? 0) >= maxAttempts) {
    throw new ApiError(423, "Too many wrong codes. Support has been alerted - please call them to complete this delivery.");
  }

  if (!order.deliveryOtpHash || !otpMatches(order._id, otp, order.deliveryOtpHash)) {
    order.otpAttempts = (order.otpAttempts ?? 0) + 1;
    const left = maxAttempts - order.otpAttempts;
    order.timeline.push(timelineEntry("otp_failed", rider, `Wrong delivery code (${order.otpAttempts}/${maxAttempts})`));
    await order.save();
    if (left <= 0) {
      await logActivity({
        actor: rider,
        action: "order.otp_locked",
        message: `Delivery OTP for order ${order.orderNumber} locked after ${maxAttempts} wrong attempts by ${rider.name} - needs review`,
        entityType: "order",
        entityId: order._id,
        severity: "critical",
        notify: await orderAudience(order),
        req,
      });
      throw new ApiError(423, "Too many wrong codes. Support has been alerted - please call them to complete this delivery.");
    }
    throw new ApiError(400, `That code is incorrect. ${left} attempt${left === 1 ? "" : "s"} left. Ask the customer to check their GreenBite app or email.`);
  }

  order.status = "delivered";
  order.deliveredAt = new Date();
  if (order.payment?.method === "cod") order.payment.status = "paid";
  order.timeline.push(timelineEntry("delivered", rider, "Delivered - OTP verified"));
  await order.save();
  await releasePartner(rider._id, true);

  await logActivity({
    actor: rider,
    action: "order.delivered",
    message: `${rider.name} delivered order ${order.orderNumber} (OTP verified)${order.payment?.method === "cod" ? ` - collected ₹${order.pricing?.total} cash` : ""}`,
    entityType: "order",
    entityId: order._id,
    notify: await orderAudience(order),
    req,
  });
  const [customer, hotel] = await Promise.all([
    User.findById(order.user).select("name email").lean(),
    Restaurant.findById(order.restaurant).select("name").lean(),
  ]);
  if (customer) void sendMail({ to: customer.email, ...mailTemplates.orderDelivered(customer.name, order.orderNumber, hotel?.name ?? "the hotel", order.pricing?.total ?? 0) });

  // Free again - hand over the next waiting order nearby, if any.
  const next = await assignWaitingOrderTo(rider._id, req);
  return NextResponse.json({ ok: true, status: "delivered", collected: order.payment?.method === "cod" ? order.pricing?.total : 0, nextOrder: next ? { _id: next._id, orderNumber: next.orderNumber } : null });
});
