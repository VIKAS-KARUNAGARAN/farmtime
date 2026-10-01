"use client";
import { useState } from "react";
import { Download, Loader2, MessageSquare } from "lucide-react";
import { Badge, Button, ErrorState, Modal, PageHeader, PageLoading, Stat, Toast, statusTone } from "@/components/ui";
import type { Download as DL, Timesheet } from "@/lib/data";
import { api, ApiError, openDownload } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { money, money2, useToast } from "@/lib/format";

type Data = {
  period: { label: string };
  rate: number;
  totals: { hours: number; awaiting: number; estGross: number };
  timesheets: Timesheet[];
};

export default function Timesheets() {
  const { data, error, loading, reload } = useApi<Data>("/api/me/timesheets");
  const { toast, show } = useToast();
  const [responding, setResponding] = useState<Timesheet | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  async function exportCsv() {
    try {
      openDownload(await api<DL>("/api/me/timesheets/export", { body: {} }));
      show("Timesheet CSV downloaded");
    } catch (e) {
      show((e as ApiError).message);
    }
  }

  async function respond() {
    if (!responding) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/me/timesheets/${responding.id}/respond`, { body: { message: msg } });
      setResponding(null);
      setMsg("");
      show("Response sent to your supervisor");
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={`Current pay period ${data.period.label}`}
        title="My timesheets"
        desc="Hours are recorded when you clock in and out. Contact your supervisor if something looks wrong."
        actions={<Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export"><Download size={14} /> Export CSV</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Hours recorded" value={`${data.totals.hours.toFixed(1)} h`} sub="Last two pay periods" />
        <Stat label="Awaiting action" value={data.totals.awaiting} sub="Pending or queried" tone={data.totals.awaiting ? "warn" : undefined} />
        <Stat label="Est. gross pay" value={money(data.totals.estGross)} sub={`At ${money2(data.rate)}/h, before tax`} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">In</th>
              <th className="px-4 py-3 font-medium">Out</th>
              <th className="px-4 py-3 font-medium">Break</th>
              <th className="px-4 py-3 text-right font-medium">Hours</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.timesheets.map((t) => (
              <tr key={t.id} className="tabular align-top">
                <td className="px-4 py-3 font-medium">{t.dateLabel}</td>
                <td className="px-4 py-3 text-muted">{t.station}</td>
                <td className="px-4 py-3">{t.start}</td>
                <td className="px-4 py-3">{t.end}</td>
                <td className="px-4 py-3 text-muted">{t.breakMin ? `${t.breakMin} min` : "–"}</td>
                <td className="px-4 py-3 text-right">{t.hours.toFixed(1)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    {t.status === "Queried" && (
                      <button className="text-xs font-medium text-staff hover:underline" onClick={() => { setResponding(t); setErr(null); }} data-testid={`button-respond-${t.id}`}>
                        Respond
                      </button>
                    )}
                  </div>
                  {t.status === "Queried" && t.queryNote && <p className="mt-1 max-w-[220px] text-xs text-muted">{t.queryNote}</p>}
                  {t.status === "Pending" && t.staffNote && <p className="mt-1 max-w-[220px] text-xs text-faint">You replied: {t.staffNote}</p>}
                </td>
              </tr>
            ))}
            {data.timesheets.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No timesheets in this period yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {responding && (
        <Modal title={`Respond to query · ${responding.dateLabel}`} onClose={() => setResponding(null)}>
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-sm"><MessageSquare size={15} className="mt-0.5 shrink-0 text-warn" /> {responding.queryNote}</p>
          <label htmlFor="resp" className="mb-1.5 block text-sm font-medium">Your response</label>
          <textarea id="resp" rows={3} className="input h-auto py-2" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Stayed back to finish row 14, confirmed with Jo." data-testid="input-response" />
          {err && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResponding(null)}>Cancel</Button>
            <Button variant="staff" onClick={respond} disabled={busy || msg.trim().length < 2} data-testid="button-send-response">
              {busy && <Loader2 size={15} className="animate-spin" />} Send response
            </Button>
          </div>
        </Modal>
      )}
      <Toast text={toast} />
    </div>
  );
}
