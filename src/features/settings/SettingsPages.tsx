"use client";
import { useEffect, useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import type { AuditLog, Organization, Role } from "@/core/domain/types";
import { api } from "@/client/api";
import { dateTime, relative, ROLE_LABEL } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Link } from "@/client/nav";
import { useSession } from "@/client/session";
import { ConfirmDialog, Modal, useToast } from "@/ui/overlay";
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Switch, Tabs, Textarea } from "@/ui/primitives";

type Member = { membershipId: string; userId: string; name: string; email: string; role: Role; isActive: boolean; lastLoginAt: string | null; isSelf: boolean };

const ROLE_DESC: Record<string, string> = {
  OWNER: "Akses penuh termasuk kelola tim",
  ADMIN: "Akses penuh operasional & pengaturan",
  STAFF: "CRM, pelanggan, kontrak, booking, permintaan",
  FINANCE: "Tagihan, pembayaran, katalog, laporan",
};

function OrganizationForm() {
  const toast = useToast();
  const { refresh } = useSession();
  const { data, error, reload } = useApi<Organization>("/settings/organization");
  const [v, setV] = useState<Record<string, string>>({});
  const [publicEnabled, setPublicEnabled] = useState(true);
  useEffect(() => {
    if (data)
      setV({
        name: data.name,
        email: data.email ?? "",
        phone: data.phone ?? "",
        address: data.address ?? "",
        npwp: data.npwp ?? "",
        taxRate: String(data.taxRate),
        invoicePrefix: data.invoicePrefix,
        contractPrefix: data.contractPrefix,
        paymentTermDays: String(data.paymentTermDays),
        bankName: data.bankName ?? "",
        bankAccountNo: data.bankAccountNo ?? "",
        bankAccountName: data.bankAccountName ?? "",
        whatsapp: data.whatsapp ?? "",
        publicTagline: data.publicTagline ?? "",
      });
    if (data) setPublicEnabled(data.publicEnabled);
  }, [data]);
  const save = useMutation(() =>
    api.patch("/settings/organization", {
      ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === "" ? null : x])),
      name: v.name,
      taxRate: Number(v.taxRate),
      paymentTermDays: Number(v.paymentTermDays),
      invoicePrefix: v.invoicePrefix,
      contractPrefix: v.contractPrefix,
      publicEnabled,
    }),
  );
  const f = save.error?.fields ?? {};
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const input = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} htmlFor={`org-${k}`} error={f[k]} {...(props.hint ? { hint: props.hint as string } : {})}>
      <Input id={`org-${k}`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save.run();
          await refresh();
          toast.success("Pengaturan tersimpan");
        } catch {
          /* tampil */
        }
      }}
    >
      {save.error && !save.error.fields && <ErrorBox error={save.error} />}
      <Card title="Profil usaha" subtitle="Tampil di kop invoice">
        <div className="grid gap-4 sm:grid-cols-2">
          {input("name", "Nama organisasi")}
          {input("npwp", "NPWP")}
          {input("email", "Email")}
          {input("phone", "Telepon")}
          <div className="sm:col-span-2">{input("address", "Alamat")}</div>
        </div>
      </Card>
      <Card title="Penagihan">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {input("taxRate", "PPN (%)", { type: "number", min: 0, max: 100 })}
          {input("paymentTermDays", "Termin bayar (hari)", { type: "number", min: 0 })}
          {input("invoicePrefix", "Prefix invoice", { className: "font-mono", hint: "Contoh: BW-INV/202609/0001" })}
          {input("contractPrefix", "Prefix kontrak", { className: "font-mono" })}
          {input("bankName", "Bank")}
          {input("bankAccountNo", "No. rekening", { className: "font-mono" })}
          <div className="sm:col-span-2">{input("bankAccountName", "Atas nama")}</div>
        </div>
      </Card>
      <Card title="Aplikasi pelanggan" subtitle="Halaman publik tempat calon pelanggan melihat harga, booking ruang, dan mendaftar sendiri">
        <div className="flex flex-col gap-4">
          <Switch id="org-public" checked={publicEnabled} onChange={setPublicEnabled} label="Aktifkan halaman publik" />
          <Field label="Kalimat pembuka" htmlFor="org-publicTagline" hint="Tampil sebagai judul besar di halaman depan">
            <Textarea id="org-publicTagline" rows={2} value={v.publicTagline ?? ""} onChange={(e) => setV({ ...v, publicTagline: e.target.value })} />
          </Field>
          {input("whatsapp", "Nomor WhatsApp", { placeholder: "6281287009900", hint: "Format internasional tanpa tanda + (untuk tombol chat)" })}
          <div className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px]">
            Alamat halaman pelanggan:{" "}
            <Link href={`/o/${data.slug}`} className="font-semibold text-accent hover:underline">
              /o/{data.slug}
            </Link>
            <p className="mt-1 text-xs text-faint">Bagikan tautan ini di Instagram, Google Maps, atau QR code di resepsionis.</p>
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={save.pending}>
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}

