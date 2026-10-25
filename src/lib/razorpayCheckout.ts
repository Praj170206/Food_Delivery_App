import "server-only";
import { Order } from "@/models/Order";
import { createRazorpayOrder } from "@/lib/razorpay";

type Customer = { name: string; email: string; phone?: string | null };

/**
 * Options the browser passes to Razorpay Checkout for a payment_pending order. Creates the
 * Razorpay order once and reuses it on retries, so one GreenBite order maps to one Razorpay order.
 */
export async function razorpayCheckoutFor(orderId: unknown, customer: Customer) {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "payment_pending") return null;
  const amount = order.pricing?.total ?? 0;

  if (!order.payment?.gatewayOrderId) {
    const rzp = await createRazorpayOrder(amount, order.orderNumber, { greenbite_order_id: String(order._id) });
    order.payment!.gatewayOrderId = rzp.id;
    order.payment!.provider = "razorpay";
    await order.save();
  }

  return {
    key: process.env.RAZORPAY_KEY_ID,
    order_id: order.payment!.gatewayOrderId,
    amount: Math.round(amount * 100),
    currency: "INR",
    name: "GreenBite",
    description: `Order ${order.orderNumber}`,
    prefill: { name: customer.name, email: customer.email, contact: customer.phone ?? undefined },
  };
}
