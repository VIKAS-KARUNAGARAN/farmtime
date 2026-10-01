# FarmTime – two-entrance workforce site (Next.js)

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

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to ./out (real URLs, e.g. /admin/roster)
npm run build:preview  # single index.html with hash routes (#/admin/roster/) for static preview hosts
```

## Demo accounts

| Email | Password | Roles |
|---|---|---|
| mia@farmtime.au | staff123 | Staff |
| sam@farmtime.au | admin123 | Admin |
| jo@farmtime.au  | both123  | Staff + Admin |

Admin MFA code: `246810`

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
lib/data.ts                shared types + demo sign-in shortcuts
server/                    Express.js API (see server/README.md)
```

## Before production

Access rules now live in the Express API (`server/`), so the client guards are for UX only. Remaining steps for a live deployment:

1. Set `DEMO_MODE=false` and `COOKIE_SECURE=true`, and put both apps behind HTTPS on the same site.
2. Set `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the real origins.
3. Move from SQLite to PostgreSQL if you run more than one API instance.
4. Connect real email for password resets and notifications, and a device-authenticated endpoint for station kiosks.

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
