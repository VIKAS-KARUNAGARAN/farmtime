// Seeds the FarmTime database with the same demo data the frontend prototype used.
// Dates are generated relative to today so the demo always looks current.
//
//   npm run seed        -> wipes and reseeds ./data/farmtime.db
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { defaultBreak } from "./services.js";
import { generateSecret, otpauthUrl } from "./totp.js";
import { addDays, at, nowIso, parseYmd, weekStart, ymd } from "./util.js";

const STATIONS = [
  { id: "orchard", name: "Orchard block B", method: "Staff PIN", device: "Tablet OB-2", online: 1 },
  { id: "packing", name: "Packing shed", method: "QR badge", device: "Kiosk PS-1", online: 1 },
  { id: "dairy", name: "Dairy", method: "Face check", device: "Kiosk DY-1", online: 1 },
  { id: "nursery", name: "Seedling nursery", method: "Staff PIN", device: "Tablet SN-1", online: 0 },
];

const EMPLOYEES = [
  { id: "s1", name: "Mia Chen", position: "Orchard hand", station: "orchard", type: "Full-time", rate: 31.4, status: "Active" },
  { id: "s2", name: "Jo Walker", position: "Shift supervisor", station: "packing", type: "Full-time", rate: 38.2, status: "Active" },
  { id: "s3", name: "Tane Ruru", position: "Tractor operator", station: "orchard", type: "Full-time", rate: 34.1, status: "Active" },
  { id: "s4", name: "Priya Nair", position: "Packer", station: "packing", type: "Casual", rate: 33.9, status: "Active" },
  { id: "s5", name: "Liam O'Brien", position: "Dairy hand", station: "dairy", type: "Full-time", rate: 31.4, status: "Active" },
  { id: "s6", name: "Aisha Rahman", position: "Nursery assistant", station: "nursery", type: "Part-time", rate: 30.2, status: "On leave" },
  { id: "s7", name: "Tom Nguyen", position: "Picker", station: "orchard", type: "Seasonal", rate: 29.8, status: "Onboarding" },
  { id: "s8", name: "Grace Kelly", position: "Packer", station: "packing", type: "Casual", rate: 33.9, status: "Active" },
  { id: "s9", name: "Ben Harris", position: "Dairy hand", station: "dairy", type: "Part-time", rate: 31.4, status: "Active" },
];

// Weekly roster pattern, Mon..Sun. "" = day off.
const PATTERN = {
  s1: ["07:00-15:30", "07:00-15:30", "07:00-15:30", "07:00-15:30", "07:00-13:00", "", ""],
  s2: ["06:30-15:00", "06:30-15:00", "06:30-15:00", "06:30-15:00", "06:30-15:00", "", ""],
  s3: ["07:00-15:30", "07:00-15:30", "", "07:00-15:30", "07:00-15:30", "07:00-12:00", ""],
  s4: ["", "08:00-16:00", "08:00-16:00", "", "08:00-16:00", "08:00-13:00", ""],
  s5: ["04:30-13:00", "04:30-13:00", "04:30-13:00", "", "04:30-13:00", "04:30-10:00", "04:30-10:00"],
  s6: ["", "", "", "", "", "", ""],
  s7: ["", "", "", "07:00-15:30", "07:00-15:30", "07:00-12:00", ""],
  s8: ["08:00-16:00", "", "08:00-16:00", "08:00-16:00", "", "08:00-13:00", ""],
  s9: ["", "13:00-19:00", "", "13:00-19:00", "", "", "04:30-10:00"],
};

const USERS = [
  { id: "u-mia", email: "mia@farmtime.au", password: "staff123", name: "Mia Chen", title: "Orchard hand", initials: "MC", employee: "s1", roles: ["staff"] },
  { id: "u-sam", email: "sam@farmtime.au", password: "admin123", name: "Sam Patel", title: "Operations manager", initials: "SP", employee: null, roles: ["admin"] },
  { id: "u-jo", email: "jo@farmtime.au", password: "both123", name: "Jo Walker", title: "Shift supervisor", initials: "JW", employee: "s2", roles: ["staff", "admin"] },
];

// People already on site "now", with how long ago they clocked in (minutes).
const ON_SITE_NOW = { s2: 160, s3: 150, s4: 138, s5: 300, s8: 130 };

const WEEK_WEATHER = [
  [24, ""], [27, ""], [34, "Heat"], [36, "Heat"], [22, "Wind"], [19, "Rain"], [21, ""],
];
const NEXT_WEEK_WEATHER = [
  [23, ""], [25, ""], [29, ""], [31, ""], [33, "Heat"], [26, "Wind"], [20, "Rain"],
];

