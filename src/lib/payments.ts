import "server-only";
import type { NextRequest } from "next/server";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { Restaurant } from "@/models/Restaurant";
import { getSettings } from "@/models/Setting";
import { logActivity } from "@/lib/audit";
import { orderAudience } from "@/lib/auth/access";
import { sendMail, mailTemplates } from "@/lib/mail";
import { decryptOtp } from "@/lib/deliveryOtp";
import { timelineEntry } from "@/lib/orders";
import { razorpayConfigured, razorpayMode, fetchRazorpayPayment, refundRazorpayPayment } from "@/lib/razorpay";
import type { Role } from "@/lib/constants";

type Actor = { _id: unknown; name: string; role: Role } | null;
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

/** Online payment is offered only when the admin enabled it AND Razorpay keys are configured. */
export async function onlinePaymentsLive() {
  const s = await getSettings();
  const anyMethod = !!(s.payments?.upi || s.payments?.card || s.payments?.wallet);
  return anyMethod && s.payments?.gatewayProvider === "razorpay" && razorpayConfigured();
}

export function gatewayStatus() {
  return { razorpayConfigured: razorpayConfigured(), mode: razorpayConfigured() ? razorpayMode() : null, webhookConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET };
}

/**
 * Everything that happens when an order becomes real for the hotel: activity log (rings the
 * hotel dashboard), confirmation email with the delivery OTP, and the hotel's new-order email.
 * Called right away for COD and only after payment is confirmed for online orders.
 */
export async function announceNewOrder(orderId: unknown, req?: NextRequest) {
  const order = await Order.findById(orderId).select("+deliveryOtpEnc");
  if (!order) return;
  const [user, hotel] = await Promise.all([
    User.findById(order.user).select("name email role"),
    Restaurant.findById(order.restaurant).select("name manager").populate<{ manager: { name: string; email: string } | null }>("manager", "name email"),
  ]);
  if (!user || !hotel) return;
  const method = order.payment?.method === "cod" ? "COD" : `paid online${order.payment?.channel ? ` (${order.payment.channel.toUpperCase()})` : ""}`;

  await logActivity({
    actor: user,
    action: "order.placed",
    message: `${user.name} placed order ${order.orderNumber} at ${hotel.name} (₹${order.pricing?.total}, ${method})`,
    entityType: "order",
    entityId: order._id,
    meta: { total: order.pricing?.total, items: order.items.length, payment: order.payment?.method },
    notify: await orderAudience(order),
    req,
  });

  const base = process.env.APP_URL || req?.nextUrl.origin || "http://localhost:3000";
  void sendMail({
    to: user.email,
    ...mailTemplates.orderPlaced(user.name, {
      orderNumber: order.orderNumber,
      restaurant: hotel.name,
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      total: order.pricing?.total ?? 0,
      method: order.payment?.method === "cod" ? "cod" : "paid online",
      otp: decryptOtp(order.deliveryOtpEnc) ?? "----",
      link: `${base}/account/orders/${order._id}`,
    }),
  });
  if (hotel.manager) {
    void sendMail({ to: hotel.manager.email, ...mailTemplates.newOrderForHotel(hotel.manager.name, order.orderNumber, order.items, `${base}/manager/orders/${order._id}`) });
  }
}

/**
 * Marks an online-payment order paid and releases it to the hotel. Idempotent: the browser
 * callback and the Razorpay webhook can both call this; only the first one does anything.
 */
export async function markOrderPaid(gatewayOrderId: string, paymentId: string, source: "checkout" | "webhook", req?: NextRequest) {
  let channel: string | undefined;
  try {
    channel = (await fetchRazorpayPayment(paymentId)).method;
  } catch {
    /* channel is cosmetic; the signature already proved the payment */
  }

  const updated = await Order.findOneAndUpdate(
    { "payment.gatewayOrderId": gatewayOrderId, status: "payment_pending" },
    {
      $set: {
        status: "placed",
        "payment.status": "paid",
        "payment.transactionId": paymentId,
        "payment.paidAt": new Date(),
        ...(channel ? { "payment.channel": channel } : {}),
      },
      $push: { timeline: timelineEntry("placed", null, `Paid online${channel ? ` via ${channel.toUpperCase()}` : ""} (Razorpay ${paymentId})`) },
    },
    { new: true }
  );

  if (updated) {
    await announceNewOrder(updated._id, req);
    return { order: updated, alreadyPaid: false };
  }

  const existing = await Order.findOne({ "payment.gatewayOrderId": gatewayOrderId });
  if (!existing) return { order: null, alreadyPaid: false };
  // Paid after the order had already expired/been cancelled: give the money back automatically.
  if (existing.status === "cancelled" && existing.payment?.status !== "refunded" && existing.payment?.status !== "paid") {
    existing.payment!.status = "paid";
    existing.payment!.transactionId = paymentId;
    await existing.save();
    await refundIfPaidOnline(existing._id, null, `Payment arrived after the order was cancelled (${source})`, req);
  }
  return { order: existing, alreadyPaid: true };
}

/** Refunds the full amount of a paid online order via Razorpay. Safe to call for any order. */
export async function refundIfPaidOnline(orderId: unknown, actor: Actor, reason: string, req?: NextRequest) {
  const order = await Order.findById(orderId);
  if (!order || order.payment?.method !== "online" || order.payment.status !== "paid" || !order.payment.transactionId) return { refunded: false };
  try {
    const refund = await refundRazorpayPayment(order.payment.transactionId, order.pricing?.total ?? 0, { order: order.orderNumber, reason: reason.slice(0, 200) });
    order.payment.status = "refunded";
    order.payment.refundId = refund.id;
    order.payment.refundedAt = new Date();
    order.timeline.push(timelineEntry("refunded", actor, `₹${order.pricing?.total} refunded to the original payment method (${refund.id})`));
    await order.save();
    await logActivity({
      actor,
      action: "order.refunded",
      message: `₹${order.pricing?.total} refunded for order ${order.orderNumber} via Razorpay - ${reason}`,
      entityType: "order",
      entityId: order._id,
      severity: "warning",
      notify: await orderAudience(order),
      req,
    });
    return { refunded: true, refundId: refund.id };
  } catch (err) {
    await logActivity({
      actor,
      action: "order.refund_failed",
      message: `Automatic refund FAILED for order ${order.orderNumber} (₹${order.pricing?.total}): ${(err as Error).message}. Refund it from the Razorpay dashboard.`,
      entityType: "order",
      entityId: order._id,
      severity: "critical",
      req,
    });
    return { refunded: false, error: (err as Error).message };
  }
}

/** Online orders left unpaid for 30 minutes are cancelled so they don't linger. */
export async function expireUnpaidOrders(filter: Record<string, unknown> = {}) {
  const cutoff = new Date(Date.now() - PAYMENT_WINDOW_MS);
  const at = new Date();
  await Order.updateMany(
    { ...filter, status: "payment_pending", createdAt: { $lt: cutoff } },
    {
      $set: { status: "cancelled", "payment.status": "failed", cancellation: { reason: "Payment was not completed in time", byRole: "system", at } },
      $push: { timeline: { status: "cancelled", note: "Payment was not completed within 30 minutes", byRole: "system", at } },
    }
  );
}
