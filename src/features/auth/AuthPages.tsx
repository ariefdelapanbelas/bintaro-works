"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { LuArrowRight, LuBuilding2, LuCalendarDays, LuReceipt } from "react-icons/lu";
import { api, ApiError } from "@/client/api";
import { Link, useNav, useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { Button, ErrorBox, Field, Input } from "@/ui/primitives";
import { Logo, ThemeToggle } from "../shell/AppShell";

// Set NEXT_PUBLIC_DEMO_MODE="false" di produksi untuk menyembunyikan akun contoh.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const DEMO = [
  { email: "owner@bintaroworks.id", role: "Owner" },
  { email: "admin@bintaroworks.id", role: "Admin" },
  { email: "staf@bintaroworks.id", role: "Staf" },
  { email: "finance@bintaroworks.id", role: "Finance" },
  { email: "budi@kopikita.id", role: "Portal pelanggan" },
];

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-side p-10 text-side-ink lg:flex lg:flex-col">
        <Logo />
        <div className="relative z-10 mt-auto max-w-md">
          <p className="eyebrow !text-side-muted">Bintaro Works OS</p>
          <h1 className="mt-3 font-display text-[40px] font-bold leading-[1.05]">Satu layar untuk ruang, penyewa, dan arus kas.</h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-side-muted">
            Dari lead WhatsApp sampai invoice lunas — kelola private office, virtual office, meeting room, dan studio tanpa spreadsheet.
          </p>
          <ul className="mt-8 grid gap-3 text-[13.5px]">
            {[
              [<LuBuilding2 key="a" />, "Denah lantai real-time: tersedia, terisi, maintenance"],
              [<LuCalendarDays key="b" />, "Booking meeting room & studio anti-bentrok"],
              [<LuReceipt key="c" />, "Tagihan berulang otomatis + PPN 11%"],
            ].map(([icon, text], i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-accent">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        {/* denah dekoratif */}
        <div className="pointer-events-none absolute -right-16 top-20 grid h-[340px] w-[420px] rotate-[-8deg] grid-cols-6 grid-rows-4 gap-2 opacity-[0.16]" aria-hidden>
          {[3, 1, 2, 2, 1, 3, 2, 2, 1, 1, 3, 2, 2, 1, 3, 1].map((s, i) => (
            <span key={i} className="rounded-md border border-side-ink" style={{ gridColumn: `span ${s > 2 ? 2 : 1}`, background: s === 1 ? "rgb(var(--accent))" : "transparent" }} />
          ))}
        </div>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo />
          </span>
          <ThemeToggle className="ml-auto" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { replace } = useNav();
  const { refresh } = useSession();
  const next = useSearchParam("next");
  const [email, setEmail] = useState(DEMO_MODE ? "owner@bintaroworks.id" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "bintaro123" : "");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await api.post<{ redirectTo: string }>("/auth/login", { email, password });
      await refresh();
      const target = next && next.startsWith("/") && !next.startsWith("//") && (r.redirectTo === "/portal") === next.startsWith("/portal") ? next : r.redirectTo;
      replace(target);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-[28px] font-bold">Masuk</h2>
      <p className="mt-1 text-[13.5px] text-muted">Gunakan akun kerja Anda untuk melanjutkan.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
        <ErrorBox error={error && !error.fields ? error : null} />
        <Field label="Email" htmlFor="login-email" error={error?.fields?.email}>
          <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Kata sandi" htmlFor="login-password" error={error?.fields?.password}>
          <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" className="h-10" loading={pending}>
          Masuk <LuArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-8 rounded-xl border border-dashed border-line p-4" hidden={!DEMO_MODE}>
        <p className="eyebrow">Akun contoh · sandi bintaro123</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword("bintaro123");
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${email === d.email ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"}`}
            >
              {d.role}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-6 text-center text-[13px] text-muted">
        Mengelola coworking lain?{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          Daftarkan organisasi
        </Link>
      </p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { replace } = useNav();
  const { refresh } = useSession();
  const [form, setForm] = useState({ organizationName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await api.post<{ redirectTo: string }>("/auth/signup", form);
      await refresh();
      replace(r.redirectTo);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-[28px] font-bold">Daftarkan organisasi</h2>
      <p className="mt-1 text-[13.5px] text-muted">Ruang kerja baru lengkap dengan katalog layanan standar. Data terpisah dari organisasi lain.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
        <ErrorBox error={error && !error.fields ? error : null} />
        <Field label="Nama organisasi" htmlFor="su-org" error={error?.fields?.organizationName}>
          <Input id="su-org" value={form.organizationName} onChange={set("organizationName")} placeholder="mis. Serpong Hub" />
        </Field>
        <Field label="Nama Anda" htmlFor="su-name" error={error?.fields?.name}>
          <Input id="su-name" value={form.name} onChange={set("name")} autoComplete="name" />
        </Field>
        <Field label="Email kerja" htmlFor="su-email" error={error?.fields?.email}>
          <Input id="su-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
        </Field>
        <Field label="Kata sandi" htmlFor="su-pass" error={error?.fields?.password} hint="Minimal 8 karakter">
          <Input id="su-pass" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="primary" className="h-10" loading={pending}>
          Buat ruang kerja
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Masuk
        </Link>
      </p>
    </AuthLayout>
  );
}