// Small deterministic PRNG so every seed produces the same jitter.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function seed(db, { log = true } = {}) {
  const rand = rng(42);
  const jitter = (min, max) => Math.round(min + rand() * (max - min));
  const today = ymd();
  const thisWeek = weekStart(today);
  const now = Date.now();
  const iso = (d) => new Date(d).toISOString();

  const tx = db.transaction(() => {
    for (const s of STATIONS) {
      db.prepare("INSERT INTO stations (id, name, method, device, online, last_seen) VALUES (?, ?, ?, ?, ?, ?)").run(
        s.id, s.name, s.method, s.device, s.online, s.online ? nowIso() : at(today, "06:41").toISOString()
      );
    }

    for (const e of EMPLOYEES) {
      const initials = e.name.split(" ").map((p) => p[0]).join("");
      db.prepare(
        `INSERT INTO employees (id, name, initials, position, station_id, employment_type, pay_rate, status, annual_leave_h, personal_leave_h, started_on, emergency_name, emergency_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(e.id, e.name, initials, e.position, e.station, e.type, e.rate, e.status,
        e.type === "Casual" || e.type === "Seasonal" ? 0 : 76, e.type === "Casual" || e.type === "Seasonal" ? 0 : 41.2,
        "2024-03-04", e.id === "s1" ? "David Chen" : null, e.id === "s1" ? "0412 555 018" : null);
    }

    const secrets = [];
    for (const u of USERS) {
      const totp = u.roles.includes("admin") ? generateSecret() : null;
      if (totp) secrets.push({ email: u.email, secret: totp });
      db.prepare(
        `INSERT INTO users (id, email, password_hash, name, title, initials, employee_id, totp_secret, password_changed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(u.id, u.email, bcrypt.hashSync(u.password, 10), u.name, u.title, u.initials, u.employee, totp, addDays(today, -64), nowIso());
      for (const r of u.roles) db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(u.id, r);
    }

    // Roster: three weeks back, this week and next week.
    const insShift = db.prepare(
      "INSERT INTO roster_shifts (id, employee_id, station_id, date, start_time, end_time, break_min) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (let w = -3; w <= 1; w++) {
      const ws = addDays(thisWeek, w * 7);
      for (const e of EMPLOYEES) {
        PATTERN[e.id].forEach((slot, i) => {
          if (!slot) return;
          const [start, end] = slot.split("-");
          const date = addDays(ws, i);
          insShift.run(`sh_${e.id}_${date}`, e.id, e.station, date, start, end, defaultBreak(start, end));
        });
      }
      if (w <= 0) db.prepare("INSERT INTO roster_publications (week_start, published_by, published_at) VALUES (?, ?, ?)").run(ws, "Sam Patel", at(addDays(ws, -2), "09:15").toISOString());
    }

    // Weather for this week and next week.
    WEEK_WEATHER.forEach(([t, f], i) => db.prepare("INSERT INTO weather (date, temp, flag) VALUES (?, ?, ?)").run(addDays(thisWeek, i), t, f));
    NEXT_WEEK_WEATHER.forEach(([t, f], i) => db.prepare("INSERT INTO weather (date, temp, flag) VALUES (?, ?, ?)").run(addDays(thisWeek, 7 + i), t, f));

    // Time entries for the last 28 days, generated from the roster.
    const insEntry = db.prepare(
      `INSERT INTO time_entries (id, employee_id, station_id, clock_in, clock_out, break_min, method, status, query_note, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const methodOf = Object.fromEntries(STATIONS.map((s) => [s.id, `${s.device} · ${s.method}`]));
    let queriedDone = false;
    const shifts = db.prepare("SELECT * FROM roster_shifts WHERE date >= ? AND date < ? ORDER BY date DESC").all(addDays(today, -28), today);
    let lastBenShift = null;
    for (const s of shifts) {
      const emp = EMPLOYEES.find((e) => e.id === s.employee_id);
      if (emp.status === "Onboarding") continue;
      if (emp.status === "On leave" && s.date >= addDays(today, -3)) continue;
      if (s.employee_id === "s9" && !lastBenShift && s.date <= addDays(today, -2)) {
        lastBenShift = s; // left open below: a missed clock-out
        continue;
      }
      const inAt = at(s.date, s.start_time).getTime() + jitter(-6, 7) * 60_000;
      let outAt = at(s.date, s.end_time).getTime() + jitter(-4, 9) * 60_000;
      const daysAgo = Math.round((parseYmd(today) - parseYmd(s.date)) / 86_400_000);
      let status = daysAgo <= 2 ? "Pending" : "Approved";
      let note = null;
      if (s.employee_id === "s1" && !queriedDone && parseYmd(s.date).getDay() === 4 && daysAgo > 2) {
        status = "Queried";
        outAt = at(s.date, s.end_time).getTime() + 11 * 60_000;
        note = `Please confirm your ${new Date(outAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} finish.`;
        queriedDone = true;
      }
      insEntry.run(`te_${s.employee_id}_${s.date}`, s.employee_id, s.station_id, iso(inAt), iso(outAt), s.break_min, methodOf[s.station_id], status, note, status === "Approved" ? "Sam Patel" : null);
    }
    if (lastBenShift) {
      insEntry.run(`te_s9_${lastBenShift.date}`, "s9", "dairy", at(lastBenShift.date, lastBenShift.start_time).toISOString(), null, 0, methodOf.dairy, "Open", null, null);
    }

    // People on site right now (only during farm hours, so a night-time seed looks realistic).
    const hourNow = new Date().getHours();
    const farmHours = hourNow >= 6 && hourNow < 20;
    for (const [empId, minsAgo] of Object.entries(farmHours ? ON_SITE_NOW : {})) {
      const emp = EMPLOYEES.find((e) => e.id === empId);
      insEntry.run(`te_${empId}_now`, empId, emp.station, iso(now - minsAgo * 60_000), null, 0, methodOf[emp.station], "Open", null, null);
    }

    // Leave
    const insLeave = db.prepare(
      `INSERT INTO leave_requests (id, employee_id, type, start_date, end_date, days, note, status, decided_by, decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insLeave.run("l1", "s4", "Annual leave", addDays(today, 11), addDays(today, 15), 5, "Family trip", "Pending", null, null, iso(now - 2 * 86_400_000));
    insLeave.run("l2", "s1", "Personal leave", addDays(today, -28), addDays(today, -28), 1, "", "Approved", "Sam Patel", iso(now - 29 * 86_400_000), iso(now - 30 * 86_400_000));
    insLeave.run("l3", "s9", "Annual leave", addDays(today, 18), addDays(today, 19), 2, "", "Pending", null, null, iso(now - 86_400_000));
    insLeave.run("l4", "s6", "Annual leave", addDays(today, -3), addDays(today, 10), 10, "Overseas", "Approved", "Sam Patel", iso(now - 20 * 86_400_000), iso(now - 21 * 86_400_000));

    // Notifications for Mia
    const insN = db.prepare("INSERT INTO notifications (id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)");
    const q = db.prepare("SELECT clock_in, query_note FROM time_entries WHERE status = 'Queried' AND employee_id = 's1'").get();
    if (q) insN.run("n1", "u-mia", "Timesheet queried", `${new Date(q.clock_in).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}: ${q.query_note}`, iso(now - 3600_000 * 20));
    insN.run("n2", "u-mia", "Roster published", "This week’s roster is now available.", iso(now - 3600_000 * 50));
    insN.run("n3", "u-mia", "Leave approved", "Your personal leave request was approved.", iso(now - 29 * 86_400_000));

    // Audit history
    const insA = db.prepare("INSERT INTO audit_log (at, actor_id, actor_name, action, target, source, level, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    insA.run(iso(now - 26 * 3600_000), "u-sam", "Sam Patel", "Published roster", `Week of ${thisWeek}`, "Admin portal", "info", null);
    insA.run(iso(now - 22 * 3600_000), null, "Unknown", "Failed sign-in", "sam@farmtime.au", "Admin portal · 203.0.113.24", "security", "203.0.113.24");
    insA.run(iso(now - 21.9 * 3600_000), null, "Unknown", "Failed sign-in", "sam@farmtime.au", "Admin portal · 203.0.113.24", "security", "203.0.113.24");
    insA.run(iso(now - 20 * 3600_000), "u-sam", "Sam Patel", "Updated pay rate", "Grace Kelly · $33.90/h", "Admin portal", "security", null);
    insA.run(iso(now - 9 * 3600_000), null, "System", "Device offline", "Tablet SN-1", "Station monitor", "warn", null);
    insA.run(iso(now - 3 * 3600_000), "u-jo", "Jo Walker", "Approved timesheet", "Tane Ruru", "Admin portal", "info", null);

    return secrets;
  });

  const secrets = tx();
  if (log) {
    console.log("Seeded FarmTime demo data.");
    if (config.demoMode) {
      for (const s of secrets) console.log(`  MFA for ${s.email}: ${otpauthUrl(s.secret, s.email)}  (demo code ${config.demoMfaCode} also accepted)`);
    }
  }
}

// CLI: node src/seed.js --reset
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--reset") && config.dbFile !== ":memory:") {
    for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
  }
  const db = openDb();
  const n = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (n > 0) console.log("Database already has data. Run with --reset to wipe and reseed.");
  else seed(db);
  db.close();
}
