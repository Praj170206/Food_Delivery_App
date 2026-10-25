import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/auth/session";
import { ManagerShell } from "@/components/manager/ManagerShell";

export const metadata = { title: "Hotel partner · GreenBite" };

export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const user = await requirePageRole("manager");
  return <ManagerShell user={{ name: user.name, email: user.email }}>{children}</ManagerShell>;
}
