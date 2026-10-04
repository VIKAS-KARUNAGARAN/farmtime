"use client";
import { useState } from "react";
import { Check, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, Field, NoAccess, PageHeader, PageLoading, Segmented, Toast, td, th } from "@/components/ui";
import type { AccessRole, BreakReason } from "@/lib/data";
import { api } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDay, todayYmd, useToast } from "@/lib/format";

type RuleRow = { id: number; name: string; maxHoursWithoutBreak: number; dailyOvertimeThreshold: number; weeklyOvertimeThreshold: number };
type Settings = {
  farmName: string;
  security: { lockoutAttempts: number; lockoutMinutes: number; adminIdleMinutes: number; sessionHours: number; pinValidHours: number; mfaRequiredForAdmin: boolean; source: string };
  permissions: { key: string; label: string; roles: Record<AccessRole, boolean> }[];
  roles: AccessRole[];
  activeRuleId: number | null;
  rules: RuleRow[];
  breakReasons: BreakReason[];
  holidays: { id: number; date: string; name: string; state: string }[];
  payRules: { ordinaryHoursPerFortnight: number; payPeriodAnchor: string; mealBreakMinutes: number; mealBreakAfterHours: number };
};
type Tab = "access" | "rules" | "breaks" | "holidays" | "security";

export default function SettingsPage() {
  const can = useCan();
  const allowed = can("settings.write");
  const { data, error, loading, reload } = useApi<Settings>(allowed ? "/api/admin/settings" : null);
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);
  const [tab, setTab] = useState<Tab>("access");

  if (!allowed) return <NoAccess what="Access & settings" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    const r = await run(key, fn, msg);
    if (r !== undefined) await reload();
    return r;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Access & settings" desc="Who can do what, the break rule, break reasons and public holidays. Every change is written to the audit trail." />
      <Segmented
        label="Settings"
        value={tab}
        onChange={setTab}
        options={[
          { value: "access", label: "Access roles" },
          { value: "rules", label: "Break rules" },
          { value: "breaks", label: "Break reasons" },
          { value: "holidays", label: "Public holidays" },
          { value: "security", label: "Security & pay" },
        ]}
      />

      {tab === "access" && (
        <section className="card overflow-hidden">
          <CardHead title="Permissions by access role" action={<span className="text-xs text-faint">Assign roles on each person in Staff management</span>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line"><tr><th className={th}>Permission</th>{data.roles.map((r) => <th key={r} className={`${th} text-center`}>{r}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {data.permissions.map((p) => (
                  <tr key={p.key}>
                    <td className={td}>{p.label}</td>
                    {data.roles.map((r) => (
                      <td key={r} className={`${td} text-center`}>{p.roles[r] ? <Check size={16} className="inline text-ok" aria-label="Yes" /> : <Minus size={16} className="inline text-faint" aria-label="No" />}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">Workers use the Staff portal. Office Admin, Roster Admin and Manager/Supervisor use the Admin portal with MFA. A person can hold more than one role.</p>
        </section>
      )}

      {tab === "rules" && (
        <div className="space-y-4">
          {data.rules.map((r) => <RuleCard key={r.id} r={r} active={r.id === data.activeRuleId} busy={busy === `r${r.id}`} onSave={(b) => act(`r${r.id}`, () => api(`/api/admin/rules/${r.id}`, { method: "PATCH", body: b }), "Rule saved.")} />)}
          <p className="text-xs text-muted">The active rule is set by ACTIVE_RULE_ID in the server config (the v3 schema has no “active” column yet). It decides when “Break overdue” is raised.</p>
        </div>
      )}

      {tab === "breaks" && <BreakReasons reasons={data.breakReasons} busy={busy} act={act} />}
      {tab === "holidays" && <Holidays holidays={data.holidays} busy={busy} act={act} />}

      {tab === "security" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <CardHead title="Sign-in security" action={<Badge tone="neutral">{data.security.source}</Badge>} />
            <dl className="divide-y divide-line text-sm">
              {[
                ["Failed sign-ins before lockout", `${data.security.lockoutAttempts} attempts`],
                ["Lockout time", `${data.security.lockoutMinutes} min`],
                ["Admin idle sign-out", `${data.security.adminIdleMinutes} min`],
                ["Session length", `${data.security.sessionHours} h`],
                ["Temporary PIN valid for", `${data.security.pinValidHours} h`],
                ["MFA for Admin portal", data.security.mfaRequiredForAdmin ? "Always required" : "Off"],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          </section>
          <section className="card">
            <CardHead title="Pay and roster rules" action={<Badge tone="neutral">Server config</Badge>} />
            <dl className="divide-y divide-line text-sm">
              {[
                ["Ordinary hours per fortnight", `${data.payRules.ordinaryHoursPerFortnight} h (the rest is overtime)`],
                ["Pay fortnights start", fmtDay(data.payRules.payPeriodAnchor, { weekday: "long", day: "numeric", month: "short", year: "numeric" })],
                ["Rostered meal break", `${data.payRules.mealBreakMinutes} min unpaid on shifts over ${data.payRules.mealBreakAfterHours} h`],
                ["Paid breaks", "Count as worked time"],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
            </dl>
          </section>
        </div>
      )}
      <Toast text={toast} />
    </div>
  );
}

function RuleCard({ r, active, busy, onSave }: { r: RuleRow; active: boolean; busy: boolean; onSave: (b: Partial<RuleRow>) => void }) {
  const [name, setName] = useState(r.name);
  const [maxH, setMaxH] = useState(String(r.maxHoursWithoutBreak));
  const [daily, setDaily] = useState(String(r.dailyOvertimeThreshold));
  const [weekly, setWeekly] = useState(String(r.weeklyOvertimeThreshold));
  return (
    <section className={`card p-4 ${active ? "border-admin/40" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-sans text-[15px] font-semibold tracking-normal">{r.name}</h2>
        {active ? <Badge tone="admin">Active</Badge> : <Badge tone="neutral">Not active</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name" htmlFor={`rn${r.id}`}><input id={`rn${r.id}`} className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Max hours without a break" htmlFor={`rm${r.id}`}><input id={`rm${r.id}`} type="number" min={1} max={12} step={0.5} className="input" value={maxH} onChange={(e) => setMaxH(e.target.value)} data-testid={`input-rule-max-${r.id}`} /></Field>
        <Field label="Daily overtime after (h)" htmlFor={`rd${r.id}`}><input id={`rd${r.id}`} type="number" min={1} max={24} step={0.5} className="input" value={daily} onChange={(e) => setDaily(e.target.value)} /></Field>
        <Field label="Weekly overtime after (h)" htmlFor={`rw${r.id}`}><input id={`rw${r.id}`} type="number" min={1} max={99} step={0.5} className="input" value={weekly} onChange={(e) => setWeekly(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="admin" size="sm" disabled={busy} onClick={() => onSave({ name: name.trim(), maxHoursWithoutBreak: Number(maxH), dailyOvertimeThreshold: Number(daily), weeklyOvertimeThreshold: Number(weekly) })} data-testid={`button-save-rule-${r.id}`}>
          {busy && <Loader2 size={14} className="animate-spin" />} Save rule
        </Button>
      </div>
    </section>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, msg: string) => Promise<unknown>;

function BreakReasons({ reasons, busy, act }: { reasons: BreakReason[]; busy: string | null; act: Act }) {
  const [label, setLabel] = useState("");
  const [paid, setPaid] = useState(false);
  return (
    <section className="card overflow-hidden">
      <CardHead title="Break reasons" action={<span className="text-xs text-faint">Staff pick one when they start a break</span>} />
      <ul className="divide-y divide-line text-sm">
        {reasons.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex items-center gap-2 font-medium">{r.label} <span className="text-xs font-normal text-faint">used {r.used ?? 0}×</span></span>
            <div className="flex items-center gap-2">
              <Segmented label={`${r.label} pay`} value={r.paid ? "paid" : "unpaid"} onChange={(v) => act(`b${r.id}`, () => api(`/api/admin/break-reasons/${r.id}`, { method: "PATCH", body: { paid: v === "paid" } }), `${r.label} breaks are now ${v}.`)} options={[{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" }]} />
              {!r.used && <Button variant="ghost" size="sm" aria-label={`Delete ${r.label}`} disabled={!!busy} onClick={() => act(`bd${r.id}`, () => api(`/api/admin/break-reasons/${r.id}`, { method: "DELETE" }), `${r.label} deleted.`)}><Trash2 size={14} /></Button>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <Field label="New reason" htmlFor="br-new" className="min-w-[200px] flex-1"><input id="br-new" className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hydration" /></Field>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
        <Button variant="admin" disabled={!label.trim() || !!busy} onClick={() => act("bnew", () => api("/api/admin/break-reasons", { body: { label: label.trim(), paid } }), "Break reason added.").then((r) => { if (r !== undefined) { setLabel(""); setPaid(false); } })}><Plus size={15} /> Add</Button>
      </div>
      <p className="border-t border-line px-4 py-3 text-xs text-muted">Reasons already used on a break can’t be deleted, so past timesheets keep their meaning. Changing paid/unpaid affects pay for every break with that reason that hasn’t been approved in payroll yet.</p>
    </section>
  );
}

function Holidays({ holidays, busy, act }: { holidays: Settings["holidays"]; busy: string | null; act: Act }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState("SA");
  const today = todayYmd();
  return (
    <section className="card overflow-hidden">
      <CardHead title="Public holidays" action={<span className="text-xs text-faint">Hours on these days are paid as public holiday</span>} />
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="Date" htmlFor="h-date"><input id="h-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name" htmlFor="h-name" className="min-w-[200px] flex-1"><input id="h-name" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anzac Day" /></Field>
        <Field label="State" htmlFor="h-state">
          <select id="h-state" className="input w-24" value={state} onChange={(e) => setState(e.target.value)}>{["SA", "NAT"].map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Button variant="admin" disabled={!date || !name.trim() || !!busy} onClick={() => act("hnew", () => api("/api/admin/holidays", { body: { date, name: name.trim(), state } }), "Public holiday added.").then((r) => { if (r !== undefined) { setDate(""); setName(""); } })} data-testid="button-add-holiday"><Plus size={15} /> Add</Button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {holidays.map((h) => (
          <li key={h.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${h.date < today ? "text-muted" : ""}`}>
            <span><span className="tabular inline-block w-36">{fmtDay(h.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span> {h.name} <span className="text-xs text-faint">{h.state}</span></span>
            <Button variant="ghost" size="sm" aria-label={`Remove ${h.name}`} disabled={!!busy} onClick={() => act(`h${h.id}`, () => api(`/api/admin/holidays/${h.id}`, { method: "DELETE" }), `${h.name} removed.`)}><Trash2 size={14} /></Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
