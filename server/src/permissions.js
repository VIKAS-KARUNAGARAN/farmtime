// Access roles come from user_roles (DB team's values). One table drives the
// route guards and the matrix shown on the Settings page.
export const WORKER = "Worker";
export const ADMIN_ROLES = ["Office Admin", "Roster Admin", "Manager/Supervisor"];
export const ALL_ROLES = [...ADMIN_ROLES, WORKER];

const OA = "Office Admin", RA = "Roster Admin", MS = "Manager/Supervisor";

export const PERMISSIONS = {
  "clock.self": { label: "Clock in and out, breaks", roles: [WORKER] },
  "timesheets.self": { label: "Own timesheets, corrections and payslips", roles: [WORKER] },
  "leave.self": { label: "Request leave", roles: [WORKER] },
  "staff.read": { label: "View staff list", roles: [OA, RA, MS] },
  "staff.write": { label: "Add or remove staff, pay rates, logins", roles: [OA] },
  "roster.write": { label: "Edit the roster", roles: [OA, RA, MS] },
  "stations.write": { label: "Manage stations", roles: [OA, RA] },
  "approvals.write": { label: "Approve corrections and leave", roles: [OA, MS] },
  "exceptions.write": { label: "Review exceptions", roles: [OA, MS] },
  "reports.read": { label: "Reports and timesheets", roles: [OA, MS] },
  "payroll.process": { label: "Process payroll", roles: [OA] },
  "audit.read": { label: "View audit trail", roles: [OA, MS] },
  "settings.write": { label: "Rules, break reasons and holidays", roles: [OA] },
};

export function can(roles, permission) {
  const p = PERMISSIONS[permission];
  return !!p && p.roles.some((r) => roles.includes(r));
}

/** Portals an account can open: 'staff' (Worker) and/or 'admin' (any admin role). */
export function portalsOf(roles) {
  const out = [];
  if (roles.includes(WORKER)) out.push("staff");
  if (roles.some((r) => ADMIN_ROLES.includes(r))) out.push("admin");
  return out;
}

export function permissionsOf(roles) {
  return Object.keys(PERMISSIONS).filter((k) => can(roles, k));
}

export function matrix() {
  return Object.entries(PERMISSIONS).map(([key, p]) => ({
    key,
    label: p.label,
    roles: Object.fromEntries(ALL_ROLES.map((r) => [r, p.roles.includes(r)])),
  }));
}
