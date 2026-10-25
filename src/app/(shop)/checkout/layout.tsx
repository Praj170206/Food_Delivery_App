import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/auth/session";

export const metadata = { title: "Checkout · GreenBite" };

export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  await requirePageRole("user");
  return <>{children}</>;
}
