import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { viteIngestMiddleware } from "./dev-server/ingest-middleware";

// Phase 7 spike (07-01) — Option A: @cloudflare/vite-plugin.
// The plugin runs /functions code in the real workerd runtime alongside the
// Vite SPA dev server. The A3 spike test confirmed it preserves the v1.0 SPA
// dev flow (Playwright webServer on :5173); 8/8 chromium green.
//
// ── 07-06 HYBRID CONTINGENCY adaptation (human-approved 2026-08-11) ──
// Per the 07-01 spike verdict, extraction (jsdom + DOMPurify + Readability)
// does NOT run on workerd — jsdom hard-crashes, linkedom's DOMPurify binding
// no-ops the sanitizer. The `functions/api/ingest.ts` Pages Function is the
// future-production shape; for Phase 7 dev + e2e, /api/ingest is served by
// `viteIngestMiddleware` below, which runs the full /server pipeline in
// Node (Vite's dev server runs in Node, so jsdom/DOMPurify/Readability all
// work natively). The IngestionClient's same-origin `fetch("/api/ingest")`
// hits the Vite middleware directly on :5173 — NO proxy needed.
//
// The two adapters (Cloudflare Pages Function + Vite middleware) share
// `server/ingestAdapter.ts` so they stay behaviorally identical. Only the
// I/O shape differs.
//
// 07-07 SSRF matrix note: the e2e targets `:5173/api/ingest` (this Node
// middleware), NOT `:8788/api/ingest` (workerd). safeFetch's ip-address
// validation covers all 9 OWASP measures on Node; `cf.resolveOverride` is
// silently ignored on Node (documented residual TOCTOU per T-7-04).
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      name: "lem-ingest-dev-middleware",
      configureServer: viteIngestMiddleware(),
    } as PluginOption,
  ],
});
