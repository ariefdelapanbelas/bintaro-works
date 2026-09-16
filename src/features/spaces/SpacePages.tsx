"use client";
import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuLayers, LuLayoutGrid, LuList, LuPencil, LuPlus, LuTrash2, LuUsers } from "react-icons/lu";
import { SPACE_STATUSES, SPACE_TYPES, type Booking, type Contract, type Floor, type Location, type Space } from "@/core/domain/types";
import { api } from "@/client/api";
import { BOOKING_STATUS, CONTRACT_STATUS, date, number, rupiah, SPACE_STATUS, SPACE_TYPE_LABEL, time } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { Link, useNav } from "@/client/nav";
import { useSession } from "@/client/session";
import { useForm } from "@/ui/form";
import { ConfirmDialog, Modal, useToast } from "@/ui/overlay";
import { Badge, Button, Card, cn, Empty, ErrorBox, Field, Input, KeyValue, MoneyInput, PageHeader, Segmented, Select, Spinner, Stat, StatusBadge, Switch, Textarea } from "@/ui/primitives";
import { Ring } from "@/ui/charts";

type LocationTree = Location & { floors: (Floor & { spaceCount: number; occupied: number })[] };
type PlanSpace = Space & {
  occupants: { contractId: string; customerName: string; endDate: string }[];
  inUse: { title: string; endAt: string } | null;
  bookingsToday: number;
};
type SpaceRow = Space & { floorName: string; locationName: string };

const STATUS_FILL: Record<Space["status"], string> = {
  AVAILABLE: "border-dashed border-good/70 bg-surface hover:bg-good-soft/60",
  OCCUPIED: "border-accent/30 bg-accent-soft hover:border-accent",
  RESERVED: "border-warn/50 bg-warn-soft hover:border-warn",
  MAINTENANCE: "hatch border-line bg-raised",
};

