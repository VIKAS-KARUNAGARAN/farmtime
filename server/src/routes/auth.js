import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "../config.js";
import { audit } from "../audit.js";
import { clientIp, createSession, destroySession, loadUser, publicSession, requireAuth, rotateSession } from "../auth.js";
import { HttpError, badRequest, forbidden } from "../errors.js";
import { getSettings } from "../settings.js";
import QRCode from "qrcode";
import { generateSecret, otpauthUrl, verifyTotp } from "../totp.js";
import { nowIso } from "../util.js";

const Portal = z.enum(["staff", "admin"]);
const LoginBody = z.object({
  portal: Portal,
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200),
});

// Constant-time-ish path for unknown emails so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const MAX_MFA_FAILURES = 5;

export function authRoutes(db) {
  const r = Router();

  r.post("/login", async (req, res) => {
    const { portal, email, password } = LoginBody.parse(req.body);
    const source = portal === "admin" ? "Admin portal" : "Staff portal";
    const ip = clientIp(req);
    const settings = await getSettings(db);
    if (!email || !password) throw badRequest("Enter your email and password.");

    const attempt = await db.prepare("SELECT * FROM login_attempts WHERE email = ? AND portal = ?").get(email, portal);
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
      throw new HttpError(429, `Too many attempts. This entrance is locked for ${settings.lockout_minutes} minutes. Contact your administrator.`, "LOCKED", { locked: true });
    }

    const row = await db.prepare("SELECT id, password_hash FROM users WHERE email = ? AND disabled = 0").get(email);
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);

    if (!row || !ok) {
      const failures = (attempt?.locked_until ? 0 : attempt?.failures ?? 0) + 1;
      const locked = failures >= settings.lockout_attempts;
      const lockedUntil = locked ? new Date(Date.now() + settings.lockout_minutes * 60_000).toISOString() : null;
      await db.prepare(
        `INSERT INTO login_attempts (email, portal, failures, locked_until) VALUES (?, ?, ?, ?)
         ON CONFLICT(email, portal) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`
      ).run(email, portal, locked ? 0 : failures, lockedUntil);
      await audit(db, {
        actor: null,
        action: locked ? `Entrance locked after ${settings.lockout_attempts} failed sign-ins` : "Failed sign-in",
        target: email,
        source: `${source}${ip ? ` · ${ip}` : ""}`,
        level: portal === "admin" || locked ? "security" : "warn",
        ip,
      });
      const left = settings.lockout_attempts - failures;
      // Generic message: never reveal whether the email or the password was wrong.
      if (locked) throw new HttpError(429, `Too many attempts. This entrance is locked for ${settings.lockout_minutes} minutes. Contact your administrator.`, "LOCKED", { locked: true });
      throw new HttpError(401, `Email or password is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.`, "BAD_CREDENTIALS", { attemptsLeft: left });
    }

    await db.prepare("DELETE FROM login_attempts WHERE email = ? AND portal = ?").run(email, portal);
    const user = await loadUser(db, row.id);
    const isStaff = user.roles.includes("staff");
    const isAdmin = user.roles.includes("admin");
    await audit(db, { actor: user, action: "Signed in", target: `Roles: ${user.roles.join(", ")}`, source, ip });

    let workspace = null;
    let next;
    let notice = null;

    if (isStaff && isAdmin) {
      next = "/workspace/";
    } else if (isStaff) {
      workspace = "staff";
      next = "/staff/";
      if (portal === "admin") {
        await audit(db, { actor: user, action: "Redirected to staff workspace", target: "No admin permission", source, level: "warn", ip });
        notice = { tone: "info", text: "You signed in through the Admin portal, but your account has staff access. We’ve opened your staff home." };
      }
    } else {
      workspace = "admin";
      next = "/admin/verify/";
      if (portal === "staff") notice = { tone: "info", text: "This account has admin access. Verify your identity to open the Admin workspace." };
    }

    const { token, session } = await createSession(db, req, res, { userId: user.id, portal, workspace });
    res.json({ token, next, notice, session: publicSession(user, session) });
  });

  r.post("/mfa", requireAuth, async (req, res) => {
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter all 6 digits.") }).parse(req.body);
    const user = req.user;
    if (!user.roles.includes("admin")) throw forbidden("No admin session to verify.");
    if (req.session.mfa_verified) return res.json({ next: "/admin/", token: null, session: publicSession(user, req.session) });

    // First admin sign-in: the code must match the secret shown during enrolment.
    const pending = !user.totp_secret ? (await db.prepare("SELECT totp_pending FROM users WHERE id = ?").get(user.id))?.totp_pending : null;
    const ok = user.totp_secret ? verifyTotp(user.totp_secret, code) : !!pending && verifyTotp(pending, code);
    if (!ok) {
      const failures = req.session.mfa_failures + 1;
      await audit(db, { actor: user, action: "Failed MFA check", target: "Authenticator code", source: "Admin portal", level: "security", ip: clientIp(req) });
      if (failures >= MAX_MFA_FAILURES) {
        await destroySession(db, req, res);
        throw new HttpError(401, "Too many incorrect codes. Please sign in again.", "MFA_LOCKED");
      }
      await db.prepare("UPDATE sessions SET mfa_failures = ? WHERE token_hash = ?").run(failures, req.sessionHash);
      throw new HttpError(401, "That code didn’t match. Check your authenticator app and try again.", "BAD_MFA", { attemptsLeft: MAX_MFA_FAILURES - failures });
    }

    if (pending) {
      await db.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL WHERE id = ?").run(user.id);
      await audit(db, { actor: user, action: "Enrolled authenticator app", target: "Admin MFA", source: "Admin portal", level: "security", ip: clientIp(req) });
    }
    await db.prepare("UPDATE sessions SET mfa_verified = 1, mfa_failures = 0, workspace = 'admin' WHERE token_hash = ?").run(req.sessionHash);
    const token = await rotateSession(db, req, res);
    await audit(db, { actor: user, action: "Passed MFA check", target: "Admin workspace", source: "Admin portal", level: "security", ip: clientIp(req) });
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(req.sessionHash);
    res.json({ next: "/admin/", token, session: publicSession(user, session) });
  });

  // Authenticator enrolment for admins who haven't set one up yet. The secret is only
  // returned while the account has no confirmed authenticator.
  r.post("/mfa/setup", requireAuth, async (req, res) => {
    const user = req.user;
    if (!user.roles.includes("admin")) throw forbidden("Only admin accounts use an authenticator app.");
    if (user.totp_secret) throw forbidden("An authenticator is already set up for this account. Ask another admin to reset it.");
    const secret = generateSecret();
    await db.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").run(secret, user.id);
    const url = otpauthUrl(secret, user.email, `FarmTime ${config.farmName}`.trim());
    res.json({ secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  });

  r.post("/password", requireAuth, async (req, res) => {
    const b = z.object({ current: z.string().max(200), next: z.string().min(10, "Passwords need at least 10 characters.").max(200) }).parse(req.body);
    const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
    if (!(await bcrypt.compare(b.current, row.password_hash))) throw badRequest("Your current password is incorrect.");
    if (b.current === b.next) throw badRequest("Choose a password you haven’t used here before.");
    await db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await bcrypt.hash(b.next, 12), nowIso(), req.user.id);
    // Sign out every other device.
    await db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(req.user.id, req.sessionHash);
    await audit(db, { actor: req.user, action: "Changed password", target: "Own account", source: req.session.workspace === "admin" ? "Admin portal" : "Staff portal", level: "security", ip: clientIp(req) });
    res.json({ ok: true });
  });

  r.post("/workspace", requireAuth, async (req, res) => {
    const { role } = z.object({ role: Portal }).parse(req.body);
    if (!req.user.roles.includes(role)) throw forbidden("Your account doesn’t have that workspace.");
    await db.prepare("UPDATE sessions SET workspace = ? WHERE token_hash = ?").run(role, req.sessionHash);
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(req.sessionHash);
    const next = role === "admin" ? (session.mfa_verified ? "/admin/" : "/admin/verify/") : "/staff/";
    res.json({ next, session: publicSession(req.user, session) });
  });

  r.get("/session", requireAuth, async (req, res) => {
    res.json({ session: publicSession(req.user, req.session) });
  });

  r.post("/logout", async (req, res) => {
    if (req.user) {
      await audit(db, { actor: req.user, action: "Signed out", target: "Session ended", source: req.session.workspace === "admin" ? "Admin portal" : "Staff portal", ip: clientIp(req) });
    }
    await destroySession(db, req, res);
    res.json({ ok: true });
  });

  r.post("/forgot-password", async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().max(200) }).parse(req.body);
    const user = await db.prepare("SELECT id, name FROM users WHERE email = ?").get(email);
    if (user) await audit(db, { actor: user, action: "Requested password reset", target: email, source: "Sign-in page", level: "security", ip: clientIp(req) });
    // Same response either way so the endpoint can't be used to discover accounts.
    res.status(202).json({ message: "If that email belongs to an account, a reset link will be sent." });
  });

  return r;
}
