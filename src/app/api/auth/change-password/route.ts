import { NextResponse } from "next/server";
import { route, parseBody, ApiError } from "@/lib/api";
import { User } from "@/models/User";
import { changePasswordSchema } from "@/lib/validators";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireRole, setSessionCookie } from "@/lib/auth/session";
import { logActivity } from "@/lib/audit";

export const POST = route(async (req) => {
  const session = await requireRole();
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);

  const user = await User.findById(session._id).select("+passwordHash");
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is incorrect");
  }
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1; // other devices are signed out
  await user.save();
  await setSessionCookie(user); // keep this device signed in

  await logActivity({
    actor: user,
    action: "auth.password_changed",
    message: `${user.name} changed their password`,
    entityType: "auth",
    entityId: user._id,
    notify: [user._id],
    req,
  });
  return NextResponse.json({ message: "Password changed. Other devices have been signed out." });
});
