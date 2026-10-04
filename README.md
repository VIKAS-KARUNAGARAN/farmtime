# FarmTime – two-entrance workforce site (Next.js)

> Round 2 (ERD v3): screens, roles, run steps and the test checklist are in [docs/ROUND2.md](docs/ROUND2.md).

A Next.js 15 (App Router) frontend with an Express.js API for the FarmTime flow:

```
Landing page (/)
 ├─ Staff portal  → /staff/login ─┐
 └─ Admin portal  → /admin/login ─┤
                                  ▼
                         Authenticate (email + password)
                                  ▼
                 Permission check (account roles, not the door used)
       ┌───────────────┬───────────────────────┬───────────────────────┐
   staff only      admin only                staff + admin
   → /staff        → /admin/verify (MFA)     → /workspace (chooser)
                   → /admin
```

## Run it (two terminals)

```bash
# 1. API + database (see server/README.md for Supabase setup)
cd server
cp .env.example .env          # paste your Supabase DATABASE_URL
npm install
npm run migrate
npm run create-admin -- --first "Your" --last "Name" --email you@yourfarm.com.au
npm run dev                   # http://localhost:4000

# 2. Website
npm install
npm run dev                   # http://localhost:3000
```

Optional `.env.local` for the website:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_FARM_NAME=Riverbend Farm
```

`npm run build` makes a static export in `./out` that you can host anywhere (Vercel, Netlify, S3). Point `NEXT_PUBLIC_API_URL` at your deployed API.

## First-time setup

1. Sign in at the **Admin portal** with the account you created, then scan the QR code with an authenticator app.
2. **Station monitor → Add station** for each clock-in point.
3. **Staff management → Add staff** for each person (email + temporary password, optional admin access).
4. Staff sign in at the **Staff portal**, clock in at their station, and change their password under Profile.
5. Remove people with the bin icon in Staff management. Their login stops working at once, and their pay records are kept.

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/` | Everyone | Two entrances |
| `/staff/login`, `/admin/login` | Everyone | Portal-specific sign-in |
| `/admin/verify` | Admin accounts | One-time code (MFA) |
| `/workspace` | Multi-role accounts | Choose a permitted workspace |
| `/staff`, `/staff/timesheets`, `/staff/leave`, `/staff/profile` | Staff role | Personal workspace |
| `/admin`, `/admin/staff`, `/admin/roster`, `/admin/stations`, `/admin/payroll`, `/admin/reports`, `/admin/audit`, `/admin/settings` | Admin role + MFA | Operations workspace |

## Project layout

```
app/
  page.tsx                 landing with the two entrances
  staff/login, admin/login portal sign-in pages (components/LoginForm.tsx)
  admin/verify             MFA step
  workspace                workspace chooser for multi-role users
  staff/(app)/…            staff pages, guarded by <Guard role="staff">
  admin/(app)/…            admin pages, guarded by <Guard role="admin">
components/                shells (sidebar / top nav), guard, UI primitives
lib/store.tsx              session state (talks to /api/auth)
lib/api.ts                 API client (Bearer token in memory, cookie fallback)
lib/useApi.ts              data-fetching hook
lib/data.ts                shared types
server/                    Express.js API (see server/README.md)
```

## Going live

1. Deploy the API (Render, Railway, Fly.io or a VPS) with `DATABASE_URL`, `CORS_ORIGINS=https://your-site`, `NODE_ENV=production`.
2. Build the site with `NEXT_PUBLIC_API_URL=https://your-api` and host `out/`.
3. Serve both over HTTPS. Keep the database connection string only on the API server.

## Backend (Express.js API)

The app now runs against a real API in `server/`. See `server/README.md` for setup, endpoints and the security model.

```bash
# terminal 1
cd server && npm install && npm run dev     # http://localhost:4000
# terminal 2
npm install && npm run dev                  # http://localhost:3000
```

Sign-in, MFA, clocking, timesheets, leave, rosters, approvals, payroll, reports, audit and settings all read and write the API.
The browser never sees passwords or makes access decisions; it only shows the screen the server says you're allowed.
