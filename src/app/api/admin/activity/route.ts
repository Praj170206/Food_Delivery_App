import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { route, pagination, escapeRegex } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { ActivityLog, SEVERITIES } from "@/models/ActivityLog";

export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(req, 50);

  const filter: Record<string, unknown> = {};
  const role = sp.get("role");
  const severity = sp.get("severity");
  const entityType = sp.get("entityType");
  const action = sp.get("action");
  const actor = sp.get("actor");
  const entityId = sp.get("entityId");
  const q = sp.get("q")?.trim();
  if (role) filter.actorRole = role;
  if (severity && (SEVERITIES as readonly string[]).includes(severity)) filter.severity = severity;
  if (entityType) filter.entityType = entityType;
  if (action) filter.action = new RegExp(`^${escapeRegex(action)}`);
  if (actor && mongoose.isValidObjectId(actor)) filter.actor = actor;
  if (entityId && mongoose.isValidObjectId(entityId)) filter.entityId = entityId;
  if (q) filter.message = new RegExp(escapeRegex(q), "i");

  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
});
