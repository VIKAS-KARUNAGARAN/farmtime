"use client";
import Link from "@/lib/nav";
import { useRouter } from "@/lib/nav";
import { useEffect } from "react";
import { ArrowRight, Clock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useStore } from "@/lib/store";

export default function Workspace() {
  const { session, openWorkspace, signOut } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!session) router.replace("/");
    else if (session.account.roles.length < 2) router.replace(session.account.roles[0] === "admin" ? "/admin/" : "/staff/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session) return null;

  const opts = [
    { role: "staff" as const, title: "Staff workspace", text: "Clock in, view your shifts and timesheets.", icon: Clock, cls: "bg-staff-soft text-staff", ring: "hover:border-staff/60" },
    { role: "admin" as const, title: "Admin workspace", text: "Rosters, payroll, staff and station monitoring. Requires a one-time code.", icon: ShieldCheck, cls: "bg-admin-soft text-admin", ring: "hover:border-admin/60" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-xl">
          <p className="label">Signed in as {session.account.name}</p>
          <h1 className="mt-2 text-[1.75rem] font-bold leading-tight">Your account has two workspaces</h1>
          <p className="mt-2 text-sm text-muted">Only workspaces you have permission for are shown. You can switch at any time.</p>
          <div className="mt-6 space-y-3">
            {opts.map((o) => (
              <button
                key={o.role}
                onClick={() => router.push(openWorkspace(o.role))}
                className={`group card flex w-full items-center gap-4 p-5 text-left transition-[border-color,box-shadow] hover:shadow-lift ${o.ring}`}
                data-testid={`button-workspace-${o.role}`}
              >
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${o.cls}`}><o.icon size={20} /></span>
                <span className="flex-1">
                  <span className="block font-semibold">{o.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{o.text}</span>
                </span>
                <ArrowRight size={18} className="text-faint transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
          <Link href="/" onClick={() => signOut()} className="mt-6 inline-block text-sm text-muted hover:text-fg">Not you? Sign out</Link>
        </div>
      </div>
    </div>
  );
}
