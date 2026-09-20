// Login dengan akun sosial (Google / Facebook / TikTok).
//
// Aturan yang dipakai di sini (disepakati bersama pemilik usaha):
//  1. Login sosial hanya untuk PELANGGAN. Tim internal (Owner/Admin/Staf/Finance)
//     tetap wajib email + kata sandi — akses ke data keuangan tidak boleh
//     bergantung pada penyedia pihak ketiga.
//  2. Bila email dari penyedia sudah TERVERIFIKASI dan cocok dengan akun yang ada,
//     akun sosial langsung ditautkan ke akun itu (pengguna tidak punya dua akun).
//  3. TikTok tidak pernah memberikan email. Karena itu TikTok hanya bisa dipakai
//     setelah ditautkan dari halaman portal, bukan untuk mendaftar akun baru.
//
// Modul ini tidak pernah memanggil jaringan sendiri; pertukaran token dilakukan
// oleh "gateway" yang disuntikkan (produksi: src/server/social.ts, demo: simulasi).
import { AppError, forbidden, notFound } from "../domain/errors";
import type { AuthContext, SocialAccount, SocialProvider } from "../domain/types";
import { SOCIAL_PROVIDERS } from "../domain/types";
import type { Deps } from "../repo/types";
import type { SessionPayload } from "./auth";
import { audit, makeSvc } from "./context";
import { createCustomerAccount, publicOrgBySlug } from "./public";

export interface SocialProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export interface SocialGateway {
  /** Penyedia yang kredensialnya sudah diisi di environment. */
  enabled(): SocialProvider[];
  /** "redirect" = alur OAuth sungguhan; "demo" = simulasi di browser. */
  mode: "redirect" | "demo";
  /** Tukar authorization code menjadi profil pengguna. */
  profileFromCode(provider: SocialProvider, input: { code: string; redirectUri?: string; codeVerifier?: string }): Promise<SocialProfile>;
}

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
};

export interface DemoConsent {
  name: string;
  email: string;
}

/** Bungkus pilihan pengguna menjadi "code" yang dimengerti gateway demo. */
export function demoCode(consent: DemoConsent): string {
  return `demo.${btoa(unescape(encodeURIComponent(JSON.stringify(consent))))}`;
}

