// Smoke test terhadap server yang SEDANG berjalan (lokal atau produksi).
// Pemakaian:  node scripts/smoke-test.mjs                      → http://localhost:3000
//             BASE_URL=https://app.bintaroworks.id node scripts/smoke-test.mjs
//             SMOKE_EMAIL=... SMOKE_PASSWORD=... (default: akun contoh seed)
//             SMOKE_WRITE=0  → hanya membaca, tidak membuat data uji

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "owner@bintaroworks.id";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "bintaro123";
const WRITE = process.env.SMOKE_WRITE !== "0";

let cookie = "";
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server ${BASE} tidak merespons dalam 90 detik`);
}

console.log(`Smoke test → ${BASE}\n`);
await waitForServer();

await check("GET /api/health", async () => {
  const r = await call("GET", "/api/health");
  expect(r.status === 200 && r.data.ok, `status ${r.status}`);
});
await check("halaman /login tampil", async () => {
  const r = await call("GET", "/login");
  expect(r.status === 200, `status ${r.status}`);
});
await check("halaman terproteksi tanpa login diarahkan ke /login", async () => {
  const r = await call("GET", "/dashboard");
  expect([302, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/login"), `status ${r.status} location ${r.headers.get("location")}`);
});
await check("API tanpa sesi ditolak 401", async () => {
  const r = await call("GET", "/api/dashboard");
  expect(r.status === 401, `status ${r.status}`);
});
await check("login salah ditolak", async () => {
  const r = await call("POST", "/api/auth/login", { email: EMAIL, password: "salah-sekali" });
  expect(r.status === 401, `status ${r.status}`);
  cookie = "";
});
await check(`login ${EMAIL}`, async () => {
  const r = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  expect(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  expect(cookie.startsWith("bwos_session="), "cookie sesi tidak diset");
});
await check("GET /api/auth/me", async () => {
  const r = await call("GET", "/api/auth/me");
  expect(r.status === 200 && r.data.organization?.name, JSON.stringify(r.data));
  console.log(`      organisasi: ${r.data.organization.name} · role: ${r.data.role}`);
});
await check("halaman /dashboard dengan sesi", async () => {
  const r = await call("GET", "/dashboard");
  expect(r.status === 200, `status ${r.status}`);
});
await check("GET /api/dashboard (query agregat ke PostgreSQL)", async () => {
  const r = await call("GET", "/api/dashboard");
  expect(r.status === 200 && r.data.kpis, JSON.stringify(r.data).slice(0, 200));
  console.log(`      MRR ${r.data.kpis.mrr} · okupansi ${r.data.kpis.occupancyRate}% · piutang ${r.data.kpis.outstanding}`);
});
for (const p of ["/api/leads", "/api/customers", "/api/spaces", "/api/contracts", "/api/bookings", "/api/invoices", "/api/products", "/api/audit"]) {
  await check(`GET ${p}`, async () => {
    const r = await call("GET", p);
    expect(r.status === 200 && Array.isArray(r.data), `status ${r.status}: ${JSON.stringify(r.data).slice(0, 160)}`);
  });
}

if (WRITE) {
  let leadId = "";
  await check("tulis: buat lead + pindah tahap + hapus (transaksi)", async () => {
    const c = await call("POST", "/api/leads", { name: "Smoke Test", company: "PT Uji Otomatis", source: "OTHER" });
    expect(c.status === 201, `buat: ${c.status} ${JSON.stringify(c.data)}`);
    leadId = c.data.id;
    const s = await call("POST", `/api/leads/${leadId}/stage`, { stage: "CONTACTED" });
    expect(s.status === 201, `tahap: ${s.status} ${JSON.stringify(s.data)}`);
    const d = await call("DELETE", `/api/leads/${leadId}`);
    expect(d.status === 200, `hapus: ${d.status}`);
  });
  await check("tulis: nomor dokumen atomik (invoice draft lalu void)", async () => {
    const customers = (await call("GET", "/api/customers")).data;
    if (!customers.length) return console.log("      (dilewati: belum ada pelanggan)");
    const today = new Date().toISOString().slice(0, 10);
    const inv = await call("POST", "/api/invoices", { customerId: customers[0].id, issueDate: today, dueDate: today, items: [{ description: "Smoke test", quantity: 1, unitPrice: 1000 }], send: true });
    expect(inv.status === 201 && inv.data.number, `${inv.status} ${JSON.stringify(inv.data)}`);
    const v = await call("POST", `/api/invoices/${inv.data.id}/void`);
    expect(v.status === 201, `void ${v.status}`);
    console.log(`      ${inv.data.number} dibuat lalu dibatalkan`);
  });
}

await check("logout", async () => {
  const r = await call("POST", "/api/auth/logout");
  expect(r.status === 200, `status ${r.status}`);
});

// ---- Aplikasi pelanggan (publik) — harus bisa dibuka tanpa sesi
cookie = "";
const SLUG = process.env.SMOKE_SLUG ?? "bintaro-works";
await check(`GET /api/public/${SLUG} (katalog publik)`, async () => {
  const r = await call("GET", `/api/public/${SLUG}`);
  expect(r.status === 200 && r.data.organization?.name, `status ${r.status}: ${JSON.stringify(r.data).slice(0, 160)}`);
  expect(Array.isArray(r.data.rooms) && Array.isArray(r.data.products), "rooms/products tidak ada");
  expect(r.data.organization.id === undefined, "data internal organisasi bocor");
  console.log(`      ${r.data.rooms.length} ruang · ${r.data.products.length} layanan`);
});
await check("slug publik tidak dikenal → 404", async () => {
  const r = await call("GET", "/api/public/slug-yang-tidak-ada");
  expect(r.status === 404, `status ${r.status}`);
});
await check(`halaman /o/${SLUG} tampil tanpa login`, async () => {
  const r = await call("GET", `/o/${SLUG}`);
  expect(r.status === 200, `status ${r.status} (harus tidak dialihkan ke /login)`);
});
await check("GET /api/auth/providers (login sosial)", async () => {
  const r = await call("GET", "/api/auth/providers");
  expect(r.status === 200 && Array.isArray(r.data.providers), `status ${r.status}: ${JSON.stringify(r.data).slice(0, 160)}`);
  console.log(r.data.providers.length ? `      aktif: ${r.data.providers.map((p) => p.label).join(", ")}` : "      (belum ada penyedia yang dikonfigurasi)");
});
await check("mulai login sosial mengarah ke penyedia (bila dikonfigurasi)", async () => {
  const enabled = (await call("GET", "/api/auth/providers")).data.providers ?? [];
  if (!enabled.length) return console.log("      (dilewati: belum ada penyedia)");
  const p = enabled[0].id.toLowerCase();
  const res = await fetch(`${BASE}/api/auth/oauth/${p}`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  expect([302, 307, 308].includes(res.status), `status ${res.status}`);
  expect(/^https:\/\//.test(loc) && !loc.includes("/login?error"), `location ${loc.slice(0, 120)}`);
  expect((res.headers.get("set-cookie") ?? "").includes("bwos_oauth"), "cookie state OAuth tidak diset");
});
await check("callback tanpa state ditolak (anti-CSRF)", async () => {
  const res = await fetch(`${BASE}/api/auth/oauth/google/callback?code=palsu&state=palsu`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  expect([302, 307, 308].includes(res.status) && loc.includes("error="), `status ${res.status} location ${loc}`);
  expect(!(res.headers.get("set-cookie") ?? "").includes("bwos_session="), "sesi tidak boleh terbentuk");
});
await check("manifest PWA tersedia", async () => {
  const r = await call("GET", "/manifest.webmanifest");
  expect(r.status === 200 && (r.data.name || String(r.data).includes("Bintaro")), `status ${r.status}`);
});

console.log(failures ? `\n${failures} pemeriksaan GAGAL` : "\nSemua pemeriksaan lulus ✔");
process.exit(failures ? 1 : 0);
