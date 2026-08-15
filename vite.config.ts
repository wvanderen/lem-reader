import { readFileSync } from "node:fs";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { viteIngestMiddleware } from "./dev-server/ingest-middleware";

// Phase 9 (D9-04 / 09-RESEARCH A3) — the export bundle's diagnostic-only
// appVersion field. The version is read from package.json AT CONFIG LOAD
// (the config runs in Node, so node:fs is available here — never inside
// src/). The identifier `__APP_VERSION__` is define-replaced at build time;
// `src/vite-env.d.ts` declares it for TypeScript. bundle.ts's
// resolveAppVersion() guards with typeof so unit tests (no define) get
// "dev" instead of a ReferenceError.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// ── 07-06 HYBRID CONTINGENCY adaptation (human-approved 2026-08-11) ────────
// Per the 07-01 spike verdict, extraction (jsdom + DOMPurify + Readability)
// does NOT run on workerd — jsdom hard-crashes (`ReferenceError: MessagePort
// is not defined` from undici→whatwg-url), and linkedom's DOMPurify binding
// no-ops the sanitizer (mXSS gate fails). The `functions/api/ingest.ts` Pages
// Function is preserved as the future-production shape (D7-05); for Phase 7
// dev + e2e, /api/ingest is served by `viteIngestMiddleware` below, which
// runs the full /server pipeline in Node (Vite's dev server runs in Node, so
// jsdom/DOMPurify/Readability all work natively). The IngestionClient's
// same-origin `fetch("/api/ingest")` hits the Vite middleware directly on
// :5173 — NO proxy needed.
//
// The two adapters (Cloudflare Pages Function + Vite middleware) share
// `server/ingestAdapter.ts` so they stay behaviorally identical. Only the
// I/O shape differs.
//
// 07-07 Rule 3 blocker fix: the `cloudflare()` plugin from @cloudflare/
// vite-plugin was REMOVED. The plugin bundled /functions/* (and their
// transitive deps incl undici) into a workerd worker at dev-server startup,
// which crashed with the same MessagePort ReferenceError the 07-01 spike
// documented. Phase 7 dev/e2e doesn't need workerd — the Vite Node middleware
// serves the only runtime endpoint (/api/ingest) — so the plugin is dead
// weight that crashes the dev server. The `wrangler pages dev` webServer
// entry in playwright.config.ts is preserved (harmless; the spike-jsdom-
// workers regression spec skips gracefully when workerd is unreachable, and
// 07-07 may use it for workerd-specific cases if needed in the future).
//
// 07-07 SSRF matrix note: the e2e targets `:5173/api/ingest` (this Node
// middleware), NOT `:8788/api/ingest` (workerd). safeFetch's ip-address
// validation covers all 9 OWASP measures on Node; `cf.resolveOverride` is
// silently ignored on Node (documented residual TOCTOU per T-7-04).
export default defineConfig({
  plugins: [
    react(),
    {
      name: "lem-ingest-dev-middleware",
      configureServer: viteIngestMiddleware(),
    } as PluginOption,
  ],
  define: {
    // Phase 9 (D9-04 / A3): diagnostic-only appVersion — single-sourced from
    // package.json at config load, never a hardcoded copy.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
