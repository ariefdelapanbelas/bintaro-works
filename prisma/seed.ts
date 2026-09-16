// Seed data contoh Bintaro Works ke PostgreSQL.
// Jalankan: npx prisma db seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDemo, DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/core/seed/demo";
import { scryptHasher } from "../src/server/password";
import { PrismaRepo } from "../src/server/prisma-repo";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const existing = await prisma.organization.findUnique({ where: { slug: "bintaro-works" } });
    if (existing) {
      console.log("Data demo sudah ada (organisasi 'bintaro-works'). Lewati seed.");
      console.log("Untuk mengulang dari awal: npx prisma migrate reset");
      return;
    }
    console.log("Mengisi data contoh Bintaro Works… (±1–2 menit)");
    const t0 = Date.now();
    await seedDemo(new PrismaRepo(prisma), scryptHasher, new Date());
    console.log(`Selesai dalam ${Math.round((Date.now() - t0) / 1000)} detik.\n`);
    console.log("Akun demo (kata sandi: " + DEMO_PASSWORD + "):");
    for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(9)} ${a.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
