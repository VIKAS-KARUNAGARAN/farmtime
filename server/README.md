# FarmTime API (Express.js)

Backend for the FarmTime Staff and Admin portals. Express 5 + SQLite (better-sqlite3), bcrypt passwords,
hashed session tokens, TOTP multi-factor for admins, per-entrance lockout, rate limiting and an append-only audit log.

## Run it

```bash
cd server
cp .env.example .env      # first time only
npm install
npm run seed              # wipe and reseed demo data (also runs automatically on an empty DB)
npm run dev               # http://localhost:4000, restarts on file changes
npm test                  # 22 integration tests (node:test + supertest, in-memory DB)
```

Then run the frontend from the project root with `npm run dev` (http://localhost:3000). It calls the API at
`NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:4000`.

## Demo accounts

| Email | Password | Roles | Lands on |
|---|---|---|---|
| mia@farmtime.au | staff123 | staff | Staff home (either entrance) |
| sam@farmtime.au | admin123 | admin | MFA, then Admin dashboard |
| jo@farmtime.au | both123 | staff + admin | Workspace chooser |

MFA: real TOTP secrets are generated at seed time and printed as `otpauth://` URLs (scan into any authenticator app).
In demo mode the code `246810` is also accepted. Set `DEMO_MODE=false` to disable it.

## How access is enforced

1. `POST /api/auth/login {portal, email, password}`: the entrance is recorded, but the account's roles decide `next`.
   Staff signing in at the Admin portal go to staff home with a notice; they never reach admin.
2. Admin sessions start with `mfa_verified = 0`. Every `/api/admin/*` route runs `requireRole("admin")`, which returns
   `403 MFA_REQUIRED` until `POST /api/auth/mfa` succeeds. The session token is rotated on success.
3. Each route then checks a named permission (`src/permissions.js`), the same table the Settings page displays.
4. Blocked requests, failed sign-ins, MFA failures and every data change are written to `audit_log`.
   SQLite triggers reject UPDATE and DELETE on that table.

Sessions: a random 32-byte token, stored only as a SHA-256 hash. It's sent as an HttpOnly SameSite=Lax cookie and also
returned in the body so the client can use `Authorization: Bearer` (or `X-Session-Token`) where cookies are blocked.
Admin sessions expire after 30 minutes idle; staff sessions last one shift (12 h). Both are configurable in Settings.

## Endpoints

All responses are JSON. Errors look like `{ "error": "message", "code": "CODE" }`.

### Auth `/api/auth`
| Method | Path | Notes |
|---|---|---|
| POST | /login | `{portal: "staff"|"admin", email, password}` → `{token, next, notice, session}`. 401 `BAD_CREDENTIALS` (with `attemptsLeft`), 429 `LOCKED` |
| POST | /mfa | `{code}` → `{token, next: "/admin/"}`. 5 wrong codes ends the session |
| POST | /workspace | `{role}` for multi-role accounts |
| GET | /session | Current session or 401 |
| POST | /logout | Revokes the session |
| POST | /forgot-password | Always 202 (no account enumeration) |

### Staff `/api/me` (staff role)
| Method | Path | Notes |
|---|---|---|
| GET | /home | Clock state, today's shift, week hours, weather, recent timesheets, notifications |
| POST | /clock-in | `{stationId}`. 409 if already clocked in or not Active |
| POST | /clock-out | Applies a 30-min unpaid break on shifts over 5 h |
| GET | /timesheets | Last two pay periods, totals, estimated gross |
| POST | /timesheets/:id/respond | `{message}` answers a query, moves it back to Pending |
| POST | /timesheets/export | One-time CSV download link |
| GET / POST | /leave | List with balances / request `{type, from, to, note}` (weekday count, overlap and balance checks) |
| POST | /leave/:id/cancel | Pending requests only |
| GET | /profile · PATCH /profile/emergency | Profile and emergency contact |
| GET | /payslips | Completed pay runs |

### Admin `/api/admin` (admin role + MFA)
| Method | Path | Permission |
|---|---|---|
| GET | /dashboard | KPIs, on site by station, alerts (heat, offline devices, missed clock-outs, rain), pending leave, recent activity |
| GET / POST / PATCH | /employees, /employees/:id | `employees.read` / `employees.write`. Rate ≥ $24.95/h; pay-rate changes are security events |
| GET | /roster?week=YYYY-MM-DD | Week grid with weather, leave and coverage |
| PUT | /roster/shifts | `{employeeId, date, start, end, stationId}` upsert. Checks leave, 12 h max, 10 h rest |
| DELETE | /roster/shifts/:id | |
| POST | /roster/publish | `{week}` notifies rostered staff |
| GET / PATCH | /stations, /stations/:id | Live occupancy; toggle device online for demos |
| GET | /approvals | Pending and queried timesheets, missed clock-outs |
| POST | /timesheets/approve | `{ids: []}` |
| POST | /timesheets/:id/query | `{note}` notifies the employee |
| POST | /timesheets/:id/close | Closes a missed clock-out at the rostered finish (or `{end}`) |
| POST | /leave/:id/decision | `{status: "Approved"|"Declined"}` deducts balance |
| GET | /payroll | Fortnight to process: ordinary up to 76 h, overtime 1.5×, super 11.5% |
| POST | /payroll/advance | Review → Approve hours → Generate payslips → Export to bank (returns CSV link) |
| POST | /payroll/export | CSV at any step |
| GET | /reports | Hours by station, labour cost, overtime trend, on-time clock-ins |
| GET | /audit?level=&q=&limit= · POST /audit/export | `audit.read` |
| GET / PATCH | /settings | Permission matrix and editable lockout / timeout values |

### Downloads
`GET /api/downloads/:token` serves an export once, within 2 minutes, with `Content-Disposition: attachment`.
CSV cells starting with `= + - @` are escaped to prevent spreadsheet formula injection.

## Project layout

```
server/
  src/
    index.js          start server, seed empty DB
    app.js            createApp(db): middleware, routers, error handler
    config.js         env config (TZ, wage, super, overtime rules)
    db.js             schema + append-only audit triggers
    auth.js           sessions, authenticate, requireRole, requirePermission
    permissions.js    role → capability table
    totp.js           RFC 6238 TOTP
    services.js       pay periods, payroll maths, on-site, lateness
    routes/           auth.js, me.js, admin.js, downloads.js
    seed.js           demo data relative to today
  tests/api.test.js
```

## Production notes

- Set `DEMO_MODE=false`, `COOKIE_SECURE=true`, and `CORS_ORIGINS` to your real frontend origin. Serve over HTTPS.
- Swap SQLite for PostgreSQL when you need several API instances (the SQL is portable; `better-sqlite3` calls are synchronous).
- Station kiosks (PIN, QR, face check) would call a device-authenticated endpoint; the schema already stores station PIN hashes.
- Send real password-reset and notification emails from `/forgot-password` and `notify()`.
