"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: { email } });
      setMsg(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-[32px] font-semibold leading-tight text-slate-900">Reset your password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">We&apos;ll email you a link to choose a new password.</p>
      {msg ? (
        <p className="mt-6 rounded-lg bg-brand-50 px-3 py-3 text-sm text-brand-800">{msg}</p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={busy} className="w-full" size="lg">Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="mt-5 inline-block text-sm text-slate-500 hover:text-slate-800">← Back to sign in</Link>
    </>
  );
}
