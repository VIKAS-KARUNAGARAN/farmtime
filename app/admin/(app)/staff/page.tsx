"use client";
import { useMemo, useState, type FormEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { Avatar, Badge, Button, PageHeader, Toast, statusTone } from "@/components/ui";
import { STATIONS, type StaffMember } from "@/lib/data";
import { liveStaff } from "@/lib/live";
import { useStore } from "@/lib/store";

const FILTERS = ["All", "Active", "Onboarding", "On leave"] as const;

export default function StaffPage() {
  const { staff, clock, addStaff } = useStore();
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const people = liveStaff(staff, clock);
  const rows = useMemo(
    () => people.filter((p) => (f === "All" || p.status === f) && `${p.name} ${p.role} ${p.station}`.toLowerCase().includes(q.toLowerCase())),
    [people, q, f]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Workforce"
        title="Staff management"
        desc="People records, onboarding status and pay rates. Pay-rate changes are logged in the audit trail."
        actions={<Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid="button-add-staff"><Plus size={14} /> Add staff</Button>}
      />
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input h-9 pl-9" placeholder="Search name, role or station" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" data-testid="input-search-staff" />
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Filter by status">
            {FILTERS.map((x) => (
              <button key={x} role="tab" aria-selected={f === x} onClick={() => setF(x)} className={`rounded-md px-2.5 py-1 text-[13px] ${f === x ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:text-fg"}`}>{x}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Station</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Pay rate</th>
                <th className="px-4 py-3 text-right font-medium">Hours (wk)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar initials={p.initials} tone="admin" size="sm" />
                      <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.role}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.station}</td>
                  <td className="px-4 py-3 text-muted">{p.type}</td>
                  <td className="tabular px-4 py-3 text-right">${p.rate.toFixed(2)}</td>
                  <td className="tabular px-4 py-3 text-right">{p.hoursWeek.toFixed(1)}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                  <td className="px-4 py-3 text-xs">{p.onSite ? <span className="inline-flex items-center gap-1.5 text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> On site</span> : <span className="text-faint">Off</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No staff match “{q}”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <AddStaff onClose={() => setOpen(false)} onAdd={(s) => { addStaff(s); setOpen(false); setToast(`${s.name} added · onboarding started`); setTimeout(() => setToast(null), 2400); }} />}
      <Toast text={toast} />
    </div>
  );
}

function AddStaff({ onClose, onAdd }: { onClose: () => void; onAdd: (s: Omit<StaffMember, "id" | "initials" | "onSite" | "hoursWeek">) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [station, setStation] = useState(STATIONS[0].name);
  const [type, setType] = useState<StaffMember["type"]>("Casual");
  const [rate, setRate] = useState("30.20");
  const [err, setErr] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().split(" ").length < 2) return setErr("Enter a first and last name.");
    if (!role.trim()) return setErr("Enter a position.");
    const r = parseFloat(rate);
    if (!(r >= 24.95)) return setErr("Pay rate must be at least the national minimum wage ($24.95/h).");
    onAdd({ name: name.trim(), role: role.trim(), station, type, rate: r, status: "Onboarding" });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="card fade-up relative w-full max-w-md space-y-4 p-5 shadow-lift" noValidate>
        <div className="flex items-center justify-between">
          <h2 id="add-title" className="font-sans text-base font-semibold tracking-normal">Add staff member</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg"><X size={18} /></button>
        </div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="n">Full name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="input-staff-name" /></div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="r">Position</label><input id="r" className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Picker" data-testid="input-staff-role" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="st">Station</label><select id="st" className="input" value={station} onChange={(e) => setStation(e.target.value)}>{STATIONS.map((s) => <option key={s.id}>{s.name}</option>)}</select></div>
          <div><label className="mb-1.5 block text-sm font-medium" htmlFor="ty">Type</label><select id="ty" className="input" value={type} onChange={(e) => setType(e.target.value as StaffMember["type"])}>{["Full-time", "Part-time", "Casual", "Seasonal"].map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="rt">Pay rate ($/h)</label><input id="rt" className="input tabular" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="admin" data-testid="button-save-staff">Add and start onboarding</Button>
        </div>
      </form>
    </div>
  );
}
