// End-to-end flow against a real PostgreSQL database: `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { totp } from "../src/totp.js";
import { id, nowIso } from "../src/util.js";
import { startDb } from "./helpers.js";

let ctx, db, app, adminToken, stationId, empId, staffToken;
const api = () => request(app);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  ctx = await startDb();
  db = ctx.db;
  app = createApp(db, { logRequests: false, authRateLimit: 1000 });
  // Same as `npm run create-admin`.
  const uid = id("u");
  await db.prepare("INSERT INTO users (id, email, password_hash, name, title, initials, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    uid, "owner@farm.test", await bcrypt.hash("owner-password-1", 4), "Olive Owner", "Owner", "OO", nowIso()
  );
  await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')").run(uid);
});
after(() => ctx?.stop());

test("schema starts empty: no demo people or data", async () => {
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM employees").get()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM stations").get()).n, 0);
});

test("wrong password is rejected and old demo accounts don't exist", async () => {
  const r = await api().post("/api/auth/login").send({ portal: "admin", email: "sam@farmtime.au", password: "admin123" });
  assert.equal(r.status, 401);
  const r2 = await api().post("/api/auth/login").send({ portal: "admin", email: "owner@farm.test", password: "nope" });
  assert.equal(r2.status, 401);
});

test("first admin sign-in enrols an authenticator, then MFA unlocks the admin API", async () => {
  const l = await api().post("/api/auth/login").send({ portal: "admin", email: "OWNER@farm.test", password: "owner-password-1" });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(l.body.next, "/admin/verify/");
  assert.equal(l.body.session.mfaEnrolled, false);
  assert.equal((await api().get("/api/admin/dashboard").set(bearer(l.body.token))).status, 403);
  const s = await api().post("/api/auth/mfa/setup").set(bearer(l.body.token));
  assert.equal(s.status, 200);
  assert.match(s.body.qr, /^data:image\/png;base64,/);
  assert.equal((await api().post("/api/auth/mfa").set(bearer(l.body.token)).send({ code: "246810" })).status, 401);
  const m = await api().post("/api/auth/mfa").set(bearer(l.body.token)).send({ code: totp(s.body.secret) });
  assert.equal(m.status, 200, JSON.stringify(m.body));
  adminToken = m.body.token;
  assert.equal((await api().get("/api/admin/dashboard").set(bearer(adminToken))).status, 200);
  // Setup can't be repeated once enrolled.
  assert.equal((await api().post("/api/auth/mfa/setup").set(bearer(adminToken))).status, 403);
});

test("admin adds a station and a staff member with a login", async () => {
  const st = await api().post("/api/admin/stations").set(bearer(adminToken)).send({ name: "Packing shed", method: "Station PIN", device: "Shed tablet" });
  assert.equal(st.status, 201, JSON.stringify(st.body));
  stationId = st.body.id;
  const weak = await api().post("/api/admin/employees").set(bearer(adminToken)).send({ name: "Mia Chen", position: "Packer", stationId, type: "Casual", rate: 30, email: "mia@farm.test", password: "short" });
  assert.equal(weak.status, 400);
  const low = await api().post("/api/admin/employees").set(bearer(adminToken)).send({ name: "Mia Chen", position: "Packer", stationId, type: "Casual", rate: 10, email: "mia@farm.test", password: "mia-password-1" });
  assert.equal(low.status, 400);
  const e = await api().post("/api/admin/employees").set(bearer(adminToken)).send({ name: "Mia Chen", position: "Packer", stationId, type: "Casual", rate: 31.4, status: "Active", email: "Mia@Farm.test", password: "mia-password-1" });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  empId = e.body.id;
  const dup = await api().post("/api/admin/employees").set(bearer(adminToken)).send({ name: "Mia Two", position: "Packer", stationId, type: "Casual", rate: 31.4, email: "mia@farm.test", password: "mia-password-1" });
  assert.equal(dup.status, 409);
  const list = await api().get("/api/admin/employees").set(bearer(adminToken));
  assert.equal(list.body.employees.length, 1);
  assert.equal(list.body.employees[0].email, "mia@farm.test");
  assert.deepEqual(list.body.employees[0].roles, ["staff"]);
});

