"use client";
import { Check, Lock, Minus } from "lucide-react";
import { Badge, CardHead, PageHeader } from "@/components/ui";

const MATRIX: [string, boolean, boolean][] = [
  ["Clock in and out", true, true],
  ["View own timesheets and payslips", true, true],
  ["Request leave", true, true],
  ["View all staff records", false, true],
  ["Edit pay rates", false, true],
  ["Create and publish rosters", false, true],
  ["Process payroll", false, true],
  ["View audit trail", false, true],
  ["Change access settings", false, true],
];

const POLICIES = [
  { name: "MFA required for Admin workspace", value: "Always on", locked: true },
  { name: "Role decided by account, not entrance", value: "Enforced", locked: true },
  { name: "Lock entrance after failed sign-ins", value: "5 attempts · 15 min" },
  { name: "Admin session timeout", value: "30 min idle" },
  { name: "Staff session timeout", value: "12 h (shift length)" },
  { name: "Audit log retention", value: "7 years" },
];

export default function Settings() {
  return (
    <div>
      <PageHeader eyebrow="Governance" title="Access & settings" desc="Who can do what, and the security rules applied at each entrance." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="card overflow-x-auto">
          <CardHead title="Permissions by role" />
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="w-24 px-4 py-3 text-center font-medium"><Badge tone="staff">Staff</Badge></th>
                <th className="w-24 px-4 py-3 text-center font-medium"><Badge tone="admin">Admin</Badge></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MATRIX.map(([cap, s, a]) => (
                <tr key={cap}>
                  <td className="px-4 py-2.5">{cap}</td>
                  <td className="px-4 py-2.5 text-center">{s ? <Check size={16} className="mx-auto text-ok" /> : <Minus size={16} className="mx-auto text-faint" />}</td>
                  <td className="px-4 py-2.5 text-center">{a ? <Check size={16} className="mx-auto text-ok" /> : <Minus size={16} className="mx-auto text-faint" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card self-start">
          <CardHead title="Security policies" />
          <ul className="divide-y divide-line">
            {POLICIES.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{p.name}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">{p.locked && <Lock size={12} />} {p.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
