---
phase: 07-ingestion-substrate
plan: 05
subsystem: infra
tags: [pipeline-orchestrator, round-trip-anchor-gate, sc1-gate, zod-boundary, ingestion, tdd, three-state-confidence, id-immutability]

# Dependency graph
requires:
  - phase: 07-ingestion-substrate
    provides: 07-03 safeFetch + deriveConfidence + slugifyUrl + IngestionError (the four /server primitives this orchestrator composes)
  - phase: 07-ingestion-substrate
    provides: 07-04 extractAndNormalize (the extract+sanitize+walk stage the orchestrator runs between safeFetch and slugifyUrl)
  - phase: 07-ingestion-substrate
    provides: 07-02 ArticleSchema + IngestionMetaSchema + IngestionRequest/Response envelope + IngestionFailureReasonEnum (the trust boundary + the wire contract)
  - phase: 01-canonical-article-foundation
    provides: normalizeText + graphemeClusters + deriveQuoteSelector + resolveQuoteSelector (the SHIPPED selector machinery the round-trip gate reuses — Pitfall 2)
  - phase: 05-durable-highlights-and-notes
    provides: D5-02 resolveQuoteSelector tri-state (confident | ambiguous | orphan) — the contract the SC#1 gate asserts against
provides:
  - server/ingest.ts — the 7-stage pipeline orchestrator (ingest) + the inline SC#1 gate (assertRoundTripAnchor)
  - assertRoundTripAnchor — the SC#1 integration truth: refuses entry on any sampled offset that resolves to ambiguous|orphan
  - The ING-06 three-state honesty contract: unsupported refused / low flagged / confident normal
  - The D7-07 immutability substrate: id = slugifyUrl(finalUrl after redirects) → 07-06 dedupe-refuse
  - The real SC#1 phase-exit gate suite (tests/unit/server/normalization.spec.ts — Wave-0 stub replaced)
affects: [07-06, 07-07]

# Tech tracking
tech-stack:
  added: []  # composes existing primitives; no new deps
  patterns:
    - "7-stage locked pipeline ordering (must_haves truth): safeFetch → extractAndNormalize → slugifyUrl → ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp+return"
    - "Inline round-trip anchor gate: 5 deterministic grapheme offsets [0, 25%, 50%, 75%, near-end] sampled, deriveQuoteSelector + resolveQuoteSelector at each, refuses on ambiguous|orphan"
    - "Pitfall 2 invariant: the gate imports normalizeText + graphemeClusters + deriveQuoteSelector + resolveQuoteSelector from src/content/normalizeText.ts EXACTLY (no fork) — same machinery as Phase 5 annotations"
    - "Try-catch wraps every throw to a typed IngestionResponse (T-7-23): IngestionError → its .reason; any other throw → 'server-error'"
    - "Paste-path id bypasses slugifyUrl (new URL() throws on non-URL strings) → content-hash slug `paste-<12hex>` used directly"
    - "Early !isReaderable||blocks.length===0 guard surfaces thin content as extraction-unsupported (not misleading server-error from Zod parse failure)"

key-files:
  created:
    - server/ingest.ts
  modified:
    - tests/unit/server/normalization.spec.ts

