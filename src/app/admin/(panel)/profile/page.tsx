"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Card, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

type Me = { user: { _id: string; name: string; email: string; phone?: string; createdAt: string; lastLoginAt?: string; lastLoginIp?: string } };

export default function ProfilePage() {
  const { data, error, loading, reload } = useApi<Me>("/api/auth/me");
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  const u = data.user;
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium">{u.name}</dd></div>
            <div><dt className="text-xs text-slate-500">Email</dt><dd>{u.email}</dd></div>
            <div><dt className="text-xs text-slate-500">Phone</dt><dd>{u.phone || "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">Admin since</dt><dd>{formatDateTime(u.createdAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Current sign-in</dt><dd>{formatDateTime(u.lastLoginAt)} {u.lastLoginIp && `from ${u.lastLoginIp}`}</dd></div>
          </dl>
          <Link href={`/admin/activity?actor=${u._id}`} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">View my activity →</Link>
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
          <p className="mt-3 text-xs text-slate-500">Changing your password signs you out on every other device.</p>
        </Card>
      </div>
    </>
  );
}
