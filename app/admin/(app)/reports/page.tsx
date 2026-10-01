"use client";
import { Download } from "lucide-react";
import { Button, CardHead, PageHeader, Stat } from "@/components/ui";
import { HOURS_BY_STATION, OVERTIME_TREND } from "@/lib/data";

export default function Reports() {
  const maxH = Math.max(...HOURS_BY_STATION.map((h) => h.hours));
  const maxO = Math.max(...OVERTIME_TREND.map((o) => o.hours));
  const total = HOURS_BY_STATION.reduce((a, b) => a + b.hours, 0);
  return (
    <div>
      <PageHeader eyebrow="Reporting" title="Reports" desc="Labour hours and overtime for the last five weeks." actions={<Button variant="outline" size="sm"><Download size={14} /> Download PDF</Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Hours this month" value={total.toLocaleString()} />
        <Stat label="Labour cost" value="$38.4k" sub="+4.2% vs Aug" />
        <Stat label="Overtime share" value="9.4%" tone="warn" />
        <Stat label="On-time clock-ins" value="96%" tone="ok" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <CardHead title="Hours by station · September" />
          <ul className="space-y-4 p-4">
            {HOURS_BY_STATION.map((h) => (
              <li key={h.name}>
                <div className="mb-1.5 flex justify-between text-sm"><span>{h.name}</span><span className="tabular text-muted">{h.hours} h</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-admin" style={{ width: `${(h.hours / maxH) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <CardHead title="Overtime hours by week" />
          <div className="flex h-[220px] items-end gap-4 p-4 pt-8">
            {OVERTIME_TREND.map((o) => (
              <div key={o.week} className="flex flex-1 flex-col items-center gap-2">
                <span className="tabular text-xs text-muted">{o.hours}</span>
                <div className="w-full max-w-[48px] rounded-t-md bg-wheat" style={{ height: `${(o.hours / maxO) * 140}px` }} />
                <span className="text-xs text-faint">{o.week}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
