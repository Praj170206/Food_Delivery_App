import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { activityStream } from "@/lib/realtime";
import { publicActivity } from "@/lib/activityView";
import { isRole } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live events for customers, hotel managers and delivery partners: only entries
 * addressed to them (`notify` contains their id), with admin-only fields stripped.
 */
export async function GET(req: NextRequest) {
  // EventSource can't send headers, so the portal comes as ?portal=; only that portal's cookie is used.
  const p = req.nextUrl.searchParams.get("portal");
  const user = await getSessionUser(isRole(p) && p !== "admin" ? p : "user");
  if (!user) return new Response("Unauthorized", { status: 401 });
  return activityStream(req, user, { notify: user._id }, publicActivity);
}
