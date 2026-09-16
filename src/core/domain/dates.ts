// Utilitas tanggal. Semua perhitungan periode memakai UTC agar konsisten
// antara server (Node) dan browser di zona waktu apa pun.

export const DAY_MS = 86_400_000;

/** Zona waktu operasional (tampilan jam booking). */
export const APP_TZ = "Asia/Jakarta";

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Tambah bulan dengan clamp akhir bulan (31 Jan + 1 bln = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

export function monthStartUTC(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0, 1));
}

export function monthEndUTC(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0));
}

/** Selisih bulan kalender (a - b). */
export function monthDiff(a: Date, b: Date): number {
  return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function toDate(v: Date | string | number): Date {
  return v instanceof Date ? v : new Date(v);
}

/** "2026-09" untuk grouping bulanan. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const TZ_OFFSET_MS = 7 * 3_600_000; // WIB = UTC+7, tanpa DST

/** Tanggal kalender hari ini di zona WIB, direpresentasikan sebagai UTC-midnight. */
export function businessToday(now: Date): Date {
  return startOfDayUTC(new Date(now.getTime() + TZ_OFFSET_MS));
}
