import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Deps } from "@/core/repo/types";
import { scryptHasher } from "./password";
import { PrismaRepo } from "./prisma-repo";

// Singleton PrismaClient agar hot-reload dev tidak membuat koneksi berlebih.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diatur. Salin .env.example menjadi .env");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const deps: Deps = {
  db: new PrismaRepo(prisma),
  hasher: scryptHasher,
  now: () => new Date(),
};
