import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PAGES, SESSION_COOKIES, portalOfAuthPage } from "@/lib/constants";

export async function GET(req: NextRequest) {
  // Back to the portal the user was in (only known login pages are accepted, so this can't be an open redirect).
  const to = req.nextUrl.searchParams.get("to");
  const login = to && AUTH_PAGES.includes(to) ? to : "/login";
  const res = NextResponse.redirect(new URL(`${login}?expired=1`, req.url));
  // Only that portal's session ends; the others stay signed in.
  res.cookies.delete(SESSION_COOKIES[portalOfAuthPage(login) ?? "user"]);
  return res;
}
