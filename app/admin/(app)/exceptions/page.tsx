"use client";
import { useState } from "react";
import { BellRing, Check, Eye, Loader2, RotateCcw } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Field, Modal, NoAccess, PageHeader, PageLoading, Segmented, Toast, statusTone } from "@/components/ui";
import type { ExceptionRow } from "@/lib/data";
import { api } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, fmtDayLong, useToast } from "@/lib/format";

type Resp = { exceptions: ExceptionRow[]; counts: Partial<Record<ExceptionRow["status"], number>>; types: string[] };
type StatusFilter = "Open" | "Reviewed" | "Resolved" | "all";

export default function ExceptionsPage() {
  const can = useCan();
  const allowed = can("exceptions.write");
  const [status, setStatus] = useState<StatusFilter>("Open");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(status !== "all" ? { status } : {}), ...(type ? { type } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const { data, error, loading, reload } = useApi<Resp>(allowed ? `/api/admin/exceptions${qs ? `?${qs}` : ""}` : null);
  const { toast, show } = useToast();
  const { busy, run } = useBusy(show);
  const [note, setNote] = useState<{ x: ExceptionRow; to: ExceptionRow["status"] } | null>(null);

  if (!allowed) return <NoAccess what="Exceptions" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const patch = (x: ExceptionRow, body: { status?: string; notes?: string; managerNotified?: boolean }, msg: string) =>
    run(`x${x.id}`, () => api(`/api/admin/exceptions/${x.id}`, { method: "PATCH", body }), msg).then((r) => r && reload());

  return (
    <div>
      <PageHeader title="Exceptions" desc="Problems found in the clock data: missing clock-outs, breaks overdue under the active rule, unrostered clock-ins and wrong stations. Fix the time with a correction, then mark the exception resolved." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "Open", label: `Open (${data.counts.Open ?? 0})` },
            { value: "Reviewed", label: `Reviewed (${data.counts.Reviewed ?? 0})` },
            { value: "Resolved", label: `Resolved (${data.counts.Resolved ?? 0})` },
            { value: "all", label: "All" },
          ]}
        />
        <select className="input h-9 w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" data-testid="select-exception-type">
          <option value="">All types</option>
          {data.types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="text-xs text-muted">From <input type="date" className="input h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted">To <input type="date" className="input h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <section className="card overflow-hidden">
        {data.exceptions.length === 0 ? (
          <EmptyState title="Nothing here" text="No exceptions match these filters." />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.exceptions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-testid={`row-exc-${x.id}`}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {x.staffName} <Badge tone={x.type === "Missing clock-out" || x.type === "Break overdue" ? "danger" : "warn"}>{x.type}</Badge> <Badge tone={statusTone(x.status)}>{x.status}</Badge>
                    {x.managerNotified && <Badge tone="admin">Manager told</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {fmtDayLong(x.date)}{x.eventTime ? ` · clock event ${fmtDateTime(x.eventTime)}` : ""}{x.station ? ` · ${x.station}` : ""}{x.rule ? ` · ${x.rule}` : ""} · found {fmtDateTime(x.detectedAt)}
                  </p>
                  {x.notes && <p className="mt-1 text-xs text-faint">{x.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!x.managerNotified && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => patch(x, { managerNotified: true }, "Marked as manager told.")}><BellRing size={14} /> Manager told</Button>}
                  {x.status === "Open" && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setNote({ x, to: "Reviewed" })} data-testid={`button-review-${x.id}`}><Eye size={14} /> Reviewed</Button>}
                  {x.status !== "Resolved" && <Button variant="admin" size="sm" disabled={!!busy} onClick={() => setNote({ x, to: "Resolved" })} data-testid={`button-resolve-${x.id}`}><Check size={14} /> Resolve</Button>}
                  {x.status === "Resolved" && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => patch(x, { status: "Open" }, "Reopened.")}><RotateCcw size={14} /> Reopen</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {note && (
        <NoteModal
          x={note.x}
          to={note.to}
          busy={busy === `x${note.x.id}`}
          onClose={() => setNote(null)}
          onSave={async (text) => {
            const r = await run(`x${note.x.id}`, () => api(`/api/admin/exceptions/${note.x.id}`, { method: "PATCH", body: { status: note.to, notes: text || undefined } }), `Marked ${note.to.toLowerCase()}.`);
            if (r) {
              setNote(null);
              reload();
            }
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function NoteModal({ x, to, busy, onClose, onSave }: { x: ExceptionRow; to: string; busy: boolean; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Modal title={`Mark ${to.toLowerCase()}: ${x.staffName}`} onClose={onClose}>
      <Field label="Note (optional)" htmlFor="x-note" hint="Saved on the exception and in the audit trail. Replaces the current note.">
        <textarea id="x-note" rows={3} maxLength={200} className="input h-auto py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Clock-out added by correction #12" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="admin" disabled={busy} onClick={() => onSave(text.trim())} data-testid="button-save-exception">{busy && <Loader2 size={16} className="animate-spin" />} Mark {to.toLowerCase()}</Button>
      </div>
    </Modal>
  );
}
