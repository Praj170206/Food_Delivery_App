import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { route, pagination, escapeRegex } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { Order } from "@/models/Order";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/constants";

export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(req);

  const filter: Record<string, unknown> = {};
  const status = sp.get("status");
  if (status === "active") filter.status = { $in: ACTIVE_ORDER_STATUSES };
  else if (status && (ORDER_STATUSES as readonly string[]).includes(status)) filter.status = status;

  const method = sp.get("payment");
  if (method && (PAYMENT_METHODS as readonly string[]).includes(method)) filter["payment.method"] = method;

  for (const key of ["restaurant", "user", "deliveryPartner"] as const) {
    const v = sp.get(key);
    if (v && mongoose.isValidObjectId(v)) filter[key] = v;
  }

  const q = sp.get("q")?.trim();
  if (q) filter.orderNumber = new RegExp(escapeRegex(q), "i");

  const from = sp.get("from");
  const to = sp.get("to");
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from && !isNaN(Date.parse(from))) range.$gte = new Date(from);
    if (to && !isNaN(Date.parse(to))) range.$lte = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1);
    if (Object.keys(range).length) filter.createdAt = range;
  }

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("orderNumber status pricing payment createdAt items user restaurant deliveryPartner distanceKm")
      .populate("user", "name email")
      .populate("restaurant", "name")
      .populate("deliveryPartner", "name phone")
      .lean(),
    Order.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
});
