// dev-server/ingest-middleware.ts
// Plan 07-06 — the Vite dev middleware that actually serves POST /api/ingest
// for Phase 7 dev + e2e. Per the 07-01 spike verdict (HYBRID CONTINGENCY,
// human-approved 2026-08-11), extraction (jsdom + DOMPurify + Readability)
// does NOT run on workerd — jsdom hard-crashes (`MessagePort is not defined`)
// and linkedom's DOMPurify binding no-ops the sanitizer (mXSS gate fails).
// Vite's dev server runs in Node, so the full /server pipeline runs
// natively. The IngestionClient's same-origin `fetch("/api/ingest")` hits
// this middleware directly on :5173 — NO proxy needed.
//
// This middleware is the Phase 7 dev/e2e adapter. The future-production
// Cloudflare Pages Function shape is preserved in `functions/api/ingest.ts`
// per D7-05; both wrappers delegate to the same `handleIngestBody` helper
// (server/ingestAdapter.ts) so they stay behaviorally identical.
//
// 07-07 SSRF matrix implication: the SSRF e2e targets `:5173/api/ingest`
// (this Node middleware), NOT `:8788/api/ingest` (workerd). safeFetch's
// ip-address validation covers all 9 OWASP measures on Node;
// `cf.resolveOverride` is silently ignored on Node (documented residual
// TOCTOU per T-7-04, acceptable, closed by a future Workers deploy).
import type { ViteDevServer, Connect } from "vite";
import { handleIngestBody } from "../server/ingestAdapter";
import type { IngestionResponse } from "../src/ingestion/types";

/**
 * Read the request body as a UTF-8 string. Returns "" if the request has no
 * body (the adapter helper turns it into a server-error 400).
 */
function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * viteIngestMiddleware — returns a Vite `configureServer` hook that installs
 * a connect middleware intercepting POST /api/ingest. The middleware runs the
 * full ingestion pipeline in Node and returns the IngestionResponse as JSON.
 * All other requests fall through to Vite's default handler (the SPA bundle).
 *
 * Vite's `configureServer(server)` hook receives the `ViteDevServer` instance;
 * the connect middleware stack lives at `server.middlewares`. We install the
 * handler synchronously inside the hook body so it runs BEFORE Vite's
 * built-in middleware fallback (the SPA static handler) — POST /api/ingest
 * is intercepted on the way in, every other request calls next() and reaches
 * the SPA bundle as usual.
 *
 * Usage in vite.config.ts:
 *
 *   plugins: [{ name: "lem-ingest-dev-middleware", configureServer: viteIngestMiddleware() }]
 */
export function viteIngestMiddleware(): (server: ViteDevServer) => void {
  return (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? "";
      // Match POST /api/ingest exactly. (Vite normalizes the SPA dev server
      // to one origin on :5173, so the client's `fetch("/api/ingest")`
      // arrives here directly — no proxy.)
      if (req.method !== "POST" || !url.split("?")[0].endsWith("/api/ingest")) {
        return next();
      }

      let body: unknown;
      try {
        const raw = await readBody(req);
        body = raw.length === 0 ? null : JSON.parse(raw);
      } catch {
        // JSON.parse failure — surface as the typed server-error envelope.
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ ok: false, reason: "server-error" } satisfies IngestionResponse),
        );
        return;
      }

      const { status, body: responseBody } = await handleIngestBody(body);
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(responseBody));
    });
  };
}
