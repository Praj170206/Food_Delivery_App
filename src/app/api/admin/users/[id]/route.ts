import { NextResponse } from "next/server";
import { route, parseBody, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { User } from "@/models/User";
import { Order } from "@/models/Order";
import { ActivityLog } from "@/models/ActivityLog";
import { adminUpdateUserSchema } from "@/lib/validators";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { ROLE_LABELS } from "@/lib/constants";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => {
  await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);

  const user = await User.findById(id)
    .populate("restaurant", "name status address.city isOpen")
    .populate("delivery.activeOrder", "orderNumber status")
    .lean();
  if (!user) throw new ApiError(404, "User not found");

  const orderFilter =
    user.role === "delivery" ? { deliveryPartner: user._id } : user.role === "user" ? { user: user._id } : null;

  const [orderStats, recentOrders, activity] = await Promise.all([
    orderFilter
      ? Order.aggregate([
          { $match: orderFilter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
              value: { $sum: { $cond: [{ $ne: ["$status", "cancelled"] }, "$pricing.total", 0] } },
            },
          },
        ])
      : Promise.resolve([]),
    orderFilter
      ? Order.find(orderFilter)
          .sort({ createdAt: -1 })
          .limit(10)
          .select("orderNumber status pricing.total createdAt restaurant")
          .populate("restaurant", "name")
          .lean()
      : Promise.resolve([]),
    ActivityLog.find({ $or: [{ actor: user._id }, { entityId: user._id }] })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const { passwordHash: _p, passwordResetTokenHash: _t, passwordResetExpires: _e, ...safe } = user as Record<string, unknown>;
  return NextResponse.json({
    user: safe,
    orderStats: orderStats[0] ?? { total: 0, delivered: 0, cancelled: 0, value: 0 },
    recentOrders,
    activity,
  });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const admin = await requireRole("admin");
  const { id } = await params;
  assertObjectId(id);
  const body = await parseBody(req, adminUpdateUserSchema);

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found");

  const isSelf = String(user._id) === String(admin._id);
  if (isSelf && (body.role || body.status)) {
    throw new ApiError(400, "You can't change your own role or status");
  }

  // Never allow the platform to end up with no active admin.
  const removingAdmin =
    user.role === "admin" && ((body.role && body.role !== "admin") || (body.status && body.status !== "active"));
  if (removingAdmin) {
    const activeAdmins = await User.countDocuments({ role: "admin", status: "active" });
    if (activeAdmins <= 1) throw new ApiError(400, "At least one active admin is required");
  }

  const changes: string[] = [];
  const prevStatus = user.status;

  if (body.name && body.name !== user.name) {
    changes.push(`name → ${body.name}`);
    user.name = body.name;
  }
  if (body.phone !== undefined && body.phone !== (user.phone ?? "")) {
    changes.push("phone updated");
    user.phone = body.phone || undefined;
  }
  if (body.role && body.role !== user.role) {
    if (user.role === "delivery" && user.delivery?.activeOrder) {
      throw new ApiError(400, "This partner has an active delivery. Reassign it first.");
    }
    changes.push(`role ${ROLE_LABELS[user.role]} → ${ROLE_LABELS[body.role]}`);
    user.role = body.role;
    if (body.role === "delivery" && !user.delivery) {
      user.delivery = { vehicleType: "scooter", isOnline: false, isAvailable: false, totalDeliveries: 0, rating: 0 };
    }
    user.tokenVersion += 1; // the role is inside the JWT, so force a fresh sign-in
  }
  if (body.status && body.status !== user.status) {
    if (body.status !== "active" && user.role === "delivery" && user.delivery?.activeOrder) {
      throw new ApiError(400, "This partner has an active delivery. Reassign it before suspending.");
    }
    changes.push(`status ${user.status} → ${body.status}`);
    user.status = body.status;
    user.statusReason = body.reason;
    if (body.status !== "active") {
      user.tokenVersion += 1;
      if (user.delivery) {
        user.delivery.isOnline = false;
        user.delivery.isAvailable = false;
      }
    }
  }
  if (body.verifyEmail && user.emailVerified === false) {
    changes.push("email marked verified");
    user.emailVerified = true;
  }
  if (body.forceLogout) {
    changes.push("signed out of all devices");
    user.tokenVersion += 1;
  }

  if (!changes.length) return NextResponse.json({ user: user.toJSON() });
  await user.save();

  const statusChanged = prevStatus !== user.status;
  await logActivity({
    actor: admin,
    action: statusChanged ? `user.${user.status}` : "user.updated",
    message: `${admin.name} updated ${user.name}: ${changes.join(", ")}${body.reason ? ` (reason: ${body.reason})` : ""}`,
    entityType: "user",
    entityId: user._id,
    severity: statusChanged && user.status !== "active" ? "warning" : body.role ? "critical" : "info",
    meta: { changes, reason: body.reason },
    notify: [user._id],
    req,
  });

  if (statusChanged) {
    void sendMail({ to: user.email, ...mailTemplates.accountStatus(user.name, user.status, body.reason) });
  }

  return NextResponse.json({ user: user.toJSON() });
});
