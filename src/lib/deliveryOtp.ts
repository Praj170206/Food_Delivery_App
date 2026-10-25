// Delivery-handover OTP. No "server-only" import so seed scripts can use it too.
import crypto from "crypto";

function key(purpose: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return crypto.createHash("sha256").update(`${secret}:${purpose}`).digest();
}

export function generateOtp(length: 4 | 6 = 4) {
  return String(crypto.randomInt(0, 10 ** length)).padStart(length, "0");
}

/** HMAC bound to the order id, so a hash can't be replayed onto another order. */
export function hashOtp(orderId: unknown, otp: string) {
  return crypto.createHmac("sha256", key("delivery-otp-hash")).update(`${String(orderId)}:${otp}`).digest("hex");
}

export function otpMatches(orderId: unknown, otp: string, storedHash: string) {
  const a = Buffer.from(hashOtp(orderId, otp), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** AES-256-GCM so the customer (and only the customer) can see their OTP again later. */
export function encryptOtp(otp: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key("delivery-otp-enc"), iv);
  const enc = Buffer.concat([cipher.update(otp, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptOtp(payload: string | undefined | null) {
  if (!payload) return null;
  try {
    const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key("delivery-otp-enc"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
