// Token sesi bertanda tangan HMAC-SHA256 (Web Crypto) — bisa diverifikasi
// di route handler maupun di proxy.ts tanpa library tambahan.
import type { SessionPayload } from "@/core/services/auth";

export const SESSION_COOKIE = "bwos_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let warned = false;

/**
 * Kunci penandatangan sesi.
 * 1) AUTH_SECRET (disarankan, min. 32 karakter)
 * 2) Bila kosong di produksi: diturunkan dari connection string database
 *    (hanya pihak yang memegang kredensial DB yang bisa memalsukan sesi —
 *    pihak itu toh sudah punya akses penuh ke data). Tetap disarankan mengisi AUTH_SECRET.
 * 3) Development: kunci lokal tetap.
 */
async function secret(): Promise<string> {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  if (process.env.NODE_ENV === "production") {
    if (!warned) {
      if (dbUrl) {
        console.warn("[bwos] AUTH_SECRET belum diisi — memakai kunci turunan dari DATABASE_URL. Isi AUTH_SECRET untuk keamanan terbaik.");
      } else {
        console.warn("[bwos] AUTH_SECRET belum diisi — memakai kunci default demo. Isi AUTH_SECRET untuk keamanan terbaik di produksi.");
      }
      warned = true;
    }
    const seedString = dbUrl || "bwos-demo-fallback-secret-production-min-32chars";
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(`bwos-session-v1:${seedString}`));
    return b64url(new Uint8Array(digest));
  }
  return "dev-only-insecure-secret-change-me-please-0123456789";
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(await secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return `${body}.${b64url(await hmac(body))}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  const given = fromB64url(sig);
  if (given.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload & { exp: number };
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: data.uid, oid: data.oid, role: data.role };
  } catch {
    return null;
  }
}

/** `isHttps`: protokol permintaan; COOKIE_SECURE ("true"/"false") bila diisi akan menang. */
export function cookieOptions(isHttps = false) {
  const flag = process.env.COOKIE_SECURE;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: flag === "true" ? true : flag === "false" ? false : isHttps,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
