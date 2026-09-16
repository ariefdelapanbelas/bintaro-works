import { businessToday } from "../domain/dates";
import { forbidden, notFound } from "../domain/errors";
import { parse, requestSchema } from "../domain/validation";
import { OPEN_INVOICE, getInvoice, outstandingOf, refreshInvoiceStatuses } from "./billing";
import { availability, cancelBooking, createPortalBooking } from "./bookings";
import { audit, byId, type Svc } from "./context";

function customerIdOf(s: Svc) {
  if (s.auth.role !== "CUSTOMER" || !s.auth.customerId) throw forbidden();
  return s.auth.customerId;
}

export async function portalOverview(s: Svc) {
  const customerId = customerIdOf(s);
  await refreshInvoiceStatuses(s);
  const [customer, contracts, invoices, bookings, requests, spaces, org] = await Promise.all([
    s.repo.customer.get(customerId),
    s.repo.contract.list({ where: { customerId, status: ["ACTIVE", "EXPIRED"] }, orderBy: { field: "endDate", dir: "desc" } }),
    s.repo.invoice.list({ where: { customerId }, orderBy: { field: "issueDate", dir: "desc" } }),
    s.repo.booking.list({ where: { customerId, status: ["CONFIRMED", "PENDING"] }, orderBy: { field: "startAt", dir: "asc" } }),
    s.repo.serviceRequest.list({ where: { customerId }, orderBy: { field: "createdAt", dir: "desc" } }),
    s.repo.space.list(),
    s.repo.organization(),
  ]);
  if (!customer) throw notFound("Pelanggan");
  const smap = byId(spaces);
  const today = businessToday(s.now).getTime();
  const open = invoices.filter((i) => OPEN_INVOICE.includes(i.status));
  return {
    customer: { id: customer.id, name: customer.name, contactName: customer.contactName, email: customer.email, phone: customer.phone },
    organization: { name: org.name, phone: org.phone, email: org.email, address: org.address, bankName: org.bankName, bankAccountNo: org.bankAccountNo, bankAccountName: org.bankAccountName },
    stats: {
      outstanding: open.reduce((a, i) => a + outstandingOf(i), 0),
      openInvoices: open.length,
      activeContracts: contracts.filter((c) => c.status === "ACTIVE").length,
      upcomingBookings: bookings.filter((b) => new Date(b.endAt).getTime() >= s.now.getTime()).length,
      openRequests: requests.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length,
    },
    contracts: contracts.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
      monthlyFee: c.monthlyFee,
      billingCycle: c.billingCycle,
      spaceName: c.spaceId ? smap.get(c.spaceId)?.name ?? null : null,
      daysLeft: Math.ceil((new Date(c.endDate).getTime() - today) / 86_400_000),
    })),
    invoices: invoices.filter((i) => i.status !== "DRAFT").map((i) => ({ ...i, outstanding: outstandingOf(i) })),
    bookings: bookings
      .filter((b) => new Date(b.endAt).getTime() >= s.now.getTime())
      .map((b) => ({ ...b, spaceName: smap.get(b.spaceId)?.name ?? "-" })),
    requests,
  };
}

export async function portalInvoice(s: Svc, id: string) {
  const customerId = customerIdOf(s);
  const inv = await getInvoice(s, id);
  if (inv.customerId !== customerId || inv.status === "DRAFT") throw notFound("Invoice");
  return inv;
}

export async function portalSpaces(s: Svc) {
  customerIdOf(s);
  const spaces = await s.repo.space.list({ where: { isBookable: true }, orderBy: { field: "hourlyPrice", dir: "asc" } });
  return spaces
    .filter((x) => x.status !== "MAINTENANCE")
    .map((x) => ({ id: x.id, code: x.code, name: x.name, type: x.type, capacity: x.capacity, hourlyPrice: x.hourlyPrice, amenities: x.amenities, description: x.description }));
}

export async function portalAvailability(s: Svc, spaceId: string, date: string) {
  customerIdOf(s);
  return availability(s, spaceId, date);
}

export async function portalCreateBooking(s: Svc, body: unknown) {
  customerIdOf(s);
  return createPortalBooking(s, body);
}

export async function portalCancelBooking(s: Svc, id: string) {
  customerIdOf(s);
  return cancelBooking(s, id);
}

export async function portalCreateRequest(s: Svc, body: unknown) {
  const customerId = customerIdOf(s);
  const input = parse(requestSchema, body);
  const r = await s.repo.serviceRequest.create({
    customerId,
    category: input.category,
    subject: input.subject,
    description: input.description,
    priority: input.priority,
    status: "OPEN",
    response: null,
    createdById: s.auth.userId,
  });
  await audit(s, "request.create", "ServiceRequest", r.id, `Permintaan baru: ${r.subject}`);
  return r;
}
