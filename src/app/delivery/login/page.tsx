import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Delivery partner sign in · GreenBite" };

export default function Page() {
  return (
    <AuthShell portal="delivery">
      <LoginForm portal="delivery" />
    </AuthShell>
  );
}
