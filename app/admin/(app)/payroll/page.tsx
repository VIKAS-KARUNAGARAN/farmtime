"use client";
import { useState } from "react";
import { Check, Download, FileText, Loader2, TriangleAlert } from "lucide-react";
import { Avatar, Badge, Button, ErrorState, PageHeader, PageLoading, Stat, Toast } from "@/components/ui";
import type { Download as DL } from "@/lib/data";
import { api, ApiError, openDownload } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { money, money2, useToast } from "@/lib/format";

type Row = { employeeId: string; name: string; initials: string; rate: number; ordinary: number; overtime: number; gross: number; superannuation: number; pending: number; queried: number; excludedHours: number };
type Data = {
  period: { label: string; payDate: string };
  steps: string[];
  step: number;
  done: boolean;
  totals: { gross: number; employees: number; overtimeHours: number; superannuation: number; pendingTimesheets: number; queriedTimesheets: number };
  rows: Row[];
  export?: DL;
};

export default function Payroll() {
  const { data: fetched, error, loading, reload } = useApi<Data>("/api/admin/payroll");
  const [override, setOverride] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const data = override ?? fetched;

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const { step, steps, done } = data;

  async function advance() {
    setBusy(true);
    try {
      const r = await api<Data>("/api/admin/payroll/advance", { body: {} });
      setOverride(r);
      show(`${steps[step]} complete`);
      if (r.export) openDownload(r.export);
    } catch (e) {
      show((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    try {
      openDownload(await api<DL>("/api/admin/payroll/export", { body: {} }));
      show("Payroll CSV downloaded");
    } catch (e) {
      show((e as ApiError).message);
    }
  }

  const hint = [
    data.totals.pendingTimesheets ? `${data.totals.pendingTimesheets} pending timesheets will be approved in the next step.` : "All timesheets in this period are approved.",
    "Approves every pending timesheet in the period.",
    "Creates payslips and notifies each employee.",
    "Downloads the bank file (CSV) and closes the pay run.",
  ][Math.min(step, 3)];

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Payroll"
        desc={`Pay period ${data.period.label} · pay date ${data.period.payDate}.`}
        actions={<Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-payroll-export"><Download size={14} /> Export CSV</Button>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Gross payroll" value={money(data.totals.gross)} />
        <Stat label="Employees" value={data.totals.employees} />
        <Stat label="Overtime hours" value={data.totals.overtimeHours.toFixed(1)} sub="Over 76 h per fortnight, paid at 1.5×" tone={data.totals.overtimeHours > 5 ? "warn" : undefined} />
        <Stat label="Super (11.5%)" value={money(data.totals.superannuation)} />
      </div>

      {data.totals.queriedTimesheets > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
          {data.totals.queriedTimesheets} queried timesheet{data.totals.queriedTimesheets === 1 ? " is" : "s are"} excluded from this run until the employee responds and it’s approved.
        </p>
      )}

      <section className="card mt-6 p-4">
        <ol className="grid gap-3 sm:grid-cols-4">
          {steps.map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li key={s} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${state === "current" ? "border-admin/50 bg-admin-soft" : "border-line"}`}>
                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${state === "done" ? "bg-ok text-white dark:text-bg" : state === "current" ? "bg-admin text-white dark:text-bg" : "bg-surface-2 text-muted"}`}>
                  {state === "done" ? <Check size={13} /> : i + 1}
                </span>
                <span className={state === "todo" ? "text-muted" : "font-medium"}>{s}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">{done ? "Payroll processed. Payslips are available to staff in their portal." : `Next: ${steps[step].toLowerCase()}. ${hint}`}</p>
          <Button variant="admin" onClick={advance} disabled={busy || done} data-testid="button-payroll-next">
            {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : <FileText size={15} />}
            {done ? "Complete" : steps[step]}
          </Button>
        </div>
      </section>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 text-right font-medium">Ordinary h</th>
              <th className="px-4 py-3 text-right font-medium">Overtime h</th>
              <th className="px-4 py-3 text-right font-medium">Rate</th>
              <th className="px-4 py-3 text-right font-medium">Gross</th>
              <th className="px-4 py-3 font-medium">Payslip</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {data.rows.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={r.initials} size="sm" tone="admin" />
                    <span className="font-medium">{r.name}</span>
                    {r.queried > 0 && <Badge tone="warn">{r.excludedHours.toFixed(1)} h queried</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{r.ordinary.toFixed(1)}</td>
                <td className={`px-4 py-3 text-right ${r.overtime ? "text-warn" : "text-faint"}`}>{r.overtime.toFixed(1)}</td>
                <td className="px-4 py-3 text-right text-muted">{money2(r.rate)}</td>
                <td className="px-4 py-3 text-right font-medium">{money2(r.gross)}</td>
                <td className="px-4 py-3">{step >= 3 ? <Badge tone="ok">Generated</Badge> : r.pending ? <Badge tone="warn">{r.pending} pending</Badge> : <Badge>Not yet</Badge>}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No hours recorded in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast text={toast} />
    </div>
  );
}
