import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = { title: "Create account · GreenBite" };

export default function CustomerRegisterPage() {
  return <RegisterForm portal="user" />;
}
