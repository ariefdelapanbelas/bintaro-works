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
- [ ] Portal: logout → login `budi@kopikita.id` → booking, kirim permintaan, dan **Konfirmasi bayar** di salah satu tagihan
- [ ] Tagihan → tab **Konfirmasi pelanggan**: terima konfirmasi tadi (otomatis tercatat sebagai pembayaran)
- [ ] Akun saya: Portal → **Akun** → lihat cara masuk yang tertaut (di demo, tombol penyedia memunculkan layar izin simulasi)
- [ ] Aplikasi pelanggan: logout → buka http://localhost:3000/o/bintaro-works → pilih ruang, daftar akun baru, booking; lalu isi form *Ajukan sewa kantor* dan cek lead-nya muncul di CRM

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
- [ ] **Pengaturan → Aplikasi pelanggan**: nyalakan halaman publik, tulis kalimat promosi (tagline), isi nomor WhatsApp. Alamat halaman publik Anda: `/o/{slug-organisasi}` — bagikan tautan ini di Instagram/Google Maps/WhatsApp. Matikan saklarnya kapan saja jika belum mau dibuka ke umum.

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

**4b. Deploy ke Vercel** **(konfigurasi otomatis dari `vercel.json`)**
- [ ] Daftar https://vercel.com dengan akun GitHub → *Add New → Project* → pilih `bintaro-works-os` → **Deploy**
  (build pertama boleh tanpa database — aplikasi sudah terbangun, tinggal disambungkan ke database)

**4c. Sambungkan database (tanpa copy-paste kredensial)**
- [ ] Vercel → Project → tab **Storage** → *Create Database* → pilih **Neon** (Postgres) → region **Singapore** → *Connect* ke project ini
  (Vercel otomatis mengisi `DATABASE_URL` & variabel terkait)
- [ ] (Disarankan) Settings → Environment Variables → tambah `AUTH_SECRET` = hasil `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- [ ] Tab **Deployments** → titik tiga pada deployment terakhir → **Redeploy**
  Saat build, tabel database dibuat otomatis (`scripts/vercel-build.mjs`)
- [ ] Buka `https://....vercel.app/signup` → daftarkan organisasi Bintaro Works
- [ ] Verifikasi dari laptop:
  ```bash
  BASE_URL=https://ALAMAT.vercel.app SMOKE_WRITE=0 SMOKE_EMAIL=email-owner SMOKE_PASSWORD=sandi npm run smoke
  ```

> Tidak perlu mengatur `COOKIE_SECURE` (otomatis mengikuti https) maupun `NEXT_PUBLIC_DEMO_MODE` (akun contoh tersembunyi secara default di produksi).

**4d. Login dengan Google / Facebook / TikTok (opsional, ±30–45 menit)**

Tombolnya hanya muncul kalau kredensialnya sudah diisi — jadi boleh dilewati dulu dan dipasang belakangan. Semua alamat di bawah memakai domain aplikasi Anda (mis. `https://app.bintaroworks.id`, atau alamat `....vercel.app` sebelum punya domain).

Alamat callback yang harus didaftarkan (persis, tanpa garis miring di akhir):

| Penyedia | Alamat callback |
|---|---|
| Google | `https://DOMAIN-ANDA/api/auth/oauth/google/callback` |
| Facebook | `https://DOMAIN-ANDA/api/auth/oauth/facebook/callback` |
| TikTok | `https://DOMAIN-ANDA/api/auth/oauth/tiktok/callback` |

- [ ] **Google** — buka https://console.cloud.google.com → *APIs & Services* → *OAuth consent screen* (isi nama aplikasi, email dukungan, logo) → *Credentials* → **Create credentials → OAuth client ID** → tipe **Web application** → *Authorized redirect URIs* = alamat callback Google di atas → salin **Client ID** & **Client secret**
- [ ] **Facebook** — buka https://developers.facebook.com → *Create App* (tipe *Consumer*) → tambahkan produk **Facebook Login** → *Settings* → *Valid OAuth Redirect URIs* = alamat callback Facebook → salin **App ID** & **App Secret**. Agar bisa dipakai pengguna umum, aplikasi harus dipindahkan dari mode *Development* ke **Live** dan izin `email` + `public_profile` disetujui
- [ ] **TikTok** — buka https://developers.tiktok.com → *Manage apps* → buat app → tambahkan **Login Kit** → scope `user.info.basic` → *Redirect URI* = alamat callback TikTok → salin **Client key** & **Client secret**
- [ ] Vercel → Project → Settings → **Environment Variables**, isi yang Anda pakai saja:
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, dan `APP_URL` = alamat publik aplikasi
- [ ] **Redeploy**, lalu buka halaman Masuk — tombol penyedia yang terisi akan muncul

