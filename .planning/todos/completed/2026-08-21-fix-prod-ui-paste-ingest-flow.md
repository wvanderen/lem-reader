---
created: 2026-08-21T22:50:12.362Z
title: Fix prod UI paste-ingest flow (endpoint verified, client flow fails)
area: general
files:
  - src/ingestion/IngestControl.tsx:161-209
  - src/ingestion/IngestionClient.ts:59-77
  - src/ingestion/IngestControl.tsx:42-100
---

## Problem

On the Vercel prod deployment (https://lem-reader.vercel.app, deployment `lem-reader-ff0in0u56`, post vercel-ingest-500 fix), the **paste-HTML ingest flow in the UI fails** (user saw 400-class failures "even with valid content"). The URL-ingest flow works in the same UI.

Critical boundary fact — **the server endpoint is NOT the problem**: `curl -X POST https://lem-reader.vercel.app/api/ingest` with `{"html": "<full Wikipedia article HTML>"}` returns `200 ok:true` (verified 2026-08-21 after the fix). Malformed JSON correctly returns `400 {"ok":false,"reason":"server-error"}`. So the defect lives in the client flow: what the browser sends, how big it is, or how the response is handled.

Unverified suspects (check in this order):

1. **Paste content shape**: a `<textarea>` receives plain text. Copying an article from a browser page and pasting gives rendered plain text, NOT HTML source — Readability then rejects the fragment → server returns honest `400 extraction-unsupported` → UI shows calm refusal copy. If the user pasted View-Source HTML and still failed, this is eliminated.
2. **Body size**: Vercel's ~4.5MB request-body cap binds before our `MAX_INGEST_BODY_BYTES` (~13.3MB; documented residual in quick task 260821-k6z). Large pastes → 413 → client catch-all → "server-error" copy.
3. **Client-side failure before/at fetch**: IngestionClient envelope re-validation (Zod `ArticleSchema.parse`), or a non-IngestionError throw landing in the catch-all (IngestControl.tsx:187-196).

Discriminating evidence to capture first during repro (browser DevTools on prod):
- The exact calm copy shown — `mapReasonToCopy` (IngestControl.tsx:42-100) maps each reason to distinct copy; the message identifies the branch (`extraction-unsupported` vs `server-error` vs `already-in-library`).
- Network tab: POST /api/ingest status code + request payload size + the response body reason field.

## Solution

TBD pending repro evidence. Likely directions:
- If suspect 1: UX affordance — detect non-HTML paste (no tags) and guide ("Paste the page's HTML source, not rendered text"), or run a more forgiving fragment-extraction path server-side.
- If suspect 2: client-side pre-flight size check with honest copy before POSTing >4.5MB; document blob-upload bypass as future work.
- If suspect 3: fix the client bug; extend tests/unit/server/vercel-ingest-endpoint.spec.ts + the IngestControl unit specs to cover the failing branch.

Dev-vs-prod note: dev (Vite middleware :5173) reportedly works for the same flow — if true, diff what dev sends vs prod (payload identical ⇒ lean toward size/runtime suspects; different ⇒ content-shape suspect).
