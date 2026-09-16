# Bintaro Works OS

Business operating system multi-tenant untuk operator **workspace & business services** — private office, virtual office, coworking, meeting room, podcast & live streaming studio, parkir, printing, dan layanan bisnis. Dipakai internal oleh Bintaro Works dulu, arsitekturnya siap dijual sebagai SaaS.

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL · Prisma ORM 7 · Tailwind CSS · Zod

---

## 1. Fitur (Lean MVP)

| Modul | Yang bisa dilakukan |
|---|---|
| **Dashboard** | Okupansi, MRR, kas masuk bulan ini vs bulan lalu, piutang & tunggakan, grafik kas 6 bulan, komposisi lini bisnis, booking hari ini, kontrak segera berakhir, follow-up lead, aktivitas terbaru |
| **CRM & Lead** | Papan kanban (drag & drop antartahap) + tabel, catat aktivitas (telepon/WA/meeting/email/catatan), follow-up, alasan gagal, konversi lead → pelanggan |
| **Pelanggan** | Profil badan usaha/perorangan + NPWP, ringkasan MRR/piutang/total bayar, tab kontrak·invoice·booking·permintaan, **akun portal pelanggan** |
| **Ruang & Denah** | Lokasi → lantai → ruang, **denah grid interaktif** berwarna per status, tampilan daftar, statistik okupansi, maintenance |
| **Kontrak** | Draft → aktif → perpanjang / terminasi / berakhir otomatis, auto-renew, deposit, siklus tagih bulanan / 3 bulanan / tahunan / di muka. Aktivasi otomatis menandai ruang *Terisi* dan menerbitkan invoice pertama |
| **Booking** | Kalender resource per jam (meeting room, studio, event space), cegah jadwal bentrok & melebihi kapasitas, biaya per jam otomatis, invoice otomatis, batal → invoice di-void |
| **Tagihan** | Invoice manual dengan item katalog, diskon, PPN; draft → terbit; **generate tagihan bulanan dari kontrak (idempoten)**; catat pembayaran parsial/lunas, hapus pembayaran; status jatuh tempo otomatis; lembar invoice siap cetak/PDF |
| **Katalog Layanan** | Daftar harga per lini bisnis & satuan (bulan/jam/pcs/paket); produk yang sudah dipakai diarsipkan, bukan dihapus |
| **Permintaan** | Tiket dari portal (fasilitas, akses, internet, surat & paket) dengan status, prioritas, dan tanggapan |
| **Portal Pelanggan** | Beranda, kontrak, booking ruang mandiri dengan cek ketersediaan, tagihan + instruksi transfer, cetak invoice, kirim permintaan bantuan |
| **Pengaturan** | Profil usaha (kop invoice), PPN, termin bayar, prefix nomor, rekening bank, tim & role, ganti kata sandi |
| **Log Aktivitas** | Audit trail setiap perubahan: siapa, apa, kapan |
| **Multi-tenant** | Pendaftaran organisasi baru (`/signup`) dengan katalog standar; data antar organisasi terisolasi |

Semua teks antarmuka berbahasa Indonesia, nominal Rupiah, waktu WIB. Tersedia tema terang/gelap dan tampilan mobile.

---

## 2. Menjalankan secara lokal

Prasyarat: **Node.js LTS** (minimal 20.19; disarankan 24 atau 26), **Docker Desktop** (atau PostgreSQL 14+ terpasang).

**Cara tercepat — satu perintah** (memeriksa prasyarat, membuat `.env` + kunci rahasia, menyalakan database, install, migrasi, seed):

```bash
bash scripts/setup-local.sh                                          # macOS / Linux
powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1     # Windows
npm run dev
```

Panduan lengkap sampai online: **[PANDUAN-IMPLEMENTASI.md](PANDUAN-IMPLEMENTASI.md)**.

Atau manual:

```bash
# 1) Database
docker compose up -d                    # PostgreSQL 16 di localhost:5432 (user/pass/db: bwos)

# 2) Konfigurasi
cp .env.example .env                    # lalu ganti AUTH_SECRET dengan string acak ≥ 32 karakter
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3) Dependensi
npm install

# 4) Skema + data contoh
npm run setup                           # prisma generate → migrate dev (init) → seed

# 5) Jalankan
npm run dev                             # http://localhost:3000
```

