// Integration tests: run with `npm test`. Each test file gets a fresh in-memory database.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDb } from "../src/db.js";
import { seed } from "../src/seed.js";
import { createApp } from "../src/app.js";
import { totp } from "../src/totp.js";
import { addDays, ymd } from "../src/util.js";

let db, app;
const api = () => request(app);

async function login(portal, email, password) {
  const res = await api().post("/api/auth/login").send({ portal, email, password });
  return res;
}
async function adminToken(email = "sam@farmtime.au", password = "admin123") {
  const l = await login("admin", email, password);
  const m = await api().post("/api/auth/mfa").set("Authorization", `Bearer ${l.body.token}`).send({ code: "246810" });
  assert.equal(m.status, 200, JSON.stringify(m.body));
  return m.body.token;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

before(() => {
  db = openDb(":memory:");
  seed(db, { log: false });
  app = createApp(db, { logRequests: false, authRateLimit: 1000 });
});

describe("two entrances and role routing", () => {
  test("staff account through the Staff portal goes to staff home", async () => {
    const r = await login("staff", "mia@farmtime.au", "staff123");
    assert.equal(r.status, 200);
    assert.equal(r.body.next, "/staff/");
    assert.equal(r.body.notice, null);
    assert.ok(r.body.token);
    assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  });

  test("staff account through the Admin portal is redirected to staff home with a notice", async () => {
    const r = await login("admin", "mia@farmtime.au", "staff123");
    assert.equal(r.body.next, "/staff/");
    assert.match(r.body.notice.text, /staff access/);
    const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'Redirected to staff workspace'").get();
    assert.ok(audit);
  });

  test("admin account must pass MFA before any admin API", async () => {
    const r = await login("admin", "sam@farmtime.au", "admin123");
    assert.equal(r.body.next, "/admin/verify/");
    const blocked = await api().get("/api/admin/dashboard").set(bearer(r.body.token));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "MFA_REQUIRED");
  });

  test("MFA rejects a wrong code and accepts a real TOTP code, rotating the token", async () => {
    const r = await login("admin", "sam@farmtime.au", "admin123");
    const bad = await api().post("/api/auth/mfa").set(bearer(r.body.token)).send({ code: "000000" });
    assert.equal(bad.status, 401);
    const secret = db.prepare("SELECT totp_secret FROM users WHERE email = 'sam@farmtime.au'").get().totp_secret;
    const ok = await api().post("/api/auth/mfa").set(bearer(r.body.token)).send({ code: totp(secret) });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.next, "/admin/");
    assert.notEqual(ok.body.token, r.body.token);
    const old = await api().get("/api/auth/session").set(bearer(r.body.token));
    assert.equal(old.status, 401, "old token must stop working after rotation");
    const dash = await api().get("/api/admin/dashboard").set(bearer(ok.body.token));
    assert.equal(dash.status, 200);
  });

  test("multi-role account chooses a workspace", async () => {
    const r = await login("staff", "jo@farmtime.au", "both123");
    assert.equal(r.body.next, "/workspace/");
    const ws = await api().post("/api/auth/workspace").set(bearer(r.body.token)).send({ role: "admin" });
    assert.equal(ws.body.next, "/admin/verify/");
    const st = await api().post("/api/auth/workspace").set(bearer(r.body.token)).send({ role: "staff" });
    assert.equal(st.body.next, "/staff/");
  });

  test("staff token is blocked from admin routes and the attempt is audited", async () => {
    const r = await login("staff", "mia@farmtime.au", "staff123");
    const res = await api().get("/api/admin/employees").set(bearer(r.body.token));
    assert.equal(res.status, 403);
    assert.ok(db.prepare("SELECT * FROM audit_log WHERE action = 'Blocked admin request'").get());
  });

  test("admin-only account has no staff API", async () => {
    const t = await adminToken();
    const res = await api().get("/api/me/home").set(bearer(t));
    assert.equal(res.status, 403);
  });

  test("unauthenticated requests get 401", async () => {
    const res = await api().get("/api/me/home");
    assert.equal(res.status, 401);
  });
});

describe("credential handling", () => {
  test("wrong password gives a generic message and counts down", async () => {
    const r = await login("staff", "grace@example.com", "nope");
    assert.equal(r.status, 401);
    assert.match(r.body.error, /Email or password is incorrect/);
    assert.equal(r.body.attemptsLeft, 4);
  });

  test("entrance locks after 5 failures, per portal", async () => {
    for (let i = 0; i < 4; i++) await login("admin", "sam@farmtime.au", "wrong");
    const fifth = await login("admin", "sam@farmtime.au", "wrong");
    assert.equal(fifth.status, 429);
    assert.equal(fifth.body.code, "LOCKED");
    const correct = await login("admin", "sam@farmtime.au", "admin123");
    assert.equal(correct.status, 429, "correct password is refused while locked");
    // Other entrance is tracked separately
    const other = await login("staff", "sam@farmtime.au", "admin123");
    assert.equal(other.status, 200);
    db.prepare("DELETE FROM login_attempts").run();
  });

  test("logout revokes the session", async () => {
    const r = await login("staff", "mia@farmtime.au", "staff123");
    await api().post("/api/auth/logout").set(bearer(r.body.token));
    const s = await api().get("/api/auth/session").set(bearer(r.body.token));
    assert.equal(s.status, 401);
  });

  test("cookie session works without a bearer token", async () => {
    const r = await login("staff", "mia@farmtime.au", "staff123");
    const cookie = r.headers["set-cookie"][0].split(";")[0];
    const s = await api().get("/api/auth/session").set("Cookie", cookie);
    assert.equal(s.status, 200);
    assert.equal(s.body.session.user.email, "mia@farmtime.au");
  });
});

