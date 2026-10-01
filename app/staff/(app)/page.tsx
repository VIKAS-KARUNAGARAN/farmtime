"use client";
import Link from "@/lib/nav";
import { useState } from "react";
import { ArrowRight, Bell, CalendarDays, CloudSun, Coffee, LogIn, LogOut, MapPin, ShieldCheck, ThermometerSun } from "lucide-react";
import { Badge, Button, CardHead, statusTone } from "@/components/ui";
import { MY_TIMESHEETS, STATIONS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { fmtDuration, fmtTime, useNow } from "@/lib/useNow";

export default function StaffHome() {
  const { session, clock, clockIn, clockOut } = useStore();
  const now = useNow();
  const a = session!.account;
  const c = clock[a.id] ?? { since: null, station: a.station };
  const [station, setStation] = useState(c.station || STATIONS[0].name);
  const on = c.since !== null;
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date(now).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const weekHours = 26.5 + (on ? (now - (c.since as number)) / 3_600_000 : 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{today}</p>
        <h1 className="mt-1 text-2xl font-bold">{greet}, {a.name.split(" ")[0]}</h1>
      </div>

      <section className={`card overflow-hidden ${on ? "border-staff/40" : ""}`} aria-label="Clock">
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${on ? "pulse-dot bg-ok" : "bg-faint"}`} />
              <span className="font-medium">{on ? "On shift" : "Off the clock"}</span>
              {on && <span className="text-muted">since {fmtTime(c.since as number)}</span>}
            </div>
            <p className="tabular mt-3 font-display text-[3rem] font-bold leading-none tracking-tight" data-testid="text-timer">
              {on ? fmtDuration(now - (c.since as number)) : "0:00:00"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
              <label className="inline-flex items-center gap-2">
                <MapPin size={15} />
                <span className="sr-only">Station</span>
                <select
                  value={on ? c.station : station}
                  onChange={(e) => setStation(e.target.value)}
                  disabled={on}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg disabled:opacity-70"
                  data-testid="select-station"
                >
                  {STATIONS.map((s) => <option key={s.id}>{s.name}</option>)}
                </select>
              </label>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-ok" /> Verified session</span>
            </div>
          </div>
          <Button
            size="lg"
            variant={on ? "outline" : "staff"}
            className="h-16 w-full min-w-[200px] text-base md:w-auto"
            onClick={() => (on ? clockOut() : clockIn(station))}
            data-testid="button-clock"
          >
            {on ? <LogOut size={18} /> : <LogIn size={18} />}
            {on ? "Clock out" : "Clock in"}
          </Button>
        </div>
        {c.lastOut && !on && (
          <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-[13px] text-muted sm:px-6">Clocked out at {fmtTime(c.lastOut)}. Your timesheet has been sent for approval.</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <CardHead title="Today’s shift" action={<Badge tone="staff">Rostered</Badge>} />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Info icon={CalendarDays} label="Time" value="7:00 am – 3:30 pm" />
            <Info icon={MapPin} label="Station" value={a.station} />
            <Info icon={Coffee} label="Break" value="30 min unpaid" />
          </div>
          <div className="mx-4 mb-4 flex items-start gap-3 rounded-lg bg-warn/10 px-3 py-2.5 text-sm">
            <ThermometerSun size={16} className="mt-0.5 shrink-0 text-warn" />
            <p><span className="font-medium">Heat advisory, 34°C.</span> <span className="text-muted">Water breaks every 45 minutes. Shade tent at row 12.</span></p>
          </div>
        </section>

        <section className="card p-4">
          <p className="text-[13px] text-muted">This week</p>
          <p className="tabular mt-1 font-display text-2xl font-bold">{weekHours.toFixed(1)} <span className="text-base font-medium text-muted">/ 38 h</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-staff transition-[width] duration-700" style={{ width: `${Math.min(100, (weekHours / 38) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-faint">Next shift: Thu 7:00 am · {a.station}</p>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
            <CloudSun size={14} /> Thu 36°C · Fri windy · Sat rain
          </div>
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <CardHead title="Recent timesheets" action={<Link href="/staff/timesheets/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">View all <ArrowRight size={14} /></Link>} />
          <ul className="divide-y divide-line">
            {MY_TIMESHEETS.slice(0, 4).map((t) => (
              <li key={t.date} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.date}</p>
                  <p className="text-xs text-muted">{t.start} – {t.end} · {t.station}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-muted">{t.hours.toFixed(1)} h</span>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <CardHead title="Notifications" action={<Bell size={15} className="text-faint" />} />
          <ul className="divide-y divide-line text-sm">
            <li className="px-4 py-3"><p className="font-medium">Timesheet queried</p><p className="text-xs text-muted">Thu 24 Sep: please confirm your 3:41 pm finish.</p></li>
            <li className="px-4 py-3"><p className="font-medium">Roster published</p><p className="text-xs text-muted">Week of 5 Oct is now available.</p></li>
            <li className="px-4 py-3"><p className="font-medium">Leave approved</p><p className="text-xs text-muted">Personal leave, 2 Sep.</p></li>
          </ul>
        </section>
      </div>
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