key-decisions:
  - "Paste-path id bypasses slugifyUrl. slugifyUrl calls `new URL(canonicalUrl)` to normalize; passing `paste-<hash>` throws TypeError (Invalid URL). The plan's pseudocode `slugifyUrl(finalUrl ?? paste-<hash>)` didn't account for this. Fix: `const id = finalUrl ? slugifyUrl(finalUrl) : paste-${shortHash(html)}`. Both forms satisfy ArticleSchema.id `/^[a-z0-9-]+$/`."
  - "Early refusal guard for thin content (Rule 2). The plan's locked ordering is parse → gate → confidence, but a readerable=false OR empty-blocks extraction surfaces as the misleading 'server-error' (Zod parse fails on missing title) instead of the honest 'extraction-unsupported'. Added `if (!isReaderable || blocks.length === 0) return { ok: false, reason: 'extraction-unsupported' }` before ArticleSchema.parse. The deriveConfidence unsupported path remains the canonical refusal for articles that parse + round-trip but score below threshold."
  - "Title fallback prevents parse failure on chromeless HTML. A readerable extraction may have no <title>/<h1>/<meta og:title> (rare but possible); Provenance.title is required by ArticleSchema. Defaulted to the URL hostname (or 'Pasted article' for the paste path) so parse succeeds and the honest deriveConfidence refusal takes over."
  - "assertRoundTripAnchor samples exactly 5 offsets per RESEARCH.md §Pattern 4 L333. The `total - 32` near-end sample uses the same contextRadius=32 the shipped selector uses, so the sample is the last passage whose prefix context is fully populated. Degenerate ranges (end <= start, i.e. total < 20 graphemes) are skipped rather than failing — the gate never refuses a short-but-unique article."
  - "requirements-completed: [ING-01, ING-06]. ING-01 (URL ingestion pipeline) closes here: the 7-stage orchestrator + SC#1 gate + ArticleSchema.parse + the input-source-agnostic contract are all proven. ING-06 (honest three-state confidence) closes here: the orchestrator refuses unsupported, flags low, admits confident — proven on v1.0 fixtures + extracted samples + a refusal-engineered case. ING-07 (mXSS) closed at 07-04; ING-08 (SSRF matrix) closes at 07-07; ING-02 (paste end-to-end with UI) closes at 07-06."

patterns-established:
  - "The 7-stage pipeline is the locked ingestion ordering — future phases that touch ingestion MUST preserve it (parse → gate → confidence); reordering breaks either the SC#1 integration truth or the ING-06 honesty contract."
  - "Pitfall 2 (no normalizeText fork) is now ENFORCED at the gate: assertRoundTripAnchor is the load-bearing assertion that an ingested article is treatable identically to a fixture for the annotation machinery. Any future 'optimization' that forks normalization will fail this gate."
  - "IngestionError is the ONLY typed throw on refusal paths; the catch wraps any other throw (ZodError, TypeError, etc.) to 'server-error'. The edge function (07-06) receives only typed IngestionResponse shapes."
  - "The article returned on success carries ingestionMeta stamped with the derived confidence (high | low). The 'unsupported' state never reaches persistence — refused upstream as 'extraction-unsupported'."

requirements-completed: [ING-01, ING-06]

# Metrics
duration: 12min
completed: 2026-08-11
status: complete
---

# Phase 7 Plan 5: Pipeline Orchestrator + Round-Trip Anchor Gate (SC#1) Summary

**Composed the four `/server` primitives into the 7-stage pipeline orchestrator (`server/ingest.ts`) with the inline SC#1 round-trip anchor gate — every successfully ingested article MUST pass 5-offset `deriveQuoteSelector` → `resolveQuoteSelector` → confident before it's returned; an article that can't round-trip is REFUSED. The Wave-0 normalization.spec.ts stub is replaced with the real SC#1 phase-exit gate suite (5 cases: v1.0 fixtures, extracted sample, refusal-engineered, full-pipeline, thin-content refusal).**

## Performance

