"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

export function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setMsg({ ok: false, text: "New passwords don't match" });
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      setMsg({ ok: true, text: res.message });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password">
        <Input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      </Field>
      <Field label="New password" hint="8+ characters with upper & lower case letters and a number.">
        <Input type="password" required autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      </Field>
      {msg && <p className={msg.ok ? "text-sm text-brand-700" : "text-sm text-red-600"}>{msg.text}</p>}
      <Button type="submit" loading={busy}>Update password</Button>
    </form>
  );
}
