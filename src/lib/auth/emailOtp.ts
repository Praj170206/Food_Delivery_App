import "server-only";
import crypto from "crypto";
import { User, type UserDoc } from "@/models/User";
import { sendMail, mailTemplates } from "@/lib/mail";

const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

const hash = (userId: unknown, otp: string) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET!).update(`${String(userId)}:${otp}`).digest("hex");

/** Generates a fresh 6-digit code, stores only its hash, and emails it. */
export async function issueEmailOtp(user: Pick<UserDoc, "_id" | "name" | "email">) {
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await User.updateOne(
    { _id: user._id },
    { emailOtpHash: hash(user._id, otp), emailOtpExpires: new Date(Date.now() + OTP_TTL_MS), emailOtpAttempts: 0, emailOtpSentAt: new Date() }
  );
  const res = await sendMail({ to: user.email, ...mailTemplates.emailOtp(user.name, otp) });
  if (!res.delivered && process.env.NODE_ENV === "production") {
    console.error(`[otp] verification email to ${user.email} was not delivered - check SMTP settings`);
  }
}

export type OtpCheck = "ok" | "expired" | "invalid" | "locked";

export async function checkEmailOtp(userId: unknown, otp: string): Promise<OtpCheck> {
  const user = await User.findById(userId).select("+emailOtpHash +emailOtpExpires +emailOtpAttempts");
  if (!user?.emailOtpHash || !user.emailOtpExpires) return "expired";
  if ((user.emailOtpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) return "locked";
  if (user.emailOtpExpires < new Date()) return "expired";

  const a = Buffer.from(hash(userId, otp), "hex");
  const b = Buffer.from(user.emailOtpHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await User.updateOne({ _id: userId }, { $inc: { emailOtpAttempts: 1 } });
    return (user.emailOtpAttempts ?? 0) + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "invalid";
  }
  await User.updateOne(
    { _id: userId },
    { $set: { emailVerified: true }, $unset: { emailOtpHash: 1, emailOtpExpires: 1, emailOtpAttempts: 1, emailOtpSentAt: 1 } }
  );
  return "ok";
}

/** True if a new code may be sent now (prevents email flooding). */
export async function canResendOtp(userId: unknown) {
  const u = await User.findById(userId).select("+emailOtpSentAt").lean();
  return !u?.emailOtpSentAt || Date.now() - new Date(u.emailOtpSentAt).getTime() > OTP_RESEND_COOLDOWN_MS;
}
