import type { Config } from "tailwindcss";

// Warna memakai CSS variable (lihat src/app/globals.css) agar tema terang/gelap
// cukup ditukar di satu tempat, tanpa varian dark: di setiap komponen.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: token("ground"),
        surface: token("surface"),
        raised: token("raised"),
        line: token("line"),
        ink: token("ink"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-ink": token("accent-ink"),
        "accent-soft": token("accent-soft"),
        brass: token("brass"),
        side: token("side"),
        "side-ink": token("side-ink"),
        "side-muted": token("side-muted"),
        good: token("good"),
        "good-soft": token("good-soft"),
        warn: token("warn"),
        "warn-soft": token("warn-soft"),
        bad: token("bad"),
        "bad-soft": token("bad-soft"),
        info: token("info"),
        "info-soft": token("info-soft"),
      },
      fontFamily: {
        sans: ["var(--font-body)", "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Bricolage Grotesque", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
      },
      boxShadow: {
        pop: "0 12px 32px -12px rgb(var(--shadow) / 0.28), 0 2px 6px -2px rgb(var(--shadow) / 0.12)",
        soft: "0 1px 2px rgb(var(--shadow) / 0.06)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.97)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-up": "fade-up .18s ease-out",
        "scale-in": "scale-in .16s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
