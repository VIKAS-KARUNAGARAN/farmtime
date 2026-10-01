"use client";
import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, PageHeader, PageLoading, Stat, Toast, statusTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/format";

type Req = { id: string; type: string; from: string; to: string; fromLabel: string; toLabel: string; days: number; note: string; status: string };
type Data = { balances: { annualHours: number; personalHours: number }; types: string[]; requests: Req[] };

export default function Leave() {
  const { data, error, loading, reload } = useApi<Data>("/api/me/leave");
  const { toast, show } = useToast();
  const [type, setType] = useState("Annual leave");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!from || !to) return setErr("Choose a start and end date.");
    if (to < from) return setErr("The end date must be on or after the start date.");
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ days: number }>("/api/me/leave", { body: { type, from, to, note } });
      setFrom(""); setTo(""); setNote("");
      show(`Request for ${r.days} working day${r.days === 1 ? "" : "s"} sent to your manager`);
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/api/me/leave/${id}/cancel`, { body: {} });
      show("Request cancelled");
      reload();
    } catch (e) {
      show((e as ApiError).message);
    }
  }

  const pending = data.requests.filter((m) => m.status === "Pending").length;
  return (
    <div>
      <PageHeader eyebrow="Leave" title="Request time off" desc="Requests go to your supervisor for approval. You’ll get a notification when they respond." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Annual leave balance" value={`${data.balances.annualHours.toFixed(1)} h`} sub={`About ${Math.floor(data.balances.annualHours / 7.6)} days`} />
        <Stat label="Personal leave balance" value={`${data.balances.personalHours.toFixed(1)} h`} />
        <Stat label="Pending requests" value={pending} tone={pending ? "warn" : undefined} />
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
          <h2 className="font-sans text-[15px] font-semibold tracking-normal">New request</h2>
          <div>
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium">Leave type</label>
            <select id="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>{data.types.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="from" className="mb-1.5 block text-sm font-medium">From</label><input id="from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
            <div><label htmlFor="to" className="mb-1.5 block text-sm font-medium">To</label><input id="to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
          </div>
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium">Note <span className="font-normal text-faint">(optional)</span></label>
            <textarea id="note" rows={3} maxLength={300} className="input h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <Button type="submit" variant="staff" className="w-full" disabled={busy} data-testid="button-submit-leave">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit request
          </Button>
          <p className="text-xs text-faint">Weekends aren’t counted. Balances are deducted when a request is approved.</p>
        </form>
        <section className="card">
          <CardHead title="My requests" />
          {data.requests.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No leave requests yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.requests.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{l.type}</p>
                    <p className="text-xs text-muted">{l.fromLabel}{l.to !== l.from ? ` – ${l.toLabel}` : ""} · {l.days} day{l.days > 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {l.status === "Pending" && <button onClick={() => cancel(l.id)} className="text-xs text-muted hover:text-danger hover:underline">Cancel</button>}
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Toast text={toast} />
    </div>
  );
}
