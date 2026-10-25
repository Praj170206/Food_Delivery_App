import "server-only";
import crypto from "crypto";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** "test" for rzp_test_ keys, "live" for rzp_live_ keys. */
export function razorpayMode() {
  return process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "live" : "test";
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { description?: string } }).error?.description ?? `Razorpay error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string };
export type RazorpayPayment = { id: string; order_id: string; amount: number; status: string; method?: string; captured?: boolean };

/** Amounts are in rupees here and converted to paise for Razorpay. */
export function createRazorpayOrder(amountRupees: number, receipt: string, notes: Record<string, string>) {
  return call<RazorpayOrder>("POST", "/orders", { amount: Math.round(amountRupees * 100), currency: "INR", receipt, notes });
}

export function fetchRazorpayPayment(paymentId: string) {
  return call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function refundRazorpayPayment(paymentId: string, amountRupees: number, notes: Record<string, string>) {
  return call<{ id: string; status: string }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: Math.round(amountRupees * 100),
    notes,
  });
}

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Checkout success: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhooks: signature = HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
