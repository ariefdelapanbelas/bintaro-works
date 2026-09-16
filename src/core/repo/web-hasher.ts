import type { PasswordHasher } from "./types";

// Hasher ringan berbasis Web Crypto (PBKDF2-SHA256) untuk demo in-browser & pengujian.
// Produksi memakai scrypt Node.js (src/server/password.ts).

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function derive(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(bits);
}

export function createWebHasher(iterations = 2_000): PasswordHasher {
  return {
    async hash(password) {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
      return `pbkdf2$${iterations}$${salt}$${await derive(password, salt, iterations)}`;
    },
    async verify(password, stored) {
      const [scheme, iter, salt, hash] = stored.split("$");
      if (scheme !== "pbkdf2" || !salt || !hash) return false;
      const candidate = await derive(password, salt, Number(iter));
      if (candidate.length !== hash.length) return false;
      let diff = 0;
      for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
      return diff === 0;
    },
  };
}
