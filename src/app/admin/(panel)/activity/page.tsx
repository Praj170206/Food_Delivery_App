"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { qs, useApi, useDebounced } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Pagination, Select, Table, Toggle, cx } from "@/components/ui";
import { useLive } from "@/components/live/LiveProvider";
import { entityHref, roleLabel, type ActivityItem } from "@/components/admin/ActivityFeed";

type ListRes = { items: ActivityItem[]; total: number; page: number; pages: number };

const ENTITY_TYPES = ["auth", "user", "restaurant", "menuItem", "order", "settings"];
const ROLE_OPTIONS = ["admin", "user", "manager", "delivery", "system"];

function ActivityInner() {
  const sp = useSearchParams();
  const actor = sp.get("actor") ?? undefined;
  const entityId = sp.get("entityId") ?? undefined;
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [severity, setSeverity] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [follow, setFollow] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const dq = useDebounced(q);
  const { subscribe } = useLive();

  const { data, error, loading, reload, setData } = useApi<ListRes>(
    `/api/admin/activity${qs({ q: dq, role, severity, entityType, page, actor, entityId })}`
  );

  // Prepend matching live events on page 1 instead of refetching the whole list.
  useEffect(() => {
    if (!follow || page !== 1) return;
    return subscribe((e) => {
      const a = e as ActivityItem;
      if (role && a.actorRole !== role) return;
      if (severity && a.severity !== severity) return;
      if (entityType && a.entityType !== entityType) return;
      if (dq && !a.message.toLowerCase().includes(dq.toLowerCase())) return;
      if (actor || entityId) return reload();
      setData((d) => (d ? { ...d, total: d.total + 1, items: [a, ...d.items.filter((x) => x._id !== a._id)].slice(0, 50) } : d));
      setFresh((f) => new Set(f).add(a._id));
    });
  }, [follow, page, role, severity, entityType, dq, actor, entityId, subscribe, setData, reload]);

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Activity log" subtitle="Audit trail of who did what, when and from where - across every role." />
      <Card bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Input className="max-w-xs" placeholder="Search messages…" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
          <Select className="max-w-[10rem]" value={role} onChange={(e) => resetPage(setRole)(e.target.value)}>
            <option value="">Any role</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Select>
          <Select className="max-w-[10rem]" value={entityType} onChange={(e) => resetPage(setEntityType)(e.target.value)}>
            <option value="">Any area</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select className="max-w-[10rem]" value={severity} onChange={(e) => resetPage(setSeverity)(e.target.value)}>
            <option value="">Any severity</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
          <div className="ml-auto w-44"><Toggle checked={follow} onChange={setFollow} label="Follow live" /></div>
          {(actor || entityId) && <Link href="/admin/activity" className="text-xs font-medium text-brand-700 hover:underline">Clear user filter</Link>}
        </div>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No activity matches these filters" />
        ) : (
          <>
            <Table head={["When", "Who", "What happened", "Action", "Severity", "IP"]}>
              {data.items.map((a) => {
                const href = entityHref(a);
                return (
                  <tr key={a._id} className={cx(fresh.has(a._id) && "animate-flash")}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDateTime(a.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="font-medium">{a.actorName}</span>
                      <span className="block text-xs text-slate-500">{roleLabel(a.actorRole)}</span>
                    </td>
                    <td className="min-w-[18rem] px-3 py-2.5">
                      {href ? <Link href={href} className="hover:text-brand-700 hover:underline">{a.message}</Link> : a.message}
                      {Array.isArray(a.meta?.changed) && (
                        <details className="mt-1 text-xs text-slate-500">
                          <summary className="cursor-pointer">Changes</summary>
                          <ul className="mt-1 list-disc pl-4">{(a.meta!.changed as string[]).map((c) => <li key={c}>{c}</li>)}</ul>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><code className="whitespace-nowrap text-xs text-slate-600">{a.action}</code></td>
                    <td className="px-3 py-2.5"><Badge value={a.severity} /></td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{a.ip || "-"}</td>
                  </tr>
                );
              })}
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ActivityInner />
    </Suspense>
  );
}
