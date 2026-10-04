"use client";
import { useState } from "react";
import Link from "@/lib/nav";
import { ArrowRight, Check, Download, Info, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, CardHead, EmptyState, ErrorState, NoAccess, PageHeader, PageLoading, Stat, Toast, td, th } from "@/components/ui";
import type { Download as Dl, Period } from "@/lib/data";
import { api, openDownload } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, fmtDay, fmtRange, hrs, money2, todayYmd, useToast } from "@/lib/format";

type Row = { staffId: number; name: string; role: string | null; contractType: string; standardRate: number; overtimeRate: number; ordinaryHours: number; overtimeHours: number; weekendHours: number; publicHolidayHours: number; penalty: boolean; totalPay: number };
type Pay = {
  period: Period;
  periods: Period[];
  run: { id: number; step: number; approvedBy: string | null; approvedAt: string | null; updatedAt: string; done: boolean } | null;
  step: number;
  source: "saved" | "calculated";
  rows: Row[];
  totals: { staff: number; ordinaryHours: number; overtimeHours: number; weekendHours: number; publicHolidayHours: number; totalPay: number };
  checks: { incompleteShifts: number; incomplete: { staffId: number; date: string; shiftId: number }[]; pendingCorrections: number; openExceptions: number };
  rules: { ordinaryCap: number; text: string };
};

const STEPS = [
  { n: 1, title: "Review", text: "Pay run started. Check hours and fix problems." },
  { n: 2, title: "Approve", text: "Figures locked and approved." },
  { n: 3, title: "Payslips", text: "Payslips released to staff." },
  { n: 4, title: "Export", text: "Exported to the pay system. Done." },
];
const NEXT = ["Start pay run", "Approve pay run", "Release payslips", "Mark exported and complete"];

