// Gateway login sosial untuk produksi — tanpa library tambahan.
//
// Endpoint resmi (diperiksa September 2026):
//   Google   : https://accounts.google.com/.well-known/openid-configuration
//              authorize https://accounts.google.com/o/oauth2/v2/auth
//              token     https://oauth2.googleapis.com/token
//              profil    https://openidconnect.googleapis.com/v1/userinfo   (scope: openid email profile, PKCE S256)
//   Facebook : dialog    https://www.facebook.com/v25.0/dialog/oauth
//              token     https://graph.facebook.com/v25.0/oauth/access_token
//              profil    https://graph.facebook.com/v25.0/me?fields=id,name,email,picture
//   TikTok   : authorize https://www.tiktok.com/v2/auth/authorize/     (pakai client_key, bukan client_id)
//              token     https://open.tiktokapis.com/v2/oauth/token/
//              profil    https://open.tiktokapis.com/v2/user/info/     (TikTok TIDAK pernah memberi email)
import type { SocialProvider } from "@/core/domain/types";
import { createDemoSocialGateway, type SocialGateway, type SocialProfile } from "@/core/services/oauth";

const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION?.trim() || "v25.0";

export interface ProviderSpec {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  scope: string;
  usePkce: boolean;
  /** Nama parameter client id di URL otorisasi (TikTok memakai client_key). */
  clientIdParam: string;
  extraAuthParams?: Record<string, string>;
}

const env = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return "";
};

