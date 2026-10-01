"use client";
import { Fingerprint, KeyRound, Loader2, QrCode, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { Avatar, Badge, Button, ErrorState, PageHeader, PageLoading, Toast } from "@/components/ui";
import type { AuditEvent } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtClock, fmtWhen, useToast } from "@/lib/format";

const methodIcon = { "Staff PIN": KeyRound, "QR badge": QrCode, "Face check": Fingerprint } as const;

type Data = {
  stations: { id: string; name: string; method: string; device: string; online: boolean; lastSeen: string; people: { id: string; name: string; initials: string; since: string; method: string }[] }[];
  events: AuditEvent[];
};

export default function Stations() {
  const { data, error, loading, reload } = useApi<Data>("/api/admin/stations", { poll: 20_000 });
  const { toast, show } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

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
        desc="Live status of clock-in devices, who is on site at each station, and how they verified. Refreshes every 20 seconds."
        actions={<Button variant="outline" size="sm" onClick={() => { reload(); show("Refreshed"); }}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</Button>}
      />
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
                {st.online ? <Badge tone="ok"><Wifi size={11} /> Online</Badge> : <Badge tone="danger"><WifiOff size={11} /> Offline</Badge>}
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
                  {busy === st.id && <Loader2 size={12} className="animate-spin" />} {st.online ? "Simulate device going offline" : "Mark device back online"}
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
      <Toast text={toast} />
    </div>
  );
}
