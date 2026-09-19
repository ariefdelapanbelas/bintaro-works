import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Deps } from "@/core/repo/types";
import { scryptHasher } from "./password";
import { PrismaRepo } from "./prisma-repo";

import { MemoryRepo } from "@/core/repo/memory";
import { seedDemo } from "@/core/seed/demo";

// Singleton PrismaClient agar hot-reload dev tidak membuat koneksi berlebih.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  cachedDeps?: Deps;
  memPromise?: Promise<Deps>;
};

/** Connection string runtime. Mendukung nama variabel dari integrasi Vercel (Neon / Prisma Postgres). */
export function runtimeDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  if (!url) return undefined;
  // Di lingkungan serverless Vercel, localhost / 127.0.0.1 tidak dapat dijangkau.
  if (process.env.VERCEL === "1" && (url.includes("localhost") || url.includes("127.0.0.1"))) {
    return undefined;
  }
  return url;
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

export async function getDeps(): Promise<Deps> {
  const dbUrl = runtimeDatabaseUrl();
  if (dbUrl) {
    globalForPrisma.cachedDeps ??= { db: new PrismaRepo(getPrisma()), hasher: scryptHasher, now: () => new Date() };
    return globalForPrisma.cachedDeps;
  }

  // Fallback demo in-memory jika DATABASE_URL belum diatur di serverless / preview Vercel
  if (globalForPrisma.cachedDeps) return globalForPrisma.cachedDeps;
  if (globalForPrisma.memPromise) return globalForPrisma.memPromise;

  globalForPrisma.memPromise = (async () => {
    console.warn("[bwos] DATABASE_URL belum diatur — mengaktifkan in-memory demo repository untuk preview.");
    const memDb = new MemoryRepo();
    await seedDemo(memDb, scryptHasher, new Date());
    const deps: Deps = { db: memDb, hasher: scryptHasher, now: () => new Date() };
    globalForPrisma.cachedDeps = deps;
    return deps;
  })();

  return globalForPrisma.memPromise;
}
