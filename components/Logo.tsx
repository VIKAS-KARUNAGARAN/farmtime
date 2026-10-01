export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M16 29V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.5c2 1.8 2 5 0 7-2-2-2-5.2 0-7Z" fill="currentColor" />
      <path d="M16 14c-.4-3-2.6-4.9-5.6-5 .3 3 2.5 5 5.6 5Z" fill="currentColor" />
      <path d="M16 14c.4-3 2.6-4.9 5.6-5-.3 3-2.5 5-5.6 5Z" fill="currentColor" />
      <path d="M16 19.5c-.4-3-2.6-4.9-5.6-5 .3 3 2.5 5 5.6 5Z" fill="currentColor" opacity=".85" />
      <path d="M16 19.5c.4-3 2.6-4.9 5.6-5-.3 3-2.5 5-5.6 5Z" fill="currentColor" opacity=".85" />
      <path d="M16 25c-.4-3-2.6-4.9-5.6-5 .3 3 2.5 5 5.6 5Z" fill="currentColor" opacity=".7" />
      <path d="M16 25c.4-3 2.6-4.9 5.6-5-.3 3-2.5 5-5.6 5Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}

export function Logo({ tag }: { tag?: string }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="FarmTime">
      <LogoMark className="h-7 w-7 text-wheat" />
      <span className="font-display text-[1.2rem] font-bold tracking-tight text-fg">FarmTime</span>
      {tag && (
        <span className="ml-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">{tag}</span>
      )}
    </span>
  );
}
