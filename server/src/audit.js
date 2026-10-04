// audit_logs (DB team schema): one row per data change, with a reason and the
// staff member who made it. Append-only (trigger in sql/security.sql).
export async function audit(db, { table, recordId, action, reason, by, adjustmentId = null }) {
  if (!by) throw new Error("audit: changed_by staff id is required");
  await db
    .prepare("INSERT INTO audit_logs (table_name, record_id, action, reason, changed_by, adjustment_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(table, recordId, action, String(reason).slice(0, 200), by, adjustmentId);
}

// Sign-in and security events. v3 has no table for these (v3.1 request #1), so
// they go to the server log as one JSON line each, ready for a log service.
export function security(event, details = {}) {
  if (process.env.FARMTIME_QUIET_LOGS) return;
  console.log(JSON.stringify({ at: new Date().toISOString(), type: "security", event, ...details }));
}
