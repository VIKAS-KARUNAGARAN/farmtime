"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setToken, setUnauthorizedHandler } from "./api";
import type { AccessRole, Permission, Portal, Role } from "./data";

/*
 * FarmTime client store: session + UI state only.
 *
 * All access decisions are made by the Express API:
 *   1. The user picks an entrance (Staff portal or Admin portal).
 *   2. POST /api/auth/login verifies credentials (bcrypt, lockout per entrance).
 *   3. The account's roles, not the entrance, decide where they land (`next`).
 *   4. Admin APIs refuse any session that hasn't passed MFA.
 * The client only mirrors those decisions to pick which screen to show.
 */

export type User = {
  id: number;
  staffId: number | null;
  name: string;
  email: string;
  title: string;
  initials: string;
  roles: Role[]; // portals: staff / admin
  accessRoles: AccessRole[];
  permissions: Permission[];
};

export type Session = {
  account: User;
  portal: Portal;
  mfaVerified: boolean;
  mfaEnrolled: boolean;
  workspace: Role | null;
};

export type Notice = { tone: "info" | "warn"; text: string } | null;

type ServerSession = { user: User; portal: Portal; mfaVerified: boolean; mfaEnrolled: boolean; workspace: Role | null };
type AuthResponse = { token?: string | null; next: string; notice?: Notice; session: ServerSession };

type SignInResult = { ok: false; error: string; locked?: boolean } | { ok: true; next: string };

type Store = {
  ready: boolean;
  session: Session | null;
  notice: Notice;
  setNotice: (n: Notice) => void;
  signIn: (portal: Portal, email: string, password: string) => Promise<SignInResult>;
  verifyMfa: (code: string) => Promise<{ ok: boolean; next?: string; error?: string }>;
  openWorkspace: (role: Role) => Promise<string>;
  signOut: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const Ctx = createContext<Store | null>(null);

// Set while signing out so route guards don't bounce the user to a login page.
export const navState = { signingOut: false };

export function hasRole(s: Session | null, r: Role) {
  return !!s && s.account.roles.includes(r);
}

/** Mirrors the server's permission check so the UI only shows what the account can use. */
export function useCan() {
  const { session } = useStore();
  const perms = session?.account.permissions ?? [];
  return (p: Permission) => perms.includes(p);
}

const toSession = (s: ServerSession): Session => ({ account: s.user, portal: s.portal, mfaVerified: s.mfaVerified, mfaEnrolled: s.mfaEnrolled, workspace: s.workspace });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Restore an existing session (cookie) on first load.
  useEffect(() => {
    api<{ session: ServerSession }>("/api/auth/session", { silent401: true })
      .then((r) => setSession(toSession(r.session)))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, []);

  // If the server says the session is gone (expired, idle timeout, revoked), drop it.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (navState.signingOut) return;
      setToken(null);
      setSession((s) => {
        if (s) setNotice({ tone: "warn", text: "Your session ended. Sign in again to continue." });
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const apply = useCallback((r: AuthResponse) => {
    if (r.token) setToken(r.token);
    setSession(toSession(r.session));
  }, []);

  const signIn = useCallback(
    async (portal: Portal, email: string, password: string): Promise<SignInResult> => {
      try {
        const r = await api<AuthResponse>("/api/auth/login", { body: { portal, email: email.trim(), password }, silent401: true });
        navState.signingOut = false;
        apply(r);
        setNotice(r.notice ?? null);
        return { ok: true, next: r.next };
      } catch (e) {
        const err = e as ApiError;
        return { ok: false, error: err.message, locked: err.code === "LOCKED" };
      }
    },
    [apply]
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      try {
        const r = await api<AuthResponse>("/api/auth/mfa", { body: { code: code.replace(/\s/g, "") }, silent401: true });
        apply(r);
        return { ok: true, next: r.next };
      } catch (e) {
        const err = e as ApiError;
        if (err.code === "MFA_LOCKED" || err.code === "NO_SESSION") {
          setToken(null);
          setSession(null);
          setNotice({ tone: "warn", text: err.message });
          return { ok: false, next: "/admin/login/", error: err.message };
        }
        return { ok: false, error: err.message };
      }
    },
    [apply]
  );

  const openWorkspace = useCallback(
    async (role: Role) => {
      try {
        const r = await api<AuthResponse>("/api/auth/workspace", { body: { role } });
        apply(r);
        return r.next;
      } catch {
        return "/";
      }
    },
    [apply]
  );

  const signOut = useCallback(async () => {
    navState.signingOut = true;
    setSession(null);
    setNotice(null);
    try {
      await api("/api/auth/logout", { body: {}, silent401: true });
    } catch {
      /* already signed out */
    }
    setToken(null);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      session,
      notice,
      setNotice,
      signIn,
      verifyMfa,
      openWorkspace,
      signOut,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    }),
    [ready, session, notice, signIn, verifyMfa, openWorkspace, signOut, theme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
