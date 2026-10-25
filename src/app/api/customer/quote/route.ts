import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { quoteSchema } from "@/lib/validators";
import { buildQuote } from "@/lib/pricing";

/** Live price breakdown for the checkout page (the same calculation the order uses). */
export const POST = route(async (req) => {
  const user = await requireRole("user");
  const body = await parseBody(req, quoteSchema);

  let dest = body.coordinates as [number, number] | undefined;
  if (body.addressId) {
    const a = user.addresses?.find((x) => String(x._id) === body.addressId);
    if (!a?.location?.coordinates) throw new ApiError(404, "Address not found");
    dest = a.location.coordinates as [number, number];
  }
  if (!dest) throw new ApiError(400, "Choose a delivery address");

  return NextResponse.json({ quote: await buildQuote(body.restaurantId, body.items, dest) });
});
