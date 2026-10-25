import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { addressSchema } from "@/lib/validators";

const MAX_ADDRESSES = 10;

export const GET = route(async () => {
  const user = await requireRole("user");
  return NextResponse.json({ addresses: user.addresses ?? [] });
});

export const POST = route(async (req) => {
  const user = await requireRole("user");
  const body = await parseBody(req, addressSchema);
  // `addresses` is undefined until the first one is saved.
  if (!user.addresses) user.set("addresses", []);
  const list = user.addresses!;
  if (list.length >= MAX_ADDRESSES) throw new ApiError(400, `You can save up to ${MAX_ADDRESSES} addresses`);

  const makeDefault = body.isDefault || list.length === 0;
  if (makeDefault) list.forEach((a) => (a.isDefault = false));
  list.push({
    label: body.label,
    line1: body.line1,
    city: body.city,
    pincode: body.pincode,
    location: { type: "Point" as const, coordinates: body.coordinates },
    isDefault: makeDefault,
  });
  await user.save();
  return NextResponse.json({ addresses: list, address: list[list.length - 1] }, { status: 201 });
});
