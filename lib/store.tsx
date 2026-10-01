"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACCOUNTS,
  AUDIT,
  LEAVE,
  MFA_CODE,
  STAFF,
  type Account,
  type AuditEvent,
  type LeaveRequest,
  type Portal,
  type Role,
  type StaffMember,
} from "./data";

/*
 * FarmTime client store.
 *
 * This prototype keeps everything in memory so it runs as a static site.
 * The access rules are written the same way a real server would apply them:
 *   1. The user picks an entrance (Staff portal or Admin portal).
 *   2. Credentials are verified.
 *   3. The account's roles, not the entrance chosen, decide where they land.
 *   4. Admin access always requires a second factor (MFA).
 * Move signIn/verifyMfa to API routes + middleware for production.
 */

export type Session = {
  account: Account;
  portal: Portal; // entrance used
  mfaVerified: boolean;
  workspace: Role | null; // workspace currently open
};

export type Notice = { tone: "info" | "warn"; text: string } | null;

type SignInResult = { ok: false; error: string; locked?: boolean } | { ok: true; next: string };

type ClockState = { since: number | null; station: string; lastOut?: number };

type Store = {
  session: Session | null;
  notice: Notice;
  setNotice: (n: Notice) => void;
  signIn: (portal: Portal, email: string, password: string) => SignInResult;
  verifyMfa: (code: string) => { ok: boolean; next?: string; error?: string };
  openWorkspace: (role: Role) => string;
  signOut: () => void;
  attempts: Record<Portal, number>;
  audit: AuditEvent[];
  log: (e: Omit<AuditEvent, "id" | "time">) => void;
  clock: Record<string, ClockState>;
  clockIn: (station: string) => void;
  clockOut: () => void;
  leave: LeaveRequest[];
  submitLeave: (r: Omit<LeaveRequest, "id" | "status" | "staffName">) => void;
  decideLeave: (id: string, status: "Approved" | "Declined") => void;
  staff: StaffMember[];
  addStaff: (s: Omit<StaffMember, "id" | "initials" | "onSite" | "hoursWeek">) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const Ctx = createContext<Store | null>(null);

const MAX_ATTEMPTS = 5;

// Set while signing out so route guards don't bounce the user to a login page.
export const navState = { signingOut: false };

function stamp() {
  const d = new Date();
  return `Today ${d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function hasRole(s: Session | null, r: Role) {
  return !!s && s.account.roles.includes(r);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [attempts, setAttempts] = useState<Record<Portal, number>>({ staff: 0, admin: 0 });
  const [audit, setAudit] = useState<AuditEvent[]>(AUDIT);
  const [clock, setClock] = useState<Record<string, ClockState>>({
    "u-mia": { since: null, station: "Orchard block B" },
    "u-jo": { since: Date.now() - (2 * 60 + 40) * 60_000, station: "Packing shed" },
  });
  const [leave, setLeave] = useState<LeaveRequest[]>(LEAVE);
  const [staff, setStaff] = useState<StaffMember[]>(STAFF);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const log = useCallback((e: Omit<AuditEvent, "id" | "time">) => {
    setAudit((prev) => [{ ...e, id: `e${Date.now()}${Math.random().toString(36).slice(2, 6)}`, time: stamp() }, ...prev]);
  }, []);

  const signIn = useCallback(
    (portal: Portal, email: string, password: string): SignInResult => {
      if (attempts[portal] >= MAX_ATTEMPTS) {
        return { ok: false, locked: true, error: "Too many attempts. This entrance is locked for 15 minutes. Contact your administrator." };
      }
      const account = ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password);
      const source = portal === "admin" ? "Admin portal" : "Staff portal";

      if (!account) {
        const n = attempts[portal] + 1;
        setAttempts((p) => ({ ...p, [portal]: n }));
        log({ actor: "Unknown", action: "Failed sign-in", target: email || "(blank)", source, level: portal === "admin" ? "security" : "warn" });
        // Generic message: never reveal whether the email or the password was wrong.
        return {
          ok: false,
          locked: n >= MAX_ATTEMPTS,
          error:
            n >= MAX_ATTEMPTS
              ? "Too many attempts. This entrance is locked for 15 minutes. Contact your administrator."
              : `Email or password is incorrect. ${MAX_ATTEMPTS - n} attempt${MAX_ATTEMPTS - n === 1 ? "" : "s"} left.`,
        };
      }

      navState.signingOut = false;
      setAttempts((p) => ({ ...p, [portal]: 0 }));
      const isStaff = account.roles.includes("staff");
      const isAdmin = account.roles.includes("admin");
      log({ actor: account.name, action: "Signed in", target: `Roles: ${account.roles.join(", ")}`, source, level: "info" });

      // Multi-role accounts choose a workspace after authenticating.
      if (isStaff && isAdmin) {
        setSession({ account, portal, mfaVerified: false, workspace: null });
        return { ok: true, next: "/workspace/" };
      }

      if (isStaff) {
        setSession({ account, portal, mfaVerified: false, workspace: "staff" });
        if (portal === "admin") {
          log({ actor: account.name, action: "Redirected to staff workspace", target: "No admin permission", source, level: "warn" });
          setNotice({ tone: "info", text: "You signed in through the Admin portal, but your account has staff access. We’ve opened your staff home." });
        }
        return { ok: true, next: "/staff/" };
      }

      // Admin only: second factor always required.
      setSession({ account, portal, mfaVerified: false, workspace: "admin" });
      if (portal === "staff") {
        setNotice({ tone: "info", text: "This account has admin access. Verify your identity to open the Admin workspace." });
      }
      return { ok: true, next: "/admin/verify/" };
    },
    [attempts, log]
  );

  const verifyMfa = useCallback(
    (code: string) => {
      if (!session || !session.account.roles.includes("admin")) return { ok: false, error: "No admin session to verify." };
      if (code.replace(/\s/g, "") !== MFA_CODE) {
        log({ actor: session.account.name, action: "Failed MFA check", target: "Authenticator code", source: "Admin portal", level: "security" });
        return { ok: false, error: "That code didn’t match. Check your authenticator app and try again." };
      }
      setSession({ ...session, mfaVerified: true, workspace: "admin" });
      log({ actor: session.account.name, action: "Passed MFA check", target: "Admin workspace", source: "Admin portal", level: "security" });
      return { ok: true, next: "/admin/" };
    },
    [session, log]
  );

  const openWorkspace = useCallback(
    (role: Role) => {
      if (!session || !session.account.roles.includes(role)) return "/";
      if (role === "admin" && !session.mfaVerified) {
        setSession({ ...session, workspace: "admin" });
        return "/admin/verify/";
      }
      setSession({ ...session, workspace: role });
      return role === "admin" ? "/admin/" : "/staff/";
    },
    [session]
  );

  const signOut = useCallback(() => {
    if (session) log({ actor: session.account.name, action: "Signed out", target: "Session ended", source: session.workspace === "admin" ? "Admin portal" : "Staff portal", level: "info" });
    navState.signingOut = true;
    setSession(null);
    setNotice(null);
  }, [session, log]);

  const clockIn = useCallback(
    (station: string) => {
      if (!session) return;
      const id = session.account.id;
      setClock((p) => ({ ...p, [id]: { since: Date.now(), station } }));
      log({ actor: session.account.name, action: "Clocked in", target: station, source: "Staff portal · verified session", level: "info" });
    },
    [session, log]
  );

  const clockOut = useCallback(() => {
    if (!session) return;
    const id = session.account.id;
    setClock((p) => ({ ...p, [id]: { since: null, station: p[id]?.station ?? "", lastOut: Date.now() } }));
    log({ actor: session.account.name, action: "Clocked out", target: clock[id]?.station ?? "", source: "Staff portal · verified session", level: "info" });
  }, [session, log, clock]);

  const submitLeave = useCallback(
    (r: Omit<LeaveRequest, "id" | "status" | "staffName">) => {
      if (!session) return;
      setLeave((p) => [{ ...r, id: `l${Date.now()}`, staffName: session.account.name, status: "Pending" }, ...p]);
      log({ actor: session.account.name, action: "Requested leave", target: `${r.type} · ${r.from}–${r.to}`, source: "Staff portal", level: "info" });
    },
    [session, log]
  );

  const decideLeave = useCallback(
    (id: string, status: "Approved" | "Declined") => {
      const req = leave.find((l) => l.id === id);
      setLeave((p) => p.map((l) => (l.id === id ? { ...l, status } : l)));
      if (req && session) log({ actor: session.account.name, action: `${status} leave`, target: `${req.staffName} · ${req.from}–${req.to}`, source: "Admin portal", level: "info" });
    },
    [leave, session, log]
  );

  const addStaff = useCallback(
    (s: Omit<StaffMember, "id" | "initials" | "onSite" | "hoursWeek">) => {
      const initials = s.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
      setStaff((p) => [...p, { ...s, id: `s${Date.now()}`, initials, onSite: false, hoursWeek: 0 }]);
      if (session) log({ actor: session.account.name, action: "Added staff member", target: `${s.name} · ${s.role}`, source: "Admin portal", level: "security" });
    },
    [session, log]
  );

  const value = useMemo<Store>(
    () => ({
      session,
      notice,
      setNotice,
      signIn,
      verifyMfa,
      openWorkspace,
      signOut,
      attempts,
      audit,
      log,
      clock,
      clockIn,
      clockOut,
      leave,
      submitLeave,
      decideLeave,
      staff,
      addStaff,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    }),
    [session, notice, signIn, verifyMfa, openWorkspace, signOut, attempts, audit, log, clock, clockIn, clockOut, leave, submitLeave, decideLeave, staff, addStaff, theme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
