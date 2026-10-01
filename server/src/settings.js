// Runtime security settings stored in the database.

export const DEFAULT_SETTINGS = {
  lockout_attempts: 5,
  lockout_minutes: 15,
  admin_idle_minutes: 30,
  staff_session_hours: 12,
  audit_retention_years: 7,
};

export const LOCKED_POLICIES = [
  { key: "mfa_required_admin", name: "MFA required for Admin workspace", value: "Always on" },
  { key: "role_by_account", name: "Role decided by account, not entrance", value: "Enforced" },
];

export async function getSettings(db) {
  const rows = await db.prepare("SELECT key, value FROM settings").all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in s) s[r.key] = Number(r.value);
  return s;
}

export async function saveSettings(db, patch) {
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS) await stmt.run(k, String(v));
  return await getSettings(db);
}
