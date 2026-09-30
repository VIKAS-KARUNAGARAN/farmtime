# FarmTime – two-entrance workforce site (Next.js)

A Next.js 15 (App Router) prototype of the FarmTime flow:

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
npm run build      # static export to ./out
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
lib/store.tsx              session, access rules, audit log, demo state
lib/data.ts                demo data
```

## Before production

This prototype stores state in memory so it can run as a static site. For a real deployment:

1. Remove `output: "export"` from `next.config.mjs`.
2. Move `signIn` / `verifyMfa` to route handlers (e.g. `app/api/auth/…`) with hashed passwords and a real TOTP check.
3. Issue an httpOnly, secure session cookie containing the user id and roles.
4. Add `middleware.ts` that reads the session and blocks `/admin/*` unless the user has the admin role **and** a verified MFA flag; block `/staff/*` unless the user has the staff role.
5. Re-check permissions inside every API route. Client-side guards are for UX only.
6. Write audit events on the server.