describe("staff workflows", () => {
  let mia;
  before(async () => {
    mia = (await login("staff", "mia@farmtime.au", "staff123")).body.token;
  });

  test("clock in, refuse double clock-in, clock out", async () => {
    const a = await api().post("/api/me/clock-in").set(bearer(mia)).send({ stationId: "orchard" });
    assert.equal(a.status, 201);
    assert.equal(a.body.clock.onShift, true);
    const b = await api().post("/api/me/clock-in").set(bearer(mia)).send({ stationId: "orchard" });
    assert.equal(b.status, 409);
    const t = await adminToken();
    const dash = await api().get("/api/admin/dashboard").set(bearer(t));
    const orchard = dash.body.stations.find((s) => s.id === "orchard");
    assert.ok(orchard.people.some((p) => p.name === "Mia Chen"), "admin sees Mia on site");
    const c = await api().post("/api/me/clock-out").set(bearer(mia));
    assert.equal(c.status, 200);
    assert.equal(c.body.clock.onShift, false);
  });

  test("home and timesheets load", async () => {
    const h = await api().get("/api/me/home").set(bearer(mia));
    assert.equal(h.status, 200);
    assert.equal(h.body.employee.name, "Mia Chen");
    const ts = await api().get("/api/me/timesheets").set(bearer(mia));
    assert.ok(ts.body.timesheets.length > 0);
    assert.ok(ts.body.timesheets.some((t) => t.status === "Queried"));
  });

  test("respond to a queried timesheet", async () => {
    const ts = await api().get("/api/me/timesheets").set(bearer(mia));
    const q = ts.body.timesheets.find((t) => t.status === "Queried");
    const r = await api().post(`/api/me/timesheets/${q.id}/respond`).set(bearer(mia)).send({ message: "Finished pruning row 14, confirmed." });
    assert.equal(r.status, 200);
  });

  test("leave validation, submission and admin approval", async () => {
    const bad = await api().post("/api/me/leave").set(bearer(mia)).send({ type: "Annual leave", from: addDays(ymd(), 10), to: addDays(ymd(), 5) });
    assert.equal(bad.status, 400);
    let from = addDays(ymd(), 30);
    while ([0, 6].includes(new Date(from + "T00:00:00").getDay())) from = addDays(from, 1);
    const ok = await api().post("/api/me/leave").set(bearer(mia)).send({ type: "Annual leave", from, to: addDays(from, 2), note: "Trip" });
    assert.equal(ok.status, 201);
    const dup = await api().post("/api/me/leave").set(bearer(mia)).send({ type: "Annual leave", from, to: from });
    assert.equal(dup.status, 409);

    const t = await adminToken();
    const before = db.prepare("SELECT annual_leave_h FROM employees WHERE id = 's1'").get().annual_leave_h;
    const d = await api().post(`/api/admin/leave/${ok.body.id}/decision`).set(bearer(t)).send({ status: "Approved" });
    assert.equal(d.status, 200);
    const after = db.prepare("SELECT annual_leave_h FROM employees WHERE id = 's1'").get().annual_leave_h;
    assert.ok(after < before, "balance deducted");
    const again = await api().post(`/api/admin/leave/${ok.body.id}/decision`).set(bearer(t)).send({ status: "Declined" });
    assert.equal(again.status, 409);
    const notes = db.prepare("SELECT * FROM notifications WHERE user_id = 'u-mia' AND title = 'Leave approved'").all();
    assert.ok(notes.length >= 1);
  });
});

