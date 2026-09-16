import { AppError, conflict } from "../domain/errors";
import type { CustomerStatus } from "../domain/types";
import { customerSchema, customerUpdateSchema, parse, portalUserSchema } from "../domain/validation";
import { OPEN_INVOICE, outstandingOf } from "./billing";
import { audit, byId, includesText, mustGet, type Svc } from "./context";

export async function listCustomers(s: Svc, q: { q?: string; status?: string }) {
  const [customers, contracts, invoices] = await Promise.all([
    s.repo.customer.list({
      where: q.status ? { status: q.status as CustomerStatus } : undefined,
      orderBy: { field: "name", dir: "asc" },
    }),
    s.repo.contract.list({ where: { status: "ACTIVE" } }),
    s.repo.invoice.list({ where: { status: OPEN_INVOICE } }),
  ]);
  return customers
    .filter((c) => includesText([c.name, c.contactName, c.email, c.phone], q.q))
    .map((c) => ({
      ...c,
      activeContracts: contracts.filter((k) => k.customerId === c.id).length,
      mrr: contracts.filter((k) => k.customerId === c.id).reduce((a, k) => a + k.monthlyFee, 0),
      outstanding: invoices.filter((i) => i.customerId === c.id).reduce((a, i) => a + outstandingOf(i), 0),
    }));
}

export async function getCustomer(s: Svc, id: string) {
  const customer = await mustGet(s.repo.customer.get(id), "Pelanggan");
  const [contracts, invoices, bookings, memberships, requests, spaces] = await Promise.all([
    s.repo.contract.list({ where: { customerId: id }, orderBy: { field: "startDate", dir: "desc" } }),
    s.repo.invoice.list({ where: { customerId: id }, orderBy: { field: "issueDate", dir: "desc" } }),
    s.repo.booking.list({ where: { customerId: id }, orderBy: { field: "startAt", dir: "desc" }, take: 20 }),
    s.repo.membership.list({ where: { customerId: id, role: "CUSTOMER" } }),
    s.repo.serviceRequest.list({ where: { customerId: id }, orderBy: { field: "createdAt", dir: "desc" } }),
    s.repo.space.list(),
  ]);
  const smap = byId(spaces);
  const portalUsers = [];
  for (const m of memberships) {
    const u = await s.deps.db.getUser(m.userId);
    if (u) portalUsers.push({ membershipId: m.id, userId: u.id, name: u.name, email: u.email, lastLoginAt: u.lastLoginAt });
  }
  return {
    ...customer,
    contracts: contracts.map((c) => ({ ...c, spaceName: c.spaceId ? smap.get(c.spaceId)?.name ?? null : null })),
    invoices: invoices.map((i) => ({ ...i, outstanding: outstandingOf(i) })),
    bookings: bookings.map((b) => ({ ...b, spaceName: smap.get(b.spaceId)?.name ?? "-" })),
    requests,
    portalUsers,
    stats: {
      mrr: contracts.filter((c) => c.status === "ACTIVE").reduce((a, c) => a + c.monthlyFee, 0),
      outstanding: invoices.filter((i) => OPEN_INVOICE.includes(i.status)).reduce((a, i) => a + outstandingOf(i), 0),
      lifetimePaid: invoices.reduce((a, i) => a + i.amountPaid, 0),
    },
  };
}

export async function createCustomer(s: Svc, body: unknown) {
  const input = parse(customerSchema, body);
  const c = await s.repo.customer.create({
    type: input.type,
    name: input.name,
    contactName: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    npwp: input.npwp ?? null,
    address: input.address ?? null,
    industry: input.industry ?? null,
    status: input.status,
    notes: input.notes ?? null,
  });
  await audit(s, "customer.create", "Customer", c.id, `Pelanggan baru: ${c.name}`);
  return c;
}

export async function updateCustomer(s: Svc, id: string, body: unknown) {
  const input = parse(customerUpdateSchema, body);
  await mustGet(s.repo.customer.get(id), "Pelanggan");
  const c = await s.repo.customer.update(id, input);
  await audit(s, "customer.update", "Customer", id, `Mengubah pelanggan ${c.name}`);
  return c;
}

export async function deleteCustomer(s: Svc, id: string) {
  const c = await mustGet(s.repo.customer.get(id), "Pelanggan");
  const [contracts, invoices] = await Promise.all([
    s.repo.contract.count({ customerId: id }),
    s.repo.invoice.count({ customerId: id }),
  ]);
  if (contracts > 0 || invoices > 0) {
    throw conflict("Pelanggan memiliki kontrak/invoice. Ubah status menjadi Tidak Aktif sebagai gantinya.");
  }
  await s.repo.membership.deleteWhere({ customerId: id });
  await s.repo.serviceRequest.deleteWhere({ customerId: id });
  await s.repo.customer.delete(id);
  await audit(s, "customer.delete", "Customer", id, `Menghapus pelanggan ${c.name}`);
  return { ok: true };
}

/** Buat akun login portal untuk pelanggan. */
export async function createPortalUser(s: Svc, customerId: string, body: unknown) {
  const input = parse(portalUserSchema, body);
  const customer = await mustGet(s.repo.customer.get(customerId), "Pelanggan");
  let user = await s.deps.db.findUserByEmail(input.email);
  if (user) {
    const ms = await s.deps.db.membershipsOfUser(user.id);
    if (ms.some((m) => m.organizationId === s.auth.organizationId)) {
      throw new AppError("CONFLICT", "Email ini sudah punya akses di organisasi Anda", { email: "sudah terdaftar" });
    }
  } else {
    user = await s.deps.db.createUser({ email: input.email, name: input.name, passwordHash: await s.deps.hasher.hash(input.password) });
  }
  const m = await s.repo.membership.create({ userId: user.id, role: "CUSTOMER", customerId });
  await audit(s, "portal.user.create", "Customer", customerId, `Akun portal ${input.email} untuk ${customer.name}`);
  return { membershipId: m.id, userId: user.id, email: user.email, name: user.name };
}

export async function removePortalUser(s: Svc, customerId: string, membershipId: string) {
  const m = await mustGet(s.repo.membership.get(membershipId), "Akses portal");
  if (m.customerId !== customerId || m.role !== "CUSTOMER") throw conflict("Akses portal tidak valid");
  await s.repo.membership.delete(membershipId);
  await audit(s, "portal.user.remove", "Customer", customerId, "Mencabut akses portal");
  return { ok: true };
}
