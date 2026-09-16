import { businessToday } from "../domain/dates";
import { AppError, conflict } from "../domain/errors";
import type { SpaceStatus, SpaceType } from "../domain/types";
import {
  floorSchema,
  floorUpdateSchema,
  locationSchema,
  parse,
  productSchema,
  productUpdateSchema,
  spaceSchema,
  spaceUpdateSchema,
} from "../domain/validation";
import { audit, byId, includesText, mustGet, type Svc } from "./context";

// ---------------- Lokasi & lantai ----------------

export async function listLocations(s: Svc) {
  const [locations, floors, spaces] = await Promise.all([
    s.repo.location.list({ orderBy: { field: "createdAt", dir: "asc" } }),
    s.repo.floor.list({ orderBy: { field: "level", dir: "asc" } }),
    s.repo.space.list(),
  ]);
  return locations.map((l) => ({
    ...l,
    floors: floors
      .filter((f) => f.locationId === l.id)
      .map((f) => {
        const fs = spaces.filter((x) => x.floorId === f.id);
        return { ...f, spaceCount: fs.length, occupied: fs.filter((x) => x.status === "OCCUPIED").length };
      }),
  }));
}

export async function createLocation(s: Svc, body: unknown) {
  const input = parse(locationSchema, body);
  const l = await s.repo.location.create({ name: input.name, address: input.address ?? null });
  await audit(s, "location.create", "Location", l.id, `Lokasi baru: ${l.name}`);
  return l;
}

export async function updateLocation(s: Svc, id: string, body: unknown) {
  const input = parse(locationSchema.partial(), body);
  await mustGet(s.repo.location.get(id), "Lokasi");
  return s.repo.location.update(id, input);
}

export async function createFloor(s: Svc, body: unknown) {
  const input = parse(floorSchema, body);
  await mustGet(s.repo.location.get(input.locationId), "Lokasi");
  const f = await s.repo.floor.create(input);
  await audit(s, "floor.create", "Floor", f.id, `Lantai baru: ${f.name}`);
  return f;
}

export async function updateFloor(s: Svc, id: string, body: unknown) {
  const input = parse(floorUpdateSchema, body);
  await mustGet(s.repo.floor.get(id), "Lantai");
  return s.repo.floor.update(id, input);
}

export async function deleteFloor(s: Svc, id: string) {
  const f = await mustGet(s.repo.floor.get(id), "Lantai");
  if ((await s.repo.space.count({ floorId: id })) > 0) throw conflict("Hapus atau pindahkan semua ruang di lantai ini terlebih dahulu");
  await s.repo.floor.delete(id);
  await audit(s, "floor.delete", "Floor", id, `Menghapus lantai ${f.name}`);
  return { ok: true };
}

// ---------------- Ruang ----------------

export async function listSpaces(s: Svc, q: { floorId?: string; type?: string; status?: string; q?: string; bookable?: string }) {
  const [spaces, floors, locations] = await Promise.all([
    s.repo.space.list({
      where: {
        ...(q.floorId ? { floorId: q.floorId } : {}),
        ...(q.type ? { type: q.type as SpaceType } : {}),
        ...(q.status ? { status: q.status as SpaceStatus } : {}),
        ...(q.bookable ? { isBookable: q.bookable === "true" } : {}),
      },
      orderBy: { field: "code", dir: "asc" },
    }),
    s.repo.floor.list(),
    s.repo.location.list(),
  ]);
  const fmap = byId(floors);
  const lmap = byId(locations);
  return spaces
    .filter((x) => includesText([x.code, x.name], q.q))
    .map((x) => {
      const f = fmap.get(x.floorId);
      return { ...x, floorName: f?.name ?? "-", locationName: f ? lmap.get(f.locationId)?.name ?? "-" : "-" };
    });
}

export async function spaceStats(s: Svc) {
  const spaces = await s.repo.space.list();
  const rentable = spaces.filter((x) => !x.isBookable);
  const occupied = rentable.filter((x) => x.status === "OCCUPIED").length;
  return {
    total: spaces.length,
    rentable: rentable.length,
    occupied,
    available: rentable.filter((x) => x.status === "AVAILABLE").length,
    maintenance: spaces.filter((x) => x.status === "MAINTENANCE").length,
    bookable: spaces.filter((x) => x.isBookable).length,
    occupancyRate: rentable.length ? Math.round((occupied / rentable.length) * 1000) / 10 : 0,
  };
}

export async function floorPlan(s: Svc, floorId: string) {
  const floor = await mustGet(s.repo.floor.get(floorId), "Lantai");
  const [spaces, contracts, customers, bookings] = await Promise.all([
    s.repo.space.list({ where: { floorId }, orderBy: { field: "code", dir: "asc" } }),
    s.repo.contract.list({ where: { status: "ACTIVE" } }),
    s.repo.customer.list(),
    s.repo.booking.list({ where: { status: "CONFIRMED" } }),
  ]);
  const cmap = byId(customers);
  const now = s.now.getTime();
  const today = businessToday(s.now);
  return {
    floor,
    spaces: spaces.map((x) => {
      const active = contracts.filter((c) => c.spaceId === x.id);
      const current = bookings.find((b) => b.spaceId === x.id && new Date(b.startAt).getTime() <= now && new Date(b.endAt).getTime() > now);
      const todayCount = bookings.filter(
        (b) => b.spaceId === x.id && new Date(b.startAt).getTime() >= today.getTime() - 7 * 3600_000 && new Date(b.startAt).getTime() < today.getTime() + 17 * 3600_000,
      ).length;
      return {
        ...x,
        occupants: active.map((c) => ({ contractId: c.id, customerName: cmap.get(c.customerId)?.name ?? "-", endDate: c.endDate })),
        inUse: current ? { title: current.title, endAt: current.endAt } : null,
        bookingsToday: todayCount,
      };
    }),
  };
}

