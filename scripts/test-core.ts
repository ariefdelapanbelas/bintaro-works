// Uji end-to-end logika bisnis + API router memakai repository in-memory.
// Jalankan: npm test   (tidak membutuhkan database)
import assert from "node:assert/strict";
import { handleApi, type ApiRequest, type Method } from "../src/core/api/router";
import { MemoryRepo } from "../src/core/repo/memory";
import { createWebHasher } from "../src/core/repo/web-hasher";
import type { Deps, GlobalRepo } from "../src/core/repo/types";
import { PrismaRepo } from "../src/server/prisma-repo";
import { createFakePrisma } from "./fake-prisma";
import { DEMO_PASSWORD, seedDemo } from "../src/core/seed/demo";
import type { SessionPayload } from "../src/core/services/auth";
import type { SocialGateway, SocialProfile } from "../src/core/services/oauth";
import type { SocialProvider } from "../src/core/domain/types";

import { fileURLToPath } from "node:url";

const realNow = new Date(process.env.TEST_NOW ?? Date.now());
const clock = { now: new Date(realNow) };
// REPO=prisma → uji PrismaRepo (adapter produksi) di atas PrismaClient tiruan yang
// memvalidasi setiap query terhadap prisma/schema.prisma.
const usePrismaRepo = process.env.REPO === "prisma" || process.argv.includes("--prisma");
const db: GlobalRepo = usePrismaRepo
  ? new PrismaRepo(createFakePrisma(fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url))).client as never)
  : new MemoryRepo(undefined, () => new Date(clock.now));
// Gateway login sosial tiruan: "code" berisi profil yang ingin disimulasikan,
// sehingga aturan penautan akun bisa diuji tanpa jaringan.
const socialEnabled: SocialProvider[] = ["GOOGLE", "FACEBOOK", "TIKTOK"];
const testGateway: SocialGateway = {
  mode: "redirect",
  enabled: () => [...socialEnabled],
  async profileFromCode(provider, { code }): Promise<SocialProfile> {
    const p = JSON.parse(code) as { id?: string; email?: string; emailVerified?: boolean; name?: string };
    return {
      providerUserId: p.id ?? `${provider.toLowerCase()}-${p.email ?? "anon"}`,
      email: p.email ?? null,
      emailVerified: p.emailVerified ?? Boolean(p.email),
      name: p.name ?? null,
      avatarUrl: null,
    };
  },
};
const social = (p: { id?: string; email?: string; emailVerified?: boolean; name?: string }) => JSON.stringify(p);
const deps: Deps = { db, hasher: createWebHasher(1000), now: () => new Date(clock.now), social: testGateway };

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

function client(session: SessionPayload | null = null, ip?: string) {
  const c = {
    session,
    async call(method: Method, path: string, body?: unknown, query: Record<string, string> = {}) {
      const req: ApiRequest = { method, path, query, ip, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)), session: c.session };
      const res = await handleApi(deps, req, (e) => console.error("UNEXPECTED", e));
      if (res.setSession !== undefined) c.session = res.setSession;
      return { status: res.status, body: JSON.parse(JSON.stringify(res.body ?? null)) };
    },
  };
  return c;
}

async function loginAs(email: string, password = DEMO_PASSWORD) {
  const c = client();
  const r = await c.call("POST", "/auth/login", { email, password });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  return c;
}

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const H = 3_600_000;

