import { NextResponse } from "next/server";
import crypto from "crypto";
import { route, parseBody, ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { resetPasswordSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/audit";

export const POST = route(async (req) => {
  const { token, password } = await parseBody(req, resetPasswordSchema);
  await connectDB();

  const user = await User.findOne({
    passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, "This reset link is invalid or has expired");

  await User.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash: await hashPassword(password), failedLoginAttempts: 0 },
      $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1, lockUntil: 1 },
      $inc: { tokenVersion: 1 }, // sign out every existing session
    }
  );
  await logActivity({
    actor: user,
    action: "auth.password_reset",
    message: `${user.name} reset their password`,
    entityType: "auth",
    entityId: user._id,
    notify: [user._id],
    severity: "warning",
    req,
  });
  return NextResponse.json({ message: "Password updated. You can now sign in." });
});
