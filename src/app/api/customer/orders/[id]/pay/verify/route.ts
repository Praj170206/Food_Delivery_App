import { NextResponse } from "next/server";
import { z } from "zod";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { canAccessOrder } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { verifyCheckoutSignature } from "@/lib/razorpay";
import { markOrderPaid } from "@/lib/payments";

type Params = { id: string };

const schema = z.object({
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/, "Invalid payment id"),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/, "Invalid order id"),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid signature"),
});

/**
 * Called by the browser after Razorpay Checkout succeeds. The payment only counts if the
 * signature (made with our secret key) matches - a tampered or fake callback is rejected.
 */
export const POST = route<Params>(async (req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  const body = await parseBody(req, schema);

  const order = await Order.findById(id).select("user restaurant deliveryPartner status payment orderNumber");
  if (!order || !canAccessOrder(user, order)) throw new ApiError(404, "Order not found");
  if (order.payment?.gatewayOrderId !== body.razorpay_order_id) throw new ApiError(400, "This payment doesn't belong to this order");
  if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    throw new ApiError(400, "Payment verification failed. If money was debited, it will be refunded automatically.");
  }

  const res = await markOrderPaid(body.razorpay_order_id, body.razorpay_payment_id, "checkout", req);
  const status = res.order?.status;
  if (status === "cancelled") throw new ApiError(409, "This order had expired, so your payment is being refunded automatically.");
  return NextResponse.json({ ok: true, status, orderNumber: order.orderNumber });
});
