// Build untuk Vercel / hosting lain:
//   1) prisma generate
//   2) siapkan tabel: migrate deploy (bila ada folder migrasi) atau db push (deploy pertama)
//      — dilewati bila belum ada database, agar build tetap bisa diverifikasi
//   3) next build
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

const hasDb = Boolean(
  process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL,
);

run("npx prisma generate");

if (!hasDb) {
  console.warn("\n⚠  DATABASE_URL belum diatur — langkah migrasi dilewati. Hubungkan database lalu deploy ulang.");
} else {
  const migrationsDir = "prisma/migrations";
  const hasMigrations =
    existsSync(migrationsDir) && readdirSync(migrationsDir, { withFileTypes: true }).some((d) => d.isDirectory() && existsSync(`${migrationsDir}/${d.name}/migration.sql`));
  if (hasMigrations) run("npx prisma migrate deploy");
  else {
    console.log("\nFolder migrasi belum ada — menyinkronkan skema dengan db push (deploy awal).");
    run("npx prisma db push");
  }
}

run("npx next build");
