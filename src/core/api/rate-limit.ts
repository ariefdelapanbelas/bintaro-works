// Rate limit sederhana berbasis memori untuk endpoint publik.
// Cukup untuk menahan penyalahgunaan ringan (spam form). Untuk skala besar,
// ganti dengan Redis/Upstash: cukup ubah implementasi fungsi ini.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  return true;
}
