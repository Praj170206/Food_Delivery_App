import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { clearSessionCookie, getSessionUser, requestPortal } from "@/lib/auth/session";
import { logActivity } from "@/lib/audit";

/** Signs out of the calling portal only; sessions in other portals stay active. */
export const POST = route(async (req) => {
  const portal = await requestPortal();
  const user = await getSessionUser(portal).catch(() => null);
  await clearSessionCookie(portal);
  if (user) {
    await logActivity({
      actor: user,
      action: "auth.logout",
      message: `${user.name} signed out`,
      entityType: "auth",
      entityId: user._id,
      req,
    });
  }
  return NextResponse.json({ ok: true });
});
