import { addDays, businessToday, monthStartUTC } from "../domain/dates";
import type { ProductCategory, SpaceType } from "../domain/types";
import { OPEN_INVOICE, outstandingOf, refreshInvoiceStatuses } from "./billing";
import { byId, type Svc } from "./context";
import { refreshContractStatuses } from "./contracts";
import { STAGE_LABEL } from "./crm";

const WIB = 7 * 3600_000;

const SPACE_TO_CATEGORY: Record<SpaceType, ProductCategory> = {
  PRIVATE_OFFICE: "PRIVATE_OFFICE",
  COWORKING_DESK: "COWORKING",
  MEETING_ROOM: "MEETING_ROOM",
  PODCAST_STUDIO: "STUDIO",
  LIVE_STUDIO: "STUDIO",
  EVENT_SPACE: "MEETING_ROOM",
  PARKING: "PARKING",
};

export async function dashboard(s: Svc) {
  await refreshContractStatuses(s);
  await refreshInvoiceStatuses(s);

  const [spaces, contracts, invoices, items, payments, bookings, leads, customers, products, audits] = await Promise.all([
    s.repo.space.list(),
    s.repo.contract.list(),
    s.repo.invoice.list(),
    s.repo.invoiceItem.list(),
    s.repo.payment.list(),
    s.repo.booking.list({ where: { status: ["CONFIRMED", "COMPLETED", "PENDING"] } }),
    s.repo.lead.list(),
    s.repo.customer.list(),
    s.repo.product.list(),
    s.repo.auditLog.list({ orderBy: { field: "createdAt", dir: "desc" }, take: 8 }),
  ]);

  const today = businessToday(s.now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  // batas bulan dalam WIB, dinyatakan dalam UTC
  const monthStart = monthStartUTC(y, m).getTime() - WIB;
  const lastMonthStart = monthStartUTC(y, m - 1).getTime() - WIB;

  const rentable = spaces.filter((x) => !x.isBookable);
  const occupied = rentable.filter((x) => x.status === "OCCUPIED").length;
  const activeContracts = contracts.filter((c) => c.status === "ACTIVE");
  const mrr = activeContracts.reduce((a, c) => a + c.monthlyFee, 0);
  const paidIn = (from: number, to: number) =>
    payments.filter((p) => new Date(p.paidAt).getTime() >= from && new Date(p.paidAt).getTime() < to).reduce((a, p) => a + p.amount, 0);
  const revenueThisMonth = paidIn(monthStart, Number.MAX_SAFE_INTEGER);
  const revenueLastMonth = paidIn(lastMonthStart, monthStart);
  const openInvoices = invoices.filter((i) => OPEN_INVOICE.includes(i.status));
  const dayStart = today.getTime() - WIB;
  const dayEnd = dayStart + 86_400_000;
  const todayBookings = bookings.filter((b) => new Date(b.startAt).getTime() >= dayStart && new Date(b.startAt).getTime() < dayEnd);
  const openLeads = leads.filter((l) => l.stage !== "WON" && l.stage !== "LOST");

  // Pendapatan 6 bulan (berdasar pembayaran diterima)
  const revenueByMonth = Array.from({ length: 6 }, (_, idx) => {
    const k = 5 - idx;
    const from = monthStartUTC(y, m - k).getTime() - WIB;
    const to = monthStartUTC(y, m - k + 1).getTime() - WIB;
    const d = new Date(monthStartUTC(y, m - k));
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, amount: paidIn(from, to) };
  });

  // Komposisi pendapatan per lini bisnis (tagihan terbit 6 bulan terakhir, non-void)
  const cmap = byId(contracts);
  const pmap = byId(products);
  const smap = byId(spaces);
  const bmap = byId(bookings);
  const imap = byId(invoices);
  const sixMonthsAgo = monthStartUTC(y, m - 5).getTime() - WIB;
  const byCategory = new Map<ProductCategory, number>();
  for (const it of items) {
    const inv = imap.get(it.invoiceId);
    if (!inv || inv.status === "VOID" || inv.status === "DRAFT" || new Date(inv.issueDate).getTime() < sixMonthsAgo) continue;
    let cat: ProductCategory | undefined = it.productId ? pmap.get(it.productId)?.category : undefined;
    if (!cat && inv.contractId) cat = cmap.get(inv.contractId)?.category;
    if (!cat && inv.bookingId) {
      const b = bmap.get(inv.bookingId);
      const sp = b ? smap.get(b.spaceId) : undefined;
      if (sp) cat = SPACE_TO_CATEGORY[sp.type];
    }
    cat = cat ?? "ADDON";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + it.amount);
  }

  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? "-" : "-");

  return {
    kpis: {
      occupancyRate: rentable.length ? Math.round((occupied / rentable.length) * 1000) / 10 : 0,
      occupied,
      rentable: rentable.length,
      mrr,
      activeContracts: activeContracts.length,
      revenueThisMonth,
      revenueLastMonth,
      outstanding: openInvoices.reduce((a, i) => a + outstandingOf(i), 0),
      overdueCount: invoices.filter((i) => i.status === "OVERDUE").length,
      bookingsToday: todayBookings.length,
      activeCustomers: customers.filter((c) => c.status === "ACTIVE").length,
      pipelineValue: openLeads.reduce((a, l) => a + l.expectedValue, 0),
      openLeads: openLeads.length,
    },
    revenueByMonth,
    revenueByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    pipeline: (["NEW", "CONTACTED", "SITE_VISIT", "PROPOSAL", "NEGOTIATION"] as const).map((stage) => ({
      stage,
      label: STAGE_LABEL[stage],
      count: leads.filter((l) => l.stage === stage).length,
      value: leads.filter((l) => l.stage === stage).reduce((a, l) => a + l.expectedValue, 0),
    })),
    expiringContracts: activeContracts
      .filter((c) => new Date(c.endDate).getTime() <= addDays(today, 45).getTime())
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        customerName: customerName(c.customerId),
        endDate: c.endDate,
        daysLeft: Math.ceil((new Date(c.endDate).getTime() - today.getTime()) / 86_400_000),
        autoRenew: c.autoRenew,
      })),
    overdueInvoices: invoices
      .filter((i) => i.status === "OVERDUE")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 6)
      .map((i) => ({
        id: i.id,
        number: i.number,
        customerName: customerName(i.customerId),
        dueDate: i.dueDate,
        outstanding: outstandingOf(i),
        daysOverdue: Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / 86_400_000),
      })),
    todayBookings: todayBookings
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .map((b) => ({
        id: b.id,
        title: b.title,
        startAt: b.startAt,
        endAt: b.endAt,
        spaceName: smap.get(b.spaceId)?.name ?? "-",
        customerName: b.customerId ? customerName(b.customerId) : b.guestName,
      })),
    followUps: openLeads
      .filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= addDays(today, 1).getTime())
      .sort((a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime())
      .slice(0, 6)
      .map((l) => ({ id: l.id, name: l.name, company: l.company, stage: l.stage, nextFollowUpAt: l.nextFollowUpAt })),
    recentActivity: audits,
  };
}

