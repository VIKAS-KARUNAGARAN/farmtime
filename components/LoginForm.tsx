"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Fingerprint, Loader2, Lock, ShieldCheck, Clock } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button, NoticeBanner } from "./ui";
import { ACCOUNTS, type Portal } from "@/lib/data";
import { useStore } from "@/lib/store";

const copy = {
  staff: {
    title: "Staff portal",
    heading: "Sign in to start your shift",
    blurb: "Clock in, check your roster and keep track of your hours.",
    other: { href: "/admin/login/", label: "Admin portal" },
    points: ["Clock in and out from any verified station", "See this week’s shifts and weather flags", "Track timesheets and leave"],
  },
  admin: {
    title: "Admin portal",
    heading: "Sign in to the admin workspace",
    blurb: "Manage people, rosters, payroll and station activity.",
    other: { href: "/staff/login/", label: "Staff portal" },
    points: ["Multi-factor verification on every sign-in", "Every change is written to the audit trail", "Staff accounts are redirected, never let in"],
  },
};

export function LoginForm({ portal }: { portal: Portal }) {
  const c = copy[portal];
  const staff = portal === "staff";
  const { signIn } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    // Simulated network round-trip to the auth server.
    setTimeout(() => {
      const r = signIn(portal, email, password);
      if (!r.ok) {
        setBusy(false);
        setError(r.error);
        setLocked(!!r.locked);
        return;
      }
      router.push(r.next);
    }, 550);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        className={`relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex ${
          staff ? "bg-[hsl(150_40%_20%)] dark:bg-[hsl(150_30%_12%)]" : "bg-[hsl(212_42%_16%)] dark:bg-[hsl(212_32%_10%)]"
        }`}
      >
        <LogoMark className="pointer-events-none absolute -bottom-16 -right-20 h-[420px] w-[420px] text-white/[0.05]" />
        <Link href="/" className="relative inline-flex items-center gap-2 [&_span]:text-white">
          <Logo />
        </Link>
        <div className="relative max-w-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
            {staff ? <Clock size={13} /> : <ShieldCheck size={13} />} {c.title}
          </span>
          <p className="mt-5 font-display text-[2.25rem] font-bold leading-[1.08]">{c.blurb}</p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {c.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(38_80%_62%)]" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Riverbend Farm · FarmTime</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft size={16} /> All entrances
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[400px]">
            <div className="lg:hidden">
              <Logo tag={staff ? "Staff" : "Admin"} />
            </div>
            <p className={`label mt-8 lg:mt-0 ${staff ? "!text-staff" : "!text-admin"}`}>{c.title}</p>
            <h1 className="mt-2 text-[1.75rem] font-bold leading-tight">{c.heading}</h1>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Work email</label>
                <input id="email" type="email" autoComplete="username" className="input" placeholder="name@farmtime.au" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" disabled={locked} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium">Password</label>
                  <button type="button" onClick={() => setReset(true)} className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" disabled={locked} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-fg">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              {reset && <NoticeBanner tone="info" text="If that email belongs to an account, a reset link will be sent. In this demo no email is sent." onClose={() => setReset(false)} />}

              <Button type="submit" variant={staff ? "staff" : "admin"} size="lg" className="w-full" disabled={busy || locked} data-testid="button-sign-in">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {busy ? "Checking…" : "Sign in"}
              </Button>
              {!staff && (
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <Fingerprint size={13} /> You’ll be asked for a one-time code next.
                </p>
              )}
            </form>

            <p className="mt-6 text-sm text-muted">
              Not {staff ? "staff" : "an admin"}?{" "}
              <Link href={c.other.href} className="font-medium text-fg underline-offset-2 hover:underline">Go to the {c.other.label}</Link>
            </p>

            <div className="mt-8 rounded-xl border border-dashed border-line p-4">
              <p className="text-xs font-medium text-fg">Demo accounts</p>
              <p className="mt-0.5 text-xs text-muted">Try each one through either entrance to see the permission redirect.</p>
              <div className="mt-3 space-y-1.5">
                {ACCOUNTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setEmail(a.email); setPassword(a.password); setError(null); }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-surface-2"
                    data-testid={`button-demo-${a.id}`}
                  >
                    <span className="font-mono text-fg">{a.email}</span>
                    <span className="text-muted">{a.roles.length > 1 ? "Staff + admin" : a.roles[0] === "admin" ? "Admin" : "Staff"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
