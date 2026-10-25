import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Hotel partner sign in · GreenBite" };

export default function Page() {
  return (
    <AuthShell portal="manager">
      <LoginForm portal="manager" />
    </AuthShell>
  );
}
