# =============================================================
# Bintaro Works OS — setup lokal satu perintah (Windows PowerShell)
# Pemakaian:  powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1
#             powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1 -NoSeed
# =============================================================
param([switch]$NoSeed)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Fail($m) { Write-Host "  GAGAL  $m" -ForegroundColor Red; exit 1 }
function Run($cmd) {
  Write-Host "  $ $cmd" -ForegroundColor DarkGray
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { Fail "Perintah gagal: $cmd" }
}

Step "1/6 Memeriksa Node.js & Docker"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js belum terpasang. Unduh versi LTS di https://nodejs.org" }
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)"
if ($LASTEXITCODE -ne 0) { Fail "Node.js terlalu lama. Butuh minimal v20.19." }
Ok ("Node.js " + (node -v))
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker belum terpasang. Unduh Docker Desktop." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker belum berjalan. Buka Docker Desktop, tunggu siap, lalu ulangi." }
Ok "Docker berjalan"

Step "2/6 Menyiapkan file .env"
if (Test-Path .env) {
  Ok ".env sudah ada - tidak diubah"
} else {
  Copy-Item .env.example .env
  $secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  (Get-Content .env) -replace '^AUTH_SECRET=.*$', "AUTH_SECRET=`"$secret`"" | Set-Content .env -Encoding utf8
  Ok ".env dibuat dengan AUTH_SECRET acak"
}

Step "3/6 Menyalakan database PostgreSQL (Docker)"
Run "docker compose up -d"
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker compose exec -T db pg_isready -U bwos -d bwos *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "Database tidak merespons dalam 60 detik. Cek: docker compose logs db" }
Ok "Database siap"

Step "4/6 Memasang library (npm install)"
Run "npm install"

Step "5/6 Membuat struktur tabel"
Run "npx prisma generate"
if (Test-Path "prisma\migrations\*\migration.sql") { Run "npx prisma migrate deploy" } else { Run "npx prisma migrate dev --name init" }
Ok "Tabel database siap"

Step "6/6 Data awal"
if ($NoSeed) {
  Ok "Dilewati (database kosong). Daftarkan organisasi di http://localhost:3000/signup"
} else {
  Run "npx prisma db seed"
  Ok "Data contoh Bintaro Works terisi"
}

Write-Host "`nSelesai! Jalankan aplikasi dengan:`n`n  npm run dev`n`nlalu buka http://localhost:3000" -ForegroundColor Green
if (-not $NoSeed) { Write-Host "Login contoh: owner@bintaroworks.id / bintaro123" }
