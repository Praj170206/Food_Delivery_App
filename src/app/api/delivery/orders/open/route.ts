import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { openOrdersFor } from "@/lib/assignment";

/** Unassigned orders near the rider, nearest first (only while online). */
export const GET = route(async () => {
  const rider = await requireRole("delivery");
  if (!rider.delivery?.isOnline) return NextResponse.json({ online: false, radiusKm: 0, within: [], beyond: [] });
  return NextResponse.json({ online: true, ...(await openOrdersFor(rider._id)) });
});
