import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { AUTH_PAGES, PROTECTED_AREAS, ROLE_HOME, SESSION_COOKIES, loginPathFor, portalOfAuthPage } from "@/lib/constants";

// First line of defence: a fast JWT check per path prefix, using only the cookie of the portal
// that owns the path. Every page layout and API route re-checks against the database as well.

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (AUTH_PAGES.includes(pathname)) {
    // Already signed in to this portal -> straight to its home. Other portals' sessions are irrelevant.
    const portal = portalOfAuthPage(pathname);
    if (portal) {
      const token = req.cookies.get(SESSION_COOKIES[portal])?.value;
      if (token && (await verifyToken(token, portal))) return NextResponse.redirect(new URL(ROLE_HOME[portal], req.url));
    }
    return NextResponse.next();
  }

  const rule = PROTECTED_AREAS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (!rule) return NextResponse.next();

  // Each protected area belongs to exactly one role, so only that role's cookie counts.
  const role = rule.roles[0];
  const cookie = SESSION_COOKIES[role];
  const token = req.cookies.get(cookie)?.value;
  if (token && (await verifyToken(token, role))) return NextResponse.next();

  const url = new URL(loginPathFor(pathname), req.url);
  url.searchParams.set("next", pathname + req.nextUrl.search);
  const res = NextResponse.redirect(url);
  if (token) res.cookies.delete(cookie);
  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/manager/:path*",
    "/delivery/:path*",
    "/account/:path*",
    "/checkout/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
