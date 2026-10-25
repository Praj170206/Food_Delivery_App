import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = { title: "Register your hotel · GreenBite" };

export default function Page() {
  return (
    <AuthShell portal="manager">
      <RegisterForm portal="manager" />
    </AuthShell>
  );
}
