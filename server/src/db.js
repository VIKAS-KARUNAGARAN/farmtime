import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  method      TEXT NOT NULL,              -- verification method at the device
  device      TEXT NOT NULL,
  online      INTEGER NOT NULL DEFAULT 1,
  last_seen   TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  initials        TEXT NOT NULL,
  position        TEXT NOT NULL,
  station_id      TEXT NOT NULL REFERENCES stations(id),
  employment_type TEXT NOT NULL CHECK (employment_type IN ('Full-time','Part-time','Casual','Seasonal')),
  pay_rate        REAL NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('Active','Onboarding','On leave','Inactive')),
  annual_leave_h  REAL NOT NULL DEFAULT 76,
  personal_leave_h REAL NOT NULL DEFAULT 38,
  started_on      TEXT,
  emergency_name  TEXT,
  emergency_phone TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  title            TEXT NOT NULL,
  initials         TEXT NOT NULL,
  employee_id      TEXT REFERENCES employees(id),
  totp_secret      TEXT,                   -- base32, admins only
  station_pin_hash TEXT,
  password_changed_at TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('staff','admin')),
  PRIMARY KEY (user_id, role)
);

-- Failed sign-in tracking, per email + entrance
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT NOT NULL COLLATE NOCASE,
  portal       TEXT NOT NULL,
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  PRIMARY KEY (email, portal)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portal       TEXT NOT NULL CHECK (portal IN ('staff','admin')),
  mfa_verified INTEGER NOT NULL DEFAULT 0,
  mfa_failures INTEGER NOT NULL DEFAULT 0,
  workspace    TEXT CHECK (workspace IN ('staff','admin')),
  created_at   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);

CREATE TABLE IF NOT EXISTS roster_shifts (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  station_id  TEXT NOT NULL REFERENCES stations(id),
  date        TEXT NOT NULL,              -- YYYY-MM-DD
  start_time  TEXT NOT NULL,              -- HH:MM
  end_time    TEXT NOT NULL,              -- HH:MM
  break_min   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS roster_publications (
  week_start   TEXT PRIMARY KEY,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  station_id  TEXT NOT NULL REFERENCES stations(id),
  clock_in    TEXT NOT NULL,              -- ISO timestamp
  clock_out   TEXT,
  break_min   INTEGER NOT NULL DEFAULT 0,
  method      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Pending','Approved','Queried')),
  query_note  TEXT,
  staff_note  TEXT,
  decided_by  TEXT
);
CREATE INDEX IF NOT EXISTS ix_time_emp ON time_entries(employee_id, clock_in);

CREATE TABLE IF NOT EXISTS leave_requests (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  days        INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Declined','Cancelled')),
  decided_by  TEXT,
  decided_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at    TEXT
);

CREATE TABLE IF NOT EXISTS weather (
  date TEXT PRIMARY KEY,
  temp INTEGER NOT NULL,
  flag TEXT NOT NULL DEFAULT ''          -- '', 'Heat', 'Rain', 'Wind'
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id           TEXT PRIMARY KEY,
  period_start TEXT NOT NULL UNIQUE,
  period_end   TEXT NOT NULL,
  pay_date     TEXT NOT NULL,
  step         INTEGER NOT NULL DEFAULT 0, -- 0 review, 1 approve, 2 payslips, 3 export, 4 done
  updated_by   TEXT,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  actor_id   TEXT,
  actor_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL CHECK (level IN ('info','warn','security')),
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log(at DESC);
-- The audit trail is append-only: the database itself refuses edits and deletes.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
  token      TEXT PRIMARY KEY,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  body       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function openDb(file = config.dbFile) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function isEmpty(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0;
}
