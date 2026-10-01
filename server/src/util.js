import crypto from "node:crypto";

export const id = (prefix) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
export const nowIso = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the server's business time zone (process.env.TZ). */
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** Monday of the week containing the date. */
export function weekStart(s = ymd()) {
  const d = parseYmd(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return ymd(d);
}
/** Local date + HH:MM → Date */
export function at(dateStr, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = parseYmd(dateStr);
  d.setHours(h, m, 0, 0);
  return d;
}
export function hhmm(d) {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export function minutesBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}
export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;

export function dayLabel(s) {
  return parseYmd(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}
export function shortDate(s) {
  return parseYmd(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Count Mon–Fri days between two dates inclusive. */
export function weekdaysBetween(a, b) {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const dow = parseYmd(d).getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Paid hours for an entry (open entries count up to now). */
export function entryHours(e, now = new Date()) {
  const end = e.clock_out ? new Date(e.clock_out) : now;
  const mins = minutesBetween(e.clock_in, end) - (e.clock_out ? e.break_min : 0);
  return Math.max(0, mins / 60);
}

export function csv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

export const initialsOf = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
