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

import { fileURLToPath } from "node:url";

const realNow = new Date(process.env.TEST_NOW ?? Date.now());
const clock = { now: new Date(realNow) };
// REPO=prisma → uji PrismaRepo (adapter produksi) di atas PrismaClient tiruan yang
// memvalidasi setiap query terhadap prisma/schema.prisma.
const usePrismaRepo = process.env.REPO === "prisma" || process.argv.includes("--prisma");
const db: GlobalRepo = usePrismaRepo
  ? new PrismaRepo(createFakePrisma(fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url))).client as never)
  : new MemoryRepo(undefined, () => new Date(clock.now));
const deps: Deps = { db, hasher: createWebHasher(1000), now: () => new Date(clock.now) };

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

function client(session: SessionPayload | null = null) {
  const c = {
    session,
    async call(method: Method, path: string, body?: unknown, query: Record<string, string> = {}) {
      const req: ApiRequest = { method, path, query, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)), session: c.session };
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
