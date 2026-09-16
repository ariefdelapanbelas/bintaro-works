"use client";
import { useEffect, useState } from "react";
import { REQUEST_PRIORITIES, REQUEST_STATUSES, type ServiceRequest } from "@/core/domain/types";
import { api } from "@/client/api";
import { dateTime, PRIORITY, relative, REQUEST_STATUS } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Link } from "@/client/nav";
import { Modal, useToast } from "@/ui/overlay";
import { Button, Empty, ErrorBox, Field, PageHeader, Select, Spinner, StatusBadge, Tabs, Textarea } from "@/ui/primitives";

type Row = ServiceRequest & { customerName: string };

export function RequestsPage() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const all = useApi<Row[]>("/requests");
  const [sel, setSel] = useState<Row | null>(null);
  const [form, setForm] = useState({ status: "OPEN", priority: "MEDIUM", response: "" });
  useEffect(() => {
    if (sel) setForm({ status: sel.status, priority: sel.priority, response: sel.response ?? "" });
  }, [sel]);
  const save = useMutation(() => api.patch(`/requests/${sel?.id}`, { ...form, response: form.response || null }));
  const rows = (all.data ?? []).filter((r) => !status || r.status === status);
  const count = (s: string) => (all.data ?? []).filter((r) => r.status === s).length;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Permintaan Layanan" description="Keluhan fasilitas, akses, surat & paket yang dikirim pelanggan lewat portal." />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { value: "", label: "Semua", count: all.data?.length },
          ...REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS[s][0], count: count(s) })),
        ]}
      />
      <ErrorBox error={all.error} onRetry={all.reload} />
      <div className="card">
        {!all.data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty title="Tidak ada permintaan" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSel(r)} className="flex w-full flex-wrap items-start gap-3 px-5 py-4 text-left hover:bg-raised">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.subject}</span>
                      <StatusBadge map={PRIORITY} value={r.priority} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {r.customerName} · {r.category} · {relative(r.createdAt)}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.description}</p>
                  </div>
                  <StatusBadge map={REQUEST_STATUS} value={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel?.subject ?? ""}
        description={sel ? <>
            <Link href={`/customers/${sel.customerId}`} className="text-accent hover:underline">{sel.customerName}</Link> · {sel.category} · {dateTime(sel.createdAt)}
          </> : undefined}
        footer={
          <>
            <Button onClick={() => setSel(null)}>Tutup</Button>
            <Button
              variant="primary"
              loading={save.pending}
              onClick={async () => {
                try {
                  await save.run();
                  toast.success("Permintaan diperbarui");
                  setSel(null);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Simpan
            </Button>
          </>
        }
      >
        {sel && (
          <div className="flex flex-col gap-4">
            <p className="whitespace-pre-line rounded-lg bg-raised p-3 text-[13.5px]">{sel.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" htmlFor="rq-status">
                <Select id="rq-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS[s][0] }))} />
              </Field>
              <Field label="Prioritas" htmlFor="rq-priority">
                <Select id="rq-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={REQUEST_PRIORITIES.map((s) => ({ value: s, label: PRIORITY[s][0] }))} />
              </Field>
            </div>
            <Field label="Tanggapan untuk pelanggan" htmlFor="rq-response" hint="Terlihat di portal pelanggan">
              <Textarea id="rq-response" rows={3} value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
