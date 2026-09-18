#!/usr/bin/env bash
# =============================================================
# Bintaro Works OS — setup lokal satu perintah (macOS / Linux)
# Pemakaian:  bash scripts/setup-local.sh            (dengan data contoh)
#             bash scripts/setup-local.sh --no-seed  (database kosong)
# =============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SEED=1
[[ "${1:-}" == "--no-seed" ]] && SEED=0

ok()   { printf "\033[32m✔\033[0m %s\n" "$1"; }
step() { printf "\n\033[1m▶ %s\033[0m\n" "$1"; }
fail() { printf "\033[31m✘ %s\033[0m\n" "$1"; exit 1; }

step "1/6 Memeriksa Node.js & Docker"
command -v node >/dev/null || fail "Node.js belum terpasang. Unduh versi LTS di https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' \
  || fail "Node.js $(node -v) terlalu lama. Butuh minimal v20.19 (disarankan LTS terbaru)."
ok "Node.js $(node -v)"
command -v docker >/dev/null || fail "Docker belum terpasang. Unduh Docker Desktop di https://www.docker.com/products/docker-desktop"
docker info >/dev/null 2>&1 || fail "Docker belum berjalan. Buka aplikasi Docker Desktop, tunggu sampai siap, lalu ulangi."
ok "Docker berjalan"

step "2/6 Menyiapkan file .env"
if [[ -f .env ]]; then
  ok ".env sudah ada — tidak diubah"
else
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
  node -e "
    const fs=require('fs');
    const s=fs.readFileSync('.env','utf8').replace(/^AUTH_SECRET=.*$/m, 'AUTH_SECRET=\"$SECRET\"');
    fs.writeFileSync('.env', s);
  "
  ok ".env dibuat dengan AUTH_SECRET acak"
fi

step "3/6 Menyalakan database PostgreSQL (Docker)"
docker compose up -d
printf "Menunggu database siap"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U bwos -d bwos >/dev/null 2>&1; then echo; ok "Database siap"; break; fi
  printf "."; sleep 1
  [[ $i -eq 60 ]] && { echo; fail "Database tidak merespons dalam 60 detik. Cek: docker compose logs db"; }
done

step "4/6 Memasang library (npm install)"
npm install
ok "Library terpasang"

step "5/6 Membuat struktur tabel"
npx prisma generate
if [[ -d prisma/migrations ]] && ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then
  npx prisma migrate deploy
else
  npx prisma migrate dev --name init
fi
ok "Tabel database siap"

step "6/6 Data awal"
if [[ $SEED -eq 1 ]]; then
  npx prisma db seed
  ok "Data contoh Bintaro Works terisi"
else
  ok "Dilewati (database kosong). Daftarkan organisasi di http://localhost:3000/signup"
fi

printf "\n\033[32m\033[1mSelesai!\033[0m Jalankan aplikasi dengan:\n\n  npm run dev\n\nlalu buka http://localhost:3000\n"
[[ $SEED -eq 1 ]] && printf "Login contoh: owner@bintaroworks.id / bintaro123\n"
