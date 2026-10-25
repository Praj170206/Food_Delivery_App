import { NextResponse } from "next/server";
import { route, pagination } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { ActivityLog } from "@/models/ActivityLog";
import { publicActivity } from "@/lib/activityView";

/** The signed-in user's own notification history (same events their live stream receives). */
export const GET = route(async (req) => {
  const user = await requireRole();
  const { page, limit, skip } = pagination(req, 30);
  const filter = { notify: user._id };
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return NextResponse.json({ items: items.map(publicActivity), total, page, pages: Math.ceil(total / limit) });
});
