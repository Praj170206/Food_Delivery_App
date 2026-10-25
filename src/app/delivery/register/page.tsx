import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = { title: "Become a delivery partner · GreenBite" };

export default function Page() {
  return (
    <AuthShell portal="delivery">
      <RegisterForm portal="delivery" />
    </AuthShell>
  );
}
