-- FarmTime schema for PostgreSQL (Supabase). Safe to run more than once.
-- Timestamps are stored as ISO-8601 UTC text, dates as YYYY-MM-DD text, times as HH:MM.

CREATE TABLE IF NOT EXISTS stations (
  id          TEXT PRIMARY KEY,
  sort        SERIAL,
  name        TEXT NOT NULL UNIQUE,
  method      TEXT NOT NULL,
  device      TEXT NOT NULL,
  online      INTEGER NOT NULL DEFAULT 1,
  last_seen   TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id              TEXT PRIMARY KEY,
  sort            SERIAL,
  name            TEXT NOT NULL,
  initials        TEXT NOT NULL,
  position        TEXT NOT NULL,
  station_id      TEXT NOT NULL REFERENCES stations(id),
  employment_type TEXT NOT NULL CHECK (employment_type IN ('Full-time','Part-time','Casual','Seasonal')),
  pay_rate        DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('Active','Onboarding','On leave','Inactive')),
  annual_leave_h  DOUBLE PRECISION NOT NULL DEFAULT 0,
  personal_leave_h DOUBLE PRECISION NOT NULL DEFAULT 0,
  started_on      TEXT,
  emergency_name  TEXT,
  emergency_phone TEXT,
  removed_at      TEXT,
  removed_by      TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,     -- always stored lower-case
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  title            TEXT NOT NULL,
  initials         TEXT NOT NULL,
  employee_id      TEXT REFERENCES employees(id),
  totp_secret      TEXT,                     -- set when an admin enrols MFA
  totp_pending     TEXT,                     -- secret shown during enrolment, not yet confirmed
  station_pin_hash TEXT,
  disabled         INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('staff','admin')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT NOT NULL,
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
  date        TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
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
  clock_in    TEXT NOT NULL,
  clock_out   TEXT,
  break_min   INTEGER NOT NULL DEFAULT 0,
  method      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Pending','Approved','Queried')),
  query_note  TEXT,
  staff_note  TEXT,
  decided_by  TEXT
);
CREATE INDEX IF NOT EXISTS ix_time_emp ON time_entries(employee_id, clock_in);
CREATE INDEX IF NOT EXISTS ix_time_in ON time_entries(clock_in);

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

-- Weather flags for rostering. Fill from a forecast feed or enter in Stations > Weather.
CREATE TABLE IF NOT EXISTS weather (
  date TEXT PRIMARY KEY,
  temp INTEGER NOT NULL,
  flag TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id           TEXT PRIMARY KEY,
  period_start TEXT NOT NULL UNIQUE,
  period_end   TEXT NOT NULL,
  pay_date     TEXT NOT NULL,
  step         INTEGER NOT NULL DEFAULT 0,
  updated_by   TEXT,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
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

-- The audit trail is append-only: the database refuses edits and deletes.
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_change ON audit_log;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();

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

-- Supabase exposes the public schema through its REST API. FarmTime only talks to
-- Postgres from the Express server, so lock the tables down for anon/authenticated roles.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
