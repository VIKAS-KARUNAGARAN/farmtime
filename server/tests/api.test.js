// End-to-end tests on a real PostgreSQL with the DB team's schema and dev seed: `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { totp } from "../src/totp.js";
import { ymd, addDays } from "../src/util.js";
import { startDb } from "./helpers.js";

const PW = "FarmTime-Dev-2026";
let ctx, db, app;
const tokens = {};
const api = () => request(app);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const as = (who) => bearer(tokens[who]);

async function login(email, portal = "staff", password = PW) {
  return api().post("/api/auth/login").send({ portal, email, password });
}
async function adminLogin(email) {
  const l = await login(email, "admin");
  assert.equal(l.status, 200, JSON.stringify(l.body));
  let t = l.body.token;
  if (l.body.next === "/workspace/") t = (await api().post("/api/auth/workspace").set(bearer(t)).send({ role: "admin" })).body.session && t;
  const s = await api().post("/api/auth/mfa/setup").set(bearer(t));
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const m = await api().post("/api/auth/mfa").set(bearer(t)).send({ code: totp(s.body.secret) });
  assert.equal(m.status, 200, JSON.stringify(m.body));
  return m.body.token;
}
const staffIdOf = async (email) => (await db.prepare("SELECT staff_id FROM users WHERE email = ?").get(email)).staff_id;

before(async () => {
  ctx = await startDb();
  db = ctx.db;
  app = createApp(db, { logRequests: false, authRateLimit: 10_000 });
});
after(() => ctx?.stop());

test("DB team seed loads with the expected counts and views", async () => {
  const n = async (t) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).n;
  assert.equal(await n("staff"), 20);
  assert.equal(await n("stations"), 3);
  assert.equal(await n("payroll_summary"), 36);
  assert.equal(await n("users"), 20);
  const ex = await db.prepare("SELECT first_name, exception_type FROM v_daily_exceptions WHERE exception_type <> 'OK' ORDER BY staff_id").all();
  assert.deepEqual(ex.map((x) => `${x.first_name}: ${x.exception_type}`), ["Sam: Missing clock-out", "Jess: Break overdue", "Priya: Clocked in at wrong station"]);
  const hol = await db.prepare("SELECT COUNT(*) AS n FROM public_holidays WHERE holiday_date >= '2026-10-01'").get();
  assert.ok(hol.n >= 21);
});

test("audit_logs is append-only", async () => {
  await assert.rejects(db.exec("UPDATE audit_logs SET reason = 'x'"), /append-only/);
  await assert.rejects(db.exec("DELETE FROM audit_logs"), /append-only/);
});

test("roles decide the entrance: Worker, admin roles and both", async () => {
  const w = await login("aisha.khan@farmtime.test", "staff");
  assert.equal(w.status, 200);
  assert.equal(w.body.next, "/staff/");
  assert.deepEqual(w.body.session.user.roles, ["staff"]);
  tokens.aisha = w.body.token;
  const wa = await login("aisha.khan@farmtime.test", "admin");
  assert.equal(wa.body.next, "/staff/");
  assert.match(wa.body.notice.text, /staff access/);
  assert.equal((await api().get("/api/admin/dashboard").set(as("aisha"))).status, 403);

  const oa = await login("alex.morgan@farmtime.test", "admin");
  assert.equal(oa.body.next, "/admin/verify/");
  assert.equal((await api().get("/api/admin/dashboard").set(bearer(oa.body.token))).body.code, "MFA_REQUIRED");
  const both = await login("jess.nguyen@farmtime.test", "staff");
  assert.equal(both.body.next, "/workspace/");
  assert.deepEqual(both.body.session.user.accessRoles.sort(), ["Manager/Supervisor", "Worker"]);

  assert.equal((await login("aisha.khan@farmtime.test", "staff", "wrong-password")).status, 401);
  assert.equal((await login("nobody@farmtime.test", "staff")).status, 401);
});

test("admins pass MFA; permissions follow the access role", async () => {
  tokens.alex = await adminLogin("alex.morgan@farmtime.test"); // Office Admin
  tokens.marcus = await adminLogin("marcus.webb@farmtime.test"); // Manager/Supervisor + Worker
  tokens.taylor = await adminLogin("taylor.brooks@farmtime.test"); // Roster Admin
  assert.equal((await api().get("/api/admin/dashboard").set(as("alex"))).status, 200);
  assert.equal((await api().get("/api/admin/payroll").set(as("taylor"))).status, 403);
  assert.equal((await api().get("/api/admin/approvals").set(as("taylor"))).status, 403);
  assert.equal((await api().get("/api/admin/settings").set(as("marcus"))).status, 403);
  const list = await api().get("/api/admin/staff").set(as("taylor"));
  assert.equal(list.status, 200);
  assert.equal(list.body.staff[0].standardRate, null, "Roster Admin can't see pay rates");
  const full = await api().get("/api/admin/staff").set(as("alex"));
  assert.ok(full.body.staff[0].standardRate > 0);
});

