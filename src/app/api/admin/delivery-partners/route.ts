import { NextResponse } from "next/server";
import { route, escapeRegex } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { User } from "@/models/User";
import { USER_STATUSES } from "@/lib/constants";

// Returns every partner (not paginated) because the fleet map plots them all at once.
export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;

  const filter: Record<string, unknown> = { role: "delivery" };
  const status = sp.get("status");
  const presence = sp.get("presence"); // online | offline | available | busy
  const q = sp.get("q")?.trim();
  if (status && (USER_STATUSES as readonly string[]).includes(status)) filter.status = status;
  if (presence === "online") filter["delivery.isOnline"] = true;
  if (presence === "offline") filter["delivery.isOnline"] = { $ne: true };
  if (presence === "available") filter["delivery.isAvailable"] = true;
  if (presence === "busy") filter["delivery.activeOrder"] = { $exists: true, $ne: null };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { "delivery.vehicleNumber": rx }];
  }

  const items = await User.find(filter)
    .sort({ "delivery.isOnline": -1, createdAt: -1 })
    .limit(500)
    .select("name email phone status createdAt lastLoginAt delivery")
    .populate("delivery.activeOrder", "orderNumber status")
    .lean();

  return NextResponse.json({ items });
});
