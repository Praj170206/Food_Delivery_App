import { NextResponse } from "next/server";
import { route, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { canAccessOrder } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { razorpayCheckoutFor } from "@/lib/razorpayCheckout";
import { expireUnpaidOrders } from "@/lib/payments";

type Params = { id: string };

/** "Pay now" for an order whose online payment wasn't completed yet. */
export const POST = route<Params>(async (_req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  await expireUnpaidOrders({ _id: id });
  const order = await Order.findById(id).select("user restaurant deliveryPartner status");
  if (!order || !canAccessOrder(user, order)) throw new ApiError(404, "Order not found");
  if (order.status !== "payment_pending") {
    throw new ApiError(409, order.status === "cancelled" ? "This order was cancelled because payment wasn't completed in time. Please place it again." : "This order is already paid.");
  }
  return NextResponse.json({ razorpay: await razorpayCheckoutFor(order._id, user) });
});
