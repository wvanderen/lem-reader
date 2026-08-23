---
phase: 07-ingestion-substrate
plan: 03
subsystem: infra
tags: [ssrf, ip-address, dns-pinning, cf-resolveOverride, sha256, confidence-model, slugify, idn-punycode, owasp, tdd]

# Dependency graph
requires:
  - phase: 07-ingestion-substrate
    provides: 07-01 spike verdict (HYBRID CONTINGENCY; A1 cf.resolveOverride PASS) — gates safeFetch's DNS-pinning path
  - phase: 07-ingestion-substrate
    provides: 07-02 IngestionFailureReasonEnum (11 reasons) + IngestionMetaSchema (extractionConfidence high|low) + ArticleSchema.id regex — the contract surface safeFetch/errors/confidence/slugify consume
  - phase: 01-canonical-article-foundation
    provides: ArticleSchema + Provenance + httpUrl — the trust boundary
  - phase: 01-canonical-article-foundation
    provides: normalizeText(article) — Pitfall 2 shared normalizer reused by deriveConfidence
provides:
  - server/limits.ts — REQUEST_TIMEOUT_MS=30s, MAX_RESPONSE_BYTES=5MB, MAX_REDIRECTS=5, ALLOWED_CONTENT_TYPES, PRIVATE_RANGES (OWASP Case 2 deny-list incl CGNAT 100.64/10), METADATA_HOSTNAMES
  - server/errors.ts — IngestionError class with typed .reason: IngestionFailureReason
  - server/safeFetch.ts — safeFetch(rawUrl, hopDepth?) implementing all 9 OWASP SSRF measures + FetchedContent interface { html, finalUrl, contentType, hash }
  - server/confidence.ts — deriveConfidence(article, signals) three-state ING-06 model + ConfidenceResult interface
  - server/slugify.ts — slugifyUrl(canonicalUrl) D7-07 URL-slug identity (IDN/port/fragment/tracking-param normalization + hash fallback)
  - tests/unit/server/safe-fetch.spec.ts — 27-case SSRF regression suite (DNS-mocked, fetch-stubbed)
  - tests/unit/server/confidence.spec.ts — 7-case three-state threshold suite (replaces Wave-0 stub)
  - tests/unit/server/slugify.spec.ts — 13-case slug normalization suite (replaces Wave-0 stub)
affects: [07-04, 07-05, 07-06, 07-07]

# Tech tracking
tech-stack:
  added: []  # ip-address@10.5.0 was added in 07-01; this plan consumes it
  patterns:
    - "OWASP SSRF Case 2 deny-list via ip-address library isInSubnet (not regex — not exposed to hex/octal/dword encoding bypasses)"
    - "Per-hop redirect re-validation: fetch(redirect: 'manual') + recursive safeFetch re-running the FULL pipeline (scheme + metadata + DNS + IP) on every hop"
    - "cf.resolveOverride DNS pinning (07-01 A1 PASS) — the resolved IP is pinned into the fetch options, closing the DNS-rebinding TOCTOU window"
    - "IPv4-mapped IPv6 handling via Address6.isMapped4() + to4() — checks the embedded v4 form against PRIVATE_V4_RANGES"
    - "Pitfall 2 honored: deriveConfidence computes textLength via the SHARED normalizeText(article) from src/content/normalizeText.ts — no fork"
    - "Measure 7 discipline: all validation (scheme, IP, metadata, size, content-type) runs BEFORE res.text() — no upstream body leaks on refusal (textCallCount gate in the test)"

key-files:
  created:
    - server/limits.ts
    - server/errors.ts
    - server/safeFetch.ts
    - server/confidence.ts
    - server/slugify.ts
    - tests/unit/server/safe-fetch.spec.ts
  modified:
    - tests/unit/server/confidence.spec.ts
    - tests/unit/server/slugify.spec.ts

