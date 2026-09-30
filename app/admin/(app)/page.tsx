"use client";
import Link from "next/link";
import { ArrowRight, Check, CloudRain, ThermometerSun, TriangleAlert, WifiOff, X } from "lucide-react";
import { Avatar, Badge, Button, CardHead, PageHeader, Stat } from "@/components/ui";
import { PAY_PERIOD, STATIONS } from "@/lib/data";
import { liveStaff } from "@/lib/live";
import { useStore } from "@/lib/store";

export default function AdminDashboard() {
  const { session, staff, clock, leave, decideLeave, audit } = useStore();
  const people = liveStaff(staff, clock);
  const onSite = people.filter((p) => p.onSite);
  const pending = leave.filter((l) => l.status === "Pending");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greet}, ${session!.account.name.split(" ")[0]}`}
        desc="Today’s operations at Riverbend Farm."
        actions={<Link href="/admin/roster/"><Button variant="admin" size="sm">Open roster <ArrowRight size={14} /></Button></Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="On site now" value={onSite.length} sub={`of ${people.filter((p) => p.status === "Active").length} active staff`} />
        <Stat label="Hours logged today" value="41.5 h" sub="Across 4 stations" />
        <Stat label="Pending approvals" value={pending.length + 3} sub={`${pending.length} leave · 3 timesheets`} tone={pending.length ? "warn" : undefined} />
        <Stat label="Payroll closes" value="Tomorrow" sub={`Pay date ${PAY_PERIOD.payDate}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <CardHead title="On site by station" action={<Link href="/admin/stations/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Station monitor <ArrowRight size={14} /></Link>} />
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {STATIONS.map((st) => {
              const here = onSite.filter((p) => p.station === st.name);
              return (
                <div key={st.id} className="bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{st.name}</p>
                    {st.online ? <span className="tabular text-xs text-muted">{here.length} on site</span> : <Badge tone="danger"><WifiOff size={11} /> Device offline</Badge>}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {here.length === 0 && <li className="text-xs text-faint">Nobody clocked in</li>}
                    {here.map((p) => (
                      <li key={p.id} className="flex items-center gap-2.5 text-sm">
                        <Avatar initials={p.initials} size="sm" tone="admin" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="tabular text-xs text-muted">since {p.since}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <CardHead title="Alerts" />
          <ul className="divide-y divide-line text-sm">
            <li className="flex gap-3 px-4 py-3"><ThermometerSun size={16} className="mt-0.5 shrink-0 text-warn" /><div><p className="font-medium">Heat advisory Wed–Thu</p><p className="text-xs text-muted">34–36°C. Consider earlier orchard starts.</p></div></li>
            <li className="flex gap-3 px-4 py-3"><WifiOff size={16} className="mt-0.5 shrink-0 text-danger" /><div><p className="font-medium">Tablet SN-1 offline</p><p className="text-xs text-muted">Seedling nursery since 6:41 am.</p></div></li>
            <li className="flex gap-3 px-4 py-3"><TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" /><div><p className="font-medium">Missed clock-out</p><p className="text-xs text-muted">Ben Harris, yesterday 7:00 pm.</p></div></li>
            <li className="flex gap-3 px-4 py-3"><CloudRain size={16} className="mt-0.5 shrink-0 text-muted" /><div><p className="font-medium">Rain Saturday</p><p className="text-xs text-muted">Picking shifts may move to packing.</p></div></li>
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <CardHead title="Leave awaiting approval" />
          {pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">All caught up.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{l.staffName}</p>
                    <p className="text-xs text-muted">{l.type} · {l.from}{l.to !== l.from ? ` – ${l.to}` : ""} · {l.days}d{l.note ? ` · “${l.note}”` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => decideLeave(l.id, "Declined")} aria-label={`Decline ${l.staffName}`}><X size={14} /></Button>
                    <Button size="sm" variant="admin" onClick={() => decideLeave(l.id, "Approved")} data-testid={`button-approve-${l.id}`}><Check size={14} /> Approve</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <CardHead title="Recent activity" action={<Link href="/admin/audit/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">Audit trail <ArrowRight size={14} /></Link>} />
          <ul className="divide-y divide-line">
            {audit.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate"><span className="font-medium">{e.actor}</span> <span className="text-muted">{e.action[0].toLowerCase() + e.action.slice(1)}</span></p>
                  <p className="truncate text-xs text-faint">{e.target}</p>
                </div>
                <span className="tabular shrink-0 text-xs text-faint">{e.time.replace("Today ", "")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