export function providerSpecs(): Partial<Record<SocialProvider, ProviderSpec>> {
  const out: Partial<Record<SocialProvider, ProviderSpec>> = {};
  const g = { id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") };
  if (g.id && g.secret) {
    out.GOOGLE = {
      clientId: g.id,
      clientSecret: g.secret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      scope: "openid email profile",
      usePkce: true,
      clientIdParam: "client_id",
      extraAuthParams: { access_type: "online", prompt: "select_account" },
    };
  }
  const f = { id: env("FACEBOOK_APP_ID", "FACEBOOK_CLIENT_ID"), secret: env("FACEBOOK_APP_SECRET", "FACEBOOK_CLIENT_SECRET") };
  if (f.id && f.secret) {
    out.FACEBOOK = {
      clientId: f.id,
      clientSecret: f.secret,
      authorizeUrl: `https://www.facebook.com/${FB_VERSION}/dialog/oauth`,
      scope: "public_profile,email",
      usePkce: false,
      clientIdParam: "client_id",
    };
  }
  const t = { id: env("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_ID"), secret: env("TIKTOK_CLIENT_SECRET") };
  if (t.id && t.secret) {
    out.TIKTOK = {
      clientId: t.id,
      clientSecret: t.secret,
      authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
      scope: "user.info.basic",
      usePkce: false,
      clientIdParam: "client_key",
    };
  }
  return out;
}

export function buildAuthorizeUrl(spec: ProviderSpec, opts: { redirectUri: string; state: string; codeChallenge?: string }): string {
  const u = new URL(spec.authorizeUrl);
  u.searchParams.set(spec.clientIdParam, spec.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", spec.scope);
  u.searchParams.set("state", opts.state);
  for (const [k, v] of Object.entries(spec.extraAuthParams ?? {})) u.searchParams.set(k, v);
  if (spec.usePkce && opts.codeChallenge) {
    u.searchParams.set("code_challenge", opts.codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

// ---------------- PKCE ----------------

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function randomUrlToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// ---------------- Pertukaran token & profil ----------------

async function postForm(url: string, form: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* jawaban bukan JSON */
  }
  if (!res.ok) throw new Error(`token ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`profil ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** HMAC-SHA256 app secret proof — pengaman tambahan yang disarankan Meta. */
async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function googleProfile(spec: ProviderSpec, code: string, redirectUri: string, verifier?: string): Promise<SocialProfile> {
  const token = await postForm("https://oauth2.googleapis.com/token", {
    client_id: spec.clientId,
    client_secret: spec.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    ...(verifier ? { code_verifier: verifier } : {}),
  });
  const access = String(token.access_token ?? "");
  if (!access) throw new Error("Google tidak mengembalikan access_token");
  const me = await getJson("https://openidconnect.googleapis.com/v1/userinfo", { Authorization: `Bearer ${access}` });
  return {
    providerUserId: String(me.sub ?? ""),
    email: me.email ? String(me.email) : null,
    emailVerified: me.email_verified === true || me.email_verified === "true",
    name: me.name ? String(me.name) : null,
    avatarUrl: me.picture ? String(me.picture) : null,
  };
}

async function facebookProfile(spec: ProviderSpec, code: string, redirectUri: string): Promise<SocialProfile> {
  const token = await postForm(`https://graph.facebook.com/${FB_VERSION}/oauth/access_token`, {
    client_id: spec.clientId,
    client_secret: spec.clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const access = String(token.access_token ?? "");
  if (!access) throw new Error("Facebook tidak mengembalikan access_token");
  const proof = await appSecretProof(access, spec.clientSecret);
  const me = await getJson(
    `https://graph.facebook.com/${FB_VERSION}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(access)}&appsecret_proof=${proof}`,
  );
  const pic = (me.picture as { data?: { url?: string } } | undefined)?.data?.url;
  return {
    providerUserId: String(me.id ?? ""),
    email: me.email ? String(me.email) : null,
    // Facebook hanya mengembalikan email yang sudah terkonfirmasi di akun tersebut.
    emailVerified: Boolean(me.email),
    name: me.name ? String(me.name) : null,
    avatarUrl: pic ?? null,
  };
}

async function tiktokProfile(spec: ProviderSpec, code: string, redirectUri: string, verifier?: string): Promise<SocialProfile> {
  const token = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: spec.clientId,
    client_secret: spec.clientSecret,
    code: decodeURIComponent(code),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    ...(verifier ? { code_verifier: verifier } : {}),
  });
  const access = String(token.access_token ?? "");
  const openId = String(token.open_id ?? "");
  if (!access) throw new Error("TikTok tidak mengembalikan access_token");
  const info = await getJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url", {
    Authorization: `Bearer ${access}`,
  });
  const user = ((info.data as { user?: Record<string, unknown> } | undefined)?.user ?? {}) as Record<string, unknown>;
  return {
    providerUserId: String(user.open_id ?? openId),
    email: null, // TikTok tidak pernah memberikan email
    emailVerified: false,
    name: user.display_name ? String(user.display_name) : null,
    avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
  };
}

/** URL callback yang harus didaftarkan di konsol penyedia. */
export function callbackUrl(origin: string, provider: SocialProvider): string {
  const base = (process.env.APP_URL?.trim() || origin).replace(/\/$/, "");
  return `${base}/api/auth/oauth/${provider.toLowerCase()}/callback`;
}

export function createSocialGateway(): SocialGateway {
  const specs = providerSpecs();
  const configured = Object.keys(specs) as SocialProvider[];
  if (configured.length > 0) {
    return {
      mode: "redirect",
      enabled: () => configured,
      async profileFromCode(provider, input) {
        const spec = specs[provider];
        if (!spec) throw new Error(`Penyedia ${provider} belum dikonfigurasi`);
        const redirectUri = input.redirectUri ?? "";
        if (provider === "GOOGLE") return googleProfile(spec, input.code, redirectUri, input.codeVerifier);
        if (provider === "FACEBOOK") return facebookProfile(spec, input.code, redirectUri);
        return tiktokProfile(spec, input.code, redirectUri, input.codeVerifier);
      },
    };
  }

  // Jika belum ada kredensial OAuth asli yang disetel di environment, aktifkan demo gateway
  // agar tombol Google, Facebook, dan TikTok tetap tampil dan berfungsi persis seperti di GitHub Pages!
  return createDemoSocialGateway();
}