describe("admin workflows", () => {
  let t;
  before(async () => {
    t = await adminToken();
  });

  test("employees: validation, create, pay-rate change audited", async () => {
    const low = await api().post("/api/admin/employees").set(bearer(t)).send({ name: "Lee Park", position: "Picker", stationId: "orchard", type: "Casual", rate: 10 });
    assert.equal(low.status, 400);
    const ok = await api().post("/api/admin/employees").set(bearer(t)).send({ name: "Lee Park", position: "Picker", stationId: "orchard", type: "Casual", rate: 30 });
    assert.equal(ok.status, 201);
    const p = await api().patch(`/api/admin/employees/${ok.body.id}`).set(bearer(t)).send({ rate: 31.5 });
    assert.equal(p.status, 200);
    const a = db.prepare("SELECT * FROM audit_log WHERE action = 'Updated pay rate' ORDER BY id DESC").get();
    assert.match(a.target, /\$30\.00 → \$31\.50/);
    const list = await api().get("/api/admin/employees?q=lee").set(bearer(t));
    assert.equal(list.body.employees.length, 1);
  });

  test("roster: grid, rest rule, upsert, delete, publish", async () => {
    const g = await api().get("/api/admin/roster").set(bearer(t));
    assert.equal(g.status, 200);
    assert.equal(g.body.days.length, 7);
    const nextWeek = addDays(g.body.weekStart, 7);
    // Liam (s5) starts 04:30 Tuesday; a Monday shift ending 21:00 breaks the 10 h rest rule
    const rest = await api().put("/api/admin/roster/shifts").set(bearer(t)).send({ employeeId: "s5", date: nextWeek, start: "13:00", end: "21:00" });
    assert.equal(rest.status, 409);
    const add = await api().put("/api/admin/roster/shifts").set(bearer(t)).send({ employeeId: "s4", date: nextWeek, start: "08:00", end: "12:00" });
    assert.equal(add.status, 200);
    const del = await api().delete(`/api/admin/roster/shifts/${add.body.id}`).set(bearer(t));
    assert.equal(del.status, 200);
    const pub = await api().post("/api/admin/roster/publish").set(bearer(t)).send({ week: nextWeek });
    assert.equal(pub.status, 200);
    const pub2 = await api().post("/api/admin/roster/publish").set(bearer(t)).send({ week: nextWeek });
    assert.equal(pub2.status, 409);
  });

  test("approvals: approve pending, close missed clock-out", async () => {
    const a = await api().get("/api/admin/approvals").set(bearer(t));
    const pending = a.body.timesheets.filter((x) => x.status === "Pending").map((x) => x.id);
    assert.ok(pending.length > 0);
    const ap = await api().post("/api/admin/timesheets/approve").set(bearer(t)).send({ ids: pending.slice(0, 2) });
    assert.equal(ap.body.approved, 2);
    assert.ok(a.body.missedClockOuts.length > 0);
    const close = await api().post(`/api/admin/timesheets/${a.body.missedClockOuts[0].id}/close`).set(bearer(t)).send({});
    assert.equal(close.status, 200);
  });

  test("payroll runs through all four steps and produces an export", async () => {
    let p = await api().get("/api/admin/payroll").set(bearer(t));
    assert.equal(p.body.step, 0);
    assert.ok(p.body.rows.length > 0);
    for (let i = 0; i < 4; i++) {
      p = await api().post("/api/admin/payroll/advance").set(bearer(t));
      assert.equal(p.status, 200, JSON.stringify(p.body));
    }
    assert.equal(p.body.done, true);
    assert.ok(p.body.export.downloadUrl);
    const dl = await api().get(p.body.export.downloadUrl);
    assert.equal(dl.status, 200);
    assert.match(dl.headers["content-disposition"], /attachment/);
    assert.match(dl.text, /Employee,Ordinary hours/);
    const again = await api().get(p.body.export.downloadUrl);
    assert.equal(again.status, 404, "download links are single use");
    const more = await api().post("/api/admin/payroll/advance").set(bearer(t));
    assert.equal(more.status, 409);
  });

  test("reports, stations, audit and settings", async () => {
    const r = await api().get("/api/admin/reports").set(bearer(t));
    assert.equal(r.body.hoursByStation.length, 4);
    const s = await api().get("/api/admin/stations").set(bearer(t));
    assert.ok(s.body.stations.find((x) => x.id === "nursery").online === false);
    const au = await api().get("/api/admin/audit?level=security").set(bearer(t));
    assert.ok(au.body.events.every((e) => e.level === "security"));
    const st = await api().get("/api/admin/settings").set(bearer(t));
    assert.ok(st.body.permissions.length > 5);
    const bad = await api().patch("/api/admin/settings").set(bearer(t)).send({ lockout_attempts: 1 });
    assert.equal(bad.status, 400);
    const ok = await api().patch("/api/admin/settings").set(bearer(t)).send({ lockout_attempts: 6 });
    assert.equal(ok.body.values.lockout_attempts, 6);
  });

  test("audit log is append-only at the database level", () => {
    assert.throws(() => db.prepare("DELETE FROM audit_log").run(), /append-only/);
    assert.throws(() => db.prepare("UPDATE audit_log SET actor_name = 'x'").run(), /append-only/);
  });

  test("CSV export neutralises formula injection", async () => {
    await api().post("/api/admin/employees").set(bearer(t)).send({ name: "=cmd Attack", position: "Picker", stationId: "orchard", type: "Casual", rate: 30 });
    const ex = await api().post("/api/admin/audit/export").set(bearer(t)).send({});
    const dl = await api().get(ex.body.downloadUrl);
    assert.ok(!/(^|,)=cmd/m.test(dl.text));
  });
});
