"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuCalendarClock,
  LuEllipsis,
  LuKanban,
  LuList,
  LuMail,
  LuMessageCircle,
  LuPencil,
  LuPhone,
  LuPlus,
  LuTrash2,
  LuUserCheck,
} from "react-icons/lu";
import { LEAD_SOURCES, LEAD_STAGES, PRODUCT_CATEGORIES, type Lead, type LeadActivity, type LeadStage } from "@/core/domain/types";
import { api } from "@/client/api";
import { ACTIVITY_LABEL, CATEGORY_LABEL, date, dateTime, isoDate, LEAD_SOURCE, LEAD_STAGE, relative, rupiah, todayISO } from "@/client/format";
import { useApi, useDebounced, useMutation } from "@/client/hooks";
import { Link, useNav, useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { clean, useForm } from "@/ui/form";
import { ConfirmDialog, Menu, Modal, useToast } from "@/ui/overlay";
import { Avatar, Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, KeyValue, MoneyInput, PageHeader, Segmented, Select, Spinner, Textarea } from "@/ui/primitives";

type LeadRow = Lead & { ownerName: string | null };

const OPEN_STAGES: LeadStage[] = ["NEW", "CONTACTED", "SITE_VISIT", "PROPOSAL", "NEGOTIATION"];

// ---------------- Form lead ----------------
export function LeadFormModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead?: LeadRow | null; onSaved?: (l: Lead) => void }) {
  const toast = useToast();
  const staff = useApi<{ id: string; name: string }[]>(open ? "/staff" : null);
  const init = () => ({
    name: lead?.name ?? "",
    company: lead?.company ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    source: lead?.source ?? "WHATSAPP",
    interest: lead?.interest ?? "PRIVATE_OFFICE",
    expectedValue: (lead?.expectedValue ?? "") as number | "",
    ownerId: lead?.ownerId ?? "",
    nextFollowUpAt: lead?.nextFollowUpAt ? isoDate(lead.nextFollowUpAt) : todayISO(1),
    notes: lead?.notes ?? "",
  });
  const { values: v, set, reset } = useForm(init());
  useEffect(() => {
    if (open) reset(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id]);
  const m = useMutation((body: unknown) => (lead ? api.patch<Lead>(`/leads/${lead.id}`, body) : api.post<Lead>("/leads", body)));
  const f = m.error?.fields ?? {};

  const submit = async () => {
    try {
      const saved = await m.run(clean({ ...v, expectedValue: v.expectedValue === "" ? 0 : v.expectedValue }));
      toast.success(lead ? "Lead diperbarui" : "Lead ditambahkan");
      onClose();
      if (saved) onSaved?.(saved);
    } catch {
      /* ditampilkan di form */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? "Ubah lead" : "Lead baru"}
      description="Catat calon penyewa dari WhatsApp, walk-in, atau website."
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
        <Field label="Nama kontak" htmlFor="lead-name" error={f.name} required>
          <Input id="lead-name" value={v.name} onChange={set("name")} invalid={!!f.name} />
        </Field>
        <Field label="Perusahaan" htmlFor="lead-company" error={f.company}>
          <Input id="lead-company" value={v.company} onChange={set("company")} placeholder="Kosongkan bila perorangan" />
        </Field>
        <Field label="Telepon / WhatsApp" htmlFor="lead-phone" error={f.phone}>
          <Input id="lead-phone" value={v.phone} onChange={set("phone")} inputMode="tel" />
        </Field>
        <Field label="Email" htmlFor="lead-email" error={f.email}>
          <Input id="lead-email" type="email" value={v.email} onChange={set("email")} invalid={!!f.email} />
        </Field>
        <Field label="Sumber" htmlFor="lead-source">
          <Select id="lead-source" value={v.source} onChange={set("source")} options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE[s] }))} />
        </Field>
        <Field label="Minat layanan" htmlFor="lead-interest">
          <Select id="lead-interest" value={v.interest} onChange={set("interest")} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        </Field>
        <Field label="Perkiraan nilai deal" htmlFor="lead-value" error={f.expectedValue} hint="Total nilai kontrak yang diharapkan">
          <MoneyInput id="lead-value" value={v.expectedValue} onChange={set("expectedValue")} />
        </Field>
        <Field label="Follow-up berikutnya" htmlFor="lead-follow" error={f.nextFollowUpAt}>
          <Input id="lead-follow" type="date" value={v.nextFollowUpAt} onChange={set("nextFollowUpAt")} />
        </Field>
        <Field label="PIC" htmlFor="lead-owner" className="sm:col-span-2">
          <Select id="lead-owner" value={v.ownerId} onChange={set("ownerId")} placeholder="Saya sendiri" options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Catatan" htmlFor="lead-notes" className="sm:col-span-2">
          <Textarea id="lead-notes" value={v.notes} onChange={set("notes")} placeholder="Kebutuhan ruang, jumlah orang, budget…" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function LostReasonModal({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void; loading?: boolean }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [open]);
  return (
    <ConfirmDialog open={open} onClose={onClose} onConfirm={() => onSubmit(reason)} title="Tandai lead gagal" message="Alasan membantu tim memperbaiki penawaran berikutnya." confirmLabel="Tandai gagal" danger loading={loading}>
      <Field label="Alasan" htmlFor="lost-reason">
        <Input id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. harga, lokasi, fasilitas" />
      </Field>
    </ConfirmDialog>
  );
}

