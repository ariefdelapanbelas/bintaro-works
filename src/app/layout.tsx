import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bintaro Works OS", template: "%s · Bintaro Works OS" },
  description: "Business operating system untuk workspace & business services",
  applicationName: "Bintaro Works",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/bintaro-works-icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Bintaro Works", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1210" },
  ],
};

// Terapkan preferensi tema sebelum render agar tidak berkedip.
const themeScript = `try{var t=localStorage.getItem("bwos-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

// Daftarkan service worker agar aplikasi bisa dipasang di layar utama HP (PWA).
// Hanya di konteks aman (https / localhost); SW-nya sendiri tidak meng-cache HTML atau /api.
const swScript = `if("serviceWorker"in navigator&&window.isSecureContext){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${body.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