Yang perlu Anda tahu soal aturannya:

- Login sosial **hanya untuk pelanggan**. Akun tim (Owner/Admin/Staf/Finance) tetap masuk dengan email + kata sandi, meski emailnya sama dengan akun Google mereka.
- Kalau email dari Google/Facebook **sudah terverifikasi** dan cocok dengan akun pelanggan yang ada, akun itu **langsung disatukan** — pelanggan tidak jadi punya dua akun.
- **TikTok tidak pernah memberi email.** Jadi TikTok tidak bisa dipakai untuk mendaftar; pelanggan masuk dulu (email atau Google), lalu menautkan TikTok di **Portal → Akun saya**. Sesudah itu TikTok bisa dipakai masuk sekali klik.
- Pelanggan yang akunnya lahir dari login sosial diminta menyetel kata sandi cadangan di **Akun saya**; tautan terakhir tidak bisa dilepas sebelum kata sandi itu ada.

**4e. Domain sendiri (opsional)**
- [ ] Vercel → Project → Settings → Domains → tambah `app.bintaroworks.id`
- [ ] Di pengelola DNS domain, tambahkan record CNAME sesuai instruksi Vercel

**4f. Keamanan & cadangan**
- [ ] Aktifkan backup / point-in-time recovery di Neon/Supabase
- [ ] Aktifkan verifikasi 2 langkah di akun GitHub, Vercel, dan Neon
- [ ] Simpan `AUTH_SECRET`, connection string, dan semua *client secret* penyedia login di password manager

## Tahap 5 — Operasional rutin

| Kapan | Siapa | Apa |
|---|---|---|
| Setiap hari | Staf | Cek Dashboard: booking hari ini, follow-up lead, permintaan baru |
| Tanggal 1 setiap bulan | Finance | Tagihan → **Generate bulanan** (aman diklik ulang) |
| Setiap transfer masuk | Finance | Invoice → **Catat pembayaran** |
| Setiap hari kerja | Finance | Tagihan → tab **Konfirmasi pelanggan**: terima/tolak konfirmasi transfer dari pelanggan |
| Setiap hari kerja | Staf | CRM: lead baru bersumber *Website* datang dari halaman publik — hubungi maksimal 1 hari kerja |
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
| Tombol Google/Facebook/TikTok tidak muncul | Kredensial penyedia belum diisi di Environment Variables, atau belum *Redeploy* |
| `redirect_uri_mismatch` saat masuk | Alamat callback di konsol penyedia berbeda dengan domain aplikasi (perhatikan http/https, www, dan garis miring di akhir) |
| "Sesi login kedaluwarsa atau tidak cocok" | Proses izin dibiarkan lebih dari 10 menit, atau cookie diblokir browser — ulangi dari halaman Masuk |
| "Akun tim internal harus masuk memakai email dan kata sandi" | Memang disengaja: akun tim tidak boleh masuk lewat penyedia sosial |
| "Akun TikTok ini belum ditautkan" | TikTok tidak memberi email — tautkan dulu lewat Portal → Akun saya |
| Halaman `/o/...` menampilkan "tidak tersedia" | Halaman publik dimatikan di Pengaturan → *Aplikasi pelanggan*, atau slug organisasi salah |
| Pelanggan gagal daftar: "Email ini sudah terdaftar" | Email tersebut sudah punya akun — minta pelanggan **Masuk** dulu lewat tombol di kanan atas, baru booking |
| Login berhasil tapi kembali ke halaman login | Di laptop (`http://`) `COOKIE_SECURE` harus `false`; di server online (`https://`) boleh `true` |
