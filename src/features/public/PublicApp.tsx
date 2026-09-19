"use client";
// Aplikasi pelanggan (publik): katalog layanan, cek ketersediaan ruang,
// daftar akun sendiri, booking, dan pengajuan sewa kantor.
// Mobile-first — ini halaman yang dibuka calon pelanggan dari HP.
import { useEffect, useMemo, useState } from "react";
import {
  LuArrowRight,
  LuBuilding2,
  LuCalendarCheck,
  LuCheck,
  LuClock,
  LuMail,
  LuMapPin,
  LuMessageCircle,
  LuPhone,
  LuUsers,
} from "react-icons/lu";
import type { ProductCategory, ProductUnit, SpaceType } from "@/core/domain/types";
import { api, ApiError } from "@/client/api";
import { CATEGORY_LABEL, dayLabel, rupiah, SPACE_TYPE_LABEL, todayISO, UNIT_LABEL, wibToISO } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Link, useNav } from "@/client/nav";
import { useSession } from "@/client/session";
import { Modal, useToast } from "@/ui/overlay";
import { Badge, Button, ErrorBox, Field, Input, Select, Spinner, Textarea } from "@/ui/primitives";
import { logoSrc } from "@/ui/Logo";
import { AvailabilityStrip, TIME_OPTIONS } from "../bookings/BookingsPage";
import { ThemeToggle } from "../shell/AppShell";

interface PublicInfo {
  organization: { name: string; slug: string; tagline: string | null; address: string | null; phone: string | null; whatsapp: string | null; email: string | null; taxRate: number };
  locations: { name: string; address: string | null }[];
  rooms: { id: string; code: string; name: string; type: SpaceType; capacity: number; hourlyPrice: number; amenities: string[]; description: string | null }[];
  products: { id: string; name: string; category: ProductCategory; unit: ProductUnit; price: number; description: string | null }[];
}