- **Duration:** 12 min wall-clock
- **Started:** 2026-08-11T03:45:52Z
- **Completed:** 2026-08-11T03:57:34Z
- **Tasks:** 2 (Task 1: orchestrator + gate [RED → GREEN]; Task 2: SC#1 suite finalization)
- **Files modified:** 2 (1 created, 1 stub replaced)

## Accomplishments
- Landed `server/ingest.ts` — the platform-agnostic 7-stage pipeline orchestrator (RESEARCH.md §Pattern 1 L249-279). Composes safeFetch (URL path) → extractAndNormalize → slugifyUrl(finalUrl) → ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp+return. Input-source-agnostic (D7-03): the html path skips safeFetch entirely (no SSRF surface for paste).
- Implemented `assertRoundTripAnchor(article)` — the inline SC#1 integration-truth gate (RESEARCH.md §Pattern 4 L326-344). Samples 5 deterministic grapheme offsets [0, 25%, 50%, 75%, near-end], derives a TextQuoteSelector at each, and throws `IngestionError("round-trip-anchor-failed")` if any sample resolves to "ambiguous" or "orphan". Runs AFTER ArticleSchema.parse, BEFORE the article is returned. Pitfall 2 honored: imports the SHIPPED `normalizeText + graphemeClusters + deriveQuoteSelector + resolveQuoteSelector` from `src/content/normalizeText.ts` exactly — no fork.
- Shipped the ING-06 three-state honesty contract end-to-end: `unsupported` → refused with `{ ok: false, reason: "extraction-unsupported" }`; `low` → enters the library flagged `extractionConfidence: "low"` (the reader-visible "may be incomplete" banner lands in 07-06); `confident` → normal. The "unsupported" state never reaches persistence.
- Wrapped every refusal path in a try-catch that serializes to a typed `IngestionResponse` (T-7-23): `IngestionError` → its `.reason`; any other throw (ZodError, TypeError, etc.) → `"server-error"`. The edge function (07-06) receives only typed envelopes.
- Replaced the Wave-0 `tests/unit/server/normalization.spec.ts` stub with the real SC#1 phase-exit gate suite: v1.0 fixture round-trip (3 fixtures), extracted sample round-trip (essay-long-form.html through the full pipeline), refusal-engineered (extreme repetition → "ambiguous" → refused), full-pipeline integration (technical-post.html → ok=true), thin-content refusal ("<p>short</p>" → ok=false with an honest reason).

## Task Commits

Each task followed TDD discipline (3 commits total):

1. **Task 1 RED: failing round-trip anchor + ingest pipeline suite** — `9045401` (test)
2. **Task 1 GREEN: implement pipeline orchestrator + inline round-trip anchor gate** — `dcc8780` (feat)
3. **Task 2: finalize SC#1 gate suite — all acceptance criteria green** — `daee682` (test)

_Note: Task 1 RED established the full real test body (replacing the Wave-0 stub); Task 1 GREEN implemented against it; Task 2 was a finalization pass that dropped a residual `test.todo` literal from a comment so the acceptance grep passes. The SC#1 gate suite was proven GREEN against the implementation at each step._

## Files Created/Modified
- `server/ingest.ts` (created) — `ingest(input: IngestionRequest): Promise<IngestionResponse>` + `assertRoundTripAnchor(article: CanonicalArticle): void`; the 7-stage orchestrator + the inline SC#1 gate
- `tests/unit/server/normalization.spec.ts` (Wave-0 stub replaced) — 5 cases: v1.0 fixture round-trip (essay-long-form, technical-post, footnote-academic), extracted sample round-trip (essay-long-form.html), refusal-engineered extreme-repetition, full-pipeline integration (technical-post.html), thin-content refusal (`<p>short</p>`)

## Decisions Made
- **Paste-path id bypasses slugifyUrl.** slugifyUrl's first line is `new URL(canonicalUrl)`; passing `paste-<hash>` throws `TypeError: Invalid URL`. The plan's pseudocode `slugifyUrl(finalUrl ?? paste-<hash>)` didn't account for this. Fix: `const id = finalUrl ? slugifyUrl(finalUrl) : paste-${shortHash(html)}`. Both forms satisfy `ArticleSchema.id`'s `/^[a-z0-9-]+$/` regex; the paste path simply has no URL to normalize.
- **Early refusal guard for thin content (Rule 2).** The plan's locked ordering is parse → gate → confidence. But `isReaderable=false` OR empty-blocks extraction surfaces as the misleading `"server-error"` (ArticleSchema.parse fails on the missing-but-required `Provenance.title`) instead of the honest `"extraction-unsupported"`. Added `if (!isReaderable || blocks.length === 0) return { ok: false, reason: "extraction-unsupported" }` BEFORE parse. The `deriveConfidence` unsupported path remains the canonical refusal for articles that parse + round-trip but score below threshold.
- **Title fallback prevents parse failure on chromeless HTML.** A readerable extraction may lack `<title>`/`<h1>`/`<meta og:title>` (rare but possible on minimalist pages); `Provenance.title` is `z.string().min(1)` so its absence fails parse. Defaulted to the URL hostname (or `"Pasted article"` for the paste path) so parse succeeds and `deriveConfidence`'s honest refusal takes over.
- **5 deterministic offsets per RESEARCH.md §Pattern 4.** `[0, Math.floor(total*0.25), Math.floor(total*0.5), Math.floor(total*0.75), Math.max(0, total-32)]`. The near-end sample uses the same `contextRadius=32` the shipped selector uses, so it's the last passage whose prefix context is fully populated. Degenerate ranges (`end <= start`, i.e. `total < 20` graphemes) are skipped — the gate never refuses a short-but-unique article.
- **No REFACTOR commit needed.** The implementation is already clean (single-purpose functions, exhaustive comments tying each block to its must_have/research citation, no dead code). Per TDD discipline, REFACTOR is optional and committed only if changes are made.
- **requirements-completed: [ING-01, ING-06].** ING-01 (URL ingestion pipeline) closes here: the 7-stage orchestrator + SC#1 gate + ArticleSchema.parse + the input-source-agnostic contract are all proven on real publisher HTML. ING-06 (honest three-state confidence) closes here: the orchestrator refuses unsupported, flags low, admits confident. ING-07 closed at 07-04 (mXSS suite); ING-08 closes at 07-07 (SSRF matrix); ING-02 closes at 07-06 (paste end-to-end with UI).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Paste-path id derivation crashed slugifyUrl**
- **Found during:** Task 1 GREEN (first full-pipeline test run — `ingest({ html: technicalPost.html })` returned `server-error`)
- **Issue:** The plan's pseudocode `const id = slugifyUrl(finalUrl ?? paste-${shortHash(html)})` doesn't account for slugifyUrl requiring a real URL. `slugifyUrl`'s first line is `new URL(canonicalUrl)` (L52 of server/slugify.ts); passing `paste-<12hex>` throws `TypeError: Invalid URL`. The catch wraps it to `server-error`, breaking the paste path entirely.
- **Fix:** Bypass slugifyUrl for the paste path: `const id = finalUrl ? slugifyUrl(finalUrl) : paste-${shortHash(html)}`. The paste path has no URL to normalize; the content-hash slug `paste-<12hex>` directly satisfies ArticleSchema.id's `/^[a-z0-9-]+$/` regex. Both paths keep the D7-07 immutability contract (URL-derived for url; content-derived for paste).
- **Files modified:** server/ingest.ts
- **Verification:** `npx vitest run tests/unit/server/normalization.spec.ts --project server` → 5/5 green; the full-pipeline case on technical-post.html now returns ok=true with 63 blocks + confident state.
- **Committed in:** dcc8780 (Task 1 GREEN commit)

**2. [Rule 2 - Missing Critical] Thin content surfaced as misleading "server-error" instead of honest "extraction-unsupported"**
- **Found during:** Task 1 GREEN (designing the `ingest({ html: "<p>short</p>" })` test case)
- **Issue:** The plan's locked ordering is parse → gate → confidence. For thin content (`isReaderable=false` OR zero blocks extracted), `ArticleSchema.parse` fails because `Provenance.title` is required and the source HTML had no `<title>` (and blocks is `.min(1)` so empty blocks also fail). The catch wraps the ZodError to `"server-error"` — but the reader-facing contract (Task 2 test) expects `"extraction-unsupported" | "extraction-too-low-confidence" | "round-trip-anchor-failed"`. Without an early guard, thin content yields the misleading `"server-error"`.
- **Fix:** Added `if (!isReaderable || blocks.length === 0) return { ok: false, reason: "extraction-unsupported" };` BEFORE ArticleSchema.parse. The `deriveConfidence` unsupported path remains the canonical refusal for articles that parse + round-trip but score below the confidence threshold; this early guard handles the case where the article NEVER reaches parse.
- **Files modified:** server/ingest.ts
- **Verification:** `ingest({ html: "<p>short</p>" })` returns `{ ok: false, reason: "extraction-unsupported" }`; the thin-content test passes.
- **Committed in:** dcc8780 (Task 1 GREEN commit)

**3. [Rule 1 - Bug] article.ingestionMeta mutation failed tsc under `.optional()` schema**
- **Found during:** Task 1 GREEN (first tsc run)
- **Issue:** The plan's pseudocode stamps confidence via `article.ingestionMeta = { ...article.ingestionMeta, extractionConfidence: ... }`. But `ArticleSchema.ingestionMeta` is `.optional()` (IngestionMeta | undefined). Spreading `...undefined` produces an all-optional shape that fails the assignment target's required-field type.
- **Fix:** Use a narrow guard + direct property assignment: `if (article.ingestionMeta) { article.ingestionMeta.extractionConfidence = ... }`. Inside the if-block TS narrows away `.optional()`; the assignment type-checks. Runtime behavior unchanged (ingestionMeta is always present — we supply it in `assembled`).
- **Files modified:** server/ingest.ts
- **Verification:** `npx tsc --noEmit` → exit 0.
- **Committed in:** dcc8780 (Task 1 GREEN commit)

**4. [Rule 1 - Test bug] Test imports used wrong relative depth (../../ instead of ../../../)**
- **Found during:** Task 1 RED (first tsc run)
- **Issue:** The test file at `tests/unit/server/normalization.spec.ts` is 3 levels deep (tests/unit/server/), so reaching `src/` requires `../../../src/`. The first draft used `../../src/` (matching the convention at `tests/unit/selectors.test.ts` which is only 2 levels deep), causing `TS2307: Cannot find module`.
- **Fix:** Bumped all five relative imports (schema, 3 fixture JSONs) to `../../../src/...`. Matches the convention in the sibling `tests/unit/server/extraction.spec.ts` and `confidence.spec.ts`.
- **Files modified:** tests/unit/server/normalization.spec.ts
- **Verification:** `npx tsc --noEmit` → exit 0.
- **Committed in:** dcc8780 (Task 1 GREEN commit)

**5. [Rule 1 - Cosmetic] Header comment contained the literal `test.todo` token, tripping the acceptance grep**
- **Found during:** Task 2 acceptance criteria check (`grep -c "test.todo"` returned 1 instead of 0)
- **Issue:** The acceptance criterion `grep -c "test.todo" tests/unit/server/normalization.spec.ts returns 0` is a proxy for "the Wave-0 stub is fully replaced." My header comment said "Replaces the Wave-0 stub (test.todo placeholders)…" — the literal substring appeared in the comment even though no actual `test.todo` call remained.
- **Fix:** Rewrote the comment to convey the same intent ("vitest's deferred-test API") without the literal token. The grep now returns 0; the semantic intent (stub fully replaced) is unchanged.
- **Files modified:** tests/unit/server/normalization.spec.ts
- **Verification:** `grep -c "test.todo" tests/unit/server/normalization.spec.ts` → 0.
- **Committed in:** daee682 (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs, 1 Rule 2 missing-critical, 1 Rule 3 blocker)
**Impact on plan:** All auto-fixes necessary for correct runtime behavior (paste-path id, honest thin-content refusal, tsc-clean mutation, correct test imports) and acceptance-gate hygiene (test.todo grep). No scope creep — every change is in service of the 7-stage pipeline landing faithful to RESEARCH.md §Pattern 1 + §Pattern 4 and the ING-01/ING-06 contracts.

## Issues Encountered
- The plan's pseudocode for the paste-path id (`slugifyUrl(finalUrl ?? paste-<hash>)`) was provably broken at runtime — `slugifyUrl` does `new URL(canonicalUrl)` unconditionally. The fix (bypass for paste) is a one-liner but required empirically verifying via `npx vite-node` that the original code threw `TypeError: Invalid URL`. Documented as Deviation 1; the fix preserves D7-07 immutability for both paths.

## TDD Gate Compliance

Both tasks executed as `type="auto" tdd="true"` per the plan. Git log shows the mandatory RED → GREEN sequence for Task 1:

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 07-05 Task 1 | ✓ 9045401 | ✓ dcc8780 | — | Pass |
| 07-05 Task 2 | (suite landed in Task 1 RED; finalization-only commit) | ✓ daee682 | — | Pass |

RED tests failed for the right reason (`Failed to resolve import "../../../server/ingest"` — the module didn't exist). GREEN tests pass minimally — no premature optimization. No REFACTOR needed (the implementation is already clean). Task 2's finalization commit tightened a comment so the literal-`test.todo` grep acceptance criterion passes; no test logic changed.

## Threat Surface Scan

No new security-relevant surface beyond what the plan's `<threat_model>` documents. Every threat has a corresponding mitigation in the shipped code AND at least one assertion in the SC#1 suite:
- **T-7-21 (Tampering, normalization drift):** assertRoundTripAnchor reuses the shipped `normalizeText + graphemeClusters + deriveQuoteSelector + resolveQuoteSelector` EXACTLY (Pitfall 2 — no fork); refuses entry on any sampled offset that doesn't resolve to confident. Proven by the refusal-engineered extreme-repetition case.
- **T-7-22 (Info Disclosure, unsupported enters library):** `ingest()` returns `{ ok: false, reason: "extraction-unsupported" }` when `!isReaderable || blocks.length === 0` (early guard) OR when `deriveConfidence` returns `state === "unsupported"` (post-gate). Proven by the thin-content refusal case.
- **T-7-23 (Repudiation, generic Error escapes):** catch wraps every throw to a typed IngestionResponse — `IngestionError` → its `.reason`; any other throw → `"server-error"`. Verified by the catch block at the end of `ingest()`.
- **T-7-24 (Tampering, id drift across re-extraction):** `id = slugifyUrl(finalUrl)` for the URL path (URL-derived, not content-derived); re-ingest produces the same id → dedupe-refuse (D7-07) lands in 07-06. The paste-path id is content-derived (`paste-<12hex>`) which is still deterministic per paste.

## Next Phase Readiness
- **07-06 (edge function adapter + IngestionClient + DexieLibrarySource + minimal UI):** `ingest(input)` is the platform-agnostic function the edge adapter wraps. The `functions/api/ingest.ts` Pages Function receives a Request, parses the body through `IngestionRequestSchema` (Zod-at-boundary), calls `ingest(input)`, and returns the `IngestionResponse` as JSON (200 on ok=true; 400 on ok=false with the typed reason). The D7-07 dedupe-refuse (check `id` against Dexie before admitting) lands here — `slugifyUrl(finalUrl)` makes the id deterministic across re-ingest.
- **07-07 (four phase-exit gates):** The SC#1 round-trip anchor gate is GREEN (this plan). The mXSS suite (SC#4) landed GREEN at 07-04. The SSRF integration matrix (SC#3) runs against real `wrangler pages dev` — this plan's `safeFetch` unit suite (07-03) is the deterministic fast-path gate. The Dexie v1→v3 migration snapshot (SC#5) runs against real IndexedDB — the v3 append landed at 07-02. All four gates will be exercised together at the phase-exit verification.

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: server/ingest.ts
- FOUND: tests/unit/server/normalization.spec.ts (Wave-0 stub replaced)
- FOUND: .planning/phases/07-ingestion-substrate/07-05-SUMMARY.md

**Commits verified in git log:**
- FOUND: 9045401 (Task 1 RED — failing round-trip anchor + ingest pipeline suite)
- FOUND: dcc8780 (Task 1 GREEN — implement pipeline orchestrator + inline round-trip anchor gate)
- FOUND: daee682 (Task 2 — finalize SC#1 gate suite, all acceptance criteria green)

**Verification gates:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run tests/unit/server/normalization.spec.ts --project server` → 5 passed / 0 failed
- `npx vitest run --project server` → 91 passed / 7 skipped (spike) / 0 failed
- `npx vitest run --project unit` → 547 passed / 0 failed (no regressions)
- All 11 Task 1 acceptance criteria greps pass (export async function ingest=1, export function assertRoundTripAnchor=1, safeFetch(input.url=1, extractAndNormalize≥1, slugifyUrl≥1, ArticleSchema.parse=1, deriveQuoteSelector≥1, resolveQuoteSelector≥1, state: "unsupported"≥1, round-trip-anchor-failed≥1, source-ordering parse→gate→return verified, tsc=0)
- All 6 Task 2 acceptance criteria pass (test.todo=0, assertRoundTripAnchor=5≥3, round-trip-anchor-failed=3≥1, ingest(=7≥2, vitest green, repetition case provably throws round-trip-anchor-failed)

---
*Phase: 07-ingestion-substrate*
*Completed: 2026-08-11*
