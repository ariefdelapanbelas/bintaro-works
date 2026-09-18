// Aplikasi pelanggan (halaman publik): katalog layanan, ketersediaan ruang,
// pengajuan sewa (masuk CRM), dan pendaftaran akun mandiri.
// Semua endpoint di sini TIDAK memerlukan sesi — karena itu dibatasi ketat:
// hanya organisasi dengan publicEnabled, data yang ditampilkan seminimal mungkin,
// dan ada rate limit per IP di router.
import { addDays, businessToday, overlaps, startOfDayUTC } from "../domain/dates";
import { AppError, notFound } from "../domain/errors";
import type { AuthContext, Organization } from "../domain/types";
import { parse, publicInquirySchema, publicRegisterSchema } from "../domain/validation";
import type { Deps } from "../repo/types";
import type { SessionPayload } from "./auth";
import { makeSvc } from "./context";

async function publicOrg(deps: Deps, slug: string): Promise<Organization> {
  const org = await deps.db.findOrganizationBySlug(slug);
  if (!org || !org.publicEnabled) throw notFound("Halaman");
  return org;
}

/** Konteks "sistem" untuk aksi publik (audit tercatat atas nama Website). */
function systemCtx(org: Organization): AuthContext {
  return { userId: "public", userName: "Website publik", organizationId: org.id, role: "ADMIN", customerId: null };
}

export async function publicInfo(deps: Deps, slug: string) {
  const org = await publicOrg(deps, slug);
  const repo = deps.db.forOrg(org.id);
  const [spaces, products, locations] = await Promise.all([
    repo.space.list({ where: { isBookable: true }, orderBy: { field: "hourlyPrice", dir: "asc" } }),
    repo.product.list({ where: { isActive: true }, orderBy: { field: "category", dir: "asc" } }),
    repo.location.list(),
  ]);
  return {
    organization: {
      name: org.name,
      slug: org.slug,
      tagline: org.publicTagline,
      address: org.address,
      phone: org.phone,
      whatsapp: org.whatsapp,
      email: org.email,
      taxRate: org.taxRate,
    },
    locations: locations.map((l) => ({ name: l.name, address: l.address })),
    rooms: spaces
      .filter((s) => s.status !== "MAINTENANCE")
      .map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        amenities: s.amenities,
        description: s.description,
      })),
    products: products.map((p) => ({ id: p.id, name: p.name, category: p.category, unit: p.unit, price: p.price, description: p.description })),
    availableSpaces: spaces.length,
  };
}

/** Jam yang sudah terisi pada satu ruang & tanggal (judul disembunyikan). */
export async function publicAvailability(deps: Deps, slug: string, spaceId: string, dateStr: string) {
  const org = await publicOrg(deps, slug);
  const repo = deps.db.forOrg(org.id);
  const space = await repo.space.get(spaceId);
  if (!space || !space.isBookable || space.status === "MAINTENANCE") throw notFound("Ruang");
  const day = startOfDayUTC(new Date(dateStr));
  if (Number.isNaN(day.getTime())) throw new AppError("VALIDATION", "Tanggal tidak valid");
  const bookings = await repo.booking.list({ where: { spaceId, status: ["PENDING", "CONFIRMED"] } });
  return bookings
    .filter((b) => overlaps(addDays(day, -1), addDays(day, 2), new Date(b.startAt), new Date(b.endAt)))
    .map((b) => ({ startAt: b.startAt, endAt: b.endAt }));
}

/** Form "tanya / ajukan sewa" → lead baru di CRM. */
export async function publicInquiry(deps: Deps, slug: string, body: unknown) {
  const org = await publicOrg(deps, slug);
  const input = parse(publicInquirySchema, body);
  const s = makeSvc(deps, systemCtx(org));
  const notes = [
    input.people ? `Perkiraan ${input.people} orang` : null,
    input.startMonth ? `Rencana mulai: ${input.startMonth}` : null,
    input.message,
  ]
    .filter(Boolean)
    .join("\n");
  const lead = await s.repo.lead.create({
    name: input.name,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone,
    source: "WEBSITE",
    interest: input.interest,
    stage: "NEW",
    expectedValue: 0,
    ownerId: null,
    customerId: null,
    nextFollowUpAt: businessToday(s.now),
    lostReason: null,
    notes: notes || null,
  });
  await s.repo.auditLog.create({
    userId: null,
    userName: "Website publik",
    action: "lead.public",
    entity: "Lead",
    entityId: lead.id,
    summary: `Pengajuan dari website: ${input.name}${input.company ? ` (${input.company})` : ""}`,
  });
  return { ok: true, message: "Terima kasih! Tim kami akan menghubungi Anda maksimal 1 hari kerja." };
}

/** Pendaftaran akun pelanggan mandiri → Customer + user portal + sesi login. */
export async function publicRegister(deps: Deps, slug: string, body: unknown): Promise<{ session: SessionPayload; customerId: string }> {
  const org = await publicOrg(deps, slug);
  const input = parse(publicRegisterSchema, body);
  const repo = deps.db.forOrg(org.id);

  // Email yang sudah punya akun tidak bisa dipakai mendaftar lagi (mencegah
  // orang lain menautkan email milik seseorang ke organisasi ini).
  if (await deps.db.findUserByEmail(input.email)) {
    throw new AppError("CONFLICT", "Email ini sudah terdaftar. Silakan masuk memakai kata sandi Anda.", { email: "sudah terdaftar" });
  }

  const customer = await repo.customer.create({
    type: input.company ? "COMPANY" : "INDIVIDUAL",
    name: input.company || input.name,
    contactName: input.company ? input.name : null,
    email: input.email,
    phone: input.phone,
    npwp: null,
    address: null,
    industry: null,
    status: "ACTIVE",
    notes: "Mendaftar sendiri lewat aplikasi pelanggan.",
  });
  const user = await deps.db.createUser({ email: input.email, name: input.name, passwordHash: await deps.hasher.hash(input.password), phone: input.phone });
  await repo.membership.create({ userId: user.id, role: "CUSTOMER", customerId: customer.id });
  await repo.auditLog.create({
    userId: null,
    userName: "Website publik",
    action: "customer.selfsignup",
    entity: "Customer",
    entityId: customer.id,
    summary: `Pendaftaran mandiri: ${customer.name}`,
  });
  return { session: { uid: user.id, oid: org.id, role: "CUSTOMER" }, customerId: customer.id };
}
