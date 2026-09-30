"use client";
import { useState } from "react";
import { KeyRound, Phone } from "lucide-react";
import { Avatar, Badge, Button, CardHead, PageHeader, Toast } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function Profile() {
  const { session } = useStore();
  const a = session!.account;
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };
  const rows = [
    ["Email", a.email],
    ["Position", a.title],
    ["Home station", a.station],
    ["Employment", "Full-time · since Mar 2024"],
    ["Access", a.roles.map((r) => (r === "admin" ? "Admin" : "Staff")).join(" + ")],
  ];
  return (
    <div>
      <PageHeader eyebrow="Profile" title="My details" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <section className="card">
          <div className="flex items-center gap-4 border-b border-line p-5">
            <Avatar initials={a.initials} tone="staff" size="lg" />
            <div>
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm text-muted">{a.title}</p>
            </div>
            <Badge tone="ok" className="ml-auto">Active</Badge>
          </div>
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </section>
        <div className="space-y-6">
          <section className="card">
            <CardHead title="Emergency contact" />
            <div className="flex items-center justify-between gap-3 p-4 text-sm">
              <div><p className="font-medium">David Chen</p><p className="text-xs text-muted">Partner · 0412 555 018</p></div>
              <Button variant="outline" size="sm" onClick={() => flash("Edit form would open here (demo)")}><Phone size={14} /> Edit</Button>
            </div>
          </section>
          <section className="card">
            <CardHead title="Security" />
            <div className="space-y-3 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-medium">Station PIN</p><p className="text-xs text-muted">Used to clock in at tablets and kiosks</p></div>
                <Button variant="outline" size="sm" onClick={() => flash("PIN reset link sent (demo)")}><KeyRound size={14} /> Change</Button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <div><p className="font-medium">Password</p><p className="text-xs text-muted">Last changed 64 days ago</p></div>
                <Button variant="outline" size="sm" onClick={() => flash("Password reset email sent (demo)")}>Reset</Button>
              </div>
            </div>
          </section>
        </div>
      </div>
      <Toast text={toast} />
    </div>
  );
}
