import { NextResponse } from "next/server";
import { route, parseBody, ApiError, pagination } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { orderScope } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { getSettings } from "@/models/Setting";
import { placeOrderSchema } from "@/lib/validators";
import { buildQuote } from "@/lib/pricing";
import { generateOrderNumber, timelineEntry } from "@/lib/orders";
import { encryptOtp, generateOtp, hashOtp } from "@/lib/deliveryOtp";
import { rateLimit } from "@/lib/rateLimit";
import { announceNewOrder, expireUnpaidOrders, onlinePaymentsLive } from "@/lib/payments";
import { razorpayCheckoutFor } from "@/lib/razorpayCheckout";
import { ACTIVE_ORDER_STATUSES } from "@/lib/constants";

export const GET = route(async (req) => {
  const user = await requireRole("user");
  await expireUnpaidOrders({ user: user._id });
  const { page, limit, skip } = pagination(req, 20);
  const filter = orderScope(user);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("orderNumber status items pricing.total payment.method payment.status createdAt deliveredAt estimatedDeliveryAt restaurant")
      .populate("restaurant", "name slug coverImage")
      .lean(),
    Order.countDocuments(filter),
  ]);
  return NextResponse.json({
    items: items.map((o) => ({ ...o, isActive: ACTIVE_ORDER_STATUSES.includes(o.status) || o.status === "payment_pending" })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const POST = route(async (req) => {
  const user = await requireRole("user");
  if (!rateLimit(`order:${user._id}`, 8, 10 * 60 * 1000).ok) throw new ApiError(429, "Too many orders in a short time. Please wait a few minutes.");
  const body = await parseBody(req, placeOrderSchema);

  // Idempotency: a retried / double-tapped request returns the order it already created.
  const existing = await Order.findOne({ user: user._id, clientRequestId: body.clientRequestId }).select("_id orderNumber status");
  if (existing) {
    const checkout = existing.status === "payment_pending" ? await razorpayCheckoutFor(existing._id, user) : null;
    return NextResponse.json({ orderId: existing._id, orderNumber: existing.orderNumber, duplicate: true, razorpay: checkout });
  }

  const address = user.addresses?.find((a) => String(a._id) === body.addressId);
  if (!address?.location?.coordinates) throw new ApiError(400, "Choose a delivery address");

  const settings = await getSettings();
  const online = body.paymentMethod === "online";
  if (online && !(await onlinePaymentsLive())) throw new ApiError(400, "Online payment isn't available right now. Please choose Cash on Delivery.");
  if (!online && !settings.payments?.cod) throw new ApiError(400, "Cash on Delivery is currently unavailable");

  const quote = await buildQuote(body.restaurantId, body.items, address.location.coordinates as [number, number]);
  if (!quote.ok) throw new ApiError(400, quote.problems[0], { problems: quote.problems });

  const otp = generateOtp((settings.otpLength as 4 | 6) ?? 4);
  const order = new Order({
    orderNumber: generateOrderNumber(),
    user: user._id,
    restaurant: body.restaurantId,
    items: quote.lines.map((l) => ({ menuItem: l.menuItemId, name: l.name, price: l.price, quantity: l.quantity })),
    pricing: quote.pricing,
    deliveryAddress: { line1: address.line1, city: address.city, pincode: address.pincode, location: { type: "Point", coordinates: address.location.coordinates } },
    // Online orders stay invisible to the hotel until Razorpay confirms the payment.
    status: online ? "payment_pending" : "placed",
    payment: online ? { method: "online", status: "pending", provider: "razorpay" } : { method: "cod", status: "pending" },
    distanceKm: quote.distanceKm,
    estimatedDeliveryAt: new Date(Date.now() + (quote.estimatedMins + 5) * 60000),
    notes: body.notes || undefined,
    clientRequestId: body.clientRequestId,
    timeline: [timelineEntry(online ? "payment_pending" : "placed", user, online ? "Waiting for online payment" : "Cash on delivery")],
  });
  order.deliveryOtpHash = hashOtp(order._id, otp);
  order.deliveryOtpEnc = encryptOtp(otp);

  try {
    await order.save();
  } catch (err) {
    // Lost a race with an identical request (same clientRequestId).
    if ((err as { code?: number }).code === 11000) {
      const dup = await Order.findOne({ user: user._id, clientRequestId: body.clientRequestId }).select("_id orderNumber");
      if (dup) return NextResponse.json({ orderId: dup._id, orderNumber: dup.orderNumber, duplicate: true });
    }
    throw err;
  }

  if (online) {
    try {
      const checkout = await razorpayCheckoutFor(order._id, user);
      return NextResponse.json({ orderId: order._id, orderNumber: order.orderNumber, razorpay: checkout }, { status: 201 });
    } catch (err) {
      order.status = "cancelled";
      order.cancellation = { reason: "Couldn't start the online payment", byRole: "system", at: new Date() };
      await order.save();
      throw new ApiError(502, `Couldn't start the online payment: ${(err as Error).message}. Please try again or choose Cash on Delivery.`);
    }
  }

  await announceNewOrder(order._id, req);
  return NextResponse.json({ orderId: order._id, orderNumber: order.orderNumber }, { status: 201 });
});
