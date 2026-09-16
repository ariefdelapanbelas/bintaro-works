"use client";
// Klien API untuk UI. Transport default memanggil /api (Next.js route handler).
// Demo in-browser mengganti transport agar memanggil router yang sama secara lokal.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export type Transport = (req: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}) => Promise<{ status: number; body: unknown }>;

const fetchTransport: Transport = async ({ method, path, query, body }) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") qs.set(k, v);
  const res = await fetch(`/api${path}${qs.size ? `?${qs}` : ""}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, body: data };
};

let transport: Transport = fetchTransport;
let onUnauthorized: (() => void) | null = null;

export function setTransport(t: Transport) {
  transport = t;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T> {
  let res: { status: number; body: unknown };
  try {
    res = await transport({ method, path, query, body });
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi Anda.");
  }
  if (res.status >= 200 && res.status < 300) return res.body as T;
  const err = (res.body as { error?: { message?: string; code?: string; fields?: Record<string, string> } } | null)?.error;
  if (res.status === 401 && !path.startsWith("/auth/")) onUnauthorized?.();
  throw new ApiError(res.status, err?.message ?? `Permintaan gagal (${res.status})`, err?.code, err?.fields);
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | undefined>) => call<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => call<T>("DELETE", path),
};

// ---- Bus invalidasi: setelah mutasi, semua query yang sedang tampil memuat ulang.
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeInvalidate(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function invalidate() {
  for (const fn of listeners) fn();
}
