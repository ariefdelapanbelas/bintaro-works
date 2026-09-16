"use client";
import { LuArrowDownRight, LuArrowUpRight, LuCalendarPlus, LuClock, LuFilePlus2, LuTriangleAlert, LuWallet } from "react-icons/lu";
import type { AuditLog, ProductCategory } from "@/core/domain/types";
import { CATEGORY_LABEL, date, LEAD_STAGE, relative, rupiah, time } from "@/client/format";
import { useApi } from "@/client/hooks";
import { Link, useNav } from "@/client/nav";
import { useSession } from "@/client/session";
import { BarList, ColumnChart, Ring } from "@/ui/charts";
import { Badge, Button, Card, Empty, ErrorBox, Skeleton } from "@/ui/primitives";

interface Dash {
  kpis: {
    occupancyRate: number;
    occupied: number;
    rentable: number;
    mrr: number;
    activeContracts: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
    outstanding: number;
    overdueCount: number;
    bookingsToday: number;
    activeCustomers: number;
    pipelineValue: number;
    openLeads: number;
  };
  revenueByMonth: { month: string; amount: number }[];
  revenueByCategory: { category: ProductCategory; amount: number }[];
  pipeline: { stage: string; label: string; count: number; value: number }[];
  expiringContracts: { id: string; number: string; title: string; customerName: string; endDate: string; daysLeft: number; autoRenew: boolean }[];
  overdueInvoices: { id: string; number: string; customerName: string; dueDate: string; outstanding: number; daysOverdue: number }[];
  todayBookings: { id: string; title: string; startAt: string; endAt: string; spaceName: string; customerName: string | null }[];
  followUps: { id: string; name: string; company: string | null; stage: keyof typeof LEAD_STAGE; nextFollowUpAt: string }[];
  recentActivity: AuditLog[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }));
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
}

export function DashboardPage() {
  const { me, can } = useSession();
  const { push } = useNav();
  const { data, error, reload } = useApi<Dash>("/dashboard");

  const todayLabel = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight">
            {greeting()}, {me?.user.name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("bookings.manage") && (
            <Button icon={<LuCalendarPlus className="h-4 w-4" />} onClick={() => push("/bookings?new=1")}>
              Booking baru
            </Button>
          )}
          {can("billing.manage") && (
            <Button variant="primary" icon={<LuFilePlus2 className="h-4 w-4" />} onClick={() => push("/billing?new=1")}>
              Buat invoice
            </Button>
          )}
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
          <Skeleton className="h-72 rounded-xl sm:col-span-2 xl:col-span-3" />
          <Skeleton className="h-72 rounded-xl sm:col-span-2 xl:col-span-1" />
        </div>
      ) : (
        <Loaded data={data} />
      )}
    </div>
  );
}

