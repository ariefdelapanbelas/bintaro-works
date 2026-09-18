import { addDays, addMonths, monthEndUTC, monthStartUTC, startOfDayUTC, businessToday } from "../domain/dates";
import { AppError, badRequest, conflict, notFound } from "../domain/errors";
import type { Contract, Invoice, InvoiceItem, InvoiceStatus, Payment, PaymentConfirmation } from "../domain/types";
import { confirmationReviewSchema, generateSchema, invoiceSchema, invoiceUpdateSchema, parse, paymentConfirmationSchema, paymentSchema } from "../domain/validation";
import { audit, byId, includesText, mustGet, tx, type Svc } from "./context";

export interface ItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export function computeTotals(items: ItemInput[], discount: number, taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  if (discount > subtotal) throw new AppError("VALIDATION", "Diskon tidak boleh melebihi subtotal", { discount: "melebihi subtotal" });
  const taxable = subtotal - discount;
  const taxAmount = Math.round((taxable * taxRate) / 100);
  return { subtotal, discount, taxRate, taxAmount, total: taxable + taxAmount };
}

export function outstandingOf(inv: Pick<Invoice, "total" | "amountPaid">) {
  return Math.max(0, inv.total - inv.amountPaid);
}

export const OPEN_INVOICE: InvoiceStatus[] = ["SENT", "PARTIAL", "OVERDUE"];

function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

export async function nextInvoiceNumber(s: Svc, issueDate: Date) {
  const org = await s.repo.organization();
  const seq = await s.repo.nextSequence("invoice");
  const ym = `${issueDate.getUTCFullYear()}${String(issueDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${org.invoicePrefix}/${ym}/${pad(seq)}`;
}

/** Buat invoice + item dalam repo yang diberikan (panggil di dalam tx). */
export async function createInvoiceRecord(
  s: Svc,
  input: {
    customerId: string;
    issueDate: Date;
    dueDate?: Date;
    items: ItemInput[];
    discount?: number;
    notes?: string | null;
    status: InvoiceStatus;
    contractId?: string | null;
    bookingId?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
  },
): Promise<Invoice> {
  const org = await s.repo.organization();
  const totals = computeTotals(input.items, input.discount ?? 0, org.taxRate);
  const issueDate = startOfDayUTC(input.issueDate);
  const invoice = await s.repo.invoice.create({
    number: await nextInvoiceNumber(s, issueDate),
    customerId: input.customerId,
    contractId: input.contractId ?? null,
    bookingId: input.bookingId ?? null,
    issueDate,
    dueDate: startOfDayUTC(input.dueDate ?? addDays(issueDate, org.paymentTermDays)),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    ...totals,
    amountPaid: 0,
    status: totals.total === 0 && input.status !== "DRAFT" ? "PAID" : input.status,
    notes: input.notes ?? null,
  });
  for (const it of input.items) {
    await s.repo.invoiceItem.create({
      invoiceId: invoice.id,
      productId: it.productId ?? null,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      amount: it.quantity * it.unitPrice,
    });
  }
  return invoice;
}

/** Tandai invoice jatuh tempo sebagai OVERDUE (idempoten, aman dipanggil berkali-kali). */
export async function refreshInvoiceStatuses(s: Svc) {
  const today = businessToday(s.now).getTime();
  const open = await s.repo.invoice.list({ where: { status: ["SENT", "PARTIAL"] } });
  for (const inv of open) {
    if (new Date(inv.dueDate).getTime() < today) await s.repo.invoice.update(inv.id, { status: "OVERDUE" });
  }
}

