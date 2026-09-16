// Uji E2E di browser (Playwright/Chromium) terhadap demo/dist/index.html.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.env.SHOTS ?? resolve(root, "demo/shots");
mkdirSync(shots, { recursive: true });
const url = `file://${resolve(root, "demo/dist/index.html")}`;

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && !m.text().includes("ERR_TUNNEL") && !m.text().includes("net::ERR") && errors.push(`console: ${m.text()}`));

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `${shots}/FAIL-${name.replace(/\W+/g, "_")}.png` });
    errors.push(`${name}: ${e.message.split("\n")[0]}`);
  }
};
const go = async (path) => {
  await page.evaluate((p) => (window.location.hash = p), path);
  await page.waitForTimeout(450);
};
const toast = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });

await page.goto(url);
await page.waitForSelector("#login-email", { timeout: 20000 });

await step("login owner", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Kas masuk 6 bulan terakhir", { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/01-dashboard.png`, fullPage: true });
});

const pages = [
  ["/crm", "CRM & Lead"],
  ["/customers", "Pelanggan"],
  ["/spaces", "Ruang & Denah"],
  ["/contracts", "Kontrak"],
  ["/bookings", "Booking"],
  ["/billing", "Tagihan"],
  ["/catalog", "Katalog Layanan"],
  ["/requests", "Permintaan Layanan"],
  ["/settings", "Pengaturan"],
  ["/audit", "Log Aktivitas"],
];
for (const [p, title] of pages) {
  await step(`buka ${p}`, async () => {
    await go(p);
    await page.getByRole("heading", { name: title, exact: true }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/page${p.replace(/\//g, "-")}.png`, fullPage: false });
  });
}

await step("detail pages (lead, pelanggan, ruang, kontrak, invoice)", async () => {
  await go("/crm");
  await page.getByRole("button", { name: "Tabel" }).click();
  await page.locator("tr.row-link").first().click();
  await page.getByText("Aktivitas", { exact: true }).first().waitFor();
  await go("/customers");
  await page.locator("tr.row-link").first().click();
  await page.getByRole("tab", { name: /Kontrak/ }).click();
  await go("/spaces");
  await page.locator("button[title^='PO-']").first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await page.getByRole("button", { name: /Lantai 2/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/spaces-floor2.png` });
  await page.locator("button[title^='PO-208']").click();
  await page.getByText("Spesifikasi").waitFor();
  await go("/contracts");
  await page.locator("tr.row-link").first().click();
  await page.getByText("Rincian kontrak").waitFor();
  await go("/billing");
  await page.locator("tr.row-link").first().click();
  await page.getByText("Ditagihkan kepada").waitFor();
  await page.screenshot({ path: `${shots}/invoice-detail.png`, fullPage: true });
});

await step("buat lead baru lalu konversi", async () => {
  await go("/crm");
  await page.getByRole("button", { name: "Lead baru" }).click();
  await page.fill("#lead-name", "Wulan Sari");
  await page.fill("#lead-company", "PT Uji Coba Nusantara");
  await page.fill("#lead-phone", "081234567890");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("heading", { name: /Wulan Sari/ }).waitFor({ timeout: 5000 });
  await page.fill("#activity-content", "Telepon awal, minta jadwal survei.");
  await page.getByRole("button", { name: "Catat aktivitas" }).click();
  await toast("Aktivitas dicatat");
  await page.getByRole("button", { name: "Site Visit" }).click();
  await toast("Tahap: Site Visit");
  await page.getByRole("button", { name: "Jadikan pelanggan" }).click();
  await page.getByRole("button", { name: "Buat pelanggan" }).click();
  await page.getByRole("heading", { name: /PT Uji Coba Nusantara/ }).waitFor({ timeout: 5000 });
});

await step("validasi form lead kosong", async () => {
  await go("/crm");
  await page.getByRole("button", { name: "Lead baru" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("dialog").getByText("minimal 2 karakter").or(page.getByRole("dialog").getByText("wajib diisi")).first().waitFor({ timeout: 4000 });
  await page.keyboard.press("Escape");
});

await step("kontrak baru di PO-210 → aktifkan → invoice terbit", async () => {
  await go("/customers");
  await page.locator("tr.row-link", { hasText: "PT Uji Coba Nusantara" }).first().click();
  await page.getByRole("button", { name: "Buat kontrak" }).click();
  await page.waitForSelector("#ct-space");
  await page.waitForTimeout(400);
  const val = await page.$eval("#ct-space", (el) => [...el.options].find((o) => o.text.startsWith("PO-210"))?.value);
  await page.selectOption("#ct-space", val);
  await page.getByRole("dialog").getByRole("button", { name: "Buat draft" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click({ timeout: 5000 });
  await page.getByRole("button", { name: "Aktifkan & terbitkan invoice" }).click();
  await toast("Kontrak aktif");
  await page.getByText("Invoice dari kontrak ini").waitFor();
  await page.locator("tr.row-link").first().waitFor();
});

await step("catat pembayaran invoice", async () => {
  await page.locator("tr.row-link").first().click();
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await page.fill("#pay-ref", "TRX-E2E-001");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await toast("Pembayaran tercatat");
  await page.getByText("Lunas").first().waitFor();
});

await step("buat invoice manual & terbitkan", async () => {
  await go("/billing?new=1");
  await page.waitForSelector("#inv-customer");
  await page.waitForTimeout(400);
  const val = await page.$eval("#inv-customer", (el) => el.options[1].value);
  await page.selectOption("#inv-customer", val);
  const prod = await page.$eval("select[id^=inv-prod-]", (el) => [...el.options].find((o) => o.text.startsWith("Cetak"))?.value);
  await page.selectOption("select[id^=inv-prod-]", prod);
  await page.fill("input[id^=inv-qty-]", "150");
  await page.getByRole("dialog").getByRole("button", { name: "Terbitkan" }).click();
  await page.getByText("Ditagihkan kepada").waitFor({ timeout: 5000 });
});

await step("booking bentrok ditolak & booking valid tersimpan", async () => {
  await go("/bookings");
  await page.getByRole("button", { name: "Booking baru" }).click();
  await page.waitForSelector("#bk-title");
  const d = new Date(Date.now() + 7 * 3600e3 + 20 * 86400e3).toISOString().slice(0, 10);
  await page.fill("#bk-date", d);
  await page.selectOption("#bk-start", "08:00");
  await page.selectOption("#bk-end", "09:30");
  await page.fill("#bk-title", "Rapat E2E");
  await page.check("#bk-guest").catch(async () => page.click("#bk-guest"));
  await page.fill("#bk-guestname", "Tamu E2E");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan booking" }).click();
  await toast("Booking tersimpan");
  await page.getByRole("button", { name: "Booking baru" }).click();
  await page.fill("#bk-date", d);
  await page.selectOption("#bk-start", "09:00");
  await page.selectOption("#bk-end", "10:00");
  await page.fill("#bk-title", "Bentrok");
  await page.click("#bk-guest");
  await page.fill("#bk-guestname", "Tamu 2");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan booking" }).click();
  await page.getByRole("dialog").getByText("Jadwal bentrok").waitFor({ timeout: 4000 });
  await page.keyboard.press("Escape");
});

await step("command palette pencarian", async () => {
  await go("/dashboard");
  await page.keyboard.press("Control+k");
  await page.fill("#command-search", "arunika");
  await page.getByRole("dialog").getByText("PT Arunika Teknologi").first().waitFor({ timeout: 4000 });
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /PT Arunika Teknologi/ }).waitFor();
});

await step("logout → login finance (RBAC menu)", async () => {
  await page.getByRole("button", { name: "Keluar" }).first().click();
  await page.waitForSelector("#login-email");
  await page.getByRole("button", { name: "Finance" }).click();
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Kas masuk 6 bulan terakhir");
  const crm = await page.getByRole("link", { name: "CRM & Lead" }).count();
  if (crm !== 0) throw new Error("Finance seharusnya tidak melihat CRM");
});

await step("portal pelanggan: booking + permintaan", async () => {
  await page.getByRole("button", { name: "Keluar" }).first().click();
  await page.waitForSelector("#login-email");
  await page.getByRole("button", { name: "Portal pelanggan" }).click();
  await page.click("button[type=submit]");
  await page.getByRole("heading", { name: /Halo, Budi/ }).waitFor({ timeout: 6000 });
  await page.screenshot({ path: `${shots}/portal-home.png`, fullPage: true });
  await go("/portal/bookings");
  await page.waitForSelector("#pb-title");
  const d = new Date(Date.now() + 7 * 3600e3 + 25 * 86400e3).toISOString().slice(0, 10);
  await page.fill("#pb-date", d);
  await page.selectOption("#pb-start", "07:00");
  await page.selectOption("#pb-end", "08:00");
  await page.fill("#pb-title", "Meeting portal E2E");
  await page.getByRole("button", { name: "Konfirmasi booking" }).click();
  await toast("Booking terkonfirmasi");
  await page.screenshot({ path: `${shots}/portal-bookings.png` });
  await go("/portal/requests");
  await page.getByRole("button", { name: "Kirim permintaan" }).click();
  await page.fill("#rq-subject", "Kunci loker macet");
  await page.fill("#rq-desc", "Loker nomor 12 tidak bisa dibuka.");
  await page.getByRole("dialog").getByRole("button", { name: "Kirim" }).click();
  await toast("Permintaan terkirim");
  await go("/portal/invoices");
  await page.locator("tr.row-link").first().click();
  await page.getByText("Ditagihkan kepada").waitFor();
});

await step("mobile layout (390px) + dark mode", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/portal");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/mobile-portal.png`, fullPage: false });
  const overflow = await page.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return null;
    return [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".overflow-x-auto")).slice(0, 6).map((el) => `${el.tagName}.${String(el.className).slice(0, 80)} r=${Math.round(el.getBoundingClientRect().right)}`).join(" | ");
  });
  if (overflow) throw new Error("portal meluber horizontal di mobile: " + overflow);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Keluar" }).first().click();
  await page.waitForSelector("#login-email");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Kas masuk 6 bulan terakhir");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/mobile-dashboard-dark.png`, fullPage: false });
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow2) throw new Error("dashboard meluber horizontal di mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await go("/spaces");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/spaces-dark.png` });
});

await browser.close();
console.log(errors.length ? `\n${errors.length} masalah:\n- ${errors.join("\n- ")}` : "\nSemua skenario browser lulus tanpa error konsol ✔");
process.exit(errors.length ? 1 : 0);
