"use client";
/*
 * Navigation helpers.
 *
 * Normal mode (npm run dev / npm run build): thin wrappers around next/link and
 * next/navigation, so every screen has a real URL such as /admin/roster.
 *
 * Preview mode (NEXT_PUBLIC_HASH_ROUTER=1): the whole site is served from
 * index.html and routes live in the hash, e.g. index.html#/admin/roster/.
 * This lets the static bundle run on hosts that can't serve Next's
 * absolute /_next/ paths or nested folders.
 */
import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

export const HASH_MODE = process.env.NEXT_PUBLIC_HASH_ROUTER === "1";

function norm(p: string) {
  let s = p.split("?")[0] || "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s += "/";
  return s;
}
function readHash() {
  return norm(window.location.hash.replace(/^#/, "") || "/");
}
function setHash(path: string, replace: boolean) {
  const url = "#" + norm(path);
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useHashPath() {
  const [p, setP] = useState("/");
  useEffect(() => {
    const f = () => setP(readHash());
    f();
    window.addEventListener("hashchange", f);
    window.addEventListener("popstate", f);
    return () => {
      window.removeEventListener("hashchange", f);
      window.removeEventListener("popstate", f);
    };
  }, []);
  return p;
}

export function usePathname() {
  const next = useNextPathname();
  const hash = useHashPath();
  return HASH_MODE ? hash : norm(next ?? "/");
}

export function useRouter() {
  const next = useNextRouter();
  if (!HASH_MODE) return next;
  return {
    ...next,
    push: (href: string) => setHash(href, false),
    replace: (href: string) => setHash(href, true),
  };
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children?: ReactNode };

export default function Link({ href, ...rest }: LinkProps) {
  if (HASH_MODE) return <a href={"#" + norm(href)} {...rest} />;
  return <NextLink href={href} {...rest} />;
}
