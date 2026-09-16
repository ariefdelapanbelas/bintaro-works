"use client";
import { useEffect, useState } from "react";
import { LuArrowLeft, LuEllipsis, LuFilePlus2, LuFilePenLine, LuKeyRound, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import type { Booking, Contract, Customer, Invoice, ServiceRequest } from "@/core/domain/types";
import { api } from "@/client/api";
import {
  BOOKING_STATUS,
  CATEGORY_LABEL,
  CONTRACT_STATUS,
  CUSTOMER_STATUS,
  date,
  dateTime,
  INVOICE_STATUS,
  REQUEST_STATUS,
  rupiah,
  time,
} from "@/client/format";
import { useApi, useDebounced, useMutation } from "@/client/hooks";
import { Link, useNav, useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { clean, useForm } from "@/ui/form";
import { ConfirmDialog, Menu, Modal, useToast } from "@/ui/overlay";
import { Avatar, Button, Card, Empty, ErrorBox, Field, Input, KeyValue, PageHeader, Select, Spinner, Stat, StatusBadge, Tabs, Textarea } from "@/ui/primitives";

type CustomerRow = Customer & { activeContracts: number; mrr: number; outstanding: number };

export function CustomerFormModal({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer | null; onSaved?: (c: Customer) => void }) {
  const toast = useToast();
  const init = () => ({
    type: customer?.type ?? "COMPANY",
    name: customer?.name ?? "",
    contactName: customer?.contactName ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    npwp: customer?.npwp ?? "",
    industry: customer?.industry ?? "",
    address: customer?.address ?? "",
    status: customer?.status ?? "ACTIVE",
    notes: customer?.notes ?? "",
  });
  const { values: v, set, reset } = useForm(init());
  useEffect(() => {
    if (open) reset(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);
  const m = useMutation((body: unknown) => (customer ? api.patch<Customer>(`/customers/${customer.id}`, body) : api.post<Customer>("/customers", body)));
  const f = m.error?.fields ?? {};
  const submit = async () => {
    try {
      const c = await m.run(clean(v));
      toast.success(customer ? "Data pelanggan diperbarui" : "Pelanggan ditambahkan");
      onClose();
      if (c) onSaved?.(c);
    } catch {
      /* tampil di form */
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Ubah pelanggan" : "Pelanggan baru"}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={m.pending}>
            Simpan
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        {m.error && !m.error.fields && <ErrorBox error={m.error} />}
        <Field label="Jenis" htmlFor="cu-type">
          <Select id="cu-type" value={v.type} onChange={set("type")} options={[{ value: "COMPANY", label: "Badan usaha" }, { value: "INDIVIDUAL", label: "Perorangan" }]} />
        </Field>
        <Field label="Status" htmlFor="cu-status">
          <Select id="cu-status" value={v.status} onChange={set("status")} options={[{ value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Tidak aktif" }]} />
        </Field>
        <Field label={v.type === "COMPANY" ? "Nama perusahaan" : "Nama lengkap"} htmlFor="cu-name" error={f.name} required className="sm:col-span-2">
          <Input id="cu-name" value={v.name} onChange={set("name")} invalid={!!f.name} />
        </Field>
        <Field label="Nama PIC" htmlFor="cu-contact">
          <Input id="cu-contact" value={v.contactName} onChange={set("contactName")} />
        </Field>
        <Field label="Industri" htmlFor="cu-industry">
          <Input id="cu-industry" value={v.industry} onChange={set("industry")} />
        </Field>
        <Field label="Email penagihan" htmlFor="cu-email" error={f.email}>
          <Input id="cu-email" type="email" value={v.email} onChange={set("email")} invalid={!!f.email} />
        </Field>
        <Field label="Telepon" htmlFor="cu-phone">
          <Input id="cu-phone" value={v.phone} onChange={set("phone")} />
        </Field>
        <Field label="NPWP" htmlFor="cu-npwp" hint="Untuk faktur pajak">
          <Input id="cu-npwp" value={v.npwp} onChange={set("npwp")} placeholder="00.000.000.0-000.000" />
        </Field>
        <Field label="Alamat" htmlFor="cu-address">
          <Input id="cu-address" value={v.address} onChange={set("address")} />
        </Field>
        <Field label="Catatan" htmlFor="cu-notes" className="sm:col-span-2">
          <Textarea id="cu-notes" value={v.notes} onChange={set("notes")} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function CustomersPage() {
  const { can } = useSession();
  const { push } = useNav();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q);
  const { data, error, reload } = useApi<CustomerRow[]>("/customers", { q: dq, status });
  const [creating, setCreating] = useState(useSearchParam("new") === "1");

  const totals = (data ?? []).reduce((a, c) => ({ mrr: a.mrr + c.mrr, outstanding: a.outstanding + c.outstanding }), { mrr: 0, outstanding: 0 });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Pelanggan"
        description="Penyewa private office, pengguna virtual office, dan klien layanan bisnis."
        actions={
          can("customers.manage") && (
            <Button variant="primary" icon={<LuPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Pelanggan baru
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total pelanggan" value={data?.length ?? "—"} sub={`${(data ?? []).filter((c) => c.status === "ACTIVE").length} aktif`} />
        <Stat label="MRR dari kontrak aktif" value={rupiah(totals.mrr, { compact: true })} />
        <Stat label="Piutang" value={rupiah(totals.outstanding, { compact: true })} tone={totals.outstanding > 0 ? "warn" : undefined} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input id="cust-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, PIC, email…" className="w-full sm:w-72" />
        <Select id="cust-status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Semua status" options={[{ value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Tidak aktif" }]} className="w-full sm:w-44" />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {!data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty title="Tidak ada pelanggan" description="Ubah filter atau tambahkan pelanggan baru." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Kontak</th>
                  <th>Status</th>
                  <th className="text-right">Kontrak aktif</th>
                  <th className="text-right">MRR</th>
                  <th className="text-right">Piutang</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => push(`/customers/${c.id}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted">{c.industry ?? (c.type === "COMPANY" ? "Badan usaha" : "Perorangan")}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{c.contactName ?? "—"}</div>
                      <div className="text-xs text-muted">{c.phone ?? c.email ?? ""}</div>
                    </td>
                    <td>
                      <StatusBadge map={CUSTOMER_STATUS} value={c.status} />
                    </td>
                    <td className="num text-right">{c.activeContracts}</td>
                    <td className="num text-right font-semibold">{c.mrr ? rupiah(c.mrr) : "—"}</td>
                    <td className={`num text-right font-semibold ${c.outstanding > 0 ? "text-warn" : "text-faint"}`}>{c.outstanding ? rupiah(c.outstanding) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CustomerFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => push(`/customers/${c.id}`)} />
    </div>
  );
}

type CustomerDetail = Customer & {
  contracts: (Contract & { spaceName: string | null })[];
  invoices: (Invoice & { outstanding: number })[];
  bookings: (Booking & { spaceName: string })[];
  requests: ServiceRequest[];
  portalUsers: { membershipId: string; userId: string; name: string; email: string; lastLoginAt: string | null }[];
  stats: { mrr: number; outstanding: number; lifetimePaid: number };
};

export function CustomerDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const { data: c, error, reload } = useApi<CustomerDetail>(`/customers/${id}`);
  const [tab, setTab] = useState<"overview" | "contracts" | "invoices" | "bookings" | "requests" | "portal">("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalForm, setPortalForm] = useState({ name: "", email: "", password: "" });
  const del = useMutation(() => api.del(`/customers/${id}`));
  const addPortal = useMutation(() => api.post(`/customers/${id}/portal-users`, portalForm));
  const revoke = useMutation((mid: string) => api.del(`/customers/${id}/portal-users/${mid}`));
  const manage = can("customers.manage");

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!c) return <Spinner />;

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <LuArrowLeft className="h-3.5 w-3.5" /> Pelanggan
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={c.name} className="h-10 w-10 text-sm" />
            {c.name}
            <StatusBadge map={CUSTOMER_STATUS} value={c.status} />
          </span>
        }
        description={[c.industry, c.contactName && `PIC ${c.contactName}`, c.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            {can("contracts.manage") && (
              <Button icon={<LuFilePenLine className="h-4 w-4" />} onClick={() => push(`/contracts?new=1&customerId=${id}`)}>
                Buat kontrak
              </Button>
            )}
            {can("billing.manage") && (
              <Button icon={<LuFilePlus2 className="h-4 w-4" />} onClick={() => push(`/billing?new=1&customerId=${id}`)}>
                Buat invoice
              </Button>
            )}
            {manage && (
              <Menu
                trigger={
                  <Button size="icon" aria-label="Aksi lain">
                    <LuEllipsis className="h-4 w-4" />
                  </Button>
                }
                items={[
                  { label: "Ubah data", icon: <LuPencil className="h-4 w-4" />, onClick: () => setEditing(true) },
                  { label: "Hapus pelanggan", icon: <LuTrash2 className="h-4 w-4" />, danger: true, onClick: () => setConfirmDelete(true) },
                ]}
              />
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="MRR" value={rupiah(c.stats.mrr)} sub={`${c.contracts.filter((k) => k.status === "ACTIVE").length} kontrak aktif`} />
        <Stat label="Piutang" value={rupiah(c.stats.outstanding)} tone={c.stats.outstanding ? "warn" : undefined} />
        <Stat label="Total dibayar" value={rupiah(c.stats.lifetimePaid)} sub={`${c.invoices.length} invoice`} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Profil" },
          { value: "contracts", label: "Kontrak", count: c.contracts.length },
          { value: "invoices", label: "Invoice", count: c.invoices.length },
          { value: "bookings", label: "Booking", count: c.bookings.length },
          { value: "requests", label: "Permintaan", count: c.requests.length },
          { value: "portal", label: "Akses portal", count: c.portalUsers.length },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Informasi">
            <KeyValue
              items={[
                { label: "Jenis", value: c.type === "COMPANY" ? "Badan usaha" : "Perorangan" },
                { label: "Industri", value: c.industry },
                { label: "PIC", value: c.contactName },
                { label: "Telepon", value: c.phone },
                { label: "Email", value: c.email },
                { label: "NPWP", value: c.npwp },
                { label: "Alamat", value: c.address },
                { label: "Terdaftar", value: date(c.createdAt, "long") },
              ]}
            />
          </Card>
          <Card title="Catatan">{c.notes ? <p className="whitespace-pre-line text-[13.5px] text-muted">{c.notes}</p> : <p className="text-[13px] text-faint">Belum ada catatan.</p>}</Card>
        </div>
      )}

      {tab === "contracts" && (
        <div className="card">
          {c.contracts.length === 0 ? (
            <Empty title="Belum ada kontrak" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nomor</th>
                    <th>Layanan</th>
                    <th>Periode</th>
                    <th className="text-right">Biaya/bulan</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.contracts.map((k) => (
                    <tr key={k.id} className="row-link" onClick={() => push(`/contracts/${k.id}`)}>
                      <td className="font-mono text-xs">{k.number}</td>
                      <td>
                        <div className="font-semibold">{k.title}</div>
                        <div className="text-xs text-muted">{CATEGORY_LABEL[k.category]}</div>
                      </td>
                      <td className="whitespace-nowrap text-muted">
                        {date(k.startDate)} – {date(k.endDate)}
                      </td>
                      <td className="num text-right font-semibold">{rupiah(k.monthlyFee)}</td>
                      <td>
                        <StatusBadge map={CONTRACT_STATUS} value={k.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="card">
          {c.invoices.length === 0 ? (
            <Empty title="Belum ada invoice" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nomor</th>
                    <th>Terbit</th>
                    <th>Jatuh tempo</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Sisa</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.invoices.map((i) => (
                    <tr key={i.id} className="row-link" onClick={() => push(`/billing/${i.id}`)}>
                      <td className="font-mono text-xs">{i.number}</td>
                      <td className="text-muted">{date(i.issueDate)}</td>
                      <td className="text-muted">{date(i.dueDate)}</td>
                      <td className="num text-right">{rupiah(i.total)}</td>
                      <td className="num text-right font-semibold">{i.outstanding && i.status !== "VOID" ? rupiah(i.outstanding) : "—"}</td>
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
      )}

      {tab === "bookings" && (
        <div className="card">
          {c.bookings.length === 0 ? (
            <Empty title="Belum ada booking" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Ruang</th>
                    <th>Agenda</th>
                    <th className="text-right">Biaya</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap">
                        {date(b.startAt)} · {time(b.startAt)}–{time(b.endAt)}
                      </td>
                      <td>{b.spaceName}</td>
                      <td className="text-muted">{b.title}</td>
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
        </div>
      )}

      {tab === "requests" && (
        <div className="card divide-y divide-line">
          {c.requests.length === 0 ? (
            <Empty title="Belum ada permintaan" />
          ) : (
            c.requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-semibold">{r.subject}</div>
                  <div className="text-xs text-muted">
                    {r.category} · {dateTime(r.createdAt)}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{r.description}</p>
                </div>
                <StatusBadge map={REQUEST_STATUS} value={r.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === "portal" && (
        <Card
          title="Akun portal pelanggan"
          subtitle="Pelanggan bisa melihat tagihan, booking ruang, dan mengirim permintaan sendiri."
          action={
            manage && (
              <Button size="sm" variant="primary" icon={<LuKeyRound className="h-3.5 w-3.5" />} onClick={() => (setPortalForm({ name: c.contactName ?? "", email: c.email ?? "", password: "" }), setPortalOpen(true))}>
                Beri akses
              </Button>
            )
          }
          bodyClass="p-0"
        >
          {c.portalUsers.length === 0 ? (
            <Empty title="Belum ada akses portal" />
          ) : (
            <ul className="divide-y divide-line">
              {c.portalUsers.map((u) => (
                <li key={u.membershipId} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted">
                      {u.email} · {u.lastLoginAt ? `terakhir masuk ${dateTime(u.lastLoginAt)}` : "belum pernah masuk"}
                    </div>
                  </div>
                  {manage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await revoke.run(u.membershipId);
                          toast.success("Akses portal dicabut");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Cabut
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <CustomerFormModal open={editing} onClose={() => setEditing(false)} customer={c} />
      <Modal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        title="Beri akses portal"
        description={`Akun login untuk ${c.name}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setPortalOpen(false)}>Batal</Button>
            <Button
              variant="primary"
              loading={addPortal.pending}
              onClick={async () => {
                try {
                  await addPortal.run();
                  toast.success("Akun portal dibuat");
                  setPortalOpen(false);
                } catch {
                  /* tampil */
                }
              }}
            >
              Buat akun
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {addPortal.error && !addPortal.error.fields && <ErrorBox error={addPortal.error} />}
          <Field label="Nama" htmlFor="pu-name" error={addPortal.error?.fields?.name}>
            <Input id="pu-name" value={portalForm.name} onChange={(e) => setPortalForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email login" htmlFor="pu-email" error={addPortal.error?.fields?.email}>
            <Input id="pu-email" type="email" value={portalForm.email} onChange={(e) => setPortalForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Kata sandi awal" htmlFor="pu-pass" error={addPortal.error?.fields?.password} hint="Minimal 8 karakter. Sampaikan ke pelanggan secara aman.">
            <Input id="pu-pass" type="text" value={portalForm.password} onChange={(e) => setPortalForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus pelanggan?"
        message="Hanya pelanggan tanpa kontrak & invoice yang bisa dihapus. Untuk pelanggan lama, ubah status menjadi Tidak aktif."
        confirmLabel="Hapus"
        danger
        loading={del.pending}
        onConfirm={async () => {
          try {
            await del.run();
            toast.success("Pelanggan dihapus");
            push("/customers");
          } catch (e) {
            setConfirmDelete(false);
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
