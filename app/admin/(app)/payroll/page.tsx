"use client";
import { useState } from "react";
import { Check, Download, FileText, Loader2 } from "lucide-react";
import { Avatar, Badge, Button, PageHeader, Stat, Toast } from "@/components/ui";
import { PAY_PERIOD } from "@/lib/data";
import { useStore } from "@/lib/store";

const STEPS = ["Review timesheets", "Approve hours", "Generate payslips", "Export to bank"];

export default function Payroll() {
  const { staff, log, session } = useStore();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rows = staff.filter((s) => s.hoursWeek > 0).map((s) => {
    const ordinary = Math.min(76, s.hoursWeek * 2);
    const overtime = Math.max(0, s.hoursWeek * 2 - 76) + (s.id === "s5" ? 4 : s.id === "s3" ? 2.5 : 0);
    const gross = ordinary * s.rate + overtime * s.rate * 1.5;
    return { ...s, ordinary, overtime, gross };
  });
  const total = rows.reduce((a, r) => a + r.gross, 0);
  const ot = rows.reduce((a, r) => a + r.overtime, 0);
  const done = step >= STEPS.length;

  function advance() {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      log({ actor: session!.account.name, action: `Payroll: ${STEPS[step].toLowerCase()}`, target: PAY_PERIOD.label, source: "Admin portal", level: "security" });
      setStep((s) => s + 1);
      setToast(`${STEPS[step]} complete`);
      setTimeout(() => setToast(null), 2000);
    }, 700);
  }

  return (
    <div>
      <PageHeader eyebrow="Finance" title="Payroll" desc={`Pay period ${PAY_PERIOD.label} · pay date ${PAY_PERIOD.payDate}.`} actions={<Button variant="outline" size="sm"><Download size={14} /> Export CSV</Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Gross payroll" value={`$${total.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`} />
        <Stat label="Employees" value={rows.length} />
        <Stat label="Overtime hours" value={ot.toFixed(1)} sub="Paid at 1.5×" tone={ot > 5 ? "warn" : undefined} />
        <Stat label="Super (11.5%)" value={`$${(total * 0.115).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`} />
      </div>

      <section className="card mt-6 p-4">
        <ol className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((s, i) => {
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
          <p className="text-sm text-muted">{done ? "Payroll processed. Payslips are available to staff in their portal." : `Next: ${STEPS[step].toLowerCase()}.`}</p>
          <Button variant="admin" onClick={advance} disabled={busy || done} data-testid="button-payroll-next">
            {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : <FileText size={15} />}
            {done ? "Complete" : STEPS[step]}
          </Button>
        </div>
      </section>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3"><div className="flex items-center gap-2.5"><Avatar initials={r.initials} size="sm" tone="admin" /><span className="font-medium">{r.name}</span></div></td>
                <td className="px-4 py-3 text-right">{r.ordinary.toFixed(1)}</td>
                <td className={`px-4 py-3 text-right ${r.overtime ? "text-warn" : "text-faint"}`}>{r.overtime.toFixed(1)}</td>
                <td className="px-4 py-3 text-right text-muted">${r.rate.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-medium">${r.gross.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3">{step >= 3 ? <Badge tone="ok">Generated</Badge> : <Badge>Not yet</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast text={toast} />
    </div>
  );
}
