"use client";
import Link from "@/lib/nav";
import { useEffect, useState } from "react";
import { ArrowRight, Bell, CalendarDays, CloudSun, Coffee, Loader2, LogIn, LogOut, MapPin, ShieldCheck, ThermometerSun } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, PageLoading, Toast, statusTone } from "@/components/ui";
import type { Timesheet } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useStore } from "@/lib/store";
import { fmtClock, fmtHm, useToast } from "@/lib/format";
import { fmtDuration, useNow } from "@/lib/useNow";

type Home = {
  employee: { id: string; name: string; position: string; station: string };
  clock: { onShift: boolean; since: string | null; station: string | null; lastOut: string | null };
  stations: { id: string; name: string; online: number }[];
  today: { start: string; end: string; breakMin: number; station: string; weather: { temp: number; flag: string } | null } | null;
  nextShift: { dateLabel: string; start: string; station: string } | null;
  week: { hours: number; target: number | null };
  weather: { date: string; label: string; temp: number; flag: string }[];
  recentTimesheets: Timesheet[];
  notifications: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[];
};

export default function StaffHome() {
  const { session } = useStore();
  const { data, error, loading, reload } = useApi<Home>("/api/me/home", { poll: 60_000 });
  const now = useNow();
  const { toast, show } = useToast();
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastOut, setLastOut] = useState<string | null>(null);

  useEffect(() => {
    if (data && !station) {
      const mine = data.stations.find((s) => s.name === data.employee.station);
      setStation(mine?.id ?? data.stations[0]?.id ?? "");
    }
  }, [data, station]);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const a = session!.account;
  const c = data.clock;
  const on = c.onShift;
  const since = c.since ? new Date(c.since).getTime() : null;
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date(now).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const weekHours = data.week.hours + (on && since ? (now - since) / 3_600_000 : 0);
  const target = data.week.target ?? 38;
  const heat = data.today?.weather?.flag === "Heat" ? data.today.weather : null;
  const outlook = data.weather.slice(1, 4).map((w) => `${w.label} ${w.flag ? w.flag.toLowerCase() : `${w.temp}°C`}`).join(" · ");

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await api("/api/me/clock-out", { body: {} });
        setLastOut(new Date().toISOString());
        show("Clocked out. Timesheet sent for approval.");
      } else {
        await api("/api/me/clock-in", { body: { stationId: station } });
        setLastOut(null);
        show("Clocked in.");
      }
      await reload();
    } catch (e) {
      show((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{todayLabel}</p>
        <h1 className="mt-1 text-2xl font-bold">{greet}, {a.name.split(" ")[0]}</h1>
      </div>

      <section className={`card overflow-hidden ${on ? "border-staff/40" : ""}`} aria-label="Clock">
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${on ? "pulse-dot bg-ok" : "bg-faint"}`} />
              <span className="font-medium">{on ? "On shift" : "Off the clock"}</span>
              {on && <span className="text-muted">since {fmtClock(c.since)}</span>}
            </div>
            <p className="tabular mt-3 font-display text-[3rem] font-bold leading-none tracking-tight" data-testid="text-timer">
              {on && since ? fmtDuration(now - since) : "0:00:00"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
              <label className="inline-flex items-center gap-2">
                <MapPin size={15} />
                <span className="sr-only">Station</span>
                {on ? (
                  <span className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg">{c.station}</span>
                ) : (
                  <select value={station} onChange={(e) => setStation(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg" data-testid="select-station">
                    {data.stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.online ? "" : " (offline)"}</option>
                    ))}
                  </select>
                )}
              </label>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-ok" /> Verified session</span>
            </div>
          </div>
          <Button size="lg" variant={on ? "outline" : "staff"} className="h-16 w-full min-w-[200px] text-base md:w-auto" onClick={toggle} disabled={busy || (!on && !station)} data-testid="button-clock">
            {busy ? <Loader2 size={18} className="animate-spin" /> : on ? <LogOut size={18} /> : <LogIn size={18} />}
            {on ? "Clock out" : "Clock in"}
          </Button>
        </div>
        {lastOut && !on && (
          <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-[13px] text-muted sm:px-6">Clocked out at {fmtClock(lastOut)}. Your timesheet has been sent for approval.</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <CardHead title="Today’s shift" action={<Badge tone={data.today ? "staff" : "neutral"}>{data.today ? "Rostered" : "Day off"}</Badge>} />
          {data.today ? (
            <>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <Info icon={CalendarDays} label="Time" value={`${fmtHm(data.today.start)} – ${fmtHm(data.today.end)}`} />
                <Info icon={MapPin} label="Station" value={data.today.station} />
                <Info icon={Coffee} label="Break" value={data.today.breakMin ? `${data.today.breakMin} min unpaid` : "No break"} />
              </div>
              {heat && (
                <div className="mx-4 mb-4 flex items-start gap-3 rounded-lg bg-warn/10 px-3 py-2.5 text-sm">
                  <ThermometerSun size={16} className="mt-0.5 shrink-0 text-warn" />
                  <p><span className="font-medium">Heat advisory, {heat.temp}°C.</span> <span className="text-muted">Water breaks every 45 minutes. Shade tent at row 12.</span></p>
                </div>
              )}
            </>
          ) : (
            <p className="p-4 text-sm text-muted">You’re not rostered today.{data.nextShift ? ` Next shift ${data.nextShift.dateLabel}, ${fmtHm(data.nextShift.start)}.` : ""}</p>
          )}
        </section>

        <section className="card p-4">
          <p className="text-[13px] text-muted">This week</p>
          <p className="tabular mt-1 font-display text-2xl font-bold">
            {weekHours.toFixed(1)} {data.week.target && <span className="text-base font-medium text-muted">/ {data.week.target} h</span>}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-staff transition-[width] duration-700" style={{ width: `${Math.min(100, (weekHours / target) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-faint">{data.nextShift ? `Next shift: ${data.nextShift.dateLabel} ${fmtHm(data.nextShift.start)} · ${data.nextShift.station}` : "No upcoming shifts rostered"}</p>
          {outlook && (
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <CloudSun size={14} /> {outlook}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <CardHead title="Recent timesheets" action={<Link href="/staff/timesheets/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">View all <ArrowRight size={14} /></Link>} />
          <ul className="divide-y divide-line">
            {data.recentTimesheets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.dateLabel}</p>
                  <p className="text-xs text-muted">{t.start} – {t.end} · {t.station}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-muted">{t.hours.toFixed(1)} h</span>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </div>
              </li>
            ))}
            {data.recentTimesheets.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No timesheets yet.</li>}
          </ul>
        </section>

        <section className="card">
          <CardHead title="Notifications" action={<Bell size={15} className="text-faint" />} />
          <ul className="divide-y divide-line text-sm">
            {data.notifications.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="flex items-center gap-2 font-medium">{!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-staff" aria-label="Unread" />}{n.title}</p>
                <p className="text-xs text-muted">{n.body}</p>
              </li>
            ))}
            {data.notifications.length === 0 && <li className="px-4 py-6 text-center text-muted">You’re all caught up.</li>}
          </ul>
        </section>
      </div>
      <Toast text={toast} />
    </div>
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