// ---------------- Form ruang ----------------
function SpaceFormModal({ open, onClose, space, floors, defaultFloorId, onSaved }: { open: boolean; onClose: () => void; space?: Space | null; floors: (Floor & { locationName: string })[]; defaultFloorId?: string; onSaved?: (s: Space) => void }) {
  const toast = useToast();
  const init = () => ({
    floorId: space?.floorId ?? defaultFloorId ?? floors[0]?.id ?? "",
    code: space?.code ?? "",
    name: space?.name ?? "",
    type: space?.type ?? "PRIVATE_OFFICE",
    status: space?.status ?? "AVAILABLE",
    capacity: String(space?.capacity ?? 2),
    areaSqm: space?.areaSqm != null ? String(space.areaSqm) : "",
    monthlyPrice: (space?.monthlyPrice ?? "") as number | "",
    hourlyPrice: (space?.hourlyPrice ?? "") as number | "",
    isBookable: space?.isBookable ?? false,
    amenities: space?.amenities.join(", ") ?? "",
    posX: String(space?.posX ?? 0),
    posY: String(space?.posY ?? 0),
    width: String(space?.width ?? 3),
    height: String(space?.height ?? 2),
    description: space?.description ?? "",
  });
  const { values: v, set, reset, setValues } = useForm(init());
  useEffect(() => {
    if (open) reset(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, space?.id]);
  const plan = useApi<{ floor: Floor; spaces: PlanSpace[] }>(open && v.floorId ? `/floors/${v.floorId}/plan` : null);
  const m = useMutation((body: unknown) => (space ? api.patch<Space>(`/spaces/${space.id}`, body) : api.post<Space>("/spaces", body)));
  const f = m.error?.fields ?? {};

  const submit = async () => {
    try {
      const saved = await m.run({
        ...v,
        capacity: Number(v.capacity),
        areaSqm: v.areaSqm === "" ? null : Number(v.areaSqm),
        monthlyPrice: v.monthlyPrice === "" ? 0 : v.monthlyPrice,
        hourlyPrice: v.hourlyPrice === "" ? 0 : v.hourlyPrice,
        posX: Number(v.posX),
        posY: Number(v.posY),
        width: Number(v.width),
        height: Number(v.height),
        amenities: v.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        description: v.description || null,
      });
      toast.success(space ? "Ruang diperbarui" : "Ruang ditambahkan");
      onClose();
      if (saved) onSaved?.(saved);
    } catch {
      /* tampil */
    }
  };

  const fl = plan.data?.floor;
  const others = (plan.data?.spaces ?? []).filter((s) => s.id !== space?.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={space ? `Ubah ${space.code}` : "Ruang baru"}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={m.pending}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
          {m.error && !m.error.fields && (
            <div className="sm:col-span-2">
              <ErrorBox error={m.error} />
            </div>
          )}
          <Field label="Lantai" htmlFor="sp-floor" className="sm:col-span-2">
            <Select id="sp-floor" value={v.floorId} onChange={set("floorId")} options={floors.map((x) => ({ value: x.id, label: `${x.locationName} — ${x.name}` }))} />
          </Field>
          <Field label="Kode" htmlFor="sp-code" error={f.code} required>
            <Input id="sp-code" value={v.code} onChange={set("code")} placeholder="PO-211" className="font-mono uppercase" invalid={!!f.code} />
          </Field>
          <Field label="Nama" htmlFor="sp-name" error={f.name} required>
            <Input id="sp-name" value={v.name} onChange={set("name")} invalid={!!f.name} />
          </Field>
          <Field label="Tipe" htmlFor="sp-type">
            <Select
              id="sp-type"
              value={v.type}
              onChange={(e) => {
                const t = e.target.value as Space["type"];
                setValues((p) => ({ ...p, type: t, isBookable: ["MEETING_ROOM", "PODCAST_STUDIO", "LIVE_STUDIO", "EVENT_SPACE"].includes(t) }));
              }}
              options={SPACE_TYPES.map((t) => ({ value: t, label: SPACE_TYPE_LABEL[t] }))}
            />
          </Field>
          <Field label="Status" htmlFor="sp-status">
            <Select id="sp-status" value={v.status} onChange={set("status")} options={SPACE_STATUSES.map((s) => ({ value: s, label: SPACE_STATUS[s][0] }))} />
          </Field>
          <Field label="Kapasitas (orang)" htmlFor="sp-cap" error={f.capacity}>
            <Input id="sp-cap" type="number" min={1} value={v.capacity} onChange={set("capacity")} />
          </Field>
          <Field label="Luas (m²)" htmlFor="sp-area" error={f.areaSqm}>
            <Input id="sp-area" type="number" min={0} value={v.areaSqm} onChange={set("areaSqm")} />
          </Field>
          <div className="sm:col-span-2">
            <Switch id="sp-bookable" checked={v.isBookable} onChange={(b) => setValues((p) => ({ ...p, isBookable: b }))} label="Disewakan per jam (booking)" />
          </div>
          {v.isBookable ? (
            <Field label="Tarif per jam" htmlFor="sp-hourly" error={f.hourlyPrice} className="sm:col-span-2">
              <MoneyInput id="sp-hourly" value={v.hourlyPrice} onChange={set("hourlyPrice")} />
            </Field>
          ) : (
            <Field label="Harga sewa per bulan" htmlFor="sp-monthly" error={f.monthlyPrice} className="sm:col-span-2">
              <MoneyInput id="sp-monthly" value={v.monthlyPrice} onChange={set("monthlyPrice")} />
            </Field>
          )}
          <Field label="Fasilitas" htmlFor="sp-amen" hint="Pisahkan dengan koma" className="sm:col-span-2">
            <Input id="sp-amen" value={v.amenities} onChange={set("amenities")} placeholder="AC, TV, Whiteboard" />
          </Field>
          <Field label="Deskripsi" htmlFor="sp-desc" className="sm:col-span-2">
            <Textarea id="sp-desc" value={v.description} onChange={set("description")} rows={2} />
          </Field>
          <button type="submit" hidden />
        </form>

        <div>
          <p className="label">Posisi di denah</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {(["posX", "posY", "width", "height"] as const).map((k) => (
              <Field key={k} label={{ posX: "Kolom", posY: "Baris", width: "Lebar", height: "Tinggi" }[k]} htmlFor={`sp-${k}`}>
                <Input id={`sp-${k}`} type="number" min={k.startsWith("pos") ? 0 : 1} value={v[k]} onChange={set(k)} className="px-2 text-center" />
              </Field>
            ))}
          </div>
          {f.posX && <p className="mb-2 text-xs text-bad">{f.posX}</p>}
          {fl ? (
            <div
              className="grid-paper relative grid aspect-[3/2] w-full gap-[2px] rounded-lg border border-line p-[2px]"
              style={{ gridTemplateColumns: `repeat(${fl.gridCols}, 1fr)`, gridTemplateRows: `repeat(${fl.gridRows}, 1fr)`, backgroundSize: `${100 / fl.gridCols}% ${100 / fl.gridRows}%` }}
              aria-label="Pratinjau posisi"
            >
              {others.map((s) => (
                <div key={s.id} className="flex items-center justify-center rounded-[3px] bg-ink/10 text-[8px] font-semibold text-muted" style={{ gridColumn: `${s.posX + 1} / span ${s.width}`, gridRow: `${s.posY + 1} / span ${s.height}` }}>
                  {s.code}
                </div>
              ))}
              <div
                className="z-10 rounded-[3px] border-2 border-accent bg-accent/25"
                style={{ gridColumn: `${Number(v.posX) + 1} / span ${Math.max(1, Number(v.width))}`, gridRow: `${Number(v.posY) + 1} / span ${Math.max(1, Number(v.height))}` }}
              />
            </div>
          ) : (
            <div className="grid-paper aspect-[3/2] rounded-lg border border-line" />
          )}
          <p className="mt-2 text-[11.5px] text-faint">Kotak hijau = posisi ruang ini. Denah {fl ? `${fl.gridCols}×${fl.gridRows}` : ""} kotak.</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Kelola lokasi & lantai ----------------
function FloorManager({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: LocationTree[] }) {
  const toast = useToast();
  const [loc, setLoc] = useState({ name: "", address: "" });
  const [fl, setFl] = useState({ locationId: "", name: "", level: "1", gridCols: "12", gridRows: "8" });
  useEffect(() => {
    if (open) setFl((x) => ({ ...x, locationId: x.locationId || locations[0]?.id || "" }));
  }, [open, locations]);
  const addLoc = useMutation(() => api.post("/locations", loc));
  const addFloor = useMutation(() => api.post("/floors", { ...fl, level: Number(fl.level), gridCols: Number(fl.gridCols), gridRows: Number(fl.gridRows) }));
  const delFloor = useMutation((id: string) => api.del(`/floors/${id}`));

  return (
    <Modal open={open} onClose={onClose} title="Lokasi & lantai" description="Struktur gedung yang dipakai denah." size="lg">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {locations.map((l) => (
            <div key={l.id} className="rounded-xl border border-line">
              <div className="border-b border-line px-4 py-2.5">
                <div className="font-semibold">{l.name}</div>
                <div className="text-xs text-muted">{l.address ?? "—"}</div>
              </div>
              <ul className="divide-y divide-line">
                {l.floors.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                    <span>
                      {x.name} <span className="text-xs text-faint">· {x.spaceCount} ruang</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Hapus ${x.name}`}
                      onClick={async () => {
                        try {
                          await delFloor.run(x.id);
                          toast.success("Lantai dihapus");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <LuTrash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addFloor.run();
                toast.success("Lantai ditambahkan");
                setFl((x) => ({ ...x, name: "" }));
              } catch {
                /* tampil */
              }
            }}
          >
            <p className="font-semibold">Tambah lantai</p>
            <Field label="Lokasi" htmlFor="fl-loc">
              <Select id="fl-loc" value={fl.locationId} onChange={(e) => setFl({ ...fl, locationId: e.target.value })} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
            </Field>
            <Field label="Nama lantai" htmlFor="fl-name" error={addFloor.error?.fields?.name}>
              <Input id="fl-name" value={fl.name} onChange={(e) => setFl({ ...fl, name: e.target.value })} placeholder="Lantai 3 · Private Office" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Level" htmlFor="fl-level">
                <Input id="fl-level" type="number" value={fl.level} onChange={(e) => setFl({ ...fl, level: e.target.value })} />
              </Field>
              <Field label="Kolom" htmlFor="fl-cols">
                <Input id="fl-cols" type="number" value={fl.gridCols} onChange={(e) => setFl({ ...fl, gridCols: e.target.value })} />
              </Field>
              <Field label="Baris" htmlFor="fl-rows">
                <Input id="fl-rows" type="number" value={fl.gridRows} onChange={(e) => setFl({ ...fl, gridRows: e.target.value })} />
              </Field>
            </div>
            {addFloor.error && !addFloor.error.fields && <p className="text-xs text-bad">{addFloor.error.message}</p>}
            <Button type="submit" variant="primary" size="sm" loading={addFloor.pending}>
              Tambah lantai
            </Button>
          </form>
          <form
            className="flex flex-col gap-3 rounded-xl border border-line p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addLoc.run();
                toast.success("Lokasi ditambahkan");
                setLoc({ name: "", address: "" });
              } catch {
                /* tampil */
              }
            }}
          >
            <p className="font-semibold">Tambah lokasi / gedung</p>
            <Field label="Nama" htmlFor="loc-name" error={addLoc.error?.fields?.name}>
              <Input id="loc-name" value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} placeholder="Bintaro Works — Sektor 7" />
            </Field>
            <Field label="Alamat" htmlFor="loc-address">
              <Input id="loc-address" value={loc.address} onChange={(e) => setLoc({ ...loc, address: e.target.value })} />
            </Field>
            <Button type="submit" size="sm" loading={addLoc.pending}>
              Tambah lokasi
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Denah ----------------
function FloorPlan({ floorId }: { floorId: string }) {
  const { push } = useNav();
  const { data, error, reload } = useApi<{ floor: Floor; spaces: PlanSpace[] }>(`/floors/${floorId}/plan`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { floor, spaces } = data;
  if (spaces.length === 0) return <Empty title="Belum ada ruang di lantai ini" description="Tambahkan ruang dan atur posisinya di denah." icon={<LuLayoutGrid />} />;
  return (
    <div className="overflow-x-auto">
      <div
        className="grid-paper relative grid min-w-[760px] gap-1.5 rounded-xl border border-line p-1.5"
        style={{
          gridTemplateColumns: `repeat(${floor.gridCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${floor.gridRows}, minmax(62px, auto))`,
          backgroundSize: `${100 / floor.gridCols}% ${100 / floor.gridRows}%`,
        }}
      >
        {spaces.map((s) => {
          const occupant = s.occupants[0];
          return (
            <button
              key={s.id}
              onClick={() => push(`/spaces/${s.id}`)}
              className={cn("group flex min-w-0 flex-col overflow-hidden rounded-lg border p-2.5 text-left transition-colors", STATUS_FILL[s.status])}
              style={{ gridColumn: `${s.posX + 1} / span ${s.width}`, gridRow: `${s.posY + 1} / span ${s.height}` }}
              title={`${s.code} · ${s.name}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-mono text-[11px] font-bold tracking-tight">{s.code}</span>
                {s.inUse ? (
                  <span className="relative flex h-2 w-2" title="Sedang dipakai">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
                  </span>
                ) : null}
              </div>
              <span className="mt-0.5 line-clamp-1 text-[12px] font-semibold leading-tight">{s.name}</span>
              <span className="mt-auto flex flex-wrap items-end justify-between gap-x-2 pt-1 text-[10.5px] leading-tight text-muted">
                <span className="line-clamp-1">
                  {s.status === "MAINTENANCE"
                    ? "Maintenance"
                    : s.isBookable
                      ? s.inUse
                        ? `Dipakai s/d ${time(s.inUse.endAt)}`
                        : `${s.bookingsToday} booking hari ini`
                      : s.type === "COWORKING_DESK"
                        ? `${s.occupants.length} member kontrak`
                        : occupant
                          ? occupant.customerName
                          : "Tersedia"}
                </span>
                <span className="flex items-center gap-0.5 text-faint">
                  <LuUsers className="h-3 w-3" />
                  {s.capacity}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SpacesPage() {
  const { can } = useSession();
  const { push } = useNav();
  const locations = useApi<LocationTree[]>("/locations");
  const stats = useApi<{ total: number; rentable: number; occupied: number; available: number; maintenance: number; bookable: number; occupancyRate: number }>("/spaces/stats");
  const [view, setView] = useState<"plan" | "list">("plan");
  const [floorId, setFloorId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const list = useApi<SpaceRow[]>(view === "list" ? "/spaces" : null, { type, status });

  const floors = useMemo(() => (locations.data ?? []).flatMap((l) => l.floors.map((f) => ({ ...f, locationName: l.name }))), [locations.data]);
  useEffect(() => {
    if (!floorId && floors.length) setFloorId(floors[0].id);
  }, [floors, floorId]);
  const manage = can("spaces.manage");

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Ruang & Denah"
        description="Status setiap unit secara langsung — dari private office hingga slot parkir."
        actions={
          manage && (
            <>
              <Button icon={<LuLayers className="h-4 w-4" />} onClick={() => setManaging(true)}>
                Lokasi & lantai
              </Button>
              <Button variant="primary" icon={<LuPlus className="h-4 w-4" />} onClick={() => setCreating(true)} disabled={!floors.length}>
                Ruang baru
              </Button>
            </>
          )
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center gap-4 p-4">
          <div className="relative">
            <Ring value={stats.data?.occupancyRate ?? 0} size={56} stroke={6} />
            <span className="num absolute inset-0 flex items-center justify-center text-[12px] font-bold">{Math.round(stats.data?.occupancyRate ?? 0)}%</span>
          </div>
          <div>
            <p className="eyebrow">Okupansi sewa</p>
            <p className="num font-display text-xl font-bold">
              {stats.data?.occupied ?? "—"} <span className="text-sm text-faint">/ {stats.data?.rentable ?? "—"}</span>
            </p>
          </div>
        </div>
        <Stat label="Unit tersedia" value={stats.data?.available ?? "—"} sub="Siap ditawarkan" tone="good" />
        <Stat label="Ruang booking" value={stats.data?.bookable ?? "—"} sub="Meeting room & studio" />
        <Stat label="Maintenance" value={stats.data?.maintenance ?? "—"} sub="Tidak bisa disewa" />
      </div>

      <ErrorBox error={locations.error} onRetry={locations.reload} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view === "plan" ? (
          <div className="flex flex-wrap gap-1.5">
            {floors.map((f) => (
              <button
                key={f.id}
                onClick={() => setFloorId(f.id)}
                className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors", floorId === f.id ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink")}
              >
                {f.name}
                <span className="num ml-1.5 opacity-70">
                  {f.occupied}/{f.spaceCount}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <Select id="sp-filter-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Semua tipe" options={SPACE_TYPES.map((t) => ({ value: t, label: SPACE_TYPE_LABEL[t] }))} className="w-full sm:w-48" />
            <Select id="sp-filter-status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Semua status" options={SPACE_STATUSES.map((s) => ({ value: s, label: SPACE_STATUS[s][0] }))} className="w-full sm:w-44" />
          </>
        )}
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            items={[
              { value: "plan", label: <><LuLayoutGrid className="h-3.5 w-3.5" /> Denah</> },
              { value: "list", label: <><LuList className="h-3.5 w-3.5" /> Daftar</> },
            ]}
          />
        </div>
      </div>

      {view === "plan" ? (
        <Card bodyClass="p-3 sm:p-4">
          {floorId ? <FloorPlan floorId={floorId} /> : <Spinner />}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            {(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn("h-3 w-4 rounded-[3px] border", STATUS_FILL[s])} /> {SPACE_STATUS[s][0]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-good" /> Sedang dipakai (booking)
            </span>
          </div>
        </Card>
      ) : (
        <div className="card">
          {!list.data ? (
            <Spinner />
          ) : list.data.length === 0 ? (
            <Empty title="Tidak ada ruang" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Tipe</th>
                    <th>Lantai</th>
                    <th className="text-right">Kapasitas</th>
                    <th className="text-right">Harga</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((s) => (
                    <tr key={s.id} className="row-link" onClick={() => push(`/spaces/${s.id}`)}>
                      <td className="font-mono text-xs font-bold">{s.code}</td>
                      <td className="font-semibold">{s.name}</td>
                      <td className="text-muted">{SPACE_TYPE_LABEL[s.type]}</td>
                      <td className="text-muted">{s.floorName}</td>
                      <td className="num text-right">{s.capacity}</td>
                      <td className="num whitespace-nowrap text-right">{s.isBookable ? `${rupiah(s.hourlyPrice)}/jam` : `${rupiah(s.monthlyPrice)}/bln`}</td>
                      <td>
                        <StatusBadge map={SPACE_STATUS} value={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <SpaceFormModal open={creating} onClose={() => setCreating(false)} floors={floors} defaultFloorId={floorId} onSaved={(s) => push(`/spaces/${s.id}`)} />
      <FloorManager open={managing} onClose={() => setManaging(false)} locations={locations.data ?? []} />
    </div>
  );
}

// ---------------- Detail ruang ----------------
type SpaceDetail = Space & { floor: Floor | null; contracts: (Contract & { customerName: string })[]; bookings: (Booking & { customerName: string | null })[] };

export function SpaceDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const { push } = useNav();
  const toast = useToast();
  const { data: s, error, reload } = useApi<SpaceDetail>(`/spaces/${id}`);
  const locations = useApi<LocationTree[]>("/locations");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useMutation(() => api.del(`/spaces/${id}`));
  const floors = useMemo(() => (locations.data ?? []).flatMap((l) => l.floors.map((f) => ({ ...f, locationName: l.name }))), [locations.data]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s) return <Spinner />;
  const active = s.contracts.filter((c) => c.status === "ACTIVE");
  const upcoming = s.bookings.filter((b) => new Date(b.endAt).getTime() >= Date.now() && b.status !== "CANCELLED").reverse();

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <Link href="/spaces" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <LuArrowLeft className="h-3.5 w-3.5" /> Ruang & Denah
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[22px]">{s.code}</span> {s.name} <StatusBadge map={SPACE_STATUS} value={s.status} />
          </span>
        }
        description={`${SPACE_TYPE_LABEL[s.type]} · ${s.floor?.name ?? ""}`}
        actions={
          can("spaces.manage") && (
            <>
              {s.isBookable && can("bookings.manage") && <Button onClick={() => push(`/bookings?new=1&spaceId=${s.id}`)}>Booking ruang ini</Button>}
              {!s.isBookable && s.status === "AVAILABLE" && can("contracts.manage") && <Button onClick={() => push(`/contracts?new=1&spaceId=${s.id}`)}>Buat kontrak</Button>}
              <Button icon={<LuPencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Ubah
              </Button>
              <Button size="icon" aria-label="Hapus ruang" onClick={() => setConfirmDelete(true)}>
                <LuTrash2 className="h-4 w-4" />
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card title="Spesifikasi">
          <KeyValue
            cols={1}
            items={[
              { label: s.isBookable ? "Tarif per jam" : "Harga sewa per bulan", value: <span className="num font-display text-xl font-bold">{rupiah(s.isBookable ? s.hourlyPrice : s.monthlyPrice)}</span> },
              { label: "Kapasitas", value: `${s.capacity} orang` },
              { label: "Luas", value: s.areaSqm ? `${number(s.areaSqm)} m²` : "—" },
              { label: "Fasilitas", value: s.amenities.length ? <div className="flex flex-wrap gap-1">{s.amenities.map((a) => <Badge key={a} dot={false}>{a}</Badge>)}</div> : "—" },
              { label: "Keterangan", value: s.description },
            ]}
          />
        </Card>
        <div className="flex flex-col gap-4">
          {!s.isBookable && (
            <Card title="Kontrak" subtitle={active.length ? `${active.length} kontrak aktif` : "Tidak ada kontrak aktif"} bodyClass="p-0">
              {s.contracts.length === 0 ? (
                <Empty title="Belum pernah disewa" />
              ) : (
                <ul className="divide-y divide-line">
                  {s.contracts.map((c) => (
                    <li key={c.id}>
                      <Link href={`/contracts/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-raised">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{c.customerName}</div>
                          <div className="text-xs text-muted">
                            <span className="font-mono">{c.number}</span> · {date(c.startDate)} – {date(c.endDate)}
                          </div>
                        </div>
                        <span className="num text-[13px] font-semibold">{rupiah(c.monthlyFee)}/bln</span>
                        <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title={s.isBookable ? "Booking mendatang" : "Riwayat booking"} bodyClass="p-0">
            {(s.isBookable ? upcoming : s.bookings).length === 0 ? (
              <Empty title="Tidak ada booking" />
            ) : (
              <ul className="divide-y divide-line">
                {(s.isBookable ? upcoming : s.bookings).slice(0, 12).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="num w-36 shrink-0 text-[12.5px]">
                      <div className="font-semibold">{date(b.startAt)}</div>
                      <div className="font-mono text-muted">
                        {time(b.startAt)}–{time(b.endAt)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{b.title}</div>
                      <div className="text-xs text-muted">{b.customerName}</div>
                    </div>
                    <StatusBadge map={BOOKING_STATUS} value={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <SpaceFormModal open={editing} onClose={() => setEditing(false)} space={s} floors={floors} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Hapus ${s.code}?`}
        message="Ruang yang punya riwayat kontrak/booking tidak bisa dihapus — ubah status menjadi Maintenance."
        confirmLabel="Hapus"
        danger
        loading={del.pending}
        onConfirm={async () => {
          try {
            await del.run();
            toast.success("Ruang dihapus");
            push("/spaces");
          } catch (e) {
            setConfirmDelete(false);
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
