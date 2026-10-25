import { NextResponse } from "next/server";
import { route, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { acceptOrder } from "@/lib/assignment";

type Params = { id: string };

/** Rider accepts a nearby order. First rider to accept gets it. */
export const POST = route<Params>(async (req, { params }) => {
  const rider = await requireRole("delivery");
  const { id } = await params;
  assertObjectId(id);
  const res = await acceptOrder(rider._id, id, req);
  if (!res.ok) throw new ApiError(409, res.error);
  return NextResponse.json({ ok: true, orderNumber: res.order.orderNumber });
});
