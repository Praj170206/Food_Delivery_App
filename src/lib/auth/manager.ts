import "server-only";
import { requireRole } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import { Restaurant } from "@/models/Restaurant";

/**
 * Every manager API goes through this: the caller must be an active hotel manager,
 * and everything they touch is scoped to the one hotel linked to their account.
 */
export async function requireManager(opts: { approved?: boolean } = {}) {
  const user = await requireRole("manager");
  if (!user.restaurant) throw new ApiError(403, "No hotel is linked to your account. Please contact support.");
  const restaurant = await Restaurant.findOne({ _id: user.restaurant, manager: user._id });
  if (!restaurant) throw new ApiError(403, "No hotel is linked to your account. Please contact support.");
  if (opts.approved && restaurant.status !== "approved") {
    throw new ApiError(403, `Your hotel is ${restaurant.status}. This action is available once an admin approves it.`);
  }
  return { user, restaurant };
}
