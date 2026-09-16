"use client";
import { useEffect, useState } from "react";
import { LuPencil, LuPlus } from "react-icons/lu";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, type Product } from "@/core/domain/types";
import { api } from "@/client/api";
import { CATEGORY_LABEL, rupiah, UNIT_LABEL } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Modal, useToast } from "@/ui/overlay";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, MoneyInput, PageHeader, Select, Spinner, Switch, Textarea } from "@/ui/primitives";

const UNIT_NAME: Record<Product["unit"], string> = { MONTH: "Per bulan", HOUR: "Per jam", PIECE: "Per item", PACKAGE: "Per paket" };

function ProductModal({ open, onClose, product }: { open: boolean; onClose: () => void; product: Product | null }) {
  const toast = useToast();
  const blank = () => ({
    name: product?.name ?? "",
    category: product?.category ?? "BUSINESS_SERVICE",
    unit: product?.unit ?? "PACKAGE",
    price: (product?.price ?? "") as number | "",
    description: product?.description ?? "",
    isActive: product?.isActive ?? true,
  });
  const [v, setV] = useState(blank());
  useEffect(() => {
    if (open) setV(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);
  const save = useMutation(() => {
    const body = { ...v, price: v.price === "" ? 0 : v.price, description: v.description || null };
    return product ? api.patch(`/products/${product.id}`, body) : api.post("/products", body);
  });
  const remove = useMutation(() => api.del<{ archived: boolean }>(`/products/${product?.id}`));
  const f = save.error?.fields ?? {};
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Ubah layanan" : "Layanan baru"}
      footer={
        <>
          {product && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              loading={remove.pending}
              onClick={async () => {
                try {
                  const r = await remove.run();
                  toast.success(r?.archived ? "Layanan dipakai di transaksi — diarsipkan (nonaktif)" : "Layanan dihapus");
                  onClose();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Hapus
            </Button>
          )}
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            loading={save.pending}
            onClick={async () => {
              try {
                await save.run();
                toast.success("Katalog tersimpan");
                onClose();
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
      <div className="grid gap-4 sm:grid-cols-2">
        {save.error && !save.error.fields && (
          <div className="sm:col-span-2">
            <ErrorBox error={save.error} />
          </div>
        )}
        <Field label="Nama layanan" htmlFor="pr-name" error={f.name} required className="sm:col-span-2">
          <Input id="pr-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} invalid={!!f.name} />
        </Field>
        <Field label="Lini bisnis" htmlFor="pr-cat">
          <Select id="pr-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Product["category"] })} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        </Field>
        <Field label="Satuan" htmlFor="pr-unit">
          <Select id="pr-unit" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as Product["unit"] })} options={PRODUCT_UNITS.map((u) => ({ value: u, label: UNIT_NAME[u] }))} />
        </Field>
        <Field label="Harga (sebelum PPN)" htmlFor="pr-price" error={f.price} className="sm:col-span-2">
          <MoneyInput id="pr-price" value={v.price} onChange={(x) => setV({ ...v, price: x })} />
        </Field>
        <Field label="Deskripsi" htmlFor="pr-desc" className="sm:col-span-2">
          <Textarea id="pr-desc" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Switch id="pr-active" checked={v.isActive} onChange={(b) => setV({ ...v, isActive: b })} label="Aktif (bisa dipilih di invoice & kontrak)" />
      </div>
    </Modal>
  );
}

export function CatalogPage() {
  const { data, error, reload } = useApi<Product[]>("/products");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const groups = PRODUCT_CATEGORIES.map((c) => ({ c, rows: (data ?? []).filter((p) => p.category === c) })).filter((g) => g.rows.length);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Katalog Layanan"
        description="Daftar harga resmi untuk sewa ruang, virtual office, studio, printing, dan layanan bisnis."
        actions={
          <Button variant="primary" icon={<LuPlus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            Layanan baru
          </Button>
        }
      />
      <ErrorBox error={error} onRetry={reload} />
      {!data ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <Empty title="Katalog kosong" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.c} title={CATEGORY_LABEL[g.c]} subtitle={`${g.rows.length} layanan`} bodyClass="p-0">
              <ul className="divide-y divide-line">
                {g.rows.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-raised">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-semibold">
                          {p.name} {!p.isActive && <Badge>Nonaktif</Badge>}
                        </div>
                        {p.description && <div className="truncate text-xs text-muted">{p.description}</div>}
                      </div>
                      <div className="num whitespace-nowrap text-right text-[13px] font-semibold">
                        {rupiah(p.price)}
                        <span className="font-normal text-faint">{UNIT_LABEL[p.unit]}</span>
                      </div>
                      <LuPencil className="h-3.5 w-3.5 text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <ProductModal open={editing !== null} onClose={() => setEditing(null)} product={editing === "new" ? null : editing} />
    </div>
  );
}
