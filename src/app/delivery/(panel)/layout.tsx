import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/auth/session";
import { RiderShell } from "@/components/rider/RiderShell";

export const metadata = { title: "Delivery partner · GreenBite" };

export default async function RiderLayout({ children }: { children: ReactNode }) {
  await requirePageRole("delivery");
  return <RiderShell>{children}</RiderShell>;
}
