"use client";
// Tombol "Masuk dengan Google / Facebook / TikTok".
//
// Dua mode:
//  • redirect (produksi) — arahkan browser ke /api/auth/oauth/{penyedia},
//    server yang mengurus state, PKCE, dan tukar-menukar token.
//  • demo (demo in-browser) — tampilkan layar izin tiruan, lalu panggil
//    endpoint callback dengan "code" simulasi. Logika akunnya tetap asli.
import { useState, type FormEvent } from "react";
import { FaFacebookF, FaGoogle, FaTiktok } from "react-icons/fa6";
import type { SocialProvider } from "@/core/domain/types";
import { api, ApiError } from "@/client/api";
import { useApi } from "@/client/hooks";
import { useSession } from "@/client/session";
import { useNav } from "@/client/nav";
import { Modal } from "@/ui/overlay";
import { Button, ErrorBox, Field, Input } from "@/ui/primitives";

/** Bentuk "authorization code" untuk gateway simulasi (lihat demo/social-demo.ts). */
const demoCode = (consent: { name: string; email: string }) => `demo.${btoa(unescape(encodeURIComponent(JSON.stringify(consent))))}`;

export interface ProvidersInfo {
  mode: "redirect" | "demo";
  providers: { id: SocialProvider; label: string; canSignUp: boolean }[];
}

const ICON: Record<SocialProvider, typeof FaGoogle> = { GOOGLE: FaGoogle, FACEBOOK: FaFacebookF, TIKTOK: FaTiktok };
const BRAND: Record<SocialProvider, string> = { GOOGLE: "#ea4335", FACEBOOK: "#1877f2", TIKTOK: "#ff0050" };

export function useProviders() {
  return useApi<ProvidersInfo>("/auth/providers");
}

export function SocialButtons({
  orgSlug,
  next,
  mode = "login",
  label = "atau masuk dengan",
  redirectAfter = true,
  onDone,
}: {
  orgSlug?: string;
  next?: string;
  /** "login" = masuk/daftar, "link" = tautkan ke akun yang sedang masuk. */
  mode?: "login" | "link";
  label?: string;
  /** false = jangan pindah halaman setelah berhasil (pemanggil yang melanjutkan alur). */
  redirectAfter?: boolean;
  onDone?: () => void;
}) {
  const { data } = useProviders();
  const { refresh } = useSession();
  const { replace } = useNav();
  const [sim, setSim] = useState<{ provider: SocialProvider; label: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  if (!data || data.providers.length === 0) return null;

  const start = (p: { id: SocialProvider; label: string }) => {
    if (data.mode === "redirect") {
      const q = new URLSearchParams();
      if (orgSlug) q.set("org", orgSlug);
      if (next) q.set("next", next);
      if (mode === "link") q.set("mode", "link");
      window.location.href = `/api/auth/oauth/${p.id.toLowerCase()}${q.size ? `?${q}` : ""}`;
      return;
    }
    setError(null);
    setForm({ name: "", email: "" });
    setSim({ provider: p.id, label: p.label });
  };

  const submitSim = async (e: FormEvent) => {
    e.preventDefault();
    if (!sim) return;
    setPending(true);
    setError(null);
    try {
      const code = demoCode(form);
      if (mode === "link") {
        await api.post(`/auth/social-accounts/${sim.provider.toLowerCase()}`, { code });
        setSim(null);
        onDone?.();
      } else {
        const r = await api.post<{ redirectTo: string }>(`/auth/oauth/${sim.provider.toLowerCase()}/callback`, { code, orgSlug });
        await refresh();
        setSim(null);
        onDone?.();
        if (redirectAfter) replace(next && next.startsWith("/") ? next : r.redirectTo);
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="mt-6">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">{label}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {data.providers.map((p) => {
            const Icon = ICON[p.id];
            return (
              <button
                key={p.id}
                type="button"
                id={`social-${p.id.toLowerCase()}`}
                onClick={() => start(p)}
                className="btn btn-secondary h-10 w-full"
              >
                <Icon className="h-4 w-4" style={{ color: BRAND[p.id] }} aria-hidden /> {p.label}
              </button>
            );
          })}
        </div>
        {mode === "login" && (
          <p className="mt-2 text-center text-[11.5px] text-faint">
            Login sosial untuk pelanggan. Tim internal masuk memakai email &amp; kata sandi.
          </p>
        )}
      </div>

      {/* Layar izin tiruan — hanya muncul di demo in-browser */}
      <Modal
        open={!!sim}
        onClose={() => setSim(null)}
        title={sim ? `Masuk dengan ${sim.label}` : ""}
        description="Simulasi layar izin — di aplikasi sungguhan Anda akan diarahkan ke halaman resmi penyedia."
        footer={
          <>
            <Button onClick={() => setSim(null)}>Batal</Button>
            <Button variant="primary" onClick={submitSim} loading={pending}>
              Izinkan &amp; lanjutkan
            </Button>
          </>
        }
      >
        <form onSubmit={submitSim} className="flex flex-col gap-4">
          <ErrorBox error={error && !error.fields ? error : null} />
          <Field label="Nama di akun tersebut" htmlFor="sim-name" required>
            <Input id="sim-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Rani Kusuma" />
          </Field>
          {sim?.provider !== "TIKTOK" ? (
            <Field label="Email akun tersebut" htmlFor="sim-email" error={error?.fields?.email} required>
              <Input id="sim-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@gmail.com" />
            </Field>
          ) : (
            <p className="rounded-xl bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
              TikTok tidak pernah memberikan email. Karena itu TikTok hanya bisa dipakai setelah ditautkan dari menu <b>Akun saya</b> di portal.
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
