"use client";
import { useState } from "react";
import { Download, Search } from "lucide-react";
import { Badge, Button, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";

const LEVELS = [
  { id: "all", label: "All events" },
  { id: "security", label: "Security" },
  { id: "warn", label: "Warnings" },
  { id: "info", label: "Activity" },
] as const;

export default function Audit() {
  const { audit } = useStore();
  const [lvl, setLvl] = useState<(typeof LEVELS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const rows = audit.filter((e) => (lvl === "all" || e.level === lvl) && `${e.actor} ${e.action} ${e.target} ${e.source}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow="Governance" title="Audit trail" desc="A tamper-evident record of sign-ins, permission checks and data changes. Events from this session appear at the top." actions={<Button variant="outline" size="sm"><Download size={14} /> Export log</Button>} />
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input h-9 pl-9" placeholder="Search actor, action or target" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit trail" />
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
            {LEVELS.map((l) => (
              <button key={l.id} role="tab" aria-selected={lvl === l.id} onClick={() => setLvl(l.id)} className={`rounded-md px-2.5 py-1 text-[13px] ${lvl === l.id ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:text-fg"}`}>{l.label}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted">{e.time}</td>
                  <td className="px-4 py-3 font-medium">{e.actor}</td>
                  <td className="px-4 py-3">{e.action}</td>
                  <td className="px-4 py-3 text-muted">{e.target}</td>
                  <td className="px-4 py-3 text-xs text-muted">{e.source}</td>
                  <td className="px-4 py-3">
                    <Badge tone={e.level === "security" ? "admin" : e.level === "warn" ? "warn" : "neutral"}>{e.level === "security" ? "Security" : e.level === "warn" ? "Warning" : "Activity"}</Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No events match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