key-decisions:
  - "DNS pinning via cf.resolveOverride (07-01 A1 PASS) — safeFetch pins the first validated resolved IP via `cf: { resolveOverride }`. Node unit-test fetch ignores the key; Workers fetch honors it. TOCTOU window closed."
  - "Metadata-hostname check runs BEFORE DNS resolution (RESEARCH.md measure order 1 → 5 → 3) — the cheapest exfil path (169.254.169.254) never reaches fetch. Redirect-into-internal test therefore targets 10.0.0.1 (genuinely private, not metadata) to exercise the per-hop IP re-validation path."
  - "IPv4-mapped IPv6 (::ffff:a.b.c.d) handled via Address6.isMapped4() + to4() — checks the embedded IPv4 form against PRIVATE_V4_RANGES in addition to the wrapper v6 form."
  - "URL constructor does the encoding-bypass normalization (0x7f000001 / dword 2130706433 / octal 0177.0.0.1 all normalize to 127.0.0.1) BEFORE the metadata + DNS checks — so the ip-address library never sees the encoded form, only the canonical dotted-decimal."
  - "deriveConfidence ships the locked formula (blockCount>=3 && textLength>=500 → confident; isReaderable=false → unsupported; unsupportedRatio>0.4 → low). Empirical corpus calibration (RESEARCH.md L544-546) is OUT OF SCOPE — later enhancement, not a phase-exit gate."
  - "slugifyUrl ships humanish-form-when-clean + hash-fallback-otherwise. The humanish slug uses hostname (dots→hyphens) + path (slashes/dots/underscores→hyphens); the hash fallback is `u-<12-char sha256>` and disambiguates distinct URLs that produce the same humanish slug or violate the ArticleSchema.id regex."

patterns-established:
  - "Constant-export convention: server/limits.ts exports the locked resource caps as `as const` arrays + plain const numbers, mirroring src/content/normalizeText.ts BLOCK_SEPARATOR (07-PATTERNS.md L201-209)."
  - "Typed IngestionError: every /server refusal throws IngestionError with a .reason drawn from IngestionFailureReasonEnum (src/ingestion/types.ts) — never a bare Error. Callers discriminate via .reason + instanceof."
  - "Measure 7 invariant: res.text() is the LAST step in safeFetch, after scheme + metadata + DNS + IP + redirect-cap + size + content-type all pass. The test asserts textCallCount === 0 on every refusal path."
  - "Pitfall 2 invariant: deriveConfidence imports normalizeText from src/content/normalizeText.ts (not a fork). Future /server modules that need normalized-text length MUST do the same."

requirements-completed: [ING-01, ING-06, ING-08]

# Metrics
duration: 8min
completed: 2026-08-11
status: complete
---

# Phase 7 Plan 3: Server Substrate (SSRF Guard + Confidence + Slugify) Summary

**Five platform-agnostic /server modules (limits, errors, safeFetch, confidence, slugify) — the security + identity substrate — implementing all 9 OWASP SSRF measures with ip-address deny-listing + cf.resolveOverride DNS pinning, the ING-06 three-state confidence model reusing the shared normalizer, and the D7-07 URL-slug identity with IDN/tracking-param normalization + hash fallback.**

## Performance

- **Duration:** 8 min wall-clock
- **Started:** 2026-08-11T03:10:37Z
- **Completed:** 2026-08-11T03:19:11Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 7 (5 created, 2 stubs replaced)

## Accomplishments
- Landed `server/limits.ts` exporting the locked constants from RESEARCH.md §Timeout/Size-Cap L612-620: REQUEST_TIMEOUT_MS=30_000, MAX_RESPONSE_BYTES=5MB, MAX_REDIRECTS=5, ALLOWED_CONTENT_TYPES, PRIVATE_RANGES (OWASP Case 2 deny-list incl CGNAT 100.64/10), METADATA_HOSTNAMES.
- Landed `server/errors.ts` — the typed `IngestionError` class carrying `.reason: IngestionFailureReason` (the 11-reason catalog from 07-02). Every /server refusal throws this; `instanceof IngestionError` discriminates from unexpected throws.
- Landed `server/safeFetch.ts` implementing all 9 OWASP SSRF measures: scheme allowlist (http/https only — URL constructor normalizes 0x7f000001/dword/octal encoding bypasses), cloud-metadata hostname blocklist, DNS resolve4/6, ip-address deny-list check (handles IPv4-mapped IPv6 via isMapped4+to4), manual redirects with full per-hop re-validation, AbortSignal.timeout(30s), content-length cap (5MB) BEFORE body read, content-type allowlist, sha256 hash on success. DNS pinning via `cf: { resolveOverride }` (07-01 A1 PASS) closes the TOCTOU window.
- Landed `server/confidence.ts` — the ING-06 three-state model: isProbablyReaderable=false → unsupported; unsupportedBlockRatio>0.4 → low (Pitfall 1); blockCount>=3 && textLength>=500 → confident; else → low. Reuses the SHARED normalizeText (Pitfall 2 — no fork).
- Landed `server/slugify.ts` — the D7-07 canonical-URL → id normalizer: IDN/punycode via URL.hostname auto-normalization, default-port strip, fragment strip, tracking-param strip (utm_*/fbclid/gclid/ref/mc_cid/mc_eid), alphabetical query-param sort, humanish slug when clean (hostname+path → hyphens), hash fallback `u-<12-char sha256>` for >80-char or non-slug-regex URLs.
- Replaced two Wave-0 test stubs (confidence.spec.ts, slugify.spec.ts) with real table-driven bodies; added a new 27-case SSRF regression suite (safe-fetch.spec.ts) covering all 13 plan behavior cases + IPv6 variants + boundary cases.

