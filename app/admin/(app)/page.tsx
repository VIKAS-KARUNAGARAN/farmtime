"use client";
import { FARM_NAME } from "@/lib/data";
import Link from "@/lib/nav";
import { useState } from "react";
import { ArrowRight, Check, CheckCheck, CloudRain, Loader2, MessageSquare, ThermometerSun, TriangleAlert, WifiOff, X } from "lucide-react";
import { Avatar, Badge, Button, CardHead, ErrorState, Modal, PageHeader, PageLoading, Stat, Toast, statusTone } from "@/components/ui";
import type { AuditEvent } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useStore } from "@/lib/store";
import { fmtClock, fmtWhen, useToast } from "@/lib/format";

type Dash = {
  kpis: { onSite: number; activeStaff: number; hoursToday: number; stationsWithActivity: number; pendingLeave: number; pendingTimesheets: number; payrollCloses: string; payDate: string };
  stations: { id: string; name: string; online: boolean; people: { id: string; name: string; initials: string; since: string }[] }[];
  alerts: { kind: "heat" | "offline" | "missed" | "rain"; title: string; body: string; entryId?: string }[];
  pendingLeave: { id: string; staffName: string; type: string; fromLabel: string; toLabel: string; days: number; note: string }[];
  recentActivity: AuditEvent[];
};
type Approvals = {
  timesheets: { id: string; staffName: string; dateLabel: string; station: string; start: string; end: string; hours: number; status: string; queryNote: string | null; staffNote: string | null; lateMinutes: number | null }[];
};

const ALERT_ICON = { heat: [ThermometerSun, "text-warn"], offline: [WifiOff, "text-danger"], missed: [TriangleAlert, "text-warn"], rain: [CloudRain, "text-muted"] } as const;

