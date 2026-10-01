"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Fetches a GET endpoint. `reload()` refetches without clearing the current data. */
export function useApi<T>(path: string | null, { poll }: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    try {
      const d = await api<T>(path, { signal: c.signal });
      setData(d);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!poll) return;
    const t = setInterval(load, poll);
    return () => clearInterval(t);
  }, [poll, load]);

  return { data, error, loading, reload: load };
}