async function main() {
  console.log(`Seed data demo (now = ${realNow.toISOString()})…`);
  const t0 = Date.now();
  await seedDemo(db, deps.hasher, realNow, clock);
  clock.now = new Date(realNow);
  console.log(`  [repo: ${usePrismaRepo ? "PrismaRepo + fake client" : "MemoryRepo"}] seed selesai dalam ${Date.now() - t0} ms\n`);

  const owner = await loginAs("owner@bintaroworks.id");
  const finance = await loginAs("finance@bintaroworks.id");
  const staff = await loginAs("staf@bintaroworks.id");
  const portal = await loginAs("budi@kopikita.id");

  console.log("Autentikasi & akses");
  await test("login salah ditolak 401", async () => {
    const r = await client().call("POST", "/auth/login", { email: "owner@bintaroworks.id", password: "salah" });
    assert.equal(r.status, 401);
  });
  await test("tanpa sesi → 401", async () => {
    assert.equal((await client().call("GET", "/dashboard")).status, 401);
  });
  await test("/auth/me mengembalikan role & permission", async () => {
    const r = await owner.call("GET", "/auth/me");
    assert.equal(r.body.role, "OWNER");
    assert.ok(r.body.permissions.includes("team.manage"));
  });
  await test("pelanggan portal diarahkan ke /portal", async () => {
    const r = await client().call("POST", "/auth/login", { email: "budi@kopikita.id", password: DEMO_PASSWORD });
    assert.equal(r.body.redirectTo, "/portal");
  });
  await test("RBAC: Finance tidak bisa membuat lead (403)", async () => {
    assert.equal((await finance.call("POST", "/leads", { name: "Tes" })).status, 403);
  });
  await test("RBAC: Staf tidak bisa mencatat pembayaran (403)", async () => {
    const inv = (await owner.call("GET", "/invoices", undefined, { status: "OVERDUE" })).body[0];
    assert.equal((await staff.call("POST", `/invoices/${inv.id}/payments`, { amount: 1000, paidAt: iso(realNow) })).status, 403);
  });
  await test("RBAC: pelanggan portal tidak bisa membuka dashboard admin (403)", async () => {
    assert.equal((await portal.call("GET", "/dashboard")).status, 403);
  });

  console.log("\nDashboard");
  await test("KPI terisi dan konsisten", async () => {
    const r = await owner.call("GET", "/dashboard");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const k = r.body.kpis;
    assert.ok(k.mrr > 0, "MRR > 0");
    assert.ok(k.occupancyRate > 0 && k.occupancyRate <= 100, `occupancy ${k.occupancyRate}`);
    assert.ok(k.outstanding > 0, "ada piutang");
    assert.ok(k.overdueCount > 0, "ada invoice overdue");
    assert.equal(r.body.revenueByMonth.length, 6);
    assert.ok(r.body.revenueByMonth.filter((x: { amount: number }) => x.amount > 0).length >= 5, "pendapatan tercatat tiap bulan");
    assert.ok(r.body.revenueByCategory.length >= 4, "komposisi lini bisnis");
    assert.ok(r.body.expiringContracts.length >= 1, "ada kontrak segera berakhir");
    console.log(`    MRR ${k.mrr.toLocaleString("id-ID")} · okupansi ${k.occupancyRate}% · piutang ${k.outstanding.toLocaleString("id-ID")} · overdue ${k.overdueCount}`);
  });

  console.log("\nCRM");
  let leadId = "";
  await test("buat lead, pindah tahap, catat aktivitas", async () => {
    const r = await staff.call("POST", "/leads", { name: "Hana Lestari", company: "PT Hana Digital", email: "hana@hana.id", source: "WHATSAPP", interest: "PRIVATE_OFFICE", expectedValue: 102000000 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    leadId = r.body.id;
    assert.equal((await staff.call("POST", `/leads/${leadId}/stage`, { stage: "SITE_VISIT" })).status, 201);
    assert.equal((await staff.call("POST", `/leads/${leadId}/activities`, { type: "CALL", content: "Jadwal survei Kamis" })).status, 201);
    const d = await staff.call("GET", `/leads/${leadId}`);
    assert.equal(d.body.stage, "SITE_VISIT");
    assert.equal(d.body.activities.length, 2);
  });
  await test("validasi: nama lead wajib (422)", async () => {
    const r = await staff.call("POST", "/leads", { name: "" });
    assert.equal(r.status, 422);
    assert.ok(r.body.error.fields.name);
  });
  let newCustomerId = "";
  await test("konversi lead → pelanggan, tidak bisa dua kali", async () => {
    const r = await staff.call("POST", `/leads/${leadId}/convert`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    newCustomerId = r.body.customer.id;
    assert.equal(r.body.lead.stage, "WON");
    assert.equal((await staff.call("POST", `/leads/${leadId}/convert`)).status, 409);
  });

  console.log("\nKontrak & ruang");
  let contractId = "";
  const spaces = (await owner.call("GET", "/spaces")).body as { id: string; code: string; status: string }[];
  const po210 = spaces.find((x) => x.code === "PO-210")!;
  const po208 = spaces.find((x) => x.code === "PO-208")!;
  const mr01 = spaces.find((x) => x.code === "MR-01")!;
  await test("kontrak di ruang yang sudah terisi ditolak saat aktivasi (409)", async () => {
    const c = await owner.call("POST", "/contracts", {
      customerId: newCustomerId, spaceId: po208.id, category: "PRIVATE_OFFICE", title: "Bentrok", startDate: ymd(realNow),
      endDate: ymd(new Date(realNow.getTime() + 180 * 86400000)), monthlyFee: 1000000, billingCycle: "MONTHLY",
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const a = await owner.call("POST", `/contracts/${c.body.id}/activate`);
    assert.equal(a.status, 409, JSON.stringify(a.body));
    assert.equal((await owner.call("DELETE", `/contracts/${c.body.id}`)).status, 200);
  });
  await test("aktivasi kontrak → ruang OCCUPIED + invoice pertama (sewa + deposit + PPN)", async () => {
    const start = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth(), 1));
    const c = await owner.call("POST", "/contracts", {
      customerId: newCustomerId, spaceId: po210.id, category: "PRIVATE_OFFICE", title: "PO-210 untuk PT Hana Digital",
      startDate: ymd(start), endDate: ymd(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 12, 0))),
      monthlyFee: 6000000, deposit: 6000000, billingCycle: "QUARTERLY",
    });
    contractId = c.body.id;
    const a = await owner.call("POST", `/contracts/${contractId}/activate`);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const inv = a.body.invoice;
    assert.ok(inv, "invoice dibuat");
    assert.equal(inv.subtotal, 6000000 * 3 + 6000000, "3 bulan + deposit");
    assert.equal(inv.taxAmount, Math.round(inv.subtotal * 0.11));
    assert.equal(inv.total, inv.subtotal + inv.taxAmount);
    const sp = await owner.call("GET", `/spaces/${po210.id}`);
    assert.equal(sp.body.status, "OCCUPIED");
  });
  await test("generate tagihan berulang bersifat idempoten", async () => {
    const body = { year: realNow.getUTCFullYear(), month: realNow.getUTCMonth() + 1 };
    const first = await finance.call("POST", "/invoices/generate", body);
    const second = await finance.call("POST", "/invoices/generate", body);
    assert.equal(first.status, 201);
    assert.equal(second.body.created, 0, "tidak ada duplikat");
  });
  await test("terminasi kontrak → ruang kembali AVAILABLE", async () => {
    const r = await owner.call("POST", `/contracts/${contractId}/terminate`, { date: ymd(realNow), reason: "Tes" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await owner.call("GET", `/spaces/${po210.id}`)).body.status, "AVAILABLE");
  });

  console.log("\nBooking");
  const day = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth(), realNow.getUTCDate() + 5));
  const at = (h: number) => new Date(day.getTime() + (h - 7) * H);
  let bookingId = "";
  await test("booking + invoice otomatis (tarif per jam)", async () => {
    const r = await staff.call("POST", "/bookings", { spaceId: mr01.id, customerId: newCustomerId, title: "Rapat tes", startAt: iso(at(7)), endAt: iso(at(8.5)), attendees: 4, createInvoice: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    bookingId = r.body.id;
    assert.equal(r.body.amount, 225000, "1,5 jam × 150.000");
    assert.ok(r.body.invoiceId);
  });
  await test("jadwal bentrok ditolak (409)", async () => {
    const r = await staff.call("POST", "/bookings", { spaceId: mr01.id, guestName: "Tamu", title: "Bentrok", startAt: iso(at(8)), endAt: iso(at(9)) });
    assert.equal(r.status, 409, JSON.stringify(r.body));
  });
  await test("melebihi kapasitas ditolak (422)", async () => {
    const r = await staff.call("POST", "/bookings", { spaceId: mr01.id, guestName: "Tamu", title: "Ramai", startAt: iso(at(5)), endAt: iso(at(6)), attendees: 50 });
    assert.equal(r.status, 422);
  });
  await test("batal booking → invoice belum dibayar di-VOID", async () => {
    const r = await staff.call("POST", `/bookings/${bookingId}/cancel`);
    assert.equal(r.status, 201);
    const inv = await owner.call("GET", `/invoices/${r.body.invoiceId}`);
    assert.equal(inv.body.status, "VOID");
  });

  console.log("\nTagihan & pembayaran");
  let invId = "";
  await test("invoice manual: draft → edit → terbit", async () => {
    const r = await finance.call("POST", "/invoices", {
      customerId: newCustomerId, issueDate: ymd(realNow), dueDate: ymd(new Date(realNow.getTime() + 7 * 86400000)),
      items: [{ description: "Cetak A4", quantity: 100, unitPrice: 2000 }], discount: 0,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    invId = r.body.id;
    assert.equal(r.body.status, "DRAFT");
    const u = await finance.call("PATCH", `/invoices/${invId}`, { items: [{ description: "Cetak A4", quantity: 200, unitPrice: 2000 }], discount: 10000 });
    assert.equal(u.body.subtotal, 400000);
    assert.equal(u.body.total, 390000 + Math.round(390000 * 0.11));
    assert.equal((await finance.call("POST", `/invoices/${invId}/send`)).body.status, "SENT");
    assert.equal((await finance.call("PATCH", `/invoices/${invId}`, { discount: 0 })).status, 409, "terbit tidak bisa diedit");
  });
  await test("pembayaran melebihi sisa ditolak; parsial → lunas", async () => {
    const inv = (await finance.call("GET", `/invoices/${invId}`)).body;
    assert.equal((await finance.call("POST", `/invoices/${invId}/payments`, { amount: inv.total + 1, paidAt: iso(realNow) })).status, 422);
    const p1 = await finance.call("POST", `/invoices/${invId}/payments`, { amount: 100000, method: "QRIS", paidAt: iso(realNow) });
    assert.equal(p1.body.invoice.status, "PARTIAL");
    const p2 = await finance.call("POST", `/invoices/${invId}/payments`, { amount: inv.total - 100000, paidAt: iso(realNow) });
    assert.equal(p2.body.invoice.status, "PAID");
    assert.equal((await finance.call("POST", `/invoices/${invId}/void`)).status, 409, "tidak bisa void setelah dibayar");
    const del = await finance.call("DELETE", `/payments/${p2.body.payment.id}`);
    assert.equal(del.body.status, "PARTIAL", "hapus pembayaran mengembalikan status");
  });

  console.log("\nPortal pelanggan");
  await test("overview hanya data milik pelanggan sendiri", async () => {
    const r = await portal.call("GET", "/portal/overview");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.customer.name, "PT Kopi Kita Nusantara");
    assert.ok(r.body.contracts.length >= 1);
    const custIds = new Set(r.body.invoices.map((i: { customerId: string }) => i.customerId));
    assert.equal(custIds.size, 1);
  });
  await test("pelanggan tidak bisa membuka invoice pelanggan lain (404)", async () => {
    const other = (await owner.call("GET", "/invoices")).body.find((i: { customerName: string; status: string }) => i.customerName !== "PT Kopi Kita Nusantara" && i.status !== "DRAFT");
    assert.equal((await portal.call("GET", `/portal/invoices/${other.id}`)).status, 404);
  });
  await test("booking dari portal + batal", async () => {
    const ps = (await portal.call("GET", "/portal/spaces")).body;
    const room = ps.find((x: { code: string }) => x.code === "MR-02");
    const far = (h: number) => new Date(at(h).getTime() + 30 * 86_400_000);
    const b = await portal.call("POST", "/portal/bookings", { spaceId: room.id, title: "Meeting portal", startAt: iso(far(15)), endAt: iso(far(16)), attendees: 2 });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.source, "PORTAL");
    const av = await portal.call("GET", "/portal/availability", undefined, { spaceId: room.id, date: ymd(new Date(day.getTime() + 30 * 86_400_000)) });
    assert.ok(av.body.some((x: { id: string }) => x.id === b.body.id));
    assert.equal((await portal.call("POST", `/portal/bookings/${b.body.id}/cancel`)).status, 201);
  });
  await test("portal: booking di masa lalu ditolak", async () => {
    const ps = (await portal.call("GET", "/portal/spaces")).body;
    const r = await portal.call("POST", "/portal/bookings", { spaceId: ps[0].id, title: "Lampau", startAt: iso(new Date(realNow.getTime() - 5 * H)), endAt: iso(new Date(realNow.getTime() - 4 * H)) });
    assert.equal(r.status, 422);
  });
  await test("portal: kirim permintaan layanan → terlihat di admin", async () => {
    const r = await portal.call("POST", "/portal/requests", { category: "Fasilitas", subject: "Lampu pantry mati", description: "Lampu pantry lantai 2 mati", priority: "LOW" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const list = (await staff.call("GET", "/requests")).body;
    assert.ok(list.some((x: { id: string }) => x.id === r.body.id));
  });

  console.log("\nAplikasi pelanggan (publik)");
  const SLUG = "bintaro-works";
  await test("halaman publik menampilkan ruang & harga, tanpa data internal", async () => {
    const r = await client(null, "ip-katalog").call("GET", `/public/${SLUG}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.organization.name.length > 0);
    assert.ok(r.body.rooms.length >= 1, "ada ruang yang bisa dipesan");
    assert.ok(r.body.products.length >= 5, "ada daftar harga layanan");
    assert.ok(r.body.rooms.every((x: { hourlyPrice: number }) => typeof x.hourlyPrice === "number"));
    // tidak boleh membocorkan data internal organisasi
    assert.equal(r.body.organization.id, undefined);
    assert.equal(r.body.customers, undefined);
  });
  await test("slug tidak dikenal → 404", async () => {
    assert.equal((await client(null, "ip-404").call("GET", "/public/tidak-ada-slug")).status, 404);
  });
  await test("halaman publik bisa dimatikan dari Pengaturan", async () => {
    assert.equal((await owner.call("PATCH", "/settings/organization", { publicEnabled: false })).status, 200);
    assert.equal((await client(null, "ip-off").call("GET", `/public/${SLUG}`)).status, 404, "halaman tertutup");
    assert.equal((await client(null, "ip-off").call("POST", `/public/${SLUG}/inquiries`, { name: "Rudi", phone: "0811" })).status, 404);
    assert.equal((await owner.call("PATCH", "/settings/organization", { publicEnabled: true, publicTagline: "Ruang kerja siap pakai", whatsapp: "6281287009900" })).status, 200);
    assert.equal((await client(null, "ip-on").call("GET", `/public/${SLUG}`)).body.organization.tagline, "Ruang kerja siap pakai");
  });
  await test("ketersediaan publik hanya menampilkan jam terpakai (judul disembunyikan)", async () => {
    const pubc = client(null, "ip-avail");
    const info = (await pubc.call("GET", `/public/${SLUG}`)).body;
    const room = info.rooms.find((x: { code: string }) => x.code === "MR-01") ?? info.rooms[0];
    const far = new Date(day.getTime() + 60 * 86_400_000);
    const b = await staff.call("POST", "/bookings", {
      spaceId: room.id,
      guestName: "Tamu internal",
      title: "Rapat internal rahasia",
      startAt: iso(new Date(far.getTime() + 9 * H)),
      endAt: iso(new Date(far.getTime() + 10 * H)),
      attendees: 3,
      notes: null,
    });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const av = await pubc.call("GET", `/public/${SLUG}/availability`, undefined, { spaceId: room.id, date: ymd(far) });
    assert.equal(av.status, 200, JSON.stringify(av.body));
    assert.ok(av.body.length >= 1, "jam terpakai terlihat");
    assert.ok(
      av.body.every((x: Record<string, unknown>) => Object.keys(x).sort().join(",") === "endAt,startAt"),
      `hanya startAt & endAt: ${JSON.stringify(av.body[0])}`,
    );
    assert.equal((await pubc.call("GET", `/public/${SLUG}/availability`, undefined, { spaceId: "tidak-ada", date: ymd(far) })).status, 404);
  });
  await test("form ajukan sewa → lead baru masuk CRM (sumber Website)", async () => {
    const r = await client(null, "ip-inq").call("POST", `/public/${SLUG}/inquiries`, {
      name: "Dimas Prayoga",
      company: "Studio Lentera",
      phone: "081234500111",
      email: "dimas@lentera.id",
      interest: "PRIVATE_OFFICE",
      people: 6,
      startMonth: "Oktober 2026",
      message: "Butuh ruang 6 orang dekat stasiun.",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const leads = (await staff.call("GET", "/leads")).body;
    const lead = leads.find((l: { name: string }) => l.name === "Dimas Prayoga");
    assert.ok(lead, "lead terlihat oleh tim");
    assert.equal(lead.source, "WEBSITE");
    assert.equal(lead.stage, "NEW");
    const detail = (await staff.call("GET", `/leads/${lead.id}`)).body;
    assert.equal(detail.company, "Studio Lentera");
    assert.ok(detail.notes.includes("6 orang"), detail.notes);
    assert.ok(detail.notes.includes("Oktober 2026"), detail.notes);
  });
  await test("rate limit: pengajuan berulang dari IP sama ditolak", async () => {
    const spam = client(null, "ip-spam");
    let blocked = 0;
    for (let i = 0; i < 7; i++) {
      const r = await spam.call("POST", `/public/${SLUG}/inquiries`, { name: `Spam ${i}`, phone: "08000000000" });
      if (r.status === 409) blocked++;
    }
    assert.ok(blocked >= 2, `permintaan berlebih diblokir (blocked=${blocked})`);
    // IP lain tetap bisa mengirim
    assert.equal((await client(null, "ip-lain").call("POST", `/public/${SLUG}/inquiries`, { name: "Nina", phone: "0811111" })).status, 201);
  });
  await test("daftar akun sendiri → langsung bisa booking dari portal", async () => {
    const self = client(null, "ip-daftar");
    const r = await self.call("POST", `/public/${SLUG}/register`, {
      name: "Rani Kusuma",
      company: "Rani Craft",
      email: "rani@ranicraft.id",
      phone: "081299887766",
      password: "rahasia123",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.redirectTo, "/portal");
    assert.equal(self.session?.role, "CUSTOMER");
    const ov = await self.call("GET", "/portal/overview");
    assert.equal(ov.status, 200, JSON.stringify(ov.body));
    assert.equal(ov.body.customer.name, "Rani Craft");
    assert.equal(ov.body.invoices.length, 0, "pelanggan baru belum punya tagihan");
    const ps = (await self.call("GET", "/portal/spaces")).body;
    const room = ps.find((x: { code: string }) => x.code === "MR-02") ?? ps[0];
    const far = new Date(day.getTime() + 75 * 86_400_000);
    const bk = await self.call("POST", "/portal/bookings", {
      spaceId: room.id,
      title: "Trial meeting",
      startAt: iso(new Date(far.getTime() + 13 * H)),
      endAt: iso(new Date(far.getTime() + 14 * H)),
      attendees: 2,
    });
    assert.equal(bk.status, 201, JSON.stringify(bk.body));
    // tim melihat pelanggan baru ini
    const custs = (await staff.call("GET", "/customers")).body;
    assert.ok(custs.some((c: { name: string }) => c.name === "Rani Craft"));
  });
  await test("email yang sudah dipakai tidak bisa mendaftar lagi", async () => {
    const r = await client(null, "ip-dup").call("POST", `/public/${SLUG}/register`, {
      name: "Rani Palsu",
      email: "rani@ranicraft.id",
      phone: "081200000000",
      password: "rahasia123",
    });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error.message, /sudah terdaftar/i);
  });

  console.log("\nKonfirmasi pembayaran pelanggan");
  const OPEN = ["SENT", "PARTIAL", "OVERDUE"];
  await test("pelanggan konfirmasi bayar → tim verifikasi → invoice terbayar", async () => {
    const invs = (await portal.call("GET", "/portal/overview")).body.invoices;
    const target = invs.find((i: { status: string; outstanding: number; confirmation: unknown }) => OPEN.includes(i.status) && i.outstanding > 0 && !i.confirmation);
    assert.ok(target, "ada tagihan yang bisa dikonfirmasi");
    const amount = Math.min(500_000, target.outstanding);
    const sent = await portal.call("POST", `/portal/invoices/${target.id}/confirm-payment`, {
      amount,
      method: "TRANSFER",
      paidAt: ymd(realNow),
      reference: "TRX-99001",
      note: "Sudah transfer via BCA",
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.status, "PENDING");
    // tidak boleh kirim dua kali selagi menunggu
    assert.equal((await portal.call("POST", `/portal/invoices/${target.id}/confirm-payment`, { amount, paidAt: ymd(realNow) })).status, 409);
    // muncul di panel keuangan
    const pending = (await finance.call("GET", "/payment-confirmations", undefined, { status: "PENDING" })).body;
    const row = pending.find((x: { id: string }) => x.id === sent.body.id);
    assert.ok(row, "terlihat oleh finance");
    assert.equal(row.invoiceNumber, target.number);
    assert.equal(row.customerName, "PT Kopi Kita Nusantara");
    // staf operasional tidak boleh memverifikasi
    assert.equal((await staff.call("POST", `/payment-confirmations/${sent.body.id}/accept`, {})).status, 403);
    const before = (await finance.call("GET", `/invoices/${target.id}`)).body.amountPaid;
    const acc = await finance.call("POST", `/payment-confirmations/${sent.body.id}/accept`, { reviewNote: "Dana masuk" });
    assert.equal(acc.status, 201, JSON.stringify(acc.body));
    assert.equal(acc.body.confirmation.status, "ACCEPTED");
    assert.equal(acc.body.invoice.amountPaid, before + amount);
    assert.ok(["PARTIAL", "PAID"].includes(acc.body.invoice.status), acc.body.invoice.status);
    // tidak bisa diproses dua kali
    assert.equal((await finance.call("POST", `/payment-confirmations/${sent.body.id}/accept`, {})).status, 409);
  });
  await test("konfirmasi melebihi sisa tagihan ditolak", async () => {
    const invs = (await portal.call("GET", "/portal/overview")).body.invoices;
    const target = invs.find((i: { status: string; outstanding: number; confirmation: unknown }) => OPEN.includes(i.status) && i.outstanding > 0 && !i.confirmation);
    if (!target) return;
    const r = await portal.call("POST", `/portal/invoices/${target.id}/confirm-payment`, { amount: target.outstanding + 1_000_000, paidAt: ymd(realNow) });
    assert.equal(r.status, 422, JSON.stringify(r.body));
  });
  await test("konfirmasi bisa ditolak dengan catatan, tanpa mengubah tagihan", async () => {
    const invs = (await portal.call("GET", "/portal/overview")).body.invoices;
    const target = invs.find((i: { status: string; outstanding: number; confirmation: unknown }) => OPEN.includes(i.status) && i.outstanding > 0 && !i.confirmation);
    if (!target) return;
    const sent = await portal.call("POST", `/portal/invoices/${target.id}/confirm-payment`, { amount: 100_000, paidAt: ymd(realNow), reference: "SALAH-01" });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const before = (await finance.call("GET", `/invoices/${target.id}`)).body.amountPaid;
    const rej = await finance.call("POST", `/payment-confirmations/${sent.body.id}/reject`, { reviewNote: "Bukti transfer tidak terbaca" });
    assert.equal(rej.status, 201, JSON.stringify(rej.body));
    assert.equal(rej.body.status ?? rej.body.confirmation?.status, "REJECTED");
    assert.equal((await finance.call("GET", `/invoices/${target.id}`)).body.amountPaid, before, "tagihan tidak berubah");
    // setelah ditolak, pelanggan boleh mengirim ulang
    assert.equal((await portal.call("POST", `/portal/invoices/${target.id}/confirm-payment`, { amount: 100_000, paidAt: ymd(realNow) })).status, 201);
  });

  console.log("\nLogin dengan akun sosial");
  const oauth = (provider: string) => `/auth/oauth/${provider}/callback`;
  await test("daftar penyedia yang aktif", async () => {
    const r = await client().call("GET", "/auth/providers");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      r.body.providers.map((p: { id: string }) => p.id).sort(),
      ["FACEBOOK", "GOOGLE", "TIKTOK"],
    );
    assert.equal(r.body.providers.find((p: { id: string }) => p.id === "TIKTOK").canSignUp, false, "TikTok tidak bisa dipakai mendaftar");
  });
  await test("Google dengan email terverifikasi → langsung disatukan dengan akun lama", async () => {
    const c = client(null, "ip-g1");
    const r = await c.call("POST", oauth("google"), { code: social({ id: "g-budi", email: "budi@kopikita.id", name: "Budi Santoso" }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.redirectTo, "/portal");
    assert.equal(r.body.isNew, false, "bukan akun baru — ditautkan ke akun lama");
    assert.equal(c.session?.role, "CUSTOMER");
    const me = await c.call("GET", "/auth/me");
    assert.equal(me.body.user.email, "budi@kopikita.id");
    const acc = await c.call("GET", "/auth/social-accounts");
    assert.equal(acc.body.accounts.length, 1);
    assert.equal(acc.body.accounts[0].provider, "GOOGLE");
    assert.equal(acc.body.passwordSet, true, "akun lama tetap punya kata sandi");
  });
  await test("masuk kedua kali memakai tautan yang sama (tidak menggandakan akun)", async () => {
    const c = client(null, "ip-g2");
    const r = await c.call("POST", oauth("google"), { code: social({ id: "g-budi", email: "budi@kopikita.id" }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const acc = await c.call("GET", "/auth/social-accounts");
    assert.equal(acc.body.accounts.length, 1, "tetap satu tautan");
    // kata sandi lama masih bisa dipakai
    assert.equal((await client().call("POST", "/auth/login", { email: "budi@kopikita.id", password: DEMO_PASSWORD })).status, 200);
  });
  await test("akun tim internal ditolak (harus email + kata sandi)", async () => {
    const r = await client(null, "ip-g3").call("POST", oauth("google"), { code: social({ id: "g-owner", email: "owner@bintaroworks.id", name: "Arief" }) });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error.message, /tim internal/i);
  });
  await test("email belum terverifikasi tidak disatukan otomatis", async () => {
    const r = await client(null, "ip-g4").call("POST", oauth("google"), {
      code: social({ id: "g-palsu", email: "budi@kopikita.id", emailVerified: false }),
    });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error.message, /belum ditautkan/i);
  });
  await test("email asing tanpa halaman pemesanan → diminta mendaftar dulu", async () => {
    const r = await client(null, "ip-g5").call("POST", oauth("google"), { code: social({ id: "g-baru", email: "orang.baru@gmail.com" }) });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error.message, /belum terdaftar/i);
  });
  await test("daftar lewat Google dari aplikasi pelanggan → akun pelanggan baru", async () => {
    const c = client(null, "ip-g6");
    const r = await c.call("POST", oauth("google"), {
      code: social({ id: "g-sinta", email: "sinta@gmail.com", name: "Sinta Dewi" }),
      orgSlug: SLUG,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.isNew, true);
    const ov = await c.call("GET", "/portal/overview");
    assert.equal(ov.status, 200, JSON.stringify(ov.body));
    assert.equal(ov.body.customer.name, "Sinta Dewi");
    const acc = await c.call("GET", "/auth/social-accounts");
    assert.equal(acc.body.passwordSet, false, "akun sosial belum punya kata sandi");
    // terlihat oleh tim
    assert.ok(((await staff.call("GET", "/customers")).body as { name: string }[]).some((x) => x.name === "Sinta Dewi"));
  });
  await test("akun sosial tanpa kata sandi: tidak bisa lepas tautan terakhir, bisa setelah menyetel sandi", async () => {
    const c = client(null, "ip-g7");
    await c.call("POST", oauth("google"), { code: social({ id: "g-sinta", email: "sinta@gmail.com" }) });
    const acc = (await c.call("GET", "/auth/social-accounts")).body;
    const only = acc.accounts[0];
    const gagal = await c.call("DELETE", `/auth/social-accounts/${only.id}`);
    assert.equal(gagal.status, 409, JSON.stringify(gagal.body));
    assert.match(gagal.body.error.message, /kata sandi/i);
    assert.equal((await c.call("POST", "/auth/password/set", { newPassword: "sinta12345" })).status, 200);
    assert.equal((await c.call("POST", "/auth/password/set", { newPassword: "lagi12345" })).status, 409, "hanya sekali");
    assert.equal((await c.call("DELETE", `/auth/social-accounts/${only.id}`)).status, 200);
    // sekarang bisa masuk dengan kata sandi
    assert.equal((await client().call("POST", "/auth/login", { email: "sinta@gmail.com", password: "sinta12345" })).status, 200);
  });
  await test("TikTok: tanpa tautan ditolak, setelah ditautkan bisa masuk", async () => {
    const tiktok = social({ id: "tt-budi", name: "budi.kopi" });
    const belum = await client(null, "ip-t1").call("POST", oauth("tiktok"), { code: tiktok });
    assert.equal(belum.status, 409, JSON.stringify(belum.body));
    assert.match(belum.body.error.message, /belum ditautkan/i);
    // tautkan dari portal (pengguna sudah masuk)
    const link = await portal.call("POST", "/auth/social-accounts/tiktok", { code: tiktok });
    assert.equal(link.status, 201, JSON.stringify(link.body));
    assert.equal(link.body.provider, "TIKTOK");
    assert.equal((await portal.call("POST", "/auth/social-accounts/tiktok", { code: social({ id: "tt-lain" }) })).status, 409, "satu penyedia satu tautan");
    // sekarang TikTok bisa dipakai masuk
    const c = client(null, "ip-t2");
    const masuk = await c.call("POST", oauth("tiktok"), { code: tiktok });
    assert.equal(masuk.status, 200, JSON.stringify(masuk.body));
    assert.equal(masuk.body.redirectTo, "/portal");
  });
  await test("akun sosial milik orang lain tidak bisa direbut", async () => {
    const c = client(null, "ip-g8");
    await c.call("POST", oauth("google"), { code: social({ id: "g-rina", email: "rina@gmail.com", name: "Rina" }), orgSlug: SLUG });
    const r = await c.call("POST", "/auth/social-accounts/google", { code: social({ id: "g-budi", email: "budi@kopikita.id" }) });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error.message, /pengguna lain/i);
  });
  await test("penyedia yang tidak diaktifkan ditolak", async () => {
    const idx = socialEnabled.indexOf("FACEBOOK");
    socialEnabled.splice(idx, 1);
    try {
      const r = await client(null, "ip-f1").call("POST", oauth("facebook"), { code: social({ id: "fb-1", email: "x@y.id" }) });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.match(r.body.error.message, /belum diaktifkan/i);
    } finally {
      socialEnabled.splice(idx, 0, "FACEBOOK");
    }
  });
  await test("penyedia tidak dikenal → 404, kode kosong → 422", async () => {
    assert.equal((await client(null, "ip-x1").call("POST", oauth("twitter"), { code: social({ id: "a" }) })).status, 404);
    assert.equal((await client(null, "ip-x2").call("POST", oauth("google"), { code: "" })).status, 422);
  });
  await test("tamu tidak bisa melihat daftar akun tertaut", async () => {
    assert.equal((await client().call("GET", "/auth/social-accounts")).status, 401);
  });

  console.log("\nMulti-tenant");
  await test("tenant baru via signup terisolasi dari data Bintaro Works", async () => {
    const c = client();
    const r = await c.call("POST", "/auth/signup", { organizationName: "Cowork Serpong", name: "Sari", email: "sari@serpong.id", password: "rahasia123" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const leads = (await c.call("GET", "/leads")).body;
    assert.equal(leads.length, 0, "tidak melihat lead tenant lain");
    assert.equal((await c.call("GET", `/leads/${leadId}`)).status, 404, "akses id tenant lain → 404");
    assert.equal((await c.call("PATCH", `/customers/${newCustomerId}`, { name: "Hack" })).status, 404);
    const products = (await c.call("GET", "/products")).body;
    assert.ok(products.length >= 10, "katalog default tersedia");
    const dash = await c.call("GET", "/dashboard");
    assert.equal(dash.status, 200);
    assert.equal(dash.body.kpis.mrr, 0);
  });
  await test("tidak bisa menghapus owner terakhir / diri sendiri", async () => {
    const team = (await owner.call("GET", "/team")).body;
    const self = team.find((m: { isSelf: boolean }) => m.isSelf);
    assert.equal((await owner.call("DELETE", `/team/${self.membershipId}`)).status, 409);
    assert.equal((await owner.call("PATCH", `/team/${self.membershipId}`, { role: "ADMIN" })).status, 409);
  });
  await test("pencarian global", async () => {
    const r = await owner.call("GET", "/search", undefined, { q: "arunika" });
    assert.ok(r.body.length >= 1);
  });
  await test("endpoint tidak dikenal → 404, metode salah → 405", async () => {
    assert.equal((await owner.call("GET", "/tidak-ada")).status, 404);
    assert.equal((await owner.call("PUT" as Method, "/leads")).status, 405);
  });

  console.log(`\n${passed} pengujian lulus ✔`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
