import type { ProductCategory, ProductUnit } from "../domain/types";
import type { Deps } from "../repo/types";

export const DEFAULT_PRODUCTS: { name: string; category: ProductCategory; unit: ProductUnit; price: number; description: string }[] = [
  { name: "Private Office 4 Orang", category: "PRIVATE_OFFICE", unit: "MONTH", price: 8_500_000, description: "Ruang kantor privat full furnished, internet, listrik, pantry" },
  { name: "Virtual Office — Basic", category: "VIRTUAL_OFFICE", unit: "MONTH", price: 350_000, description: "Alamat bisnis, penerimaan surat, resepsionis" },
  { name: "Virtual Office — PKP Ready", category: "VIRTUAL_OFFICE", unit: "MONTH", price: 650_000, description: "Alamat domisili siap PKP + 4 jam meeting room/bulan" },
  { name: "Coworking Hot Desk", category: "COWORKING", unit: "MONTH", price: 1_250_000, description: "Akses area coworking hari kerja" },
  { name: "Meeting Room (per jam)", category: "MEETING_ROOM", unit: "HOUR", price: 150_000, description: "Ruang meeting dengan TV & whiteboard" },
  { name: "Podcast Studio (per jam)", category: "STUDIO", unit: "HOUR", price: 350_000, description: "Studio kedap suara, 4 mic, kamera, operator" },
  { name: "Live Streaming Studio (per jam)", category: "STUDIO", unit: "HOUR", price: 450_000, description: "Setup live selling, lighting, 2 kamera" },
  { name: "Parkir Mobil Bulanan", category: "PARKING", unit: "MONTH", price: 400_000, description: "Slot parkir reserved" },
  { name: "Cetak Dokumen A4 (per lembar)", category: "PRINTING", unit: "PIECE", price: 2_000, description: "Cetak warna A4" },
  { name: "Pendirian PT Perorangan", category: "BUSINESS_SERVICE", unit: "PACKAGE", price: 2_500_000, description: "Pengurusan akta, NIB, NPWP badan" },
  { name: "Jasa Pembukuan Bulanan", category: "BUSINESS_SERVICE", unit: "MONTH", price: 1_500_000, description: "Pembukuan & lapor pajak bulanan" },
  { name: "Loker Pribadi", category: "ADDON", unit: "MONTH", price: 150_000, description: "Loker dengan kunci" },
];

/** Buat organisasi baru lengkap dengan owner, lokasi awal, dan katalog standar. */
export async function seedOrganizationDefaults(
  deps: Deps,
  input: { organizationName: string; slug: string; ownerName: string; ownerEmail: string; passwordHash: string },
) {
  const organization = await deps.db.createOrganization({
    name: input.organizationName,
    slug: input.slug,
    email: input.ownerEmail,
  });
  const user = await deps.db.createUser({ email: input.ownerEmail, name: input.ownerName, passwordHash: input.passwordHash });
  const repo = deps.db.forOrg(organization.id);
  await repo.membership.create({ userId: user.id, role: "OWNER", customerId: null });
  const location = await repo.location.create({ name: "Lokasi Utama", address: null });
  await repo.floor.create({ locationId: location.id, name: "Lantai 1", level: 1, gridCols: 12, gridRows: 8 });
  for (const p of DEFAULT_PRODUCTS) await repo.product.create({ ...p, isActive: true });
  await repo.auditLog.create({
    userId: user.id,
    userName: user.name,
    action: "org.create",
    entity: "Organization",
    entityId: organization.id,
    summary: `Organisasi ${organization.name} dibuat`,
  });
  return { organization, user };
}