// ---------------- Daftar lead ----------------
export function LeadsPage() {
  const { can } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const dq = useDebounced(q);
  const { data, error, reload, setData } = useApi<LeadRow[]>("/leads", { q: dq, source });
  const [creating, setCreating] = useState(useSearchParam("new") === "1");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const manage = can("crm.manage");

  const moveStage = useMutation((id: string, stage: LeadStage, lostReason?: string) => api.post(`/leads/${id}/stage`, { stage, lostReason }));

  const move = async (id: string, stage: LeadStage, lostReason?: string) => {
    const lead = data?.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === "LOST" && lostReason === undefined) return setLostFor(id);
    setData((rows) => rows?.map((r) => (r.id === id ? { ...r, stage } : r))); // optimistis
    try {
      await moveStage.run(id, stage, lostReason);
      toast.success(`${lead.name} → ${LEAD_STAGE[stage][0]}`);
    } catch (e) {
      toast.error((e as Error).message);
      reload();
    }
  };

  const columns = useMemo(() => LEAD_STAGES.map((s) => ({ stage: s, rows: (data ?? []).filter((l) => l.stage === s) })), [data]);
  const today = todayISO();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="CRM & Lead"
        description="Pipeline calon penyewa dari pertanyaan pertama hingga tanda tangan kontrak. Seret kartu untuk memindahkan tahap."
        actions={
          manage && (
            <Button variant="primary" icon={<LuPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Lead baru
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input id="lead-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, perusahaan, telepon…" className="w-full sm:w-72" />
        <Select id="lead-source-filter" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Semua sumber" options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE[s] }))} className="w-full sm:w-44" />
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            items={[
              { value: "board", label: <><LuKanban className="h-3.5 w-3.5" /> Papan</> },
              { value: "table", label: <><LuList className="h-3.5 w-3.5" /> Tabel</> },
            ]}
          />
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {!data ? (
        <Spinner />
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[1360px] grid-cols-7 gap-3">
            {columns.map(({ stage, rows }) => {
              const [label, tone] = LEAD_STAGE[stage];
              const total = rows.reduce((a, r) => a + r.expectedValue, 0);
              return (
                <div
                  key={stage}
                  onDragOver={(e) => {
                    if (!manage) return;
                    e.preventDefault();
                    setOverStage(stage);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    if (dragId) move(dragId, stage);
                    setDragId(null);
                  }}
                  className={cn("flex min-h-[420px] flex-col rounded-xl border bg-raised/60 transition-colors", overStage === stage ? "border-accent bg-accent-soft/40" : "border-line")}
                >
                  <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                    <Badge tone={tone}>{label}</Badge>
                    <span className="num text-xs font-semibold text-faint">{rows.length}</span>
                  </div>
                  <div className="num px-3 pb-2 text-[11.5px] text-faint">{rupiah(total, { compact: true })}</div>
                  <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                    {rows.map((l) => {
                      const overdue = l.nextFollowUpAt && isoDate(l.nextFollowUpAt) <= today && OPEN_STAGES.includes(l.stage);
                      return (
                        <div
                          key={l.id}
                          draggable={manage}
                          onDragStart={() => setDragId(l.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => push(`/crm/${l.id}`)}
                          className={cn(
                            "cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-soft transition hover:border-faint/60",
                            dragId === l.id && "opacity-50",
                          )}
                        >
                          <div className="text-[13px] font-semibold leading-snug">{l.name}</div>
                          <div className="truncate text-xs text-muted">{l.company ?? "Perorangan"}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="num whitespace-nowrap text-[12px] font-semibold">{rupiah(l.expectedValue, { compact: true })}</span>
                            <span className="text-[11px] text-faint">{LEAD_SOURCE[l.source]}</span>
                          </div>
                          {(l.nextFollowUpAt || l.ownerName) && (
                            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                              {l.nextFollowUpAt && OPEN_STAGES.includes(l.stage) ? (
                                <span className={cn("flex items-center gap-1 text-[11px] font-medium", overdue ? "text-bad" : "text-faint")}>
                                  <LuCalendarClock className="h-3 w-3" />
                                  {new Date(l.nextFollowUpAt).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short" })}
                                </span>
                              ) : (
                                <span />
                              )}
                              {l.ownerName && <Avatar name={l.ownerName} className="h-5 w-5 text-[8px]" />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {rows.length === 0 && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-6 text-[11.5px] text-faint">Kosong</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          {data.length === 0 ? (
            <Empty title="Belum ada lead" description="Tambahkan lead pertama Anda." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Tahap</th>
                    <th>Minat</th>
                    <th>Sumber</th>
                    <th className="text-right">Nilai</th>
                    <th>Follow-up</th>
                    <th>PIC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((l) => (
                    <tr key={l.id} className="row-link" onClick={() => push(`/crm/${l.id}`)}>
                      <td>
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-xs text-muted">{l.company ?? "Perorangan"}</div>
                      </td>
                      <td>
                        <Badge tone={LEAD_STAGE[l.stage][1]}>{LEAD_STAGE[l.stage][0]}</Badge>
                      </td>
                      <td className="text-muted">{CATEGORY_LABEL[l.interest]}</td>
                      <td className="text-muted">{LEAD_SOURCE[l.source]}</td>
                      <td className="num text-right font-semibold">{rupiah(l.expectedValue)}</td>
                      <td className="text-muted">{date(l.nextFollowUpAt)}</td>
                      <td className="text-muted">{l.ownerName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <LeadFormModal open={creating} onClose={() => setCreating(false)} onSaved={(l) => push(`/crm/${l.id}`)} />
      <LostReasonModal
        open={!!lostFor}
        onClose={() => setLostFor(null)}
        loading={moveStage.pending}
        onSubmit={async (r) => {
          const id = lostFor!;
          setLostFor(null);
          await move(id, "LOST", r);
        }}
      />
    </div>
  );
}

// ---------------- Detail lead ----------------
type LeadDetail = LeadRow & { activities: (LeadActivity & { userName: string | null })[] };

const ACT_ICON = { CALL: <LuPhone />, EMAIL: <LuMail />, WHATSAPP: <LuMessageCircle />, MEETING: <LuUserCheck />, NOTE: <LuPencil />, STAGE_CHANGE: <LuKanban /> };

export function LeadDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const { data: lead, error, reload } = useApi<LeadDetail>(`/leads/${id}`);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [lost, setLost] = useState(false);
  const [act, setAct] = useState({ type: "CALL", content: "" });
  const manage = can("crm.manage");

  const stage = useMutation((s: LeadStage, lostReason?: string) => api.post(`/leads/${id}/stage`, { stage: s, lostReason }));
  const addAct = useMutation(() => api.post(`/leads/${id}/activities`, act));
  const convert = useMutation(() => api.post<{ customer: { id: string; name: string } }>(`/leads/${id}/convert`));
  const del = useMutation(() => api.del(`/leads/${id}`));

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!lead) return <Spinner />;

  const idx = LEAD_STAGES.indexOf(lead.stage);

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <Link href="/crm" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <LuArrowLeft className="h-3.5 w-3.5" /> CRM & Lead
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.name} <Badge tone={LEAD_STAGE[lead.stage][1]}>{LEAD_STAGE[lead.stage][0]}</Badge>
          </span>
        }
        description={`${lead.company ?? "Perorangan"} · masuk ${relative(lead.createdAt)} via ${LEAD_SOURCE[lead.source]}`}
        actions={
          manage && (
            <>
              {lead.customerId ? (
                <Button onClick={() => push(`/customers/${lead.customerId}`)} icon={<LuUserCheck className="h-4 w-4" />}>
                  Lihat pelanggan
                </Button>
              ) : (
                lead.stage !== "LOST" && (
                  <Button variant="primary" onClick={() => setConfirmConvert(true)} icon={<LuUserCheck className="h-4 w-4" />}>
                    Jadikan pelanggan
                  </Button>
                )
              )}
              <Button onClick={() => setEditing(true)} icon={<LuPencil className="h-4 w-4" />}>
                Ubah
              </Button>
              <Menu
                trigger={
                  <Button size="icon" aria-label="Aksi lain">
                    <LuEllipsis className="h-4 w-4" />
                  </Button>
                }
                items={[
                  lead.stage !== "LOST" && { label: "Tandai gagal", onClick: () => setLost(true) },
                  { label: "Hapus lead", icon: <LuTrash2 className="h-4 w-4" />, danger: true, onClick: () => setConfirmDelete(true) },
                ]}
              />
            </>
          )
        }
      />

      {/* Stepper tahap */}
      <div className="card mb-4 overflow-x-auto p-2">
        <ol className="flex min-w-[640px] items-stretch gap-1">
          {LEAD_STAGES.filter((s) => s !== "LOST").map((s, i) => {
            const done = lead.stage !== "LOST" && i <= idx;
            return (
              <li key={s} className="flex-1">
                <button
                  disabled={!manage || stage.pending}
                  onClick={async () => {
                    try {
                      await stage.run(s);
                      toast.success(`Tahap: ${LEAD_STAGE[s][0]}`);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                  className={cn(
                    "flex h-10 w-full items-center justify-center rounded-lg text-[12.5px] font-semibold transition-colors disabled:cursor-default",
                    lead.stage === s ? "bg-accent text-accent-ink" : done ? "bg-accent-soft text-accent" : "text-faint hover:bg-raised",
                  )}
                >
                  {LEAD_STAGE[s][0]}
                </button>
              </li>
            );
          })}
        </ol>
        {lead.stage === "LOST" && <p className="px-3 pb-1 pt-2 text-xs text-bad">Lead gagal{lead.lostReason ? `: ${lead.lostReason}` : ""}. Klik tahap mana pun untuk membuka kembali.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Aktivitas" subtitle="Riwayat interaksi dengan calon penyewa">
          {manage && (
            <form
              className="mb-5 flex flex-col gap-2 rounded-xl border border-line bg-raised p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await addAct.run();
                  setAct((a) => ({ ...a, content: "" }));
                  toast.success("Aktivitas dicatat");
                } catch {
                  /* tampil */
                }
              }}
            >
              <div className="flex flex-wrap gap-1.5">
                {(["CALL", "WHATSAPP", "MEETING", "EMAIL", "NOTE"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setAct((a) => ({ ...a, type: t }))}
                    className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", act.type === t ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted")}
                  >
                    {ACT_ICON[t]} {ACTIVITY_LABEL[t]}
                  </button>
                ))}
              </div>
              <Textarea id="activity-content" value={act.content} onChange={(e) => setAct((a) => ({ ...a, content: e.target.value }))} placeholder="Apa hasil interaksinya?" rows={2} />
              {addAct.error && <p className="text-xs text-bad">{addAct.error.message}</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm" loading={addAct.pending} disabled={!act.content.trim()}>
                  Catat aktivitas
                </Button>
              </div>
            </form>
          )}
          {lead.activities.length === 0 ? (
            <Empty title="Belum ada aktivitas" />
          ) : (
            <ol className="relative ml-3 border-l border-line">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative pb-5 pl-6 last:pb-0">
                  <span className={cn("absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[12px]", a.type === "STAGE_CHANGE" ? "text-accent" : "text-muted")}>
                    {ACT_ICON[a.type]}
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-faint">
                    <span className="font-semibold text-muted">{ACTIVITY_LABEL[a.type]}</span>
                    <span>{dateTime(a.createdAt)}</span>
                    {a.userName && <span>· {a.userName}</span>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-line text-[13.5px]">{a.content}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Detail">
            <KeyValue
              cols={1}
              items={[
                { label: "Perkiraan nilai", value: <span className="num font-display text-lg font-bold">{rupiah(lead.expectedValue)}</span> },
                { label: "Minat", value: CATEGORY_LABEL[lead.interest] },
                { label: "Telepon", value: lead.phone ? <a className="text-accent hover:underline" href={`https://wa.me/${lead.phone.replace(/\D/g, "").replace(/^0/, "62")}`} target="_blank" rel="noreferrer">{lead.phone}</a> : "—" },
                { label: "Email", value: lead.email ? <a className="text-accent hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : "—" },
                { label: "PIC", value: lead.ownerName ?? "—" },
                { label: "Follow-up berikutnya", value: date(lead.nextFollowUpAt, "long") },
              ]}
            />
          </Card>
          {lead.notes && (
            <Card title="Catatan">
              <p className="whitespace-pre-line text-[13.5px] text-muted">{lead.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <LeadFormModal open={editing} onClose={() => setEditing(false)} lead={lead} />
      <LostReasonModal
        open={lost}
        onClose={() => setLost(false)}
        loading={stage.pending}
        onSubmit={async (r) => {
          try {
            await stage.run("LOST", r);
            setLost(false);
            toast.success("Lead ditandai gagal");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
      <ConfirmDialog
        open={confirmConvert}
        onClose={() => setConfirmConvert(false)}
        title="Jadikan pelanggan?"
        message={`Data kontak ${lead.company ?? lead.name} akan dibuat sebagai pelanggan baru dan lead ditandai Menang. Setelah itu Anda bisa langsung membuat kontrak.`}
        confirmLabel="Buat pelanggan"
        loading={convert.pending}
        onConfirm={async () => {
          try {
            const r = await convert.run();
            toast.success(`${r?.customer.name} menjadi pelanggan`);
            setConfirmConvert(false);
            if (r) push(`/customers/${r.customer.id}`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus lead?"
        message="Lead beserta seluruh riwayat aktivitasnya akan dihapus permanen."
        confirmLabel="Hapus"
        danger
        loading={del.pending}
        onConfirm={async () => {
          try {
            await del.run();
            toast.success("Lead dihapus");
            push("/crm");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
