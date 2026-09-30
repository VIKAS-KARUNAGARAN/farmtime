import { Guard } from "@/components/Guard";
import { AdminShell } from "@/components/Shells";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard role="admin">
      <AdminShell>{children}</AdminShell>
    </Guard>
  );
}
