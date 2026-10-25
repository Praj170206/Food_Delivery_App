import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Admin console · GreenBite", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <AuthShell portal="admin">
      <LoginForm portal="admin" />
    </AuthShell>
  );
}
