"use client";
import { useState } from "react";
import { Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Field, FormError, Modal, NoAccess, PageHeader, PageLoading, Toast, td, th } from "@/components/ui";
import type { Station } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, useToast } from "@/lib/format";

type Resp = { stations: Station[]; idTypes: string[] };

export default function StationsPage() {
  const can = useCan();
  const { data, error, loading, reload } = useApi<Resp>(can("staff.read") ? "/api/admin/stations" : null, { poll: 60_000 });
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);
  const [edit, setEdit] = useState<Station | "new" | null>(null);
  const write = can("stations.write");

  if (!can("staff.read")) return <NoAccess what="Station monitor" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Station monitor"
        desc="Clock-in stations around the farm. A station goes online when someone clocks in at it. Unsynced events are taps captured offline that haven’t reached the server yet."
        actions={write && <Button variant="admin" onClick={() => setEdit("new")} data-testid="button-add-station"><Plus size={16} /> Add station</Button>}
      />
      <section className="card overflow-hidden">
        {data.stations.length === 0 ? (
          <EmptyState title="No stations yet" text="Add the first clock-in point." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line"><tr>
                <th className={th}>Station</th><th className={th}>ID type</th><th className={th}>Status</th><th className={`${th} text-right`}>Taps today</th><th className={`${th} text-right`}>Unsynced</th><th className={th}>Last seen</th>{write && <th className={th} />}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.stations.map((s) => (
                  <tr key={s.id} data-testid={`row-station-${s.id}`}>
                    <td className={td}><span className="font-medium">{s.name}</span><p className="text-xs text-muted">{s.location ?? "—"}</p></td>
                    <td className={td}>{s.idType ?? "—"}</td>
                    <td className={td}><Badge tone={s.online ? "ok" : "danger"}>{s.online ? "Online" : "Offline"}</Badge></td>
                    <td className={`${td} tabular text-right`}>{s.eventsToday}</td>
                    <td className={`${td} tabular text-right ${s.unsynced ? "text-warn" : ""}`}>{s.unsynced}</td>
                    <td className={`${td} text-xs text-muted`}>{s.lastSeen ? fmtDateTime(s.lastSeen) : "Never"}</td>
                    {write && (
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" aria-label={s.online ? "Mark offline" : "Mark online"} disabled={!!busy} onClick={() => run(`p${s.id}`, () => api(`/api/admin/stations/${s.id}`, { method: "PATCH", body: { online: !s.online } }), `${s.name} marked ${s.online ? "offline" : "online"}.`).then((r) => r && reload())}><Power size={14} /></Button>
                          <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEdit(s)}><Pencil size={14} /></Button>
                          {!s.inUse && <Button variant="ghost" size="sm" aria-label="Delete" disabled={!!busy} onClick={() => run(`d${s.id}`, () => api(`/api/admin/stations/${s.id}`, { method: "DELETE" }), `${s.name} deleted.`).then((r) => r && reload())}><Trash2 size={14} /></Button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {write && <p className="mt-3 text-xs text-faint">Stations that have clock events or rostered shifts can’t be deleted, so history stays intact.</p>}
      {edit && <StationForm station={edit === "new" ? null : edit} idTypes={data.idTypes} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); show(m); reload(); }} />}
      <Toast text={toast} />
    </div>
  );
}

function StationForm({ station, idTypes, onClose, onSaved }: { station: Station | null; idTypes: string[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(station?.name ?? "");
  const [location, setLocation] = useState(station?.location ?? "");
  const [idType, setIdType] = useState(station?.idType ?? idTypes[0] ?? "QR");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("Enter a station name.");
    setBusy(true);
    try {
      const body = { name: name.trim(), location: location.trim() || null, idType };
      if (station) await api(`/api/admin/stations/${station.id}`, { method: "PATCH", body });
      else await api("/api/admin/stations", { body });
      onSaved(station ? "Station saved." : "Station added.");
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={station ? `Edit ${station.name}` : "Add station"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="st-name"><input id="st-name" className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Orchard" data-testid="input-station-name" /></Field>
        <Field label="Location" htmlFor="st-loc"><input id="st-loc" className="input" maxLength={100} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Gate 3" /></Field>
        <Field label="How staff identify" htmlFor="st-id">
          <select id="st-id" className="input" value={idType} onChange={(e) => setIdType(e.target.value)}>{idTypes.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <FormError text={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="admin" onClick={save} disabled={busy} data-testid="button-save-station">{busy && <Loader2 size={16} className="animate-spin" />} Save</Button>
        </div>
      </div>
    </Modal>
  );
}
