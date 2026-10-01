"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CloudRain, Send, ThermometerSun, Wind } from "lucide-react";
import { Avatar, Button, PageHeader, Toast } from "@/components/ui";
import { DAYS, ROSTER, STATIONS, WEATHER } from "@/lib/data";
import { useStore } from "@/lib/store";

const stationTone: Record<string, string> = {
  "Orchard block B": "bg-staff-soft text-staff",
  "Packing shed": "bg-wheat-soft text-wheat",
  Dairy: "bg-admin-soft text-admin",
  "Seedling nursery": "bg-surface-2 text-muted",
};

export default function Roster() {
  const { staff, log, session } = useStore();
  const [toast, setToast] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2400); };
  const coverage = DAYS.map((_, d) => staff.filter((s) => ROSTER[s.id]?.[d]).length);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Roster"
        desc="Weekly shifts by person, colour-coded by station. Weather flags help you plan around heat and rain."
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line">
              <button className="p-2 text-muted hover:text-fg" aria-label="Previous week"><ChevronLeft size={16} /></button>
              <span className="px-2 text-sm font-medium">28 Sep – 4 Oct</span>
              <button className="p-2 text-muted hover:text-fg" aria-label="Next week"><ChevronRight size={16} /></button>
            </div>
            <Button
              variant="admin"
              size="sm"
              disabled={published}
              onClick={() => {
                setPublished(true);
                log({ actor: session!.account.name, action: "Published roster", target: "Week of 28 Sep", source: "Admin portal", level: "info" });
                flash("Roster published · staff notified");
              }}
            >
              <Send size={14} /> {published ? "Published" : "Publish roster"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        {STATIONS.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${stationTone[s.name].split(" ")[0]}`} /> {s.name}</span>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="w-[200px] px-4 py-3 text-left text-xs font-medium text-muted">Staff</th>
              {WEATHER.map((w) => (
                <th key={w.day} className="px-2 py-3 text-left">
                  <p className="text-xs font-semibold text-fg">{w.day}</p>
                  <p className={`mt-0.5 inline-flex items-center gap-1 text-xs font-normal ${w.flag === "Heat" ? "text-warn" : "text-muted"}`}>
                    {w.flag === "Heat" && <ThermometerSun size={12} />}
                    {w.flag === "Rain" && <CloudRain size={12} />}
                    {w.flag === "Wind" && <Wind size={12} />}
                    {w.temp}°
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={s.initials} size="sm" tone="admin" />
                    <div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="truncate text-xs text-muted">{s.role}</p></div>
                  </div>
                </td>
                {DAYS.map((d, i) => {
                  const shift = ROSTER[s.id]?.[i];
                  const heat = WEATHER[i].flag === "Heat" && s.station === "Orchard block B" && shift;
                  return (
                    <td key={d} className="px-2 py-2.5">
                      {shift ? (
                        <span className={`tabular block rounded-md px-2 py-1.5 text-xs font-medium ${stationTone[s.station]} ${heat ? "ring-1 ring-warn/60" : ""}`} title={heat ? "Outdoor shift on a heat day" : undefined}>
                          {shift}
                        </span>
                      ) : s.status === "On leave" ? (
                        <span className="block rounded-md border border-dashed border-line px-2 py-1.5 text-xs text-faint">Leave</span>
                      ) : (
                        <span className="block px-2 py-1.5 text-xs text-faint">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-surface-2/60">
              <td className="px-4 py-2.5 text-xs font-medium text-muted">Coverage</td>
              {coverage.map((c, i) => (
                <td key={i} className={`tabular px-2 py-2.5 text-xs font-medium ${c < 4 ? "text-warn" : "text-muted"}`}>{c} staff</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><span className="h-3 w-3 rounded-sm ring-1 ring-warn/60" /> Outlined shifts are outdoor work on a heat-flag day. Consider a 6 am start.</p>
      <Toast text={toast} />
    </div>
  );
}
