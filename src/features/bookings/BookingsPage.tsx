"use client";
import { useEffect, useMemo, useState } from "react";
import { LuCalendarPlus, LuChevronLeft, LuChevronRight, LuUsers } from "react-icons/lu";
import type { Booking, Customer, Space } from "@/core/domain/types";
import { api } from "@/client/api";
import { BOOKING_STATUS, dayLabel, hmWIB, rupiah, SPACE_TYPE_LABEL, time, todayISO, wibToISO } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { Modal, useToast } from "@/ui/overlay";
import { Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, KeyValue, PageHeader, Select, Spinner, StatusBadge, Switch, Textarea } from "@/ui/primitives";

type BookingRow = Booking & { spaceName: string; spaceCode: string; spaceType: Space["type"] | null; customerName: string | null };

export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 22;
export const TIME_OPTIONS = Array.from({ length: (CLOSE_HOUR - OPEN_HOUR) * 2 + 1 }, (_, i) => {
  const h = OPEN_HOUR + Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  const v = `${String(h).padStart(2, "0")}:${m}`;
  return { value: v, label: v };
});

function shiftDay(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const minutesWIB = (iso: string | Date) => {
  const [h, m] = hmWIB(iso).split(":").map(Number);
  return h * 60 + m;
};

/** Strip ketersediaan satu hari (jam buka–tutup) untuk satu ruang. */
export function AvailabilityStrip({ busy, selStart, selEnd }: { busy: { startAt: string; endAt: string; title: string }[]; selStart?: string; selEnd?: string }) {
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const pos = (min: number) => `${Math.max(0, Math.min(100, ((min - OPEN_HOUR * 60) / total) * 100))}%`;
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  return (
    <div>
      <div className="relative h-8 overflow-hidden rounded-md border border-line bg-good-soft/50">
        {busy.map((b, i) => {
          const s = minutesWIB(b.startAt);
          const e = minutesWIB(b.endAt);
          return <div key={i} className="hatch absolute inset-y-0 border-x border-bad/40 bg-bad-soft" style={{ left: pos(s), width: `calc(${pos(e)} - ${pos(s)})` }} title={`${b.title} ${time(b.startAt)}–${time(b.endAt)}`} />;
        })}
        {selStart && selEnd && toMin(selEnd) > toMin(selStart) && <div className="absolute inset-y-1 rounded border-2 border-accent bg-accent/20" style={{ left: pos(toMin(selStart)), width: `calc(${pos(toMin(selEnd))} - ${pos(toMin(selStart))})` }} />}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        {[7, 10, 13, 16, 19, 22].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

function BookingFormModal({ open, onClose, spaces, preset }: { open: boolean; onClose: () => void; spaces: Space[]; preset?: { spaceId?: string; date?: string; start?: string } }) {
  const toast = useToast();
  const customers = useApi<Customer[]>(open ? "/customers" : null, { status: "ACTIVE" });
  const blank = () => ({
    spaceId: preset?.spaceId ?? spaces[0]?.id ?? "",
    date: preset?.date ?? todayISO(),
    start: preset?.start ?? "10:00",
    end: preset?.start ? TIME_OPTIONS[Math.min(TIME_OPTIONS.findIndex((t) => t.value === preset.start) + 2, TIME_OPTIONS.length - 1)].value : "12:00",
    title: "",
    guest: false,
    customerId: "",
    guestName: "",
    attendees: "2",
    createInvoice: true,
    notes: "",
  });
  const [v, setV] = useState(blank());
  useEffect(() => {
    if (open) setV(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.spaceId, preset?.date, preset?.start]);
  const avail = useApi<{ id: string; startAt: string; endAt: string; title: string }[]>(open && v.spaceId ? "/bookings/availability" : null, { spaceId: v.spaceId, date: v.date });
  const space = spaces.find((s) => s.id === v.spaceId);
  const hours = (Number(v.end.slice(0, 2)) * 60 + Number(v.end.slice(3)) - (Number(v.start.slice(0, 2)) * 60 + Number(v.start.slice(3)))) / 60;
  const cost = space && hours > 0 ? Math.round(space.hourlyPrice * hours) : 0;
  const m = useMutation(() =>
    api.post("/bookings", {
      spaceId: v.spaceId,
      customerId: v.guest ? null : v.customerId || null,
      guestName: v.guest ? v.guestName : null,
      title: v.title,
      startAt: wibToISO(v.date, v.start),
      endAt: wibToISO(v.date, v.end),
      attendees: Number(v.attendees),
      createInvoice: !v.guest && v.createInvoice,
      notes: v.notes || null,
    }),
  );
  const f = m.error?.fields ?? {};
  const submit = async () => {
    try {
      await m.run();
      toast.success("Booking tersimpan");
      onClose();
    } catch {
      /* tampil */
    }
  };
  const busy = (avail.data ?? []).filter((b) => new Date(b.endAt).getTime() > new Date(wibToISO(v.date, "00:00")).getTime() && new Date(b.startAt).getTime() < new Date(wibToISO(shiftDay(v.date, 1), "00:00")).getTime());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Booking baru"
      description="Meeting room, podcast studio, live streaming, dan event space."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={m.pending}>
            Simpan booking
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        {m.error && !m.error.fields && (
          <div className="sm:col-span-2">
            <ErrorBox error={m.error} />
          </div>
        )}
        <Field label="Ruang" htmlFor="bk-space" className="sm:col-span-2" error={f.spaceId}>
          <Select id="bk-space" value={v.spaceId} onChange={(e) => setV({ ...v, spaceId: e.target.value })} options={spaces.map((s) => ({ value: s.id, label: `${s.name} · ${rupiah(s.hourlyPrice)}/jam · ${s.capacity} org` }))} />
        </Field>
        <Field label="Tanggal" htmlFor="bk-date">
          <Input id="bk-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mulai" htmlFor="bk-start">
            <Select id="bk-start" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} options={TIME_OPTIONS.slice(0, -1)} />
          </Field>
          <Field label="Selesai" htmlFor="bk-end" error={f.endAt}>
            <Select id="bk-end" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} options={TIME_OPTIONS.slice(1)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <p className="label">Ketersediaan {dayLabel(wibToISO(v.date, "12:00"))}</p>
          <AvailabilityStrip busy={busy} selStart={v.start} selEnd={v.end} />
        </div>
        <Field label="Agenda" htmlFor="bk-title" error={f.title} required className="sm:col-span-2">
          <Input id="bk-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="mis. Rekaman episode 12" invalid={!!f.title} />
        </Field>
        <div className="sm:col-span-2">
          <Switch id="bk-guest" checked={v.guest} onChange={(g) => setV({ ...v, guest: g })} label="Tamu non-pelanggan (walk-in)" />
        </div>
        {v.guest ? (
          <Field label="Nama tamu" htmlFor="bk-guestname" error={f.customerId} className="sm:col-span-2">
            <Input id="bk-guestname" value={v.guestName} onChange={(e) => setV({ ...v, guestName: e.target.value })} />
          </Field>
        ) : (
          <Field label="Pelanggan" htmlFor="bk-customer" error={f.customerId} className="sm:col-span-2">
            <Select id="bk-customer" value={v.customerId} onChange={(e) => setV({ ...v, customerId: e.target.value })} placeholder="Pilih pelanggan…" options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        )}
        <Field label="Jumlah peserta" htmlFor="bk-att" error={f.attendees} hint={space ? `Maks. ${space.capacity} orang` : undefined}>
          <Input id="bk-att" type="number" min={1} value={v.attendees} onChange={(e) => setV({ ...v, attendees: e.target.value })} />
        </Field>
        <div className="flex items-end pb-2">{!v.guest && <Switch id="bk-invoice" checked={v.createInvoice} onChange={(b) => setV({ ...v, createInvoice: b })} label="Terbitkan invoice" />}</div>
        <Field label="Catatan" htmlFor="bk-notes" className="sm:col-span-2">
          <Textarea id="bk-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Kebutuhan setup, konsumsi, operator…" />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-raised px-4 py-3 text-[13px] sm:col-span-2">
          <span className="text-muted">
            Estimasi biaya {hours > 0 ? `(${hours.toLocaleString("id-ID")} jam)` : ""} <span className="text-faint">· sebelum PPN</span>
          </span>
          <span className="num font-display text-lg font-bold">{rupiah(cost)}</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function BookingsPage() {
  const { can } = useSession();
  const toast = useToast();
  const [day, setDay] = useState(todayISO());
  const spaces = useApi<Space[]>("/spaces", { bookable: "true" });
  const from = wibToISO(day, "00:00");
  const to = wibToISO(shiftDay(day, 1), "00:00");
  const { data, error, reload } = useApi<BookingRow[]>("/bookings", { from, to });
  const [nowIso] = useState(() => new Date().toISOString());
  const upcoming = useApi<BookingRow[]>("/bookings", { from: nowIso, to: wibToISO(shiftDay(todayISO(), 14), "00:00") });
  const newParam = useSearchParam("new");
  const presetSpace = useSearchParam("spaceId");
  const [form, setForm] = useState<{ open: boolean; preset?: { spaceId?: string; date?: string; start?: string } }>({ open: newParam === "1", preset: presetSpace ? { spaceId: presetSpace } : undefined });
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const update = useMutation((id: string, body: unknown) => api.patch(`/bookings/${id}`, body));
  const cancel = useMutation((id: string) => api.post(`/bookings/${id}/cancel`));
  const manage = can("bookings.manage");

  const rooms = (spaces.data ?? []).filter((s) => s.status !== "MAINTENANCE");
  const hours = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const nowMin = day === todayISO() ? minutesWIB(new Date()) : null;
  const dayRevenue = useMemo(() => (data ?? []).filter((b) => b.status !== "CANCELLED").reduce((a, b) => a + b.amount, 0), [data]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Booking"
        description="Jadwal meeting room & studio per jam. Klik slot kosong untuk membuat booking."
        actions={
          manage && (
            <Button variant="primary" icon={<LuCalendarPlus className="h-4 w-4" />} onClick={() => setForm({ open: true, preset: { date: day } })} disabled={!rooms.length}>
              Booking baru
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" aria-label="Hari sebelumnya" onClick={() => setDay(shiftDay(day, -1))}>
            <LuChevronLeft className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDay(todayISO())} disabled={day === todayISO()}>
            Hari ini
          </Button>
          <Button size="icon" aria-label="Hari berikutnya" onClick={() => setDay(shiftDay(day, 1))}>
            <LuChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Input id="bk-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" />
        <h2 className="ml-1 text-[17px] font-semibold">{dayLabel(wibToISO(day, "12:00"))}</h2>
        <div className="ml-auto flex gap-2 text-xs text-muted">
          <Badge tone="info" dot={false}>
            {(data ?? []).filter((b) => b.status !== "CANCELLED").length} booking
          </Badge>
          <Badge tone="accent" dot={false}>
            {rupiah(dayRevenue)}
          </Badge>
        </div>
      </div>
      <ErrorBox error={error ?? spaces.error} onRetry={reload} />

      <Card bodyClass="p-0">
        {!data || !spaces.data ? (
          <Spinner />
        ) : rooms.length === 0 ? (
          <Empty title="Belum ada ruang yang bisa dibooking" description="Tandai ruang sebagai 'Disewakan per jam' di menu Ruang." />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[190px_1fr] border-b border-line bg-raised">
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Ruang</div>
                <div className="relative h-8">
                  {hours.map((h) => (
                    <span key={h} className="absolute top-2 -translate-x-1/2 font-mono text-[10.5px] text-faint" style={{ left: `${((h - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR)) * 100}%` }}>
                      {h > OPEN_HOUR ? `${String(h).padStart(2, "0")}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              {rooms.map((room) => {
                const rows = (data ?? []).filter((b) => b.spaceId === room.id && b.status !== "CANCELLED");
                return (
                  <div key={room.id} className="grid grid-cols-[190px_1fr] border-b border-line last:border-b-0">
                    <div className="flex flex-col justify-center px-4 py-3">
                      <span className="text-[13px] font-semibold leading-tight">{room.name}</span>
                      <span className="flex items-center gap-2 text-[11.5px] text-muted">
                        {SPACE_TYPE_LABEL[room.type]} · <LuUsers className="h-3 w-3" /> {room.capacity}
                      </span>
                    </div>
                    <div className="relative h-[68px]">
                      {hours.map((h) => (
                        <button
                          key={h}
                          disabled={!manage}
                          aria-label={`Booking ${room.name} jam ${h}:00`}
                          onClick={() => setForm({ open: true, preset: { spaceId: room.id, date: day, start: `${String(h).padStart(2, "0")}:00` } })}
                          className="absolute inset-y-0 border-l border-line/70 transition-colors hover:bg-accent-soft/60 disabled:hover:bg-transparent"
                          style={{ left: `${((h - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR)) * 100}%`, width: `${100 / (CLOSE_HOUR - OPEN_HOUR)}%` }}
                        />
                      ))}
                      {nowMin !== null && nowMin > OPEN_HOUR * 60 && nowMin < CLOSE_HOUR * 60 && <div className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-bad" style={{ left: `${((nowMin - OPEN_HOUR * 60) / total) * 100}%` }} />}
                      {rows.map((b) => {
                        const s = Math.max(minutesWIB(b.startAt), OPEN_HOUR * 60);
                        const e = Math.min(minutesWIB(b.endAt) || 24 * 60, CLOSE_HOUR * 60);
                        return (
                          <button
                            key={b.id}
                            onClick={() => setSelected(b)}
                            className={cn(
                              "absolute inset-y-2 z-[5] overflow-hidden rounded-md border px-2 py-1 text-left text-[11.5px] leading-tight shadow-soft transition hover:shadow-pop",
                              b.source === "PORTAL" ? "border-info/40 bg-info-soft text-info" : "border-accent/40 bg-accent-soft text-accent",
                            )}
                            style={{ left: `calc(${((s - OPEN_HOUR * 60) / total) * 100}% + 2px)`, width: `calc(${((e - s) / total) * 100}% - 4px)` }}
                          >
                            <span className="block truncate font-semibold">{b.title}</span>
                            <span className="block truncate opacity-80">
                              {time(b.startAt)}–{time(b.endAt)} · {b.customerName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-[3px] border border-accent/40 bg-accent-soft" /> Dibuat admin
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-[3px] border border-info/40 bg-info-soft" /> Dari portal pelanggan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[2px] bg-bad" /> Waktu sekarang
        </span>
      </div>

      <Card className="mt-5" title="14 hari ke depan" bodyClass="p-0">
        {!upcoming.data ? (
          <Spinner />
        ) : upcoming.data.filter((b) => b.status !== "CANCELLED").length === 0 ? (
          <Empty title="Tidak ada booking mendatang" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Ruang</th>
                  <th>Agenda</th>
                  <th>Pemesan</th>
                  <th className="text-right">Biaya</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.data
                  .filter((b) => b.status !== "CANCELLED")
                  .map((b) => (
                    <tr key={b.id} className="row-link" onClick={() => setSelected(b)}>
                      <td className="whitespace-nowrap">
                        <div className="font-semibold">{dayLabel(b.startAt)}</div>
                        <div className="font-mono text-xs text-muted">
                          {time(b.startAt)}–{time(b.endAt)}
                        </div>
                      </td>
                      <td>{b.spaceName}</td>
                      <td className="text-muted">{b.title}</td>
                      <td>{b.customerName}</td>
                      <td className="num text-right">{rupiah(b.amount)}</td>
                      <td>
                        <StatusBadge map={BOOKING_STATUS} value={b.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BookingFormModal open={form.open} onClose={() => setForm({ open: false })} spaces={rooms} preset={form.preset} />
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        size="sm"
        footer={
          selected &&
          manage &&
          selected.status !== "CANCELLED" && (
            <>
              {selected.status === "CONFIRMED" && new Date(selected.startAt).getTime() < Date.now() && (
                <Button
                  loading={update.pending}
                  onClick={async () => {
                    try {
                      await update.run(selected.id, { status: "COMPLETED" });
                      toast.success("Ditandai selesai");
                      setSelected(null);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Tandai selesai
                </Button>
              )}
              {selected.status !== "COMPLETED" && (
                <Button
                  variant="danger"
                  loading={cancel.pending}
                  onClick={async () => {
                    try {
                      await cancel.run(selected.id);
                      toast.success("Booking dibatalkan");
                      setSelected(null);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Batalkan booking
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <KeyValue
            cols={1}
            items={[
              { label: "Status", value: <StatusBadge map={BOOKING_STATUS} value={selected.status} /> },
              { label: "Ruang", value: selected.spaceName },
              { label: "Waktu", value: `${dayLabel(selected.startAt)}, ${time(selected.startAt)}–${time(selected.endAt)} WIB` },
              { label: "Pemesan", value: selected.customerName },
              { label: "Peserta", value: `${selected.attendees} orang` },
              { label: "Biaya", value: `${rupiah(selected.amount)}${selected.invoiceId ? " · invoice terbit" : ""}` },
              { label: "Sumber", value: selected.source === "PORTAL" ? "Portal pelanggan" : "Admin" },
              { label: "Catatan", value: selected.notes },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
