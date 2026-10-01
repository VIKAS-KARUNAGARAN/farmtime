import crypto from "node:crypto";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { forbidden, unauthorized } from "./errors.js";
import { can } from "./permissions.js";
import { getSettings } from "./settings.js";
import { nowIso } from "./util.js";

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
  const parts = [
    `${config.cookieName}=${token ? encodeURIComponent(token) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${token ? maxAgeSec : 0}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export async function loadUser(db, userId) {
  const u = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.title, u.initials, u.employee_id, u.totp_secret, u.password_changed_at,
              s.name AS station
         FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN stations s ON s.id = e.station_id
        WHERE u.id = ? AND u.disabled = 0`
    )
    .get(userId);
  if (!u) return null;
  u.roles = (await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role DESC").all(userId)).map((r) => r.role);
  u.station = u.station || "Head office";
  return u;
}

export function publicSession(user, session) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      initials: user.initials,
      roles: user.roles,
      station: user.station,
      employeeId: user.employee_id,
    },
    portal: session.portal,
    mfaVerified: !!session.mfa_verified,
    mfaEnrolled: !!user.totp_secret,
    workspace: session.workspace,
    expiresAt: session.expires_at,
  };
}

/** Creates a session and returns the raw token (only its hash is stored) plus the session row. */
export async function createSession(db, req, res, { userId, portal, workspace, mfaVerified = false }) {
  const s = await getSettings(db);
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + s.staff_session_hours * 3600_000);
  await db.prepare(
    `INSERT INTO sessions (token_hash, user_id, portal, mfa_verified, workspace, created_at, last_seen, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sha256(token), userId, portal, mfaVerified ? 1 : 0, workspace, now.toISOString(), now.toISOString(), expires.toISOString(), clientIp(req), String(req.headers["user-agent"] || "").slice(0, 200));
  setCookie(res, token, s.staff_session_hours * 3600);
  const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token));
  return { token, session };
}

/** Issues a new token for the same session (used after MFA to prevent session fixation). */
export async function rotateSession(db, req, res) {
  const s = await getSettings(db);
  const token = crypto.randomBytes(32).toString("base64url");
  await db.prepare("UPDATE sessions SET token_hash = ? WHERE token_hash = ?").run(sha256(token), req.sessionHash);
  req.sessionHash = sha256(token);
  setCookie(res, token, s.staff_session_hours * 3600);
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

/** Attaches req.user and req.session when a valid session token is present. */
export function authenticate(db) {
  return async (req, _res, next) => {
    const token = tokenFrom(req);
    if (!token) return next();
    const hash = sha256(token);
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hash);
    if (!session) return next();

    const now = Date.now();
    const settings = await getSettings(db);
    const expired = new Date(session.expires_at).getTime() < now;
    const idleAdmin =
      session.workspace === "admin" && session.mfa_verified && now - new Date(session.last_seen).getTime() > settings.admin_idle_minutes * 60_000;
    if (expired || idleAdmin) {
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
      req.sessionExpired = true;
      return next();
    }
    const user = await loadUser(db, session.user_id);
    if (!user) return next();
    // Throttle last_seen writes to once a minute.
    if (now - new Date(session.last_seen).getTime() > 60_000) {
      await db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(nowIso(), hash);
    }
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

export function requireRole(db, role) {
  return async (req, _res, next) => {
    if (!req.user) return requireAuth(req, _res, next);
    if (!req.user.roles.includes(role)) {
      await audit(db, {
        actor: req.user,
        action: `Blocked ${role} request`,
        target: `${req.method} ${req.originalUrl.split("?")[0]}`,
        source: "API guard",
        level: "security",
        ip: clientIp(req),
      });
      return next(forbidden(role === "admin" ? "The Admin workspace is restricted. Your account has staff access only." : "Your account doesn’t include a staff workspace."));
    }
    if (role === "admin" && !req.session.mfa_verified) {
      return next(forbidden("Verify your identity to open the Admin workspace.", "MFA_REQUIRED"));
    }
    next();
  };
}

export function requirePermission(permission) {
  return async (req, _res, next) => {
    if (!can(req.user?.roles ?? [], permission)) return next(forbidden());
    next();
  };
}
