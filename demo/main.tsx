// Demo in-browser Bintaro Works OS.
// UI, validasi, dan logika bisnis SAMA dengan aplikasi Next.js; bedanya hanya
// penyimpanan (MemoryRepo di browser) dan router (hash).
import { StrictMode, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { handleApi, type Method } from "@/core/api/router";
import { emptyData, MemoryRepo, type MemoryData } from "@/core/repo/memory";
import { createWebHasher } from "@/core/repo/web-hasher";
import type { Deps } from "@/core/repo/types";
import { seedDemo } from "@/core/seed/demo";
import type { SessionPayload } from "@/core/services/auth";
import { setTransport } from "@/client/api";
import { NavProvider, type NavAdapter } from "@/client/nav";
import { applyTheme, readTheme, SessionProvider } from "@/client/session";
import { matchRoute } from "@/features/routes";
import { AppShell } from "@/features/shell/AppShell";
import { PortalShell } from "@/features/portal/PortalPages";
import { ToastProvider } from "@/ui/overlay";
import { Spinner } from "@/ui/primitives";
import { createDemoSocialGateway } from "./social-demo";

const STORE_KEY = "bwos-demo-v1";
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const safeStorage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* penyimpanan tidak tersedia */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* abaikan */
    }
  },
};

const db = new MemoryRepo(emptyData());
const deps: Deps = { db, hasher: createWebHasher(1000), now: () => new Date(), social: createDemoSocialGateway() };
let session: SessionPayload | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeStorage.set(STORE_KEY, JSON.stringify({ savedAt: Date.now(), data: db.data, session })), 400);
}

async function boot() {
  const raw = safeStorage.get(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw, (_k, v) => (typeof v === "string" && ISO_RE.test(v) ? new Date(v) : v)) as { savedAt: number; data: MemoryData; session: SessionPayload | null };
      if (Date.now() - parsed.savedAt < 3 * 86_400_000 && parsed.data?.organizations?.length) {
        db.data = parsed.data;
        session = parsed.session;
        return;
      }
    } catch {
      /* snapshot rusak → seed ulang */
    }
  }
  const clock = { now: new Date() };
  const seedDb = new MemoryRepo(emptyData(), () => new Date(clock.now));
  await seedDemo(seedDb, deps.hasher, new Date(), clock);
  db.data = seedDb.data;
  session = null;
  persist();
}

setTransport(async ({ method, path, query, body }) => {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") q[k] = v;
  const res = await handleApi(deps, { method: method as Method, path, query: q, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)), session }, (e) => console.error(e));
  if (res.setSession !== undefined) session = res.setSession;
  if (method !== "GET" || res.setSession !== undefined) persist();
  await new Promise((r) => setTimeout(r, method === "GET" ? 40 : 120));
  return { status: res.status, body: JSON.parse(JSON.stringify(res.body ?? null)) };
});

// ---------------- Router hash ----------------
function parseHash() {
  const h = window.location.hash.replace(/^#/, "") || "/";
  const [p, s] = h.split("?");
  return { pathname: p || "/", search: s ? `?${s}` : "" };
}

function HashLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return <a href={`#${href}`} onClick={onClick} {...rest} />;
}

function App() {
  const [loc, setLoc] = useState(parseHash());
  useEffect(() => {
    const on = () => {
      setLoc(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const adapter = useMemo<NavAdapter>(
    () => ({
      pathname: loc.pathname,
      search: loc.search,
      push: (href) => {
        window.location.hash = href;
      },
      replace: (href) => {
        const url = `${window.location.pathname}${window.location.search}#${href}`;
        window.history.replaceState(null, "", url);
        setLoc(parseHash());
      },
      Link: HashLink,
    }),
    [loc],
  );

  const match = matchRoute(loc.pathname);
  useEffect(() => {
    if (!match) adapter.replace(session ? (session.role === "CUSTOMER" ? "/portal" : "/dashboard") : "/login");
    else if (session && (loc.pathname === "/login" || loc.pathname === "/signup")) adapter.replace(session.role === "CUSTOMER" ? "/portal" : "/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  let content: ReactNode = <Spinner />;
  if (match) {
    const page = match.route.render(match.params);
    content = match.route.shell === "app" ? <AppShell>{page}</AppShell> : match.route.shell === "portal" ? <PortalShell>{page}</PortalShell> : page;
  }

  return (
    <NavProvider adapter={adapter}>
      <ToastProvider>
        <SessionProvider>{content}</SessionProvider>
        <DemoBadge />
      </ToastProvider>
    </NavProvider>
  );
}

function DemoBadge() {
  const [open, setOpen] = useState(false);
  return (
    <div className="no-print fixed bottom-3 right-3 z-[45] hidden sm:block">
      {open ? (
        <div className="w-72 animate-scale-in rounded-xl border border-line bg-surface p-4 text-[12.5px] shadow-pop">
          <p className="font-semibold">Mode demo</p>
          <p className="mt-1 text-muted">Aplikasi berjalan penuh di browser Anda dengan data contoh Bintaro Works. Perubahan tersimpan hanya di browser ini.</p>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                safeStorage.remove(STORE_KEY);
                window.location.hash = "/login";
                window.location.reload();
              }}
            >
              Reset data demo
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Tutup
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-muted shadow-soft hover:text-ink">
          <span className="h-2 w-2 rounded-full bg-brass" /> Demo · data contoh
        </button>
      )}
    </div>
  );
}

applyTheme(readTheme());
const root = createRoot(document.getElementById("root")!);
root.render(<Spinner label="Menyiapkan data contoh Bintaro Works…" />);
boot().then(() =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
