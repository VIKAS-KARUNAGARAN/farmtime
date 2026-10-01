// Staff workspace: everything a signed-in employee can see or do about themselves.
import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { clientIp, requirePermission } from "../auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { createDownload } from "./downloads.js";
import { openEntry, payPeriodFor, weekHours } from "../services.js";
import { addDays, csv, dayLabel, entryHours, hhmm, id, nowIso, round1, round2, shortDate, weekdaysBetween, ymd } from "../util.js";

const LEAVE_TYPES = ["Annual leave", "Personal leave", "Unpaid leave", "Long service leave"];
const HOURS_PER_DAY = 7.6;

export function meRoutes(db) {
  const r = Router();

  // Every /api/me route needs an employee record behind the account.
  r.use((req, _res, next) => {
    const emp = req.user.employee_id && db.prepare("SELECT e.*, s.name AS station FROM employees e JOIN stations s ON s.id = e.station_id WHERE e.id = ?").get(req.user.employee_id);
    if (!emp) return next(notFound("No employee record is linked to this account."));
    req.employee = emp;
    next();
  });

  const timesheetDto = (t) => ({
    id: t.id,
    date: ymd(new Date(t.clock_in)),
    dateLabel: dayLabel(ymd(new Date(t.clock_in))),
    station: t.station,
    start: hhmm(t.clock_in),
    end: t.clock_out ? hhmm(t.clock_out) : null,
    breakMin: t.break_min,
    hours: round1(entryHours(t)),
    status: t.status,
    queryNote: t.query_note,
    staffNote: t.staff_note,
  });

  const clockState = (emp) => {
    const open = openEntry(db, emp.id);
    const last = db.prepare("SELECT clock_out FROM time_entries WHERE employee_id = ? AND clock_out IS NOT NULL ORDER BY clock_out DESC LIMIT 1").get(emp.id);
    const station = open ? db.prepare("SELECT name FROM stations WHERE id = ?").get(open.station_id).name : null;
    return { onShift: !!open, since: open?.clock_in ?? null, station, entryId: open?.id ?? null, lastOut: last?.clock_out ?? null };
  };

  // Staff home in one request.
  r.get("/home", (req, res) => {
    const emp = req.employee;
    const today = ymd();
    const shift = db.prepare("SELECT r.*, s.name AS station FROM roster_shifts r JOIN stations s ON s.id = r.station_id WHERE employee_id = ? AND date = ?").get(emp.id, today);
    const next = db.prepare("SELECT r.*, s.name AS station FROM roster_shifts r JOIN stations s ON s.id = r.station_id WHERE employee_id = ? AND date > ? ORDER BY date LIMIT 1").get(emp.id, today);
    const weather = db.prepare("SELECT * FROM weather WHERE date >= ? ORDER BY date LIMIT 4").all(today);
    const recent = db
      .prepare("SELECT t.*, s.name AS station FROM time_entries t JOIN stations s ON s.id = t.station_id WHERE employee_id = ? AND clock_out IS NOT NULL ORDER BY clock_in DESC LIMIT 4")
      .all(emp.id);
    const notifications = db.prepare("SELECT id, title, body, created_at AS createdAt, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(req.user.id);
    res.json({
      employee: { id: emp.id, name: emp.name, position: emp.position, station: emp.station },
      clock: clockState(emp),
      stations: db.prepare("SELECT id, name, online FROM stations ORDER BY name").all(),
      today: shift ? { start: shift.start_time, end: shift.end_time, breakMin: shift.break_min, station: shift.station, weather: weather[0] ?? null } : null,
      nextShift: next ? { date: next.date, dateLabel: dayLabel(next.date), start: next.start_time, station: next.station } : null,
      week: { hours: weekHours(db, emp.id), target: emp.employment_type === "Full-time" ? 38 : emp.employment_type === "Part-time" ? 24 : null },
      weather: weather.map((w) => ({ ...w, label: dayLabel(w.date).split(" ")[0] })),
      recentTimesheets: recent.map(timesheetDto),
      notifications,
    });
  });

  r.post("/clock-in", requirePermission("clock.self"), (req, res) => {
    const { stationId } = z.object({ stationId: z.string().min(1) }).parse(req.body);
    const emp = req.employee;
    if (emp.status !== "Active") throw conflict(`You can’t clock in while your status is “${emp.status}”.`);
    if (openEntry(db, emp.id)) throw conflict("You’re already clocked in.", "ALREADY_CLOCKED_IN");
    const station = db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId);
    if (!station) throw badRequest("Unknown station.");
    db.prepare("INSERT INTO time_entries (id, employee_id, station_id, clock_in, method, status) VALUES (?, ?, ?, ?, ?, 'Open')").run(
      id("te"), emp.id, station.id, nowIso(), "Staff portal · verified session"
    );
    audit(db, { actor: req.user, action: "Clocked in", target: station.name, source: "Staff portal · verified session", ip: clientIp(req) });
    res.status(201).json({ clock: clockState(emp) });
  });

  r.post("/clock-out", requirePermission("clock.self"), (req, res) => {
    const emp = req.employee;
    const open = openEntry(db, emp.id);
    if (!open) throw conflict("You’re not clocked in.", "NOT_CLOCKED_IN");
    const out = new Date();
    const mins = (out - new Date(open.clock_in)) / 60000;
    const breakMin = mins > 5 * 60 ? 30 : 0; // unpaid meal break on shifts over 5 h
    db.prepare("UPDATE time_entries SET clock_out = ?, break_min = ?, status = 'Pending' WHERE id = ?").run(out.toISOString(), breakMin, open.id);
    const station = db.prepare("SELECT name FROM stations WHERE id = ?").get(open.station_id).name;
    audit(db, { actor: req.user, action: "Clocked out", target: station, source: "Staff portal · verified session", ip: clientIp(req) });
    res.json({ clock: clockState(emp) });
  });

  r.get("/timesheets", requirePermission("timesheets.self"), (req, res) => {
    const period = payPeriodFor(ymd());
    const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(req.query.from) ?? addDays(period.start, -14);
    const rows = db
      .prepare("SELECT t.*, s.name AS station FROM time_entries t JOIN stations s ON s.id = t.station_id WHERE employee_id = ? AND clock_in >= ? AND clock_out IS NOT NULL ORDER BY clock_in DESC")
      .all(req.employee.id, new Date(from + "T00:00:00").toISOString())
      .map(timesheetDto);
    const total = round1(rows.reduce((s, t) => s + t.hours, 0));
    res.json({
      period: { start: period.start, end: period.end, label: `${shortDate(period.start)} – ${shortDate(period.end)}` },
      rate: req.employee.pay_rate,
      totals: { hours: total, awaiting: rows.filter((t) => t.status !== "Approved").length, estGross: round2(total * req.employee.pay_rate) },
      timesheets: rows,
    });
  });

  r.post("/timesheets/:id/respond", requirePermission("timesheets.self"), (req, res) => {
    const { message } = z.object({ message: z.string().trim().min(2).max(500) }).parse(req.body);
    const t = db.prepare("SELECT * FROM time_entries WHERE id = ? AND employee_id = ?").get(req.params.id, req.employee.id);
    if (!t) throw notFound("Timesheet not found.");
    if (t.status !== "Queried") throw conflict("Only queried timesheets need a response.");
    db.prepare("UPDATE time_entries SET status = 'Pending', staff_note = ? WHERE id = ?").run(message, t.id);
    audit(db, { actor: req.user, action: "Responded to timesheet query", target: dayLabel(ymd(new Date(t.clock_in))), source: "Staff portal", ip: clientIp(req) });
    res.json({ ok: true });
  });

  r.post("/timesheets/export", requirePermission("timesheets.self"), (req, res) => {
    const rows = db
      .prepare("SELECT t.*, s.name AS station FROM time_entries t JOIN stations s ON s.id = t.station_id WHERE employee_id = ? AND clock_out IS NOT NULL ORDER BY clock_in DESC LIMIT 60")
      .all(req.employee.id)
      .map(timesheetDto);
    const body = csv([["Date", "Station", "In", "Out", "Break (min)", "Hours", "Status"], ...rows.map((t) => [t.date, t.station, t.start, t.end, t.breakMin, t.hours, t.status])]);
    res.json(createDownload(db, `timesheets-${req.employee.name.replace(/\W+/g, "-").toLowerCase()}.csv`, "text/csv", body));
  });

  r.get("/leave", requirePermission("leave.self"), (req, res) => {
    const rows = db.prepare("SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC").all(req.employee.id);
    res.json({
      balances: { annualHours: req.employee.annual_leave_h, personalHours: req.employee.personal_leave_h },
      types: LEAVE_TYPES,
      requests: rows.map((l) => ({ id: l.id, type: l.type, from: l.start_date, to: l.end_date, fromLabel: shortDate(l.start_date), toLabel: shortDate(l.end_date), days: l.days, note: l.note, status: l.status })),
    });
  });

  r.post("/leave", requirePermission("leave.self"), (req, res) => {
    const body = z
      .object({
        type: z.enum(LEAVE_TYPES),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
        note: z.string().trim().max(300).default(""),
      })
      .parse(req.body);
    if (body.to < body.from) throw badRequest("The end date must be on or after the start date.");
    if (body.from < addDays(ymd(), -14)) throw badRequest("Leave can’t start more than 14 days in the past.");
    const days = weekdaysBetween(body.from, body.to);
    if (days === 0) throw badRequest("That range has no working days.");
    const overlap = db
      .prepare("SELECT 1 FROM leave_requests WHERE employee_id = ? AND status IN ('Pending','Approved') AND start_date <= ? AND end_date >= ?")
      .get(req.employee.id, body.to, body.from);
    if (overlap) throw conflict("You already have leave booked or pending for those dates.");
    const hours = days * HOURS_PER_DAY;
    if (body.type === "Annual leave" && hours > req.employee.annual_leave_h) throw badRequest(`Not enough annual leave. You have ${req.employee.annual_leave_h.toFixed(1)} h available.`);
    if (body.type === "Personal leave" && hours > req.employee.personal_leave_h) throw badRequest(`Not enough personal leave. You have ${req.employee.personal_leave_h.toFixed(1)} h available.`);

    const leaveId = id("lv");
    db.prepare("INSERT INTO leave_requests (id, employee_id, type, start_date, end_date, days, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)").run(
      leaveId, req.employee.id, body.type, body.from, body.to, days, body.note, nowIso()
    );
    audit(db, { actor: req.user, action: "Requested leave", target: `${body.type} · ${shortDate(body.from)}–${shortDate(body.to)}`, source: "Staff portal", ip: clientIp(req) });
    res.status(201).json({ id: leaveId, days });
  });

  r.post("/leave/:id/cancel", requirePermission("leave.self"), (req, res) => {
    const l = db.prepare("SELECT * FROM leave_requests WHERE id = ? AND employee_id = ?").get(req.params.id, req.employee.id);
    if (!l) throw notFound("Leave request not found.");
    if (l.status !== "Pending") throw conflict("Only pending requests can be cancelled.");
    db.prepare("UPDATE leave_requests SET status = 'Cancelled' WHERE id = ?").run(l.id);
    audit(db, { actor: req.user, action: "Cancelled leave request", target: `${l.type} · ${shortDate(l.start_date)}`, source: "Staff portal", ip: clientIp(req) });
    res.json({ ok: true });
  });

  r.get("/profile", (req, res) => {
    const e = req.employee;
    const u = req.user;
    res.json({
      name: u.name,
      email: u.email,
      initials: u.initials,
      position: e.position,
      station: e.station,
      employment: `${e.employment_type} · since ${new Date(e.started_on + "T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`,
      status: e.status,
      roles: u.roles,
      emergency: e.emergency_name ? { name: e.emergency_name, phone: e.emergency_phone } : null,
      passwordChangedDaysAgo: u.password_changed_at ? Math.round((Date.now() - new Date(u.password_changed_at + "T00:00:00")) / 86_400_000) : null,
    });
  });

  r.patch("/profile/emergency", (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().regex(/^[0-9 +()-]{8,20}$/, "Enter a valid phone number.") })
      .parse(req.body);
    db.prepare("UPDATE employees SET emergency_name = ?, emergency_phone = ? WHERE id = ?").run(b.name, b.phone, req.employee.id);
    audit(db, { actor: req.user, action: "Updated emergency contact", target: req.user.name, source: "Staff portal", ip: clientIp(req) });
    res.json({ emergency: b });
  });

  r.post("/notifications/read", (req, res) => {
    db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(nowIso(), req.user.id);
    res.json({ ok: true });
  });

  r.get("/payslips", requirePermission("timesheets.self"), (req, res) => {
    const runs = db.prepare("SELECT * FROM payroll_runs WHERE step >= 3 ORDER BY period_start DESC").all();
    res.json({ payslips: runs.map((r) => ({ periodStart: r.period_start, periodEnd: r.period_end, payDate: r.pay_date })) });
  });

  return r;
}
