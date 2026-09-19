// Simulasi penyedia login sosial untuk demo in-browser.
// Tidak ada jaringan: "authorization code" berisi profil yang dipilih pengguna
// di layar simulasi. Logika penautan akun yang dijalankan tetap logika asli.
import type { SocialProvider } from "@/core/domain/types";
import type { SocialGateway, SocialProfile } from "@/core/services/oauth";

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
