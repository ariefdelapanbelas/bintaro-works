"use client";
import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuCirclePlay, LuPencil, LuPlus, LuRefreshCw, LuSquareX, LuTrash2 } from "react-icons/lu";
import { BILLING_CYCLES, PRODUCT_CATEGORIES, type Contract, type Customer, type Invoice, type Product, type Space } from "@/core/domain/types";
import { api } from "@/client/api";
import { BILLING_CYCLE, CATEGORY_LABEL, CONTRACT_STATUS, date, INVOICE_STATUS, isoDate, rupiah, SPACE_TYPE_LABEL, todayISO } from "@/client/format";
import { useApi, useDebounced, useMutation } from "@/client/hooks";
import { Link, useNav, useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { useForm } from "@/ui/form";
import { ConfirmDialog, Modal, useToast } from "@/ui/overlay";
import { Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, KeyValue, MoneyInput, PageHeader, Select, Spinner, StatusBadge, Switch, Tabs, Textarea } from "@/ui/primitives";

type ContractRow = Contract & { customerName: string; spaceName: string | null; daysLeft: number };

function addMonthsISO(ymd: string, months: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function ContractFormModal({ open, onClose, contract, preset, onSaved }: { open: boolean; onClose: () => void; contract?: Contract | null; preset?: { customerId?: string | null; spaceId?: string | null }; onSaved?: (c: Contract) => void }) {
  const toast = useToast();
  const customers = useApi<Customer[]>(open ? "/customers" : null);
  const spaces = useApi<Space[]>(open ? "/spaces" : null, { bookable: "false" });
  const products = useApi<Product[]>(open ? "/products" : null, { active: "true" });
  const init = () => {
    const start = contract ? isoDate(contract.startDate) : todayISO();
    return {
      customerId: contract?.customerId ?? preset?.customerId ?? "",
      spaceId: contract?.spaceId ?? preset?.spaceId ?? "",
      productId: contract?.productId ?? "",
      category: contract?.category ?? "PRIVATE_OFFICE",
      title: contract?.title ?? "",
      startDate: start,
      endDate: contract ? isoDate(contract.endDate) : addMonthsISO(start, 12),
      monthlyFee: (contract?.monthlyFee ?? "") as number | "",
      deposit: (contract?.deposit ?? "") as number | "",
      billingCycle: contract?.billingCycle ?? "MONTHLY",
      autoRenew: contract?.autoRenew ?? false,
      notes: contract?.notes ?? "",
    };
  };
  const { values: v, set, setValues, reset } = useForm(init());
  const [presetApplied, setPresetApplied] = useState(false);
  useEffect(() => {
    if (open) {
      reset(init());
      setPresetApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  // Isi otomatis dari ruang preset
  useEffect(() => {
    if (!open || presetApplied || contract || !preset?.spaceId || !spaces.data) return;
    const sp = spaces.data.find((s) => s.id === preset.spaceId);
    if (sp) applySpace(sp);
    setPresetApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spaces.data]);

  const applySpace = (sp: Space | undefined) => {
    if (!sp) return setValues((p) => ({ ...p, spaceId: "" }));
    const cat = sp.type === "COWORKING_DESK" ? "COWORKING" : sp.type === "PARKING" ? "PARKING" : "PRIVATE_OFFICE";
    setValues((p) => ({
      ...p,
      spaceId: sp.id,
      category: cat,
      title: p.title || `${SPACE_TYPE_LABEL[sp.type]} ${sp.code}${sp.type === "PRIVATE_OFFICE" ? ` (${sp.capacity} orang)` : ""}`,
      monthlyFee: p.monthlyFee === "" ? sp.monthlyPrice : p.monthlyFee,
      deposit: p.deposit === "" && sp.type === "PRIVATE_OFFICE" ? sp.monthlyPrice : p.deposit,
    }));
  };

  const m = useMutation((body: unknown) => (contract ? api.patch<Contract>(`/contracts/${contract.id}`, body) : api.post<Contract>("/contracts", body)));
  const f = m.error?.fields ?? {};
  const locked = !!contract && contract.status !== "DRAFT";
  const months = useMemo(() => {
    if (!v.startDate || !v.endDate) return 0;
    let n = 0;
    const [y, mo, d] = v.startDate.split("-").map(Number);
    const end = new Date(`${v.endDate}T00:00:00Z`).getTime();
    while (n < 1200) {
      const t = new Date(Date.UTC(y, mo - 1 + n, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      t.setUTCDate(Math.min(d, last));
      if (t.getTime() > end) break;
      n++;
    }
    return Math.max(n, 1);
  }, [v.startDate, v.endDate]);

  const submit = async () => {
    const body = locked
      ? { title: v.title, notes: v.notes || null, autoRenew: v.autoRenew }
      : { ...v, spaceId: v.spaceId || null, productId: v.productId || null, monthlyFee: v.monthlyFee === "" ? 0 : v.monthlyFee, deposit: v.deposit === "" ? 0 : v.deposit, notes: v.notes || null };
    try {
      const saved = await m.run(body);
      toast.success(contract ? "Kontrak diperbarui" : "Draft kontrak dibuat");
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
      title={contract ? `Ubah kontrak ${contract.number}` : "Kontrak baru"}
      description={locked ? "Kontrak aktif hanya bisa diubah judul, catatan, dan perpanjangan otomatis." : "Kontrak dibuat sebagai draft. Aktifkan setelah ditandatangani untuk menerbitkan invoice pertama."}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={m.pending}>
            {contract ? "Simpan" : "Buat draft"}
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
        <Field label="Pelanggan" htmlFor="ct-customer" error={f.customerId} required className="sm:col-span-2">
          <Select id="ct-customer" disabled={locked} value={v.customerId} onChange={set("customerId")} placeholder="Pilih pelanggan…" options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Ruang (opsional)" htmlFor="ct-space" error={f.spaceId} hint="Kosongkan untuk virtual office / layanan tanpa ruang">
          <Select
            id="ct-space"
            disabled={locked}
            value={v.spaceId}
            onChange={(e) => applySpace(spaces.data?.find((s) => s.id === e.target.value))}
            placeholder="Tanpa ruang"
            options={(spaces.data ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}${s.status !== "AVAILABLE" && s.id !== contract?.spaceId && s.type !== "COWORKING_DESK" ? ` (${s.status === "OCCUPIED" ? "terisi" : s.status.toLowerCase()})` : ""}` }))}
          />
        </Field>
        <Field label="Produk katalog (opsional)" htmlFor="ct-product">
          <Select
            id="ct-product"
            disabled={locked}
            value={v.productId}
            onChange={(e) => {
              const p = products.data?.find((x) => x.id === e.target.value);
              setValues((prev) => ({
                ...prev,
                productId: e.target.value,
                ...(p ? { category: p.category, title: prev.title || p.name, monthlyFee: prev.monthlyFee === "" && p.unit === "MONTH" ? p.price : prev.monthlyFee } : {}),
              }));
            }}
            placeholder="—"
            options={(products.data ?? []).filter((p) => p.unit === "MONTH").map((p) => ({ value: p.id, label: `${p.name} · ${rupiah(p.price)}` }))}
          />
        </Field>
        <Field label="Judul kontrak" htmlFor="ct-title" error={f.title} required>
          <Input id="ct-title" value={v.title} onChange={set("title")} invalid={!!f.title} />
        </Field>
        <Field label="Kategori" htmlFor="ct-category">
          <Select id="ct-category" disabled={locked} value={v.category} onChange={set("category")} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        </Field>
        <Field label="Tanggal mulai" htmlFor="ct-start" error={f.startDate}>
          <Input id="ct-start" type="date" disabled={locked} value={v.startDate} onChange={(e) => setValues((p) => ({ ...p, startDate: e.target.value, endDate: addMonthsISO(e.target.value, months || 12) }))} />
        </Field>
        <Field label="Tanggal selesai" htmlFor="ct-end" error={f.endDate} hint={`${months} bulan`}>
          <div className="flex gap-1.5">
            <Input id="ct-end" type="date" disabled={locked} value={v.endDate} onChange={set("endDate")} />
            {!locked &&
              [6, 12, 24].map((n) => (
                <button key={n} type="button" onClick={() => setValues((p) => ({ ...p, endDate: addMonthsISO(p.startDate, n) }))} className={cn("rounded-md border px-2 text-xs font-semibold", months === n ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}>
                  {n}b
                </button>
              ))}
          </div>
        </Field>
        <Field label="Biaya per bulan" htmlFor="ct-fee" error={f.monthlyFee} required>
          <MoneyInput id="ct-fee" value={v.monthlyFee} onChange={(x) => !locked && setValues((p) => ({ ...p, monthlyFee: x }))} />
        </Field>
        <Field label="Deposit" htmlFor="ct-deposit" error={f.deposit} hint="Ditagihkan di invoice pertama">
          <MoneyInput id="ct-deposit" value={v.deposit} onChange={(x) => !locked && setValues((p) => ({ ...p, deposit: x }))} />
        </Field>
        <Field label="Siklus penagihan" htmlFor="ct-cycle">
          <Select id="ct-cycle" disabled={locked} value={v.billingCycle} onChange={set("billingCycle")} options={BILLING_CYCLES.map((c) => ({ value: c, label: BILLING_CYCLE[c] }))} />
        </Field>
        <div className="flex items-end pb-2">
          <Switch id="ct-autorenew" checked={v.autoRenew} onChange={(b) => setValues((p) => ({ ...p, autoRenew: b }))} label="Perpanjang otomatis saat berakhir" />
        </div>
        <Field label="Catatan" htmlFor="ct-notes" className="sm:col-span-2">
          <Textarea id="ct-notes" value={v.notes} onChange={set("notes")} rows={2} placeholder="Diskon, ketentuan khusus, dsb." />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-raised px-4 py-3 text-[13px] sm:col-span-2">
          <span className="text-muted">Nilai kontrak</span>
          <span className="num font-display text-lg font-bold">{rupiah((v.monthlyFee || 0) * months)}</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ContractsPage() {
  const { can } = useSession();
  const { push } = useNav();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const all = useApi<ContractRow[]>("/contracts", { q: dq });
  const newParam = useSearchParam("new");
  const presetCustomer = useSearchParam("customerId");
  const presetSpace = useSearchParam("spaceId");
  const [creating, setCreating] = useState(newParam === "1");
  useEffect(() => {
    if (newParam === "1") setCreating(true);
  }, [newParam]);

  const rows = (all.data ?? []).filter((c) => !status || c.status === status);
  const count = (s: string) => (all.data ?? []).filter((c) => c.status === s).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Kontrak"
        description="Sewa private office, virtual office, coworking, dan parkir — lengkap dengan siklus tagihan."
        actions={
          can("contracts.manage") && (
            <Button variant="primary" icon={<LuPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Kontrak baru
            </Button>
          )
        }
      />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { value: "", label: "Semua", count: all.data?.length },
          { value: "ACTIVE", label: "Aktif", count: count("ACTIVE") },
          { value: "DRAFT", label: "Draft", count: count("DRAFT") },
          { value: "EXPIRED", label: "Berakhir", count: count("EXPIRED") },
          { value: "TERMINATED", label: "Diterminasi", count: count("TERMINATED") },
        ]}
      />
      <div className="mb-3">
        <Input id="ct-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor, pelanggan, ruang…" className="w-full sm:w-80" />
      </div>
      <ErrorBox error={all.error} onRetry={all.reload} />
      <div className="card">
        {!all.data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty title="Tidak ada kontrak" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th>Pelanggan</th>
                  <th>Layanan</th>
                  <th>Periode</th>
                  <th className="text-right">Biaya</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => push(`/contracts/${c.id}`)}>
                    <td className="whitespace-nowrap font-mono text-xs">{c.number}</td>
                    <td className="font-semibold">{c.customerName}</td>
                    <td>
                      <div>{c.title}</div>
                      <div className="text-xs text-muted">{c.spaceName ?? CATEGORY_LABEL[c.category]}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-muted">
                        {date(c.startDate)} – {date(c.endDate)}
                      </div>
                      {c.status === "ACTIVE" && c.daysLeft <= 45 && <div className={cn("text-xs font-semibold", c.daysLeft <= 14 ? "text-bad" : "text-warn")}>{c.daysLeft} hari lagi</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="num font-semibold">{rupiah(c.monthlyFee)}</div>
                      <div className="text-xs text-muted">{BILLING_CYCLE[c.billingCycle]}</div>
                    </td>
                    <td>
                      <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ContractFormModal open={creating} onClose={() => setCreating(false)} preset={{ customerId: presetCustomer, spaceId: presetSpace }} onSaved={(c) => push(`/contracts/${c.id}`)} />
    </div>
  );
}

type ContractDetail = Contract & { customer: Customer | null; space: Space | null; product: Product | null; invoices: (Invoice & { outstanding: number })[]; totalValue: number };

export function ContractDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const { data: c, error, reload } = useApi<ContractDetail>(`/contracts/${id}`);
  const [modal, setModal] = useState<null | "edit" | "activate" | "terminate" | "renew" | "delete">(null);
  const [term, setTerm] = useState({ date: todayISO(), reason: "" });
  const [renew, setRenew] = useState<{ months: number; monthlyFee: number | "" }>({ months: 12, monthlyFee: "" });
  const activate = useMutation(() => api.post<{ invoice: Invoice | null }>(`/contracts/${id}/activate`));
  const terminate = useMutation(() => api.post(`/contracts/${id}/terminate`, term));
  const doRenew = useMutation(() => api.post(`/contracts/${id}/renew`, { months: renew.months, monthlyFee: renew.monthlyFee === "" ? undefined : renew.monthlyFee }));
  const del = useMutation(() => api.del(`/contracts/${id}`));
  const manage = can("contracts.manage");

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!c) return <Spinner />;

  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  const progress = Math.max(0, Math.min(100, ((Date.now() - start) / Math.max(1, end - start)) * 100));
  const daysLeft = Math.ceil((end - Date.now()) / 86_400_000);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      setModal(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <Link href="/contracts" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <LuArrowLeft className="h-3.5 w-3.5" /> Kontrak
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.title} <StatusBadge map={CONTRACT_STATUS} value={c.status} />
          </span>
        }
        description={
          <>
            <span className="font-mono">{c.number}</span> · {c.customer?.name}
          </>
        }
        actions={
          manage && (
            <>
              {c.status === "DRAFT" && (
                <>
                  <Button variant="primary" icon={<LuCirclePlay className="h-4 w-4" />} onClick={() => setModal("activate")}>
                    Aktifkan
                  </Button>
                  <Button size="icon" aria-label="Hapus draft" onClick={() => setModal("delete")}>
                    <LuTrash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              {(c.status === "ACTIVE" || c.status === "EXPIRED") && (
                <Button icon={<LuRefreshCw className="h-4 w-4" />} onClick={() => (setRenew({ months: 12, monthlyFee: c.monthlyFee }), setModal("renew"))}>
                  Perpanjang
                </Button>
              )}
              {c.status === "ACTIVE" && (
                <Button icon={<LuSquareX className="h-4 w-4" />} onClick={() => setModal("terminate")}>
                  Terminasi
                </Button>
              )}
              <Button icon={<LuPencil className="h-4 w-4" />} onClick={() => setModal("edit")}>
                Ubah
              </Button>
            </>
          )
        }
      />

      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2 text-[13px]">
          <div>
            <p className="eyebrow">Mulai</p>
            <p className="font-semibold">{date(c.startDate, "long")}</p>
          </div>
          <div className="text-center">
            {c.status === "ACTIVE" && <Badge tone={daysLeft <= 14 ? "bad" : daysLeft <= 45 ? "warn" : "good"}>{daysLeft > 0 ? `${daysLeft} hari tersisa` : "Berakhir hari ini"}</Badge>}
            {c.autoRenew && <Badge tone="info" className="ml-1">Auto-renew</Badge>}
          </div>
          <div className="text-right">
            <p className="eyebrow">Selesai</p>
            <p className="font-semibold">{date(c.endDate, "long")}</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-ink/[0.06]">
          <div className={cn("h-2 rounded-full", c.status === "ACTIVE" ? "bg-accent" : "bg-faint")} style={{ width: `${c.status === "DRAFT" ? 0 : progress}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card title="Rincian kontrak">
            <KeyValue
              items={[
                { label: "Biaya per bulan", value: <span className="num font-display text-lg font-bold">{rupiah(c.monthlyFee)}</span> },
                { label: "Nilai total kontrak", value: <span className="num font-display text-lg font-bold">{rupiah(c.totalValue)}</span> },
                { label: "Siklus penagihan", value: BILLING_CYCLE[c.billingCycle] },
                { label: "Deposit", value: rupiah(c.deposit) },
                { label: "Kategori", value: CATEGORY_LABEL[c.category] },
                { label: "Ditandatangani", value: c.signedAt ? date(c.signedAt, "long") : "Belum" },
                ...(c.terminatedAt ? [{ label: "Diterminasi", value: date(c.terminatedAt, "long") }] : []),
              ]}
            />
            {c.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-raised p-3 text-[13px] text-muted">{c.notes}</p>}
          </Card>
          <Card title="Invoice dari kontrak ini" bodyClass="p-0" action={can("billing.manage") && c.status === "ACTIVE" ? <Link href="/billing?generate=1" className="text-xs font-semibold text-accent hover:underline">Generate tagihan bulanan</Link> : undefined}>
            {c.invoices.length === 0 ? (
              <Empty title="Belum ada invoice" description={c.status === "DRAFT" ? "Invoice pertama terbit otomatis saat kontrak diaktifkan." : undefined} />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nomor</th>
                      <th>Periode</th>
                      <th className="text-right">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.invoices.map((i) => (
                      <tr key={i.id} className="row-link" onClick={() => push(`/billing/${i.id}`)}>
                        <td className="font-mono text-xs">{i.number}</td>
                        <td className="whitespace-nowrap text-muted">{i.periodStart ? `${date(i.periodStart)} – ${date(i.periodEnd)}` : date(i.issueDate)}</td>
                        <td className="num text-right font-semibold">{rupiah(i.total)}</td>
                        <td>
                          <StatusBadge map={INVOICE_STATUS} value={i.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {c.customer && (
            <Card title="Pelanggan" action={<Link href={`/customers/${c.customer.id}`} className="text-xs font-semibold text-accent hover:underline">Profil</Link>}>
              <KeyValue cols={1} items={[{ label: "Nama", value: c.customer.name }, { label: "PIC", value: c.customer.contactName }, { label: "Kontak", value: c.customer.phone ?? c.customer.email }, { label: "NPWP", value: c.customer.npwp }]} />
            </Card>
          )}
          {c.space && (
            <Card title="Ruang" action={<Link href={`/spaces/${c.space.id}`} className="text-xs font-semibold text-accent hover:underline">Detail</Link>}>
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-accent-soft px-2.5 py-2 font-mono text-sm font-bold text-accent">{c.space.code}</span>
                <div>
                  <div className="font-semibold">{c.space.name}</div>
                  <div className="text-xs text-muted">
                    {SPACE_TYPE_LABEL[c.space.type]} · {c.space.capacity} orang
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ContractFormModal open={modal === "edit"} onClose={() => setModal(null)} contract={c} />
      <ConfirmDialog
        open={modal === "activate"}
        onClose={() => setModal(null)}
        title="Aktifkan kontrak?"
        message={
          <>
            Status ruang {c.space ? <b>{c.space.code}</b> : ""} akan menjadi <b>Terisi</b> dan invoice periode pertama{c.deposit ? " beserta deposit" : ""} langsung diterbitkan ke {c.customer?.name}.
          </>
        }
        confirmLabel="Aktifkan & terbitkan invoice"
        loading={activate.pending}
        onConfirm={() =>
          run(async () => {
            const r = await activate.run();
            if (r?.invoice) toast.success(`Invoice ${r.invoice.number} diterbitkan`);
          }, "Kontrak aktif")
        }
      />
      <ConfirmDialog open={modal === "terminate"} onClose={() => setModal(null)} title="Terminasi kontrak" message="Ruang akan kembali tersedia. Invoice yang sudah terbit tidak berubah." confirmLabel="Terminasi" danger loading={terminate.pending} onConfirm={() => run(() => terminate.run(), "Kontrak diterminasi")}>
        <div className="flex flex-col gap-3">
          <Field label="Tanggal efektif" htmlFor="term-date" error={terminate.error?.fields?.date}>
            <Input id="term-date" type="date" value={term.date} onChange={(e) => setTerm({ ...term, date: e.target.value })} />
          </Field>
          <Field label="Alasan" htmlFor="term-reason">
            <Input id="term-reason" value={term.reason} onChange={(e) => setTerm({ ...term, reason: e.target.value })} placeholder="mis. pindah kantor" />
          </Field>
        </div>
      </ConfirmDialog>
      <ConfirmDialog open={modal === "renew"} onClose={() => setModal(null)} title="Perpanjang kontrak" message={`Tanggal selesai saat ini ${date(c.endDate, "long")}.`} confirmLabel="Perpanjang" loading={doRenew.pending} onConfirm={() => run(() => doRenew.run(), "Kontrak diperpanjang")}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tambahan (bulan)" htmlFor="renew-months">
            <Select id="renew-months" value={String(renew.months)} onChange={(e) => setRenew({ ...renew, months: Number(e.target.value) })} options={[3, 6, 12, 24].map((n) => ({ value: String(n), label: `${n} bulan` }))} />
          </Field>
          <Field label="Biaya baru / bulan" htmlFor="renew-fee">
            <MoneyInput id="renew-fee" value={renew.monthlyFee} onChange={(x) => setRenew({ ...renew, monthlyFee: x })} />
          </Field>
        </div>
      </ConfirmDialog>
      <ConfirmDialog open={modal === "delete"} onClose={() => setModal(null)} title="Hapus draft kontrak?" message="Draft akan dihapus permanen." confirmLabel="Hapus" danger loading={del.pending} onConfirm={() => run(async () => (await del.run(), push("/contracts")), "Draft dihapus")} />
    </div>
  );
}
