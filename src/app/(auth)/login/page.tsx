import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in · GreenBite" };

export default function CustomerLoginPage() {
  return <LoginForm portal="user" />;
}
