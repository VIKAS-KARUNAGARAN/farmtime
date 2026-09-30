import { Guard } from "@/components/Guard";
import { StaffShell } from "@/components/Shells";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard role="staff">
      <StaffShell>{children}</StaffShell>
    </Guard>
  );
}
