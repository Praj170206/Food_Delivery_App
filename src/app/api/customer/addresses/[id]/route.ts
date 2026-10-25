import { NextResponse } from "next/server";
import { route, ApiError, assertObjectId } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

type Params = { id: string };

/** PATCH = make this the default address. */
export const PATCH = route<Params>(async (_req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  const list = user.addresses ?? [];
  if (!list.some((a) => String(a._id) === id)) throw new ApiError(404, "Address not found");
  list.forEach((a) => (a.isDefault = String(a._id) === id));
  await user.save();
  return NextResponse.json({ addresses: user.addresses });
});

export const DELETE = route<Params>(async (_req, { params }) => {
  const user = await requireRole("user");
  const { id } = await params;
  assertObjectId(id);
  const list = user.addresses ?? [];
  const idx = list.findIndex((a) => String(a._id) === id);
  if (idx === -1) throw new ApiError(404, "Address not found");
  const wasDefault = list[idx].isDefault;
  list.splice(idx, 1);
  if (wasDefault && list.length) list[0].isDefault = true;
  await user.save();
  return NextResponse.json({ addresses: user.addresses });
});
