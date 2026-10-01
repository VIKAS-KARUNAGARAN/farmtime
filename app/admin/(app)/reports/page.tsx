"use client";
import { CardHead, ErrorState, PageHeader, PageLoading, Stat } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";

type Data = {
  window: { label: string };
  kpis: { hours: number; labourCostMonth: number; labourCostChangePct: number | null; overtimeSharePct: number; onTimePct: number };
  hoursByStation: { name: string; hours: number }[];
  overtimeByWeek: { week: string; hours: number }[];
};

export default function Reports() {
  const { data, error, loading, reload } = useApi<Data>("/api/admin/reports");
  if (loading && !data) return <PageLoading rows={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const maxH = Math.max(1, ...data.hoursByStation.map((h) => h.hours));
  const maxO = Math.max(1, ...data.overtimeByWeek.map((o) => o.hours));
  const k = data.kpis;
  const change = k.labourCostChangePct;
  return (
    <div>
      <PageHeader eyebrow="Reporting" title="Reports" desc="Labour hours, cost and overtime, calculated from recorded timesheets." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Hours, last 28 days" value={Math.round(k.hours).toLocaleString("en-AU")} />
        <Stat label="Labour cost, month to date" value={money(k.labourCostMonth)} sub={change === null ? "No prior-month data" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs same days last month`} />
        <Stat label="Overtime share" value={`${k.overtimeSharePct.toFixed(1)}%`} sub="Hours over 38 per week" tone={k.overtimeSharePct > 8 ? "warn" : undefined} />
        <Stat label="On-time clock-ins" value={`${Math.round(k.onTimePct)}%`} sub="Within 5 min of rostered start" tone={k.onTimePct >= 90 ? "ok" : "warn"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <CardHead title={`Hours by station · ${data.window.label.toLowerCase()}`} />
          <ul className="space-y-4 p-4">
            {data.hoursByStation.map((h) => (
              <li key={h.name}>
                <div className="mb-1.5 flex justify-between text-sm"><span>{h.name}</span><span className="tabular text-muted">{Math.round(h.hours)} h</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-admin transition-[width] duration-700" style={{ width: `${(h.hours / maxH) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <CardHead title="Overtime hours by week" />
          <div className="flex h-[220px] items-end gap-4 p-4 pt-8">
            {data.overtimeByWeek.map((o) => (
              <div key={o.week} className="flex flex-1 flex-col items-center gap-2">
                <span className="tabular text-xs text-muted">{o.hours.toFixed(1)}</span>
                <div className="w-full max-w-[48px] rounded-t-md bg-wheat transition-[height] duration-700" style={{ height: `${Math.max(2, (o.hours / maxO) * 140)}px` }} />
                <span className="text-xs text-faint">{o.week}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
