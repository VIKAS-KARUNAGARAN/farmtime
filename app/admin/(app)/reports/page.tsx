"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, CardHead, EmptyState, ErrorState, NoAccess, PageHeader, PageLoading, Stat, Toast, td, th } from "@/components/ui";
import type { Download as Dl } from "@/lib/data";
import { api, openDownload } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDay, hrs, money, money2, useToast } from "@/lib/format";

type Report = {
  from: string;
  to: string;
  totals: { shifts: number; hours: number; rosteredShifts: number; rosteredHours: number; lateArrivals: number; estimatedOrdinaryCost: number };
  byStaff: { staffId: number; name: string; shifts: number; hours: number; cost: number }[];
  byStation: { station: string; hours: number }[];
  byDay: { date: string; hours: number }[];
  exceptionsByType: { type: string; n: number }[];
};

function Bars({ items }: { items: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2 p-4">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted" title={i.label}>{i.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-admin" style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <span className="tabular text-xs">{i.text}</span>
        </li>
      ))}
      {items.length === 0 && <li className="py-4 text-center text-sm text-muted">No data</li>}
    </ul>
  );
}

export default function Reports() {
  const can = useCan();
  const allowed = can("reports.read");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const { data, error, loading, reload } = useApi<Report>(allowed ? `/api/admin/reports${range ? `?from=${range.from}&to=${range.to}` : ""}` : null);
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);

  if (!allowed) return <NoAccess what="Reports" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const t = data.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        desc="Worked hours from finished shifts, compared with the roster. Defaults to the last full pay fortnight."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">From <input type="date" className="input h-9 w-auto" value={range?.from ?? data.from} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: range?.to ?? data.to })} /></label>
            <label className="text-xs text-muted">To <input type="date" className="input h-9 w-auto" value={range?.to ?? data.to} onChange={(e) => e.target.value && setRange({ from: range?.from ?? data.from, to: e.target.value })} /></label>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("x", () => api<Dl>("/api/admin/reports/export", { body: { from: data.from, to: data.to } }).then(openDownload), "Download started.")} data-testid="button-export-report"><Download size={14} /> CSV</Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hours worked" value={hrs(t.hours)} sub={`${t.shifts} finished shifts`} />
        <Stat label="Hours rostered" value={hrs(t.rosteredHours)} sub={`${t.rosteredShifts} shifts · ${t.rosteredHours ? Math.round((t.hours / t.rosteredHours) * 100) : 0}% worked`} />
        <Stat label="Late arrivals" value={t.lateArrivals} tone={t.lateArrivals ? "warn" : undefined} sub="5+ min after rostered start" />
        <Stat label="Ordinary-rate cost" value={money(t.estimatedOrdinaryCost)} sub="Estimate before overtime and penalties" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card"><CardHead title="Hours by day" /><Bars items={data.byDay.map((d) => ({ label: fmtDay(d.date), value: d.hours, text: hrs(d.hours) }))} /></section>
        <div className="space-y-6">
          <section className="card"><CardHead title="Hours by station" /><Bars items={data.byStation.map((s) => ({ label: s.station, value: s.hours, text: hrs(s.hours) }))} /></section>
          <section className="card"><CardHead title="Exceptions by type" /><Bars items={data.exceptionsByType.map((x) => ({ label: x.type, value: x.n, text: String(x.n) }))} /></section>
        </div>
      </div>

      <section className="card overflow-hidden">
        <CardHead title="By staff member" />
        {data.byStaff.length === 0 ? (
          <EmptyState title="No finished shifts in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line"><tr><th className={th}>Staff</th><th className={`${th} text-right`}>Shifts</th><th className={`${th} text-right`}>Hours</th><th className={`${th} text-right`}>Ordinary-rate cost</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.byStaff.map((s) => (
                  <tr key={s.staffId}><td className={`${td} font-medium`}>{s.name}</td><td className={`${td} tabular text-right`}>{s.shifts}</td><td className={`${td} tabular text-right`}>{hrs(s.hours)}</td><td className={`${td} tabular text-right`}>{money2(s.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Toast text={toast} />
    </div>
  );
}
