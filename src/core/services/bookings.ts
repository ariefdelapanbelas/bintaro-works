import { addDays, APP_TZ, overlaps, startOfDayUTC, businessToday } from "../domain/dates";
import { AppError, conflict, forbidden } from "../domain/errors";
import type { Booking, Space } from "../domain/types";
import { bookingSchema, bookingUpdateSchema, parse, portalBookingSchema } from "../domain/validation";
import { createInvoiceRecord } from "./billing";
import { audit, byId, mustGet, tx, type Svc } from "./context";

export function bookingAmount(space: Pick<Space, "hourlyPrice">, startAt: Date, endAt: Date) {
  const minutes = Math.max(0, (endAt.getTime() - startAt.getTime()) / 60_000);
  return Math.round((space.hourlyPrice * minutes) / 60);
}

async function assertSlotFree(s: Svc, spaceId: string, startAt: Date, endAt: Date, exceptId?: string) {
  const space = await mustGet(s.repo.space.get(spaceId), "Ruang");
  if (!space.isBookable) throw new AppError("VALIDATION", `Ruang ${space.code} tidak bisa dibooking per jam`, { spaceId: "tidak bisa dibooking" });
  if (space.status === "MAINTENANCE") throw conflict(`Ruang ${space.code} sedang maintenance`);
  const existing = await s.repo.booking.list({ where: { spaceId, status: ["PENDING", "CONFIRMED"] } });
  const clash = existing.find((b) => b.id !== exceptId && overlaps(startAt, endAt, new Date(b.startAt), new Date(b.endAt)));
  if (clash) {
    const fmt = (d: Date) => d.toLocaleTimeString("id-ID", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" });
    throw conflict(`Jadwal bentrok dengan booking lain (${fmt(new Date(clash.startAt))}–${fmt(new Date(clash.endAt))} WIB)`);
  }
  return space;
}

export async function listBookings(s: Svc, q: { from?: string; to?: string; spaceId?: string; customerId?: string; status?: string }) {
  const from = q.from ? new Date(q.from) : addDays(businessToday(s.now), -7);
  const to = q.to ? new Date(q.to) : addDays(businessToday(s.now), 60);
  const [bookings, spaces, customers] = await Promise.all([
    s.repo.booking.list({
      where: {
        ...(q.spaceId ? { spaceId: q.spaceId } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.status ? { status: q.status as Booking["status"] } : {}),
      },
      orderBy: { field: "startAt", dir: "asc" },
    }),
    s.repo.space.list(),
    s.repo.customer.list(),
  ]);
  const smap = byId(spaces);
  const cmap = byId(customers);
  return bookings
    .filter((b) => overlaps(from, to, new Date(b.startAt), new Date(b.endAt)))
    .map((b) => ({
      ...b,
      spaceName: smap.get(b.spaceId)?.name ?? "-",
      spaceCode: smap.get(b.spaceId)?.code ?? "-",
      spaceType: smap.get(b.spaceId)?.type ?? null,
      customerName: b.customerId ? cmap.get(b.customerId)?.name ?? "-" : b.guestName,
    }));
}

export async function availability(s: Svc, spaceId: string, date: string) {
  const day = startOfDayUTC(new Date(date));
  if (Number.isNaN(day.getTime())) throw new AppError("VALIDATION", "Tanggal tidak valid");
  const next = addDays(day, 1);
  const bookings = await s.repo.booking.list({ where: { spaceId, status: ["PENDING", "CONFIRMED"] } });
  return bookings
    .filter((b) => overlaps(addDays(day, -1), addDays(next, 1), new Date(b.startAt), new Date(b.endAt)))
    .map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, title: s.auth.role === "CUSTOMER" && b.customerId !== s.auth.customerId ? "Terisi" : b.title }));
}