## Task Commits

Each task followed TDD RED → GREEN discipline (4 commits total):

1. **Task 1 RED: failing SSRF guard suite for safeFetch** — `c040db6` (test)
2. **Task 1 GREEN: implement SSRF guard (limits + errors + safeFetch)** — `ec89c07` (feat)
3. **Task 2 RED: failing confidence + slugify suites (replace Wave-0 stubs)** — `9810332` (test)
4. **Task 2 GREEN: implement confidence model + URL slugify** — `3af57cd` (feat)

**Plan metadata:** this commit (docs: complete server-substrate plan)

## Files Created/Modified
- `server/limits.ts` (created) — REQUEST_TIMEOUT_MS=30s, MAX_RESPONSE_BYTES=5MB, MAX_REDIRECTS=5, ALLOWED_CONTENT_TYPES, PRIVATE_RANGES (12 CIDRs incl CGNAT + IPv6 reserved), METADATA_HOSTNAMES
- `server/errors.ts` (created) — IngestionError class with typed .reason: IngestionFailureReason
- `server/safeFetch.ts` (created) — safeFetch(rawUrl, hopDepth?) implementing the 9 OWASP SSRF measures; FetchedContent interface { html, finalUrl, contentType, hash }
- `server/confidence.ts` (created) — deriveConfidence(article, signals) three-state model; ConfidenceResult interface; reuses normalizeText (Pitfall 2)
- `server/slugify.ts` (created) — slugifyUrl(canonicalUrl) D7-07 URL-slug identity with hash fallback
- `tests/unit/server/safe-fetch.spec.ts` (created) — 27-case SSRF regression (DNS-mocked via vi.mock("node:dns"), fetch-stubbed via vi.stubGlobal)
- `tests/unit/server/confidence.spec.ts` (modified) — 7-case three-state threshold suite (Wave-0 stub replaced)
- `tests/unit/server/slugify.spec.ts` (modified) — 13-case slug normalization suite (Wave-0 stub replaced)

