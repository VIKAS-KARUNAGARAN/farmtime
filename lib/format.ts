"use client";
import { useCallback, useRef, useState } from "react";

/** Every time on screen is shown in farm time (Adelaide), whatever the device's time zone. */
export const TZ = "Australia/Adelaide";

export function useToast(ms = 3200) {
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

/** ISO timestamp -> "7:32 am" (Adelaide). */
export const fmtClock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ }) : "—";

/** ISO timestamp -> "Sat 3 Oct, 7:32 am" (Adelaide). */
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }) : "—";

/** Today's date in Adelaide as YYYY-MM-DD. */
export const todayYmd = () => ymdOf(new Date());
export const ymdOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Calendar date (YYYY-MM-DD) helpers. These never shift with time zones. */
const parse = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
export const fmtDay = (ymd: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  ymd ? parse(ymd).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" }) : "—";
export const fmtDayLong = (ymd: string | null | undefined) => fmtDay(ymd, { weekday: "long", day: "numeric", month: "long" });
export const fmtRange = (a: string, b: string) => `${fmtDay(a, { day: "numeric", month: "short" })} – ${fmtDay(b, { day: "numeric", month: "short", year: "numeric" })}`;
export const addDays = (ymd: string, n: number) => {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekdayOf = (ymd: string) => parse(ymd).getUTCDay(); // 0 = Sunday
export const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));

/** "YYYY-MM-DD" + "HH:MM" in Adelaide -> ISO string (UTC). Handles daylight saving. */
export function adelaideToIso(ymd: string, hm: string) {
  const guess = new Date(`${ymd}T${hm}:00Z`);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess).map((p) => [p.type, p.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
    const want = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), +hm.slice(0, 2), +hm.slice(3, 5));
    guess.setTime(guess.getTime() + (want - shown));
  }
  return guess.toISOString();
}
/** ISO -> { ymd, hm } in Adelaide, for filling date/time inputs. */
export function isoToAdelaide(iso: string) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
  return { ymd: ymdOf(d), hm };
}

export const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const money2 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
export const hrs = (n: number | null | undefined) => (n == null ? "—" : `${(Math.round(n * 100) / 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })} h`);

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
