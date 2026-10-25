import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/auth/session";
import { LiveProvider } from "@/components/live/LiveProvider";
import { AccountNav } from "@/components/shop/AccountNav";

export const metadata = { title: "My account · GreenBite" };

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requirePageRole("user");
  // Live order updates for this customer only (events addressed to them).
  return (
    <LiveProvider src="/api/stream">
      <AccountNav />
      {children}
    </LiveProvider>
  );
}
