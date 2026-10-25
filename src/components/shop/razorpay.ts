"use client";

import { api } from "@/lib/client";

export type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
};

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };

let loader: Promise<void> | null = null;
function loadCheckout() {
  if (typeof window !== "undefined" && (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load the payment window. Check your internet connection and try again."));
    };
    document.body.appendChild(s);
  });
  return loader;
}

export type PayResult = { status: "paid" } | { status: "dismissed" } | { status: "failed"; message: string };

/**
 * Opens Razorpay Checkout for a GreenBite order and, on success, has the server verify the
 * payment signature. The order only counts as paid after that server check.
 */
export async function payWithRazorpay(orderId: string, options: RazorpayOptions): Promise<PayResult> {
  await loadCheckout();
  const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
  return new Promise<PayResult>((resolve) => {
    let settled = false;
    const finish = (r: PayResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new Razorpay({
      ...options,
      theme: { color: "#157a4a" },
      handler: async (response: RazorpayResponse) => {
        try {
          await api(`/api/customer/orders/${orderId}/pay/verify`, { method: "POST", body: response });
          finish({ status: "paid" });
        } catch (e) {
          finish({ status: "failed", message: (e as Error).message });
        }
      },
      modal: { ondismiss: () => finish({ status: "dismissed" }), confirm_close: true },
    });
    rzp.on("payment.failed", (r) => {
      // Razorpay lets the customer retry inside the same window, so only note the reason here.
      console.warn("Razorpay payment failed:", r.error?.description);
    });
    rzp.open();
  });
}
