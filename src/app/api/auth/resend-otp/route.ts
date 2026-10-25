import { NextResponse } from "next/server";
import { route, parseBody, ApiError, clientInfo } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { resendOtpSchema } from "@/lib/validators";
import { canResendOtp, issueEmailOtp } from "@/lib/auth/emailOtp";
import { rateLimit } from "@/lib/rateLimit";

export const POST = route(async (req) => {
  const { ip } = clientInfo(req);
  if (!rateLimit(`resend:${ip}`, 6, 60 * 60 * 1000).ok) throw new ApiError(429, "Too many codes requested. Try again later.");

  const { email } = await parseBody(req, resendOtpSchema);
  await connectDB();
  const user = await User.findOne({ email });
  if (user && user.emailVerified === false) {
    if (!(await canResendOtp(user._id))) throw new ApiError(429, "Please wait a minute before requesting another code.");
    await issueEmailOtp(user);
  }
  // Same answer either way so this can't be used to probe which emails are registered.
  return NextResponse.json({ message: "If this email needs verification, a new code has been sent." });
});
