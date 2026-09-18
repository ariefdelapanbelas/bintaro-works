import type {
  ActivityType,
  BillingCycle,
  BookingStatus,
  ContractStatus,
  CustomerStatus,
  InvoiceStatus,
  LeadSource,
  LeadStage,
  PaymentMethod,
  ProductCategory,
  ProductUnit,
  RequestPriority,
  RequestStatus,
  SpaceStatus,
  SpaceType,
} from "@/core/domain/types";

export type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "info" | "brass";

const TZ = "Asia/Jakarta";

export const rupiah = (n: number | null | undefined, opts: { compact?: boolean } = {}) => {
  const v = n ?? 0;
  if (opts.compact && Math.abs(v) >= 1_000_000) {
    const jt = v / 1_000_000;
    if (Math.abs(jt) >= 1000) return `Rp ${(jt / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
    return `Rp ${jt.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  return `Rp ${v.toLocaleString("id-ID")}`;
};

export const number = (n: number) => n.toLocaleString("id-ID");

/** Tanggal kalender (disimpan UTC-midnight) — tampil tanpa geser zona. */
export const date = (d: string | Date | null | undefined, style: "short" | "long" = "short") => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  });
};

/** Waktu kejadian — tampil di WIB. */
export const dateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const time = (d: string | Date) => new Date(d).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const dayLabel = (d: string | Date) =>
  new Date(d).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

export const relative = (d: string | Date) => {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "lalu" : "lagi";
  if (abs < 60) return "baru saja";
  if (abs < 3600) return `${Math.round(abs / 60)} menit ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)} jam ${suffix}`;
  if (abs < 86400 * 30) return `${Math.round(abs / 86400)} hari ${suffix}`;
  return date(d);
};

/** YYYY-MM-DD dari tanggal kalender WIB hari ini (+offset hari). */
export const todayISO = (offsetDays = 0) => {
  const wib = new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000);
  return wib.toISOString().slice(0, 10);
};
export const isoDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

/** Gabungkan tanggal (YYYY-MM-DD) + jam (HH:mm) WIB menjadi ISO UTC. */
export const wibToISO = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`).toISOString();
/** Ambil HH:mm WIB dari ISO. */
export const hmWIB = (iso: string | Date) => time(iso).replace(".", ":");

export const initials = (name: string) =>
  name
    .replace(/^(PT|CV|dr\.|drg\.)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

// ---------------- Label Bahasa Indonesia ----------------

export const SPACE_TYPE_LABEL: Record<SpaceType, string> = {
  PRIVATE_OFFICE: "Private Office",
  COWORKING_DESK: "Coworking",
  MEETING_ROOM: "Meeting Room",
  PODCAST_STUDIO: "Podcast Studio",
  LIVE_STUDIO: "Live Streaming Studio",
  EVENT_SPACE: "Event Space",
  PARKING: "Parkir",
};

export const SPACE_STATUS: Record<SpaceStatus, [string, Tone]> = {
  AVAILABLE: ["Tersedia", "good"],
  OCCUPIED: ["Terisi", "accent"],
  RESERVED: ["Dipesan", "warn"],
  MAINTENANCE: ["Maintenance", "neutral"],
};

export const CUSTOMER_STATUS: Record<CustomerStatus, [string, Tone]> = {
  ACTIVE: ["Aktif", "good"],
  INACTIVE: ["Tidak aktif", "neutral"],
};

export const LEAD_STAGE: Record<LeadStage, [string, Tone]> = {
  NEW: ["Baru", "info"],
  CONTACTED: ["Dihubungi", "info"],
  SITE_VISIT: ["Site Visit", "brass"],
  PROPOSAL: ["Proposal", "brass"],
  NEGOTIATION: ["Negosiasi", "warn"],
  WON: ["Menang", "good"],
  LOST: ["Gagal", "bad"],
};

export const LEAD_SOURCE: Record<LeadSource, string> = {
  WEBSITE: "Website",
  WALK_IN: "Walk-in",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  REFERRAL: "Referensi",
  OTHER: "Lainnya",
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  NOTE: "Catatan",
  CALL: "Telepon",
  EMAIL: "Email",
  MEETING: "Pertemuan",
  WHATSAPP: "WhatsApp",
  STAGE_CHANGE: "Perubahan tahap",
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  PRIVATE_OFFICE: "Private Office",
  VIRTUAL_OFFICE: "Virtual Office",
  COWORKING: "Coworking",
  MEETING_ROOM: "Meeting Room",
  STUDIO: "Studio Podcast & Live",
  PARKING: "Parkir",
  PRINTING: "Printing",
  BUSINESS_SERVICE: "Business Services",
  ADDON: "Add-on",
};

export const UNIT_LABEL: Record<ProductUnit, string> = { MONTH: "/bulan", HOUR: "/jam", PIECE: "/pcs", PACKAGE: "/paket" };

export const CONTRACT_STATUS: Record<ContractStatus, [string, Tone]> = {
  DRAFT: ["Draft", "neutral"],
  ACTIVE: ["Aktif", "good"],
  EXPIRED: ["Berakhir", "warn"],
  TERMINATED: ["Diterminasi", "bad"],
};

export const BILLING_CYCLE: Record<BillingCycle, string> = {
  MONTHLY: "Bulanan",
  QUARTERLY: "Per 3 bulan",
  YEARLY: "Tahunan",
  UPFRONT: "Dibayar di muka",
};

export const BOOKING_STATUS: Record<BookingStatus, [string, Tone]> = {
  PENDING: ["Menunggu", "warn"],
  CONFIRMED: ["Terkonfirmasi", "good"],
  CANCELLED: ["Dibatalkan", "neutral"],
  COMPLETED: ["Selesai", "info"],
};

export const INVOICE_STATUS: Record<InvoiceStatus, [string, Tone]> = {
  DRAFT: ["Draft", "neutral"],
  SENT: ["Terbit", "info"],
  PARTIAL: ["Dibayar sebagian", "warn"],
  PAID: ["Lunas", "good"],
  OVERDUE: ["Jatuh tempo", "bad"],
  VOID: ["Dibatalkan", "neutral"],
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  TRANSFER: "Transfer bank",
  QRIS: "QRIS",
  VIRTUAL_ACCOUNT: "Virtual Account",
  CASH: "Tunai",
  CARD: "Kartu",
};

export const CONFIRMATION_STATUS: Record<string, [string, Tone]> = {
  PENDING: ["Menunggu verifikasi", "warn"],
  ACCEPTED: ["Diverifikasi", "good"],
  REJECTED: ["Ditolak", "bad"],
};

export const REQUEST_STATUS: Record<RequestStatus, [string, Tone]> = {
  OPEN: ["Baru", "info"],
  IN_PROGRESS: ["Diproses", "warn"],
  RESOLVED: ["Selesai", "good"],
  CLOSED: ["Ditutup", "neutral"],
};

export const PRIORITY: Record<RequestPriority, [string, Tone]> = {
  LOW: ["Rendah", "neutral"],
  MEDIUM: ["Sedang", "info"],
  HIGH: ["Tinggi", "bad"],
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Staf Operasional",
  FINANCE: "Finance",
  CUSTOMER: "Pelanggan",
};

export const options = <K extends string>(rec: Record<K, string | [string, Tone]>) =>
  (Object.keys(rec) as K[]).map((k) => ({ value: k, label: Array.isArray(rec[k]) ? (rec[k] as [string, Tone])[0] : (rec[k] as string) }));
