import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = { title: "Admin · GreenBite" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageRole("admin");
  return <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>;
}
