"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Badge, Button, PageHeader, Stat, Toast, statusTone } from "@/components/ui";
import { MY_TIMESHEETS } from "@/lib/data";

export default function Timesheets() {
  const [toast, setToast] = useState<string | null>(null);
  const total = MY_TIMESHEETS.reduce((s, t) => s + t.hours, 0);
  const pending = MY_TIMESHEETS.filter((t) => t.status !== "Approved").length;
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };
  return (
    <div>
      <PageHeader
        eyebrow="Pay period 28 Sep – 11 Oct"
        title="My timesheets"
        desc="Hours are recorded when you clock in and out. Contact your supervisor if something looks wrong."
        actions={<Button variant="outline" size="sm" onClick={() => flash("Timesheet PDF prepared (demo)")}><Download size={14} /> Export</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Hours recorded" value={`${total.toFixed(1)} h`} sub="Last 6 shifts" />
        <Stat label="Awaiting action" value={pending} sub="Pending or queried" tone={pending ? "warn" : undefined} />
        <Stat label="Est. gross pay" value={`$${(total * 31.4).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`} sub="At $31.40/h, before tax" />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">In</th>
              <th className="px-4 py-3 font-medium">Out</th>
              <th className="px-4 py-3 font-medium">Break</th>
              <th className="px-4 py-3 text-right font-medium">Hours</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {MY_TIMESHEETS.map((t) => (
              <tr key={t.date} className="tabular">
                <td className="px-4 py-3 font-medium">{t.date}</td>
                <td className="px-4 py-3 text-muted">{t.station}</td>
                <td className="px-4 py-3">{t.start}</td>
                <td className="px-4 py-3">{t.end}</td>
                <td className="px-4 py-3 text-muted">{t.breakMin ? `${t.breakMin} min` : "–"}</td>
                <td className="px-4 py-3 text-right">{t.hours.toFixed(1)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    {t.status === "Queried" && <button className="text-xs font-medium text-staff hover:underline" onClick={() => flash("Response sent to your supervisor")}>Respond</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast text={toast} />
    </div>
  );
}
