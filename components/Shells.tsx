"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,

  Clock,
  FileClock,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  Plane,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, NoticeBanner } from "./ui";
import { useStore } from "@/lib/store";

const ADMIN_NAV = [
  { group: null, items: [{ href: "/admin/", label: "Dashboard", icon: LayoutDashboard }] },
  { group: "Workforce", items: [{ href: "/admin/staff/", label: "Staff management", icon: Users }] },
  {
    group: "Operations",
    items: [
      { href: "/admin/roster/", label: "Roster", icon: CalendarDays },
      { href: "/admin/stations/", label: "Station monitor", icon: MonitorSmartphone },
    ],
  },
  {
    group: "Finance & reporting",
    items: [
      { href: "/admin/payroll/", label: "Payroll", icon: Wallet },
      { href: "/admin/reports/", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    group: "Governance",
    items: [
      { href: "/admin/audit/", label: "Audit trail", icon: FileClock },
      { href: "/admin/settings/", label: "Access & settings", icon: Settings },
    ],
  },
];

function useSwitch() {
  const { session, openWorkspace } = useStore();
  const router = useRouter();
  const multi = (session?.account.roles.length ?? 0) > 1;
  return { multi, go: (r: "staff" | "admin") => router.push(openWorkspace(r)) };
}

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, signOut, notice, setNotice } = useStore();
  const { multi, go } = useSwitch();
  const [open, setOpen] = useState(false);
  const a = session!.account;

  const nav = (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((g, i) => (
        <div key={i}>
          {g.group && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.1em] text-white/45">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.href === "/admin/" ? path === "/admin/" || path === "/admin" : path.startsWith(it.href.replace(/\/$/, ""));
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? "bg-white/12 font-medium text-white" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <it.icon size={16} className={active ? "text-[hsl(38_80%_62%)]" : ""} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-[hsl(210_40%_14%)] text-white dark:bg-[hsl(210_28%_9%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="inline-flex items-center gap-2 [&_span]:text-white">
          <Logo tag="Admin" />
        </span>
        <button className="text-white/70 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <div className="mx-3 flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/75">
        <ShieldCheck size={14} className="text-[hsl(148_45%_60%)]" /> MFA verified session
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        {multi && (
          <button onClick={() => go("staff")} className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/[0.07] hover:text-white">
            <ArrowLeftRight size={16} /> Switch to staff workspace
          </button>
        )}
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-xs font-semibold">{a.initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{a.name}</p>
            <p className="truncate text-xs text-white/55">{a.title}</p>
          </div>
          <button
            onClick={() => {
              signOut();
              router.push("/");
            }}
            aria-label="Sign out"
            className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 text-muted hover:text-fg lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <span className="lg:hidden">
              <Logo />
            </span>
            <span className="hidden text-sm text-muted lg:inline">Admin workspace · Riverbend Farm</span>
          </div>
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
          {notice && (
            <div className="mb-5">
              <NoticeBanner tone={notice.tone} text={notice.text} onClose={() => setNotice(null)} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

const STAFF_NAV = [
  { href: "/staff/", label: "Home", icon: Home },
  { href: "/staff/timesheets/", label: "Timesheets", icon: Clock },
  { href: "/staff/leave/", label: "Leave", icon: Plane },
  { href: "/staff/profile/", label: "Profile", icon: UserRound },
];

export function StaffShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, signOut, notice, setNotice } = useStore();
  const { multi, go } = useSwitch();
  const a = session!.account;

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo tag="Staff" />
            <nav aria-label="Staff" className="hidden items-center gap-1 sm:flex">
              {STAFF_NAV.map((n) => {
                const active = n.href === "/staff/" ? path === "/staff/" || path === "/staff" : path.startsWith(n.href.replace(/\/$/, ""));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-staff-soft font-medium text-staff" : "text-muted hover:text-fg"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {multi && (
              <button onClick={() => go("admin")} className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-muted hover:text-fg md:inline-flex">
                <ArrowLeftRight size={14} /> Admin workspace
              </button>
            )}
            <ThemeToggle />
            <div className="flex items-center gap-2 pl-1">
              <Avatar initials={a.initials} tone="staff" size="sm" />
              <button
                onClick={() => {
                  signOut();
                  router.push("/");
                }}
                aria-label="Sign out"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {notice && (
          <div className="mb-5">
            <NoticeBanner tone={notice.tone} text={notice.text} onClose={() => setNotice(null)} />
          </div>
        )}
        {multi && (
          <button onClick={() => go("admin")} className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-muted md:hidden">
            <ArrowLeftRight size={14} /> Switch to Admin workspace
          </button>
        )}
        {children}
      </main>
      <nav aria-label="Staff mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface sm:hidden">
        {STAFF_NAV.map((n) => {
          const active = n.href === "/staff/" ? path === "/staff/" || path === "/staff" : path.startsWith(n.href.replace(/\/$/, ""));
          return (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "text-staff" : "text-muted"}`}>
              <n.icon size={18} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

