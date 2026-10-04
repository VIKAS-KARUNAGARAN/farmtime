"use client";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Badge, Button, CardHead, EmptyState, ErrorState, NoAccess, PageHeader, PageLoading, Segmented, Toast, statusTone, td, th } from "@/components/ui";
import { describeAdjustment } from "@/components/Correction";
import type { Adjustment, LeaveRequest } from "@/lib/data";
import { api } from "@/lib/api";
import { useApi, useBusy } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, fmtDay, hrs, useToast } from "@/lib/format";

type Pending = { adjustments: Adjustment[]; leave: LeaveRequest[] };

export default function Approvals() {
  const can = useCan();
  const allowed = can("approvals.write");
  const { data, error, loading, reload } = useApi<Pending>(allowed ? "/api/admin/approvals" : null, { poll: 60_000 });
  const [hist, setHist] = useState<"Approved" | "Rejected">("Approved");
  const history = useApi<{ adjustments: Adjustment[] }>(allowed ? `/api/admin/adjustments?status=${hist}` : null);
  const { toast, show } = useToast(4000);
  const { busy, run } = useBusy(show);

  if (!allowed) return <NoAccess what="Approvals" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const decideAdj = (a: Adjustment, decision: "approve" | "reject") =>
    run(`a${a.id}${decision}`, () => api(`/api/admin/adjustments/${a.id}/decision`, { body: { decision } }), decision === "approve" ? `Correction approved for ${a.staffName}. Timesheet updated.` : "Correction rejected.").then((r) => {
      if (r) {
        reload();
        history.reload();
      }
    });
  const decideLeave = (l: LeaveRequest, decision: "approve" | "reject") =>
    run(`l${l.id}${decision}`, () => api(`/api/admin/leave/${l.id}/decision`, { body: { decision } }), decision === "approve" ? `Leave approved for ${l.staffName}.` : "Leave declined.").then((r) => r && reload());

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" desc="Time corrections and leave requests waiting for a decision. A correction must be approved by someone other than the person who raised it, and nobody approves their own time or leave." />

      <section className="card overflow-hidden">
        <CardHead title={`Time corrections (${data.adjustments.length})`} />
        {data.adjustments.length === 0 ? (
          <EmptyState title="No corrections waiting" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.adjustments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-testid={`row-adj-${a.id}`}>
                <div className="min-w-0">
                  <p className="font-medium">{a.staffName} · {describeAdjustment(a)}</p>
                  <p className="text-xs text-muted">
                    {a.oldTimestamp ? `Was ${fmtDateTime(a.oldTimestamp)}` : "No time recorded"}{a.newTimestamp ? ` → ${fmtDateTime(a.newTimestamp)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">“{a.reason}” · raised by {a.requestedByName} via {a.method}, {fmtDateTime(a.requestedAt)}</p>
                </div>
                {a.canDecide ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!!busy} onClick={() => decideAdj(a, "reject")} data-testid={`button-reject-adj-${a.id}`}><X size={14} /> Reject</Button>
                    <Button variant="admin" size="sm" disabled={!!busy} onClick={() => decideAdj(a, "approve")} data-testid={`button-approve-adj-${a.id}`}>
                      {busy === `a${a.id}approve` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                    </Button>
                  </div>
                ) : (
                  <Badge tone="neutral">Another manager must decide</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <CardHead title={`Leave requests (${data.leave.length})`} />
        {data.leave.length === 0 ? (
          <EmptyState title="No leave waiting" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line"><tr><th className={th}>Staff</th><th className={th}>Type</th><th className={th}>Dates</th><th className={`${th} text-right`}>Needs</th><th className={`${th} text-right`}>Balance</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.leave.map((l) => {
                  const short = l.balanceHours != null && (l.hoursNeeded ?? 0) > l.balanceHours;
                  return (
                    <tr key={l.id} data-testid={`row-leave-${l.id}`}>
                      <td className={td}><span className="font-medium">{l.staffName}</span>{l.note && <p className="text-xs text-muted">{l.note}</p>}</td>
                      <td className={td}>{l.type}</td>
                      <td className={`${td} whitespace-nowrap`}>{fmtDay(l.startDate)} – {fmtDay(l.endDate)}<p className="text-xs text-muted">{l.days} day{l.days === 1 ? "" : "s"}</p></td>
                      <td className={`${td} tabular text-right`}>{hrs(l.hoursNeeded)}</td>
                      <td className={`${td} tabular text-right ${short ? "text-danger" : ""}`}>{l.balanceHours == null ? "Unpaid" : hrs(l.balanceHours)}</td>
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => decideLeave(l, "reject")}><X size={14} /> Decline</Button>
                          <Button variant="admin" size="sm" disabled={!!busy || short} onClick={() => decideLeave(l, "approve")} data-testid={`button-approve-leave-${l.id}`}><Check size={14} /> Approve</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <CardHead title="Decided corrections" action={<Segmented label="History" value={hist} onChange={setHist} options={[{ value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }]} />} />
        <ul className="divide-y divide-line text-sm">
          {(history.data?.adjustments ?? []).slice(0, 50).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
              <div>
                <p className="font-medium">{a.staffName} · {describeAdjustment(a)}</p>
                <p className="text-xs text-muted">“{a.reason}” · raised by {a.requestedByName} · {a.status.toLowerCase()} by {a.approverName ?? "—"} {a.decidedAt ? fmtDateTime(a.decidedAt) : ""}</p>
              </div>
              <Badge tone={statusTone(a.status)}>{a.status}</Badge>
            </li>
          ))}
          {history.data && history.data.adjustments.length === 0 && <li className="px-4 py-6 text-center text-muted">None yet.</li>}
        </ul>
      </section>
      <Toast text={toast} />
    </div>
  );
}
