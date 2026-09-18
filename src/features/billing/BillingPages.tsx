"use client";
import { useEffect, useState } from "react";
import { LuArrowLeft, LuBan, LuCalendarSync, LuCirclePlus, LuFilePlus2, LuPencil, LuPrinter, LuSend, LuTrash2, LuWallet, LuX } from "react-icons/lu";
import { INVOICE_STATUSES, PAYMENT_METHODS, type Customer, type Invoice, type InvoiceItem, type Payment, type PaymentConfirmation, type Product } from "@/core/domain/types";
import { api } from "@/client/api";
import { CONFIRMATION_STATUS, date, dateTime, INVOICE_STATUS, isoDate, PAYMENT_METHOD, relative, rupiah, todayISO, UNIT_LABEL } from "@/client/format";
import { useApi, useDebounced, useMutation } from "@/client/hooks";
import { Link, useNav, useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { ConfirmDialog, Modal, useToast } from "@/ui/overlay";
import { Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, MoneyInput, PageHeader, Select, Spinner, Stat, StatusBadge, Tabs, Textarea } from "@/ui/primitives";

type InvoiceRow = Invoice & { customerName: string; outstanding: number };
export type InvoiceDetail = Invoice & {
  outstanding: number;
  items: InvoiceItem[];
  payments: Payment[];
  customer: Customer | null;
  contract: { id: string; number: string; title: string } | null;
  organization: { name: string; address: string | null; email: string | null; phone: string | null; npwp: string | null; bankName: string | null; bankAccountNo: string | null; bankAccountName: string | null };
};

const addDaysISO = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------- Form invoice ----------------
interface ItemDraft {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: number | "";
}

function InvoiceFormModal({ open, onClose, invoice, presetCustomerId, onSaved }: { open: boolean; onClose: () => void; invoice?: InvoiceDetail | null; presetCustomerId?: string | null; onSaved?: (i: Invoice) => void }) {
  const toast = useToast();
  const { me } = useSession();
  const customers = useApi<Customer[]>(open ? "/customers" : null);
  const products = useApi<Product[]>(open ? "/products" : null, { active: "true" });
  const term = me?.organization.paymentTermDays ?? 14;
  const taxRate = invoice?.taxRate ?? me?.organization.taxRate ?? 11;
  const makeState = () => ({
    customerId: invoice?.customerId ?? presetCustomerId ?? "",
    issueDate: invoice ? isoDate(invoice.issueDate) : todayISO(),
    dueDate: invoice ? isoDate(invoice.dueDate) : todayISO(term),
    discount: (invoice?.discount ?? "") as number | "",
    notes: invoice?.notes ?? "",
    items: (invoice?.items.length ? invoice.items : [null]).map((it, i) => ({
      key: i,
      productId: it?.productId ?? "",
      description: it?.description ?? "",
      quantity: String(it?.quantity ?? 1),
      unitPrice: (it?.unitPrice ?? "") as number | "",
    })) as ItemDraft[],
  });
  const [v, setV] = useState(makeState());
  useEffect(() => {
    if (open) setV(makeState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  const subtotal = v.items.reduce((a, it) => a + (Number(it.quantity) || 0) * (it.unitPrice || 0), 0);
  const taxable = Math.max(0, subtotal - (v.discount || 0));
  const tax = Math.round((taxable * taxRate) / 100);

  const setItem = (key: number, patch: Partial<ItemDraft>) => setV((s) => ({ ...s, items: s.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));
  const body = (send: boolean) => ({
    customerId: v.customerId,
    issueDate: v.issueDate,
    dueDate: v.dueDate,
    discount: v.discount || 0,
    notes: v.notes || null,
    items: v.items.map((it) => ({ productId: it.productId || null, description: it.description, quantity: Number(it.quantity), unitPrice: it.unitPrice || 0 })),
    send,
  });
  const m = useMutation((send: boolean) => (invoice ? api.patch<Invoice>(`/invoices/${invoice.id}`, body(false)) : api.post<Invoice>("/invoices", body(send))));
  const f = m.error?.fields ?? {};
  const submit = async (send: boolean) => {
    try {
      const saved = await m.run(send);
      toast.success(invoice ? "Invoice diperbarui" : send ? `Invoice ${saved?.number} diterbitkan` : "Draft invoice disimpan");
      onClose();
      if (saved) onSaved?.(saved);
    } catch {
      /* tampil */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={invoice ? `Ubah ${invoice.number}` : "Invoice baru"}
      description="Untuk layanan bisnis, printing, add-on, atau tagihan manual lain. Tagihan sewa bulanan dibuat otomatis dari kontrak."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          {invoice ? (
            <Button variant="primary" onClick={() => submit(false)} loading={m.pending}>
              Simpan perubahan
            </Button>
          ) : (
            <>
              <Button onClick={() => submit(false)} loading={m.pending}>
                Simpan draft
              </Button>
              <Button variant="primary" onClick={() => submit(true)} loading={m.pending} icon={<LuSend className="h-4 w-4" />}>
                Terbitkan
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {m.error && !m.error.fields && <ErrorBox error={m.error} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pelanggan" htmlFor="inv-customer" error={f.customerId} required className="sm:col-span-3">
            <Select id="inv-customer" value={v.customerId} disabled={!!invoice} onChange={(e) => setV({ ...v, customerId: e.target.value })} placeholder="Pilih pelanggan…" options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Tanggal terbit" htmlFor="inv-issue" error={f.issueDate}>
            <Input id="inv-issue" type="date" value={v.issueDate} onChange={(e) => setV({ ...v, issueDate: e.target.value, dueDate: addDaysISO(e.target.value, term) })} />
          </Field>
          <Field label="Jatuh tempo" htmlFor="inv-due" error={f.dueDate}>
            <Input id="inv-due" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} />
          </Field>
          <Field label="Diskon" htmlFor="inv-discount" error={f.discount}>
            <MoneyInput id="inv-discount" value={v.discount} onChange={(x) => setV({ ...v, discount: x })} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label !mb-0">Item tagihan</p>
            {f.items && <p className="text-xs text-bad">{f.items}</p>}
          </div>
          <div className="flex flex-col gap-2">
            {v.items.map((it, idx) => (
              <div key={it.key} className="grid grid-cols-12 gap-2 rounded-xl border border-line p-2.5">
                <div className="col-span-12 sm:col-span-5">
                  <Select
                    id={`inv-prod-${it.key}`}
                    aria-label="Produk"
                    value={it.productId}
                    onChange={(e) => {
                      const p = products.data?.find((x) => x.id === e.target.value);
                      setItem(it.key, { productId: e.target.value, ...(p ? { description: p.name, unitPrice: p.price } : {}) });
                    }}
                    placeholder="Pilih dari katalog (opsional)"
                    options={(products.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${rupiah(p.price)}${UNIT_LABEL[p.unit]}` }))}
                  />
                </div>
                <div className="col-span-12 sm:col-span-7">
                  <Input id={`inv-desc-${it.key}`} aria-label="Deskripsi" value={it.description} onChange={(e) => setItem(it.key, { description: e.target.value })} placeholder="Deskripsi" invalid={!!f[`items.${idx}.description`]} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input id={`inv-qty-${it.key}`} aria-label="Jumlah" type="number" min={1} value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} className="text-center" />
                </div>
                <div className="col-span-9 sm:col-span-4">
                  <MoneyInput id={`inv-price-${it.key}`} value={it.unitPrice} onChange={(x) => setItem(it.key, { unitPrice: x })} />
                </div>
                <div className="num col-span-9 flex items-center justify-end text-[13px] font-semibold sm:col-span-5">{rupiah((Number(it.quantity) || 0) * (it.unitPrice || 0))}</div>
                <div className="col-span-3 flex items-center justify-end sm:col-span-1">
                  <Button size="icon" variant="ghost" aria-label="Hapus item" disabled={v.items.length === 1} onClick={() => setV((s) => ({ ...s, items: s.items.filter((x) => x.key !== it.key) }))}>
                    <LuX className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={<LuCirclePlus className="h-4 w-4" />} onClick={() => setV((s) => ({ ...s, items: [...s.items, { key: Date.now(), productId: "", description: "", quantity: "1", unitPrice: "" }] }))}>
            Tambah item
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catatan untuk pelanggan" htmlFor="inv-notes">
            <Textarea id="inv-notes" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </Field>
          <dl className="num flex flex-col gap-1.5 rounded-xl bg-raised p-4 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{rupiah(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Diskon</dt>
              <dd>− {rupiah(v.discount || 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">PPN {taxRate}%</dt>
              <dd>{rupiah(tax)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-bold">
              <dt>Total</dt>
              <dd>{rupiah(taxable + tax)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Generate tagihan berulang ----------------
function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const now = new Date(Date.now() + 7 * 3600_000);
  const [ym, setYm] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
  const [result, setResult] = useState<{ created: number; skipped: number; numbers: string[] } | null>(null);
  useEffect(() => {
    if (open) setResult(null);
  }, [open]);
  const m = useMutation(() => api.post<{ created: number; skipped: number; numbers: string[] }>("/invoices/generate", ym));
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Generate tagihan bulanan"
      description="Menerbitkan invoice untuk semua kontrak aktif yang periode tagihannya jatuh di bulan terpilih. Aman dijalankan ulang — tidak akan membuat duplikat."
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Selesai
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Batal</Button>
            <Button
              variant="primary"
              loading={m.pending}
              onClick={async () => {
                try {
                  const r = await m.run();
                  if (r) {
                    setResult(r);
                    toast.success(`${r.created} invoice diterbitkan`);
                  }
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Generate
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="text-[13.5px]">
          <p>
            <b className="num">{result.created}</b> invoice baru diterbitkan, <b className="num">{result.skipped}</b> kontrak dilewati (sudah ditagih atau bukan periodenya).
          </p>
          {result.numbers.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {result.numbers.map((n) => (
                <li key={n}>
                  <Badge dot={false} className="font-mono">
                    {n}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bulan" htmlFor="gen-month">
            <Select id="gen-month" value={String(ym.month)} onChange={(e) => setYm({ ...ym, month: Number(e.target.value) })} options={months.map((mm, i) => ({ value: String(i + 1), label: mm }))} />
          </Field>
          <Field label="Tahun" htmlFor="gen-year">
            <Input id="gen-year" type="number" value={ym.year} onChange={(e) => setYm({ ...ym, year: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Halaman tagihan ----------------
export function BillingPage() {
  const { can } = useSession();
  const { push } = useNav();
  const initialStatus = useSearchParam("status") ?? "";
  const newParam = useSearchParam("new");
  const presetCustomer = useSearchParam("customerId");
  const genParam = useSearchParam("generate");
  const [tab, setTab] = useState<"invoices" | "payments" | "confirmations">("invoices");
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [creating, setCreating] = useState(newParam === "1");
  const [generating, setGenerating] = useState(genParam === "1");
  useEffect(() => setStatus(initialStatus), [initialStatus]);
  useEffect(() => {
    if (newParam === "1") setCreating(true);
  }, [newParam]);
  const summary = useApi<{ outstanding: number; overdue: number; overdueCount: number; collectedThisMonth: number; draftCount: number }>("/invoices/summary");
  const invoices = useApi<InvoiceRow[]>(tab === "invoices" ? "/invoices" : null, { status, q: dq });
  const payments = useApi<(Payment & { invoiceNumber: string; customerName: string })[]>(tab === "payments" ? "/payments" : null);
  const confirmations = useApi<ConfirmationRow[]>("/payment-confirmations");
  const pendingCount = (confirmations.data ?? []).filter((c) => c.status === "PENDING").length;
  const manage = can("billing.manage");
  const s = summary.data;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Tagihan"
        description="Invoice, pembayaran, dan piutang pelanggan. Nominal dalam Rupiah, termasuk PPN."
        actions={
          manage && (
            <>
              <Button icon={<LuCalendarSync className="h-4 w-4" />} onClick={() => setGenerating(true)}>
                Generate bulanan
              </Button>
              <Button variant="primary" icon={<LuFilePlus2 className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Buat invoice
              </Button>
            </>
          )
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Piutang berjalan" value={s ? rupiah(s.outstanding, { compact: true }) : "—"} icon={<LuWallet />} />
        <Stat label="Lewat jatuh tempo" value={s ? rupiah(s.overdue, { compact: true }) : "—"} sub={s ? `${s.overdueCount} invoice` : undefined} tone="bad" />
        <Stat label="Diterima bulan ini" value={s ? rupiah(s.collectedThisMonth, { compact: true }) : "—"} tone="good" />
        <Stat label="Draft" value={s?.draftCount ?? "—"} sub="Belum diterbitkan" />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "invoices", label: "Invoice" },
          { value: "payments", label: "Pembayaran" },
          { value: "confirmations", label: "Konfirmasi pelanggan", count: pendingCount || undefined },
        ]}
      />
      {tab === "confirmations" ? (
        <ConfirmationsPanel rows={confirmations.data} manage={manage} />
      ) : tab === "invoices" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input id="inv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor atau pelanggan…" className="w-full sm:w-72" />
            <div className="flex flex-wrap gap-1.5">
              {["", ...INVOICE_STATUSES].map((st) => (
                <button
                  key={st || "all"}
                  onClick={() => setStatus(st)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors", status === st ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink")}
                >
                  {st ? INVOICE_STATUS[st as Invoice["status"]][0] : "Semua"}
                </button>
              ))}
            </div>
          </div>
          <ErrorBox error={invoices.error} onRetry={invoices.reload} />
          <div className="card">
            {!invoices.data ? (
              <Spinner />
            ) : invoices.data.length === 0 ? (
              <Empty title="Tidak ada invoice" description="Ubah filter atau buat invoice baru." />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nomor</th>
                      <th>Pelanggan</th>
                      <th>Terbit</th>
                      <th>Jatuh tempo</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Sisa</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data.map((i) => (
                      <tr key={i.id} className="row-link" onClick={() => push(`/billing/${i.id}`)}>
                        <td className="whitespace-nowrap font-mono text-xs">{i.number}</td>
                        <td className="font-semibold">{i.customerName}</td>
                        <td className="whitespace-nowrap text-muted">{date(i.issueDate)}</td>
                        <td className={cn("whitespace-nowrap", i.status === "OVERDUE" ? "font-semibold text-bad" : "text-muted")}>{date(i.dueDate)}</td>
                        <td className="num text-right">{rupiah(i.total)}</td>
                        <td className="num text-right font-semibold">{i.outstanding > 0 && i.status !== "VOID" && i.status !== "DRAFT" ? rupiah(i.outstanding) : "—"}</td>
                        <td>
                          <StatusBadge map={INVOICE_STATUS} value={i.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          {!payments.data ? (
            <Spinner />
          ) : payments.data.length === 0 ? (
            <Empty title="Belum ada pembayaran" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Invoice</th>
                    <th>Pelanggan</th>
                    <th>Metode</th>
                    <th>Referensi</th>
                    <th className="text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.map((p) => (
                    <tr key={p.id} className="row-link" onClick={() => push(`/billing/${p.invoiceId}`)}>
                      <td className="whitespace-nowrap text-muted">{dateTime(p.paidAt)}</td>
                      <td className="font-mono text-xs">{p.invoiceNumber}</td>
                      <td className="font-semibold">{p.customerName}</td>
                      <td>{PAYMENT_METHOD[p.method]}</td>
                      <td className="font-mono text-xs text-muted">{p.reference ?? "—"}</td>
                      <td className="num text-right font-semibold text-good">{rupiah(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <InvoiceFormModal open={creating} onClose={() => setCreating(false)} presetCustomerId={presetCustomer} onSaved={(i) => push(`/billing/${i.id}`)} />
      <GenerateModal open={generating} onClose={() => setGenerating(false)} />
    </div>
  );
}

type ConfirmationRow = PaymentConfirmation & { invoiceNumber: string; invoiceTotal: number; outstanding: number; customerName: string };

/** Verifikasi konfirmasi transfer yang dikirim pelanggan lewat portal. */
function ConfirmationsPanel({ rows, manage }: { rows?: ConfirmationRow[]; manage: boolean }) {
  const toast = useToast();
  const { push } = useNav();
  const [reject, setReject] = useState<ConfirmationRow | null>(null);
  const [note, setNote] = useState("");
  const accept = useMutation((id: string) => api.post(`/payment-confirmations/${id}/accept`, {}));
  const doReject = useMutation((id: string, reviewNote: string) => api.post(`/payment-confirmations/${id}/reject`, { reviewNote }));

  if (!rows) return <Spinner />;
  if (rows.length === 0) return <div className="card"><Empty title="Belum ada konfirmasi pembayaran" description="Konfirmasi transfer yang dikirim pelanggan dari portal muncul di sini." /></div>;

  return (
    <>
      <div className="card divide-y divide-line">
        {rows.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button className="font-mono text-xs font-semibold text-accent hover:underline" onClick={() => push(`/billing/${c.invoiceId}`)}>
                  {c.invoiceNumber}
                </button>
                <span className="font-semibold">{c.customerName}</span>
                <StatusBadge map={CONFIRMATION_STATUS} value={c.status} />
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {PAYMENT_METHOD[c.method]} · {date(c.paidAt, "long")} · {c.reference ? <span className="font-mono">{c.reference}</span> : "tanpa referensi"} · dikirim {relative(c.createdAt)}
              </p>
              {c.note && <p className="mt-1 text-[13px]">{c.note}</p>}
              {c.reviewNote && <p className="mt-1 text-[12.5px] text-faint">Catatan verifikasi: {c.reviewNote}</p>}
            </div>
            <div className="text-right">
              <p className="num font-display text-lg font-bold">{rupiah(c.amount)}</p>
              <p className="text-xs text-muted">sisa tagihan {rupiah(c.outstanding)}</p>
            </div>
            {manage && c.status === "PENDING" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={accept.pending}
                  onClick={async () => {
                    try {
                      await accept.run(c.id);
                      toast.success("Pembayaran tercatat");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Terima
                </Button>
                <Button size="sm" onClick={() => (setNote(""), setReject(c))}>
                  Tolak
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!reject}
        onClose={() => setReject(null)}
        title="Tolak konfirmasi pembayaran"
        message="Pelanggan akan melihat status ditolak dan bisa mengirim ulang konfirmasi."
        confirmLabel="Tolak"
        danger
        loading={doReject.pending}
        onConfirm={async () => {
          try {
            await doReject.run(reject!.id, note);
            toast.success("Konfirmasi ditolak");
            setReject(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <Field label="Alasan (dilihat pelanggan)" htmlFor="rej-note">
          <Input id="rej-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. dana belum masuk rekening" />
        </Field>
      </ConfirmDialog>
    </>
  );
}

// ---------------- Lembar invoice (dipakai admin & portal) ----------------
export function InvoiceSheet({ inv }: { inv: InvoiceDetail }) {
  const o = inv.organization;
  return (
    <article className="print-sheet card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line p-6 sm:p-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 grid-cols-2 grid-rows-2 gap-[3px] rounded-lg bg-accent p-[8px]" aria-hidden>
              <span className="rounded-[2px] bg-accent-ink" />
              <span className="rounded-[2px] bg-accent-ink/40" />
              <span className="rounded-[2px] bg-accent-ink/40" />
              <span className="rounded-[2px] bg-accent-ink" />
            </span>
            <span className="font-display text-lg font-bold">{o.name}</span>
          </div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">
            {o.address}
            {o.phone && <><br />{o.phone}</>}
            {o.email && <> · {o.email}</>}
            {o.npwp && <><br />NPWP {o.npwp}</>}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-[26px] font-bold uppercase tracking-wide">Invoice</p>
          <p className="font-mono text-[13px]">{inv.number}</p>
          <div className="mt-2">
            <StatusBadge map={INVOICE_STATUS} value={inv.status} />
          </div>
        </div>
      </div>
      <div className="grid gap-6 border-b border-line p-6 sm:grid-cols-3 sm:p-8">
        <div className="sm:col-span-1">
          <p className="eyebrow">Ditagihkan kepada</p>
          <p className="mt-1 font-semibold">{inv.customer?.name}</p>
          <p className="text-xs leading-relaxed text-muted">
            {inv.customer?.contactName && <>u.p. {inv.customer.contactName}<br /></>}
            {inv.customer?.address}
            {inv.customer?.npwp && <><br />NPWP {inv.customer.npwp}</>}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:col-span-2">
          <dt className="text-muted">Tanggal terbit</dt>
          <dd className="text-right font-semibold">{date(inv.issueDate, "long")}</dd>
          <dt className="text-muted">Jatuh tempo</dt>
          <dd className={cn("text-right font-semibold", inv.status === "OVERDUE" && "text-bad")}>{date(inv.dueDate, "long")}</dd>
          {inv.periodStart && (
            <>
              <dt className="text-muted">Periode</dt>
              <dd className="text-right">
                {date(inv.periodStart)} – {date(inv.periodEnd)}
              </dd>
            </>
          )}
          {inv.contract && (
            <>
              <dt className="text-muted">Kontrak</dt>
              <dd className="text-right font-mono text-xs">{inv.contract.number}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="!bg-transparent">Deskripsi</th>
              <th className="!bg-transparent text-right">Qty</th>
              <th className="!bg-transparent text-right">Harga</th>
              <th className="!bg-transparent text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num text-right">{it.quantity}</td>
                <td className="num whitespace-nowrap text-right">{rupiah(it.unitPrice)}</td>
                <td className="num whitespace-nowrap text-right font-semibold">{rupiah(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 border-t border-line p-6 sm:grid-cols-2 sm:p-8">
        <div className="text-[13px]">
          {o.bankAccountNo && (
            <>
              <p className="eyebrow">Pembayaran ke</p>
              <p className="mt-1 font-semibold">
                {o.bankName} · <span className="font-mono">{o.bankAccountNo}</span>
              </p>
              <p className="text-muted">a.n. {o.bankAccountName}</p>
              <p className="mt-1 text-xs text-faint">Cantumkan nomor invoice pada berita transfer.</p>
            </>
          )}
          {inv.notes && <p className="mt-3 whitespace-pre-line text-xs text-muted">{inv.notes}</p>}
        </div>
        <dl className="num flex flex-col gap-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{rupiah(inv.subtotal)}</dd>
          </div>
          {inv.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Diskon</dt>
              <dd>− {rupiah(inv.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">PPN {inv.taxRate}%</dt>
            <dd>{rupiah(inv.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-[16px] font-bold">
            <dt>Total</dt>
            <dd>{rupiah(inv.total)}</dd>
          </div>
          {inv.amountPaid > 0 && (
            <>
              <div className="flex justify-between text-good">
                <dt>Dibayar</dt>
                <dd>− {rupiah(inv.amountPaid)}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt>Sisa tagihan</dt>
                <dd>{rupiah(inv.outstanding)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </article>
  );
}

// ---------------- Detail invoice ----------------
export function InvoiceDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const toast = useToast();
  const { data: inv, error, reload } = useApi<InvoiceDetail>(`/invoices/${id}`);
  const [modal, setModal] = useState<null | "pay" | "void" | "edit" | "send">(null);
  const [pay, setPay] = useState<{ amount: number | ""; method: string; paidAt: string; reference: string }>({ amount: "", method: "TRANSFER", paidAt: todayISO(), reference: "" });
  const send = useMutation(() => api.post(`/invoices/${id}/send`));
  const voidInv = useMutation(() => api.post(`/invoices/${id}/void`));
  const record = useMutation(() => api.post(`/invoices/${id}/payments`, { ...pay, amount: pay.amount || 0, paidAt: new Date(`${pay.paidAt}T12:00:00+07:00`).toISOString(), reference: pay.reference || null }));
  const delPay = useMutation((pid: string) => api.del(`/payments/${pid}`));
  const manage = can("billing.manage");

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!inv) return <Spinner />;
  const payable = ["SENT", "PARTIAL", "OVERDUE"].includes(inv.status);

  return (
    <div className="animate-fade-up">
      <div className="no-print">
        <PageHeader
          back={
            <Link href="/billing" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
              <LuArrowLeft className="h-3.5 w-3.5" /> Tagihan
            </Link>
          }
          title={<span className="font-mono text-[24px]">{inv.number}</span>}
          description={
            <>
              {inv.customer?.name} · <Link href={`/customers/${inv.customerId}`} className="text-accent hover:underline">lihat pelanggan</Link>
            </>
          }
          actions={
            <>
              <Button icon={<LuPrinter className="h-4 w-4" />} onClick={() => window.print()}>
                Cetak / PDF
              </Button>
              {manage && inv.status === "DRAFT" && (
                <>
                  <Button icon={<LuPencil className="h-4 w-4" />} onClick={() => setModal("edit")}>
                    Ubah
                  </Button>
                  <Button variant="primary" icon={<LuSend className="h-4 w-4" />} onClick={() => setModal("send")}>
                    Terbitkan
                  </Button>
                </>
              )}
              {manage && payable && (
                <Button variant="primary" icon={<LuWallet className="h-4 w-4" />} onClick={() => (setPay({ amount: inv.outstanding, method: "TRANSFER", paidAt: todayISO(), reference: "" }), setModal("pay"))}>
                  Catat pembayaran
                </Button>
              )}
              {manage && inv.status !== "VOID" && inv.amountPaid === 0 && (
                <Button size="icon" aria-label="Batalkan invoice" title="Batalkan invoice" onClick={() => setModal("void")}>
                  <LuBan className="h-4 w-4" />
                </Button>
              )}
            </>
          }
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <InvoiceSheet inv={inv} />
        <div className="no-print flex flex-col gap-4">
          <Card title="Riwayat pembayaran" bodyClass="p-0">
            {inv.payments.length === 0 ? (
              <Empty title="Belum ada pembayaran" />
            ) : (
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="num font-semibold text-good">{rupiah(p.amount)}</div>
                      <div className="text-xs text-muted">
                        {PAYMENT_METHOD[p.method]} · {dateTime(p.paidAt)}
                      </div>
                      {p.reference && <div className="font-mono text-[11px] text-faint">{p.reference}</div>}
                    </div>
                    {manage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Hapus pembayaran"
                        onClick={async () => {
                          try {
                            await delPay.run(p.id);
                            toast.success("Pembayaran dihapus");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <LuTrash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {inv.contract && (
            <Card title="Terkait kontrak">
              <Link href={`/contracts/${inv.contract.id}`} className="block hover:underline">
                <div className="font-mono text-xs">{inv.contract.number}</div>
                <div className="font-semibold">{inv.contract.title}</div>
              </Link>
            </Card>
          )}
        </div>
      </div>

      <InvoiceFormModal open={modal === "edit"} onClose={() => setModal(null)} invoice={inv} />
      <Modal
        open={modal === "pay"}
        onClose={() => setModal(null)}
        size="sm"
        title="Catat pembayaran"
        description={`Sisa tagihan ${rupiah(inv.outstanding)}`}
        footer={
          <>
            <Button onClick={() => setModal(null)}>Batal</Button>
            <Button
              variant="primary"
              loading={record.pending}
              onClick={async () => {
                try {
                  await record.run();
                  toast.success("Pembayaran tercatat");
                  setModal(null);
                } catch {
                  /* tampil */
                }
              }}
            >
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {record.error && !record.error.fields && <ErrorBox error={record.error} />}
          <Field label="Jumlah diterima" htmlFor="pay-amount" error={record.error?.fields?.amount}>
            <MoneyInput id="pay-amount" value={pay.amount} onChange={(x) => setPay({ ...pay, amount: x })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Metode" htmlFor="pay-method">
              <Select id="pay-method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD[m] }))} />
            </Field>
            <Field label="Tanggal" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
            </Field>
          </div>
          <Field label="No. referensi" htmlFor="pay-ref" hint="Nomor transaksi bank / QRIS">
            <Input id="pay-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className="font-mono" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={modal === "send"}
        onClose={() => setModal(null)}
        title="Terbitkan invoice?"
        message="Invoice yang sudah terbit tidak bisa diubah dan akan terlihat di portal pelanggan."
        confirmLabel="Terbitkan"
        loading={send.pending}
        onConfirm={async () => {
          try {
            await send.run();
            toast.success("Invoice diterbitkan");
            setModal(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
      <ConfirmDialog
        open={modal === "void"}
        onClose={() => setModal(null)}
        title="Batalkan invoice?"
        message="Invoice akan berstatus Dibatalkan dan tidak dihitung sebagai piutang."
        confirmLabel="Batalkan invoice"
        danger
        loading={voidInv.pending}
        onConfirm={async () => {
          try {
            await voidInv.run();
            toast.success("Invoice dibatalkan");
            setModal(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
