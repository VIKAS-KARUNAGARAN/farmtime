"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, PencilLine } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, NoAccess, PageHeader, PageLoading, SHIFT_STATUS, Segmented, Toast, isRunning, statusTone, td, th } from "@/components/ui";
import { CorrectionModal } from "@/components/Correction";
import type { Shift } from "@/lib/data";
import { useApi } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { addDays, fmtClock, fmtDay, fmtRange, hrs, useToast } from "@/lib/format";

type Resp = { from: string; to: string; shifts: Shift[] };

export default function AdminTimesheets() {
  const can = useCan();
  const [start, setStart] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Resp>(can("reports.read") ? (start ? `/api/admin/timesheets?from=${start}&to=${addDays(start, 13)}` : "/api/admin/timesheets") : null);
  const { toast, show } = useToast(4000);
  const [staff, setStaff] = useState<string>("all");
  const [view, setView] = useState<"all" | "flagged">("all");
  const [fix, setFix] = useState<Shift | null>(null);

  const people = useMemo(() => [...new Map((data?.shifts ?? []).map((s) => [s.staffId, s.staffName ?? `#${s.staffId}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);

  if (!can("reports.read")) return <NoAccess what="Timesheets" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const flaggedOf = (s: Shift) => s.status === "missing_clock_out" || s.exceptions.some((x) => x.status !== "Resolved") || s.unrostered || s.pendingAdjustments.length > 0;
  const rows = data.shifts
    .filter((s) => staff === "all" || String(s.staffId) === staff)
    .filter((s) => view === "all" || flaggedOf(s))
    .sort((a, b) => (a.date === b.date ? (a.staffName ?? "").localeCompare(b.staffName ?? "") : b.date.localeCompare(a.date)));
  const total = rows.reduce((a, s) => a + (s.clockOut ? s.workedHours : 0), 0);
  const shown = start ?? data.from;

  return (
    <div>
      <PageHeader title="Timesheets" desc="Every shift built from the clock events, with breaks and flags. Raise a correction on any shift; a different manager approves it." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous fortnight" onClick={() => setStart(addDays(shown, -14))}><ChevronLeft size={16} /></Button>
          <span className="tabular px-3 text-sm font-medium">{fmtRange(data.from, data.to)}</span>
          <Button variant="outline" size="sm" aria-label="Next fortnight" onClick={() => setStart(addDays(shown, 14))}><ChevronRight size={16} /></Button>
          <Button variant="ghost" size="sm" onClick={() => setStart(null)}>Current</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input h-9 w-auto" value={staff} onChange={(e) => setStaff(e.target.value)} aria-label="Staff member" data-testid="select-staff">
            <option value="all">All staff</option>
            {people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <Segmented label="Filter" value={view} onChange={setView} options={[{ value: "all", label: "All shifts" }, { value: "flagged", label: "Needs attention" }]} />
        </div>
      </div>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No shifts" text="Nothing matches this period and filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line"><tr>
                <th className={th}>Date</th><th className={th}>Staff</th><th className={th}>In – out</th><th className={th}>Breaks</th><th className={th}>Rostered</th><th className={`${th} text-right`}>Worked</th><th className={th}>Status</th>{can("approvals.write") && <th className={th} />}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((s) => (
                  <tr key={s.id} data-testid={`row-ts-${s.id}`}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDay(s.date)}</td>
                    <td className={td}><span className="font-medium">{s.staffName}</span><p className="text-xs text-muted">{s.station ?? "—"}</p></td>
                    <td className={`${td} tabular whitespace-nowrap`}>{fmtClock(s.clockIn)} – {s.clockOut ? fmtClock(s.clockOut) : <span className="text-danger">none</span>}</td>
                    <td className={`${td} text-xs text-muted`}>{s.breaks.length ? s.breaks.map((b) => `${b.reason} ${b.minutes}m${b.paid ? " (paid)" : ""}`).join(", ") : "—"}</td>
                    <td className={`${td} tabular text-xs text-muted`}>{s.roster ? `${s.roster.startTime}–${s.roster.endTime}` : <Badge tone="warn">Unrostered</Badge>}</td>
                    <td className={`${td} tabular text-right font-medium`}>{s.clockOut ? hrs(s.workedHours) : "—"}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={statusTone(s.status)}>{SHIFT_STATUS[s.status] ?? s.status}</Badge>
                        {s.overridden && <Badge tone="admin">Corrected</Badge>}
                        {[...new Set(s.exceptions.filter((x) => x.status !== "Resolved").map((x) => x.type))].map((t) => <Badge key={t} tone="danger">{t}</Badge>)}
                        {s.pendingAdjustments.length > 0 && <Badge tone="wheat">Correction pending</Badge>}
                      </div>
                    </td>
                    {can("approvals.write") && (
                      <td className={`${td} text-right`}>
                        {!isRunning(s.status) && <Button variant="outline" size="sm" onClick={() => setFix(s)} data-testid={`button-correct-${s.id}`}><PencilLine size={14} /> Correct</Button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line"><tr><td className={td} colSpan={5}><span className="text-muted">{rows.length} shifts</span></td><td className={`${td} tabular text-right font-semibold`}>{hrs(total)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      {fix && (
        <CorrectionModal
          shift={fix}
          staffId={fix.staffId}
          onClose={() => setFix(null)}
          onDone={(m) => {
            setFix(null);
            show(m);
            reload();
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}
