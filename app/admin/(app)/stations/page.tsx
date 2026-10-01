"use client";
import { Fingerprint, KeyRound, QrCode, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Avatar, Badge, Button, PageHeader } from "@/components/ui";
import { STATIONS } from "@/lib/data";
import { liveStaff } from "@/lib/live";
import { useStore } from "@/lib/store";

const methodIcon = { "Staff PIN": KeyRound, "QR badge": QrCode, "Face check": Fingerprint } as const;

export default function Stations() {
  const { staff, clock, audit } = useStore();
  const people = liveStaff(staff, clock);
  const clockEvents = audit.filter((e) => e.action.startsWith("Clocked") || e.action === "Device offline");

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Station monitor" desc="Live status of clock-in devices, who is on site at each station, and how they verified." actions={<Button variant="outline" size="sm"><RefreshCw size={14} /> Refresh</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {STATIONS.map((st) => {
          const here = people.filter((p) => p.onSite && p.station === st.name);
          const M = methodIcon[st.method as keyof typeof methodIcon];
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
                <p className="tabular font-display text-2xl font-bold">{here.length} <span className="text-sm font-medium text-muted">on site</span></p>
                <ul className="mt-3 space-y-2">
                  {here.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 text-sm">
                      <Avatar initials={p.initials} size="sm" tone="admin" />
                      <span className="flex-1">{p.name}</span>
                      <span className="tabular text-xs text-muted">in {p.since}</span>
                    </li>
                  ))}
                  {here.length === 0 && <li className="text-sm text-faint">{st.online ? "Nobody clocked in yet" : "Device offline since 6:41 am. Staff can clock in from the Staff portal."}</li>}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
      <section className="card mt-6">
        <div className="border-b border-line px-4 py-3"><h2 className="font-sans text-[15px] font-semibold tracking-normal">Recent station activity</h2></div>
        <ul className="divide-y divide-line">
          {clockEvents.slice(0, 8).map((e) => (
            <li key={e.id} className="grid grid-cols-[88px_1fr] gap-3 px-4 py-2.5 text-sm sm:grid-cols-[110px_1fr_auto]">
              <span className="tabular text-xs text-faint">{e.time}</span>
              <span><span className="font-medium">{e.actor}</span> <span className="text-muted">{e.action[0].toLowerCase() + e.action.slice(1)} · {e.target}</span></span>
              <span className="col-start-2 text-xs text-faint sm:col-start-auto">{e.source}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
