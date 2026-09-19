import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Deps } from "@/core/repo/types";
import { scryptHasher } from "./password";
import { PrismaRepo } from "./prisma-repo";
import { createSocialGateway } from "./social";

// Singleton PrismaClient agar hot-reload dev tidak membuat koneksi berlebih.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Connection string runtime. Mendukung nama variabel dari integrasi Vercel (Neon / Prisma Postgres). */
export function runtimeDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
}

function createClient() {
  const connectionString = runtimeDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL belum diatur. Salin .env.example menjadi .env");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Klien dibuat saat pertama dipakai (bukan saat modul dimuat) agar `next build` tidak butuh database. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

let cached: Deps | undefined;
export function getDeps(): Deps {
  cached ??= { db: new PrismaRepo(getPrisma()), hasher: scryptHasher, now: () => new Date(), social: createSocialGateway() };
  return cached;
}
