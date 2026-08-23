---
phase: 07-ingestion-substrate
plan: 06
subsystem: ingestion
tags: [cloudflare-pages, vite-dev-middleware, hybrid-contingency, ingestion-client, dexie-library-source, composite-repository, ingest-control, dexie-cascade, zod-revalidation, doc-06-voice, ssrf-guard]

# Dependency graph
requires:
  - phase: 07-ingestion-substrate
    provides: 07-05 server/ingest — the platform-agnostic 7-stage orchestrator the adapter + Vite middleware delegate to
  - phase: 07-ingestion-substrate
    provides: 07-02 ArticleSchema + IngestionRequest/Response envelope + IngestionFailureReasonEnum + Dexie v3 articles store with source/addedAt indexes
  - phase: 07-ingestion-substrate
    provides: 07-01 HYBRID CONTINGENCY spike verdict — extraction cannot run on workerd; the Vite Node dev middleware is the Phase 7 / 07-07 target
  - phase: 01-canonical-article-foundation
    provides: ArticleRepository interface + the inMemoryRepository the composite UNIONs with DexieLibrarySource
  - phase: 02-accessible-scrolling-reader
    provides: Dexie v1/v2 schema (the cascade-delete target — highlights/notes/location stores)
  - phase: 05-durable-highlights-and-notes
    provides: D5-12 cascade pattern (highlightsStore.ts L105-109) mirrored by DexieLibrarySource.remove
