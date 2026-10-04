"use client";
import Link from "@/lib/nav";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Coffee, Loader2, LogIn, LogOut, MapPin, PencilLine, Play, TimerReset, Users } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, Modal, NoticeBanner, PageLoading, Toast } from "@/components/ui";
import type { BreakReason, RosterShift, Rule, Shift, Station } from "@/lib/data";
import { api } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useStore } from "@/lib/store";
import { fmtClock, fmtDayLong, fmtHm, hrs, TZ, todayYmd, useToast } from "@/lib/format";
import { fmtDuration, useNow } from "@/lib/useNow";

type Clock = { state: "off" | "working" | "break"; onShift: boolean; onBreak: boolean; shift: Shift | null; stretch?: { longest: number; current: number; onBreak: boolean } };
type Home = {
  staff: { id: number; name: string; firstName: string; jobTitle: string | null; standardHours: number };
  clock: Clock;
  stations: Station[];
  breakReasons: BreakReason[];
  rule: Rule | null;
  today: RosterShift | null;
  nextShift: (RosterShift & { dateLabel: string }) | null;
  week: { start: string; hours: number; target: number };
  recentShifts: Shift[];
  pendingCorrections: number;
  leave: { annualHours: number; personalHours: number };
};

export default function StaffHome() {
  const { session } = useStore();
  const { data, error, loading, reload } = useApi<Home>("/api/me/home", { poll: 60_000 });
  const now = useNow();
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);
  const [station, setStation] = useState<number | "">("");
  const [notice, setNotice] = useState<string | null>(null);
  const [breakOpen, setBreakOpen] = useState(false);

  useEffect(() => {
    if (data && station === "") setStation(data.today?.stationId ?? data.stations[0]?.id ?? "");
  }, [data, station]);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const c = data.clock;
  const sh = c.shift;
  const openBreak = sh?.breaks.find((b) => !b.end) ?? null;
  const since = sh ? new Date(sh.clockIn).getTime() : null;
  const hour = Number(new Date(now).toLocaleString("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = session?.account.name.split(" ")[0] ?? data.staff.firstName;

  // Break rule: time since the last break ended (or since clock-in).
  const maxMin = (data.rule?.max_hours_without_break ?? 0) * 60;
  const lastWorkStart = sh && !openBreak ? new Date(sh.breaks.filter((b) => b.end).map((b) => b.end!).sort().at(-1) ?? sh.clockIn).getTime() : null;
  const dueAt = lastWorkStart && maxMin ? lastWorkStart + maxMin * 60_000 : null;
  const minsToDue = dueAt ? Math.round((dueAt - now) / 60_000) : null;

  // Live hours this week (closed shifts from the server + the open one).
  const live = sh && since ? Math.max(0, (now - since) / 3_600_000 - sh.unpaidBreakMinutes / 60 - (openBreak && !openBreak.paid ? (now - new Date(openBreak.start).getTime()) / 3_600_000 : 0)) : 0;
  const weekHours = data.week.hours + (sh && sh.date >= data.week.start ? live : 0);
  const target = data.week.target || 38;

  async function clockIn() {
    const r = await run("in", () => api<{ notice: string | null }>("/api/me/clock-in", { body: { stationId: station } }), "Clocked in.");
    if (r) {
      setNotice(r.notice);
      await reload();
    }
  }
  async function clockOut() {
    const r = await run("out", () => api<{ shift: Shift | null }>("/api/me/clock-out", { body: {} }), (x) => `Clocked out. ${x.shift ? hrs(x.shift.workedHours) + " worked." : ""}`);
    if (r) {
      setNotice(null);
      await reload();
    }
  }
  async function endBreak() {
    if (await run("bend", () => api("/api/me/break-end", { body: {} }), "Break ended. Back to work.")) await reload();
  }

  const stateLabel = c.state === "break" ? `On break · ${openBreak?.reason ?? ""}` : c.state === "working" ? "On shift" : "Off the clock";
  const timerMs = c.state === "break" && openBreak ? now - new Date(openBreak.start).getTime() : since ? now - since : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{fmtDayLong(todayYmd())}</p>
        <h1 className="mt-1 text-2xl font-bold">{greet}, {name}</h1>
      </div>

      {notice && <NoticeBanner tone="warn" text={notice} onClose={() => setNotice(null)} />}

      <section className={`card overflow-hidden ${c.state === "working" ? "border-staff/40" : c.state === "break" ? "border-warn/40" : ""}`} aria-label="Clock">
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${c.state === "working" ? "pulse-dot bg-ok" : c.state === "break" ? "bg-warn" : "bg-faint"}`} />
              <span className="font-medium" data-testid="text-clock-state">{stateLabel}</span>
              {sh && <span className="text-muted">· clocked in {fmtClock(sh.clockIn)} at {sh.station}</span>}
            </div>
            <p className="tabular mt-3 font-display text-[3rem] font-bold leading-none tracking-tight" data-testid="text-timer">
              {sh ? fmtDuration(timerMs) : "0:00:00"}
            </p>
            {c.state === "break" && openBreak && <p className="mt-1 text-xs text-muted">Break started {fmtClock(openBreak.start)} · {openBreak.paid ? "paid" : "unpaid"}</p>}
            {c.state === "working" && dueAt && (
              <p className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${minsToDue! <= 0 ? "bg-danger/10 text-danger" : minsToDue! <= 30 ? "bg-warn/10 text-warn" : "bg-surface-2 text-muted"}`} data-testid="text-break-due">
                <TimerReset size={13} />
                {minsToDue! <= 0 ? `Break overdue. Take a break now (${data.rule?.rule_name}: every ${data.rule?.max_hours_without_break} h).` : `Break due by ${fmtClock(new Date(dueAt).toISOString())} (${data.rule?.max_hours_without_break} h rule)`}
              </p>
            )}
            {c.state === "off" && (
              <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                <MapPin size={15} />
                <span>Station</span>
                <select value={station} onChange={(e) => setStation(Number(e.target.value))} className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg" data-testid="select-station">
                  {data.stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{data.today?.stationId === s.id ? " (rostered)" : ""}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-col gap-2 md:min-w-[220px]">
            {c.state === "off" && (
              <Button size="lg" variant="staff" className="h-16 text-base" onClick={clockIn} disabled={!!busy || station === ""} data-testid="button-clock-in">
                {busy === "in" ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Clock in
              </Button>
            )}
            {c.state === "working" && (
              <>
                <Button size="lg" variant="outline" className="h-12" onClick={() => setBreakOpen(true)} disabled={!!busy} data-testid="button-break-start">
                  <Coffee size={18} /> Start break
                </Button>
                <Button size="lg" variant="staff" className="h-12" onClick={clockOut} disabled={!!busy} data-testid="button-clock-out">
                  {busy === "out" ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Clock out
                </Button>
              </>
            )}
            {c.state === "break" && (
              <>
                <Button size="lg" variant="staff" className="h-12" onClick={endBreak} disabled={!!busy} data-testid="button-break-end">
                  {busy === "bend" ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} End break
                </Button>
                <Button size="lg" variant="outline" className="h-12" onClick={clockOut} disabled={!!busy} data-testid="button-clock-out">
                  <LogOut size={18} /> Clock out
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <CardHead title="Today’s shift" action={<Badge tone={data.today ? "staff" : "neutral"}>{data.today ? "Rostered" : "Not rostered"}</Badge>} />
          {data.today ? (
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              <Info icon={CalendarDays} label="Time" value={`${fmtHm(data.today.startTime)} – ${fmtHm(data.today.endTime)}${data.today.endsNextDay ? " (next day)" : ""}`} />
              <Info icon={MapPin} label="Station" value={data.today.station ?? "Any"} />
              <Info icon={Coffee} label="Meal break" value={data.today.mealBreakMinutes ? `${data.today.mealBreakMinutes} min unpaid` : "None (short shift)"} />
              {(data.today.team || data.today.site) && <Info icon={Users} label="Team / site" value={[data.today.team, data.today.site].filter(Boolean).join(" · ")} />}
              <Info icon={TimerReset} label="Expected hours" value={hrs(data.today.expectedHours)} />
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">You’re not rostered today. If you clock in, your manager is told.{data.nextShift ? ` Next shift: ${data.nextShift.dateLabel}, ${fmtHm(data.nextShift.startTime)}.` : ""}</p>
          )}
        </section>

        <section className="card p-4">
          <p className="text-[13px] text-muted">This week</p>
          <p className="tabular mt-1 font-display text-2xl font-bold" data-testid="text-week-hours">
            {weekHours.toFixed(1)} <span className="text-base font-medium text-muted">/ {target} h</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-staff transition-[width] duration-700" style={{ width: `${Math.min(100, (weekHours / target) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-faint">{data.nextShift ? `Next shift: ${data.nextShift.dateLabel} ${fmtHm(data.nextShift.startTime)} · ${data.nextShift.station ?? "any station"}` : "No upcoming shifts rostered"}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
            <div><p className="text-muted">Annual leave</p><p className="tabular font-medium">{hrs(data.leave.annualHours)}</p></div>
            <div><p className="text-muted">Personal leave</p><p className="tabular font-medium">{hrs(data.leave.personalHours)}</p></div>
          </div>
        </section>
      </div>

      <section className="card">
        <CardHead title="Recent shifts" action={<Link href="/staff/timesheets/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Timesheets <ArrowRight size={14} /></Link>} />
        {data.pendingCorrections > 0 && (
          <p className="flex items-center gap-2 border-b border-line bg-warn/5 px-4 py-2.5 text-[13px] text-muted"><PencilLine size={14} className="text-warn" /> {data.pendingCorrections} time correction{data.pendingCorrections === 1 ? "" : "s"} waiting for approval.</p>
        )}
        <ul className="divide-y divide-line">
          {data.recentShifts.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{fmtDayLong(t.date)}</p>
                <p className="text-xs text-muted">{fmtClock(t.clockIn)} – {fmtClock(t.clockOut)} · {t.station} · breaks {t.paidBreakMinutes + t.unpaidBreakMinutes} min ({t.unpaidBreakMinutes} unpaid)</p>
              </div>
              <span className="tabular shrink-0 text-muted">{hrs(t.workedHours)}</span>
            </li>
          ))}
          {data.recentShifts.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No finished shifts in the last two weeks.</li>}
        </ul>
      </section>

      {breakOpen && (
        <BreakModal
          reasons={data.breakReasons}
          onClose={() => setBreakOpen(false)}
          onDone={async () => {
            setBreakOpen(false);
            show("Break started.");
            await reload();
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function BreakModal({ reasons, onClose, onDone }: { reasons: BreakReason[]; onClose: () => void; onDone: () => void }) {
  const [reasonId, setReasonId] = useState<number | null>(reasons[0]?.id ?? null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/me/break-start", { body: { reasonId, note: note.trim() || undefined } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Start a break" onClose={onClose}>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm text-muted">What kind of break?</legend>
        {reasons.map((r) => (
          <label key={r.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${reasonId === r.id ? "border-staff bg-staff-soft" : "border-line"}`}>
            <span className="flex items-center gap-2">
              <input type="radio" name="reason" checked={reasonId === r.id} onChange={() => setReasonId(r.id)} className="accent-[hsl(var(--staff))]" />
              {r.label}
            </span>
            <Badge tone={r.paid ? "ok" : "neutral"}>{r.paid ? "Paid" : "Unpaid"}</Badge>
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block font-medium">Note (optional)</span>
        <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. water break in the heat" />
      </label>
      {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="staff" onClick={start} disabled={busy || reasonId == null} data-testid="button-confirm-break">
          {busy && <Loader2 size={16} className="animate-spin" />} Start break
        </Button>
      </div>
    </Modal>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="mt-0.5 text-staff" />
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
