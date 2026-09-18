// Bundel demo in-browser menjadi satu file HTML mandiri.
// Butuh: esbuild & tailwindcss (tersedia sebagai devDependency proyek).
// Jalankan: node scripts/build-demo.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH ?? "esbuild");
const tailwindCli = process.env.TAILWIND_CLI ?? require.resolve("tailwindcss/lib/cli.js");
const out = resolve(root, "demo/dist");
mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [resolve(root, "demo/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  platform: "browser",
  tsconfig: resolve(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_DEMO_MODE": '"true"' },
  logLevel: "warning",
  logOverride: { "unsupported-directive": "silent" },
});
const js = result.outputFiles[0].text;

execFileSync(process.execPath, [tailwindCli, "-c", resolve(root, "tailwind.config.ts"), "-i", resolve(root, "src/app/globals.css"), "-o", resolve(out, "app.css"), "--minify"], {
  cwd: root,
  stdio: "inherit",
});
const css = readFileSync(resolve(out, "app.css"), "utf8");

const head = `<title>Bintaro Works OS</title>
<meta name="description" content="Business operating system untuk workspace & business services">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
<style>:root{--font-body:"Plus Jakarta Sans";--font-display:"Bricolage Grotesque";--font-mono:"JetBrains Mono"}html,body,#root{height:100%}</style>
<style>${css}</style>`;
const bodyInner = `<div id="root"></div>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;

// Versi lengkap untuk dibuka langsung di browser
const fullHtml = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${bodyInner}</body></html>`;
writeFileSync(resolve(out, "index.html"), fullHtml);
writeFileSync(resolve(out, "404.html"), fullHtml);
writeFileSync(resolve(out, ".nojekyll"), "");
// Versi fragmen (tanpa doctype/head/body) untuk dipublikasikan sebagai Artifact
writeFileSync(resolve(out, "artifact.html"), `${head}\n${bodyInner}\n`);

console.log(`Demo dibuat: demo/dist/index.html (${Math.round((js.length + css.length) / 1024)} KB)`);
