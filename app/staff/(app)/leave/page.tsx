"use client";
import { useState, type FormEvent } from "react";
import { Info, Loader2, Send } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, Field, FormError, PageHeader, PageLoading, Stat, Toast, statusTone } from "@/components/ui";
import type { LeaveRequest } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDateTime, fmtDay, hrs, todayYmd, useToast, weekdayOf, addDays } from "@/lib/format";

type Data = { types: LeaveRequest["type"][]; balances: { annualHours: number; personalHours: number; hoursPerDay: number }; requests: LeaveRequest[] };

function workingDays(from: string, to: string) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (![0, 6].includes(weekdayOf(d))) n++;
  return n;
}

export default function Leave() {
  const { data, error, loading, reload } = useApi<Data>("/api/me/leave");
  const { toast, show } = useToast();
  const [type, setType] = useState<LeaveRequest["type"]>("Annual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const b = data.balances;
  const days = from && to && to >= from ? workingDays(from, to) : 0;
  const need = days * b.hoursPerDay;
  const balance = type === "Annual" ? b.annualHours : type === "Personal" ? b.personalHours : null;
  const short = balance != null && need > balance;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!from || !to) return setErr("Choose a start and end date.");
    if (to < from) return setErr("The end date must be on or after the start date.");
    setBusy(true);
    try {
      const r = await api<{ request: LeaveRequest }>("/api/me/leave", { body: { type, startDate: from, endDate: to, note: note.trim() || undefined } });
      setFrom("");
      setTo("");
      setNote("");
      show(`Request for ${r.request.days} working day${r.request.days === 1 ? "" : "s"} sent to your manager.`);
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Leave" desc="Request leave and track its status. Balances are in hours; a working day is your standard weekly hours divided by 5." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Annual leave" value={hrs(b.annualHours)} sub={`${(b.annualHours / b.hoursPerDay).toFixed(1)} days`} />
        <Stat label="Personal leave" value={hrs(b.personalHours)} sub={`${(b.personalHours / b.hoursPerDay).toFixed(1)} days`} />
        <Stat label="Working day" value={hrs(b.hoursPerDay)} sub="Used to work out leave hours" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
          <h2 className="font-sans text-[15px] font-semibold tracking-normal">New request</h2>
          <Field label="Type" htmlFor="l-type">
            <select id="l-type" className="input" value={type} onChange={(e) => setType(e.target.value as LeaveRequest["type"])} data-testid="select-leave-type">
              {data.types.map((t) => <option key={t} value={t}>{t} leave</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day" htmlFor="l-from"><input id="l-from" type="date" min={todayYmd()} className="input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-leave-from" /></Field>
            <Field label="Last day" htmlFor="l-to"><input id="l-to" type="date" min={from || todayYmd()} className="input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-leave-to" /></Field>
          </div>
          {days > 0 && (
            <p className={`rounded-lg px-3 py-2 text-sm ${short ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"}`}>
              {days} working day{days === 1 ? "" : "s"} = {hrs(need)}{balance != null ? ` of your ${hrs(balance)}` : " (unpaid)"}{short ? ". Not enough balance." : "."}
            </p>
          )}
          <Field label="Note (optional)" htmlFor="l-note">
            <input id="l-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family holiday" />
          </Field>
          <FormError text={err} />
          <Button type="submit" variant="staff" className="w-full" disabled={busy} data-testid="button-submit-leave">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send request
          </Button>
        </form>

        <section className="card">
          <CardHead title="My requests" />
          <ul className="divide-y divide-line text-sm">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{r.type} leave · {r.days} day{r.days === 1 ? "" : "s"}</p>
                  <p className="text-xs text-muted">{fmtDay(r.startDate)} – {fmtDay(r.endDate)}{r.note ? ` · ${r.note}` : ""} · sent {fmtDateTime(r.createdAt)}</p>
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
            {data.requests.length === 0 && <li className="px-4 py-8 text-center text-muted">No leave requests yet.</li>}
          </ul>
          <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs text-muted">
            <Info size={14} className="mt-0.5 shrink-0" /> Need to change or cancel a request? Ask your manager.
          </p>
        </section>
      </div>
      <Toast text={toast} />
    </div>
  );
}
