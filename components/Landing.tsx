import Link from "@/lib/nav";
import { ArrowRight, Clock, CalendarCheck, FileText, Bell, Users, CalendarDays, Wallet, MonitorSmartphone, ShieldCheck, KeyRound, DoorOpen, Fingerprint, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const staffFeatures = [
  { icon: Clock, text: "Clock in or out" },
  { icon: FileText, text: "View your timesheets" },
  { icon: CalendarCheck, text: "Submit leave requests" },
  { icon: Bell, text: "See shift notifications" },
];
const adminFeatures = [
  { icon: Users, text: "Manage staff records" },
  { icon: CalendarDays, text: "Build and optimise rosters" },
  { icon: Wallet, text: "Process payroll" },
  { icon: MonitorSmartphone, text: "Monitor stations and activity" },
];
const steps = [
  { icon: DoorOpen, title: "Choose an entrance", text: "Staff or Admin, from this page." },
  { icon: KeyRound, title: "Sign in", text: "Your email and password." },
  { icon: Fingerprint, title: "Permission check", text: "Your account’s roles are verified. Admin adds a one-time code." },
  { icon: LayoutGrid, title: "Right workspace", text: "Wrong door? You’re redirected, never shown the other side." },
];

function Rows() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-wheat/[0.13]" preserveAspectRatio="none" viewBox="0 0 1200 400">
      {Array.from({ length: 14 }).map((_, i) => (
        <path key={i} d={`M-50 ${60 + i * 26} C 300 ${20 + i * 30}, 700 ${110 + i * 22}, 1250 ${40 + i * 27}`} fill="none" stroke="currentColor" strokeWidth="1.2" />
      ))}
    </svg>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">Riverbend Farm · Workforce</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <Rows />
          <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-8 sm:px-8 sm:pt-14">
            <p className="label fade-up">FarmTime workforce management</p>
            <h1 className="fade-up mt-3 max-w-3xl text-[clamp(2.25rem,1.4rem+3.6vw,4rem)] font-extrabold leading-[1.02]">
              Make every hour count.
            </h1>
            <p className="fade-up mt-4 max-w-xl text-base text-muted sm:text-[17px]">
              Choose your entrance below. After you sign in, your account permissions take you to the right workspace.
            </p>
          </div>
        </section>

        <section aria-label="Choose an entrance" className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 md:grid-cols-2">
          <PortalCard
            href="/staff/login/"
            kind="staff"
            title="Staff portal"
            who="For pickers, packers, operators and farm hands."
            features={staffFeatures}
            cta="Enter staff portal"
          />
          <PortalCard
            href="/admin/login/"
            kind="admin"
            title="Admin portal"
            who="For managers, supervisors and payroll officers."
            features={adminFeatures}
            cta="Enter admin portal"
            note="Requires multi-factor verification"
          />
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <h2 id="how" className="font-sans text-[15px] font-semibold tracking-normal">How access works</h2>
          <ol className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-surface p-5">
                <div className="flex items-center gap-2 text-faint">
                  <span className="tabular text-xs font-medium">0{i + 1}</span>
                  <s.icon size={16} />
                </div>
                <p className="mt-3 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-dashed border-line px-5 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-medium text-fg">Need help signing in?</span> Use “Forgot password” on your portal’s sign-in page, or contact your manager or system administrator.
            </p>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
              <ShieldCheck size={14} className="text-ok" /> Every sign-in is recorded in the audit trail
            </span>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-faint sm:px-8">
          <span>© 2026 FarmTime</span>
          <span>Prototype · demo data only</span>
        </div>
      </footer>
    </div>
  );
}

function PortalCard({
  href, kind, title, who, features, cta, note,
}: {
  href: string; kind: "staff" | "admin"; title: string; who: string;
  features: { icon: typeof Clock; text: string }[]; cta: string; note?: string;
}) {
  const staff = kind === "staff";
  return (
    <Link
      href={href}
      data-testid={`link-portal-${kind}`}
      className={`group fade-up relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-6 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-8 ${
        staff ? "border-staff/25 hover:border-staff/60" : "border-admin/25 hover:border-admin/60"
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${staff ? "bg-staff" : "bg-admin"}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${staff ? "bg-staff-soft text-staff" : "bg-admin-soft text-admin"}`}>
            {staff ? "Entrance 1" : "Entrance 2"}
          </span>
          <h2 className="mt-3 text-[1.75rem] font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted">{who}</p>
        </div>
        <span className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:inline-flex ${staff ? "bg-staff-soft text-staff" : "bg-admin-soft text-admin"}`}>
          {staff ? <Clock size={22} /> : <ShieldCheck size={22} />}
        </span>
      </div>
      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {features.map((f) => (
          <li key={f.text} className="flex items-center gap-2.5 text-sm">
            <f.icon size={16} className={staff ? "text-staff" : "text-admin"} />
            {f.text}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white transition-colors dark:text-bg ${
            staff ? "bg-staff group-hover:bg-staff/90" : "bg-admin group-hover:bg-admin/90"
          }`}
        >
          {cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </span>
        {note && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Fingerprint size={14} /> {note}
          </span>
        )}
      </div>
    </Link>
  );
}
