import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "@/core/repo/types";
import { createWebHasher } from "@/core/repo/web-hasher";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const legacyWeb = createWebHasher();

/** Hash kata sandi dengan scrypt (bawaan Node.js, tanpa dependensi native). */
export const scryptHasher: PasswordHasher = {
  async hash(password) {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, 64, PARAMS);
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
  },
  async verify(password, stored) {
    if (stored.startsWith("pbkdf2$")) return legacyWeb.verify(password, stored);
    const [scheme, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, "hex");
    const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length, PARAMS);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },
};
