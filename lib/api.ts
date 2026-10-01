"use client";
/*
 * FarmTime API client.
 *
 * - API base: the preview host rewrites __PORT_4000__ to a proxy URL. Locally it
 *   falls back to NEXT_PUBLIC_API_URL or http://localhost:4000.
 * - Auth: the server sets an HttpOnly cookie, and also returns a session token
 *   that we keep in memory only (never localStorage) and send as a Bearer header.
 *   That keeps things working inside iframes where cookies are blocked.
 */

const PREVIEW_BASE = "__PORT_4000__";
export const API_BASE = PREVIEW_BASE.startsWith("__") ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000" : PREVIEW_BASE;

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Opts = { method?: string; body?: unknown; signal?: AbortSignal; silent401?: boolean };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-Session-Token"] = token; // fallback for proxies that strip Authorization
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, `Can’t reach the FarmTime API at ${API_BASE}. Is the server running?`, "NETWORK");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401 && !opts.silent401) onUnauthorized?.();
    const msg = typeof data.error === "string" ? data.error : `Request failed (${res.status}).`;
    throw new ApiError(res.status, msg, data.code as string | undefined, data);
  }
  return data as T;
}

/** Opens a one-time download link returned by an export endpoint. */
export function openDownload(d: { downloadUrl: string; filename?: string }) {
  // The server answers with Content-Disposition: attachment, so the page stays put.
  const a = document.createElement("a");
  a.href = `${API_BASE}${d.downloadUrl}`;
  if (d.filename) a.download = d.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
