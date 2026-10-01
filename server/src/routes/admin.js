// Admin workspace. Every route here sits behind requireRole("admin"), which
// also enforces a verified MFA session (see app.js).
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { audit, notify } from "../audit.js";
import { clientIp, requirePermission } from "../auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { matrix } from "../permissions.js";
import { LOCKED_POLICIES, getSettings, saveSettings } from "../settings.js";
import {
  STEPS,
  defaultBreak,
  ensurePayrollRun,
  entriesBetween,
  lateness,
  missedClockOuts,
  onSite,
  payrollRows,
  processingPeriod,
  weekHours,
} from "../services.js";
import { createDownload } from "./downloads.js";
import { addDays, at, csv, dayLabel, entryHours, hhmm, id, initialsOf, nowIso, parseYmd, round1, round2, shortDate, weekStart, ymd } from "../util.js";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).");
const EmploymentType = z.enum(["Full-time", "Part-time", "Casual", "Seasonal"]);
const Status = z.enum(["Active", "Onboarding", "On leave", "Inactive"]);

export function adminRoutes(db) {
  const r = Router();
  const actor = (req) => req.user;
  const log = (req, action, target, level = "info") => audit(db, { actor: actor(req), action, target, source: "Admin portal", level, ip: clientIp(req) });
  const userForEmployee = (empId) => db.prepare("SELECT id FROM users WHERE employee_id = ?").get(empId)?.id;
  const stationName = (sid) => db.prepare("SELECT name FROM stations WHERE id = ?").get(sid)?.name;

  // ---------------------------------------------------------------- dashboard
  r.get("/dashboard", (req, res) => {
    const today = ymd();
    const people = onSite(db);
    const stations = db.prepare("SELECT * FROM stations ORDER BY rowid").all();
    const activeCount = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'Active'").get().n;
    const todays = entriesBetween(db, today, addDays(today, 1));
    const pendingLeave = db
      .prepare("SELECT l.*, e.name AS staff_name FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.status = 'Pending' ORDER BY l.start_date")
      .all();
    const pendingTimesheets = db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE status IN ('Pending','Queried')").get().n;
    const period = processingPeriod(today);
    const run = ensurePayrollRun(db, period);
    const daysToClose = Math.round((parseYmd(period.closes) - parseYmd(today)) / 86_400_000);

    const alerts = [];
    const weekAhead = db.prepare("SELECT * FROM weather WHERE date >= ? AND date < ? ORDER BY date").all(today, addDays(today, 7));
    const heat = weekAhead.filter((w) => w.flag === "Heat");
    if (heat.length) {
      alerts.push({ kind: "heat", title: `Heat advisory ${heat.map((w) => dayLabel(w.date).split(" ")[0]).join(", ")}`, body: `${Math.min(...heat.map((h) => h.temp))}–${Math.max(...heat.map((h) => h.temp))}°C. Consider earlier orchard starts.` });
    }
    for (const s of stations.filter((s) => !s.online)) {
      alerts.push({ kind: "offline", title: `${s.device} offline`, body: `${s.name} since ${new Date(s.last_seen).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}.` });
    }
    for (const m of missedClockOuts(db)) {
      alerts.push({ kind: "missed", title: "Missed clock-out", body: `${m.name}, ${dayLabel(ymd(new Date(m.clock_in)))} from ${hhmm(m.clock_in)}.`, entryId: m.id });
    }
    const rain = weekAhead.find((w) => w.flag === "Rain");
    if (rain) alerts.push({ kind: "rain", title: `Rain ${dayLabel(rain.date).split(" ")[0]}`, body: "Picking shifts may move to packing." });

    res.json({
      kpis: {
        onSite: people.length,
        activeStaff: activeCount,
        hoursToday: round1(todays.reduce((s, t) => s + entryHours(t), 0)),
        stationsWithActivity: new Set(todays.map((t) => t.station_id)).size,
        pendingLeave: pendingLeave.length,
        pendingTimesheets,
        payrollCloses: daysToClose <= 0 ? "Today" : daysToClose === 1 ? "Tomorrow" : `In ${daysToClose} days`,
        payDate: dayLabel(period.payDate),
        payrollStep: run.step,
      },
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        online: !!s.online,
        people: people.filter((p) => p.station_id === s.id).map((p) => ({ id: p.id, name: p.name, initials: p.initials, since: p.clock_in })),
      })),
      alerts,
      pendingLeave: pendingLeave.map((l) => ({ id: l.id, staffName: l.staff_name, type: l.type, fromLabel: shortDate(l.start_date), toLabel: shortDate(l.end_date), days: l.days, note: l.note })),
      recentActivity: db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 6").all().map(auditDto),
    });
  });

  // ---------------------------------------------------------------- employees
  const employeeDto = (e, live) => ({
    id: e.id,
    name: e.name,
    initials: e.initials,
    position: e.position,
    stationId: e.station_id,
    station: e.station,
    type: e.employment_type,
    rate: e.pay_rate,
    status: e.status,
    hoursWeek: weekHours(db, e.id),
    onSite: live.has(e.id),
    hasLogin: !!userForEmployee(e.id),
  });

  r.get("/employees", requirePermission("employees.read"), (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const status = req.query.status ? Status.parse(req.query.status) : null;
    const live = new Set(onSite(db).map((p) => p.id));
    let rows = db.prepare("SELECT e.*, s.name AS station FROM employees e JOIN stations s ON s.id = e.station_id ORDER BY e.name").all();
    if (status) rows = rows.filter((e) => e.status === status);
    if (q) rows = rows.filter((e) => `${e.name} ${e.position} ${e.station}`.toLowerCase().includes(q));
    res.json({ employees: rows.map((e) => employeeDto(e, live)), stations: db.prepare("SELECT id, name FROM stations ORDER BY rowid").all() });
  });

  const EmployeeBody = z.object({
    name: z.string().trim().min(3).max(80).refine((v) => v.split(/\s+/).length >= 2, "Enter a first and last name."),
    position: z.string().trim().min(2).max(60),
    stationId: z.string(),
    type: EmploymentType,
    rate: z.coerce.number().min(config.minimumWage, `Pay rate must be at least the national minimum wage ($${config.minimumWage}/h).`).max(500),
    status: Status.default("Onboarding"),
  });

  r.post("/employees", requirePermission("employees.write"), (req, res) => {
    const b = EmployeeBody.parse(req.body);
    if (!stationName(b.stationId)) throw badRequest("Unknown station.");
    const empId = id("emp");
    db.prepare(
      `INSERT INTO employees (id, name, initials, position, station_id, employment_type, pay_rate, status, annual_leave_h, personal_leave_h, started_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(empId, b.name, initialsOf(b.name), b.position, b.stationId, b.type, b.rate, b.status, 0, 0, ymd()); // leave accrues from zero
    log(req, "Added staff member", `${b.name} · ${b.position} · $${b.rate.toFixed(2)}/h`, "security");
    res.status(201).json({ id: empId });
  });

  r.patch("/employees/:id", requirePermission("employees.write"), (req, res) => {
    const e = db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
    if (!e) throw notFound("Employee not found.");
    const b = EmployeeBody.partial().parse(req.body);
    if (b.stationId && !stationName(b.stationId)) throw badRequest("Unknown station.");
    const next = {
      name: b.name ?? e.name,
      position: b.position ?? e.position,
      station_id: b.stationId ?? e.station_id,
      employment_type: b.type ?? e.employment_type,
      pay_rate: b.rate ?? e.pay_rate,
      status: b.status ?? e.status,
    };
    db.prepare("UPDATE employees SET name = ?, initials = ?, position = ?, station_id = ?, employment_type = ?, pay_rate = ?, status = ? WHERE id = ?").run(
      next.name, initialsOf(next.name), next.position, next.station_id, next.employment_type, next.pay_rate, next.status, e.id
    );
    if (next.pay_rate !== e.pay_rate) log(req, "Updated pay rate", `${e.name} · $${e.pay_rate.toFixed(2)} → $${next.pay_rate.toFixed(2)}/h`, "security");
    if (next.status !== e.status) log(req, "Changed staff status", `${e.name} · ${e.status} → ${next.status}`);
    if (next.station_id !== e.station_id || next.position !== e.position || next.employment_type !== e.employment_type) log(req, "Updated staff record", e.name);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- roster
  r.get("/roster", requirePermission("employees.read"), (req, res) => {
    const ws = weekStart(req.query.week ? Ymd.parse(req.query.week) : ymd());
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const weather = Object.fromEntries(db.prepare("SELECT * FROM weather WHERE date >= ? AND date <= ?").all(ws, days[6]).map((w) => [w.date, w]));
    const shifts = db.prepare("SELECT r.*, s.name AS station FROM roster_shifts r JOIN stations s ON s.id = r.station_id WHERE date >= ? AND date <= ?").all(ws, days[6]);
    const leave = db.prepare("SELECT * FROM leave_requests WHERE status = 'Approved' AND start_date <= ? AND end_date >= ?").all(days[6], ws);
    const employees = db.prepare("SELECT e.*, s.name AS station FROM employees e JOIN stations s ON s.id = e.station_id WHERE e.status != 'Inactive' ORDER BY e.rowid").all();
    const pub = db.prepare("SELECT * FROM roster_publications WHERE week_start = ?").get(ws);
    const outdoor = new Set(["orchard"]);

    const rows = employees.map((e) => ({
      employee: { id: e.id, name: e.name, initials: e.initials, position: e.position, stationId: e.station_id, station: e.station, status: e.status },
      cells: days.map((d) => {
        const s = shifts.find((x) => x.employee_id === e.id && x.date === d);
        const onLeave = leave.some((l) => l.employee_id === e.id && l.start_date <= d && l.end_date >= d);
        return {
          date: d,
          onLeave,
          shift: s ? { id: s.id, start: s.start_time, end: s.end_time, breakMin: s.break_min, stationId: s.station_id, station: s.station, heat: weather[d]?.flag === "Heat" && outdoor.has(s.station_id) } : null,
        };
      }),
    }));

    res.json({
      weekStart: ws,
      weekLabel: `${shortDate(ws)} – ${shortDate(days[6])}`,
      published: pub ? { by: pub.published_by, at: pub.published_at } : null,
      days: days.map((d) => ({ date: d, label: dayLabel(d).split(" ")[0], temp: weather[d]?.temp ?? null, flag: weather[d]?.flag ?? "" })),
      rows,
      coverage: days.map((d) => shifts.filter((s) => s.date === d).length),
      stations: db.prepare("SELECT id, name FROM stations ORDER BY rowid").all(),
    });
  });

  r.put("/roster/shifts", requirePermission("roster.write"), (req, res) => {
    const b = z.object({ employeeId: z.string(), date: Ymd, start: Time, end: Time, stationId: z.string().optional() }).parse(req.body);
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(b.employeeId);
    if (!emp) throw notFound("Employee not found.");
    const stationId = b.stationId ?? emp.station_id;
    if (!stationName(stationId)) throw badRequest("Unknown station.");
    if (b.end <= b.start) throw badRequest("The shift must end after it starts.");
    const mins = (at(b.date, b.end) - at(b.date, b.start)) / 60000;
    if (mins > 12 * 60) throw badRequest("Shifts can’t be longer than 12 hours.");
    const onLeave = db.prepare("SELECT 1 FROM leave_requests WHERE employee_id = ? AND status = 'Approved' AND start_date <= ? AND end_date >= ?").get(emp.id, b.date, b.date);
    if (onLeave) throw conflict(`${emp.name} is on approved leave that day.`);
    // Fatigue rule: at least 10 hours between shifts.
    const prev = db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, addDays(b.date, -1));
    const next = db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, addDays(b.date, 1));
    if (prev && (at(b.date, b.start) - at(prev.date, prev.end_time)) / 3600_000 < 10) throw conflict(`Less than 10 hours’ rest after ${emp.name}’s previous shift (ends ${prev.end_time}).`);
    if (next && (at(next.date, next.start_time) - at(b.date, b.end)) / 3600_000 < 10) throw conflict(`Less than 10 hours’ rest before ${emp.name}’s next shift (starts ${next.start_time}).`);

    const existing = db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, b.date);
    const breakMin = defaultBreak(b.start, b.end);
    let shiftId;
    if (existing) {
      shiftId = existing.id;
      db.prepare("UPDATE roster_shifts SET start_time = ?, end_time = ?, station_id = ?, break_min = ? WHERE id = ?").run(b.start, b.end, stationId, breakMin, shiftId);
    } else {
      shiftId = id("sh");
      db.prepare("INSERT INTO roster_shifts (id, employee_id, station_id, date, start_time, end_time, break_min) VALUES (?, ?, ?, ?, ?, ?, ?)").run(shiftId, emp.id, stationId, b.date, b.start, b.end, breakMin);
    }
    log(req, existing ? "Changed shift" : "Added shift", `${emp.name} · ${dayLabel(b.date)} ${b.start}–${b.end}`);
    if (db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(weekStart(b.date))) {
      notify(db, userForEmployee(emp.id), "Roster changed", `${dayLabel(b.date)}: ${b.start}–${b.end} at ${stationName(stationId)}.`);
    }
    res.json({ id: shiftId });
  });

  r.delete("/roster/shifts/:id", requirePermission("roster.write"), (req, res) => {
    const s = db.prepare("SELECT r.*, e.name FROM roster_shifts r JOIN employees e ON e.id = r.employee_id WHERE r.id = ?").get(req.params.id);
    if (!s) throw notFound("Shift not found.");
    db.prepare("DELETE FROM roster_shifts WHERE id = ?").run(s.id);
    log(req, "Removed shift", `${s.name} · ${dayLabel(s.date)} ${s.start_time}–${s.end_time}`);
    if (db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(weekStart(s.date))) {
      notify(db, userForEmployee(s.employee_id), "Shift removed", `${dayLabel(s.date)} is no longer rostered.`);
    }
    res.json({ ok: true });
  });

  r.post("/roster/publish", requirePermission("roster.write"), (req, res) => {
    const ws = weekStart(Ymd.parse(req.body?.week ?? ymd()));
    if (db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(ws)) throw conflict("This week’s roster is already published.");
    db.prepare("INSERT INTO roster_publications (week_start, published_by, published_at) VALUES (?, ?, ?)").run(ws, req.user.name, nowIso());
    const empIds = db.prepare("SELECT DISTINCT employee_id FROM roster_shifts WHERE date >= ? AND date <= ?").all(ws, addDays(ws, 6)).map((x) => x.employee_id);
    for (const e of empIds) notify(db, userForEmployee(e), "Roster published", `Week of ${shortDate(ws)} is now available.`);
    log(req, "Published roster", `Week of ${shortDate(ws)}`);
    res.json({ ok: true, notified: empIds.length });
  });

  // ---------------------------------------------------------------- stations
  r.get("/stations", requirePermission("stations.read"), (req, res) => {
    const people = onSite(db);
    const stations = db.prepare("SELECT * FROM stations ORDER BY rowid").all();
    const events = db
      .prepare("SELECT * FROM audit_log WHERE action IN ('Clocked in','Clocked out','Device offline','Device online') ORDER BY id DESC LIMIT 10")
      .all()
      .map(auditDto);
    res.json({
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        method: s.method,
        device: s.device,
        online: !!s.online,
        lastSeen: s.last_seen,
        people: people.filter((p) => p.station_id === s.id).map((p) => ({ id: p.id, name: p.name, initials: p.initials, since: p.clock_in, method: p.method })),
      })),
      events,
    });
  });

  r.patch("/stations/:id", requirePermission("stations.read"), (req, res) => {
    const { online } = z.object({ online: z.boolean() }).parse(req.body);
    const s = db.prepare("SELECT * FROM stations WHERE id = ?").get(req.params.id);
    if (!s) throw notFound("Station not found.");
    db.prepare("UPDATE stations SET online = ?, last_seen = ? WHERE id = ?").run(online ? 1 : 0, nowIso(), s.id);
    audit(db, { actor: { id: null, name: "System" }, action: online ? "Device online" : "Device offline", target: s.device, source: "Station monitor", level: online ? "info" : "warn" });
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- approvals
  r.get("/approvals", requirePermission("approvals.write"), (req, res) => {
    const ts = db
      .prepare(
        `SELECT t.*, e.name, s.name AS station FROM time_entries t JOIN employees e ON e.id = t.employee_id JOIN stations s ON s.id = t.station_id
          WHERE t.status IN ('Pending','Queried') ORDER BY t.status DESC, t.clock_in DESC`
      )
      .all();
    res.json({
      timesheets: ts.map((t) => ({
        id: t.id,
        staffName: t.name,
        dateLabel: dayLabel(ymd(new Date(t.clock_in))),
        station: t.station,
        start: hhmm(t.clock_in),
        end: hhmm(t.clock_out),
        hours: round1(entryHours(t)),
        status: t.status,
        queryNote: t.query_note,
        staffNote: t.staff_note,
        lateMinutes: lateness(db, t),
      })),
      missedClockOuts: missedClockOuts(db).map((m) => ({ id: m.id, staffName: m.name, dateLabel: dayLabel(ymd(new Date(m.clock_in))), start: hhmm(m.clock_in) })),
    });
  });

  const getEntry = (entryId) => {
    const t = db.prepare("SELECT t.*, e.name FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?").get(entryId);
    if (!t) throw notFound("Timesheet not found.");
    return t;
  };

  r.post("/timesheets/approve", requirePermission("approvals.write"), (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(200) }).parse(req.body);
    let n = 0;
    for (const tid of ids) {
      const t = getEntry(tid);
      if (t.status !== "Pending") continue;
      db.prepare("UPDATE time_entries SET status = 'Approved', decided_by = ? WHERE id = ?").run(req.user.name, t.id);
      log(req, "Approved timesheet", `${t.name} · ${dayLabel(ymd(new Date(t.clock_in)))}`);
      n++;
    }
    res.json({ approved: n });
  });

  r.post("/timesheets/:id/query", requirePermission("approvals.write"), (req, res) => {
    const { note } = z.object({ note: z.string().trim().min(3).max(300) }).parse(req.body);
    const t = getEntry(req.params.id);
    if (t.status !== "Pending") throw conflict("Only pending timesheets can be queried.");
    db.prepare("UPDATE time_entries SET status = 'Queried', query_note = ? WHERE id = ?").run(note, t.id);
    notify(db, userForEmployee(t.employee_id), "Timesheet queried", `${dayLabel(ymd(new Date(t.clock_in)))}: ${note}`);
    log(req, "Queried timesheet", `${t.name} · ${dayLabel(ymd(new Date(t.clock_in)))}`);
    res.json({ ok: true });
  });

  // Close a missed clock-out at the rostered end (or a given time).
  r.post("/timesheets/:id/close", requirePermission("approvals.write"), (req, res) => {
    const { end } = z.object({ end: Time.optional() }).parse(req.body ?? {});
    const t = getEntry(req.params.id);
    if (t.clock_out) throw conflict("That entry is already closed.");
    const d = ymd(new Date(t.clock_in));
    const shift = db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(t.employee_id, d);
    const endTime = end ?? shift?.end_time;
    if (!endTime) throw badRequest("No rostered end time. Provide an end time.");
    const out = at(d, endTime);
    if (out <= new Date(t.clock_in)) throw badRequest("End time must be after the clock-in time.");
    db.prepare("UPDATE time_entries SET clock_out = ?, break_min = ?, status = 'Pending' WHERE id = ?").run(out.toISOString(), shift?.break_min ?? 0, t.id);
    log(req, "Closed missed clock-out", `${t.name} · ${dayLabel(d)} at ${endTime}`, "warn");
    res.json({ ok: true });
  });

  r.post("/leave/:id/decision", requirePermission("approvals.write"), (req, res) => {
    const { status } = z.object({ status: z.enum(["Approved", "Declined"]) }).parse(req.body);
    const l = db.prepare("SELECT l.*, e.name, e.annual_leave_h, e.personal_leave_h FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.id = ?").get(req.params.id);
    if (!l) throw notFound("Leave request not found.");
    if (l.status !== "Pending") throw conflict(`This request was already ${l.status.toLowerCase()}.`);
    const tx = db.transaction(() => {
      db.prepare("UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(status, req.user.name, nowIso(), l.id);
      if (status === "Approved") {
        const hours = l.days * 7.6;
        if (l.type === "Annual leave") db.prepare("UPDATE employees SET annual_leave_h = MAX(0, annual_leave_h - ?) WHERE id = ?").run(hours, l.employee_id);
        if (l.type === "Personal leave") db.prepare("UPDATE employees SET personal_leave_h = MAX(0, personal_leave_h - ?) WHERE id = ?").run(hours, l.employee_id);
      }
    });
    tx();
    notify(db, userForEmployee(l.employee_id), `Leave ${status.toLowerCase()}`, `${l.type}, ${shortDate(l.start_date)}${l.end_date !== l.start_date ? `–${shortDate(l.end_date)}` : ""}.`);
    log(req, `${status} leave`, `${l.name} · ${shortDate(l.start_date)}–${shortDate(l.end_date)}`);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- payroll
  const payrollDto = (run) => {
    const rows = payrollRows(db, run);
    const gross = rows.reduce((s, r) => s + r.gross, 0);
    return {
      period: { start: run.period_start, end: run.period_end, label: `${shortDate(run.period_start)} – ${shortDate(run.period_end)} ${run.period_end.slice(0, 4)}`, payDate: dayLabel(run.pay_date) },
      steps: STEPS,
      step: run.step,
      done: run.step >= STEPS.length,
      totals: {
        gross: round2(gross),
        employees: rows.length,
        overtimeHours: round1(rows.reduce((s, r) => s + r.overtime, 0)),
        superannuation: round2(gross * config.superRate),
        pendingTimesheets: rows.reduce((s, r) => s + r.pending, 0),
        queriedTimesheets: rows.reduce((s, r) => s + r.queried, 0),
      },
      rows,
    };
  };

  r.get("/payroll", requirePermission("payroll.process"), (req, res) => {
    res.json(payrollDto(ensurePayrollRun(db)));
  });

  r.post("/payroll/advance", requirePermission("payroll.process"), (req, res) => {
    const run = ensurePayrollRun(db);
    if (run.step >= STEPS.length) throw conflict("Payroll for this period is already complete.");
    const stepName = STEPS[run.step];
    const tx = db.transaction(() => {
      if (run.step === 1) {
        // Approve hours: approve every pending entry in the period. Queried entries are excluded.
        const ids = entriesBetween(db, run.period_start, addDays(run.period_end, 1), "AND status = 'Pending' AND clock_out IS NOT NULL").map((t) => t.id);
        const stmt = db.prepare("UPDATE time_entries SET status = 'Approved', decided_by = ? WHERE id = ?");
        for (const tid of ids) stmt.run(req.user.name, tid);
      }
      if (run.step === 2) {
        for (const row of payrollRows(db, run)) {
          notify(db, userForEmployee(row.employeeId), "Payslip ready", `${shortDate(run.period_start)}–${shortDate(run.period_end)}: $${row.gross.toFixed(2)} gross, paid ${dayLabel(run.pay_date)}.`);
        }
      }
      db.prepare("UPDATE payroll_runs SET step = step + 1, updated_by = ?, updated_at = ? WHERE id = ?").run(req.user.name, nowIso(), run.id);
    });
    tx();
    log(req, `Payroll: ${stepName.toLowerCase()}`, `${shortDate(run.period_start)} – ${shortDate(run.period_end)}`, "security");
    const updated = db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(run.id);
    const out = payrollDto(updated);
    if (run.step === 3) {
      const body = csv([
        ["Employee", "Ordinary hours", "Overtime hours", "Rate", "Gross", "Super"],
        ...out.rows.map((r) => [r.name, r.ordinary, r.overtime, r.rate.toFixed(2), r.gross.toFixed(2), r.superannuation.toFixed(2)]),
      ]);
      out.export = createDownload(db, `payroll-${run.period_start}.csv`, "text/csv", body);
    }
    res.json(out);
  });

  r.post("/payroll/export", requirePermission("payroll.process"), (req, res) => {
    const out = payrollDto(ensurePayrollRun(db));
    const body = csv([
      ["Employee", "Ordinary hours", "Overtime hours", "Rate", "Gross", "Super", "Pending", "Queried"],
      ...out.rows.map((r) => [r.name, r.ordinary, r.overtime, r.rate.toFixed(2), r.gross.toFixed(2), r.superannuation.toFixed(2), r.pending, r.queried]),
    ]);
    log(req, "Exported payroll CSV", out.period.label, "security");
    res.json(createDownload(db, `payroll-${out.period.start}.csv`, "text/csv", body));
  });

  // ---------------------------------------------------------------- reports
  r.get("/reports", requirePermission("employees.read"), (req, res) => {
    const today = ymd();
    const monthStart = today.slice(0, 8) + "01";
    const prevMonthStart = ymd(new Date(parseYmd(monthStart).getFullYear(), parseYmd(monthStart).getMonth() - 1, 1));
    const rate = Object.fromEntries(db.prepare("SELECT id, pay_rate FROM employees").all().map((e) => [e.id, e.pay_rate]));
    const closed = (from, to) => entriesBetween(db, from, to, "AND clock_out IS NOT NULL");

    // Reporting window: the last 28 days, so the numbers are meaningful early in a month too.
    const windowStart = addDays(today, -28);
    const win = closed(windowStart, addDays(today, 1));
    const stations = db.prepare("SELECT id, name FROM stations ORDER BY rowid").all();
    const byStation = stations.map((s) => ({ name: s.name, hours: round1(win.filter((t) => t.station_id === s.id).reduce((a, t) => a + entryHours(t), 0)) }));
    const totalHours = byStation.reduce((a, s) => a + s.hours, 0);

    const cost = (rows) => rows.reduce((a, t) => a + entryHours(t) * (rate[t.employee_id] ?? 0), 0);
    const thisMonth = cost(closed(monthStart, addDays(today, 1)));
    const lastMonthSameDays = cost(closed(prevMonthStart, addDays(prevMonthStart, Number(today.slice(8, 10)))));

    const weeks = [];
    for (let w = 4; w >= 0; w--) {
      const ws = addDays(weekStart(today), -7 * w);
      const rows = closed(ws, addDays(ws, 7));
      const per = {};
      for (const t of rows) per[t.employee_id] = (per[t.employee_id] ?? 0) + entryHours(t);
      weeks.push({ week: shortDate(ws), hours: round1(Object.values(per).reduce((a, h) => a + Math.max(0, h - 38), 0)) });
    }
    const overtime4w = weeks.slice(0, 4).reduce((a, w) => a + w.hours, 0);
    const late = win.map((t) => lateness(db, t)).filter((m) => m !== null);
    const onTime = late.length ? late.filter((m) => m <= 5).length / late.length : 1;

    res.json({
      window: { from: windowStart, to: today, label: `Last 28 days` },
      kpis: {
        hours: round1(totalHours),
        labourCostMonth: round2(thisMonth),
        labourCostChangePct: lastMonthSameDays ? round1(((thisMonth - lastMonthSameDays) / lastMonthSameDays) * 100) : null,
        overtimeSharePct: totalHours ? round1((overtime4w / totalHours) * 100) : 0,
        onTimePct: round1(onTime * 100),
      },
      hoursByStation: byStation,
      overtimeByWeek: weeks,
    });
  });

  // ---------------------------------------------------------------- audit
  function auditDto(a) {
    return { id: a.id, at: a.at, actor: a.actor_name, action: a.action, target: a.target, source: a.source, level: a.level };
  }

  const auditQuery = (req, maxRows) => {
    const level = req.query.level && req.query.level !== "all" ? z.enum(["info", "warn", "security"]).parse(req.query.level) : null;
    const q = String(req.query.q ?? "").trim();
    const limit = maxRows ?? Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const where = [];
    const params = [];
    if (level) { where.push("level = ?"); params.push(level); }
    if (q) {
      where.push("(actor_name LIKE ? OR action LIKE ? OR target LIKE ? OR source LIKE ?)");
      const like = `%${q.replace(/[%_]/g, "")}%`;
      params.push(like, like, like, like);
    }
    return db.prepare(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${limit}`).all(...params);
  };

  r.get("/audit", requirePermission("audit.read"), (req, res) => {
    res.json({ events: auditQuery(req).map(auditDto) });
  });

  r.post("/audit/export", requirePermission("audit.read"), (req, res) => {
    const rows = auditQuery(req, 5000);
    const body = csv([["Time", "Actor", "Action", "Target", "Source", "Level", "IP"], ...rows.map((a) => [a.at, a.actor_name, a.action, a.target, a.source, a.level, a.ip])]);
    log(req, "Exported audit log", `${rows.length} events`, "security");
    res.json(createDownload(db, `audit-${ymd()}.csv`, "text/csv", body));
  });

  // ---------------------------------------------------------------- settings
  const settingsDto = () => {
    const s = getSettings(db);
    return {
      permissions: matrix(),
      policies: [
        ...LOCKED_POLICIES.map((p) => ({ ...p, locked: true })),
        { key: "lockout", name: "Lock entrance after failed sign-ins", value: `${s.lockout_attempts} attempts · ${s.lockout_minutes} min`, locked: false },
        { key: "admin_idle_minutes", name: "Admin session timeout", value: `${s.admin_idle_minutes} min idle`, locked: false },
        { key: "staff_session_hours", name: "Staff session length", value: `${s.staff_session_hours} h (shift length)`, locked: false },
        { key: "audit_retention_years", name: "Audit log retention", value: `${s.audit_retention_years} years`, locked: true },
      ],
      values: s,
    };
  };

  r.get("/settings", requirePermission("settings.write"), (req, res) => res.json(settingsDto()));

  r.patch("/settings", requirePermission("settings.write"), (req, res) => {
    const patch = z
      .object({
        lockout_attempts: z.number().int().min(3).max(10).optional(),
        lockout_minutes: z.number().int().min(5).max(120).optional(),
        admin_idle_minutes: z.number().int().min(5).max(120).optional(),
        staff_session_hours: z.number().int().min(1).max(16).optional(),
      })
      .strict()
      .parse(req.body);
    if (!Object.keys(patch).length) throw badRequest("Nothing to update.");
    const before = getSettings(db);
    saveSettings(db, patch);
    for (const [k, v] of Object.entries(patch)) if (before[k] !== v) log(req, "Changed security setting", `${k}: ${before[k]} → ${v}`, "security");
    res.json(settingsDto());
  });

  return r;
}
