// functions/api/ingest.ts
// PRODUCTION-FUTURE: This Cloudflare Pages Function shape is preserved per
// D7-05 (the adapter boundary — only this file knows about Cloudflare), but
// extraction (jsdom + DOMPurify + Readability) does NOT run on workerd per
// the 07-01 spike (HYBRID CONTINGENCY, human-approved 2026-08-11). jsdom
// hard-crashes (`ReferenceError: MessagePort is not defined`); linkedom's
// DOMPurify binding no-ops the sanitizer (the mXSS gate fails). For Phase 7
// dev + e2e, /api/ingest is served by a Vite dev middleware running in Node
// (see vite.config.ts `server.configureServer` + dev-server/ingest-middleware.ts)
// where jsdom/DOMPurify/Readability all work natively. A future production
// deploy needs either a Node-capable host OR the D7-10 Workers-fetch /
// Node-extraction split.
//
// Both wrappers share the body→ingest→response helper in
// `server/ingestAdapter.ts` so the two are byte-identical in behavior. Only
// the I/O shape differs: the Pages Function reads `context.request.json()`
// and returns a `Response.json(body, { status })`; the Vite middleware reads
// the raw request body and writes `res.statusCode + res.json(body)`.
//
// Porting to Vercel/Netlify changes ONLY this file (D7-05).
import type { PagesFunction } from "@cloudflare/workers-types";
import { handleIngestBody } from "../../server/ingestAdapter";
import type { IngestionResponse } from "../../src/ingestion/types";

export const onRequest: PagesFunction = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json(
      { ok: false, reason: "server-error" } satisfies IngestionResponse,
      { status: 400 },
    );
  }
  const { status, body: responseBody } = await handleIngestBody(body);
  return Response.json(responseBody, { status });
};
