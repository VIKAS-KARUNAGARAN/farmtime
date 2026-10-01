"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Info, TriangleAlert, X } from "lucide-react";

type Variant = "primary" | "staff" | "admin" | "ghost" | "outline" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg/90",
  staff: "bg-staff text-white hover:bg-staff/90 dark:text-bg",
  admin: "bg-admin text-white hover:bg-admin/90 dark:text-bg",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  outline: "border border-line bg-surface text-fg hover:bg-surface-2",
  danger: "border border-danger/30 text-danger hover:bg-danger/10",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-5 text-[15px]" : "h-10 px-4 text-sm";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,transform,opacity] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${s} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const tones = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-2 text-muted",
  staff: "bg-staff-soft text-staff",
  admin: "bg-admin-soft text-admin",
  wheat: "bg-wheat-soft text-wheat",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export function statusTone(s: string): Tone {
  if (["Approved", "Active", "Online", "On site", "Paid"].includes(s)) return "ok";
  if (["Pending", "Onboarding", "Queried"].includes(s)) return "warn";
  if (["Declined", "Offline"].includes(s)) return "danger";
  return "neutral";
}

export function Avatar({ initials, tone = "neutral", size = "md" }: { initials: string; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${s} ${tones[tone]}`}>{initials}</span>;
}

export function NoticeBanner({ tone, text, onClose }: { tone: "info" | "warn"; text: string; onClose?: () => void }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div role="status" className={`fade-up flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone === "warn" ? "border-warn/30 bg-warn/10" : "border-wheat/30 bg-wheat-soft"}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${tone === "warn" ? "text-warn" : "text-wheat"}`} />
      <p className="flex-1 text-fg">{text}</p>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="text-muted hover:text-fg">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-1">{eyebrow}</p>}
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`tabular mt-1 font-display text-2xl font-bold ${tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function CardHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h2>
      {action}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="status" className="fade-up fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fg px-4 py-2.5 text-sm text-bg shadow-lift">
      {text}
    </div>
  );
}

/** Skeleton blocks shown while an API request is in flight. */
export function PageLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string }; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 p-6">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
        <TriangleAlert size={16} /> Couldn’t load this page
      </span>
      <p className="text-sm text-muted">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fade-up w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-lift sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
