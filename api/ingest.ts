// api/ingest.ts
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
// A repo-root `api/ingest.ts` file auto-serves at /api/ingest on Vercel's
// DEFAULT Node.js runtime — never opt into edge (jsdom requires Node). The
// handler is the current-docs module-object web-standard form: a default
// export whose `fetch(request)` returns a `Response`. Zero npm dependencies
// — no @vercel/node import (that package only supplies
// VercelRequest/VercelResponse typings, which the web-standard form
// avoids). Vercel bundles api/ functions with its own esbuild-based
// bundler at deploy time; jsdom + isomorphic-dompurify + Readability bundle
// fine, and safeFetch's node:dns + ip-address SSRF pipeline runs with full
// Node API coverage (T-Q1-01 inherited mitigation, unchanged code path).
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
// The deploy itself is USER-RUN (locked decision 4): `npx vercel login`
// (interactive browser flow) then `npm run deploy:vercel`. The agent
// prepares everything but never deploys and never attempts login.
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
