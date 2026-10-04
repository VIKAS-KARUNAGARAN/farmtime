import crypto from "node:crypto";
import { config } from "./config.js";
import { security } from "./audit.js";
import { forbidden, unauthorized } from "./errors.js";
import { can, portalsOf, permissionsOf } from "./permissions.js";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket?.remoteAddress || null;
}

function setCookie(res, token, maxAgeSec) {
  const parts = [`${config.cookieName}=${token ? encodeURIComponent(token) : ""}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${token ? maxAgeSec : 0}`];
  if (config.cookieSecure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

const initials = (a, b) => `${(a || "?")[0]}${(b || "")[0] || ""}`.toUpperCase();

/** Loads an enabled login. Every login is linked to a staff record (team decision). */
export async function loadUser(db, userId) {
  const u = await db
    .prepare(
      `SELECT u.user_id, u.staff_id, u.email, u.name, u.totp_secret, u.password_changed_at,
              s.first_name, s.last_name, s.role AS job_title, s.removed_at
         FROM users u
         JOIN staff s ON s.staff_id = u.staff_id
        WHERE u.user_id = ? AND u.disabled = FALSE AND s.removed_at IS NULL`
    )
    .get(userId);
  if (!u) return null;
  const roles = (await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").all(userId)).map((r) => r.role);
  return {
    id: u.user_id,
    staffId: u.staff_id,
    email: u.email,
    name: u.name || `${u.first_name} ${u.last_name}`,
    firstName: u.first_name,
    lastName: u.last_name,
    title: u.job_title || roles[0] || "Staff",
    initials: initials(u.first_name, u.last_name),
    roles, // access roles from user_roles
    portals: portalsOf(roles),
    totp_secret: u.totp_secret,
  };
}

export function publicSession(user, session) {
  return {
    user: {
      id: user.id,
      staffId: user.staffId,
      name: user.name,
      email: user.email,
      title: user.title,
      initials: user.initials,
      roles: user.portals, // 'staff' / 'admin' (portal access)
      accessRoles: user.roles, // Office Admin, Roster Admin, Manager/Supervisor, Worker
      permissions: permissionsOf(user.roles),
    },
    portal: session.portal,
    mfaVerified: !!session.mfa_verified,
    mfaEnrolled: !!user.totp_secret,
    workspace: session.workspace,
    expiresAt: session.expires_at,
  };
}

export async function createSession(db, req, res, { userId, portal, workspace, mfaVerified = false }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionHours * 3600_000);
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, portal, mfa_verified, workspace, created_at, last_seen, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, now(), now(), ?, ?, ?)`
    )
    .run(sha256(token), userId, portal, mfaVerified, workspace, expires, clientIp(req), String(req.headers["user-agent"] || "").slice(0, 250));
  setCookie(res, token, config.sessionHours * 3600);
  const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token));
  return { token, session };
}

/** New token for the same session (after MFA, to prevent session fixation). */
export async function rotateSession(db, req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.prepare("UPDATE sessions SET token_hash = ? WHERE token_hash = ?").run(sha256(token), req.sessionHash);
  req.sessionHash = sha256(token);
  setCookie(res, token, config.sessionHours * 3600);
  return token;
}

export async function destroySession(db, req, res) {
  if (req.sessionHash) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.sessionHash);
  setCookie(res, null, 0);
}

function tokenFrom(req) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  const x = req.headers["x-session-token"];
  if (x) return String(x);
  return parseCookies(req.headers.cookie)[config.cookieName] || null;
}

export function authenticate(db) {
  return async (req, _res, next) => {
    const token = tokenFrom(req);
    if (!token) return next();
    const hash = sha256(token);
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hash);
    if (!session) return next();
    const now = Date.now();
    const expired = new Date(session.expires_at).getTime() < now;
    const idleAdmin = session.workspace === "admin" && session.mfa_verified && now - new Date(session.last_seen).getTime() > config.adminIdleMinutes * 60_000;
    if (expired || idleAdmin) {
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
      req.sessionExpired = true;
      return next();
    }
    const user = await loadUser(db, session.user_id);
    if (!user) return next();
    if (now - new Date(session.last_seen).getTime() > 60_000) await db.prepare("UPDATE sessions SET last_seen = now() WHERE token_hash = ?").run(hash);
    req.user = user;
    req.session = session;
    req.sessionHash = hash;
    next();
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized(req.sessionExpired ? "Your session expired. Please sign in again." : undefined, req.sessionExpired ? "SESSION_EXPIRED" : undefined));
  next();
}

/** portal: 'staff' needs Worker; 'admin' needs an admin role and a verified MFA session. */
export function requirePortal(portal) {
  return (req, _res, next) => {
    if (!req.user) return requireAuth(req, _res, next);
    if (!req.user.portals.includes(portal)) {
      security("blocked_request", { userId: req.user.id, email: req.user.email, portal, path: `${req.method} ${req.originalUrl.split("?")[0]}`, ip: clientIp(req) });
      return next(forbidden(portal === "admin" ? "The Admin workspace is restricted. Your account has staff access only." : "Your account doesn’t include a staff workspace."));
    }
    if (portal === "admin" && !req.session.mfa_verified) return next(forbidden("Verify your identity to open the Admin workspace.", "MFA_REQUIRED"));
    next();
  };
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!can(req.user?.roles ?? [], permission)) {
      security("permission_denied", { userId: req.user?.id, permission, path: `${req.method} ${req.originalUrl.split("?")[0]}` });
      return next(forbidden("Your access role doesn’t allow this. Ask an Office Admin."));
    }
    next();
  };
}
