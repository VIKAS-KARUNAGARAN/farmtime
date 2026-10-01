// Admin workspace. Every route here sits behind requireRole("admin"), which
// also enforces a verified MFA session (see app.js).
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { audit, notify } from "../audit.js";
import bcrypt from "bcryptjs";
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
  const log = async (req, action, target, level = "info") => await audit(db, { actor: actor(req), action, target, source: "Admin portal", level, ip: clientIp(req) });
  const userForEmployee = async (empId) => (await db.prepare("SELECT id FROM users WHERE employee_id = ?").get(empId))?.id;
  const stationName = async (sid) => (await db.prepare("SELECT name FROM stations WHERE id = ?").get(sid))?.name;

  // ---------------------------------------------------------------- dashboard
  r.get("/dashboard", async (req, res) => {
    const today = ymd();
    const people = await onSite(db);
    const stations = await db.prepare("SELECT * FROM stations WHERE archived_at IS NULL ORDER BY sort").all();
    const activeCount = (await db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'Active'").get()).n;
    const todays = await entriesBetween(db, today, addDays(today, 1));
    const pendingLeave = await db
      .prepare("SELECT l.*, e.name AS staff_name FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.status = 'Pending' ORDER BY l.start_date")
      .all();
    const pendingTimesheets = (await db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE status IN ('Pending','Queried')").get()).n;
    const period = processingPeriod(today);
    const run = await ensurePayrollRun(db, period);
    const daysToClose = Math.round((parseYmd(period.closes) - parseYmd(today)) / 86_400_000);

    const alerts = [];
    const weekAhead = await db.prepare("SELECT * FROM weather WHERE date >= ? AND date < ? ORDER BY date").all(today, addDays(today, 7));
    const heat = weekAhead.filter((w) => w.flag === "Heat");
    if (heat.length) {
      alerts.push({ kind: "heat", title: `Heat advisory ${heat.map((w) => dayLabel(w.date).split(" ")[0]).join(", ")}`, body: `${Math.min(...heat.map((h) => h.temp))}–${Math.max(...heat.map((h) => h.temp))}°C. Consider earlier orchard starts.` });
    }
    for (const s of stations.filter((s) => !s.online)) {
      alerts.push({ kind: "offline", title: `${s.device} offline`, body: `${s.name} since ${new Date(s.last_seen).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}.` });
    }
    for (const m of await missedClockOuts(db)) {
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
      recentActivity: (await db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 6").all()).map(auditDto),
    });
  });

  // ---------------------------------------------------------------- employees
  const employeeDto = async (e, live) => ({
    id: e.id,
    name: e.name,
    initials: e.initials,
    position: e.position,
    stationId: e.station_id,
    station: e.station,
    type: e.employment_type,
    rate: e.pay_rate,
    status: e.status,
    hoursWeek: await weekHours(db, e.id),
    onSite: live.has(e.id),
    hasLogin: !!e.user_id,
    email: e.email ?? null,
    roles: e.roles ? e.roles.split(",") : [],
    removed: !!e.removed_at,
    removedAt: e.removed_at,
  });

  const EMP_SELECT = `SELECT e.*, s.name AS station, u.id AS user_id, u.email,
      (SELECT string_agg(role, ',' ORDER BY role DESC) FROM user_roles ur WHERE ur.user_id = u.id) AS roles
    FROM employees e JOIN stations s ON s.id = e.station_id LEFT JOIN users u ON u.employee_id = e.id`;

  r.get("/employees", requirePermission("employees.read"), async (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const status = req.query.status ? Status.parse(req.query.status) : null;
    const live = new Set((await onSite(db)).map((p) => p.id));
    const showRemoved = req.query.removed === "1";
    let rows = await db.prepare(`${EMP_SELECT} WHERE ${showRemoved ? "e.removed_at IS NOT NULL" : "e.removed_at IS NULL"} ORDER BY e.name`).all();
    if (status) rows = rows.filter((e) => e.status === status);
    if (q) rows = rows.filter((e) => `${e.name} ${e.position} ${e.station} ${e.email ?? ""}`.toLowerCase().includes(q));
    res.json({ employees: await Promise.all(rows.map((e) => employeeDto(e, live))), stations: await db.prepare("SELECT id, name FROM stations WHERE archived_at IS NULL ORDER BY sort").all() });
  });

  const EmployeeBody = z.object({
    name: z.string().trim().min(3).max(80).refine((v) => v.split(/\s+/).length >= 2, "Enter a first and last name."),
    position: z.string().trim().min(2).max(60),
    stationId: z.string(),
    type: EmploymentType,
    rate: z.coerce.number().min(config.minimumWage, `Pay rate must be at least the national minimum wage ($${config.minimumWage}/h).`).max(500),
    status: Status.default("Onboarding"),
  });

  const Email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
  const Password = z.string().min(10, "Passwords need at least 10 characters.").max(200);
  const Roles = z.array(z.enum(["staff", "admin"])).min(1, "Pick at least one access level.");

  r.post("/employees", requirePermission("employees.write"), async (req, res) => {
    const b = EmployeeBody.extend({ email: Email, password: Password, roles: Roles.default(["staff"]) }).parse(req.body);
    if (!await stationName(b.stationId)) throw badRequest("Unknown station.");
    if (await db.prepare("SELECT 1 FROM users WHERE email = ?").get(b.email)) throw conflict("Another account already uses that email.");
    const empId = id("emp");
    const userId = id("u");
    const hash = await bcrypt.hash(b.password, 12);
    await db.transaction(async () => {
      await db.prepare(
        `INSERT INTO employees (id, name, initials, position, station_id, employment_type, pay_rate, status, annual_leave_h, personal_leave_h, started_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
      ).run(empId, b.name, initialsOf(b.name), b.position, b.stationId, b.type, b.rate, b.status, ymd()); // leave accrues from zero
      await db.prepare(
        "INSERT INTO users (id, email, password_hash, name, title, initials, employee_id, password_changed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(userId, b.email, hash, b.name, b.position, initialsOf(b.name), empId, nowIso(), nowIso());
      for (const role of new Set(["staff", ...b.roles])) await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, role);
    });
    await log(req, "Added staff member", `${b.name} · ${b.position} · $${b.rate.toFixed(2)}/h · ${b.roles.includes("admin") ? "staff + admin" : "staff"} access`, "security");
    await notify(db, userId, "Welcome to FarmTime", "Your account is ready. Change your temporary password from your profile.");
    res.status(201).json({ id: empId });
  });

  // Remove a person. Anyone with timesheets, leave or payroll history is archived (records are
  // kept for Fair Work's 7-year rule) and their login is disabled; anyone without history is deleted.
  r.delete("/employees/:id", requirePermission("employees.write"), async (req, res) => {
    const e = await db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
    if (!e || e.removed_at) throw notFound("Employee not found.");
    const uid = await userForEmployee(e.id);
    if (uid && uid === req.user.id) throw badRequest("You can’t remove your own account.");
    const history =
      (await db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE employee_id = ?").get(e.id)).n +
      (await db.prepare("SELECT COUNT(*) AS n FROM leave_requests WHERE employee_id = ?").get(e.id)).n;
    let mode;
    await db.transaction(async () => {
      if (history === 0) {
        if (uid) await db.prepare("DELETE FROM users WHERE id = ?").run(uid);
        await db.prepare("DELETE FROM employees WHERE id = ?").run(e.id);
        mode = "deleted";
      } else {
        await db.prepare("UPDATE employees SET status = 'Inactive', removed_at = ?, removed_by = ? WHERE id = ?").run(nowIso(), req.user.name, e.id);
        await db.prepare("DELETE FROM roster_shifts WHERE employee_id = ? AND date >= ?").run(e.id, ymd());
        await db.prepare("UPDATE leave_requests SET status = 'Cancelled' WHERE employee_id = ? AND status = 'Pending'").run(e.id);
        await db.prepare("UPDATE time_entries SET clock_out = ?, status = 'Pending', query_note = 'Closed when staff member was removed' WHERE employee_id = ? AND clock_out IS NULL").run(nowIso(), e.id);
        if (uid) {
          await db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(uid);
          await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
        }
        mode = "archived";
      }
    });
    await log(req, mode === "deleted" ? "Deleted staff member" : "Removed staff member", `${e.name}${mode === "archived" ? " · records kept, login disabled" : ""}`, "security");
    res.json({ ok: true, mode });
  });

  r.post("/employees/:id/restore", requirePermission("employees.write"), async (req, res) => {
    const e = await db.prepare("SELECT * FROM employees WHERE id = ? AND removed_at IS NOT NULL").get(req.params.id);
    if (!e) throw notFound("Removed employee not found.");
    await db.prepare("UPDATE employees SET status = 'Active', removed_at = NULL, removed_by = NULL WHERE id = ?").run(e.id);
    await db.prepare("UPDATE users SET disabled = 0 WHERE employee_id = ?").run(e.id);
    await log(req, "Restored staff member", e.name, "security");
    res.json({ ok: true });
  });

  r.patch("/employees/:id", requirePermission("employees.write"), async (req, res) => {
    const e = await db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
    if (!e) throw notFound("Employee not found.");
    const b = EmployeeBody.partial().extend({ email: Email.optional(), roles: Roles.optional(), password: Password.optional(), resetMfa: z.boolean().optional() }).parse(req.body);
    if (b.stationId && !await stationName(b.stationId)) throw badRequest("Unknown station.");
    const uid = await userForEmployee(e.id);
    if (uid && (b.email || b.roles || b.password)) {
      if (b.email) {
        const other = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(b.email, uid);
        if (other) throw conflict("Another account already uses that email.");
        await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(b.email, uid);
      }
      if (b.roles) {
        if (uid === req.user.id && !b.roles.includes("admin")) throw badRequest("You can’t remove your own admin access.");
        const before = (await db.prepare("SELECT role FROM user_roles WHERE user_id = ?").all(uid)).map((x) => x.role).sort().join(",");
        await db.transaction(async () => {
          await db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(uid);
          for (const role of new Set(["staff", ...b.roles])) await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(uid, role);
        });
        const after = [...new Set(["staff", ...b.roles])].sort().join(",");
        if (before !== after) {
          await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid); // new permissions apply at next sign-in
          await log(req, "Changed access level", `${e.name} · ${before} → ${after}`, "security");
        }
      }
      if (b.password) {
        await db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await bcrypt.hash(b.password, 12), nowIso(), uid);
        await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
        await log(req, "Reset password", e.name, "security");
      }
    }
    if (uid && b.resetMfa) {
      await db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL WHERE id = ?").run(uid);
      await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
      await log(req, "Reset authenticator", `${e.name} · must enrol again at next admin sign-in`, "security");
    }
    if (b.name && uid) await db.prepare("UPDATE users SET name = ?, initials = ? WHERE id = ?").run(b.name, initialsOf(b.name), uid);
    const next = {
      name: b.name ?? e.name,
      position: b.position ?? e.position,
      station_id: b.stationId ?? e.station_id,
      employment_type: b.type ?? e.employment_type,
      pay_rate: b.rate ?? e.pay_rate,
      status: b.status ?? e.status,
    };
    await db.prepare("UPDATE employees SET name = ?, initials = ?, position = ?, station_id = ?, employment_type = ?, pay_rate = ?, status = ? WHERE id = ?").run(
      next.name, initialsOf(next.name), next.position, next.station_id, next.employment_type, next.pay_rate, next.status, e.id
    );
    if (next.pay_rate !== e.pay_rate) await log(req, "Updated pay rate", `${e.name} · $${e.pay_rate.toFixed(2)} → $${next.pay_rate.toFixed(2)}/h`, "security");
    if (next.status !== e.status) await log(req, "Changed staff status", `${e.name} · ${e.status} → ${next.status}`);
    if (next.station_id !== e.station_id || next.position !== e.position || next.employment_type !== e.employment_type) await log(req, "Updated staff record", e.name);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- roster
  r.get("/roster", requirePermission("employees.read"), async (req, res) => {
    const ws = weekStart(req.query.week ? Ymd.parse(req.query.week) : ymd());
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const weather = Object.fromEntries((await db.prepare("SELECT * FROM weather WHERE date >= ? AND date <= ?").all(ws, days[6])).map((w) => [w.date, w]));
    const shifts = await db.prepare("SELECT r.*, s.name AS station FROM roster_shifts r JOIN stations s ON s.id = r.station_id WHERE date >= ? AND date <= ?").all(ws, days[6]);
    const leave = await db.prepare("SELECT * FROM leave_requests WHERE status = 'Approved' AND start_date <= ? AND end_date >= ?").all(days[6], ws);
    const employees = await db.prepare("SELECT e.*, s.name AS station FROM employees e JOIN stations s ON s.id = e.station_id WHERE e.status != 'Inactive' AND e.removed_at IS NULL ORDER BY e.sort").all();
    const pub = await db.prepare("SELECT * FROM roster_publications WHERE week_start = ?").get(ws);
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
      stations: await db.prepare("SELECT id, name FROM stations WHERE archived_at IS NULL ORDER BY sort").all(),
    });
  });

  r.put("/roster/shifts", requirePermission("roster.write"), async (req, res) => {
    const b = z.object({ employeeId: z.string(), date: Ymd, start: Time, end: Time, stationId: z.string().optional() }).parse(req.body);
    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(b.employeeId);
    if (!emp) throw notFound("Employee not found.");
    const stationId = b.stationId ?? emp.station_id;
    if (!await stationName(stationId)) throw badRequest("Unknown station.");
    if (b.end <= b.start) throw badRequest("The shift must end after it starts.");
    const mins = (at(b.date, b.end) - at(b.date, b.start)) / 60000;
    if (mins > 12 * 60) throw badRequest("Shifts can’t be longer than 12 hours.");
    const onLeave = await db.prepare("SELECT 1 FROM leave_requests WHERE employee_id = ? AND status = 'Approved' AND start_date <= ? AND end_date >= ?").get(emp.id, b.date, b.date);
    if (onLeave) throw conflict(`${emp.name} is on approved leave that day.`);
    // Fatigue rule: at least 10 hours between shifts.
    const prev = await db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, addDays(b.date, -1));
    const next = await db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, addDays(b.date, 1));
    if (prev && (at(b.date, b.start) - at(prev.date, prev.end_time)) / 3600_000 < 10) throw conflict(`Less than 10 hours’ rest after ${emp.name}’s previous shift (ends ${prev.end_time}).`);
    if (next && (at(next.date, next.start_time) - at(b.date, b.end)) / 3600_000 < 10) throw conflict(`Less than 10 hours’ rest before ${emp.name}’s next shift (starts ${next.start_time}).`);

    const existing = await db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(emp.id, b.date);
    const breakMin = defaultBreak(b.start, b.end);
    let shiftId;
    if (existing) {
      shiftId = existing.id;
      await db.prepare("UPDATE roster_shifts SET start_time = ?, end_time = ?, station_id = ?, break_min = ? WHERE id = ?").run(b.start, b.end, stationId, breakMin, shiftId);
    } else {
      shiftId = id("sh");
      await db.prepare("INSERT INTO roster_shifts (id, employee_id, station_id, date, start_time, end_time, break_min) VALUES (?, ?, ?, ?, ?, ?, ?)").run(shiftId, emp.id, stationId, b.date, b.start, b.end, breakMin);
    }
    await log(req, existing ? "Changed shift" : "Added shift", `${emp.name} · ${dayLabel(b.date)} ${b.start}–${b.end}`);
    if (await db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(weekStart(b.date))) {
      await notify(db, await userForEmployee(emp.id), "Roster changed", `${dayLabel(b.date)}: ${b.start}–${b.end} at ${await stationName(stationId)}.`);
    }
    res.json({ id: shiftId });
  });

  r.delete("/roster/shifts/:id", requirePermission("roster.write"), async (req, res) => {
    const s = await db.prepare("SELECT r.*, e.name FROM roster_shifts r JOIN employees e ON e.id = r.employee_id WHERE r.id = ?").get(req.params.id);
    if (!s) throw notFound("Shift not found.");
    await db.prepare("DELETE FROM roster_shifts WHERE id = ?").run(s.id);
    await log(req, "Removed shift", `${s.name} · ${dayLabel(s.date)} ${s.start_time}–${s.end_time}`);
    if (await db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(weekStart(s.date))) {
      await notify(db, await userForEmployee(s.employee_id), "Shift removed", `${dayLabel(s.date)} is no longer rostered.`);
    }
    res.json({ ok: true });
  });

  r.post("/roster/publish", requirePermission("roster.write"), async (req, res) => {
    const ws = weekStart(Ymd.parse(req.body?.week ?? ymd()));
    if (await db.prepare("SELECT 1 FROM roster_publications WHERE week_start = ?").get(ws)) throw conflict("This week’s roster is already published.");
    await db.prepare("INSERT INTO roster_publications (week_start, published_by, published_at) VALUES (?, ?, ?)").run(ws, req.user.name, nowIso());
    const empIds = (await db.prepare("SELECT DISTINCT employee_id FROM roster_shifts WHERE date >= ? AND date <= ?").all(ws, addDays(ws, 6))).map((x) => x.employee_id);
    for (const e of empIds) await notify(db, await userForEmployee(e), "Roster published", `Week of ${shortDate(ws)} is now available.`);
    await log(req, "Published roster", `Week of ${shortDate(ws)}`);
    res.json({ ok: true, notified: empIds.length });
  });

  // ---------------------------------------------------------------- stations
  r.get("/stations", requirePermission("stations.read"), async (req, res) => {
    const people = await onSite(db);
    const stations = await db.prepare("SELECT * FROM stations WHERE archived_at IS NULL ORDER BY sort").all();
    const events = (await db
      .prepare("SELECT * FROM audit_log WHERE action IN ('Clocked in','Clocked out','Device offline','Device online') ORDER BY id DESC LIMIT 10")
      .all())
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

  const StationBody = z.object({
    name: z.string().trim().min(2).max(60),
    method: z.string().trim().min(2).max(60).default("Station PIN"),
    device: z.string().trim().min(2).max(60).default("Tablet"),
  });

  r.post("/stations", requirePermission("employees.write"), async (req, res) => {
    const b = StationBody.parse(req.body);
    if (await db.prepare("SELECT 1 FROM stations WHERE lower(name) = lower(?)").get(b.name)) throw conflict("A station with that name already exists.");
    const sid = id("st");
    await db.prepare("INSERT INTO stations (id, name, method, device, online, last_seen) VALUES (?, ?, ?, ?, 1, ?)").run(sid, b.name, b.method, b.device, nowIso());
    await log(req, "Added station", `${b.name} · ${b.device}`);
    res.status(201).json({ id: sid });
  });

  r.patch("/stations/:id", requirePermission("stations.read"), async (req, res) => {
    const b = StationBody.partial().extend({ online: z.boolean().optional() }).parse(req.body);
    const s = await db.prepare("SELECT * FROM stations WHERE id = ? AND archived_at IS NULL").get(req.params.id);
    if (!s) throw notFound("Station not found.");
    if (b.online !== undefined && b.online !== !!s.online) {
      await db.prepare("UPDATE stations SET online = ?, last_seen = ? WHERE id = ?").run(b.online ? 1 : 0, nowIso(), s.id);
      await audit(db, { actor: req.user, action: b.online ? "Device online" : "Device offline", target: s.device, source: "Station monitor", level: b.online ? "info" : "warn" });
    }
    if (b.name || b.method || b.device) {
      await db.prepare("UPDATE stations SET name = ?, method = ?, device = ? WHERE id = ?").run(b.name ?? s.name, b.method ?? s.method, b.device ?? s.device, s.id);
      await log(req, "Updated station", b.name ?? s.name);
    }
    res.json({ ok: true });
  });

  r.delete("/stations/:id", requirePermission("employees.write"), async (req, res) => {
    const s = await db.prepare("SELECT * FROM stations WHERE id = ? AND archived_at IS NULL").get(req.params.id);
    if (!s) throw notFound("Station not found.");
    const assigned = (await db.prepare("SELECT COUNT(*) AS n FROM employees WHERE station_id = ? AND removed_at IS NULL").get(s.id)).n;
    if (assigned) throw conflict(`Move the ${assigned} staff member${assigned === 1 ? "" : "s"} at ${s.name} to another station first.`);
    const used = (await db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE station_id = ?").get(s.id)).n;
    if (used) await db.prepare("UPDATE stations SET archived_at = ?, online = 0 WHERE id = ?").run(nowIso(), s.id);
    else await db.prepare("DELETE FROM stations WHERE id = ?").run(s.id);
    await log(req, "Removed station", s.name);
    res.json({ ok: true });
  });

  // Weather flags used by the roster and dashboard (enter manually or from a forecast feed).
  r.put("/weather/:date", requirePermission("employees.write"), async (req, res) => {
    const date = Ymd.parse(req.params.date);
    const b = z.object({ temp: z.coerce.number().int().min(-20).max(60), flag: z.enum(["", "Heat", "Rain", "Wind"]).default("") }).parse(req.body);
    await db.prepare("INSERT INTO weather (date, temp, flag) VALUES (?, ?, ?) ON CONFLICT (date) DO UPDATE SET temp = excluded.temp, flag = excluded.flag").run(date, b.temp, b.flag);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- approvals
  r.get("/approvals", requirePermission("approvals.write"), async (req, res) => {
    const ts = await db
      .prepare(
        `SELECT t.*, e.name, s.name AS station FROM time_entries t JOIN employees e ON e.id = t.employee_id JOIN stations s ON s.id = t.station_id
          WHERE t.status IN ('Pending','Queried') ORDER BY t.status DESC, t.clock_in DESC`
      )
      .all();
    res.json({
      timesheets: await Promise.all(ts.map(async (t) => ({
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
        lateMinutes: await lateness(db, t),
      }))),
      missedClockOuts: (await missedClockOuts(db)).map((m) => ({ id: m.id, staffName: m.name, dateLabel: dayLabel(ymd(new Date(m.clock_in))), start: hhmm(m.clock_in) })),
    });
  });

  const getEntry = async (entryId) => {
    const t = await db.prepare("SELECT t.*, e.name FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?").get(entryId);
    if (!t) throw notFound("Timesheet not found.");
    return t;
  };

  r.post("/timesheets/approve", requirePermission("approvals.write"), async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(200) }).parse(req.body);
    let n = 0;
    for (const tid of ids) {
      const t = await getEntry(tid);
      if (t.status !== "Pending") continue;
      await db.prepare("UPDATE time_entries SET status = 'Approved', decided_by = ? WHERE id = ?").run(req.user.name, t.id);
      await log(req, "Approved timesheet", `${t.name} · ${dayLabel(ymd(new Date(t.clock_in)))}`);
      n++;
    }
    res.json({ approved: n });
  });

  r.post("/timesheets/:id/query", requirePermission("approvals.write"), async (req, res) => {
    const { note } = z.object({ note: z.string().trim().min(3).max(300) }).parse(req.body);
    const t = await getEntry(req.params.id);
    if (t.status !== "Pending") throw conflict("Only pending timesheets can be queried.");
    await db.prepare("UPDATE time_entries SET status = 'Queried', query_note = ? WHERE id = ?").run(note, t.id);
    await notify(db, await userForEmployee(t.employee_id), "Timesheet queried", `${dayLabel(ymd(new Date(t.clock_in)))}: ${note}`);
    await log(req, "Queried timesheet", `${t.name} · ${dayLabel(ymd(new Date(t.clock_in)))}`);
    res.json({ ok: true });
  });

  // Close a missed clock-out at the rostered end (or a given time).
  r.post("/timesheets/:id/close", requirePermission("approvals.write"), async (req, res) => {
    const { end } = z.object({ end: Time.optional() }).parse(req.body ?? {});
    const t = await getEntry(req.params.id);
    if (t.clock_out) throw conflict("That entry is already closed.");
    const d = ymd(new Date(t.clock_in));
    const shift = await db.prepare("SELECT * FROM roster_shifts WHERE employee_id = ? AND date = ?").get(t.employee_id, d);
    const endTime = end ?? shift?.end_time;
    if (!endTime) throw badRequest("No rostered end time. Provide an end time.");
    const out = at(d, endTime);
    if (out <= new Date(t.clock_in)) throw badRequest("End time must be after the clock-in time.");
    await db.prepare("UPDATE time_entries SET clock_out = ?, break_min = ?, status = 'Pending' WHERE id = ?").run(out.toISOString(), shift?.break_min ?? 0, t.id);
    await log(req, "Closed missed clock-out", `${t.name} · ${dayLabel(d)} at ${endTime}`, "warn");
    res.json({ ok: true });
  });

  r.post("/leave/:id/decision", requirePermission("approvals.write"), async (req, res) => {
    const { status } = z.object({ status: z.enum(["Approved", "Declined"]) }).parse(req.body);
    const l = await db.prepare("SELECT l.*, e.name, e.annual_leave_h, e.personal_leave_h FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.id = ?").get(req.params.id);
    if (!l) throw notFound("Leave request not found.");
    if (l.status !== "Pending") throw conflict(`This request was already ${l.status.toLowerCase()}.`);
    const tx = () => db.transaction(async () => {
      await db.prepare("UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(status, req.user.name, nowIso(), l.id);
      if (status === "Approved") {
        const hours = l.days * 7.6;
        if (l.type === "Annual leave") await db.prepare("UPDATE employees SET annual_leave_h = GREATEST(0, annual_leave_h - ?) WHERE id = ?").run(hours, l.employee_id);
        if (l.type === "Personal leave") await db.prepare("UPDATE employees SET personal_leave_h = GREATEST(0, personal_leave_h - ?) WHERE id = ?").run(hours, l.employee_id);
      }
    });
    await tx();
    await notify(db, await userForEmployee(l.employee_id), `Leave ${status.toLowerCase()}`, `${l.type}, ${shortDate(l.start_date)}${l.end_date !== l.start_date ? `–${shortDate(l.end_date)}` : ""}.`);
    await log(req, `${status} leave`, `${l.name} · ${shortDate(l.start_date)}–${shortDate(l.end_date)}`);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- payroll
  const payrollDto = async (run) => {
    const rows = await payrollRows(db, run);
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

  r.get("/payroll", requirePermission("payroll.process"), async (req, res) => {
    res.json(await payrollDto(await ensurePayrollRun(db)));
  });

  r.post("/payroll/advance", requirePermission("payroll.process"), async (req, res) => {
    const run = await ensurePayrollRun(db);
    if (run.step >= STEPS.length) throw conflict("Payroll for this period is already complete.");
    const stepName = STEPS[run.step];
    const tx = () => db.transaction(async () => {
      if (run.step === 1) {
        // Approve hours: approve every pending entry in the period. Queried entries are excluded.
        const ids = (await entriesBetween(db, run.period_start, addDays(run.period_end, 1), "AND status = 'Pending' AND clock_out IS NOT NULL")).map((t) => t.id);
        const stmt = db.prepare("UPDATE time_entries SET status = 'Approved', decided_by = ? WHERE id = ?");
        for (const tid of ids) await stmt.run(req.user.name, tid);
      }
      if (run.step === 2) {
        for (const row of await payrollRows(db, run)) {
          await notify(db, await userForEmployee(row.employeeId), "Payslip ready", `${shortDate(run.period_start)}–${shortDate(run.period_end)}: $${row.gross.toFixed(2)} gross, paid ${dayLabel(run.pay_date)}.`);
        }
      }
      await db.prepare("UPDATE payroll_runs SET step = step + 1, updated_by = ?, updated_at = ? WHERE id = ?").run(req.user.name, nowIso(), run.id);
    });
    await tx();
    await log(req, `Payroll: ${stepName.toLowerCase()}`, `${shortDate(run.period_start)} – ${shortDate(run.period_end)}`, "security");
    const updated = await db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(run.id);
    const out = await payrollDto(updated);
    if (run.step === 3) {
      const body = csv([
        ["Employee", "Ordinary hours", "Overtime hours", "Rate", "Gross", "Super"],
        ...out.rows.map((r) => [r.name, r.ordinary, r.overtime, r.rate.toFixed(2), r.gross.toFixed(2), r.superannuation.toFixed(2)]),
      ]);
      out.export = await createDownload(db, `payroll-${run.period_start}.csv`, "text/csv", body);
    }
    res.json(out);
  });

  r.post("/payroll/export", requirePermission("payroll.process"), async (req, res) => {
    const out = await payrollDto(await ensurePayrollRun(db));
    const body = csv([
      ["Employee", "Ordinary hours", "Overtime hours", "Rate", "Gross", "Super", "Pending", "Queried"],
      ...out.rows.map((r) => [r.name, r.ordinary, r.overtime, r.rate.toFixed(2), r.gross.toFixed(2), r.superannuation.toFixed(2), r.pending, r.queried]),
    ]);
    await log(req, "Exported payroll CSV", out.period.label, "security");
    res.json(await createDownload(db, `payroll-${out.period.start}.csv`, "text/csv", body));
  });

  // ---------------------------------------------------------------- reports
  r.get("/reports", requirePermission("employees.read"), async (req, res) => {
    const today = ymd();
    const monthStart = today.slice(0, 8) + "01";
    const prevMonthStart = ymd(new Date(parseYmd(monthStart).getFullYear(), parseYmd(monthStart).getMonth() - 1, 1));
    const rate = Object.fromEntries((await db.prepare("SELECT id, pay_rate FROM employees").all()).map((e) => [e.id, e.pay_rate]));
    const closed = (from, to) => entriesBetween(db, from, to, "AND clock_out IS NOT NULL");

    // Reporting window: the last 28 days, so the numbers are meaningful early in a month too.
    const windowStart = addDays(today, -28);
    const win = await closed(windowStart, addDays(today, 1));
    const stations = await db.prepare("SELECT id, name FROM stations WHERE archived_at IS NULL ORDER BY sort").all();
    const byStation = stations.map((s) => ({ name: s.name, hours: round1(win.filter((t) => t.station_id === s.id).reduce((a, t) => a + entryHours(t), 0)) }));
    const totalHours = byStation.reduce((a, s) => a + s.hours, 0);

    const cost = (rows) => rows.reduce((a, t) => a + entryHours(t) * (rate[t.employee_id] ?? 0), 0);
    const thisMonth = cost(await closed(monthStart, addDays(today, 1)));
    const lastMonthSameDays = cost(await closed(prevMonthStart, addDays(prevMonthStart, Number(today.slice(8, 10)))));

    const weeks = [];
    for (let w = 4; w >= 0; w--) {
      const ws = addDays(weekStart(today), -7 * w);
      const rows = await closed(ws, addDays(ws, 7));
      const per = {};
      for (const t of rows) per[t.employee_id] = (per[t.employee_id] ?? 0) + entryHours(t);
      weeks.push({ week: shortDate(ws), hours: round1(Object.values(per).reduce((a, h) => a + Math.max(0, h - 38), 0)) });
    }
    const overtime4w = weeks.slice(0, 4).reduce((a, w) => a + w.hours, 0);
    const late = (await Promise.all(win.map((t) => lateness(db, t)))).filter((m) => m !== null);
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

  const auditQuery = async (req, maxRows) => {
    const level = req.query.level && req.query.level !== "all" ? z.enum(["info", "warn", "security"]).parse(req.query.level) : null;
    const q = String(req.query.q ?? "").trim();
    const limit = maxRows ?? Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const where = [];
    const params = [];
    if (level) { where.push("level = ?"); params.push(level); }
    if (q) {
      where.push("(actor_name ILIKE ? OR action ILIKE ? OR target ILIKE ? OR source ILIKE ?)");
      const like = `%${q.replace(/[%_]/g, "")}%`;
      params.push(like, like, like, like);
    }
    return await db.prepare(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${limit}`).all(...params);
  };

  r.get("/audit", requirePermission("audit.read"), async (req, res) => {
    res.json({ events: (await auditQuery(req)).map(auditDto) });
  });

  r.post("/audit/export", requirePermission("audit.read"), async (req, res) => {
    const rows = await auditQuery(req, 5000);
    const body = csv([["Time", "Actor", "Action", "Target", "Source", "Level", "IP"], ...rows.map((a) => [a.at, a.actor_name, a.action, a.target, a.source, a.level, a.ip])]);
    await log(req, "Exported audit log", `${rows.length} events`, "security");
    res.json(await createDownload(db, `audit-${ymd()}.csv`, "text/csv", body));
  });

  // ---------------------------------------------------------------- settings
  const settingsDto = async () => {
    const s = await getSettings(db);
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

  r.get("/settings", requirePermission("settings.write"), async (req, res) => res.json(await settingsDto()));

  r.patch("/settings", requirePermission("settings.write"), async (req, res) => {
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
    const before = await getSettings(db);
    await saveSettings(db, patch);
    for (const [k, v] of Object.entries(patch)) if (before[k] !== v) await log(req, "Changed security setting", `${k}: ${before[k]} → ${v}`, "security");
    res.json(await settingsDto());
  });

  return r;
}
