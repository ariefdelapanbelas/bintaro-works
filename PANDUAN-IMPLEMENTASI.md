# Panduan Implementasi Bintaro Works OS

Checklist dari nol sampai aplikasi dipakai tim. Centang `[x]` setiap langkah yang selesai.
Bagian yang sudah disiapkan otomatis ditandai **(otomatis)** — Anda cukup menjalankan satu perintah.

---

## Tahap 1 — Siapkan komputer (sekali saja, ±20 menit)

- [ ] Install **Node.js LTS** (versi 24 atau 26) — https://nodejs.org
- [ ] Install **Docker Desktop** — https://www.docker.com/products/docker-desktop — lalu buka aplikasinya sampai statusnya *running*
- [ ] Install **Git** — https://git-scm.com
- [ ] (Opsional) Install **VS Code** — https://code.visualstudio.com
- [ ] Buka Terminal (Mac) / PowerShell (Windows), cek:
  ```bash
  node -v      # v24.x atau v26.x
  docker -v
  git --version
  ```

## Tahap 2 — Jalankan di laptop (±15 menit) **(otomatis)**

- [ ] Ekstrak `bintaro-works-os.zip`, buka foldernya di Terminal
- [ ] Jalankan skrip setup (memeriksa prasyarat, membuat `.env` + kunci rahasia acak, menyalakan PostgreSQL, `npm install`, membuat tabel, mengisi data contoh):
  ```bash
  # macOS / Linux
  bash scripts/setup-local.sh

  # Windows (PowerShell)
  powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1
  ```
- [ ] Jalankan aplikasi: `npm run dev` → buka http://localhost:3000
- [ ] Login `owner@bintaroworks.id` / `bintaro123`
- [ ] Buka terminal kedua, jalankan pemeriksaan otomatis (21 cek: login, semua modul, tulis ke database):
  ```bash
  npm run smoke
  ```
  Hasil yang diharapkan: **Semua pemeriksaan lulus ✔**

> Jika ada langkah yang gagal, salin seluruh pesan error dari terminal dan kirimkan ke Claude.

## Tahap 3 — Kenali alur & isi data asli (1–3 hari, tergantung jumlah data)

**3a. Latihan dengan data contoh** — coba alur utama sekali:
- [ ] CRM: buat lead → catat aktivitas → pindahkan tahap → *Jadikan pelanggan*
- [ ] Kontrak: buat kontrak untuk ruang kosong → *Aktifkan* (invoice pertama terbit otomatis)
- [ ] Tagihan: buka invoice → *Catat pembayaran*
- [ ] Booking: buat booking meeting room; coba jam yang bentrok (harus ditolak)
- [ ] Portal: logout → login `budi@kopikita.id` → booking & kirim permintaan

**3b. Kosongkan data contoh & daftarkan organisasi asli**
- [ ] Hentikan `npm run dev` (Ctrl+C), lalu:
  ```bash
  npm run db:fresh        # hapus semua data, tabel dibuat ulang kosong
  npm run dev
  ```
- [ ] Buka http://localhost:3000/signup → daftarkan **Bintaro Works** (akun ini menjadi Owner)

**3c. Isi data asli** (urutan ini penting):
- [ ] **Pengaturan → Organisasi**: alamat, NPWP, PPN, termin bayar, prefix nomor invoice/kontrak, rekening bank
- [ ] **Katalog Layanan**: sesuaikan nama & harga semua layanan
- [ ] **Ruang & Denah → Lokasi & lantai**: buat gedung dan lantai
- [ ] **Ruang & Denah → Ruang baru**: masukkan setiap ruang (kode, tipe, kapasitas, harga, posisi di denah)
- [ ] **Pengaturan → Tim & akses**: tambahkan staf (role Staf) dan finance (role Finance)
- [ ] **Pelanggan**: masukkan penyewa aktif
- [ ] **Kontrak**: masukkan kontrak berjalan → *Aktifkan*
- [ ] **Tagihan**: tandai pembayaran yang sudah diterima
- [ ] **Pelanggan → Akses portal**: buat akun portal untuk penyewa yang mau memakainya

