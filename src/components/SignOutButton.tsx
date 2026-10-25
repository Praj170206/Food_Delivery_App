"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

export function SignOutButton({ to = "/login" }: { to?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.replace(to);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
