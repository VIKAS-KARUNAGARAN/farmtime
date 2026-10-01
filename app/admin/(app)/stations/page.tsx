"use client";
import { Fingerprint, KeyRound, Loader2, Pencil, Plus, QrCode, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar, Badge, Button, ErrorState, Modal, PageHeader, PageLoading, Toast } from "@/components/ui";
import type { AuditEvent } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtClock, fmtWhen, useToast } from "@/lib/format";

const methodIcon = { "Staff PIN": KeyRound, "Station PIN": KeyRound, "QR badge": QrCode, "Face check": Fingerprint } as const;
const METHODS = ["Station PIN", "QR badge", "Face check"];
type StationRow = Data["stations"][number];

type Data = {
  stations: { id: string; name: string; method: string; device: string; online: boolean; lastSeen: string; people: { id: string; name: string; initials: string; since: string; method: string }[] }[];
  events: AuditEvent[];
};

export default function Stations() {
  const { data, error, loading, reload } = useApi<Data>("/api/admin/stations", { poll: 20_000 });
  const { toast, show } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<StationRow | "new" | null>(null);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  async function remove(st: StationRow) {
    if (!window.confirm(`Remove ${st.name}? Past clock-ins at this station are kept.`)) return;
    try {
      await api(`/api/admin/stations/${st.id}`, { method: "DELETE" });
      show(`${st.name} removed`);
      reload();
    } catch (e) {
      show((e as ApiError).message);
    }
  }

  async function setOnline(id: string, online: boolean, device: string) {
    setBusy(id);
    try {
      await api(`/api/admin/stations/${id}`, { method: "PATCH", body: { online } });
      show(`${device} marked ${online ? "online" : "offline"}`);
      reload();
    } catch (e) {
      show((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Station monitor"
        desc="Your clock-in stations, who is on site at each one, and how they verified. Refreshes every 20 seconds."
        actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { reload(); show("Refreshed"); }}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</Button><Button variant="admin" size="sm" onClick={() => setEditing("new")} data-testid="button-add-station"><Plus size={14} /> Add station</Button></div>}
      />
      {data.stations.length === 0 && (
        <div className="card p-8 text-center" data-testid="empty-stations">
          <p className="font-medium">No stations yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Add each place staff clock in, such as the packing shed or an orchard block. Then add your people in Staff management.</p>
          <Button variant="admin" size="sm" className="mt-4" onClick={() => setEditing("new")}><Plus size={14} /> Add your first station</Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.stations.map((st) => {
          const M = methodIcon[st.method as keyof typeof methodIcon] ?? KeyRound;
          return (
            <section key={st.id} className={`card ${st.online ? "" : "border-danger/30"}`}>
              <div className="flex items-start justify-between gap-3 border-b border-line p-4">
                <div>
                  <h2 className="font-sans text-[15px] font-semibold tracking-normal">{st.name}</h2>
                  <p className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                    <span>{st.device}</span>
                    <span className="inline-flex items-center gap-1"><M size={12} /> {st.method}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {st.online ? <Badge tone="ok"><Wifi size={11} /> Online</Badge> : <Badge tone="danger"><WifiOff size={11} /> Offline</Badge>}
                  <button onClick={() => setEditing(st)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Edit ${st.name}`}><Pencil size={13} /></button>
                  <button onClick={() => remove(st)} className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${st.name}`}><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="p-4">
                <p className="tabular font-display text-2xl font-bold">{st.people.length} <span className="text-sm font-medium text-muted">on site</span></p>
                <ul className="mt-3 space-y-2">
                  {st.people.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 text-sm">
                      <Avatar initials={p.initials} size="sm" tone="admin" />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular text-xs text-muted">in {fmtClock(p.since)}</span>
                    </li>
                  ))}
                  {st.people.length === 0 && (
                    <li className="text-sm text-faint">{st.online ? "Nobody clocked in yet" : `Device offline since ${fmtClock(st.lastSeen)}. Staff can clock in from the Staff portal.`}</li>
                  )}
                </ul>
                <button onClick={() => setOnline(st.id, !st.online, st.device)} disabled={busy === st.id} className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg disabled:opacity-50">
                  {busy === st.id && <Loader2 size={12} className="animate-spin" />} {st.online ? "Mark device offline" : "Mark device back online"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <section className="card mt-6">
        <div className="border-b border-line px-4 py-3"><h2 className="font-sans text-[15px] font-semibold tracking-normal">Recent station activity</h2></div>
        <ul className="divide-y divide-line">
          {data.events.map((e) => (
            <li key={e.id} className="grid grid-cols-[100px_1fr] gap-3 px-4 py-2.5 text-sm sm:grid-cols-[120px_1fr_auto]">
              <span className="tabular text-xs text-faint">{fmtWhen(e.at)}</span>
              <span><span className="font-medium">{e.actor}</span> <span className="text-muted">{e.action[0].toLowerCase() + e.action.slice(1)} · {e.target}</span></span>
              <span className="col-start-2 text-xs text-faint sm:col-start-auto">{e.source}</span>
            </li>
          ))}
          {data.events.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No station activity yet.</li>}
        </ul>
      </section>
      {editing && <StationForm station={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); show(m); reload(); }} />}
      <Toast text={toast} />
    </div>
  );
}

function StationForm({ station, onClose, onSaved }: { station: StationRow | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(station?.name ?? "");
  const [device, setDevice] = useState(station?.device ?? "");
  const [method, setMethod] = useState(station?.method ?? METHODS[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Enter a station name.");
    if (device.trim().length < 2) return setErr("Describe the device, e.g. Shed tablet.");
    setBusy(true);
    try {
      const body = { name: name.trim(), device: device.trim(), method };
      if (station) await api(`/api/admin/stations/${station.id}`, { method: "PATCH", body });
      else await api("/api/admin/stations", { body });
      onSaved(station ? `${body.name} updated` : `${body.name} added`);
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={station ? `Edit ${station.name}` : "Add station"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="sn">Station name</label><input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Packing shed" autoFocus data-testid="input-station-name" /></div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="sd">Device</label><input id="sd" className="input" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="e.g. Shed tablet" data-testid="input-station-device" /></div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor="sm">Verification</label><select id="sm" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{(METHODS.includes(method) ? METHODS : [method, ...METHODS]).map((m) => <option key={m}>{m}</option>)}</select></div>
        {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="admin" disabled={busy} data-testid="button-save-station">{busy && <Loader2 size={15} className="animate-spin" />} {station ? "Save" : "Add station"}</Button>
        </div>
      </form>
    </Modal>
  );
}
