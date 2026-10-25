import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { User, type UserDoc } from "@/models/User";
import { verifyToken, signToken } from "./jwt";
import { ApiError } from "@/lib/api";
import { PORTAL_HEADER, ROLE_HOME, ROLE_LOGIN, SESSION_COOKIES, isRole, type Role } from "@/lib/constants";

const MAX_AGE = 60 * 60 * 24 * 7;

/** Signs the user in to their own portal only; other portals' sessions are untouched. */
export async function setSessionCookie(user: UserDoc) {
  const token = await signToken({
    sub: String(user._id),
    role: user.role,
    tv: user.tokenVersion,
    name: user.name,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIES[user.role], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(role: Role) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIES[role]);
}

/** Which portal a shared endpoint (me, logout, stream, change-password) is being called from. */
export async function requestPortal(): Promise<Role> {
  const h = await headers();
  const p = h.get(PORTAL_HEADER);
  return isRole(p) ? p : "user";
}

/**
 * Resolves the signed-in user of one portal from that portal's cookie AND the database, so
 * suspended accounts and "sign out everywhere" (tokenVersion bump) take effect immediately.
 * Without a role, the portal comes from the request header.
 */
export async function getSessionUser(role?: Role): Promise<UserDoc | null> {
  const portal = role ?? (await requestPortal());
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIES[portal])?.value;
  if (!token) return null;
  const payload = await verifyToken(token, portal);
  if (!payload) return null;

  await connectDB();
  const user = await User.findById(payload.sub);
  if (!user) return null;
  if (user.status !== "active") return null;
  if (user.tokenVersion !== payload.tv) return null;
  if (user.role !== portal) return null;
  return user;
}

/**
 * For API routes: throws 401/403 ApiErrors. With roles, only those portals' cookies are read
 * (an admin API never looks at the customer cookie); with none, the calling portal's is used.
 */
export async function requireRole(...roles: Role[]) {
  let user: UserDoc | null = null;
  if (roles.length) {
    for (const r of roles) if ((user = await getSessionUser(r))) break;
  } else {
    user = await getSessionUser();
  }
  if (!user) throw new ApiError(401, "Please sign in to continue");
  return user;
}

/** For server components / layouts: redirects instead of throwing. */
export async function requirePageRole(role: Role) {
  const user = await getSessionUser(role);
  // The JWT may still be valid while the account was suspended or signed out everywhere;
  // this route clears that portal's stale cookie so the proxy doesn't bounce us back here.
  if (!user) redirect(`/api/auth/session-expired?to=${encodeURIComponent(ROLE_LOGIN[role])}`);
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
