"use client";
import { useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import { Avatar, Badge, Button, ErrorState, Modal, PageHeader, PageLoading, Toast, statusTone } from "@/components/ui";
import type { StaffMember, Station } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/format";

const FILTERS = ["All", "Active", "Onboarding", "On leave", "Inactive"] as const;
const TYPES = ["Full-time", "Part-time", "Casual", "Seasonal"] as const;
const STATUSES = ["Active", "Onboarding", "On leave", "Inactive"] as const;
const MIN_WAGE = 24.95;

type Data = { employees: StaffMember[]; stations: Station[] };

export default function StaffPage() {
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("All");
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (f !== "All") params.set("status", f);
  const { data, error, loading, reload } = useApi<Data>(`/api/admin/employees?${params}`);
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const { toast, show } = useToast();

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Workforce"
        title="Staff management"
        desc="People records, onboarding status and pay rates. Pay-rate changes are logged in the audit trail."
        actions={<Button variant="admin" size="sm" onClick={() => setEditing("new")} disabled={!data} data-testid="button-add-staff"><Plus size={14} /> Add staff</Button>}
      />
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input h-9 pl-9" placeholder="Search name, position or station" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" data-testid="input-search-staff" />
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Filter by status">
            {FILTERS.map((x) => (
              <button key={x} role="tab" aria-selected={f === x} onClick={() => setF(x)} className={`rounded-md px-2.5 py-1 text-[13px] ${f === x ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:text-fg"}`}>{x}</button>
            ))}
          </div>
        </div>
        {!data ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-2" />)}</div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Station</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Pay rate</th>
                  <th className="px-4 py-3 text-right font-medium">Hours (wk)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Now</th>
                  <th className="px-4 py-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.employees.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={p.initials} tone="admin" size="sm" />
                        <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.position}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.station}</td>
                    <td className="px-4 py-3 text-muted">{p.type}</td>
                    <td className="tabular px-4 py-3 text-right">${p.rate.toFixed(2)}</td>
                    <td className="tabular px-4 py-3 text-right">{p.hoursWeek.toFixed(1)}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-xs">{p.onSite ? <span className="inline-flex items-center gap-1.5 text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> On site</span> : <span className="text-faint">Off</span>}</td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => setEditing(p)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Edit ${p.name}`} data-testid={`button-edit-${p.id}`}><Pencil size={14} /></button>
                    </td>
                  </tr>
                ))}
                {data.employees.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No staff match{q ? ` “${q}”` : " this filter"}.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && data && (
        <StaffForm
          person={editing === "new" ? null : editing}
          stations={data.stations}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); show(msg); reload(); }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function StaffForm({ person, stations, onClose, onSaved }: { person: StaffMember | null; stations: Station[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(person?.name ?? "");
  const [position, setPosition] = useState(person?.position ?? "");
  const [stationId, setStationId] = useState(person?.stationId ?? stations[0]?.id ?? "");
  const [type, setType] = useState<StaffMember["type"]>(person?.type ?? "Casual");
  const [status, setStatus] = useState<StaffMember["status"]>(person?.status ?? "Onboarding");
  const [rate, setRate] = useState(person ? person.rate.toFixed(2) : "30.20");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().split(/\s+/).length < 2) return setErr("Enter a first and last name.");
    if (!position.trim()) return setErr("Enter a position.");
    const r = parseFloat(rate);
    if (!(r >= MIN_WAGE)) return setErr(`Pay rate must be at least the national minimum wage ($${MIN_WAGE}/h).`);
    setBusy(true);
    setErr(null);
    const body = { name: name.trim(), position: position.trim(), stationId, type, rate: r, status };
    try {
      if (person) {
        await api(`/api/admin/employees/${person.id}`, { method: "PATCH", body });
        onSaved(`${body.name} updated${r !== person.rate ? " · pay-rate change logged" : ""}`);
      } else {
        await api("/api/admin/employees", { body });
        onSaved(`${body.name} added · onboarding started`);
      }
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={person ? `Edit ${person.name}` : "Add staff member"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="n">Full name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="input-staff-name" /></div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="r">Position</label><input id="r" className="input" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Picker" data-testid="input-staff-role" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="st">Station</label><select id="st" className="input" value={stationId} onChange={(e) => setStationId(e.target.value)}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="ty">Type</label><select id="ty" className="input" value={type} onChange={(e) => setType(e.target.value as StaffMember["type"])}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="rt">Pay rate ($/h)</label><input id="rt" className="input tabular" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="input-staff-rate" /></div>
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="ss">Status</label><select id="ss" className="input" value={status} onChange={(e) => setStatus(e.target.value as StaffMember["status"])}>{STATUSES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="admin" disabled={busy} data-testid="button-save-staff">{busy && <Loader2 size={15} className="animate-spin" />} {person ? "Save changes" : "Add and start onboarding"}</Button>
        </div>
      </form>
    </Modal>
  );
}
