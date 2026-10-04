# FarmTime Round 2: frontend on the ERD v3 backend

Branch: `feature/erd-v3`. The Next.js frontend now talks only to the Express API, which reads and writes Chris's v3 PostgreSQL schema (`01_create_tables.sql`). No mock data is left in the frontend.

## Two entrances

| Entrance | Who | Sign-in |
|---|---|---|
| Staff portal (`/staff/login/`) | Everyone with the Worker role | Email + password |
| Admin portal (`/admin/login/`) | Office Admin, Roster Admin, Manager/Supervisor | Email + password + 6-digit authenticator code (MFA) |

People with both kinds of role pick a workspace after signing in.

## Screens

Staff: Home (clock in at a station, start a paid or unpaid break, end break, clock out, break-due warning, today's roster, week hours, leave balances), Timesheets (fortnights, request a correction, CSV), Leave (request annual, personal or unpaid leave), Profile (details, emergency contact, password, payslips).

Admin (menu items appear only if the role has the permission):

| Page | Permission | What it does |
|---|---|---|
| Dashboard | any admin role | On site now, rostered today, late arrivals, open exceptions, what needs attention |
| Staff management | staff.read / staff.write | Add a person with a login and roles, edit pay and details, issue a clock PIN, reset MFA, remove (keeps history) and restore |
| Roster | staff.read / roster.write | Week grid, add/edit/delete shifts, copy last week |
| Timesheets | reports.read | Every shift from clock events, flags, raise a correction |
| Approvals | approvals.write | Approve or reject corrections and leave (never your own) |
| Exceptions | exceptions.write | Review, resolve, reopen, mark manager told |
| Station monitor | staff.read / stations.write | Station status, add, edit, mark offline, delete unused |
| Payroll | payroll.process | 4 steps: Review, Approve, Payslips, Export |
| Reports | reports.read | Hours vs roster, by day, station, staff, exceptions; CSV |
| Audit trail | audit.read | Every change with who and why; CSV |
| Access & settings | settings.write | Permission matrix, break rule, break reasons, public holidays, security and pay settings (read-only, from `.env`) |

Removed as agreed: weather, notifications, roster publish.

## Running it

```bash
# API
cd server
cp .env.example .env        # set DATABASE_URL to Supabase (or local Postgres)
npm ci
npm run migrate             # applies the app tables/views on top of Chris's schema
npm start                   # http://localhost:4000

# Frontend
cd ..
npm ci
NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_FARM_NAME="Riverbend Farm" npm run dev   # http://localhost:3000
```

Dev/test data only: `ALLOW_DEV_SEED=yes npm run seed:dev` (wipes all tables). Logins are `firstname.lastname@farmtime.test` / `FarmTime-Dev-2026`. Alex Morgan = Office Admin, Taylor Brooks = Roster Admin, Marcus Webb and Jess Nguyen = Manager/Supervisor + Worker, everyone else = Worker. The first admin sign-in shows a QR code / secret for an authenticator app.

Live farm: do not run the dev seed. Create the first Office Admin with `npm run create-admin -- --first "Your" --last "Name" --email you@yourfarm.com.au`, then add everyone else from Staff management.

## Test checklist (all passed on 4 Oct 2026)

- [x] `cd server && npm test`: 15/15 pass
- [x] `npx tsc --noEmit` and `next build`: no errors
- [x] API run-through of every write action (clock, break, correction, leave, approve, add/edit/remove staff, PIN, roles, MFA reset, roster add/duplicate block/delete/copy, stations, exceptions, payroll recalc, settings, exports and downloads) and permission blocks (Worker to admin, Manager to payroll and staff edits, Roster Admin to approvals)
- [x] Browser run-through as Worker, Office Admin, Manager/Supervisor and Roster Admin on desktop and mobile: no page errors

## Known limits (agreed with the DB team, v3.1 list)

- Leave can't be cancelled (no Cancelled status in v3).
- Staff removal uses the app's own flag (no `is_active` column in v3).
- Active break rule is `ACTIVE_RULE_ID` in `.env`; security settings live in `.env`.
- Sign-in and security events go to the server log (no table for them in v3).
- Pay is a proof of concept: 76 ordinary hours per fortnight, the rest overtime; weekend and public holiday hours at the overtime rate.