const stableId = (provider: SocialProvider, key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${provider.toLowerCase()}-${Math.abs(h).toString(36)}`;
};

export function createDemoSocialGateway(): SocialGateway {
  return {
    mode: "demo",
    enabled: () => ["GOOGLE", "FACEBOOK", "TIKTOK"] as SocialProvider[],
    async profileFromCode(provider, { code }): Promise<SocialProfile> {
      let consent: DemoConsent;
      try {
        consent = JSON.parse(decodeURIComponent(escape(atob(code.replace(/^demo\./, ""))))) as DemoConsent;
      } catch {
        throw new Error("Kode simulasi tidak valid");
      }
      const name = (consent.name ?? "").trim();
      const email = (consent.email ?? "").trim().toLowerCase();
      // TikTok tidak pernah memberi email — disimulasikan apa adanya.
      const withEmail = provider !== "TIKTOK";
      return {
        providerUserId: stableId(provider, email || name),
        email: withEmail ? email || null : null,
        emailVerified: withEmail && Boolean(email),
        name: name || (email ? email.split("@")[0] : null),
        avatarUrl: null,
      };
    },
  };
}

export function parseProvider(raw: string): SocialProvider {
  const p = raw.toUpperCase() as SocialProvider;
  if (!(SOCIAL_PROVIDERS as readonly string[]).includes(p)) throw notFound("Penyedia login");
  return p;
}

function gatewayOf(deps: Deps): SocialGateway {
  if (!deps.social) throw new AppError("CONFLICT", "Login dengan akun sosial belum diaktifkan di server ini");
  return deps.social;
}

/** Daftar tombol yang boleh ditampilkan di halaman masuk. */
export function listProviders(deps: Deps) {
  const gw = deps.social;
  const enabled = gw?.enabled() ?? [];
  return {
    mode: gw?.mode ?? "redirect",
    providers: enabled.map((id) => ({
      id,
      label: PROVIDER_LABEL[id],
      /** TikTok tidak memberi email → tidak bisa dipakai mendaftar akun baru. */
      canSignUp: id !== "TIKTOK",
    })),
  };
}

function ensureEnabled(deps: Deps, provider: SocialProvider) {
  const gw = gatewayOf(deps);
  if (!gw.enabled().includes(provider)) {
    throw new AppError("CONFLICT", `Login dengan ${PROVIDER_LABEL[provider]} belum diaktifkan di server ini`);
  }
  return gw;
}

/** Kata sandi acak untuk akun yang lahir dari login sosial (tidak pernah dipakai). */
function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sessionFor(deps: Deps, userId: string, provider: SocialProvider): Promise<{ session: SessionPayload; redirectTo: string }> {
  const user = await deps.db.getUser(userId);
  if (!user || !user.isActive) throw new AppError("UNAUTHORIZED", "Akun ini tidak aktif. Hubungi tim Bintaro Works.");
  const memberships = await deps.db.membershipsOfUser(userId);
  const m = memberships.find((x) => x.role === "CUSTOMER");
  if (!m) {
    // Aturan 1: akun tim internal tidak boleh masuk lewat penyedia sosial.
    throw forbidden(
      memberships.length
        ? "Akun tim internal harus masuk memakai email dan kata sandi."
        : "Akun Anda belum terhubung ke organisasi mana pun.",
    );
  }
  await deps.db.updateUser(user.id, { lastLoginAt: deps.now() });
  const auth: AuthContext = { userId: user.id, userName: user.name, organizationId: m.organizationId, role: m.role, customerId: m.customerId };
  await audit(makeSvc(deps, auth), "auth.login.social", "User", user.id, `${user.name} masuk lewat ${PROVIDER_LABEL[provider]}`);
  return { session: { uid: user.id, oid: m.organizationId, role: m.role }, redirectTo: "/portal" };
}

/**
 * Selesaikan alur login sosial: tukar code → profil → cari/tautkan/buat akun → sesi.
 * `orgSlug` diisi bila alur dimulai dari aplikasi pelanggan (`/o/{slug}`);
 * tanpa itu, akun baru tidak dibuat — pengguna diminta mendaftar lebih dulu.
 */
export async function completeOAuth(
  deps: Deps,
  provider: SocialProvider,
  input: { code: string; redirectUri?: string; codeVerifier?: string; orgSlug?: string | null },
): Promise<{ session: SessionPayload; redirectTo: string; isNew: boolean; provider: SocialProvider }> {
  const gw = ensureEnabled(deps, provider);
  const profile = await gw.profileFromCode(provider, { code: input.code, redirectUri: input.redirectUri, codeVerifier: input.codeVerifier });
  if (!profile.providerUserId) throw new AppError("UNAUTHORIZED", `Tidak bisa membaca akun ${PROVIDER_LABEL[provider]} Anda. Coba lagi.`);

  const link = await deps.db.findSocialAccount(provider, profile.providerUserId);
  if (link) {
    await deps.db.updateSocialAccount(link.id, {
      email: profile.email ?? link.email,
      name: profile.name ?? link.name,
      avatarUrl: profile.avatarUrl ?? link.avatarUrl,
      lastLoginAt: deps.now(),
    });
    return { ...(await sessionFor(deps, link.userId, provider)), isNew: false, provider };
  }

  // Aturan 2: email terverifikasi → satukan dengan akun yang sudah ada.
  const email = profile.emailVerified && profile.email ? profile.email.toLowerCase() : null;
  const existing = email ? await deps.db.findUserByEmail(email) : null;
  if (existing) {
    await deps.db.createSocialAccount({
      userId: existing.id,
      provider,
      providerUserId: profile.providerUserId,
      email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      lastLoginAt: deps.now(),
    });
    return { ...(await sessionFor(deps, existing.id, provider)), isNew: false, provider };
  }

  // Belum punya akun sama sekali → hanya boleh mendaftar dari aplikasi pelanggan.
  if (!email) {
    throw new AppError(
      "CONFLICT",
      `Akun ${PROVIDER_LABEL[provider]} ini belum ditautkan. Masuk dulu memakai email (atau Google), lalu tautkan ${PROVIDER_LABEL[provider]} di menu Akun saya.`,
    );
  }
  if (!input.orgSlug) {
    throw new AppError("CONFLICT", `${email} belum terdaftar. Silakan daftar lebih dulu lewat halaman pemesanan Bintaro Works.`);
  }
  const org = await publicOrgBySlug(deps, input.orgSlug);
  const created = await createCustomerAccount(deps, org, {
    name: profile.name || email.split("@")[0],
    company: null,
    email,
    phone: null,
    passwordHash: await deps.hasher.hash(randomSecret()),
    passwordSet: false,
    note: `Mendaftar lewat ${PROVIDER_LABEL[provider]}.`,
  });
  await deps.db.createSocialAccount({
    userId: created.userId,
    provider,
    providerUserId: profile.providerUserId,
    email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    lastLoginAt: deps.now(),
  });
  return { ...(await sessionFor(deps, created.userId, provider)), isNew: true, provider };
}

const publicView = (a: SocialAccount) => ({
  id: a.id,
  provider: a.provider,
  label: PROVIDER_LABEL[a.provider],
  email: a.email,
  name: a.name,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});

/** Daftar akun sosial milik pengguna yang sedang masuk. */
export async function listMyAccounts(deps: Deps, auth: AuthContext) {
  const [rows, user] = await Promise.all([deps.db.socialAccountsOfUser(auth.userId), deps.db.getUser(auth.userId)]);
  return {
    accounts: rows.map(publicView),
    passwordSet: user?.passwordSet ?? true,
    available: listProviders(deps).providers,
  };
}

/** Tautkan penyedia ke akun yang sedang masuk (dipakai dari portal). */
export async function linkMyAccount(deps: Deps, auth: AuthContext, provider: SocialProvider, input: { code: string; redirectUri?: string; codeVerifier?: string }) {
  const gw = ensureEnabled(deps, provider);
  if (auth.role !== "CUSTOMER") throw forbidden("Akun tim internal masuk memakai email dan kata sandi.");
  const profile = await gw.profileFromCode(provider, input);
  if (!profile.providerUserId) throw new AppError("UNAUTHORIZED", `Tidak bisa membaca akun ${PROVIDER_LABEL[provider]} Anda. Coba lagi.`);
  const existing = await deps.db.findSocialAccount(provider, profile.providerUserId);
  if (existing) {
    if (existing.userId === auth.userId) return publicView(existing);
    throw new AppError("CONFLICT", `Akun ${PROVIDER_LABEL[provider]} ini sudah dipakai oleh pengguna lain.`);
  }
  const mine = await deps.db.socialAccountsOfUser(auth.userId);
  if (mine.some((x) => x.provider === provider)) {
    throw new AppError("CONFLICT", `Anda sudah menautkan satu akun ${PROVIDER_LABEL[provider]}. Lepaskan dulu sebelum menautkan yang lain.`);
  }
  const row = await deps.db.createSocialAccount({
    userId: auth.userId,
    provider,
    providerUserId: profile.providerUserId,
    email: profile.emailVerified ? profile.email : null,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    lastLoginAt: null,
  });
  await audit(makeSvc(deps, auth), "auth.social.link", "User", auth.userId, `Menautkan akun ${PROVIDER_LABEL[provider]}`);
  return publicView(row);
}

/** Lepas tautan — dicegah bila itu satu-satunya cara masuk. */
export async function unlinkMyAccount(deps: Deps, auth: AuthContext, id: string) {
  const rows = await deps.db.socialAccountsOfUser(auth.userId);
  const row = rows.find((x) => x.id === id);
  if (!row) throw notFound("Akun tertaut");
  const user = await deps.db.getUser(auth.userId);
  if (rows.length === 1 && !user?.passwordSet) {
    throw new AppError("CONFLICT", "Setel kata sandi dulu — ini satu-satunya cara Anda masuk saat ini.");
  }
  await deps.db.deleteSocialAccount(row.id);
  await audit(makeSvc(deps, auth), "auth.social.unlink", "User", auth.userId, `Melepas tautan akun ${PROVIDER_LABEL[row.provider]}`);
  return { ok: true };
}
