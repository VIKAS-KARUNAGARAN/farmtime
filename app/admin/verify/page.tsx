"use client";
import Link from "@/lib/nav";
import { useRouter } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Fingerprint, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, NoticeBanner } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Verify() {
  const { ready, session, verifyMfa, notice, setNotice, signOut } = useStore();
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/admin/login/");
    else if (!session.account.roles.includes("admin")) router.replace("/staff/");
    else if (session.mfaVerified) router.replace("/admin/");
    else {
      refs.current[0]?.focus();
      if (!session.mfaEnrolled) {
        api<{ secret: string; qr: string }>("/api/auth/mfa/setup", { method: "POST" })
          .then(setSetup)
          .catch((e) => setSetupError(e.message));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("");
      setDigits([...next, ...Array(6 - next.length).fill("")]);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const d = [...digits];
    d[i] = clean;
    setDigits(d);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const code = digits.join("");
    if (code.length < 6) return setError("Enter all 6 digits.");
    setBusy(true);
    verifyMfa(code).then((r) => {
      if (!r.ok) {
        setBusy(false);
        if (r.next) return router.replace(r.next);
        setError(r.error ?? "Try again.");
        setDigits(Array(6).fill(""));
        refs.current[0]?.focus();
        return;
      }
      setNotice(null);
      router.push(r.next!);
    });
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo tag="Admin" />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <form onSubmit={submit} className="w-full max-w-[420px]">
          {notice && <div className="mb-5"><NoticeBanner tone={notice.tone} text={notice.text} /></div>}
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-admin-soft text-admin">
            <Fingerprint size={22} />
          </span>
          <h1 className="mt-5 text-[1.75rem] font-bold leading-tight">{session.mfaEnrolled ? "Verify it’s you" : "Set up your authenticator"}</h1>
          {session.mfaEnrolled ? (
            <p className="mt-2 text-sm text-muted">
              Enter the 6-digit code from your authenticator app for <span className="font-medium text-fg">{session.account.email}</span>.
            </p>
          ) : (
            <div className="mt-2 text-sm text-muted" data-testid="mfa-setup">
              <p>Admin access needs a second step. Scan this code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the 6-digit code it shows.</p>
              {setupError && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-danger">{setupError}</p>}
              {setup ? (
                <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-surface p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setup.qr} alt="Authenticator QR code" width={132} height={132} className="rounded-md bg-white p-1" />
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-fg">Can’t scan?</p>
                    <p className="mt-1">Enter this key manually:</p>
                    <p className="mt-1 break-all font-mono text-[0.8rem] text-fg" data-testid="text-mfa-secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
                  </div>
                </div>
              ) : (
                !setupError && <p className="mt-4 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Preparing your code…</p>
              )}
            </div>
          )}
          <div className="mt-6 flex gap-2" onPaste={(e) => { e.preventDefault(); setAt(0, e.clipboardData.getData("text")); }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                value={d}
                inputMode="numeric"
                maxLength={6}
                aria-label={`Digit ${i + 1}`}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
                className="tabular h-14 w-full rounded-lg border border-line bg-surface text-center font-mono text-xl focus:border-admin focus:outline-none focus:ring-2 focus:ring-admin/25"
                data-testid={`input-mfa-${i}`}
              />
            ))}
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" variant="admin" size="lg" className="mt-5 w-full" disabled={busy} data-testid="button-verify">
            {busy && <Loader2 size={16} className="animate-spin" />} {busy ? "Verifying…" : "Verify and continue"}
          </Button>
          <Link href="/" onClick={() => signOut()} className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft size={16} /> Cancel and sign out
          </Link>
        </form>
      </div>
    </div>
  );
}
