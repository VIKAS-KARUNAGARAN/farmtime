const pad = (n) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the business time zone (process.env.TZ = Australia/Adelaide). */
export function ymd(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
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
export function weekStart(s = ymd()) {
  const d = parseYmd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}
/** Local date + 'HH:MM[:SS]' → Date */
export function at(dateStr, time) {
  const [h, m] = time.split(":").map(Number);
  const d = parseYmd(dateStr);
  d.setHours(h, m, 0, 0);
  return d;
}
export function hhmm(d) {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;
// Half-up to 2 dp like Postgres ROUND(numeric, 2); toFixed(6) removes float noise (1393.875 -> 1393.88).
export const round2 = (n) => Math.round(Number((n * 100).toFixed(6))) / 100;
export const isWeekend = (s) => [0, 6].includes(parseYmd(s).getDay());
export const dayLabel = (s) => parseYmd(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export function csv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