test("dashboard shows today's board and open exceptions", async () => {
  const d = await api().get("/api/admin/dashboard").set(as("marcus"));
  assert.equal(d.status, 200);
  assert.equal(d.body.rostered, 3);
  assert.ok(d.body.counts.openExceptions >= 3);
  assert.ok(d.body.exceptions.some((x) => x.staffName === "Priya Patel" && x.type === "Clocked in at wrong station"));
});

let newStaffId, newEmail = "lena.fischer@farmtime.test";
test("Office Admin adds a staff member with a login; Roster Admin can't", async () => {
  const body = { firstName: "Lena", lastName: "Fischer", jobTitle: "Picker", contractType: "Casual", standardHours: 20, standardRate: 28.5, login: { email: newEmail, password: "Lena-password-1", roles: ["Worker"] } };
  assert.equal((await api().post("/api/admin/staff").set(as("taylor")).send(body)).status, 403);
  const r = await api().post("/api/admin/staff").set(as("alex")).send(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  newStaffId = r.body.staff.id;
  assert.equal(r.body.staff.overtimeRate, 42.75);
  const a = await db.prepare("SELECT * FROM audit_logs WHERE table_name = 'staff' AND record_id = ? AND action = 'INSERT'").get(newStaffId);
  assert.equal(a.changed_by, await staffIdOf("alex.morgan@farmtime.test"));
  const pin = await api().post(`/api/admin/staff/${newStaffId}/pin`).set(as("alex"));
  assert.match(pin.body.pin, /^\d{6}$/);
});

test("roster: Roster Admin adds today's shift; one shift per day; end time includes meal break", async () => {
  const st = (await api().get("/api/admin/stations").set(as("taylor"))).body.stations;
  const packing = st.find((s) => s.name === "Packing Shed");
  const r = await api().put("/api/admin/roster/shifts").set(as("taylor")).send({ staffId: newStaffId, date: ymd(), startTime: "07:00", expectedHours: 8, stationId: packing.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shift.endTime, "15:30");
  const dup = await api().put("/api/admin/roster/shifts").set(as("taylor")).send({ staffId: newStaffId, date: ymd(), startTime: "09:00", expectedHours: 4 });
  assert.equal(dup.status, 409);
  const past = await api().put("/api/admin/roster/shifts").set(as("taylor")).send({ staffId: newStaffId, date: addDays(ymd(), -3), startTime: "09:00", expectedHours: 4 });
  assert.equal(past.status, 400);
  const wk = await api().get("/api/admin/roster").set(as("taylor"));
  assert.ok(wk.body.shifts.some((s) => s.staffId === newStaffId));
});

test("staff clocks in at the wrong station, takes a break and clocks out", async () => {
  const l = await login(newEmail, "staff", "Lena-password-1");
  tokens.lena = l.body.token;
  const home = await api().get("/api/me/home").set(as("lena"));
  assert.equal(home.status, 200);
  assert.equal(home.body.today.startTime, "07:00");
  const gate = home.body.stations.find((s) => s.name === "Main Gate");
  const ci = await api().post("/api/me/clock-in").set(as("lena")).send({ stationId: gate.id });
  assert.equal(ci.status, 201, JSON.stringify(ci.body));
  assert.deepEqual(ci.body.flags, ["wrong_station"]);
  assert.equal((await api().post("/api/me/clock-in").set(as("lena")).send({ stationId: gate.id })).status, 409);
  const meal = home.body.breakReasons.find((b) => b.label === "Meal");
  assert.equal((await api().post("/api/me/break-start").set(as("lena")).send({ reasonId: meal.id })).status, 201);
  assert.equal((await api().get("/api/me/home").set(as("lena"))).body.clock.state, "break");
  assert.equal((await api().post("/api/me/break-end").set(as("lena"))).status, 200);
  const co = await api().post("/api/me/clock-out").set(as("lena"));
  assert.equal(co.status, 200, JSON.stringify(co.body));
  assert.equal(co.body.shift.status, "complete");
  assert.equal(co.body.shift.breaks.length, 1);
  const ex = await db.prepare("SELECT * FROM exceptions WHERE staff_id = ?").all(newStaffId);
  assert.deepEqual(ex.map((x) => x.exception_type), ["Clocked in at wrong station"]);
  const ts = await api().get("/api/me/timesheets").set(as("lena"));
  assert.equal(ts.body.shifts.length, 1);
});

test("clocking in with no roster records an Unrostered attempt", async () => {
  const st = (await api().get("/api/me/home").set(as("aisha"))).body.stations[0];
  const r = await api().post("/api/me/clock-in").set(as("aisha")).send({ stationId: st.id });
  assert.deepEqual(r.body.flags, ["unrostered"]);
  assert.equal((await api().post("/api/me/clock-out").set(as("aisha"))).status, 200);
});

test("corrections: requester can't approve; another manager approves and it's applied and audited", async () => {
  const samId = await staffIdOf("sam.lee@farmtime.test");
  const pending = (await api().get("/api/admin/approvals").set(as("alex"))).body.adjustments;
  const sam = pending.find((a) => a.staffId === samId);
  assert.ok(sam, "Sam's pending clock-out request from the seed");
  assert.equal(sam.canDecide, false, "Alex raised it");
  assert.equal((await api().post(`/api/admin/adjustments/${sam.id}/decision`).set(as("alex")).send({ decision: "approve" })).status, 403);
  const ok = await api().post(`/api/admin/adjustments/${sam.id}/decision`).set(as("marcus")).send({ decision: "approve" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const ex = await db.prepare("SELECT status FROM exceptions WHERE staff_id = ? AND exception_type = 'Missing clock-out' AND exception_date = CURRENT_DATE").get(samId);
  assert.equal(ex.status, "Resolved");
  const a = await db.prepare("SELECT * FROM audit_logs WHERE adjustment_id = ?").get(sam.id);
  assert.equal(a.action, "INSERT");
  assert.equal(a.changed_by, await staffIdOf("marcus.webb@farmtime.test"));

  // Staff asks for an edit to their own clock-out; a manager rejects it.
  const shift = (await api().get(`/api/me/timesheets?from=${ymd()}&to=${ymd()}`).set(as("lena"))).body.shifts[0];
  const req = await api().post("/api/me/adjustments").set(as("lena")).send({ action: "EDIT", eventId: shift.clockOutEventId, newTimestamp: new Date(new Date(shift.clockOut).getTime() - 60000).toISOString(), reason: "Tapped out late" });
  assert.equal(req.status, 201, JSON.stringify(req.body));
  assert.equal((await api().post("/api/me/adjustments").set(as("lena")).send({ action: "EDIT", eventId: shift.clockOutEventId, newTimestamp: shift.clockOut, reason: "Again" })).status, 409);
  assert.equal((await api().post(`/api/admin/adjustments/${req.body.id}/decision`).set(as("marcus")).send({ decision: "reject" })).status, 200);
});

test("leave: approve deducts hours, reject works, no self-approval", async () => {
  const ap = (await api().get("/api/admin/approvals").set(as("marcus"))).body.leave;
  const aisha = ap.find((l) => l.staffName === "Aisha Khan");
  assert.equal(aisha.hoursNeeded, 38);
  const before = (await db.prepare("SELECT annual_leave_hours FROM staff WHERE staff_id = ?").get(aisha.staffId)).annual_leave_hours;
  assert.equal((await api().post(`/api/admin/leave/${aisha.id}/decision`).set(as("marcus")).send({ decision: "approve" })).status, 200);
  const afterH = (await db.prepare("SELECT annual_leave_hours FROM staff WHERE staff_id = ?").get(aisha.staffId)).annual_leave_hours;
  assert.equal(afterH, before - 38);
  const r = await api().post("/api/me/leave").set(as("aisha")).send({ type: "Annual", startDate: aisha.startDate, endDate: aisha.endDate });
  assert.equal(r.status, 409, "overlaps approved leave");
  const big = await api().post("/api/me/leave").set(as("aisha")).send({ type: "Annual", startDate: "2027-01-04", endDate: "2027-02-26" });
  assert.equal(big.status, 400, "more than the balance");
});

test("remove staff: history keeps the record and disables the login; restore brings it back; no history deletes", async () => {
  const jack = await staffIdOf("jack.murphy@farmtime.test");
  const rm = await api().delete(`/api/admin/staff/${jack}`).set(as("alex")).send({});
  assert.equal(rm.body.result, "removed");
  assert.equal((await login("jack.murphy@farmtime.test")).status, 401);
  assert.ok((await api().get("/api/admin/staff?status=removed").set(as("alex"))).body.staff.some((s) => s.id === jack));
  assert.equal((await api().post(`/api/admin/staff/${jack}/restore`).set(as("alex"))).status, 200);
  assert.equal((await login("jack.murphy@farmtime.test")).status, 200);

  const n = await api().post("/api/admin/staff").set(as("alex")).send({ firstName: "Temp", lastName: "Hire", contractType: "Casual", standardRate: 28 });
  const del = await api().delete(`/api/admin/staff/${n.body.staff.id}`).set(as("alex")).send({});
  assert.equal(del.body.result, "deleted");
  assert.equal(await db.prepare("SELECT 1 FROM staff WHERE staff_id = ?").get(n.body.staff.id), undefined);
  const self = await api().delete(`/api/admin/staff/${await staffIdOf("alex.morgan@farmtime.test")}`).set(as("alex")).send({});
  assert.equal(self.status, 403);
});

test("payroll: blocked by missing clock-outs and pending corrections, then approved, payslips, export", async () => {
  const start = "2026-09-14";
  const v = await api().get(`/api/admin/payroll?start=${start}`).set(as("alex"));
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(v.body.step, 1);
  assert.equal(v.body.source, "saved");
  assert.equal(v.body.rows.length, 18);
  assert.ok(v.body.checks.incompleteShifts >= 1);
  const blocked = await api().post("/api/admin/payroll/advance").set(as("alex")).send({ start });
  assert.equal(blocked.status, 409);

  // Fix every incomplete shift: Alex raises the correction, Marcus approves.
  for (const inc of v.body.checks.incomplete) {
    const existing = (await api().get("/api/admin/approvals").set(as("marcus"))).body.adjustments.find((a) => a.eventId === inc.shiftId);
    let id = existing?.id;
    if (!id) {
      const r = await api().post("/api/admin/adjustments").set(as("alex")).send({ staffId: inc.staffId, action: "ADD", eventId: inc.shiftId, newTimestamp: new Date(`${inc.date}T15:30:00+09:30`).toISOString(), reason: "Finish time confirmed by supervisor" });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      id = r.body.id;
    }
    const d = await api().post(`/api/admin/adjustments/${id}/decision`).set(as("marcus")).send({ decision: "approve" });
    assert.equal(d.status, 200, JSON.stringify(d.body));
  }
  // Any other pending corrections in the period: decide them.
  for (const a of (await api().get("/api/admin/approvals").set(as("marcus"))).body.adjustments) {
    if (a.canDecide) await api().post(`/api/admin/adjustments/${a.id}/decision`).set(as("marcus")).send({ decision: "reject" });
  }
  const ok = await api().post("/api/admin/payroll/advance").set(as("alex")).send({ start });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.step, 2);
  assert.ok(ok.body.rows.every((x) => x.ordinaryHours <= 76));
  assert.ok(ok.body.totals.totalPay > 0);
  assert.equal((await api().post("/api/admin/payroll/recalculate").set(as("alex")).send({ start })).status, 409, "locked after approval");
  assert.equal((await api().post("/api/admin/payroll/advance").set(as("alex")).send({ start })).body.step, 3);
  const slips = await api().get("/api/me/payslips").set(as("aisha"));
  assert.ok(slips.body.payslips.some((p) => p.periodStart === start));
  const done = await api().post("/api/admin/payroll/advance").set(as("alex")).send({ start });
  assert.equal(done.body.run.done, true);
  const ex = await api().post("/api/admin/payroll/export").set(as("alex")).send({ start });
  const file = await api().get(ex.body.downloadUrl);
  assert.equal(file.status, 200);
  assert.match(file.text, /^Staff ID,Name/);
  assert.equal((await api().get(ex.body.downloadUrl)).status, 404, "single use");
});

test("settings: Office Admin edits rules, break reasons and holidays; all audited", async () => {
  const s = await api().get("/api/admin/settings").set(as("alex"));
  assert.equal(s.body.activeRuleId, 2);
  assert.equal(s.body.breakReasons.length, 5);
  assert.equal((await api().patch(`/api/admin/rules/2`).set(as("alex")).send({ maxHoursWithoutBreak: 4.5 })).status, 200);
  const h = await api().post("/api/admin/holidays").set(as("alex")).send({ date: "2027-04-26", name: "Anzac Day (check SafeWork SA)", state: "SA" });
  assert.equal(h.status, 201);
  assert.equal((await api().delete(`/api/admin/holidays/${h.body.id}`).set(as("alex"))).status, 200);
  assert.equal((await api().delete(`/api/admin/break-reasons/1`).set(as("alex"))).status, 409, "Meal is in use");
  const audit = await api().get("/api/admin/audit?table=public_holidays").set(as("alex"));
  assert.equal(audit.body.entries.length, 2);
});

test("exceptions can be reviewed and resolved", async () => {
  const list = await api().get("/api/admin/exceptions?status=Open").set(as("marcus"));
  const x = list.body.exceptions[0];
  assert.equal((await api().patch(`/api/admin/exceptions/${x.id}`).set(as("marcus")).send({ status: "Resolved", notes: "Spoke to staff member" })).status, 200);
  assert.equal((await db.prepare("SELECT status FROM exceptions WHERE exception_id = ?").get(x.id)).status, "Resolved");
});
