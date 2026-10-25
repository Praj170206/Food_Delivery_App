import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";

export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not signed in");
  return NextResponse.json({ user: user.toJSON() });
});
