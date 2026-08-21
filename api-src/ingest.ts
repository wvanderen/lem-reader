// api-src/ingest.ts — esbuild ENTRY; bundles to api/ingest.js (build:api).
// PRODUCTION — Quick task 260821-k6z. This is the D7-05 adapter-boundary
// port to Vercel: the production host moved off Cloudflare workerd per the
// 07-01 spike verdict (HYBRID CONTINGENCY, human-approved 2026-08-11) —
// jsdom hard-crashes on workerd (`ReferenceError: MessagePort is not
// defined`) and linkedom's DOMPurify binding no-ops the sanitizer (mXSS
// gate fails). Vercel Node functions run the extraction pipeline (jsdom +
// isomorphic-dompurify + Readability) natively, which is the whole reason
// for the host move (locked decision 1). Ingestion MUST work in production,
// so this port ships in the same change as the deploy prep (locked
// decision 2).
//
// THIS FILE is the esbuild entry (source), not the deployed file: it lives
// in `api-src/`, and `npm run build:api` bundles it (with ALL relative
// imports inlined) into `api/ingest.js` — gitignored build output that
// Vercel serves at /api/ingest on the DEFAULT Node.js runtime — never opt
// into edge (jsdom requires Node). The handler is the current-docs
// module-object web-standard form: a default export whose `fetch(request)`
// returns a `Response`. Zero npm dependencies — no @vercel/node import
// (that package only supplies VercelRequest/VercelResponse typings, which
// the web-standard form avoids).
//
// WHY FULLY PRE-BUNDLED (debug session vercel-ingest-500, 2026-08-21, fix 2):
// @vercel/node transpiles each traced TS file INDIVIDUALLY — it does not
// bundle relative imports. An extensionless relative specifier (the original
// `../server/ingestAdapter` import) survived into the emitted JS verbatim,
// and under `"type": "module"` Node ESM requires explicit extensions on
// relative imports (no CJS-style probing) → ERR_MODULE_NOT_FOUND at cold
// start → every /api/ingest request 500s (9× in prod logs, first deploy).
// Fix 1 (esbuild --packages=external) fixed that but regressed in prod: the
// function then resolved bare imports at RUNTIME against @vercel/nft's
// TRACED node_modules subset, where CJS `html-encoding-sniffer` (jsdom dep)
// require()s `@exodus/bytes/encoding-lite.js` — an ESM-only subpath (no
// `require` export condition) → ERR_REQUIRE_ESM cold-start crash. Fix 2
// bundles node_modules INTO api/ingest.js itself: esbuild resolves the
// CJS↔ESM seam at BUILD time via its interop shims, so runtime module
// resolution is eliminated entirely. Only jsdom's optional `canvas`
// native module stays `--external` (not installed; jsdom's try/catch
// degrade path handles the failed require). safeFetch's node:dns +
// ip-address SSRF pipeline runs with full Node API coverage
// (T-Q1-01 inherited mitigation, unchanged code path). LESSON from fix 1:
// verify packaged output in ISOLATION (no repo node_modules reachable) —
// a smoke run from the repo root masks traced-subset divergence.
//
// The Cloudflare spike/adapter artifacts STAY in-repo untouched per locked
// decision 3: `functions/api/ingest.ts` (the Pages Function shape) +
// `wrangler.toml` remain the documented workerd evidence. All THREE
// wrappers — the Cloudflare Pages Function, the Vite dev middleware
// (dev-server/ingest-middleware.ts, the Phase 7+ dev/e2e path), and this
// file — share the SAME `server/ingestAdapter.ts` helper, so the
// body-parse → delegate → status-map contract is byte-identical across all
// three runtimes. Only the I/O shape differs (D7-05: porting to
// Vercel/Netlify changes ONLY the adapter file).
//
// KNOWN PLATFORM RESIDUAL (T-Q1-02, accepted + documented): Vercel enforces
// a 4.5MB request-body cap (413 FUNCTION_PAYLOAD_TOO_LARGE) that binds
// BEFORE our own MAX_INGEST_BODY_BYTES (~13.3MB) — binary ingests (PDF/
// EPUB base64-in-JSON) over ~3.4MB decoded surface the platform refusal,
// which IngestionClient's catch-all maps to the same calm server-error
// copy the client already shows for transport failures. The blob-upload
// bypass (Vercel KB "bypass body size limit") is explicitly out of scope
// for this minimal deploy.
//
// The deploy runs via `npm run deploy:vercel` (locked decision 4: prod
// deploys go through the user's authenticated CLI — the agent may run it
// only on explicit user authorization, as granted in the vercel-ingest-500
// reopen).
import { handleIngestBody } from "../server/ingestAdapter";
import type { IngestionResponse } from "../src/ingestion/types";

export default {
  fetch: async (request: Request): Promise<Response> => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { ok: false, reason: "server-error" } satisfies IngestionResponse,
        { status: 400 },
      );
    }
    const { status, body: responseBody } = await handleIngestBody(body);
    return Response.json(responseBody, { status });
  },
};