function TeamPanel() {
  const toast = useToast();
  const { me } = useSession();
  const { data, error, reload } = useApi<Member[]>("/team");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [removing, setRemoving] = useState<Member | null>(null);
  const add = useMutation(() => api.post("/team", form));
  const change = useMutation((mid: string, role: string) => api.patch(`/team/${mid}`, { role }));
  const remove = useMutation((mid: string) => api.del(`/team/${mid}`));
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <Card
        title="Anggota tim"
        subtitle="Setiap orang punya akun sendiri — aktivitas tercatat di log."
        action={
          <Button size="sm" variant="primary" icon={<LuUserPlus className="h-3.5 w-3.5" />} onClick={() => (setForm({ name: "", email: "", password: "", role: "STAFF" }), setAdding(true))}>
            Tambah anggota
          </Button>
        }
        bodyClass="p-0"
      >
        {!data ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((m) => (
              <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    {m.name} {m.isSelf && <Badge tone="accent">Anda</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {m.email} · {m.lastLoginAt ? `aktif ${relative(m.lastLoginAt)}` : "belum pernah masuk"}
                  </div>
                </div>
                <Select
                  id={`role-${m.membershipId}`}
                  aria-label={`Role ${m.name}`}
                  value={m.role}
                  disabled={m.isSelf || (m.role === "OWNER" && me?.role !== "OWNER")}
                  onChange={async (e) => {
                    try {
                      await change.run(m.membershipId, e.target.value);
                      toast.success(`Role ${m.name} → ${ROLE_LABEL[e.target.value]}`);
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                  options={["OWNER", "ADMIN", "STAFF", "FINANCE"].map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  className="w-44"
                />
                {!m.isSelf && (
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                    Cabut akses
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4" title="Hak akses per role">
        <ul className="grid gap-3 sm:grid-cols-2">
          {Object.entries(ROLE_DESC).map(([r, d]) => (
            <li key={r} className="rounded-lg border border-line p-3">
              <div className="font-semibold">{ROLE_LABEL[r]}</div>
              <div className="text-xs text-muted">{d}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title="Tambah anggota tim"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Batal</Button>
            <Button
              variant="primary"
              loading={add.pending}
              onClick={async () => {
                try {
                  await add.run();
                  toast.success("Anggota ditambahkan");
                  setAdding(false);
                } catch {
                  /* tampil */
                }
              }}
            >
              Tambah
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {add.error && !add.error.fields && <ErrorBox error={add.error} />}
          <Field label="Nama" htmlFor="tm-name" error={add.error?.fields?.name}>
            <Input id="tm-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="tm-email" error={add.error?.fields?.email}>
            <Input id="tm-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Kata sandi awal" htmlFor="tm-pass" error={add.error?.fields?.password} hint="Minimal 8 karakter">
            <Input id="tm-pass" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role" htmlFor="tm-role" hint={ROLE_DESC[form.role]}>
            <Select id="tm-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={["ADMIN", "STAFF", "FINANCE", ...(me?.role === "OWNER" ? ["OWNER"] : [])].map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Cabut akses ${removing?.name}?`}
        message="Orang ini tidak akan bisa masuk ke organisasi Anda lagi."
        confirmLabel="Cabut akses"
        danger
        loading={remove.pending}
        onConfirm={async () => {
          try {
            await remove.run(removing!.membershipId);
            toast.success("Akses dicabut");
            setRemoving(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </>
  );
}

export function PasswordPanel() {
  const toast = useToast();
  const [v, setV] = useState({ currentPassword: "", newPassword: "" });
  const m = useMutation(() => api.post("/auth/password", v));
  return (
    <Card title="Ganti kata sandi" className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await m.run();
            toast.success("Kata sandi diganti");
            setV({ currentPassword: "", newPassword: "" });
          } catch {
            /* tampil */
          }
        }}
      >
        {m.error && !m.error.fields && <ErrorBox error={m.error} />}
        <Field label="Kata sandi saat ini" htmlFor="pw-current" error={m.error?.fields?.currentPassword}>
          <Input id="pw-current" type="password" autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} />
        </Field>
        <Field label="Kata sandi baru" htmlFor="pw-new" error={m.error?.fields?.newPassword} hint="Minimal 8 karakter">
          <Input id="pw-new" type="password" autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} />
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={m.pending}>
            Simpan
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<"org" | "team" | "security">("org");
  return (
    <div className="animate-fade-up">
      <PageHeader title="Pengaturan" description="Profil usaha, penagihan, tim, dan keamanan akun." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ value: "org", label: "Organisasi" }, ...(can("team.manage") ? [{ value: "team" as const, label: "Tim & akses" }] : []), { value: "security", label: "Keamanan" }]}
      />
      {tab === "org" && <OrganizationForm />}
      {tab === "team" && <TeamPanel />}
      {tab === "security" && <PasswordPanel />}
    </div>
  );
}

export function AuditPage() {
  const [entity, setEntity] = useState("");
  const { data, error, reload } = useApi<AuditLog[]>("/audit", { entity });
  return (
    <div className="animate-fade-up">
      <PageHeader title="Log Aktivitas" description="Jejak audit setiap perubahan data: siapa, apa, kapan. 300 aktivitas terakhir." />
      <div className="mb-3">
        <Select
          id="audit-entity"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder="Semua modul"
          options={["Lead", "Customer", "Contract", "Booking", "Invoice", "Space", "Product", "Membership", "Organization", "User"].map((x) => ({ value: x, label: x }))}
          className="w-full sm:w-56"
        />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {!data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty title="Belum ada aktivitas" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Pengguna</th>
                  <th>Aktivitas</th>
                  <th>Modul</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-muted">{dateTime(a.createdAt)}</td>
                    <td className="whitespace-nowrap font-semibold">{a.userName ?? "Sistem"}</td>
                    <td>{a.summary}</td>
                    <td>
                      <Badge dot={false} className="font-mono">
                        {a.action}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
