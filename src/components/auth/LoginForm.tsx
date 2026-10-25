"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, Lock } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { VerifyEmailForm } from "@/components/VerifyEmailForm";
import { ROLE_LOGIN, isPathAllowedForRole, type Role } from "@/lib/constants";

const COPY: Record<Role, { title: string; subtitle: string; register?: string; registerLabel?: string }> = {
  user: { title: "Welcome back", subtitle: "Sign in to order from pure-veg kitchens near you.", register: "/register", registerLabel: "Create account" },
  manager: { title: "Hotel partner sign in", subtitle: "Manage your menu, accept orders and track riders.", register: "/manager/register", registerLabel: "Register your hotel" },
  delivery: { title: "Delivery partner sign in", subtitle: "Go online, pick up orders and deliver with OTP.", register: "/delivery/register", registerLabel: "Become a rider" },
  admin: { title: "Admin console", subtitle: "Authorised GreenBite staff only. Every sign-in is recorded." },
};

function Form({ portal }: { portal: Role }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [wrongPortal, setWrongPortal] = useState<{ message: string; path: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const copy = COPY[portal];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setWrongPortal(null);
    try {
      const res = await api<{ redirectTo: string; user: { role: Role } }>("/api/auth/login", { method: "POST", body: { email, password, portal } });
      // Only follow `next` if it's a same-site path this role is allowed into.
      const next = sp.get("next");
      const target = next && isPathAllowedForRole(next, res.user.role) ? next : res.redirectTo;
      router.replace(target);
      router.refresh();
    } catch (err) {
      const details = err instanceof ClientApiError ? (err.details as { code?: string; email?: string; loginPath?: string } | undefined) : undefined;
      if (details?.code === "EMAIL_NOT_VERIFIED") setVerifyEmail(details.email ?? email);
      else if (details?.code === "WRONG_PORTAL" && details.loginPath) setWrongPortal({ message: (err as Error).message, path: details.loginPath });
      else setError((err as Error).message);
      setBusy(false);
    }
  };

  if (verifyEmail) return <VerifyEmailForm email={verifyEmail} loginHref={ROLE_LOGIN[portal]} onBack={() => setVerifyEmail(null)} />;

  return (
    <>
      {portal === "admin" && (
        <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md"><Lock className="h-5 w-5" /></span>
      )}
      <h1 className="font-display text-[32px] font-semibold leading-tight text-slate-900">{copy.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{copy.subtitle}</p>
      {sp.get("expired") && <p className="mt-5 rounded-xl bg-saffron-50 px-3.5 py-2.5 text-sm text-saffron-700 ring-1 ring-inset ring-saffron-200">Your session ended. Please sign in again.</p>}

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label={portal === "admin" ? "Work email" : "Email"}><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
        {wrongPortal && (
          <div className="flex items-start gap-3 rounded-xl bg-sky-50 px-3.5 py-3 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {wrongPortal.message}
              <Link href={wrongPortal.path} className="mt-1.5 flex items-center gap-1 font-semibold text-sky-800 hover:underline">Go to that portal <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        )}
        <Button type="submit" loading={busy} className="w-full" size="lg" variant={portal === "admin" ? "dark" : "primary"}>Sign in</Button>
      </form>

      <div className="mt-5 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-500 hover:text-slate-800">Forgot password?</Link>
        {copy.register && <Link href={copy.register} className="font-semibold text-brand-700 hover:underline">{copy.registerLabel}</Link>}
      </div>

    </>
  );
}

/** Sign-in form for one portal. The server only accepts accounts of that portal's role. */
export function LoginForm({ portal }: { portal: Role }) {
  return (
    <Suspense>
      <Form portal={portal} />
    </Suspense>
  );
}
