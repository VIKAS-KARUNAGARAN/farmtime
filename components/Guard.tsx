"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Role } from "@/lib/data";
import { navState, useStore } from "@/lib/store";

/**
 * Client-side route guard for the prototype.
 * In production, repeat these checks in middleware.ts and in every API route:
 * the browser can be tampered with, the server cannot.
 */
export function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { session, setNotice, log } = useStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const roles = session?.account.roles ?? [];
  const allowed = !!session && roles.includes(role) && (role === "staff" || session.mfaVerified);

  useEffect(() => {
    if (!mounted || allowed) return;
    if (!session) {
      if (navState.signingOut) return;
      router.replace(role === "admin" ? "/admin/login/" : "/staff/login/");
      return;
    }
    if (role === "admin" && roles.includes("admin") && !session.mfaVerified) {
      router.replace("/admin/verify/");
      return;
    }
    if (role === "admin") {
      log({ actor: session.account.name, action: "Blocked admin page request", target: "Insufficient permission", source: "Route guard", level: "security" });
      setNotice({ tone: "warn", text: "The Admin workspace is restricted. Your account has staff access only." });
      router.replace("/staff/");
      return;
    }
    setNotice({ tone: "info", text: "Your account doesn’t include a staff workspace, so we’ve kept you in Admin." });
    router.replace("/admin/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, allowed]);

  if (!mounted || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Checking permissions…
      </div>
    );
  }
  return <>{children}</>;
}