### Akun contoh (kata sandi `bintaro123`)

| Role | Email | Akses |
|---|---|---|
| Owner | owner@bintaroworks.id | Semua modul + kelola tim |
| Admin | admin@bintaroworks.id | Semua modul |
| Staf | staf@bintaroworks.id | CRM, pelanggan, kontrak, booking, permintaan |
| Finance | finance@bintaroworks.id | Tagihan, pembayaran, katalog, log |
| Portal pelanggan | budi@kopikita.id | Portal PT Kopi Kita Nusantara |

Data contoh dibuat **melalui service layer** dengan jam simulasi 6 bulan ke belakang, sehingga riwayat kontrak, invoice, pembayaran, tunggakan, dan booking konsisten dengan aturan bisnis.

> Di produksi set `NEXT_PUBLIC_DEMO_MODE="false"` agar kotak akun contoh di halaman login disembunyikan, dan jangan jalankan seed.

---

## 3. Arsitektur

```
Browser (React client components)
   │  fetch /api/*  (cookie sesi HttpOnly, HMAC-SHA256)
   ▼
src/proxy.ts ─────────── redirect halaman sesuai sesi & role (Next.js 16 "proxy")
src/app/api/[...path]/route.ts
   │  verifikasi sesi → handleApi()
   ▼
src/core/api/router.ts ── tabel rute + permission per rute (RBAC)
   ▼
src/core/services/* ──── logika bisnis + validasi Zod + audit log
   ▼
OrgRepo (antarmuka) ──── setiap query TERIKAT organizationId
   ├─ src/server/prisma-repo.ts  → PostgreSQL (produksi)
   └─ src/core/repo/memory.ts    → pengujian otomatis & demo in-browser
```

Keputusan penting:

- **Isolasi tenant di lapis repository.** Service tidak pernah menerima `organizationId` dari input pengguna; `deps.db.forOrg(auth.organizationId)` mengembalikan repository yang semua query-nya sudah difilter. Akses ID milik tenant lain menghasilkan 404.
- **Router framework-agnostic.** Aturan akses, validasi, dan logika bisnis ditulis sekali dan dipakai oleh Next.js maupun demo in-browser — yang dites adalah kode yang sama dengan yang berjalan di produksi.
- **Uang = `Int` Rupiah penuh**, bukan float. Tanggal kontrak/invoice disimpan sebagai tanggal kalender (UTC-midnight); "hari ini" dihitung dalam WIB.
- **Transaksi** untuk operasi multi-langkah (aktivasi kontrak + invoice, pembayaran, booking + invoice).
- **Nomor dokumen atomik** per organisasi (`Counter` + upsert increment): `BW-INV/202609/0001`, `BW-KTR/2026/0001`.
- **Keamanan:** kata sandi scrypt, cookie `HttpOnly` + `SameSite=Lax`, cek Origin untuk mutasi (CSRF), sesi divalidasi ulang ke DB setiap request (role/akses yang dicabut langsung berlaku).

### Struktur folder

```
prisma/schema.prisma        Skema database (18 model)
prisma/seed.ts              Seed data contoh ke PostgreSQL
prisma.config.ts            Konfigurasi Prisma 7 (URL DB, migrasi, seed)
src/proxy.ts                Proteksi halaman
src/app/                    Rute Next.js (halaman tipis → komponen fitur)
src/app/api/[...path]/      Satu route handler untuk seluruh API
src/core/domain/            Tipe, validasi Zod, permission, util tanggal
src/core/services/          Logika bisnis per modul
src/core/api/router.ts      Tabel rute API + RBAC
src/core/repo/              Kontrak repository + implementasi in-memory
src/core/seed/demo.ts       Skenario data contoh
src/server/                 Prisma repo, sesi, hash kata sandi (khusus server)
src/client/                 Klien API, hooks, format Rupiah/WIB, sesi UI
src/ui/                     Komponen UI (tombol, form, modal, toast, grafik)
src/features/               Halaman per modul
demo/                       Entry demo in-browser (hash router + MemoryRepo)
scripts/                    Pengujian & build demo
```