## Decisions Made
- **DNS pinning = cf.resolveOverride** (07-01 A1 PASS) — safeFetch pins the first validated resolved IP via `cf: { resolveOverride }`. Node unit-test fetch ignores the key; Workers fetch honors it. The TOCTOU window (resolve → validate → fetch could see a different IP under DNS rebinding) is closed. Documented in the file header comment citing the spike.
- **Metadata-hostname check BEFORE DNS resolution** — RESEARCH.md measure order 1 (scheme) → 5 (metadata) → 3 (DNS). The cheapest exfil path (169.254.169.254) never reaches fetch. Side-effect: a redirect *to* 169.254.169.254 throws `ssrf-blocked-metadata` (not `ssrf-blocked-private-ip`). The per-hop re-validation test therefore targets 10.0.0.1 (genuinely private, not metadata) to exercise the IP re-validation path specifically — see Deviation 2.
- **IPv4-mapped IPv6 handled via isMapped4() + to4()** — `::ffff:127.0.0.1` is checked both as a v6 (against PRIVATE_V6_RANGES, which it is not) AND via its embedded v4 form (127.0.0.1, which IS in 127/8). Without this, an attacker could bypass the v4 deny-list by wrapping in a v6.
- **URL constructor owns the encoding-bypass defense** — Node normalizes 0x7f000001 / dword 2130706433 / octal 0177.0.0.1 to 127.0.0.1 at URL parse time, so the ip-address library only ever sees canonical dotted-decimal. This is why the library throwing on encoded forms is not a defense gap — URL normalization is the first line.
- **Locked formula shipped; corpus calibration deferred** — confidence ships the RESEARCH.md L538-542 thresholds (blockCount>=3 && textLength>=500 → confident). Empirical calibration (RESEARCH.md L544-546) is explicitly OUT OF SCOPE per the plan action; it is a later enhancement analogous to v1.0's PAGE-08, not a phase-exit gate.
- **Humanish slug + hash fallback** — slugify prefers a readable hostname+path slug when it satisfies `/^[a-z0-9-]+$/` and fits 80 chars; otherwise falls back to `u-<12-char sha256>`. Two distinct URLs producing the same humanish slug are disambiguated by the hash because their normalized forms differ (D7-07 collision resolution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IngestionError.reason field was declared but never assigned in the constructor**
- **Found during:** Task 1 GREEN (first test run — 25/27 tests failed with `.reason === undefined`)
- **Issue:** With `useDefineForClassFields: true` (tsconfig.json L17), a class field declaration `readonly reason: IngestionFailureReason;` initializes the field to `undefined` at construction time. My first draft declared the field but relied on TypeScript parameter properties (`constructor(public reason: ...)`) — which I had NOT used, so the field stayed undefined.
- **Fix:** Added explicit `this.reason = reason;` in the constructor body.
- **Files modified:** server/errors.ts
- **Verification:** All 27 safeFetch tests pass; `(err as IngestionError).reason` correctly equals the cataloged reason string.
- **Committed in:** ec89c07 (Task 1 GREEN commit)

**2. [Rule 1 - Plan-spec clarification] Redirect-to-169.254.169.254 yields ssrf-blocked-metadata, not ssrf-blocked-private-ip**
- **Found during:** Task 1 RED (designing the per-hop re-validation test)
- **Issue:** The plan's behavior spec case 9 says "safeFetch on a hostname that returns a 302 to http://169.254.169.254/ throws IngestionError with reason='ssrf-blocked-private-ip'". But per the implementation order (RESEARCH.md measure 1 → 5 → 3 — scheme, then metadata-hostname, then DNS), a redirect *to* 169.254.169.254 hits the metadata-hostname block (measure 5) BEFORE the IP deny-list (measure 4), so it throws `ssrf-blocked-metadata`. The plan author conflated the two blocking paths.
- **Fix:** Kept the implementation faithful to RESEARCH.md (metadata check before DNS — the cheapest-exfil-path defense). Rewrote the per-hop test to redirect to `http://10.0.0.1/` (genuinely private, NOT a metadata hostname) so it exercises the IP re-validation path and yields `ssrf-blocked-private-ip` as the plan specifies. The test still proves per-hop re-validation catches redirect-into-internal (the intent); only the specific redirect target changed.
- **Files modified:** tests/unit/server/safe-fetch.spec.ts
- **Verification:** Per-hop test passes with `reason: "ssrf-blocked-private-ip"`; the metadata-hostname test separately covers the 169.254.169.254-direct case.
- **Committed in:** ec89c07 (Task 1 GREEN commit)

**3. [Rule 1 - Test bug] mockImplementation must return a Promise (not a plain array) for DNS mocks**
- **Found during:** Task 1 GREEN (redirect test failed with `resolve4(...).catch is not a function`)
- **Issue:** The redirect test needed the DNS mock to be hostname-aware (return `["93.184.216.34"]` for `attacker.example` but `["10.0.0.1"]` for `10.0.0.1`). I used `resolve4Mock.mockImplementation((hostname) => hostname === "10.0.0.1" ? ["10.0.0.1"] : ["93.184.216.34"])`, but `mockImplementation` returns the raw value — the real `dns.promises.resolve4` returns a Promise, and safeFetch calls `.catch()` on the result, which failed on a plain array.
- **Fix:** Wrapped the return in `Promise.resolve(...)`: `mockImplementation((hostname) => Promise.resolve(hostname === "10.0.0.1" ? ["10.0.0.1"] : ["93.184.216.34"]))`.
- **Files modified:** tests/unit/server/safe-fetch.spec.ts
- **Verification:** Per-hop redirect test passes.
- **Committed in:** ec89c07 (Task 1 GREEN commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs/clarifications)
**Impact on plan:** All auto-fixes necessary for correct runtime behavior (field initialization, faithful measure ordering, correct mock return shape). No scope creep — every change is in service of the 9 SSRF measures landing faithful to RESEARCH.md and the ING-06 / D7-07 contracts.

## Issues Encountered
- The `ip-address` library does NOT directly parse encoded IPv4 forms (0x7f000001, dword 2130706433, octal 0177.0.0.1) — it throws `AddressError: Invalid IPv4 address` on them. The OWASP recommendation holds because Node's `URL` constructor normalizes these forms to dotted-decimal at parse time, so the library only ever sees the canonical form. Verified via direct node evaluation; the test for encoded bypasses mocks DNS to return the normalized `["127.0.0.1"]`.
- The `ip-address` library's `isInSubnet` takes a SINGLE Address instance per call (not an array). The first implementation attempt passed an array, which threw `address.mask is not a function`. Fixed by iterating with `.some(range => addr.isInSubnet(range))`.

## TDD Gate Compliance

Both tasks executed as `type="auto" tdd="true"` per the plan. Git log shows the mandatory RED → GREEN sequence:

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 07-03 Task 1 | ✓ c040db6 | ✓ ec89c07 | — | Pass |
| 07-03 Task 2 | ✓ 9810332 | ✓ 3af57cd | — | Pass |

RED tests failed for the right reasons (server modules unresolvable — vite import-analysis error). GREEN tests pass minimally — no premature optimization. No REFACTOR needed (the implementations are already clean).

## Threat Surface Scan

No new security-relevant surface beyond what the plan's `<threat_model>` documents. Every threat (T-7-08 metadata exfil, T-7-09 internal enumeration, T-7-10 DNS rebinding TOCTOU, T-7-11 redirect-into-internal, T-7-12 body leak on refusal, T-7-13 DoS, T-7-14 slug collision) has a corresponding mitigation in the shipped code AND at least one test case asserting the refusal. The cf.resolveOverride DNS pinning (T-7-10 mitigation) is enabled per the 07-01 A1 spike verdict.

## Next Phase Readiness
- **07-04 (extraction + sanitize + htmlToBlocks + mXSS suite):** Per the 07-01 HYBRID CONTINGENCY verdict, extraction+sanitize run in a Node-runtime function. The `/server` adapter boundary (D7-05) keeps the logic portable. This plan's `server/errors.ts` (IngestionError) + `server/limits.ts` (content-type allowlist) are directly reusable — htmlToBlocks will throw IngestionError("extraction-too-low-confidence") / IngestionError("round-trip-anchor-failed") using the same typed-reason discipline.
- **07-05 (orchestrator + round-trip anchor gate):** The orchestrator composes safeFetch + htmlToBlocks + confidence + slugify into the 7-stage pipeline; `server/ingest.ts` will import all five of this plan's modules. deriveConfidence's three-state output drives the SC#1 round-trip gate (unsupported → refuse; low → flag; confident → proceed).
- **07-06 (edge function adapter + IngestionClient + DexieLibrarySource + minimal UI):** `functions/api/ingest.ts` routes the request to the Node extraction function; the Worker-side fetch still uses safeFetch. The IngestionClient maps IngestionError.reason → calm DOC-06 status phrase (D7-04).
- **07-07 (phase-exit gates):** The SSRF integration matrix runs against real `wrangler pages dev`; this plan's unit suite is the deterministic fast-path gate. The 9 measures each have ≥1 test asserting refusal (verified in the plan-level verification gate).

---
*Phase: 07-ingestion-substrate*
*Completed: 2026-08-11*

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: server/limits.ts, server/errors.ts, server/safeFetch.ts, server/confidence.ts, server/slugify.ts
- FOUND: tests/unit/server/safe-fetch.spec.ts (new)
- FOUND: tests/unit/server/confidence.spec.ts, tests/unit/server/slugify.spec.ts (stubs replaced)
- FOUND: .planning/phases/07-ingestion-substrate/07-03-SUMMARY.md

**Commits verified in git log:**
- FOUND: c040db6 (Task 1 RED — failing SSRF guard suite for safeFetch)
- FOUND: ec89c07 (Task 1 GREEN — implement SSRF guard limits + errors + safeFetch)
- FOUND: 9810332 (Task 2 RED — failing confidence + slugify suites)
- FOUND: 3af57cd (Task 2 GREEN — implement confidence + slugify)

**Verification gates:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run --project server` → 48 passed / 7 skipped (spike) / 10 todo / 0 failed
- `npx vitest run --project unit` → 547 passed / 0 failed (no regressions)
- All 12 Task 1 acceptance criteria greps pass (REQUEST_TIMEOUT_MS=30_000, MAX_RESPONSE_BYTES=5, CGNAT 100.64.0.0/10, 169.254.169.254, class IngestionError, export async function safeFetch, dns.promises.resolve4, Address4, redirect:"manual", AbortSignal.timeout, cf.resolveOverride documented citing 07-01 spike, 27 test cases pass)
- All 10 Task 2 acceptance criteria greps pass (deriveConfidence, slugifyUrl, three state literals, normalizeText(article) reuse, TRACKING + u- hash fallback, test.todo count 0 in both replaced stubs, slug regex assertion present)
