// Langkah 1 alur login sosial: arahkan pengguna ke halaman izin penyedia.
//   /api/auth/oauth/google?org=bintaro-works&next=/portal
// State anti-CSRF + PKCE verifier disimpan di cookie bertanda tangan (10 menit).
import { NextResponse, type NextRequest } from "next/server";
import { parseProvider } from "@/core/services/oauth";
import { buildAuthorizeUrl, callbackUrl, pkceChallenge, providerSpecs, randomUrlToken } from "@/server/social";
import { OAUTH_COOKIE, OAUTH_TTL_SECONDS, cookieOptions, signToken } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hanya izinkan tujuan internal agar tidak bisa dipakai sebagai open redirect. */
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v.slice(0, 200) : null);

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params;
  const origin = req.nextUrl.origin;
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin));

  let provider;
  try {
    provider = parseProvider(raw);
  } catch {
    return fail("Penyedia login tidak dikenal.");
  }
  const spec = providerSpecs()[provider];
  if (!spec) return fail(`Login dengan penyedia ini belum diaktifkan di server.`);

  const state = randomUrlToken(24);
  const verifier = spec.usePkce ? randomUrlToken(32) : undefined;
  const redirectUri = callbackUrl(origin, provider);
  const url = buildAuthorizeUrl(spec, {
    redirectUri,
    state,
    codeChallenge: verifier ? await pkceChallenge(verifier) : undefined,
  });

  const res = NextResponse.redirect(url);
  const isHttps = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const payload = {
    p: provider,
    s: state,
    v: verifier ?? null,
    org: req.nextUrl.searchParams.get("org")?.slice(0, 60) ?? null,
    next: safeNext(req.nextUrl.searchParams.get("next")),
    link: req.nextUrl.searchParams.get("mode") === "link",
  };
  res.cookies.set(OAUTH_COOKIE, await signToken(payload, OAUTH_TTL_SECONDS), { ...cookieOptions(isHttps), maxAge: OAUTH_TTL_SECONDS });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