export default function Payroll() {
  const can = useCan();
  const allowed = can("payroll.process");
  const [start, setStart] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Pay>(allowed ? `/api/admin/payroll${start ? `?start=${start}` : ""}` : null);
  const { toast, show } = useToast(4500);
  const { busy, run } = useBusy(show);
  const [override, setOverride] = useState<Pay | null>(null);

  if (!allowed) return <NoAccess what="Payroll" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const v = override && override.period.start === data?.period.start ? override : data;
  if (!v) return null;

  const finished = v.period.end < todayYmd();
  const blocked = v.step === 1 && (v.checks.incompleteShifts > 0 || v.checks.pendingCorrections > 0);
  const nameOf = (id: number) => v.rows.find((r) => r.staffId === id)?.name ?? `Staff #${id}`;

  async function advance() {
    const r = await run("adv", () => api<Pay>("/api/admin/payroll/advance", { body: { start: v!.period.start } }), (x) => `Step ${x.step}: ${STEPS[x.step - 1]?.title ?? ""} done.`);
    if (r) {
      setOverride(r);
      reload();
    }
  }
  async function recalc() {
    const r = await run("calc", () => api<Pay>("/api/admin/payroll/recalculate", { body: { start: v!.period.start } }), "Pay recalculated from the latest clock data.");
    if (r) {
      setOverride(r);
      reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        desc="Four steps per fortnight. Figures come from the clock data (paid breaks count as worked time) and lock once approved."
        actions={
          <select className="input h-9 w-auto" value={v.period.start} onChange={(e) => { setOverride(null); setStart(e.target.value); }} aria-label="Pay fortnight" data-testid="select-period">
            {v.periods.map((p) => <option key={p.start} value={p.start}>{fmtRange(p.start, p.end)}{p.current ? " (current)" : ""}</option>)}
          </select>
        }
      />

      <section className="card p-4">
        <ol className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((s) => {
            const done = v.step >= s.n;
            return (
              <li key={s.n} className={`rounded-lg border p-3 ${done ? "border-admin/40 bg-admin-soft" : "border-line"}`}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? "bg-admin text-white dark:text-bg" : "bg-surface-2 text-muted"}`}>{done ? <Check size={13} /> : s.n}</span>
                  {s.title}
                </p>
                <p className="mt-1 text-xs text-muted">{s.text}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted" data-testid="text-payroll-status">
            {v.step === 0 ? "Not started." : `Step ${v.step} of 4.`}
            {v.run?.approvedAt && ` Approved by ${v.run.approvedBy ?? "—"} ${fmtDateTime(v.run.approvedAt)}.`}
            {v.source === "calculated" && " Figures below are a live calculation and aren’t saved yet."}
            {!finished && " This fortnight hasn’t finished, so it can’t be started yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            {v.step === 1 && <Button variant="outline" size="sm" disabled={!!busy} onClick={recalc} data-testid="button-recalc">{busy === "calc" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalculate</Button>}
            {v.step >= 2 && (
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("exp", () => api<Dl>("/api/admin/payroll/export", { body: { start: v.period.start } }).then(openDownload), "Download started.")} data-testid="button-export-payroll">
                <Download size={14} /> Download CSV
              </Button>
            )}
            {v.step < 4 && (
              <Button variant="admin" size="sm" disabled={!!busy || !finished || blocked} onClick={advance} data-testid="button-advance">
                {busy === "adv" && <Loader2 size={14} className="animate-spin" />} {NEXT[v.step]}
              </Button>
            )}
            {v.step === 4 && <Badge tone="ok">Complete</Badge>}
          </div>
        </div>
      </section>

      {v.step <= 1 && (v.checks.incompleteShifts > 0 || v.checks.pendingCorrections > 0 || v.checks.openExceptions > 0) && (
        <section className="card border-warn/40">
          <CardHead title="Fix before approving" />
          <ul className="divide-y divide-line text-sm">
            {v.checks.incomplete.map((x) => (
              <li key={x.shiftId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span><span className="font-medium">{nameOf(x.staffId)}</span> <span className="text-muted">· no clock-out on {fmtDay(x.date)}</span></span>
                <Link href="/admin/timesheets/" className="inline-flex items-center gap-1 text-[13px] font-medium text-admin">Correct <ArrowRight size={13} /></Link>
              </li>
            ))}
            {v.checks.pendingCorrections > 0 && (
              <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span>{v.checks.pendingCorrections} time correction{v.checks.pendingCorrections === 1 ? "" : "s"} waiting for approval</span>
                <Link href="/admin/approvals/" className="inline-flex items-center gap-1 text-[13px] font-medium text-admin">Approvals <ArrowRight size={13} /></Link>
              </li>
            )}
            {v.checks.openExceptions > 0 && (
              <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-muted">{v.checks.openExceptions} open exception{v.checks.openExceptions === 1 ? "" : "s"} in this fortnight (don’t block approval)</span>
                <Link href="/admin/exceptions/" className="inline-flex items-center gap-1 text-[13px] font-medium text-admin">Exceptions <ArrowRight size={13} /></Link>
              </li>
            )}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Staff paid" value={v.totals.staff} />
        <Stat label="Ordinary" value={hrs(v.totals.ordinaryHours)} />
        <Stat label="Overtime" value={hrs(v.totals.overtimeHours)} />
        <Stat label="Weekend + public holiday" value={hrs(v.totals.weekendHours + v.totals.publicHolidayHours)} />
        <Stat label="Total pay" value={money2(v.totals.totalPay)} />
      </div>

      <section className="card overflow-hidden">
        <CardHead title={`Pay for ${fmtRange(v.period.start, v.period.end)}`} action={<Badge tone={v.source === "saved" ? "admin" : "neutral"}>{v.source === "saved" ? "Saved figures" : "Live calculation"}</Badge>} />
        {v.rows.length === 0 ? (
          <EmptyState title="No worked hours in this fortnight" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line"><tr>
                <th className={th}>Staff</th><th className={`${th} text-right`}>Rate / OT</th><th className={`${th} text-right`}>Ordinary</th><th className={`${th} text-right`}>Overtime</th><th className={`${th} text-right`}>Weekend</th><th className={`${th} text-right`}>Public hol.</th><th className={`${th} text-right`}>Total pay</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {v.rows.map((r) => (
                  <tr key={r.staffId} data-testid={`row-pay-${r.staffId}`}>
                    <td className={td}><span className="font-medium">{r.name}</span><p className="text-xs text-muted">{r.role ?? "—"} · {r.contractType}</p></td>
                    <td className={`${td} tabular text-right text-xs text-muted`}>{money2(r.standardRate)} / {money2(r.overtimeRate)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(r.ordinaryHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(r.overtimeHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(r.weekendHours)}</td>
                    <td className={`${td} tabular text-right`}>{hrs(r.publicHolidayHours)}</td>
                    <td className={`${td} tabular text-right font-semibold`}>{money2(r.totalPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs text-muted"><Info size={14} className="mt-0.5 shrink-0" /> {v.rules.text}</p>
      </section>
      <Toast text={toast} />
    </div>
  );
}
