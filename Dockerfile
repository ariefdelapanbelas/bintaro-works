# Image produksi sederhana untuk VPS / Railway / Fly.io
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci || npm install
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Terapkan migrasi lalu jalankan server
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
