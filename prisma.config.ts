import "dotenv/config";
import { defineConfig } from "prisma/config";

// URL untuk Prisma CLI (migrate/db push/seed). Utamakan koneksi langsung (non-pooled)
// bila tersedia — nama variabel mengikuti integrasi Neon/Prisma Postgres di Vercel.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL ??
  // placeholder agar `prisma generate` tetap jalan tanpa database (mis. saat CI/build awal)
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
