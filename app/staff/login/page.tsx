import { LoginForm } from "@/components/LoginForm";
export const metadata = { title: "Staff sign in · FarmTime" };
export default function Page() {
  return <LoginForm portal="staff" />;
}
