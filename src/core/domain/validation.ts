import { z } from "zod";
import { AppError } from "./errors";
import {
  ACTIVITY_TYPES,
  BILLING_CYCLES,
  BOOKING_STATUSES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
  LEAD_STAGES,
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  ROLES,
  SPACE_STATUSES,
  SPACE_TYPES,
} from "./types";

/** Validasi input; lempar AppError VALIDATION dengan pesan per kolom. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.entries(fields)[0];
  throw new AppError("VALIDATION", first ? `${labelOf(first[0])}: ${first[1]}` : "Input tidak valid", fields);
}

function labelOf(key: string) {
  return key.split(".").pop() ?? key;
}

// ---- primitif ----
const str = (min = 1, max = 200) =>
  z
    .string({ required_error: "wajib diisi", invalid_type_error: "wajib diisi" })
    .trim()
    .min(min, min === 1 ? "wajib diisi" : `minimal ${min} karakter`)
    .max(max, `maksimal ${max} karakter`);
const optStr = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `maksimal ${max} karakter`)
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v : null));
const email = z.string().trim().toLowerCase().email("format email tidak valid");
const optEmail = z
  .union([z.literal(""), email])
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v ? v : null));
const money = z.coerce
  .number({ invalid_type_error: "harus angka" })
  .int("harus bilangan bulat")
  .min(0, "tidak boleh negatif")
  .max(2_000_000_000, "nilai terlalu besar");
const int = (min = 0, max = 100_000) => z.coerce.number().int("harus bilangan bulat").min(min, `minimal ${min}`).max(max, `maksimal ${max}`);
const date = z.coerce.date({ invalid_type_error: "tanggal tidak valid", required_error: "wajib diisi" });
const optDate = z
  .union([z.literal(""), z.null(), z.coerce.date()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v instanceof Date && !Number.isNaN(v.getTime()) ? v : null));
const id = z.string().min(1, "wajib dipilih");
const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v ? v : null));
const password = z.string().min(8, "minimal 8 karakter").max(128);

// ---- auth ----
export const loginSchema = z.object({ email, password: z.string().min(1, "wajib diisi") });
export const signupSchema = z.object({
  organizationName: str(2, 120),
  name: str(2, 120),
  email,
  password,
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

// ---- CRM ----
export const leadSchema = z.object({
  name: str(2, 120),
  company: optStr(160),
  email: optEmail,
  phone: optStr(40),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  interest: z.enum(PRODUCT_CATEGORIES).default("PRIVATE_OFFICE"),
  expectedValue: money.default(0),
  ownerId: optId,
  nextFollowUpAt: optDate,
  notes: optStr(2000),
});
export const leadUpdateSchema = leadSchema.partial();
export const leadStageSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  lostReason: optStr(500),
});
export const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).refine((t) => t !== "STAGE_CHANGE", "tipe tidak valid"),
  content: str(1, 2000),
});

// ---- Pelanggan ----
export const customerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES).default("COMPANY"),
  name: str(2, 160),
  contactName: optStr(120),
  email: optEmail,
  phone: optStr(40),
  npwp: optStr(40),
  address: optStr(500),
  industry: optStr(80),
  status: z.enum(CUSTOMER_STATUSES).default("ACTIVE"),
  notes: optStr(2000),
});
export const customerUpdateSchema = customerSchema.partial();
export const portalUserSchema = z.object({ name: str(2, 120), email, password });

// ---- Ruang ----
export const locationSchema = z.object({ name: str(2, 120), address: optStr(500) });
export const floorSchema = z.object({
  locationId: id,
  name: str(1, 80),
  level: int(-5, 200).default(1),
  gridCols: int(4, 40).default(12),
  gridRows: int(4, 40).default(8),
});
export const floorUpdateSchema = floorSchema.omit({ locationId: true }).partial();
export const spaceSchema = z.object({
  floorId: id,
  code: str(1, 20).transform((v) => v.toUpperCase()),
  name: str(1, 120),
  type: z.enum(SPACE_TYPES),
  status: z.enum(SPACE_STATUSES).default("AVAILABLE"),
  capacity: int(1, 1000).default(1),
  areaSqm: z
    .union([z.literal(""), z.null(), int(0, 100_000)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  monthlyPrice: money.default(0),
  hourlyPrice: money.default(0),
  isBookable: z.coerce.boolean().default(false),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  posX: int(0, 40).default(0),
  posY: int(0, 40).default(0),
  width: int(1, 40).default(2),
  height: int(1, 40).default(2),
  description: optStr(1000),
});
export const spaceUpdateSchema = spaceSchema.partial();

// ---- Katalog ----
export const productSchema = z.object({
  name: str(2, 120),
  category: z.enum(PRODUCT_CATEGORIES),
  unit: z.enum(PRODUCT_UNITS).default("MONTH"),
  price: money,
  description: optStr(1000),
  isActive: z.coerce.boolean().default(true),
});
export const productUpdateSchema = productSchema.partial();

// ---- Kontrak ----
export const contractSchema = z
  .object({
    customerId: id,
    spaceId: optId,
    productId: optId,
    category: z.enum(PRODUCT_CATEGORIES),
    title: str(2, 160),
    startDate: date,
    endDate: date,
    monthlyFee: money,
    deposit: money.default(0),
    billingCycle: z.enum(BILLING_CYCLES).default("MONTHLY"),
    autoRenew: z.coerce.boolean().default(false),
    notes: optStr(2000),
  })
  .refine((v) => v.endDate.getTime() > v.startDate.getTime(), {
    message: "harus setelah tanggal mulai",
    path: ["endDate"],
  });
export const contractUpdateSchema = z.object({
  customerId: id.optional(),
  spaceId: optId,
  productId: optId,
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  title: str(2, 160).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  monthlyFee: money.optional(),
  deposit: money.optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  autoRenew: z.coerce.boolean().optional(),
  notes: optStr(2000),
});
export const terminateSchema = z.object({ date: date, reason: optStr(500) });
export const renewSchema = z.object({ months: int(1, 120), monthlyFee: money.optional() });

// ---- Booking ----
export const bookingSchema = z
  .object({
    spaceId: id,
    customerId: optId,
    guestName: optStr(120),
    title: str(2, 160),
    startAt: date,
    endAt: date,
    attendees: int(1, 1000).default(1),
    notes: optStr(1000),
    createInvoice: z.coerce.boolean().default(false),
  })
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), { message: "harus setelah waktu mulai", path: ["endAt"] })
  .refine((v) => v.endAt.getTime() - v.startAt.getTime() <= 24 * 3600_000, {
    message: "maksimal 24 jam per booking",
    path: ["endAt"],
  })
  .refine((v) => v.customerId || v.guestName, { message: "pilih pelanggan atau isi nama tamu", path: ["customerId"] });
export const bookingUpdateSchema = z.object({
  title: str(2, 160).optional(),
  startAt: date.optional(),
  endAt: date.optional(),
  attendees: int(1, 1000).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  notes: optStr(1000),
});
export const portalBookingSchema = z
  .object({
    spaceId: id,
    title: str(2, 160),
    startAt: date,
    endAt: date,
    attendees: int(1, 1000).default(1),
    notes: optStr(1000),
  })
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), { message: "harus setelah waktu mulai", path: ["endAt"] })
  .refine((v) => v.endAt.getTime() - v.startAt.getTime() <= 12 * 3600_000, {
    message: "maksimal 12 jam per booking",
    path: ["endAt"],
  });

// ---- Tagihan ----
export const invoiceItemSchema = z.object({
  productId: optId,
  description: str(1, 300),
  quantity: int(1, 100_000),
  unitPrice: money,
});
export const invoiceSchema = z
  .object({
    customerId: id,
    issueDate: date,
    dueDate: date,
    discount: money.default(0),
    notes: optStr(2000),
    items: z.array(invoiceItemSchema).min(1, "minimal 1 item"),
    send: z.coerce.boolean().default(false),
  })
  .refine((v) => v.dueDate.getTime() >= v.issueDate.getTime(), {
    message: "tidak boleh sebelum tanggal terbit",
    path: ["dueDate"],
  });
export const invoiceUpdateSchema = z.object({
  issueDate: date.optional(),
  dueDate: date.optional(),
  discount: money.optional(),
  notes: optStr(2000),
  items: z.array(invoiceItemSchema).min(1, "minimal 1 item").optional(),
});
export const paymentSchema = z.object({
  amount: money.refine((v) => v > 0, "harus lebih dari 0"),
  method: z.enum(PAYMENT_METHODS).default("TRANSFER"),
  paidAt: date,
  reference: optStr(120),
  notes: optStr(500),
});
export const generateSchema = z.object({ year: int(2000, 2100), month: int(1, 12) });

// ---- Permintaan layanan ----
export const requestSchema = z.object({
  category: str(2, 60),
  subject: str(3, 160),
  description: str(3, 3000),
  priority: z.enum(REQUEST_PRIORITIES).default("MEDIUM"),
});
export const requestUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  priority: z.enum(REQUEST_PRIORITIES).optional(),
  response: optStr(3000),
});

// ---- Pengaturan ----
export const organizationSchema = z.object({
  name: str(2, 160).optional(),
  email: optEmail,
  phone: optStr(40),
  address: optStr(500),
  npwp: optStr(40),
  taxRate: int(0, 100).optional(),
  invoicePrefix: str(1, 12).optional(),
  contractPrefix: str(1, 12).optional(),
  paymentTermDays: int(0, 180).optional(),
  bankName: optStr(80),
  bankAccountNo: optStr(40),
  bankAccountName: optStr(120),
  whatsapp: optStr(40),
  publicEnabled: z.coerce.boolean().optional(),
  publicTagline: optStr(160),
});
export const publicInquirySchema = z.object({
  name: str(2, 120),
  company: optStr(160),
  phone: str(6, 40),
  email: optEmail,
  interest: z.enum(PRODUCT_CATEGORIES).default("PRIVATE_OFFICE"),
  people: int(1, 500).optional(),
  startMonth: optStr(20),
  message: optStr(1500),
});

export const publicRegisterSchema = z.object({
  name: str(2, 120),
  company: optStr(160),
  email,
  phone: str(6, 40),
  password,
});

export const paymentConfirmationSchema = z.object({
  amount: money.refine((v) => v > 0, "harus lebih dari 0"),
  method: z.enum(PAYMENT_METHODS).default("TRANSFER"),
  paidAt: date,
  reference: optStr(120),
  note: optStr(500),
});

export const confirmationReviewSchema = z.object({
  reviewNote: optStr(500),
});

export const teamMemberSchema = z.object({
  name: str(2, 120),
  email,
  password,
  role: z.enum(ROLES).refine((r) => r !== "CUSTOMER", "gunakan menu Pelanggan untuk akun portal"),
});
export const teamRoleSchema = z.object({
  role: z.enum(ROLES).refine((r) => r !== "CUSTOMER", "role tidak valid"),
});
