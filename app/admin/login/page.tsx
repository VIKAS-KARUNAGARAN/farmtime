import { LoginForm } from "@/components/LoginForm";
export const metadata = { title: "Admin sign in · FarmTime" };
export default function Page() {
  return <LoginForm portal="admin" />;
}