export async function listInvoices(s: Svc, q: { status?: string; customerId?: string; q?: string }) {
  await refreshInvoiceStatuses(s);
  const [invoices, customers] = await Promise.all([
    s.repo.invoice.list({
      where: {
        ...(q.status ? { status: q.status as InvoiceStatus } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
      },
      orderBy: { field: "issueDate", dir: "desc" },
    }),
    s.repo.customer.list(),
  ]);
  const cmap = byId(customers);
  return invoices
    .map((i) => ({ ...i, customerName: cmap.get(i.customerId)?.name ?? "-", outstanding: outstandingOf(i) }))
    .filter((i) => includesText([i.number, i.customerName], q.q));
}

export async function invoiceSummary(s: Svc) {
  await refreshInvoiceStatuses(s);
  const all = await s.repo.invoice.list();
  const monthStart = monthStartUTC(s.now.getUTCFullYear(), s.now.getUTCMonth()).getTime();
  const payments = await s.repo.payment.list();
  const open = all.filter((i) => OPEN_INVOICE.includes(i.status));
  return {
    outstanding: open.reduce((a, i) => a + outstandingOf(i), 0),
    overdue: all.filter((i) => i.status === "OVERDUE").reduce((a, i) => a + outstandingOf(i), 0),
    overdueCount: all.filter((i) => i.status === "OVERDUE").length,
    collectedThisMonth: payments.filter((p) => new Date(p.paidAt).getTime() >= monthStart).reduce((a, p) => a + p.amount, 0),
    draftCount: all.filter((i) => i.status === "DRAFT").length,
  };
}

export async function getInvoice(s: Svc, id: string) {
  const inv = await mustGet(s.repo.invoice.get(id), "Invoice");
  const [items, payments, customer, org, contract] = await Promise.all([
    s.repo.invoiceItem.list({ where: { invoiceId: id } }),
    s.repo.payment.list({ where: { invoiceId: id }, orderBy: { field: "paidAt", dir: "asc" } }),
    s.repo.customer.get(inv.customerId),
    s.repo.organization(),
    inv.contractId ? s.repo.contract.get(inv.contractId) : Promise.resolve(null),
  ]);
  return {
    ...inv,
    outstanding: outstandingOf(inv),
    items,
    payments,
    customer,
    contract: contract ? { id: contract.id, number: contract.number, title: contract.title } : null,
    organization: {
      name: org.name,
      address: org.address,
      email: org.email,
      phone: org.phone,
      npwp: org.npwp,
      bankName: org.bankName,
      bankAccountNo: org.bankAccountNo,
      bankAccountName: org.bankAccountName,
    },
  };
}

export async function createInvoice(s: Svc, body: unknown) {
  const input = parse(invoiceSchema, body);
  await mustGet(s.repo.customer.get(input.customerId), "Pelanggan");
  const invoice = await tx(s, (t) =>
    createInvoiceRecord(t, {
      customerId: input.customerId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      items: input.items,
      discount: input.discount,
      notes: input.notes,
      status: input.send ? "SENT" : "DRAFT",
    }),
  );
  await audit(s, "invoice.create", "Invoice", invoice.id, `Membuat invoice ${invoice.number}`);
  return invoice;
}

export async function updateInvoice(s: Svc, id: string, body: unknown) {
  const input = parse(invoiceUpdateSchema, body);
  const inv = await mustGet(s.repo.invoice.get(id), "Invoice");
  if (inv.status !== "DRAFT") throw conflict("Hanya invoice DRAFT yang bisa diubah");
  const updated = await tx(s, async (t) => {
    const org = await t.repo.organization();
    let items: ItemInput[] = await t.repo.invoiceItem.list({ where: { invoiceId: id } });
    if (input.items) {
      await t.repo.invoiceItem.deleteWhere({ invoiceId: id });
      for (const it of input.items) {
        await t.repo.invoiceItem.create({
          invoiceId: id,
          productId: it.productId ?? null,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.quantity * it.unitPrice,
        });
      }
      items = input.items;
    }
    const totals = computeTotals(items, input.discount ?? inv.discount, org.taxRate);
    const issueDate = input.issueDate ? startOfDayUTC(input.issueDate) : inv.issueDate;
    const dueDate = input.dueDate ? startOfDayUTC(input.dueDate) : inv.dueDate;
    if (new Date(dueDate).getTime() < new Date(issueDate).getTime()) {
      throw new AppError("VALIDATION", "Jatuh tempo tidak boleh sebelum tanggal terbit", { dueDate: "tidak valid" });
    }
    return t.repo.invoice.update(id, { ...totals, issueDate, dueDate, notes: input.notes });
  });
  await audit(s, "invoice.update", "Invoice", id, `Mengubah invoice ${inv.number}`);
  return updated;
}

export async function sendInvoice(s: Svc, id: string) {
  const inv = await mustGet(s.repo.invoice.get(id), "Invoice");
  if (inv.status !== "DRAFT") throw conflict("Invoice sudah diterbitkan");
  const updated = await s.repo.invoice.update(id, { status: inv.total === 0 ? "PAID" : "SENT" });
  await refreshInvoiceStatuses(s);
  await audit(s, "invoice.send", "Invoice", id, `Menerbitkan invoice ${inv.number}`);
  return updated;
}

export async function voidInvoice(s: Svc, id: string) {
  const inv = await mustGet(s.repo.invoice.get(id), "Invoice");
  if (inv.status === "VOID") throw conflict("Invoice sudah dibatalkan");
  if (inv.amountPaid > 0) throw conflict("Invoice yang sudah ada pembayaran tidak bisa dibatalkan. Hapus pembayaran terlebih dahulu.");
  const updated = await s.repo.invoice.update(id, { status: "VOID" });
  await audit(s, "invoice.void", "Invoice", id, `Membatalkan invoice ${inv.number}`);
  return updated;
}

function statusAfterPayment(inv: Invoice, amountPaid: number, now: Date): InvoiceStatus {
  if (amountPaid >= inv.total) return "PAID";
  if (amountPaid <= 0) return new Date(inv.dueDate).getTime() < businessToday(now).getTime() ? "OVERDUE" : "SENT";
  return new Date(inv.dueDate).getTime() < businessToday(now).getTime() ? "OVERDUE" : "PARTIAL";
}

export async function recordPayment(s: Svc, invoiceId: string, body: unknown) {
  const input = parse(paymentSchema, body);
  const result = await tx(s, async (t) => {
    const inv = await mustGet(t.repo.invoice.get(invoiceId), "Invoice");
    if (inv.status === "DRAFT") throw conflict("Terbitkan invoice sebelum mencatat pembayaran");
    if (inv.status === "VOID") throw conflict("Invoice sudah dibatalkan");
    if (inv.status === "PAID") throw conflict("Invoice sudah lunas");
    const outstanding = outstandingOf(inv);
    if (input.amount > outstanding) {
      throw new AppError("VALIDATION", `Jumlah melebihi sisa tagihan (${outstanding})`, { amount: "melebihi sisa tagihan" });
    }
    const payment = await t.repo.payment.create({
      invoiceId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      recordedById: t.auth.userId,
    });
    const amountPaid = inv.amountPaid + input.amount;
    const invoice = await t.repo.invoice.update(invoiceId, { amountPaid, status: statusAfterPayment(inv, amountPaid, t.now) });
    return { payment, invoice };
  });
  await audit(s, "payment.create", "Invoice", invoiceId, `Mencatat pembayaran ${result.invoice.number}`);
  return result;
}

export async function deletePayment(s: Svc, paymentId: string) {
  const result = await tx(s, async (t) => {
    const p = await mustGet(t.repo.payment.get(paymentId), "Pembayaran");
    const inv = await mustGet(t.repo.invoice.get(p.invoiceId), "Invoice");
    await t.repo.payment.delete(paymentId);
    const amountPaid = Math.max(0, inv.amountPaid - p.amount);
    return t.repo.invoice.update(inv.id, { amountPaid, status: statusAfterPayment(inv, amountPaid, t.now) });
  });
  await audit(s, "payment.delete", "Invoice", result.id, `Menghapus pembayaran pada ${result.number}`);
  return result;
}

export async function listPayments(s: Svc) {
  const [payments, invoices, customers] = await Promise.all([
    s.repo.payment.list({ orderBy: { field: "paidAt", dir: "desc" }, take: 200 }),
    s.repo.invoice.list(),
    s.repo.customer.list(),
  ]);
  const imap = byId(invoices);
  const cmap = byId(customers);
  return payments.map((p: Payment) => {
    const inv = imap.get(p.invoiceId);
    return { ...p, invoiceNumber: inv?.number ?? "-", customerName: inv ? cmap.get(inv.customerId)?.name ?? "-" : "-" };
  });
}

// ---------------- Tagihan berulang dari kontrak ----------------

const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as const;

export function countBillableMonths(start: Date, end: Date): number {
  let n = 0;
  while (addMonths(start, n).getTime() <= end.getTime() && n < 1200) n++;
  return Math.max(1, n);
}

/** Periode tagihan kontrak yang TANGGAL MULAINYA jatuh di bulan target. */
export function billingPeriodFor(contract: Pick<Contract, "startDate" | "endDate" | "billingCycle">, year: number, month0: number) {
  const start = startOfDayUTC(new Date(contract.startDate));
  const end = startOfDayUTC(new Date(contract.endDate));
  const mStart = monthStartUTC(year, month0).getTime();
  const mEnd = monthEndUTC(year, month0).getTime();

  if (contract.billingCycle === "UPFRONT") {
    if (start.getTime() < mStart || start.getTime() > mEnd) return null;
    return { periodStart: start, periodEnd: end, months: countBillableMonths(start, end), index: 0 };
  }
  const cycle = CYCLE_MONTHS[contract.billingCycle];
  for (let k = 0; k < 1200; k++) {
    const pStart = addMonths(start, k * cycle);
    if (pStart.getTime() > end.getTime() || pStart.getTime() > mEnd) return null;
    if (pStart.getTime() >= mStart) {
      const naturalEnd = addDays(addMonths(start, (k + 1) * cycle), -1);
      const pEnd = naturalEnd.getTime() > end.getTime() ? end : naturalEnd;
      return { periodStart: pStart, periodEnd: pEnd, months: countBillableMonths(pStart, pEnd), index: k };
    }
  }
  return null;
}

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function fmtShortDate(d: Date) {
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function createContractPeriodInvoice(
  s: Svc,
  contract: Contract,
  period: { periodStart: Date; periodEnd: Date; months: number; index: number },
  opts: { includeDeposit: boolean },
) {
  const existing = await s.repo.invoice.findFirst({ contractId: contract.id, periodStart: period.periodStart });
  if (existing && existing.status !== "VOID") return null;
  const items: ItemInput[] = [
    {
      productId: contract.productId,
      description: `${contract.title} — periode ${fmtShortDate(period.periodStart)} s/d ${fmtShortDate(period.periodEnd)}`,
      quantity: period.months,
      unitPrice: contract.monthlyFee,
    },
  ];
  if (opts.includeDeposit && contract.deposit > 0) {
    items.push({ productId: null, description: `Deposit kontrak ${contract.number}`, quantity: 1, unitPrice: contract.deposit });
  }
  return createInvoiceRecord(s, {
    customerId: contract.customerId,
    contractId: contract.id,
    issueDate: businessToday(s.now).getTime() > period.periodStart.getTime() ? businessToday(s.now) : period.periodStart,
    items,
    status: "SENT",
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });
}

export async function generateRecurringInvoices(s: Svc, body: unknown) {
  const { year, month } = parse(generateSchema, body);
  const contracts = await s.repo.contract.list({ where: { status: "ACTIVE" } });
  let created = 0;
  let skipped = 0;
  const numbers: string[] = [];
  for (const c of contracts) {
    const period = billingPeriodFor(c, year, month - 1);
    if (!period) {
      skipped++;
      continue;
    }
    const inv = await tx(s, (t) => createContractPeriodInvoice(t, c, period, { includeDeposit: period.index === 0 }));
    if (inv) {
      created++;
      numbers.push(inv.number);
    } else skipped++;
  }
  if (created > 0) {
    await audit(s, "billing.generate", "Invoice", null, `Generate ${created} invoice berulang periode ${month}/${year}`);
  }
  return { created, skipped, numbers };
}

export type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

export function ensurePositive(n: number, label: string) {
  if (n <= 0) throw badRequest(`${label} harus lebih dari 0`);
}

// ---------------- Konfirmasi pembayaran dari pelanggan ----------------

/** Pelanggan (portal) mengirim bukti/konfirmasi transfer untuk diverifikasi finance. */
export async function submitPaymentConfirmation(s: Svc, invoiceId: string, body: unknown) {
  const input = parse(paymentConfirmationSchema, body);
  const inv = await mustGet(s.repo.invoice.get(invoiceId), "Invoice");
  if (s.auth.role === "CUSTOMER" && inv.customerId !== s.auth.customerId) throw notFound("Invoice");
  if (inv.status === "DRAFT" || inv.status === "VOID") throw conflict("Invoice ini belum aktif");
  if (inv.status === "PAID") throw conflict("Invoice sudah lunas");
  const pending = await s.repo.paymentConfirmation.findFirst({ invoiceId, status: "PENDING" });
  if (pending) throw conflict("Konfirmasi sebelumnya masih menunggu verifikasi tim kami");
  if (input.amount > outstandingOf(inv)) {
    throw new AppError("VALIDATION", `Jumlah melebihi sisa tagihan (${outstandingOf(inv)})`, { amount: "melebihi sisa tagihan" });
  }
  const conf = await s.repo.paymentConfirmation.create({
    invoiceId,
    amount: input.amount,
    method: input.method,
    paidAt: input.paidAt,
    reference: input.reference ?? null,
    note: input.note ?? null,
    status: "PENDING",
    reviewedById: null,
    reviewNote: null,
    paymentId: null,
    createdById: s.auth.userId,
  });
  await audit(s, "payment.confirm", "Invoice", invoiceId, `Konfirmasi pembayaran ${inv.number} menunggu verifikasi`);
  return conf;
}

export async function listPaymentConfirmations(s: Svc, q: { status?: string }) {
  const [rows, invoices, customers] = await Promise.all([
    s.repo.paymentConfirmation.list({
      where: q.status ? { status: q.status as PaymentConfirmation["status"] } : undefined,
      orderBy: { field: "createdAt", dir: "desc" },
      take: 200,
    }),
    s.repo.invoice.list(),
    s.repo.customer.list(),
  ]);
  const imap = byId(invoices);
  const cmap = byId(customers);
  return rows.map((r) => {
    const inv = imap.get(r.invoiceId);
    return {
      ...r,
      invoiceNumber: inv?.number ?? "-",
      invoiceTotal: inv?.total ?? 0,
      outstanding: inv ? outstandingOf(inv) : 0,
      customerName: inv ? cmap.get(inv.customerId)?.name ?? "-" : "-",
    };
  });
}

/** Finance menyetujui konfirmasi → tercatat sebagai pembayaran sungguhan. */
export async function acceptPaymentConfirmation(s: Svc, id: string, body: unknown) {
  const input = parse(confirmationReviewSchema, body);
  const conf = await mustGet(s.repo.paymentConfirmation.get(id), "Konfirmasi pembayaran");
  if (conf.status !== "PENDING") throw conflict("Konfirmasi ini sudah diproses");
  const result = await recordPayment(s, conf.invoiceId, {
    amount: conf.amount,
    method: conf.method,
    paidAt: conf.paidAt,
    reference: conf.reference,
    notes: conf.note,
  });
  const updated = await s.repo.paymentConfirmation.update(id, {
    status: "ACCEPTED",
    reviewedById: s.auth.userId,
    reviewNote: input.reviewNote ?? null,
    paymentId: result.payment.id,
  });
  await audit(s, "payment.confirm.accept", "Invoice", conf.invoiceId, `Verifikasi pembayaran ${result.invoice.number} disetujui`);
  return { confirmation: updated, invoice: result.invoice };
}

export async function rejectPaymentConfirmation(s: Svc, id: string, body: unknown) {
  const input = parse(confirmationReviewSchema, body);
  const conf = await mustGet(s.repo.paymentConfirmation.get(id), "Konfirmasi pembayaran");
  if (conf.status !== "PENDING") throw conflict("Konfirmasi ini sudah diproses");
  const updated = await s.repo.paymentConfirmation.update(id, {
    status: "REJECTED",
    reviewedById: s.auth.userId,
    reviewNote: input.reviewNote ?? null,
  });
  await audit(s, "payment.confirm.reject", "Invoice", conf.invoiceId, "Konfirmasi pembayaran ditolak");
  return updated;
}