async function createBookingCore(
  s: Svc,
  input: {
    spaceId: string;
    customerId: string | null;
    guestName: string | null;
    title: string;
    startAt: Date;
    endAt: Date;
    attendees: number;
    notes: string | null;
    createInvoice: boolean;
    source: Booking["source"];
  },
) {
  return tx(s, async (t) => {
    const space = await assertSlotFree(t, input.spaceId, input.startAt, input.endAt);
    if (input.attendees > space.capacity) {
      throw new AppError("VALIDATION", `Kapasitas ${space.name} maksimal ${space.capacity} orang`, { attendees: "melebihi kapasitas" });
    }
    const amount = bookingAmount(space, input.startAt, input.endAt);
    const booking = await t.repo.booking.create({
      spaceId: input.spaceId,
      customerId: input.customerId,
      guestName: input.guestName,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      attendees: input.attendees,
      status: "CONFIRMED",
      source: input.source,
      amount,
      invoiceId: null,
      notes: input.notes,
    });
    if (input.createInvoice && input.customerId && amount > 0) {
      const hours = (input.endAt.getTime() - input.startAt.getTime()) / 3_600_000;
      const invoice = await createInvoiceRecord(t, {
        customerId: input.customerId,
        bookingId: booking.id,
        issueDate: businessToday(t.now),
        dueDate: addDays(businessToday(t.now), 3),
        items: [
          {
            description: `Booking ${space.name} (${hours.toLocaleString("id-ID")} jam) — ${input.title}`,
            quantity: 1,
            unitPrice: amount,
          },
        ],
        status: "SENT",
      });
      return t.repo.booking.update(booking.id, { invoiceId: invoice.id });
    }
    return booking;
  });
}

export async function createBooking(s: Svc, body: unknown) {
  const input = parse(bookingSchema, body);
  if (input.customerId) await mustGet(s.repo.customer.get(input.customerId), "Pelanggan");
  const booking = await createBookingCore(s, {
    spaceId: input.spaceId,
    customerId: input.customerId ?? null,
    guestName: input.guestName ?? null,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    attendees: input.attendees,
    notes: input.notes ?? null,
    createInvoice: input.createInvoice,
    source: "ADMIN",
  });
  await audit(s, "booking.create", "Booking", booking.id, `Booking "${booking.title}"`);
  return booking;
}

export async function createPortalBooking(s: Svc, body: unknown) {
  if (!s.auth.customerId) throw forbidden();
  const input = parse(portalBookingSchema, body);
  if (input.startAt.getTime() < s.now.getTime()) {
    throw new AppError("VALIDATION", "Waktu mulai sudah lewat", { startAt: "sudah lewat" });
  }
  const booking = await createBookingCore(s, {
    spaceId: input.spaceId,
    customerId: s.auth.customerId,
    guestName: null,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    attendees: input.attendees,
    notes: input.notes ?? null,
    createInvoice: true,
    source: "PORTAL",
  });
  await audit(s, "booking.create", "Booking", booking.id, `Booking portal "${booking.title}"`);
  return booking;
}

export async function updateBooking(s: Svc, id: string, body: unknown) {
  const input = parse(bookingUpdateSchema, body);
  const updated = await tx(s, async (t) => {
    const b = await mustGet(t.repo.booking.get(id), "Booking");
    if (b.status === "CANCELLED") throw conflict("Booking sudah dibatalkan");
    const startAt = input.startAt ?? new Date(b.startAt);
    const endAt = input.endAt ?? new Date(b.endAt);
    if (endAt.getTime() <= startAt.getTime()) throw new AppError("VALIDATION", "Waktu selesai harus setelah mulai", { endAt: "tidak valid" });
    if (input.startAt || input.endAt) await assertSlotFree(t, b.spaceId, startAt, endAt, b.id);
    if (input.status === "CANCELLED") return cancelCore(t, b);
    return t.repo.booking.update(id, {
      title: input.title,
      startAt,
      endAt,
      attendees: input.attendees,
      status: input.status,
      notes: input.notes,
    });
  });
  await audit(s, "booking.update", "Booking", id, `Mengubah booking "${updated.title}"`);
  return updated;
}

async function cancelCore(t: Svc, b: Booking) {
  if (b.invoiceId) {
    const inv = await t.repo.invoice.get(b.invoiceId);
    if (inv && inv.amountPaid === 0 && inv.status !== "VOID") await t.repo.invoice.update(inv.id, { status: "VOID" });
  }
  return t.repo.booking.update(b.id, { status: "CANCELLED" });
}

export async function cancelBooking(s: Svc, id: string) {
  const updated = await tx(s, async (t) => {
    const b = await mustGet(t.repo.booking.get(id), "Booking");
    if (t.auth.role === "CUSTOMER") {
      if (b.customerId !== t.auth.customerId) throw forbidden();
      if (new Date(b.startAt).getTime() < t.now.getTime()) throw conflict("Booking yang sudah berjalan tidak bisa dibatalkan");
    }
    if (b.status === "CANCELLED") throw conflict("Booking sudah dibatalkan");
    if (b.status === "COMPLETED") throw conflict("Booking sudah selesai");
    return cancelCore(t, b);
  });
  await audit(s, "booking.cancel", "Booking", id, `Membatalkan booking "${updated.title}"`);
  return updated;
}
