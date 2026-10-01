"use client";
import { useCallback, useRef, useState } from "react";

export function useToast(ms = 2600) {
  const [toast, setToast] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (text: string) => {
      setToast(text);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setToast(null), ms);
    },
    [ms]
  );
  return { toast, show };
}

export const fmtClock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "—";

export function fmtWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay) return `Today ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ${time}`;
}

export const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const money2 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

/** "07:00" -> "7:00 am" */
export function fmtHm(hm: string | null | undefined) {
  if (!hm) return "—";
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** "07:00","15:30" -> "7–15:30" compact roster label */
export function fmtShort(start: string, end: string) {
  const c = (t: string) => t.replace(/^0/, "").replace(/:00$/, "");
  return `${c(start)}–${c(end)}`;
}