test("staff signs in, can't reach admin, clocks in and out", async () => {
  const l = await api().post("/api/auth/login").send({ portal: "staff", email: "mia@farm.test", password: "mia-password-1" });
  assert.equal(l.status, 200);
  assert.equal(l.body.next, "/staff/");
  staffToken = l.body.token;
  assert.equal((await api().get("/api/admin/employees").set(bearer(staffToken))).status, 403);
  const home = await api().get("/api/me/home").set(bearer(staffToken));
  assert.equal(home.status, 200, JSON.stringify(home.body));
  const cin = await api().post("/api/me/clock-in").set(bearer(staffToken)).send({ stationId });
  assert.ok([200, 201].includes(cin.status), JSON.stringify(cin.body));
  // Backdate the shift so clock-out is a realistic length.
  await db.prepare("UPDATE time_entries SET clock_in = ? WHERE employee_id = ?").run(new Date(Date.now() - 4 * 3600_000).toISOString(), empId);
  const cout = await api().post("/api/me/clock-out").set(bearer(staffToken)).send({});
  assert.ok([200, 201].includes(cout.status), JSON.stringify(cout.body));
  const ts = await api().get("/api/me/timesheets").set(bearer(staffToken));
  assert.equal(ts.status, 200);
});

test("admin sees the timesheet, approves it, and payroll and reports load", async () => {
  const a = await api().get("/api/admin/approvals").set(bearer(adminToken));
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.timesheets.length, 1);
  const ok = await api().post("/api/admin/timesheets/approve").set(bearer(adminToken)).send({ ids: [a.body.timesheets[0].id] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  for (const p of ["/api/admin/payroll", "/api/admin/reports", "/api/admin/roster", "/api/admin/stations", "/api/admin/audit", "/api/admin/settings", "/api/admin/dashboard"]) {
    const r = await api().get(p).set(bearer(adminToken));
    assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`);
  }
});

test("staff changes their password", async () => {
  const bad = await api().post("/api/auth/password").set(bearer(staffToken)).send({ current: "wrong", next: "mia-password-2" });
  assert.equal(bad.status, 400);
  const ok = await api().post("/api/auth/password").set(bearer(staffToken)).send({ current: "mia-password-1", next: "mia-password-2" });
  assert.equal(ok.status, 200);
  assert.equal((await api().post("/api/auth/login").send({ portal: "staff", email: "mia@farm.test", password: "mia-password-2" })).status, 200);
});

test("removing someone with history archives them and blocks their login", async () => {
  const r = await api().delete(`/api/admin/employees/${empId}`).set(bearer(adminToken));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, "archived");
  assert.equal((await api().get("/api/me/home").set(bearer(staffToken))).status, 401);
  assert.equal((await api().post("/api/auth/login").send({ portal: "staff", email: "mia@farm.test", password: "mia-password-2" })).status, 401);
  assert.equal((await api().get("/api/admin/employees").set(bearer(adminToken))).body.employees.length, 0);
  const removed = await api().get("/api/admin/employees?removed=1").set(bearer(adminToken));
  assert.equal(removed.body.employees.length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE employee_id = ?").get(empId)).n, 1);
  const back = await api().post(`/api/admin/employees/${empId}/restore`).set(bearer(adminToken));
  assert.equal(back.status, 200);
  assert.equal((await api().post("/api/auth/login").send({ portal: "staff", email: "mia@farm.test", password: "mia-password-2" })).status, 200);
});

test("removing someone with no history deletes them", async () => {
  const e = await api().post("/api/admin/employees").set(bearer(adminToken)).send({ name: "Tom Brown", position: "Picker", stationId, type: "Seasonal", rate: 30, email: "tom@farm.test", password: "tom-password-1" });
  const r = await api().delete(`/api/admin/employees/${e.body.id}`).set(bearer(adminToken));
  assert.equal(r.body.mode, "deleted");
  assert.equal(await db.prepare("SELECT 1 FROM users WHERE email = 'tom@farm.test'").get(), undefined);
});

test("giving a staff member admin access requires their own authenticator", async () => {
  const p = await api().patch(`/api/admin/employees/${empId}`).set(bearer(adminToken)).send({ roles: ["staff", "admin"] });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const l = await api().post("/api/auth/login").send({ portal: "admin", email: "mia@farm.test", password: "mia-password-2" });
  assert.equal(l.body.next, "/workspace/");
  assert.equal(l.body.session.mfaEnrolled, false);
});

test("a station with staff can't be removed; audit log is append-only", async () => {
  assert.equal((await api().delete(`/api/admin/stations/${stationId}`).set(bearer(adminToken))).status, 409);
  await assert.rejects(db.prepare("DELETE FROM audit_log").run(), /append-only/);
  await assert.rejects(db.prepare("UPDATE audit_log SET actor_name = 'x'").run(), /append-only/);
});
