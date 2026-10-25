import { NextResponse } from "next/server";
import crypto from "crypto";
import { route, parseBody, ApiError, clientInfo } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { forgotPasswordSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rateLimit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { logActivity } from "@/lib/audit";

export const POST = route(async (req) => {
  const { ip } = clientInfo(req);
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000).ok) throw new ApiError(429, "Too many requests. Try again later.");

  const { email } = await parseBody(req, forgotPasswordSchema);
  await connectDB();
  const user = await User.findOne({ email });

  // Same response whether or not the account exists, to avoid leaking which emails are registered.
  const response = NextResponse.json({ message: "If an account exists for this email, a reset link has been sent." });
  if (!user) return response;

  const token = crypto.randomBytes(32).toString("base64url");
  await User.updateOne(
    { _id: user._id },
    {
      passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
    }
  );

  const base = process.env.APP_URL || req.nextUrl.origin;
  await sendMail({ to: user.email, ...mailTemplates.passwordReset(user.name, `${base}/reset-password?token=${token}`) });
  await logActivity({
    actor: user,
    action: "auth.password_reset_requested",
    message: `${user.name} requested a password reset`,
    entityType: "auth",
    entityId: user._id,
    req,
  });
  return response;
});