### Daftar endpoint (ringkas)

Semua di bawah `/api`. Contoh: `GET /dashboard`, `GET|POST /leads`, `POST /leads/:id/stage`, `POST /leads/:id/convert`, `GET|POST /customers`, `POST /customers/:id/portal-users`, `GET /floors/:id/plan`, `POST /contracts/:id/activate|terminate|renew`, `GET /bookings/availability`, `POST /invoices/generate`, `POST /invoices/:id/payments`, `GET /portal/overview`, `POST /portal/bookings`. Daftar lengkap beserta permission: `src/core/api/router.ts`.

Format error konsisten: `{ "error": { "code": "VALIDATION", "message": "...", "fields": { "email": "format email tidak valid" } } }` dengan status 400/401/403/404/409/422.

---

## 4. Pengujian

```bash
npm test          # 30 skenario end-to-end logika bisnis + API (tanpa database)
                  # dijalankan 2×: MemoryRepo dan PrismaRepo di atas PrismaClient tiruan
                  # yang memvalidasi setiap query terhadap prisma/schema.prisma
npx playwright install chromium
npm run test:e2e  # uji UI di browser: login, CRM, kontrak, pembayaran, booking, portal, mobile, dark mode
```

Skenario yang diuji antara lain: RBAC per role, isolasi tenant, bentrok jadwal, kapasitas, aktivasi kontrak (ruang terisi + invoice sewa + deposit + PPN), idempotensi generate tagihan, pembayaran parsial/lebih bayar, void, portal hanya melihat data sendiri, owner terakhir tidak bisa dihapus.

---

## 5. Deploy

**Opsi A — Vercel + PostgreSQL terkelola (Neon / Supabase / Railway)**
1. Buat database, salin connection string ke `DATABASE_URL`.
2. Set env di Vercel: `DATABASE_URL`, `AUTH_SECRET`, `COOKIE_SECURE=true`, `NEXT_PUBLIC_DEMO_MODE=false`.
3. Commit folder `prisma/migrations` hasil `npm run setup`.
4. `vercel.json` sudah mengatur build `npm run vercel-build` (= `prisma generate` → `prisma migrate deploy` → `next build`) dan region Singapura. Migrasi berjalan otomatis setiap deploy — untuk Preview, isi `DATABASE_URL` terpisah agar database produksi tidak ikut berubah.
5. Setelah online: `BASE_URL=https://alamat-anda SMOKE_WRITE=0 SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run smoke`.

Setiap push ke GitHub juga diverifikasi otomatis oleh `.github/workflows/ci.yml` (install, uji, migrasi ke PostgreSQL nyata, seed, build, smoke test).

**Opsi B — VPS / Railway / Fly.io dengan Docker**
```bash
docker build -t bintaro-works-os .
docker run -p 3000:3000 --env-file .env bintaro-works-os   # migrate deploy otomatis saat start
```

Buat akun owner produksi lewat halaman `/signup` (bukan seed).

---

## 6. Batasan saat ini & roadmap

Sengaja di luar MVP (sesuai scoping), disiapkan titik integrasinya:

- **Phase 2:** WhatsApp Business Cloud API resmi (notifikasi tagihan/booking), AI assistant berbasis Claude API lewat backend tools, payment gateway (Midtrans/Xendit VA & QRIS dengan webhook → `recordPayment`), email invoice otomatis, faktur pajak (e-Faktur/Coretax).
- Cron harian untuk menandai jatuh tempo & kontrak berakhir (saat ini dijalankan otomatis setiap dashboard/daftar dibuka — aman karena idempoten).
- Agregasi dashboard dihitung di aplikasi; untuk ribuan kontrak, pindahkan ke query SQL/materialized view.
- Prorata tagihan periode parsial dibulatkan ke bulan penuh.
- Row Level Security PostgreSQL sebagai lapis pertahanan kedua.
