"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge, Button, ErrorState, Field, FormError, Modal, NoAccess, PageHeader, PageLoading, Toast } from "@/components/ui";
import type { LeaveRequest, RosterShift, Station } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { addDays, fmtDay, fmtRange, fmtShort, hrs, useToast } from "@/lib/format";

type Data = {
  week: string;
  days: string[];
  today: string;
  staff: { id: number; name: string; jobTitle: string | null; contractType: string; standardHours: number; rosteredHours: number }[];
  shifts: RosterShift[];
  leave: LeaveRequest[];
  stations: Station[];
  holidays: { date: string; name: string }[];
};
type Edit = { staffId: number; name: string; date: string; shift: RosterShift | null };

/** Same rule as the server: end = start + expected hours, plus a 30 min unpaid meal for shifts over 5 h. */
function endOf(start: string, hours: number) {
  if (!/^\d{2}:\d{2}$/.test(start) || !(hours > 0)) return null;
  const [h, m] = start.split(":").map(Number);
  const meal = hours > 5 ? 30 : 0;
  const t = h * 60 + m + Math.round(hours * 60) + meal;
  return { end: `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, nextDay: t >= 1440, meal };
}

export default function RosterPage() {
  const can = useCan();
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Data>(can("staff.read") ? `/api/admin/roster${week ? `?week=${week}` : ""}` : null);
  const { toast, show } = useToast(4000);
  const { busy, run } = useBusy(show);
  const [edit, setEdit] = useState<Edit | null>(null);
  const write = can("roster.write");

  if (!can("staff.read")) return <NoAccess what="Roster" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const holiday = new Map(data.holidays.map((h) => [h.date, h.name]));
  const shiftAt = (staffId: number, date: string) => data.shifts.find((s) => s.staffId === staffId && s.date === date) ?? null;
  const leaveAt = (staffId: number, date: string) => data.leave.find((l) => l.staffId === staffId && l.startDate <= date && l.endDate >= date) ?? null;
  const total = data.shifts.reduce((a, s) => a + s.expectedHours, 0);

  return (
    <div>
      <PageHeader
        title="Roster"
        desc={write ? "Click a day to add or change a shift. One shift per person per day. Past days are locked; fix those with a time correction." : "Read-only. Roster Admins and Managers can change shifts."}
        actions={
          write && (
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("copy", () => api<{ copied: number; skipped: number }>("/api/admin/roster/copy-week", { body: { from: addDays(data.week, -7), to: data.week } }), (r) => `Copied ${r.copied} shift${r.copied === 1 ? "" : "s"} from last week${r.skipped ? `, skipped ${r.skipped} (past day, already rostered or on leave)` : ""}.`).then((r) => r && reload())} data-testid="button-copy-week">
              {busy === "copy" ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />} Copy last week
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setWeek(addDays(data.week, -7))}><ChevronLeft size={16} /></Button>
          <span className="tabular px-3 text-sm font-medium" data-testid="text-week">{fmtRange(data.week, addDays(data.week, 6))}</span>
          <Button variant="outline" size="sm" aria-label="Next week" onClick={() => setWeek(addDays(data.week, 7))}><ChevronRight size={16} /></Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(null)}>This week</Button>
        </div>
        <p className="text-sm text-muted">{data.shifts.length} shifts · <span className="tabular">{hrs(total)}</span> rostered</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className="w-48 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.06em] text-faint">Staff</th>
              {data.days.map((d) => (
                <th key={d} className={`px-1.5 py-2.5 text-left text-xs font-medium ${d === data.today ? "text-admin" : "text-faint"}`}>
                  {fmtDay(d)}
                  {holiday.has(d) && <span className="mt-0.5 block truncate font-normal normal-case text-wheat" title={holiday.get(d)}>{holiday.get(d)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.staff.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className={`tabular text-xs ${p.rosteredHours > p.standardHours ? "text-warn" : "text-muted"}`}>{p.rosteredHours} / {p.standardHours} h · {p.contractType}</p>
                </td>
                {data.days.map((d) => {
                  const s = shiftAt(p.id, d);
                  const l = leaveAt(p.id, d);
                  const locked = d < data.today || !write;
                  if (l)
                    return (
                      <td key={d} className="px-1.5 py-1.5"><div className="rounded-md bg-wheat-soft px-2 py-1.5 text-xs text-wheat">{l.type} leave</div></td>
                    );
                  return (
                    <td key={d} className="px-1.5 py-1.5">
                      {s ? (
                        <button
                          disabled={locked}
                          onClick={() => setEdit({ staffId: p.id, name: p.name, date: d, shift: s })}
                          className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${locked ? "cursor-default border-line bg-surface-2 text-muted" : "border-admin/30 bg-admin-soft hover:border-admin"}`}
                          data-testid={`cell-${p.id}-${d}`}
                        >
                          <span className="tabular block font-medium text-fg">{fmtShort(s.startTime, s.endTime)}{s.endsNextDay ? " +1" : ""}</span>
                          <span className="block truncate">{s.station ?? "Any station"}{s.team ? ` · ${s.team}` : ""}</span>
                        </button>
                      ) : !locked ? (
                        <button onClick={() => setEdit({ staffId: p.id, name: p.name, date: d, shift: null })} className="flex h-[42px] w-full items-center justify-center rounded-md border border-dashed border-line text-faint hover:border-admin hover:text-admin" aria-label={`Add shift for ${p.name} on ${fmtDay(d)}`} data-testid={`cell-${p.id}-${d}`}>
                          <Plus size={14} />
                        </button>
                      ) : (
                        <div className="h-[42px]" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <ShiftEditor
          edit={edit}
          stations={data.stations}
          holiday={holiday.get(edit.date) ?? null}
          onClose={() => setEdit(null)}
          onSaved={(m) => {
            setEdit(null);
            show(m);
            reload();
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function ShiftEditor({ edit, stations, holiday, onClose, onSaved }: { edit: Edit; stations: Station[]; holiday: string | null; onClose: () => void; onSaved: (m: string) => void }) {
  const s = edit.shift;
  const [start, setStart] = useState(s?.startTime ?? "07:00");
  const [hours, setHours] = useState(String(s?.expectedHours ?? 8));
  const [stationId, setStationId] = useState<string>(s?.stationId ? String(s.stationId) : String(stations[0]?.id ?? ""));
  const [team, setTeam] = useState(s?.team ?? "");
  const [site, setSite] = useState(s?.site ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const end = endOf(start, Number(hours));

  async function save() {
    setErr(null);
    if (!end) return setErr("Enter a start time and expected hours (0.5 to 12).");
    setBusy("save");
    try {
      await api("/api/admin/roster/shifts", { method: "PUT", body: { id: s?.id, staffId: edit.staffId, date: edit.date, startTime: start, expectedHours: Number(hours), stationId: stationId ? Number(stationId) : null, team: team.trim() || null, site: site.trim() || null } });
      onSaved(s ? "Shift updated." : `Shift added for ${edit.name}.`);
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (!s) return;
    setBusy("del");
    try {
      await api(`/api/admin/roster/shifts/${s.id}`, { method: "DELETE" });
      onSaved("Shift removed.");
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={`${edit.name} · ${fmtDay(edit.date)}`} onClose={onClose}>
      <div className="space-y-4">
        {holiday && <Badge tone="wheat">Public holiday: {holiday}</Badge>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="r-start"><input id="r-start" type="time" step={900} className="input tabular" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-shift-start" /></Field>
          <Field label="Expected hours" htmlFor="r-hours"><input id="r-hours" type="number" min={0.5} max={12} step={0.25} className="input tabular" value={hours} onChange={(e) => setHours(e.target.value)} data-testid="input-shift-hours" /></Field>
        </div>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted" data-testid="text-shift-end">
          {end ? <>Ends <span className="font-medium text-fg">{end.end}{end.nextDay ? " next day" : ""}</span>{end.meal ? " (includes a 30 min unpaid meal break)" : " (no meal break under 5 h)"}</> : "Enter a valid start and hours."}
        </p>
        <Field label="Station" htmlFor="r-station">
          <select id="r-station" className="input" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Any station</option>
            {stations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Team" htmlFor="r-team"><input id="r-team" className="input" maxLength={50} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Orchard" /></Field>
          <Field label="Site" htmlFor="r-site"><input id="r-site" className="input" maxLength={50} value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Main Farm" /></Field>
        </div>
        <FormError text={err} />
        <div className="flex items-center justify-between gap-2">
          {s ? <Button variant="danger" size="sm" onClick={remove} disabled={!!busy} data-testid="button-delete-shift"><Trash2 size={14} /> Remove shift</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="admin" onClick={save} disabled={!!busy} data-testid="button-save-shift">{busy === "save" && <Loader2 size={16} className="animate-spin" />} Save shift</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