export async function getSpace(s: Svc, id: string) {
  const space = await mustGet(s.repo.space.get(id), "Ruang");
  const [floor, contracts, bookings, customers] = await Promise.all([
    s.repo.floor.get(space.floorId),
    s.repo.contract.list({ where: { spaceId: id }, orderBy: { field: "startDate", dir: "desc" } }),
    s.repo.booking.list({ where: { spaceId: id }, orderBy: { field: "startAt", dir: "desc" }, take: 30 }),
    s.repo.customer.list(),
  ]);
  const cmap = byId(customers);
  return {
    ...space,
    floor,
    contracts: contracts.map((c) => ({ ...c, customerName: cmap.get(c.customerId)?.name ?? "-" })),
    bookings: bookings.map((b) => ({ ...b, customerName: b.customerId ? cmap.get(b.customerId)?.name ?? "-" : b.guestName })),
  };
}

function assertInsideGrid(pos: { posX: number; posY: number; width: number; height: number }, floor: { gridCols: number; gridRows: number }) {
  if (pos.posX + pos.width > floor.gridCols || pos.posY + pos.height > floor.gridRows) {
    throw new AppError("VALIDATION", `Posisi melebihi denah (${floor.gridCols}×${floor.gridRows} kotak)`, { posX: "di luar denah" });
  }
}

export async function createSpace(s: Svc, body: unknown) {
  const input = parse(spaceSchema, body);
  const floor = await mustGet(s.repo.floor.get(input.floorId), "Lantai");
  assertInsideGrid(input, floor);
  if (await s.repo.space.findFirst({ code: input.code })) {
    throw new AppError("CONFLICT", `Kode ruang ${input.code} sudah dipakai`, { code: "sudah dipakai" });
  }
  const space = await s.repo.space.create({ ...input, areaSqm: input.areaSqm ?? null, description: input.description ?? null });
  await audit(s, "space.create", "Space", space.id, `Ruang baru: ${space.code} ${space.name}`);
  return space;
}

export async function updateSpace(s: Svc, id: string, body: unknown) {
  const input = parse(spaceUpdateSchema, body);
  const current = await mustGet(s.repo.space.get(id), "Ruang");
  const floor = await mustGet(s.repo.floor.get(input.floorId ?? current.floorId), "Lantai");
  assertInsideGrid(
    {
      posX: input.posX ?? current.posX,
      posY: input.posY ?? current.posY,
      width: input.width ?? current.width,
      height: input.height ?? current.height,
    },
    floor,
  );
  if (input.code && input.code !== current.code && (await s.repo.space.findFirst({ code: input.code }))) {
    throw new AppError("CONFLICT", `Kode ruang ${input.code} sudah dipakai`, { code: "sudah dipakai" });
  }
  if (input.status === "AVAILABLE" && current.status === "OCCUPIED") {
    const active = await s.repo.contract.count({ spaceId: id, status: "ACTIVE" });
    if (active > 0) throw conflict("Ruang masih terikat kontrak aktif. Terminasi kontrak terlebih dahulu.");
  }
  const space = await s.repo.space.update(id, input);
  await audit(s, "space.update", "Space", id, `Mengubah ruang ${space.code}`);
  return space;
}

export async function deleteSpace(s: Svc, id: string) {
  const space = await mustGet(s.repo.space.get(id), "Ruang");
  const [contracts, bookings] = await Promise.all([s.repo.contract.count({ spaceId: id }), s.repo.booking.count({ spaceId: id })]);
  if (contracts > 0 || bookings > 0) throw conflict("Ruang punya riwayat kontrak/booking. Set status Maintenance sebagai gantinya.");
  await s.repo.space.delete(id);
  await audit(s, "space.delete", "Space", id, `Menghapus ruang ${space.code}`);
  return { ok: true };
}

// ---------------- Katalog produk & layanan ----------------

export async function listProducts(s: Svc, q: { active?: string }) {
  return s.repo.product.list({
    where: q.active ? { isActive: q.active === "true" } : undefined,
    orderBy: { field: "category", dir: "asc" },
  });
}

export async function createProduct(s: Svc, body: unknown) {
  const input = parse(productSchema, body);
  const p = await s.repo.product.create({ ...input, description: input.description ?? null });
  await audit(s, "product.create", "Product", p.id, `Produk baru: ${p.name}`);
  return p;
}

export async function updateProduct(s: Svc, id: string, body: unknown) {
  const input = parse(productUpdateSchema, body);
  await mustGet(s.repo.product.get(id), "Produk");
  const p = await s.repo.product.update(id, input);
  await audit(s, "product.update", "Product", id, `Mengubah produk ${p.name}`);
  return p;
}

export async function deleteProduct(s: Svc, id: string) {
  const p = await mustGet(s.repo.product.get(id), "Produk");
  const used = (await s.repo.contract.count({ productId: id })) + (await s.repo.invoiceItem.count({ productId: id }));
  if (used > 0) {
    await s.repo.product.update(id, { isActive: false });
    return { ok: true, archived: true };
  }
  await s.repo.product.delete(id);
  await audit(s, "product.delete", "Product", id, `Menghapus produk ${p.name}`);
  return { ok: true, archived: false };
}
