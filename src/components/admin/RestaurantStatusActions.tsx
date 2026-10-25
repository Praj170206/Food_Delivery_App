"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import type { RestaurantStatus } from "@/lib/constants";

type Target = { _id: string; name: string; status: RestaurantStatus };
type Pending = { status: RestaurantStatus; title: string; message: string; label: string; variant: "primary" | "danger"; reason: boolean } | null;

export function RestaurantStatusActions({ restaurant: r, onDone, compact }: { restaurant: Target; onDone: () => void; compact?: boolean }) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const size = compact ? "sm" : "md";

  const apply = async (reason: string) => {
    if (!pending) return;
    try {
      await api(`/api/admin/restaurants/${r._id}`, { method: "PATCH", body: { status: pending.status, reason: reason || undefined } });
      toast(`${r.name} is now ${pending.status}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {r.status === "pending" && (
        <>
          <Button size={size} onClick={() => setPending({ status: "approved", title: "Approve hotel", message: `${r.name} will go live and its manager's account will be activated. The manager gets an email.`, label: "Approve", variant: "primary", reason: false })}>Approve</Button>
          <Button size={size} variant="secondary" onClick={() => setPending({ status: "rejected", title: "Reject hotel", message: `${r.name} will not be listed on the platform.`, label: "Reject", variant: "danger", reason: true })}>Reject</Button>
        </>
      )}
      {r.status === "approved" && (
        <Button size={size} variant="secondary" onClick={() => setPending({ status: "suspended", title: "Suspend hotel", message: `${r.name} will be closed immediately and hidden from customers.`, label: "Suspend", variant: "danger", reason: true })}>Suspend</Button>
      )}
      {(r.status === "suspended" || r.status === "rejected") && (
        <Button size={size} variant="secondary" onClick={() => setPending({ status: "approved", title: "Re-approve hotel", message: `${r.name} will be listed again (the manager decides when to open).`, label: "Approve", variant: "primary", reason: false })}>Re-approve</Button>
      )}
      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ""}
        message={pending?.message}
        confirmLabel={pending?.label}
        variant={pending?.variant}
        askReason={pending?.reason}
        reasonRequired={pending?.status === "suspended"}
        onConfirm={apply}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
