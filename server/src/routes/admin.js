// Admin workspace (Office Admin, Roster Admin, Manager/Supervisor; MFA verified).
// Each route checks a permission from permissions.js. Data changes write an
// audit_logs row with a reason and the admin's staff id.
import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "../config.js";
import { audit, security } from "../audit.js";
import { requirePermission } from "../auth.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { ALL_ROLES, matrix } from "../permissions.js";
import { createDownload } from "./downloads.js";
import { AdjustmentBody, LEAVE_TYPES, createAdjustment, leaveDto, listAdjustments, payslipDto } from "./me.js";
import { activeRule, calculatePay, detectExceptions, hoursPerDay, isStale, loadShifts, periodFor, publicShift, recentPeriods, rosterDto, staffDto } from "../domain.js";
import { addDays, csv, hhmm, round2, weekStart, ymd } from "../util.js";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const Hm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM.");
const Id = z.coerce.number().int().positive();
const pid = (req) => Id.parse(req.params.id);

export function adminRoutes(db) {
  const r = Router();
  const me = (req) => req.user.staffId;

  // ======================= Dashboard =======================
  r.get("/dashboard", async (req, res) => {
    await detectExceptions(db);
    const today = ymd();
    const now = new Date();
    const roster = await db
      .prepare("SELECT r.*, st.name AS station_name, s.first_name, s.last_name FROM roster r JOIN staff s ON s.staff_id = r.staff_id LEFT JOIN stations st ON st.station_id = r.station_id WHERE r.shift_date = ? AND s.removed_at IS NULL ORDER BY r.start_time")
      .all(today);
    const shifts = await loadShifts(db, { from: addDays(today, -1), to: today });
    const latestBy = new Map();
    for (const s of shifts) if ((s.date === today || !s.clockOut) && !isStale(s, now)) latestBy.set(s.staffId, s);
    const names = new Map((await db.prepare("SELECT staff_id, first_name, last_name FROM staff").all()).map((s) => [s.staff_id, `${s.first_name} ${s.last_name}`]));
    const board = roster.map((r) => {
      const ro = rosterDto(r);
      const s = latestBy.get(r.staff_id);
      const start = new Date(`${today}T${ro.startTime}:00`);
      const state = !s ? (now > new Date(start.getTime() + 10 * 60000) ? "late" : "not_in") : s.clockOut ? "done" : s.breaks.some((b) => !b.end) ? "break" : "working";
      return { staffId: r.staff_id, name: `${r.first_name} ${r.last_name}`, roster: ro, state, clockIn: s?.clockIn ?? null, clockOut: s?.clockOut ?? null, station: s?.station ?? null, workedHours: s?.workedHours ?? 0 };
    });
    for (const s of latestBy.values()) {
      if (!roster.some((r) => r.staff_id === s.staffId) && !s.clockOut)
        board.push({ staffId: s.staffId, name: names.get(s.staffId), roster: null, state: s.breaks.some((b) => !b.end) ? "break" : "working", clockIn: s.clockIn, clockOut: null, station: s.station, workedHours: s.workedHours, unrostered: true });
    }
    const openEx = await exceptionsQuery({ status: "Open", limit: 8 });
    const counts = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM exceptions WHERE status = 'Open') AS open_exceptions,
                (SELECT COUNT(*) FROM time_adjustments WHERE status = 'Pending') AS pending_adjustments,
                (SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending') AS pending_leave,
                (SELECT COUNT(*) FROM staff WHERE removed_at IS NULL) AS active_staff`
      )
      .get();
    const prev = periodFor(addDays(periodFor().start, -1));
    const run = await db.prepare("SELECT * FROM payroll_runs WHERE period_start = ?").get(prev.start);
    res.json({
      today,
      board,
      onSite: board.filter((b) => ["working", "break"].includes(b.state)).length,
      onBreak: board.filter((b) => b.state === "break").length,
      rostered: roster.length,
      late: board.filter((b) => b.state === "late").length,
      counts: { openExceptions: counts.open_exceptions, pendingAdjustments: counts.pending_adjustments, pendingLeave: counts.pending_leave, activeStaff: counts.active_staff },
      exceptions: openEx,
      stations: await stationsList(),
      payroll: { period: prev, step: run?.step ?? 0, approvedAt: run?.approved_at ?? null },
      rule: await activeRule(db),
    });
  });

  // ======================= Staff management =======================
  const loginFor = async (staffId) => {
    const u = await db.prepare("SELECT user_id, email, disabled, totp_secret IS NOT NULL AS mfa FROM users WHERE staff_id = ?").get(staffId);
    if (!u) return null;
    const roles = (await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").all(u.user_id)).map((x) => x.role);
    return { userId: u.user_id, email: u.email, disabled: u.disabled, mfaEnrolled: u.mfa, roles };
  };

  async function hasHistory(staffId) {
    const q = await db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM time_events WHERE staff_id = ?1 OR created_by = ?1)
             OR EXISTS (SELECT 1 FROM payroll_summary WHERE staff_id = ?1)
             OR EXISTS (SELECT 1 FROM leave_requests WHERE staff_id = ?1 OR decided_by = ?1)
             OR EXISTS (SELECT 1 FROM time_adjustments WHERE staff_id = ?1 OR requested_by = ?1 OR approver = ?1)
             OR EXISTS (SELECT 1 FROM exceptions WHERE staff_id = ?1)
             OR EXISTS (SELECT 1 FROM audit_logs WHERE changed_by = ?1)
             OR EXISTS (SELECT 1 FROM payroll_runs WHERE approved_by = ?1 OR updated_by = ?1)
             OR EXISTS (SELECT 1 FROM staff WHERE removed_by = ?1)
             OR EXISTS (SELECT 1 FROM roster WHERE staff_id = ?1 AND shift_date < CURRENT_DATE) AS h`.replace(/\?1/g, "$1")
      )
      .get(staffId);
    return q.h;
  }
  // The query above uses $1 directly; prepare() only rewrites '?'.

  async function activeOfficeAdmins(exceptUserId = null) {
    return (
      await db
        .prepare(
          `SELECT COUNT(*) AS n FROM users u JOIN user_roles ur ON ur.user_id = u.user_id AND ur.role = 'Office Admin'
             JOIN staff s ON s.staff_id = u.staff_id
            WHERE u.disabled = FALSE AND s.removed_at IS NULL AND (?::int IS NULL OR u.user_id <> ?::int)`
        )
        .get(exceptUserId, exceptUserId)
    ).n;
  }

  r.get("/staff", requirePermission("staff.read"), async (req, res) => {
    const q = z.object({ status: z.enum(["active", "removed", "all"]).default("active"), q: z.string().max(100).optional() }).parse(req.query);
    const rows = await db
      .prepare(
        `SELECT s.*, u.email, u.disabled, u.totp_secret IS NOT NULL AS mfa,
                COALESCE((SELECT array_agg(role ORDER BY role) FROM user_roles ur WHERE ur.user_id = u.user_id), '{}') AS access_roles
           FROM staff s LEFT JOIN users u ON u.staff_id = s.staff_id
          WHERE (?::text = 'all' OR (?::text = 'active' AND s.removed_at IS NULL) OR (?::text = 'removed' AND s.removed_at IS NOT NULL))
            AND (?::text IS NULL OR (s.first_name || ' ' || s.last_name || ' ' || COALESCE(s.role,'') || ' ' || COALESCE(u.email,'')) ILIKE '%' || ?::text || '%')
          ORDER BY s.first_name, s.last_name`
      )
      .all(q.status, q.status, q.status, q.q || null, q.q || null);
    const today = ymd();
    const onLeave = new Set((await db.prepare("SELECT staff_id FROM leave_requests WHERE status = 'Approved' AND ? BETWEEN start_date AND end_date").all(today)).map((x) => x.staff_id));
    const canPay = req.user.roles.includes("Office Admin");
    res.json({
      staff: rows.map((s) => {
        const d = staffDto(s, {
          status: s.removed_at ? "Removed" : onLeave.has(s.staff_id) ? "On leave" : "Active",
          login: s.email ? { email: s.email, disabled: s.disabled, mfaEnrolled: s.mfa, roles: s.access_roles } : null,
        });
        if (!canPay) for (const k of ["standardRate", "overtimeRate", "emergencyContactPhone"]) d[k] = null; // Roster Admin / Manager: read-only list
        return d;
      }),
      roles: ALL_ROLES,
      contractTypes: ["Full Time", "Part Time", "Casual"],
    });
  });

  r.get("/staff/:id", requirePermission("staff.read"), async (req, res) => {
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ?").get(pid(req));
    if (!s) throw notFound("Staff member not found.");
    const d = staffDto(s, { login: await loginFor(s.staff_id), canHardDelete: !(await hasHistory(s.staff_id)) });
    if (!req.user.roles.includes("Office Admin")) for (const k of ["standardRate", "overtimeRate", "emergencyContactPhone"]) d[k] = null;
    res.json({ staff: d });
  });

  const StaffFields = z.object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    jobTitle: z.string().trim().max(50).optional().nullable(),
    contractType: z.enum(["Full Time", "Part Time", "Casual"]),
    standardHours: z.coerce.number().min(0).max(60).default(38),
    standardRate: z.coerce.number().positive().max(500),
    overtimeRate: z.coerce.number().positive().max(1000).optional(),
    credentialRef: z.string().trim().max(100).optional().nullable(),
    hoursType: z.enum(["Weekly", "Patterned"]).default("Weekly"),
    patternDays: z.string().trim().max(30).optional().nullable(),
    patternStart: Hm.optional().nullable(),
    patternEnd: Hm.optional().nullable(),
    annualLeaveHours: z.coerce.number().min(0).max(2000).optional(),
    personalLeaveHours: z.coerce.number().min(0).max(2000).optional(),
    emergencyContactName: z.string().trim().max(100).optional().nullable(),
    emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
  });
  const LoginFields = z.object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(10, "Passwords need at least 10 characters.").max(200).optional(),
    roles: z.array(z.enum(ALL_ROLES)).min(1, "Pick at least one access role."),
  });

  const checkPattern = (b) => {
    if (b.hoursType === "Patterned" && !(b.patternDays && b.patternStart && b.patternEnd)) throw badRequest("Patterned hours need days, a start time and an end time.");
  };
  const tempPassword = () => `FT-${crypto.randomBytes(6).toString("base64url")}`;

  async function saveLogin(staffId, s, l, adminStaffId) {
    const existing = await db.prepare("SELECT user_id FROM users WHERE staff_id = ?").get(staffId);
    const clash = await db.prepare("SELECT user_id FROM users WHERE lower(email) = ? AND staff_id IS DISTINCT FROM ?").get(l.email, staffId);
    if (clash) throw conflict("Another account already uses that email.");
    let password = null, userId;
    if (existing) {
      userId = existing.user_id;
      const had = await loginFor(staffId);
      if (had.roles.includes("Office Admin") && !l.roles.includes("Office Admin") && (await activeOfficeAdmins(userId)) === 0) throw conflict("Keep at least one Office Admin.");
      await db.prepare("UPDATE users SET email = ?, name = ? WHERE user_id = ?").run(l.email, `${s.first_name} ${s.last_name}`, userId);
      if (l.password) await db.prepare("UPDATE users SET password_hash = ?, password_changed_at = NULL WHERE user_id = ?").run(await bcrypt.hash(l.password, 12), userId);
      await db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    } else {
      password = l.password ?? tempPassword();
      userId = (await db.prepare("INSERT INTO users (staff_id, email, password_hash, name) VALUES (?, ?, ?, ?) RETURNING user_id").get(staffId, l.email, await bcrypt.hash(password, 12), `${s.first_name} ${s.last_name}`)).user_id;
    }
    for (const role of new Set(l.roles)) await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, role);
    await audit(db, { table: "staff", recordId: staffId, action: "UPDATE", reason: `Login ${existing ? "updated" : "created"}: ${l.email}; access roles ${[...new Set(l.roles)].join(", ")}`, by: adminStaffId });
    security("login_saved", { staffId, by: adminStaffId, roles: l.roles });
    return { userId, temporaryPassword: l.password ? null : password };
  }

  r.post("/staff", requirePermission("staff.write"), async (req, res) => {
    const b = StaffFields.extend({ login: LoginFields.optional().nullable() }).parse(req.body);
    checkPattern(b);
    const out = await db.transaction(async () => {
      const s = await db
        .prepare(
          `INSERT INTO staff (first_name, last_name, contract_type, standard_hours, role, standard_rate, overtime_rate, credential_ref, hours_type,
                              pattern_days, pattern_start, pattern_end, annual_leave_hours, personal_leave_hours, emergency_contact_name, emergency_contact_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        )
        .get(
          b.firstName, b.lastName, b.contractType, b.standardHours, b.jobTitle || null, b.standardRate, b.overtimeRate ?? round2(b.standardRate * 1.5),
          b.credentialRef || null, b.hoursType, b.hoursType === "Patterned" ? b.patternDays : null, b.hoursType === "Patterned" ? b.patternStart : null,
          b.hoursType === "Patterned" ? b.patternEnd : null, b.annualLeaveHours ?? 0, b.personalLeaveHours ?? 0, b.emergencyContactName || null, b.emergencyContactPhone || null
        );
      await audit(db, { table: "staff", recordId: s.staff_id, action: "INSERT", reason: `Added staff member ${s.first_name} ${s.last_name} (${s.contract_type})`, by: me(req) });
      const login = b.login ? await saveLogin(s.staff_id, s, b.login, me(req)) : null;
      return { s, login };
    });
    res.status(201).json({ staff: staffDto(out.s, { login: await loginFor(out.s.staff_id) }), temporaryPassword: out.login?.temporaryPassword ?? null });
  });

  r.patch("/staff/:id", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const before = await db.prepare("SELECT * FROM staff WHERE staff_id = ?").get(id);
    if (!before) throw notFound("Staff member not found.");
    const b = StaffFields.partial().extend({ reason: z.string().trim().max(150).optional() }).parse(req.body);
    const merged = { ...staffDto(before), ...b };
    checkPattern(merged);
    const cols = {
      first_name: b.firstName, last_name: b.lastName, role: b.jobTitle, contract_type: b.contractType, standard_hours: b.standardHours,
      standard_rate: b.standardRate, overtime_rate: b.overtimeRate, credential_ref: b.credentialRef, hours_type: b.hoursType,
      pattern_days: b.patternDays, pattern_start: b.patternStart, pattern_end: b.patternEnd, annual_leave_hours: b.annualLeaveHours,
      personal_leave_hours: b.personalLeaveHours, emergency_contact_name: b.emergencyContactName, emergency_contact_phone: b.emergencyContactPhone,
    };
    if (merged.hoursType === "Weekly") Object.assign(cols, { pattern_days: null, pattern_start: null, pattern_end: null });
    const set = Object.entries(cols).filter(([, v]) => v !== undefined);
    if (!set.length) throw badRequest("Nothing to update.");
    const changed = set.filter(([k, v]) => String(before[k] ?? "").slice(0, 5) !== String(v ?? "").slice(0, 5) || String(before[k] ?? "") !== String(v ?? "")).map(([k]) => k);
    await db.transaction(async () => {
      await db.prepare(`UPDATE staff SET ${set.map(([k]) => `${k} = ?`).join(", ")} WHERE staff_id = ?`).run(...set.map(([, v]) => (v === "" ? null : v)), id);
      const pay = ["standard_rate", "overtime_rate"].filter((k) => changed.includes(k)).map((k) => `${k.replace("_", " ")} ${before[k]} → ${cols[k]}`);
      const reason = b.reason || (pay.length ? `Pay rate changed: ${pay.join("; ")}` : `Updated ${changed.map((k) => k.replace(/_/g, " ")).join(", ") || "staff record"}`);
      await audit(db, { table: "staff", recordId: id, action: "UPDATE", reason, by: me(req) });
    });
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ?").get(id);
    res.json({ staff: staffDto(s, { login: await loginFor(id) }) });
  });

  r.put("/staff/:id/login", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ? AND removed_at IS NULL").get(id);
    if (!s) throw notFound("Active staff member not found.");
    const l = LoginFields.parse(req.body);
    if (id === me(req) && !l.roles.includes("Office Admin")) throw forbidden("You can’t remove your own Office Admin role.");
    const out = await db.transaction(() => saveLogin(id, s, l, me(req)));
    res.json({ login: await loginFor(id), temporaryPassword: out.temporaryPassword });
  });

  r.post("/staff/:id/login/reset-mfa", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const u = await db.prepare("SELECT user_id FROM users WHERE staff_id = ?").get(id);
    if (!u) throw notFound("This staff member has no login.");
    await db.transaction(async () => {
      await db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL WHERE user_id = ?").run(u.user_id);
      await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.user_id);
      await audit(db, { table: "staff", recordId: id, action: "UPDATE", reason: "Authenticator reset; set up again at next admin sign-in", by: me(req) });
    });
    res.json({ ok: true });
  });

  r.post("/staff/:id/pin", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ? AND removed_at IS NULL").get(id);
    if (!s) throw notFound("Active staff member not found.");
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const expires = new Date(Date.now() + config.pinValidHours * 3600_000);
    await db.transaction(async () => {
      await db.prepare("UPDATE staff SET pin_hash = ?, pin_expires_at = ? WHERE staff_id = ?").run(await bcrypt.hash(pin, 12), expires, id);
      await audit(db, { table: "staff", recordId: id, action: "UPDATE", reason: `Temporary ${config.pinValidHours}-hour PIN issued`, by: me(req) });
    });
    res.json({ pin, expiresAt: expires });
  });

  r.delete("/staff/:id", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const { reason } = z.object({ reason: z.string().trim().max(150).optional() }).parse(req.body ?? {});
    if (id === me(req)) throw forbidden("You can’t remove yourself.");
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ?").get(id);
    if (!s) throw notFound("Staff member not found.");
    if (s.removed_at) throw conflict("Already removed.");
    const login = await loginFor(id);
    if (login?.roles.includes("Office Admin") && !login.disabled && (await activeOfficeAdmins(login.userId)) === 0) throw conflict("Keep at least one Office Admin.");
    const name = `${s.first_name} ${s.last_name}`;
    const result = await db.transaction(async () => {
      if (!(await hasHistory(id))) {
        await db.prepare("DELETE FROM users WHERE staff_id = ?").run(id); // user_roles + sessions cascade
        await db.prepare("DELETE FROM roster WHERE staff_id = ?").run(id);
        await db.prepare("DELETE FROM staff WHERE staff_id = ?").run(id);
        await audit(db, { table: "staff", recordId: id, action: "DELETE", reason: reason || `Deleted ${name} (no time, pay or leave history)`, by: me(req) });
        return "deleted";
      }
      await db.prepare("UPDATE staff SET removed_at = now(), removed_by = ?, pin_hash = NULL, pin_expires_at = NULL WHERE staff_id = ?").run(me(req), id);
      await db.prepare("UPDATE users SET disabled = TRUE WHERE staff_id = ?").run(id);
      await db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users WHERE staff_id = ?)").run(id);
      const fut = await db.prepare("DELETE FROM roster WHERE staff_id = ? AND shift_date > CURRENT_DATE").run(id);
      const lv = await db.prepare("UPDATE leave_requests SET status = 'Rejected', decided_by = ?, decided_at = now() WHERE staff_id = ? AND status = 'Pending'").run(me(req), id);
      await audit(db, { table: "staff", recordId: id, action: "UPDATE", reason: reason || `Removed ${name}; login disabled, ${fut.changes} future shift(s) and ${lv.changes} pending leave request(s) cleared`, by: me(req) });
      return "removed";
    });
    res.json({ ok: true, result });
  });

  r.post("/staff/:id/restore", requirePermission("staff.write"), async (req, res) => {
    const id = pid(req);
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ? AND removed_at IS NOT NULL").get(id);
    if (!s) throw notFound("No removed staff member with that id.");
    await db.transaction(async () => {
      await db.prepare("UPDATE staff SET removed_at = NULL, removed_by = NULL WHERE staff_id = ?").run(id);
      await db.prepare("UPDATE users SET disabled = FALSE WHERE staff_id = ?").run(id);
      await audit(db, { table: "staff", recordId: id, action: "UPDATE", reason: `Restored ${s.first_name} ${s.last_name}; login re-enabled`, by: me(req) });
    });
    res.json({ ok: true });
  });

  // ======================= Roster =======================
  r.get("/roster", requirePermission("staff.read"), async (req, res) => {
    const { week } = z.object({ week: Ymd.optional() }).parse(req.query);
    const start = weekStart(week ?? ymd());
    const end = addDays(start, 6);
    const staff = await db.prepare("SELECT staff_id, first_name, last_name, role, contract_type, standard_hours FROM staff WHERE removed_at IS NULL ORDER BY first_name, last_name").all();
    const rows = await db.prepare("SELECT r.*, st.name AS station_name FROM roster r LEFT JOIN stations st ON st.station_id = r.station_id WHERE r.shift_date BETWEEN ? AND ? ORDER BY r.shift_date, r.start_time").all(start, end);
    const leave = await db.prepare("SELECT * FROM leave_requests WHERE status = 'Approved' AND start_date <= ? AND end_date >= ?").all(end, start);
    const shifts = rows.map(rosterDto);
    res.json({
      week: start,
      days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
      today: ymd(),
      staff: staff.map((s) => ({ id: s.staff_id, name: `${s.first_name} ${s.last_name}`, jobTitle: s.role, contractType: s.contract_type, standardHours: s.standard_hours, rosteredHours: round2(shifts.filter((x) => x.staffId === s.staff_id).reduce((a, x) => a + x.expectedHours, 0)) })),
      shifts,
      leave: leave.map(leaveDto),
      stations: await db.prepare("SELECT station_id AS id, name FROM stations ORDER BY name").all(),
      holidays: await db.prepare("SELECT holiday_date AS date, name FROM public_holidays WHERE holiday_date BETWEEN ? AND ? AND state IN (?, 'NAT')").all(start, end, config.holidayState),
    });
  });

  const ShiftBody = z.object({
    id: Id.optional(),
    staffId: Id,
    date: Ymd,
    startTime: Hm,
    expectedHours: z.coerce.number().min(0.5).max(12),
    stationId: Id.optional().nullable(),
    team: z.string().trim().max(50).optional().nullable(),
    site: z.string().trim().max(50).optional().nullable(),
  });

  r.put("/roster/shifts", requirePermission("roster.write"), async (req, res) => {
    const b = ShiftBody.parse(req.body);
    if (b.date < ymd()) throw badRequest("Past shifts can’t be changed. Use a time correction instead.");
    const s = await db.prepare("SELECT * FROM staff WHERE staff_id = ? AND removed_at IS NULL").get(b.staffId);
    if (!s) throw badRequest("That staff member isn’t active.");
    const clash = await db.prepare("SELECT roster_id FROM roster WHERE staff_id = ? AND shift_date = ? AND (?::int IS NULL OR roster_id <> ?::int)").get(b.staffId, b.date, b.id ?? null, b.id ?? null);
    if (clash) throw conflict(`${s.first_name} already has a shift that day.`);
    const lv = await db.prepare("SELECT type FROM leave_requests WHERE staff_id = ? AND status = 'Approved' AND ? BETWEEN start_date AND end_date").get(b.staffId, b.date);
    if (lv) throw conflict(`${s.first_name} is on approved ${lv.type.toLowerCase()} leave that day.`);
    if (b.stationId && !(await db.prepare("SELECT 1 FROM stations WHERE station_id = ?").get(b.stationId))) throw badRequest("Unknown station.");
    const row = await db.transaction(async () => {
      let row;
      if (b.id) {
        const old = await db.prepare("SELECT * FROM roster WHERE roster_id = ?").get(b.id);
        if (!old) throw notFound("Shift not found.");
        if (old.shift_date < ymd()) throw badRequest("Past shifts can’t be changed.");
        row = await db
          .prepare("UPDATE roster SET staff_id = ?, shift_date = ?, start_time = ?, expected_hours = ?, station_id = ?, team = ?, site = ? WHERE roster_id = ? RETURNING *")
          .get(b.staffId, b.date, b.startTime, b.expectedHours, b.stationId ?? null, b.team ?? null, b.site ?? null, b.id);
        await audit(db, { table: "roster", recordId: row.roster_id, action: "UPDATE", reason: `Shift for ${s.first_name} ${s.last_name} on ${b.date} set to ${b.startTime}, ${b.expectedHours} h`, by: me(req) });
      } else {
        row = await db
          .prepare("INSERT INTO roster (staff_id, shift_date, start_time, expected_hours, station_id, team, site) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *")
          .get(b.staffId, b.date, b.startTime, b.expectedHours, b.stationId ?? null, b.team ?? null, b.site ?? null);
        await audit(db, { table: "roster", recordId: row.roster_id, action: "INSERT", reason: `Rostered ${s.first_name} ${s.last_name} on ${b.date} at ${b.startTime}, ${b.expectedHours} h`, by: me(req) });
      }
      return row;
    });
    res.json({ shift: rosterDto(row) });
  });

  r.delete("/roster/shifts/:id", requirePermission("roster.write"), async (req, res) => {
    const id = pid(req);
    const old = await db.prepare("SELECT r.*, s.first_name, s.last_name FROM roster r JOIN staff s ON s.staff_id = r.staff_id WHERE roster_id = ?").get(id);
    if (!old) throw notFound("Shift not found.");
    if (old.shift_date < ymd()) throw badRequest("Past shifts can’t be removed.");
    await db.transaction(async () => {
      await db.prepare("DELETE FROM roster WHERE roster_id = ?").run(id);
      await audit(db, { table: "roster", recordId: id, action: "DELETE", reason: `Removed shift for ${old.first_name} ${old.last_name} on ${old.shift_date}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  r.post("/roster/copy-week", requirePermission("roster.write"), async (req, res) => {
    const b = z.object({ from: Ymd, to: Ymd }).parse(req.body);
    const src = weekStart(b.from), dst = weekStart(b.to);
    if (src === dst) throw badRequest("Pick a different week to copy into.");
    const rows = await db.prepare("SELECT r.* FROM roster r JOIN staff s ON s.staff_id = r.staff_id AND s.removed_at IS NULL WHERE r.shift_date BETWEEN ? AND ?").all(src, addDays(src, 6));
    let copied = 0, skipped = 0;
    await db.transaction(async () => {
      for (const x of rows) {
        const date = addDays(dst, Math.round((new Date(`${x.shift_date}T12:00`) - new Date(`${src}T12:00`)) / 86400000));
        const busy = date < ymd() ||
          (await db.prepare("SELECT 1 FROM roster WHERE staff_id = ? AND shift_date = ?").get(x.staff_id, date)) ||
          (await db.prepare("SELECT 1 FROM leave_requests WHERE staff_id = ? AND status = 'Approved' AND ? BETWEEN start_date AND end_date").get(x.staff_id, date));
        if (busy) { skipped++; continue; }
        const n = await db.prepare("INSERT INTO roster (staff_id, shift_date, start_time, expected_hours, station_id, team, site) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING roster_id").get(x.staff_id, date, x.start_time, x.expected_hours, x.station_id, x.team, x.site);
        await audit(db, { table: "roster", recordId: n.roster_id, action: "INSERT", reason: `Copied from week of ${src}`, by: me(req) });
        copied++;
      }
    });
    res.json({ copied, skipped });
  });

  // ======================= Stations =======================
  async function stationsList() {
    const rows = await db
      .prepare(
        `SELECT st.*, (SELECT COUNT(*) FROM time_events e WHERE e.station_id = st.station_id AND e.event_timestamp >= CURRENT_DATE) AS events_today,
                (SELECT COUNT(*) FROM time_events e WHERE e.station_id = st.station_id AND e.sync_status <> 'Synced') AS unsynced,
                EXISTS (SELECT 1 FROM time_events e WHERE e.station_id = st.station_id) OR EXISTS (SELECT 1 FROM roster r WHERE r.station_id = st.station_id) AS in_use
           FROM stations st ORDER BY st.name`
      )
      .all();
    return rows.map((s) => ({ id: s.station_id, name: s.name, location: s.location, idType: s.id_type, online: s.online, lastSeen: s.last_seen, eventsToday: s.events_today, unsynced: s.unsynced, inUse: s.in_use }));
  }
  r.get("/stations", requirePermission("staff.read"), async (_req, res) => res.json({ stations: await stationsList(), idTypes: ["QR", "PIN", "Face", "Fingerprint"] }));

  const StationBody = z.object({ name: z.string().trim().min(1).max(50), location: z.string().trim().max(100).optional().nullable(), idType: z.enum(["QR", "PIN", "Face", "Fingerprint"]).optional().nullable(), online: z.boolean().optional() });
  r.post("/stations", requirePermission("stations.write"), async (req, res) => {
    const b = StationBody.parse(req.body);
    const row = await db.transaction(async () => {
      const row = await db.prepare("INSERT INTO stations (name, location, id_type, online) VALUES (?, ?, ?, ?) RETURNING *").get(b.name, b.location || null, b.idType || null, b.online ?? false);
      await audit(db, { table: "stations", recordId: row.station_id, action: "INSERT", reason: `Added station ${b.name}`, by: me(req) });
      return row;
    });
    res.status(201).json({ station: { id: row.station_id, name: row.name } });
  });
  r.patch("/stations/:id", requirePermission("stations.write"), async (req, res) => {
    const id = pid(req);
    const b = StationBody.partial().parse(req.body);
    const cols = Object.entries({ name: b.name, location: b.location, id_type: b.idType, online: b.online }).filter(([, v]) => v !== undefined);
    if (!cols.length) throw badRequest("Nothing to update.");
    await db.transaction(async () => {
      const r1 = await db.prepare(`UPDATE stations SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE station_id = ?`).run(...cols.map(([, v]) => v), id);
      if (!r1.changes) throw notFound("Station not found.");
      await audit(db, { table: "stations", recordId: id, action: "UPDATE", reason: `Updated station ${cols.map(([k]) => k.replace("_", " ")).join(", ")}`, by: me(req) });
    });
    res.json({ ok: true });
  });
  r.delete("/stations/:id", requirePermission("stations.write"), async (req, res) => {
    const id = pid(req);
    const st = (await stationsList()).find((s) => s.id === id);
    if (!st) throw notFound("Station not found.");
    if (st.inUse) throw conflict("This station has clock events or roster shifts, so it can’t be deleted. Mark it offline instead.");
    await db.transaction(async () => {
      await db.prepare("DELETE FROM stations WHERE station_id = ?").run(id);
      await audit(db, { table: "stations", recordId: id, action: "DELETE", reason: `Deleted unused station ${st.name}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  // ======================= Approvals: corrections and leave =======================
  r.get("/approvals", requirePermission("approvals.write"), async (req, res) => {
    const leave = await db.prepare("SELECT l.*, s.first_name, s.last_name, s.annual_leave_hours, s.personal_leave_hours, s.standard_hours FROM leave_requests l JOIN staff s ON s.staff_id = l.staff_id WHERE l.status = 'Pending' ORDER BY l.start_date").all();
    res.json({
      adjustments: (await listAdjustments(db, { status: "Pending" })).map((a) => ({ ...a, canDecide: a.requestedBy !== me(req) && a.staffId !== me(req) })),
      leave: leave.map((l) => ({ ...leaveDto(l), hoursNeeded: round2(l.days * hoursPerDay(l)), balanceHours: l.type === "Annual" ? l.annual_leave_hours : l.type === "Personal" ? l.personal_leave_hours : null })),
    });
  });

  r.get("/adjustments", requirePermission("approvals.write"), async (req, res) => {
    const q = z.object({ status: z.enum(["Pending", "Approved", "Rejected"]).optional(), staffId: Id.optional() }).parse(req.query);
    res.json({ adjustments: await listAdjustments(db, { status: q.status ?? null, staffId: q.staffId ?? null }) });
  });

  r.post("/adjustments", requirePermission("approvals.write"), async (req, res) => {
    const b = AdjustmentBody.extend({ staffId: Id }).parse(req.body);
    const id = await createAdjustment(db, { ...b, requestedBy: me(req), method: "Admin Portal" });
    res.status(201).json({ ok: true, id, note: "Another manager needs to approve this correction." });
  });

  r.post("/adjustments/:id/decision", requirePermission("approvals.write"), async (req, res) => {
    const id = pid(req);
    const { decision } = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body);
    const result = await db.transaction(async () => {
      const a = await db.prepare("SELECT * FROM time_adjustments WHERE adjustment_id = ? FOR UPDATE").get(id);
      if (!a) throw notFound("Correction not found.");
      if (a.status !== "Pending") throw conflict(`This correction was already ${a.status.toLowerCase()}.`);
      if (a.requested_by === me(req)) throw forbidden("You raised this correction, so another manager must decide it.");
      if (a.staff_id === me(req)) throw forbidden("Another manager must decide corrections to your own time.");
      if (decision === "reject") {
        await db.prepare("UPDATE time_adjustments SET status = 'Rejected', approver = ?, decided_at = now() WHERE adjustment_id = ?").run(me(req), id);
        return { status: "Rejected" };
      }
      const ev = a.event_id && (await db.prepare("SELECT * FROM time_events WHERE event_id = ?").get(a.event_id));
      if (!ev) throw conflict("The clock event for this correction no longer exists. Reject it instead.");
      const reason = a.reason.slice(0, 200);
      await db.prepare("UPDATE time_adjustments SET status = 'Approved', approver = ?, decided_at = now(), override_method = COALESCE(override_method, 'Admin Portal') WHERE adjustment_id = ?").run(me(req), id);
      let recordId = ev.event_id, action;
      if (a.action === "EDIT") {
        await db.prepare("UPDATE time_events SET event_timestamp = ?, is_override = TRUE, override_reason = ?, override_method = 'Admin Portal' WHERE event_id = ?").run(a.new_timestamp, reason, ev.event_id);
        action = "UPDATE";
      } else if (a.action === "ADD") {
        const type = ev.event_type === "break_start" ? "break_end" : "clock_out";
        if (type === "clock_out") {
          const sh = (await loadShifts(db, { from: ymd(ev.event_timestamp), to: ymd(ev.event_timestamp), staffId: ev.staff_id })).find((s) => s.clockInEventId === ev.event_id);
          if (sh?.clockOut) throw conflict("This shift already has a clock-out. Reject the request or use an edit.");
          const later = await db.prepare("SELECT MIN(event_timestamp) AS t FROM time_events WHERE staff_id = ? AND event_type = 'clock_in' AND event_timestamp > ?").get(ev.staff_id, ev.event_timestamp);
          if (later.t && new Date(a.new_timestamp) >= new Date(later.t)) throw conflict("The clock-out would be after the next clock-in.");
        }
        const n = await db
          .prepare(
            `INSERT INTO time_events (staff_id, station_id, event_type, event_timestamp, captured_at, synced_at, is_override, override_reason, override_method, is_unrostered, sync_status, created_by, rule_id)
             VALUES (?, ?, ?, ?, now(), now(), TRUE, ?, 'Admin Portal', FALSE, 'Synced', ?, ?) RETURNING event_id`
          )
          .get(ev.staff_id, ev.station_id, type, a.new_timestamp, reason, me(req), ev.rule_id);
        if (type === "break_end") await db.prepare("UPDATE breaks SET end_event_id = ? WHERE start_event_id = ? AND end_event_id IS NULL").run(n.event_id, ev.event_id);
        else await db.prepare("UPDATE exceptions SET status = 'Resolved', notes = LEFT(COALESCE(notes || '; ', '') || 'Clock-out added by approved correction', 200) WHERE event_id = ? AND exception_type = 'Missing clock-out' AND status <> 'Resolved'").run(ev.event_id);
        recordId = n.event_id;
        action = "INSERT";
      } else {
        // DELETE: unlink references (v3 has no soft delete on time_events), then remove the event.
        await db.prepare("UPDATE exceptions SET event_id = NULL WHERE event_id = ?").run(ev.event_id);
        await db.prepare("UPDATE time_adjustments SET event_id = NULL WHERE event_id = ?").run(ev.event_id);
        if (ev.event_type === "break_end") await db.prepare("UPDATE breaks SET end_event_id = NULL WHERE end_event_id = ?").run(ev.event_id);
        if (ev.event_type === "break_start") {
          const br = await db.prepare("SELECT end_event_id FROM breaks WHERE start_event_id = ?").get(ev.event_id);
          await db.prepare("DELETE FROM breaks WHERE start_event_id = ?").run(ev.event_id);
          if (br?.end_event_id) {
            await db.prepare("UPDATE time_adjustments SET event_id = NULL WHERE event_id = ?").run(br.end_event_id);
            await db.prepare("DELETE FROM time_events WHERE event_id = ?").run(br.end_event_id);
          }
        }
        await db.prepare("DELETE FROM time_events WHERE event_id = ?").run(ev.event_id);
        action = "DELETE";
      }
      await audit(db, { table: "time_events", recordId, action, reason, by: me(req), adjustmentId: id });
      return { status: "Approved" };
    });
    res.json({ ok: true, ...result });
  });

  r.post("/leave/:id/decision", requirePermission("approvals.write"), async (req, res) => {
    const id = pid(req);
    const { decision } = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body);
    await db.transaction(async () => {
      const l = await db.prepare("SELECT l.*, s.standard_hours, s.annual_leave_hours, s.personal_leave_hours, s.first_name, s.last_name FROM leave_requests l JOIN staff s ON s.staff_id = l.staff_id WHERE leave_id = ? FOR UPDATE OF l").get(id);
      if (!l) throw notFound("Leave request not found.");
      if (l.status !== "Pending") throw conflict(`Already ${l.status.toLowerCase()}.`);
      if (l.staff_id === me(req)) throw forbidden("Another manager must decide your own leave.");
      const status = decision === "approve" ? "Approved" : "Rejected";
      let note = "";
      if (status === "Approved" && ["Annual", "Personal"].includes(l.type)) {
        const col = l.type === "Annual" ? "annual_leave_hours" : "personal_leave_hours";
        const need = round2(l.days * hoursPerDay(l));
        if (need > l[col]) throw conflict(`${l.first_name} has ${l[col]} h of ${l.type.toLowerCase()} leave; this needs ${need} h.`);
        await db.prepare(`UPDATE staff SET ${col} = ${col} - ? WHERE staff_id = ?`).run(need, l.staff_id);
        note = `; ${need} h deducted`;
      }
      await db.prepare("UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = now() WHERE leave_id = ?").run(status, me(req), id);
      await audit(db, { table: "leave_requests", recordId: id, action: "UPDATE", reason: `${l.type} leave ${status.toLowerCase()} for ${l.first_name} ${l.last_name} (${l.start_date} to ${l.end_date})${note}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  // ======================= Exceptions =======================
  async function exceptionsQuery({ status = null, from = null, to = null, type = null, limit = 300 }) {
    const rows = await db
      .prepare(
        `SELECT x.*, s.first_name, s.last_name, e.event_type, e.event_timestamp, st.name AS station_name, cr.rule_name
           FROM exceptions x JOIN staff s ON s.staff_id = x.staff_id
      LEFT JOIN time_events e ON e.event_id = x.event_id
      LEFT JOIN stations st ON st.station_id = e.station_id
      LEFT JOIN compliance_rules cr ON cr.rule_id = x.rule_id
          WHERE (?::text IS NULL OR x.status = ?::text) AND (?::date IS NULL OR x.exception_date >= ?::date)
            AND (?::date IS NULL OR x.exception_date <= ?::date) AND (?::text IS NULL OR x.exception_type = ?::text)
          ORDER BY x.exception_date DESC, x.detected_at DESC LIMIT ?`
      )
      .all(status, status, from, from, to, to, type, type, limit);
    return rows.map((x) => ({
      id: x.exception_id, staffId: x.staff_id, staffName: `${x.first_name} ${x.last_name}`, type: x.exception_type, date: x.exception_date,
      status: x.status, managerNotified: x.manager_notified, detectedAt: x.detected_at, notes: x.notes, eventId: x.event_id,
      eventType: x.event_type, eventTime: x.event_timestamp, station: x.station_name, rule: x.rule_name,
    }));
  }
  r.get("/exceptions", requirePermission("exceptions.write"), async (req, res) => {
    await detectExceptions(db);
    const q = z.object({ status: z.enum(["Open", "Reviewed", "Resolved"]).optional(), from: Ymd.optional(), to: Ymd.optional(), type: z.string().max(40).optional() }).parse(req.query);
    const counts = await db.prepare("SELECT status, COUNT(*) AS n FROM exceptions GROUP BY status").all();
    res.json({ exceptions: await exceptionsQuery(q), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), types: ["Missing clock-out", "Break overdue", "Unrostered attempt", "Clocked in at wrong station"] });
  });
  r.patch("/exceptions/:id", requirePermission("exceptions.write"), async (req, res) => {
    const id = pid(req);
    const b = z.object({ status: z.enum(["Open", "Reviewed", "Resolved"]).optional(), notes: z.string().trim().max(200).optional(), managerNotified: z.boolean().optional() }).parse(req.body);
    const x = await db.prepare("SELECT * FROM exceptions WHERE exception_id = ?").get(id);
    if (!x) throw notFound("Exception not found.");
    await db.transaction(async () => {
      await db.prepare("UPDATE exceptions SET status = COALESCE(?, status), notes = COALESCE(?, notes), manager_notified = COALESCE(?, manager_notified) WHERE exception_id = ?").run(b.status ?? null, b.notes ?? null, b.managerNotified ?? null, id);
      await audit(db, { table: "exceptions", recordId: id, action: "UPDATE", reason: `${x.exception_type} marked ${(b.status ?? x.status).toLowerCase()}${b.notes ? `: ${b.notes}` : ""}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  // ======================= Timesheets (all staff) =======================
  r.get("/timesheets", requirePermission("reports.read"), async (req, res) => {
    const q = z.object({ from: Ymd.optional(), to: Ymd.optional(), staffId: Id.optional() }).parse(req.query);
    const p = periodFor();
    const from = q.from ?? p.start, to = q.to ?? p.end;
    const names = new Map((await db.prepare("SELECT staff_id, first_name, last_name FROM staff").all()).map((s) => [s.staff_id, `${s.first_name} ${s.last_name}`]));
    const shifts = (await loadShifts(db, { from, to, staffId: q.staffId ?? null })).map((s) => ({ ...publicShift(s), staffName: names.get(s.staffId) }));
    res.json({ from, to, shifts });
  });

  // ======================= Payroll =======================
  async function payrollView(period) {
    const run = await db.prepare("SELECT r.*, a.first_name AS a_first, a.last_name AS a_last FROM payroll_runs r LEFT JOIN staff a ON a.staff_id = r.approved_by WHERE period_start = ? AND period_end = ?").get(period.start, period.end);
    const stored = await db
      .prepare("SELECT p.*, s.first_name, s.last_name, s.role, s.contract_type, s.standard_rate, s.overtime_rate FROM payroll_summary p JOIN staff s ON s.staff_id = p.staff_id WHERE p.period_start = ? ORDER BY s.first_name, s.last_name")
      .all(period.start);
    const calc = await calculatePay(db, period);
    const pending = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM time_adjustments a LEFT JOIN time_events e ON e.event_id = a.event_id
          WHERE a.status = 'Pending' AND (e.event_timestamp IS NULL OR (e.event_timestamp >= ?::date AND e.event_timestamp < ?::date + 1))`
      )
      .get(period.start, period.end);
    const openEx = await db.prepare("SELECT COUNT(*) AS n FROM exceptions WHERE status = 'Open' AND exception_date BETWEEN ? AND ?").get(period.start, period.end);
    const rows = run && stored.length
      ? stored.map((p) => ({ staffId: p.staff_id, name: `${p.first_name} ${p.last_name}`, role: p.role, contractType: p.contract_type, standardRate: p.standard_rate, overtimeRate: p.overtime_rate, ...Object.fromEntries(Object.entries(payslipDto(p)).filter(([k]) => !["id", "periodStart", "periodEnd"].includes(k))) }))
      : calc.rows;
    return {
      period,
      periods: recentPeriods(6),
      run: run ? { id: run.run_id, step: run.step, approvedBy: run.a_first ? `${run.a_first} ${run.a_last}` : null, approvedAt: run.approved_at, updatedAt: run.updated_at, done: run.step === 4 && !!run.approved_at } : null,
      step: run?.step ?? 0,
      source: run && stored.length ? "saved" : "calculated",
      rows,
      totals: {
        staff: rows.length,
        ordinaryHours: round2(rows.reduce((a, x) => a + x.ordinaryHours, 0)),
        overtimeHours: round2(rows.reduce((a, x) => a + x.overtimeHours, 0)),
        weekendHours: round2(rows.reduce((a, x) => a + x.weekendHours, 0)),
        publicHolidayHours: round2(rows.reduce((a, x) => a + x.publicHolidayHours, 0)),
        totalPay: round2(rows.reduce((a, x) => a + x.totalPay, 0)),
      },
      checks: { incompleteShifts: calc.incomplete.length, incomplete: calc.incomplete, pendingCorrections: pending.n, openExceptions: openEx.n },
      rules: {
        ordinaryCap: config.ordinaryHoursPerFortnight,
        text: "Proof of concept: ordinary hours are capped at 76 per fortnight and the rest is overtime. Weekend and public holiday hours are paid at the overtime rate. The Horticulture Award pays public holidays and Sundays outside harvest at 200%; this is a later phase.",
      },
    };
  }

  async function savePay(runId, period) {
    const { rows } = await calculatePay(db, period);
    await db.prepare("DELETE FROM payroll_summary WHERE period_start = ? AND NOT (staff_id = ANY(?::int[]))").run(period.start, rows.map((x) => x.staffId));
    for (const x of rows)
      await db
        .prepare(
          `INSERT INTO payroll_summary (run_id, staff_id, period_start, period_end, ordinary_hours, overtime_hours, weekend_hours, public_holiday_hours, total_pay)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (staff_id, period_start) DO UPDATE SET run_id = excluded.run_id, period_end = excluded.period_end, ordinary_hours = excluded.ordinary_hours,
             overtime_hours = excluded.overtime_hours, weekend_hours = excluded.weekend_hours, public_holiday_hours = excluded.public_holiday_hours, total_pay = excluded.total_pay`
        )
        .run(runId, x.staffId, period.start, period.end, x.ordinaryHours, x.overtimeHours, x.weekendHours, x.publicHolidayHours, x.totalPay);
    return rows.length;
  }

  const periodFrom = (start) => {
    const p = periodFor(start ?? addDays(periodFor().start, -1));
    if (start && p.start !== start) throw badRequest(`Pay periods start on ${p.start}.`);
    return p;
  };

  r.get("/payroll", requirePermission("payroll.process"), async (req, res) => {
    const { start } = z.object({ start: Ymd.optional() }).parse(req.query);
    res.json(await payrollView(periodFrom(start)));
  });

  r.post("/payroll/recalculate", requirePermission("payroll.process"), async (req, res) => {
    const period = periodFrom(z.object({ start: Ymd }).parse(req.body).start);
    await db.transaction(async () => {
      const run = await db.prepare("SELECT * FROM payroll_runs WHERE period_start = ?").get(period.start);
      if (!run) throw badRequest("Start the pay run first.");
      if (run.step > 1) throw conflict("This pay run is approved, so its figures are locked.");
      const n = await savePay(run.run_id, period);
      await db.prepare("UPDATE payroll_runs SET updated_by = ?, updated_at = now() WHERE run_id = ?").run(me(req), run.run_id);
      await audit(db, { table: "payroll_runs", recordId: run.run_id, action: "UPDATE", reason: `Pay recalculated for ${n} staff`, by: me(req) });
    });
    res.json(await payrollView(period));
  });

  r.post("/payroll/advance", requirePermission("payroll.process"), async (req, res) => {
    const period = periodFrom(z.object({ start: Ymd }).parse(req.body).start);
    if (period.end >= ymd()) throw badRequest("This pay period hasn’t finished yet.");
    await db.transaction(async () => {
      const run = await db.prepare("SELECT * FROM payroll_runs WHERE period_start = ? FOR UPDATE").get(period.start);
      if (!run) {
        const n = await db.prepare("INSERT INTO payroll_runs (period_start, period_end, step, updated_by, updated_at) VALUES (?, ?, 1, ?, now()) RETURNING run_id").get(period.start, period.end, me(req));
        const count = await savePay(n.run_id, period);
        await audit(db, { table: "payroll_runs", recordId: n.run_id, action: "INSERT", reason: `Pay run started for ${period.start} to ${period.end} (${count} staff)`, by: me(req) });
        return;
      }
      if (run.step >= 4) throw conflict("This pay run is complete.");
      if (run.step === 1) {
        const v = await payrollView(period);
        if (v.checks.incompleteShifts) throw conflict(`${v.checks.incompleteShifts} shift(s) in this period have no clock-out. Fix them with a correction first.`);
        if (v.checks.pendingCorrections) throw conflict(`${v.checks.pendingCorrections} time correction(s) for this period are still pending.`);
        await savePay(run.run_id, period);
        await db.prepare("UPDATE payroll_runs SET step = 2, approved_by = ?, approved_at = now(), updated_by = ?, updated_at = now() WHERE run_id = ?").run(me(req), me(req), run.run_id);
        await audit(db, { table: "payroll_runs", recordId: run.run_id, action: "UPDATE", reason: "Pay run approved (step 2)", by: me(req) });
        return;
      }
      const next = run.step + 1;
      await db.prepare("UPDATE payroll_runs SET step = ?, updated_by = ?, updated_at = now() WHERE run_id = ?").run(next, me(req), run.run_id);
      await audit(db, { table: "payroll_runs", recordId: run.run_id, action: "UPDATE", reason: next === 3 ? "Payslips released to staff (step 3)" : "Pay run exported and completed (step 4)", by: me(req) });
    });
    res.json(await payrollView(period));
  });

  r.post("/payroll/export", requirePermission("payroll.process"), async (req, res) => {
    const period = periodFrom(z.object({ start: Ymd }).parse(req.body).start);
    const v = await payrollView(period);
    if (!v.run || v.step < 2) throw conflict("Approve the pay run before exporting.");
    const rows = [["Staff ID", "Name", "Contract", "Ordinary hours", "Overtime hours", "Weekend hours", "Public holiday hours", "Standard rate", "Overtime rate", "Total pay"]];
    for (const x of v.rows) rows.push([x.staffId, x.name, x.contractType, x.ordinaryHours, x.overtimeHours, x.weekendHours, x.publicHolidayHours, x.standardRate, x.overtimeRate, x.totalPay]);
    res.json(createDownload(`payroll-${period.start}-to-${period.end}.csv`, "text/csv", csv(rows)));
  });

  // ======================= Reports =======================
  async function report(from, to) {
    const shifts = await loadShifts(db, { from, to });
    const staff = new Map((await db.prepare("SELECT staff_id, first_name, last_name, standard_rate FROM staff").all()).map((s) => [s.staff_id, s]));
    const roster = await db.prepare("SELECT * FROM roster WHERE shift_date BETWEEN ? AND ?").all(from, to);
    const done = shifts.filter((s) => s.clockOut);
    const byStaff = new Map(), byStation = new Map(), byDay = new Map();
    let late = 0;
    for (const s of done) {
      const st = staff.get(s.staffId);
      const a = byStaff.get(s.staffId) ?? { staffId: s.staffId, name: `${st.first_name} ${st.last_name}`, shifts: 0, hours: 0, cost: 0 };
      a.shifts++; a.hours += s.workedHours; a.cost += s.workedHours * st.standard_rate;
      byStaff.set(s.staffId, a);
      const k = s.station ?? "Unknown";
      byStation.set(k, round2((byStation.get(k) ?? 0) + s.workedHours));
      byDay.set(s.date, round2((byDay.get(s.date) ?? 0) + s.workedHours));
      if (s.roster && new Date(s.clockIn) > new Date(new Date(`${s.date}T${s.roster.startTime}:00`).getTime() + 5 * 60000)) late++;
    }
    const exc = await db.prepare("SELECT exception_type AS type, COUNT(*) AS n FROM exceptions WHERE exception_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 1").all(from, to);
    return {
      from, to,
      totals: { shifts: done.length, hours: round2(done.reduce((a, s) => a + s.workedHours, 0)), rosteredShifts: roster.length, rosteredHours: round2(roster.reduce((a, r) => a + r.expected_hours, 0)), lateArrivals: late, estimatedOrdinaryCost: round2([...byStaff.values()].reduce((a, x) => a + x.cost, 0)) },
      byStaff: [...byStaff.values()].map((x) => ({ ...x, hours: round2(x.hours), cost: round2(x.cost) })).sort((a, b) => b.hours - a.hours),
      byStation: [...byStation.entries()].map(([station, hours]) => ({ station, hours })),
      byDay: [...byDay.entries()].sort().map(([date, hours]) => ({ date, hours })),
      exceptionsByType: exc,
    };
  }
  r.get("/reports", requirePermission("reports.read"), async (req, res) => {
    const q = z.object({ from: Ymd.optional(), to: Ymd.optional() }).parse(req.query);
    const p = periodFor(addDays(periodFor().start, -1));
    res.json(await report(q.from ?? p.start, q.to ?? p.end));
  });
  r.post("/reports/export", requirePermission("reports.read"), async (req, res) => {
    const q = z.object({ from: Ymd, to: Ymd }).parse(req.body);
    const rep = await report(q.from, q.to);
    const rows = [["Staff ID", "Name", "Shifts", "Hours", "Estimated ordinary cost"], ...rep.byStaff.map((x) => [x.staffId, x.name, x.shifts, x.hours, x.cost])];
    res.json(createDownload(`hours-${q.from}-to-${q.to}.csv`, "text/csv", csv(rows)));
  });

  // ======================= Audit trail =======================
  async function auditRows({ table = null, q = null, from = null, to = null, limit = 200 }) {
    const rows = await db
      .prepare(
        `SELECT a.*, s.first_name, s.last_name FROM audit_logs a JOIN staff s ON s.staff_id = a.changed_by
          WHERE (?::text IS NULL OR a.table_name = ?::text)
            AND (?::text IS NULL OR (a.reason || ' ' || s.first_name || ' ' || s.last_name) ILIKE '%' || ?::text || '%')
            AND (?::date IS NULL OR a.changed_at >= ?::date) AND (?::date IS NULL OR a.changed_at < ?::date + 1)
          ORDER BY a.changed_at DESC, a.audit_id DESC LIMIT ?`
      )
      .all(table, table, q, q, from, from, to, to, limit);
    return rows.map((a) => ({ id: a.audit_id, table: a.table_name, recordId: a.record_id, action: a.action, reason: a.reason, changedBy: a.changed_by, changedByName: `${a.first_name} ${a.last_name}`, changedAt: a.changed_at, adjustmentId: a.adjustment_id }));
  }
  const AuditQ = z.object({ table: z.string().max(50).optional(), q: z.string().max(100).optional(), from: Ymd.optional(), to: Ymd.optional(), limit: z.coerce.number().int().min(1).max(1000).default(200) });
  r.get("/audit", requirePermission("audit.read"), async (req, res) => {
    const q = AuditQ.parse(req.query);
    res.json({ entries: await auditRows(q), tables: (await db.prepare("SELECT DISTINCT table_name FROM audit_logs ORDER BY 1").all()).map((x) => x.table_name), note: "Sign-in and security events are written to the server log (v3 has no table for them yet)." });
  });
  r.post("/audit/export", requirePermission("audit.read"), async (req, res) => {
    const q = AuditQ.parse({ ...req.body, limit: 1000 });
    const rows = [["Audit ID", "When", "Table", "Record", "Action", "Reason", "Changed by", "Correction ID"], ...(await auditRows(q)).map((a) => [a.id, new Date(a.changedAt).toISOString(), a.table, a.recordId, a.action, a.reason, a.changedByName, a.adjustmentId ?? ""])];
    res.json(createDownload(`audit-${ymd()}.csv`, "text/csv", csv(rows)));
  });

  // ======================= Settings: rules, break reasons, holidays =======================
  r.get("/settings", requirePermission("settings.write"), async (_req, res) => {
    res.json({
      farmName: config.farmName,
      security: { lockoutAttempts: config.lockoutAttempts, lockoutMinutes: config.lockoutMinutes, adminIdleMinutes: config.adminIdleMinutes, sessionHours: config.sessionHours, pinValidHours: config.pinValidHours, mfaRequiredForAdmin: true, source: "Server config (.env)" },
      permissions: matrix(),
      roles: ALL_ROLES,
      activeRuleId: (await activeRule(db))?.rule_id ?? null,
      rules: await db.prepare("SELECT rule_id AS id, rule_name AS name, max_hours_without_break AS \"maxHoursWithoutBreak\", daily_overtime_threshold AS \"dailyOvertimeThreshold\", weekly_overtime_threshold AS \"weeklyOvertimeThreshold\" FROM compliance_rules ORDER BY rule_id").all(),
      breakReasons: await db.prepare("SELECT br.reason_id AS id, br.label, br.is_paid AS paid, (SELECT COUNT(*) FROM breaks b WHERE b.reason_id = br.reason_id) AS used FROM break_reasons br ORDER BY br.reason_id").all(),
      holidays: await db.prepare("SELECT holiday_id AS id, holiday_date AS date, name, state FROM public_holidays WHERE holiday_date >= CURRENT_DATE - 365 ORDER BY holiday_date").all(),
      payRules: { ordinaryHoursPerFortnight: config.ordinaryHoursPerFortnight, payPeriodAnchor: config.payPeriodAnchor, mealBreakMinutes: config.mealBreakMinutes, mealBreakAfterHours: config.mealBreakAfterHours },
    });
  });

  r.patch("/rules/:id", requirePermission("settings.write"), async (req, res) => {
    const id = pid(req);
    const b = z.object({ name: z.string().trim().min(1).max(50).optional(), maxHoursWithoutBreak: z.coerce.number().min(1).max(12).optional(), dailyOvertimeThreshold: z.coerce.number().min(1).max(24).optional(), weeklyOvertimeThreshold: z.coerce.number().min(1).max(99).optional() }).parse(req.body);
    const cols = Object.entries({ rule_name: b.name, max_hours_without_break: b.maxHoursWithoutBreak, daily_overtime_threshold: b.dailyOvertimeThreshold, weekly_overtime_threshold: b.weeklyOvertimeThreshold }).filter(([, v]) => v !== undefined);
    if (!cols.length) throw badRequest("Nothing to update.");
    await db.transaction(async () => {
      const u = await db.prepare(`UPDATE compliance_rules SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE rule_id = ?`).run(...cols.map(([, v]) => v), id);
      if (!u.changes) throw notFound("Rule not found.");
      await audit(db, { table: "compliance_rules", recordId: id, action: "UPDATE", reason: `Rule changed: ${cols.map(([k, v]) => `${k.replace(/_/g, " ")} = ${v}`).join(", ")}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  const ReasonBody = z.object({ label: z.string().trim().min(1).max(30), paid: z.boolean() });
  r.post("/break-reasons", requirePermission("settings.write"), async (req, res) => {
    const b = ReasonBody.parse(req.body);
    const row = await db.transaction(async () => {
      const row = await db.prepare("INSERT INTO break_reasons (label, is_paid) VALUES (?, ?) RETURNING reason_id").get(b.label, b.paid);
      await audit(db, { table: "break_reasons", recordId: row.reason_id, action: "INSERT", reason: `Added break reason ${b.label} (${b.paid ? "paid" : "unpaid"})`, by: me(req) });
      return row;
    });
    res.status(201).json({ id: row.reason_id });
  });
  r.patch("/break-reasons/:id", requirePermission("settings.write"), async (req, res) => {
    const id = pid(req);
    const b = ReasonBody.partial().parse(req.body);
    await db.transaction(async () => {
      const u = await db.prepare("UPDATE break_reasons SET label = COALESCE(?, label), is_paid = COALESCE(?, is_paid) WHERE reason_id = ?").run(b.label ?? null, b.paid ?? null, id);
      if (!u.changes) throw notFound("Break reason not found.");
      await audit(db, { table: "break_reasons", recordId: id, action: "UPDATE", reason: `Break reason updated${b.label ? `: ${b.label}` : ""}${b.paid !== undefined ? ` (${b.paid ? "paid" : "unpaid"})` : ""}`, by: me(req) });
    });
    res.json({ ok: true });
  });
  r.delete("/break-reasons/:id", requirePermission("settings.write"), async (req, res) => {
    const id = pid(req);
    if ((await db.prepare("SELECT 1 FROM breaks WHERE reason_id = ? LIMIT 1").get(id))) throw conflict("This reason is used by recorded breaks, so it can’t be deleted.");
    await db.transaction(async () => {
      const d = await db.prepare("DELETE FROM break_reasons WHERE reason_id = ? RETURNING label").get(id);
      if (!d) throw notFound("Break reason not found.");
      await audit(db, { table: "break_reasons", recordId: id, action: "DELETE", reason: `Deleted break reason ${d.label}`, by: me(req) });
    });
    res.json({ ok: true });
  });

  r.post("/holidays", requirePermission("settings.write"), async (req, res) => {
    const b = z.object({ date: Ymd, name: z.string().trim().min(1).max(100), state: z.enum(["NAT", "SA", "NSW", "VIC", "QLD", "WA", "TAS", "NT", "ACT"]).default("SA") }).parse(req.body);
    const row = await db.transaction(async () => {
      const row = await db.prepare("INSERT INTO public_holidays (holiday_date, name, state) VALUES (?, ?, ?) ON CONFLICT (holiday_date, state) DO NOTHING RETURNING holiday_id").get(b.date, b.name, b.state);
      if (!row) throw conflict("There’s already a holiday on that date.");
      await audit(db, { table: "public_holidays", recordId: row.holiday_id, action: "INSERT", reason: `Added public holiday ${b.name} (${b.date}, ${b.state})`, by: me(req) });
      return row;
    });
    res.status(201).json({ id: row.holiday_id });
  });
  r.delete("/holidays/:id", requirePermission("settings.write"), async (req, res) => {
    const id = pid(req);
    await db.transaction(async () => {
      const d = await db.prepare("DELETE FROM public_holidays WHERE holiday_id = ? RETURNING name, holiday_date").get(id);
      if (!d) throw notFound("Holiday not found.");
      await audit(db, { table: "public_holidays", recordId: id, action: "DELETE", reason: `Removed public holiday ${d.name} (${d.holiday_date})`, by: me(req) });
    });
    res.json({ ok: true });
  });

  return r;
}
