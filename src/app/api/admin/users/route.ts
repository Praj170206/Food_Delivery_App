import { NextResponse } from "next/server";
import { route, parseBody, pagination, escapeRegex } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { User } from "@/models/User";
import { adminCreateUserSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/audit";
import { ROLES, ROLE_LABELS, USER_STATUSES, type Role } from "@/lib/constants";

export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(req);

  const filter: Record<string, unknown> = {};
  const role = sp.get("role");
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  if (role && (ROLES as readonly string[]).includes(role)) filter.role = role;
  if (status && (USER_STATUSES as readonly string[]).includes(status)) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("name email phone role status emailVerified createdAt lastLoginAt restaurant delivery.isOnline delivery.isAvailable delivery.vehicleType")
      .populate("restaurant", "name status")
      .lean(),
    User.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
});

export const POST = route(async (req) => {
  const admin = await requireRole("admin");
  const body = await parseBody(req, adminCreateUserSchema);

  const user = new User({
    name: body.name,
    email: body.email,
    phone: body.phone || undefined,
    role: body.role,
    status: "active",
    emailVerified: true, // created by an admin, so ownership is vouched for
    passwordHash: await hashPassword(body.password),
  });
  if (body.role === "delivery") {
    user.delivery = { vehicleType: "scooter", isOnline: false, isAvailable: false, totalDeliveries: 0, rating: 0 };
  }
  await user.save();

  await logActivity({
    actor: admin,
    action: "user.created",
    message: `${admin.name} created ${ROLE_LABELS[body.role as Role]} account for ${user.name}`,
    entityType: "user",
    entityId: user._id,
    severity: body.role === "admin" ? "critical" : "info",
    meta: { role: body.role, email: user.email },
    req,
  });

  return NextResponse.json({ user: user.toJSON() }, { status: 201 });
});
