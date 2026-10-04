# FarmTime API (Express + PostgreSQL / Supabase)

The backend for the FarmTime staff and admin portals. It's built on the DB team's v3 schema (branch `sprint2/erdfinal`).

## Files the DB team owns

These files are copied exactly from the DB team. Don't edit them here; send changes to the DB team as v3.1 requests.

| File | What it is |
|---|---|
| `sql/schema.sql` | Master schema (`01_create_tables.sql`) |
| `sql/views.sql` | Reporting views (`03_exceptions_view.sql`). The app doesn't read these |
| `seed/dev_seed.sql` | Dev/test data (`02_seed_data.sql`). It wipes every table, so never run it on live |

## Files the app owns

These add no tables or columns.

| File | What it does |
|---|---|
| `sql/reference_data.sql` | Compliance rules, break reasons and SA public holidays. Safe to run repeatedly |
| `sql/security.sql` | Makes `audit_logs` append-only (trigger) and turns on Row Level Security for every table, so Supabase's public API keys can't read data |
| `seed/dev_logins.sql` | Dev only. Gives each seeded staff member a login (`firstname.lastname@farmtime.test` / `FarmTime-Dev-2026`) |

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to the Supabase Session pooler URI (port 5432).
2. Install and create the tables:
   ```bash
   npm ci
   npm run migrate
   ```
   On an empty database this runs `schema.sql`. After that it re-applies views, reference data and security, and never drops anything.
3. Create the first Office Admin:
   ```bash
   npm run create-admin -- --first "Sam" --last "Patel" --email sam@farm.com.au
   ```
   This also creates their staff row.
4. Start the server with `npm start`.

To load dev data on a dev or test database only:

```bash
ALLOW_DEV_SEED=yes npm run seed:dev
```

## Tests

`npm test` starts a temporary PostgreSQL and loads the schema, the DB team's seed and the dev logins. It then runs the API tests: roles, MFA, clocking, exceptions, corrections, leave, staff add/remove, roster, payroll and settings. To use your own database instead, set `TEST_DATABASE_URL`, but note that it is wiped.

CI: `cd server && npm ci && npm test`

## Rules the app applies

**Time zone.** Every database connection runs `SET TIME ZONE 'Australia/Adelaide'`, and the API returns ISO timestamps. Supabase itself shows UTC.

**Access roles** (`user_roles`):

| Role | Portal | Access |
|---|---|---|
| Worker | Staff portal | Clocking, breaks, own timesheets, corrections, leave, payslips |
| Roster Admin | Admin portal | Roster and stations, read-only staff list (no pay rates) |
| Manager/Supervisor | Admin portal | Approve corrections and leave, exceptions, reports, roster, audit |
| Office Admin | Admin portal | Everything, including staff records, pay rates, logins, payroll and settings |

- The admin portal always needs MFA.
- An account with Worker plus an admin role gets the workspace chooser.
- Every login is linked to a staff row.

**Shifts** are built from `time_events`: a clock-in, then breaks (`breaks` + `break_reasons.is_paid`), then a clock-out. Unpaid breaks are taken off worked time; paid breaks count as work.

**Roster end time** is start + expected hours, plus a 30-minute unpaid meal break for shifts over 5 hours. This is pending BA confirmation.

**Exceptions** go into the `exceptions` table:

| Exception | When it's recorded |
|---|---|
| Unrostered attempt | At clock-in, when there's no roster shift |
| Clocked in at wrong station | At clock-in, when the station isn't the rostered one |
| Break overdue | When someone works longer than the active rule's `max_hours_without_break`. Checked every 5 minutes and at clock-out |
| Missing clock-out | 2 hours after the rostered end, or the next day |

**Active rule:** `ACTIVE_RULE_ID` in `.env` (default 2, the PID Break Rule).

**Corrections** use `time_adjustments` (ADD / EDIT / DELETE):

- ADD on a clock-in adds the missing clock-out. ADD on a break start adds the break end.
- The approver can't be the person who requested the correction, or the staff member it is for.
- Approving a correction updates `time_events` (`is_override`, `override_reason`, `override_method = 'Admin Portal'`) and writes an `audit_logs` row with the `adjustment_id`.
- Adding a missing clock-out resolves the Missing clock-out exception.
- DELETE removes the event and unlinks any references to it, because v3 has no soft delete for events.

**Leave:** Pending, then Approved or Rejected. Approving Annual or Personal leave deducts days × (standard hours ÷ 5) from the balance. There is no Cancelled status yet (v3.1).

**Removing staff:**

- Staff with any history are soft-removed: `removed_at` and `removed_by` are set, the login is disabled, sessions are ended, future shifts are deleted and pending leave is rejected.
- Staff with no history are deleted.
- Removed staff can be restored.

**Payroll** works in fortnights from `PAY_PERIOD_ANCHOR` (31 Aug 2026), with 4 steps:

| Step | What happens |
|---|---|
| 1. Review | Calculate into `payroll_summary` |
| 2. Approve | Blocked while any shift has no clock-out or a correction is pending. Figures lock |
| 3. Payslips | Staff can see their payslip |
| 4. Export | CSV download. Step 4 with `approved_at` set counts as done |

Pay is a proof of concept:

- Ordinary hours are capped at 76 per fortnight, and the rest is overtime.
- Weekend and public holiday hours are paid at the staff member's overtime rate.
- Christmas Eve and New Year's Eve count as public holiday time from 7pm only.
- The Horticulture Award (MA000028) pays public holidays and Sundays outside harvest at 200%. This is a later phase.

**Audit:**

- Every data change writes `audit_logs` (table, record, action, reason, changed by).
- Sign-in and security events (sign-ins, failed sign-ins, lockouts, MFA) go to the server log as JSON lines. v3 has no table for them yet (v3.1).

**Downloads** are one-time links held in memory that expire after 2 minutes.

## API

All routes are under `/api`:

- `auth/*`: login, mfa, mfa/setup, password, workspace, session, logout, forgot-password.
- `me/*`: home, clock-in, break-start, break-end, clock-out, timesheets, adjustments, leave, profile, payslips.
- `admin/*`:
  - dashboard
  - staff (CRUD, login, pin, reset-mfa, remove/restore)
  - roster (week, shifts, copy-week)
  - stations
  - approvals, adjustments, leave decision
  - exceptions, timesheets
  - payroll (view, advance, recalculate, export)
  - reports, audit
  - settings, rules, break-reasons, holidays
