---
phase: 07-ingestion-substrate
verified: 2026-08-23T17:16:05Z
status: verified
score: 12/12 truths verified
retroactive: true
retroactive_note: "Phase completed 2026-08-12 WITHOUT a gsd-verifier run (the v2.0 milestone-audit blocker). This report was produced 2026-08-23 (quick task 260823-gfi) as a retroactive verification against TODAY's codebase — the post-phases-8–13 tree, not the 2026-08-12 tree. Every command below was executed fresh this session with recorded counts and exit codes; no GREEN claim is inherited from STATE.md or SUMMARYs."
behavior_unverified: 2 # both are the phase's own DOCUMENTED residuals, skip-tagged in ssrf-matrix.spec.ts with citations — see behavior_unverified_items + Acknowledged Gaps
behavior_unverified_items:
  - truth: "SC#3 Measure 3 — DNS-rebinding simulation refused end-to-end"
    test: "ssrf-matrix.spec.ts 'DNS-rebinding' vector (test.skip at L307)"
    expected: "A rebinding attacker cannot TOCTOU resolve→fetch; the fetch connects to the validated IP"
    why_human: "Node's fetch ignores cf.resolveOverride, so the pinning option is a no-op in the current runtime — residual TOCTOU documented at ship time (T-7-04, 07-01 spike A1 verdict, 07-07 key decision). NOT a regression: this report re-confirms the skip citation is intact and the resolve+validate-then-pin code path is present (safeFetch.ts L152-166). NOTE: the skip's 'closed by future Workers deploy per D7-10' closure path is now STALE — production deployed to a Vercel Node function (quick task 260821-k6z, D7-05 adapter), so the residual persists as accepted on the Node runtime (surfaced as new tech debt in the milestone audit)."
  - truth: "SC#3 Measure 9 — redirect-into-internal chain refused in the E2E matrix"
    test: "ssrf-matrix.spec.ts 'redirect-into-internal 302 → http://169.254.169.254/' vector (test.skip at L295)"
    expected: "Per-hop re-validation refuses the internal redirect target with a typed reason and no upstream body"
    why_human: "Covered deterministically at UNIT level by safe-fetch.spec.ts (mocked fetch + DNS; included in this session's 108/108 green run). An e2e simulation is structurally awkward on localhost: a local mock redirect server itself lives in PRIVATE_RANGES, so safeFetch refuses the mock URL before any redirect is followed. Documented at ship time (07-07 key decision); skip citation re-confirmed intact this session."
overrides_applied: 0
---

# Phase 7: Ingestion Substrate Verification Report

**Phase Goal:** A stateless ingestion backend safely turns URL-fetched and pasted-HTML pages into validated canonical articles that the v1.0 reader treats identically to fixtures — without exposing the reader to SSRF or XSS.
**Verified:** 2026-08-23T17:16:05Z
**Status:** verified (retroactive — see frontmatter note)
**Re-verification:** No — first verifier pass for this phase, 11 days after phase completion (2026-08-12), per the v2.0 milestone-audit §6 prescription.