export async function globalSearch(s: Svc, q: string) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const has = (...v: (string | null)[]) => v.some((x) => x?.toLowerCase().includes(needle));
  const [leads, customers, contracts, invoices, spaces] = await Promise.all([
    s.repo.lead.list(),
    s.repo.customer.list(),
    s.repo.contract.list(),
    s.repo.invoice.list(),
    s.repo.space.list(),
  ]);
  const cmap = byId(customers);
  return [
    ...customers.filter((c) => has(c.name, c.contactName, c.email)).slice(0, 5).map((c) => ({ type: "customer", id: c.id, title: c.name, subtitle: c.contactName ?? c.email ?? "", href: `/customers/${c.id}` })),
    ...leads.filter((l) => has(l.name, l.company, l.email, l.phone)).slice(0, 5).map((l) => ({ type: "lead", id: l.id, title: l.name, subtitle: l.company ?? STAGE_LABEL[l.stage], href: `/crm/${l.id}` })),
    ...contracts.filter((c) => has(c.number, c.title)).slice(0, 5).map((c) => ({ type: "contract", id: c.id, title: c.number, subtitle: `${c.title} · ${cmap.get(c.customerId)?.name ?? ""}`, href: `/contracts/${c.id}` })),
    ...invoices.filter((i) => has(i.number)).slice(0, 5).map((i) => ({ type: "invoice", id: i.id, title: i.number, subtitle: cmap.get(i.customerId)?.name ?? "", href: `/billing/${i.id}` })),
    ...spaces.filter((x) => has(x.code, x.name)).slice(0, 5).map((x) => ({ type: "space", id: x.id, title: `${x.code} · ${x.name}`, subtitle: x.type, href: `/spaces/${x.id}` })),
  ];
}
