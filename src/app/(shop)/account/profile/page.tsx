"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/client";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Card, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { useLive, type LiveActivity } from "@/components/live/LiveProvider";

type Me = { user: { name: string; email: string; phone?: string; createdAt: string; lastLoginAt?: string } };

export default function CustomerProfilePage() {
  const { data, error, loading, reload } = useApi<Me>("/api/auth/me");
  const { data: history } = useApi<{ items: LiveActivity[] }>("/api/me/activity?limit=15");
  const { recent } = useLive();
  const feed = useMemo(() => {
    const seen = new Set<string>();
    return [...recent, ...(history?.items ?? [])].filter((a) => (seen.has(a._id) ? false : (seen.add(a._id), true))).slice(0, 15);
  }, [recent, history]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  const u = data.user;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="Your details">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium">{u.name}</dd></div>
            <div><dt className="text-xs text-slate-500">Email</dt><dd>{u.email}</dd></div>
            <div><dt className="text-xs text-slate-500">Phone</dt><dd>{u.phone || "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">Member since</dt><dd>{formatDateTime(u.createdAt)}</dd></div>
          </dl>
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
          <p className="mt-3 text-xs text-slate-500">Changing your password signs you out on every other device.</p>
        </Card>
      </div>
      <Card title="Notifications & account activity" bodyClassName="px-4 py-1">
        {feed.length === 0 ? <EmptyState title="Nothing yet" /> : (
          <ul className="divide-y divide-slate-100">
            {feed.map((a) => (
              <li key={a._id} className="py-2.5">
                <p className="text-sm text-slate-800">{a.message}</p>
                <p className="text-xs text-slate-500">{timeAgo(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
