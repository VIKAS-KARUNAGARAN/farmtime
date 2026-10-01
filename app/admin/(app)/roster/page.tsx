"use client";
import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CloudRain, Loader2, Plus, Send, ThermometerSun, Trash2, Wind } from "lucide-react";
import { Avatar, Button, ErrorState, Modal, PageHeader, PageLoading, Toast } from "@/components/ui";
import type { Station } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtShort, fmtWhen, useToast } from "@/lib/format";

type Shift = { id: string; start: string; end: string; breakMin: number; stationId: string; station: string; heat: boolean };
type Cell = { date: string; onLeave: boolean; shift: Shift | null };
type Row = { employee: { id: string; name: string; initials: string; position: string; stationId: string; station: string; status: string }; cells: Cell[] };
type Data = {
  weekStart: string;
  weekLabel: string;
  published: { by: string; at: string } | null;
  days: { date: string; label: string; temp: number | null; flag: string }[];
  rows: Row[];
  coverage: number[];
  stations: Station[];
};

const stationTone: Record<string, string> = {
  orchard: "bg-staff-soft text-staff",
  packing: "bg-wheat-soft text-wheat",
  dairy: "bg-admin-soft text-admin",
  nursery: "bg-surface-2 text-muted",
};

function shiftWeek(ymd: string, weeks: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Roster() {
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Data>(`/api/admin/roster${week ? `?week=${week}` : ""}`);
  const { toast, show } = useToast();
  const [edit, setEdit] = useState<{ row: Row; cell: Cell; label: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  if (loading && !data) return <PageLoading rows={4} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  async function publish() {
    setPublishing(true);
    try {
      const r = await api<{ notified: number }>("/api/admin/roster/publish", { body: { week: data!.weekStart } });
      show(`Roster published · ${r.notified} staff notified`);
      reload();
    } catch (e) {
      show((e as ApiError).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Roster"
        desc="Click any cell to add or change a shift. The server checks leave, a 12-hour maximum and 10 hours’ rest between shifts."
        actions={
          <>
            <div className={`flex items-center rounded-lg border border-line ${loading ? "opacity-60" : ""}`}>
              <button className="p-2 text-muted hover:text-fg" aria-label="Previous week" onClick={() => setWeek(shiftWeek(data.weekStart, -1))} data-testid="button-prev-week"><ChevronLeft size={16} /></button>
              <span className="tabular min-w-[120px] px-2 text-center text-sm font-medium">{data.weekLabel}</span>
              <button className="p-2 text-muted hover:text-fg" aria-label="Next week" onClick={() => setWeek(shiftWeek(data.weekStart, 1))} data-testid="button-next-week"><ChevronRight size={16} /></button>
            </div>
            {data.published ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok/10 px-3 py-1.5 text-[13px] text-ok" title={`By ${data.published.by}`}>
                <CheckCircle2 size={14} /> Published {fmtWhen(data.published.at)}
              </span>
            ) : (
              <Button variant="admin" size="sm" disabled={publishing} onClick={publish} data-testid="button-publish">
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish roster
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        {data.stations.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${stationTone[s.id]?.split(" ")[0] ?? "bg-surface-2"}`} /> {s.name}</span>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="w-[200px] px-4 py-3 text-left text-xs font-medium text-muted">Staff</th>
              {data.days.map((w) => (
                <th key={w.date} className="px-2 py-3 text-left">
                  <p className="text-xs font-semibold text-fg">{w.label} <span className="font-normal text-faint">{Number(w.date.slice(8))}</span></p>
                  <p className={`mt-0.5 inline-flex items-center gap-1 text-xs font-normal ${w.flag === "Heat" ? "text-warn" : "text-muted"}`}>
                    {w.flag === "Heat" && <ThermometerSun size={12} />}
                    {w.flag === "Rain" && <CloudRain size={12} />}
                    {w.flag === "Wind" && <Wind size={12} />}
                    {w.temp !== null ? `${w.temp}°` : "–"}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((row) => (
              <tr key={row.employee.id}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={row.employee.initials} size="sm" tone="admin" />
                    <div className="min-w-0"><p className="truncate font-medium">{row.employee.name}</p><p className="truncate text-xs text-muted">{row.employee.position}</p></div>
                  </div>
                </td>
                {row.cells.map((c, i) => (
                  <td key={c.date} className="px-2 py-2.5">
                    {c.onLeave && !c.shift ? (
                      <span className="block rounded-md border border-dashed border-line px-2 py-1.5 text-xs text-faint">Leave</span>
                    ) : (
                      <button
                        onClick={() => setEdit({ row, cell: c, label: `${data.days[i].label} ${Number(c.date.slice(8))}` })}
                        className={`group tabular block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium transition-[box-shadow] ${
                          c.shift ? `${stationTone[c.shift.stationId]} ${c.shift.heat ? "ring-1 ring-warn/60" : ""} hover:shadow-card` : "text-faint hover:bg-surface-2 hover:text-muted"
                        }`}
                        title={c.shift?.heat ? "Outdoor shift on a heat day" : undefined}
                        aria-label={c.shift ? `${row.employee.name} ${data.days[i].label}: ${c.shift.start} to ${c.shift.end}. Edit` : `Add shift for ${row.employee.name} on ${data.days[i].label}`}
                        data-testid={`cell-${row.employee.id}-${i}`}
                      >
                        {c.shift ? fmtShort(c.shift.start, c.shift.end) : <><span className="group-hover:hidden">–</span><Plus size={12} className="hidden group-hover:inline" /></>}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-surface-2/60">
              <td className="px-4 py-2.5 text-xs font-medium text-muted">Coverage</td>
              {data.coverage.map((c, i) => (
                <td key={i} className={`tabular px-2 py-2.5 text-xs font-medium ${c < 4 ? "text-warn" : "text-muted"}`}>{c} staff</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><span className="h-3 w-3 rounded-sm ring-1 ring-warn/60" /> Outlined shifts are outdoor work on a heat-flag day. Consider a 6 am start.</p>

      {edit && (
        <ShiftEditor
          {...edit}
          stations={data.stations}
          published={!!data.published}
          onClose={() => setEdit(null)}
          onSaved={(m) => { setEdit(null); show(m); reload(); }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function ShiftEditor({ row, cell, label, stations, published, onClose, onSaved }: { row: Row; cell: Cell; label: string; stations: Station[]; published: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const [start, setStart] = useState(cell.shift?.start ?? "07:00");
  const [end, setEnd] = useState(cell.shift?.end ?? "15:30");
  const [stationId, setStationId] = useState(cell.shift?.stationId ?? row.employee.stationId);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = row.employee.name.split(" ")[0];

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/admin/roster/shifts", { method: "PUT", body: { employeeId: row.employee.id, date: cell.date, start, end, stationId } });
      onSaved(`${cell.shift ? "Shift updated" : "Shift added"} for ${first}${published ? " · they’ve been notified" : ""}`);
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  }
  async function remove() {
    if (!cell.shift) return;
    setBusy(true);
    try {
      await api(`/api/admin/roster/shifts/${cell.shift.id}`, { method: "DELETE" });
      onSaved(`Shift removed for ${first}`);
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`${row.employee.name} · ${label}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="s-start" className="mb-1.5 block text-sm font-medium">Start</label><input id="s-start" type="time" step={900} className="input tabular" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-shift-start" /></div>
          <div><label htmlFor="s-end" className="mb-1.5 block text-sm font-medium">Finish</label><input id="s-end" type="time" step={900} className="input tabular" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-shift-end" /></div>
        </div>
        <div><label htmlFor="s-st" className="mb-1.5 block text-sm font-medium">Station</label><select id="s-st" className="input" value={stationId} onChange={(e) => setStationId(e.target.value)}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <p className="text-xs text-faint">Shifts over 5 hours include a 30-minute unpaid break.</p>
        {cell.onLeave && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{first} is on approved leave this day.</p>}
        {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {cell.shift ? (
            <Button variant="danger" size="sm" onClick={remove} disabled={busy} data-testid="button-remove-shift"><Trash2 size={14} /> Remove</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="admin" onClick={save} disabled={busy} data-testid="button-save-shift">{busy && <Loader2 size={15} className="animate-spin" />} Save shift</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
