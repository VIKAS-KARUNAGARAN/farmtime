"use client";
import Link from "@/lib/nav";
import { ArrowRight, ClipboardCheck, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { Avatar, Badge, Button, CardHead, EmptyState, ErrorState, PageHeader, PageLoading, Stat, statusTone } from "@/components/ui";
import type { ExceptionRow, Period, RosterShift, Rule, Station } from "@/lib/data";
import { useApi } from "@/lib/useApi";
import { useCan, useStore } from "@/lib/store";
import { fmtClock, fmtDayLong, fmtHm, fmtRange, hrs } from "@/lib/format";

type BoardRow = { staffId: number; name: string; roster: RosterShift | null; state: "not_in" | "late" | "working" | "break" | "done"; clockIn: string | null; clockOut: string | null; station: string | null; workedHours: number; unrostered?: boolean };
type Dash = {
  today: string;
  board: BoardRow[];
  onSite: number;
  onBreak: number;
  rostered: number;
  late: number;
  counts: { openExceptions: number; pendingAdjustments: number; pendingLeave: number; activeStaff: number };
  exceptions: ExceptionRow[];
  stations: Station[];
  payroll: { period: Period; step: number; approvedAt: string | null };
  rule: Rule | null;
};

const STATE: Record<BoardRow["state"], string> = { not_in: "Not in yet", late: "Late", working: "Working", break: "On break", done: "Finished" };
const STEPS = ["Not started", "Review", "Approved", "Payslips released", "Exported"];

export default function AdminHome() {
  const { session } = useStore();
  const can = useCan();
  const { data, error, loading, reload } = useApi<Dash>("/api/admin/dashboard", { poll: 60_000 });

  if (loading && !data) return <PageLoading rows={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const order: BoardRow["state"][] = ["late", "working", "break", "not_in", "done"];
  const board = [...data.board].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={fmtDayLong(data.today)}
        title={`Welcome back, ${session?.account.name.split(" ")[0] ?? ""}`}
        desc={data.rule ? `Break rule in use: ${data.rule.rule_name} (a break at least every ${data.rule.max_hours_without_break} h).` : undefined}
        actions={<Button variant="outline" size="sm" onClick={reload}><RefreshCw size={14} /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On site now" value={data.onSite} sub={`${data.onBreak} on break`} />
        <Stat label="Rostered today" value={data.rostered} sub={`${data.counts.activeStaff} active staff`} />
        <Stat label="Late arrivals" value={data.late} tone={data.late ? "warn" : undefined} sub="10+ min after rostered start" />
        <Stat label="Open exceptions" value={data.counts.openExceptions} tone={data.counts.openExceptions ? "danger" : "ok"} sub="Missing clock-outs, breaks, stations" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <CardHead title="Today on the farm" action={can("staff.read") ? <Link href="/admin/roster/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Roster <ArrowRight size={14} /></Link> : null} />
          {board.length === 0 ? (
            <EmptyState title="Nobody rostered or clocked in today" />
          ) : (
            <ul className="divide-y divide-line" data-testid="list-board">
              {board.map((b) => (
                <li key={b.staffId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar initials={b.name.split(" ").map((p) => p[0]).join("").slice(0, 2)} size="sm" tone={b.state === "working" ? "ok" : b.state === "late" ? "warn" : "neutral"} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-xs text-muted">
                        {b.roster ? `Rostered ${fmtHm(b.roster.startTime)}–${fmtHm(b.roster.endTime)}${b.roster.station ? ` · ${b.roster.station}` : ""}` : "Not rostered"}
                        {b.clockIn && ` · in ${fmtClock(b.clockIn)}${b.station ? ` at ${b.station}` : ""}`}
                        {b.clockOut && ` · out ${fmtClock(b.clockOut)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {b.unrostered && <Badge tone="warn">Unrostered</Badge>}
                    {b.state === "done" && <span className="tabular text-xs text-muted">{hrs(b.workedHours)}</span>}
                    <Badge tone={statusTone(b.state)}>{STATE[b.state]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <CardHead title="Needs attention" />
            <ul className="divide-y divide-line text-sm">
              <Todo show={can("approvals.write")} href="/admin/approvals/" icon={ClipboardCheck} label="Time corrections waiting" n={data.counts.pendingAdjustments} />
              <Todo show={can("approvals.write")} href="/admin/approvals/" icon={ClipboardCheck} label="Leave requests waiting" n={data.counts.pendingLeave} />
              <Todo show={can("exceptions.write")} href="/admin/exceptions/" icon={TriangleAlert} label="Open exceptions" n={data.counts.openExceptions} />
            </ul>
          </section>

          {can("payroll.process") && (
            <section className="card p-4">
              <p className="flex items-center gap-2 text-[13px] text-muted"><Wallet size={14} /> Last fortnight’s payroll</p>
              <p className="mt-1 text-sm font-medium">{fmtRange(data.payroll.period.start, data.payroll.period.end)}</p>
              <div className="mt-3 flex gap-1" aria-label={`Step ${data.payroll.step} of 4`}>
                {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= data.payroll.step ? "bg-admin" : "bg-surface-2"}`} />)}
              </div>
              <p className="mt-2 text-xs text-muted">Step {data.payroll.step} of 4 · {STEPS[data.payroll.step] ?? ""}</p>
              <Link href="/admin/payroll/" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-admin">Open payroll <ArrowRight size={14} /></Link>
            </section>
          )}

          <section className="card">
            <CardHead title="Stations" action={<Link href="/admin/stations/" className="text-[13px] text-muted hover:text-fg">Monitor</Link>} />
            <ul className="divide-y divide-line text-sm">
              {data.stations.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${s.online ? "bg-ok" : "bg-danger"}`} />{s.name}</span>
                  <span className="text-xs text-muted">{s.eventsToday} taps today{s.unsynced ? ` · ${s.unsynced} unsynced` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {can("exceptions.write") && (
        <section className="card overflow-hidden">
          <CardHead title="Latest open exceptions" action={<Link href="/admin/exceptions/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">All exceptions <ArrowRight size={14} /></Link>} />
          {data.exceptions.length === 0 ? (
            <EmptyState title="No open exceptions" text="Missing clock-outs, overdue breaks and station problems show here." />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.exceptions.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span><span className="font-medium">{e.staffName}</span> <span className="text-muted">· {e.type} · {fmtDayLong(e.date)}</span></span>
                  <span className="text-xs text-muted">{e.notes}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Todo({ show, href, icon: Icon, label, n }: { show: boolean; href: string; icon: typeof Wallet; label: string; n: number }) {
  if (!show) return null;
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
        <span className="flex items-center gap-2"><Icon size={15} className="text-faint" /> {label}</span>
        <Badge tone={n ? "warn" : "ok"}>{n}</Badge>
      </Link>
    </li>
  );
}
