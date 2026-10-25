"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import type { UserStatus } from "@/lib/constants";

type Target = { _id: string; name: string; status: UserStatus };
type Pending = { status: UserStatus; title: string; message: string; label: string; variant: "primary" | "danger" | "warning"; reason: boolean } | null;

/** Approve / reject / suspend / reactivate buttons appropriate to the user's current status. */
export function UserStatusActions({ user, onDone, compact }: { user: Target; onDone: () => void; compact?: boolean }) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const size = compact ? "sm" : "md";

  const apply = async (reason: string) => {
    if (!pending) return;
    try {
      await api(`/api/admin/users/${user._id}`, { method: "PATCH", body: { status: pending.status, reason: reason || undefined } });
      toast(`${user.name} is now ${pending.status}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {user.status === "pending" && (
        <>
          <Button size={size} onClick={() => setPending({ status: "active", title: "Approve account", message: `${user.name} will be able to sign in and start working on the platform. They'll get an email.`, label: "Approve", variant: "primary", reason: false })}>
            Approve
          </Button>
          <Button size={size} variant="secondary" onClick={() => setPending({ status: "rejected", title: "Reject registration", message: `${user.name}'s registration will be rejected and they won't be able to sign in.`, label: "Reject", variant: "danger", reason: true })}>
            Reject
          </Button>
        </>
      )}
      {user.status === "active" && (
        <Button size={size} variant="secondary" onClick={() => setPending({ status: "suspended", title: "Suspend account", message: `${user.name} will be signed out everywhere immediately and blocked from signing in.`, label: "Suspend", variant: "danger", reason: true })}>
          Suspend
        </Button>
      )}
      {(user.status === "suspended" || user.status === "rejected") && (
        <Button size={size} variant="secondary" onClick={() => setPending({ status: "active", title: "Reactivate account", message: `${user.name} will be able to sign in again.`, label: "Reactivate", variant: "primary", reason: false })}>
          Reactivate
        </Button>
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
