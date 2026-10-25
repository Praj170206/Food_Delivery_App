"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    setError("");
    try {
      const res = await api<{ message: string }>("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setMsg(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <p className="text-sm text-red-600">This reset link is missing its token. Request a new one.</p>;

  return (
    <>
      <h1 className="font-display text-[32px] font-semibold leading-tight text-slate-900">Choose a new password</h1>
      {msg ? (
        <>
          <p className="mt-6 rounded-lg bg-brand-50 px-3 py-3 text-sm text-brand-800">{msg}</p>
          <Link href="/login" className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">Sign in →</Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="New password" hint="8+ characters with upper & lower case letters and a number.">
            <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password"><Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={busy} className="w-full" size="lg">Update password</Button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
