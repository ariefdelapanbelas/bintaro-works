"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  LuBuilding2,
  LuCalendarDays,
  LuFileText,
  LuHandshake,
  LuHistory,
  LuKeyRound,
  LuLayoutDashboard,
  LuLifeBuoy,
  LuLogOut,
  LuMenu,
  LuMonitor,
  LuMoon,
  LuPackage,
  LuReceipt,
  LuSearch,
  LuSettings,
  LuSun,
  LuUsers,
  LuX,
} from "react-icons/lu";
import type { Permission } from "@/core/domain/permissions";
import { ROLE_LABEL } from "@/client/format";
import { Link, useNav } from "@/client/nav";
import { applyTheme, readTheme, useSession, type ThemePref } from "@/client/session";
import { Menu, Modal } from "@/ui/overlay";
import { Avatar, cn, Spinner } from "@/ui/primitives";
import { PasswordPanel } from "../settings/SettingsPages";
import { CommandPalette } from "./CommandPalette";

const NAV: { href: string; label: string; icon: ReactNode; perm: Permission; group: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LuLayoutDashboard />, perm: "dashboard.view", group: "Ringkasan" },
  { href: "/crm", label: "CRM & Lead", icon: <LuHandshake />, perm: "crm.view", group: "Penjualan" },
  { href: "/customers", label: "Pelanggan", icon: <LuUsers />, perm: "customers.view", group: "Penjualan" },
  { href: "/spaces", label: "Ruang & Denah", icon: <LuBuilding2 />, perm: "spaces.view", group: "Operasional" },
  { href: "/contracts", label: "Kontrak", icon: <LuFileText />, perm: "contracts.view", group: "Operasional" },
  { href: "/bookings", label: "Booking", icon: <LuCalendarDays />, perm: "bookings.view", group: "Operasional" },
  { href: "/requests", label: "Permintaan", icon: <LuLifeBuoy />, perm: "requests.manage", group: "Operasional" },
  { href: "/billing", label: "Tagihan", icon: <LuReceipt />, perm: "billing.view", group: "Keuangan" },
  { href: "/catalog", label: "Katalog Layanan", icon: <LuPackage />, perm: "catalog.manage", group: "Keuangan" },
  { href: "/settings", label: "Pengaturan", icon: <LuSettings />, perm: "settings.manage", group: "Sistem" },
  { href: "/audit", label: "Log Aktivitas", icon: <LuHistory />, perm: "audit.view", group: "Sistem" },
];

import { Logo } from "@/ui/Logo";
export { Logo };

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => setPref(readTheme()), []);
  const next: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const label: Record<ThemePref, string> = { system: "Tema: ikuti sistem", light: "Tema: terang", dark: "Tema: gelap" };
  return (
    <button
      className={cn("btn btn-ghost btn-icon", className)}
      title={label[pref]}
      aria-label={label[pref]}
      onClick={() => {
        const n = next[pref];
        setPref(n);
        applyTheme(n);
      }}
    >
      {pref === "system" ? <LuMonitor className="h-4 w-4" /> : pref === "light" ? <LuSun className="h-4 w-4" /> : <LuMoon className="h-4 w-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, can, logout } = useSession();
  const { pathname, replace } = useNav();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!loading && !me) replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (me?.role === "CUSTOMER") replace("/portal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me]);

  if (loading || !me || me.role === "CUSTOMER") return <Spinner label="Menyiapkan ruang kerja…" />;

  const items = NAV.filter((n) => can(n.perm));
  const groups = [...new Set(items.map((i) => i.group))];

  const sidebar = (
    <nav className="flex h-full flex-col bg-side text-side-ink" aria-label="Navigasi utama">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard" className="text-side-ink">
          <Logo />
        </Link>
        <button className="btn btn-icon text-side-muted hover:text-side-ink lg:hidden" onClick={() => setDrawer(false)} aria-label="Tutup menu">
          <LuX className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mt-4 first:mt-1">
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-side-muted/80">{g}</div>
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                      active ? "bg-white/10 text-side-ink" : "text-side-muted hover:bg-white/5 hover:text-side-ink",
                    )}
                  >
                    <span className={cn("text-[17px]", active ? "text-accent" : "")}>{i.icon}</span>
                    {i.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={me.user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{me.user.name}</div>
            <div className="truncate text-[11.5px] text-side-muted">
              {ROLE_LABEL[me.role]} · {me.organization.name}
            </div>
          </div>
          <button className="btn btn-icon h-8 w-8 text-side-muted hover:bg-white/10 hover:text-side-ink" onClick={logout} title="Keluar" aria-label="Keluar">
            <LuLogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-full lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-side/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-up shadow-pop">{sidebar}</aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 border-b border-line bg-ground/85 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-4 sm:px-6">
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setDrawer(true)} aria-label="Buka menu">
            <LuMenu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="lg:hidden">
            <Logo compact />
          </Link>
          <button
            onClick={() => setPalette(true)}
            aria-label="Cari"
            className="flex h-9 min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] text-faint transition-colors hover:border-faint/50"
          >
            <LuSearch className="h-4 w-4" />
            <span className="flex-1 truncate text-left">Cari pelanggan, kontrak, invoice…</span>
            <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Menu
              trigger={
                <button className="btn btn-ghost h-9 gap-2 px-1.5" aria-label="Menu akun">
                  <Avatar name={me.user.name} className="h-7 w-7 text-[10px]" />
                </button>
              }
              items={[
                { label: <span className="text-muted">{me.user.email}</span>, onClick: () => undefined },
                can("settings.manage") && { label: "Pengaturan", icon: <LuSettings className="h-4 w-4" />, onClick: () => replace("/settings") },
                { label: "Ganti kata sandi", icon: <LuKeyRound className="h-4 w-4" />, onClick: () => setPwOpen(true) },
                { label: "Keluar", icon: <LuLogOut className="h-4 w-4" />, onClick: logout, danger: true },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6">{children}</main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} nav={items} />
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Keamanan akun" size="sm">
        <PasswordPanel />
      </Modal>
    </div>
  );
}