export default function AdminDashboard() {
  const { session } = useStore();
  const dash = useApi<Dash>("/api/admin/dashboard", { poll: 30_000 });
  const appr = useApi<Approvals>("/api/admin/approvals");
  const { toast, show } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [querying, setQuerying] = useState<Approvals["timesheets"][number] | null>(null);
  const [note, setNote] = useState("");

  if (dash.loading && !dash.data) return <PageLoading />;
  if (dash.error && !dash.data) return <ErrorState error={dash.error} onRetry={dash.reload} />;
  const d = dash.data!;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pendingTs = appr.data?.timesheets.filter((t) => t.status === "Pending") ?? [];
  const queriedTs = appr.data?.timesheets.filter((t) => t.status === "Queried") ?? [];

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      show(ok);
      await Promise.all([dash.reload(), appr.reload()]);
    } catch (e) {
      show((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const decide = (id: string, status: "Approved" | "Declined", who: string) =>
    run(`leave-${id}`, () => api(`/api/admin/leave/${id}/decision`, { body: { status } }), `${status} leave for ${who}`);
  const approve = (ids: string[]) =>
    run(ids.length > 1 ? "approve-all" : `ts-${ids[0]}`, () => api("/api/admin/timesheets/approve", { body: { ids } }), `Approved ${ids.length} timesheet${ids.length === 1 ? "" : "s"}`);
  const closeMissed = (id: string) => run(`close-${id}`, () => api(`/api/admin/timesheets/${id}/close`, { body: {} }), "Closed at rostered finish. Sent for approval.");
  async function sendQuery() {
    if (!querying) return;
    const t = querying;
    await run(`q-${t.id}`, () => api(`/api/admin/timesheets/${t.id}/query`, { body: { note } }), `Query sent to ${t.staffName}`);
    setQuerying(null);
    setNote("");
  }

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greet}, ${session!.account.name.split(" ")[0]}`}
        desc={`Today’s operations at ${FARM_NAME}.`}
        actions={<Link href="/admin/roster/"><Button variant="admin" size="sm">Open roster <ArrowRight size={14} /></Button></Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="On site now" value={d.kpis.onSite} sub={`of ${d.kpis.activeStaff} active staff`} />
        <Stat label="Hours logged today" value={`${d.kpis.hoursToday.toFixed(1)} h`} sub={`Across ${d.kpis.stationsWithActivity} station${d.kpis.stationsWithActivity === 1 ? "" : "s"}`} />
        <Stat
          label="Pending approvals"
          value={d.kpis.pendingLeave + d.kpis.pendingTimesheets}
          sub={`${d.kpis.pendingLeave} leave · ${d.kpis.pendingTimesheets} timesheets`}
          tone={d.kpis.pendingLeave + d.kpis.pendingTimesheets ? "warn" : undefined}
        />
        <Stat label="Payroll closes" value={d.kpis.payrollCloses} sub={`Pay date ${d.kpis.payDate}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <CardHead title="On site by station" action={<Link href="/admin/stations/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Station monitor <ArrowRight size={14} /></Link>} />
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {d.stations.map((st) => (
              <div key={st.id} className="bg-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{st.name}</p>
                  {st.online ? <span className="tabular text-xs text-muted">{st.people.length} on site</span> : <Badge tone="danger"><WifiOff size={11} /> Device offline</Badge>}
                </div>
                <ul className="mt-3 space-y-2">
                  {st.people.length === 0 && <li className="text-xs text-faint">Nobody clocked in</li>}
                  {st.people.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 text-sm">
                      <Avatar initials={p.initials} size="sm" tone="admin" />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular text-xs text-muted">since {fmtClock(p.since)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <CardHead title="Alerts" action={<span className="tabular text-xs text-faint">{d.alerts.length}</span>} />
          <ul className="divide-y divide-line text-sm">
            {d.alerts.map((a, i) => {
              const [Icon, cls] = ALERT_ICON[a.kind];
              return (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted">{a.body}</p>
                    {a.kind === "missed" && a.entryId && (
                      <button onClick={() => closeMissed(a.entryId!)} disabled={busy === `close-${a.entryId}`} className="mt-1.5 text-xs font-medium text-admin hover:underline disabled:opacity-50" data-testid="button-close-missed">
                        Close at rostered finish
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {d.alerts.length === 0 && <li className="px-4 py-6 text-center text-muted">No alerts right now.</li>}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <CardHead
            title="Timesheets awaiting approval"
            action={
              pendingTs.length > 1 && (
                <Button size="sm" variant="outline" onClick={() => approve(pendingTs.map((t) => t.id))} disabled={busy === "approve-all"} data-testid="button-approve-all">
                  {busy === "approve-all" ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />} Approve all {pendingTs.length}
                </Button>
              )
            }
          />
          {appr.loading && !appr.data ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />)}</div>
          ) : pendingTs.length + queriedTs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">All caught up.</p>
          ) : (
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {[...queriedTs, ...pendingTs].map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {t.staffName} <span className="font-normal text-muted">· {t.dateLabel}</span>
                      {t.status === "Queried" && <Badge tone={statusTone(t.status)}>Queried</Badge>}
                      {t.lateMinutes !== null && t.lateMinutes > 5 && <Badge tone="warn">{t.lateMinutes} min late</Badge>}
                    </p>
                    <p className="tabular text-xs text-muted">{t.start} – {t.end} · {t.hours.toFixed(1)} h · {t.station}</p>
                    {t.staffNote && <p className="mt-0.5 text-xs text-faint">Staff note: {t.staffNote}</p>}
                    {t.status === "Queried" && t.queryNote && <p className="mt-0.5 text-xs text-faint">Waiting on staff: {t.queryNote}</p>}
                  </div>
                  {t.status === "Pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setQuerying(t); setNote(""); }} aria-label={`Query ${t.staffName}`}><MessageSquare size={14} /> Query</Button>
                      <Button size="sm" variant="admin" onClick={() => approve([t.id])} disabled={busy === `ts-${t.id}`} data-testid={`button-approve-ts-${t.id}`}><Check size={14} /> Approve</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <CardHead title="Leave awaiting approval" />
          {d.pendingLeave.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">All caught up.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.pendingLeave.map((l) => (
                <li key={l.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{l.staffName}</p>
                  <p className="text-xs text-muted">{l.type} · {l.fromLabel}{l.toLabel !== l.fromLabel ? ` – ${l.toLabel}` : ""} · {l.days}d{l.note ? ` · “${l.note}”` : ""}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => decide(l.id, "Declined", l.staffName)} disabled={busy === `leave-${l.id}`} aria-label={`Decline ${l.staffName}`}><X size={14} /> Decline</Button>
                    <Button size="sm" variant="admin" onClick={() => decide(l.id, "Approved", l.staffName)} disabled={busy === `leave-${l.id}`} data-testid={`button-approve-${l.id}`}><Check size={14} /> Approve</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6">
        <CardHead title="Recent activity" action={<Link href="/admin/audit/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Audit trail <ArrowRight size={14} /></Link>} />
        <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0">
          {d.recentActivity.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-line px-4 py-2.5 text-sm md:border-b">
              <div className="min-w-0">
                <p className="truncate"><span className="font-medium">{e.actor}</span> <span className="text-muted">{e.action[0].toLowerCase() + e.action.slice(1)}</span></p>
                <p className="truncate text-xs text-faint">{e.target}</p>
              </div>
              <span className="tabular shrink-0 text-xs text-faint">{fmtWhen(e.at).replace("Today ", "")}</span>
            </li>
          ))}
        </ul>
      </section>

      {querying && (
        <Modal title={`Query ${querying.staffName} · ${querying.dateLabel}`} onClose={() => setQuerying(null)}>
          <p className="tabular mb-3 text-sm text-muted">{querying.start} – {querying.end} · {querying.hours.toFixed(1)} h · {querying.station}</p>
          <label htmlFor="qnote" className="mb-1.5 block text-sm font-medium">What needs checking?</label>
          <textarea id="qnote" rows={3} className="input h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`e.g. Please confirm your ${querying.end} finish.`} data-testid="input-query-note" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setQuerying(null)}>Cancel</Button>
            <Button variant="admin" onClick={sendQuery} disabled={note.trim().length < 3 || busy === `q-${querying.id}`} data-testid="button-send-query">Send query</Button>
          </div>
        </Modal>
      )}
      <Toast text={toast} />
    </div>
  );
}