provides:
  - functions/api/ingest.ts — the future-shape Cloudflare Pages Function adapter (D7-05 adapter boundary; preserved per the 07-01 HYBRID CONTINGENCY with a clear PRODUCTION-FUTURE header comment)
  - server/ingestAdapter.ts — the shared body→ingest→response helper that BOTH adapters (Cloudflare Pages Function future + Vite Node dev middleware current) delegate to, so they are byte-identical in behavior
  - dev-server/ingest-middleware.ts — the Vite Node dev middleware that ACTUALLY serves POST /api/ingest for Phase 7 dev + e2e (jsdom/DOMPurify/Readability run natively in Node; the IngestionClient's same-origin fetch("/api/ingest") hits this directly on :5173 — no proxy)
  - vite.config.ts `lem-ingest-dev-middleware` plugin — wires viteIngestMiddleware() into Vite's configureServer hook
  - src/ingestion/IngestionClient.ts — ingestUrl/ingestHtml + IngestionError class; re-validates the network response through ArticleSchema.parse (STATE-04 defense-in-depth)
  - src/ingestion/LibrarySource.ts — DexieLibrarySource (list/open/save/has/remove with D5-12 cascade transaction); compositeLibraryRepository (UNION of fixtures + ingested; ingested wins on id collision)
  - src/ingestion/IngestControl.tsx — minimal URL + paste textarea control (D7-01) with four-state .status live region (D7-04 reuse) and mapReasonToCopy (T-7-26 jargon guard)
  - src/content/repository.ts swap — listArticles/openArticle now delegate to compositeLibraryRepository (D7-02); inMemoryRepository preserved
affects: [07-07]

# Tech tracking
tech-stack:
  added: []  # no new deps — the Vite Node middleware uses the existing /server stack + Vite's connect middleware API
  patterns:
    - "Vite dev middleware as Pages Function substitute: server.configureServer plugin installs a connect middleware that handles POST /api/ingest in Node when the production target runtime (workerd) can't run the dependency stack (jsdom here). Adapter helper (server/ingestAdapter.ts) is shared so both wrappers stay byte-identical."
    - "STATE-04 defense-in-depth on the network read path: IngestionClient.ingest re-validates the server response through ArticleSchema.parse even though the server already parsed at ingest time (07-05). The network is a trust boundary."
    - "Dexie cascade-delete transaction across four stores: db.transaction('rw', db.articles, db.highlights, db.notes, db.location, ...) collects highlightIds BEFORE deleting highlights so the notes cascade has the FK set; commits atomically or rolls back (T-7-29 mitigation)."
    - "Composite ArticleRepository UNION: compositeLibraryRepository iterates ingested first then fixtures with a seen-set; ingested wins on id collision (D7-07 — the reader's local library takes precedence over bundled fixtures)."
    - "mapReasonToCopy: every IngestionFailureReason → calm DOC-06 phrase; never surfaces internal jargon (fixture/Zod/schema/revision). A test guards regression (T-7-26)."
    - "Four-state ingest UI (idle | submitting | success | error) reusing the existing .status live region (D7-04 — zero new chrome: no red toasts, no modal wizard)."

key-files:
  created:
    - functions/api/ingest.ts
    - server/ingestAdapter.ts
    - dev-server/ingest-middleware.ts
    - src/ingestion/IngestionClient.ts
    - src/ingestion/LibrarySource.ts
    - src/ingestion/IngestControl.tsx
    - tests/unit/ingestion-client.test.ts
    - tests/unit/server/ingest-adapter.spec.ts
    - tests/component/IngestControl.test.tsx
  modified:
    - src/content/repository.ts
    - src/routes/FixtureList.tsx
    - vite.config.ts
    - tests/component/FixtureList.test.tsx

key-decisions:
  - "RUNTIME_GUARDRAIL HYBRID CONTINGENCY adaptation (human-approved 2026-08-11): the plan assumed /api/ingest runs on Cloudflare Pages (workerd). The 07-01 spike proved extraction can't run on workerd (jsdom MessagePort ReferenceError; linkedom-DOMPurify no-op). Approved adaptation: implement /api/ingest as a Vite Node dev middleware that runs the FULL pipeline (safeFetch + extractAndNormalize + slugify + parse + gate + confidence) locally for Phase 7 dev + e2e. The functions/api/ingest.ts Pages Function shape is PRESERVED as the production-future target with a clear PRODUCTION-FUTURE comment (D7-05). Both adapters share server/ingestAdapter.ts so the body→ingest→response contract is byte-identical across runtimes."
  - "07-07 SSRF matrix target shifts from :8788 (workerd) to :5173 (Vite Node middleware). safeFetch's ip-address validation covers all 9 OWASP measures on Node; cf.resolveOverride is silently ignored on Node (documented residual TOCTOU per T-7-04, acceptable, closed by a future Workers deploy). Forward note for the 07-07 executor: target the Vite middleware, NOT wrangler pages dev, for the SSRF integration matrix."
  - "DexieLibrarySource.remove collects highlightIds BEFORE deleting highlights. Within a Dexie transaction, reads see the in-transaction state — querying AFTER the highlights delete returns zero rows and the notes cascade orphans. Fixed in the GREEN commit after the cascade test surfaced it (Rule 1 deviation)."
  - "Composite repository: ingested wins on id collision. The merge iterates [ingestedList, fixtureList] with a seen-set so the first-seen (ingested) takes precedence. This is the D7-07 reader-local-library-wins invariant; the dedupe-refuse check (IngestControl's DexieLibrarySource.has BEFORE save) prevents the collision from ever happening in normal operation, but the composite's tiebreak is the defense-in-depth."
  - "FixtureList.test.tsx needed a minimal update: getByRole('status') → getAllByRole('status') because IngestControl now mounts its own .status region above the list's. Plan explicitly permits this. Existing assertions preserved."
  - "Button-name regex tightened in IngestControl.test.tsx: '/^add$/i' for the URL form vs '/add pasted article/i' for the paste form. The plan's '/add/i' regex matched both submit buttons. Same intent; more specific selector."
  - "requirements-completed: [ING-01, ING-02, ING-06]. ING-01 (URL ingestion) closes here: the full request flow URL → Vite middleware → server/ingest → Dexie → ArticleView is wired. ING-02 (paste end-to-end with UI) closes here: the paste textarea + ingestHtml path + DexieLibrarySource.save + navigation. ING-06 (honest three-state surfacing) closes here: IngestControl.mapReasonToCopy maps every IngestionFailureReason to a calm DOC-06 phrase in the existing .status region (zero new chrome per D7-04). ING-07 (mXSS) closed at 07-04; ING-08 (SSRF matrix) closes at 07-07."

patterns-established:
  - "Vite dev middleware as Pages Function substitute: when the production runtime (workerd) can't run a dependency stack, install a connect middleware in vite.config.ts configureServer that handles the endpoint in Node. The Pages Function shape is preserved as the future target; both wrappers share a server-side helper so behavior stays identical. This pattern is reusable for any future server-side endpoint that workerd can't host."
  - "Adapter helper extraction: the body→ingest→response logic lives in /server (server/ingestAdapter.ts); the runtime-specific I/O (Pages Function vs Vite middleware) lives in the wrappers. The helper is platform-agnostic and unit-testable in isolation."
  - "Cascade-delete ordering: collect FK ids BEFORE deleting the parent rows so the child cascade has the set. Within a Dexie transaction, post-delete reads return the post-delete state — a subtle bug source that the cascade test surfaces deterministically."
  - "Composite ArticleRepository: a one-line wrapper (compositeLibraryRepository) UNIONs N sources behind the unchanged module-level listArticles/openArticle. The D-08 forward-compat hook from Phase 1 is now load-bearing — Phase 8's library view can add a third source (markdown files) by widening the composite."

requirements-completed: [ING-01, ING-02, ING-06]

# Metrics
duration: 10min
completed: 2026-08-11
status: complete
---

# Phase 7 Plan 6: Edge Function Adapter + IngestionClient + DexieLibrarySource + Minimal Ingest UI Summary

**Shipped the reader-facing half of the ingestion pipeline: the future-shape Cloudflare Pages Function adapter (`functions/api/ingest.ts`), a Vite Node dev middleware that ACTUALLY serves POST /api/ingest for Phase 7 per the human-approved 07-01 HYBRID CONTINGENCY (extraction cannot run on workerd), the client glue (IngestionClient with STATE-04 ArticleSchema re-validation), the Dexie-backed repository swap (DexieLibrarySource + compositeLibraryRepository), and the minimal proof-form IngestControl (D7-01 — URL + paste textarea, four-state .status live region, D7-07 dedupe-refuse, T-7-26 jargon guard).**

## Performance

- **Duration:** 10 min wall-clock
- **Started:** 2026-08-11T12:59:19Z
- **Completed:** 2026-08-11T13:09:36Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 12 (6 created source, 3 created test, 3 modified)

## Accomplishments
- Implemented the full request-flow surface: `IngestControl` (D7-01 minimal proof form) → `IngestionClient` (POST /api/ingest) → Vite Node dev middleware (Phase 7 runtime, runs jsdom/DOMPurify/Readability natively) → `server/ingestAdapter.handleIngestBody` (shared body→ingest→response) → `server/ingest` (the 07-05 7-stage orchestrator) → `DexieLibrarySource.save` → `compositeLibraryRepository.list` (fixtures ∪ ingested) → existing `ArticleView` opens the ingested article unchanged (load-bearing invariant).
- Landed the D7-02 ArticleRepository swap: `listArticles`/`openArticle` in `src/content/repository.ts` now delegate to `compositeLibraryRepository`. Every existing caller (FixtureList L9, ArticleView L23) is byte-unchanged — the composite UNIONs in-memory fixtures with Dexie-persisted ingested rows transparently. This is the D-08 forward-compat hook from Phase 1 finally load-bearing.
- Honored the 07-01 HYBRID CONTINGENCY verdict (human-approved): extraction cannot run on workerd, so `/api/ingest` is served by a Vite Node dev middleware for Phase 7 dev + e2e. The Cloudflare Pages Function shape (`functions/api/ingest.ts`) is preserved as the production-future target with a clear PRODUCTION-FUTURE header comment. Both wrappers share `server/ingestAdapter.ts` so the body→ingest→response contract is byte-identical across runtimes.
- Shipped STATE-04 defense-in-depth on the network read path: `IngestionClient.ingest` re-validates the server response through `ArticleSchema.parse` even though the server already parsed at ingest time (07-05). The network is a trust boundary — a tampered or buggy server response is refused on the client read.
- Shipped D7-07 dedupe-refuse end-to-end: `IngestControl` calls `dexieLibrarySource.has(id)` BEFORE `save(article)`; if has returns true, the control surfaces "Already in your library." and refuses the re-ingest (no overwrite, no orphaned highlights — T-7-28 mitigation).
- Shipped D5-12 cascade-delete in `DexieLibrarySource.remove`: a single Dexie transaction across articles + highlights + notes + location collects highlightIds BEFORE deleting highlights (so the notes cascade has the FK set) and commits atomically or rolls back — T-7-29 mitigation.
- Shipped D7-04 zero-new-chrome honest-failure surfacing: `mapReasonToCopy` maps every IngestionFailureReason from the 11-reason catalog (07-02) to a calm DOC-06 phrase in the existing `.status` live region. No red toasts, no modal wizard, no internal jargon (T-7-26 jargon guard).

## Task Commits

Each task followed TDD RED → GREEN discipline (4 commits total):

1. **Task 1 RED: failing tests for IngestionClient + LibrarySource + adapter** — `fa582c8` (test)
2. **Task 1 GREEN: implement IngestionClient + LibrarySource + adapter** — `e7015a2` (feat)
3. **Task 2 RED: failing tests for IngestControl** — `7e48d5b` (test)
4. **Task 2 GREEN: implement IngestControl + mount in FixtureList** — `0cfe6f4` (feat)

**Plan metadata:** this commit (docs: complete edge-function-adapter + IngestionClient + DexieLibrarySource + minimal UI plan)

## Files Created/Modified
- `functions/api/ingest.ts` (created) — future-shape Cloudflare Pages Function onRequest(context) adapter; delegates to `server/ingestAdapter.handleIngestBody`; preserved per D7-05 with a PRODUCTION-FUTURE header comment documenting the HYBRID CONTINGENCY
- `server/ingestAdapter.ts` (created) — the shared body→ingest→response helper; 200 on ok:true, 400 on ok:false, 400 + server-error on non-object body
- `dev-server/ingest-middleware.ts` (created) — Vite Node dev middleware (the Phase 7 /api/ingest endpoint); POST handler parses JSON body, calls handleIngestBody, returns JSON with status; falls through to Vite's SPA handler for everything else
- `src/ingestion/IngestionClient.ts` (created) — `ingestUrl(url)`, `ingestHtml(html)`, `IngestionError` class; private `ingest(body)` POSTs to /api/ingest, parses IngestionResponse, throws IngestionError on ok:false, re-validates the article through ArticleSchema.parse (STATE-04)
- `src/ingestion/LibrarySource.ts` (created) — `DexieLibrarySource` class (list/open/save/has/remove with cascade), `dexieLibrarySource` singleton, `compositeLibraryRepository` (UNION of fixtures + ingested; ingested wins on id collision)
- `src/ingestion/IngestControl.tsx` (created) — minimal URL + paste textarea control; four-state .status live region; mapReasonToCopy; D7-07 dedupe-refuse via dexieLibrarySource.has BEFORE save
- `src/content/repository.ts` (modified) — listArticles/openArticle now delegate to compositeLibraryRepository (D7-02 swap); inMemoryRepository preserved; compositeLibraryRepository re-exported
- `src/routes/FixtureList.tsx` (modified) — imports + mounts `<IngestControl />` above the article `<ul>`; existing listArticles/useEffect/list-rendering byte-unchanged
- `vite.config.ts` (modified) — wires `viteIngestMiddleware()` as the `lem-ingest-dev-middleware` plugin in `plugins[]`; documents the HYBRID CONTINGENCY + the 07-07 SSRF target implication
- `tests/unit/ingestion-client.test.ts` (created) — 11 cases covering IngestionClient (success + failure + STATE-04 re-validation), DexieLibrarySource (save/has/list/open/remove cascade), compositeLibraryRepository (UNION + dedupe + open precedence)
- `tests/unit/server/ingest-adapter.spec.ts` (created) — 5 cases covering handleIngestBody (200 on ok, 400 on fail, server-error on bad body, paste path accepted)
- `tests/component/IngestControl.test.tsx` (created) — 12 cases covering the four-state UI, both submit paths, D7-07 dedupe-refuse, mapReasonToCopy (ssrf / fetch-failed / extraction-unsupported / unknown), T-7-26 jargon guard
- `tests/component/FixtureList.test.tsx` (modified) — `getByRole('status')` → `getAllByRole('status')` to accommodate IngestControl's .status region (plan permits minimal test update)

## Decisions Made
- **RUNTIME_GUARDRAIL HYBRID CONTINGENCY adaptation (human-approved 2026-08-11).** The plan assumed `/api/ingest` runs on Cloudflare Pages (workerd). The 07-01 spike proved extraction cannot run on workerd (jsdom hard-crashes on `MessagePort`; linkedom-DOMPurify no-ops the sanitizer). The human-approved adaptation: implement `/api/ingest` as a Vite Node dev middleware (Phase 7 prototype scope) that runs the FULL pipeline locally where jsdom/DOMPurify/Readability work natively; preserve `functions/api/ingest.ts` as the production-future Cloudflare shape with a clear comment. Both wrappers share `server/ingestAdapter.ts` so the two are behaviorally identical — only the I/O shape differs.
- **07-07 SSRF matrix target shifts from :8788 to :5173.** The SSRF integration matrix runs against the Vite Node middleware (`http://localhost:5173/api/ingest`), NOT `wrangler pages dev` (:8788). safeFetch's ip-address validation covers all 9 OWASP measures on Node; `cf.resolveOverride` is silently ignored on Node (documented residual TOCTOU per T-7-04, acceptable, closed by a future Workers deploy). `wrangler pages dev` is NOT removed from playwright.config.ts — 07-07 may still use it for specific tests, but the primary ingestion endpoint is the Vite middleware.
- **DexieLibrarySource.remove collects highlightIds BEFORE deleting highlights.** Within a Dexie transaction, reads see the in-transaction state — querying AFTER the highlights delete returns zero rows and the notes cascade orphans. The cascade test surfaced this bug deterministically (Rule 1 deviation).
- **Composite repository tiebreak: ingested wins on id collision.** The merge iterates `[ingestedList, fixtureList]` with a seen-set, so first-seen (ingested) takes precedence. D7-07 reader-local-library-wins invariant. In normal operation the IngestControl's has() check prevents the collision from ever happening; the composite tiebreak is defense-in-depth.
- **`listArticles`/`openArticle` use `.bind(compositeLibraryRepository)`.** The composite's methods reference the module-level singleton's internal `dexieLibrarySource`; binding preserves `this`-independent call semantics so `listArticles()` works without the caller having to know about the composite object.
- **No REFACTOR commit needed.** Both implementations are already clean: single-purpose functions, exhaustive comments tying each block to its must_have/decision citation, no dead code. Per TDD discipline REFACTOR is optional and committed only if changes are made.
- **requirements-completed: [ING-01, ING-02, ING-06].** ING-01 (URL ingestion) closes here — the full URL → middleware → server pipeline → Dexie → ArticleView flow is wired and the unit/component suite proves it. ING-02 (paste end-to-end with UI) closes here — the paste textarea + ingestHtml + save + navigation path is wired. ING-06 (honest three-state surfacing via the existing .status region per D7-04) closes here — every IngestionFailureReason has a calm DOC-06 phrase; the T-7-26 jargon guard test prevents regression. ING-07 closed at 07-04 (mXSS suite); ING-08 closes at 07-07 (SSRF matrix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] functions/api/ingest.ts cannot run extraction on workerd (07-01 HYBRID CONTINGENCY)**
- **Found during:** Task 1 GREEN (designing the adapter)
- **Issue:** The plan assumed the Cloudflare Pages Function runs the full pipeline. The 07-01 spike (human-approved 2026-08-11) proved jsdom hard-crashes on workerd (`ReferenceError: MessagePort is not defined`) and linkedom's DOMPurify binding no-ops the sanitizer (mXSS gate fails). Extraction MUST run on Node.
- **Fix:** Per the RUNTIME_GUARDRAIL_HYBRID_CONTINGENCY directive (human-approved), added (a) `server/ingestAdapter.ts` — the shared body→ingest→response helper, (b) `dev-server/ingest-middleware.ts` — the Vite Node dev middleware that ACTUALLY serves POST /api/ingest for Phase 7 dev + e2e, (c) `vite.config.ts` wiring for the middleware, (d) a clear PRODUCTION-FUTURE header comment in `functions/api/ingest.ts` documenting the situation. The Cloudflare Pages Function shape is preserved (D7-05 adapter boundary) so a future production deploy only needs a Node-capable host or the D7-10 Workers-fetch/Node-extraction split. Both adapters delegate to the shared helper so they are behaviorally identical.
- **Files modified:** functions/api/ingest.ts (created with the PRODUCTION-FUTURE comment), server/ingestAdapter.ts (created), dev-server/ingest-middleware.ts (created), vite.config.ts (modified to wire the middleware)
- **Verification:** `npx tsc --noEmit` → exit 0; the existing server/ingest suite (91 tests) passes unchanged because the adapter helper is a thin delegate; the IngestionClient's same-origin `fetch("/api/ingest")` works against the Vite middleware on :5173 with no proxy.
- **Committed in:** e7015a2 (Task 1 GREEN commit)

**2. [Rule 1 - Bug] DexieLibrarySource.remove cascade queried highlights AFTER deleting them**
- **Found during:** Task 1 GREEN (the cascade test failed on the first GREEN run)
- **Issue:** The plan's pseudocode ordered the operations as `delete articles → delete highlights → query highlightIds → delete notes → delete location`. Within a Dexie transaction, reads see the in-transaction state — querying highlights AFTER the delete returns zero rows, so `highlightIds` is empty and the notes cascade orphans. The test `remove deletes the article row AND cascades to highlights/notes/location` caught this deterministically (n-1 row remained).
- **Fix:** Reordered: `collect highlightIds → delete articles → delete highlights → delete notes (by collected ids) → delete location`. The collection happens BEFORE the delete so the FK set is populated. Single-line semantic change.
- **Files modified:** src/ingestion/LibrarySource.ts
- **Verification:** `npx vitest run tests/unit/ingestion-client.test.ts` → 11/11 green; the cascade test now asserts all 4 stores (articles + highlights + notes + location) are empty after remove.
- **Committed in:** e7015a2 (Task 1 GREEN commit)

**3. [Rule 1 - Bug] IngestControl.test.tsx button-name regex matched both submit buttons**
- **Found during:** Task 2 GREEN (the test failed: "Found multiple elements with the role 'button' and name `/add/i`")
- **Issue:** The plan's `getByRole("button", { name: /add/i })` regex matches both "Add" (URL form) and "Add pasted article" (paste form). The two submit buttons have overlapping names.
- **Fix:** Tightened the regex to `/^add$/i` (exact match on "Add") for the URL-form button. The paste-form test uses `pasteForm.requestSubmit()` so it doesn't need a button-name lookup.
- **Files modified:** tests/component/IngestControl.test.tsx
- **Verification:** `npx vitest run tests/component/IngestControl.test.tsx` → 12/12 green.
- **Committed in:** 0cfe6f4 (Task 2 GREEN commit)

**4. [Rule 3 - Blocking] FixtureList.test.tsx getByRole('status') found two regions after IngestControl mount**
- **Found during:** Task 2 GREEN (the FixtureList test failed after the mount)
- **Issue:** The plan's acceptance criteria explicitly anticipated this: "FixtureList.test.tsx may need a small update to account for the new IngestControl mount." IngestControl has its own `.status` region; `getByRole('status')` now finds two.
- **Fix:** `getByRole('status')` → `getAllByRole('status')` with `.length >= 1`. Minimal change; existing assertions preserved.
- **Files modified:** tests/component/FixtureList.test.tsx
- **Verification:** `npx vitest run tests/component/FixtureList.test.tsx` → 5/5 green; existing listArticles/error/empty-state assertions unchanged.
- **Committed in:** 0cfe6f4 (Task 2 GREEN commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 2 Rule 3 blockers)
**Impact on plan:** All auto-fixes necessary for correct cascade semantics, runtime adaptation (the HYBRID CONTINGENCY is the human-approved path), and test hygiene. No scope creep — every change is in service of the plan's must_haves truths + the documented HYBRID CONTINGENCY verdict.

## Issues Encountered
- The cascade-delete ordering was the only non-trivial bug. The Dexie transaction semantics (in-transaction reads see post-delete state) is a subtle source of bugs; the cascade test caught it deterministically. Reordering collection before deletion is the canonical fix.
- The Cloudflare Pages Function runtime mismatch (workerd can't host jsdom) is the documented 07-01 HYBRID CONTINGENCY — not a bug, but a runtime adaptation the RUNTIME_GUARDRAIL directed. The shared adapter helper (server/ingestAdapter.ts) is the structural answer: both wrappers are byte-identical in behavior, only the I/O shape differs.

## TDD Gate Compliance

Both tasks executed as `type="auto" tdd="true"` per the plan. Git log shows the mandatory RED → GREEN sequence for both tasks:

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 07-06 Task 1 | ✓ fa582c8 | ✓ e7015a2 | — | Pass |
| 07-06 Task 2 | ✓ 7e48d5b | ✓ 0cfe6f4 | — | Pass |

RED tests failed for the right reasons (`Failed to resolve import` for Task 1 — the modules didn't exist; `Failed to resolve import "../../src/ingestion/IngestControl"` for Task 2 — the component didn't exist). GREEN tests pass minimally — no premature optimization. No REFACTOR needed (both implementations are already clean).

## Threat Surface Scan

No new security-relevant surface beyond what the plan's `<threat_model>` documents. Every threat has a corresponding mitigation in the shipped code AND at least one assertion in the test suite:

- **T-7-25 (Tampering, malformed IngestionResponse from server):** `IngestionClient.ingest` re-validates the response through `ArticleSchema.parse`. Proven by the test `re-validates the server response through ArticleSchema.parse (STATE-04)` which feeds a malformed article (missing Provenance.title) and asserts the client throws.
- **T-7-26 (Tampering, refusal copy leaks internal jargon):** `mapReasonToCopy` maps every IngestionFailureReason to a calm DOC-06 phrase. Proven by the test `does NOT leak internal jargon (fixture / Zod / schema / revision) in refusal copy` which greps the .status region's textContent.
- **T-7-28 (Tampering, re-ingest overwrites article + orphans highlights):** `IngestControl` calls `dexieLibrarySource.has(id)` BEFORE save; refuses with "Already in your library." if has returns true. Proven by the test `refuses re-ingest via DexieLibrarySource.has with 'Already in your library.' (D7-07)`.
- **T-7-29 (Info Disclosure, cascade-delete misses highlights/notes/locations):** `DexieLibrarySource.remove` runs a Dexie transaction across all four stores. Proven by the test `remove deletes the article row AND cascades to highlights/notes/location`.
- **T-7-27 (Repudiation, reader submits URL claims they didn't) + T-7-30 (DoS, infinite URLs):** both ACCEPTED in the plan's threat model — stateless backend, no per-identity quota in Phase 7 (acceptable for a local-first prototype).

The 07-07 SSRF integration matrix will exercise T-7-04 (the documented residual TOCTOU on Node where `cf.resolveOverride` is silently ignored) against the Vite Node middleware — the forward note in this SUMMARY flags the target shift.

## Forward Note for 07-07

**SSRF integration matrix target:** the e2e should target `:5173/api/ingest` (the Vite Node middleware), NOT `:8788/api/ingest` (workerd). safeFetch's `ip-address` validation runs natively on Node and covers all 9 OWASP measures; `cf.resolveOverride` is silently ignored on Node (the documented T-7-04 residual TOCTOU — acceptable for the prototype, closed by a future Workers deploy that splits Workers-fetch from Node-extraction per D7-10). `wrangler pages dev` is NOT removed from `playwright.config.ts` — keep it available for any test that specifically needs the workerd runtime (e.g. the spike-jsdom-workers regression spec from 07-01). The 07-07 plan does NOT need changes — only the runtime target shifts from :8788 to :5173.

## Next Phase Readiness
- **Wave 4 complete for 07-06.** The reader-facing half of the ingestion pipeline is shipped. The Cloudflare adapter shape is preserved (D7-05); the Vite Node middleware actually serves the endpoint for Phase 7. The composite repository swap is invisible to callers — FixtureList + ArticleView read through compositeLibraryRepository without code changes. The IngestControl delivers D7-01 (minimal proof form) + D7-04 (.status reuse) + D7-07 (dedupe-refuse) + D7-08 (paste omits sourceUrl — the ArticleView conditional landed at 07-02).
- **07-07 (four phase-exit gates):** All four gates are now ready to run together. SC#1 (round-trip anchor gate) is GREEN (07-05). SC#4 (mXSS suite) is GREEN (07-04). SC#3 (SSRF integration matrix) runs against `:5173/api/ingest` — the Vite Node middleware that this plan shipped. SC#5 (Dexie v1→v3 migration snapshot) runs against real IndexedDB — the v3 append landed at 07-02. The 07-07 executor should consult this SUMMARY's "Forward Note for 07-07" section before designing the SSRF matrix.

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: functions/api/ingest.ts
- FOUND: server/ingestAdapter.ts
- FOUND: dev-server/ingest-middleware.ts
- FOUND: src/ingestion/IngestionClient.ts
- FOUND: src/ingestion/LibrarySource.ts
- FOUND: src/ingestion/IngestControl.tsx
- FOUND: src/content/repository.ts (modified)
- FOUND: src/routes/FixtureList.tsx (modified)
- FOUND: vite.config.ts (modified)
- FOUND: tests/unit/ingestion-client.test.ts
- FOUND: tests/unit/server/ingest-adapter.spec.ts
- FOUND: tests/component/IngestControl.test.tsx
- FOUND: tests/component/FixtureList.test.tsx (modified)
- FOUND: .planning/phases/07-ingestion-substrate/07-06-SUMMARY.md

**Commits verified in git log:**
- FOUND: fa582c8 (Task 1 RED — failing tests for IngestionClient + LibrarySource + adapter)
- FOUND: e7015a2 (Task 1 GREEN — implement IngestionClient + LibrarySource + adapter)
- FOUND: 7e48d5b (Task 2 RED — failing tests for IngestControl)
- FOUND: 0cfe6f4 (Task 2 GREEN — implement IngestControl + mount in FixtureList)

**Verification gates:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run` (unit + server + component) → 666 passed / 7 skipped (spike) / 0 failed across 51 files
- All 16 Task 1 acceptance criteria greps pass (onRequest=1, /server/ingest import=1, ingestUrl=4≥1, ingestHtml=4≥1, ArticleSchema.parse=5≥1, class DexieLibrarySource=1, async save=1, async has=1, async remove=1, db.transaction=1≥1, compositeLibraryRepository in LibrarySource=6≥1, compositeLibraryRepository in repository=8≥1, inMemoryRepository preserved=2≥1, listArticles/openArticle delegate to composite verified via git diff)
- All 11 Task 2 acceptance criteria pass (export function IngestControl=1, role="status"=1≥1, ingestUrl=2≥1, ingestHtml=2≥1, dexieLibrarySource.has=1≥1, dexieLibrarySource.save=1≥1, window.location.hash=2≥1, mapReasonToCopy=6≥1, `<IngestControl` in FixtureList=1≥1, existing listArticles/useEffect/list-rendering byte-unchanged verified via git diff, tsc=0, vitest green)

---
*Phase: 07-ingestion-substrate*
*Completed: 2026-08-11*
