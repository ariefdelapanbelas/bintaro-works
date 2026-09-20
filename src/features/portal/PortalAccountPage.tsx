"use client";
// Portal → Akun saya: cara masuk (kata sandi + akun sosial tertaut).
import { useState } from "react";
import { FaFacebookF, FaGoogle, FaTiktok } from "react-icons/fa6";
import { LuCheck, LuKeyRound, LuTrash2 } from "react-icons/lu";
import type { SocialProvider } from "@/core/domain/types";
import { api, ApiError } from "@/client/api";
import { dateTime } from "@/client/format";
import { useApi, useMutation } from "@/client/hooks";
import { useSearchParam } from "@/client/nav";
import { useSession } from "@/client/session";
import { ConfirmDialog, useToast } from "@/ui/overlay";
import { Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Spinner } from "@/ui/primitives";
import { SocialButtons } from "../auth/SocialButtons";

interface LinkedAccount {
  id: string;
  provider: SocialProvider;
  label: string;
  email: string | null;
  name: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AccountsInfo {
  accounts: LinkedAccount[];
  passwordSet: boolean;
  available: { id: SocialProvider; label: string; canSignUp: boolean }[];
}

const ICON: Record<SocialProvider, typeof FaGoogle> = { GOOGLE: FaGoogle, FACEBOOK: FaFacebookF, TIKTOK: FaTiktok };
const BRAND: Record<SocialProvider, string> = { GOOGLE: "#ea4335", FACEBOOK: "#1877f2", TIKTOK: "#ff0050" };

export function PortalAccountPage() {
  const { me } = useSession();
  const toast = useToast();
  const linked = useSearchParam("linked");
  const flowError = useSearchParam("error");
  const { data, reload } = useApi<AccountsInfo>("/auth/social-accounts");
  const [remove, setRemove] = useState<LinkedAccount | null>(null);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<ApiError | null>(null);

  const savePassword = useMutation(async () => {
    await api.post("/auth/password/set", { newPassword: pw });
  });

  if (!data) return <Spinner label="Memuat akun…" />;
  const used = new Set(data.accounts.map((a) => a.provider));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Akun saya" description="Atur cara Anda masuk ke portal Bintaro Works." />

      {flowError && (
        <p className="rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-[13px] text-bad" role="alert">
          {flowError}
        </p>
      )}
      {linked && (
        <p className="rounded-xl border border-good/70 bg-good-soft px-4 py-3 text-[13px] text-good" role="status">
          Akun {linked.toUpperCase()} berhasil ditautkan.
        </p>
      )}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <p className="text-[13.5px] font-semibold">Identitas</p>
        </div>
        <dl className="grid gap-3 px-4 py-4 text-[13.5px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">Nama</dt>
            <dd className="font-medium">{me?.user.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="font-medium">{me?.user.email}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <p className="text-[13.5px] font-semibold">Akun sosial tertaut</p>
          <p className="text-[12.5px] text-muted">Setelah ditautkan, Anda bisa masuk sekali klik tanpa mengetik kata sandi.</p>
        </div>
        {data.accounts.length === 0 ? (
          <div className="px-4 py-2">
            <Empty title="Belum ada akun tertaut" description="Tautkan Google, Facebook, atau TikTok agar masuk lebih cepat." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.accounts.map((a) => {
              const Icon = ICON[a.provider];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised">
                    <Icon className="h-4 w-4" style={{ color: BRAND[a.provider] }} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold">{a.label}</p>
                    <p className="truncate text-[12px] text-muted">
                      {a.email ?? a.name ?? "Tertaut"}
                      {a.lastLoginAt ? ` · terakhir dipakai ${dateTime(a.lastLoginAt)}` : ""}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setRemove(a)}>
                    <LuTrash2 className="h-3.5 w-3.5" /> Lepas
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {data.available.some((p) => !used.has(p.id)) && (
          <div className="px-4 pb-4">
            <SocialButtons mode="link" label="tautkan akun" onDone={() => (toast.success("Akun ditautkan"), reload())} />
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <p className="text-[13.5px] font-semibold">Kata sandi</p>
          <p className="text-[12.5px] text-muted">
            {data.passwordSet
              ? "Akun Anda sudah punya kata sandi sebagai cara masuk cadangan."
              : "Akun Anda dibuat lewat login sosial. Setel kata sandi agar tetap bisa masuk bila akun sosial bermasalah."}
          </p>
        </div>
        {data.passwordSet ? (
          <p className="flex items-center gap-2 px-4 py-4 text-[13.5px] text-good">
            <LuCheck className="h-4 w-4" /> Kata sandi sudah disetel.
          </p>
        ) : (
          <form
            className="flex flex-col gap-3 px-4 py-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setPwError(null);
              try {
                await savePassword.run();
                setPw("");
                toast.success("Kata sandi tersimpan");
                reload();
              } catch (err) {
                setPwError(err as ApiError);
              }
            }}
          >
            <ErrorBox error={pwError && !pwError.fields ? pwError : null} />
            <Field label="Kata sandi baru" htmlFor="set-password" hint="Minimal 8 karakter" error={pwError?.fields?.newPassword}>
              <Input id="set-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" className="self-start" loading={savePassword.pending}>
              <LuKeyRound className="h-4 w-4" /> Simpan kata sandi
            </Button>
          </form>
        )}
      </Card>

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Lepas akun ${remove?.label ?? ""}?`}
        message="Anda tidak bisa lagi masuk lewat akun ini. Tautkan lagi kapan saja."
        confirmLabel="Lepas"
        danger
        onConfirm={async () => {
          try {
            await api.del(`/auth/social-accounts/${remove!.id}`);
            toast.success("Tautan dilepas");
            setRemove(null);
            reload();
          } catch (err) {
            toast.error((err as ApiError).message);
          }
        }}
      />
    </div>
  );
}
