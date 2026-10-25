"use client";

import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/client";
import { Button, Card, ErrorBlock, Field, Input, LoadingBlock, PageHeader, Select, Toggle, useToast } from "@/components/ui";

type Settings = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  delivery: { baseFee: number; perKmFee: number; freeDeliveryAbove: number; maxDeliveryRadiusKm: number; assignmentRadiusKm: number; autoAssign: boolean };
  taxPercent: number;
  minOrderValue: number;
  otpLength: 4 | 6;
  maxOtpAttempts: number;
  payments: { cod: boolean; upi: boolean; card: boolean; wallet: boolean; gatewayProvider: "none" | "razorpay" | "stripe" | "cashfree" };
  registration: { customersOpen: boolean; managersOpen: boolean; deliveryOpen: boolean };
  maintenanceMode: boolean;
};

const PAYMENT_LABELS = {
  cod: ["Cash on delivery", "Rider collects cash at the door. Available today."],
  upi: ["UPI", "GPay, PhonePe, Paytm and other UPI apps."],
  card: ["Credit / debit cards", "Visa, Mastercard, RuPay."],
  wallet: ["Wallets", "Paytm, Amazon Pay and other wallets."],
} as const;

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ settings: Settings; gateway: { razorpayConfigured: boolean; mode: "test" | "live" | null; webhookConfigured: boolean } }>("/api/admin/settings");
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);

  if (loading || (!s && !error)) return <LoadingBlock />;
  if (error || !s) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const setDelivery = <K extends keyof Settings["delivery"]>(k: K, v: Settings["delivery"][K]) => setS({ ...s, delivery: { ...s.delivery, [k]: v } });
  const setPayment = <K extends keyof Settings["payments"]>(k: K, v: Settings["payments"][K]) => setS({ ...s, payments: { ...s.payments, [k]: v } });
  const setReg = <K extends keyof Settings["registration"]>(k: K, v: boolean) => setS({ ...s, registration: { ...s.registration, [k]: v } });
  const onlineEnabled = s.payments.upi || s.payments.card || s.payments.wallet;

  const save = async () => {
    if (!s.payments.cod && !onlineEnabled) return toast("Enable at least one payment method", "error");
    setSaving(true);
    try {
      // The server schema strips extra fields (_id, timestamps) itself.
      const res = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", body: s });
      setS(res.settings);
      toast("Settings saved");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Platform settings" subtitle="Fees, delivery rules, payments and sign-ups. Every change is recorded in the activity log." actions={<Button loading={saving} onClick={save}>Save changes</Button>} />

      {s.maintenanceMode && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Maintenance mode is on.</strong> Customers can&apos;t place new orders.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="General">
          <div className="space-y-4">
            <Field label="Platform name"><Input value={s.platformName} onChange={(e) => setS({ ...s, platformName: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Support email"><Input type="email" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} /></Field>
              <Field label="Support phone"><Input value={s.supportPhone ?? ""} onChange={(e) => setS({ ...s, supportPhone: e.target.value })} /></Field>
            </div>
            <Toggle checked={s.maintenanceMode} onChange={(v) => setS({ ...s, maintenanceMode: v })} label="Maintenance mode" description="Pause new orders across the platform." />
          </div>
        </Card>

        <Card title="Pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tax (GST) %"><Input type="number" min={0} max={50} value={s.taxPercent} onChange={(e) => setS({ ...s, taxPercent: num(e.target.value) })} /></Field>
            <Field label="Minimum order value (₹)"><Input type="number" min={0} value={s.minOrderValue} onChange={(e) => setS({ ...s, minOrderValue: num(e.target.value) })} /></Field>
            <Field label="Base delivery fee (₹)"><Input type="number" min={0} value={s.delivery.baseFee} onChange={(e) => setDelivery("baseFee", num(e.target.value))} /></Field>
            <Field label="Fee per km (₹)"><Input type="number" min={0} value={s.delivery.perKmFee} onChange={(e) => setDelivery("perKmFee", num(e.target.value))} /></Field>
            <Field label="Free delivery above (₹)" hint="Set 0 to disable free delivery."><Input type="number" min={0} value={s.delivery.freeDeliveryAbove} onChange={(e) => setDelivery("freeDeliveryAbove", num(e.target.value))} /></Field>
          </div>
        </Card>

        <Card title="Delivery & assignment">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Max delivery radius (km)" hint="Hotels farther than this from the customer aren't shown."><Input type="number" min={1} max={50} value={s.delivery.maxDeliveryRadiusKm} onChange={(e) => setDelivery("maxDeliveryRadiusKm", num(e.target.value))} /></Field>
              <Field label="Rider search radius (km)" hint="How far from the hotel to look for available riders."><Input type="number" min={1} max={50} value={s.delivery.assignmentRadiusKm} onChange={(e) => setDelivery("assignmentRadiusKm", num(e.target.value))} /></Field>
            </div>
            <Toggle checked={s.delivery.autoAssign} onChange={(v) => setDelivery("autoAssign", v)} label="Auto-assign riders" description="ON: the nearest free rider is assigned automatically when the hotel accepts. OFF: nearby riders get an alert and the first to tap Accept takes the order." />
          </div>
        </Card>

        <Card title="Delivery OTP">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="OTP length" hint="Customer shares this with the rider at handover.">
              <Select value={s.otpLength} onChange={(e) => setS({ ...s, otpLength: Number(e.target.value) as 4 | 6 })}>
                <option value={4}>4 digits</option>
                <option value={6}>6 digits</option>
              </Select>
            </Field>
            <Field label="Max wrong attempts" hint="After this, the order is flagged for admin review."><Input type="number" min={1} max={10} value={s.maxOtpAttempts} onChange={(e) => setS({ ...s, maxOtpAttempts: num(e.target.value) })} /></Field>
          </div>
        </Card>

        <Card title="Payment methods" className="lg:col-span-2">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="divide-y divide-slate-100">
              {(Object.keys(PAYMENT_LABELS) as (keyof typeof PAYMENT_LABELS)[]).map((k) => (
                <Toggle key={k} checked={s.payments[k]} onChange={(v) => setPayment(k, v)} label={PAYMENT_LABELS[k][0]} description={PAYMENT_LABELS[k][1]} />
              ))}
            </div>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <Field label="Payment gateway" hint="Online payments go through this provider.">
                <Select value={s.payments.gatewayProvider} onChange={(e) => setPayment("gatewayProvider", e.target.value as Settings["payments"]["gatewayProvider"])}>
                  <option value="none">Not connected</option>
                  <option value="razorpay">Razorpay</option>
                                  </Select>
              </Field>
              {(() => {
                const g = data?.gateway;
                const rows: [string, boolean, string][] = [
                  ["Razorpay API keys", !!g?.razorpayConfigured, g?.razorpayConfigured ? `Detected (${g.mode === "live" ? "LIVE - real money" : "test mode"})` : "Missing - add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env.local"],
                  ["Webhook secret", !!g?.webhookConfigured, g?.webhookConfigured ? "Detected" : "Optional backup - add RAZORPAY_WEBHOOK_SECRET"],
                  ["Provider selected", s.payments.gatewayProvider === "razorpay", s.payments.gatewayProvider === "razorpay" ? "Razorpay" : "Select Razorpay above and save"],
                  ["Online method enabled", onlineEnabled, onlineEnabled ? "Yes" : "Turn on UPI, cards or wallets"],
                ];
                const live = rows.slice(0, 1).concat(rows.slice(2)).every((r) => r[1]);
                return (
                  <>
                    <ul className="mt-4 space-y-2.5">
                      {rows.map(([label, ok, text]) => (
                        <li key={label} className="flex items-start gap-2.5 text-sm">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-brand-500" : "bg-saffron-500"}`} />
                          <span><span className="font-semibold text-slate-800">{label}:</span> <span className="text-slate-600">{text}</span></span>
                        </li>
                      ))}
                    </ul>
                    <p className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset ${live ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-saffron-50 text-saffron-700 ring-saffron-200"}`}>
                      {live ? `"Pay online" is LIVE at checkout${g?.mode === "test" ? " (test mode - no real money)" : ""}.` : "Customers currently see only Cash on Delivery."}
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      Keys stay in server environment variables and are never stored in the database or sent to browsers (only the public key id is).
                      Webhook URL for Razorpay: <code className="break-all text-slate-700">{typeof window !== "undefined" ? window.location.origin : ""}/api/payments/razorpay/webhook</code> (events: payment.captured, payment.failed).
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </Card>

        <Card title="Registrations" className="lg:col-span-2">
          <div className="grid gap-x-8 divide-y divide-slate-100 md:grid-cols-3 md:divide-y-0">
            <Toggle checked={s.registration.customersOpen} onChange={(v) => setReg("customersOpen", v)} label="Customer sign-ups" description="New customers are active immediately." />
            <Toggle checked={s.registration.managersOpen} onChange={(v) => setReg("managersOpen", v)} label="Hotel manager sign-ups" description="Need admin approval." />
            <Toggle checked={s.registration.deliveryOpen} onChange={(v) => setReg("deliveryOpen", v)} label="Delivery partner sign-ups" description="Need admin approval." />
          </div>
        </Card>
      </div>
    </>
  );
}
