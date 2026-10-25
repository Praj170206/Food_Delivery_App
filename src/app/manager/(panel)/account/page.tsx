"use client";

import { useApi } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Card, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

type Me = { user: { name: string; email: string; phone?: string; createdAt: string; lastLoginAt?: string; lastLoginIp?: string } };

export default function ManagerAccountPage() {
  const { data, error, loading, reload } = useApi<Me>("/api/auth/me");
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  const u = data.user;
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium">{u.name}</dd></div>
            <div><dt className="text-xs text-slate-500">Email</dt><dd>{u.email}</dd></div>
            <div><dt className="text-xs text-slate-500">Phone</dt><dd>{u.phone || "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">Partner since</dt><dd>{formatDateTime(u.createdAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Current sign-in</dt><dd>{formatDateTime(u.lastLoginAt)} {u.lastLoginIp && `from ${u.lastLoginIp}`}</dd></div>
          </dl>
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
          <p className="mt-3 text-xs text-slate-500">Changing your password signs you out on every other device.</p>
        </Card>
      </div>
    </>
  );
}