const waLink = (wa: string | null, text: string) => (wa ? `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null);

function PublicHeader({ info, slug }: { info?: PublicInfo; slug: string }) {
  const { me } = useSession();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href={`/o/${slug}`} className="flex items-center gap-2.5">
          <img
            src={logoSrc}
            alt="Bintaro Works Logo"
            width={34}
            height={34}
            className="h-8 w-8 rounded-lg object-contain shadow-sm ring-1 ring-black/10 dark:ring-white/10 shrink-0"
          />
          <span className="font-display text-[15px] font-bold leading-tight">{info?.organization.name ?? "Bintaro Works"}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link href={me?.role === "CUSTOMER" ? "/portal" : "/login"} className="btn btn-secondary btn-sm">
            {me?.role === "CUSTOMER" ? "Portal saya" : "Masuk"}
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter({ info }: { info: PublicInfo }) {
  const o = info.organization;
  return (
    <footer className="mt-12 border-t border-line bg-raised">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <img
              src={logoSrc}
              alt="Bintaro Works Logo"
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-contain shadow-sm ring-1 ring-black/10 dark:ring-white/10 shrink-0"
            />
            <p className="font-display text-lg font-bold">{o.name}</p>
          </div>
          {o.address && (
            <p className="mt-2 flex items-start gap-2 text-[13px] text-muted">
              <LuMapPin className="mt-0.5 h-4 w-4 shrink-0" /> {o.address}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 text-[13px] sm:items-end">
          {o.phone && (
            <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-muted hover:text-ink">
              <LuPhone className="h-4 w-4" /> {o.phone}
            </a>
          )}
          {o.email && (
            <a href={`mailto:${o.email}`} className="flex items-center gap-2 text-muted hover:text-ink">
              <LuMail className="h-4 w-4" /> {o.email}
            </a>
          )}
          {o.whatsapp && (
            <a href={waLink(o.whatsapp, `Halo ${o.name}, saya ingin bertanya tentang layanan Anda.`)!} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              <LuMessageCircle className="h-4 w-4" /> Chat WhatsApp
            </a>
          )}
        </div>
      </div>
      <p className="pb-6 text-center text-[11.5px] text-faint">Dikelola dengan Bintaro Works OS</p>
    </footer>
  );
}

// ---------------- Booking publik (daftar akun bila perlu) ----------------
function BookingSheet({ slug, info, room, onClose }: { slug: string; info: PublicInfo; room: PublicInfo["rooms"][number] | null; onClose: () => void }) {
  const { me, refresh } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const [step, setStep] = useState<"waktu" | "akun" | "selesai">("waktu");
  const [v, setV] = useState({ date: todayISO(1), start: "10:00", end: "12:00", attendees: "2", title: "" });
  const [acc, setAcc] = useState({ name: "", company: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (room) {
      setStep("waktu");
      setError(null);
      setV((x) => ({ ...x, attendees: String(Math.min(2, room.capacity)) }));
    }
  }, [room?.id]);

  const avail = useApi<{ startAt: string; endAt: string }[]>(room ? `/public/${slug}/availability` : null, { spaceId: room?.id, date: v.date });
  const hours = (Number(v.end.slice(0, 2)) * 60 + Number(v.end.slice(3)) - Number(v.start.slice(0, 2)) * 60 - Number(v.start.slice(3))) / 60;
  const cost = room && hours > 0 ? Math.round(room.hourlyPrice * hours) : 0;
  const tax = Math.round((cost * info.organization.taxRate) / 100);
  const isCustomer = me?.role === "CUSTOMER";

  const book = async () => {
    if (!room) return;
    setPending(true);
    setError(null);
    try {
      if (!isCustomer) {
        await api.post(`/public/${slug}/register`, acc);
        await refresh();
      }
      await api.post("/portal/bookings", {
        spaceId: room.id,
        title: v.title || `Booking ${room.name}`,
        startAt: wibToISO(v.date, v.start),
        endAt: wibToISO(v.date, v.end),
        attendees: Number(v.attendees),
      });
      setStep("selesai");
      toast.success("Booking terkonfirmasi");
    } catch (e) {
      setError(e as ApiError);
      if ((e as ApiError).status === 401) setStep("akun");
    } finally {
      setPending(false);
    }
  };

  const f = error?.fields ?? {};

  return (
    <Modal
      open={!!room}
      onClose={onClose}
      title={room ? room.name : ""}
      description={room ? `${SPACE_TYPE_LABEL[room.type]} · maks. ${room.capacity} orang · ${rupiah(room.hourlyPrice)}/jam` : undefined}
      footer={
        step === "selesai" ? (
          <>
            <Button onClick={onClose}>Tutup</Button>
            <Button variant="primary" onClick={() => push("/portal")}>
              Lihat booking & tagihan
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Batal</Button>
            {step === "waktu" ? (
              <Button variant="primary" onClick={() => (isCustomer ? book() : setStep("akun"))} loading={pending} disabled={hours <= 0}>
                {isCustomer ? "Booking sekarang" : "Lanjutkan"} <LuArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={book} loading={pending}>
                Daftar & booking
              </Button>
            )}
          </>
        )
      }
    >
      {!room ? null : step === "selesai" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-good-soft text-good">
            <LuCheck className="h-6 w-6" />
          </span>
          <p className="text-lg font-bold">Booking terkonfirmasi</p>
          <p className="max-w-sm text-[13.5px] text-muted">
            {room.name} · {dayLabel(wibToISO(v.date, v.start))}, {v.start}–{v.end} WIB. Invoice sudah terbit di portal Anda dan bisa dibayar lewat transfer.
          </p>
        </div>
      ) : step === "waktu" ? (
        <div className="flex flex-col gap-4">
          <ErrorBox error={error && !error.fields ? error : null} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tanggal" htmlFor="pb-date">
              <Input id="pb-date" type="date" min={todayISO()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field label="Mulai" htmlFor="pb-start">
              <Select id="pb-start" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} options={TIME_OPTIONS.slice(0, -1)} />
            </Field>
            <Field label="Selesai" htmlFor="pb-end" error={f.endAt}>
              <Select id="pb-end" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} options={TIME_OPTIONS.slice(1)} />
            </Field>
          </div>
          <div>
            <p className="label">Jam yang sudah terisi</p>
            <AvailabilityStrip busy={(avail.data ?? []).map((b) => ({ ...b, title: "Terisi" }))} selStart={v.start} selEnd={v.end} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jumlah orang" htmlFor="pb-att" error={f.attendees} hint={`Maks. ${room.capacity}`}>
              <Input id="pb-att" type="number" min={1} max={room.capacity} value={v.attendees} onChange={(e) => setV({ ...v, attendees: e.target.value })} />
            </Field>
            <Field label="Keperluan (opsional)" htmlFor="pb-title">
              <Input id="pb-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="mis. Rapat klien" />
            </Field>
          </div>
          <dl className="num flex flex-col gap-1 rounded-xl bg-raised p-4 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">
                {hours > 0 ? `${hours.toLocaleString("id-ID")} jam × ${rupiah(room.hourlyPrice)}` : "Pilih jam"}
              </dt>
              <dd>{rupiah(cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">PPN {info.organization.taxRate}%</dt>
              <dd>{rupiah(tax)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-bold">
              <dt>Total</dt>
              <dd>{rupiah(cost + tax)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent">
            Buat akun sekali saja — setelah ini Anda bisa booking, melihat tagihan, dan konfirmasi pembayaran sendiri.
          </p>
          <ErrorBox error={error && !error.fields ? error : null} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama lengkap" htmlFor="ac-name" error={f.name} required>
              <Input id="ac-name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} />
            </Field>
            <Field label="Perusahaan (opsional)" htmlFor="ac-company">
              <Input id="ac-company" value={acc.company} onChange={(e) => setAcc({ ...acc, company: e.target.value })} />
            </Field>
            <Field label="Nomor WhatsApp" htmlFor="ac-phone" error={f.phone} required>
              <Input id="ac-phone" inputMode="tel" value={acc.phone} onChange={(e) => setAcc({ ...acc, phone: e.target.value })} placeholder="0812…" />
            </Field>
            <Field label="Email" htmlFor="ac-email" error={f.email} required>
              <Input id="ac-email" type="email" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} />
            </Field>
            <Field label="Kata sandi" htmlFor="ac-password" error={f.password} hint="Minimal 8 karakter" className="sm:col-span-2">
              <Input id="ac-password" type="password" value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} />
            </Field>
          </div>
          <p className="text-[12.5px] text-faint">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Masuk di sini
            </Link>{" "}
            lalu ulangi booking.
          </p>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Beranda publik ----------------
export function PublicHomePage({ slug }: { slug: string }) {
  const { data: info, error, reload } = useApi<PublicInfo>(`/public/${slug}`);
  const [room, setRoom] = useState<PublicInfo["rooms"][number] | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, PublicInfo["products"]>();
    for (const p of info?.products ?? []) map.set(p.category, [...(map.get(p.category) ?? []), p]);
    return [...map.entries()];
  }, [info]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <ErrorBox error={error} onRetry={reload} />
        <p className="mt-4 text-[13px] text-muted">Halaman publik untuk “{slug}” tidak tersedia.</p>
      </div>
    );
  }
  if (!info) return <Spinner label="Memuat…" />;
  const o = info.organization;

  return (
    <div className="min-h-full bg-ground">
      <PublicHeader info={info} slug={slug} />

      {/* Hero */}
      <section className="mx-auto grid max-w-5xl gap-8 px-4 pb-8 pt-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div>
          <p className="eyebrow">{o.address?.split(",").slice(-2).join(",").trim() ?? "Tangerang Selatan"}</p>
          <h1 className="mt-2 max-w-2xl text-[32px] font-bold leading-[1.1] sm:text-[40px]">{o.tagline ?? `Ruang kerja & layanan bisnis di ${o.name}`}</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">
            Booking meeting room dan studio per jam, atau ajukan sewa private office & virtual office. Semua bisa diurus sendiri dari HP.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="#ruang" className="btn btn-primary h-10">
              <LuCalendarCheck className="h-4 w-4" /> Booking ruang per jam
            </a>
            <Link href={`/o/${slug}/sewa`} className="btn btn-secondary h-10">
              <LuBuilding2 className="h-4 w-4" /> Ajukan sewa kantor
            </Link>
          </div>
        </div>
        {/* Ringkasan singkat — juga mengisi ruang kosong di layar lebar */}
        <aside className="card flex flex-col gap-3 p-4 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Ruang siap dibooking</span>
            <span className="num font-display text-lg font-bold">{info.rooms.length}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-muted">Mulai dari</span>
            <span className="num font-semibold">
              {rupiah(info.rooms.length ? Math.min(...info.rooms.map((r) => r.hourlyPrice)) : 0)}
              <span className="font-normal text-faint">/jam</span>
            </span>
          </div>
          <ul className="flex flex-col gap-2 border-t border-line pt-3 text-muted">
            <li className="flex items-start gap-2">
              <LuClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Buka Senin–Sabtu, 08.00–20.00 WIB
            </li>
            <li className="flex items-start gap-2">
              <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Konfirmasi langsung, tanpa DP
            </li>
            <li className="flex items-start gap-2">
              <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Invoice & pembayaran online
            </li>
          </ul>
          {o.whatsapp && (
            <a href={waLink(o.whatsapp, `Halo ${o.name}, saya ingin bertanya tentang ruang yang tersedia.`)!} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-1">
              <LuMessageCircle className="h-4 w-4" /> Tanya lewat WhatsApp
            </a>
          )}
        </aside>
      </section>

      {/* Ruang yang bisa dibooking */}
      <section id="ruang" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-6">
        <h2 className="text-[20px] font-bold">Booking per jam</h2>
        <p className="mb-4 text-[13.5px] text-muted">Pilih ruang, cek jam kosong, langsung terkonfirmasi.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {info.rooms.map((r) => (
            <button key={r.id} onClick={() => setRoom(r)} className="card flex flex-col p-4 text-left transition-colors hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted">{SPACE_TYPE_LABEL[r.type]}</p>
                </div>
                <Badge dot={false} tone="neutral">
                  <LuUsers className="h-3 w-3" /> {r.capacity}
                </Badge>
              </div>
              {r.description && <p className="mt-2 line-clamp-2 text-[12.5px] text-muted">{r.description}</p>}
              {r.amenities.length > 0 && <p className="mt-2 line-clamp-1 text-[11.5px] text-faint">{r.amenities.join(" · ")}</p>}
              <div className="mt-3 flex items-end justify-between">
                <span className="num font-display text-lg font-bold">
                  {rupiah(r.hourlyPrice)}
                  <span className="text-xs font-normal text-faint">/jam</span>
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                  <LuClock className="h-3.5 w-3.5" /> Cek jam
                </span>
              </div>
            </button>
          ))}
          {info.rooms.length === 0 && <p className="text-[13px] text-muted">Belum ada ruang yang dibuka untuk booking online.</p>}
        </div>
      </section>

      {/* Layanan & harga */}
      <section className="mx-auto max-w-5xl px-4 py-6">
        <h2 className="text-[20px] font-bold">Layanan & harga</h2>
        <p className="mb-4 text-[13.5px] text-muted">Harga belum termasuk PPN {o.taxRate}%. Hubungi kami untuk paket khusus.</p>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="card">
              <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">{CATEGORY_LABEL[cat]}</p>
              <ul className="divide-y divide-line">
                {items.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">{p.name}</p>
                      {p.description && <p className="text-[11.5px] text-faint">{p.description}</p>}
                    </div>
                    <span className="num shrink-0 text-[13px] font-semibold">
                      {rupiah(p.price)}
                      <span className="font-normal text-faint">{UNIT_LABEL[p.unit]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-4">
          <p className="text-[13.5px]">
            <b>Butuh kantor sendiri?</b> Ajukan sewa private office atau virtual office — tim kami hubungi maksimal 1 hari kerja.
          </p>
          <Link href={`/o/${slug}/sewa`} className="btn btn-primary">
            Ajukan sewa
          </Link>
        </div>
      </section>

      <PublicFooter info={info} />
      <BookingSheet slug={slug} info={info} room={room} onClose={() => setRoom(null)} />
    </div>
  );
}

// ---------------- Formulir pengajuan sewa ----------------
export function PublicInquiryPage({ slug }: { slug: string }) {
  const { data: info } = useApi<PublicInfo>(`/public/${slug}`);
  const [v, setV] = useState({ name: "", company: "", phone: "", email: "", interest: "PRIVATE_OFFICE", people: "4", startMonth: "", message: "" });
  const [done, setDone] = useState(false);
  const m = useMutation(() => api.post<{ message: string }>(`/public/${slug}/inquiries`, { ...v, people: Number(v.people) || undefined, company: v.company || null, email: v.email || null, startMonth: v.startMonth || null, message: v.message || null }));
  const f = m.error?.fields ?? {};

  return (
    <div className="min-h-full bg-ground">
      <PublicHeader info={info} slug={slug} />
      <div className="mx-auto max-w-lg px-4 py-10">
        {done ? (
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-good-soft text-good">
              <LuCheck className="h-6 w-6" />
            </span>
            <p className="text-lg font-bold">Pengajuan terkirim</p>
            <p className="text-[13.5px] text-muted">Tim {info?.organization.name ?? "kami"} akan menghubungi Anda maksimal 1 hari kerja.</p>
            {info?.organization.whatsapp && (
              <a href={waLink(info.organization.whatsapp, "Halo, saya baru mengajukan sewa lewat website.")!} target="_blank" rel="noreferrer" className="btn btn-secondary">
                <LuMessageCircle className="h-4 w-4" /> Chat sekarang
              </a>
            )}
            <Link href={`/o/${slug}`} className="text-[13px] font-semibold text-accent hover:underline">
              Kembali ke beranda
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-[26px] font-bold">Ajukan sewa</h1>
            <p className="mt-1 text-[13.5px] text-muted">Isi kebutuhan Anda — kami kirimkan penawaran dan jadwal survei lokasi.</p>
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await m.run();
                  setDone(true);
                } catch {
                  /* ditampilkan di form */
                }
              }}
            >
              {m.error && !m.error.fields && <ErrorBox error={m.error} />}
              <Field label="Nama" htmlFor="iq-name" error={f.name} required>
                <Input id="iq-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </Field>
              <Field label="Perusahaan (opsional)" htmlFor="iq-company">
                <Input id="iq-company" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nomor WhatsApp" htmlFor="iq-phone" error={f.phone} required>
                  <Input id="iq-phone" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="0812…" />
                </Field>
                <Field label="Email (opsional)" htmlFor="iq-email" error={f.email}>
                  <Input id="iq-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kebutuhan" htmlFor="iq-interest">
                  <Select
                    id="iq-interest"
                    value={v.interest}
                    onChange={(e) => setV({ ...v, interest: e.target.value })}
                    options={(["PRIVATE_OFFICE", "VIRTUAL_OFFICE", "COWORKING", "MEETING_ROOM", "STUDIO", "PARKING", "BUSINESS_SERVICE"] as ProductCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
                  />
                </Field>
                <Field label="Perkiraan jumlah orang" htmlFor="iq-people" error={f.people}>
                  <Input id="iq-people" type="number" min={1} value={v.people} onChange={(e) => setV({ ...v, people: e.target.value })} />
                </Field>
              </div>
              <Field label="Rencana mulai" htmlFor="iq-start" hint="mis. Oktober 2026">
                <Input id="iq-start" value={v.startMonth} onChange={(e) => setV({ ...v, startMonth: e.target.value })} />
              </Field>
              <Field label="Catatan" htmlFor="iq-message">
                <Textarea id="iq-message" rows={3} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} placeholder="Kebutuhan khusus, budget, pertanyaan…" />
              </Field>
              <Button type="submit" variant="primary" className="h-10" loading={m.pending}>
                Kirim pengajuan
              </Button>
              <p className="text-center text-[12px] text-faint">Data Anda hanya dipakai untuk menindaklanjuti pengajuan ini.</p>
            </form>
          </>
        )}
      </div>
      {info && <PublicFooter info={info} />}
    </div>
  );
}
