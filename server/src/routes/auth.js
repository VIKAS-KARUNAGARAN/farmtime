import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import QRCode from "qrcode";
import { config } from "../config.js";
import { security } from "../audit.js";
import { clientIp, createSession, destroySession, loadUser, publicSession, requireAuth, rotateSession } from "../auth.js";
import { HttpError, badRequest, forbidden } from "../errors.js";
import { generateSecret, otpauthUrl, verifyTotp } from "../totp.js";

const Portal = z.enum(["staff", "admin"]);
const LoginBody = z.object({ portal: Portal, email: z.string().trim().toLowerCase().max(255), password: z.string().max(200) });

// Same work for unknown emails so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const MAX_MFA_FAILURES = 5;
const lockedMsg = () => `Too many attempts. This entrance is locked for ${config.lockoutMinutes} minutes. Contact your administrator.`;

export function authRoutes(db) {
  const r = Router();

  r.post("/login", async (req, res) => {
    const { portal, email, password } = LoginBody.parse(req.body);
    const ip = clientIp(req);
    if (!email || !password) throw badRequest("Enter your email and password.");

    const attempt = await db.prepare("SELECT * FROM login_attempts WHERE email = ? AND portal = ?").get(email, portal);
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) throw new HttpError(429, lockedMsg(), "LOCKED", { locked: true });

    const row = await db.prepare("SELECT user_id, password_hash FROM users WHERE lower(email) = ? AND disabled = FALSE").get(email);
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    const user = row && ok ? await loadUser(db, row.user_id) : null;

    if (!user) {
      const failures = (attempt?.locked_until ? 0 : attempt?.failures ?? 0) + 1;
      const locked = failures >= config.lockoutAttempts;
      await db
        .prepare(
          `INSERT INTO login_attempts (email, portal, failures, locked_until) VALUES (?, ?, ?, ?)
           ON CONFLICT (email, portal) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`
        )
        .run(email, portal, locked ? 0 : failures, locked ? new Date(Date.now() + config.lockoutMinutes * 60_000) : null);
      security(locked ? "entrance_locked" : "failed_sign_in", { email, portal, ip });
      if (locked) throw new HttpError(429, lockedMsg(), "LOCKED", { locked: true });
      const left = config.lockoutAttempts - failures;
      throw new HttpError(401, `Email or password is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.`, "BAD_CREDENTIALS", { attemptsLeft: left });
    }

    await db.prepare("DELETE FROM login_attempts WHERE email = ? AND portal = ?").run(email, portal);
    security("signed_in", { userId: user.id, email, portal, roles: user.roles, ip });
    const isStaff = user.portals.includes("staff");
    const isAdmin = user.portals.includes("admin");
    if (!isStaff && !isAdmin) throw forbidden("This account has no access role yet. Ask an Office Admin.");

    let workspace = null, next, notice = null;
    if (isStaff && isAdmin) next = "/workspace/";
    else if (isStaff) {
      workspace = "staff";
      next = "/staff/";
      if (portal === "admin") {
        security("redirected_to_staff", { userId: user.id, ip });
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
    if (!user.portals.includes("admin")) throw forbidden("No admin session to verify.");
    if (req.session.mfa_verified) return res.json({ next: "/admin/", token: null, session: publicSession(user, req.session) });

    const pending = !user.totp_secret ? (await db.prepare("SELECT totp_pending FROM users WHERE user_id = ?").get(user.id))?.totp_pending : null;
    const ok = user.totp_secret ? verifyTotp(user.totp_secret, code) : !!pending && verifyTotp(pending, code);
    if (!ok) {
      const failures = req.session.mfa_failures + 1;
      security("failed_mfa", { userId: user.id, ip: clientIp(req) });
      if (failures >= MAX_MFA_FAILURES) {
        await destroySession(db, req, res);
        throw new HttpError(401, "Too many incorrect codes. Please sign in again.", "MFA_LOCKED");
      }
      await db.prepare("UPDATE sessions SET mfa_failures = ? WHERE token_hash = ?").run(failures, req.sessionHash);
      throw new HttpError(401, "That code didn’t match. Check your authenticator app and try again.", "BAD_MFA", { attemptsLeft: MAX_MFA_FAILURES - failures });
    }
    if (pending) {
      await db.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL WHERE user_id = ?").run(user.id);
      user.totp_secret = pending;
      security("mfa_enrolled", { userId: user.id, ip: clientIp(req) });
    }
    await db.prepare("UPDATE sessions SET mfa_verified = TRUE, mfa_failures = 0, workspace = 'admin' WHERE token_hash = ?").run(req.sessionHash);
    const token = await rotateSession(db, req, res);
    security("passed_mfa", { userId: user.id, ip: clientIp(req) });
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(req.sessionHash);
    res.json({ next: "/admin/", token, session: publicSession(user, session) });
  });

  r.post("/mfa/setup", requireAuth, async (req, res) => {
    const user = req.user;
    if (!user.portals.includes("admin")) throw forbidden("Only admin accounts use an authenticator app.");
    if (user.totp_secret) throw forbidden("An authenticator is already set up for this account. Ask an Office Admin to reset it.");
    const secret = generateSecret();
    await db.prepare("UPDATE users SET totp_pending = ? WHERE user_id = ?").run(secret, user.id);
    const url = otpauthUrl(secret, user.email, `FarmTime ${config.farmName}`.trim());
    res.json({ secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  });

  r.post("/password", requireAuth, async (req, res) => {
    const b = z.object({ current: z.string().max(200), next: z.string().min(10, "Passwords need at least 10 characters.").max(200) }).parse(req.body);
    const row = await db.prepare("SELECT password_hash FROM users WHERE user_id = ?").get(req.user.id);
    if (!(await bcrypt.compare(b.current, row.password_hash))) throw badRequest("Your current password is incorrect.");
    if (b.current === b.next) throw badRequest("Choose a password you haven’t used here before.");
    await db.prepare("UPDATE users SET password_hash = ?, password_changed_at = now() WHERE user_id = ?").run(await bcrypt.hash(b.next, 12), req.user.id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(req.user.id, req.sessionHash);
    security("password_changed", { userId: req.user.id, ip: clientIp(req) });
    res.json({ ok: true });
  });

  r.post("/workspace", requireAuth, async (req, res) => {
    const { role } = z.object({ role: Portal }).parse(req.body);
    if (!req.user.portals.includes(role)) throw forbidden("Your account doesn’t have that workspace.");
    await db.prepare("UPDATE sessions SET workspace = ? WHERE token_hash = ?").run(role, req.sessionHash);
    const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(req.sessionHash);
    res.json({ next: role === "admin" ? (session.mfa_verified ? "/admin/" : "/admin/verify/") : "/staff/", session: publicSession(req.user, session) });
  });

  r.get("/session", requireAuth, (req, res) => res.json({ session: publicSession(req.user, req.session) }));

  r.post("/logout", async (req, res) => {
    if (req.user) security("signed_out", { userId: req.user.id });
    await destroySession(db, req, res);
    res.json({ ok: true });
  });

  r.post("/forgot-password", async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().max(255) }).parse(req.body);
    const u = await db.prepare("SELECT user_id FROM users WHERE lower(email) = ?").get(email);
    if (u) security("password_reset_requested", { userId: u.user_id, ip: clientIp(req) });
    res.status(202).json({ message: "If that email belongs to an account, a reset link will be sent." });
  });

  return r;
}
