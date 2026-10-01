"use client";
import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Badge, Button, CardHead, PageHeader, Stat, Toast, statusTone } from "@/components/ui";
import { useStore } from "@/lib/store";

const TYPES = ["Annual leave", "Personal leave", "Unpaid leave", "Long service leave"];

function fmt(d: string) {
  return new Date(d + "T00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function Leave() {
  const { session, leave, submitLeave } = useStore();
  const mine = leave.filter((l) => l.staffName === session!.account.name);
  const [type, setType] = useState(TYPES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!from || !to) return setErr("Choose a start and end date.");
    if (to < from) return setErr("The end date must be on or after the start date.");
    const days = Math.round((+new Date(to) - +new Date(from)) / 86_400_000) + 1;
    submitLeave({ type, from: fmt(from), to: fmt(to), days, note });
    setErr(null); setFrom(""); setTo(""); setNote("");
    setToast("Leave request sent to your manager"); setTimeout(() => setToast(null), 2200);
  }

  return (
    <div>
      <PageHeader eyebrow="Leave" title="Request time off" desc="Requests go to your supervisor for approval. You’ll get a notification when they respond." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Annual leave balance" value="76.0 h" sub="About 10 days" />
        <Stat label="Personal leave balance" value="41.2 h" />
        <Stat label="Pending requests" value={mine.filter((m) => m.status === "Pending").length} />
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
          <h2 className="font-sans text-[15px] font-semibold tracking-normal">New request</h2>
          <div>
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium">Leave type</label>
            <select id="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="from" className="mb-1.5 block text-sm font-medium">From</label><input id="from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
            <div><label htmlFor="to" className="mb-1.5 block text-sm font-medium">To</label><input id="to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
          </div>
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium">Note <span className="font-normal text-faint">(optional)</span></label>
            <textarea id="note" rows={3} className="input h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <Button type="submit" variant="staff" className="w-full" data-testid="button-submit-leave"><Send size={15} /> Submit request</Button>
        </form>
        <section className="card">
          <CardHead title="My requests" />
          {mine.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No leave requests yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {mine.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{l.type}</p>
                    <p className="text-xs text-muted">{l.from}{l.to !== l.from ? ` – ${l.to}` : ""} · {l.days} day{l.days > 1 ? "s" : ""}</p>
                  </div>
                  <Badge tone={statusTone(l.status)}>{l.status}</Badge>
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