**SC drift mapping (retroactive honesty — verified against TODAY's tree):**

- The phase's code did NOT stand still after 2026-08-12: `server/ingest.ts` grew the pdf branch (Phase 11) and the epub per-chapter flow (Phase 12) plus the plain-text paste reroute (quick task 260821-ov7); `src/persistence/db.ts` grew v4 (Phase 8 `*tags`) and v5 (Phase 12 `bookId` + `books`); production deployed to a Vercel Node function (quick task 260821-k6z). Every drift point below maps the ORIGINAL 2026-08-10 contract onto this evolved codebase — all drift directions are strengthening (wider gate coverage, longer append-only chain), none weaken a Phase 7 obligation.
- **SC#1** — the round-trip anchor gate now spans ALL FIVE intake formats (url / paste / pdf / markdown / epub-chapter), not just the url+paste the contract named. Stronger than contract.
- **SC#3** — the SSRF matrix targets the Vite Node dev middleware at `:5173/api/ingest` per the 07-06/07-07 human-approved RUNTIME_GUARDRAIL (workerd cannot run jsdom — the 07-01 spike verdict), NOT `wrangler pages dev`. Production runs the same `/server` pipeline behind the D7-05 adapter on a Vercel Node function.
- **SC#5** — the contract's "v1→v3 Dexie migration" is now a stage within today's v1→v5 append-only chain; the v3 block itself is intact and byte-anchored (verified below), and Pitfall 9 held across the later v4/v5 appends.

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (the contract, ROADMAP.md Phase 7 L47–53) are truths 1–5; deduplicated plan-level truths (cited from 07-0N-SUMMARY must-haves/decisions) follow as 6–12. Verifier-run evidence this session: unit suites **8 files / 108 tests green (exit 0, 2.09s)**, ingestion e2e **69 passed / 0 failed / 6 intentional skips (exit 0)** across chromium/firefox/webkit, `npm run lint:no-danger` **exit 0**, usage-grep **exit 1 (0 matches)**.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC#1** Reader submits a real publisher URL → article opens in the existing reader, paginating/annotating/restoring identically — round-trip anchor gate (TextPositionSelector + TextQuoteSelector → `confident`) on every successfully ingested article | ✓ VERIFIED | Fresh run: happy-path e2e **6/6 green ×3 engines** (paste-path drives the FULL real middleware pipeline `#/article/` + h1 + headings/paragraphs; URL-path proves UI plumbing via page.route mock — the 07-07 decoupling design); normalization.spec.ts (the SC#1 gate suite) green in this session's 108/108. Code read: `assertRoundTripAnchor` (ingest.ts L73–98) samples 5 offsets [0, 25%, 50%, 75%, total−32], **refuses on ambiguous\|orphan** via `IngestionError("round-trip-anchor-failed")`, importing `deriveQuoteSelector`/`resolveQuoteSelector` from `src/content/normalizeText` EXACTLY (Pitfall 2 — no fork; imports re-read at L54–59). `grep -c assertRoundTripAnchor server/ingest.ts` → **11**; the gate fires on the single-article tail (L714) and per-epub-chapter (L352) — all five formats |
| 2 | **SC#2** Pasted/uploaded HTML normalizes through the SAME pipeline as a URL, same canonical Block shape | ✓ VERIFIED | Code read: the `{html}` branch (ingest.ts L552–572) destructures into the same `blocks/footnotes/lang/provenancePartial/isReaderable` closure consumed by the shared stages 2+ (parse → anchor gate → confidence → stamp) — input-source-agnostic by construction (D7-03). Fresh run: happy-path paste e2e green ×3 engines; ingest-plaintext-paste.spec.ts green in 108/108. Drift (strengthening): since 260821-ov7 a tag-less plain-text paste reroutes onto the markdown intake (Stage 0.5, L479–482) — both routes still converge on the identical canonical Block shape through the shared tail |
| 3 | **SC#3** SSRF guard regression matrix passes — private/loopback/link-local (incl. 169.254.169.254, CGNAT 100.64/10), non-http(s) schemes, redirect-into-internal, DNS-rebinding — no upstream body on refusal | ✓ VERIFIED | Fresh run: `npx playwright test tests/e2e/ingestion/ssrf-matrix.spec.ts` → **57 passed / 0 failed / 6 skipped, exit 0** (19-vector corpus re-counted in the spec this session + the 2 documented residuals test.skip-tagged WITH citations at L295/L307 — see Acknowledged Gaps). safe-fetch.spec.ts (27-case DNS-mocked suite incl. the redirect-into-internal unit and the textCallCount===0 no-body-leak gate) green in 108/108. Code read: safeFetch.ts measure ordering is **metadata-hostname BEFORE DNS** (L127→L134), scheme allowlist http(s) (L121), every resolved IP checked via ip-address `isInSubnet` (L146–150) against PRIVATE_RANGES re-read in limits.ts L44–55 (10/8, 172.16/12, 192.168/16, **169.254/16**, 127/8, **100.64/10 CGNAT**, ::1/128, fc00::/7, fe80::/10, ff00::/8) + METADATA_HOSTNAMES incl. 169.254.169.254; per-hop redirect re-validation via recursive safeFetch under redirect:manual (L171–182); size-cap + content-type BEFORE the sole `res.text()` (L186–199) |
| 4 | **SC#4** mXSS regression suite (DOMPurify Attack Classes) passes — no `<script>`, inline `on*`, `javascript:` URIs, or SVG/MathML into the Block tree; zero `dangerouslySetInnerHTML` in the codebase | ✓ VERIFIED | Fresh run: mxss.spec.ts green in 108/108 — corpus re-counted this session at **11 named Attack Classes payloads** (script tag, inline onerror, javascript: URI, SVG+script, MathML+script, noscript/title breakout mXSS, namespace confusion, DOM clobbering, svg onload, button onclick, iframe src javascript:) asserted at BOTH the sanitize boundary and the full-pipeline Block tree. `npm run lint:no-danger` → exit 0 ("0 dangerouslySetInnerHTML usages across src/ server/ functions/"); usage-grep `dangerouslySetInnerHTML[=:]` → exit 1 (0 matches; the 3 raw-string hits are prose comments documenting the defense). Code read: htmlToBlocks.ts imports DOMPurify (L29); SANITIZE_CONFIG (L69–94) — USE_PROFILES html-only (no SVG/MathML), FORBID_TAGS script/style/iframe/object/embed/form/input/link/meta/base/svg/math, ALLOW_DATA_ATTR false, default URI regex (blocks javascript:); `DOMPurify.sanitize` at L114 with `clearWindow()` L115 |
| 5 | **SC#5** Honest three-state outcomes (confident / low / unsupported) with derived multi-signal confidence + reader-visible refusal reason; v1→v3 Dexie migration passes its CI fixture-snapshot test | ✓ VERIFIED | Fresh run: confidence.spec.ts green in 108/108; dexie-migration e2e **6/6 green ×3 engines** (dual-path v1/v2-shape seed → SPA-triggered upgrade → every row intact, per the 07-07 cross-browser seed). Code read: confidence.ts derives confident/low/unsupported (locked formula — isReaderable gate, unsupportedRatio>0.4, blockCount≥3 && textLength≥500 via the SHARED normalizeText); the "unsupported" state is REFUSED upstream (ingest.ts L723–724 → `extraction-unsupported`), never persisted — IngestionMetaSchema carries only high\|low and types.ts L134 `state: z.enum(["confident","low"])` + L103 `"extraction-unsupported"` in the failure enum re-confirmed. db.ts: the v3 append is INTACT at L142–148 (articles `"id, revision, source, addedAt"`, no `.upgrade()`); v1/v2 byte-unchanged; today's chain extends v4 (Phase 8) + v5 (Phase 12) — `grep -n "\.upgrade(" db.ts` returns only the three "NO `.upgrade()`" comment lines (L131/L155/L181), so Pitfall 9 held across every append and SC#5's v1→v3 claim is verified as a stage of the live v1→v5 chain |
| 6 | HYBRID CONTINGENCY runtime verdict honored: extraction+sanitize in a Node-runtime function; workerd never hosts jsdom (07-01) | ✓ VERIFIED | Code read: vite.config.ts L52–53 wires the `lem-ingest-dev-middleware` plugin (`configureServer: viteIngestMiddleware()`); dev-server/ingest-middleware.ts + server/ingestAdapter.ts + functions/api/ingest.ts (production-future shape) all present. Every ingestion e2e this session ran against the Vite Node middleware and passed |
| 7 | Schema additions shipped additively: ArticleSource, IngestionMeta (high\|low only), Provenance.sourceUrl optional, httpUrl export, 11-reason failure enum; Dexie v3 append-only (07-02) | ✓ VERIFIED | Code read this session: types.ts carries the cataloged failure reasons incl. extraction-unsupported; db.ts v3 block re-read (truth 5). Regression: ingestion-schema tests green (in the suite's 108/108 via schema cases; extraction/adapter specs exercise the same boundary). The enum later widened for pdf/epub (Phases 11/12) — forward-compatible widening per the 07-02 locked decision, not a Phase 7 violation |
| 8 | safeFetch DNS pinning (cf.resolveOverride, 07-01 A1 PASS) + measure order metadata-before-DNS + IPv4-mapped-IPv6 handling (07-03) | ✓ VERIFIED | Code read: safeFetch.ts L152–166 pins the first validated IP via `cf: { resolveOverride }` (honored on Workers, ignored-but-harmless on Node); `Address6.isMapped4()+to4()` embedded-v4 check at L79–84; measure order verified in truth 3. safe-fetch.spec.ts green in this session's run |
| 9 | 7-stage locked pipeline ordering: safeFetch → extractAndNormalize → slugifyUrl → ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp (07-05) | ✓ VERIFIED | Code read: ingest.ts implements exactly this ordering on the single-article tail (L535–744); paste id = `paste-<12hex>` content hash (L568); early `!isReaderable \|\| blocks.length===0` honest refusal before parse (L642–644); catch wraps every throw to a typed reason (L745–755, T-7-23). normalization + ingest-adapter + ingest-plaintext-paste suites all green in 108/108 |
| 10 | The Block tree IS the security boundary: DOMPurify strict allowlist as a named-export single source; clearWindow after every sanitize; reverse-tabnabbing hook; no element attributes carried into blocks (07-04) | ✓ VERIFIED | Code read: SANITIZE_CONFIG exported (L69); `sanitizeExtractedHtml` = the single sanitize entry point with clearWindow() (L113–117); afterSanitizeAttributes noopener hook (L101–105); the DOM walk emits only text + validated href (linkableUrl) / src (httpUrl). mXSS + extraction suites green in 108/108 |
| 11 | Repository swap + client honesty: composite repository (fixtures ∪ ingested, ingested wins), IngestionClient ArticleSchema re-validation, DexieLibrarySource cascade remove, mapReasonToCopy jargon guard (07-06) | ✓ VERIFIED | Regression evidence: ingest-adapter.spec.ts + component suites green in this session's 108/108 (adapter contract); happy-path e2e proves the client→middleware→Dexie→reader chain ×3 engines; the calm-copy contract is pinned by later-phase refusal specs (11-04/12-06 byte-pinned copy tests were green in their verifications and the suite has been exit-0 through the 13-VERIFICATION full-suite gate). Files re-confirmed present: src/ingestion/{IngestionClient,LibrarySource}.ts, IngestControl.tsx |
| 12 | Four phase-exit gates as real runnable checks + repo-wide no-danger grep gate with usage-matching regex (07-07) | ✓ VERIFIED | Fresh runs this session: SSRF matrix (truth 3), happy-path (truth 1), dexie-migration (truth 5), mXSS (truth 4) — all four gates green; `npm run lint:no-danger` exit 0 (scripts/check-no-danger.js walks src/server/functions with the tightened usage regex — re-run this session) |

**Score:** 12/12 truths verified (2 documented residuals carried honestly — see Acknowledged Gaps; both were shipped WITH the phase as accepted limitations, not post-hoc discoveries)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/safeFetch.ts` | 9-measure SSRF guard | ✓ VERIFIED | 207 lines; all measures code-read this session (truth 3) |
| `server/confidence.ts` | three-state ING-06 model | ✓ VERIFIED | 90 lines; locked formula + shared normalizeText (truth 5) |
| `server/htmlToBlocks.ts` | extract → sanitize → DOM-walk | ✓ VERIFIED | 520 lines; DOMPurify strict config + clearWindow (truths 4/10) |
| `server/ingest.ts` | 7-stage orchestrator + SC#1 gate | ✓ VERIFIED | 756 lines (post-11/12 growth); gate on all 5 formats (truths 1/9) |
| `src/ingestion/types.ts` | envelope schemas + failure enum | ✓ VERIFIED | extraction-unsupported + confident\|low enum re-read (truth 5) |
| `src/persistence/db.ts` v3 append | additive indexes, no .upgrade() | ✓ VERIFIED | L142–148 intact inside the live v1→v5 chain (truth 5) |
| `tests/e2e/ingestion/{ssrf-matrix,happy-path,dexie-migration}.spec.ts` | the three e2e gates | ✓ VERIFIED | All present, all executed green this session (69 passed / 6 documented skips) |
| `tests/unit/server/{safe-fetch,mxss,extraction,normalization,slugify,confidence,ingest-adapter,ingest-plaintext-paste}.spec.ts` | the unit gate suites | ✓ VERIFIED | All 8 present and green in this session's single 108-test run |
| `scripts/check-no-danger.js` + `lint:no-danger` | repo-wide structural XSS gate | ✓ VERIFIED | Present + exit 0 this session |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server/safeFetch.ts | server/ingest.ts | url branch awaits safeFetch then extractAndNormalize (L536–538) | ✓ WIRED | happy-path e2e drives the real chain green ×3 engines |
| server/htmlToBlocks.ts | server/ingest.ts | extractAndNormalize destructured into the shared stages tail (L538–545, L558–565) | ✓ WIRED | mXSS full-pipeline corpus proves the Block-tree boundary end-to-end |
| server/confidence.ts | server/ingest.ts | deriveConfidence after the anchor gate; unsupported refused (L722–724) | ✓ WIRED | confidence.spec + ingest suites green this session |
| src/ingestion/types.ts | server/ingestAdapter.ts + dev-server/ingest-middleware.ts | shared adapter keeps both runtime wrappers byte-identical (D7-05) | ✓ WIRED | ingest-adapter.spec.ts green; every e2e hit :5173/api/ingest through the Vite middleware |
| src/persistence/db.ts (v3) | src/ingestion/LibrarySource.ts | DexieLibrarySource saves/articles through the v3-indexed store | ✓ WIRED | dexie-migration + happy-path e2e green ×3 engines |

### Behavioral Spot-Checks

All commands executed fresh this session (2026-08-23) by the verifier; counts and exit codes recorded at run time.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit gate suites (safe-fetch + mXSS + extraction + normalization[SC#1 anchor] + slugify + confidence + ingest-adapter + ingest-plaintext-paste) | `npx vitest run tests/unit/server/safe-fetch.spec.ts tests/unit/server/mxss.spec.ts tests/unit/server/extraction.spec.ts tests/unit/server/normalization.spec.ts tests/unit/server/slugify.spec.ts tests/unit/server/confidence.spec.ts tests/unit/server/ingest-adapter.spec.ts tests/unit/server/ingest-plaintext-paste.spec.ts` | **8 files / 108 tests passed / 0 failed, exit 0** (2.09s) | ✓ PASS |
| Ingestion e2e gates (SSRF matrix SC#3 + Dexie migration SC#5 + happy-path SC#1), 3 engines | `npx playwright test tests/e2e/ingestion/` | **69 passed / 0 failed / 6 skipped, exit 0** (11.5s; per-spec: ssrf 57+6 skip, dexie 6, happy 6 — each per-spec re-run also exit 0) | ✓ PASS |
| Repo-wide structural XSS gate | `npm run lint:no-danger` | **exit 0** — "0 dangerouslySetInnerHTML usages across src/ server/ functions/ — ING-07 structural defense holds." | ✓ PASS |
| Usage-shape grep (JSX/object usage, not prose) | `grep -rn "dangerouslySetInnerHTML[=:]" src/ server/ functions/` | **exit 1 — 0 matches** (3 raw-string hits are prose comments documenting the defense: applyTheme.ts:24, ReviewView.tsx:47, htmlToBlocks.ts:20) | ✓ PASS |
| Anchor-gate presence on every ingest branch | `grep -c assertRoundTripAnchor server/ingest.ts` | **11** (gate def + calls on all 5 format branches + imports/comments) | ✓ PASS |
| URL-path orchestrator spec located + included | `grep -rln assertRoundTripAnchor tests/` | normalization.spec.ts is the Phase 7 spec exercising the gate — included in the 108/108 run | ✓ PASS |
| Dexie chain append-only discipline | `grep -n "\.upgrade(" src/persistence/db.ts` | 3 hits, ALL "NO `.upgrade()`" comment prose (L131/L155/L181) — zero actual upgrade callbacks in any append | ✓ PASS |
| SSRF corpus shape | vector count in ssrf-matrix.spec.ts | **19 named vectors** + 2 citation-carrying test.skip residuals (L295, L307) | ✓ PASS |
| mXSS corpus shape | payload count in mxss.spec.ts | **11 named Attack Classes payloads**, dual-level assertions (sanitize boundary + full pipeline) | ✓ PASS |
| Debt markers in the Phase 7 surface | `grep -n "TBD\|FIXME\|XXX\|HACK" server/*.ts src/ingestion/types.ts` | **0 matches** (exit 1); the 2 "placeholder — stamped post-gate" comments in ingest.ts are the documented stamp pattern — the value IS overwritten before return (L733–736) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared by this phase's plans; the phase's runnable checks are the vitest/playwright suites above, all executed by the verifier this session.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|---------|----------|
| ING-01 | 07-03, 07-05, 07-06 | Reader submits a real publisher URL → normalized article opens in the existing reader, indistinguishable from a fixture | ✓ SATISFIED | Truths 1, 8, 9, 11 — anchor gate green, pipeline ordering code-read, happy-path e2e ×3 engines, repository swap wired |
| ING-02 | 07-06 | Reader pastes HTML → same pipeline, same canonical Block shape | ✓ SATISFIED | Truths 2, 9 — shared stages tail code-read, full-real-pipeline paste e2e green, plain-text reroute strengthening (260821-ov7) |
| ING-06 | 07-03, 07-05, 07-06 | Honest three-state outcomes with reader-visible refusal reasons | ✓ SATISFIED | Truths 5, 11 — three-state code-read, unsupported refused upstream, confidence suite green, calm-copy mapping pinned |
| ING-07 | 07-04, 07-07 | Sanitize-then-render through the doc model; never dangerouslySetInnerHTML | ✓ SATISFIED | Truths 4, 10, 12 — mXSS 11-class suite green, strict allowlist code-read, lint:no-danger exit 0 |
| ING-08 | 07-03, 07-07 | SSRF refusal of private/internal/cloud-metadata endpoints | ✓ SATISFIED | Truths 3, 8, 12 — 19-vector matrix green ×3 engines (2 documented residuals), 27-case unit suite green, 9-measure code read |

Orphaned requirements: **none** — all 5 ING requirements of Phase 7 now have satisfied rows with evidence executed this session. REQUIREMENTS.md already marks all five `[x]` (plan-level completion); this report supplies the missing verification leg.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/e2e/ingestion/ssrf-matrix.spec.ts | 307 | Skip prose says DNS-rebinding is "closed by future Workers deploy per D7-10" — that closure path was superseded by the Vercel Node production deploy (260821-k6z); the residual persists as accepted on Node | ℹ️ Info | Documentation staleness only — the skip itself is honest and correctly cited; the milestone audit carries the refreshed framing as tech debt |
| (none) | — | No TBD/FIXME/XXX/HACK markers, no stubs, no unwired links found in the Phase 7 surface this session | — | — |

### Executor-Fact Discrepancies (SUMMARY/STATE vs codebase — resolved in the codebase's favor)

| Claim | Actual (verifier-observed this session) | Verdict |
|------|-------------------------------------------|---------|
| STATE.md L259: "19-vector corpus covers all 9 Pitfall 3 measures + 2 documented residuals" | Reproduced exactly: 19 named vectors + 2 citation-carrying skips; 57+6 cells green ×3 engines, exit 0 | Accurate |
| STATE.md L259: "11 DOMPurify Attack Classes payloads all stripped" | Reproduced: 11 named payloads in mxss.spec.ts; suite green in the 108/108 run | Accurate |
| STATE.md L259: "Private-IP vectors accept dual-reason (ssrf-blocked-private-ip OR fetch-failed)" | Code-read confirmed in the matrix's acceptableReasons shape; vectors green this session | Accurate |
| v2.0-MILESTONE-AUDIT §6: "code unchanged since" phase completion | NOT literally true — ingest.ts/db.ts/types.ts evolved through Phases 8–13 and two quick tasks (all append/widen direction; every SC obligation re-verified against today's tree per the drift map above) | Inaccurate-but-immaterial — the drift strengthens every gate; recorded here for honesty |

### Gaps Summary

No failed truths, no missing artifacts, no unwired links, no requirement gaps. All 12 truths verified with evidence executed this session. The two non-e2e-verified behaviors are the phase's OWN documented residuals (STATE.md L259, 07-07 key decisions) — skip-tagged with citations in the matrix, covered at unit level where deterministic coverage is possible, and carried below. One new Info-level finding: the DNS-rebinding skip's "future Workers deploy" closure prose is stale relative to the Vercel Node production deploy (260821-k6z) — forwarded to the milestone audit's tech debt.

## Acknowledged Gaps

- **2026-08-12 (phase ship, carried forward):** DNS-rebinding end-to-end simulation (T-7-04) is a documented residual TOCTOU on the Node runtime — `cf.resolveOverride` DNS pinning is present and wired (safeFetch.ts L152–166) but Node's fetch ignores it; Workers honors it (07-01 spike A1). Re-confirmed unchanged this session. NOTE (2026-08-23): the original closure path ("future Workers deploy per D7-10") was superseded by the Vercel Node production deploy (quick task 260821-k6z) — the residual is therefore an accepted standing risk on the production runtime, not one pending its documented closure vehicle.
- **2026-08-12 (phase ship, carried forward):** Redirect-into-internal is covered deterministically at unit level (safe-fetch.spec.ts, mocked fetch + DNS — green in this session's run) rather than in the e2e matrix: a localhost mock redirect server itself lives in PRIVATE_RANGES, so safeFetch refuses the mock URL before any redirect is followed. Re-confirmed unchanged this session (skip citation intact at L295).

---

_Verified: 2026-08-23T17:16:05Z (retroactive — quick task 260823-gfi)_
_Verifier: the agent (gsd-verifier methodology)_
