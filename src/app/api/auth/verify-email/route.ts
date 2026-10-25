import { NextResponse } from "next/server";
import { route, parseBody, ApiError, clientInfo } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { verifyEmailSchema } from "@/lib/validators";
import { checkEmailOtp } from "@/lib/auth/emailOtp";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";
import { sendMail, mailTemplates } from "@/lib/mail";
import { ROLE_HOME } from "@/lib/constants";

const ERRORS = {
  invalid: "That code is incorrect. Please try again.",
  expired: "This code has expired. Request a new one.",
  locked: "Too many wrong attempts. Request a new code.",
} as const;

export const POST = route(async (req) => {
  const { ip } = clientInfo(req);
  if (!rateLimit(`verify:${ip}`, 30, 15 * 60 * 1000).ok) throw new ApiError(429, "Too many attempts. Try again later.");

  const { email, otp } = await parseBody(req, verifyEmailSchema);
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(400, ERRORS.expired);
  if (user.emailVerified !== false) throw new ApiError(400, "This email is already verified. Please sign in.");

  const result = await checkEmailOtp(user._id, otp);
  if (result !== "ok") throw new ApiError(400, ERRORS[result]);

  await logActivity({
    actor: user,
    action: "auth.email_verified",
    message: `${user.name} verified their email address`,
    entityType: "auth",
    entityId: user._id,
    req,
  });

  const needsApproval = user.status === "pending";
  void sendMail({ to: user.email, ...mailTemplates.welcome(user.name, needsApproval) });

  if (user.status !== "active") {
    return NextResponse.json({
      pendingApproval: true,
      message: "Email verified! An admin will review your application - we'll email you as soon as it's approved.",
    });
  }
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  await user.save();
  await setSessionCookie(user);
  return NextResponse.json({ redirectTo: ROLE_HOME[user.role] });
});
