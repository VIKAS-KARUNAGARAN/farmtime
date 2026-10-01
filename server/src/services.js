// Shared business logic used by several routers.
import { config } from "./config.js";
import { addDays, at, entryHours, minutesBetween, parseYmd, round1, round2, weekStart, ymd } from "./util.js";

export const STEPS = ["Review timesheets", "Approve hours", "Generate payslips", "Export to bank"];

/** Fortnightly pay periods anchored on Monday 5 Jan 2026. */
const PAY_ANCHOR = "2026-01-05";

export function payPeriodFor(date = ymd()) {
  const days = Math.floor((parseYmd(date) - parseYmd(PAY_ANCHOR)) / 86_400_000);
  const k = Math.floor(days / 14);
  const start = addDays(PAY_ANCHOR, k * 14);
  return { start, end: addDays(start, 13) };
}

/** The most recently completed fortnight, which is the one payroll processes. */
export function processingPeriod(today = ymd()) {
  const current = payPeriodFor(today);
  const start = addDays(current.start, -14);
  return { start, end: addDays(start, 13), payDate: addDays(current.start, 3), closes: addDays(current.start, 2) };
}

export function ensurePayrollRun(db, period = processingPeriod()) {
  let run = db.prepare("SELECT * FROM payroll_runs WHERE period_start = ?").get(period.start);
  if (!run) {
    db.prepare("INSERT INTO payroll_runs (id, period_start, period_end, pay_date, step) VALUES (?, ?, ?, ?, 0)").run(`pr_${period.start}`, period.start, period.end, period.payDate);
    run = db.prepare("SELECT * FROM payroll_runs WHERE period_start = ?").get(period.start);
  }
  return run;
}

export const entriesBetween = (db, from, toExclusive, extra = "", params = []) =>
  db
    .prepare(`SELECT * FROM time_entries WHERE clock_in >= ? AND clock_in < ? ${extra} ORDER BY clock_in`)
    .all(at(from, "00:00").toISOString(), at(toExclusive, "00:00").toISOString(), ...params);

export function payrollRows(db, run) {
  const employees = db.prepare("SELECT * FROM employees ORDER BY name").all();
  const entries = entriesBetween(db, run.period_start, addDays(run.period_end, 1), "AND clock_out IS NOT NULL");
  return employees
    .map((e) => {
      const mine = entries.filter((t) => t.employee_id === e.id);
      const counted = mine.filter((t) => t.status === "Approved" || t.status === "Pending");
      const excluded = mine.filter((t) => t.status === "Queried");
      const total = counted.reduce((s, t) => s + entryHours(t), 0);
      const ordinary = Math.min(config.ordinaryHoursPerFortnight, total);
      const overtime = Math.max(0, total - config.ordinaryHoursPerFortnight);
      const gross = ordinary * e.pay_rate + overtime * e.pay_rate * config.overtimeMultiplier;
      return {
        employeeId: e.id,
        name: e.name,
        initials: e.initials,
        rate: e.pay_rate,
        ordinary: round1(ordinary),
        overtime: round1(overtime),
        gross: round2(gross),
        superannuation: round2(gross * config.superRate),
        pending: counted.filter((t) => t.status === "Pending").length,
        queried: excluded.length,
        excludedHours: round1(excluded.reduce((s, t) => s + entryHours(t), 0)),
      };
    })
    .filter((r) => r.ordinary + r.overtime + r.excludedHours > 0);
}

export function weekHours(db, employeeId, ws = weekStart()) {
  const rows = entriesBetween(db, ws, addDays(ws, 7), "AND employee_id = ?", [employeeId]);
  return round1(rows.reduce((s, t) => s + entryHours(t), 0));
}

export function openEntry(db, employeeId) {
  return db.prepare("SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1").get(employeeId);
}

/** Employees currently clocked in (open entry started within the last 16 hours). */
export function onSite(db) {
  const since = new Date(Date.now() - 16 * 3600_000).toISOString();
  return db
    .prepare(
      `SELECT t.id AS entry_id, t.clock_in, t.method, e.id, e.name, e.initials, e.position, s.id AS station_id, s.name AS station
         FROM time_entries t
         JOIN employees e ON e.id = t.employee_id
         JOIN stations s ON s.id = t.station_id
        WHERE t.clock_out IS NULL AND t.clock_in >= ?
     ORDER BY t.clock_in`
    )
    .all(since);
}

export function missedClockOuts(db) {
  const before = new Date(Date.now() - 16 * 3600_000).toISOString();
  return db
    .prepare(
      `SELECT t.*, e.name FROM time_entries t JOIN employees e ON e.id = t.employee_id
        WHERE t.clock_out IS NULL AND t.clock_in < ? ORDER BY t.clock_in DESC`
    )
    .all(before);
}

/** Minutes late versus the rostered start (negative = early). null if not rostered. */
export function lateness(db, entry) {
  const d = ymd(new Date(entry.clock_in));
  const shift = db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(entry.employee_id, d);
  if (!shift) return null;
  return minutesBetween(at(d, shift.start_time), entry.clock_in);
}

export function shiftHours(s) {
  return (minutesBetween(at(s.date, s.start_time), at(s.date, s.end_time)) - s.break_min) / 60;
}

export function defaultBreak(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 5 * 60 ? 30 : 0;
}
