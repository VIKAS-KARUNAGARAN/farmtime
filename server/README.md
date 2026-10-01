# FarmTime API (Express.js + PostgreSQL / Supabase)

The backend for the FarmTime staff and admin portals. It ships with no demo people or data: you create the first admin, and that admin adds stations and staff from the web app.

## 1. Create the database (Supabase)

1. Create a project at [supabase.com](https://supabase.com). Pick the Sydney region (`ap-southeast-2`).
2. Go to **Project Settings → Database → Connection string → URI** and copy the **Session pooler** string (port 5432).
3. In this folder, run `cp .env.example .env` and paste it into `DATABASE_URL` with your database password.

Any PostgreSQL 13+ works too (local, RDS, Neon). Use `DATABASE_SSL=false` for a local server without SSL.

## 2. Install, create tables, create the first admin

```bash
npm install
npm run migrate                                   # creates all tables (safe to re-run)
npm run create-admin -- --name "Sam Patel" --email sam@yourfarm.com.au
npm run dev                                       # API on http://localhost:4000
```

`create-admin` asks for a password (10+ characters). Running it again for the same email resets that admin's password. The server also creates any missing tables when it starts.

## 3. First sign-in, then set up the farm

1. Open the Admin portal and sign in. You'll see a QR code: scan it with Google Authenticator, Microsoft Authenticator or 1Password and enter the 6-digit code. From then on, every admin sign-in needs a code from that app.
2. **Station monitor → Add station** for each clock-in point (packing shed, orchard block, workshop…).
3. **Staff management → Add staff** for each person: name, position, station, pay rate, email and a temporary password. Tick "Also give admin access" for supervisors; they set up their own authenticator at their first admin sign-in.
4. Give each person their email and temporary password. They sign in through the Staff portal and can change the password under Profile.

## Removing people

Staff management → the bin icon on a row:

- Their login is disabled at once and every open session is signed out.
- Future roster shifts and pending leave are cancelled, and an open shift is closed.
- If they have timesheets or leave history, the record is kept (Fair Work requires 7 years) and moves to the **Removed** filter, where you can **Restore** them. If they have no history, they're deleted completely.
- You can't remove your own account or take away your own admin access.

Other account actions from the edit form: change email, set a new password, add or remove admin access, and reset a lost authenticator.

## Security

- Passwords are bcrypt-hashed (cost 12). Session tokens are random 256-bit values and only their SHA-256 hash is stored.
- Roles come from the account, never from the entrance used. Staff accounts that use the Admin portal are redirected and the attempt is logged.
- Admin APIs require a verified TOTP code on the session. Admin sessions expire after 30 minutes idle (configurable in Access & settings).
- Each entrance locks after 5 failed sign-ins for 15 minutes. Auth routes are rate-limited.
- The audit log is append-only: a database trigger rejects every UPDATE and DELETE.
- Row Level Security is switched on for every table, so Supabase's public REST API can't read them. Only this server (using the database connection string) can.
- Keep `DATABASE_URL` secret. Never put it in the Next.js app.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | none | Postgres connection string (required) |
| `DATABASE_SSL` | on unless localhost | `false` to disable SSL |
| `DATABASE_POOL_SIZE` | 10 | |
| `PORT` | 4000 | |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated web origins |
| `COOKIE_SECURE` | true when `NODE_ENV=production` | |
| `TZ` | `Australia/Adelaide` | Business time zone for rosters and pay periods |
| `FARM_NAME` | `Your farm` | Shown in the authenticator app |

## Tests

```bash
npm test
```

The tests start a throwaway PostgreSQL automatically (via `embedded-postgres`) and run the whole flow: first-admin MFA enrolment, adding a station and staff, staff clock-in/out, approvals, payroll, password change, and removing and restoring people. To use your own empty database instead, set `TEST_DATABASE_URL` (the tests wipe its `public` schema).

## Deploying

Run the API anywhere that keeps a Node process alive (Render, Railway, Fly.io, a VPS). Set the environment variables above, run `npm run migrate` once, and `npm start`. Put it behind HTTPS and set `CORS_ORIGINS` to your site's URL.

## Layout

```
sql/schema.sql        tables, indexes, audit trigger, RLS
scripts/              migrate.js, create-admin.js
src/db.js             pg pool, ? placeholders, transactions
src/app.js            middleware and routers
src/auth.js           sessions, guards
src/routes/           auth, me (staff), admin, downloads
src/services.js       pay periods, payroll, lateness, on-site
tests/                end-to-end tests on real Postgres
```