function Loaded({ data }: { data: Dash }) {
  const k = data.kpis;
  const delta = k.revenueLastMonth ? Math.round(((k.revenueThisMonth - k.revenueLastMonth) / k.revenueLastMonth) * 100) : null;
  const monthData = data.revenueByMonth.map((m) => {
    const [y, mm] = m.month.split("-").map(Number);
    return { label: MONTHS[mm - 1], sub: `${MONTHS[mm - 1]} ${y}`, value: m.amount };
  });
  const catTotal = data.revenueByCategory.reduce((a, c) => a + c.amount, 0);
  const maxPipeline = Math.max(...data.pipeline.map((p) => p.count), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-4 p-4">
          <div className="relative">
            <Ring value={k.occupancyRate} size={68} />
            <span className="num absolute inset-0 flex items-center justify-center text-[13px] font-bold">{Math.round(k.occupancyRate)}%</span>
          </div>
          <div>
            <p className="eyebrow">Okupansi</p>
            <p className="num mt-1 font-display text-[22px] font-bold leading-none">
              {k.occupied}
              <span className="text-[15px] text-faint"> / {k.rentable} unit</span>
            </p>
            <Link href="/spaces" className="mt-1.5 inline-block text-xs font-semibold text-accent hover:underline">
              Lihat denah →
            </Link>
          </div>
        </div>
        <div className="card p-4">
          <p className="eyebrow">MRR kontrak aktif</p>
          <p className="num mt-2 font-display text-[24px] font-bold leading-none">{rupiah(k.mrr, { compact: true })}</p>
          <p className="mt-2 text-xs text-muted">
            {k.activeContracts} kontrak · {k.activeCustomers} pelanggan aktif
          </p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Kas masuk bulan ini</p>
          <p className="num mt-2 font-display text-[24px] font-bold leading-none">{rupiah(k.revenueThisMonth, { compact: true })}</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            {delta !== null && (
              <span className={`inline-flex items-center font-semibold ${delta >= 0 ? "text-good" : "text-bad"}`}>
                {delta >= 0 ? <LuArrowUpRight className="h-3.5 w-3.5" /> : <LuArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(delta)}%
              </span>
            )}
            vs bulan lalu {rupiah(k.revenueLastMonth, { compact: true })}
          </p>
        </div>
        <Link href="/billing?status=OVERDUE" className="card block p-4 transition-colors hover:border-bad/40">
          <p className="eyebrow flex items-center justify-between">
            Piutang berjalan <LuWallet className="h-4 w-4 text-faint" />
          </p>
          <p className="num mt-2 font-display text-[24px] font-bold leading-none">{rupiah(k.outstanding, { compact: true })}</p>
          <p className="mt-2 text-xs">
            {k.overdueCount > 0 ? (
              <Badge tone="bad">
                <LuTriangleAlert className="h-3 w-3" /> {k.overdueCount} invoice lewat jatuh tempo
              </Badge>
            ) : (
              <Badge tone="good">Tidak ada tunggakan</Badge>
            )}
          </p>
        </Link>
      </div>

      {/* Pendapatan */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Kas masuk 6 bulan terakhir" subtitle="Berdasarkan pembayaran yang diterima">
          <ColumnChart data={monthData} format={(v) => rupiah(v)} axisFormat={(v) => (v === 0 ? "0" : `${Math.round(v / 1_000_000)} jt`)} ariaLabel="Grafik kas masuk per bulan" />
        </Card>
        <Card title="Komposisi lini bisnis" subtitle="Nilai tagihan terbit, 6 bulan">
          {data.revenueByCategory.length ? (
            <BarList data={data.revenueByCategory.map((c) => ({ label: CATEGORY_LABEL[c.category], value: c.amount }))} total={catTotal} format={(v) => rupiah(v, { compact: true })} />
          ) : (
            <Empty title="Belum ada tagihan" />
          )}
        </Card>
      </div>

      {/* Operasional hari ini */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Booking hari ini" subtitle={`${k.bookingsToday} jadwal`} action={<Link href="/bookings" className="text-xs font-semibold text-accent hover:underline">Kalender</Link>} bodyClass="p-2">
          {data.todayBookings.length === 0 ? (
            <Empty title="Tidak ada booking hari ini" icon={<LuClock />} />
          ) : (
            <ul>
              {data.todayBookings.map((b) => {
                const now = Date.now();
                const live = new Date(b.startAt).getTime() <= now && new Date(b.endAt).getTime() > now;
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised">
                    <div className="num w-[52px] shrink-0 text-right font-mono text-[12px] leading-tight">
                      <div className="font-semibold">{time(b.startAt)}</div>
                      <div className="text-faint">{time(b.endAt)}</div>
                    </div>
                    <span className={`h-9 w-[3px] rounded-full ${live ? "bg-good" : "bg-line"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{b.title}</div>
                      <div className="truncate text-xs text-muted">
                        {b.spaceName} · {b.customerName}
                      </div>
                    </div>
                    {live && <Badge tone="good">Berlangsung</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Kontrak segera berakhir" subtitle="45 hari ke depan" bodyClass="p-2">
          {data.expiringContracts.length === 0 ? (
            <Empty title="Aman — tidak ada yang berakhir" />
          ) : (
            <ul>
              {data.expiringContracts.map((c) => (
                <li key={c.id}>
                  <Link href={`/contracts/${c.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{c.customerName}</div>
                      <div className="truncate text-xs text-muted">
                        {c.title} · s/d {date(c.endDate)}
                      </div>
                    </div>
                    {c.autoRenew ? <Badge tone="info">Auto-renew</Badge> : <Badge tone={c.daysLeft <= 14 ? "bad" : "warn"}>{c.daysLeft} hari</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tagihan lewat jatuh tempo" action={<Link href="/billing?status=OVERDUE" className="text-xs font-semibold text-accent hover:underline">Semua</Link>} bodyClass="p-2">
          {data.overdueInvoices.length === 0 ? (
            <Empty title="Tidak ada tunggakan" />
          ) : (
            <ul>
              {data.overdueInvoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/billing/${i.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{i.customerName}</div>
                      <div className="truncate font-mono text-[11.5px] text-muted">{i.number}</div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[13px] font-semibold">{rupiah(i.outstanding)}</div>
                      <div className="text-[11.5px] font-semibold text-bad">{i.daysOverdue} hari</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Penjualan */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Pipeline penjualan" subtitle={`${k.openLeads} lead terbuka · ${rupiah(k.pipelineValue, { compact: true })}`} action={<Link href="/crm" className="text-xs font-semibold text-accent hover:underline">Buka CRM</Link>}>
          <ul className="flex flex-col gap-2.5">
            {data.pipeline.map((p) => (
              <li key={p.stage} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-[13px]">
                <span className="text-muted">{p.label}</span>
                <span className="h-6 rounded-md bg-ink/[0.04]">
                  <span className="flex h-6 items-center rounded-md px-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(12, (p.count / maxPipeline) * 100)}%`, background: "var(--series-1)" }}>
                    {p.count}
                  </span>
                </span>
                <span className="num w-[70px] text-right text-xs text-muted">{rupiah(p.value, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Follow-up lead" subtitle="Jatuh tempo hari ini & terlambat" bodyClass="p-2">
          {data.followUps.length === 0 ? (
            <Empty title="Semua lead sudah di-follow-up" />
          ) : (
            <ul>
              {data.followUps.map((l) => (
                <li key={l.id}>
                  <Link href={`/crm/${l.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{l.name}</div>
                      <div className="truncate text-xs text-muted">{l.company ?? "Perorangan"}</div>
                    </div>
                    <Badge tone={LEAD_STAGE[l.stage][1]}>{LEAD_STAGE[l.stage][0]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Aktivitas terbaru" bodyClass="px-5 py-3">
          <ol className="relative border-l border-line pl-4">
            {data.recentActivity.map((a) => (
              <li key={a.id} className="relative pb-3 last:pb-0">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-surface bg-accent" aria-hidden />
                <p className="text-[13px] leading-snug">{a.summary}</p>
                <p className="text-[11.5px] text-faint">
                  {a.userName ?? "Sistem"} · {relative(a.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
