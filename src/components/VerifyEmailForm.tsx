"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

const COOLDOWN = 60;

/** Second step of sign-up / sign-in: enter the 6-digit code emailed to the user. */
export function VerifyEmailForm({ email, onBack, loginHref = "/login" }: { email: string; onBack?: () => void; loginHref?: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(COOLDOWN);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ redirectTo?: string; pendingApproval?: boolean; message?: string }>("/api/auth/verify-email", { method: "POST", body: { email, otp } });
      if (res.pendingApproval) setPending(res.message ?? "Email verified.");
      else {
        router.replace(res.redirectTo ?? "/");
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    try {
      await api("/api/auth/resend-otp", { method: "POST", body: { email } });
      setInfo("A new code is on its way.");
      setWait(COOLDOWN);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (pending) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200"><MailCheck className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-[28px] font-semibold text-slate-900">Email verified</h1>
        <p className="mt-2 text-sm text-slate-600">{pending}</p>
        <Link href={loginHref} className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-[32px] font-semibold leading-tight text-slate-900">Check your email</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
        We sent a 6-digit code to <strong className="text-slate-700">{email}</strong>. It expires in 10 minutes.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Verification code">
          <Input
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl font-semibold tracking-[0.5em]"
            placeholder="••••••"
          />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {info && !error && <p className="text-sm text-brand-700">{info}</p>}
        <Button type="submit" loading={busy} disabled={otp.length !== 6} className="w-full" size="lg">Verify email</Button>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        {onBack ? <button onClick={onBack} className="text-slate-500 hover:text-slate-800">← Back</button> : <span />}
        <button onClick={resend} disabled={wait > 0} className="font-medium text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline">
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </div>
    </>
  );
}
