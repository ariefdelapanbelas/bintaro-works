"use client";
import { useEffect, useState, type ReactNode } from "react";
import { LuArrowLeft, LuCalendarDays, LuHouse, LuLifeBuoy, LuLogOut, LuPrinter, LuReceipt, LuUsers } from "react-icons/lu";
import type { Booking, Contract, Invoice, PaymentConfirmation, PaymentMethod, ServiceRequest, Space } from "@/core/domain/types";
import { api } from "@/client/api";
import { BILLING_CYCLE, BOOKING_STATUS, CONFIRMATION_STATUS, CONTRACT_STATUS, date, dateTime, dayLabel, INVOICE_STATUS, PAYMENT_METHOD, PRIORITY, REQUEST_STATUS, rupiah, SPACE_TYPE_LABEL, time, todayISO, wibToISO } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Link, useNav } from "@/client/nav";
import { useSession } from "@/client/session";
import { ConfirmDialog, Modal, useToast } from "@/ui/overlay";
import { Avatar, Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, MoneyInput, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/ui/primitives";
import { InvoiceSheet, type InvoiceDetail } from "../billing/BillingPages";
import { AvailabilityStrip, TIME_OPTIONS } from "../bookings/BookingsPage";
import { Logo, ThemeToggle } from "../shell/AppShell";

interface Overview {
  customer: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
  organization: { name: string; phone: string | null; email: string | null; address: string | null; bankName: string | null; bankAccountNo: string | null; bankAccountName: string | null };
  stats: { outstanding: number; openInvoices: number; activeContracts: number; upcomingBookings: number; openRequests: number };
  contracts: (Pick<Contract, "id" | "number" | "title" | "status" | "startDate" | "endDate" | "monthlyFee" | "billingCycle"> & { spaceName: string | null; daysLeft: number })[];
  invoices: (Invoice & { outstanding: number; confirmation: PaymentConfirmation | null })[];
  bookings: (Booking & { spaceName: string })[];
  requests: ServiceRequest[];
}

const PORTAL_NAV = [
  { href: "/portal", label: "Beranda", icon: <LuHouse /> },
  { href: "/portal/bookings", label: "Booking ruang", icon: <LuCalendarDays /> },
  { href: "/portal/invoices", label: "Tagihan", icon: <LuReceipt /> },
  { href: "/portal/requests", label: "Bantuan", icon: <LuLifeBuoy /> },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const { pathname, replace } = useNav();
  useEffect(() => {
    if (!loading && !me) replace("/login");
    if (me && me.role !== "CUSTOMER") replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me]);
  if (loading || !me || me.role !== "CUSTOMER") return <Spinner label="Membuka portal…" />;
  return (
    <div className="min-h-full">
      <header className="no-print sticky z-20 border-b border-line bg-surface/90 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/portal">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Portal">
            {PORTAL_NAV.map((n) => {
              const active = n.href === "/portal" ? pathname === "/portal" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors", active ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="hidden text-right text-xs leading-tight sm:block">
              <div className="font-semibold">{me.user.name}</div>
              <div className="text-muted">{me.customerName}</div>
            </div>
            <Avatar name={me.user.name} className="ml-2 h-8 w-8" />
            <Button size="icon" variant="ghost" onClick={logout} aria-label="Keluar" title="Keluar">
              <LuLogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 md:pb-12">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Portal (mobile)">
        {PORTAL_NAV.map((n) => {
          const active = n.href === "/portal" ? pathname === "/portal" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold", active ? "text-accent" : "text-faint")}>
              <span className="text-lg">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PortalHomePage() {
  const { me } = useSession();
  const { data, error, reload } = useApi<Overview>("/portal/overview");
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const s = data.stats;
  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <p className="eyebrow">{data.customer.name}</p>
        <h1 className="mt-1 text-[28px] font-bold">Halo, {me?.user.name.split(" ")[0]}</h1>
        <p className="text-[13.5px] text-muted">Semua urusan Anda di {data.organization.name} dalam satu tempat.</p>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Link href="/portal/invoices" className={cn("card block p-4 transition-colors", s.outstanding > 0 ? "border-warn/40 hover:border-warn" : "hover:border-faint/50")}>
          <p className="eyebrow">Tagihan belum dibayar</p>
          <p className="num mt-1 font-display text-2xl font-bold">{rupiah(s.outstanding)}</p>
          <p className="text-xs text-muted">{s.openInvoices ? `${s.openInvoices} invoice` : "Semua lunas — terima kasih!"}</p>
        </Link>
        <Link href="/portal/bookings" className="card block p-4 transition-colors hover:border-faint/50">
          <p className="eyebrow">Booking mendatang</p>
          <p className="num mt-1 font-display text-2xl font-bold">{s.upcomingBookings}</p>
          <p className="text-xs font-semibold text-accent">Booking meeting room →</p>
        </Link>
        <Link href="/portal/requests" className="card block p-4 transition-colors hover:border-faint/50">
          <p className="eyebrow">Permintaan terbuka</p>
          <p className="num mt-1 font-display text-2xl font-bold">{s.openRequests}</p>
          <p className="text-xs font-semibold text-accent">Butuh bantuan? →</p>
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Kontrak Anda" bodyClass="p-0">
          {data.contracts.length === 0 ? (
            <Empty title="Tidak ada kontrak aktif" />
          ) : (
            <ul className="divide-y divide-line">
              {data.contracts.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{c.title}</span>
                    <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    <span className="font-mono">{c.number}</span> · {date(c.startDate)} – {date(c.endDate)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span className="num font-semibold">
                      {rupiah(c.monthlyFee)}/bln <span className="font-normal text-faint">· {BILLING_CYCLE[c.billingCycle]}</span>
                    </span>
                    {c.status === "ACTIVE" && c.daysLeft <= 45 && <Badge tone="warn">Berakhir {c.daysLeft} hari lagi</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Jadwal booking" action={<Link href="/portal/bookings" className="text-xs font-semibold text-accent hover:underline">Booking baru</Link>} bodyClass="p-0">
          {data.bookings.length === 0 ? (
            <Empty title="Belum ada jadwal" />
          ) : (
            <ul className="divide-y divide-line">
              {data.bookings.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-32 shrink-0 text-[12.5px]">
                    <div className="font-semibold">{dayLabel(b.startAt)}</div>
                    <div className="font-mono text-muted">
                      {time(b.startAt)}–{time(b.endAt)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{b.title}</div>
                    <div className="text-xs text-muted">{b.spaceName}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="mt-4" title="Hubungi pengelola">
        <p className="text-[13.5px] text-muted">
          {data.organization.name} · {data.organization.phone} · {data.organization.email}
          <br />
          {data.organization.address}
        </p>
      </Card>
    </div>
  );
}

type PortalSpace = Pick<Space, "id" | "code" | "name" | "type" | "capacity" | "hourlyPrice" | "amenities" | "description">;

export function PortalBookingsPage() {
  const toast = useToast();
  const spaces = useApi<PortalSpace[]>("/portal/spaces");
  const overview = useApi<Overview>("/portal/overview");
  const [v, setV] = useState({ spaceId: "", date: todayISO(1), start: "10:00", end: "12:00", title: "", attendees: "2", notes: "" });
  useEffect(() => {
    if (!v.spaceId && spaces.data?.length) setV((x) => ({ ...x, spaceId: spaces.data![0].id }));
  }, [spaces.data, v.spaceId]);
  const avail = useApi<{ id: string; startAt: string; endAt: string; title: string }[]>(v.spaceId ? "/portal/availability" : null, { spaceId: v.spaceId, date: v.date });
  const book = useMutation(() => api.post("/portal/bookings", { spaceId: v.spaceId, title: v.title, startAt: wibToISO(v.date, v.start), endAt: wibToISO(v.date, v.end), attendees: Number(v.attendees), notes: v.notes || null }));
  const cancel = useMutation((id: string) => api.post(`/portal/bookings/${id}/cancel`));
  const [cancelling, setCancelling] = useState<string | null>(null);
  const space = spaces.data?.find((s) => s.id === v.spaceId);
  const hours = (Number(v.end.slice(0, 2)) * 60 + Number(v.end.slice(3)) - Number(v.start.slice(0, 2)) * 60 - Number(v.start.slice(3))) / 60;
  const f = book.error?.fields ?? {};
  const dayStart = new Date(wibToISO(v.date, "00:00")).getTime();
  const busy = (avail.data ?? []).filter((b) => new Date(b.endAt).getTime() > dayStart && new Date(b.startAt).getTime() < dayStart + 86_400_000);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Booking ruang" description="Pilih ruang dan jam yang masih kosong. Invoice terbit otomatis dan bisa dibayar via transfer." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!spaces.data ? (
              <Spinner />
            ) : (
              spaces.data.map((s) => (
                <button key={s.id} onClick={() => setV({ ...v, spaceId: s.id })} className={cn("card p-4 text-left transition-colors", v.spaceId === s.id ? "border-accent ring-2 ring-accent/20" : "hover:border-faint/50")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted">{SPACE_TYPE_LABEL[s.type]}</div>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <LuUsers className="h-3.5 w-3.5" /> {s.capacity}
                    </span>
                  </div>
                  <div className="num mt-2 font-display text-lg font-bold">
                    {rupiah(s.hourlyPrice)}
                    <span className="text-xs font-normal text-faint">/jam</span>
                  </div>
                  {s.amenities.length > 0 && <div className="mt-1 line-clamp-1 text-[11.5px] text-faint">{s.amenities.join(" · ")}</div>}
                </button>
              ))
            )}
          </div>
          <Card title="Booking saya" bodyClass="p-0">
            {!overview.data ? (
              <Spinner />
            ) : overview.data.bookings.length === 0 ? (
              <Empty title="Belum ada booking mendatang" />
            ) : (
              <ul className="divide-y divide-line">
                {overview.data.bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{b.title}</div>
                      <div className="text-xs text-muted">
                        {b.spaceName} · {dayLabel(b.startAt)}, {time(b.startAt)}–{time(b.endAt)}
                      </div>
                    </div>
                    <StatusBadge map={BOOKING_STATUS} value={b.status} />
                    {new Date(b.startAt).getTime() > Date.now() && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(b.id)}>
                        Batalkan
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title={space ? `Booking ${space.name}` : "Booking"} className="self-start lg:sticky lg:top-20">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await book.run();
                toast.success("Booking terkonfirmasi — invoice sudah terbit");
                setV((x) => ({ ...x, title: "", notes: "" }));
              } catch {
                /* tampil */
              }
            }}
          >
            {book.error && !book.error.fields && <ErrorBox error={book.error} />}
            <Field label="Tanggal" htmlFor="pb-date" error={f.startAt}>
              <Input id="pb-date" type="date" min={todayISO()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mulai" htmlFor="pb-start">
                <Select id="pb-start" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} options={TIME_OPTIONS.slice(0, -1)} />
              </Field>
              <Field label="Selesai" htmlFor="pb-end" error={f.endAt}>
                <Select id="pb-end" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} options={TIME_OPTIONS.slice(1)} />
              </Field>
            </div>
            <div>
              <p className="label">Jadwal terisi</p>
              <AvailabilityStrip busy={busy} selStart={v.start} selEnd={v.end} />
            </div>
            <Field label="Keperluan" htmlFor="pb-title" error={f.title}>
              <Input id="pb-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="mis. Meeting dengan klien" />
            </Field>
            <Field label="Jumlah orang" htmlFor="pb-att" error={f.attendees} hint={space ? `Maks. ${space.capacity}` : undefined}>
              <Input id="pb-att" type="number" min={1} value={v.attendees} onChange={(e) => setV({ ...v, attendees: e.target.value })} />
            </Field>
            <Field label="Catatan" htmlFor="pb-notes">
              <Textarea id="pb-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
            </Field>
            <div className="flex items-center justify-between rounded-xl bg-raised px-4 py-3 text-[13px]">
              <span className="text-muted">{hours > 0 ? `${hours.toLocaleString("id-ID")} jam` : "—"} · sebelum PPN</span>
              <span className="num font-display text-lg font-bold">{rupiah(space && hours > 0 ? Math.round(space.hourlyPrice * hours) : 0)}</span>
            </div>
            <Button type="submit" variant="primary" className="h-10" loading={book.pending} disabled={!v.spaceId}>
              Konfirmasi booking
            </Button>
          </form>
        </Card>
      </div>
      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Batalkan booking?"
        message="Invoice yang belum dibayar untuk booking ini akan ikut dibatalkan."
        confirmLabel="Batalkan booking"
        danger
        loading={cancel.pending}
        onConfirm={async () => {
          try {
            await cancel.run(cancelling!);
            toast.success("Booking dibatalkan");
            setCancelling(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

export function PortalInvoicesPage() {
  const { push } = useNav();
  const { data, error, reload } = useApi<Overview>("/portal/overview");
  const [confirming, setConfirming] = useState<Overview["invoices"][number] | null>(null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const o = data.organization;
  return (
    <div className="animate-fade-up">
      <PageHeader title="Tagihan" description="Riwayat invoice dan status pembayaran Anda." />
      {data.stats.outstanding > 0 && o.bankAccountNo && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-warn/40 bg-warn-soft/40 p-4">
          <div>
            <p className="font-semibold">Total belum dibayar {rupiah(data.stats.outstanding)}</p>
            <p className="text-[13px] text-muted">
              Transfer ke {o.bankName} <span className="font-mono font-semibold text-ink">{o.bankAccountNo}</span> a.n. {o.bankAccountName}. Cantumkan nomor invoice.
            </p>
          </div>
        </div>
      )}
      <div className="card">
        {data.invoices.length === 0 ? (
          <Empty title="Belum ada tagihan" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th>Terbit</th>
                  <th>Jatuh tempo</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} className="row-link" onClick={() => push(`/portal/invoices/${i.id}`)}>
                    <td className="whitespace-nowrap font-mono text-xs">{i.number}</td>
                    <td className="whitespace-nowrap text-muted">{date(i.issueDate)}</td>
                    <td className={cn("whitespace-nowrap", i.status === "OVERDUE" ? "font-semibold text-bad" : "text-muted")}>{date(i.dueDate)}</td>
                    <td className="num text-right font-semibold">{rupiah(i.total)}</td>
                    <td>
                      <StatusBadge map={INVOICE_STATUS} value={i.status} />
                    </td>
                    <td className="text-right">
                      {i.outstanding > 0 && i.status !== "VOID" ? (
                        i.confirmation?.status === "PENDING" ? (
                          <Badge tone="warn">Menunggu verifikasi</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirming(i);
                            }}
                          >
                            Konfirmasi bayar
                          </Button>
                        )
                      ) : i.confirmation?.status === "REJECTED" ? (
                        <Badge tone="bad">Konfirmasi ditolak</Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmPaymentModal invoice={confirming} onClose={() => setConfirming(null)} />
    </div>
  );
}

/** Pelanggan mengonfirmasi transfer; finance memverifikasi sebelum tercatat sebagai pembayaran. */
function ConfirmPaymentModal({ invoice, onClose }: { invoice: (Invoice & { outstanding: number }) | null; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<{ amount: number | ""; method: PaymentMethod; paidAt: string; reference: string; note: string }>({ amount: "", method: "TRANSFER", paidAt: todayISO(), reference: "", note: "" });
  useEffect(() => {
    if (invoice) setV({ amount: invoice.outstanding, method: "TRANSFER", paidAt: todayISO(), reference: "", note: "" });
  }, [invoice?.id]);
  const m = useMutation(() =>
    api.post(`/portal/invoices/${invoice?.id}/confirm-payment`, {
      amount: v.amount || 0,
      method: v.method,
      paidAt: new Date(`${v.paidAt}T12:00:00+07:00`).toISOString(),
      reference: v.reference || null,
      note: v.note || null,
    }),
  );
  const f = m.error?.fields ?? {};
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      size="sm"
      title="Konfirmasi pembayaran"
      description={invoice ? `${invoice.number} · sisa ${rupiah(invoice.outstanding)}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            loading={m.pending}
            onClick={async () => {
              try {
                await m.run();
                toast.success("Terima kasih — konfirmasi Anda sedang diverifikasi tim kami");
                onClose();
              } catch {
                /* ditampilkan di form */
              }
            }}
          >
            Kirim konfirmasi
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {m.error && !m.error.fields && <ErrorBox error={m.error} />}
        <Field label="Jumlah yang ditransfer" htmlFor="cf-amount" error={f.amount}>
          <MoneyInput id="cf-amount" value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Metode" htmlFor="cf-method">
            <Select id="cf-method" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value as PaymentMethod })} options={(["TRANSFER", "QRIS", "VIRTUAL_ACCOUNT", "CASH"] as PaymentMethod[]).map((x) => ({ value: x, label: PAYMENT_METHOD[x] }))} />
          </Field>
          <Field label="Tanggal transfer" htmlFor="cf-date" error={f.paidAt}>
            <Input id="cf-date" type="date" value={v.paidAt} onChange={(e) => setV({ ...v, paidAt: e.target.value })} />
          </Field>
        </div>
        <Field label="No. referensi / berita transfer" htmlFor="cf-ref" hint="Membantu tim kami mencocokkan mutasi bank">
          <Input id="cf-ref" className="font-mono" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="cf-note">
          <Textarea id="cf-note" rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export function PortalInvoicePage({ id }: { id: string }) {
  const { data, error, reload } = useApi<InvoiceDetail>(`/portal/invoices/${id}`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="animate-fade-up">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/portal/invoices" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
          <LuArrowLeft className="h-3.5 w-3.5" /> Tagihan
        </Link>
        <Button icon={<LuPrinter className="h-4 w-4" />} onClick={() => window.print()}>
          Cetak / simpan PDF
        </Button>
      </div>
      <InvoiceSheet inv={data} />
    </div>
  );
}

export function PortalRequestsPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<Overview>("/portal/overview");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ category: "Fasilitas", subject: "", description: "", priority: "MEDIUM" });
  const m = useMutation(() => api.post("/portal/requests", v));
  const f = m.error?.fields ?? {};
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Bantuan"
        description="Laporkan kendala fasilitas, minta kartu akses, atau tanyakan surat & paket."
        actions={
          <Button variant="primary" onClick={() => (setV({ category: "Fasilitas", subject: "", description: "", priority: "MEDIUM" }), setOpen(true))}>
            Kirim permintaan
          </Button>
        }
      />
      <div className="card">
        {!data ? (
          <Spinner />
        ) : data.requests.length === 0 ? (
          <Empty title="Belum ada permintaan" />
        ) : (
          <ul className="divide-y divide-line">
            {data.requests.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{r.subject}</span>
                  <StatusBadge map={REQUEST_STATUS} value={r.status} />
                </div>
                <div className="text-xs text-muted">
                  {r.category} · {dateTime(r.createdAt)} · prioritas {PRIORITY[r.priority][0].toLowerCase()}
                </div>
                <p className="mt-1 text-[13px] text-muted">{r.description}</p>
                {r.response && (
                  <p className="mt-2 rounded-lg border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-[13px]">
                    <span className="font-semibold">Tanggapan pengelola:</span> {r.response}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Kirim permintaan"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Batal</Button>
            <Button
              variant="primary"
              loading={m.pending}
              onClick={async () => {
                try {
                  await m.run();
                  toast.success("Permintaan terkirim. Tim kami akan segera menanggapi.");
                  setOpen(false);
                } catch {
                  /* tampil */
                }
              }}
            >
              Kirim
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {m.error && !m.error.fields && (
            <div className="sm:col-span-2">
              <ErrorBox error={m.error} />
            </div>
          )}
          <Field label="Kategori" htmlFor="rq-cat">
            <Select id="rq-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} options={["Fasilitas", "Akses", "Internet", "Surat & Paket", "Tagihan", "Lainnya"].map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Prioritas" htmlFor="rq-pri">
            <Select id="rq-pri" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} options={[{ value: "LOW", label: "Rendah" }, { value: "MEDIUM", label: "Sedang" }, { value: "HIGH", label: "Tinggi (mendesak)" }]} />
          </Field>
          <Field label="Judul" htmlFor="rq-subject" error={f.subject} className="sm:col-span-2">
            <Input id="rq-subject" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
          </Field>
          <Field label="Detail" htmlFor="rq-desc" error={f.description} className="sm:col-span-2">
            <Textarea id="rq-desc" rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
