import { nowIso } from "./util.js";

/**
 * Append-only audit log. There is intentionally no update or delete endpoint.
 */
export function audit(db, { actor, action, target = "", source = "", level = "info", ip = null }) {
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_name, action, target, source, level, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(nowIso(), actor?.id ?? null, actor?.name ?? "Unknown", action, target, source, level, ip);
}

export const sourceOf = (req) => {
  const ws = req.session?.workspace;
  return ws === "admin" ? "Admin portal" : ws === "staff" ? "Staff portal" : req.body?.portal === "admin" ? "Admin portal" : "Staff portal";
};

export function notify(db, userId, title, body) {
  if (!userId) return;
  db.prepare("INSERT INTO notifications (id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
    `n_${Math.random().toString(36).slice(2, 12)}`,
    userId,
    title,
    body,
    nowIso()
  );
}
