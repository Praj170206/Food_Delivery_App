import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";

// Customer portal (/login, /register) plus the shared password-reset pages.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell portal="user">{children}</AuthShell>;
}
