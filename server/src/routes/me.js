// Staff workspace (Worker role): own clocking, breaks, timesheets, corrections,
// leave, profile and payslips. Everything is scoped to req.user.staffId.
import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { createDownload } from "./downloads.js";
import { activeRule, addException, hoursPerDay, isStale, loadShifts, longestStretch, periodFor, publicShift, rosterDto, staffDto } from "../domain.js";
import { addDays, csv, dayLabel, hhmm, round2, weekStart, ymd } from "../util.js";
import { audit } from "../audit.js";

export const LEAVE_TYPES = ["Annual", "Personal", "Unpaid"];
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function meRoutes(db) {
  const r = Router();

  r.use(async (req, _res, next) => {
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ? AND removed_at IS NULL").get(req.user.staffId);
    if (!s) return next(notFound("No active staff record is linked to this account."));
    req.staff = s;
    next();
  });

  const todayRoster = (staffId, date) =>
    db.prepare("SELECT r.*, st.name AS station_name FROM roster r LEFT JOIN stations st ON st.station_id = r.station_id WHERE r.staff_id = ? AND r.shift_date = ? ORDER BY r.start_time LIMIT 1").get(staffId, date);

  /** Latest shift that is still open (no clock-out), if any. */
  async function openShift(staffId) {
    const last = await db.prepare("SELECT event_id, event_type, event_timestamp FROM time_events WHERE staff_id = ? AND event_type IN ('clock_in','clock_out') ORDER BY event_timestamp DESC, event_id DESC LIMIT 1").get(staffId);
    if (!last || last.event_type !== "clock_in") return null;
    // Forgotten clock-out from an earlier shift: it stays as a missing clock-out for correction.
    if (isStale({ clockIn: last.event_timestamp, clockOut: null })) return null;
    const date = ymd(last.event_timestamp);
    return (await loadShifts(db, { from: date, to: date, staffId })).find((s) => s.clockInEventId === last.event_id) ?? null;
  }

  async function clockState(staffId) {
    const s = await openShift(staffId);
    if (!s) return { state: "off", onShift: false, onBreak: false, shift: null };
    const onBreak = s.breaks.some((b) => !b.end);
    return { state: onBreak ? "break" : "working", onShift: true, onBreak, shift: publicShift(s), stretch: longestStretch(s) };
  }

  const insertEvent = (staffId, stationId, type, ruleId, extra = {}) =>
    db
      .prepare(
        `INSERT INTO time_events (staff_id, station_id, event_type, event_timestamp, captured_at, synced_at, is_unrostered, sync_status, created_by, rule_id)
         VALUES (?, ?, ?, now(), now(), now(), ?, 'Synced', ?, ?) RETURNING event_id, event_timestamp`
      )
      .get(staffId, stationId, type, !!extra.unrostered, staffId, ruleId);

  const touchStation = (id) => id && db.prepare("UPDATE stations SET online = TRUE, last_seen = now() WHERE station_id = ?").run(id);

  r.get("/home", async (req, res) => {
    const s = req.staff;
    const today = ymd();
    const roster = await todayRoster(s.staff_id, today);
    const next = await db.prepare("SELECT r.*, st.name AS station_name FROM roster r LEFT JOIN stations st ON st.station_id = r.station_id WHERE r.staff_id = ? AND r.shift_date > ? ORDER BY r.shift_date, r.start_time LIMIT 1").get(s.staff_id, today);
    const wk = weekStart(today);
    const week = await loadShifts(db, { from: wk, to: addDays(wk, 6), staffId: s.staff_id });
    const recent = await loadShifts(db, { from: addDays(today, -14), to: today, staffId: s.staff_id });
    const pending = await db.prepare("SELECT COUNT(*) AS n FROM time_adjustments WHERE staff_id = ? AND status = 'Pending'").get(s.staff_id);
    res.json({
      staff: staffDto(s),
      clock: await clockState(s.staff_id),
      stations: await db.prepare("SELECT station_id AS id, name, location, id_type AS \"idType\", online FROM stations ORDER BY name").all(),
      breakReasons: await db.prepare("SELECT reason_id AS id, label, is_paid AS paid FROM break_reasons ORDER BY reason_id").all(),
      rule: await activeRule(db),
      today: rosterDto(roster),
      nextShift: next ? { ...rosterDto(next), dateLabel: dayLabel(next.shift_date) } : null,
      week: { start: wk, hours: round2(week.reduce((a, x) => a + x.workedHours, 0)), target: s.standard_hours },
      recentShifts: recent.filter((x) => x.clockOut).slice(-5).reverse().map(publicShift),
      pendingCorrections: pending.n,
      leave: { annualHours: s.annual_leave_hours, personalHours: s.personal_leave_hours },
    });
  });

  r.post("/clock-in", requirePermission("clock.self"), async (req, res) => {
    const { stationId } = z.object({ stationId: z.coerce.number().int() }).parse(req.body);
    const s = req.staff;
    const station = await db.prepare("SELECT * FROM stations WHERE station_id = ?").get(stationId);
    if (!station) throw badRequest("Choose a station.");
    const out = await db.transaction(async () => {
      if (await openShift(s.staff_id)) throw conflict("You’re already clocked in. Clock out first.");
      const today = ymd();
      const roster = await todayRoster(s.staff_id, today);
      const rule = await activeRule(db);
      const ev = await insertEvent(s.staff_id, stationId, "clock_in", rule?.rule_id ?? null, { unrostered: !roster });
      const flags = [];
      if (!roster) {
        await addException(db, { staffId: s.staff_id, eventId: ev.event_id, type: "Unrostered attempt", date: today, notes: `Clocked in at ${station.name} with no rostered shift` });
        flags.push("unrostered");
      } else if (roster.station_id && roster.station_id !== stationId) {
        await addException(db, { staffId: s.staff_id, eventId: ev.event_id, type: "Clocked in at wrong station", date: today, notes: `Rostered at ${roster.station_name}, clocked in at ${station.name}` });
        flags.push("wrong_station");
      }
      await touchStation(stationId);
      return { flags };
    });
    const notices = { unrostered: "You’re not on the roster today. Your manager has been told.", wrong_station: "This isn’t your rostered station. Your manager has been told." };
    res.status(201).json({ ok: true, flags: out.flags, notice: out.flags.map((f) => notices[f]).join(" ") || null, clock: await clockState(s.staff_id) });
  });

  r.post("/break-start", requirePermission("clock.self"), async (req, res) => {
    const b = z.object({ reasonId: z.coerce.number().int(), note: z.string().trim().max(200).optional() }).parse(req.body);
    const s = req.staff;
    const reason = await db.prepare("SELECT * FROM break_reasons WHERE reason_id = ?").get(b.reasonId);
    if (!reason) throw badRequest("Choose a break reason.");
    await db.transaction(async () => {
      const sh = await openShift(s.staff_id);
      if (!sh) throw conflict("Clock in before starting a break.");
      if (sh.breaks.some((x) => !x.end)) throw conflict("You’re already on a break.");
      const ev = await insertEvent(s.staff_id, sh.stationId, "break_start", (await activeRule(db))?.rule_id ?? null);
      await db.prepare("INSERT INTO breaks (start_event_id, reason_id, note) VALUES (?, ?, ?)").run(ev.event_id, reason.reason_id, b.note || null);
    });
    res.status(201).json({ ok: true, clock: await clockState(s.staff_id) });
  });

  async function endBreak(staffId, sh) {
    const open = sh.breaks.find((x) => !x.end);
    if (!open) return false;
    const ev = await insertEvent(staffId, sh.stationId, "break_end", (await activeRule(db))?.rule_id ?? null);
    await db.prepare("UPDATE breaks SET end_event_id = ? WHERE start_event_id = ?").run(ev.event_id, open.startEventId);
    return true;
  }

  r.post("/break-end", requirePermission("clock.self"), async (req, res) => {
    const s = req.staff;
    await db.transaction(async () => {
      const sh = await openShift(s.staff_id);
      if (!sh || !(await endBreak(s.staff_id, sh))) throw conflict("You’re not on a break.");
    });
    res.json({ ok: true, clock: await clockState(s.staff_id) });
  });

  r.post("/clock-out", requirePermission("clock.self"), async (req, res) => {
    const s = req.staff;
    const done = await db.transaction(async () => {
      const sh = await openShift(s.staff_id);
      if (!sh) throw conflict("You’re not clocked in.");
      await endBreak(s.staff_id, sh);
      await insertEvent(s.staff_id, sh.stationId, "clock_out", (await activeRule(db))?.rule_id ?? null);
      await touchStation(sh.stationId);
      // Break check on the finished shift (in case it wasn't caught while open).
      const [fin] = (await loadShifts(db, { from: sh.date, to: sh.date, staffId: s.staff_id })).filter((x) => x.id === sh.id);
      const rule = await activeRule(db);
      if (fin && rule?.max_hours_without_break) {
        const { longest } = longestStretch(fin);
        if (longest > rule.max_hours_without_break * 60)
          await addException(db, { staffId: s.staff_id, eventId: fin.clockInEventId, type: "Break overdue", date: fin.date, ruleId: rule.rule_id, notes: `Worked ${round2(longest / 60)} h without a break (${rule.rule_name}: ${rule.max_hours_without_break} h)` });
      }
      return fin;
    });
    res.json({ ok: true, shift: done ? publicShift(done) : null, clock: await clockState(s.staff_id) });
  });

  // ---------- timesheets and corrections ----------
  r.get("/timesheets", requirePermission("timesheets.self"), async (req, res) => {
    const q = z.object({ from: Ymd.optional(), to: Ymd.optional() }).parse(req.query);
    const p = periodFor();
    const from = q.from ?? p.start, to = q.to ?? p.end;
    const shifts = (await loadShifts(db, { from, to, staffId: req.staff.staff_id })).map(publicShift);
    res.json({ from, to, period: p, shifts, totalHours: round2(shifts.reduce((a, s) => a + (s.clockOut ? s.workedHours : 0), 0)) });
  });

  r.post("/timesheets/export", requirePermission("timesheets.self"), async (req, res) => {
    const q = z.object({ from: Ymd, to: Ymd }).parse(req.body);
    const shifts = await loadShifts(db, { from: q.from, to: q.to, staffId: req.staff.staff_id });
    const rows = [["Date", "Station", "Clock in", "Clock out", "Paid break (min)", "Unpaid break (min)", "Hours", "Status"]];
    for (const s of shifts) rows.push([s.date, s.station, hhmm(s.clockIn), s.clockOut ? hhmm(s.clockOut) : "", s.paidBreakMinutes, s.unpaidBreakMinutes, s.workedHours, s.status]);
    res.json(createDownload(`timesheet-${q.from}-to-${q.to}.csv`, "text/csv", csv(rows)));
  });

  r.get("/adjustments", requirePermission("timesheets.self"), async (req, res) => {
    res.json({ adjustments: await listAdjustments(db, { staffId: req.staff.staff_id }) });
  });

  r.post("/adjustments", requirePermission("timesheets.self"), async (req, res) => {
    const b = AdjustmentBody.parse(req.body);
    const id = await createAdjustment(db, { ...b, staffId: req.staff.staff_id, requestedBy: req.staff.staff_id, method: null });
    res.status(201).json({ ok: true, id });
  });

  // ---------- leave ----------
  r.get("/leave", requirePermission("leave.self"), async (req, res) => {
    const rows = await db.prepare("SELECT * FROM leave_requests WHERE staff_id = ? ORDER BY start_date DESC").all(req.staff.staff_id);
    res.json({ types: LEAVE_TYPES, balances: { annualHours: req.staff.annual_leave_hours, personalHours: req.staff.personal_leave_hours, hoursPerDay: hoursPerDay(req.staff) }, requests: rows.map(leaveDto) });
  });

  r.post("/leave", requirePermission("leave.self"), async (req, res) => {
    const b = z.object({ type: z.enum(LEAVE_TYPES), startDate: Ymd, endDate: Ymd, days: z.coerce.number().min(0.5).max(60).optional(), note: z.string().trim().max(200).optional() }).parse(req.body);
    if (b.endDate < b.startDate) throw badRequest("End date must be on or after the start date.");
    const s = req.staff;
    let days = b.days;
    if (!days) {
      days = 0;
      for (let d = b.startDate; d <= b.endDate; d = addDays(d, 1)) if (![0, 6].includes(new Date(`${d}T12:00`).getDay())) days++;
    }
    if (!days) throw badRequest("Those dates are all weekend days.");
    const need = days * hoursPerDay(s);
    if (b.type === "Annual" && need > s.annual_leave_hours) throw badRequest(`You have ${s.annual_leave_hours} h of annual leave. This request needs ${round2(need)} h.`);
    if (b.type === "Personal" && need > s.personal_leave_hours) throw badRequest(`You have ${s.personal_leave_hours} h of personal leave. This request needs ${round2(need)} h.`);
    const overlap = await db.prepare("SELECT 1 FROM leave_requests WHERE staff_id = ? AND status <> 'Rejected' AND start_date <= ? AND end_date >= ?").get(s.staff_id, b.endDate, b.startDate);
    if (overlap) throw conflict("You already have leave booked or requested for those dates.");
    const row = await db
      .prepare("INSERT INTO leave_requests (staff_id, type, start_date, end_date, days, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Pending', now()) RETURNING *")
      .get(s.staff_id, b.type, b.startDate, b.endDate, days, b.note || null);
    res.status(201).json({ request: leaveDto(row) });
  });

  // ---------- profile and payslips ----------
  r.get("/profile", async (req, res) => {
    res.json({ staff: staffDto(req.staff), account: { email: req.user.email, accessRoles: req.user.roles, mfaEnrolled: !!req.user.totp_secret } });
  });

  r.patch("/profile/emergency", async (req, res) => {
    const b = z.object({ name: z.string().trim().max(100), phone: z.string().trim().max(30) }).parse(req.body);
    await db.prepare("UPDATE staff SET emergency_contact_name = ?, emergency_contact_phone = ? WHERE staff_id = ?").run(b.name || null, b.phone || null, req.staff.staff_id);
    await audit(db, { table: "staff", recordId: req.staff.staff_id, action: "UPDATE", reason: "Staff updated own emergency contact", by: req.staff.staff_id });
    res.json({ ok: true });
  });

  r.get("/payslips", requirePermission("timesheets.self"), async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT p.*, r.step, r.approved_at FROM payroll_summary p JOIN payroll_runs r ON r.run_id = p.run_id
          WHERE p.staff_id = ? AND r.step >= 3 ORDER BY p.period_start DESC`
      )
      .all(req.staff.staff_id);
    res.json({ payslips: rows.map(payslipDto) });
  });

  return r;
}

export const leaveDto = (l) => ({
  id: l.leave_id,
  staffId: l.staff_id,
  type: l.type,
  startDate: l.start_date,
  endDate: l.end_date,
  days: l.days,
  note: l.note,
  status: l.status,
  decidedBy: l.decided_by,
  decidedAt: l.decided_at,
  createdAt: l.created_at,
  ...(l.first_name ? { staffName: `${l.first_name} ${l.last_name}` } : {}),
});

export const payslipDto = (p) => ({
  id: p.payroll_id,
  periodStart: p.period_start,
  periodEnd: p.period_end,
  ordinaryHours: p.ordinary_hours,
  overtimeHours: p.overtime_hours,
  weekendHours: p.weekend_hours,
  publicHolidayHours: p.public_holiday_hours,
  penalty: p.penalty_flag,
  totalPay: p.total_pay,
});

// ---------- corrections (time_adjustments), shared with admin ----------
export const AdjustmentBody = z.object({
  action: z.enum(["ADD", "EDIT", "DELETE"]),
  eventId: z.coerce.number().int(),
  newTimestamp: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3, "Give a reason.").max(200),
});

/**
 * ADD: eventId is the clock_in (adds the missing clock_out) or break_start (adds the break_end).
 * EDIT: eventId is the event to move to newTimestamp. DELETE: eventId is the event to remove.
 */
export async function createAdjustment(db, { staffId, eventId, action, newTimestamp, reason, requestedBy, method }) {
  const ev = await db.prepare("SELECT * FROM time_events WHERE event_id = ? AND staff_id = ?").get(eventId, staffId);
  if (!ev) throw notFound("That clock event wasn’t found.");
  if (action !== "DELETE" && !newTimestamp) throw badRequest("Enter the corrected time.");
  if (newTimestamp && new Date(newTimestamp) > new Date(Date.now() + 5 * 60_000)) throw badRequest("The corrected time can’t be in the future.");
  if (action === "ADD" && !["clock_in", "break_start"].includes(ev.event_type)) throw badRequest("Missing times are added against the clock-in or break start.");
  if (action === "ADD" && new Date(newTimestamp) <= new Date(ev.event_timestamp)) throw badRequest("The added time must be after the clock-in.");
  const dup = await db.prepare("SELECT 1 FROM time_adjustments WHERE event_id = ? AND status = 'Pending'").get(eventId);
  if (dup) throw conflict("There’s already a pending correction for this time.");
  const row = await db
    .prepare(
      `INSERT INTO time_adjustments (staff_id, event_id, action, old_timestamp, new_timestamp, reason, override_method, requested_by, requested_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), 'Pending') RETURNING adjustment_id`
    )
    .get(staffId, eventId, action, action === "ADD" ? null : ev.event_timestamp, newTimestamp ?? null, reason, method, requestedBy);
  return row.adjustment_id;
}

export async function listAdjustments(db, { staffId = null, status = null } = {}) {
  const rows = await db
    .prepare(
      `SELECT a.*, e.event_type, e.event_timestamp, s.first_name, s.last_name,
              rq.first_name AS rq_first, rq.last_name AS rq_last, ap.first_name AS ap_first, ap.last_name AS ap_last
         FROM time_adjustments a
         JOIN staff s ON s.staff_id = a.staff_id
         JOIN staff rq ON rq.staff_id = a.requested_by
    LEFT JOIN staff ap ON ap.staff_id = a.approver
    LEFT JOIN time_events e ON e.event_id = a.event_id
        WHERE (?::int IS NULL OR a.staff_id = ?::int) AND (?::text IS NULL OR a.status = ?::text)
        ORDER BY a.requested_at DESC LIMIT 300`
    )
    .all(staffId, staffId, status, status);
  return rows.map((a) => ({
    id: a.adjustment_id,
    staffId: a.staff_id,
    staffName: `${a.first_name} ${a.last_name}`,
    eventId: a.event_id,
    eventType: a.event_type,
    action: a.action,
    adds: a.action === "ADD" ? (a.event_type === "break_start" ? "break_end" : "clock_out") : null,
    oldTimestamp: a.old_timestamp,
    newTimestamp: a.new_timestamp,
    reason: a.reason,
    method: a.override_method,
    requestedBy: a.requested_by,
    requestedByName: `${a.rq_first} ${a.rq_last}`,
    requestedAt: a.requested_at,
    approver: a.approver,
    approverName: a.ap_first ? `${a.ap_first} ${a.ap_last}` : null,
    status: a.status,
    decidedAt: a.decided_at,
  }));
}
