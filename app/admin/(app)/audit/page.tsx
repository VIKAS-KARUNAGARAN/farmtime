"use client";
import { useEffect, useState } from "react";
import { Download, Info, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, NoAccess, PageHeader, PageLoading, Toast, td, th } from "@/components/ui";
import type { Download as Dl } from "@/lib/data";
import { api, openDownload } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, useToast } from "@/lib/format";

type Entry = { id: number; table: string; recordId: number; action: "INSERT" | "UPDATE" | "DELETE"; reason: string; changedBy: number; changedByName: string; changedAt: string; adjustmentId: number | null };
type Resp = { entries: Entry[]; tables: string[]; note: string };

export default function AuditPage() {
  const can = useCan();
  const allowed = can("audit.read");
  const [table, setTable] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = { ...(table ? { table } : {}), ...(query ? { q: query } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const qs = new URLSearchParams(params).toString();
  const { data, error, loading, reload } = useApi<Resp>(allowed ? `/api/admin/audit${qs ? `?${qs}` : ""}` : null);
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);

  if (!allowed) return <NoAccess what="Audit trail" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Audit trail"
        desc="Every change to staff, roster, clock times, leave, exceptions, payroll and settings, with who made it and why. Entries can’t be edited or deleted."
        actions={<Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("x", () => api<Dl>("/api/admin/audit/export", { body: params }).then(openDownload), "Download started.")} data-testid="button-export-audit"><Download size={14} /> CSV</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Search</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search reason or person" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input h-10 w-auto" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Table">
          <option value="">All records</option>
          {data.tables.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <label className="text-xs text-muted">From <input type="date" className="input h-10 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted">To <input type="date" className="input h-10 w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <section className="card overflow-hidden">
        {data.entries.length === 0 ? (
          <EmptyState title="No audit entries match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Record</th><th className={th}>Action</th><th className={th}>Reason</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} tabular whitespace-nowrap text-xs text-muted`}>{fmtDateTime(e.changedAt)}</td>
                    <td className={`${td} whitespace-nowrap font-medium`}>{e.changedByName}</td>
                    <td className={`${td} whitespace-nowrap text-xs`}>{e.table.replace(/_/g, " ")} #{e.recordId}{e.adjustmentId ? <span className="block text-faint">correction #{e.adjustmentId}</span> : null}</td>
                    <td className={td}><Badge tone={e.action === "DELETE" ? "danger" : e.action === "INSERT" ? "ok" : "admin"}>{e.action}</Badge></td>
                    <td className={`${td} text-muted`}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs text-muted"><Info size={14} className="mt-0.5 shrink-0" /> {data.note} Showing the latest {data.entries.length} entries; the CSV includes up to 1,000.</p>
      </section>
      <Toast text={toast} />
    </div>
  );
}
