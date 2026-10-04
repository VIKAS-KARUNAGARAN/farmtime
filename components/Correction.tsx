"use client";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Shift } from "@/lib/data";
import { adelaideToIso, fmtClock, fmtDayLong, isoToAdelaide } from "@/lib/format";
import { Button, Field, FormError, Modal } from "./ui";

type Option = { key: string; label: string; action: "ADD" | "EDIT" | "DELETE"; eventId: number; current: string | null; hint?: string };

/** Builds the corrections that make sense for one shift (time_adjustments: ADD / EDIT / DELETE). */
export function correctionOptions(s: Shift): Option[] {
  const o: Option[] = [];
  const missing = !s.clockOut && s.status === "missing_clock_out";
  if (missing) o.push({ key: "add_out", label: "Add the missing clock-out", action: "ADD", eventId: s.clockInEventId, current: null });
  for (const b of s.breaks) if (!b.end && missing) o.push({ key: `add_b${b.id}`, label: `Add the end of the ${b.reason.toLowerCase()} break (${fmtClock(b.start)})`, action: "ADD", eventId: b.startEventId, current: null });
  o.push({ key: "edit_in", label: `Change clock-in time (${fmtClock(s.clockIn)})`, action: "EDIT", eventId: s.clockInEventId, current: s.clockIn });
  if (s.clockOut && s.clockOutEventId) o.push({ key: "edit_out", label: `Change clock-out time (${fmtClock(s.clockOut)})`, action: "EDIT", eventId: s.clockOutEventId, current: s.clockOut });
  for (const b of s.breaks) {
    o.push({ key: `edit_bs${b.id}`, label: `Change ${b.reason.toLowerCase()} break start (${fmtClock(b.start)})`, action: "EDIT", eventId: b.startEventId, current: b.start });
    if (b.end && b.endEventId) o.push({ key: `edit_be${b.id}`, label: `Change ${b.reason.toLowerCase()} break end (${fmtClock(b.end)})`, action: "EDIT", eventId: b.endEventId, current: b.end });
  }
  if (missing) o.push({ key: "del", label: "Remove this clock-in (duplicate or accidental tap)", action: "DELETE", eventId: s.clockInEventId, current: s.clockIn, hint: "The clock-in is deleted once a manager approves." });
  return o;
}

export function CorrectionModal({ shift, staffId, onClose, onDone }: { shift: Shift; staffId?: number; onClose: () => void; onDone: (msg: string) => void }) {
  const options = useMemo(() => correctionOptions(shift), [shift]);
  const [key, setKey] = useState(options[0]?.key ?? "");
  const opt = options.find((x) => x.key === key)!;
  const start = isoToAdelaide(opt?.current ?? shift.clockIn);
  const [date, setDate] = useState(start.ymd);
  const [time, setTime] = useState(opt?.current ? start.hm : "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(k: string) {
    setKey(k);
    const o = options.find((x) => x.key === k)!;
    const v = isoToAdelaide(o.current ?? shift.clockIn);
    setDate(v.ymd);
    setTime(o.current ? v.hm : "");
  }

  async function submit() {
    setErr(null);
    if (opt.action !== "DELETE" && !time) return setErr("Enter the corrected time.");
    if (reason.trim().length < 3) return setErr("Give a reason so your manager can check it.");
    setBusy(true);
    try {
      const body = { action: opt.action, eventId: opt.eventId, newTimestamp: opt.action === "DELETE" ? undefined : adelaideToIso(date, time), reason: reason.trim(), ...(staffId ? { staffId } : {}) };
      await api(staffId ? "/api/admin/adjustments" : "/api/me/adjustments", { body });
      onDone(staffId ? "Correction raised. Another manager approves it." : "Correction sent for approval.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Correct ${fmtDayLong(shift.date)}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="What needs fixing?" htmlFor="c-kind">
          <select id="c-kind" className="input" value={key} onChange={(e) => pick(e.target.value)} data-testid="select-correction">
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </Field>
        {opt?.action !== "DELETE" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="c-date"><input id="c-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Correct time" htmlFor="c-time"><input id="c-time" type="time" className="input tabular" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-correction-time" /></Field>
          </div>
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{opt.hint}</p>
        )}
        <Field label="Reason" htmlFor="c-reason" hint="Required. It’s saved in the audit trail.">
          <textarea id="c-reason" rows={2} maxLength={200} className="input h-auto py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to clock out, left at 4:30 pm" data-testid="input-correction-reason" />
        </Field>
        <FormError text={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={staffId ? "admin" : "staff"} onClick={submit} disabled={busy} data-testid="button-submit-correction">
            {busy && <Loader2 size={16} className="animate-spin" />} {staffId ? "Raise correction" : "Send for approval"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function describeAdjustment(a: { action: string; eventType: string | null; adds: string | null; oldTimestamp: string | null; newTimestamp: string | null }) {
  const ev = { clock_in: "clock-in", clock_out: "clock-out", break_start: "break start", break_end: "break end" }[a.eventType ?? ""] ?? "time";
  if (a.action === "ADD") return `Add ${a.adds === "break_end" ? "break end" : "clock-out"} at ${fmtClock(a.newTimestamp)}`;
  if (a.action === "EDIT") return `Move ${ev} ${fmtClock(a.oldTimestamp)} → ${fmtClock(a.newTimestamp)}`;
  return `Remove ${ev} at ${fmtClock(a.oldTimestamp)}`;
}
