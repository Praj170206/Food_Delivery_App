import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { adminOrderActionSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { releasePartner, reservePartner, timelineEntry } from "@/lib/orders";
import { notifyAssignment, tryAutoAssign } from "@/lib/assignment";
import { refundIfPaidOnline } from "@/lib/payments";
import { orderAudience } from "@/lib/auth/access";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => {
  await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);

  const order = await Order.findById(id)
    .populate("user", "name email phone")
    .populate("restaurant", "name phone address location manager")
    .populate("deliveryPartner", "name phone email delivery.vehicleType delivery.vehicleNumber delivery.currentLocation delivery.lastLocationAt")
    .populate("timeline.by", "name")
    .populate("cancellation.by", "name")
    .lean();
  if (!order) throw new ApiError(404, "Order not found");
  return NextResponse.json({ order });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const admin = await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);
  const body = await parseBody(req, adminOrderActionSchema);

  const order = await Order.findById(id).populate<{ user: { _id: unknown; name: string; email: string } }>("user", "name email");
  if (!order) throw new ApiError(404, "Order not found");
  const isActive = ACTIVE_ORDER_STATUSES.includes(order.status as OrderStatus);
  const previousPartner = order.deliveryPartner;
  // Everyone involved hears about it live: customer, hotel manager, current and previous rider.
  const log = async (action: string, message: string, severity: "info" | "warning" | "critical" = "info", meta?: Record<string, unknown>) =>
    logActivity({ actor: admin, action, message, entityType: "order", entityId: order._id, severity, meta, notify: await orderAudience(order, previousPartner), req });

  switch (body.action) {
    case "cancel": {
      if (!isActive) throw new ApiError(400, `Order is already ${order.status}`);
      const partner = order.deliveryPartner;
      order.status = "cancelled";
      order.cancellation = { reason: body.reason, by: admin._id, byRole: "admin", at: new Date() };
      order.timeline.push(timelineEntry("cancelled", admin, body.reason));
      await order.save();
      await releasePartner(partner);
      await refundIfPaidOnline(order._id, admin, `Cancelled by admin: ${body.reason}`, req);
      await log("order.cancelled", `${admin.name} cancelled order ${order.orderNumber}: ${body.reason}`, "warning");
      void sendMail({ to: order.user.email, ...mailTemplates.orderCancelled(order.user.name, order.orderNumber, body.reason) });
      break;
    }

    case "assign":
    case "unassign": {
      if (!isActive || order.status === "picked_up") {
        throw new ApiError(400, "Partner can only be changed before the order is picked up");
      }
      const previous = order.deliveryPartner;
      let partner = null;
      if (body.action === "assign") {
        if (previous && String(previous) === body.partnerId) throw new ApiError(400, "Partner already assigned");
        partner = await User.findById(body.partnerId);
        if (!partner || partner.role !== "delivery") throw new ApiError(400, "Not a delivery partner");
        if (!(await reservePartner(partner._id, order._id))) {
          throw new ApiError(409, `${partner.name} is not available right now`);
        }
      }
      if (previous) await releasePartner(previous);

      order.deliveryPartner = partner?._id;
      order.assignedAt = partner ? new Date() : undefined;
      const note = partner ? `Assigned to ${partner.name} by admin` : `Partner removed by admin${body.action === "unassign" && body.reason ? `: ${body.reason}` : ""}`;
      order.timeline.push(timelineEntry(partner ? "partner_assigned" : "partner_unassigned", admin, note));
      await order.save();

      await log(
        partner ? "order.partner_assigned" : "order.partner_unassigned",
        `${admin.name}: order ${order.orderNumber} - ${note}`,
        previous ? "warning" : "info"
      );
      if (partner) await notifyAssignment(order, partner._id);
      break;
    }

    case "status": {
      if (body.status === order.status) throw new ApiError(400, "Order already has this status");
      if (!isActive) throw new ApiError(400, `A ${order.status} order can't be changed`);
      if (body.status === "cancelled") throw new ApiError(400, "Use the cancel action to cancel an order");
      if (body.status === "picked_up" && !order.deliveryPartner) throw new ApiError(400, "Assign a delivery partner first");

      const from = order.status;
      order.status = body.status;
      if (body.status === "picked_up") order.pickedUpAt = new Date();
      if (body.status === "delivered") {
        order.deliveredAt = new Date();
        if (order.payment?.method === "cod") order.payment.status = "paid";
      }
      order.timeline.push(timelineEntry(body.status, admin, body.note ?? "Status overridden by admin"));
      await order.save();
      if (body.status === "delivered") await releasePartner(order.deliveryPartner, true);

      // Overriding "delivered" skips the customer OTP check, so flag it loudly.
      await log(
        "order.status_override",
        `${admin.name} moved order ${order.orderNumber} from ${ORDER_STATUS_LABELS[from as OrderStatus]} to ${ORDER_STATUS_LABELS[body.status]}`,
        body.status === "delivered" ? "critical" : "warning",
        { from, to: body.status, note: body.note }
      );
      break;
    }

    case "refund": {
      if (order.payment?.status !== "paid") throw new ApiError(400, "Only paid orders can be refunded");
      if (order.payment.method === "cod" && order.status !== "delivered") throw new ApiError(400, "Nothing to refund for this COD order");
      if (order.payment.method === "online") {
        // Real money back through Razorpay.
        const r = await refundIfPaidOnline(order._id, admin, body.note ?? "Refund issued by admin", req);
        if (!r.refunded) throw new ApiError(502, `Razorpay refund failed: ${r.error ?? "unknown error"}`);
        break;
      }
      order.payment.status = "refunded";
      order.timeline.push(timelineEntry("refunded", admin, body.note ?? "Refund issued by admin"));
      await order.save();
      await log("order.refunded", `${admin.name} refunded order ${order.orderNumber} (₹${order.pricing?.total ?? 0})`, "warning");
      break;
    }
  }

  return NextResponse.json({ ok: true });
});

/** POST = auto-assign the nearest available partner (the same logic the checkout flow will use). */
export const POST = route<Params>(async (req, { params }) => {
  const admin = await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);

  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Order not found");
  if (order.deliveryPartner) throw new ApiError(400, "Order already has a delivery partner");
  if (!ACTIVE_ORDER_STATUSES.includes(order.status as OrderStatus) || order.status === "picked_up") {
    throw new ApiError(400, `Can't assign a partner to a ${order.status} order`);
  }
  const assigned = await tryAutoAssign(order, admin, req);
  if (assigned) return NextResponse.json({ assigned });
  throw new ApiError(404, "No available delivery partner within the assignment radius");
});