> Data yang diisi di laptop tidak otomatis pindah ke server online. Jika ingin langsung memakai versi online, lakukan 3c **setelah** Tahap 4.

## Tahap 4 — Online agar bisa diakses tim (±1–2 jam)

**4a. Simpan kode ke GitHub**
- [ ] Buat akun di https://github.com → *New repository* → nama `bintaro-works-os` → **Private** → jangan centang README
- [ ] Di folder proyek (repository git sudah disiapkan, tinggal hubungkan):
  ```bash
  git add -A
  git commit -m "Migrasi awal database"      # menyertakan folder prisma/migrations dari Tahap 2
  git remote add origin https://github.com/USERNAME/bintaro-works-os.git
  git push -u origin main
  ```
- [ ] Buka tab **Actions** di GitHub → tunggu workflow **CI** berwarna hijau ✅
  (otomatis: install, uji, migrasi ke PostgreSQL, seed, build produksi, smoke test)

**4b. Buat database online**
- [ ] Daftar https://neon.tech (atau https://supabase.com) → buat project → region **Singapore**
- [ ] Salin *connection string* (format `postgresql://...`)

**4c. Deploy ke Vercel** **(konfigurasi otomatis dari `vercel.json`)**
- [ ] Daftar https://vercel.com dengan akun GitHub → *Add New → Project* → pilih `bintaro-works-os`
- [ ] Isi **Environment Variables** sebelum klik Deploy:

  | Nama | Isi |
  |---|---|
  | `DATABASE_URL` | connection string dari 4b |
  | `AUTH_SECRET` | hasil `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (buat baru, jangan pakai milik laptop) |
  | `COOKIE_SECURE` | `true` |
  | `NEXT_PUBLIC_DEMO_MODE` | `false` |

- [ ] Klik **Deploy**. Tabel database dibuat otomatis saat build (`prisma migrate deploy`)
- [ ] Buka alamat `https://....vercel.app/signup` → daftarkan organisasi Bintaro Works
- [ ] Verifikasi dari laptop:
  ```bash
  BASE_URL=https://ALAMAT.vercel.app SMOKE_WRITE=0 SMOKE_EMAIL=email-owner SMOKE_PASSWORD=sandi npm run smoke
  ```

**4d. Domain sendiri (opsional)**
- [ ] Vercel → Project → Settings → Domains → tambah `app.bintaroworks.id`
- [ ] Di pengelola DNS domain, tambahkan record CNAME sesuai instruksi Vercel

**4e. Keamanan & cadangan**
- [ ] Aktifkan backup / point-in-time recovery di Neon/Supabase
- [ ] Aktifkan verifikasi 2 langkah di akun GitHub, Vercel, dan Neon
- [ ] Simpan `AUTH_SECRET` & connection string di password manager

## Tahap 5 — Operasional rutin

| Kapan | Siapa | Apa |
|---|---|---|
| Setiap hari | Staf | Cek Dashboard: booking hari ini, follow-up lead, permintaan baru |
| Tanggal 1 setiap bulan | Finance | Tagihan → **Generate bulanan** (aman diklik ulang) |
| Setiap transfer masuk | Finance | Invoice → **Catat pembayaran** |
| Setiap minggu | Owner | Cek tagihan lewat jatuh tempo & kontrak segera berakhir |
| Setiap bulan | Owner | Cek Log Aktivitas & daftar anggota tim |

## Masalah umum

| Pesan | Penyebab & solusi |
|---|---|
| `Docker belum berjalan` | Buka Docker Desktop, tunggu sampai *running*, ulangi skrip |
| `port 5432 already in use` | Ada PostgreSQL lain di laptop. Matikan, atau ubah `"5432:5432"` menjadi `"5433:5432"` di `docker-compose.yml` dan port di `.env` |
| `DATABASE_URL belum diatur` | File `.env` belum ada — jalankan ulang skrip setup |
| `Can't reach database server` | Database belum menyala — `docker compose up -d` |
| Build Vercel gagal di `prisma migrate deploy` | `DATABASE_URL` salah/kurang `?sslmode=require` untuk Neon |
| Login berhasil tapi kembali ke halaman login | Di laptop (`http://`) `COOKIE_SECURE` harus `false`; di server online (`https://`) boleh `true` |
