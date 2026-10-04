"use client";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Phone } from "lucide-react";
import { Avatar, Badge, Button, CardHead, EmptyState, ErrorState, Field, FormError, PageHeader, PageLoading, Toast, td, th } from "@/components/ui";
import type { AccessRole, StaffMember } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtHm, fmtRange, hrs, money2, useToast } from "@/lib/format";

type Profile = { staff: StaffMember; account: { email: string; accessRoles: AccessRole[]; mfaEnrolled: boolean } };
type Payslip = { id: number; periodStart: string; periodEnd: string; ordinaryHours: number; overtimeHours: number; weekendHours: number; publicHolidayHours: number; penalty: boolean; totalPay: number };

export default function StaffProfile() {
  const { data, error, loading, reload } = useApi<Profile>("/api/me/profile");
  const slips = useApi<{ payslips: Payslip[] }>("/api/me/payslips");
  const { toast, show } = useToast();

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const s = data.staff;

  return (
    <div>
      <PageHeader title="Profile" desc="Your details as held by the office. Ask an Office Admin to change anything other than your emergency contact." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Avatar initials={s.initials} tone="staff" size="lg" />
            <div>
              <p className="font-semibold">{s.name}</p>
              <p className="text-sm text-muted">{s.jobTitle ?? "Staff"} · {s.contractType}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
            <Item k="Email" v={data.account.email} />
            <Item k="Access" v={data.account.accessRoles.join(", ")} />
            <Item k="Standard hours" v={`${s.standardHours} h / week`} />
            <Item k="Hours pattern" v={s.hoursType === "Patterned" ? `${s.patternDays} · ${fmtHm(s.patternStart)}–${fmtHm(s.patternEnd)}` : "Weekly"} />
            <Item k="Pay rate" v={s.standardRate != null ? `${money2(s.standardRate)} / h` : "—"} />
            <Item k="Overtime rate" v={s.overtimeRate != null ? `${money2(s.overtimeRate)} / h` : "—"} />
            <Item k="Clock ID" v={s.credentialRef ?? "—"} />
            <Item k="Clock PIN" v={s.hasPin ? "Issued" : "Not issued"} />
            <Item k="Annual leave" v={hrs(s.annualLeaveHours)} />
            <Item k="Personal leave" v={hrs(s.personalLeaveHours)} />
          </dl>
        </section>
        <div className="space-y-6">
          <Emergency staff={s} onSaved={() => { show("Emergency contact saved."); reload(); }} />
          <Password onDone={(m) => show(m)} />
        </div>
      </div>

      <section className="card mt-6 overflow-hidden">
        <CardHead title="Payslips" action={<span className="text-xs text-faint">Released after payroll step 3</span>} />
        {slips.data && slips.data.payslips.length === 0 ? (
          <EmptyState title="No payslips yet" text="Payslips show here once the office releases them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line"><tr>
                <th className={th}>Fortnight</th><th className={`${th} text-right`}>Ordinary</th><th className={`${th} text-right`}>Overtime</th><th className={`${th} text-right`}>Weekend</th><th className={`${th} text-right`}>Public holiday</th><th className={`${th} text-right`}>Total pay</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {(slips.data?.payslips ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{fmtRange(p.periodStart, p.periodEnd)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(p.ordinaryHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(p.overtimeHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(p.weekendHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(p.publicHolidayHours)}</td>
                    <td className={`${td} tabular text-right font-semibold`}>{money2(p.totalPay)}{p.penalty && <Badge tone="wheat" className="ml-2">Penalty</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Toast text={toast} />
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Emergency({ staff, onSaved }: { staff: StaffMember; onSaved: () => void }) {
  const [name, setName] = useState(staff.emergencyContactName ?? "");
  const [phone, setPhone] = useState(staff.emergencyContactPhone ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(staff.emergencyContactName ?? "");
    setPhone(staff.emergencyContactPhone ?? "");
  }, [staff.emergencyContactName, staff.emergencyContactPhone]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/me/profile/emergency", { method: "PATCH", body: { name: name.trim(), phone: phone.trim() } });
      onSaved();
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold tracking-normal"><Phone size={15} /> Emergency contact</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="e-name"><input id="e-name" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone" htmlFor="e-phone"><input id="e-phone" className="input" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <FormError text={err} />
      <Button type="submit" variant="outline" size="sm" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save contact</Button>
    </form>
  );
}

function Password({ onDone }: { onDone: (m: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 10) return setErr("Passwords need at least 10 characters.");
    if (next !== confirm) return setErr("The new passwords don’t match.");
    setBusy(true);
    try {
      await api("/api/auth/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone("Password changed. Other devices have been signed out.");
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold tracking-normal"><KeyRound size={15} /> Change password</h2>
      <Field label="Current password" htmlFor="p-cur"><input id="p-cur" type="password" autoComplete="current-password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" htmlFor="p-new"><input id="p-new" type="password" autoComplete="new-password" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm" htmlFor="p-conf"><input id="p-conf" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      <FormError text={err} />
      <Button type="submit" variant="outline" size="sm" disabled={busy || !current}>{busy && <Loader2 size={14} className="animate-spin" />} Change password</Button>
    </form>
  );
}
