"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, PencilLine } from "lucide-react";
import { Badge, Button, CardHead, EmptyState, ErrorState, PageHeader, PageLoading, SHIFT_STATUS, Toast, isRunning, statusTone } from "@/components/ui";
import { CorrectionModal, describeAdjustment } from "@/components/Correction";
import type { Adjustment, Download as Dl, Period, Shift } from "@/lib/data";
import { api, openDownload } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { addDays, fmtClock, fmtDateTime, fmtDay, fmtRange, hrs, useToast } from "@/lib/format";

type Resp = { from: string; to: string; period: Period; shifts: Shift[]; totalHours: number };

export default function StaffTimesheets() {
  const [start, setStart] = useState<string | null>(null);
  const path = start ? `/api/me/timesheets?from=${start}&to=${addDays(start, 13)}` : "/api/me/timesheets";
  const { data, error, loading, reload } = useApi<Resp>(path);
  const adj = useApi<{ adjustments: Adjustment[] }>("/api/me/adjustments");
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);
  const [fix, setFix] = useState<Shift | null>(null);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const from = data.from;
  const to = data.to;
  const currentStart = data.period.start;
  const shown = start ?? currentStart;
  const isCurrent = shown >= currentStart;
  const flagged = data.shifts.filter((s) => s.status === "missing_clock_out").length;

  return (
    <div>
      <PageHeader
        title="Timesheets"
        desc="Your clock-ins, breaks and worked hours for each pay fortnight. Paid breaks count as worked time. If something’s wrong, request a correction and a manager approves it."
        actions={
          <Button variant="outline" size="sm" disabled={busy === "x"} onClick={() => run("x", () => api<Dl>("/api/me/timesheets/export", { body: { from, to } }).then(openDownload), "Download started.")} data-testid="button-export">
            <Download size={15} /> Download CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous fortnight" onClick={() => setStart(addDays(shown, -14))}><ChevronLeft size={16} /></Button>
          <span className="tabular px-3 text-sm font-medium" data-testid="text-period">{fmtRange(from, to)}</span>
          <Button variant="outline" size="sm" aria-label="Next fortnight" disabled={isCurrent} onClick={() => setStart(addDays(shown, 14))}><ChevronRight size={16} /></Button>
          {isCurrent && <Badge tone="staff" className="ml-2">Current</Badge>}
        </div>
        <p className="text-sm text-muted">Total <span className="tabular font-semibold text-fg">{hrs(data.totalHours)}</span>{flagged > 0 && <span className="ml-2 text-danger">· {flagged} missing clock-out</span>}</p>
      </div>

      <section className="card mb-6 overflow-hidden">
        {data.shifts.length === 0 ? (
          <EmptyState title="No shifts in this fortnight" text="Shifts appear here as soon as you clock in." />
        ) : (
          <ul className="divide-y divide-line">
            {data.shifts.map((s) => (
              <li key={s.id} className="px-4 py-3.5" data-testid={`row-shift-${s.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {fmtDay(s.date)}
                      <Badge tone={statusTone(s.status)}>{SHIFT_STATUS[s.status] ?? s.status}</Badge>
                      {s.overridden && <Badge tone="admin">Corrected</Badge>}
                      {s.unrostered && <Badge tone="warn">Unrostered</Badge>}
                      {s.pendingAdjustments.length > 0 && <Badge tone="wheat">Correction pending</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {fmtClock(s.clockIn)} – {s.clockOut ? fmtClock(s.clockOut) : "no clock-out"} · {s.station ?? "—"}
                      {s.roster && ` · rostered ${s.roster.startTime}–${s.roster.endTime}`}
                    </p>
                    {s.breaks.length > 0 && (
                      <p className="mt-1 text-xs text-faint">
                        {s.breaks.map((b) => `${b.reason} ${fmtClock(b.start)}–${b.end ? fmtClock(b.end) : "?"} (${b.paid ? "paid" : "unpaid"})`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-sm font-medium">{s.clockOut ? hrs(s.workedHours) : "—"}</span>
                    {!isRunning(s.status) && (
                      <Button variant="outline" size="sm" onClick={() => setFix(s)} data-testid={`button-fix-${s.id}`}>
                        <PencilLine size={14} /> Correct
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <CardHead title="My correction requests" />
        <ul className="divide-y divide-line text-sm">
          {(adj.data?.adjustments ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{describeAdjustment(a)}</p>
                <p className="text-xs text-muted">{a.reason} · asked {fmtDateTime(a.requestedAt)} by {a.requestedByName}{a.approverName ? ` · ${a.status.toLowerCase()} by ${a.approverName}` : ""}</p>
              </div>
              <Badge tone={statusTone(a.status)}>{a.status}</Badge>
            </li>
          ))}
          {adj.data && adj.data.adjustments.length === 0 && <li className="px-4 py-6 text-center text-muted">No corrections requested.</li>}
        </ul>
      </section>

      {fix && (
        <CorrectionModal
          shift={fix}
          onClose={() => setFix(null)}
          onDone={(m) => {
            setFix(null);
            show(m);
            reload();
            adj.reload();
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}
