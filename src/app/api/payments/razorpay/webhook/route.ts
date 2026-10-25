import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { markOrderPaid } from "@/lib/payments";
import { logActivity } from "@/lib/audit";
import { Order } from "@/models/Order";

export const runtime = "nodejs";

type Payload = {
  event: string;
  payload: { payment?: { entity: { id: string; order_id: string; status: string; error_description?: string } } };
};

/**
 * Server-to-server confirmation from Razorpay (backup for when the customer's browser closes
 * right after paying). Authenticated by HMAC signature, not by cookies.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  await connectDB();
  const p = body.payload.payment?.entity;
  try {
    if (p && (body.event === "payment.captured" || body.event === "order.paid")) {
      await markOrderPaid(p.order_id, p.id, "webhook", req);
    } else if (p && body.event === "payment.failed") {
      const order = await Order.findOne({ "payment.gatewayOrderId": p.order_id }).select("_id orderNumber");
      if (order) {
        await logActivity({
          actor: null,
          action: "payment.failed",
          message: `Online payment attempt failed for order ${order.orderNumber}: ${p.error_description ?? "declined"}`,
          entityType: "order",
          entityId: order._id,
          severity: "warning",
          req,
        });
      }
    }
  } catch (err) {
    console.error("[razorpay webhook]", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Razorpay retries
  }
  return NextResponse.json({ ok: true });
}
