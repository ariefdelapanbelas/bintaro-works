// Tipe domain — dicerminkan 1:1 dari prisma/schema.prisma.
// Dipakai oleh service (server) maupun UI (client) agar kontraknya satu.

export const ROLES = ["OWNER", "ADMIN", "STAFF", "FINANCE", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export const SPACE_TYPES = [
  "PRIVATE_OFFICE",
  "COWORKING_DESK",
  "MEETING_ROOM",
  "PODCAST_STUDIO",
  "LIVE_STUDIO",
  "EVENT_SPACE",
  "PARKING",
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const SPACE_STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const CUSTOMER_TYPES = ["COMPANY", "INDIVIDUAL"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const LEAD_STAGES = ["NEW", "CONTACTED", "SITE_VISIT", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_SOURCES = ["WEBSITE", "WALK_IN", "WHATSAPP", "INSTAGRAM", "REFERRAL", "OTHER"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "WHATSAPP", "STAGE_CHANGE"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const PRODUCT_CATEGORIES = [
  "PRIVATE_OFFICE",
  "VIRTUAL_OFFICE",
  "COWORKING",
  "MEETING_ROOM",
  "STUDIO",
  "PARKING",
  "PRINTING",
  "BUSINESS_SERVICE",
  "ADDON",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const PRODUCT_UNITS = ["MONTH", "HOUR", "PIECE", "PACKAGE"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY", "UPFRONT"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingSource = "ADMIN" | "PORTAL";

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_METHODS = ["TRANSFER", "QRIS", "VIRTUAL_ACCOUNT", "CASH", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REQUEST_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization extends Timestamps {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  npwp: string | null;
  taxRate: number;
  invoicePrefix: string;
  contractPrefix: string;
  paymentTermDays: number;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
}

export interface User extends Timestamps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface Membership extends Timestamps {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  customerId: string | null;
}

export interface Location extends Timestamps {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
}

export interface Floor extends Timestamps {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  level: number;
  gridCols: number;
  gridRows: number;
}

export interface Space extends Timestamps {
  id: string;
  organizationId: string;
  floorId: string;
  code: string;
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  capacity: number;
  areaSqm: number | null;
  monthlyPrice: number;
  hourlyPrice: number;
  isBookable: boolean;
  amenities: string[];
  posX: number;
  posY: number;
  width: number;
  height: number;
  description: string | null;
}

export interface Customer extends Timestamps {
  id: string;
  organizationId: string;
  type: CustomerType;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  npwp: string | null;
  address: string | null;
  industry: string | null;
  status: CustomerStatus;
  notes: string | null;
}

export interface Lead extends Timestamps {
  id: string;
  organizationId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  interest: ProductCategory;
  stage: LeadStage;
  expectedValue: number;
  ownerId: string | null;
  customerId: string | null;
  nextFollowUpAt: Date | null;
  lostReason: string | null;
  notes: string | null;
}

export interface LeadActivity {
  id: string;
  organizationId: string;
  leadId: string;
  type: ActivityType;
  content: string;
  userId: string | null;
  createdAt: Date;
}

export interface Product extends Timestamps {
  id: string;
  organizationId: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  price: number;
  description: string | null;
  isActive: boolean;
}

export interface Contract extends Timestamps {
  id: string;
  organizationId: string;
  number: string;
  customerId: string;
  spaceId: string | null;
  productId: string | null;
  category: ProductCategory;
  title: string;
  startDate: Date;
  endDate: Date;
  monthlyFee: number;
  deposit: number;
  billingCycle: BillingCycle;
  status: ContractStatus;
  autoRenew: boolean;
  signedAt: Date | null;
  terminatedAt: Date | null;
  notes: string | null;
}

export interface Booking extends Timestamps {
  id: string;
  organizationId: string;
  spaceId: string;
  customerId: string | null;
  guestName: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  attendees: number;
  status: BookingStatus;
  source: BookingSource;
  amount: number;
  invoiceId: string | null;
  notes: string | null;
}

export interface Invoice extends Timestamps {
  id: string;
  organizationId: string;
  number: string;
  customerId: string;
  contractId: string | null;
  bookingId: string | null;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  notes: string | null;
}

export interface InvoiceItem {
  id: string;
  organizationId: string;
  invoiceId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  recordedById: string | null;
  createdAt: Date;
}

export interface ServiceRequest extends Timestamps {
  id: string;
  organizationId: string;
  customerId: string;
  category: string;
  subject: string;
  description: string;
  priority: RequestPriority;
  status: RequestStatus;
  response: string | null;
  createdById: string | null;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
}

/** Peta nama tabel → tipe entitas yang di-scope per organisasi. */
export interface ScopedEntities {
  location: Location;
  floor: Floor;
  space: Space;
  customer: Customer;
  lead: Lead;
  leadActivity: LeadActivity;
  product: Product;
  contract: Contract;
  booking: Booking;
  invoice: Invoice;
  invoiceItem: InvoiceItem;
  payment: Payment;
  serviceRequest: ServiceRequest;
  auditLog: AuditLog;
  membership: Membership;
}
export type ScopedTable = keyof ScopedEntities;

/** Konteks permintaan yang sudah terautentikasi. */
export interface AuthContext {
  userId: string;
  userName: string;
  organizationId: string;
  role: Role;
  customerId: string | null;
}
