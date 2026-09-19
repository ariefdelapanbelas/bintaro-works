// Langkah 2 alur login sosial: penyedia mengembalikan pengguna ke sini dengan
// ?code=...&state=... . Kita cocokkan state dengan cookie, tukar code menjadi
// profil, lalu buat/ tautkan akun dan pasang cookie sesi.
import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/core/domain/errors";
import { completeOAuth, linkMyAccount, parseProvider, PROVIDER_LABEL } from "@/core/services/oauth";
import { resolveAuth } from "@/core/services/auth";
import { getDeps } from "@/server/db";
import { callbackUrl } from "@/server/social";
import { OAUTH_COOKIE, SESSION_COOKIE, cookieOptions, signSession, verifySession, verifyToken } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatePayload = Record<string, unknown> & {
  p: string;
  s: string;
  v: string | null;
  org: string | null;
  next: string | null;
  link?: boolean;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params;
  const origin = req.nextUrl.origin;
  const isHttps = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const state = await verifyToken<StatePayload>(req.cookies.get(OAUTH_COOKIE)?.value);

  const backTo = state?.org ? `/o/${state.org}` : state?.link ? "/portal/akun" : "/login";
  const clearOauth = (res: NextResponse) => {
    res.cookies.set(OAUTH_COOKIE, "", { ...cookieOptions(isHttps), maxAge: 0 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const fail = (msg: string) => clearOauth(NextResponse.redirect(new URL(`${backTo}?error=${encodeURIComponent(msg)}`, origin)));

  let provider;
  try {
    provider = parseProvider(raw);
  } catch {
    return fail("Penyedia login tidak dikenal.");
  }

  const err = req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("error");
  if (err) return fail(`Izin ke ${PROVIDER_LABEL[provider]} dibatalkan.`);

  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!code) return fail("Kode otorisasi tidak diterima. Coba lagi.");
  if (!state || state.p !== provider || !returnedState || returnedState !== state.s) {
    return fail("Sesi login kedaluwarsa atau tidak cocok. Silakan ulangi.");
  }

  const input = { code, redirectUri: callbackUrl(origin, provider), codeVerifier: state.v ?? undefined };
  const deps = getDeps();

  try {
    // Mode "tautkan akun" — pengguna sudah masuk dan ingin menambah penyedia.
    if (state.link) {
      const auth = await resolveAuth(deps, await verifySession(req.cookies.get(SESSION_COOKIE)?.value));
      if (!auth) return fail("Sesi Anda berakhir. Masuk dulu, lalu tautkan akun.");
      await linkMyAccount(deps, auth, provider, input);
      return clearOauth(NextResponse.redirect(new URL(`/portal/akun?linked=${provider.toLowerCase()}`, origin)));
    }

    const r = await completeOAuth(deps, provider, { ...input, orgSlug: state.org });
    const dest = state.next && state.next.startsWith("/") ? state.next : r.redirectTo;
    const res = NextResponse.redirect(new URL(`${dest}${dest.includes("?") ? "&" : "?"}welcome=${r.isNew ? "baru" : "kembali"}`, origin));
    res.cookies.set(SESSION_COOKIE, await signSession(r.session), cookieOptions(isHttps));
    return clearOauth(res);
  } catch (e) {
    if (e instanceof AppError) return fail(e.message);
    console.error("[oauth]", provider, e);
    return fail(`Gagal masuk dengan ${PROVIDER_LABEL[provider]}. Coba lagi beberapa saat lagi.`);
  }
}
