"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, invalidate, subscribeInvalidate } from "./api";

/** Ambil data GET; tetap menampilkan data lama saat memuat ulang (tanpa kedip). */
export function useApi<T>(path: string | null, query?: Record<string, string | undefined>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : null;
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await api.get<T>(path, query);
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => subscribeInvalidate(load), [load]);

  return { data, error, loading, reload: load, setData };
}

/** Jalankan mutasi dengan status loading, error per kolom, dan invalidasi otomatis. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        invalidate();
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, String(e));
        setError(err);
        throw err;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );
  return { run, pending, error, setError };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
