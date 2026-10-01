// Single source of truth for role permissions. Route guards use this table,
// and GET /api/admin/settings returns it so the UI matrix always matches.

export const PERMISSIONS = {
  "clock.self": { label: "Clock in and out", roles: ["staff"] },
  "timesheets.self": { label: "View own timesheets and payslips", roles: ["staff"] },
  "leave.self": { label: "Request leave", roles: ["staff"] },
  "employees.read": { label: "View all staff records", roles: ["admin"] },
  "employees.write": { label: "Add staff and edit pay rates", roles: ["admin"] },
  "roster.write": { label: "Create and publish rosters", roles: ["admin"] },
  "approvals.write": { label: "Approve timesheets and leave", roles: ["admin"] },
  "payroll.process": { label: "Process payroll", roles: ["admin"] },
  "stations.read": { label: "Monitor stations", roles: ["admin"] },
  "audit.read": { label: "View audit trail", roles: ["admin"] },
  "settings.write": { label: "Change access settings", roles: ["admin"] },
};

export function can(roles, permission) {
  const p = PERMISSIONS[permission];
  return !!p && p.roles.some((r) => roles.includes(r));
}

export function matrix() {
  return Object.entries(PERMISSIONS).map(([key, p]) => ({
    key,
    label: p.label,
    staff: p.roles.includes("staff"),
    admin: p.roles.includes("admin"),
  }));
}
