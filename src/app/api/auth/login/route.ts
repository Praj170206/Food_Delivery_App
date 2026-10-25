import { NextResponse } from "next/server";
import { route, parseBody, ApiError, clientInfo } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { loginSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { canResendOtp, issueEmailOtp } from "@/lib/auth/emailOtp";
import { isLimited, recordFailure } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";
import { ROLE_HOME, ROLE_LABELS, ROLE_LOGIN } from "@/lib/constants";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const WINDOW_MS = 15 * 60 * 1000;
// Only FAILED sign-ins count, so normal users (and shared office/college networks) aren't blocked.
const IP_FAILURES = 20;
const ADMIN_IP_FAILURES = 8;

const STATUS_MESSAGES: Record<string, string> = {
  pending: "Your account is awaiting admin approval. We'll email you once it's approved.",
  suspended: "Your account has been suspended. Please contact support.",
  rejected: "Your registration was not approved. Please contact support.",
};

export const POST = route(async (req) => {
  const { ip } = clientInfo(req);
  const { email, password, portal } = await parseBody(req, loginSchema);

  // The admin portal gets a much tighter budget of failed attempts.
  const ipKey = portal === "admin" ? `login-fail-admin:${ip}` : `login-fail:${ip}`;
  const blocked = isLimited(ipKey, portal === "admin" ? ADMIN_IP_FAILURES : IP_FAILURES);
  if (blocked.limited) throw new ApiError(429, `Too many failed attempts. Try again in ${blocked.retryAfter}s`);
  const fail = () => {
    recordFailure(ipKey, WINDOW_MS);
    return new ApiError(401, "Invalid email or password");
  };

  await connectDB();
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) throw fail();

  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(423, `Account temporarily locked after too many failed attempts. Try again in ${mins} min.`);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
      await logActivity({
        actor: user,
        action: "auth.locked",
        message: `${user.name}'s account was locked after ${MAX_FAILED} failed sign-in attempts`,
        entityType: "auth",
        entityId: user._id,
        severity: "warning",
        req,
      });
    }
    await user.save();
    throw fail();
  }

  // Each role may only sign in through its own portal. Checked after the password so it can't be
  // used to discover which emails exist, and admin accounts are never revealed.
  if (user.role !== portal) {
    if (portal === "admin" || user.role === "admin") {
      await logActivity({
        actor: user,
        action: "auth.wrong_portal",
        message: `${user.name} (${ROLE_LABELS[user.role]}) tried to sign in through the ${ROLE_LABELS[portal]} portal`,
        entityType: "auth",
        entityId: user._id,
        severity: "warning",
        meta: { portal },
        req,
      });
      throw fail();
    }
    throw new ApiError(403, `This is a ${ROLE_LABELS[user.role]} account. Please sign in from the ${ROLE_LABELS[user.role]} portal.`, {
      code: "WRONG_PORTAL",
      loginPath: ROLE_LOGIN[user.role],
    });
  }

  // Right password but email never confirmed: send a fresh code and ask the client to show the OTP step.
  if (user.emailVerified === false) {
    if (await canResendOtp(user._id)) await issueEmailOtp(user);
    throw new ApiError(403, "Please verify your email. We've sent a 6-digit code to your inbox.", { code: "EMAIL_NOT_VERIFIED", email: user.email });
  }

  if (user.status !== "active") throw new ApiError(403, STATUS_MESSAGES[user.status] ?? "Account inactive");

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  await user.save();

  await setSessionCookie(user);
  await logActivity({
    actor: user,
    action: "auth.login",
    message: `${user.name} signed in`,
    entityType: "auth",
    entityId: user._id,
    notify: [user._id], // the user's other open sessions see a "new sign-in" alert
    req,
  });

  return NextResponse.json({ user: { id: user._id, name: user.name, role: user.role }, redirectTo: ROLE_HOME[user.role] });
});
