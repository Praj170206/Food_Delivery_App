import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { activityStream } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Admins receive every activity event on the platform. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser("admin");
  if (!user) return new Response("Unauthorized", { status: 401 });
  return activityStream(req, user, {});
}
